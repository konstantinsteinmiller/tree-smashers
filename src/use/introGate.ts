// ─── First-launch intro: who gets it ────────────────────────────────────────
//
// Pure module — no Vue, no storage access of its own, no I/O — so every rule
// here is unit-testable (tests/introGate.test.ts). `useIntroCutscene.ts` feeds
// it the live values.
//
// The cutscene is the strongest hook the game has for a STRANGER and the most
// annoying 14 seconds it could show somebody coming back. So the gate is the
// `casual-game-onboarding-player-optimization` rule, verbatim:
//
//   play  =  no seen-flag  AND  no saved progress  AND  the save read SETTLED
//
//   • LOCAL ONLY IS WRONG. CrazyGames and Playgama host the save in the cloud.
//     A returning player on a new device has an empty localStorage until the
//     hydrate lands, and must not be shown the intro in that window.
//   • UNSETTLED IS WRONG. While the hydrate is `pending` / `failed-retrying`
//     the answer is 'wait', never 'play'. A recovered hydrate re-asks (the
//     caller watches `saveDataVersion`), and a read that never settles runs
//     out the decision budget and becomes 'skip'.
//   • THROWN IS NOT EMPTY. A storage read that throws (blocked site data,
//     preview contexts) reports `null` — unknown — and unknown fails CLOSED:
//     the player is treated as returning. Missing the intro costs one
//     stranger 14 seconds of spectacle; showing it wrongly costs a regular.
//
// The seen-flag alone cannot carry this: every player who installed the game
// BEFORE the intro shipped has no flag. That is what the progress probe is
// for — it reads the keys a single played match leaves behind.

import type { HydrateState } from '@/utils/save/types'

/** The one key the intro writes. `smashers_`-prefixed on purpose: that prefix
 *  is cloud-save payload (SaveMergePolicy), so "seen" follows the player to a
 *  new device, and the full-progress reset's KEEP-list sweep deletes it, so a
 *  reset replays the intro. */
export const INTRO_SEEN_KEY = 'smashers_intro_seen'

/**
 * How long a still-unsettled save read may hold the decision open, measured
 * from the moment the arena is ready to show it. Past this the answer is
 * 'skip': an intro that starts twenty seconds after load, over a menu the
 * player is already looking at, is worse than none.
 */
export const INTRO_DECISION_BUDGET_MS = 6000

/** The three skins the cutscene draws. Named here (not in the renderer) so the
 *  asset loader can put them in the FIRST tier for a probable first-timer
 *  without importing the cutscene chunk. */
export const INTRO_SKIN_IDS = ['thunderstorm', 'tornado', 'diamond'] as const

export type IntroDecision = 'play' | 'skip' | 'wait'

export interface IntroGateInput {
  /** INTRO_SEEN_KEY is set. `null` = storage threw (unknown). */
  seen: boolean | null
  /** Any key a played match leaves behind is set. `null` = unknown. */
  hasProgress: boolean | null
  /** The save strategy's hydrate state (LocalStorageStrategy is always
   *  'success-with-data'). */
  hydrate: HydrateState
  /** The player just confirmed a full-progress reset. */
  replayRequested: boolean
  /** The player already started a fight this session — too late, never
   *  interrupt play with a cutscene. */
  battleStarted: boolean
  /** How long the decision has been waiting on an unsettled save read. */
  waitedMs: number
}

export const decideIntro = (i: IntroGateInput): IntroDecision => {
  if (i.battleStarted) return 'skip'
  // A reset is the player's own "start over" — the save read is irrelevant
  // (they just wiped it) and the seen flag was deleted by the same sweep.
  if (i.replayRequested) return 'play'
  // Seen, or could not tell → returning.
  if (i.seen !== false) return 'skip'
  if (i.hasProgress !== false) return 'skip'
  if (i.hydrate === 'success-with-data' || i.hydrate === 'success-empty') return 'play'
  // Retries exhausted: the local snapshot is all there will be, and a
  // returning player's cloud save may simply be unreachable. Fail closed.
  if (i.hydrate === 'failed-final') return 'skip'
  // 'pending' / 'failed-retrying': a cloud save may still arrive.
  return i.waitedMs >= INTRO_DECISION_BUDGET_MS ? 'skip' : 'wait'
}

type Getter = (key: string) => string | null

const int = (get: Getter, key: string): number => {
  const raw = get(key)
  if (raw === null || raw === '') return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

const present = (get: Getter, key: string): boolean => {
  const raw = get(key)
  return raw !== null && raw !== '' && raw !== '{}' && raw !== '[]' && raw !== 'null'
}

const nonEmptyJsonArray = (get: Getter, key: string): boolean => {
  const raw = get(key)
  if (!raw) return false
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) && v.length > 0
  } catch {
    return false
  }
}

/** True when any upgrade level in `smashers_upgrades` is above 0. */
const hasUpgrades = (get: Getter): boolean => {
  const raw = get('smashers_upgrades')
  if (!raw) return false
  try {
    const v = JSON.parse(raw) as { tops?: Record<string, number>; bottoms?: Record<string, number> }
    const levels = [...Object.values(v?.tops ?? {}), ...Object.values(v?.bottoms ?? {})]
    return levels.some(l => typeof l === 'number' && l > 0)
  } catch {
    // Unparseable but present — something wrote it; count it as progress.
    return true
  }
}

/**
 * Has this save ever been PLAYED?
 *
 * Every signal is a key a finished match (or a purchase, or a reward) writes.
 * A fresh boot writes only the three settings keys (volume ×2, difficulty —
 * measured on a fresh profile), none of which appear here, so booting the game
 * can never make a stranger look like a regular.
 *
 * Throws if the getter throws — the caller maps that to "unknown".
 */
export const hasSavedProgress = (get: Getter): boolean =>
  int(get, 'smashers_campaign_stage') > 1
  || int(get, 'smashers_player_max_stage') > 1
  || int(get, 'smashers_coins') > 0
  || int(get, 'smashers_diamonds') > 0
  || int(get, 'smashers_game_start_count') > 0
  || get('smashers_first_win') === '1'
  // Written on EVERY finished match, win or lose — the single best signal.
  || present(get, 'smashers_last_result')
  || hasUpgrades(get)
  || nonEmptyJsonArray(get, 'smashers_owned_skins')
  || nonEmptyJsonArray(get, 'smashers_bg_skins_owned')
  || present(get, 'smashers_battle_pass')
  || present(get, 'smashers_pvp_stats')
  || present(get, 'smashers_daily_rewards')
  || get('smashers_config_opened') === '1'
  || get('smashers_skin_chest_first_collected') === '1'

/** Read both flags through a getter that may throw. */
export const readIntroFlags = (get: Getter): { seen: boolean | null; hasProgress: boolean | null } => {
  try {
    return { seen: get(INTRO_SEEN_KEY) === '1', hasProgress: hasSavedProgress(get) }
  } catch {
    return { seen: null, hasProgress: null }
  }
}

/**
 * Cheap synchronous guess, BEFORE the save has settled: "would this player get
 * the intro if the cloud comes back empty?" Only used to warm the cutscene's
 * chunk and its three skins during the loader — a wrong 'yes' costs a few KB of
 * download, a wrong 'no' costs the intro a first-frame decode. Never gates play.
 */
export const isIntroLikely = (get: Getter): boolean => {
  const f = readIntroFlags(get)
  return f.seen === false && f.hasProgress === false
}
