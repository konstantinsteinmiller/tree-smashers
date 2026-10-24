// ─── Premium (legendary) smashers: the explicit unlock ──────────────────────
//
// Owner rule (2026-10-21): "The legendary smashers from Tuskar onwards need to
// be unlocked with a rewarded ad button (the usual 'MovieIcon Unlock' like for
// the skins, a coin price as fallback if no rewarded ads are supported)."
//
// "From Tuskar onwards" = every smasher at or after Tuskar in the UNLOCK ORDER.
// The unlock order is the catalog order (`SMASHER_IDS`), which is sorted by
// `unlockStage` (pinned by tests/premiumSmashers.test.ts): Tuskar is the 12th
// base smasher (stage 50), then batch A (56 … 112), batch B (120 … 175) and
// batch C (180 … 235) — 37 smashers. Hootsie (stage 40) is "legendary" by its
// card edge too (`smasherRarity` > 30) but sits BEFORE Tuskar, so it keeps the
// old rule: recruited by reaching its stage.
//
// For a premium smasher, reaching `unlockStage` only makes it UNLOCKABLE; it
// joins the roster once the player has unlocked it — with ONE completed
// rewarded ad on a build that serves rewarded ads, or for
// `premiumSmasherCoinPrice` coins where none can be shown (a build without
// rewarded ads, or an ad blocker detected at runtime). Ownership lives in
// `smashers_premium_smashers` (src/use/premiumSmashers.ts); a save that already
// had these smashers under the old rule keeps them (grandfathered there).
//
// Pure data — no Vue, no storage.

import { RELEASED_SMASHER_IDS, SMASHER_IDS, SMASHERS, type SmasherId } from '@/data/smasherCatalog'

/** The first premium smasher in the unlock order. */
export const FIRST_PREMIUM_SMASHER: SmasherId = 'tuskar'

/** Every premium smasher, in unlock order (Tuskar … Blubbo). */
export const PREMIUM_SMASHER_IDS: readonly SmasherId[] = Object.freeze(
  SMASHER_IDS.slice(SMASHER_IDS.indexOf(FIRST_PREMIUM_SMASHER))
)

const PREMIUM_SET: ReadonlySet<string> = new Set<string>(PREMIUM_SMASHER_IDS)

/** The premium smashers this release offers to unlock (release gate,
 *  src/data/smasherCatalog.ts): Tuskar … Gastro by default. The held-back
 *  ones stay premium (a grandfathered save keeps owning them) but are never
 *  offered. */
export const RELEASED_PREMIUM_SMASHER_IDS: readonly SmasherId[] = Object.freeze(
  PREMIUM_SMASHER_IDS.filter(id => RELEASED_SMASHER_IDS.includes(id))
)

/** True for a smasher that needs the explicit unlock (ad or coins). */
export const isPremiumSmasher = (id: string): boolean => PREMIUM_SET.has(id)

/** Completed rewarded ads that unlock one premium smasher. */
export const PREMIUM_SMASHER_UNLOCK_ADS = 1

// ─── Coin fallback price ────────────────────────────────────────────────────
//
// Only charged where no rewarded ad can be shown. Anchored on the coin
// economy of the balance sim (tests/balance.sim.test.ts `campLevels`, the
// income model of tools/skills-sim/econ.mjs: every win, expected losses, boss
// roulette EV, one rewarded ad + one big chest per three stages, daily
// rewards). Measured with that model (2026-10-21):
//
//   banked by stage   50: 31k · 112: 118k · 120: 123k · 200: 257k · 235: 293k
//   per stage         ≈ 1.0k at 50 · 1.1–1.9k at 56–100 · 0.6–2.0k at 100–235
//   between two premium unlocks (4–11 stages): ≈ 4k–13k
//
// One premium smasher costs about one such gap's income — a real save-up
// (the player skips roughly one gap of level-ups for it), never a wall, and
// rising with the stage so it keeps pace with income:
//
//   price(stage) = round500(PRICE_BASE + PRICE_PER_STAGE × stage)
//
// → Tuskar (50) 6 000 · Brock (56) 6 500 · Gastro (112) 10 000 ·
//   Humphrey (120) 10 500 · Rumble (175) 14 000 · Waddles (180) 14 500 ·
//   Blubbo (235) 18 000 (the full list is pinned in tests/premiumSmashers.test.ts).
// For scale: the special skins cost 1 500, the 2026-09 expansion skins 4 500
// on a no-ad build; levelling ONE smasher 1 → 10 costs ≈ 2.9k, 1 → 20 ≈ 12k.
export const PREMIUM_PRICE_BASE = 3000
export const PREMIUM_PRICE_PER_STAGE = 64

const round500 = (n: number): number => Math.round(n / 500) * 500

/** Coin price of a premium smasher on a build / session without rewarded ads
 *  (null for a smasher that is not premium). */
export const premiumSmasherCoinPrice = (id: SmasherId): number | null =>
  isPremiumSmasher(id) ? round500(PREMIUM_PRICE_BASE + PREMIUM_PRICE_PER_STAGE * SMASHERS[id].unlockStage) : null
