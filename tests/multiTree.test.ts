// ─── Tree Smashers: trees inside the clearing, 1–3 trees per side ────────────
//
// Owner 2026-10-22: (1) the trees stand INSIDE the arena (their whole outline
// just inside the wall), not set half into the border; (2) a campaign stage
// has 1–3 trees per side, seeded by the stage id (≈ 64 / 28 / 8 %), and a
// side wins by trees only when ALL the other side's trees have fallen.
import { describe, expect, it } from 'vitest'
import { TERRAIN_SHAPES, sdf } from '@/use/arenaShapes'
import {
  MULTI_TREES_FROM_STAGE, TERRAIN_LAYOUT_COUNT, TOWER_WALL_GAP, TREE_SPACING, allTreesDown, buildTerrainLayout,
  createTowers, decideResult, pickTargetTree, terrainCircles, treeCountForStage, type TeamTower
} from '@/use/arenaTerrain'
import { BORDER_INSET, borderMesh } from '@/use/arenaBorderGeometry'
import { PAINTED_BORDERS } from '@/use/paintedBorders'

const R = 200
const BLADES = [26, 27, 28] as const
const outlineMax = (shape: (typeof TERRAIN_SHAPES)[number], t: { x: number; y: number; radius: number }): number => {
  let m = -Infinity
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2
    m = Math.max(m, sdf(shape, t.x + Math.cos(a) * t.radius, t.y + Math.sin(a) * t.radius, R))
  }
  return m
}

const insideShare = (shape: (typeof TERRAIN_SHAPES)[number], t: { x: number; y: number; radius: number }): number => {
  let n = 0
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2
    if (sdf(shape, t.x + Math.cos(a) * t.radius, t.y + Math.sin(a) * t.radius, R) < 0) n++
  }
  return n / 720
}

describe('the single tree stands further inside than the old set-into-the-wall spot', () => {
  it('every clearing: closer to the centre, more of it inside, symmetric top / bottom', () => {
    let sum = 0
    for (const shape of new Set(TERRAIN_SHAPES)) {
      const [p] = createTowers('player', R, 28, 100, shape, {}, 1)
      const [n] = createTowers('npc', R, 28, 100, shape, {}, 1)
      // Old spot: centre ≈ the wall point + 0.1 r out (45 % inside).
      expect(insideShare(shape, p!), shape).toBeGreaterThan(0.5)
      expect(n!.y).toBeCloseTo(-p!.y, 6)
      expect(n!.x).toBeCloseTo(p!.x, 6)
      sum += insideShare(shape, p!)
    }
    expect(sum / new Set(TERRAIN_SHAPES).size).toBeGreaterThan(0.62)
  })
})

describe('tree count per campaign stage', () => {
  it('is seeded by the stage id: deterministic, 1 during the tutorial arc', () => {
    for (let s = 1; s < MULTI_TREES_FROM_STAGE; s++) expect(treeCountForStage(s)).toBe(1)
    for (let s = 1; s <= 500; s++) expect(treeCountForStage(s)).toBe(treeCountForStage(s))
  })

  it('splits ≈ 72 / 23 / 5 % over many stage seeds (#playtest-1-7)', () => {
    const n = [0, 0, 0, 0]
    const N = 20000
    for (let s = MULTI_TREES_FROM_STAGE; s < MULTI_TREES_FROM_STAGE + N; s++) n[treeCountForStage(s)]!++
    expect(n[0]).toBe(0)
    expect(n[1]! / N).toBeGreaterThan(0.69)
    expect(n[1]! / N).toBeLessThan(0.75)
    expect(n[2]! / N).toBeGreaterThan(0.2)
    expect(n[2]! / N).toBeLessThan(0.26)
    expect(n[3]! / N).toBeGreaterThan(0.035)
    expect(n[3]! / N).toBeLessThan(0.065)
  })

  it('boss stages always keep one tree per side (#playtest-1-7)', () => {
    for (let s = 1; s <= 500; s++) expect(treeCountForStage(s, true)).toBe(1)
  })

  it('the first campaign stages actually show both 2 and 3 trees', () => {
    const counts = new Set<number>()
    for (let s = 1; s <= 60; s++) counts.add(treeCountForStage(s))
    expect([...counts].sort()).toEqual([1, 2, 3])
  })
})

