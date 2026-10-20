// Tree Smashers audio v2 — file-based SFX recipes (mono).
//
// The world: stuffed-animal fighters on spinning WOODEN discs, tree towers,
// cosy forest arenas. So hits are wood + plush, knockouts are soft "poofs",
// rewards are marimba / kalimba / glockenspiel, magic is warm, not sci-fi.
//
// Each recipe returns a mono Float32Array at SR. `target` is the max
// momentary loudness (LUFS, 400 ms) the file is levelled to; see build.mjs.

import {
  SR, TAU, rng, buf, osc, modal, noise, pink, biquad, envAD, applyEnv, edgeFades, mix, scale, saturate, mtof, midi, dcBlock
} from './lib/dsp.mjs'
import * as I from './lib/instruments.mjs'

const at = (sec) => Math.round(sec * SR)

// ─── Building blocks ──────────────────────────────────────────────────────

/** Thick wooden disc struck at the rim: free-edge plate modes, damped. */
const discClack = (f, { seed = 1, dec = 1, bright = 1, sec = 0.3 } = {}) => {
  const r = rng(seed)
  const ratios = [1, 1.72, 2.31, 2.95, 3.88, 4.9]
  const m = modal(sec, ratios.map((k, i) => ({
    f: f * k * (1 + (r() - 0.5) * 0.02), decay: (0.055 / (1 + i * 0.6)) * dec, amp: (i === 0 ? 1 : 0.75 / (1 + i * 0.5)) * (i > 2 ? bright : 1)
  })), { seed })
  const hit = biquad(biquad(noise(0.01, seed + 5), 'bp', f * 2.6, 0.9), 'lp', 6500)
  applyEnv(hit, envAD(hit.length, 0.0003, 0.0025))
  mix(m, hit, 0, 0.5 * bright)
  return m
}

/** Plush body thump: pitch-dropping sine + felt noise, soft attack. */
const plushThump = (f0 = 130, { dec = 0.075, seed = 2, felt = 0.5, sec = 0.3 } = {}) => {
  const s = osc('sine', sec, (t) => f0 * 0.5 + f0 * 0.5 * Math.exp(-t / 0.03))
  applyEnv(s, envAD(s.length, 0.0025, dec))
  const n = biquad(pink(sec, seed), 'lp', 700, 0.7)
  applyEnv(n, envAD(n.length, 0.003, dec * 0.45))
  const out = buf(sec)
  mix(out, s, 0, 1)
  mix(out, n, 0, felt)
  return out
}

/** Wood-splinter crackle: tiny bandpassed clicks thinning out over time. */
const splinters = (sec, { count = 14, seed = 3, fLo = 1800, fHi = 4500, spread = 0.6 } = {}) => {
  const out = buf(sec)
  const r = rng(seed)
  for (let k = 0; k < count; k++) {
    const t = Math.pow(r(), 1.8) * spread
    const f = fLo + r() * (fHi - fLo)
    const g = biquad(noise(0.006, seed + k * 3), 'bp', f, 3)
    applyEnv(g, envAD(g.length, 0.0002, 0.0012 + r() * 0.0015))
    mix(out, g, at(t), (0.4 + r() * 0.6) * (1 - t / (spread + 0.05)))
  }
  return out
}

/** Leaf rustle: granular bandpassed noise. */
const leaves = (sec, { seed = 4, density = 60, fc = 3800, start = 0, fade = 1 } = {}) => {
  const out = buf(sec)
  const r = rng(seed)
  const n = Math.round(density * (sec - start))
  for (let k = 0; k < n; k++) {
    const t = start + r() * (sec - start - 0.04)
    const d = 0.01 + r() * 0.025
    let g = biquad(noise(d, seed + k), 'bp', fc * (0.7 + r() * 0.6), 1.4)
    applyEnv(g, envAD(g.length, d * 0.3, d * 0.3))
    const life = 1 - ((t - start) / (sec - start)) * fade
    mix(out, g, at(t), (0.3 + r() * 0.7) * Math.max(0, life))
  }
  return out
}

