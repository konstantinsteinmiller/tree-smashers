// Skill runtime contract (skills-feature.md §4, §5, §9.1, §10.8 "skillRuntime").
//
// Every proc is driven by a STUB stream (a queue of rolls that throws when an
// unexpected draw happens), so each test also proves which paths draw and
// which do not. Pure module import only (no useSpinnerGame / Vue graph).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SKILL_HIT_MUL_CAP, skillParams, type SkillId, type SkillLoadout } from '@/data/skillCatalog'
import { createRng, matchRng, seedMatchRng } from '@/use/useDeterministicRng'
import {
  ENGINE_BASE_MAX_FORCE,
  ENGINE_DAMAGE_SCALE,
  ENGINE_STOP_THRESHOLD,
  PHASE_WINDOW_MS,
  ROCKET_FLIGHT_MS,
  applyHpLoss,
  beginLaunchSkills,
  bladeStream,
  bladeStreamSeed,
  blocksEnemyChip,
  countPickable,
  createBladeSkills,
  createContactResult,
  createHpLossResult,
  createIncomingResult,
  createOutgoingResult,
  effectiveHp,
  hasSkill,
  hazardScale,
  incomingSkill,
  isPhased,
  isStunnedFor,
  onEnemyContact,
  onOwnBounce,
  outgoingSkillMul,
  refHit,
  salvoDamage,
  teamSalvoPct,
  type HpLossKind,
  type SkillBlade,
  type SkillRefStats,
  type SkillRuntime
} from '@/use/skills/skillRuntime'

// ─── helpers ───────────────────────────────────────────────────────────────

interface Stub {
  fn: () => number
  push: (...v: number[]) => void
  draws: () => number
  left: () => number
}

/** Queue stream: returns queued rolls in order, throws on an unplanned draw. */
function stub(...vals: number[]): Stub {
  const q = [...vals]
  let n = 0
  return {
    fn: () => {
      if (q.length === 0) throw new Error('unexpected skill roll')
      n++
      return q.shift() as number
    },
    push: (...v) => q.push(...v),
    draws: () => n,
    left: () => q.length
  }
}

let nextId = 1
type TestBlade = SkillBlade & { skills?: SkillRuntime }

function blade(owner: 'player' | 'npc', over: Partial<TestBlade> = {}): TestBlade {
  const id = nextId++
  return {
    id,
    syncKey: id,
    owner,
    hp: 100,
    maxHp: 100,
    vx: 0,
    vy: 0,
    config: { topPartId: 'round' },
    ...over
  }
}

/** A bearer with `ids` at `level` and a stub stream. */
function bearer(
  owner: 'player' | 'npc',
  ids: SkillId[],
  level = 10,
  rolls: Stub = stub(),
  over: Partial<TestBlade> = {}
): TestBlade & { rolls: Stub } {
  const b = blade(owner, over) as TestBlade & { rolls: Stub }
  const lo: SkillLoadout = ids.map(id => ({ id, level }))
  b.skills = createBladeSkills(lo, b.maxHp, b.syncKey, 1234, rolls.fn)
  b.rolls = rolls
  return b
}

const STATS: SkillRefStats = { damageMultiplier: 1, defenseMultiplier: 1, speedMultiplier: 1, totalWeight: 1 }
const statsOf = (): SkillRefStats => STATS

const NON_HIT_KINDS: HpLossKind[] = ['chip', 'lava', 'burn', 'thunder', 'reflect', 'rocket', 'salvo', 'link']
const ALL_KINDS: HpLossKind[] = ['hit', ...NON_HIT_KINDS]

// ─── createBladeSkills ─────────────────────────────────────────────────────

describe('createBladeSkills', () => {
  it('returns undefined for empty / invalid loadouts (keeps the engine fast path)', () => {
    expect(createBladeSkills([], 100, 0, 1)).toBeUndefined()
    expect(createBladeSkills(null, 100, 0, 1)).toBeUndefined()
    expect(createBladeSkills(undefined, 100, 0, 1)).toBeUndefined()
    expect(createBladeSkills([{ id: 'nope' as SkillId, level: 3 }], 100, 0, 1)).toBeUndefined()
  })

  it('sanitises: drops unknown + duplicate ids, caps at 3 slots (SKILL_BLADE_SLOTS), clamps levels', () => {
    const s = createBladeSkills([
      { id: 'bogus' as SkillId, level: 5 },
      { id: 'lucky_edge', level: 99 },
      { id: 'lucky_edge', level: 1 },
      { id: 'momentum', level: -4 },
      { id: 'mirror_plate', level: 5 }
    ], 100, 0, 1)!
    expect(s.ids).toEqual(['lucky_edge', 'momentum', 'mirror_plate'])
    expect(s.lv).toEqual({ lucky_edge: 10, momentum: 1, mirror_plate: 5 })
    expect(s.luckyChance).toBe(skillParams('lucky_edge', 10).chance)
    expect(s.momentumPerStack).toBe(skillParams('momentum', 1).perStack)
    expect(s.mirrorChance).toBe(skillParams('mirror_plate', 5).chance)
    const nan = createBladeSkills([{ id: 'static_charge', level: Number.NaN }], 100, 0, 1)!
    expect(nan.lv.static_charge).toBe(1)
  })

  it('bitmask + params come from the catalog (SKILL_POWER_SCALE applied there)', () => {
    const b = bearer('player', ['hazard_ward', 'homing_rockets'], 7)
    expect(hasSkill(b, 'hazard_ward')).toBe(true)
    expect(hasSkill(b, 'homing_rockets')).toBe(true)
    expect(hasSkill(b, 'mirror_plate')).toBe(false)
    expect(hasSkill(blade('npc'), 'mirror_plate')).toBe(false)
    const hw = skillParams('hazard_ward', 7)
    const hr = skillParams('homing_rockets', 7)
    const s = b.skills!
    expect([s.wardLava, s.wardThunder, s.wardChip, s.wardShockKeep]).toEqual([hw.lava, hw.thunder, hw.chip, hw.shockKeep])
    expect([s.rocketEveryN, s.rocketFrac, s.rocketMaxTargets]).toEqual([hr.everyN, hr.frac, hr.maxTargets])
    // every skill resolves its params
    for (const id of ['phase_step', 'guard_shell', 'second_wind', 'opening_salvo', 'static_charge', 'mirror_plate'] as SkillId[]) {
      expect(createBladeSkills([{ id, level: 4 }], 100, 0, 1)!.has).toBeGreaterThan(0)
    }
  })

  it('Guard Shell: shield = round(maxHp × pct), min 1', () => {
    expect(createBladeSkills([{ id: 'guard_shell', level: 10 }], 137, 0, 1)!.shield).toBe(Math.round(137 * 0.16))
    const tiny = createBladeSkills([{ id: 'guard_shell', level: 1 }], 4, 0, 1)!
    expect(tiny.shield).toBe(1)
    expect(tiny.shieldMax).toBe(1)
    expect(createBladeSkills([{ id: 'lucky_edge', level: 1 }], 100, 0, 1)!.shield).toBe(0)
  })
})

