// Boss-trait SFX — playback throttle + lazy load (bosses-100-feature.md §7.3,
// work package BW4). Same rules as skills/skillSfx.ts.
//
// Four synthesised files (tools/sfx/skill-sfx.mjs --set boss → public/audio/sfx/):
//   boss-ember-pulse  Ember Nova release — low boom under a downward whoosh
//   boss-freeze       Frost Lock — ice crackling shut around a spinner
//   boss-crack        a refused freeze (the ice cracks off) / a thaw
//   boss-chill        one Frostbite stack — a short frosty tick
//
// Rules:
//   • One play per SFX name per BOSS_SFX_THROTTLE_MS (400 ms): Twin Pyres
//     release two novas on the same tick, a Warden ram can refuse a freeze
//     every contact (~6 per battle) — each is one sound, not a burst.
//   • At most BOSS_SFX_MAX_ACTIVE boss sounds overlap (clash and skill sounds
//     keep their own caps).
//   • Best-effort: a throwing / missing player never reaches the physics tick.
//   • Files are NOT in the core SFX tier: `requestBossTraitSfx` loads them
//     once per page, called from prepareBossTraitVfx — i.e. only when a match
//     whose roster carries a trait starts.

import useSounds, { type SoundHandle } from '@/use/useSound'
import { preloadSfxList } from '@/use/useAssets'

/** The four boss-trait files (never part of useAssets' SOUND_ASSETS). */
export const BOSS_TRAIT_SFX_ASSETS = [
  'audio/sfx/boss-ember-pulse.ogg',
  'audio/sfx/boss-freeze.ogg',
  'audio/sfx/boss-crack.ogg',
  'audio/sfx/boss-chill.ogg'
] as const

export const BOSS_SFX_THROTTLE_MS = 400
export const BOSS_SFX_MAX_ACTIVE = 3
/** Default volume ratio (clash is 0.025, skill sounds 0.02). */
export const BOSS_SFX_RATIO = 0.02

export type BossSfxName = 'boss-ember-pulse' | 'boss-freeze' | 'boss-crack' | 'boss-chill'

type Player = (name: string, ratio: number) => SoundHandle | null
type Loader = (list: readonly string[]) => unknown

let player: Player | null = null
const resolvePlayer = (): Player => (player ??= useSounds().playSound)

// Fixed keys → updating a slot never allocates.
const lastPlayedAt: Record<BossSfxName, number> = {
  'boss-ember-pulse': -Infinity,
  'boss-freeze': -Infinity,
  'boss-crack': -Infinity,
  'boss-chill': -Infinity
}
let active = 0
const release = (): void => {
  active = Math.max(0, active - 1)
}
const ONCE: AddEventListenerOptions = { once: true }

/**
 * Play a boss-trait SFX unless the same name played < 400 ms ago or the
 * overlap cap is reached. Returns whether a sound was started. `now` defaults
 * to performance.now() (audio is real time, also in PvP).
 */
export function playBossSfx(name: BossSfxName, ratio = BOSS_SFX_RATIO, now = performance.now()): boolean {
  if (now - lastPlayedAt[name] < BOSS_SFX_THROTTLE_MS) return false
  if (active >= BOSS_SFX_MAX_ACTIVE) return false
  lastPlayedAt[name] = now
  try {
    const h = resolvePlayer()(name, ratio)
    if (h) {
      active++
      h.addEventListener('ended', release, ONCE)
      h.addEventListener('error', release, ONCE)
    }
    return h !== null
  } catch {
    return false
  }
}

// ─── Lazy load ─────────────────────────────────────────────────────────────

const defaultLoader: Loader = list => {
  void preloadSfxList(list).catch(() => { /* best-effort */
  })
}
let loader: Loader = defaultLoader
let requested = false

/** A match with a boss trait is starting: decode the boss set (once per page). */
export function requestBossTraitSfx(): void {
  if (requested) return
  requested = true
  try {
    loader(BOSS_TRAIT_SFX_ASSETS)
  } catch { /* best-effort */
  }
}

/** Whether the boss set was requested on this page (tests / QA). */
export const bossTraitSfxRequested = (): boolean => requested

// ─── Test hooks ────────────────────────────────────────────────────────────

/** Tests / dev scene: replace the sound player (null = useSounds().playSound). */
export function __setBossSfxPlayer(p: Player | null): void {
  player = p
}

/** Tests: replace the asset loader (null = preloadSfxList). */
export function __setBossSfxLoader(l: Loader | null): void {
  loader = l ?? defaultLoader
}

/** Tests: clear throttle / overlap / request state. */
export function __resetBossSfx(): void {
  for (const k in lastPlayedAt) lastPlayedAt[k as BossSfxName] = -Infinity
  active = 0
  requested = false
}