/** Airy whoosh: noise through a swept bandpass with a bell envelope. */
const whoosh = (sec, { f0 = 500, f1 = 2500, q = 1.2, seed = 5, peakAt = 0.5, shape = 1.5 } = {}) => {
  const n = pink(sec, seed)
  const y = biquad(n, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / sec)), q)
  const e = new Float32Array(y.length)
  for (let i = 0; i < e.length; i++) {
    const x = i / e.length
    e[i] = x < peakAt ? Math.pow(x / peakAt, shape) : Math.pow(1 - (x - peakAt) / (1 - peakAt), shape * 1.3)
  }
  return applyEnv(y, e)
}

/** Glassy sparkle cluster (glockenspiel high notes). */
const sparkle = (notes, { step = 0.045, seed = 6, sec = 0.9, vel = 1 } = {}) => {
  const out = buf(sec)
  const r = rng(seed)
  notes.forEach((n, i) => {
    const g = I.glock(mtof(midi(n)), vel * (0.8 + r() * 0.2), { sec: sec - i * step, seed: seed + i })
    mix(out, g, at(i * step + r() * 0.006), 1 - i * 0.08)
  })
  return out
}

const ice = (sec, f, { seed = 7, dec = 0.03 } = {}) =>
  modal(sec, [
    { f, decay: dec, amp: 1 }, { f: f * 1.53, decay: dec * 0.8, amp: 0.6 }, { f: f * 2.31, decay: dec * 0.5, amp: 0.4 }, { f: f * 3.17, decay: dec * 0.4, amp: 0.25 }
  ], { seed })

const finish = (x, { inMs = 0.8, outMs = 25 } = {}) => edgeFades(dcBlock(x, 0.9995), inMs, outMs)

// ─── Battle ───────────────────────────────────────────────────────────────

const clash = (k) => {
  const sec = 0.36
  const out = buf(sec)
  if (k === 1) {
    mix(out, discClack(720, { seed: 11 }), 0, 0.8)
    mix(out, plushThump(150, { seed: 12 }), 0, 0.9)
    mix(out, splinters(sec, { count: 4, seed: 13, spread: 0.06 }), at(0.002), 0.25)
  } else if (k === 2) {
    mix(out, discClack(940, { seed: 21, bright: 1.15 }), 0, 0.85)
    mix(out, plushThump(175, { seed: 22, dec: 0.06, felt: 0.35 }), 0, 0.65)
    mix(out, splinters(sec, { count: 5, seed: 23, spread: 0.07, fLo: 2400 }), at(0.002), 0.22)
  } else if (k === 3) {
    mix(out, discClack(520, { seed: 31, bright: 0.8, dec: 1.2 }), 0, 0.75)
    mix(out, plushThump(118, { seed: 32, dec: 0.1, felt: 0.65 }), 0, 1.05)
  } else if (k === 4) {
    mix(out, discClack(780, { seed: 41 }), 0, 0.75)
    mix(out, discClack(860, { seed: 42, dec: 0.8 }), at(0.034), 0.5)
    mix(out, discClack(700, { seed: 43, dec: 0.7 }), at(0.071), 0.28)
    mix(out, plushThump(150, { seed: 44, dec: 0.06 }), 0, 0.75)
  } else {
    mix(out, discClack(640, { seed: 51 }), 0, 0.75)
    const tonk = modal(sec, [{ f: 410, decay: 0.12, amp: 1 }, { f: 410 * 2.76, decay: 0.04, amp: 0.3 }], { seed: 52 })
    mix(out, tonk, at(0.003), 0.35)
    mix(out, plushThump(140, { seed: 53 }), 0, 0.85)
  }
  // A gentle low-pass keeps the frequent hit from ever getting harsh.
  return finish(biquad(saturate(out, 1.3), 'lp', 7000, 0.6), { outMs: 40 })
}

