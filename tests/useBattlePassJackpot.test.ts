// Battle Pass jackpot stages (15/35/55) pay a fixed coin prize. They paid one
// diamond until 2026-10-21; diamonds are no battle-pass reward any more
// (owner), so the tier pays that diamond's value at the game's own exchange
// rate (useCurrency DIAMOND_COIN_VALUE) and never touches the diamond balance.

import { describe, expect, it } from 'vitest'
// useBattlePass pulls useModels, which forms a useMatch↔useModels↔useUser
// import cycle. The app boots cleanly because useUser evaluates first; mirror
// that load order here so useMatch finishes before useUser's module-init runs.
import '@/use/useUser'
import useBattlePass, { BP_JACKPOT_COINS, BP_JACKPOT_STAGES, bpIsJackpotStage } from '@/use/useBattlePass'
import { DIAMOND_COIN_VALUE } from '@/use/useCurrency'
import useSpinnerConfig from '@/use/useSpinnerConfig'

describe('Battle Pass jackpot stages', () => {
  it('marks 15/35/55 as jackpot stages (and others not)', () => {
    expect([...BP_JACKPOT_STAGES].sort((a, b) => a - b)).toEqual([15, 35, 55])
    expect(bpIsJackpotStage(15)).toBe(true)
    expect(bpIsJackpotStage(35)).toBe(true)
    expect(bpIsJackpotStage(55)).toBe(true)
    expect(bpIsJackpotStage(16)).toBe(false)
    expect(bpIsJackpotStage(10)).toBe(false) // skin stage, not jackpot
    expect(BP_JACKPOT_COINS).toBe(DIAMOND_COIN_VALUE)
  })

  it('claiming a jackpot stage grants its coins and no diamond', () => {
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
    expect(res).not.toHaveProperty('diamonds')
    expect(res!.coins).toBe(BP_JACKPOT_COINS)
    expect(res!.skin).toBeNull()

    expect(diamonds.value).toBe(diamondsBefore) // no diamond grant any more
    expect(coins.value).toBe(coinsBefore + BP_JACKPOT_COINS)
    expect(bp.isStageClaimed(15)).toBe(true)
  })
})