// ─── determinism ───────────────────────────────────────────────────────────

describe('per-blade streams (§9.1)', () => {
  const draws = (f: () => number, n = 32) => Array.from({ length: n }, f)

  it('same seed + syncKey → identical sequence; runtime draws = bladeStream', () => {
    expect(draws(bladeStream(42, 3))).toEqual(draws(bladeStream(42, 3)))
    expect(bladeStreamSeed(42, 3)).toBe(bladeStreamSeed(42, 3))
    // the runtime's inline stream draws the same numbers as bladeStream()
    const ref = bladeStream(777, 101)
    const s = createBladeSkills([{ id: 'lucky_edge', level: 10 }], 100, 101, 777)!
    const att = { ...blade('player'), skills: s }
    const def = blade('npc')
    const out = createOutgoingResult()
    for (let i = 0; i < 50; i++) {
      const r = ref()
      outgoingSkillMul(att, def, 10, 'hit', false, null, out)
      expect(out.lucky).toBe(r < s.luckyChance)
    }
  })

  it('different syncKey / seed → independent streams', () => {
    const a = draws(bladeStream(42, 0), 200)
    const b = draws(bladeStream(42, 1), 200)
    const c = draws(bladeStream(43, 0), 200)
    const same = (x: number[], y: number[]) => x.filter((v, i) => v === y[i]).length
    expect(same(a, b)).toBe(0)
    expect(same(a, c)).toBe(0)
    // distinct seeds for host 0..3, guest 100..103, children
    const keys = [0, 1, 2, 3, 100, 101, 102, 103, 1000, 1001, 102000]
    expect(new Set(keys.map(k => bladeStreamSeed(42, k))).size).toBe(keys.length)
    // correlation sanity: same-index draws uncorrelated
    const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length
    const ma = mean(a), mb = mean(b)
    let cov = 0, va = 0, vb = 0
    for (let i = 0; i < a.length; i++) {
      cov += (a[i]! - ma) * (b[i]! - mb)
      va += (a[i]! - ma) ** 2
      vb += (b[i]! - mb) ** 2
    }
    expect(Math.abs(cov / Math.sqrt(va * vb))).toBeLessThan(0.25)
  })

  it('never differs from the match stream and never advances it', () => {
    for (const k of [0, 1, 100, 1000]) expect(bladeStreamSeed(42, k)).not.toBe(42)
    seedMatchRng(99)
    const expected = draws(createRng(99), 5)
    const b = createBladeSkills([{ id: 'lucky_edge', level: 10 }, { id: 'mirror_plate', level: 10 }], 100, 0, 99)!
    const att = { ...blade('player'), skills: b }
    const def = { ...blade('npc'), skills: createBladeSkills([{ id: 'mirror_plate', level: 10 }], 100, 100, 99)! }
    for (let i = 0; i < 20; i++) {
      outgoingSkillMul(att, def, 10, 'hit', false, null, createOutgoingResult())
      incomingSkill(def, att, 10, 'hit', i, 1, createIncomingResult())
    }
    expect(draws(matchRng, 5)).toEqual(expected)
  })

  it('PvP perspective: the same procs whichever client iterates first', () => {
    // host client iterates [p0, g0], guest client [g0, p0]; each blade draws
    // only its own stream, so every blade's proc sequence matches.
    const run = (hostFirst: boolean) => {
      const p0 = { ...blade('player'), syncKey: 0 }
      const g0 = { ...blade('npc'), syncKey: 100 }
      p0.skills = createBladeSkills([{ id: 'lucky_edge', level: 10 }], 100, 0, 5)
      g0.skills = createBladeSkills([{ id: 'lucky_edge', level: 10 }], 100, 100, 5)
      const out = createOutgoingResult()
      const log: string[] = []
      for (let i = 0; i < 60; i++) {
        const order = hostFirst ? [p0, g0] : [g0, p0]
        for (const b of order) {
          const other = b === p0 ? g0 : p0
          outgoingSkillMul(b, other, 10, 'hit', false, null, out)
          log.push(`${b.syncKey}:${i}:${out.lucky}`)
        }
      }
      return log.sort()
    }
    expect(run(true)).toEqual(run(false))
  })
})

// ─── §5 step 2: attacker ───────────────────────────────────────────────────

