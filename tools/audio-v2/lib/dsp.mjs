// Tree Smashers audio v2 — offline DSP core (pure JS, no dependencies).
//
// Everything renders into Float32Array buffers at SR. Mono helpers return one
// array; stereo helpers work on { L, R } pairs. Every noise source is a seeded
// PRNG so a re-run renders the same PCM.

export const SR = 44100
export const TAU = Math.PI * 2

/** mulberry32 — seeded uniform [0, 1). */
export const rng = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const buf = (sec) => new Float32Array(Math.max(1, Math.ceil(sec * SR)))
export const stereo = (sec) => ({ L: buf(sec), R: buf(sec) })
export const dbToGain = (db) => Math.pow(10, db / 20)
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, g))
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

const NOTE_INDEX = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
/** "C#4" / "Bb3" / "a5" → MIDI number. */
export const midi = (name) => {
  const m = /^([a-gA-G])([#b]?)(-?\d)$/.exec(name.trim())
  if (!m) throw new Error(`bad note ${name}`)
  let n = NOTE_INDEX[m[1].toLowerCase()]
  if (m[2] === '#') n++
  if (m[2] === 'b') n--
  return n + (Number(m[3]) + 1) * 12
}
export const nf = (name) => mtof(midi(name))

/** Add `src` into `dst` at sample offset `at`, scaled by `gain`. */
export const mix = (dst, src, at = 0, gain = 1) => {
  const start = Math.max(0, -at)
  const end = Math.min(src.length, dst.length - at)
  for (let i = start; i < end; i++) dst[at + i] += src[i] * gain
  return dst
}

/** Equal-power pan of a mono source into a stereo bus (pan -1..1). */
export const mixPan = (bus, src, atSec, gain = 1, pan = 0) => {
  const p = (Math.max(-1, Math.min(1, pan)) + 1) * 0.25 * Math.PI
  const at = Math.round(atSec * SR)
  mix(bus.L, src, at, gain * Math.cos(p))
  mix(bus.R, src, at, gain * Math.sin(p))
  return bus
}

export const scale = (x, g) => {
  for (let i = 0; i < x.length; i++) x[i] *= g
  return x
}

export const peakOf = (x) => {
  let p = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    if (a > p) p = a
  }
  return p
}

// ─── Envelopes ────────────────────────────────────────────────────────────

/** Attack (linear-ish, curved) then exponential decay with time constant. */
export const envAD = (n, attackSec, decaySec, curve = 2) => {
  const e = new Float32Array(n)
  const a = Math.max(1, attackSec * SR)
  for (let i = 0; i < n; i++) {
    if (i < a) e[i] = Math.pow(i / a, 1 / curve)
    else e[i] = Math.exp(-(i - a) / (decaySec * SR))
  }
  return e
}

/** ADSR with a gate length; release is exponential. */
export const envADSR = (n, a, d, s, r, gateSec) => {
  const e = new Float32Array(n)
  const A = Math.max(1, a * SR)
  const D = Math.max(1, d * SR)
  const G = Math.max(A, gateSec * SR)
  let last = 0
  for (let i = 0; i < n; i++) {
    let v
    if (i < A) v = i / A
    else if (i < G) {
      const k = (i - A) / D
      v = s + (1 - s) * Math.exp(-k * 3)
    } else {
      v = last * Math.exp(-1 / (r * SR / 4.6))
    }
    if (i < G) last = v
    else last = v
    e[i] = v
  }
  return e
}

/** Apply envelope in place. */
export const applyEnv = (x, e) => {
  const n = Math.min(x.length, e.length)
  for (let i = 0; i < n; i++) x[i] *= e[i]
  for (let i = n; i < x.length; i++) x[i] = 0
  return x
}

/** Short fades so nothing starts or ends on a click. */
export const edgeFades = (x, inMs = 1.5, outMs = 20) => {
  const fi = Math.max(1, Math.round((inMs / 1000) * SR))
  const fo = Math.max(1, Math.round((outMs / 1000) * SR))
  for (let i = 0; i < fi && i < x.length; i++) x[i] *= i / fi
  for (let i = 0; i < fo && i < x.length; i++) {
    const k = x.length - 1 - i
    x[k] *= Math.sin((i / fo) * Math.PI * 0.5)
  }
  return x
}

// ─── Oscillators ──────────────────────────────────────────────────────────

const polyBlep = (t, dt) => {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}

/**
 * Band-limited oscillator. `freq` is a number or a function of time (sec).
 * types: sine | tri | saw | square | pulse (with `pw`).
 */
export const osc = (type, sec, freq, { phase = 0, pw = 0.5 } = {}) => {
  const n = Math.ceil(sec * SR)
  const out = new Float32Array(n)
  const ff = typeof freq === 'function' ? freq : () => freq
  let ph = phase
  let triState = -1
  for (let i = 0; i < n; i++) {
    const f = ff(i / SR)
    const dt = Math.min(0.49, f / SR)
    let v
    switch (type) {
      case 'sine':
        v = Math.sin(TAU * ph)
        break
      case 'saw':
        v = 2 * ph - 1 - polyBlep(ph, dt)
        break
      case 'square':
      case 'pulse': {
        const w = type === 'square' ? 0.5 : pw
        v = ph < w ? 1 : -1
        v += polyBlep(ph, dt)
        v -= polyBlep((ph + 1 - w) % 1, dt)
        break
      }
      case 'tri': {
        // Integrated band-limited square (leaky).
        let sq = ph < 0.5 ? 1 : -1
        sq += polyBlep(ph, dt)
        sq -= polyBlep((ph + 0.5) % 1, dt)
        triState = triState * 0.9995 + sq * 4 * dt
        v = triState
        break
      }
      default:
        v = 0
    }
    out[i] = v
    ph += f / SR
    if (ph >= 1) ph -= Math.floor(ph)
  }
  return out
}

/** Sum of exponentially decaying sine partials — modal synthesis. */
export const modal = (sec, modes, { seed = 1, jitter = 0 } = {}) => {
  const n = Math.ceil(sec * SR)
  const out = new Float32Array(n)
  const r = rng(seed)
  for (const m of modes) {
    const f = m.f * (1 + (r() * 2 - 1) * jitter)
    if (f >= SR * 0.45) continue
    const k = Math.exp(-1 / (Math.max(0.0005, m.decay) * SR))
    const w = TAU * f / SR
    let env = m.amp
    const att = Math.max(1, (m.attack ?? 0.0008) * SR)
    let ph = (m.phase ?? 0) * TAU
    for (let i = 0; i < n; i++) {
      const a = i < att ? i / att : 1
      out[i] += Math.sin(ph) * env * a
      ph += w
      env *= k
      if (env < 1e-6) break
    }
  }
  return out
}

/** White noise. */
export const noise = (sec, seed = 1) => {
  const r = rng(seed)
  const out = buf(sec)
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1
  return out
}

/** Pink noise (Paul Kellet). */
export const pink = (sec, seed = 1) => {
  const r = rng(seed)
  const out = buf(sec)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < out.length; i++) {
    const w = r() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return out
}

// ─── Filters ──────────────────────────────────────────────────────────────

/**
 * RBJ biquad. `fc` and `q`/`gainDb` may be numbers or functions of time;
 * coefficients are recomputed every 8 samples when swept.
 */
export const biquad = (src, mode, fc, q = 0.707, gainDb = 0) => {
  const out = new Float32Array(src.length)
  const fcF = typeof fc === 'function' ? fc : null
  const qF = typeof q === 'function' ? q : null
  let b0, b1, b2, a1, a2
  const coef = (f, Q) => {
    f = Math.max(10, Math.min(SR * 0.47, f))
    const w = TAU * f / SR
    const cw = Math.cos(w)
    const sw = Math.sin(w)
    const alpha = sw / (2 * Q)
    const A = Math.pow(10, gainDb / 40)
    let B0, B1, B2, A0, A1, A2
    switch (mode) {
      case 'lp': B0 = (1 - cw) / 2; B1 = 1 - cw; B2 = (1 - cw) / 2; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; break
      case 'hp': B0 = (1 + cw) / 2; B1 = -(1 + cw); B2 = (1 + cw) / 2; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; break
      case 'bp': B0 = alpha; B1 = 0; B2 = -alpha; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; break
      case 'notch': B0 = 1; B1 = -2 * cw; B2 = 1; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; break
      case 'peak': B0 = 1 + alpha * A; B1 = -2 * cw; B2 = 1 - alpha * A; A0 = 1 + alpha / A; A1 = -2 * cw; A2 = 1 - alpha / A; break
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha
        B0 = A * ((A + 1) - (A - 1) * cw + s); B1 = 2 * A * ((A - 1) - (A + 1) * cw); B2 = A * ((A + 1) - (A - 1) * cw - s)
        A0 = (A + 1) + (A - 1) * cw + s; A1 = -2 * ((A - 1) + (A + 1) * cw); A2 = (A + 1) + (A - 1) * cw - s
        break
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha
        B0 = A * ((A + 1) + (A - 1) * cw + s); B1 = -2 * A * ((A - 1) + (A + 1) * cw); B2 = A * ((A + 1) + (A - 1) * cw - s)
        A0 = (A + 1) - (A - 1) * cw + s; A1 = 2 * ((A - 1) - (A + 1) * cw); A2 = (A + 1) - (A - 1) * cw - s
        break
      }
      default: throw new Error('biquad mode ' + mode)
    }
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0
  }
  coef(fcF ? fcF(0) : fc, qF ? qF(0) : q)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < src.length; i++) {
    if ((fcF || qF) && (i & 7) === 0) coef(fcF ? fcF(i / SR) : fc, qF ? qF(i / SR) : q)
    const x0 = src[i]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    out[i] = y0
  }
  return out
}

