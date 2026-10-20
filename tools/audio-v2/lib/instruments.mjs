// Tree Smashers audio v2 — instrument voices. Each returns a mono
// Float32Array (dry); the caller pans, sends to reverb and mixes.
//
// The palette is chosen for the game's world: wood (marimba, xylophone,
// woodblock, wooden discs), plush (soft low thumps), folk (plucked guitar,
// mandolin, upright bass, tin whistle, frame drum, stomps, claps, shaker)
// and a little sparkle (glockenspiel) for rewards.

import {
  SR, TAU, rng, buf, osc, modal, noise, pink, biquad, envAD, envADSR, applyEnv, edgeFades,
  pluck, mix, scale, saturate, onePoleLP, dcBlock, mtof
} from './dsp.mjs'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ─── Percussion ───────────────────────────────────────────────────────────

/** Stomp / kick: a felt-beater kick with a wooden-floor knock. */
export const kick = (vel = 1, { tune = 1, seed = 1, punch = 1 } = {}) => {
  const sec = 0.55
  const body = osc('sine', sec, (t) => 50 * tune + 110 * tune * Math.exp(-t / 0.035))
  applyEnv(body, envAD(body.length, 0.001, 0.16))
  const click = biquad(noise(0.012, seed), 'bp', 2400, 0.9)
  applyEnv(click, envAD(click.length, 0.0005, 0.004))
  const knock = modal(0.08, [{ f: 180 * tune, decay: 0.03, amp: 0.25 }, { f: 410 * tune, decay: 0.018, amp: 0.12 }])
  const out = buf(sec)
  mix(out, body, 0, 0.95)
  mix(out, click, 0, 0.35 * punch)
  mix(out, knock, 0, 0.5)
  return scale(edgeFades(saturate(out, 1.4), 0.2, 80), vel)
}

/** Frame drum / bodhrán: warm low tone with skin noise. */
export const frameDrum = (vel = 1, { tune = 1, seed = 2, open = 1 } = {}) => {
  const sec = 0.35
  const t0 = osc('sine', sec, (t) => 92 * tune + 40 * tune * Math.exp(-t / 0.02))
  applyEnv(t0, envAD(t0.length, 0.001, 0.09 * open))
  const t1 = osc('sine', sec, 168 * tune)
  applyEnv(t1, envAD(t1.length, 0.001, 0.05 * open))
  const skin = biquad(pink(sec, seed), 'bp', 420 * tune, 1.2)
  applyEnv(skin, envAD(skin.length, 0.001, 0.035))
  const out = buf(sec)
  mix(out, t0, 0, 0.8)
  mix(out, t1, 0, 0.25)
  mix(out, skin, 0, 0.9)
  return scale(edgeFades(out, 0.2, 60), vel)
}

/** Snare-ish stick hit on a tight frame drum (folk-rock backbeat). */
export const snare = (vel = 1, { seed = 3, tone = 1, tail = 1 } = {}) => {
  const sec = 0.3
  const body = osc('tri', sec, (t) => 185 * tone + 60 * Math.exp(-t / 0.01))
  applyEnv(body, envAD(body.length, 0.0008, 0.045))
  let sn = noise(sec, seed)
  sn = biquad(biquad(sn, 'hp', 1300), 'lp', 7500)
  applyEnv(sn, envAD(sn.length, 0.0008, 0.07 * tail))
  const out = buf(sec)
  mix(out, body, 0, 0.6)
  mix(out, sn, 0, 0.55)
  return scale(edgeFades(saturate(out, 1.2), 0.2, 50), vel)
}

/** Hand clap: three micro bursts and a short room tail. */
export const clap = (vel = 1, { seed = 4 } = {}) => {
  const sec = 0.28
  const out = buf(sec)
  const r = rng(seed)
  const offs = [0, 0.009 + r() * 0.003, 0.019 + r() * 0.003]
  for (const [k, o] of offs.entries()) {
    const b = biquad(noise(0.05, seed + k), 'bp', 1150 + r() * 200, 1.3)
    applyEnv(b, envAD(b.length, 0.0004, 0.006))
    mix(out, b, Math.round(o * SR), k === 2 ? 1 : 0.7)
  }
  const tail = biquad(noise(sec, seed + 9), 'bp', 1300, 0.9)
  applyEnv(tail, envAD(tail.length, 0.02, 0.06))
  mix(out, tail, 0, 0.5)
  return scale(edgeFades(out, 0.2, 50), vel * 1.4)
}