describe('outgoingSkillMul (Lucky Edge → Momentum → clamp)', () => {
  it('Lucky Edge: fires below chance, not at/above it', () => {
    const le = skillParams('lucky_edge', 10)
    const a = bearer('player', ['lucky_edge'], 10, stub(le.chance - 1e-9, le.chance))
    const d = blade('npc')
    const out = createOutgoingResult()
    expect(outgoingSkillMul(a, d, 10, 'hit', false, null, out)).toBe(le.mult)
    expect(out.lucky).toBe(true)
    expect(outgoingSkillMul(a, d, 10, 'hit', false, null, out)).toBe(1)
    expect(out.lucky).toBe(false)
  })

  it('Lucky Edge never rolls on a positional / Star crit', () => {
    const a = bearer('player', ['lucky_edge'], 10, stub())
    const out = createOutgoingResult()
    expect(outgoingSkillMul(a, blade('npc'), 10, 'hit', true, null, out)).toBe(1)
    expect(a.rolls.draws()).toBe(0)
  })

  it('no roll: no skills, zero damage, friendly target, non-hit kinds', () => {
    const out = createOutgoingResult()
    expect(outgoingSkillMul(blade('player'), blade('npc'), 10, 'hit', false, null, out)).toBe(1)
    const a = bearer('player', ['lucky_edge', 'momentum'], 10, stub())
    expect(outgoingSkillMul(a, blade('npc'), 0, 'hit', false, a.id, out)).toBe(1)
    expect(outgoingSkillMul(a, blade('player'), 10, 'hit', false, a.id, out)).toBe(1)
    for (const k of NON_HIT_KINDS) expect(outgoingSkillMul(a, blade('npc'), 10, k, false, a.id, out)).toBe(1)
    expect(a.rolls.draws()).toBe(0)
    expect(a.skills!.stacks).toBe(0)
  })

  it('Momentum: hit multiplies by stacks counted BEFORE it adds its own; cap 3; own launch only', () => {
    const k = skillParams('momentum', 10).perStack
    const a = bearer('player', ['momentum'], 10)
    const d = blade('npc')
    const out = createOutgoingResult()
    expect(outgoingSkillMul(a, d, 10, 'hit', false, a.id, out)).toBe(1) // 0 stacks
    expect(a.skills!.stacks).toBe(1)
    expect(outgoingSkillMul(a, d, 10, 'hit', false, a.id, out)).toBeCloseTo(1 + k)
    expect(out.momentumStacks).toBe(1)
    outgoingSkillMul(a, d, 10, 'hit', false, a.id, out)
    outgoingSkillMul(a, d, 10, 'hit', false, a.id, out)
    outgoingSkillMul(a, d, 10, 'hit', false, a.id, out)
    expect(a.skills!.stacks).toBe(3)
    expect(out.mul).toBeCloseTo(1 + 3 * k)
    // not the launched blade: no multiplier, no stack
    beginLaunchSkills(a)
    expect(outgoingSkillMul(a, d, 10, 'hit', false, 999, out)).toBe(1)
    expect(outgoingSkillMul(a, d, 10, 'hit', false, null, out)).toBe(1)
    expect(a.skills!.stacks).toBe(0)
  })

  it('Momentum: wall/island rebounds stack during own launch only, cap 3, reset on beginLaunch', () => {
    const a = bearer('player', ['momentum'], 10)
    onOwnBounce(a, 999)
    expect(a.skills!.stacks).toBe(0)
    for (let i = 0; i < 5; i++) onOwnBounce(a, a.id)
    expect(a.skills!.stacks).toBe(3)
    beginLaunchSkills(a)
    expect(a.skills!.stacks).toBe(0)
    // no-ops on blades without skills / without momentum
    const plain = blade('player')
    onOwnBounce(plain, plain.id)
    beginLaunchSkills(plain)
    const lucky = bearer('player', ['lucky_edge'])
    onOwnBounce(lucky, lucky.id)
    expect(lucky.skills!.stacks).toBe(0)
  })

  it(`clamps Lucky × Momentum to SKILL_HIT_MUL_CAP = ${SKILL_HIT_MUL_CAP}`, () => {
    expect(SKILL_HIT_MUL_CAP).toBe(2.2)
    // L10: 2.0 × 1.225 = 2.45 → 2.2
    const a = bearer('player', ['lucky_edge', 'momentum'], 10, stub(0))
    for (let i = 0; i < 3; i++) onOwnBounce(a, a.id)
    const out = createOutgoingResult()
    expect(outgoingSkillMul(a, blade('npc'), 10, 'hit', false, a.id, out)).toBe(2.2)
    expect(out.clamped).toBe(true)
    expect(out.lucky).toBe(true)
    expect(out.momentumStacks).toBe(3)
    // L1: 1.5 × 1.075 = 1.6125 → not clamped
    const b = bearer('player', ['lucky_edge', 'momentum'], 1, stub(0))
    for (let i = 0; i < 3; i++) onOwnBounce(b, b.id)
    expect(outgoingSkillMul(b, blade('npc'), 10, 'hit', false, b.id, out)).toBeCloseTo(1.5 * 1.075)
    expect(out.clamped).toBe(false)
  })
})

// ─── §5 step 3: defender ───────────────────────────────────────────────────

