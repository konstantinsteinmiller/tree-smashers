// ─── League storage keys ────────────────────────────────────────────────────
//
// A flag-boundary module (src/league/ — never obfuscated, no imports), the
// league's twin of src/skills/skillKeys.ts: the key strings live HERE, not in
// the shared `src/keys.ts`, so a league-off build — where nothing reads them —
// drops them with the rest of the league. Shared code reaches them through
// `@/league/leagueGate` (which re-exports them), and every RUNTIME use outside
// src/league must sit behind `LEAGUE_BUILD` (KEEP_KEYS included:
// `...(LEAGUE_BUILD ? [LEAGUE_STATE_KEY] : [])`), else the literal ships in a
// league-off build and `scripts/feature-flag-audit.mjs --flag league` fails.

/** The player's league state (LG2, `LeagueStateV1`). `smashers_`-prefixed →
 *  part of the cloud payload; kept across a progress reset (KEEP_KEYS, F7).
 *  The gate reads ONE field of it, read-only: a top-level `unlocked: true`
 *  (see `leagueMountAllowed`). */
export const LEAGUE_STATE_KEY = 'smashers_league'
/** Device-only opponent-pool cache (LG1). Deliberately NOT `smashers_`-
 *  prefixed, so it never reaches the cloud payload. */
export const LEAGUE_POOL_KEY = 'treesmashers_league_pool'
/** Device-only: today's chosen three cards per fight index (LG3), so a live
 *  pool that changes during the day can never reroll them. Named after the
 *  pool cache so the flag audit's `treesmashers_league_pool` marker covers it. */
export const LEAGUE_PICKS_KEY = 'treesmashers_league_pool_picks'
