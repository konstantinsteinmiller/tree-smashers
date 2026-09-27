// ─── First-launch intro: the director ───────────────────────────────────────
//
// Maps DIRECTOR time T (what the viewer's clock shows — seconds since the
// cutscene started) onto SIM time S (how far the live fight simulation has
// run). The map is where the film grammar lives:
//
//   • hit-stop — S freezes for a few hundredths of a second at every hard
//     contact (0.22 s on the first KO, 0.30 s on the second), the fighting-game
//     trick that sells an impact as something that cost energy;
//   • slow motion — the final charge and KO play at 0.3×;
//   • everything after the fight (the fall, the hold, the reclaim beat) is
//     plain director time.
//
// The physics runs LIVE: the director steps the fight only as far as the
// current frame needs, and folds each contact it discovers into the map as a
// hit-stop. The map is piecewise-linear and only ever extended past the
// present, never rewritten behind it — so it is a PURE function of T, which is
// what makes every frame reproducible at any frame rate.
// tests/introTimeline.test.ts pins the beat times and the countdown curves;
// tests/introFight.test.ts plays it at 30/60/144 fps and on a throttled CPU.

import type { FightEvent, FightTrack, IntroFight } from '@/use/introFight'
import { BOSS, P1, FIGHT_HZ, FIGHT_SCRIPT } from '@/use/introFight'

// ─── The storyboard, after the fight (director seconds) ─────────────────────

/** Badges gather to centre stage after the last KO. */
export const GATHER_S = 0.5
/** The fall itself — both badges count down together and land on the same
 *  frame. */
export const FALL_S = 2.2
/** The hold at "1". The spec: 1.5 s. */
export const HOLD_S = 1.5
/** The level badge's exit (it shatters). */
export const BADGE_EXIT_S = 0.35
/** The "climb back" beat: boss silhouette as the goal, one line of copy. */
export const RECLAIM_S = 1.65
/** Crossfade into the live game at stage 1. */
export const OUTRO_S = 0.55

export const LEVEL_FROM = 30
export const STAGE_FROM = 50

/** When the skip affordance appears. */
export const SKIP_APPEARS_T = 1.8
/** A skip fades out over this long before handing over. */
export const SKIP_FADE_S = 0.3

/** Final slow-motion: from the second charge to shortly after the KO. */
const SLOW_SCALE = 0.3
const SLOW_AFTER_KO_S = 0.24

export interface DirectorBeats {
  /** The boss lands. */
  slamT: number
  koT: [number, number]
  /** The fight track has run out; the arena starts to dim. */
  battleEndT: number
  fallStartT: number
  landT: number
  holdEndT: number
  badgeGoneT: number
  reclaimT: number
  outroT: number
  endT: number
}

/** Placeholder for a beat that has not happened yet — far in the future, but
 *  finite, so every `ramp(T, a, b)` that reads it stays 0 instead of NaN. */
export const UNKNOWN_T = 1e6

export interface Director {
  /**
   * Sim time at director time T — and the LIVE part: if T needs sim time the
   * fight has not reached yet, this steps the physics forward (a few 240 Hz
   * steps per frame) and folds any contact it discovers into the time map
   * (a hit-stop) before answering. Frames arrive in order in the cutscene;
   * any order is still correct, just slower.
   */
  toS: (T: number) => number
  /** Director time at which sim time `s` is first reached (s already known). */
  toT: (s: number) => number
  /** Director time each KNOWN fight event fires (start of its hit-stop);
   *  grows with `track.events`. */
  eventT: number[]
  /** Length of each known event's hit-stop, director seconds (0 = none). */
  eventHold: number[]
  /** Beats; a beat that has not happened yet reads UNKNOWN_T. */
  beats: DirectorBeats
  /** Sim time the slow-motion window starts / ends (s1 is Infinity until the
   *  second KO has happened). */
  slow: { s0: number; s1: number; scale: number }
  /** Bumps whenever the time map gained events — consumers that derive data
   *  from the event list (sprites, cues) rebuild on a change. */
  readonly version: number
  /** Run the fight to its end now (tests, tools). */
  finish: () => void
}

/** Hit-stop length for one fight event. */
export const holdFor = (e: FightEvent, koIndex: number): number => {
  switch (e.kind) {
    case 'ko':
      return koIndex === 0 ? 0.22 : 0.3
    case 'slam':
      return 0.08
    case 'thunder':
      return 0.1
    case 'hit':
      if (e.b !== BOSS) return 0
      return e.power >= 600 ? 0.06 : e.power >= 300 ? 0.04 : 0
    case 'bumper':
      return e.a === BOSS ? 0 : 0.03
    case 'wall':
      return e.a === BOSS && e.power > 400 ? 0.05 : 0
    default:
      return 0
  }
}

