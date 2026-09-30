#!/usr/bin/env node
// Skill SFX synthesiser (skills-feature.md §8.3, WP8).
//
// Renders the four skill sounds from code — no samples, no licences — as
// 22.05 kHz mono PCM, then encodes each to Ogg Vorbis with the ffmpeg-static
// binary the preview-video tool already ships. Same container / rate / channel
// layout as every other file in public/audio/sfx/.
//
//   node tools/sfx/skill-sfx.mjs            → writes public/audio/sfx/skill-*.ogg
//   node tools/sfx/skill-sfx.mjs --wav DIR  → also keeps the WAV masters in DIR
//   node tools/sfx/skill-sfx.mjs --set boss → writes public/audio/sfx/boss-*.ogg
//                                             (bosses-100-feature.md §7.3, BW4)
//
// Deterministic: every noise source is a seeded PRNG, so a re-run produces the
// same PCM (the Vorbis encoder is deterministic for identical input too).
//
//   skill-shield   Guard Shell absorb / break, Mirror Plate reflect, Phase Step
//                  dodge — a glassy "ting" over a short soft thunk (~0.45 s)
//   skill-rocket   Homing Rockets volley — a rising noise whoosh + launch
//                  chirp, with a small pop at the end (~0.55 s)
//   skill-zap      Static Charge shock / stun — crackling FM buzz (~0.4 s)
//   skill-drumroll Skills intro build-up — snare hits that accelerate on the
//                  intro's `si-drum` beat grid (0/30/52/68/80/89/95 % of
//                  1300 ms), a crescendo roll under them, and the HIT (kick +
//                  crash) exactly at 1300 ms; ~0.3 s tail
//
// Boss-trait set (`--set boss`, same format, same −2 dBFS peak as the skills):
//   boss-ember-pulse  Ember Nova — a downward fire whoosh over a low boom and
//                     a few crackling embers (~0.6 s)
//   boss-freeze       Frost Lock — ice crackling shut: accelerating tiny
//                     clicks, a glassy rising shimmer, a dull thud (~0.5 s)
//   boss-crack        refused freeze / thaw — one sharp ice crack and a few
//                     falling tinkles of shards (~0.4 s)
//   boss-chill        one Frostbite stack — a short frosty chime tick (~0.25 s)
//
// Budget: every file ≤ 12 000 B (asserted below — the script fails otherwise).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = join(ROOT, 'public', 'audio', 'sfx')
const SR = 22050
const MAX_BYTES = 12000
/** The intro's default build-up; the drum-roll HIT lands exactly here. */
export const DRUMROLL_HIT_MS = 1300

// ─── DSP helpers ────────────────────────────────────────────────────────────

const TAU = Math.PI * 2

/** mulberry32 — seeded, so the noise (and the files) are reproducible. */
const rng = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const buf = (sec) => new Float64Array(Math.ceil(sec * SR))

/** Add `src` into `dst` starting at sample `at`, scaled by `gain`. */
const mixIn = (dst, src, at, gain = 1) => {
  for (let i = 0; i < src.length && at + i < dst.length; i++) {
    if (at + i >= 0) dst[at + i] += src[i] * gain
  }
}

/**
 * RBJ-cookbook biquad (band-pass constant 0 dB peak / high-pass / low-pass);
 * `fc(i)` may sweep — coefficients are recomputed per sample (offline, so
 * cost is irrelevant). Unconditionally stable, unlike a Chamberlin SVF near
 * a quarter of the sample rate.
 */
const svf = (src, fc, q, mode) => {
  const out = new Float64Array(src.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < src.length; i++) {
    const w = TAU * Math.min(0.45 * SR, fc(i)) / SR
    const cw = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    let b0, b1, b2
    if (mode === 'band') {
      b0 = alpha
      b1 = 0
      b2 = -alpha
    } else if (mode === 'high') {
      b0 = (1 + cw) / 2
      b1 = -(1 + cw)
      b2 = (1 + cw) / 2
    } else {
      b0 = (1 - cw) / 2
      b1 = 1 - cw
      b2 = (1 - cw) / 2
    }
    const a0 = 1 + alpha
    const a1 = -2 * cw
    const a2 = 1 - alpha
    const x0 = src[i]
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
    out[i] = y0
  }
  return out
}

