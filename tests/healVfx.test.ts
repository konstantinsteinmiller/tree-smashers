// ─── Every heal plays the heal pulse on the healed blade ────────────────────
//
// Drives the REAL `useSpinnerGame` physics loop (fake RAF + a controlled
// clock) through each code path that raises a blade's HP and checks the pooled
// heal-pulse state (`window.__borderFx`, the dev-only QA handle) afterwards:
//
//   · forest border contact        (+1 HP per wall hit)
//   · healer-boss ally contact     (HEALER_CONTACT_HEAL per touch, both sides)
//   · life-leech attacker          (30% of damage dealt)
//
// plus the no-stacking rule on the real loop: a second heal while the pulse
// is still playing keeps the running one (no restart, no second slot), and a
// heal after it ended starts a fresh one.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame, ARENA_RADIUS } from '@/use/useSpinnerGame'
import { HEAL_LIFE_MS, type BorderFxState } from '@/use/borderFx'
import type { SpinnerConfig } from '@/use/useSpinnerConfig'
import type { ArenaType } from '@/types/spinner'

const cfg = (): SpinnerConfig => ({ topPartId: 'star', bottomPartId: 'balanced' } as SpinnerConfig)

let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()

beforeEach(() => {
  clock = 10_000
  rafQueue.clear()
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
})

afterEach(() => {
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
  const pulsesOn = (blade: { id: number }) =>
    fx.heals.filter(s => s.active && s.blade!.id === blade.id)
  const live = () => fx.heals.filter(s => s.active).length
  return { g, fx, pulsesOn, live }
}

/** Put a blade just inside the right-hand wall, heading into it. */
const slamWall = (b: { x: number; y: number; vx: number; vy: number; radius: number }) => {
  b.x = ARENA_RADIUS - b.radius - 0.5
  b.y = 0
  b.vx = 4
  b.vy = 0
}

describe('heal VFX — every heal source plays it on the healed blade', () => {
  it('forest border contact', () => {
    const { g, pulsesOn, live } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - 10
    slamWall(p)
    const before = p.hp
    frames(32)
    expect(p.hp).toBeGreaterThan(before)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(live()).toBe(1)
    g.disposePhysics()
  })

  it('forest contact at full HP is not a heal — no pulse', () => {
    const { g, live } = scene('forest')
    const p = g.playerBlades.value[0]!
    slamWall(p)
    frames(32)
    expect(p.hp).toBe(p.maxHp)
    expect(live()).toBe(0)
    g.disposePhysics()
  })

  it('forest sub-0.5 top-up (no digit shown) still pulses — HP went up', () => {
    const { g, pulsesOn } = scene('forest')
    const p = g.playerBlades.value[0]!
    p.hp = p.maxHp - 0.3
    slamWall(p)
    frames(32)
    expect(p.hp).toBe(p.maxHp)
    expect(pulsesOn(p)).toHaveLength(1)
    g.disposePhysics()
  })

  it('healer-boss ally contact heals BOTH allies, each gets a pulse', () => {
    const { g, pulsesOn, live } = scene('default', 2)
    const [a, b] = g.npcBlades.value as [typeof g.npcBlades.value[0], typeof g.npcBlades.value[0]]
    a.groupId = 7
    b.groupId = 7
    a.healsAllies = true
    b.healsAllies = true
    a.hp = a.maxHp - 10
    b.hp = b.maxHp - 10
    a.x = 0
    a.y = 0
    b.x = a.radius * 1.5
    b.y = 0
    const hpA = a.hp
    const hpB = b.hp
    frames(16)
    expect(a.hp).toBeGreaterThan(hpA)
    expect(b.hp).toBeGreaterThan(hpB)
    expect(pulsesOn(a)).toHaveLength(1)
    expect(pulsesOn(b)).toHaveLength(1)
    expect(live()).toBe(2)
    g.disposePhysics()
  })

  it('life-leech attacker gets a pulse; the victim does not', () => {
    const { g, pulsesOn } = scene('default')
    const p = g.playerBlades.value[0]!
    const n = g.npcBlades.value[0]!
    p.isLifeLeech = true
    p.hp = p.maxHp - 20
    p.x = -p.radius - 1
    p.y = 0
    p.vx = 6
    n.x = n.radius - 1
    n.y = 0
    n.vx = -1
    const hpN = n.hp
    frames(48)
    expect(n.hp).toBeLessThan(hpN)
    expect(pulsesOn(p)).toHaveLength(1)
    expect(pulsesOn(n)).toHaveLength(0)
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

  it('every heal still lands (HP + number path untouched) while only one pulse plays', () => {
    // Two forest heals inside one pulse: both apply +1, one pulse.
    const { g, pulsesOn } = scene('forest')
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
    g.disposePhysics()
  })
})
