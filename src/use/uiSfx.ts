// ─── UI sound: tiny synthesised ticks for presses, toggles, modals, rewards ──
//
// Every UI sound is SYNTHESISED on the shared AudioContext (useAssets) from a
// couple of oscillators and a short noise burst — no files, no fetch, no
// decode, nothing added to the preload tiers. Each voice lives 20–260 ms.
//
// Loudness: the game mixes quietly (a clash plays its -20 dB-RMS file at
// gain userSoundVolume × 0.025). UI_GAIN puts a press ~4 dB UNDER a clash at
// the same slider position, so taps sit under the fight instead of on top of
// it; every recipe below is levelled relative to `press` (see LEVELS).
//
// Gates — a UI sound is skipped (never queued) when:
//   • the SFX slider is 0 (this is also the platform-mute path: applyMute
//     zeroes the volume refs) — on mobile that is the only reliable mute;
//   • the game is paused by the platform (overlay / ad / hidden tab):
//     `isGamePaused`;
//   • an ad is in flight (`setUiSfxSuppressed('ads', …)`, fed by App.vue from
//     useAds.adsInFlight — not every portal publishes a pause edge);
//   • the context is not running yet (a source started on a suspended
//     context would fire late, on resume). No Page Visibility read here on
//     purpose: YouTube Playables forbids it; the platform pause covers it.
//
// Spam guard: one voice per sound name per MIN_GAP_MS, and at most
// MAX_VOICES UI voices overlapping. Mashing a button gives one tick per press
// at most every ~45 ms, never a pile-up.
//
// Everything is best-effort and never throws into the caller.

import { getAudioContext } from '@/use/useAssets'
import { isGamePaused } from '@/use/useGamePause'
import useUser from '@/use/useUser'
import type { Ref } from 'vue'

export type UiSfxName =
  | 'press' // a button goes down: soft woody "tock"
  | 'pressHero' // the hero CTA goes down: deeper "thunk"
  | 'release' // a press completed (click): small rising pip
  | 'toggleOn' // switch on: two rising blips
  | 'toggleOff' // switch off: two falling blips
  | 'tab' // tab / segment / card select: light wooden tick
  | 'open' // modal / panel opens: airy pop
  | 'close' // modal closes: the pop in reverse
  | 'tick' // count-up step: tiny bright tick (pitch rises with progress)
  | 'reward' // a reward lands: two-note sparkle "ting"
  | 'deny' // refused tap (disabled / can't afford): dull double bonk
  | 'slide' // slider step: very small click

/** Peak amplitude of `press` at userSoundVolume = 1 (see header). */
export const UI_GAIN = 0.0085

/** Per-recipe level relative to `press` (1). */
const LEVELS: Record<UiSfxName, number> = {
  press: 1,
  pressHero: 0.95,
  release: 0.42,
  toggleOn: 0.7,
  toggleOff: 0.6,
  tab: 0.75,
  open: 0.6,
  close: 0.5,
  tick: 0.3,
  reward: 0.75,
  deny: 0.7,
  slide: 0.3
}

const MIN_GAP_MS: Record<UiSfxName, number> = {
  press: 45,
  pressHero: 60,
  release: 45,
  toggleOn: 80,
  toggleOff: 80,
  tab: 50,
  open: 140,
  close: 140,
  tick: 42,
  reward: 120,
  deny: 160,
  slide: 55
}

export const UI_SFX_MAX_VOICES = 4

// ─── Gates ────────────────────────────────────────────────────────────────

const suppressors = new Set<string>()
/** Named, game-side reasons to stay silent (e.g. 'ads' while one is in flight). */
export const setUiSfxSuppressed = (reason: string, on: boolean): void => {
  if (on) suppressors.add(reason)
  else suppressors.delete(reason)
}

// Resolved lazily: useUser ↔ useMatch ↔ useSound have a circular import, so
// it must never be called at module-evaluation time (see useSound.ts).
let vol: Ref<number> | null = null
const soundVolume = (): number => {
  try {
    vol ??= useUser().userSoundVolume
    const v = Number(vol.value)
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  } catch {
    return 0
  }
}

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const lastAt: Partial<Record<UiSfxName, number>> = {}
let voices = 0

// ─── Synthesis ────────────────────────────────────────────────────────────

let noise: AudioBuffer | null = null
const noiseBuffer = (ctx: BaseAudioContext): AudioBuffer => {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  const len = Math.floor(ctx.sampleRate * 0.25)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  // Seeded LCG: the same noise every session (deterministic, testable).
  let s = 0x2545f491
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    d[i] = (s / 0xffffffff) * 2 - 1
  }
  noise = buf
  return buf
}

interface Voice {
  /** Peak amplitude for this voice (already scaled). */
  amp: number
  ctx: BaseAudioContext
  out: AudioNode
  t0: number
  /** Pitch multiplier (count-up progress, tiny random variance). */
  pitch: number
}

const env = (v: Voice, at: number, peak: number, attack: number, decay: number): GainNode => {
  const g = v.ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  g.connect(v.out)
  return g
}

const tone = (
  v: Voice,
  type: OscillatorType,
  f0: number,
  f1: number,
  at: number,
  attack: number,
  decay: number,
  peak: number
): number => {
  const o = v.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0 * v.pitch, at)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * v.pitch, at + attack + decay)
  o.connect(env(v, at, peak, attack, decay))
  const end = at + attack + decay + 0.02
  o.start(at)
  o.stop(end)
  return end
}