/** Shaker: soft seed-pod "shh". */
export const shaker = (vel = 1, { seed = 5, len = 1 } = {}) => {
  const sec = 0.12 * len
  let s = biquad(noise(sec, seed), 'hp', 5200)
  s = biquad(s, 'peak', 8000, 1, 3)
  applyEnv(s, envAD(s.length, 0.012 * len, 0.03 * len, 1.5))
  return scale(edgeFades(s, 0.2, 30), vel * 0.5)
}

/** Tambourine jingle (bandpassed metallic noise + a few partials). */
export const tambourine = (vel = 1, { seed = 6 } = {}) => {
  const sec = 0.25
  let s = biquad(noise(sec, seed), 'hp', 6500)
  applyEnv(s, envAD(s.length, 0.001, 0.07))
  const j = modal(sec, [
    { f: 5310, decay: 0.06, amp: 0.08 }, { f: 6920, decay: 0.05, amp: 0.07 }, { f: 8430, decay: 0.04, amp: 0.05 }
  ])
  mix(s, j, 0, 1)
  return scale(edgeFades(s, 0.2, 40), vel * 0.55)
}

/** Woodblock: two inharmonic modes of a hollow block. */
export const woodblock = (vel = 1, { f = 820, seed = 7, dec = 1 } = {}) => {
  const sec = 0.15
  const m = modal(sec, [
    { f, decay: 0.035 * dec, amp: 1 }, { f: f * 2.71, decay: 0.012 * dec, amp: 0.35 }, { f: f * 4.1, decay: 0.006, amp: 0.15 }
  ], { seed })
  const c = biquad(noise(0.006, seed), 'bp', f * 3, 1)
  mix(m, c, 0, 0.3)
  return scale(edgeFades(m, 0.2, 10), vel)
}

/** Big tom / taiko: deep, pitch-dropping skin with a felt attack. */
export const taiko = (vel = 1, { tune = 1, seed = 8, len = 1 } = {}) => {
  const sec = 0.9 * len
  const b = osc('sine', sec, (t) => 62 * tune + 55 * tune * Math.exp(-t / 0.05))
  applyEnv(b, envAD(b.length, 0.002, 0.28 * len))
  const o2 = osc('sine', sec, (t) => 118 * tune + 30 * Math.exp(-t / 0.04))
  applyEnv(o2, envAD(o2.length, 0.002, 0.12 * len))
  let sk = biquad(pink(sec, seed), 'lp', 900)
  applyEnv(sk, envAD(sk.length, 0.001, 0.05))
  const out = buf(sec)
  mix(out, b, 0, 1)
  mix(out, o2, 0, 0.35)
  mix(out, sk, 0, 0.7)
  return scale(edgeFades(saturate(out, 1.3), 0.2, 120), vel)
}

/** Crash / suspended cymbal swell or hit (soft, darkish). */
export const cymbal = (vel = 1, { sec = 2.2, seed = 9, swell = 0 } = {}) => {
  let s = noise(sec, seed)
  s = biquad(s, 'hp', 3200)
  s = biquad(s, 'peak', 5200, 0.8, 4)
  s = biquad(s, 'lp', 11000)
  const pr = modal(sec, [
    { f: 3311, decay: 0.9, amp: 0.02 }, { f: 4719, decay: 0.7, amp: 0.018 }, { f: 6211, decay: 0.5, amp: 0.015 }, { f: 7499, decay: 0.4, amp: 0.012 }
  ])
  mix(s, pr, 0, 1)
  const n = s.length
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    e[i] = swell ? Math.pow(t / sec, 2.2) * (t < sec - 0.03 ? 1 : (sec - t) / 0.03) : (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / (sec * 0.32)))
  }
  applyEnv(s, e)
  return scale(edgeFades(s, swell ? 0.2 : 0.2, swell ? 30 : 150), vel * 0.42)
}

// ─── Pitched: wood & metal mallets ─────────────────────────────────────────

/** Marimba: tuned rosewood bar (1 : 4 : 9.9 partials) + soft mallet. */
export const marimba = (freq, vel = 1, { sec = 1.4, seed = 11, mallet = 0.5 } = {}) => {
  const lowness = clamp(1 - Math.log2(freq / 130) / 4, 0.2, 1)
  const d0 = 0.25 + 0.6 * lowness
  const m = modal(sec, [
    { f: freq, decay: d0, amp: 1 },
    { f: freq * 3.99, decay: d0 * 0.18, amp: 0.22 + mallet * 0.25 },
    { f: freq * 9.9, decay: d0 * 0.05, amp: 0.05 + mallet * 0.12 },
    { f: freq * 2, decay: d0 * 0.3, amp: 0.04 } // resonator tube coloration
  ], { seed })
  const tick = biquad(noise(0.008, seed), 'bp', Math.min(6000, freq * 6), 0.8)
  applyEnv(tick, envAD(tick.length, 0.0003, 0.002))
  mix(m, tick, 0, 0.15 + mallet * 0.25)
  return scale(edgeFades(m, 0.4, 30), vel)
}

