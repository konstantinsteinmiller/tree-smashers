// ─── League flag boundary (VITE_APP_FEATURE_LEAGUE, opt-in) ─────────────────
//
// The ONE module that reads the league build flags — VITE_APP_FEATURE_LEAGUE,
// VITE_APP_LEAGUE_UNLOCK_STAGE and VITE_APP_KIDS — and the ONE place the
// league enters the module graph from the outside. Mirrors
// src/skills/skillsGate.ts and src/bosses/bosses100Gate.ts:
//
//   • every league surface / module is reached through a handle exported
//     here, each `LEAGUE_BUILD ? <lazy import> : null`, so on a league-off
//     build the `import()` is never emitted and no League* chunk exists;
//   • `vite.config.ts` keeps all of src/league/ out of obfuscation (the
//     obfuscator rewrites `import()` specifiers into lookups Rollup can no
//     longer resolve, and an obfuscated module can never be tree-shaken —
//     its string-array bootstrap is a top-level side effect);
//   • 'true' / 'false' are reserved strings in the obfuscator options, so the
//     `LEAGUE_BUILD && …` guards in OBFUSCATED consumers fold as well
//     (league plan F1).
//
// Rules (tests/leagueFlagBoundary.test.ts):
//   1. Only this file reads the three env literals above.
//   2. Nothing in src/league/ has a runtime `import()` except this file.
//   3. Code outside src/league/ imports league modules only through this gate
//      (type-only imports are fine).
//   4. Worker-shared league modules (leagueMath, leagueNpc — bundled into
//      worker/ as well) use relative imports only and never read
//      `import.meta.env` (F5).
//   5. Consumers render a handle with `component(v-if="X" :is="X")`, call the
//      loaders through the Promise they return (null when off), and call the
//      arena bridge's members in BRACKET form (`bridge?.['createLeagueBattle']`),
//      each name listed in the obfuscator's reservedStrings — a dotted call
//      becomes an obfuscator-made string-array literal that outlives the
//      folded call on a league-off build.
//
// FILLING THE HANDLES (LG1…LG6): edit ONLY this file. Replace a `null` below
// with `LEAGUE_BUILD ? defineAsyncComponent(() => import('@/…')) : null` (or
// the loader's `LEAGUE_BUILD ? import('@/…') : Promise.resolve(null)`). Keep
// the exported names and types — consumers are written against them.
//
// Allowed residue on a league-off build: `league.*` translations inside the
// lazy per-locale chunks (shared by every build; league plan O9).

import { defineAsyncComponent, type Component } from 'vue'
import { leaderboardAuthorized } from '@/use/useLiveLeaderboard'
import { LEAGUE_POOL_KEY, LEAGUE_STATE_KEY } from '@/league/leagueKeys'

export { LEAGUE_POOL_KEY, LEAGUE_STATE_KEY }

/** Build-time league switch. Folded to a literal in every build. */
export const LEAGUE_BUILD: boolean = import.meta.env.VITE_APP_FEATURE_LEAGUE === 'true'

/** Child-directed build (Tauri, GameDistribution — O5): league offline-only
 *  with generated opponent names. Not league-specific, but read here only. */
export const LEAGUE_KIDS: boolean = import.meta.env.VITE_APP_KIDS === 'true'

/** Default unlock stage for platform builds (dev builds set 1). */
const DEFAULT_UNLOCK_STAGE = 13

/** Campaign stage at which the league unlocks (`VITE_APP_LEAGUE_UNLOCK_STAGE`,
 *  a positive integer — vite.config asserts it; anything else falls back to
 *  13 here too). */
export const LEAGUE_UNLOCK_STAGE: number = (() => {
  const n = Number(import.meta.env.VITE_APP_LEAGUE_UNLOCK_STAGE)
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_UNLOCK_STAGE
})()

/** Does this build talk to the leaderboard Worker at all? Same expression as
 *  `useLiveLeaderboard`'s LIVE (Poki / YouTube ship an empty URL). */
const LEADERBOARD_LIVE: boolean = (import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/+$/, '').length > 0

/** Ranked, server-backed league: a league build with a live endpoint that is
 *  not child-directed. False → offline league (baked pool + generator, local
 *  LP only) — Poki, YouTube, kids builds (O3/O5). */
export const LEAGUE_ONLINE: boolean = LEAGUE_BUILD && LEADERBOARD_LIVE && !LEAGUE_KIDS

// ─── UI handles (null on a league-off build; LG5b) ───────────────────────────
//
// Each is its own lazy chunk (src/league/ui/*). Contracts (props / events) are
// documented in each component's header; LG6 mounts them with
// `component(v-if="X" :is="X")`.

