import { describe, expect, it } from 'vitest'
import { propTurn } from '@/use/arenaBackdrop'
import { PROP_KINDS } from '@/use/arenaProps'

// Owner 2026-10-23: flowers and trees are never rotated (the old regex matched "flowers");
// stones / gravestones / honeycombs only mirror; only flat cracks and rifts turn freely.
describe('backdrop prop rotation policy', () => {
  it('never turns or mirrors flowers, trees, bushes', () => {
    for (const id of ['flowers', 'sunflowers', 'oak', 'blossom', 'fir', 'spruce', 'birch', 'snowFir', 'deadTree', 'bush', 'fern', 'blueberry']) {
      expect(propTurn(id), id).toBe('fixed')
    }
  })
  it('turns flat rifts and cracks freely', () => {
    for (const id of ['rift', 'riftSmall', 'ruinsRift', 'ashCrack', 'cooledFlow']) expect(propTurn(id), id).toBe('free')
  })
  it('only mirrors stones, gravestones and honeycombs', () => {
    for (const id of ['stones', 'boulder', 'gravePaw', 'graveHeart', 'beehive', 'honeyPot']) expect(propTurn(id), id).toBe('flip')
  })
  it('every prop kind has a decided policy that is never "free" unless it is a flat crack', () => {
    for (const k of PROP_KINDS) {
      if (propTurn(k.id) === 'free') expect(k.decal, k.id).toBe(true)
    }
  })
})
