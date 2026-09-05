// ─── Currency model ─────────────────────────────────────────────────────────
//
// chaos-arena normally runs a two-currency economy: coins (soft, earned from
// battles) and diamonds (premium, earned rarely and sold for real money in
// `InAppPurchaseShop.vue`).
//
// **Poki forbids both halves of that.** Their monetization policy is explicit:
// no in-app purchases, and "one simple, understandable currency" — a
// soft+premium economy has to collapse to one. So on a Poki build every
// diamond in the game becomes coins, at a fixed rate, and the diamond UI is
// replaced with the coin equivalent rather than hidden (a reward the player
// can see but not understand is worse than one denominated in the currency
// they already use).
//
// ─── Why 3000 ───────────────────────────────────────────────────────────────
//
// Not a guess — the game already publishes an exchange rate. Every background
// skin in `useBgSkins.ts` carries BOTH a coin and a diamond price:
//
//     aurora   15 000 coins  or   5 diamonds   → 3 000
//     nebula   30 000 coins  or  10 diamonds   → 3 000
//     circuit  50 000 coins  or  10 diamonds   → 5 000
//     cosmos  100 000 coins  or  10 diamonds   → 10 000
//     prism   100 000 coins  or  15 diamonds   → ~6 667
//
// The cheapest tier is the honest floor: converting at 3 000 means a diamond
// reward is never worth LESS than what the shop itself already offers for one.
// Taking a higher rate would inflate the economy relative to prices the player
// can compare against in the same session.
//
// For scale, campaign stages pay 100–3 500 coins (median ~660), so on Poki:
//
//     daily-challenge diamond   →   3 000 coins  (~4–5 stage wins)
//     battle-pass diamond stage →   3 000 coins
//     roulette 5-diamond jackpot→  15 000 coins  (~23 stage wins)
//
// which reads as a jackpot without breaking the curve.
//
// This module is a LEAF on purpose — no `useSpinnerConfig` import, no Vue
// state. `useSpinnerConfig` imports it, so a dependency the other way would
// close a cycle in a graph that already has a documented one
// (useSound ↔ useUser ↔ useMatch).

/**
 * True on builds that must present a single currency. Poki today; any portal
 * with the same policy joins the `||`.
 *
 * An `import.meta.env` literal so Rollup can fold the branches — the
 * two-currency code paths disappear from the Poki bundle entirely, and the
 * conversion disappears from everyone else's.
 */
export const isSingleCurrency = import.meta.env.VITE_APP_POKI === 'true'

/** Coins per diamond. See the derivation above before changing it. */
export const DIAMOND_COIN_VALUE = 3000

/** Convert a diamond amount to its coin equivalent. Rounds toward zero so a
 *  fractional diamond can never mint coins out of nothing. */
export const diamondsToCoins = (diamonds: number): number =>
  Math.trunc(diamonds * DIAMOND_COIN_VALUE)

/**
 * What a diamond-denominated reward should actually SAY, per build.
 *
 * Call sites that render "+1 💎" ask this instead of branching themselves, so
 * the coin/diamond decision lives in one place and every surface stays in
 * step. Returns the currency to draw and the amount to print.
 */
export const displayDiamondReward = (
  diamonds: number
): { currency: 'coins' | 'diamonds', amount: number } =>
  isSingleCurrency
    ? { currency: 'coins', amount: diamondsToCoins(diamonds) }
    : { currency: 'diamonds', amount: diamonds }
