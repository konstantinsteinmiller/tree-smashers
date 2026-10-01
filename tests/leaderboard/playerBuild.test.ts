// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDigest,
  buildPower,
  buildSkillPower,
  BUILD_SKILL_POWER_PERMILLE,
  BUILD_MAX_SKILL_LEVEL,
  encodePlayerBuild,
  validatePlayerBuildShape,
  type PlayerBuildV1
} from '@/utils/playerBuild'

const TEAM = [
  { topPartId: 'star', bottomPartId: 'balanced', topLevel: 12, bottomLevel: 9, modelId: 'reddragon' },
  { topPartId: 'round', bottomPartId: 'tanky', topLevel: 7, bottomLevel: undefined, modelId: 'yeti' }
]
const SKILLS = [{ id: 'guard_shell', level: 3 }, { id: 'homing_rockets', level: 2 }]

const good = (): PlayerBuildV1 => ({
  v: 1,
  team: [
    { t: 'star', b: 'balanced', tl: 12, bl: 9, m: 'reddragon' },
    { t: 'round', b: 'tanky', tl: 7, bl: 0, m: 'yeti' }
  ],
  sk: [{ id: 'guard_shell', lv: 3 }, { id: 'homing_rockets', lv: 2 }]
})

describe('encodePlayerBuild', () => {
  it('maps configs + loadout to the short-key shape (missing level → 0)', () => {
    expect(encodePlayerBuild(TEAM, SKILLS)).toEqual(good())
  })

  it('a skills-off build encodes an empty loadout', () => {
    expect(encodePlayerBuild(TEAM, [])!.sk).toEqual([])
    expect(encodePlayerBuild(TEAM, undefined)!.sk).toEqual([])
  })

  it('returns null for anything it cannot express', () => {
    expect(encodePlayerBuild([TEAM[0]!], SKILLS)).toBeNull() // one spinner
    expect(encodePlayerBuild([...TEAM, TEAM[0]!], SKILLS)).toBeNull() // three
    expect(encodePlayerBuild([{ ...TEAM[0]!, modelId: undefined }, TEAM[1]!], [])).toBeNull()
    expect(encodePlayerBuild([{ ...TEAM[0]!, topLevel: 201 }, TEAM[1]!], [])).toBeNull()
    expect(encodePlayerBuild(TEAM, [{ id: 'guard_shell', level: 0 }])).toBeNull()
    expect(encodePlayerBuild(null, [])).toBeNull()
  })

  it('truncates fractional levels instead of rejecting them', () => {
    expect(encodePlayerBuild([{ ...TEAM[0]!, topLevel: 12.9 }, TEAM[1]!], [])!.team[0]!.tl).toBe(12)
  })
})

describe('validatePlayerBuildShape', () => {
  it('accepts a good build and returns a fresh copy without extra keys', () => {
    const raw = { ...good(), extra: 'x', team: good().team.map((s) => ({ ...s, hp: 9 })) }
    const out = validatePlayerBuildShape(raw)
    expect(out).toEqual(good())
    expect(out).not.toBe(raw)
  })

  it.each([
    ['not an object', 'nope'],
    ['wrong version', { ...good(), v: 2 }],
    ['team of one', { ...good(), team: [good().team[0]] }],
    ['team missing', { v: 1, sk: [] }],
    ['sk missing', { v: 1, team: good().team }],
    ['uppercase id', { ...good(), team: [{ ...good().team[0], t: 'Star' }, good().team[1]] }],
    ['id too long', { ...good(), team: [{ ...good().team[0], m: 'x'.repeat(33) }, good().team[1]] }],
    ['id with a space', { ...good(), team: [{ ...good().team[0], b: 'a b' }, good().team[1]] }],
    ['empty id', { ...good(), team: [{ ...good().team[0], m: '' }, good().team[1]] }],
    ['part level > 200', { ...good(), team: [{ ...good().team[0], tl: 201 }, good().team[1]] }],
    ['negative part level', { ...good(), team: [{ ...good().team[0], bl: -1 }, good().team[1]] }],
    ['fractional level', { ...good(), team: [{ ...good().team[0], bl: 1.5 }, good().team[1]] }],
    ['string level', { ...good(), team: [{ ...good().team[0], tl: '5' }, good().team[1]] }],
    ['three skills', { ...good(), sk: [...good().sk, { id: 'momentum', lv: 1 }] }],
    ['duplicate skill', { ...good(), sk: [{ id: 'momentum', lv: 1 }, { id: 'momentum', lv: 2 }] }],
    ['skill level 0', { ...good(), sk: [{ id: 'momentum', lv: 0 }] }],
    ['skill level 11', { ...good(), sk: [{ id: 'momentum', lv: 11 }] }],
    ['skill not an object', { ...good(), sk: ['momentum'] }]
  ])('rejects %s', (_label, raw) => {
    expect(validatePlayerBuildShape(raw)).toBeNull()
  })

  it('accepts the boundaries (levels 0 / 200, skill levels 1 / 10, no skills)', () => {
    const b = good()
    b.team[0]!.tl = 0
    b.team[0]!.bl = 200
    b.sk = [{ id: 'momentum', lv: 1 }, { id: 'hazard_ward', lv: 10 }]
    expect(validatePlayerBuildShape(b)).toEqual(b)
    expect(validatePlayerBuildShape({ ...good(), sk: [] })).not.toBeNull()
  })
})

