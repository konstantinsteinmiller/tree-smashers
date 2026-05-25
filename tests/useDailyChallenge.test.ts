// Phase 6 — daily challenge generation + first-win-pays reward gating.

import { describe, expect, it } from 'vitest'
import useDailyChallenge, { MAX_DAILY_ATTEMPTS } from '@/use/useDailyChallenge'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { NON_CIRCLE_SHAPES } from '@/use/arenaShapes'

const SOLO_ABILITIES = ['ghost', 'split', 'child-emitter', 'stat-switch', 'life-leech', 'thunder']

describe('daily challenge generation', () => {
  const { generateChallenge } = useDailyChallenge()
  const { upgradeTop, upgradeBottom, playerUpgrades } = useSpinnerCampaign()

  it('matches enemy upgrade levels to the player\'s highest top/bottom levels', () => {
    // Raise the player's star (top) to 4 and tanky (bottom) to 3.
    upgradeTop('star')
    upgradeTop('star')
    upgradeTop('star')
    upgradeTop('star')
    upgradeBottom('tanky')
    upgradeBottom('tanky')
    upgradeBottom('tanky')
    const maxTop = Math.max(0, ...Object.values(playerUpgrades.value.tops))
    const maxBot = Math.max(0, ...Object.values(playerUpgrades.value.bottoms))
    expect(maxTop).toBe(4)
    expect(maxBot).toBe(3)

    const { enemies } = generateChallenge()
    for (const e of enemies) {
      expect(e.topLevel).toBe(maxTop)
      expect(e.bottomLevel).toBe(maxBot)
    }
  })

  it('produces 1–3 enemies, a non-circle shape, and a valid skin per enemy', () => {
    for (let i = 0; i < 60; i++) {
      const { enemies, shape } = generateChallenge()
      expect(enemies.length).toBeGreaterThanOrEqual(1)
      expect(enemies.length).toBeLessThanOrEqual(3)
      expect(NON_CIRCLE_SHAPES).toContain(shape)
      for (const e of enemies) {
        expect(typeof e.modelId).toBe('string')
        expect(e.topPartId).toBeTruthy()
        expect(e.bottomPartId).toBeTruthy()
      }
    }
  })

  it('treats a lone enemy as boss-stats (no boss size); multi-enemy does not', () => {
    let sawSolo = false
    let sawMulti = false
    for (let i = 0; i < 120 && !(sawSolo && sawMulti); i++) {
      const { enemies } = generateChallenge()
      if (enemies.length === 1) {
        sawSolo = true
        expect(enemies[0]!.bossStats).toBe(true)
        expect(enemies[0]!.isBoss).toBeFalsy()
      } else {
        sawMulti = true
        for (const e of enemies) expect(e.bossStats).toBeFalsy()
      }
    }
    expect(sawSolo).toBe(true)
    expect(sawMulti).toBe(true)
  })

  it('a lone enemy never gets a team-only ability (partners/healers)', () => {
    for (let i = 0; i < 120; i++) {
      const { enemies } = generateChallenge()
      if (enemies.length === 1 && enemies[0]!.bossAbility) {
        expect(SOLO_ABILITIES).toContain(enemies[0]!.bossAbility)
      }
    }
  })
})

describe('first-win-pays gating', () => {
  const { hasWonToday, markDailyChallengeWon } = useDailyChallenge()

  it('only the first win of the day owes a diamond', () => {
    expect(hasWonToday.value).toBe(false)
    expect(markDailyChallengeWon()).toBe(true) // first win → diamond owed
    expect(hasWonToday.value).toBe(true)
    expect(markDailyChallengeWon()).toBe(false) // replay → no diamond
  })
})

describe('daily attempt limit (3/day)', () => {
  const { canPlayToday, attemptsToday, attemptsLeftToday, recordAttempt } = useDailyChallenge()

  it('exposes 3 as the cap', () => {
    expect(MAX_DAILY_ATTEMPTS).toBe(3)
  })

  it('counts each attempt and blocks further play after the cap (icon hides)', () => {
    // Singleton state carries over from earlier tests; this run started the day
    // with 0 attempts (only markDailyChallengeWon ran, which preserves attempts).
    expect(attemptsToday.value).toBe(0)
    expect(canPlayToday.value).toBe(true)

    recordAttempt()
    expect(attemptsToday.value).toBe(1)
    expect(attemptsLeftToday.value).toBe(2)
    expect(canPlayToday.value).toBe(true)

    recordAttempt()
    recordAttempt()
    expect(attemptsToday.value).toBe(3)
    expect(attemptsLeftToday.value).toBe(0)
    expect(canPlayToday.value).toBe(false) // ChallengeIcon hides for the rest of the day
  })
})