/** One-pole lowpass (gentle smoothing). */
export const onePoleLP = (src, fc) => {
  const out = new Float32Array(src.length)
  const a = Math.exp(-TAU * fc / SR)
  let y = 0
  for (let i = 0; i < src.length; i++) {
    y = (1 - a) * src[i] + a * y
    out[i] = y
  }
  return out
}

/** DC blocker. */
export const dcBlock = (src, r = 0.9995) => {
  const out = new Float32Array(src.length)
  let x1 = 0, y1 = 0
  for (let i = 0; i < src.length; i++) {
    const y = src[i] - x1 + r * y1
    x1 = src[i]; y1 = y
    out[i] = y
  }
  return out
}

/** tanh saturation with drive and makeup to keep small-signal gain ~1. */
export const saturate = (src, drive = 1.5) => {
  const out = new Float32Array(src.length)
  const k = 1 / Math.tanh(drive)
  for (let i = 0; i < src.length; i++) out[i] = Math.tanh(src[i] * drive) * k / drive * (drive > 1 ? drive * 0.85 : 1)
  return out
}

// ─── Plucked string (Karplus–Strong with fractional delay) ────────────────

/**
 * pluck(freq, sec, { bright 0..1, decay sec-ish, pick 0..1 position, seed })
 * Extended KS: noise burst filtered by brightness, loop with a one-zero
 * lowpass + allpass fractional delay for exact tuning, pick-position comb.
 */