const expEnv = (i, tauSec) => Math.exp(-i / (tauSec * SR))
/** Linear attack over `aSec`, then exp decay with time-constant `dSec`. */
const adEnv = (i, aSec, dSec) => {
  const a = aSec * SR
  return i < a ? i / a : Math.exp(-(i - a) / (dSec * SR))
}

const normalize = (x, peakDb) => {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1
  for (let i = 0; i < x.length; i++) x[i] *= g
  return x
}

/** Short fade-in / fade-out so no file starts or ends on a click. */
const edgeFades = (x, inMs = 2, outMs = 25) => {
  const fi = Math.round((inMs / 1000) * SR)
  const fo = Math.round((outMs / 1000) * SR)
  for (let i = 0; i < fi && i < x.length; i++) x[i] *= i / fi
  for (let i = 0; i < fo && i < x.length; i++) x[x.length - 1 - i] *= i / fo
  return x
}

// ─── Voices ─────────────────────────────────────────────────────────────────

/** Glassy shield "ting": inharmonic partials, fast attack, ~0.3 s ring. */
const shield = () => {
  const x = buf(0.45)
  const partials = [
    [1480, 1.0, 0.16], [2220 * 1.013, 0.55, 0.12], [2960 * 0.994, 0.35, 0.09],
    [4070, 0.22, 0.06], [990, 0.3, 0.2]
  ]
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    let s = 0
    for (const [f, a, d] of partials) s += a * Math.sin(TAU * f * t) * expEnv(i, d)
    // Slow shimmer (two close partials beating) on top.
    s += 0.18 * Math.sin(TAU * 1492 * t) * expEnv(i, 0.22) * (0.5 + 0.5 * Math.sin(TAU * 11 * t))
    x[i] = s * adEnv(i, 0.002, 0.5)
  }
  // Soft body thunk: a sine dropping 220 → 120 Hz in 70 ms.
  const thunk = buf(0.09)
  let ph = 0
  for (let i = 0; i < thunk.length; i++) {
    const f = 120 + 100 * expEnv(i, 0.02)
    ph += TAU * f / SR
    thunk[i] = Math.sin(ph) * adEnv(i, 0.001, 0.025)
  }
  mixIn(x, thunk, 0, 0.9)
  // Bright transient: 12 ms of high-passed noise.
  const r = rng(7)
  const click = buf(0.012)
  for (let i = 0; i < click.length; i++) click[i] = (r() * 2 - 1) * expEnv(i, 0.003)
  mixIn(x, svf(click, () => 5000, 0.8, 'high'), 0, 0.5)
  return edgeFades(normalize(x, -2))
}

/** Rocket launch: rising band-passed noise whoosh + chirp + tail pop. */
const rocket = () => {
  const x = buf(0.55)
  const r = rng(35)
  const noise = new Float64Array(x.length)
  for (let i = 0; i < noise.length; i++) noise[i] = r() * 2 - 1
  const n = x.length
  const whoosh = svf(noise, (i) => 500 + 3200 * Math.pow(i / n, 0.7), 2.2, 'band')
  for (let i = 0; i < n; i++) {
    const u = i / n
    const env = Math.min(1, u / 0.08) * Math.pow(1 - u, 1.6)
    x[i] = whoosh[i] * env * 1.4
  }
  // Launch chirp: saw-ish (3 harmonics) 180 → 700 Hz over 0.3 s.
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 180 + 520 * Math.min(1, t / 0.3)
    ph += TAU * f / SR
    const saw = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)
    x[i] += 0.28 * saw * adEnv(i, 0.01, 0.12)
  }
  // Ignition pop at the very start.
  const pop = buf(0.05)
  for (let i = 0; i < pop.length; i++) pop[i] = (r() * 2 - 1) * expEnv(i, 0.008)
  mixIn(x, svf(pop, () => 1800, 1.2, 'band'), 0, 1.2)
  return edgeFades(normalize(x, -2), 1, 40)
}

