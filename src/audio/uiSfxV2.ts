// ─── Audio v2: live-synthesised UI and intro-cutscene sounds ────────────────
//
// Redesign of the recipes in `use/uiSfx.ts` (UI presses, toggles, modals…)
// and the four synth cues in `use/introAudio.ts` (countdown tick, landing
// thud, heartbeat, wind-up whoosh) for the Tree Smashers world: small WOODEN
// blocks and bamboo, plush thumps, leafy swishes and a kalimba for rewards.
//
// Nothing here plays by itself. It is the v2 half of an A/B that the owner
// approves per sound (sounds-todo.md); `audio/audioVersions.ts` says which
// version each sound uses and how the callers pick a recipe from it.
//
// Same contract as uiSfx.ts: a recipe schedules nodes on any BaseAudioContext
// (live or Offline) into `out`, starting at `t0`, and returns its end time.
// No files, no fetch, no allocation beyond the nodes of one voice; the shared
// noise buffer is built once per sample rate (seeded, deterministic).
//
// Levels: V2_UI_LEVELS mirror uiSfx.ts's LEVELS (relative to `press`) and
// were calibrated by tools/audio-v2/render-procedural.mjs so every v2 sound
// lands within ±1 dB of the old sound's loudness at the same call site.

import type { UiSfxName } from '@/use/uiSfx'

export type IntroCueKind = 'tick' | 'thud' | 'heart' | 'whoosh'

interface V2Voice {
  ctx: BaseAudioContext
  out: AudioNode
  /** Peak amplitude for this voice (already scaled). */
  amp: number
  t0: number
  /** Pitch multiplier. */
  pitch: number
}

let noise: AudioBuffer | null = null
const noiseBuffer = (ctx: BaseAudioContext): AudioBuffer => {
  if (noise && noise.sampleRate === ctx.sampleRate) {
    return noise
  }
  const len = Math.floor(ctx.sampleRate * 0.4)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let s = 0x6d2b79f5
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    d[i] = (s / 0xffffffff) * 2 - 1
  }
  noise = buf
  return buf
}

/** Exponential attack/decay gain stage feeding `v.out`. */
const env = (v: V2Voice, at: number, peak: number, attack: number, decay: number): GainNode => {
  const g = v.ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  g.connect(v.out)
  return g
}

/** One decaying sine partial (a mode of a struck bar / block). */
const mode = (v: V2Voice, f: number, at: number, decay: number, peak: number, attack = 0.0015): number => {
  const o = v.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f * v.pitch, at)
  o.connect(env(v, at, peak, attack, decay))
  const end = at + attack + decay + 0.02
  o.start(at)
  o.stop(end)
  return end
}

/** A gliding tone (thumps, pips, swells). */
const glide = (
  v: V2Voice,
  type: OscillatorType,
  f0: number,
  f1: number,
  at: number,
  attack: number,
  decay: number,
  peak: number,
  glideSec = attack + decay
): number => {
  const o = v.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0 * v.pitch, at)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * v.pitch), at + glideSec)
  o.connect(env(v, at, peak, attack, decay))
  const end = at + attack + decay + 0.02
  o.start(at)
  o.stop(end)
  return end
}

/** Filtered noise burst (felt tips, leaf swishes, air). */
const breath = (
  v: V2Voice,
  filter: BiquadFilterType,
  f0: number,
  f1: number,
  at: number,
  attack: number,
  decay: number,
  peak: number,
  q = 0.9
): number => {
  const src = v.ctx.createBufferSource()
  src.buffer = noiseBuffer(v.ctx)
  const bq = v.ctx.createBiquadFilter()
  bq.type = filter
  bq.Q.value = q
  bq.frequency.setValueAtTime(f0, at)
  if (f1 !== f0) {
    bq.frequency.exponentialRampToValueAtTime(f1, at + attack + decay)
  }
  src.connect(bq).connect(env(v, at, peak, attack, decay))
  const end = at + attack + decay + 0.02
  src.start(at)
  src.stop(end)
  return end
}

/** A small wooden block: fundamental + the hollow-block overtone + felt tip. */
const woodBlock = (v: V2Voice, f: number, at: number, peak: number, decay = 0.035): number => {
  breath(v, 'bandpass', f * 3, f * 3, at, 0.0008, 0.006, peak * 0.35, 1.1)
  mode(v, f * 2.71, at, decay * 0.35, peak * 0.3)
  return mode(v, f, at, decay, peak)
}

/** Plush thump: a soft pitch-dropping sine with a felt noise layer. */
const plush = (v: V2Voice, f0: number, f1: number, at: number, decay: number, peak: number): number => {
  breath(v, 'lowpass', 900, 500, at, 0.003, decay * 0.45, peak * 0.45, 0.7)
  return glide(v, 'sine', f0, f1, at, 0.004, decay, peak, decay * 0.6)
}

/** Kalimba tine: fundamental + its high, fast-decaying overtone. */
const tine = (v: V2Voice, f: number, at: number, peak: number, decay = 0.22): number => {
  mode(v, f * 5.93, at, 0.03, peak * 0.18)
  return mode(v, f, at, decay, peak, 0.002)
}

