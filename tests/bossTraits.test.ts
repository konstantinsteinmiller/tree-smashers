// Boss trait runtime (bosses-100-feature.md §4, §6.1, §9, §12.1; decisions
// B3 "freeze never costs a whole turn", B4 "slow stacks last 2 turns").
// Pure module import only (no useSpinnerGame / Vue graph).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { skillParams, type SkillId, type SkillLoadout } from '@/data/skillCatalog'
import {
  applyHpLoss,
  countPickable,
  createBladeSkills,
  createContactResult,
  createIncomingResult,
  hazardScale,
  incomingSkill,
  isStunnedFor,
  onEnemyContact,
  type SkillRefStats
} from '@/use/skills/skillRuntime'
import {
  BOSS_TRAIT_DEFAULTS,
  BOSS_TRAIT_TUNING,
  EMBER_HP_LOSS_KIND,
  EMBER_MASK_MAX_BLADES,
  addChillStack,
  applyEmberBurn,
  beginTeamTurnTraits,
  bossClockHashPart,
  chillEarliestExpiry,
  chillSpeedMul,
  createBossClock,
  createTraitContactResult,
  createTraitHudRow,
  emberDamage,
  emberReach,
  emberVictimMask,
  endTeamTurnTraits,
  frostTouch,
  frostTouchKeep,
  hasBossTraits,
  hasLivingEmberCarrier,
  initTraitVictim,
  isFrostLockedFor,
  novaCharge,
  onTraitContact,
  pruneChill,
  resetBossClock,
  resetBossTraitTuning,
  thawFrostLocks,
  tickBossClock,
  traitHashPart,
  tryFrostLock,
  writeTraitHud,
  type BossTrait,
  type TraitBlade
} from '@/use/bosses/bossTraits'

const STEP = 1000 / 60 // = useSpinnerGame FIXED_STEP_MS = sim TICK_MS

// ─── helpers ───────────────────────────────────────────────────────────────

let nextId = 1

function blade(owner: 'player' | 'npc', over: Partial<TraitBlade> = {}): TraitBlade {
  const id = nextId++
  return {
    id,
    syncKey: id,
    owner,
    hp: 100,
    maxHp: 100,
    vx: 10,
    vy: -5,
    x: 0,
    y: 0,
    radius: 28,
    config: { topPartId: 'round' },
    ...over
  }
}

const boss = (trait: BossTrait | undefined, over: Partial<TraitBlade> = {}): TraitBlade =>
  blade('npc', { radius: 44.8, config: { topPartId: 'round', bossTrait: trait }, ...over })

/** Give `b` skills at `level`; `rng` overrides its stream (0 = every roll procs). */
function withSkills(b: TraitBlade, ids: SkillId[], level = 10, rng: (() => number) | null = null): TraitBlade {
  const lo: SkillLoadout = ids.map(id => ({ id, level }))
  b.skills = createBladeSkills(lo, b.maxHp, b.syncKey, 1234, rng)
  return b
}

const bits = (mask: number, bl: TraitBlade[]): number[] =>
  bl.filter((_, i) => (mask & (1 << i)) !== 0).map(b => b.id)

beforeEach(() => resetBossTraitTuning())
afterEach(() => resetBossTraitTuning())

// ─── tuning ────────────────────────────────────────────────────────────────

describe('tuning (§4, §12.1)', () => {
  it('ships the design numbers', () => {
    expect(BOSS_TRAIT_DEFAULTS).toEqual({
      EMBER_PERIOD_MS: 2000,
      EMBER_RADIUS_MUL: 2.2,
      EMBER_PCT: 0.03,
      FROST_KEEP: 0.1,
      CHILL_PER_STACK: 0.1,
      CHILL_MAX: 5,
      CHILL_TURNS: 2,
      CHILL_GATE_MS: 250
    })
    expect(Object.isFrozen(BOSS_TRAIT_DEFAULTS)).toBe(true)
  })

  it('mirrors DEFAULT_KNOBS of tools/skills-sim/bosses100.mjs (G17-style drift guard)', () => {
    const src = readFileSync(resolve(__dirname, '../tools/skills-sim/bosses100.mjs'), 'utf8')
    const block = /DEFAULT_KNOBS = \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
    for (const [k, v] of Object.entries(BOSS_TRAIT_DEFAULTS)) {
      const m = new RegExp(`\\b${k}:\\s*([0-9.]+)`).exec(block)
      expect(m, k).not.toBeNull()
      expect(Number(m![1]), k).toBe(v)
    }
    // sim-only switches match the shipped rules (lock on, no lost turns)
    expect(/FROST_LOCK:\s*1\b/.test(block)).toBe(true)
    expect(/FROST_NEVER_SKIP:\s*1\b/.test(block)).toBe(true)
  })

  it('is mutable for the Boss Lab and resets', () => {
    BOSS_TRAIT_TUNING.EMBER_PCT = 0.5
    expect(emberDamage(blade('player'))).toBe(50)
    resetBossTraitTuning()
    expect(BOSS_TRAIT_TUNING).toEqual(BOSS_TRAIT_DEFAULTS)
  })
})

// ─── Ember Nova: combat clock ──────────────────────────────────────────────