/** Static zap: FM buzz with a jittering carrier, gated crackle. */
const zap = () => {
  const x = buf(0.4)
  const r = rng(55)
  let ph = 0
  let jitter = 0
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    if (i % 90 === 0) jitter = (r() * 2 - 1) * 380
    const mod = Math.sin(TAU * 57 * t) * 6
    const f = 820 + jitter + 300 * expEnv(i, 0.06)
    ph += TAU * f / SR
    // Square-ish carrier (clipped sine) + FM wobble.
    const car = Math.max(-0.7, Math.min(0.7, Math.sin(ph + mod) * 2))
    x[i] = car * adEnv(i, 0.002, 0.11)
  }
  // Crackle: sparse noise bursts, denser at the start.
  const crackle = new Float64Array(x.length)
  for (let i = 0; i < crackle.length; i++) {
    const dens = 0.35 * expEnv(i, 0.12)
    crackle[i] = r() < dens ? (r() * 2 - 1) : 0
  }
  mixIn(x, svf(crackle, () => 4200, 0.9, 'high'), 0, 0.9)
  return edgeFades(normalize(x, -2), 1, 30)
}

/** One snare stroke: tuned body + band-passed noise, `gain` 0..1. */
const snare = (r, gain, bright = 1) => {
  const s = buf(0.16)
  let ph = 0
  const noise = new Float64Array(s.length)
  for (let i = 0; i < s.length; i++) noise[i] = r() * 2 - 1
  const rattle = svf(noise, () => 2600 * bright, 0.9, 'band')
  for (let i = 0; i < s.length; i++) {
    const f = 190 + 60 * expEnv(i, 0.01)
    ph += TAU * f / SR
    s[i] = gain * (0.55 * Math.sin(ph) * expEnv(i, 0.03) + 1.1 * rattle[i] * expEnv(i, 0.045))
  }
  return s
}

/** Drum roll: accelerating strokes on the intro's beat grid, roll, HIT. */
const drumroll = () => {
  const hit = DRUMROLL_HIT_MS / 1000
  const x = buf(hit + 0.3)
  const r = rng(1300)
  // The intro's `si-drum` keyframe beats (fractions of the build-up).
  const beats = [0, 0.3, 0.52, 0.68, 0.8, 0.89, 0.95]
  for (let b = 0; b < beats.length; b++) {
    const g = 0.7 + 0.3 * (b / (beats.length - 1))
    mixIn(x, snare(r, g, 1 + b * 0.05), Math.round(beats[b] * hit * SR))
  }
  // Roll under the beats: soft strokes whose spacing shrinks 90 → 22 ms and
  // whose level swells from ~0 to full over the last 60 % of the build-up.
  let t = 0.25
  while (t < hit - 0.012) {
    const u = t / hit
    const gap = 0.09 - 0.068 * Math.pow(u, 1.4)
    const swell = Math.pow(Math.max(0, (u - 0.2) / 0.8), 1.8)
    mixIn(x, snare(r, 0.08 + 0.42 * swell, 0.9), Math.round(t * SR))
    t += gap
  }
  // THE HIT at exactly `hit`: kick (120 → 45 Hz) + crash (high-passed noise).
  const at = Math.round(hit * SR)
  const kick = buf(0.3)
  let ph = 0
  for (let i = 0; i < kick.length; i++) {
    const f = 45 + 75 * expEnv(i, 0.03)
    ph += TAU * f / SR
    kick[i] = Math.sin(ph) * adEnv(i, 0.001, 0.12)
  }
  mixIn(x, kick, at, 1.1)
  const crashN = new Float64Array(Math.round(0.3 * SR))
  for (let i = 0; i < crashN.length; i++) crashN[i] = r() * 2 - 1
  const crash = svf(crashN, () => 3500, 0.7, 'high')
  for (let i = 0; i < crash.length; i++) crash[i] *= adEnv(i, 0.002, 0.11)
  mixIn(x, crash, at, 1.0)
  mixIn(x, snare(r, 1.0, 1.1), at)
  return edgeFades(normalize(x, -1.5), 1, 60)
}

// ─── Boss-trait voices (BW4) ────────────────────────────────────────────────