/** The slow-motion window opens with the LAST scripted charge — a script
 *  time, so it is known before it happens. */
const lastChargeS = (): number => {
  let s = 0
  for (const c of FIGHT_SCRIPT) if (c.op === 'charge') s = Math.max(s, c.s)
  return s
}

const FIGHT_DT = 1 / FIGHT_HZ

/**
 * The live director. It never looks ahead of the physics: the time map is
 * rebuilt from the events discovered so far, and the physics is only ever
 * stepped as far as the current frame needs (plus two steps, so a contact is
 * known the instant before its hit-stop starts).
 */
export const createDirector = (fight: IntroFight): Director => {
  const track = fight.track
  const eventT: number[] = []
  const eventHold: number[] = []
  const slow = { s0: lastChargeS(), s1: Infinity, scale: SLOW_SCALE }
  const beats: DirectorBeats = {
    slamT: 0.55,
    koT: [UNKNOWN_T, UNKNOWN_T],
    battleEndT: UNKNOWN_T,
    fallStartT: UNKNOWN_T,
    landT: UNKNOWN_T,
    holdEndT: UNKNOWN_T,
    badgeGoneT: UNKNOWN_T,
    reclaimT: UNKNOWN_T,
    outroT: UNKNOWN_T,
    endT: UNKNOWN_T
  }
  /** The post-fight storyboard hangs off the fight's end. Before that is known
   *  it is laid out from UNKNOWN_T with the SAME offsets, so every ramp between
   *  two post-fight beats keeps a positive span (never a NaN, never a jump). */
  const layPostFight = (battleEndT: number): void => {
    beats.battleEndT = battleEndT
    beats.fallStartT = battleEndT + GATHER_S
    beats.landT = beats.fallStartT + FALL_S
    beats.holdEndT = beats.landT + HOLD_S
    beats.badgeGoneT = beats.holdEndT + BADGE_EXIT_S
    beats.reclaimT = beats.holdEndT + 0.1
    beats.outroT = beats.reclaimT + RECLAIM_S
    beats.endT = beats.outroT + OUTRO_S
  }
  layPostFight(UNKNOWN_T)
  // Segments: [T0, S0, rate]; rate 0 = a hit-stop.
  let segT: number[] = [0]
  let segS: number[] = [0]
  let segR: number[] = [1]
  let cursor = 0
  let version = 0
  let builtEvents = -1
  let builtDone = false

  const rateAt = (s: number): number => (s >= slow.s0 - 1e-9 && s < slow.s1 - 1e-9 ? slow.scale : 1)

  const toT = (s: number): number => {
    const n = segT.length
    for (let i = 0; i < n; i++) {
      const sNext = i + 1 < n ? segS[i + 1]! : Infinity
      if (segR[i]! === 0) {
        if (Math.abs(segS[i]! - s) < 1e-9) return segT[i]!
        continue
      }
      if (s >= segS[i]! - 1e-9 && s < sNext + 1e-9) return segT[i]! + (s - segS[i]!) / segR[i]!
    }
    return segT[n - 1]!
  }

  /** Rebuild the time map from every event known so far. Allocates — but only
   *  when the fight has produced something new, never per frame. */
  const rebuild = (): void => {
    const events = track.events
    const n = events.length
    const holdAt = new Map<number, number>()
    let koIndex = 0
    eventHold.length = n
    for (let i = 0; i < n; i++) {
      const e = events[i]!
      const h = holdFor(e, e.kind === 'ko' ? koIndex++ : 0)
      eventHold[i] = h
      if (h > 0) holdAt.set(e.s, Math.max(holdAt.get(e.s) ?? 0, h))
    }
    slow.s1 = track.koS[1] >= 0 ? track.koS[1] + SLOW_AFTER_KO_S : Infinity
    const endS = track.done ? track.endS : Infinity
    const points = new Set<number>([slow.s0])
    if (Number.isFinite(slow.s1)) points.add(slow.s1)
    if (Number.isFinite(endS)) points.add(endS)
    for (const s of holdAt.keys()) points.add(s)
    const sorted = [...points].filter(s => s >= 0 && s <= endS).sort((a, b) => a - b)

    const nT: number[] = []
    const nS: number[] = []
    const nR: number[] = []
    let T = 0
    let S = 0
    for (const p of sorted) {
      if (p > S) {
        const r = rateAt(S)
        nT.push(T)
        nS.push(S)
        nR.push(r)
        T += (p - S) / r
        S = p
      }
      const h = holdAt.get(p)
      if (h) {
        nT.push(T)
        nS.push(S)
        nR.push(0)
        T += h
      }
    }
    // Open end: past the last known point the map runs on at the rate it is
    // in (and, once the track is done, at 1× — the sim clamps, time goes on).
    nT.push(T)
    nS.push(S)
    nR.push(track.done ? 1 : rateAt(S))
    segT = nT
    segS = nS
    segR = nR
    cursor = 0

    eventT.length = n
    for (let i = 0; i < n; i++) eventT[i] = toT(events[i]!.s)

    beats.slamT = toT(0.55)
    for (let i = 0; i < n; i++) {
      const e = events[i]!
      if (e.kind === 'ko') beats.koT[e.a === P1 ? 0 : 1] = eventT[i]!
    }
    if (track.done) layPostFight(T)
    builtEvents = n
    builtDone = track.done
    version++
  }

  const mapT = (t: number): number => {
    if (t <= 0) return 0
    const n = segT.length
    if (cursor >= n || segT[cursor]! > t) cursor = 0
    while (cursor + 1 < n && segT[cursor + 1]! <= t) cursor++
    return segS[cursor]! + (t - segT[cursor]!) * segR[cursor]!
  }

  const toS = (t: number): number => {
    for (; ;) {
      if (track.events.length !== builtEvents || track.done !== builtDone) rebuild()
      const s = mapT(t)
      if (track.done) return s > track.endS ? track.endS : s
      // Known up to the last simulated step. Need two steps of margin so a
      // contact is known before the frame that would render past it.
      const horizon = (track.steps - 1) * FIGHT_DT
      if (s <= horizon - FIGHT_DT) return s
      fight.stepTo(s + 2 * FIGHT_DT)
      if (track.events.length === builtEvents && track.done === builtDone) {
        // Nothing new: the map is unchanged and now covers s.
        return s
      }
    }
  }

  rebuild()

  return {
    toS,
    toT,
    eventT,
    eventHold,
    beats,
    slow,
    get version() {
      return version
    },
    finish: () => {
      fight.stepTo(Infinity)
      rebuild()
    }
  }
}

