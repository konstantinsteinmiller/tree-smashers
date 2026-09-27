// BG skins — catalog shape, buy (coins/diamonds), ownership, equip gating.
// Module singletons persist across tests, so each case uses a distinct skin id.
//
// Prices are read from the catalog, not hardcoded: the lineup and its prices
// are game-economy content (retuned in 71d4197, and useCurrency derives
// DIAMOND_COIN_VALUE from them), so this suite pins the catalog's SHAPE and
// the purchase mechanics, not the numbers.

import { describe, it, expect, beforeEach } from 'vitest'
import useBgSkins, { BG_SKINS, DEFAULT_BG_SKIN_ID, getBgSkin } from '@/use/useBgSkins'
import useSpinnerConfig from '@/use/useSpinnerConfig'

const bg = useBgSkins()
const cfg = useSpinnerConfig()

const zeroBalances = () => {
  cfg.addCoins(-cfg.coins.value)
  cfg.addDiamonds(-cfg.diamonds.value)
}

describe('bg skin catalog', () => {
  const tier = (n: number) => BG_SKINS.filter(s => s.tier === n)

  it('has unique ids and exactly one free default skin', () => {
    expect(new Set(BG_SKINS.map(s => s.id)).size).toBe(BG_SKINS.length)
    expect(tier(0).map(s => s.id)).toEqual([DEFAULT_BG_SKIN_ID])
    expect(getBgSkin(DEFAULT_BG_SKIN_ID).coinCost).toBe(0)
    expect(getBgSkin(DEFAULT_BG_SKIN_ID).diamondCost).toBe(0)
  })

  it('every premium skin sits in tier 1-3 and is priced in both currencies', () => {
    for (const n of [1, 2, 3]) expect(tier(n).length).toBeGreaterThan(0)
    const premium = BG_SKINS.filter(s => s.tier !== 0)
    expect(premium.length).toBe(BG_SKINS.length - 1)
    for (const s of premium) {
      expect(Number.isInteger(s.coinCost) && s.coinCost > 0, `${s.id} coinCost`).toBe(true)
      expect(Number.isInteger(s.diamondCost) && s.diamondCost > 0, `${s.id} diamondCost`).toBe(true)
    }
  })

  it('a higher tier never costs less than a lower one', () => {
    for (const n of [1, 2]) {
      const maxCoins = Math.max(...tier(n).map(s => s.coinCost))
      const maxDiamonds = Math.max(...tier(n).map(s => s.diamondCost))
      for (const s of tier(n + 1)) {
        expect(s.coinCost, `${s.id} coins vs tier ${n}`).toBeGreaterThanOrEqual(maxCoins)
        expect(s.diamondCost, `${s.id} diamonds vs tier ${n}`).toBeGreaterThanOrEqual(maxDiamonds)
      }
    }
  })

  it('default skin is always owned', () => {
    expect(bg.isBgSkinOwned(DEFAULT_BG_SKIN_ID)).toBe(true)
  })
})

describe('bg skin purchase + equip', () => {
  beforeEach(zeroBalances)

  it('refuses a coin purchase when unaffordable', () => {
    cfg.addCoins(getBgSkin('circuit').coinCost - 1) // one coin short
    expect(bg.buyBgSkinWithCoins('circuit')).toBe(false)
    expect(bg.isBgSkinOwned('circuit')).toBe(false)
  })

  it('buys with coins: deducts, owns, and auto-equips', () => {
    cfg.addCoins(getBgSkin('aurora').coinCost + 5000)
    const before = cfg.coins.value
    expect(bg.buyBgSkinWithCoins('aurora')).toBe(true)
    expect(cfg.coins.value).toBe(before - getBgSkin('aurora').coinCost)
    expect(bg.isBgSkinOwned('aurora')).toBe(true)
    expect(bg.selectedBgSkinId.value).toBe('aurora')
  })

  it('buys with diamonds: deducts, owns, and auto-equips', () => {
    cfg.addDiamonds(getBgSkin('cosmos').diamondCost + 5)
    const before = cfg.diamonds.value
    expect(bg.buyBgSkinWithDiamonds('cosmos')).toBe(true)
    expect(cfg.diamonds.value).toBe(before - getBgSkin('cosmos').diamondCost)
    expect(bg.isBgSkinOwned('cosmos')).toBe(true)
    expect(bg.selectedBgSkinId.value).toBe('cosmos')
  })

  it('a second purchase of an owned skin is a no-op', () => {
    const funds = getBgSkin('aurora').coinCost + 5000
    cfg.addCoins(funds)
    // aurora was already bought above; buying again must fail (no double charge)
    expect(bg.buyBgSkinWithCoins('aurora')).toBe(false)
    expect(cfg.coins.value).toBe(funds)
  })

  it('selectBgSkin only equips OWNED skins', () => {
    bg.selectBgSkin(DEFAULT_BG_SKIN_ID)
    bg.selectBgSkin('prism') // never purchased → ignored
    expect(bg.selectedBgSkinId.value).toBe(DEFAULT_BG_SKIN_ID)
  })

  it('the free default cannot be "bought"', () => {
    cfg.addCoins(999999)
    expect(bg.buyBgSkinWithCoins(DEFAULT_BG_SKIN_ID)).toBe(false)
  })
})