/** Xylophone: brighter, shorter bar (1 : 3 : 6.1). */
export const xylophone = (freq, vel = 1, { sec = 0.6, seed = 12 } = {}) => {
  const m = modal(sec, [
    { f: freq, decay: 0.22, amp: 1 }, { f: freq * 3.0, decay: 0.07, amp: 0.4 }, { f: freq * 6.1, decay: 0.025, amp: 0.15 }
  ], { seed })
  const tick = biquad(noise(0.005, seed), 'hp', 3000)
  applyEnv(tick, envAD(tick.length, 0.0002, 0.0015))
  mix(m, tick, 0, 0.2)
  return scale(edgeFades(m, 0.3, 20), vel)
}

/** Glockenspiel: steel bar, long sparkle (1 : 2.76 : 5.4 : 8.93). */
export const glock = (freq, vel = 1, { sec = 1.6, seed = 13 } = {}) => {
  const m = modal(sec, [
    { f: freq, decay: 0.7, amp: 1 }, { f: freq * 2.756, decay: 0.25, amp: 0.3 },
    { f: freq * 5.404, decay: 0.09, amp: 0.12 }, { f: freq * 8.933, decay: 0.04, amp: 0.05 }
  ], { seed })
  return scale(edgeFades(m, 0.3, 40), vel * 0.8)
}

/** Kalimba: thumb-piano tine (1 : 5.9 : 13 partials), woody box. */
export const kalimba = (freq, vel = 1, { sec = 1.2, seed = 14 } = {}) => {
  const m = modal(sec, [
    { f: freq, decay: 0.45, amp: 1 }, { f: freq * 5.93, decay: 0.05, amp: 0.25 }, { f: freq * 13.1, decay: 0.015, amp: 0.08 }
  ], { seed })
  const box = biquad(m, 'peak', 380, 1.2, 4)
  return scale(edgeFades(box, 0.3, 30), vel)
}

// ─── Pitched: strings ─────────────────────────────────────────────────────

/** Acoustic-guitar body resonance applied to a plucked string. */
const guitarBody = (x) => {
  let y = biquad(x, 'peak', 105, 2.5, 5)
  y = biquad(y, 'peak', 220, 2, 3)
  y = biquad(y, 'peak', 2500, 1, -3)
  return biquad(y, 'lp', 7000)
}

/** One guitar string. */
export const guitarNote = (freq, vel = 1, { sec = 2, bright = 0.45, decay = 3, seed = 21, mute = 0 } = {}) => {
  const s = pluck(freq, sec, { bright, decay: decay * (1 - mute * 0.85), pick: 0.13 + (seed % 5) * 0.012, seed })
  if (mute) applyEnv(s, envAD(s.length, 0.001, 0.08 + (1 - mute) * 0.4))
  return scale(edgeFades(guitarBody(s), 0.5, 30), vel * 0.9)
}

/**
 * Strum a chord (array of freqs, low → high). dir 'down' | 'up'.
 * Returns a mono buffer; strings are staggered by `spreadMs`.
 */
export const strum = (freqs, vel = 1, { dir = 'down', spreadMs = 11, sec = 1.6, bright = 0.5, mute = 0, seed = 30 } = {}) => {
  const out = buf(sec + 0.1)
  const order = dir === 'down' ? freqs : [...freqs].reverse()
  const r = rng(seed)
  order.forEach((f, k) => {
    const v = vel * (0.75 + r() * 0.25) * (dir === 'up' ? (k < 3 ? 0.85 : 0.6) : 1)
    const n = guitarNote(f, v, { sec, bright: bright + (dir === 'up' ? 0.1 : 0), decay: 2.6, seed: seed + k * 7, mute })
    mix(out, n, Math.round((k * spreadMs * (0.8 + r() * 0.4)) / 1000 * SR), 1 / Math.sqrt(freqs.length) * 1.3)
  })
  return out
}

