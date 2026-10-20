// Loudness metering (ITU-R BS.1770-4 / EBU R128), true peak, limiting,
// loop wrap, WAV I/O and ffmpeg encode for the v2 audio pipeline.

import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { SR, dbToGain, gainToDb } from './dsp.mjs'

export const FFMPEG = process.env.FFMPEG || 'ffmpeg'

// ─── K-weighting (libebur128 coefficients for any sample rate) ────────────

const kFilters = (fs) => {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196
  let K = Math.tan(Math.PI * f0 / fs)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const s1 = {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
  }
  f0 = 38.13547087602444; Q = 0.5003270373238773
  K = Math.tan(Math.PI * f0 / fs)
  a0 = 1 + K / Q + K * K
  const s2 = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }
  return [s1, s2]
}

const kWeight = (x, fs) => {
  let y = Float64Array.from(x)
  for (const s of kFilters(fs)) {
    const out = new Float64Array(y.length)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < y.length; i++) {
      const x0 = y[i]
      const v = s.b[0] * x0 + s.b[1] * x1 + s.b[2] * x2 - s.a[0] * y1 - s.a[1] * y2
      x2 = x1; x1 = x0; y2 = y1; y1 = v
      out[i] = v
    }
    y = out
  }
  return y
}

/**
 * Measure channels (array of Float32Array). Returns integrated LUFS, max
 * momentary (400 ms), max short-term (3 s), sample peak and true peak (dBTP,
 * 4× oversampled). Short sounds are padded so a 400 ms window exists.
 */
export const measure = (chans, fs = SR) => {
  const minLen = Math.ceil(0.4 * fs)
  const padded = chans.map((c) => {
    if (c.length >= minLen) return c
    const p = new Float32Array(minLen)
    p.set(c)
    return p
  })
  const kw = padded.map((c) => kWeight(c, fs))
  const n = kw[0].length
  // 100 ms hop power sums.
  const hop = Math.round(0.1 * fs)
  const hops = Math.floor(n / hop)
  const hopPow = new Float64Array(hops)
  for (let h = 0; h < hops; h++) {
    let s = 0
    for (const c of kw) for (let i = h * hop; i < (h + 1) * hop; i++) s += c[i] * c[i]
    hopPow[h] = s
  }
  const blockLoud = (k) => {
    // k hops per block
    const out = []
    for (let h = 0; h + k <= hops; h++) {
      let s = 0
      for (let j = 0; j < k; j++) s += hopPow[h + j]
      const ms = s / (k * hop)
      out.push(ms)
    }
    return out
  }
  const lufs = (ms) => -0.691 + 10 * Math.log10(Math.max(1e-20, ms))
  const mBlocks = blockLoud(4)
  const sBlocks = hops >= 30 ? blockLoud(30) : []
  const momentaryMax = mBlocks.length ? Math.max(...mBlocks.map(lufs)) : -Infinity
  const shortMax = sBlocks.length ? Math.max(...sBlocks.map(lufs)) : null
  // Integrated with gating.
  const abs = mBlocks.filter((ms) => lufs(ms) > -70)
  let integrated = -Infinity
  if (abs.length) {
    const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length
    const rel = lufs(meanAbs) - 10
    const g = abs.filter((ms) => lufs(ms) > rel)
    if (g.length) integrated = lufs(g.reduce((a, b) => a + b, 0) / g.length)
  }
  let sp = 0
  for (const c of chans) for (let i = 0; i < c.length; i++) sp = Math.max(sp, Math.abs(c[i]))
  return {
    integrated: round1(integrated),
    momentaryMax: round1(momentaryMax),
    shortTermMax: shortMax === null ? null : round1(shortMax),
    samplePeak: round1(gainToDb(sp)),
    truePeak: round1(gainToDb(truePeakLin(chans)))
  }
}

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v)

// 4× polyphase windowed-sinc interpolator for true-peak estimation.
const TP_TAPS = 12
const tpKernel = (() => {
  const k = []
  for (let p = 0; p < 4; p++) {
    const row = []
    for (let t = -TP_TAPS; t < TP_TAPS; t++) {
      const x = t + 1 - p / 4
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / (TP_TAPS + 1))
      row.push(sinc * w)
    }
    k.push(row)
  }
  return k
})()