/** Ember Nova: low boom (80 → 38 Hz) + downward band-passed whoosh + embers. */
const emberPulse = () => {
  const x = buf(0.6)
  const n = x.length
  const r = rng(110)
  const noise = new Float64Array(n)
  for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1
  // Whoosh: the band falls 2600 → 380 Hz as the ring expands outward.
  const whoosh = svf(noise, (i) => 380 + 2220 * Math.pow(1 - i / n, 2.2), 1.4, 'band')
  for (let i = 0; i < n; i++) {
    const u = i / n
    const env = Math.min(1, u / 0.03) * Math.pow(1 - u, 2.0)
    x[i] = whoosh[i] * env * 1.6
  }
  // Boom body.
  let ph = 0
  for (let i = 0; i < n; i++) {
    const f = 38 + 42 * expEnv(i, 0.05)
    ph += TAU * f / SR
    x[i] += 0.9 * Math.sin(ph) * adEnv(i, 0.004, 0.16)
  }
  // Fire roar: low-passed noise, short.
  mixIn(x, svf(noise, () => 700, 0.7, 'low').map((v, i) => v * adEnv(i, 0.01, 0.12)), 0, 0.9)
  // Ember crackle: a handful of sparse high clicks in the tail.
  const crackle = new Float64Array(n)
  for (let i = Math.round(0.08 * SR); i < n; i++) {
    if (r() < 0.0016) {
      for (let k = 0; k < 90 && i + k < n; k++) crackle[i + k] += (r() * 2 - 1) * expEnv(k, 0.0015)
    }
  }
  mixIn(x, svf(crackle, () => 3800, 0.9, 'high'), 0, 0.7)
  return edgeFades(normalize(x, -2), 1, 50)
}

/** Frost Lock: ice closing — accelerating clicks, rising shimmer, dull thud. */
const freeze = () => {
  const x = buf(0.5)
  const n = x.length
  const r = rng(120)
  // Crackle: clicks whose density climbs over the first 0.3 s, then stops.
  const clicks = new Float64Array(n)
  for (let i = 0; i < Math.round(0.32 * SR); i++) {
    const u = i / (0.32 * SR)
    if (r() < 0.0008 + 0.006 * u * u) {
      const g = 0.4 + 0.6 * r()
      for (let k = 0; k < 60 && i + k < n; k++) clicks[i + k] += g * (r() * 2 - 1) * expEnv(k, 0.0009)
    }
  }
  mixIn(x, svf(clicks, () => 6200, 1.1, 'band'), 0, 1.4)
  // Glassy shimmer: two inharmonic partials rising 1800 → 2600 Hz, swelling in.
  let p1 = 0
  let p2 = 0
  for (let i = 0; i < n; i++) {
    const u = i / n
    const f = 1800 + 800 * Math.min(1, u / 0.6)
    p1 += TAU * f / SR
    p2 += TAU * f * 1.51 / SR
    const env = Math.min(1, u / 0.5) * Math.pow(1 - u, 1.2)
    x[i] += env * (0.22 * Math.sin(p1) + 0.12 * Math.sin(p2))
  }
  // "Clunk" as the shell sets (at ~0.3 s): low sine thud + a bright tick.
  const at = Math.round(0.3 * SR)
  const thud = buf(0.12)
  let ph = 0
  for (let i = 0; i < thud.length; i++) {
    const f = 110 + 90 * expEnv(i, 0.015)
    ph += TAU * f / SR
    thud[i] = Math.sin(ph) * adEnv(i, 0.001, 0.035)
  }
  mixIn(x, thud, at, 0.8)
  const tick = buf(0.05)
  for (let i = 0; i < tick.length; i++) tick[i] = Math.sin(TAU * 3900 * i / SR) * expEnv(i, 0.012)
  mixIn(x, tick, at, 0.35)
  return edgeFades(normalize(x, -2), 1, 40)
}

