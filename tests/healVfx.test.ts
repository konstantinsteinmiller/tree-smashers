// ─── Heal pulse + heal number, per heal source ──────────────────────────────
//
// Drives the REAL `useSpinnerGame` physics loop (fake RAF + a controlled
// clock) through each code path that raises a blade's HP and checks the pooled
// heal-pulse state (`window.__borderFx`, the dev-only QA handle) and the heal
// numbers pushed afterwards:
//
//   · forest border contact        (+1 HP per wall hit)
//   · healer-boss ally contact     (HEALER_CONTACT_HEAL per touch, both sides)
//   · life-leech attacker          (30% of damage dealt)
//
// Rules under test:
//   · every source clamps at maxHp — HP never exceeds max;
//   · pulse AND number only when the HP actually applied (after the clamp)
//     is ≥ 1; below 1 the HP still rises but nothing reads;
//   · a heal ≥ 1 shows the rounded applied amount;
//   · no stacking: a second heal while the pulse is still playing keeps the
//     running one (no restart, no second slot); after it ended a new one starts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame, ARENA_RADIUS } from '@/use/useSpinnerGame'
import { HEAL_LIFE_MS, type BorderFxState } from '@/use/borderFx'
import type { SpinnerConfig } from '@/use/useSpinnerConfig'
import type { ArenaType } from '@/types/spinner'

const cfg = (): SpinnerConfig => ({ topPartId: 'star', bottomPartId: 'balanced' } as SpinnerConfig)

// Heal numbers are the only floating numbers in these two greens (combat
// damage uses blue/red). `damageNumbers` is closure-private, so the pushes
// are observed on the way in.
const HEAL_COLORS = new Set(['#44cc66', '#44ff88'])
type Num = { value: number; color: string }
let healNums: Num[] = []
const origPush = Array.prototype.push

let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()

beforeEach(() => {
  clock = 10_000
  rafQueue.clear()
  healNums = []
  let nextId = 1
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
  Array.prototype.push = function(this: unknown[], ...items: unknown[]) {
    for (const it of items) {
      const n = it as Partial<Num> & { maxLife?: number }
      if (n && typeof n === 'object' && typeof n.color === 'string' &&
        HEAL_COLORS.has(n.color) && typeof n.value === 'number' && 'maxLife' in n) {
        origPush.call(healNums, { value: n.value, color: n.color })
      }
    }
    return origPush.apply(this, items)
  }
})

