// ─── Single-currency (Poki) economy ─────────────────────────────────────────
//
// Poki's monetization policy allows exactly ONE currency and forbids in-app
// purchases, so the Poki build collapses tree-smashers's coins+diamonds economy
// into coins at a fixed rate. This spec pins the two halves that can break
// silently:
//
//   1. the RATE and its derivation — the game publishes its own exchange rate
//      through dual-priced background skins, and a drifting constant would
//      quietly make diamond rewards worth less than what the shop offers;
//   2. the SEAM — `addDiamonds` is the single point every grant flows through
//      (battle-pass tier, roulette jackpot, rewarded ad, dev
//      cheat), and a future placement that reaches for `diamonds.value`
//      directly would bypass the collapse without any test noticing.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { BG_SKINS } from '@/use/useBgSkins'

const loadCurrency = async () => {
  vi.resetModules()
  return import('@/use/useCurrency')
}

afterEach(() => vi.unstubAllEnvs())

describe('currency model', () => {
  it('is two-currency by default', async () => {
    const { isSingleCurrency } = await loadCurrency()
    expect(isSingleCurrency).toBe(false)
  })

  it('is single-currency on a Poki build', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const { isSingleCurrency } = await loadCurrency()
    expect(isSingleCurrency).toBe(true)
  })

  it('converts at the rate the game already publishes for its cheapest skin', async () => {
    // Not an arbitrary constant: every background skin carries BOTH a coin and
    // a diamond price, so the game states its own exchange rate. Converting at
    // the CHEAPEST tier's rate guarantees a diamond reward is never worth less
    // than what the shop sells one for. If someone re-prices the skins, this
    // fails and the rate gets revisited deliberately.
    const { DIAMOND_COIN_VALUE } = await loadCurrency()
    const priced = BG_SKINS.filter(s => s.diamondCost > 0 && s.coinCost > 0)
    expect(priced.length).toBeGreaterThan(0)
    const cheapestRate = Math.min(...priced.map(s => s.coinCost / s.diamondCost))
    expect(DIAMOND_COIN_VALUE).toBe(cheapestRate)
  })

  it('never mints coins from a fractional diamond', async () => {
    const { diamondsToCoins, DIAMOND_COIN_VALUE } = await loadCurrency()
    expect(diamondsToCoins(1)).toBe(DIAMOND_COIN_VALUE)
    expect(diamondsToCoins(5)).toBe(DIAMOND_COIN_VALUE * 5)
    expect(diamondsToCoins(0)).toBe(0)
    expect(diamondsToCoins(0.9)).toBeLessThan(DIAMOND_COIN_VALUE)
    // Spends convert too, so a diamond-priced item stays buyable.
    expect(diamondsToCoins(-5)).toBe(DIAMOND_COIN_VALUE * -5)
  })

  describe('displayDiamondReward', () => {
    it('keeps diamonds on a normal build', async () => {
      const { displayDiamondReward } = await loadCurrency()
      expect(displayDiamondReward(5)).toEqual({ currency: 'diamonds', amount: 5 })
    })

    it('reports coins, already converted, on a Poki build', async () => {
      vi.stubEnv('VITE_APP_POKI', 'true')
      const { displayDiamondReward, DIAMOND_COIN_VALUE } = await loadCurrency()
      expect(displayDiamondReward(5)).toEqual({
        currency: 'coins',
        amount: DIAMOND_COIN_VALUE * 5
      })
    })
  })
})

describe('addDiamonds is the single seam every grant flows through', () => {
  const loadConfig = async () => {
    vi.resetModules()
    // `useUser` first — the useMatch <-> useModels <-> useUser cycle throws if
    // useSpinnerConfig is imported cold. Known repo gotcha.
    await import('@/use/useUser')
    return import('@/use/useSpinnerConfig')
  }

  it('credits diamonds on a normal build', async () => {
    localStorage.clear()
    const { default: useSpinnerConfig } = await loadConfig()
    const { diamonds, coins, addDiamonds } = useSpinnerConfig()
    const coinsBefore = coins.value
    const diamondsBefore = diamonds.value
    addDiamonds(5)
    expect(diamonds.value).toBe(diamondsBefore + 5)
    expect(coins.value).toBe(coinsBefore)
  })

  it('credits COINS and never touches the diamond balance on a Poki build', async () => {
    localStorage.clear()
    vi.stubEnv('VITE_APP_POKI', 'true')
    const { default: useSpinnerConfig } = await loadConfig()
    const { DIAMOND_COIN_VALUE } = await import('@/use/useCurrency')
    const { diamonds, coins, addDiamonds } = useSpinnerConfig()
    const coinsBefore = coins.value
    const diamondsBefore = diamonds.value

    addDiamonds(5)   // the roulette jackpot
    addDiamonds(1)   // a battle-pass tier

    expect(coins.value).toBe(coinsBefore + DIAMOND_COIN_VALUE * 6)
    expect(diamonds.value).toBe(diamondsBefore)
  })

  it('does not let a spend drive coins negative on a Poki build', async () => {
    localStorage.clear()
    vi.stubEnv('VITE_APP_POKI', 'true')
    const { default: useSpinnerConfig } = await loadConfig()
    const { coins, addDiamonds } = useSpinnerConfig()
    // `useBgSkins` checks affordability BEFORE calling, so this is the
    // belt-and-braces case: a spend the caller should have refused.
    addDiamonds(-100)
    expect(coins.value).toBeGreaterThanOrEqual(0)
  })
})