describe('trees fit inside every arena', () => {
  for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
    const shape = TERRAIN_SHAPES[id]!
    it(`layout ${id} (${shape}): 1–3 trees inside the wall, apart, clear of features and own-row spawns`, () => {
      const feats = terrainCircles(buildTerrainLayout(id))
      for (const blade of BLADES) {
        for (let count = 1; count <= 3; count++) {
          const all = (['player', 'npc'] as const).flatMap(side => createTowers(side, R, blade, 100, shape, {}, count))
          for (const side of ['player', 'npc'] as const) {
            const tw = all.filter(t => t.side === side)
            expect(tw).toHaveLength(count)
            for (const t of tw) {
              const m = outlineMax(shape, t)
              // Never sticking out further than the old set-into-the-wall spot,
              // never floating off the wall: as far in as the spawn row allows.
              expect(m, `${side} ${count}`).toBeGreaterThan(-TOWER_WALL_GAP - 3)
              expect(insideShare(shape, t), `${side} ${count}`).toBeGreaterThanOrEqual(count === 1 ? 0.5 : 0.44)
              // On the team's own half.
              expect(Math.sign(t.y), side).toBe(side === 'player' ? 1 : -1)
              for (const f of feats) {
                expect(Math.hypot(f.x - t.x, f.y - t.y), `${side} ${count} tree vs ${f.x},${f.y}`).toBeGreaterThanOrEqual(f.radius + t.radius + 8)
              }
              // The row this side launches from (player / PvP), 1–4 regular discs
              // (a bigger disc is pushed clear at spawn).
              const rowY = side === 'player' ? R * 0.4 : -R * 0.4
              for (let n = 1; n <= 4; n++) {
                for (let i = 0; i < n; i++) {
                  const sx = n === 1 ? 0 : (i / (n - 1) - 0.5) * R * 0.7
                  expect(Math.hypot(sx - t.x, rowY - t.y), `${side} ${count} vs spawn ${n}.${i}`).toBeGreaterThanOrEqual(t.radius + blade)
                }
              }
            }
            for (let i = 0; i < tw.length; i++) {
              for (let j = i + 1; j < tw.length; j++) {
                expect(Math.hypot(tw[i]!.x - tw[j]!.x, tw[i]!.y - tw[j]!.y)).toBeGreaterThanOrEqual(TREE_SPACING * tw[i]!.radius - 0.5)
              }
            }
          }
        }
      }
    })
  }

  it('the border breaks at most once per tree, and not at all behind a tree fully inside', () => {
    const spec = Object.values(PAINTED_BORDERS)[0]
    if (spec === undefined) return
    for (const [id, shape] of TERRAIN_SHAPES.entries()) {
      if (id % 5 !== 0) continue
      for (let count = 1; count <= 3; count++) {
        const towers = (['player', 'npc'] as const).flatMap(s => createTowers(s, R, 28, 100, shape, {}, count))
        const cutting = towers.filter(t => outlineMax(shape, t) > -BORDER_INSET).length
        const arcs = borderMesh(spec, shape, R, towers, `meadow:${id}`).arcs
        expect(arcs, `${shape} ${count}`).toBeLessThanOrEqual(Math.max(1, 2 * cutting))
      }
    }
  })
})

const tree = (side: 'player' | 'npc', x: number, hp: number, maxHp = 100): TeamTower =>
  ({ side, x, y: side === 'player' ? 160 : -160, radius: 30, hp, maxHp, flash: 0, spiked: false })

describe('win by trees only when ALL trees are felled', () => {
  it('allTreesDown needs every tree of that side at 0', () => {
    const t = [tree('npc', -60, 0), tree('npc', 0, 5), tree('npc', 60, 0), tree('player', 0, 50)]
    expect(allTreesDown(t, 'npc')).toBe(false)
    t[1]!.hp = 0
    expect(allTreesDown(t, 'npc')).toBe(true)
    expect(allTreesDown(t, 'player')).toBe(false)
    expect(allTreesDown([], 'npc')).toBe(false)
  })

  it('decideResult: one of two enemy trees down is no win; both down is', () => {
    const t = [tree('npc', -50, 0), tree('npc', 50, 20), tree('player', -50, 0), tree('player', 50, 80)]
    expect(decideResult(2, 2, allTreesDown(t, 'player'), allTreesDown(t, 'npc'))).toBeNull()
    t[1]!.hp = 0
    expect(decideResult(2, 2, allTreesDown(t, 'player'), allTreesDown(t, 'npc'))).toBe('win')
  })
})

describe('AI targets living trees', () => {
  it('skips felled trees, picks the weakest standing one (ties: nearest)', () => {
    const t = [tree('player', -60, 0), tree('player', 0, 80), tree('player', 60, 40), tree('npc', 0, 1)]
    expect(pickTargetTree(t, 'player', 0, 0)).toBe(t[2])
    t[2]!.hp = 0
    expect(pickTargetTree(t, 'player', 0, 0)).toBe(t[1])
    t[1]!.hp = 0
    expect(pickTargetTree(t, 'player', 0, 0)).toBeNull()
    const tie = [tree('player', -60, 50), tree('player', 60, 50)]
    expect(pickTargetTree(tie, 'player', 40, 0)).toBe(tie[1])
  })
})