export const truePeakLin = (chans) => {
  let peak = 0
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i])
      if (a > peak) peak = a
      // Only interpolate near loud samples (cheap).
      if (a < peak * 0.7) continue
      for (let p = 1; p < 4; p++) {
        let s = 0
        const row = tpKernel[p]
        for (let t = -TP_TAPS; t < TP_TAPS; t++) {
          const j = i + t + 1
          if (j >= 0 && j < c.length) s += c[j] * row[t + TP_TAPS]
        }
        if (Math.abs(s) > peak) peak = Math.abs(s)
      }
    }
  }
  return peak
}

// ─── Limiter ──────────────────────────────────────────────────────────────

/**
 * Look-ahead brickwall limiter (stereo-linked) on sample peaks with a safety
 * margin; call `limitTo` which re-checks the true peak and tightens.
 */
export const limiter = (chans, ceilingDb, { lookMs = 5, releaseMs = 80 } = {}) => {
  const ceil = dbToGain(ceilingDb)
  const n = chans[0].length
  const look = Math.max(1, Math.round((lookMs / 1000) * SR))
  const need = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let a = 0
    for (const c of chans) a = Math.max(a, Math.abs(c[i]))
    need[i] = a > ceil ? ceil / a : 1
  }
  // gmin[k] = min(need[k .. k+look]) via a monotonic deque.
  const gmin = new Float32Array(n)
  const dq = new Int32Array(n + 1)
  let h = 0, t = 0
  for (let i = 0; i < n + look; i++) {
    if (i < n) {
      while (t > h && need[dq[t - 1]] >= need[i]) t--
      dq[t++] = i
    }
    const k = i - look
    if (k >= 0) {
      while (t > h && dq[h] < k) h++
      gmin[k] = t > h ? need[dq[h]] : 1
    }
  }
  // Release smoothing (never above gmin), then a boxcar of the look length:
  // the average of values that are all <= need[p] stays <= need[p], so the
  // peak is caught while the gain ramps down smoothly over the look window.
  const rel = Math.exp(-1 / ((releaseMs / 1000) * SR))
  const r = new Float32Array(n)
  let cur = 1
  for (let i = 0; i < n; i++) {
    cur = Math.min(gmin[i], 1 - (1 - cur) * rel)
    r[i] = cur
  }
  const g = new Float32Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += r[i]
    if (i > look) acc -= r[i - look - 1]
    g[i] = acc / Math.min(i + 1, look + 1)
  }
  // Delay compensation not needed: gmin already looks ahead.
  for (const c of chans) for (let i = 0; i < n; i++) c[i] *= g[i]
  return chans
}

/** Limit until true peak ≤ ceilingDb (dBTP). */
export const limitTo = (chans, ceilingDb, opts) => {
  let c = ceilingDb - 0.3
  for (let k = 0; k < 6; k++) {
    if (gainToDb(truePeakLin(chans)) <= ceilingDb) return chans
    limiter(chans, c, opts)
    c -= 0.4
  }
  return chans
}

/**
 * Normalize to a loudness target. `mode` = 'integrated' (music) or
 * 'momentary' (SFX: max 400 ms loudness). Then limit to the TP ceiling.
 * Returns the gain that was applied (dB) and whether limiting engaged.
 */
export const normalize = (chans, { target, mode = 'integrated', ceiling = -1.0 }) => {
  const m = measure(chans)
  const cur = mode === 'integrated' ? m.integrated : m.momentaryMax
  const gDb = target - cur
  const g = dbToGain(gDb)
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g
  const before = gainToDb(truePeakLin(chans))
  if (before > ceiling) limitTo(chans, ceiling, mode === 'integrated' ? { lookMs: 5, releaseMs: 120 } : { lookMs: 2, releaseMs: 40 })
  // Limiting lowers loudness a little; up to two corrective passes.
  for (let pass = 0; pass < 2 && before > ceiling; pass++) {
    const m2 = measure(chans)
    const d = target - (mode === 'integrated' ? m2.integrated : m2.momentaryMax)
    if (Math.abs(d) <= 0.2) break
    const g2 = dbToGain(d)
    for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g2
    limitTo(chans, ceiling, mode === 'integrated' ? { lookMs: 5, releaseMs: 120 } : { lookMs: 2, releaseMs: 40 })
  }
  return { gainDb: Math.round(gDb * 10) / 10, limited: before > ceiling, tpBeforeLimit: Math.round(before * 10) / 10 }
}

