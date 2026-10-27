// ─── Smasher levels have no gameplay cap ────────────────────────────────────
//
// Pinned here (src/data/smasherCatalog.ts header):
//   • costs for levels 1 … 30 follow the quadratic curve (SMASHER_COST_QUAD,
//     flattened in #playtest-1-4; levels up to 10 unchanged since launch);
//   • past 30 every level costs more than the last
//     (×SMASHER_COST_GROWTH per level on top of the quadratic), always finite;
//   • levelUpSmasher keeps going past 30 — only the technical sanity ceiling
//     (SMASHER_LEVEL_SANITY_MAX, not a gameplay cap) stops it;
//   • save / PvP / ghost sanitizers accept levels above 30 and clamp only
//     garbage to the sanity ceiling;
//   • stats keep rising past 30 but taper (diminishing returns), force decay
//     stops growing; skill levels stay capped at 10, three slots.

import './helpers/skillsBuild'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SMASHER_COST_GROWTH,
  SMASHER_COST_QUAD,
  SMASHER_LEVEL_SANITY_MAX,
  SMASHER_TAPER_LEVEL,
  clampSmasherLevel,
  smasherConfig,
  smasherLevelCost,
  smasherLoadout,
  smasherSkillLevel,
  smasherUpgradeLevel,
  unlockedSkillCount
} from '@/data/smasherCatalog'
import { computeStats } from '@/use/useSpinnerConfig'
import { sanitizePvpTeam } from '@/use/loadoutSanitizer'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

/** The quadratic curve up to 30 (SMASHER_COST_QUAD; was 3 before #playtest-1-4). */
const legacyCost = (level: number): number => {
  const to = level + 1
  const extra = to > 10 ? SMASHER_COST_QUAD * (to - 10) * (to - 10) : 0
  return Math.round((100 + (to - 1) * 20 + extra) * 1.6)
}

const statsOf = (id: 'bramble' | 'thumper' | 'grizzle', level: number) => {
  const cfg = smasherConfig(id, level)
  return computeStats(cfg, cfg.topLevel ?? 0, cfg.bottomLevel ?? 0)
}

