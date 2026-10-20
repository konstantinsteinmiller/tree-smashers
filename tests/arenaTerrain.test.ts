// ─── Tree Smashers terrain: layouts, ground physics, team towers ────────────
//
// Pure geometry (layout tables vs spawns / towers), the ground helpers
// (booster / mud / deep hole), the tower result rule, and the live engine:
// a seeded terrain + tower battle replays identically on two pages, a tower
// kill decides the match on both sides, and a deep hole never hangs a turn.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SpinnerConfig } from '@/types/spinner'
import {
  applyGround, buildTerrainLayout, BOOSTER_CAP_RATIO, BOOSTER_MAX_PER_LAUNCH, BOOSTER_MUL, createTower,
  decideResult, layoutForSeed, layoutForStage, MUD_KEEP, newGroundState, TERRAIN_LAYOUT_COUNT,
  terrainCircles, TOWER_RADIUS_MUL, TOWER_Y_RATIO, type GroundEffect
} from '@/use/arenaTerrain'

const ARENA_R = 200
const BLADE_R = 28 // the largest blade radius (mobile)
const JITTER = BLADE_R * 0.8 / 2

/** Every spawn the engine can produce (incl. NPC jitter worst case, PvP row). */
/** Spawn = a blade disc whose centre may sit anywhere in a ±j box. */
interface Spawn { x: number; y: number; radius: number; j: number }
const spawnDiscs = (): Spawn[] => {
  const out: Spawn[] = []
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i < n; i++) {
      const sx = n === 1 ? 0 : (i / (n - 1) - 0.5) * ARENA_R * 0.7
      out.push({ x: sx, y: ARENA_R * 0.4, radius: BLADE_R, j: 0 }) // player row
      out.push({ x: sx, y: -ARENA_R * 0.4, radius: BLADE_R, j: 0 }) // PvP opponent row
    }
  }
  // Opponent formations on a terrain arena (front rows pulled back to −0.3).
  const npc = [
    [0, -0.4], [-0.4, -0.4], [0.4, -0.4],
    [-0.4, -0.55], [0.4, -0.55], [0, -0.3],
    [-0.4, -0.65], [0.4, -0.65], [-0.4, -0.3], [0.4, -0.3]
  ]
  for (const [x, y] of npc) out.push({ x: x! * ARENA_R, y: y! * ARENA_R, radius: BLADE_R, j: JITTER })
  return out
}

const towerDisc = (side: 1 | -1) => ({ x: 0, y: side * ARENA_R * TOWER_Y_RATIO, radius: Math.round(BLADE_R * TOWER_RADIUS_MUL) })
const overlaps = (a: { x: number; y: number; radius: number }, b: { x: number; y: number; radius: number; j?: number }) => {
  // Nearest point of b's jitter box to a's centre.
  const j = b.j ?? 0
  const nx = Math.max(b.x - j, Math.min(b.x + j, a.x))
  const ny = Math.max(b.y - j, Math.min(b.y + j, a.y))
  return Math.hypot(a.x - nx, a.y - ny) < a.radius + b.radius
}

describe('terrain layouts', () => {
  it('cycle by campaign stage: 1→0, 2→1, 3→2, 4→0 …', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(layoutForStage)).toEqual([0, 1, 2, 0, 1, 2, 0])
  })

  it('seed → layout is deterministic and covers every layout', () => {
    const seen = new Set<number>()
    for (let s = 0; s < 64; s++) {
      expect(layoutForSeed(s * 7919)).toBe(layoutForSeed(s * 7919))
      seen.add(layoutForSeed(s * 7919))
    }
    expect(seen.size).toBe(TERRAIN_LAYOUT_COUNT)
  })

  it('a PvP guest build is the host build y-mirrored (same host-frame geometry)', () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const h = buildTerrainLayout(id)
      const g = buildTerrainLayout(id, true)
      expect(terrainCircles(g).map(c => [c.x, -c.y, c.radius])).toEqual(terrainCircles(h).map(c => [c.x, c.y, c.radius]))
      expect(buildTerrainLayout(id)).toEqual(h) // fresh, identical copy
    }
  })

  for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
    it(`layout ${id}: features stay inside the arena, clear of spawns, towers and each other`, () => {
      const t = buildTerrainLayout(id)
      const feats = terrainCircles(t)
      expect(feats.length).toBeGreaterThan(0)
      for (const f of feats) {
        expect(Math.hypot(f.x, f.y) + f.radius).toBeLessThan(ARENA_R - 8)
        for (const s of spawnDiscs()) expect(overlaps(f, s), `feature ${JSON.stringify(f)} vs spawn ${JSON.stringify(s)}`).toBe(false)
        for (const side of [1, -1] as const) expect(overlaps(f, { ...towerDisc(side), radius: towerDisc(side).radius + 8 })).toBe(false)
      }
      for (let i = 0; i < feats.length; i++) {
        for (let j = i + 1; j < feats.length; j++) expect(overlaps(feats[i]!, feats[j]!)).toBe(false)
      }
    })
  }

  it('towers are inside the arena and clear of every spawn', () => {
    for (const side of [1, -1] as const) {
      const tw = towerDisc(side)
      expect(Math.abs(tw.y) + tw.radius).toBeLessThan(ARENA_R)
      for (const s of spawnDiscs()) expect(overlaps(tw, s)).toBe(false)
    }
  })
})