describe('incomingSkill (Phase Step → Mirror Plate)', () => {
  it('Phase Step negates, opens a 300 ms window, starts the cooldown', () => {
    const ps = skillParams('phase_step', 10)
    const d = bearer('player', ['phase_step'], 10, stub(0))
    const a = blade('npc')
    const out = createIncomingResult()
    incomingSkill(d, a, 30, 'hit', 1000, 1, out)
    expect(out).toMatchObject({ taken: 0, reflect: 0, dodged: true, mirrored: false })
    expect(d.skills!.phasedUntil).toBe(1000 + PHASE_WINDOW_MS)
    expect(d.skills!.dodgeReadyAt).toBe(1000 + ps.cooldownMs)
    // inside the window: every enemy hit is ignored without a roll
    incomingSkill(d, a, 30, 'hit', 1000 + PHASE_WINDOW_MS - 1, 1, out)
    expect(out).toMatchObject({ taken: 0, phased: true, dodged: false })
    expect(isPhased(d, 1299)).toBe(true)
    expect(isPhased(d, 1300)).toBe(false)
    expect(isPhased(blade('npc'), 0)).toBe(false)
    // after the window but on cooldown: no Phase roll (no draw), full hit
    incomingSkill(d, a, 30, 'hit', 1000 + PHASE_WINDOW_MS, 1, out)
    expect(out).toMatchObject({ taken: 30, dodged: false, phased: false })
    expect(d.rolls.draws()).toBe(1)
    // cooldown over: rolls again
    d.rolls.push(0.99)
    incomingSkill(d, a, 30, 'hit', 1000 + ps.cooldownMs, 1, out)
    expect(d.rolls.draws()).toBe(2)
    expect(out.taken).toBe(30)
  })

  it('the phase window also blocks ENEMY Spiky chip, not friendly chip', () => {
    const d = bearer('player', ['phase_step'], 10, stub(0))
    incomingSkill(d, blade('npc'), 30, 'hit', 0, 1, createIncomingResult())
    expect(blocksEnemyChip(d, blade('npc'), 100)).toBe(true)
    expect(blocksEnemyChip(d, blade('player'), 100)).toBe(false)
    expect(blocksEnemyChip(d, blade('npc'), 300)).toBe(false)
  })

  it('Mirror Plate: takes half, reflects ½·dmg / max(1, attacker def)', () => {
    const d = bearer('player', ['mirror_plate'], 10, stub(0, 0, 0.99))
    const out = createIncomingResult()
    incomingSkill(d, blade('npc'), 40, 'hit', 0, 2, out)
    expect(out).toMatchObject({ taken: 20, reflect: 10, mirrored: true })
    incomingSkill(d, blade('npc'), 40, 'hit', 0, 0.5, out) // def < 1 → divided by 1
    expect(out.reflect).toBe(20)
    incomingSkill(d, blade('npc'), 40, 'hit', 0, 1, out) // failed roll
    expect(out).toMatchObject({ taken: 40, reflect: 0, mirrored: false })
  })

  it('Phase resolves before Mirror; if it fires Mirror does not roll', () => {
    const d = bearer('player', ['phase_step', 'mirror_plate'], 10, stub(0))
    const out = createIncomingResult()
    incomingSkill(d, blade('npc'), 40, 'hit', 0, 1, out)
    expect(out).toMatchObject({ taken: 0, reflect: 0, dodged: true, mirrored: false })
    expect(d.rolls.draws()).toBe(1)
    // Phase fails its roll → Mirror rolls next (two draws)
    const e = bearer('player', ['phase_step', 'mirror_plate'], 10, stub(0.99, 0))
    incomingSkill(e, blade('npc'), 40, 'hit', 0, 1, out)
    expect(out).toMatchObject({ taken: 20, reflect: 20, mirrored: true, dodged: false })
    expect(e.rolls.draws()).toBe(2)
  })

  it('no roll: no skills, zero damage, friendly attacker, non-hit kinds (recursion guard)', () => {
    const out = createIncomingResult()
    incomingSkill(blade('player'), blade('npc'), 40, 'hit', 0, 1, out)
    expect(out.taken).toBe(40)
    const d = bearer('player', ['phase_step', 'mirror_plate'], 10, stub())
    incomingSkill(d, blade('npc'), 0, 'hit', 0, 1, out)
    incomingSkill(d, blade('player'), 40, 'hit', 0, 1, out)
    expect(out.taken).toBe(40)
    for (const k of NON_HIT_KINDS) {
      incomingSkill(d, blade('npc'), 40, k, 0, 1, out)
      expect(out).toMatchObject({ taken: 40, reflect: 0, dodged: false, mirrored: false })
    }
    expect(d.rolls.draws()).toBe(0)
  })
})

// ─── §5 step 5: applyHpLoss ────────────────────────────────────────────────

describe('applyHpLoss (Ward → Shield → HP → Second Wind)', () => {
  it('plain blades just lose HP (floored at 0); no-ops on dmg ≤ 0 / dead target', () => {
    const b = blade('npc')
    const out = createHpLossResult()
    expect(applyHpLoss(b, 30, 'hit', out)).toBe(30)
    expect(b.hp).toBe(70)
    expect(applyHpLoss(b, 500, 'lava')).toBe(70)
    expect(b.hp).toBe(0)
    expect(applyHpLoss(b, 5, 'hit', out)).toBe(0)
    expect(out.hpLost).toBe(0)
    const c = blade('npc')
    expect(applyHpLoss(c, 0, 'hit')).toBe(0)
    expect(applyHpLoss(c, -3, 'hit')).toBe(0)
    expect(applyHpLoss(c, Number.NaN, 'hit')).toBe(0)
    expect(c.hp).toBe(100)
  })

  it('Guard Shell absorbs before HP for EVERY kind, never regenerates', () => {
    for (const k of ALL_KINDS) {
      const b = bearer('player', ['guard_shell'], 10) // shield 16
      const out = createHpLossResult()
      expect(applyHpLoss(b, 10, k, out)).toBe(0)
      expect(out.absorbed).toBe(10)
      expect(b.hp).toBe(100)
      expect(b.skills!.shield).toBe(6)
      expect(effectiveHp(b)).toBe(106)
      expect(applyHpLoss(b, 10, k, out)).toBe(4)
      expect(out).toMatchObject({ absorbed: 6, hpLost: 4, shieldBroken: true })
      expect(b.skills!.shield).toBe(0)
      expect(applyHpLoss(b, 5, k, out)).toBe(5)
      expect(out).toMatchObject({ absorbed: 0, shieldBroken: false })
    }
    expect(effectiveHp(blade('npc'))).toBe(100)
  })

  it('Hazard Ward: lava/burn/thunder/chip reduced (burn = lava share), applied BEFORE the shield; other kinds untouched', () => {
    const hw = skillParams('hazard_ward', 10)
    for (const k of ALL_KINDS) {
      const b = bearer('player', ['hazard_ward'], 10)
      const out = createHpLossResult()
      const lost = applyHpLoss(b, 20, k, out)
      const f = k === 'lava' || k === 'burn' ? 1 - hw.lava : k === 'thunder' ? 1 - hw.thunder : k === 'chip' ? 1 - hw.chip : 1
      expect(lost).toBeCloseTo(20 * f)
      expect(out.warded).toBeCloseTo(20 - 20 * f)
      expect(hazardScale(b, k)).toBeCloseTo(f)
    }
    // ward first, then shield absorbs the reduced amount
    const b = bearer('player', ['hazard_ward', 'guard_shell'], 10) // shield 16
    const out = createHpLossResult()
    applyHpLoss(b, 20, 'lava', out) // 20 × 0.6 = 12 → all absorbed
    expect(out.absorbed).toBeCloseTo(12)
    expect(out.hpLost).toBe(0)
    expect(hazardScale(blade('npc'), 'lava')).toBe(1)
    expect(hazardScale(bearer('player', ['guard_shell']), 'lava')).toBe(1)
  })

  it('Second Wind: once, at ≤ 35 %, heal capped at max HP', () => {
    const sw = skillParams('second_wind', 10) // heal 18 %
    const b = bearer('player', ['second_wind'], 10)
    const out = createHpLossResult()
    applyHpLoss(b, 60, 'hit', out) // 40 % → above threshold
    expect(out.healed).toBe(0)
    applyHpLoss(b, 6, 'hit', out) // 34 % → fires
    expect(out.healed).toBeCloseTo(sw.heal * 100)
    expect(b.hp).toBeCloseTo(34 + 18)
    expect(b.skills!.secondWindUsed).toBe(true)
    applyHpLoss(b, 30, 'hit', out) // 22 % → already used
    expect(out.healed).toBe(0)
    // exactly at the threshold fires
    const c = bearer('player', ['second_wind'], 10)
    applyHpLoss(c, 65, 'hit', out)
    expect(out.healed).toBeGreaterThan(0)
  })

  it('Second Wind: never on the killing blow, fires on any kind, watches HP not the shield', () => {
    const b = bearer('player', ['second_wind'], 10)
    const out = createHpLossResult()
    applyHpLoss(b, 150, 'hit', out)
    expect(b.hp).toBe(0)
    expect(out.healed).toBe(0)
    expect(b.skills!.secondWindUsed).toBe(false)
    const c = bearer('player', ['second_wind'], 10)
    applyHpLoss(c, 70, 'lava', out)
    expect(out.healed).toBeGreaterThan(0)
    // shield + wind: the fully-absorbed loss takes no HP → no heal; fires once HP drops
    const d = bearer('player', ['guard_shell', 'second_wind'], 10) // shield 16
    d.hp = 30
    applyHpLoss(d, 10, 'hit', out)
    expect(out).toMatchObject({ absorbed: 10, hpLost: 0, healed: 0 })
    applyHpLoss(d, 10, 'hit', out) // 6 absorbed, 4 HP
    expect(out.healed).toBeCloseTo(18)
    // cap at max HP: tiny max HP with a large heal
    const e = bearer('player', ['second_wind'], 10, stub(), { hp: 100, maxHp: 100 })
    e.skills!.windHeal = 5 // (test-only) overflow the cap
    applyHpLoss(e, 70, 'hit', out)
    expect(e.hp).toBe(100)
    expect(out.healed).toBe(70)
  })

  it('works without an out object', () => {
    const b = bearer('player', ['guard_shell', 'hazard_ward'], 10)
    expect(applyHpLoss(b, 100, 'lava')).toBeCloseTo(60 - 16)
  })
})

