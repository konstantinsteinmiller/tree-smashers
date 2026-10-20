// ─── Tree Smashers terrain: the new feature kinds ────────────────────────────
//
// Leaf arrows (directional boosters), honey (sticky), mushroom caps (bouncy)
// and logs (capsule solids): their pure physics, a fuzzed point-blade sim over
// every layout that must always come to rest (no feature can keep a turn
// alive), and the live engine — a blade launched into each kind ends its turn,
// and a seeded busy-layout battle replays identically.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinnerConfig } from '@/types/spinner'
import { TERRAIN_SHAPES, resolveWall } from '@/use/arenaShapes'
import {
  ARROW_MUL, BOOSTER_CAP_RATIO, BOOSTER_MAX_PER_LAUNCH, HONEY_KEEP, MUSHROOM_MUL, SOLID_KEEP, TERRAIN_LAYOUT_COUNT,
  applyGround, buildTerrainLayout, collideSolids, logClosest, newGroundState, newSolidEffect, type GroundEffect,
  type TerrainLayout
} from '@/use/arenaTerrain'

const out: GroundEffect = { boosted: false, stopped: false, inMud: false }
const empty = (): TerrainLayout => ({
  id: 99, nameKey: 'x', theme: { decor: 'tufts' }, islands: [], boosters: [], holes: [], arrows: [], honey: [], mushrooms: [], logs: []
})

describe('leaf arrows', () => {
  const lay = { ...empty(), arrows: [{ x: 0, y: 0, radius: 14, angle: -Math.PI / 2 }] }
  it('steer toward the arrow and speed up ×ARROW_MUL, once per cooldown', () => {
    const gs = newGroundState()
    const b = { x: 0, y: 0, vx: 5, vy: 0, accelFramesLeft: 0 }
    applyGround(lay, b, gs, 14, 1000, out)
    expect(out.steered).toBe(true)
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(5 * ARROW_MUL)
    expect(b.vy).toBeLessThan(0) // turned toward −y
    expect(b.vx).toBeGreaterThan(0) // … but keeps part of its heading
    const v = [b.vx, b.vy]
    applyGround(lay, b, gs, 14, 1100, out)
    expect([b.vx, b.vy]).toEqual(v)
  })
  it('a head-on blade is turned around, never zeroed; cap + budget hold', () => {
    const gs = newGroundState()
    const b = { x: 0, y: 0, vx: 0, vy: 15, accelFramesLeft: 0 }
    applyGround(lay, b, gs, 14, 0, out)
    expect(b.vy).toBeLessThan(0)
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(Math.max(15, 14 * BOOSTER_CAP_RATIO) + 1e-9)
    for (let k = 1; k < 10; k++) applyGround(lay, b, gs, 14, k * 10_000, out)
    expect(gs.boosts).toBe(BOOSTER_MAX_PER_LAUNCH)
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(Math.max(15, 14 * BOOSTER_CAP_RATIO) + 1e-9)
  })
  it('never moves a resting blade or one in its launch ramp', () => {
    const rest = { x: 0, y: 0, vx: 0, vy: 0, accelFramesLeft: 0 }
    applyGround(lay, rest, newGroundState(), 14, 0, out)
    expect([rest.vx, rest.vy]).toEqual([0, 0])
    const ramp = { x: 0, y: 0, vx: 3, vy: 0, accelFramesLeft: 4 }
    applyGround(lay, ramp, newGroundState(), 14, 0, out)
    expect([ramp.vx, ramp.vy]).toEqual([3, 0])
  })
})

describe('honey', () => {
  it('drags much harder than mud and never stops a blade outright', () => {
    const lay = { ...empty(), honey: [{ x: 0, y: 0, radius: 18 }] }
    const b = { x: 0, y: 0, vx: 6, vy: 0, accelFramesLeft: 0 }
    applyGround(lay, b, newGroundState(), 14, 0, out)
    expect(out.inHoney).toBe(true)
    expect(b.vx).toBeCloseTo(6 * HONEY_KEEP)
    expect(b.vx).toBeGreaterThan(0)
  })
})