describe('Ember Nova combat clock (§4.0, §4.1)', () => {
  const run = (c: ReturnType<typeof createBossClock>, steps: number, launched = true): number => {
    let novas = 0
    for (let i = 0; i < steps; i++) if (tickBossClock(c, STEP, launched)) novas++
    return novas
  }

  it('first nova after exactly 2,000 ms of combat (120 substeps), not before', () => {
    const c = createBossClock()
    expect(run(c, 119)).toBe(0)
    expect(tickBossClock(c, STEP, true)).toBe(true)
    expect(c.clockMs).toBeCloseTo(2000, 6)
    expect(c.nextNovaAt).toBe(4000)
  })

  it('does not run while aiming / intro / pause (non-launched phases)', () => {
    const c = createBossClock()
    expect(run(c, 100_000, false)).toBe(0)
    expect(c.clockMs).toBe(0)
    expect(novaCharge(c)).toBe(0)
  })

  it('pauses mid-charge and resumes where it stopped', () => {
    const c = createBossClock()
    expect(run(c, 60)).toBe(0)
    expect(novaCharge(c)).toBeCloseTo(0.5, 6)
    expect(run(c, 5000, false)).toBe(0)
    expect(novaCharge(c)).toBeCloseTo(0.5, 6)
    expect(run(c, 59)).toBe(0)
    expect(run(c, 1)).toBe(1)
    expect(novaCharge(c)).toBeCloseTo(0, 6)
  })

  it('one nova per period; survives turn changes; 10 s combat = 5 novas', () => {
    const c = createBossClock()
    let novas = 0
    for (let turn = 0; turn < 10; turn++) {
      novas += run(c, 60) // a launch of 1 s combat
      novas += run(c, 300, false) // aiming, announcement
    }
    expect(novas).toBe(5)
  })

  it('no float drift: nova k lands on substep 120·k for a 10-minute fight', () => {
    const c = createBossClock()
    for (let i = 1; i <= 36_000; i++) {
      const due = tickBossClock(c, STEP, true)
      expect(due, `substep ${i}`).toBe(i % 120 === 0)
    }
  })

  it('1× and 2× simSpeed see identical novas (clock advances per substep)', () => {
    const one = createBossClock()
    const two = createBossClock()
    const seq1: number[] = []
    const seq2: number[] = []
    for (let tick = 0; tick < 1200; tick++) if (tickBossClock(one, STEP, true)) seq1.push(one.clockMs)
    for (let tick = 0; tick < 600; tick++) {
      for (let sub = 0; sub < 2; sub++) if (tickBossClock(two, STEP, true)) seq2.push(two.clockMs)
    }
    expect(seq2).toEqual(seq1)
    expect(seq1.length).toBe(10)
  })

  it('resets per match; honours a Boss Lab period', () => {
    const c = createBossClock()
    run(c, 150)
    resetBossClock(c)
    expect(c).toEqual({ clockMs: 0, nextNovaAt: 2000 })
    BOSS_TRAIT_TUNING.EMBER_PERIOD_MS = 1000
    resetBossClock(c)
    expect(run(c, 60)).toBe(1)
  })
})

// ─── Ember Nova: targets and damage ────────────────────────────────────────

describe('Ember Nova targets (§4.1)', () => {
  it('reach = 2.2 × carrier radius + victim radius (mobile boss: ≈126.6)', () => {
    const car = boss('ember')
    const v = blade('player', { radius: 28 })
    expect(emberReach(car, v)).toBeCloseTo(2.2 * 44.8 + 28, 9)
    expect(emberReach(car, v)).toBeCloseTo(126.56, 2)
  })

  it('boundary is inclusive; one unit past it misses', () => {
    const car = boss('ember')
    const v = blade('player')
    const r = emberReach(car, v)
    v.x = r
    expect(emberVictimMask([car, v])).toBe(0b10)
    v.x = r + 1e-6
    expect(emberVictimMask([car, v])).toBe(0)
    // diagonal, inside
    v.x = r * 0.7
    v.y = -r * 0.7
    expect(emberVictimMask([car, v])).toBe(0b10)
  })

  it('carriers never hit their own side; dead carriers / victims skipped; no trait = no nova', () => {
    const car = boss('ember', { x: 0 })
    const ally = boss(undefined, { x: 10 })
    const twin = boss('ember', { x: 20 })
    const p = blade('player', { x: 30 })
    const dead = blade('player', { x: 5, hp: 0 })
    expect(bits(emberVictimMask([car, ally, twin, p, dead]), [car, ally, twin, p, dead])).toEqual([p.id])
    car.hp = 0
    twin.hp = 0
    expect(emberVictimMask([car, ally, twin, p, dead])).toBe(0)
    expect(hasLivingEmberCarrier([car, ally, twin, p])).toBe(false)
    expect(emberVictimMask([boss('frost'), boss('chill'), blade('player')])).toBe(0)
  })

  it('one hit per victim per nova (Twin Pyres / Elemental Court overlap), union of reaches', () => {
    const a = boss('ember', { x: -50 })
    const b = boss('ember', { x: 50 })
    const both = blade('player', { x: 0 })
    const onlyB = blade('player', { x: 150 })
    const far = blade('player', { x: 400 })
    const list = [a, b, both, onlyB, far]
    const mask = emberVictimMask(list)
    expect(bits(mask, list)).toEqual([both.id, onlyB.id])
    expect(hasLivingEmberCarrier(list)).toBe(true)
  })

  it('result does not depend on blade order (only index mapping does)', () => {
    const a = boss('ember', { x: -50 })
    const b = boss('ember', { x: 50 })
    const v1 = blade('player', { x: 0 })
    const v2 = blade('player', { x: 150 })
    const v3 = blade('player', { x: 300 })
    const orders = [
      [a, b, v1, v2, v3],
      [v3, v2, b, v1, a],
      [v1, a, v3, b, v2]
    ]
    const sets = orders.map(o => bits(emberVictimMask(o), o).sort((x, y) => x - y))
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
  })

  it('an owner-agnostic carrier hits the other side', () => {
    const car = blade('player', { config: { topPartId: 'round', bossTrait: 'ember' } })
    const v = blade('npc', { x: 10 })
    expect(emberVictimMask([car, v])).toBe(0b10)
  })

  it(`ignores indices ≥ ${EMBER_MASK_MAX_BLADES}`, () => {
    const list: TraitBlade[] = [boss('ember')]
    for (let i = 0; i < 40; i++) list.push(blade('player'))
    expect(emberVictimMask(list)).toBe((2 ** 31 - 1) - 1 | 0)
  })
})