const UI_RECIPES: Record<UiSfxName, (v: V2Voice) => number> = {
  press: (v) => woodBlock(v, 640, v.t0, v.amp, 0.032),
  pressHero: (v) => {
    woodBlock(v, 330, v.t0, v.amp * 0.6, 0.05)
    return plush(v, 170, 70, v.t0, 0.11, v.amp)
  },
  release: (v) => {
    mode(v, 1900, v.t0, 0.012, v.amp * 0.4)
    return glide(v, 'sine', 880, 1240, v.t0, 0.003, 0.04, v.amp)
  },
  toggleOn: (v) => {
    woodBlock(v, 1050, v.t0, v.amp, 0.02)
    return woodBlock(v, 1480, v.t0 + 0.06, v.amp, 0.024)
  },
  toggleOff: (v) => {
    woodBlock(v, 1300, v.t0, v.amp, 0.02)
    return woodBlock(v, 880, v.t0 + 0.06, v.amp, 0.024)
  },
  tab: (v) => {
    breath(v, 'highpass', 3500, 3500, v.t0, 0.0006, 0.005, v.amp * 0.3, 0.8)
    mode(v, 1650 * 2.2, v.t0, 0.006, v.amp * 0.35)
    return mode(v, 1650, v.t0, 0.016, v.amp)
  },
  open: (v) => {
    breath(v, 'bandpass', 520, 2300, v.t0, 0.05, 0.08, v.amp * 0.6, 1.3)
    mode(v, 784, v.t0 + 0.05, 0.05, v.amp * 0.25)
    return glide(v, 'triangle', 370, 392, v.t0 + 0.04, 0.006, 0.12, v.amp, 0.03)
  },
  close: (v) => {
    breath(v, 'bandpass', 2100, 520, v.t0, 0.03, 0.08, v.amp * 0.55, 1.3)
    return glide(v, 'triangle', 392, 330, v.t0 + 0.01, 0.005, 0.1, v.amp, 0.06)
  },
  tick: (v) => {
    mode(v, 4900, v.t0, 0.003, v.amp * 0.3)
    return mode(v, 2450, v.t0, 0.009, v.amp, 0.0008)
  },
  reward: (v) => {
    tine(v, 1568, v.t0, v.amp, 0.22)
    return tine(v, 2093, v.t0 + 0.075, v.amp * 0.85, 0.28)
  },
  deny: (v) => {
    plush(v, 230, 150, v.t0, 0.06, v.amp)
    return plush(v, 200, 130, v.t0 + 0.085, 0.07, v.amp * 0.9)
  },
  slide: (v) => mode(v, 2050, v.t0, 0.007, v.amp, 0.0008)
}

/**
 * Per-recipe level relative to `press` (1) — calibrated against the old
 * recipes (see header); keep in step with uiSfx.ts's LEVELS when tuning.
 */
export const V2_UI_LEVELS: Record<UiSfxName, number> = {
  press: 1,
  pressHero: 0.82,
  release: 0.36,
  toggleOn: 0.62,
  toggleOff: 0.55,
  tab: 0.59,
  open: 0.55,
  close: 0.5,
  tick: 0.4,
  reward: 0.63,
  deny: 0.51,
  slide: 0.32
}

/** Peak of v2 `press` relative to the old UI_GAIN (calibration factor). */
export const V2_UI_GAIN_SCALE = 1.175

/**
 * Render one v2 UI recipe — same signature as uiSfx.ts `renderUiSfx`, so the
 * caller can switch per sound without touching gates or throttles.
 */
export const renderUiSfxV2 = (
  ctx: BaseAudioContext,
  out: AudioNode,
  name: UiSfxName,
  peak: number,
  at = ctx.currentTime,
  pitch = 1
): number => UI_RECIPES[name]({ ctx, out, amp: peak * V2_UI_GAIN_SCALE * V2_UI_LEVELS[name], t0: at, pitch })

// ─── Intro cutscene cues ──────────────────────────────────────────────────

/** Gain of each v2 cue at soundVolume = 1 (calibrated like the UI set). */
export const V2_INTRO_GAIN: Record<IntroCueKind, number> = {
  tick: 0.07,
  thud: 0.5,
  heart: 0.475,
  whoosh: 0.088
}

/**
 * Render one v2 intro cue. `gain` is the cue's own scale (heart beats pass
 * 1 / 0.7), `pitchHz` the countdown tick's pitch (ignored by other cues).
 * `volume` is userSoundVolume (the caller applies the mute rules first).
 */
export const renderIntroCueV2 = (
  ctx: BaseAudioContext,
  out: AudioNode,
  kind: IntroCueKind,
  volume: number,
  at = ctx.currentTime,
  { gain = 1, pitchHz = 1000 }: { gain?: number; pitchHz?: number } = {}
): number => {
  const amp = Math.max(0, Math.min(1, volume * V2_INTRO_GAIN[kind] * gain))
  const v: V2Voice = { ctx, out, amp, t0: at, pitch: 1 }
  switch (kind) {
    case 'tick':
      return woodBlock(v, pitchHz * 0.6, at, amp, 0.03)
    case 'thud':
      woodBlock(v, 190, at, amp * 0.35, 0.08)
      return plush(v, 120, 42, at, 0.34, amp)
    case 'heart':
      return plush(v, 78, 48, at, 0.14, amp)
    case 'whoosh':
      breath(v, 'bandpass', 320, 2400, at, 0.22, 0.14, amp, 1.1)
      return breath(v, 'bandpass', 640, 3800, at + 0.03, 0.2, 0.12, amp * 0.4, 2)
    default:
      return at
  }
}