describe('ground physics', () => {
  const out: GroundEffect = { boosted: false, stopped: false, inMud: false }
  const mossy = buildTerrainLayout(0)
  const mud = buildTerrainLayout(1)
  const booster = mossy.boosters[0]!

  it('a booster multiplies speed ×1.3 once, then waits for its cooldown', () => {
    const gs = newGroundState()
    const b = { x: booster.x, y: booster.y, vx: 0, vy: -5, accelFramesLeft: 0 }
    applyGround(mossy, b, gs, 14, 1000, out)
    expect(out.boosted).toBe(true)
    expect(b.vy).toBeCloseTo(-5 * BOOSTER_MUL)
    applyGround(mossy, b, gs, 14, 1100, out) // still on the pad, cooling down
    expect(out.boosted).toBe(false)
    expect(b.vy).toBeCloseTo(-5 * BOOSTER_MUL)
  })

  it('is capped at the blade max speed × cap ratio and limited per launch', () => {
    const gs = newGroundState()
    const b = { x: booster.x, y: booster.y, vx: 0, vy: -15, accelFramesLeft: 0 }
    applyGround(mossy, b, gs, 14, 0, out)
    expect(Math.abs(b.vy)).toBeCloseTo(14 * BOOSTER_CAP_RATIO)
    for (let k = 1; k < 10; k++) applyGround(mossy, b, gs, 14, k * 10_000, out)
    expect(gs.boosts).toBe(BOOSTER_MAX_PER_LAUNCH)
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(14 * BOOSTER_CAP_RATIO + 1e-9)
  })

  it('never boosts a resting blade or one in its launch ramp', () => {
    const gs = newGroundState()
    const rest = { x: booster.x, y: booster.y, vx: 0, vy: 0, accelFramesLeft: 0 }
    applyGround(mossy, rest, gs, 14, 0, out)
    expect(rest.vx === 0 && rest.vy === 0).toBe(true)
    const ramp = { x: booster.x, y: booster.y, vx: 0, vy: -4, accelFramesLeft: 5 }
    applyGround(mossy, ramp, gs, 14, 0, out)
    expect(ramp.vy).toBe(-4)
  })

  it('mud drags hard while inside', () => {
    const m = mud.holes.find(h => !h.deep)!
    const b = { x: m.x, y: m.y, vx: 6, vy: 0, accelFramesLeft: 0 }
    applyGround(mud, b, newGroundState(), 14, 0, out)
    expect(out.inMud).toBe(true)
    expect(b.vx).toBeCloseTo(6 * MUD_KEEP)
  })

  it('a deep hole stops a rolling blade; a blade launched from it is exempt until it leaves', () => {
    const h = mud.holes.find(x => x.deep)!
    const b = { x: h.x, y: h.y, vx: 8, vy: 0, accelFramesLeft: 0 }
    applyGround(mud, b, newGroundState(), 14, 0, out)
    expect(out.stopped).toBe(true)
    expect(b.vx).toBe(0)
    const gs = newGroundState()
    gs.holeExempt = true
    const c = { x: h.x, y: h.y, vx: 0.6, vy: 0, accelFramesLeft: 0 }
    applyGround(mud, c, gs, 14, 0, out)
    expect(out.stopped).toBe(false)
    expect(c.vx).toBe(0.6)
    c.x = h.x + h.radius * 2 // rolled out → the hole is live again
    applyGround(mud, c, gs, 14, 0, out)
    expect(gs.holeExempt).toBe(false)
  })
})