afterEach(() => {
  Array.prototype.push = origPush
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Advance the game by ~`ms` in 60 Hz frames — exactly one physics step each
 *  (the fx pool itself advances a fixed 16 ms per step). */
const STEP = 1000 / 60
const frames = (ms: number) => {
  for (let t = 0; t < ms; t += STEP) {
    clock += STEP + 1e-6 // float-safe: never land a hair under one step
    const batch = [...rafQueue.values()]
    rafQueue.clear()
    for (const cb of batch) cb(clock)
  }
}

const scene = (arena: ArenaType, nTeam = 1) => {
  const g = useSpinnerGame()
  g.initGame([cfg()], Array.from({ length: nTeam }, cfg), false, arena)
  const fx = (window as unknown as { __borderFx: BorderFxState }).__borderFx
  // Park everybody still, well apart, away from the wall.
  const all = g.allBlades.value
  all.forEach((b, i) => {
    b.x = -120 + i * 70
    b.y = 60
    b.vx = 0
    b.vy = 0
    b.ax = 0
    b.ay = 0
    b.accelFramesLeft = 0
  })
  g.startPhysics()
  healNums = []
  const pulsesOn = (blade: { id: number }) =>
    fx.heals.filter(s => s.active && s.blade!.id === blade.id)
  const live = () => fx.heals.filter(s => s.active).length
  const values = () => healNums.map(n => n.value)
  return { g, fx, pulsesOn, live, values }
}

/** Put a blade just inside the right-hand wall, heading into it. */
const slamWall = (b: { x: number; y: number; vx: number; vy: number; radius: number }) => {
  b.x = ARENA_RADIUS - b.radius - 0.5
  b.y = 0
  b.vx = 4
  b.vy = 0
}

describe('heal — forest border contact', () => {
  it('+1 heal: HP rises, pulse + number 1', () => {
    const { g, pulsesOn, live, values } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - 10
    slamWall(p)
    const before = p.hp
    frames(32)
    expect(p.hp).toBeCloseTo(before + 1, 9)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(live()).toBe(1)
    expect(values()).toEqual([1])
    g.disposePhysics()
  })

  it('+1 across a float exponent boundary (63.7 → 64.7) still reads', () => {
    const { g, pulsesOn, values } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.maxHp = 100
    p.hp = 63.7
    slamWall(p)
    frames(32)
    expect(p.hp).toBeCloseTo(64.7, 9)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(values()).toEqual([1])
    g.disposePhysics()
  })

  it('at full HP: not a heal — no pulse, no number', () => {
    const { g, live, values } = scene('forest')
    const p = g.playerBlades.value[0]!
    slamWall(p)
    frames(32)
    expect(p.hp).toBe(p.maxHp)
    expect(live()).toBe(0)
    expect(values()).toEqual([])
    g.disposePhysics()
  })

  it.each([0.3, 0.6, 0.99])('missing %s: clamps at max, HP rises silently — no pulse, no number', (missing) => {
    const { g, live, values } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - missing
    slamWall(p)
    frames(32)
    expect(p.hp).toBe(p.maxHp)
    expect(live()).toBe(0)
    expect(values()).toEqual([])
    g.disposePhysics()
  })
})

describe('heal — healer-boss ally contact', () => {
  const allies = (missingA: number, missingB: number) => {
    const s = scene('default', 2)
    const [a, b] = s.g.npcBlades.value as [typeof s.g.npcBlades.value[0], typeof s.g.npcBlades.value[0]]
    a.groupId = 7
    b.groupId = 7
    a.healsAllies = true
    b.healsAllies = true
    a.hp = a.maxHp - missingA
    b.hp = b.maxHp - missingB
    a.x = 0
    a.y = 0
    b.x = a.radius * 1.5
    b.y = 0
    return { ...s, a, b }
  }

  it('heals BOTH allies by HEALER_CONTACT_HEAL, each gets a pulse + number 2', () => {
    const { g, a, b, pulsesOn, live, values } = allies(10, 10)
    const hpA = a.hp
    const hpB = b.hp
    frames(16)
    expect(a.hp).toBe(hpA + 2)
    expect(b.hp).toBe(hpB + 2)
    expect(pulsesOn(a)).toHaveLength(1)
    expect(pulsesOn(b)).toHaveLength(1)
    expect(live()).toBe(2)
    expect(values()).toEqual([2, 2])
    g.disposePhysics()
  })

  it('1.6 / 1.2 missing: full +2 clamps both at max (no rounding first); numbers 2 and 1', () => {
    const { g, a, b, pulsesOn, values } = allies(1.6, 1.2)
    frames(16)
    expect(a.hp).toBe(a.maxHp)
    expect(b.hp).toBe(b.maxHp) // 1.2 missing → +1.2 (was a rounded +1 before H3)
    expect(pulsesOn(a)).toHaveLength(1)
    expect(pulsesOn(b)).toHaveLength(1)
    expect(values().sort()).toEqual([1, 2])
    g.disposePhysics()
  })

  it('2.7 missing: +2 unrounded, under max, number 2', () => {
    const { g, a, values } = allies(2.7, 10)
    const hpA = a.hp
    frames(16)
    expect(a.hp).toBeCloseTo(hpA + 2, 9)
    expect(a.hp).toBeLessThan(a.maxHp)
    expect(values()).toEqual([2, 2])
    g.disposePhysics()
  })

  it('0.6 missing: clamps at max, HP rises silently — no pulse, no number (ally still reads)', () => {
    const { g, a, b, pulsesOn, values } = allies(0.6, 10)
    frames(16)
    expect(a.hp).toBe(a.maxHp)
    expect(pulsesOn(a)).toHaveLength(0)
    expect(pulsesOn(b)).toHaveLength(1)
    expect(values()).toEqual([2])
    g.disposePhysics()
  })

  it('0.3 missing (< 0.5): topped up to max silently — no pulse, no number', () => {
    const { g, a, b, pulsesOn, values } = allies(0.3, 10)
    frames(16)
    expect(a.hp).toBe(a.maxHp)
    expect(pulsesOn(a)).toHaveLength(0)
    expect(pulsesOn(b)).toHaveLength(1)
    expect(values()).toEqual([2])
    g.disposePhysics()
  })

  it('at full HP: no heal, no pulse, no number', () => {
    const { g, a, b, pulsesOn, values } = allies(0, 0)
    frames(16)
    expect(a.hp).toBe(a.maxHp)
    expect(b.hp).toBe(b.maxHp)
    expect(pulsesOn(a)).toHaveLength(0)
    expect(pulsesOn(b)).toHaveLength(0)
    expect(values()).toEqual([])
    g.disposePhysics()
  })

  it('HP never exceeds max across repeated contacts', () => {
    const { g, a, b } = allies(3.3, 0.7)
    for (let i = 0; i < 10; i++) {
      frames(300) // > HEALER_HEAL_COOLDOWN_MS
      a.x = 0
      a.y = 0
      b.x = a.radius * 1.5
      b.y = 0
      a.vx = a.vy = b.vx = b.vy = 0
      expect(a.hp).toBeLessThanOrEqual(a.maxHp)
      expect(b.hp).toBeLessThanOrEqual(b.maxHp)
    }
    // a: 3.3 → +2 → +1.3 clamped to max (no sub-0.5 gap left behind).
    // b: 0.7 → +0.7 clamped to max.
    expect(a.hp).toBe(a.maxHp)
    expect(b.hp).toBe(b.maxHp)
    g.disposePhysics()
  })
})

describe('heal — life-leech attacker', () => {
  const leech = (missing: number) => {
    const s = scene('default')
    const p = s.g.playerBlades.value[0]!
    const n = s.g.npcBlades.value[0]!
    p.isLifeLeech = true
    p.hp = p.maxHp - missing
    // The victim must survive the hit (a kill ends the match and its VFX):
    // a lone part-only NPC's HP depends on the campaign team-size tuning.
    n.maxHp = Math.max(n.maxHp, 60)
    n.hp = n.maxHp
    p.x = -p.radius - 1
    p.y = 0
    p.vx = 6
    n.x = n.radius - 1
    n.y = 0
    n.vx = -1
    return { ...s, p, n }
  }

  // The attacker also takes the return hit in the same collision, so its HP
  // after the exchange says nothing about the heal — the heal number (pushed
  // right after the clamped heal, before the return damage) does.
  it('≥1 HP applied: attacker gets pulse + rounded number; the victim does not', () => {
    const { g, p, n, pulsesOn, values } = leech(20)
    const hpN = n.hp
    frames(48)
    expect(n.hp).toBeLessThan(hpN)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(pulsesOn(n)).toHaveLength(0)
    expect(values()).toHaveLength(1)
    expect(Number.isInteger(values()[0])).toBe(true)
    expect(values()[0]).toBeGreaterThanOrEqual(1)
    g.disposePhysics()
  })

  it('1.5 missing: the heal is clamped at max — the number shows the applied 1.5 → 2, not 30% of the hit', () => {
    const { g, n, pulsesOn, p, values } = leech(1.5)
    const hpN = n.hp
    frames(48)
    const raw = (hpN - n.hp) * 0.3
    expect(raw).toBeGreaterThanOrEqual(2.5) // precondition: unclamped would read ≥3
    expect(pulsesOn(p)).toHaveLength(1)
    expect(values()).toEqual([2])
    g.disposePhysics()
  })

  it('0.5 missing: clamps at max, HP rises silently — no pulse, no number', () => {
    const { g, n, live, values } = leech(0.5)
    const hpN = n.hp
    frames(48)
    expect(n.hp).toBeLessThan(hpN) // the hit landed, so the leech fired
    expect(live()).toBe(0)
    expect(values()).toEqual([])
    g.disposePhysics()
  })
})

describe('heal VFX — no stacking on the real loop', () => {
  it('a second heal during the pulse keeps the running one; after it ends a new one starts', () => {
    const { g, fx, pulsesOn, live } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - 10
    slamWall(p)
    frames(16)
    const first = pulsesOn(p)[0]!
    expect(first).toBeDefined()
    const hpAfterFirst = p.hp

    // Second heal ~500 ms in (past the old 400 ms restart window): HP rises
    // again (and its number shows); the pulse neither restarts nor duplicates.
    frames(500)
    const tMid = first.t
    slamWall(p)
    frames(16)
    expect(p.hp).toBeGreaterThan(hpAfterFirst)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(pulsesOn(p)[0]).toBe(first)
    expect(first.t).toBe(tMid + 16)
    expect(live()).toBe(1)

    // Let it finish (blade parked, no more heals).
    p.x = 0
    p.y = 0
    p.vx = 0
    p.vy = 0
    frames(HEAL_LIFE_MS)
    expect(live()).toBe(0)

    // Next heal starts a fresh pulse.
    slamWall(p)
    frames(16)
    const fresh = pulsesOn(p)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.t).toBeLessThanOrEqual(16)
    expect(fx.heals.filter(s => s.active)).toHaveLength(1)
    g.disposePhysics()
  })

  it('every heal still lands AND shows its number while only one pulse plays', () => {
    // Two forest heals inside one pulse: both apply +1, both show "1", one pulse.
    const { g, pulsesOn, values } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - 10
    const start = p.hp
    slamWall(p)
    frames(16)
    frames(100)
    slamWall(p)
    frames(16)
    expect(p.hp).toBe(start + 2)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(values()).toEqual([1, 1])
    g.disposePhysics()
  })
})