describe('Ember Nova damage (§4.1, §6.1)', () => {
  it('3 % of the victim max HP, min 1', () => {
    expect(emberDamage(blade('player', { maxHp: 400 }))).toBeCloseTo(12, 9)
    expect(emberDamage(blade('player', { maxHp: 20 }))).toBe(1)
  })

  it('plain blade loses exactly the burn; a lethal burn kills (hp 0)', () => {
    const v = blade('player', { maxHp: 200, hp: 200 })
    expect(applyEmberBurn(v)).toBeCloseTo(6, 9)
    expect(v.hp).toBeCloseTo(194, 9)
    v.hp = 3
    applyEmberBurn(v)
    expect(v.hp).toBe(0)
  })

  it('is a lava-type hazard: Hazard Ward L10 cuts it by 40 %', () => {
    const v = withSkills(blade('player', { maxHp: 1000, hp: 1000 }), ['hazard_ward'])
    const lava = skillParams('hazard_ward', 10).lava
    expect(lava).toBe(0.4)
    expect(EMBER_HP_LOSS_KIND).toBe('burn')
    expect(hazardScale(v, EMBER_HP_LOSS_KIND)).toBeCloseTo(1 - lava, 12)
    const lost = applyEmberBurn(v)
    expect(lost).toBeCloseTo(30 * 0.6, 9)
  })

  it('Guard Shell absorbs first', () => {
    const v = withSkills(blade('player', { maxHp: 1000, hp: 1000 }), ['guard_shell'])
    const shield0 = v.skills!.shield
    expect(shield0).toBeGreaterThan(30)
    const out = { hpLost: 0, absorbed: 0, warded: 0, healed: 0, shieldBroken: false }
    expect(applyEmberBurn(v, out)).toBe(0)
    expect(out.absorbed).toBeCloseTo(30, 9)
    expect(v.skills!.shield).toBeCloseTo(shield0 - 30, 9)
    expect(v.hp).toBe(1000)
  })

  it('Second Wind can trigger on a burn, never on a lethal one', () => {
    const p = skillParams('second_wind', 10)
    const v = withSkills(blade('player', { maxHp: 1000, hp: p.threshold * 1000 + 10 }), ['second_wind'])
    const out = { hpLost: 0, absorbed: 0, warded: 0, healed: 0, shieldBroken: false }
    applyEmberBurn(v, out)
    expect(out.healed).toBeGreaterThan(0)
    const k = withSkills(blade('player', { maxHp: 1000, hp: 20 }), ['second_wind'])
    applyEmberBurn(k, out)
    expect(k.hp).toBe(0)
    expect(out.healed).toBe(0)
  })

  it('Phase Step does not dodge a burn (hazard, not a hit)', () => {
    const v = withSkills(blade('player', { maxHp: 1000, hp: 1000 }), ['phase_step'])
    v.skills!.phasedUntil = Infinity
    expect(applyEmberBurn(v)).toBeCloseTo(30, 9)
  })
})

// ─── Frost Lock ────────────────────────────────────────────────────────────

describe('Frost Lock — cold touch (Rule A)', () => {
  it('victim keeps 10 % speed', () => {
    const v = blade('player', { vx: 10, vy: -20 })
    expect(frostTouch(v, 1000)).toBe(0.1)
    expect(v.vx).toBeCloseTo(1, 12)
    expect(v.vy).toBeCloseTo(-2, 12)
    expect(v.lastShockMs).toBe(1000)
  })

  it('Hazard Ward L10 keeps 19 % (10 % + 90 % × shockKeep)', () => {
    const v = withSkills(blade('player'), ['hazard_ward'])
    expect(frostTouchKeep(v)).toBeCloseTo(0.19, 12)
    const low = withSkills(blade('player'), ['hazard_ward'], 1)
    expect(frostTouchKeep(low)).toBeCloseTo(0.1 + 0.9 * skillParams('hazard_ward', 1).shockKeep, 12)
    expect(frostTouchKeep(withSkills(blade('player'), ['guard_shell']))).toBe(0.1)
  })

  it('shares the 250 ms game-time shock gate (shock walls, Static Charge)', () => {
    const v = blade('player', { lastShockMs: 1000 }) // a shock-wall zap just now
    expect(frostTouch(v, 1249)).toBe(0)
    expect(v.vx).toBe(10)
    expect(frostTouch(v, 1250)).toBe(0.1)
    expect(frostTouch(v, 1400)).toBe(0)
  })
})

