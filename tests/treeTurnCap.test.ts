// ─── No tree falls to one enemy turn (arenaTerrain TREE_TURN_HIT_CAP) ───────
//
// Balance pass 2026-10-28: the stage-90 ghost boss felled the player's tree on
// its first launch in half the sim fights — the player lost without playing.
// A part-only NPC's hits now take at most TREE_TURN_HIT_CAP of a PLAYER tree's
// max HP per enemy turn. The same hits on the ENEMY's tree are uncapped (a
// player may still fell a tree in one launch), which also proves the hits
// below are strong enough to break the cap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinnerConfig } from '@/types/spinner'
import { TREE_TURN_HIT_CAP } from '@/use/arenaTerrain'

type GameModule = typeof import('@/use/useSpinnerGame')
const FRAME_MS = 17
let clock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1
let rs = 7
const lcg = () => {
  rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0
  return rs / 4294967296
}

beforeEach(() => {
  clock = 1000
  rafQueue.clear()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(Math, 'random').mockImplementation(lcg)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafQueue.delete(id) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const frame = () => {
  clock += FRAME_MS
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}
const runUntil = (pred: () => boolean, max = 60 * 60): boolean => {
  for (let f = 0; f < max; f++) {
    frame()
    if (pred()) return true
  }
  return false
}

// Glass cannons on both sides: a level-40 star top hits far harder than a
// tree of 0.75 × this team's HP can take.
const GLASS: SpinnerConfig = { topPartId: 'star', bottomPartId: 'speedy', topLevel: 40, bottomLevel: 40 }

const start = async (firstTurn: 'player' | 'opponent') => {
  vi.resetModules()
  await import('@/use/useUser')
  const game: GameModule = await import('@/use/useSpinnerGame')
  const e = game.useSpinnerGame()
  e.initGame([{ ...GLASS }], [{ ...GLASS }], false, 'default', false, undefined, null, 'circle',
    { seed: 0x7ee5, firstTurn, terrain: { layout: 0, towers: true } })
  e.startMatch()
  return e
}

/** Ram `side`'s tree with the blade launched this turn, re-aiming it after
 *  every contact window, until the turn hands over (or `frames` run out). */
const ramTree = (e: Awaited<ReturnType<typeof start>>, side: 'player' | 'npc', launched: string, frames = 60 * 6) => {
  const tree = e.towers().find(t => t.side === side)!
  for (let f = 0; f < frames && e.phase.value === launched; f++) {
    if (f % 20 === 0) {
      const b = (side === 'player' ? e.npcBlades.value : e.playerBlades.value).find(x => x.hp > 0)!
      const dir = side === 'player' ? 1 : -1
      b.x = tree.x
      b.y = tree.y - dir * (tree.radius + b.radius + 2)
      b.vx = 0
      b.vy = dir * 18
    }
    frame()
  }
  return tree
}

describe('TREE_TURN_HIT_CAP', () => {
  it('an enemy turn takes at most the cap off the player\'s full tree', async () => {
    const e = await start('opponent')
    expect(runUntil(() => e.phase.value === 'npc_launched')).toBe(true)
    const tree = ramTree(e, 'player', 'npc_launched')
    expect(tree.hp).toBeGreaterThan(0)
    expect(tree.hp).toBeGreaterThanOrEqual(tree.maxHp * (1 - TREE_TURN_HIT_CAP) - 1e-6)
    e.disposePhysics()
  }, 30_000)

  it('the player\'s own hits are not capped: the same rams fell the enemy tree in one turn', async () => {
    const e = await start('player')
    expect(runUntil(() => e.phase.value === 'player_turn')).toBe(true)
    const me = e.playerBlades.value[0]!
    e.beginDrag(me.x, me.y)
    e.updateDrag(me.x, me.y + 60)
    e.releaseDrag()
    expect(runUntil(() => e.phase.value === 'player_launched', 60)).toBe(true)
    const tree = ramTree(e, 'npc', 'player_launched')
    expect(tree.hp).toBeLessThan(tree.maxHp * (1 - TREE_TURN_HIT_CAP))
    e.disposePhysics()
  }, 30_000)
})
