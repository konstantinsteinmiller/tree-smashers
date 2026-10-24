// Skill SFX — playback throttle + gated preload (skills-feature.md §8.3, WP8).
//
// Four synthesised files (tools/sfx/skill-sfx.mjs → public/audio/sfx/):
//   skill-shield    Guard Shell absorb / break, Mirror Plate reflect, Phase Step
//   skill-rocket    Homing Rockets volley launch
//   skill-zap       Static Charge shock / stun, stun turn-skip
//   skill-drumroll  skills intro build-up; the HIT lands at DRUMROLL_HIT_MS
//   skill-crit     Lucky Edge crit / Opening Salvo — a wooden thwack + sparkle
//   skill-whoosh   Phase Step dodge — a soft airy swish
//   skill-boost    Momentum stack — a short rising blip
// Second Wind reuses the existing `level-up`.
//
// Smasher skills (smasherSkillArt.ts) pick one of these per skill and play it
// at their own playback rate, so each smasher has its own "voice".
//
// Rules:
//   • One play per SFX name per SKILL_SFX_THROTTLE_MS (400 ms) — a volley of
//     procs in one collision is one sound, not five.
//   • At most SKILL_SFX_MAX_ACTIVE skill sounds overlap (clash sounds keep
//     their own cap inside the engine).
//   • Everything is best-effort: a throwing / missing player never reaches the
//     physics tick.
//   • Files are NOT in the core SFX tier. `armSkillSfxPreload` (called from
//     useAssets' deferred tier) requests the battle set once a skill is owned
//     and the drum roll once the intro can come up.

import useSounds, { type SoundHandle } from '@/use/useSound'
import { preloadSfxList } from '@/use/useAssets'

// Skill SFX files — deferred tier, but GATED: never part of SOUND_ASSETS (and
// named nowhere outside the skill system, so a skills-off build ships none of
// these names). `useAssets.preloadDeferredAssets` arms `armSkillSfxPreload`
// through the skills gate; it requests the battle set only once the player
// owns a skill and the drum roll only once the skills intro can come up
// (stage 8+ teaser, or an intro still pending). A player who never reaches
// stage 8 downloads neither.
export const SKILL_BATTLE_SFX_ASSETS = [
  'audio/sfx/skill-shield.ogg',
  'audio/sfx/skill-rocket.ogg',
  'audio/sfx/skill-zap.ogg',
  'audio/sfx/skill-crit.ogg',
  'audio/sfx/skill-whoosh.ogg',
  'audio/sfx/skill-boost.ogg'
] as const
export const SKILL_INTRO_SFX_ASSETS = ['audio/sfx/skill-drumroll.ogg'] as const

export const SKILL_SFX_THROTTLE_MS = 400
export const SKILL_SFX_MAX_ACTIVE = 3
/** Default volume ratio (clash is 0.025; skill sounds sit just under it). */
export const SKILL_SFX_RATIO = 0.02
/** The drum-roll file's hit time — the intro's default build-up. */
export const DRUMROLL_HIT_MS = 1300
export const DRUMROLL_MIN_MS = 1200
export const DRUMROLL_MAX_MS = 1500

export type SkillSfxName =
  | 'skill-shield' | 'skill-rocket' | 'skill-zap' | 'skill-crit' | 'skill-whoosh' | 'skill-boost' | 'level-up'
export const SKILL_DRUMROLL_SFX = 'skill-drumroll'

type Player = (name: string, ratio: number, offsetSec?: number, rate?: number) => SoundHandle | null

let player: Player | null = null
const resolvePlayer = (): Player => (player ??= useSounds().playSound)

// Fixed keys → updating a slot never allocates.
const lastPlayedAt: Record<SkillSfxName, number> = {
  'skill-shield': -Infinity,
  'skill-rocket': -Infinity,
  'skill-zap': -Infinity,
  'skill-crit': -Infinity,
  'skill-whoosh': -Infinity,
  'skill-boost': -Infinity,
  'level-up': -Infinity
}
let activeSkillSounds = 0
const release = (): void => {
  activeSkillSounds = Math.max(0, activeSkillSounds - 1)
}
const ONCE: AddEventListenerOptions = { once: true }

/**
 * Play a skill SFX unless the same name played < 400 ms ago or the overlap cap
 * is reached. Returns whether a sound was started. `now` defaults to
 * performance.now() (wall clock: audio is real time even in PvP).
 */
