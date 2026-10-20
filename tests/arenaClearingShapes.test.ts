// Tree Smashers arenas are never round: every terrain layout plays in its own
// clearing shape (arenaShapes.TERRAIN_SHAPES), and every feature, tower and
// spawn of that layout must sit fully inside its wall.
import { describe, expect, it } from 'vitest'
import { TERRAIN_SHAPES, isInside, sdf, shapeOutline } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT, buildTerrainLayout, createTower } from '@/use/arenaTerrain'

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
        // Set into the border: 40–50 % of its outline inside the clearing.
        let inside = 0
        const N = 720
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2
          if (sdf(shape, t.x + Math.cos(a) * t.radius, t.y + Math.sin(a) * t.radius, R) < 0) inside++
        }
        expect(inside / N, `${side} tower`).toBeGreaterThanOrEqual(0.4)
        expect(inside / N, `${side} tower`).toBeLessThanOrEqual(0.5)
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