const explosion = () => {
  const sec = 1.05
  const out = buf(sec)
  // Big soft low thump.
  const low = osc('sine', sec, (t) => 56 + 70 * Math.exp(-t / 0.06))
  applyEnv(low, envAD(low.length, 0.004, 0.22))
  mix(out, low, 0, 1)
  // Fluffy puff: lowpass sweep closing.
  const puff = biquad(pink(sec, 61), 'lp', (t) => 300 + 3200 * Math.exp(-t / 0.09), 0.8)
  applyEnv(puff, envAD(puff.length, 0.006, 0.18))
  mix(out, puff, 0, 0.9)
  // "Pop" on top.
  const pop = osc('sine', 0.08, (t) => 520 - 3000 * t)
  applyEnv(pop, envAD(pop.length, 0.001, 0.018))
  mix(out, pop, 0, 0.25)
  mix(out, discClack(600, { seed: 62, dec: 1.3 }), 0, 0.45)
  mix(out, splinters(sec, { count: 22, seed: 63, spread: 0.45 }), at(0.01), 0.35)
  mix(out, leaves(sec, { seed: 64, density: 70, start: 0.08, fc: 3300 }), 0, 0.22)
  return finish(saturate(biquad(out, 'lp', 9000), 1.4), { outMs: 120 })
}

const celebration = (k) => {
  const sec = 1.35
  const out = buf(sec)
  if (k === 1) {
    mix(out, I.taiko(0.9, { tune: 1.6, len: 0.5, seed: 71 }), 0, 0.6)
    mix(out, I.taiko(1, { tune: 1.3, len: 0.6, seed: 72 }), at(0.13), 0.7)
    mix(out, I.strum([...['G3', 'B3', 'D4', 'G4'].map((n) => mtof(midi(n)))], 1, { sec: 1.0, bright: 0.6, seed: 73 }), at(0.26), 0.55)
    const ev = [['D5', 0.26, 0.1], ['G5', 0.38, 0.1], ['B5', 0.5, 0.6]].map(([n, t, d]) => ({ t, dur: d, f: mtof(midi(n)), vel: 1 }))
    mix(out, I.whistleLine(ev, sec, { vib: 0.016 }), 0, 0.5)
    mix(out, I.cymbal(0.7, { sec: 1.0, seed: 74 }), at(0.26), 0.25)
  } else {
    ;[0, 0.09, 0.18].forEach((t, i) => mix(out, I.woodblock(0.9, { f: 900 + i * 120, seed: 81 + i }), at(t), 0.6))
    ;[['C5', 0.3], ['E5', 0.42], ['G5', 0.54], ['C6', 0.54]].forEach(([n, t], i) => mix(out, I.marimba(mtof(midi(n)), 1, { sec: 0.8, seed: 84 + i, mallet: 0.6 }), at(t), 0.55))
    mix(out, I.clap(1, { seed: 88 }), at(0.54), 0.45)
    mix(out, I.kick(0.8, { seed: 89 }), at(0.54), 0.5)
    mix(out, sparkle(['C7', 'G6', 'E7'], { seed: 90, sec: 0.7 }), at(0.6), 0.25)
  }
  return finish(out, { outMs: 150 })
}

const towerFall = () => {
  const sec = 1.5
  const out = buf(sec)
  // Sharp trunk crack: broadband snap + resonant wood ring.
  const snap = biquad(noise(0.03, 101), 'hp', 900)
  applyEnv(snap, envAD(snap.length, 0.0004, 0.006))
  mix(out, saturate(snap, 2.5), 0, 0.55)
  mix(out, modal(0.3, [{ f: 330, decay: 0.08, amp: 1 }, { f: 790, decay: 0.05, amp: 0.6 }, { f: 1430, decay: 0.03, amp: 0.4 }], { seed: 102 }), 0, 0.5)
  mix(out, splinters(0.5, { count: 30, seed: 103, spread: 0.3, fLo: 1500, fHi: 5000 }), 0, 0.5)
  // Creak: stick-slip pulse train through a body resonance.
  const creak = buf(0.35)
  const r = rng(104)
  let t = 0
  while (t < 0.32) {
    const g = biquad(noise(0.004, 105 + Math.round(t * 1000)), 'bp', 700, 4)
    applyEnv(g, envAD(g.length, 0.0002, 0.002))
    mix(creak, g, at(t), 0.6 + r() * 0.4)
    t += 1 / (35 + 40 * (t / 0.32)) + r() * 0.002
  }
  mix(out, biquad(creak, 'peak', 450, 2, 6), at(0.08), 0.5)
  // Falling swish, then the heavy landing.
  mix(out, whoosh(0.5, { f0: 1600, f1: 400, seed: 106, peakAt: 0.7 }), at(0.3), 0.5)
  const land = at(0.78)
  mix(out, plushThump(95, { dec: 0.2, seed: 107, felt: 0.7, sec: 0.6 }), land, 1)
  mix(out, discClack(260, { seed: 108, dec: 2.2, bright: 0.6 }), land, 0.6)
  mix(out, leaves(0.7, { seed: 109, density: 90, fc: 3500 }), land, 0.3)
  return finish(saturate(out, 1.3), { outMs: 150 })
}

