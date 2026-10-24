// ─── Interstitial pacing + coin-badge chord: every knob in one place ───────
//
// Roadmap #UX100: interstitials paced by ACTIVE PLAYTIME instead of by battle
// count — the first one is eligible after 240 s of active play, then at most
// one per 121 s — plus a hidden chord (20 quick taps on the coin badge) that
// triggers one on demand.
//
// "Active playtime" (src/use/playtimeClock.ts): wall time the game is on screen
// and running — NOT while an ad is in flight, NOT while the platform has the
// game paused (portal overlay / pause event / ad pause edge) and NOT while the
// tab is hidden. Accumulated across sessions in the save (`smashers_*` keys,
// so it rides the cloud save on cloud builds).
//
// The COOLDOWN is measured on the same clock. Active time never runs faster
// than wall time, so 121 s of active play is always ≥ 121 s of wall time —
// above every portal SDK's own rate limit we know of (the Playgama Bridge is
// configured with `minimumDelayBetweenInterstitial: 120` in vite.config.ts) —
// and a player who left the tab for five minutes does not come back to an
// ad that "matured" while they were away.
//
// Build flags (base `.env` sets both; any `.env.<mode>[.local]` may opt out;
// UNSET means on; vite.config.ts rejects anything but "true"/"false"):
//   • VITE_APP_PLAYTIME_INTERSTITIALS — off: the pre-battle interstitial
//     falls back to the old battle-count cadence (midgameCadence.ts).
//   • VITE_APP_COIN_CHORD_INTERSTITIAL — off: the chord does nothing.
// A build with a child-directed ad posture gets neither (CHILD_DIRECTED_ADS).
// Builds without an interstitial-capable provider (Noop: itch, Glitch, GamePix, Y8, WaveDash,
// plain web; CrazyGames basic launch; a child-directed native build) never
// report `isInterstitialReady`, so both features are inert there regardless.

/**
 * Build-time: is this build's AD posture child-directed? Then neither feature
 * runs: the pre-battle interstitial keeps the old, sparser battle-count
 * cadence and the hidden chord (exactly what a child mashing the HUD would
 * hit) is off. Read exactly like LevelPlayProvider reads it on native (strict
 * unless explicitly "false"; such a build loads no interstitial unit at all).
 * Web portals never set a child-directed ad flag (owner decision 2026-10-02:
 * those flags are for Tauri / app-store builds only), so there it is only on
 * when a web build explicitly says "true". `VITE_APP_KIDS` is NOT the ad
 * posture — it is the league's offline mode, read only by the league gate.
 */
const CHILD_DIRECTED_ADS: boolean = import.meta.env.VITE_APP_NATIVE === 'true'
  ? import.meta.env.VITE_APP_ADS_CHILD_DIRECTED !== 'false'
  : import.meta.env.VITE_APP_ADS_CHILD_DIRECTED === 'true'

/** Pre-battle interstitials paced by active playtime (else: battle cadence). */
export const PLAYTIME_INTERSTITIALS_BUILD: boolean =
  !CHILD_DIRECTED_ADS && import.meta.env.VITE_APP_PLAYTIME_INTERSTITIALS !== 'false'

/** 20 quick taps on the coin badge trigger an interstitial. */
export const COIN_CHORD_INTERSTITIAL_BUILD: boolean =
  !CHILD_DIRECTED_ADS && import.meta.env.VITE_APP_COIN_CHORD_INTERSTITIAL !== 'false'

/** Active playtime before the FIRST playtime-paced interstitial (ms). */
export const INTERSTITIAL_FIRST_AFTER_MS = 240_000

/**
 * The first-eligible grace actually applied on this build. GameMonetize is the
 * one portal whose review WANTS an ad right after load (the first-load
 * interstitial, useFirstLoadInterstitial.ts) — there the grace is 0 and only
 * the cooldown paces the ads after it. Every other portal keeps the 240 s
 * ad-free opening (Poki playtests, CrazyGames and Playgama players: no early
 * ads).
 */
export const INTERSTITIAL_GRACE_MS: number =
  import.meta.env.VITE_APP_GAME_MONETIZE === 'true' ? 0 : INTERSTITIAL_FIRST_AFTER_MS

/** Minimum active playtime between two interstitials (ms). */
export const INTERSTITIAL_COOLDOWN_MS = 121_000

/** Taps on the coin badge that make the chord. */
export const COIN_CHORD_TAPS = 20

/** A longer pause than this between two badge taps starts the count again. */
export const COIN_CHORD_GAP_MS = 1_500

/** Playtime clock: sampling interval (ms). */
export const PLAYTIME_TICK_MS = 1_000

/**
 * Playtime clock: the most one tick may add (ms). A timer that comes back
 * late — background-tab throttling, a laptop waking from sleep, a debugger
 * pause — counts as one tick, not as the whole gap.
 */
export const PLAYTIME_MAX_TICK_DELTA_MS = 2_000

/**
 * Playtime clock: unsaved time is written to the save at least this often
 * (ms). It is also written at every interstitial check (each battle start)
 * and whenever the platform pauses the game, so a reload loses at most this
 * much. Kept coarse on purpose: every `smashers_*` write is a cloud-save
 * write on the cloud builds.
 */
export const PLAYTIME_PERSIST_EVERY_MS = 60_000

/** Save keys (payload prefix `smashers_` → part of the cloud save). */
export const PLAYTIME_KEY = 'smashers_ads_playtime_ms'
export const LAST_AD_BREAK_KEY = 'smashers_ads_last_break_playtime_ms'
