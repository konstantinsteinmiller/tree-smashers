// ─── Playtest run 1: balance & economy rules (roadmap #playtest-1-2/3/4/5/7/15/21)
//
// Pure rules only — the win-rate effect of each is on the roadmap's
// "balance sims to run" list (no per-change sims).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUDDEN_DEATH_FROM_TURN, SUDDEN_DEATH_STEP, suddenDeathDecayShare, TREE_COUNT_HP_SHARE } from '@/use/arenaTerrain'
import {
  CAMPAIGN_NPC_TUNING,
  campaignBossCountHpMul,
  campaignFirstTurn,
  getStageById,
  rubberBandReduction
} from '@/use/useSpinnerCampaign'
import { computeStats } from '@/use/useSpinnerConfig'
import { SMASHERS } from '@/data/smasherCatalog'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('#playtest-1-5 sudden death: tree decay', () => {
  it('nothing before the threshold, then a growing share per hand-off', () => {
    for (let h = 0; h < SUDDEN_DEATH_FROM_TURN; h++) expect(suddenDeathDecayShare(h)).toBe(0)
    expect(suddenDeathDecayShare(SUDDEN_DEATH_FROM_TURN)).toBeCloseTo(SUDDEN_DEATH_STEP)
    expect(suddenDeathDecayShare(SUDDEN_DEATH_FROM_TURN + 1)).toBeCloseTo(2 * SUDDEN_DEATH_STEP)
  })

  it('fells any full tree within 40 launches', () => {
    let left = 1
    let h = 0
    while (left > 0 && h < 200) left -= suddenDeathDecayShare(++h)
    expect(h).toBeLessThanOrEqual(40)
  })
})

describe('#playtest-1-7 multi-tree stages', () => {
  it('each extra tree is a smaller share, and the total tree HP of a side shrinks with the count', () => {
    expect(TREE_COUNT_HP_SHARE[0]).toBe(1)
    for (let n = 2; n <= 3; n++) {
      // Smaller targets that all have to fall: less total HP keeps the tree
      // route as quick as one tree's (balance pass 2026-10-28).
      expect(TREE_COUNT_HP_SHARE[n - 1]! * n).toBeLessThan(TREE_COUNT_HP_SHARE[n - 2]! * (n - 1))
      expect(TREE_COUNT_HP_SHARE[n - 1]! * n).toBeGreaterThanOrEqual(0.5)
    }
  })
})

describe('#playtest-1-2/-3 boss curve', () => {
  it('boss trios / quartets share a smaller per-blade budget, a lone boss keeps it', () => {
    expect(campaignBossCountHpMul(1)).toBe(1)
    for (let n = 2; n <= 6; n++) expect(campaignBossCountHpMul(n)).toBeLessThan(campaignBossCountHpMul(n - 1) + 1e-9)
    // The whole team still grows with the number of bosses.
    for (let n = 2; n <= 4; n++) expect(n * campaignBossCountHpMul(n)).toBeGreaterThan((n - 1) * campaignBossCountHpMul(n - 1))
  })

  it('the HP floor lifts stage 90\'s glass-cannon boss to a neutral blade at its levels', () => {
    expect(CAMPAIGN_NPC_TUNING.bossHpFloor).toBe(true)
    const boss = getStageById(90).enemyTeam[0]!
    const own = computeStats(boss, boss.topLevel, boss.bottomLevel).maxHp
    const ref = computeStats({ ...boss, topPartId: 'quadratic', bottomPartId: 'balanced' }, boss.topLevel, boss.bottomLevel).maxHp
    expect(ref).toBeGreaterThan(own)
  })
})

describe('#playtest-1-15 help after repeated losses', () => {
  it('the rubber band grows every two losses, capped lower on regular stages', () => {
    expect(rubberBandReduction(0, false)).toBe(0)
    expect(rubberBandReduction(1, false)).toBe(0)
    expect(rubberBandReduction(2, false)).toBeCloseTo(0.1)
    expect(rubberBandReduction(20, false)).toBeCloseTo(0.3)
    expect(rubberBandReduction(20, true)).toBeCloseTo(0.5)
  })

  it('the lose-screen tip names the assist once it is active', async () => {
    const camp = await import('@/use/useSpinnerCampaign')
    const tips = await import('@/use/useTips')
    camp.noteCampaignBossLoss()
    camp.noteCampaignBossLoss()
    expect(camp.rubberBandActive()).toBe(true)
    expect(tips.pickLoseScreenTip(camp.getStageById(13)).pool[0]).toBe('rubberBand')
  })

  it('a late recruit that was never levelled joins near the team, early ones start at 1', async () => {
    const { catchUpLevel, SMASHER_CATCH_UP_FROM_STAGE } = await import('@/use/useSmashers')
    expect(catchUpLevel({})).toBe(1)
    expect(catchUpLevel({ bramble: 30, thumper: 30, grizzle: 30 })).toBe(22)
    localStorage.setItem('smashers_roster', JSON.stringify({ lv: { bramble: 30, thumper: 30, grizzle: 30 } }))
    vi.resetModules()
    const fresh = await import('@/use/useSmashers')
    const late = (Object.values(SMASHERS).find(s => s.unlockStage > SMASHER_CATCH_UP_FROM_STAGE))!.id
    expect(fresh.smasherLevel(late)).toBe(22)
    expect(fresh.smasherLevel('chomper')).toBe(1)
    expect(fresh.levelUpSmasher(late)).toBe(23)
  })
})

describe('#playtest-1-21 tutorial stages open with the player', () => {
  it('stages 1–3 force the player\'s first turn, later stages keep the bias', () => {
    for (const s of [1, 2, 3]) expect(campaignFirstTurn(s)).toBe('player')
    for (const s of [0, 4, 5, 50, 103]) expect(campaignFirstTurn(s)).toBeUndefined()
  })
})