// ─── refHit ────────────────────────────────────────────────────────────────

describe('refHit', () => {
  const att: SkillRefStats = { damageMultiplier: 1.3, defenseMultiplier: 1, speedMultiplier: 1.2, totalWeight: 20 }
  const def: SkillRefStats = { damageMultiplier: 1, defenseMultiplier: 2, speedMultiplier: 1, totalWeight: 25 }
  const base = (spd: number, defMul: number) => 0.5 * 14 * spd * 1.3 * 20 / (25 * defMul) * 0.91

  it('collision formula at 50 % max speed, target weight + defence', () => {
    expect(refHit(att, 'round', def)).toBeCloseTo(base(1.2, 2))
  })
  it('speed factor capped at 1.5', () => {
    expect(refHit({ ...att, speedMultiplier: 2.6 }, 'round', def)).toBeCloseTo(base(1.5, 2))
  })
  it('Piercer ignores 75 % of the defence above 1, Star 25 %', () => {
    expect(refHit(att, 'piercer', def)).toBeCloseTo(base(1.2, 1.25))
    expect(refHit(att, 'star', def)).toBeCloseTo(base(1.2, 1.75))
  })
})

// ─── §5 step 6: contact skills ─────────────────────────────────────────────

describe('onEnemyContact — Homing Rockets', () => {
  const N = skillParams('homing_rockets', 10).everyN // 5
  const frac = skillParams('homing_rockets', 10).frac

  it('counts contacts; at everyN fires and resets', () => {
    const b = bearer('player', ['homing_rockets'], 10)
    const foe = blade('npc', { hp: 50 })
    const out = createContactResult()
    for (let i = 1; i < N; i++) {
      onEnemyContact(b, foe, 0, null, 0, [foe], statsOf, out)
      expect(out.volley).toBe(false)
      expect(b.skills!.rocketCount).toBe(i)
    }
    onEnemyContact(b, foe, 1000, null, 0, [foe], statsOf, out)
    expect(out.volley).toBe(true)
    expect(out.volleyCount).toBe(1)
    expect(out.volleyTargets[0]).toBe(foe)
    expect(out.volleyArriveAt).toBe(1000 + ROCKET_FLIGHT_MS)
    expect(out.volleyDamage[0]).toBeCloseTo(Math.max(1, frac * refHit(STATS, 'round', STATS)))
    expect(b.skills!.rocketCount).toBe(0)
  })

  it('≤ 3 targets, lowest HP first, ties by syncKey (not array order)', () => {
    const b = bearer('player', ['homing_rockets'], 10)
    b.skills!.rocketCount = N - 1
    const f = [
      blade('npc', { hp: 40, syncKey: 9 }),
      blade('npc', { hp: 10, syncKey: 5 }),
      blade('npc', { hp: 40, syncKey: 3 }),
      blade('npc', { hp: 80, syncKey: 1 }),
      blade('npc', { hp: 90, syncKey: 2 })
    ]
    const out = createContactResult<TestBlade>()
    onEnemyContact(b, f[0]!, 0, null, 0, f, statsOf, out)
    expect(out.volleyCount).toBe(3)
    expect(out.volleyTargets.map(t => t?.syncKey)).toEqual([5, 3, 9])
    // split evenly (min 1 each)
    const per = Math.max(1, frac * refHit(STATS, 'round', STATS) / 3)
    expect(out.volleyDamage).toEqual([per, per, per])
    // the reversed array picks the same targets
    b.skills!.rocketCount = N - 1
    onEnemyContact(b, f[0]!, 0, null, 0, [...f].reverse(), statsOf, out)
    expect(out.volleyTargets.map(t => t?.syncKey)).toEqual([5, 3, 9])
  })

  it('split-evenly damage uses the per-target refHit, min 1 each', () => {
    const b = bearer('player', ['homing_rockets'], 10)
    b.skills!.rocketCount = N - 1
    const tank = blade('npc', { hp: 5 })
    const glass = blade('npc', { hp: 6 })
    const heavy: SkillRefStats = { ...STATS, defenseMultiplier: 1000 }
    const light: SkillRefStats = { ...STATS, totalWeight: 0.01 }
    const so = (x: SkillBlade) => (x === tank ? heavy : x === glass ? light : STATS)
    const out = createContactResult()
    onEnemyContact(b, tank, 0, null, 0, [tank, glass], so, out)
    expect(out.volleyDamage[0]).toBe(1)
    expect(out.volleyDamage[1]).toBeCloseTo(frac * refHit(STATS, 'round', light) / 2)
  })

  it('ghost-linked twins count once; invulnerable, dead and same-owner blades skipped', () => {
    const b = bearer('player', ['homing_rockets'], 10)
    b.skills!.rocketCount = N - 1
    const twinA = blade('npc', { hp: 20, syncKey: 10 })
    const twinB = blade('npc', { hp: 20, syncKey: 11 })
    twinA.linkedIds = [twinB.id]
    twinB.linkedIds = [twinA.id]
    const invuln = blade('npc', { hp: 1, invulnerableUntil: 500 })
    const dead = blade('npc', { hp: 0 })
    const ally = blade('player', { hp: 2 })
    const other = blade('npc', { hp: 70, syncKey: 12 })
    const out = createContactResult<TestBlade>()
    onEnemyContact(b, twinA, 100, null, 0, [twinB, invuln, dead, ally, twinA, other], statsOf, out)
    expect(out.volleyCount).toBe(2)
    expect(out.volleyTargets.slice(0, 2)).toEqual([twinA, other])
    expect(out.volleyTargets[2]).toBeNull()
    // invulnerability ends → eligible
    b.skills!.rocketCount = N - 1
    onEnemyContact(b, twinA, 500, null, 0, [twinB, invuln, twinA, other], statsOf, out)
    expect(out.volleyTargets[0]).toBe(invuln)
    // one-sided link also dedupes
    const c = bearer('player', ['homing_rockets'], 10)
    c.skills!.rocketCount = N - 1
    const g1 = blade('npc', { hp: 20, syncKey: 1 })
    const g2 = blade('npc', { hp: 20, syncKey: 2, linkedIds: [g1.id] })
    onEnemyContact(c, g1, 0, null, 0, [g1, g2], statsOf, out)
    expect(out.volleyCount).toBe(1)
  })

  it('no valid targets → the volley fizzles (counter still resets)', () => {
    const b = bearer('player', ['homing_rockets'], 10)
    b.skills!.rocketCount = N - 1
    const out = createContactResult()
    onEnemyContact(b, blade('npc'), 0, null, 0, [], statsOf, out)
    expect(out).toMatchObject({ volley: true, volleyCount: 0 })
    expect(b.skills!.rocketCount).toBe(0)
  })

  it('nothing for a dead bearer, a friendly contact, or a blade without skills', () => {
    const out = createContactResult()
    const b = bearer('player', ['homing_rockets', 'static_charge'], 10, stub(), { hp: 0 })
    onEnemyContact(b, blade('npc'), 0, null, 0, [], statsOf, out)
    expect(b.skills!.rocketCount).toBe(0)
    const c = bearer('player', ['homing_rockets'], 10)
    onEnemyContact(c, blade('player'), 0, null, 0, [], statsOf, out)
    expect(c.skills!.rocketCount).toBe(0)
    onEnemyContact(blade('player'), blade('npc'), 0, null, 0, [], statsOf, out)
    expect(out.volley).toBe(false)
  })
})