export const pluck = (freq, sec, { bright = 0.5, decay = 2.5, pick = 0.18, seed = 7, damp = 0 } = {}) => {
  const n = Math.ceil(sec * SR)
  const out = new Float32Array(n)
  const period = SR / freq
  // Loop filter: y = (1-s)*x + s*x[-1] has group delay s; choose s=0.5.
  const s = 0.5
  const loopDelay = period - s
  const N = Math.max(2, Math.floor(loopDelay))
  const frac = loopDelay - N
  const ap = (1 - frac) / (1 + frac) // first-order allpass coefficient
  // Loop gain from desired T60-ish decay; high notes decay faster naturally.
  const g = Math.pow(0.001, 1 / (decay * freq)) * (1 - damp * 0.02)
  const line = new Float32Array(N + 2)
  const r = rng(seed)
  // Excitation: noise lowpassed by brightness, with a pick-position comb.
  const ex = new Float32Array(N)
  let lp = 0
  const lpA = 0.15 + bright * 0.8
  for (let i = 0; i < N; i++) {
    lp += lpA * ((r() * 2 - 1) - lp)
    ex[i] = lp
  }
  const pd = Math.max(1, Math.round(pick * N))
  for (let i = 0; i < N; i++) line[i] = ex[i] - (i >= pd ? ex[i - pd] : 0) * 0.9
  let lpk = 0
  for (let i = 0; i < N; i++) lpk = Math.max(lpk, Math.abs(line[i]))
  if (lpk > 0) for (let i = 0; i < N; i++) line[i] /= lpk
  let idx = 0
  let prev = 0
  let apx1 = 0, apy1 = 0
  for (let i = 0; i < n; i++) {
    const x = line[idx]
    const lpOut = (1 - s) * x + s * prev
    prev = x
    // Allpass fractional delay.
    const y = ap * lpOut + apx1 - ap * apy1
    apx1 = lpOut; apy1 = y
    line[idx] = y * g
    out[i] = x
    idx++
    if (idx >= N) idx = 0
  }
  return dcBlock(out)
}

// ─── Effects ──────────────────────────────────────────────────────────────