describe('tower result rule', () => {
  it('a fallen tower loses even with smashers alive — both sides', () => {
    expect(decideResult(2, 2, false, true)).toBe('win')
    expect(decideResult(2, 2, true, false)).toBe('lose')
    expect(decideResult(2, 0, false, false)).toBe('win')
    expect(decideResult(0, 2, false, false)).toBe('lose')
    expect(decideResult(1, 1, false, false)).toBeNull()
  })

  it('tower HP is 60% of the team max HP', () => {
    const t = createTower('npc', ARENA_R, 27, 500)
    expect(t.maxHp).toBe(300)
    expect(t.hp).toBe(300)
    expect(t.y).toBeLessThan(0)
    expect(t.radius).toBe(Math.round(27 * TOWER_RADIUS_MUL))
  })
})

// ── Live engine ─────────────────────────────────────────────────────────────

type GameModule = typeof import('@/use/useSpinnerGame')
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

const loadGame = async (): Promise<GameModule> => {
  vi.resetModules()
  await import('@/use/useUser')
  return import('@/use/useSpinnerGame')
}

const cfg = (topPartId: SpinnerConfig['topPartId'], bottomPartId: SpinnerConfig['bottomPartId'], lvl: number): SpinnerConfig =>
  ({ topPartId, bottomPartId, topLevel: lvl, bottomLevel: lvl })
const PLAYER = [cfg('star', 'speedy', 10), cfg('round', 'tanky', 10)]
const ENEMY = [cfg('triangle', 'tanky', 10), cfg('piercer', 'balanced', 10)]

type Engine = ReturnType<GameModule['useSpinnerGame']>

const start = async (layout: number, towers: boolean, seed = 0x7e44a1, mathSeed = 5) => {
  localStorage.clear()
  const game = await loadGame()
  rs = mathSeed
  frameClock = 1000
  const e = game.useSpinnerGame()
  e.initGame(PLAYER, ENEMY, false, 'default', 0, false, undefined, null, 'circle',
    { seed, firstTurn: 'player', terrain: { layout, towers } })
  e.startMatch()
  return { game, e }
}

/** Fling `blade` toward (tx, ty) at `pull` × max pull. */
const fling = (game: GameModule, e: Engine, id: number, tx: number, ty: number, pull: number) => {
  const me = e.playerBlades.value.find(b => b.id === id)!
  const ang = Math.atan2(ty - me.y, tx - me.x)
  const d = pull * game.MAX_PULL_DISTANCE
  e.beginDrag(me.x, me.y)
  e.updateDrag(me.x - Math.cos(ang) * d, me.y - Math.sin(ang) * d)
  e.releaseDrag()
}

const runUntil = (e: Engine, pred: () => boolean, max = 60 * 60): number => {
  for (let f = 0; f < max; f++) {
    frame()
    if (pred()) return f
  }
  return -1
}

/** A whole seeded battle with scripted player launches. */
const playBattle = async (layout: number, mathSeed: number) => {
  const { game, e } = await start(layout, true, 0x51ed, mathSeed)
  const hashes: string[] = []
  let last = e.phase.value
  let ps = 0xabcdef
  const plan = () => {
    ps = (Math.imul(ps, 1664525) + 1013904223) >>> 0
    return ps / 4294967296
  }
  let launchAt: number | null = null
  let f = 0
  for (; f < 60 * 60 * 6; f++) {
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
      // Alternate: rush the enemy tower or hit a smasher.
      const tower = e.towers().find(t => t.side === 'npc')!
      const foe = e.npcBlades.value.find(x => x.hp > 0)
      const tgt = plan() < 0.6 || !foe ? tower : foe
      fling(game, e, me.id, tgt.x, tgt.y, 0.55 + plan() * 0.45)
    }
    launchAt = null
  }
  const out = { hashes, result: e.gameResult.value, frames: f, towers: e.towers().map(t => `${t.side}:${t.hp.toFixed(4)}`).join('|') }
  e.disposePhysics()
  return out
}

