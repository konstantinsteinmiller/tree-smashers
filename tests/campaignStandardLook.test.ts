import { describe, it, expect } from 'vitest'
import { standardLook } from '@/use/useSpinnerCampaign'
import { stageEnemyConfigs } from '@/use/stageBladeConfig'
import { SKINS_PER_TOP } from '@/data/skinCatalog'
import { getStageById } from '@/use/useSpinnerCampaign'

describe('campaign enemies wear the standard painted skin', () => {
  it('maps any skin to its top\'s standard skin and keeps the original as fxSkin', () => {
    const b = standardLook({ topPartId: 'cushioned', bottomPartId: 'tanky', topLevel: 1, bottomLevel: 1, modelId: 'diamond' })
    expect(b.modelId).toBe(SKINS_PER_TOP.cushioned[0])
    expect(b.fxSkin).toBe('diamond')
  })
  it('leaves a standard skin untouched', () => {
    const b = { topPartId: 'star' as const, bottomPartId: 'speedy' as const, topLevel: 1, bottomLevel: 1, modelId: SKINS_PER_TOP.star[0] }
    expect(standardLook(b)).toBe(b)
  })
  it('every stage 1–100 enemy config shows a standard skin', () => {
    for (let id = 1; id <= 100; id++) {
      for (const c of stageEnemyConfigs(getStageById(id)!)) {
        if (c.modelId) expect(c.modelId).toBe(SKINS_PER_TOP[c.topPartId][0])
      }
    }
  })
})