// ─── Rewards ──────────────────────────────────────────────────────────────

const happy = () => {
  const sec = 1.3
  const out = buf(sec)
  ;['C5', 'E5', 'G5', 'C6'].forEach((n, i) => mix(out, I.marimba(mtof(midi(n)), 1, { sec: 1.0, seed: 120 + i, mallet: 0.6 }), at(i * 0.075), 0.55 + i * 0.05))
  ;['E6', 'G6'].forEach((n, i) => mix(out, I.kalimba(mtof(midi(n)), 1, { sec: 0.9, seed: 125 + i }), at(0.3 + i * 0.08), 0.4))
  mix(out, sparkle(['C7', 'E7', 'G7', 'C8'], { step: 0.04, seed: 128, sec: 0.85 }), at(0.32), 0.3)
  return finish(out, { outMs: 200 })
}

const levelUp = () => {
  const sec = 0.75
  const out = buf(sec)
  ;['G5', 'B5', 'D6', 'G6'].forEach((n, i) => mix(out, I.xylophone(mtof(midi(n)), 1, { sec: 0.5, seed: 130 + i }), at(i * 0.055), 0.6))
  mix(out, whoosh(0.3, { f0: 700, f1: 4000, seed: 134, peakAt: 0.8 }), 0, 0.35)
  mix(out, sparkle(['D7', 'G7', 'B7'], { step: 0.035, seed: 135, sec: 0.5 }), at(0.22), 0.3)
  return finish(out, { outMs: 120 })
}

const rewardContinue = () => {
  const sec = 0.45
  const out = buf(sec)
  mix(out, I.woodblock(1, { f: 700, seed: 140 }), 0, 0.7)
  mix(out, I.kalimba(mtof(midi('A5')), 1, { sec: 0.42, seed: 141 }), at(0.03), 0.45)
  mix(out, I.kalimba(mtof(midi('E6')), 1, { sec: 0.38, seed: 142 }), at(0.09), 0.4)
  return finish(out, { outMs: 60 })
}

// ─── Skills ───────────────────────────────────────────────────────────────

const skillShield = () => {
  const sec = 0.48
  const out = buf(sec)
  mix(out, modal(sec, [{ f: 310, decay: 0.06, amp: 1 }, { f: 310 * 2.4, decay: 0.03, amp: 0.4 }], { seed: 150 }), 0, 0.7)
  mix(out, plushThump(140, { dec: 0.05, seed: 151, felt: 0.3 }), 0, 0.4)
  // Warm chime: two soft bell partial sets (major sixth), slight shimmer.
  for (const [f, g, d] of [[mtof(midi('E6')), 1, 0.25], [mtof(midi('C#7')), 0.5, 0.18]]) {
    const b = modal(sec, [{ f, decay: d, amp: 1, attack: 0.004 }, { f: f * 2.01, decay: d * 0.4, amp: 0.25, attack: 0.004 }, { f: f * 3.03, decay: d * 0.2, amp: 0.08 }], { seed: 152 })
    const tr = new Float32Array(b.length)
    for (let i = 0; i < tr.length; i++) tr[i] = 1 + 0.15 * Math.sin(TAU * 9 * (i / SR))
    applyEnv(b, tr)
    mix(out, b, at(0.008), 0.32 * g)
  }
  return finish(out, { outMs: 60 })
}

