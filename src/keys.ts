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

export const STAGE_KEY = 'smashers_campaign_stage'
export const COINS_KEY = 'smashers_coins'
/** Premium currency. Earned from select Battle Pass
 *  stages; reserved for future high-value skins / IAP-alternative spending.
 *  The `smashers_` prefix opts it into the cloud-save payload (SaveMergePolicy),
 *  so diamonds sync across devices like coins. */
export const DIAMONDS_KEY = 'smashers_diamonds'
export const UPGRADES_KEY = 'smashers_upgrades'
/** Smasher roster: `{ "lv": { [smasherId]: level } }` (levels ≥ 1; a smasher
 *  missing from the map is level 1). Weighed by the save merge like upgrades. */
export const ROSTER_KEY = 'smashers_roster'
export const SKINS_KEY = 'smashers_owned_skins'
/** Rewarded ads watched towards each ad-unlock skin (`AD_UNLOCK_SKINS`),
 *  `{ [modelId]: count }`. Rides the cloud save (`smashers_` prefix) and
 *  survives a progress reset like the skins it pays for. */
export const SKIN_AD_PROGRESS_KEY = 'smashers_skin_ad_progress'
/** Premium (legendary, Tuskar onwards) smashers the player has UNLOCKED
 *  (src/use/premiumSmashers.ts): `{ "v": 1, "own": [smasherId…], "at": stage }`
 *  — `at` is the best stage the record has accounted for (grandfathering of
 *  saves from before the rule). Rides the cloud save (`smashers_` prefix) and
 *  survives a progress reset like the skins: an ad / coins paid for it. */
export const PREMIUM_SMASHERS_KEY = 'smashers_premium_smashers'
/** VS screens already shown (src/use/vsIntro.ts, "once per matchup"):
 *  `{ "stage": highest campaign stage with its VS, "opp": [ghost / league
 *  opponent ids] }`. Rides the cloud save (`smashers_` prefix); a progress
 *  reset clears it with the campaign. */
export const VS_SEEN_KEY = 'smashers_vs_seen'

// ─── Global leaderboard ─────────────────────────────────────────────────────
//
// All `smashers_`-prefixed, so they ride the cloud save: the same player on a
// second device must keep the SAME leaderboard row rather than opening a second
// one, and `POSTED_NAME_KEY` / `SUBMITTED_STAGE_KEY` travelling with them is
// what stops device B re-posting a score device A already posted.
//
// The board CACHE is deliberately not here — it is `treesmashers_board_cache`,
// outside `SaveMergePolicy.PAYLOAD_PREFIXES`, because it is ~6 kB of public
// data identical for every player and has no business in anyone's cloud blob.

/** The player's stable leaderboard id. Also mirrored to a standalone
 *  `treesmashers_uid` key OUTSIDE this prefix — see `usePlayerIdentity` for why a
 *  cloud hydrate must not be able to erase it. */
export const PLAYER_ID_KEY = 'smashers_player_id'
/** Tier 1 name: chosen by the player. Highest precedence, never overwritten. */
export const PLAYER_NAME_KEY = 'smashers_player_name'
/** Tier 2: the last name a platform SDK gave us (CrazyGames), REMEMBERED so an
 *  offline session does not flip the row back to a generated name. */
export const SDK_NAME_KEY = 'smashers_sdk_name'
/** Tier 3: the generated name, minted once and kept. */
export const ANON_NAME_KEY = 'smashers_anon_name'
/** The name the row currently carries on the server. A mismatch is what
 *  triggers the one relabel POST. */
export const POSTED_NAME_KEY = 'smashers_posted_name'
/** The best stage the server has ACCEPTED. The whole write rule is
 *  `stage > this`, so it may only be set after a confirmed 200. */
export const SUBMITTED_STAGE_KEY = 'smashers_submitted_stage'
/** The build the server last ACCEPTED for this row, `{ d: digest, at: ms }`.
 *  Drives the build-only refresh POST (at most one per 6 h, and only when the
 *  digest changed). Cloud-synced like its neighbours so a second device does
 *  not re-post the same build; deliberately NOT in KEEP_KEYS — after a reset
 *  the next report simply re-posts the current build. */
export const POSTED_BUILD_KEY = 'smashers_posted_build'


// ─── Team size (src/data/teamSize.ts) ───────────────────────────────────────
//
// All `smashers_`-prefixed (cloud save) and all PROGRESS: a progress reset
// wipes them, so a fresh start fights with one smasher again. The team picks
// themselves stay in `smashers_player_team` (kept across a reset).

/** The team size the player chose in the team modal (1 … 3). Absent = never
 *  chosen: the game fields 2 once slot 2 is open, else 1. */
export const TEAM_SIZE_KEY = 'smashers_team_size'
/** High-water mark of the team slots opened (1 … 3). Also derived from the
 *  best stage reached, so a pre-team-size save gets its slots on first load. */
export const TEAM_SLOTS_KEY = 'smashers_team_slots'
/** Team slots the player has seen in the team modal — a newly opened slot
 *  badges the Team button until the modal is opened. */
export const TEAM_SLOTS_SEEN_KEY = 'smashers_team_slots_seen'
