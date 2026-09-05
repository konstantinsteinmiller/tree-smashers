// ─── Stage-anchored coin rewards ────────────────────────────────────────────
//
// The rewarded-ad button and the treasure chest used to pay flat amounts (125,
// and 25/100) while the campaign's loss reward grows without bound — stages
// past 100 auto-generate with an ever-increasing multiplier. Past stage ~40 the
// ad button was offering LESS than the consolation prize for losing the fight
// the player was already in, which is the point at which "watch an ad" stops
// being a decision at all.
//
// These cases pin the properties that make the fix a fix, rather than just a
// bigger number:
//
//   • the ad always beats losing, at every stage, forever;
//   • the early game is not nerfed (the old flat values are floors);
//   • the chest keeps its 4:1 ratio and its "patience pays slightly better"
//     gradient, which is the thing that makes it a return hook.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { STAGE_KEY } from '@/keys'

/** `currentStageId` is initialised from localStorage at module scope, so the
 *  stage has to be set BEFORE the module graph loads. */
const loadAtStage = async (stage: number) => {
  localStorage.setItem(STAGE_KEY, String(stage))
  vi.resetModules()
  // `useUser` first — the useMatch <-> useModels <-> useUser cycle throws if a
  // campaign/config module is imported cold. Known repo gotcha.
  await import('@/use/useUser')
  const rewards = await import('@/use/useStageRewards')
  const { default: useSpinnerCampaign } = await import('@/use/useSpinnerCampaign')
  const { currentStage } = useSpinnerCampaign()
  return { ...rewards, loss: currentStage.value.rewardLose }
}

beforeEach(() => localStorage.clear())

describe('rewarded-ad payout', () => {
  it('is never worse than losing the stage the player is standing in', async () => {
    // THE bug this exists to prevent. A flat 125 crossed below the loss reward
    // around stage 40 and kept falling.
    for (const stage of [1, 3, 10, 25, 40, 50, 75, 100, 150, 300]) {
      const { rewardedAdCoins, loss } = await loadAtStage(stage)
      expect(
        rewardedAdCoins.value,
        `stage ${stage}: ad pays ${rewardedAdCoins.value} vs ${loss} for losing`
      ).toBeGreaterThanOrEqual(loss * 3)
    }
  })

  it('holds the 3x multiple once past the floor', async () => {
    const { rewardedAdCoins, loss, AD_LOSS_MULTIPLE } = await loadAtStage(51)
    expect(rewardedAdCoins.value).toBe(Math.round((loss * AD_LOSS_MULTIPLE) / 5) * 5)
    expect(rewardedAdCoins.value / loss).toBeCloseTo(3, 1)
  })

  it('does not nerf the early game — the old flat value is a floor', async () => {
    const { rewardedAdCoins, AD_MIN_COINS } = await loadAtStage(3)
    expect(rewardedAdCoins.value).toBe(AD_MIN_COINS)
  })

  it('keeps scaling into the endless cycles past stage 100', async () => {
    // Compare the SAME base slot across cycles (21 / 121 / 221), not two
    // arbitrary stages — the source curve is deliberately jagged (bosses spike,
    // stages 20-100 are reward-trimmed), so a naive stage-100-vs-220 comparison
    // measures the boss, not the cycle multiplier.
    const c0 = await loadAtStage(21)
    const c1 = await loadAtStage(121)
    const c2 = await loadAtStage(221)
    expect(c1.rewardedAdCoins.value).toBeGreaterThan(c0.rewardedAdCoins.value)
    expect(c2.rewardedAdCoins.value).toBeGreaterThan(c1.rewardedAdCoins.value)
  })

  it('tracks a boss stage up, and back down after it', async () => {
    // Bosses are NOT smoothed: `currentStage` returns the boss, so its higher
    // loss reward lifts the offer for exactly as long as the player is standing
    // in front of it. Documented in `useStageRewards`; asserted here so a
    // future "let's smooth this" edit is a decision rather than an accident.
    const before = await loadAtStage(99)
    const boss = await loadAtStage(100)
    const after = await loadAtStage(101)
    expect(boss.rewardedAdCoins.value).toBeGreaterThan(before.rewardedAdCoins.value)
    expect(after.rewardedAdCoins.value).toBeLessThan(boss.rewardedAdCoins.value)
  })
})

describe('treasure chest', () => {
  it('scales both tiers with the campaign', async () => {
    const early = await loadAtStage(3)
    const late = await loadAtStage(100)
    expect(late.chestBigCoins.value).toBeGreaterThan(early.chestBigCoins.value * 10)
    expect(late.chestSmallCoins.value).toBeGreaterThan(early.chestSmallCoins.value * 10)
  })

  it('preserves the documented 4:1 big:small ratio', async () => {
    for (const stage of [25, 51, 100, 200]) {
      const { chestBigCoins, chestSmallCoins } = await loadAtStage(stage)
      expect(
        chestBigCoins.value / chestSmallCoins.value,
        `stage ${stage}`
      ).toBeCloseTo(4, 1)
    }
  })

  it('keeps patience paying slightly better than sniping', async () => {
    // The gradient the component is built around: small unlocks at 3 min, big
    // at 10. Big must stay the better coins-per-minute or the chest becomes a
    // skip-click button and stops being a return hook.
    for (const stage of [3, 51, 100]) {
      const { chestSmallCoins, chestBigCoins } = await loadAtStage(stage)
      const smallPerMin = chestSmallCoins.value / 3
      const bigPerMin = chestBigCoins.value / 10
      expect(bigPerMin, `stage ${stage}`).toBeGreaterThan(smallPerMin)
    }
  })

  it('does not nerf the early game — old flat values are floors', async () => {
    const { chestSmallCoins, chestBigCoins, CHEST_SMALL_MIN_COINS, CHEST_BIG_MIN_COINS } =
      await loadAtStage(1)
    expect(chestSmallCoins.value).toBe(CHEST_SMALL_MIN_COINS)
    expect(chestBigCoins.value).toBe(CHEST_BIG_MIN_COINS)
  })
})

describe('the rewarded ad stays the best offer in the game', () => {
  it('matches the big chest per collect but is far better per minute', async () => {
    // Same multiple, wildly different friction: the ad is repeatable on a
    // 30-second cooldown, the chest on a 10-minute one. That ordering is
    // deliberate — the rewarded ad is the monetised action.
    const { rewardedAdCoins, chestBigCoins } = await loadAtStage(51)
    expect(rewardedAdCoins.value).toBe(chestBigCoins.value)
    const adPerMin = rewardedAdCoins.value / 0.5
    const chestPerMin = chestBigCoins.value / 10
    expect(adPerMin).toBeGreaterThan(chestPerMin * 10)
  })
})

describe('amounts are readable', () => {
  it('rounds to a multiple of 5 at every stage', async () => {
    for (const stage of [7, 23, 51, 88, 137]) {
      const { rewardedAdCoins, chestSmallCoins, chestBigCoins } = await loadAtStage(stage)
      for (const v of [rewardedAdCoins.value, chestSmallCoins.value, chestBigCoins.value]) {
        expect(v % 5, `stage ${stage}: ${v}`).toBe(0)
      }
    }
  })
})