const skillRocket = () => {
  const sec = 0.55
  const out = buf(sec)
  ;[0, 0.07, 0.14].forEach((t, i) => {
    // Cork pop: a short resonant pop + tiny pitch-up sine.
    const p = biquad(noise(0.02, 160 + i), 'bp', 900 + i * 150, 4)
    applyEnv(p, envAD(p.length, 0.0004, 0.006))
    mix(out, saturate(p, 3), at(t), 0.35)
    const s = osc('sine', 0.05, (x) => (420 + i * 60) * (1 + 6 * x))
    applyEnv(s, envAD(s.length, 0.001, 0.012))
    mix(out, s, at(t), 0.22)
  })
  mix(out, whoosh(0.47, { f0: 600, f1: 3200, q: 1.6, seed: 165, peakAt: 0.5, shape: 1.1 }), at(0.04), 1.6)
  const whistle = osc('sine', 0.4, (x) => 900 + 1500 * x)
  applyEnv(whistle, envAD(whistle.length, 0.12, 0.1))
  mix(out, whistle, at(0.08), 0.06)
  return finish(out, { outMs: 60 })
}

const skillZap = () => {
  const sec = 0.38
  const r = rng(170)
  // FM buzz with a wobbling carrier, band-limited and rounded.
  const n = at(sec)
  const out = new Float32Array(n)
  let ph = 0
  let wob = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    wob = wob * 0.995 + (r() - 0.5) * 0.08
    const f = 210 * (1 + 0.25 * Math.sin(TAU * 38 * t) + wob)
    ph += f / SR
    const mod = Math.sin(TAU * ph * 3.01) * 2.2
    out[i] = Math.sin(TAU * ph + mod)
  }
  let y = biquad(biquad(out, 'bp', 1400, 0.7), 'lp', 5000)
  applyEnv(y, envAD(y.length, 0.004, 0.11))
  mix(y, splinters(sec, { count: 16, seed: 171, spread: 0.28, fLo: 2500, fHi: 6000 }), 0, 0.6)
  return finish(saturate(y, 1.6), { outMs: 50 })
}

const skillCrit = () => {
  const sec = 0.4
  const out = buf(sec)
  mix(out, discClack(560, { seed: 180, dec: 1.4, bright: 1.1 }), 0, 0.9)
  mix(out, plushThump(160, { dec: 0.06, seed: 181, felt: 0.4 }), 0, 0.6)
  const crack = biquad(noise(0.02, 182), 'hp', 1500)
  applyEnv(crack, envAD(crack.length, 0.0002, 0.004))
  mix(out, crack, 0, 0.6)
  mix(out, sparkle(['A6', 'E7'], { step: 0.06, seed: 183, sec: 0.35 }), at(0.04), 0.35)
  return finish(saturate(out, 1.4), { outMs: 50 })
}

const skillWhoosh = () => {
  const sec = 0.32
  const out = buf(sec)
  mix(out, whoosh(sec, { f0: 2600, f1: 700, q: 0.9, seed: 190, peakAt: 0.3 }), 0, 1)
  mix(out, leaves(sec, { seed: 191, density: 80, start: 0.08, fc: 4200 }), 0, 0.25)
  return finish(out, { inMs: 3, outMs: 40 })
}

const skillBoost = () => {
  const sec = 0.22
  const out = buf(sec)
  const s = osc('sine', sec, (t) => 330 * Math.pow(2, Math.min(1, t / 0.12) * 1.1))
  applyEnv(s, envAD(s.length, 0.003, 0.06))
  mix(out, s, 0, 0.8)
  const s2 = osc('tri', sec, (t) => 660 * Math.pow(2, Math.min(1, t / 0.12) * 1.1))
  applyEnv(s2, envAD(s2.length, 0.003, 0.04))
  mix(out, biquad(s2, 'lp', 3000), 0, 0.2)
  mix(out, I.woodblock(0.8, { f: 1100, seed: 200, dec: 1.4 }), 0, 0.14)
  return finish(out, { outMs: 40 })
}

// ─── Bosses ───────────────────────────────────────────────────────────────

const emberPulse = () => {
  const sec = 0.65
  const out = buf(sec)
  const boom = osc('sine', sec, (t) => 55 + 65 * Math.exp(-t / 0.05))
  applyEnv(boom, envAD(boom.length, 0.005, 0.15))
  mix(out, boom, 0, 0.9)
  const fire = biquad(pink(sec, 210), 'lp', (t) => 4000 * Math.exp(-t / 0.18) + 400, 0.9)
  applyEnv(fire, envAD(fire.length, 0.03, 0.15))
  mix(out, fire, 0, 0.8)
  // Ember crackle: sparse sharp clicks with a slower fade.
  mix(out, splinters(sec, { count: 26, seed: 211, spread: 0.55, fLo: 2000, fHi: 7000 }), at(0.03), 0.4)
  return finish(saturate(out, 1.4), { outMs: 80 })
}