describe('onEnemyContact — Static Charge + stun turns', () => {
  const moving = (over: Partial<TestBlade> = {}) => blade('npc', { vx: 3, vy: 4, ...over })

  it('procs only vs the LAUNCHED, living, still-moving enemy; drains 90 % speed; stuns for next turn', () => {
    const b = bearer('player', ['static_charge'], 10, stub(0))
    const e = moving()
    const out = createContactResult()
    onEnemyContact(b, e, 100, 999, 4, [], statsOf, out) // not launched
    onEnemyContact(b, moving({ hp: 0, id: 55 }), 100, 55, 4, [], statsOf, out) // dead
    const still = moving({ vx: 0.1, vy: 0.1 })
    onEnemyContact(b, still, 100, still.id, 4, [], statsOf, out) // below stop threshold
    expect(b.rolls.draws()).toBe(0)
    onEnemyContact(b, e, 100, e.id, 4, [], statsOf, out)
    expect(out).toMatchObject({ shocked: true, stunned: true, stunTurn: 5 })
    expect(e.vx).toBeCloseTo(0.3)
    expect(e.vy).toBeCloseTo(0.4)
    expect(e.lastShockMs).toBe(100)
    expect(e.stunnedForTurn).toBe(5)
    expect(e.stunImmuneTurn).toBe(6)
    expect(isStunnedFor(e, 5)).toBe(true)
    expect(isStunnedFor(e, 4)).toBe(false)
  })

  it('shares the 250 ms lastShockMs gate (no roll while gated); failed roll does nothing', () => {
    const b = bearer('player', ['static_charge'], 10, stub(0.99, 0))
    const e = moving({ lastShockMs: 0 })
    const out = createContactResult()
    onEnemyContact(b, e, 249, e.id, 0, [], statsOf, out)
    expect(b.rolls.draws()).toBe(0)
    onEnemyContact(b, e, 250, e.id, 0, [], statsOf, out) // roll 0.99 → miss
    expect(out.shocked).toBe(false)
    expect(e.vx).toBe(3)
    onEnemyContact(b, e, 251, e.id, 0, [], statsOf, out) // roll 0 → proc
    expect(out.shocked).toBe(true)
  })

  it('a blade stunned for turn T cannot be stunned for T + 1 (shock still drains)', () => {
    const b = bearer('player', ['static_charge'], 10, stub(0, 0, 0))
    const e = moving()
    const out = createContactResult()
    onEnemyContact(b, e, 0, e.id, 1, [], statsOf, out) // stunned for 2, immune 3
    expect(e.stunnedForTurn).toBe(2)
    // (only reachable if it acts on turn 2 anyway, e.g. PvP edge) → would stun for 3
    e.vx = 3
    onEnemyContact(b, e, 1000, e.id, 2, [], statsOf, out)
    expect(out).toMatchObject({ shocked: true, stunned: false })
    expect(e.stunnedForTurn).toBe(2)
    // turn 3 launch: stun for 4 allowed again
    e.vx = 3
    onEnemyContact(b, e, 2000, e.id, 3, [], statsOf, out)
    expect(out).toMatchObject({ stunned: true, stunTurn: 4 })
  })

  it('stun honoured by the pick: countPickable; all stunned → 0 (turn skipped)', () => {
    const a = blade('npc', { stunnedForTurn: 3 })
    const b = blade('npc', { stunnedForTurn: 3 })
    const dead = blade('npc', { hp: 0 })
    expect(countPickable([a, b, dead], 3)).toBe(0)
    expect(countPickable([a, b, dead], 4)).toBe(2)
    b.stunnedForTurn = undefined
    expect(countPickable([a, b], 3)).toBe(1)
  })

  it('owner-agnostic: an npc-side bearer stuns a launched player blade', () => {
    const b = bearer('npc', ['static_charge'], 10, stub(0))
    const p = blade('player', { vx: 5 })
    const out = createContactResult()
    onEnemyContact(b, p, 0, p.id, 7, [], statsOf, out)
    expect(p.stunnedForTurn).toBe(8)
  })

  it('rockets and static both run on the same contact (rockets first, one static roll)', () => {
    const N = skillParams('homing_rockets', 10).everyN
    const b = bearer('player', ['homing_rockets', 'static_charge'], 10, stub(0))
    b.skills!.rocketCount = N - 1
    const e = moving({ hp: 10 })
    const out = createContactResult()
    onEnemyContact(b, e, 0, e.id, 0, [e], statsOf, out)
    expect(out.volley && out.shocked && out.stunned).toBe(true)
    expect(b.rolls.draws()).toBe(1)
  })
})

