// Skill catalog contract (skills-feature.md §10.8 "skillCatalog").
//
//   1. 10 ids; unlock stages unique, one per boss, 10…55; auto-fill order is
//      the unlock order.
//   2. Every table has 10 levels; every parameter non-decreasing with level,
//      except the ones where smaller = stronger (cooldownMs, everyN), which
//      are non-increasing.
//   3. Costs: learn 150, sum 2,650 per skill (§6.1). The catalog is the ONLY
//      price source: the sim reads SKILL_COST from it (skills.mjs
//      CATALOG_SKILL_COST → skillecon.mjs SKILL_COST) and hardcodes none.
//   4. Closed-form L10 EV sizes of §3.8 ≤ 1.225 (= √1.5).
//   5. PARITY with tools/skills-sim/skills.mjs — every skill, level and field.
//      The ≤ 1.5 balance proof was measured on the sim's tables, so any drift
//      here silently voids it.
//   6. Slots: 0 below the stage-10 clear, 1 from 10, 2 from the stage-20 clear.
//
// Pure-catalog import only (no useModels/useUser graph).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SKILL_IDS,
  SKILLS,
  SKILL_BIT,
  SKILL_COST,
  SKILL_TOTAL_COST,
  SKILL_MAX_LEVEL,
  SKILL_TEAM_SLOTS,
  SKILL_SLOT2_CLEARED,
  SKILL_UNLOCK_CLEARED,
  SKILL_HIT_MUL_CAP,
  SKILL_POWER_SCALE,
  SKILL_AUTOFILL_ORDER,
  applySkillPowerScale,
  canEquipTogether,
  isSkillId,
  skillCost,
  skillParams,
  unlockedSkillIds,
  unlockedSlotCount,
  type SkillId
} from '@/data/skillCatalog'
import * as catalogModule from '@/data/skillCatalog'
// @ts-ignore — plain ESM from the balance simulator, no .d.ts
import { SKILL_DEFS, SKILL_IDS as SIM_SKILL_IDS, CATALOG_SKILL_COST } from '../tools/skills-sim/skills.mjs'

type Row = Record<string, number>
const rows = (id: SkillId): Row[] => SKILLS[id].levels as unknown as Row[]
const L10 = (id: SkillId): Row => rows(id)[SKILL_MAX_LEVEL - 1] as Row

describe('skillCatalog — ids and unlocks', () => {
  it('has exactly 10 unique ids, and SKILLS is keyed by them', () => {
    expect(SKILL_IDS).toHaveLength(10)
    expect(new Set(SKILL_IDS).size).toBe(10)
    expect(Object.keys(SKILLS).sort()).toEqual([...SKILL_IDS].sort())
    for (const id of SKILL_IDS) expect(SKILLS[id].id).toBe(id)
  })

  it('unlock stages are unique, one per boss, exactly 10, 15, …, 55', () => {
    const stages = SKILL_IDS.map(id => SKILLS[id].unlockStage).sort((a, b) => a - b)
    expect(stages).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  })

  it('matches the §6.2 drop table (the sim DROPS in skillecon.mjs)', () => {
    const src = readFileSync(resolve(__dirname, '../tools/skills-sim/skillecon.mjs'), 'utf8')
    const block = src.match(/export const DROPS = \[([\s\S]*?)\n\]/)?.[1] ?? ''
    const drops = [...block.matchAll(/\['(\w+)', (\d+)\]/g)].map(m => [m[1], Number(m[2])])
    expect(drops).toHaveLength(10)
    expect(drops).toEqual(SKILL_AUTOFILL_ORDER.map(id => [id, SKILLS[id].unlockStage]))
  })

  it('auto-fill order is ascending unlock stage and starts with Mirror Plate', () => {
    expect(SKILL_AUTOFILL_ORDER).toHaveLength(10)
    expect(SKILL_AUTOFILL_ORDER[0]).toBe('mirror_plate')
    const st = SKILL_AUTOFILL_ORDER.map(id => SKILLS[id].unlockStage)
    for (let i = 1; i < st.length; i++) expect(st[i]!).toBeGreaterThan(st[i - 1]!)
  })

  it('unlockedSkillIds is derived from the highest cleared stage', () => {
    expect(unlockedSkillIds(9)).toEqual([])
    expect(unlockedSkillIds(10)).toEqual(['mirror_plate'])
    expect(unlockedSkillIds(14)).toEqual(['mirror_plate'])
    expect(unlockedSkillIds(15)).toEqual(['mirror_plate', 'phase_step'])
    expect(unlockedSkillIds(55)).toEqual([...SKILL_AUTOFILL_ORDER])
    expect(unlockedSkillIds(150)).toEqual([...SKILL_AUTOFILL_ORDER])
  })

  it('SKILL_BIT is 1 << index, all distinct', () => {
    SKILL_IDS.forEach((id, i) => expect(SKILL_BIT[id]).toBe(1 << i))
    expect(new Set(Object.values(SKILL_BIT)).size).toBe(10)
  })

  it('isSkillId guards unknown values', () => {
    expect(isSkillId('phase_step')).toBe(true)
    expect(isSkillId('nope')).toBe(false)
    expect(isSkillId(3)).toBe(false)
    expect(isSkillId(null)).toBe(false)
  })

  it('ships no runtime ad flag (ads are gated by the build-time HAS_REWARDED_ADS)', () => {
    expect(Object.keys(catalogModule).filter(k => /AD/.test(k))).toEqual([])
  })
})