describe('mushroom caps', () => {
  const lay = { ...empty(), mushrooms: [{ x: 0, y: 0, radius: 15 }] }
  it('push out, reflect and kick ×MUSHROOM_MUL while the boost budget lasts, then dull', () => {
    const gs = newGroundState()
    const so = newSolidEffect()
    let speeds: number[] = []
    for (let k = 0; k < BOOSTER_MAX_PER_LAUNCH + 2; k++) {
      const b = { x: -40, y: 0, vx: 5, vy: 0, radius: 28 }
      collideSolids(lay, b, gs, 14, k * 10_000, so)
      expect(so.bounced).toBe(true)
      expect(Math.hypot(b.x, b.y)).toBeGreaterThanOrEqual(43 - 1e-9)
      expect(b.vx).toBeLessThan(0)
      speeds.push(Math.abs(b.vx))
    }
    expect(speeds.slice(0, BOOSTER_MAX_PER_LAUNCH)).toEqual(Array(BOOSTER_MAX_PER_LAUNCH).fill(5 * MUSHROOM_MUL))
    expect(speeds[BOOSTER_MAX_PER_LAUNCH]).toBeCloseTo(5 * SOLID_KEEP)
    speeds = []
  })
  it('never kicks above the booster cap and never pulls a blade moving away', () => {
    const b = { x: -42, y: 0, vx: 16, vy: 0, radius: 28 }
    collideSolids(lay, b, newGroundState(), 14, 0, newSolidEffect())
    expect(Math.abs(b.vx)).toBeLessThanOrEqual(Math.max(16, 14 * BOOSTER_CAP_RATIO) + 1e-9)
    const away = { x: -42, y: 0, vx: -3, vy: 0, radius: 28 }
    collideSolids(lay, away, newGroundState(), 14, 0, newSolidEffect())
    expect(away.vx).toBe(-3)
  })
})

describe('logs', () => {
  const log = { ax: -50, ay: 0, bx: 50, by: 0, radius: 10 }
  const lay = { ...empty(), logs: [log] }
  it('are capsules: side hits reflect off the flat, end hits off the round cap', () => {
    expect(logClosest(log, 20, 30)).toEqual({ x: 20, y: 0 })
    expect(logClosest(log, 90, 5)).toEqual({ x: 50, y: 0 })
    const side = { x: 20, y: 30, vx: 0, vy: -6, radius: 28 }
    collideSolids(lay, side, newGroundState(), 14, 0, newSolidEffect())
    expect(side.y).toBeGreaterThanOrEqual(38 - 1e-9)
    expect(side.vy).toBeCloseTo(6 * SOLID_KEEP)
    expect(side.vx).toBeCloseTo(0)
    const end = { x: 80, y: 0, vx: -6, vy: 0, radius: 28 }
    collideSolids(lay, end, newGroundState(), 14, 0, newSolidEffect())
    expect(end.vx).toBeCloseTo(6 * SOLID_KEEP)
  })
})