/** Mandolin: paired courses (slightly detuned), bright and short. */
export const mandolin = (freq, vel = 1, { sec = 0.8, seed = 41 } = {}) => {
  const a = pluck(freq, sec, { bright: 0.75, decay: 1.2, pick: 0.11, seed })
  const b = pluck(freq * 1.0025, sec, { bright: 0.7, decay: 1.1, pick: 0.12, seed: seed + 1 })
  const out = buf(sec)
  mix(out, a, 0, 0.6)
  mix(out, b, Math.round(0.0015 * SR), 0.55)
  let y = biquad(out, 'peak', 420, 1.5, 4)
  y = biquad(y, 'peak', 3000, 1, 2)
  y = biquad(y, 'hp', 160)
  return scale(edgeFades(y, 0.3, 20), vel)
}

/** Upright / acoustic bass: plucked string + sine fundamental reinforcement. */
export const bass = (freq, vel = 1, { sec = 0.9, seed = 51, gate = 0.5, rel = 0.07 } = {}) => {
  const p = pluck(freq, sec, { bright: 0.3, decay: 1.4, pick: 0.2, seed })
  const s = osc('sine', sec, freq)
  applyEnv(s, envADSR(s.length, 0.004, 0.15, 0.55, 0.08, gate))
  const out = buf(sec)
  mix(out, biquad(p, 'lp', 1400), 0, 0.9)
  mix(out, s, 0, 0.55)
  const e = envADSR(out.length, 0.002, 0.2, 0.8, rel, gate)
  applyEnv(out, e)
  return scale(edgeFades(saturate(out, 1.3), 0.5, 15), vel)
}

/** Plucked low strings (pizzicato) — for the boss ostinato and lose sting. */
export const pizz = (freq, vel = 1, { sec = 0.6, seed = 61 } = {}) => {
  const p = pluck(freq, sec, { bright: 0.35, decay: 0.7, pick: 0.25, seed })
  const y = biquad(biquad(p, 'peak', 300, 1.2, 3), 'lp', 3200)
  return scale(edgeFades(y, 0.3, 20), vel)
}

// ─── Pitched: winds & sustained ───────────────────────────────────────────

/**
 * Tin whistle / wooden flute lead. `notes` = [{ t, dur, f, vel }] in seconds,
 * rendered as ONE legato voice with breath, delayed vibrato, short glides
 * between adjacent notes and a soft tongued attack on re-articulation.
 */
export const whistleLine = (notes, totalSec, { seed = 71, breath = 0.12, vib = 0.012, bright = 1 } = {}) => {
  const n = Math.ceil(totalSec * SR)
  const out = new Float32Array(n)
  const amp = new Float32Array(n)
  const fr = new Float32Array(n)
  const sorted = [...notes].sort((a, b) => a.t - b.t)
  for (let k = 0; k < sorted.length; k++) {
    const nt = sorted[k]
    const s0 = Math.round(nt.t * SR)
    const s1 = Math.min(n, Math.round((nt.t + nt.dur) * SR))
    const next = sorted[k + 1]
    const legato = next && Math.abs(next.t - (nt.t + nt.dur)) < 0.02
    const prev = sorted[k - 1]
    const glideFrom = prev && Math.abs(prev.t + prev.dur - nt.t) < 0.02 ? prev.f : nt.f
    const att = Math.round(0.018 * SR)
    const rel = Math.round((legato ? 0.006 : 0.05) * SR)
    for (let i = s0; i < Math.min(n, s1 + rel); i++) {
      const j = i - s0
      let a
      if (j < att) a = 0.25 + 0.75 * (j / att)
      else if (i < s1) a = 1
      else a = Math.max(0, 1 - (i - s1) / rel)
      if (!prev || glideFrom === nt.f) a = j < att ? j / att : a
      a *= nt.vel ?? 1
      if (a > amp[i]) amp[i] = a
      const g = Math.min(1, j / (0.035 * SR))
      const tt = j / SR
      const vd = Math.min(1, Math.max(0, (tt - 0.18) / 0.25))
      fr[i] = (glideFrom + (nt.f - glideFrom) * (1 - Math.pow(1 - g, 3))) * (1 + vib * vd * Math.sin(TAU * 5.4 * tt))
    }
  }
  // Fill frequency gaps (silence) to avoid phase jumps.
  let lastF = sorted[0]?.f ?? 440
  for (let i = 0; i < n; i++) {
    if (fr[i] === 0) fr[i] = lastF
    else lastF = fr[i]
  }
  // Smooth amplitude a touch.
  const ampS = onePoleLP(amp, 120)
  const r = rng(seed)
  let ph = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const f = fr[i]
    ph += f / SR
    if (ph > 1) ph -= 1
    const s = Math.sin(TAU * ph)
    const h2 = Math.sin(TAU * ph * 2) * 0.12 * bright
    const h3 = Math.sin(TAU * ph * 3) * 0.05 * bright
    nb = nb * 0.6 + (r() * 2 - 1) * 0.4
    out[i] = (s + h2 + h3 + nb * breath) * ampS[i]
  }
  const y = biquad(biquad(out, 'hp', 300), 'lp', 7000)
  return y
}