const freeze = () => {
  const sec = 0.52
  const out = buf(sec)
  const r = rng(220)
  let t = 0
  let k = 0
  while (t < 0.3) {
    mix(out, ice(0.06, 3200 + r() * 2600, { seed: 221 + k, dec: 0.012 }), at(t), 0.25 + (t / 0.3) * 0.35)
    t += 0.045 * Math.pow(0.82, k) + 0.006
    k++
  }
  // Rising glassy shimmer.
  const sh = osc('sine', 0.35, (x) => 2200 + 1800 * (x / 0.35))
  const sh2 = osc('sine', 0.35, (x) => 3330 + 2600 * (x / 0.35))
  mix(sh, sh2, 0, 0.6)
  applyEnv(sh, envAD(sh.length, 0.2, 0.06))
  mix(out, sh, at(0.05), 0.12)
  mix(out, plushThump(120, { dec: 0.07, seed: 222, felt: 0.4 }), at(0.3), 0.7)
  mix(out, ice(0.25, 1700, { seed: 223, dec: 0.05 }), at(0.3), 0.35)
  return finish(out, { outMs: 60 })
}

const iceCrack = () => {
  const sec = 0.42
  const out = buf(sec)
  const snap = biquad(biquad(noise(0.02, 230), 'hp', 1600), 'lp', 7000)
  applyEnv(snap, envAD(snap.length, 0.0004, 0.005))
  mix(out, saturate(snap, 2.5), 0, 0.5)
  mix(out, ice(0.15, 2100, { seed: 231, dec: 0.025 }), 0, 0.6)
  const r = rng(232)
  for (let k = 0; k < 6; k++) {
    const t = 0.05 + k * 0.045 + r() * 0.02
    mix(out, ice(0.08, 4000 + r() * 3000, { seed: 233 + k, dec: 0.015 }), at(t), 0.35 * (1 - k / 7))
  }
  return finish(out, { outMs: 50 })
}

const chill = () => {
  const sec = 0.26
  const out = buf(sec)
  const f = mtof(midi('B6'))
  mix(out, modal(sec, [{ f, decay: 0.08, amp: 1 }, { f: f * 2.76, decay: 0.03, amp: 0.3 }], { seed: 240 }), 0, 0.6)
  mix(out, ice(0.05, 5200, { seed: 241, dec: 0.008 }), 0, 0.3)
  const air = biquad(noise(0.12, 242), 'hp', 6000)
  applyEnv(air, envAD(air.length, 0.01, 0.03))
  mix(out, air, 0, 0.12)
  return finish(out, { outMs: 40 })
}

// ─── Registry: id → { fn, target (max momentary LUFS) } ───────────────────

export const SFX = {
  'clash-1': { fn: () => clash(1), target: -14 },
  'clash-2': { fn: () => clash(2), target: -14 },
  'clash-3': { fn: () => clash(3), target: -14 },
  'clash-4': { fn: () => clash(4), target: -14 },
  'clash-5': { fn: () => clash(5), target: -14 },
  'explosion-1': { fn: explosion, target: -13 },
  'celebration-1': { fn: () => celebration(1), target: -15 },
  'celebration-2': { fn: () => celebration(2), target: -15 },
  'tower-fall': { fn: towerFall, target: -13 },
  happy: { fn: happy, target: -16 },
  'level-up': { fn: levelUp, target: -17 },
  'reward-continue': { fn: rewardContinue, target: -22 },
  'skill-shield': { fn: skillShield, target: -18 },
  'skill-rocket': { fn: skillRocket, target: -15 },
  'skill-zap': { fn: skillZap, target: -16 },
  'skill-crit': { fn: skillCrit, target: -16 },
  'skill-whoosh': { fn: skillWhoosh, target: -17 },
  'skill-boost': { fn: skillBoost, target: -18 },
  'boss-ember-pulse': { fn: emberPulse, target: -16 },
  'boss-freeze': { fn: freeze, target: -17 },
  'boss-crack': { fn: iceCrack, target: -19 },
  'boss-chill': { fn: chill, target: -18 }
}