// ── Fuzz: every layout, many launches — a blade always comes to rest ────────
describe('no feature keeps a blade moving forever', () => {
  let s = 0x2545f491
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
    it(`layout ${id}`, () => {
      const shape = TERRAIN_SHAPES[id]!
      const R = 200
      const lay = buildTerrainLayout(id)
      const so = newSolidEffect()
      for (let n = 0; n < 24; n++) {
        const radius = 28 * (1 + 0.35 * rnd())
        const a = rnd() * Math.PI * 2
        const b = { x: (rnd() - 0.5) * 140, y: rnd() < 0.5 ? 80 : -80, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, radius, accelFramesLeft: 0 }
        const gs = newGroundState()
        let t = 0
        let steps = 0
        // The engine's friction law on the slipperiest (ice) floor: low-speed
        // brake, wall / island boost ×1.08 at full speed, and the no-hit drag
        // that ramps up after 1 s (a booster / arrow restarts its clock, as
        // in applyTerrainGround; mushroom kicks do not).
        let lastHit = 0
        for (; steps < 20_000; steps++) {
          t += 1000 / 60
          b.x += b.vx
          b.y += b.vy
          const sp = Math.hypot(b.vx, b.vy)
          let keep = sp / 14 < 0.25 ? 0.95 : 1 - (1 - 0.985) * 0.35
          const over = (t - lastHit - 1000) / 1000
          if (over > 0) keep *= Math.pow(0.99, Math.pow(over, 1.5))
          b.vx *= keep
          b.vy *= keep
          const hit = resolveWall(shape, b.x, b.y, b.radius, R)
          if (hit) {
            b.x = hit.clampX
            b.y = hit.clampY
            const dot = b.vx * hit.nx + b.vy * hit.ny
            if (dot > 0) {
              const k = 1 + 0.08 * Math.min(1, Math.hypot(b.vx, b.vy) / 14)
              b.vx = (b.vx - 2 * dot * hit.nx) * k
              b.vy = (b.vy - 2 * dot * hit.ny) * k
            }
          }
          for (const isl of lay.islands) {
            const dx = b.x - isl.x
            const dy = b.y - isl.y
            const d = Math.hypot(dx, dy)
            if (d >= b.radius + isl.radius || d < 0.01) continue
            b.x += (dx / d) * (b.radius + isl.radius - d)
            b.y += (dy / d) * (b.radius + isl.radius - d)
            const dot = (b.vx * dx + b.vy * dy) / d
            if (dot < 0) {
              const k = 1 + 0.08 * Math.min(1, Math.hypot(b.vx, b.vy) / 14)
              b.vx = (b.vx - (2 * dot * dx) / d) * k
              b.vy = (b.vy - (2 * dot * dy) / d) * k
            }
          }
          collideSolids(lay, b, gs, 14, t, so)
          applyGround(lay, b, gs, 14, t, out)
          if (out.boosted) lastHit = t
          if (Math.hypot(b.vx, b.vy) < 0.05) break
        }
        expect(steps, `launch ${n} of layout ${id}`).toBeLessThan(20_000)
        expect(resolveWall(shape, b.x, b.y, b.radius, R + 2), 'escaped the wall').toBeNull()
      }
    })
  }
})

// ── Live engine ─────────────────────────────────────────────────────────────
type GameModule = typeof import('@/use/useSpinnerGame')
type Engine = ReturnType<GameModule['useSpinnerGame']>
const FRAME_MS = 17
let frameClock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1
let rs = 1
const lcg = () => {
  rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0
  return rs / 4294967296
}