describe('skillCatalog — slots', () => {
  it('2 team slots; slot 1 from the stage-10 clear, slot 2 from the stage-20 clear', () => {
    expect(SKILL_TEAM_SLOTS).toBe(2)
    expect(SKILL_UNLOCK_CLEARED).toBe(10)
    expect(SKILL_SLOT2_CLEARED).toBe(20)
    expect(unlockedSlotCount(0)).toBe(0)
    expect(unlockedSlotCount(9)).toBe(0)
    expect(unlockedSlotCount(10)).toBe(1)
    expect(unlockedSlotCount(19)).toBe(1)
    expect(unlockedSlotCount(20)).toBe(2)
    expect(unlockedSlotCount(200)).toBe(2)
  })

  it('every pair may be equipped together in v7; a skill never pairs with itself', () => {
    for (const a of SKILL_IDS) {
      for (const b of SKILL_IDS) expect(canEquipTogether(a, b)).toBe(a !== b)
    }
  })
})

describe('skillCatalog — level tables', () => {
  const FALLING = new Set(['cooldownMs', 'everyN'])

  it('every skill has 10 levels with the same fields on every level', () => {
    for (const id of SKILL_IDS) {
      expect(rows(id)).toHaveLength(SKILL_MAX_LEVEL)
      const keys = Object.keys(rows(id)[0]!).sort()
      for (const r of rows(id)) {
        expect(Object.keys(r).sort()).toEqual(keys)
        for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('values rise with level; cooldowns (and contacts per volley) fall', () => {
    for (const id of SKILL_IDS) {
      const r = rows(id)
      for (const k of Object.keys(r[0]!)) {
        for (let i = 1; i < r.length; i++) {
          const prev = r[i - 1]![k]!
          const cur = r[i]![k]!
          if (FALLING.has(k)) expect(cur, `${id}.${k} L${i + 1}`).toBeLessThanOrEqual(prev)
          else expect(cur, `${id}.${k} L${i + 1}`).toBeGreaterThanOrEqual(prev)
        }
        // Every non-constant column actually moves from L1 to L10.
        const first = r[0]![k]!
        const last = r[SKILL_MAX_LEVEL - 1]![k]!
        if (first !== last) {
          if (FALLING.has(k)) expect(last).toBeLessThan(first)
          else expect(last).toBeGreaterThan(first)
        }
      }
    }
  })

  it('phase_step cooldown 4.0 s → 2.5 s', () => {
    expect(rows('phase_step')[0]!.cooldownMs).toBe(4000)
    expect(L10('phase_step').cooldownMs).toBe(2500)
  })

  it('skillParams clamps the level and returns the table row at scale 1', () => {
    expect(SKILL_POWER_SCALE).toBe(1)
    expect(skillParams('guard_shell', 1)).toEqual({ shield: 0.05 })
    expect(skillParams('guard_shell', 10)).toEqual({ shield: 0.16 })
    expect(skillParams('guard_shell', 0)).toEqual({ shield: 0.05 })
    expect(skillParams('guard_shell', 99)).toEqual({ shield: 0.16 })
    expect(skillParams('guard_shell', Number.NaN)).toEqual({ shield: 0.05 })
  })

  it('SKILL_POWER_SCALE touches chances/percents and mult − 1, never cooldowns/everyN/threshold/caps', () => {
    expect(applySkillPowerScale({ chance: 0.1, cooldownMs: 2500 }, 0.5))
      .toEqual({ chance: 0.05, cooldownMs: 2500 })
    expect(applySkillPowerScale({ chance: 0.13, mult: 2 }, 0.5)).toEqual({ chance: 0.065, mult: 1.5 })
    expect(applySkillPowerScale({ everyN: 5, frac: 0.2, maxTargets: 3 }, 0.5))
      .toEqual({ everyN: 5, frac: 0.1, maxTargets: 3 })
    expect(applySkillPowerScale({ threshold: 0.35, heal: 0.18 }, 0.5)).toEqual({ threshold: 0.35, heal: 0.09 })
    expect(applySkillPowerScale({ perStack: 0.07, maxStacks: 3 }, 0.5)).toEqual({ perStack: 0.035, maxStacks: 3 })
    expect(applySkillPowerScale({ chance: 0.16, share: 0.5 }, 0.5)).toEqual({ chance: 0.08, share: 0.5 })
  })

  it('hit multiplier clamp is 2.2', () => {
    expect(SKILL_HIT_MUL_CAP).toBe(2.2)
  })

  it('every skill has a colour and a single-path 24×24 icon', () => {
    for (const id of SKILL_IDS) {
      const { icon, color } = SKILLS[id]
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
      expect(icon).toMatch(/^M[\d.\sMLCAZ-]+Z$/)
      for (const n of icon.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(24)
      }
    }
  })
})

describe('skillCatalog — costs (§6.1)', () => {
  it('learn 150, then 100 … 575, 2,650 per skill, 26,500 for all ten', () => {
    expect([...SKILL_COST]).toEqual([150, 100, 125, 150, 200, 250, 300, 350, 450, 575])
    expect(SKILL_TOTAL_COST).toBe(2650)
    expect(SKILL_TOTAL_COST * SKILL_IDS.length).toBe(26500)
  })

  it('the sim reads SKILL_COST from the catalog (skills.mjs → skillecon.mjs)', () => {
    expect([...CATALOG_SKILL_COST]).toEqual([...SKILL_COST])
    // skillecon.mjs is not imported here: its econ.mjs dependency resolves the
    // repo through the global URL, which is jsdom's under Vitest. Source check.
    const econ = readFileSync(resolve(__dirname, '../tools/skills-sim/skillecon.mjs'), 'utf8')
    expect(econ).toMatch(/import \{[^}]*\bCATALOG_SKILL_COST\b[^}]*\} from '\.\/skills\.mjs'/)
    expect(econ).toMatch(/export const SKILL_COST = [^\n]*\[\.\.\.CATALOG_SKILL_COST\]/)
  })

  it('no sim script hardcodes the price curve (single source)', () => {
    const curve = /150\s*[,|]\s*100\s*[,|]\s*125/
    for (const f of ['skillecon.mjs', 'fill.mjs', 'skills.mjs', 'econ.mjs']) {
      const src = readFileSync(resolve(__dirname, '../tools/skills-sim', f), 'utf8')
      expect(curve.test(src), f).toBe(false)
    }
  })

  it('skillCost: 0 → learn, 9 → 575, max/invalid → null', () => {
    expect(skillCost(0)).toBe(150)
    expect(skillCost(1)).toBe(100)
    expect(skillCost(9)).toBe(575)
    expect(skillCost(10)).toBeNull()
    expect(skillCost(-1)).toBeNull()
    expect(skillCost(2.5)).toBeNull()
    let sum = 0
    for (let l = 0; l < SKILL_MAX_LEVEL; l++) sum += skillCost(l)!
    expect(sum).toBe(2650)
  })
})

describe('skillCatalog — closed-form L10 EV sizes (§3.8)', () => {
  const ev: Partial<Record<SkillId, number>> = {
    guard_shell: 1 + L10('guard_shell').shield!,
    phase_step: 1 / (1 - L10('phase_step').chance!),
    mirror_plate: 1 / (1 - L10('mirror_plate').chance! * L10('mirror_plate').share!),
    second_wind: 1 + L10('second_wind').heal!,
    lucky_edge: 1 + L10('lucky_edge').chance! * (L10('lucky_edge').mult! - 1),
    momentum: 1 + L10('momentum').maxStacks! * L10('momentum').perStack!,
    opening_salvo: 1 / (1 - L10('opening_salvo').pct!),
    static_charge: 1 + L10('static_charge').chance!
  }

  it('each is ≤ 1.225 = √1.5, so two independent factors stay ≤ 1.5', () => {
    for (const [id, v] of Object.entries(ev)) expect(v, id).toBeLessThanOrEqual(1.225 + 1e-9)
  })

  it('reproduce the §3.8 table', () => {
    const doc: Partial<Record<SkillId, number>> = {
      guard_shell: 1.16,
      phase_step: 1.111,
      mirror_plate: 1.087,
      second_wind: 1.18,
      lucky_edge: 1.13,
      momentum: 1.225,
      opening_salvo: 1.163,
      static_charge: 1.18
    }
    for (const [id, v] of Object.entries(doc)) expect(ev[id as SkillId], id).toBeCloseTo(v!, 3)
  })

  it('Lucky Edge × Momentum at perfect play stays under the per-hit clamp', () => {
    expect((1 + L10('momentum').maxStacks! * L10('momentum').perStack!) * L10('lucky_edge').mult!)
      .toBeLessThanOrEqual(2.45) // 2.0 × 1.225 = 2.45 → clamped to SKILL_HIT_MUL_CAP 2.2 at runtime
  })
})

describe('skillCatalog — PARITY with tools/skills-sim/skills.mjs', () => {
  const sim = SKILL_DEFS as Record<string, { tag: string; levels: Row[] }>

  it('same id set', () => {
    expect([...(SIM_SKILL_IDS as string[])].sort()).toEqual([...SKILL_IDS].sort())
  })

  it('same tag per skill', () => {
    for (const id of SKILL_IDS) expect(SKILLS[id].tag, id).toBe(sim[id]!.tag)
  })

  it('every level, every field, exactly equal', () => {
    let compared = 0
    for (const id of SKILL_IDS) {
      const mine = rows(id)
      const theirs = sim[id]!.levels
      expect(mine.length, id).toBe(theirs.length)
      for (let i = 0; i < theirs.length; i++) {
        expect(Object.keys(mine[i]!).sort(), `${id} L${i + 1} fields`).toEqual(Object.keys(theirs[i]!).sort())
        for (const [k, v] of Object.entries(theirs[i]!)) {
          expect(mine[i]![k], `${id} L${i + 1} ${k}`).toBe(v)
          compared++
        }
      }
    }
    // 10 levels × (1+2+2+2+2+2+3+1+1+4 = 20 fields) = 200 values
    expect(compared).toBe(200)
  })
})