describe('Frost Lock — frozen solid (Rule B, B3)', () => {
  it('locks for the team’s next turn, immune on the one after, kind frost', () => {
    const a = blade('player')
    const b = blade('player')
    expect(tryFrostLock(a, [a, b], 7)).toBe('locked')
    expect(a.stunnedForTurn).toBe(8)
    expect(a.stunImmuneTurn).toBe(9)
    expect(a.lockKind).toBe('frost')
    expect(isFrostLockedFor(a, 8)).toBe(true)
    expect(isFrostLockedFor(a, 7)).toBe(false)
    expect(isStunnedFor(a, 8)).toBe(true) // the skills' selection filter sees it
    expect(countPickable([a, b], 8)).toBe(1)
  })

  it('a second ram on the same turn is a no-op (already)', () => {
    const a = blade('player')
    const b = blade('player')
    tryFrostLock(a, [a, b], 7)
    expect(tryFrostLock(a, [a, b], 7)).toBe('already')
    expect(a.stunImmuneTurn).toBe(9)
  })

  it('never two turns in a row (frost after frost, and after a Static Charge stun)', () => {
    const a = blade('player')
    const b = blade('player')
    tryFrostLock(a, [a, b], 7) // frozen for 8
    expect(tryFrostLock(a, [a, b], 8)).toBe('immune') // would be 9
    expect(a.stunnedForTurn).toBe(8)
    expect(tryFrostLock(a, [a, b], 9)).toBe('locked') // 10 — it played 9
    expect(a.stunnedForTurn).toBe(10)

    const c = blade('player', { stunnedForTurn: 4, stunImmuneTurn: 5, lockKind: 'stun' })
    expect(tryFrostLock(c, [c, blade('player')], 4)).toBe('immune')
  })

  it('never the last launchable spinner (the ice cracks)', () => {
    const solo = blade('player')
    expect(tryFrostLock(solo, [solo], 3)).toBe('cracked')
    expect(solo.stunnedForTurn).toBeUndefined()

    const a = blade('player')
    const deadMate = blade('player', { hp: 0 })
    expect(tryFrostLock(a, [a, deadMate], 3)).toBe('cracked')

    const x = blade('player')
    const y = blade('player')
    expect(tryFrostLock(x, [x, y], 3)).toBe('locked')
    expect(tryFrostLock(y, [x, y], 3)).toBe('cracked') // x is out for 4 already
    expect(countPickable([x, y], 4)).toBe(1)

    const s = blade('player')
    const stunned = blade('player', { stunnedForTurn: 4, stunImmuneTurn: 5, lockKind: 'stun' })
    expect(tryFrostLock(s, [s, stunned], 3)).toBe('cracked') // mate Static-stunned for 4
    const old = blade('player', { stunnedForTurn: 2, stunImmuneTurn: 3, lockKind: 'frost' })
    expect(tryFrostLock(s, [s, old], 3)).toBe('locked') // a spent lock does not count
  })

  it('dead victim: none', () => {
    const d = blade('player', { hp: 0 })
    expect(tryFrostLock(d, [d, blade('player')], 1)).toBe('none')
  })

  it('an event on the victim’s own turn t and on the enemy turn after it point at t + 1', () => {
    const a = blade('player')
    const b = blade('player')
    tryFrostLock(a, [a, b], 5) // during own launch (turn 5)
    const c = blade('player')
    const d = blade('player')
    tryFrostLock(c, [c, d], 5) // during the NPC turn after player turn 5
    expect(a.stunnedForTurn).toBe(c.stunnedForTurn)
  })

  it('thaws an all-frozen team at its turn start after a later death; keeps immunity', () => {
    const a = blade('player')
    const b = blade('player')
    tryFrostLock(a, [a, b], 7) // a out for 8
    b.hp = 0 // b dies before turn 8
    expect(countPickable([a, b], 8)).toBe(0)
    expect(beginTeamTurnTraits([a, b], 8)).toBe(1)
    expect(countPickable([a, b], 8)).toBe(1)
    expect(a.lockKind).toBeUndefined()
    expect(a.stunImmuneTurn).toBe(9) // sim parity
  })

  it('thaw leaves Static Charge stuns alone and does nothing while someone can play', () => {
    const s1 = blade('player', { stunnedForTurn: 8, stunImmuneTurn: 9, lockKind: 'stun' })
    const s2 = blade('player', { stunnedForTurn: 8, stunImmuneTurn: 9, lockKind: 'stun' })
    expect(thawFrostLocks([s1, s2], 8)).toBe(0)
    expect(countPickable([s1, s2], 8)).toBe(0) // skills rule: turn skipped

    const f = blade('player', { stunnedForTurn: 8, stunImmuneTurn: 9, lockKind: 'frost' })
    const s = blade('player', { stunnedForTurn: 8, stunImmuneTurn: 9, lockKind: 'stun' })
    expect(thawFrostLocks([f, s], 8)).toBe(1)
    expect(isStunnedFor(s, 8)).toBe(true)
    expect(countPickable([f, s], 8)).toBe(1)

    const x = blade('player')
    const y = blade('player')
    tryFrostLock(x, [x, y], 7)
    expect(thawFrostLocks([x, y], 8)).toBe(0)
    expect(isFrostLockedFor(x, 8)).toBe(true)
    expect(thawFrostLocks([blade('player', { hp: 0 })], 8)).toBe(0)
    expect(thawFrostLocks([], 8)).toBe(0)
  })

  it('B3 soak: the Warden rams both spinners every turn — a spinner is never out two turns in a row, the team never loses a turn', () => {
    const a = blade('player')
    const b = blade('player')
    const team = [a, b]
    let pTurn = 0
    const out: number[][] = [] // living blades that sit out each player turn
    for (let round = 0; round < 40; round++) {
      // player turn starts
      const turn = pTurn + 1
      beginTeamTurnTraits(team, turn)
      expect(countPickable(team, turn)).toBeGreaterThan(0)
      pTurn = turn
      out.push(team.filter(x => x.hp > 0 && isStunnedFor(x, turn)).map(x => x.id))
      expect(out.at(-1)!.length).toBeLessThan(team.filter(x => x.hp > 0).length)
      endTeamTurnTraits(team, turn)
      // Warden's turn: rams in varying order
      const order = round % 3 === 0 ? [a, b] : round % 3 === 1 ? [b, a] : [a]
      for (const v of order) tryFrostLock(v, team, pTurn)
      // a death mid-soak must not strand the survivor
      if (round === 30) b.hp = 0
    }
    let locks = 0
    for (let i = 0; i < out.length; i++) {
      locks += out[i]!.length
      if (i > 0) for (const id of out[i]!) expect(out[i - 1]!.includes(id)).toBe(false)
    }
    expect(locks).toBeGreaterThan(10) // the soak really froze spinners
  })
})