/** Sustained voice built from detuned oscillators through a filter. */
export const padNote = (freq, sec, vel = 1, { type = 'saw', detune = 0.006, cutoff = 1400, attack = 0.25, release = 0.6, voices = 3, seed = 81, q = 0.7 } = {}) => {
  const total = sec + release
  const out = buf(total)
  for (let v = 0; v < voices; v++) {
    const d = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * detune
    const o = osc(type, total, freq * (1 + d), { phase: rng(seed + v)() })
    mix(out, o, 0, 1 / voices)
  }
  let y = biquad(out, 'lp', cutoff, q)
  y = biquad(y, 'hp', 60)
  applyEnv(y, envADSR(y.length, attack, 0.3, 0.85, release, sec))
  return scale(edgeFades(y, 1, 40), vel)
}

/**
 * Brass-like stab / swell for the boss track: saw stack whose filter opens
 * with the envelope (the "blat" of a horn section).
 */
export const horn = (freq, sec, vel = 1, { seed = 91, swell = 0 } = {}) => {
  const total = sec + 0.25
  const out = buf(total)
  for (let v = 0; v < 3; v++) {
    const o = osc('saw', total, (t) => freq * (1 + (v - 1) * 0.004) * (1 + 0.004 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.3)), { phase: rng(seed + v)() })
    mix(out, o, 0, 0.34)
  }
  const att = swell ? sec * 0.6 : 0.03
  const y = biquad(out, 'lp', (t) => 500 + 2200 * Math.min(1, t / Math.max(0.03, att)) * Math.exp(-Math.max(0, t - att) / 0.6), 0.9)
  const z = biquad(y, 'peak', 1100, 1, 3)
  applyEnv(z, envADSR(z.length, att, 0.2, 0.75, 0.2, sec))
  return scale(edgeFades(saturate(z, 1.2), 1, 30), vel)
}

/** Accordion-ish reed chord (musette: two detuned reeds per note). */
export const reed = (freqs, sec, vel = 1, { seed = 101, cutoff = 2200 } = {}) => {
  const total = sec + 0.12
  const out = buf(total)
  freqs.forEach((f, k) => {
    for (const d of [-0.0035, 0.0035]) {
      const o = osc('pulse', total, (t) => f * (1 + d), { pw: 0.32, phase: rng(seed + k)() })
      mix(out, o, 0, 0.5 / freqs.length)
    }
  })
  let y = biquad(out, 'lp', cutoff, 0.8)
  y = biquad(y, 'peak', 900, 1, 3)
  y = biquad(y, 'hp', 140)
  applyEnv(y, envADSR(y.length, 0.025, 0.08, 0.8, 0.08, sec))
  return scale(edgeFades(y, 1, 20), vel)
}

/** Soft sub drone (boss). */
export const drone = (freq, sec, vel = 1) => {
  const total = sec + 0.5
  const a = osc('sine', total, freq)
  const b = osc('tri', total, freq * 2.003)
  const out = buf(total)
  mix(out, a, 0, 0.8)
  mix(out, biquad(b, 'lp', 400), 0, 0.3)
  applyEnv(out, envADSR(out.length, 0.4, 0.3, 0.9, 0.5, sec))
  return scale(edgeFades(out, 1, 60), vel)
}

/** Little bird chirp for the menu's forest ambience. */
export const chirp = (vel = 1, { f = 3200, seed = 111, count = 2 } = {}) => {
  const out = buf(0.5)
  const r = rng(seed)
  for (let k = 0; k < count; k++) {
    const d = 0.05 + r() * 0.04
    const f0 = f * (0.9 + r() * 0.2)
    const s = osc('sine', d, (t) => f0 * (1 + 0.35 * Math.sin(Math.PI * t / d)) * (1 + 0.04 * Math.sin(TAU * 60 * t)))
    applyEnv(s, envAD(s.length, 0.006, d * 0.35))
    mix(out, s, Math.round(k * (0.085 + r() * 0.03) * SR), 1)
  }
  return scale(edgeFades(out, 1, 10), vel)
}

export { mtof }