describe('level cost curve', () => {
  it('levels 1 … 30 follow the quadratic curve; 1 … 9 never changed', () => {
    for (let lv = 1; lv < SMASHER_TAPER_LEVEL; lv++) expect(smasherLevelCost(lv)).toBe(legacyCost(lv))
    expect(smasherLevelCost(1)).toBe(192)
    expect(smasherLevelCost(9)).toBe(448)
    expect(smasherLevelCost(29)).toBe(2048)
  })

  it('#playtest-1-4: the late curve stays payable — Lv 50 costs < 25 average late wins (~600)', () => {
    expect(smasherLevelCost(50)!).toBeLessThan(25 * 600)
  })

  it('is continuous at 30 and grows monotonically, steeper than the old curve', () => {
    let prev = 0
    let prevRatio = 0
    for (let lv = 1; lv < 200; lv++) {
      const c = smasherLevelCost(lv)!
      expect(Number.isFinite(c)).toBe(true)
      expect(c).toBeGreaterThan(prev)
      if (lv >= SMASHER_TAPER_LEVEL) {
        expect(c).toBeGreaterThan(legacyCost(lv))
        const ratio = c / prev
        if (lv > SMASHER_TAPER_LEVEL) expect(ratio).toBeGreaterThan(SMASHER_COST_GROWTH) // ≥ growth factor every step
        prevRatio = ratio
      }
      prev = c
    }
    expect(prevRatio).toBeGreaterThan(1)
    // The first step past the old cap: noticeably dearer, not a cliff.
    const step30 = smasherLevelCost(30)! / smasherLevelCost(29)!
    expect(step30).toBeGreaterThan(1.05)
    expect(step30).toBeLessThan(1.3)
  })

  it('stays a finite safe integer up to the sanity ceiling, null only there', () => {
    expect(smasherLevelCost(SMASHER_LEVEL_SANITY_MAX - 1)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
    expect(smasherLevelCost(SMASHER_LEVEL_SANITY_MAX)).toBeNull()
    expect(smasherLevelCost(0)).toBeNull()
  })
})

describe('levelUpSmasher has no gameplay cap', () => {
  it('raises a smasher past 30 and keeps going', async () => {
    const { levelUpSmasher, smasherLevel } = await import('@/use/useSmashers')
    for (let i = 0; i < 40; i++) levelUpSmasher('thumper')
    expect(smasherLevel('thumper')).toBe(41)
    expect(levelUpSmasher('thumper')).toBe(42)
  })
})

describe('sanitizers accept levels above 30', () => {
  it('parseRoster keeps 75 and clamps garbage to the sanity ceiling', async () => {
    const { parseRoster } = await import('@/use/useSmashers')
    const r = parseRoster(JSON.stringify({ lv: { bramble: 75, thumper: 1e12, grizzle: -4 } }))
    expect(r.bramble).toBe(75)
    expect(r.thumper).toBe(SMASHER_LEVEL_SANITY_MAX)
    expect(r.grizzle).toBe(1)
  })

  it('clampSmasherLevel / PvP team sanitizer keep high levels, cap only absurd ones', () => {
    expect(clampSmasherLevel(31)).toBe(31)
    expect(clampSmasherLevel(500)).toBe(500)
    expect(clampSmasherLevel(Infinity)).toBe(1)
    expect(clampSmasherLevel(1e9)).toBe(SMASHER_LEVEL_SANITY_MAX)
    const team = sanitizePvpTeam([{ smasherId: 'bramble', level: 60 }, { smasherId: 'thumper', level: 1e9 }], { teamSize: 2 })
    expect(team.map(c => c.level)).toEqual([60, SMASHER_LEVEL_SANITY_MAX])
    expect(team[0]!.topLevel).toBe(59)
    const one = sanitizePvpTeam([{ smasherId: 'bramble', level: 60 }], { teamSize: 1, levelOne: true })
    expect(one[0]!.level).toBe(1)
  })
})

describe('stat growth past 30 tapers', () => {
  it('is linear up to 30, then each level adds less than the one before (but still something)', () => {
    for (let n = 0; n <= SMASHER_TAPER_LEVEL - 1; n++) expect(smasherUpgradeLevel(n)).toBe(n)
    let prevGain = 1
    for (let n = SMASHER_TAPER_LEVEL; n < 300; n++) {
      const gain = smasherUpgradeLevel(n) - smasherUpgradeLevel(n - 1)
      expect(gain).toBeGreaterThan(0)
      expect(gain).toBeLessThanOrEqual(prevGain + 1e-12)
      prevGain = gain
    }
    // Level 100 is worth far less than 99 linear upgrades.
    expect(smasherUpgradeLevel(99)).toBeLessThan(65)
  })

  it('stats at 30 are unchanged, rise past 30, and gain per level shrinks', () => {
    const s29 = statsOf('grizzle', 29)
    const s30 = statsOf('grizzle', 30)
    const s31 = statsOf('grizzle', 31)
    const s50 = statsOf('grizzle', 50)
    const s51 = statsOf('grizzle', 51)
    expect(s31.maxHp).toBeGreaterThan(s30.maxHp)
    expect(s51.maxHp - s50.maxHp).toBeLessThan(s30.maxHp - s29.maxHp)
    expect(s51.damageMultiplier - s50.damageMultiplier).toBeLessThan(s30.damageMultiplier - s29.damageMultiplier)
    // Level 75 is strong, not an order of magnitude past level 30.
    const s75 = statsOf('grizzle', 75)
    expect(s75.maxHp / s30.maxHp).toBeLessThan(1.75) // linear would be ~2.3×
  })

  it('force decay stops growing at 30 (rolling never becomes perpetual)', () => {
    expect(statsOf('thumper', 75).forceDecay).toBe(statsOf('thumper', 30).forceDecay)
  })

  it('part-only (campaign NPC) configs are untouched by the taper', () => {
    const cfg = { topPartId: 'round', bottomPartId: 'tanky', topLevel: 60, bottomLevel: 60 } as const
    const lin = computeStats(cfg, 60, 60)
    const lin59 = computeStats(cfg, 59, 59)
    const lin58 = computeStats(cfg, 58, 58)
    expect(lin.maxHp - lin59.maxHp).toBeCloseTo(lin59.maxHp - lin58.maxHp, 9)
  })
})

describe('skills past 30', () => {
  it('still three slots, every skill level capped at 10', () => {
    for (const lv of [30, 38, 75, 500]) {
      expect(unlockedSkillCount(lv)).toBe(3)
      for (const slot of [0, 1, 2]) expect(smasherSkillLevel(lv, slot)).toBeLessThanOrEqual(10)
      expect(smasherLoadout(smasherConfig('bramble', lv))).toHaveLength(3)
    }
    expect(smasherSkillLevel(38, 2)).toBe(10)
    expect(smasherSkillLevel(36, 2)).toBe(9)
  })
})