// ─── Frostbite ─────────────────────────────────────────────────────────────

describe('Frostbite — stacking slow (§4.3, B4)', () => {
  it('a stack: −10 % speed multiplier, −10 % current velocity, expiry t + 2', () => {
    const v = blade('player', { vx: 10, vy: -20 })
    expect(chillSpeedMul(v)).toBe(1)
    expect(addChillStack(v, 7, 0)).toBe('added')
    expect(v.chillN).toBe(1)
    expect(chillSpeedMul(v)).toBeCloseTo(0.9, 12)
    expect(v.vx).toBeCloseTo(9, 12)
    expect(v.vy).toBeCloseTo(-18, 12)
    expect(chillEarliestExpiry(v)).toBe(9)
  })

  it('worked example: rammed on the boss turn after your turn 7 → live on 8 and 9, gone when 9 ends', () => {
    const v = blade('player')
    const team = [v]
    addChillStack(v, 7, 0)
    expect(endTeamTurnTraits(team, 7)).toBe(false) // (turn 7 already ended; idempotent)
    beginTeamTurnTraits(team, 8)
    expect(v.chillN).toBe(1)
    endTeamTurnTraits(team, 8)
    beginTeamTurnTraits(team, 9)
    expect(v.chillN).toBe(1)
    expect(endTeamTurnTraits(team, 9)).toBe(true)
    expect(v.chillN).toBe(0)
    expect(chillSpeedMul(v)).toBe(1)
    expect(Number.isNaN(chillEarliestExpiry(v))).toBe(true)
  })

  it('touched during your own turn 7 → same expiry (end of 9)', () => {
    const v = blade('player')
    addChillStack(v, 7, 0)
    endTeamTurnTraits([v], 7)
    expect(v.chillN).toBe(1)
    expect(chillEarliestExpiry(v)).toBe(9)
  })

  it('a skipped turn counts as a turn', () => {
    const v = blade('player', { stunnedForTurn: 8, lockKind: 'stun' })
    addChillStack(v, 7, 0)
    endTeamTurnTraits([v], 8) // turn 8 skipped: still a turn end
    endTeamTurnTraits([v], 9)
    expect(v.chillN).toBe(0)
  })

  it('stacks are independent (no refresh of older stacks)', () => {
    const v = blade('player')
    addChillStack(v, 7, 0)
    addChillStack(v, 8, 1000)
    expect(v.chillN).toBe(2)
    endTeamTurnTraits([v], 9)
    expect(v.chillN).toBe(1)
    expect(chillEarliestExpiry(v)).toBe(10)
    endTeamTurnTraits([v], 10)
    expect(v.chillN).toBe(0)
  })

  it('cap 5 = −50 %; a touch at the cap replaces the stack that expires first, no growth, no velocity cut', () => {
    const v = blade('player', { vx: 100, vy: 0 })
    for (let i = 0; i < 5; i++) expect(addChillStack(v, 3 + i, i * 300)).toBe('added')
    expect(v.chillN).toBe(5)
    expect(chillSpeedMul(v)).toBeCloseTo(0.5, 12)
    const vx = v.vx
    expect(vx).toBeCloseTo(100 * 0.9 ** 5, 9)
    expect(addChillStack(v, 9, 5000)).toBe('refreshed')
    expect(v.chillN).toBe(5)
    expect(v.vx).toBe(vx)
    expect(chillEarliestExpiry(v)).toBe(6) // the expiry-5 stack became 11
    expect(Array.from(v.chillExp!).sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 11])
  })

  it('1 stack per victim per 250 ms (game time), shared across carriers', () => {
    const v = blade('player')
    expect(addChillStack(v, 1, 1000)).toBe('added')
    expect(addChillStack(v, 1, 1249)).toBe('gated') // a second Yeti within the gate
    expect(v.chillN).toBe(1)
    expect(addChillStack(v, 1, 1250)).toBe('added')
    expect(v.chillN).toBe(2)
  })

  it('pruneChill is idempotent and reports changes', () => {
    const v = blade('player')
    expect(pruneChill(v, 5)).toBe(false)
    addChillStack(v, 1, 0)
    expect(pruneChill(v, 2)).toBe(false)
    expect(pruneChill(v, 3)).toBe(true)
    expect(pruneChill(v, 3)).toBe(false)
  })

  it('no allocation per stack after initTraitVictim; a raised Boss Lab cap grows the buffer', () => {
    const v = blade('player')
    initTraitVictim(v)
    const buf = v.chillExp
    expect(buf!.length).toBe(5)
    for (let i = 0; i < 20; i++) addChillStack(v, i, i * 1000)
    expect(v.chillExp).toBe(buf)
    initTraitVictim(v) // re-init keeps the buffer, clears the count
    expect(v.chillExp).toBe(buf)
    expect(v.chillN).toBe(0)
    addChillStack(v, 1, 1e6)
    BOSS_TRAIT_TUNING.CHILL_MAX = 7
    addChillStack(v, 1, 2e6)
    expect(v.chillExp!.length).toBe(7)
    expect(v.chillN).toBe(2)
    expect(Array.from(v.chillExp!.subarray(0, 2))).toEqual([3, 3])
  })
})