// ─── Loops ────────────────────────────────────────────────────────────────

/**
 * Wrap a rendered buffer that is longer than the loop (it carries the reverb
 * and release tail past the loop end) into exactly `loopLen` samples: the
 * part past the end is added onto the start, so the loop point is seamless.
 */
export const wrapLoop = (chans, loopLen) =>
  chans.map((c) => {
    const out = new Float32Array(loopLen)
    for (let i = 0; i < c.length; i++) out[i % loopLen] += c[i]
    return out
  })

/**
 * Loop-seam check: RMS of the 20 ms either side of the seam, and the jump
 * between the last and first sample relative to the local slope.
 */
export const seamCheck = (chans) => {
  const w = Math.round(0.02 * SR)
  const res = chans.map((c) => {
    const n = c.length
    let a = 0, b = 0
    for (let i = 0; i < w; i++) {
      a += c[n - w + i] ** 2
      b += c[i] ** 2
    }
    const rmsEnd = Math.sqrt(a / w)
    const rmsStart = Math.sqrt(b / w)
    const jump = Math.abs(c[0] - c[n - 1])
    let slope = 0
    for (let i = 1; i < 200; i++) slope = Math.max(slope, Math.abs(c[n - i] - c[n - i - 1]), Math.abs(c[i] - c[i - 1]))
    return { rmsEndDb: round1(gainToDb(rmsEnd)), rmsStartDb: round1(gainToDb(rmsStart)), jump, slope }
  })
  const worst = res.reduce((m, r) => Math.max(m, r.slope > 0 ? r.jump / r.slope : r.jump > 1e-4 ? 99 : 0), 0)
  return {
    rmsEndDb: res[0].rmsEndDb,
    rmsStartDb: res[0].rmsStartDb,
    levelStepDb: round1(Math.abs(res[0].rmsEndDb - res[0].rmsStartDb)),
    jumpVsSlope: Math.round(worst * 100) / 100
  }
}

// ─── WAV + encode ─────────────────────────────────────────────────────────

export const writeWav = (path, chans, fs = SR) => {
  mkdirSync(dirname(path), { recursive: true })
  const n = chans[0].length
  const ch = chans.length
  const data = Buffer.alloc(n * ch * 4)
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data.writeFloatLE(chans[c][i], (i * ch + c) * 4)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(ch, 22)
  h.writeUInt32LE(fs, 24); h.writeUInt32LE(fs * ch * 4, 28); h.writeUInt16LE(ch * 4, 32); h.writeUInt16LE(32, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([h, data]))
}

/** Decode any file to float channels via ffmpeg. */
export const decode = (path, { channels = null, rate = SR } = {}) => {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', path], { encoding: 'utf8' })
  const ch = channels ?? (Number(probe.stdout.trim()) || 1)
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', String(ch), '-ar', String(rate), '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`decode failed ${path}: ${r.stderr}`)
  const b = r.stdout
  const n = Math.floor(b.length / 4 / ch)
  const chans = Array.from({ length: ch }, () => new Float32Array(n))
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) chans[c][i] = b.readFloatLE((i * ch + c) * 4)
  return chans
}

/** Encode WAV → Ogg Vorbis. */
export const encodeOgg = (wav, out, { quality = 3, rate = null } = {}) => {
  mkdirSync(dirname(out), { recursive: true })
  const args = ['-y', '-v', 'error', '-i', wav]
  if (rate) args.push('-ar', String(rate))
  args.push('-c:a', 'libvorbis', '-q:a', String(quality), '-map_metadata', '-1', out)
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`encode failed ${out}: ${r.stderr}`)
  return statSync(out).size
}

/** Encode any file → AAC in an MP4 container (review-page previews). */
export const encodeMp4 = (src, out, { kbps = 128 } = {}) => {
  mkdirSync(dirname(out), { recursive: true })
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', src, '-vn', '-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', '-map_metadata', '-1', out], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`mp4 encode failed ${out}: ${r.stderr}`)
  return statSync(out).size
}

export const readJson = (p, d = null) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return d
  }
}
