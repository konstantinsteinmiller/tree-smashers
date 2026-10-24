import { describe, expect, it } from 'vitest'
import { SMASHER_IDS, SMASHERS } from '@/data/smasherCatalog'
import { SMASHER_SKINS, SMASHER_SKIN_COIN_COST, SMASHER_SKIN_IDS, isSmasherSkin, smasherOfSkinId, smasherSkinIdOf } from '@/data/smasherSkinCatalog'
import { SPINNER_MODEL_IDS, isAdUnlockSkin, isCoinPurchasable, skinCost, type SpinnerModelId } from '@/data/skinCatalog'
import { smasherPalette } from '@/smashers/smasherSkins'
import { SIGNATURE_PALETTES } from '@/smashers/smasherRig'

describe('one own skin per smasher', () => {
  it('every smasher has exactly one skin id, a kind and a placeholder theme', () => {
    expect(SMASHER_SKIN_IDS.length).toBe(SMASHER_IDS.length)
    for (const id of SMASHER_IDS) {
      expect(SMASHER_SKIN_IDS).toContain(smasherSkinIdOf(id))
      expect(['cocky', 'funny', 'elemental']).toContain(SMASHER_SKINS[id]?.kind)
      expect(smasherOfSkinId(smasherSkinIdOf(id))).toBe(id)
    }
    for (const s of SMASHER_SKIN_IDS) expect((SPINNER_MODEL_IDS as readonly string[]).includes(s)).toBe(true)
  })
  it('1000 coins without rewarded ads, one ad with them', () => {
    const id = smasherSkinIdOf('bramble') as SpinnerModelId
    expect(skinCost(id)).toBe(SMASHER_SKIN_COIN_COST)
    expect(SMASHER_SKIN_COIN_COST).toBe(1000)
    expect(isAdUnlockSkin(id, true)).toBe(true)
    expect(isCoinPurchasable(id, false)).toBe(true)
    expect(isCoinPurchasable(id, true)).toBe(false)
  })
  it('wears its own colourway; another smasher\'s skin is just the signature look', () => {
    expect(isSmasherSkin('bramble-skin')).toBe(true)
    const own = smasherPalette('bramble', 'bramble-skin')
    expect(own.fur).not.toBe(SIGNATURE_PALETTES.bramble.fur)
    expect(smasherPalette('brock', 'bramble-skin')).toEqual(SIGNATURE_PALETTES.brock)
    expect(SMASHERS.bramble).toBeTruthy()
  })
})