// ─── Opening Salvo ─────────────────────────────────────────────────────────

describe('Opening Salvo', () => {
  it('teamSalvoPct: highest carrier, 0 without', () => {
    const lo = bearer('player', ['opening_salvo'], 1)
    const hi = bearer('player', ['opening_salvo'], 10)
    expect(teamSalvoPct([blade('player'), lo, hi])).toBe(skillParams('opening_salvo', 10).pct)
    expect(teamSalvoPct([blade('player'), bearer('player', ['momentum'])])).toBe(0)
    expect(teamSalvoPct([])).toBe(0)
  })

  it('pct × maxHp, min 1, non-lethal', () => {
    expect(salvoDamage(blade('npc', { hp: 200, maxHp: 200 }), 0.14)).toBeCloseTo(28)
    expect(salvoDamage(blade('npc', { hp: 5, maxHp: 5 }), 0.05)).toBe(1) // 0.25 → min 1
    expect(salvoDamage(blade('npc', { hp: 3, maxHp: 200 }), 0.14)).toBe(2) // hp − 1
    expect(salvoDamage(blade('npc', { hp: 1 }), 0.14)).toBe(0)
    expect(salvoDamage(blade('npc'), 0)).toBe(0)
  })

  it('salvo damage never procs defender skills and is absorbed by the shield', () => {
    const e = bearer('npc', ['guard_shell', 'mirror_plate', 'phase_step'], 10, stub())
    const d = salvoDamage(e, 0.14)
    const out = createIncomingResult()
    incomingSkill(e, blade('player'), d, 'salvo', 0, 1, out)
    expect(out.taken).toBe(d)
    applyHpLoss(e, out.taken, 'salvo')
    expect(e.skills!.shield).toBeCloseTo(16 - 14)
    expect(e.rolls.draws()).toBe(0)
  })
})

// ─── §5 end-to-end: one armed contact, both directions ─────────────────────

/**
 * Reference implementation of the §5 order for one armed contact, exactly as
 * WP4 wires it in resolveCollision. Used to prove the ordering end-to-end.
 */
function armedContact(
  a: TestBlade,
  b: TestBlade,
  base: { ab: number; ba: number; aCrit?: boolean; bCrit?: boolean },
  now: number,
  launchedId: number | null,
  foesOf: (x: TestBlade) => TestBlade[],
  turnOf: (x: TestBlade) => number
) {
  const o = createOutgoingResult()
  const inA = createIncomingResult()
  const inB = createIncomingResult()
  const hl = createHpLossResult()
  // 1 base; 2 attacker skills
  let ab = base.ab * outgoingSkillMul(a, b, base.ab, 'hit', !!base.aCrit, launchedId, o)
  let ba = base.ba * outgoingSkillMul(b, a, base.ba, 'hit', !!base.bCrit, launchedId, o)
  // 3 defender skills
  incomingSkill(b, a, ab, 'hit', now, 1, inB)
  incomingSkill(a, b, ba, 'hit', now, 1, inA)
  ab = inB.taken
  ba = inA.taken
  // 4 anti-draw on hp + shield
  if (ba > 0 && effectiveHp(a) - ba <= 0 && ab > 0 && effectiveHp(b) - ab <= 0) {
    if (ab >= ba) ba = Math.max(0, effectiveHp(a) - 1)
    else ab = Math.max(0, effectiveHp(b) - 1)
  }
  // 5 applyHpLoss
  if (ab > 0) applyHpLoss(b, ab, 'hit', hl)
  if (ba > 0) applyHpLoss(a, ba, 'hit', hl)
  // 6 reflections, then contact skills (each skilled side)
  if (inB.reflect > 0 && a.hp > 0) applyHpLoss(a, inB.reflect, 'reflect')
  if (inA.reflect > 0 && b.hp > 0) applyHpLoss(b, inA.reflect, 'reflect')
  const cA = createContactResult<TestBlade>()
  const cB = createContactResult<TestBlade>()
  onEnemyContact(a, b, now, launchedId, turnOf(b), foesOf(a), statsOf, cA)
  onEnemyContact(b, a, now, launchedId, turnOf(a), foesOf(b), statsOf, cB)
  return { ab, ba, reflectToA: inB.reflect, reflectToB: inA.reflect, cA, cB }
}