describe('buildDigest', () => {
  it('is stable and canonical (key order does not matter)', () => {
    const a = good()
    const shuffled = JSON.parse(JSON.stringify({
      sk: a.sk.map(({ lv, id }) => ({ lv, id })),
      team: a.team.map(({ m, bl, tl, b, t }) => ({ m, bl, tl, b, t })),
      v: 1
    }))
    expect(buildDigest(validatePlayerBuildShape(shuffled)!)).toBe(buildDigest(a))
    expect(buildDigest(a)).toBe('v1|star,balanced,12,9,reddragon|round,tanky,7,0,yeti|sk:guard_shell.3,homing_rockets.2')
  })

  it('changes with any level, part, skin, skill or slot order', () => {
    const base = buildDigest(good())
    const variants: ((b: PlayerBuildV1) => void)[] = [
      (b) => { b.team[0]!.tl++ },
      (b) => { b.team[1]!.b = 'speedy' },
      (b) => { b.team[1]!.m = 'cinder' },
      (b) => { b.sk[1]!.lv++ },
      (b) => { b.sk = [] },
      (b) => { b.team.reverse() }
    ]
    for (const mutate of variants) {
      const b = good()
      mutate(b)
      expect(buildDigest(b)).not.toBe(base)
    }
  })
})

describe('buildPower (LG-PWR skill power)', () => {
  it('is Σ part levels + round((parts + 124) × Σ permille(lv) / 1000)', () => {
    // parts 12+9+7+0 = 28; skills L3 + L2 → 9 + 7 = 16 ‰ of 152 = 2.43 → 2
    expect(buildPower(good())).toBe(30)
    // L3 alone: 9 ‰ of 152 = 1.37 → 1 ; L7 alone: 13 ‰ of 152 = 1.98 → 2
    expect(buildPower({ ...good(), sk: [{ id: 'momentum', lv: 3 }] })).toBe(29)
    expect(buildPower({ ...good(), sk: [{ id: 'momentum', lv: 7 }] })).toBe(30)
    // maxed parts + two maxed skills: 800 + 32 ‰ of 924 = 29.6 → 30
    const maxed: PlayerBuildV1 = {
      v: 1,
      team: [0, 1].map(() => ({ t: 'star', b: 'tanky', tl: 200, bl: 200, m: 'ice' })),
      sk: [{ id: 'momentum', lv: 10 }, { id: 'guard_shell', lv: 10 }]
    }
    expect(buildPower(maxed)).toBe(830)
  })

  it('skill-less power is exactly Σ part levels (gatekeepers, LG-SNAP lpower unchanged)', () => {
    expect(buildPower({ ...good(), sk: [] })).toBe(28)
    for (let tl = 0; tl <= 200; tl += 7) {
      for (let bl = 0; bl <= 200; bl += 13) {
        const b: PlayerBuildV1 = { v: 1, team: [{ ...good().team[0]!, tl, bl }, { ...good().team[1]!, tl: bl, bl: tl }], sk: [] }
        expect(buildPower(b)).toBe(2 * (tl + bl))
      }
    }
    expect(buildSkillPower(123, [])).toBe(0)
  })

  it('the permille table is front-loaded (concave) and monotone', () => {
    expect(BUILD_SKILL_POWER_PERMILLE).toHaveLength(BUILD_MAX_SKILL_LEVEL)
    for (let i = 1; i < BUILD_SKILL_POWER_PERMILLE.length; i++) {
      const step = BUILD_SKILL_POWER_PERMILLE[i]! - BUILD_SKILL_POWER_PERMILLE[i - 1]!
      expect(step).toBeGreaterThan(0)
      if (i > 1) expect(step).toBeLessThanOrEqual(BUILD_SKILL_POWER_PERMILLE[i - 1]! - BUILD_SKILL_POWER_PERMILLE[i - 2]!)
    }
    // level 1 is worth more than any single later level-up
    expect(BUILD_SKILL_POWER_PERMILLE[0]!).toBeGreaterThan(BUILD_SKILL_POWER_PERMILLE[1]! - BUILD_SKILL_POWER_PERMILLE[0]!)
  })

  it('is an integer, monotone in part and skill levels, and grows with the parts', () => {
    let prevByParts = -1
    for (let parts = 0; parts <= 800; parts += 17) {
      let prev = -1
      for (let lv = 1; lv <= BUILD_MAX_SKILL_LEVEL; lv++) {
        const p = buildSkillPower(parts, [lv, lv])
        expect(Number.isInteger(p)).toBe(true)
        expect(p).toBeGreaterThanOrEqual(prev)
        prev = p
      }
      expect(prev).toBeGreaterThanOrEqual(prevByParts)
      prevByParts = prev
    }
    expect(buildSkillPower(24, [10, 10])).toBeLessThan(buildSkillPower(176, [10, 10]))
  })

  it('ignores levels outside 1…10 (truncated, clamped)', () => {
    expect(buildSkillPower(100, [0, -3, Number.NaN])).toBe(0)
    expect(buildSkillPower(100, [99])).toBe(buildSkillPower(100, [10]))
    expect(buildSkillPower(100, [3.9])).toBe(buildSkillPower(100, [3]))
  })
})

describe('worker-shared purity (league plan F5)', () => {
  it('has no alias imports, no import.meta.env and no imports at all', () => {
    const src = readFileSync(resolve(__dirname, '../../src/utils/playerBuild.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/from\s+['"]@\//)
    expect(src).not.toMatch(/import\.meta\.env/)
    expect(src).not.toMatch(/^\s*import\s/m)
  })
})