/** Ice crack: a sharp broadband snap + falling shard tinkles. */
const crack = () => {
  const x = buf(0.4)
  const r = rng(130)
  const snap = buf(0.035)
  for (let i = 0; i < snap.length; i++) snap[i] = (r() * 2 - 1) * expEnv(i, 0.006)
  mixIn(x, svf(snap, () => 2600, 0.6, 'high'), 0, 1.3)
  mixIn(x, svf(snap, () => 900, 0.9, 'band'), 0, 0.8)
  // Second, smaller fracture 25 ms later.
  mixIn(x, svf(snap, () => 3400, 0.7, 'high'), Math.round(0.025 * SR), 0.6)
  // Tinkles: 5 short inharmonic pings, spread over 0.3 s, falling in pitch.
  for (let k = 0; k < 5; k++) {
    const t0 = 0.04 + k * 0.055 + r() * 0.02
    const f = 3600 - k * 380 + r() * 300
    const ping = buf(0.09)
    for (let i = 0; i < ping.length; i++) {
      ping[i] = (Math.sin(TAU * f * i / SR) + 0.4 * Math.sin(TAU * f * 1.37 * i / SR)) * expEnv(i, 0.018)
    }
    mixIn(x, ping, Math.round(t0 * SR), 0.28 - k * 0.03)
  }
  return edgeFades(normalize(x, -2), 1, 30)
}

/** Chill tick: a small frosty chime with an airy puff. */
const chillTick = () => {
  const x = buf(0.25)
  const r = rng(140)
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    x[i] = (0.8 * Math.sin(TAU * 2640 * t) * expEnv(i, 0.05)
      + 0.45 * Math.sin(TAU * 3960 * 1.004 * t) * expEnv(i, 0.035)
      + 0.25 * Math.sin(TAU * 5280 * 0.997 * t) * expEnv(i, 0.022)) * adEnv(i, 0.002, 0.2)
  }
  const puff = new Float64Array(x.length)
  for (let i = 0; i < puff.length; i++) puff[i] = (r() * 2 - 1) * adEnv(i, 0.01, 0.04)
  mixIn(x, svf(puff, () => 7000, 0.8, 'band'), 0, 0.5)
  return edgeFades(normalize(x, -2), 1, 30)
}

// ─── WAV + encode ───────────────────────────────────────────────────────────

const wav = (x) => {
  const data = Buffer.alloc(x.length * 2)
  for (let i = 0; i < x.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

const ffmpegPath = () => createRequire(join(ROOT, 'package.json'))('ffmpeg-static')

/** Encode at the highest Vorbis quality that still fits the budget. */
const encode = (wavPath, outPath) => {
  const ff = ffmpegPath()
  for (const q of [3, 2, 1, 0]) {
    const res = spawnSync(ff, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath,
      '-c:a', 'libvorbis', '-q:a', String(q), '-ar', String(SR), '-ac', '1',
      '-map_metadata', '-1', outPath
    ], { stdio: 'inherit' })
    if (res.status !== 0) throw new Error(`ffmpeg failed for ${outPath}`)
    const size = statSync(outPath).size
    if (size <= MAX_BYTES) return { q, size }
  }
  throw new Error(`${outPath} exceeds ${MAX_BYTES} bytes even at q0`)
}

const VOICES = {
  'skill-shield': shield,
  'skill-rocket': rocket,
  'skill-zap': zap,
  'skill-drumroll': drumroll
}

const BOSS_VOICES = {
  'boss-ember-pulse': emberPulse,
  'boss-freeze': freeze,
  'boss-crack': crack,
  'boss-chill': chillTick
}

const main = () => {
  const wavIdx = process.argv.indexOf('--wav')
  const keepDir = wavIdx >= 0 ? resolve(process.argv[wavIdx + 1]) : null
  const work = keepDir ?? mkdtempSync(join(tmpdir(), 'skill-sfx-'))
  mkdirSync(work, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })
  const setIdx = process.argv.indexOf('--set')
  const set = setIdx >= 0 ? process.argv[setIdx + 1] : 'skill'
  const voices = set === 'boss' ? BOSS_VOICES : VOICES
  for (const [name, voice] of Object.entries(voices)) {
    const pcm = voice()
    const wavPath = join(work, `${name}.wav`)
    writeFileSync(wavPath, wav(pcm))
    const out = join(OUT_DIR, `${name}.ogg`)
    const { q, size } = encode(wavPath, out)
    const ms = Math.round((pcm.length / SR) * 1000)
    console.log(`${name}.ogg  ${ms} ms  q${q}  ${size} B`)
    // Sanity: the file really is Ogg.
    if (readFileSync(out).subarray(0, 4).toString() !== 'OggS') throw new Error(`${out} is not Ogg`)
  }
  if (!keepDir) rmSync(work, { recursive: true, force: true })
}

main()
