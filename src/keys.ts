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
export const UPGRADES_KEY = 'spinner_upgrades'
export const SKINS_KEY = 'spinner_owned_skins'
