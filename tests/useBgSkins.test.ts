// BG skins — catalog shape, buy (coins/diamonds), ownership, equip gating.
// Module singletons persist across tests, so each case uses a distinct skin id.

import { describe, it, expect, beforeEach } from 'vitest'
import useBgSkins, { BG_SKINS, DEFAULT_BG_SKIN_ID } from '@/use/useBgSkins'
import useSpinnerConfig from '@/use/useSpinnerConfig'

const bg = useBgSkins()
const cfg = useSpinnerConfig()

const zeroBalances = () => {
  cfg.addCoins(-cfg.coins.value)
  cfg.addDiamonds(-cfg.diamonds.value)
}

describe('bg skin catalog', () => {
  it('has the default + 6 premium skins across 3 tiers with the right prices', () => {
    expect(BG_SKINS.length).toBe(7)
    const tier = (n: number) => BG_SKINS.filter(s => s.tier === n)
    expect(tier(0).length).toBe(1) // free default
    expect(tier(1).length).toBe(2)
    expect(tier(2).length).toBe(2)
    expect(tier(3).length).toBe(2)
    expect(tier(1).every(s => s.coinCost === 15000 && s.diamondCost === 10)).toBe(true)
    expect(tier(2).every(s => s.coinCost === 30000 && s.diamondCost === 20)).toBe(true)
    expect(tier(3).every(s => s.coinCost === 100000 && s.diamondCost === 75)).toBe(true)
  })

  it('default skin is always owned', () => {
    expect(bg.isBgSkinOwned(DEFAULT_BG_SKIN_ID)).toBe(true)
  })
})

describe('bg skin purchase + equip', () => {
  beforeEach(zeroBalances)

  it('refuses a coin purchase when unaffordable', () => {
    cfg.addCoins(100)
    expect(bg.buyBgSkinWithCoins('circuit')).toBe(false)
    expect(bg.isBgSkinOwned('circuit')).toBe(false)
  })

  it('buys with coins: deducts, owns, and auto-equips', () => {
    cfg.addCoins(20000)
    const before = cfg.coins.value
    expect(bg.buyBgSkinWithCoins('aurora')).toBe(true)
    expect(cfg.coins.value).toBe(before - 15000)
    expect(bg.isBgSkinOwned('aurora')).toBe(true)
    expect(bg.selectedBgSkinId.value).toBe('aurora')
  })

  it('buys with diamonds: deducts, owns, and auto-equips', () => {
    cfg.addDiamonds(100)
    const before = cfg.diamonds.value
    expect(bg.buyBgSkinWithDiamonds('cosmos')).toBe(true)
    expect(cfg.diamonds.value).toBe(before - 75)
    expect(bg.isBgSkinOwned('cosmos')).toBe(true)
    expect(bg.selectedBgSkinId.value).toBe('cosmos')
  })

  it('a second purchase of an owned skin is a no-op', () => {
    cfg.addCoins(20000)
    // aurora was already bought above; buying again must fail (no double charge)
    expect(bg.buyBgSkinWithCoins('aurora')).toBe(false)
    expect(cfg.coins.value).toBe(20000)
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