/** A director over a fight that has already been run to its end (tests,
 *  tools). Same time map the live one converges to. */
export const buildDirector = (track: FightTrack): Director => {
  const d = createDirector({
    track, stepTo: () => {
    }
  })
  d.finish()
  return d
}

// ─── The fall: "falling down the ladder" ────────────────────────────────────
//
// Both counters run on the SAME gravity curve — the count fallen grows with
// u², like distance under constant acceleration — so both start slow (each
// early number gets a readable beat), accelerate into a blur, and hit "1" on
// exactly the same frame: landT. That shared landing is the emotional beat.

/** 0..1 through the fall at director time T. */
export const fallU = (T: number, fallStartT: number, fallS: number = FALL_S): number => {
  if (T <= fallStartT) return 0
  if (T >= fallStartT + fallS) return 1
  return (T - fallStartT) / fallS
}

/** The number showing at fall progress `u`, counting from `from` down to 1. */
export const countAt = (from: number, u: number): number => {
  if (u <= 0) return from
  if (u >= 1) return 1
  return Math.max(1, from - Math.floor((from - 1) * u * u + 1e-9))
}

/**
 * Director time of the k-th decrement (k = 1 … from−1): the moment the number
 * `from − k + 1` peels off and `from − k` shows. The inverse of `countAt`.
 */
export const stepTime = (k: number, from: number, fallStartT: number, fallS: number = FALL_S): number =>
  fallStartT + fallS * Math.sqrt(k / (from - 1))

/** Level on the spinner's badge at T (30 through the fight, then the fall). */
export const levelAt = (T: number, b: DirectorBeats): number =>
  countAt(LEVEL_FROM, fallU(T, b.fallStartT))

/** Stage on the stage badge at T (50 through the fight, then the fall). */
export const stageAt = (T: number, b: DirectorBeats): number =>
  countAt(STAGE_FROM, fallU(T, b.fallStartT))

/** Is the level badge on screen at T? It survives the fall and the 1.5 s hold
 *  at "1", then shatters. */
export const levelBadgeVisible = (T: number, b: DirectorBeats): boolean => T < b.badgeGoneT

// ─── Small easing kit (shared by the renderer) ──────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
export const easeOutCubic = (u: number): number => 1 - Math.pow(1 - clamp01(u), 3)
export const easeInCubic = (u: number): number => Math.pow(clamp01(u), 3)
export const easeInOutCubic = (u: number): number => {
  const x = clamp01(u)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
export const easeOutBack = (u: number, k = 1.70158): number => {
  const x = clamp01(u) - 1
  return 1 + (k + 1) * x * x * x + k * x * x
}
/** 0 → 1 over [a, b]. */
export const ramp = (T: number, a: number, b: number): number => clamp01((T - a) / (b - a))
/** 0 → 1 → 0: rises over [a, a+up], holds, falls over [b-down, b]. */
export const envelope = (T: number, a: number, up: number, b: number, down: number): number =>
  Math.min(ramp(T, a, a + up), 1 - ramp(T, b - down, b))