export function playSkillSfx(name: SkillSfxName, ratio = SKILL_SFX_RATIO, now = performance.now(), rate = 1): boolean {
  if (now - lastPlayedAt[name] < SKILL_SFX_THROTTLE_MS) return false
  if (activeSkillSounds >= SKILL_SFX_MAX_ACTIVE) return false
  lastPlayedAt[name] = now
  try {
    const h = rate === 1 ? resolvePlayer()(name, ratio) : resolvePlayer()(name, ratio, 0, rate)
    if (h) {
      activeSkillSounds++
      h.addEventListener('ended', release, ONCE)
      h.addEventListener('error', release, ONCE)
    }
    return h !== null
  } catch {
    return false
  }
}

/**
 * Skills-intro drum roll, synced to the intro's `drumroll` event: `ms` is the
 * build-up (clamped 1200–1500). The file's hit sits at 1300 ms, so a shorter
 * build-up starts INTO the file and a longer one waits before starting —
 * either way the hit lands exactly when the panel opens, at native pitch.
 * Returns a cancel function (closing the intro early silences a pending start).
 */
export function playSkillDrumroll(ms: number = DRUMROLL_HIT_MS, ratio = 0.035): () => void {
  const build = Math.min(DRUMROLL_MAX_MS, Math.max(DRUMROLL_MIN_MS, Math.round(ms || DRUMROLL_HIT_MS)))
  const start = (): void => {
    try {
      resolvePlayer()(SKILL_DRUMROLL_SFX, ratio, Math.max(0, (DRUMROLL_HIT_MS - build) / 1000))
    } catch { /* best-effort */
    }
  }
  const wait = build - DRUMROLL_HIT_MS
  if (wait <= 0) {
    start()
    return () => {
    }
  }
  const timer = setTimeout(start, wait)
  return () => clearTimeout(timer)
}

// ─── Gated preload ─────────────────────────────────────────────────────────

export interface SkillSfxPreloader {
  /** Re-evaluate the gates and request whatever just became needed. */
  check(): void

  readonly battleRequested: boolean
  readonly introRequested: boolean
}

/**
 * Pure gate logic (unit-tested): the battle set is requested once `owned()`,
 * the drum roll once `introSoon()`; each at most once.
 */
export function createSkillSfxPreloader(
  load: (list: readonly string[]) => unknown,
  owned: () => boolean,
  introSoon: () => boolean
): SkillSfxPreloader {
  let battle = false
  let intro = false
  return {
    check() {
      if (!intro && introSoon()) {
        intro = true
        load(SKILL_INTRO_SFX_ASSETS)
      }
      if (!battle && owned()) {
        battle = true
        load(SKILL_BATTLE_SFX_ASSETS)
      }
    },
    get battleRequested() {
      return battle
    },
    get introRequested() {
      return intro
    }
  }
}

let armed: SkillSfxPreloader | null = null

/** Request the battle set (idempotent; deferred tier). Every smasher carries
 *  skills from level 1, so the set is always needed; the drum roll belonged to
 *  the retired skills intro and is never requested. */
export async function armSkillSfxPreload(): Promise<void> {
  if (armed) return
  const pre = createSkillSfxPreloader(
    list => {
      void preloadSfxList(list).catch(() => { /* best-effort */
      })
    },
    () => true,
    () => false
  )
  armed = pre
  pre.check()
}

let battleSetRequested = false

/** The battle set for a match whose OPPONENT carries skills (ghost / PvP)
 *  while the player owns none yet. Idempotent (the audio cache dedupes). */
export function requestSkillBattleSfx(): void {
  if (battleSetRequested) return
  battleSetRequested = true
  void preloadSfxList(SKILL_BATTLE_SFX_ASSETS).catch(() => { /* best-effort */
  })
}

// ─── Test hooks ────────────────────────────────────────────────────────────

/** Route skill SFX through another player (null = back to
 *  useSounds().playSound). The intro cutscene installs a gated one so a cue is
 *  never started on a suspended AudioContext (src/use/skills/introSkills.ts). */
export function setSkillSfxPlayer(p: Player | null): void {
  player = p
}

/** Tests: replace the sound player (null = back to useSounds().playSound). */
export function __setSkillSfxPlayer(p: Player | null): void {
  setSkillSfxPlayer(p)
}

/** Tests: clear throttle / overlap state. */
export function __resetSkillSfx(): void {
  for (const k in lastPlayedAt) lastPlayedAt[k as SkillSfxName] = -Infinity
  activeSkillSounds = 0
  armed = null
  battleSetRequested = false
}