// ─── contact dispatch + skill interactions ─────────────────────────────────

describe('onTraitContact (§12.2 item 3) and skills (§6.1)', () => {
  const out = createTraitContactResult()

  it('ember / no trait: nothing on contact', () => {
    const v = blade('player')
    expect(onTraitContact(boss('ember'), v, 0, null, [v], 1, out)).toBe(false)
    expect(onTraitContact(boss(undefined), v, 0, null, [v], 1, out)).toBe(false)
    expect(out.trait).toBeNull()
    expect(v.vx).toBe(10)
  })

  it('allies, dead carrier or dead victim: nothing', () => {
    const w = boss('frost')
    const ally = boss(undefined)
    expect(onTraitContact(w, ally, 0, w.id, [ally], 1, out)).toBe(false)
    const v = blade('player')
    w.hp = 0
    expect(onTraitContact(w, v, 0, w.id, [v, blade('player')], 1, out)).toBe(false)
    w.hp = 100
    v.hp = 0
    expect(onTraitContact(w, v, 0, w.id, [v, blade('player')], 1, out)).toBe(false)
  })

  it('frost: any touch drains; the lock needs the Warden to be the launched blade', () => {
    const w = boss('frost')
    const a = blade('player')
    const b = blade('player')
    expect(onTraitContact(w, a, 0, a.id, [a, b], 4, out)).toBe(true) // player launched into it
    expect(out).toMatchObject({ trait: 'frost', keep: 0.1, lock: 'none' })
    expect(a.stunnedForTurn).toBeUndefined()
    expect(onTraitContact(w, a, 500, w.id, [a, b], 4, out)).toBe(true)
    expect(out.lock).toBe('locked')
    expect(a.stunnedForTurn).toBe(5)
    // gated drain + already-locked → no change
    expect(onTraitContact(w, a, 600, w.id, [a, b], 4, out)).toBe(false)
    expect(out).toMatchObject({ keep: 0, lock: 'already' })
  })

  it('chill: every touch stacks; the gate and state are reported', () => {
    const y = boss('chill')
    const v = blade('player')
    expect(onTraitContact(y, v, 0, null, [v], 2, out)).toBe(true)
    expect(out).toMatchObject({ trait: 'chill', chill: 'added', stacks: 1 })
    expect(onTraitContact(y, v, 100, null, [v], 2, out)).toBe(false)
    expect(out).toMatchObject({ chill: 'gated', stacks: 1 })
    for (let i = 1; i <= 5; i++) onTraitContact(y, v, 1000 * i, null, [v], 2, out)
    expect(out).toMatchObject({ chill: 'refreshed', stacks: 5 })
  })

  it('Phase Step: a dodge on the ram prevents drain, lock and stack', () => {
    const w = boss('frost', { vx: 8 })
    const a = withSkills(blade('player'), ['phase_step'], 10, () => 0)
    const b = blade('player')
    const inc = createIncomingResult()
    incomingSkill(a, w, 20, 'hit', 1000, 1, inc) // §5 step 3 runs first
    expect(inc.dodged).toBe(true)
    expect(onTraitContact(w, a, 1000, w.id, [a, b], 3, out)).toBe(false)
    expect(out.phased).toBe(true)
    expect(a.vx).toBe(10)
    expect(a.stunnedForTurn).toBeUndefined()

    const y = boss('chill')
    expect(onTraitContact(y, a, 1100, null, [a], 3, out)).toBe(false) // still in the 300 ms window
    expect(a.chillN ?? 0).toBe(0)
    expect(onTraitContact(y, a, 1300, null, [a], 3, out)).toBe(true) // window over
    expect(a.chillN).toBe(1)
  })

  it('Hazard Ward: keeps 19 % but does not stop the freeze; no effect on chill', () => {
    const w = boss('frost')
    const a = withSkills(blade('player', { vx: 100, vy: 0 }), ['hazard_ward'])
    const b = blade('player')
    onTraitContact(w, a, 0, w.id, [a, b], 1, out)
    expect(a.vx).toBeCloseTo(19, 9)
    expect(out.lock).toBe('locked')
    const c = withSkills(blade('player'), ['hazard_ward'])
    onTraitContact(boss('chill'), c, 0, null, [c], 1, out)
    expect(chillSpeedMul(c)).toBeCloseTo(0.9, 12)
  })

  it('Guard Shell: no effect on touch, lock or stack', () => {
    const a = withSkills(blade('player', { vx: 100, vy: 0 }), ['guard_shell'])
    const b = blade('player')
    const w = boss('frost')
    onTraitContact(w, a, 0, w.id, [a, b], 1, out)
    expect(a.vx).toBeCloseTo(10, 9)
    expect(out.lock).toBe('locked')
    onTraitContact(boss('chill'), a, 1000, null, [a, b], 1, out)
    expect(a.chillN).toBe(1)
  })

  it('Mirror Plate: the ram is mirrored as usual and the lock still applies', () => {
    const w = boss('frost', { vx: 8 })
    const a = withSkills(blade('player'), ['mirror_plate'], 10, () => 0)
    const b = blade('player')
    const inc = createIncomingResult()
    incomingSkill(a, w, 20, 'hit', 0, 1, inc)
    expect(inc.mirrored).toBe(true)
    onTraitContact(w, a, 0, w.id, [a, b], 1, out)
    expect(out.lock).toBe('locked')
  })

  it('Static Charge: may stun the ramming Warden, the victim is still frozen, both expire — no loop', () => {
    const w = boss('frost', { vx: 8, vy: 0 })
    const a = withSkills(blade('player'), ['static_charge'], 10, () => 0)
    const b = blade('player')
    const player = [a, b]
    const npc = [w]
    let pTurn = 4
    let nTurn = 4 // the Warden's launch in progress is its turn 4 (post-increment)
    // §12.2 item 3 order: trait contact, then the skills' contact hooks
    onTraitContact(w, a, 0, w.id, player, pTurn, out)
    expect(out.lock).toBe('locked')
    const cOut = createContactResult<TraitBlade>()
    const stats: SkillRefStats = { damageMultiplier: 1, defenseMultiplier: 1, speedMultiplier: 1, totalWeight: 1 }
    onEnemyContact(a, w, 0, w.id, nTurn, npc, () => stats, cOut)
    expect(cOut.stunned).toBe(true)
    expect(w.stunnedForTurn).toBe(5)
    expect(w.vx).toBeCloseTo(0.8, 12) // Static Charge drain
    expect(a.stunnedForTurn).toBe(5)
    // turn 5 (player): a frozen, b plays
    beginTeamTurnTraits(player, 5)
    expect(countPickable(player, 5)).toBe(1)
    pTurn = 5
    endTeamTurnTraits(player, 5)
    // NPC turn 5: the Warden is stunned → skipped (no ram, no lock)
    expect(countPickable(npc, 5)).toBe(0)
    nTurn = 5
    endTeamTurnTraits(npc, 5)
    // turn 6 (player): both back
    beginTeamTurnTraits(player, 6)
    expect(countPickable(player, 6)).toBe(2)
    pTurn = 6
    // NPC turn 6: the Warden plays again; a is lockable again (for 7)
    expect(countPickable(npc, 6)).toBe(1)
    nTurn = 6
    expect(tryFrostLock(a, player, pTurn)).toBe('locked')
    expect(nTurn).toBe(6)
  })

  it('owner-agnostic: a player-side carrier affects an NPC blade', () => {
    const car = blade('player', { config: { topPartId: 'round', bossTrait: 'chill' } })
    const v = blade('npc')
    expect(onTraitContact(car, v, 0, null, [v], 1, out)).toBe(true)
    expect(v.chillN).toBe(1)
  })
})

