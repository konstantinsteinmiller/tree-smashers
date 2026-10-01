// ─── localStorage key catalogue ─────────────────────────────────────────────
//
// Single source of truth for every player-progress key the game persists in
// localStorage. These literal strings are a contract with the player base —
// renaming any of them strands existing players' saves on the old key. Treat
// them as load-bearing constants.
//
// Composables that own each subsystem import the relevant key from here
// instead of redeclaring the literal string. SaveMergePolicy re-exports
// these as the `SAVE_KEYS` map (with stable shape) so existing strategy
// callers and tests don't need to change.

export const STAGE_KEY = 'spinner_campaign_stage'
export const COINS_KEY = 'spinner_coins'
/** Premium currency. Earned from the daily challenge and select Battle Pass
 *  stages; reserved for future high-value skins / IAP-alternative spending.
 *  The `spinner_` prefix opts it into the cloud-save payload (SaveMergePolicy),
 *  so diamonds sync across devices like coins. */
export const DIAMONDS_KEY = 'spinner_diamonds'
export const UPGRADES_KEY = 'spinner_upgrades'
export const SKINS_KEY = 'spinner_owned_skins'
/** Rewarded ads watched towards each ad-unlock skin (`AD_UNLOCK_SKINS`),
 *  `{ [modelId]: count }`. Rides the cloud save (`spinner_` prefix) and
 *  survives a progress reset like the skins it pays for. */
export const SKIN_AD_PROGRESS_KEY = 'spinner_skin_ad_progress'

// ─── Global leaderboard ─────────────────────────────────────────────────────
//
// All `spinner_`-prefixed, so they ride the cloud save: the same player on a
// second device must keep the SAME leaderboard row rather than opening a second
// one, and `POSTED_NAME_KEY` / `SUBMITTED_STAGE_KEY` travelling with them is
// what stops device B re-posting a score device A already posted.
//
// The board CACHE is deliberately not here — it is `chaosarena_board_cache`,
// outside `SaveMergePolicy.PAYLOAD_PREFIXES`, because it is ~6 kB of public
// data identical for every player and has no business in anyone's cloud blob.

/** The player's stable leaderboard id. Also mirrored to a standalone
 *  `chaosarena_uid` key OUTSIDE this prefix — see `usePlayerIdentity` for why a
 *  cloud hydrate must not be able to erase it. */
export const PLAYER_ID_KEY = 'spinner_player_id'
/** Tier 1 name: chosen by the player. Highest precedence, never overwritten. */
export const PLAYER_NAME_KEY = 'spinner_player_name'
/** Tier 2: the last name a platform SDK gave us (CrazyGames), REMEMBERED so an
 *  offline session does not flip the row back to a generated name. */
export const SDK_NAME_KEY = 'spinner_sdk_name'
/** Tier 3: the generated name, minted once and kept. */
export const ANON_NAME_KEY = 'spinner_anon_name'
/** The name the row currently carries on the server. A mismatch is what
 *  triggers the one relabel POST. */
export const POSTED_NAME_KEY = 'spinner_posted_name'
/** The best stage the server has ACCEPTED. The whole write rule is
 *  `stage > this`, so it may only be set after a confirmed 200. */
export const SUBMITTED_STAGE_KEY = 'spinner_submitted_stage'
/** The build the server last ACCEPTED for this row, `{ d: digest, at: ms }`.
 *  Drives the build-only refresh POST (at most one per 6 h, and only when the
 *  digest changed). Cloud-synced like its neighbours so a second device does
 *  not re-post the same build; deliberately NOT in KEEP_KEYS — after a reset
 *  the next report simply re-posts the current build. */
export const POSTED_BUILD_KEY = 'spinner_posted_build'

// ─── Skills (skills-feature.md §10.4) ──────────────────────────────────────
// Declared in the flag-boundary module `src/skills/skillKeys.ts` (so a
// skills-off build drops the strings); re-exported here for existing imports.
export { SKILLS_KEY, SKILL_LOADOUT_KEY, SKILL_UI_KEY } from '@/skills/skillKeys'