beforeEach(() => {
  frameClock = 1000
  rafQueue.clear()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => frameClock)
  vi.spyOn(Math, 'random').mockImplementation(lcg)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const frame = () => {
  frameClock += FRAME_MS
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(frameClock)
}
const runUntil = (pred: () => boolean, max = 60 * 60): number => {
  for (let f = 0; f < max; f++) {
    frame()
    if (pred()) return f
  }
  return -1
}

const cfg = (topPartId: SpinnerConfig['topPartId'], bottomPartId: SpinnerConfig['bottomPartId'], lvl: number): SpinnerConfig =>
  ({ topPartId, bottomPartId, topLevel: lvl, bottomLevel: lvl })
const PLAYER = [cfg('star', 'speedy', 10), cfg('round', 'tanky', 10)]
const ENEMY = [cfg('triangle', 'tanky', 10), cfg('piercer', 'balanced', 10)]

const start = async (layout: number, towers: boolean, seed = 0x7e44a1, mathSeed = 5) => {
  vi.resetModules()
  await import('@/use/useUser')
  const game = await import('@/use/useSpinnerGame')
  rs = mathSeed
  frameClock = 1000
  const e = game.useSpinnerGame()
  e.initGame(PLAYER, ENEMY, false, 'default', 0, false, undefined, null, 'circle',
    { seed, firstTurn: 'player', terrain: { layout, towers } })
  e.startMatch()
  return { game, e }
}

const fling = (game: GameModule, e: Engine, id: number, tx: number, ty: number, pull: number) => {
  const me = e.playerBlades.value.find(b => b.id === id)!
  const ang = Math.atan2(ty - me.y, tx - me.x)
  const d = pull * game.MAX_PULL_DISTANCE
  e.beginDrag(me.x, me.y)
  e.updateDrag(me.x - Math.cos(ang) * d, me.y - Math.sin(ang) * d)
  e.releaseDrag()
}

describe('engine — every new feature kind ends the turn', () => {
  const cases: [string, number, (t: TerrainLayout) => { x: number; y: number }][] = [
    ['leaf arrow', 9, t => t.arrows[0]!],
    ['honey', 11, t => t.honey[0]!],
    ['mushroom cap', 4, t => t.mushrooms[0]!],
    ['log', 5, t => logClosest(t.logs[0]!, 0, 15)]
  ]
  for (const [name, layout, target] of cases) {
    for (const pull of [0.35, 1]) {
      it(`${name} (layout ${layout}, pull ${pull})`, async () => {
        const { game, e } = await start(layout, true)
        expect(runUntil(() => e.phase.value === 'player_turn')).toBeGreaterThanOrEqual(0)
        const t = target(e.terrainLayout()!)
        const me = e.playerBlades.value[0]!
        fling(game, e, me.id, t.x, t.y, pull)
        expect(runUntil(() => e.phase.value !== 'player_turn' && e.phase.value !== 'player_launched', 60 * 25)).toBeGreaterThan(0)
        for (const b of e.allBlades.value) expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true)
        e.disposePhysics()
      }, 30_000)
    }
  }

  it('a blade resting on honey / an arrow can launch away and the turn ends', async () => {
    const { game, e } = await start(26, false)
    runUntil(() => e.phase.value === 'player_turn')
    const lay = e.terrainLayout()!
    const me = e.playerBlades.value[0]!
    me.x = lay.honey[0]!.x
    me.y = lay.honey[0]!.y
    fling(game, e, me.id, me.x + 100, me.y - 60, 0.3)
    expect(runUntil(() => e.phase.value !== 'player_turn' && e.phase.value !== 'player_launched', 60 * 25)).toBeGreaterThan(0)
    e.disposePhysics()
  }, 30_000)
})

describe('engine — busy layouts replay identically', () => {
  const play = async (layout: number, mathSeed: number) => {
    const { game, e } = await start(layout, true, 0x51ed, mathSeed)
    const hashes: string[] = []
    let last = e.phase.value
    let ps = 0xabcdef
    const plan = () => {
      ps = (Math.imul(ps, 1664525) + 1013904223) >>> 0
      return ps / 4294967296
    }
    let launchAt: number | null = null
    for (let f = 0; f < 60 * 60 * 6; f++) {
      frame()
      const p = e.phase.value
      if (p !== last) {
        if (p === 'player_turn' || p === 'npc_turn' || p === 'game_over') hashes.push(`${p}:${e.computeStateHash()}`)
        last = p
      }
      if (p === 'game_over') break
      if (p !== 'player_turn') {
        launchAt = null
        continue
      }
      if (launchAt === null) launchAt = f + 3 + Math.floor(plan() * 20)
      if (f < launchAt) continue
      const mine = e.playerBlades.value.filter(x => e.isBladePickable(x))
      if (mine.length) {
        const me = mine[Math.floor(plan() * mine.length)]!
        const tower = e.towers().find(t => t.side === 'npc')!
        const foe = e.npcBlades.value.find(x => x.hp > 0)
        const tgt = plan() < 0.6 || !foe ? tower : foe
        fling(game, e, me.id, tgt.x, tgt.y, 0.55 + plan() * 0.45)
      }
      launchAt = null
    }
    const res = { hashes, result: e.gameResult.value }
    e.disposePhysics()
    return res
  }
  for (const layout of [31, 46, 48]) {
    it(`layout ${layout}: a seeded tower battle finishes and replays identically`, async () => {
      const a = await play(layout, 11)
      const b = await play(layout, 987_654_321)
      expect(a.result).not.toBeNull()
      expect(b.hashes).toEqual(a.hashes)
      expect(b.result).toBe(a.result)
    }, 60_000)
  }
})