describe('§5 order of operations (one armed contact)', () => {
  it('attacker mul → defender mirror → shield → HP → wind → reflect → contact', () => {
    // A: Lucky (fires) + Momentum 2 stacks, launched. B: Mirror (fires) + Guard Shell.
    const a = bearer('player', ['lucky_edge', 'momentum'], 10, stub(0))
    const b = bearer('npc', ['mirror_plate', 'guard_shell'], 10, stub(0))
    onOwnBounce(a, a.id)
    onOwnBounce(a, a.id)
    const r = armedContact(a, b, { ab: 20, ba: 0 }, 0, a.id, () => [], () => 0)
    const mul = Math.min(2.2, 2.0 * (1 + 2 * 0.075))
    expect(r.ab).toBeCloseTo(20 * mul * 0.5) // Mirror halves after the multiplier
    // B: shield 16 first, rest from HP
    expect(b.skills!.shield).toBe(0)
    expect(b.hp).toBeCloseTo(100 - (20 * mul * 0.5 - 16))
    // reflect goes to A as kind 'reflect' (no procs on A's side, A has no defensive skill)
    expect(r.reflectToA).toBeCloseTo(20 * mul * 0.5)
    expect(a.hp).toBeCloseTo(100 - 20 * mul * 0.5)
    expect(a.skills!.stacks).toBe(3)
  })

  it('Second Wind sits inside applyHpLoss after the shield; reflection is applied after both hits', () => {
    const a = bearer('player', ['second_wind'], 10, stub(), { hp: 40 })
    const b = bearer('npc', ['mirror_plate'], 10, stub(0))
    armedContact(a, b, { ab: 20, ba: 0 }, 0, a.id, () => [], () => 0)
    // A dealt 20 → B took 10, reflected 10 to A (40 → 30 = 30 % ≤ 35 %) → wind heals 18
    expect(b.hp).toBe(90)
    expect(a.hp).toBeCloseTo(30 + 18)
  })

  it('no recursion: a reflection onto a Mirror/Phase bearer never re-reflects or dodges', () => {
    const a = bearer('player', ['mirror_plate', 'phase_step'], 10, stub(0.99, 0.99)) // A's defence misses on B's hit
    const b = bearer('npc', ['mirror_plate', 'phase_step'], 10, stub(0.99, 0)) // B: Phase miss, Mirror hit
    const r = armedContact(a, b, { ab: 40, ba: 10 }, 0, null, () => [], () => 0)
    expect(r.reflectToA).toBe(20)
    expect(r.reflectToB).toBe(0)
    // A took 10 (hit) + 20 (reflect) — the reflect drew nothing more from A's stream
    expect(a.hp).toBe(70)
    expect(b.hp).toBe(80)
    expect(a.rolls.draws()).toBe(2)
    expect(b.rolls.draws()).toBe(2)
    expect(a.rolls.left() + b.rolls.left()).toBe(0)
  })

  it('anti-draw counts the shield as survivability', () => {
    const a = blade('player', { hp: 10 })
    const b = bearer('npc', ['guard_shell'], 10, stub(), { hp: 10 }) // effective 26
    const r = armedContact(a, b, { ab: 20, ba: 20 }, 0, null, () => [], () => 0)
    // B would NOT die with its shield → no anti-draw adjustment; A dies
    expect(r.ab).toBe(20)
    expect(a.hp).toBe(0)
    expect(b.hp).toBe(10 - 4)
  })

  it('owner-agnostic: the same procs with the teams swapped (npc bearer vs player)', () => {
    const run = (bearerOwner: 'player' | 'npc') => {
      const other = bearerOwner === 'player' ? 'npc' : 'player'
      const x = bearer(bearerOwner, ['lucky_edge', 'mirror_plate'], 10, stub(0, 0))
      const y = blade(other)
      const r = armedContact(x, y, { ab: 10, ba: 10 }, 0, null, () => [], () => 0)
      return [r.ab, r.ba, r.reflectToA, r.reflectToB, x.hp, y.hp]
    }
    expect(run('npc')).toEqual(run('player'))
  })

  it('friendly contact (same owner) never rolls anything', () => {
    const a = bearer('player', ['lucky_edge', 'mirror_plate'], 10, stub())
    const b = bearer('player', ['phase_step', 'homing_rockets'], 10, stub())
    armedContact(a, b, { ab: 10, ba: 10 }, 0, a.id, x => [x], () => 0)
    expect(a.rolls.draws() + b.rolls.draws()).toBe(0)
    expect(b.skills!.rocketCount).toBe(0)
  })

  it('rocket counter charges on hits dealt AND taken, once per contact per bearer', () => {
    const a = bearer('player', ['homing_rockets'], 10)
    const b = blade('npc')
    armedContact(a, b, { ab: 10, ba: 0 }, 0, a.id, () => [b], () => 0) // dealt
    armedContact(a, b, { ab: 0, ba: 10 }, 0, b.id, () => [b], () => 0) // taken
    expect(a.skills!.rocketCount).toBe(2)
  })
})

// ─── engine constant parity ────────────────────────────────────────────────

describe('engine constant mirrors', () => {
  it('match useSpinnerGame.ts (BASE_MAX_FORCE, STOP_THRESHOLD, DAMAGE_SCALE)', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
    expect(Number(/const BASE_MAX_FORCE = ([\d.]+)/.exec(src)?.[1])).toBe(ENGINE_BASE_MAX_FORCE)
    expect(Number(/const STOP_THRESHOLD = ([\d.]+)/.exec(src)?.[1])).toBe(ENGINE_STOP_THRESHOLD)
    const ds = /const DAMAGE_SCALE = ([\d.]+)/.exec(src)
    expect(Number(ds?.[1])).toBe(ENGINE_DAMAGE_SCALE)
  })
})
