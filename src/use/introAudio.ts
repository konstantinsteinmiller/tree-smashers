// ─── First-launch intro: sound ──────────────────────────────────────────────
//
// THE CUTSCENE IS BUILT TO WORK SILENT. It autoplays before any user gesture,
// and no browser lets a page start audio before one — so every beat reads
// muted (the way mobile ad creatives are cut), and sound is a layer on top
// that joins whenever the page is allowed to make it:
//
//   • an embed that grants autoplay (the shared AudioContext comes up
//     `running`) hears the whole thing;
//   • otherwise the first tap anywhere resumes the context (useAssets arms
//     that listener) and every LATER cue is audible;
//   • a cue is NEVER scheduled on a suspended context — a source started there
//     is queued and they would all fire at once on resume — so a cue whose
//     moment passed while suspended is simply dropped.
//
// Every cue comes from the story's timed events (introStory.ts STORY_EVENTS).
// Samples go through the game's own `playSound` (SFX volume, platform mute,
// mobile mute). The synth cues (tick / thud / whoosh) derive their gain from
// the same volume and mute rule, and switch to their v2 recipe when
// audio/audioVersions.ts INTRO_CUE_VERSION says so. The tree-hit / tree-fall
// moments use the #Sound1 new slots when approved, else the match's own v1
// stand-ins. Skill SFX play from the skill layer (introSkills.ts), through
// the same gate.

import type { Ref } from 'vue'
import { getAudioContext, loadAudioBuffer, resourceCache } from '@/use/useAssets'
import { prependBaseUrl } from '@/utils/function'
import { INTRO_CUE_VERSION, newSlotOn, sfxPath, treeHitName } from '@/audio/audioVersions'
import { renderIntroCueV2 } from '@/audio/uiSfxV2'
import { STORY_EVENTS, type StoryEvent } from '@/use/introStory'

export type Cue =
  | { T: number; kind: 'sfx'; name: string; ratio: number }
  | { T: number; kind: 'tick'; pitch: number }
  | { T: number; kind: 'thud' }
  | { T: number; kind: 'whoosh'; gain: number }

export interface IntroAudio {
  /** Fire every cue in (prevT, T]. */
  update: (prevT: number, T: number) => void
  /** May a sound start right now (context running, not muted)? */
  canPlay: () => boolean
}

/** The tree-hit sound of the Thorn Volley rocket on the red tree. */
export const treeHitSfx = (): string => (newSlotOn('tree-hit') ? treeHitName(0) : 'clash-3')
/** The tree-fall sound of the Log Slam (a match plays celebration-1 in v1). */
export const treeFallSfx = (): string => (newSlotOn('tree-fall') ? 'tree-fall' : 'celebration-1')

/** The cues of one story event. */
export const cuesFor = (e: StoryEvent): Cue[] => {
  const T = e.T
  switch (e.kind) {
    case 'canopy':
      return [{ T, kind: 'whoosh', gain: 0.6 }]
    case 'treePop':
      return [{ T, kind: 'thud' }, { T: T + 0.02, kind: 'sfx', name: 'clash-1', ratio: 0.016 }]
    case 'thorns':
      return [{ T, kind: 'tick', pitch: 1250 }, { T: T + 0.07, kind: 'tick', pitch: 1500 }]
    case 'land':
      return [{ T, kind: 'tick', pitch: 560 + e.who * 120 }]
    case 'shieldAbsorb':
      return [{ T, kind: 'sfx', name: 'clash-2', ratio: 0.022 }]
    case 'rocketHit':
      return [{ T, kind: 'sfx', name: 'clash-4', ratio: 0.016 }]
    case 'rocketTree':
      return [{ T, kind: 'sfx', name: treeHitSfx(), ratio: 0.024 }]
    case 'launch':
      return [{ T, kind: 'whoosh', gain: 1 }]
    case 'slam':
      return [
        { T, kind: 'thud' },
        { T, kind: 'sfx', name: 'explosion-1', ratio: 0.022 },
        { T: T + 0.16, kind: 'sfx', name: treeFallSfx(), ratio: 0.03 }
      ]
    case 'logo':
      return [{ T, kind: 'sfx', name: 'level-up', ratio: 0.03 }]
    case 'stone':
      return [{ T, kind: 'tick', pitch: 520 + e.who * 150 }]
    case 'handoff':
      return [{ T, kind: 'sfx', name: 'happy', ratio: 0.016 }]
    default:
      return []
  }
}