describe('engine — terrain + towers', () => {
  it('builds the layout (islands as bouncers) and two towers at 60% team HP', async () => {
    const { e } = await start(2, true)
    expect(e.terrainLayout()?.id).toBe(2)
    expect(e.bouncers().filter(b => b.island !== undefined)).toHaveLength(2)
    const pHp = e.playerBlades.value.reduce((s, b) => s + b.maxHp, 0)
    const p = e.towers().find(t => t.side === 'player')!
    expect(p.maxHp).toBe(Math.round(pHp * 0.6))
    expect(p.y).toBeGreaterThan(0)
    e.disposePhysics()
  })

  it('no terrain option → plain legacy arena, no towers, legacy hash shape', async () => {
    localStorage.clear()
    const game = await loadGame()
    const e = game.useSpinnerGame()
    e.initGame(PLAYER, ENEMY, false, 'default', 0, false, undefined, null, 'circle', { seed: 3 })
    expect(e.terrainLayout()).toBeNull()
    expect(e.towers()).toHaveLength(0)
    expect(e.bouncers()).toHaveLength(0)
    e.disposePhysics()
  })

  for (const layout of [0, 1, 2]) {
    it(`layout ${layout}: a seeded tower battle finishes and replays identically on two pages`, async () => {
      const a = await playBattle(layout, 11)
      const b = await playBattle(layout, 987_654_321)
      expect(a.result).not.toBeNull()
      expect(b.hashes).toEqual(a.hashes)
      expect(b.towers).toBe(a.towers)
      expect(b.result).toBe(a.result)
    }, 60_000)
  }

  it('destroying the enemy tower wins while enemy smashers are still alive', async () => {
    const { game, e } = await start(0, true)
    runUntil(e, () => e.phase.value === 'player_turn')
    const tower = e.towers().find(t => t.side === 'npc')!
    tower.hp = 0.5
    // Clear the lane: move the enemy smashers aside so the shot reaches the tower.
    e.npcBlades.value.forEach((b, i) => { b.x = (i ? 1 : -1) * 150; b.y = -60 })
    const me = e.playerBlades.value[0]!
    me.x = 0
    me.y = -60
    fling(game, e, me.id, tower.x, tower.y, 1)
    expect(runUntil(e, () => e.phase.value === 'game_over')).toBeGreaterThan(0)
    expect(e.gameResult.value).toBe('win')
    expect(e.npcBlades.value.some(b => b.hp > 0)).toBe(true)
    e.disposePhysics()
  })

  it('losing your own tower loses; your own smashers never damage it', async () => {
    const { game, e } = await start(0, true)
    runUntil(e, () => e.phase.value === 'player_turn')
    const own = e.towers().find(t => t.side === 'player')!
    const hp0 = own.hp
    // Own smasher slams its own tower: bounce, no damage.
    const me = e.playerBlades.value[0]!
    me.x = 0
    me.y = 60
    e.npcBlades.value.forEach((b, i) => { b.x = (i ? 1 : -1) * 150; b.y = -100 })
    fling(game, e, me.id, own.x, own.y, 1)
    runUntil(e, () => e.phase.value === 'npc_turn' || e.phase.value === 'game_over')
    expect(own.hp).toBe(hp0)
    // An enemy smasher rolling into it at speed finishes it.
    own.hp = 0.5
    const foe = e.npcBlades.value[0]!
    foe.x = 0
    foe.y = 70
    foe.vx = 0
    foe.vy = 12
    runUntil(e, () => e.phase.value === 'game_over')
    expect(e.gameResult.value).toBe('lose')
    e.disposePhysics()
  })

  it('a blade in the deep hole never hangs the turn — and can launch out', async () => {
    const { game, e } = await start(1, false)
    runUntil(e, () => e.phase.value === 'player_turn')
    const hole = e.terrainLayout()!.holes.find(h => h.deep)!
    const me = e.playerBlades.value[0]!
    me.x = hole.x
    me.y = hole.y
    // Weak launch out of the hole: exempt until it leaves, the turn ends.
    fling(game, e, me.id, hole.x + 100, hole.y, 0.3)
    expect(runUntil(e, () => e.phase.value !== 'player_launched' && e.phase.value !== 'player_turn', 60 * 20)).toBeGreaterThan(0)
    expect(Math.hypot(me.x - hole.x, me.y - hole.y)).toBeGreaterThan(0)
    // Rolling INTO the hole stops dead and still ends the turn.
    runUntil(e, () => e.phase.value === 'player_turn', 60 * 30)
    if (e.phase.value === 'player_turn') {
      const b = e.playerBlades.value.find(x => x.hp > 0)!
      b.x = hole.x - 60
      b.y = hole.y
      e.npcBlades.value.forEach((n, i) => { n.x = (i ? 1 : -1) * 120; n.y = -120 })
      fling(game, e, b.id, hole.x, hole.y, 0.5)
      expect(runUntil(e, () => e.phase.value !== 'player_launched' && e.phase.value !== 'player_turn', 60 * 20)).toBeGreaterThan(0)
    }
    e.disposePhysics()
  })
})