/** HUD entry button. Props `league`, `championPosition?`; emits `open`. */
export const LeagueHudButtonUi: Component | null = LEAGUE_BUILD
  ? defineAsyncComponent(() => import('@/league/ui/LeagueHudButton.vue'))
  : null
/** League hub (modal): standing, season timer, fights + ad top-up, opponent
 *  cards / gatekeeper, season top list. v-model; props `league`, `loadDeck`,
 *  `fetchTop?`; emits `fight`, `fights-granted`, `season-claimed`. */
export const LeagueHubUi: Component | null = LEAGUE_BUILD
  ? defineAsyncComponent(() => import('@/league/ui/LeagueHub.vue'))
  : null
/** Result-screen league panel (LP delta, promotion / demotion, coins). Prop `outcome`. */
export const LeagueResultPanelUi: Component | null = LEAGUE_BUILD
  ? defineAsyncComponent(() => import('@/league/ui/LeagueResultPanel.vue'))
  : null
/** First-unlock popup (shown by LG6). v-model; emits `enter`. */
export const LeagueUnlockPopupUi: Component | null = LEAGUE_BUILD
  ? defineAsyncComponent(() => import('@/league/ui/LeagueUnlockPopup.vue'))
  : null
/** End-of-season reward (the hub hosts it too). v-model; prop `reward`; emits `claim`. */
export const LeagueSeasonRewardModalUi: Component | null = LEAGUE_BUILD
  ? defineAsyncComponent(() => import('@/league/ui/LeagueSeasonRewardModal.vue'))
  : null

// ─── Module loaders (resolve null on a league-off build) ────────────────────

/** The league API (state, fights, unlock, seasons — LG2; see useLeague.ts). */
export type LeagueApi = ReturnType<typeof import('@/league/useLeague').default>
/** SpinnerArena's league glue (createLeagueBattle / finishLeagueBattle, LG6 —
 *  see leagueArenaBridge.ts). Call its members in bracket form (rule 5). */
export type LeagueBridge = typeof import('@/league/leagueArenaBridge')

let leagueApiLoad: Promise<LeagueApi | null> | null = null

/** The league API (a singleton — every call resolves the same object); null
 *  when off. On a league build the first call also catches the stored unlock
 *  up with the campaign stage. */
export const loadLeague = (): Promise<LeagueApi | null> =>
  LEAGUE_BUILD
    ? (leagueApiLoad ??= import('@/league/useLeague').then(m => m.default(), (e: unknown) => {
        leagueApiLoad = null // a failed chunk load may be retried
        throw e
      }))
    : Promise.resolve(null)

/** The arena bridge; null when off. Call its members in bracket form (rule 5). */
export const loadLeagueBridge = (): Promise<LeagueBridge | null> =>
  LEAGUE_BUILD ? import('@/league/leagueArenaBridge') : Promise.resolve(null)

// ─── Mount gate ─────────────────────────────────────────────────────────────

/** Read-only peek at the stored unlock (`LeagueStateV1.unlocked === true`):
 *  the league stays unlocked after a progress reset (LD5) even though the
 *  stage drops back below the unlock. Never writes, never throws. */
const storedUnlocked = (): boolean => {
  try {
    const raw = localStorage.getItem(LEAGUE_STATE_KEY)
    if (raw === null) return false
    const state = JSON.parse(raw) as { unlocked?: unknown } | null
    return state !== null && typeof state === 'object' && state.unlocked === true
  } catch {
    return false
  }
}

/**
 * Is this player's ACCOUNT allowed into the league at all? False on a
 * league-off build and for a CrazyGames guest (the leaderboard account gate —
 * LD4). The league state module gates every write on it: a player who is not
 * allowed in gets no `spinner_league` key at all (no unlock catch-up, no
 * rollover write, nothing kept across a reset); signing in later computes the
 * unlock from the stage as normal. Reactive in the account gate (reads
 * `leaderboardAuthorized.value`), so it can be watched.
 */
export const leagueAccountAllowed = (): boolean => {
  if (!LEAGUE_BUILD) return false
  return leaderboardAuthorized.value
}

/**
 * May the league show up at all for this player right now (HUD button, hub,
 * result panel)? False on every league-off build, for a CrazyGames guest (the
 * leaderboard account gate — LD4: guests get NO league, not an offline one),
 * and below the unlock stage unless the stored state says it was unlocked.
 *
 * Reactive in the account gate (reads `leaderboardAuthorized.value`); pass the
 * stage from a ref inside a computed so stage changes propagate too.
 */
export const leagueMountAllowed = (stage: number): boolean => {
  if (!LEAGUE_BUILD) return false
  if (!leagueAccountAllowed()) return false
  return stage >= LEAGUE_UNLOCK_STAGE || storedUnlocked()
}
