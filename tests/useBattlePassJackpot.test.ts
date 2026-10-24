// Phase 7 — Battle Pass diamond stages (15/35/55) pay a diamond, not coins.

import { describe, expect, it } from 'vitest'
// useBattlePass pulls useModels, which forms a useMatch↔useModels↔useUser
// import cycle. The app boots cleanly because useUser evaluates first; mirror
// that load order here so useMatch finishes before useUser's module-init runs.
import '@/use/useUser'
import useBattlePass, { BP_DIAMOND_STAGES, bpIsDiamondStage } from '@/use/useBattlePass'
import useSpinnerConfig from '@/use/useSpinnerConfig'

describe('Battle Pass diamond stages', () => {
  it('marks 15/35/55 as diamond stages (and others not)', () => {
    expect([...BP_DIAMOND_STAGES].sort((a, b) => a - b)).toEqual([15, 35, 55])
    expect(bpIsDiamondStage(15)).toBe(true)
    expect(bpIsDiamondStage(35)).toBe(true)
    expect(bpIsDiamondStage(55)).toBe(true)
    expect(bpIsDiamondStage(16)).toBe(false)
    expect(bpIsDiamondStage(10)).toBe(false) // skin stage, not diamond
  })

  it('claiming a diamond stage grants 1 diamond and no coins', () => {
    const bp = useBattlePass()
    const { diamonds, coins } = useSpinnerConfig()

    // Unlock through stage 15 by banking XP (50 xp per win → 30 wins = 1500 xp
    // = 15 stages).
    for (let i = 0; i < 30; i++) bp.awardCampaignWin()
    expect(bp.unlockedStages.value).toBeGreaterThanOrEqual(15)

    const diamondsBefore = diamonds.value
    const coinsBefore = coins.value

    const res = bp.claimStage(15)
    expect(res).not.toBeNull()
    expect(res!.diamonds).toBe(1)
    expect(res!.coins).toBe(0)
    expect(res!.skin).toBeNull()

    expect(diamonds.value).toBe(diamondsBefore + 1)
    expect(coins.value).toBe(coinsBefore) // diamond stage pays NO coins
    expect(bp.isStageClaimed(15)).toBe(true)
  })
})