/** Every cue of the film, in time order. */
export const INTRO_CUES: readonly Cue[] = STORY_EVENTS.flatMap(cuesFor).sort((a, b) => a.T - b.T)

/** Every sample the cutscene can play (decoded up front). */
export const introSfxNames = (): string[] =>
  [...new Set(INTRO_CUES.flatMap(c => (c.kind === 'sfx' ? [c.name] : [])))]

const sfxUrl = (name: string): string => prependBaseUrl(sfxPath(name))

export const createIntroAudio = (
  playSound: (name: string, ratio?: number) => unknown,
  soundVolume: Ref<number>,
  isMobileMuted: () => boolean
): IntroAudio => {
  let next = 0
  let lastTickAt = -1

  // Decode every sample up front through Web Audio. A sample that is not
  // decoded yet is SKIPPED rather than handed to playSound's HTMLAudio
  // fallback — the cutscene never creates a media element.
  for (const name of introSfxNames()) void loadAudioBuffer(sfxUrl(name))

  const running = (): AudioContext | null => {
    const ctx = getAudioContext()
    return ctx && ctx.state === 'running' ? ctx : null
  }

  const volume = (): number => (isMobileMuted() ? 0 : Math.max(0, Math.min(1, soundVolume.value ?? 0)))

  const tone = (
    ctx: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, peak: number
  ): void => {
    const g = Math.min(1, volume() * peak)
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

  const synth = (ctx: AudioContext, c: Exclude<Cue, { kind: 'sfx' }>): void => {
    if (INTRO_CUE_VERSION[c.kind] === 'v2') {
      try {
        renderIntroCueV2(ctx, ctx.destination, c.kind, volume(), ctx.currentTime, {
          gain: c.kind === 'whoosh' ? c.gain : 1,
          pitchHz: c.kind === 'tick' ? c.pitch : 1000
        })
      } catch { /* silent */
      }
      return
    }
    switch (c.kind) {
      case 'tick':
        tone(ctx, 'triangle', c.pitch, c.pitch * 0.92, 0.05, 0.06)
        break
      case 'thud':
        tone(ctx, 'sine', 110, 38, 0.42, 0.5)
        break
      case 'whoosh':
        tone(ctx, 'sawtooth', 90, 420, 0.36, 0.03 * c.gain)
        break
    }
  }

  const fire = (c: Cue): void => {
    const ctx = running()
    if (!ctx) return
    if (c.kind === 'sfx') {
      if (volume() > 0 && resourceCache.audioBuffers.has(sfxUrl(c.name))) playSound(c.name, c.ratio)
      return
    }
    if (c.kind === 'tick') {
      // never stack ticks on one frame
      if (c.T - lastTickAt < 0.03) return
      lastTickAt = c.T
    }
    synth(ctx, c)
  }

  return {
    update: (prevT: number, T: number) => {
      // A seek back: rewind the cursor (cues before T are never replayed).
      if (T < prevT) {
        next = 0
        while (next < INTRO_CUES.length && INTRO_CUES[next]!.T <= T) next++
        return
      }
      while (next < INTRO_CUES.length && INTRO_CUES[next]!.T <= T) {
        const c = INTRO_CUES[next]!
        // Play what is due; drop what was missed (never late, never stacked).
        if (c.T > prevT - 1e-6 && T - c.T < 0.25) fire(c)
        next++
      }
    },
    canPlay: () => running() !== null && volume() > 0
  }
}