// ─── turn bookkeeping, HUD, hash ───────────────────────────────────────────

describe('turn bookkeeping, HUD and hash', () => {
  it('endTeamTurnTraits clears the stale lockKind once the locked turn has ended', () => {
    const a = blade('player')
    const b = blade('player')
    tryFrostLock(a, [a, b], 1) // out for 2
    expect(endTeamTurnTraits([a, b], 1)).toBe(false)
    expect(a.lockKind).toBe('frost')
    expect(endTeamTurnTraits([a, b], 2)).toBe(true)
    expect(a.lockKind).toBeUndefined()
    expect(a.stunnedForTurn).toBe(2) // the skills field itself is left as is
    const thawed = blade('player', { lockKind: 'frost' })
    expect(endTeamTurnTraits([thawed], 0)).toBe(true)
  })

  it('writeTraitHud: frozen / chill rows with change detection', () => {
    const a = blade('player')
    const b = blade('player')
    const row = createTraitHudRow()
    expect(writeTraitHud(a, 2, row)).toBe(false)
    tryFrostLock(a, [a, b], 1)
    addChillStack(a, 1, 0)
    expect(writeTraitHud(a, 2, row)).toBe(true)
    expect(row).toEqual({ frozen: true, chill: 1 })
    expect(writeTraitHud(a, 2, row)).toBe(false)
    expect(writeTraitHud(a, 3, row)).toBe(true)
    expect(row.frozen).toBe(false)
    a.hp = 0
    writeTraitHud(a, 2, row)
    expect(row).toEqual({ frozen: false, chill: 0 })
  })

  it('hash fragments carry lock kind, immunity, chill count + earliest expiry, the clock', () => {
    const a = blade('player')
    expect(traitHashPart(a)).toBe('-,-,0,-')
    tryFrostLock(a, [a, blade('player')], 3)
    addChillStack(a, 3, 0)
    addChillStack(a, 4, 500)
    expect(traitHashPart(a)).toBe('frost,5,2,5')
    const c = createBossClock()
    expect(bossClockHashPart(c)).toBe('0,2000')
  })

  it('hasBossTraits', () => {
    expect(hasBossTraits([blade('player'), boss(undefined)])).toBe(false)
    expect(hasBossTraits([blade('player'), boss('chill')])).toBe(true)
  })
})

