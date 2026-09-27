// ─── First-launch intro: sound ──────────────────────────────────────────────
//
// THE CUTSCENE IS BUILT TO WORK SILENT. It autoplays before any user gesture,
// and no browser lets a page start audio before one — so every beat is
// readable muted (the way mobile ad creatives are cut), and sound is a layer on
// top that joins whenever the page is allowed to make it:
//
//   • an embed that grants autoplay (the shared AudioContext comes up
//     `running`, e.g. a portal iframe with `allow="autoplay"` after the player
//     clicked Play on the portal page) hears the whole thing;
//   • otherwise the first tap anywhere resumes the context (useAssets arms
//     that listener) and every LATER cue is audible;
//   • a cue is NEVER scheduled on a suspended context. A source started on a
//     suspended context is queued, and they would all fire at once on resume —
//     so a cue whose moment passed while suspended is simply dropped.
//
// Samples go through the game's own `playSound`, so they obey the SFX volume,
// the platform mute (which zeroes it) and the mobile-mute rule. The few synth
// cues (the countdown ticks, the landing thud, the heartbeat, the ladder)
// derive their gain from the same volume ref and the same mute rule.
//
// The fight is simulated live, so cues are derived as its events are
// discovered (a hair before they happen), and the post-fight cues once the
// fight's end is known.

import type { Ref } from 'vue'
import { getAudioContext, loadAudioBuffer, resourceCache } from '@/use/useAssets'
import { prependBaseUrl } from '@/utils/function'
import type { FightEvent, FightTrack } from '@/use/introFight'
import { BOSS, P1 } from '@/use/introFight'
import type { Director } from '@/use/introTimeline'
import { LEVEL_FROM, STAGE_FROM, UNKNOWN_T, stepTime } from '@/use/introTimeline'

export type Cue =
  | { T: number; kind: 'sfx'; name: string; ratio: number }
  | { T: number; kind: 'tick'; pitch: number }
  | { T: number; kind: 'thud' }
  | { T: number; kind: 'heart'; gain: number }
  | { T: number; kind: 'whoosh' }

export interface IntroAudio {
  /** Fire every cue in (prevT, T]. */
  update: (prevT: number, T: number) => void
}

/** Cues one fight event produces, at director time T (+ its hit-stop). */
export const cuesForEvent = (e: FightEvent, T: number, hold: number, clashIndex: number): Cue[] => {
  switch (e.kind) {
    case 'slam':
      return [{ T, kind: 'sfx', name: 'explosion-1', ratio: 0.03 }, { T, kind: 'thud' }]
    case 'hit':
      return e.b === BOSS && e.power > 250
        ? [{ T, kind: 'sfx', name: `clash-${(clashIndex % 5) + 1}`, ratio: e.power > 600 ? 0.034 : 0.026 }]
        : []
    case 'bumper':
      return e.a !== BOSS ? [{ T, kind: 'tick', pitch: 1500 }] : []
    case 'thunderWind':
      return [{ T, kind: 'whoosh' }]
    case 'thunder':
      return e.b === BOSS ? [{ T, kind: 'sfx', name: 'clash-5', ratio: 0.034 }] : []
    case 'ko':
      return [{ T: T + hold, kind: 'sfx', name: 'explosion-1', ratio: e.a === P1 ? 0.034 : 0.04 }]
    default:
      return []
  }
}

/** The post-fight cues: the loss sting, the countdown, the landing, the
 *  heartbeat, the shatter and the climb. */
export const beatCues = (b: Director['beats']): Cue[] => {
  const cues: Cue[] = [{ T: b.battleEndT, kind: 'sfx', name: 'lose', ratio: 0.03 }]
  // Countdown ticks, one per STAGE decrement, pitch falling with the number.
  for (let k = 1; k < STAGE_FROM; k++) {
    cues.push({
      T: stepTime(k, STAGE_FROM, b.fallStartT),
      kind: 'tick',
      pitch: 260 + ((STAGE_FROM - k) / STAGE_FROM) * 1100
    })
  }
  // Level decrements get a lower second voice.
  for (let k = 1; k < LEVEL_FROM; k++) {
    cues.push({
      T: stepTime(k, LEVEL_FROM, b.fallStartT),
      kind: 'tick',
      pitch: 140 + ((LEVEL_FROM - k) / LEVEL_FROM) * 420
    })
  }
  cues.push({ T: b.landT, kind: 'thud' })
  cues.push({ T: b.landT + 0.18, kind: 'heart', gain: 1 })
  cues.push({ T: b.landT + 0.42, kind: 'heart', gain: 0.7 })
  cues.push({ T: b.landT + 0.9, kind: 'heart', gain: 1 })
  cues.push({ T: b.landT + 1.14, kind: 'heart', gain: 0.7 })
  cues.push({ T: b.holdEndT, kind: 'sfx', name: 'clash-3', ratio: 0.022 })
  // The ladder lighting up: a RISING run — the fall's ticks, reversed.
  for (let k = 0; k < 8; k++) {
    cues.push({ T: b.reclaimT + 0.55 + k * (0.5 / 8), kind: 'tick', pitch: 420 + k * 130 })
  }
  cues.push({ T: b.reclaimT + 1.0, kind: 'sfx', name: 'level-up', ratio: 0.03 })
  return cues
}