const burst = (
  v: Voice,
  filter: BiquadFilterType,
  f0: number,
  f1: number,
  at: number,
  dur: number,
  peak: number,
  q = 0.8
): number => {
  const src = v.ctx.createBufferSource()
  src.buffer = noiseBuffer(v.ctx)
  const bq = v.ctx.createBiquadFilter()
  bq.type = filter
  bq.Q.value = q
  bq.frequency.setValueAtTime(f0, at)
  if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(f1, at + dur)
  src.connect(bq).connect(env(v, at, peak, Math.min(0.004, dur / 4), dur))
  const end = at + dur + 0.02
  src.start(at)
  src.stop(end)
  return end
}

/** Each recipe schedules its nodes and returns the end time. */
const RECIPES: Record<UiSfxName, (v: Voice) => number> = {
  press: (v) => {
    burst(v, 'highpass', 2600, 2600, v.t0, 0.012, v.amp * 0.35)
    return tone(v, 'triangle', 430, 185, v.t0, 0.003, 0.06, v.amp)
  },
  pressHero: (v) => {
    burst(v, 'lowpass', 1900, 900, v.t0, 0.018, v.amp * 0.4)
    tone(v, 'triangle', 520, 190, v.t0, 0.003, 0.07, v.amp * 0.45)
    return tone(v, 'sine', 250, 92, v.t0, 0.004, 0.11, v.amp)
  },
  release: (v) => tone(v, 'sine', 720, 1080, v.t0, 0.004, 0.045, v.amp),
  toggleOn: (v) => {
    tone(v, 'triangle', 660, 680, v.t0, 0.003, 0.045, v.amp)
    return tone(v, 'triangle', 990, 1010, v.t0 + 0.055, 0.003, 0.06, v.amp)
  },
  toggleOff: (v) => {
    tone(v, 'triangle', 700, 690, v.t0, 0.003, 0.045, v.amp)
    return tone(v, 'triangle', 470, 450, v.t0 + 0.055, 0.003, 0.06, v.amp)
  },
  tab: (v) => {
    burst(v, 'bandpass', 3200, 3200, v.t0, 0.008, v.amp * 0.4, 1.2)
    return tone(v, 'triangle', 900, 640, v.t0, 0.002, 0.035, v.amp)
  },
  open: (v) => {
    burst(v, 'bandpass', 700, 2600, v.t0, 0.13, v.amp * 0.55, 1.4)
    return tone(v, 'sine', 320, 640, v.t0 + 0.02, 0.006, 0.1, v.amp)
  },
  close: (v) => {
    burst(v, 'bandpass', 2400, 650, v.t0, 0.11, v.amp * 0.5, 1.4)
    return tone(v, 'sine', 600, 300, v.t0 + 0.01, 0.005, 0.09, v.amp)
  },
  tick: (v) => tone(v, 'sine', 1650, 1700, v.t0, 0.002, 0.022, v.amp),
  reward: (v) => {
    tone(v, 'sine', 1568, 1568, v.t0, 0.003, 0.22, v.amp)
    tone(v, 'sine', 3136, 3136, v.t0, 0.003, 0.12, v.amp * 0.25)
    return tone(v, 'sine', 2093, 2093, v.t0 + 0.07, 0.003, 0.26, v.amp * 0.85)
  },
  deny: (v) => {
    tone(v, 'triangle', 200, 165, v.t0, 0.003, 0.05, v.amp)
    return tone(v, 'triangle', 180, 150, v.t0 + 0.075, 0.003, 0.06, v.amp)
  },
  slide: (v) => tone(v, 'triangle', 1300, 1150, v.t0, 0.002, 0.016, v.amp)
}

/**
 * Render one recipe onto any context/destination. Exported for the loudness
 * harness (an OfflineAudioContext renders every recipe and compares it with
 * a clash) — gameplay code calls `playUiSfx`.
 */
export const renderUiSfx = (
  ctx: BaseAudioContext,
  out: AudioNode,
  name: UiSfxName,
  peak: number,
  at = ctx.currentTime,
  pitch = 1
): number => RECIPES[name]({ ctx, out, amp: peak * LEVELS[name], t0: at, pitch })

export interface UiSfxOptions {
  /** Pitch multiplier, e.g. 1 → 1.5 across a count-up. */
  pitch?: number
}

/** Play a UI sound if every gate allows it. Never throws. */
export const playUiSfx = (name: UiSfxName, opts: UiSfxOptions = {}): void => {
  try {
    if (suppressors.size > 0 || isGamePaused.value) return
    const volume = soundVolume()
    if (volume <= 0) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const last = lastAt[name]
    if (last !== undefined && now - last < MIN_GAP_MS[name]) return
    if (voices >= UI_SFX_MAX_VOICES) return
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state !== 'running') {
      // First gesture of the session: wake the context; this one tap stays
      // silent rather than firing late.
      void ctx.resume().catch(() => {})
      return
    }
    lastAt[name] = now
    // ±3 % variance so a run of presses doesn't sound like a machine gun.
    const jitter = name === 'tick' || name === 'reward' ? 1 : 0.97 + Math.random() * 0.06
    const end = renderUiSfx(ctx, ctx.destination, name, UI_GAIN * volume, ctx.currentTime + 0.002, (opts.pitch ?? 1) * jitter)
    voices++
    const ms = Math.max(30, (end - ctx.currentTime) * 1000)
    setTimeout(() => { voices = Math.max(0, voices - 1) }, ms)
  } catch {
    /* audio is optional */
  }
}

/** Test seam: forget throttle state. */
export const __resetUiSfxForTests = (): void => {
  for (const k of Object.keys(lastAt)) delete lastAt[k as UiSfxName]
  voices = 0
  suppressors.clear()
}

export const prefersReducedMotion = reducedMotion