// ─── determinism ───────────────────────────────────────────────────────────

describe('determinism (§9)', () => {
  /** A scripted Elemental-Court-like exchange; returns a state trace. */
  function scenario(): string[] {
    const tyrant = boss('ember', { x: 0, y: 0 })
    const warden = boss('frost', { x: 150, y: 0 })
    const yeti = boss('chill', { x: -150, y: 0 })
    const a = withSkills(blade('player', { x: 60, y: 10 }), ['hazard_ward', 'guard_shell'])
    const b = withSkills(blade('player', { x: -120, y: -40 }), ['phase_step'], 10)
    const player = [a, b]
    const all = [tyrant, warden, yeti, a, b]
    for (const p of player) initTraitVictim(p)
    const clock = createBossClock()
    const out = createTraitContactResult()
    const trace: string[] = []
    let pTurn = 0
    let now = 0
    for (let round = 0; round < 12; round++) {
      pTurn++
      beginTeamTurnTraits(player, pTurn)
      for (let s = 0; s < 90; s++) {
        now += STEP
        if (tickBossClock(clock, STEP, true)) {
          const m = emberVictimMask(all)
          for (let i = 0; i < all.length; i++) if (m & (1 << i)) applyEmberBurn(all[i]!)
        }
        if (s === 30) onTraitContact(yeti, player[round % 2]!, now, player[round % 2]!.id, player, pTurn, out)
      }
      endTeamTurnTraits(player, pTurn)
      for (let s = 0; s < 60; s++) {
        now += STEP
        tickBossClock(clock, STEP, false) // aiming: nothing
        if (s === 10) onTraitContact(warden, a, now, warden.id, player, pTurn, out)
        if (s === 20) onTraitContact(yeti, b, now, yeti.id, player, pTurn, out)
      }
      trace.push(`${bossClockHashPart(clock)}|${player.map(p => `${p.hp.toFixed(9)},${p.vx},${p.stunnedForTurn ?? '-'},${traitHashPart(p)}`).join('|')}`)
    }
    return trace
  }

  it('same inputs → same state, and no random / wall-clock source is touched', () => {
    const rnd = vi.spyOn(Math, 'random')
    const perf = vi.spyOn(performance, 'now')
    const date = vi.spyOn(Date, 'now')
    const t1 = scenario()
    const t2 = scenario()
    expect(t2).toEqual(t1)
    expect(t1.at(-1)).not.toBe(t1[0])
    expect(rnd).not.toHaveBeenCalled()
    expect(perf).not.toHaveBeenCalled()
    expect(date).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('the module source has no random / wall-clock / match-stream access', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/bosses/bossTraits.ts'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const banned of ['Math.random', 'matchRng', 'performance.now', 'Date.now', 'useDeterministicRng', 'from \'vue\'']) {
      expect(src.includes(banned), banned).toBe(false)
    }
  })
})

// ─── cross-check against tools/skills-sim/bosses100.mjs semantics ──────────

describe('sim parity (bosses100.mjs bossContact / pruneChill / playerLaunch)', () => {
  it('chill: sim prunes `exp >= pTurn` at launch start == our prune at turn start', () => {
    // sim: stack exp = pTurn + 2; at the next launch pTurn++ then keep exp >= pTurn
    const simKeep = (exps: number[], newTurn: number): number[] => exps.filter(x => x >= newTurn)
    const v = blade('player')
    const exps: number[] = []
    for (const [turn, t] of [[3, 0], [4, 1000], [4, 2000], [6, 3000]] as const) {
      addChillStack(v, turn, t)
      exps.push(turn + 2)
    }
    for (let turn = 5; turn <= 9; turn++) {
      beginTeamTurnTraits([v], turn)
      expect(v.chillN, `turn ${turn}`).toBe(simKeep(exps, turn).length)
    }
  })

  it('frost: sim freezes only with another living, unfrozen mate; lock not gated by the drain gate', () => {
    const w = boss('frost')
    const a = blade('player', { lastShockMs: 0 })
    const b = blade('player')
    const out = createTraitContactResult()
    onTraitContact(w, a, 100, w.id, [a, b], 2, out) // drain gated, lock applies
    expect(out.keep).toBe(0)
    expect(out.lock).toBe('locked')
  })

  it('damage-before-trait: a victim killed by the contact gets no trait effect (sim: v.hp <= 0 → return)', () => {
    const y = boss('chill')
    const v = blade('player')
    applyHpLoss(v, 1000, 'hit')
    expect(onTraitContact(y, v, 0, null, [v], 1, createTraitContactResult())).toBe(false)
  })
})