/** Every sample the cutscene can play. */
export const INTRO_SFX: readonly string[] = [
  'explosion-1', 'clash-1', 'clash-2', 'clash-3', 'clash-4', 'clash-5', 'lose', 'level-up'
]
const sfxUrl = (name: string): string => prependBaseUrl(`audio/sfx/${name}.ogg`)

export const createIntroAudio = (
  track: FightTrack,
  director: Director,
  playSound: (name: string, ratio?: number) => unknown,
  soundVolume: Ref<number>,
  isMobileMuted: () => boolean
): IntroAudio => {
  /** Cues known and not yet played, kept sorted by T. */
  let pending: Cue[] = []
  let seenEvents = 0
  let clash = 0
  let beatsQueued = false
  let lastTickAt = -1

  // Decode every sample up front through Web Audio (a plain fetch). A sample
  // that is not decoded yet is SKIPPED rather than handed to playSound's
  // HTMLAudio fallback — the cutscene never creates a media element, so it
  // never shows a media request (and never stacks up late playback).
  for (const name of INTRO_SFX) void loadAudioBuffer(sfxUrl(name))

  const enqueue = (list: Cue[]): void => {
    if (!list.length) return
    pending = pending.concat(list).sort((p, q) => p.T - q.T)
  }

  const running = (): AudioContext | null => {
    const ctx = getAudioContext()
    return ctx && ctx.state === 'running' ? ctx : null
  }

  const gainFor = (base: number): number => {
    if (isMobileMuted()) return 0
    const v = soundVolume.value ?? 0
    return Math.max(0, Math.min(1, v * base))
  }

  const tone = (
    ctx: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, peak: number
  ): void => {
    const g = gainFor(peak)
    if (g <= 0.0001) return
    try {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      const t = ctx.currentTime
      osc.type = type
      osc.frequency.setValueAtTime(f0, t)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.exponentialRampToValueAtTime(g, t + Math.min(0.012, dur * 0.2))
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(amp).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    } catch { /* a refused start is a silent cue, never an error */
    }
  }

  const fire = (c: Cue): void => {
    const ctx = running()
    if (!ctx) return
    switch (c.kind) {
      case 'sfx':
        if (gainFor(1) > 0 && resourceCache.audioBuffers.has(sfxUrl(c.name))) playSound(c.name, c.ratio)
        break
      case 'tick':
        // The tail of the countdown fires faster than a tick can ring —
        // thin it rather than stacking dozens of oscillators on one frame.
        if (c.T - lastTickAt < 0.03) return
        lastTickAt = c.T
        tone(ctx, 'triangle', c.pitch, c.pitch * 0.92, 0.05, 0.06)
        break
      case 'thud':
        tone(ctx, 'sine', 110, 38, 0.42, 0.5)
        break
      case 'heart':
        tone(ctx, 'sine', 70, 45, 0.18, 0.45 * c.gain)
        break
      case 'whoosh':
        tone(ctx, 'sawtooth', 90, 420, 0.36, 0.035)
        break
    }
  }

  return {
    update: (prevT: number, T: number) => {
      // Newly discovered fight events → cues.
      const events = track.events
      while (seenEvents < events.length && seenEvents < director.eventT.length) {
        const e = events[seenEvents]!
        const isClash = e.kind === 'hit' && e.b === BOSS && e.power > 250
        enqueue(cuesForEvent(e, director.eventT[seenEvents]!, director.eventHold[seenEvents] ?? 0, clash))
        if (isClash) clash++
        seenEvents++
      }
      if (!beatsQueued && director.beats.battleEndT < UNKNOWN_T) {
        beatsQueued = true
        enqueue(beatCues(director.beats))
      }
      // Play what is due; drop what was missed (never late, never stacked).
      let i = 0
      while (i < pending.length && pending[i]!.T <= T) {
        const c = pending[i]!
        if (c.T > prevT - 1e-6) fire(c)
        i++
      }
      if (i > 0) pending = pending.slice(i)
    }
  }
}
