// ─── Win-screen "3x coins" rewarded ad ──────────────────────────────────────
//
// The ordinary (non-boss) win screen offers one rewarded ad that TRIPLES the
// coins that win paid. "3x" means 3x TOTAL: the base reward was already granted
// when the win screen opened, so a completed ad adds the base twice more
// (`winAdExtraCoins`) and the player ends on `winAdTotalCoins` = 3 × base.
//
// The base is never a hardcoded number — it is whatever that win screen
// granted: the fought stage's `rewardWin` (campaign), the ghost formula
// (leaderboard), the daily challenge's coin bonus, or the PvP purse. So the ad
// scales with the campaign exactly as the win reward does.
//
// Boss wins never offer it: they end on the boss roulette, which already has
// its own ad (the "Spin Again" respin) and pays up to 3x plus skins/jackpot.

/** The total multiple a completed ad leaves the player with. */
export const WIN_AD_MULTIPLIER = 3

const cleanBase = (base: number): number =>
  Number.isFinite(base) && base > 0 ? Math.round(base) : 0

/** Coins a completed ad ADDS on top of the already-granted base. */
export const winAdExtraCoins = (base: number): number =>
  cleanBase(base) * (WIN_AD_MULTIPLIER - 1)

/** What the win screen reads after a completed ad: base + extra = 3 × base. */
export const winAdTotalCoins = (base: number): number =>
  cleanBase(base) * WIN_AD_MULTIPLIER

export interface WinCoinsAdContext {
  /** Build-time `HAS_REWARDED_ADS`. */
  adsBuild: boolean
  result: 'win' | 'lose' | null | undefined
  /** A campaign win on a boss stage — the roulette path. */
  bossWin: boolean
  /** Coins the win screen granted. */
  baseCoins: number
}

/** Does this result screen carry the 3x button at all? (Readiness is a
 *  separate, per-tap gate: an unready ad disables the button, never hides it.) */
export const showsWinCoinsAd = (c: WinCoinsAdContext): boolean =>
  c.adsBuild && c.result === 'win' && !c.bossWin && cleanBase(c.baseCoins) > 0