/** Freeverb-style stereo reverb. Returns the WET stereo signal. */
export const reverb = (inL, inR, { room = 0.78, damp = 0.35, width = 1, preDelayMs = 12, tailSec = 2.5 } = {}) => {
  const scaleT = SR / 44100
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((v) => Math.round(v * scaleT))
  const apT = [556, 441, 341, 225].map((v) => Math.round(v * scaleT))
  const spread = Math.round(23 * scaleT)
  const n = inL.length + Math.ceil(tailSec * SR)
  const pre = Math.round((preDelayMs / 1000) * SR)
  const outL = new Float32Array(n)
  const outR = new Float32Array(n)
  const feedback = room * 0.28 + 0.7
  const run = (input, out, off) => {
    const combs = combT.map((t) => ({ b: new Float32Array(t + off), i: 0, f: 0 }))
    const aps = apT.map((t) => ({ b: new Float32Array(t + off), i: 0 }))
    for (let k = 0; k < n; k++) {
      const j = k - pre
      const x = (j >= 0 && j < input.length ? input[j] : 0) * 0.015
      let acc = 0
      for (const c of combs) {
        const y = c.b[c.i]
        c.f = y * (1 - damp) + c.f * damp
        c.b[c.i] = x + c.f * feedback
        if (++c.i >= c.b.length) c.i = 0
        acc += y
      }
      for (const a of aps) {
        const bo = a.b[a.i]
        const y = -acc + bo
        a.b[a.i] = acc + bo * 0.5
        if (++a.i >= a.b.length) a.i = 0
        acc = y
      }
      out[k] = acc
    }
  }
  const wl = new Float32Array(n)
  const wr = new Float32Array(n)
  run(inL, wl, 0)
  run(inR, wr, spread)
  const w1 = width / 2 + 0.5
  const w2 = (1 - width) / 2
  for (let k = 0; k < n; k++) {
    outL[k] = wl[k] * w1 + wr[k] * w2
    outR[k] = wr[k] * w1 + wl[k] * w2
  }
  return { L: outL, R: outR }
}

/** Stereo ping-pong delay (mono-summed input), returns the wet bus. */
export const pingPong = (inL, inR, { timeSec = 0.3, feedback = 0.35, lpHz = 3500, tailSec = 2 } = {}) => {
  const n = inL.length + Math.ceil(tailSec * SR)
  const d = Math.max(1, Math.round(timeSec * SR))
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const a = Math.exp(-TAU * lpHz / SR)
  let fl = 0, fr = 0
  for (let i = d; i < n; i++) {
    const j = i - d
    const x = j < inL.length ? (inL[j] + inR[j]) * 0.5 : 0
    fl = (1 - a) * (x + R[j] * feedback) + a * fl
    fr = (1 - a) * (L[j] * feedback) + a * fr
    L[i] = fl
    R[i] = fr
  }
  return { L, R }
}

/** Simple feed-forward compressor (stereo-linked), in place. */
export const compress = (bus, { threshDb = -18, ratio = 3, attackMs = 8, releaseMs = 120, kneeDb = 6, makeupDb = 0 } = {}) => {
  const { L, R } = bus
  const aA = Math.exp(-1 / ((attackMs / 1000) * SR))
  const aR = Math.exp(-1 / ((releaseMs / 1000) * SR))
  let envDb = -120
  const mk = dbToGain(makeupDb)
  for (let i = 0; i < L.length; i++) {
    const lv = Math.max(Math.abs(L[i]), Math.abs(R[i]))
    const xDb = gainToDb(lv)
    envDb = xDb > envDb ? aA * envDb + (1 - aA) * xDb : aR * envDb + (1 - aR) * xDb
    let over = envDb - threshDb
    let gr = 0
    if (over > kneeDb / 2) gr = over * (1 - 1 / ratio)
    else if (over > -kneeDb / 2) {
      const k = over + kneeDb / 2
      gr = (k * k) / (2 * kneeDb) * (1 - 1 / ratio)
    }
    const g = dbToGain(-gr) * mk
    L[i] *= g
    R[i] *= g
  }
  return bus
}

/** Sum stereo buses: dst += src * g (src may be longer: truncated). */
export const mixBus = (dst, src, g = 1, at = 0) => {
  mix(dst.L, src.L, at, g)
  mix(dst.R, src.R, at, g)
  return dst
}

export const busFrom = (L, R = L) => ({ L: Float32Array.from(L), R: Float32Array.from(R) })

/** Mid-side width (1 = unchanged). */
export const widen = (bus, w) => {
  for (let i = 0; i < bus.L.length; i++) {
    const m = (bus.L[i] + bus.R[i]) * 0.5
    const s = (bus.L[i] - bus.R[i]) * 0.5 * w
    bus.L[i] = m + s
    bus.R[i] = m - s
  }
  return bus
}

/** Filter both channels of a bus. */
export const busFilter = (bus, mode, fc, q, gainDb) => ({
  L: biquad(bus.L, mode, fc, q, gainDb),
  R: biquad(bus.R, mode, fc, q, gainDb)
})
