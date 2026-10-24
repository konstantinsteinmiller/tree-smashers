// Tree Smashers arenas are never round: every terrain layout plays in its own
// clearing shape (arenaShapes.TERRAIN_SHAPES), and every feature, tower and
// spawn of that layout must sit fully inside its wall.
import { describe, expect, it } from 'vitest'
import { TERRAIN_SHAPES, isInside, sdf, shapeOutline } from '@/use/arenaShapes'
import { CENTRE_LANE_HALF, MAX_SOLID_OBSTACLES, TERRAIN_LAYOUT_COUNT, buildTerrainLayout, createTower, solidBudgetFor } from '@/use/arenaTerrain'

const R = 200
const BLADE = 28
const MARGIN = 4

describe('arena clearing shapes', () => {
  it('has one non-circular shape per layout, inscribed in the camera circle', () => {
    expect(TERRAIN_SHAPES.length).toBe(TERRAIN_LAYOUT_COUNT)
    for (const shape of TERRAIN_SHAPES) {
      expect(shape).not.toBe('circle')
      const pts = shapeOutline(shape, R)
      let min = Infinity
      let max = 0
      for (let i = 0; i < pts.length; i += 2) {
        const r = Math.hypot(pts[i]!, pts[i + 1]!)
        min = Math.min(min, r)
        max = Math.max(max, r)
      }
      expect(max).toBeLessThanOrEqual(R + 0.5)
      // Visibly not a circle.
      expect(max - min).toBeGreaterThan(R * 0.1)
    }
  })

  it('sdf is negative at the centre and positive outside the camera circle', () => {
    for (const shape of TERRAIN_SHAPES) {
      expect(sdf(shape, 0, 0, R)).toBeLessThan(0)
      for (let a = 0; a < 6.28; a += 0.3) {
        expect(sdf(shape, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, R)).toBeGreaterThan(0)
      }
    }
  })

  for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
    it(`layout ${id}: features, towers and spawns fit inside ${TERRAIN_SHAPES[id]}`, () => {
      const shape = TERRAIN_SHAPES[id]!
      for (const flip of [false, true]) {
        const lay = buildTerrainLayout(id, flip)
        for (const c of [...lay.islands, ...lay.boosters, ...lay.holes]) {
          expect(isInside(shape, c.x, c.y, R, c.radius + MARGIN), `${JSON.stringify(c)}`).toBe(true)
        }
      }
      for (const side of ['player', 'npc'] as const) {
        const t = createTower(side, R, BLADE, 100, shape)
        // Inside the clearing (owner 2026-10-22): more than half its outline.
        let inside = 0
        const N = 720
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2
          if (sdf(shape, t.x + Math.cos(a) * t.radius, t.y + Math.sin(a) * t.radius, R) < 0) inside++
        }
        expect(inside / N, `${side} tower`).toBeGreaterThanOrEqual(0.5)
      }
      // Player row (y = 0.4R, x spread ±0.35R) and its mirror.
      for (const x of [-0.35 * R, 0, 0.35 * R]) {
        for (const y of [0.4 * R, -0.4 * R]) {
          expect(isInside(shape, x, y, R, BLADE + MARGIN)).toBe(true)
        }
      }
    })
  }
})

describe('obstacle budget', () => {
  it(`every layout has at most ${MAX_SOLID_OBSTACLES} solid obstacles`, () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const l = buildTerrainLayout(id)
      expect(l.islands.length + l.mushrooms.length + l.logs.length, `layout ${id}`).toBeLessThanOrEqual(MAX_SOLID_OBSTACLES)
    }
  })

  // Owner 2026-10-22: obstacles are RARE — most clearings open, one side
  // obstacle every 4th stage, a mirrored pair every 9th, a big centre island
  // to fling around every 12th; never an obstacle blocking the middle lane.
  it('follows the rarity schedule exactly', () => {
    const tally = { 0: 0, 1: 0, 2: 0, centre: 0 }
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const l = buildTerrainLayout(id)
      const n = l.islands.length + l.mushrooms.length + l.logs.length
      const b = solidBudgetFor(id)
      if (b.bigCentre) {
        tally.centre++
        expect(l.mushrooms.length + l.logs.length, `layout ${id}`).toBe(0)
        expect(l.islands, `layout ${id}`).toHaveLength(1)
        expect(l.islands[0]!.x).toBe(0)
      } else {
        expect(n, `layout ${id}`).toBe(b.count)
        tally[b.count]++
      }
    }
    expect(tally).toEqual({ 0: 30, 1: 11, 2: 5, centre: 4 })
    // never two obstacle stages of the 2-kind closer than 8 apart, centre
    // islands 12 apart
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      if (solidBudgetFor(id).count === 2 && !solidBudgetFor(id).bigCentre) for (let k = 1; k < 8; k++) expect(solidBudgetFor(id + k).count === 2 && !solidBudgetFor(id + k).bigCentre).toBe(false)
    }
  })

  it('no non-centre obstacle reaches into the central lane', () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      if (solidBudgetFor(id).bigCentre) continue
      const l = buildTerrainLayout(id)
      for (const d of [...l.islands, ...l.mushrooms]) expect(Math.abs(d.x) - d.radius, `layout ${id}`).toBeGreaterThanOrEqual(CENTRE_LANE_HALF)
      for (const g of l.logs) {
        expect(Math.sign(g.ax) === Math.sign(g.bx), `layout ${id} log spans x=0`).toBe(true)
        expect(Math.min(Math.abs(g.ax), Math.abs(g.bx)) - g.radius, `layout ${id}`).toBeGreaterThanOrEqual(CENTRE_LANE_HALF)
      }
    }
  })

  it('the centre island leaves a lane for the largest disc on both sides and clears the spawn rows', () => {
    const DISC = 28 * 1.35
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      if (!solidBudgetFor(id).bigCentre) continue
      const shape = TERRAIN_SHAPES[id]!
      const isl = buildTerrainLayout(id).islands[0]!
      for (const sign of [-1, 1]) {
        // a disc grazing the island's side still fits inside the wall
        const x = isl.x + sign * (isl.radius + DISC + 2)
        expect(isInside(shape, x, isl.y, R, DISC + 2), `layout ${id} lane ${sign}`).toBe(true)
        expect(isInside(shape, x, -isl.y, R, DISC + 2), `layout ${id} lane ${sign} (flip)`).toBe(true)
      }
      // spawn rows (y = ±0.4R) for team sizes 1–3 at the largest disc
      expect(0.4 * R - Math.abs(isl.y) - isl.radius, `layout ${id}`).toBeGreaterThanOrEqual(DISC + 2)
    }
  })
})
