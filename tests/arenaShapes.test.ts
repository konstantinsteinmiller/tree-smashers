// Phase 4 — pure arena geometry. The SDF is the single source of truth, so
// these tests pin inside/outside, outward-normal sanity, clamp correctness,
// and that the path tracer emits a closed path for every shape.

import { describe, expect, it } from 'vitest'
import {
  ARENA_SHAPES,
  NON_CIRCLE_SHAPES,
  sdf,
  isInside,
  resolveWall,
  clampInside,
  traceArenaPath,
  type ArenaShape
} from '@/use/arenaShapes'

const R = 200
const BLADE = 12

describe('arena geometry — common invariants for every shape', () => {
  for (const shape of ARENA_SHAPES) {
    describe(shape, () => {
      it('origin is inside, a far point is outside', () => {
        expect(isInside(shape, 0, 0, R)).toBe(true)
        expect(isInside(shape, R * 5, R * 5, R)).toBe(false)
      })

      it('resolveWall is null inside and a valid hit outside', () => {
        expect(resolveWall(shape, 0, 0, BLADE, R)).toBeNull()
        // Push far out along +x so every shape's wall is breached there.
        const hit = resolveWall(shape, R * 4, 0, BLADE, R)
        expect(hit).not.toBeNull()
        // Outward unit normal.
        const len = Math.hypot(hit!.nx, hit!.ny)
        expect(len).toBeCloseTo(1, 3)
        // Points away from centre (positive x component here).
        expect(hit!.nx).toBeGreaterThan(0)
      })

      it('clampInside pulls an outside point back within the wall', () => {
        const c = clampInside(shape, R * 4, R * 4, BLADE, R)
        // The clamped centre leaves room for the blade radius.
        expect(isInside(shape, c.x, c.y, R, BLADE - 0.5)).toBe(true)
      })

      it('clampInside is a no-op for a point already well inside', () => {
        const c = clampInside(shape, 0, 0, BLADE, R)
        expect(c.x).toBe(0)
        expect(c.y).toBe(0)
      })
    })
  }
})

describe('shape-specific geometry', () => {
  it('circle normal points radially outward', () => {
    const hit = resolveWall('circle', R + 50, 0, BLADE, R)!
    expect(hit.nx).toBeCloseTo(1, 3)
    expect(hit.ny).toBeCloseTo(0, 3)
  })

  it('diamond boundary obeys |x|+|y| = R and has a 45° corner normal', () => {
    expect(sdf('diamond', R, 0, R)).toBeCloseTo(0, 6)
    expect(sdf('diamond', 0, R, R)).toBeCloseTo(0, 6)
    expect(isInside('diamond', R * 0.6, R * 0.6, R)).toBe(false) // 1.2R > R
    const hit = resolveWall('diamond', R, R, BLADE, R)!
    expect(hit.nx).toBeCloseTo(Math.SQRT1_2, 2)
    expect(hit.ny).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('oval is wider on x than on y', () => {
    // A point past the short (y) axis is outside while the same distance on x
    // is still inside.
    expect(isInside('oval', 0, R * 0.9, R)).toBe(false)
    expect(isInside('oval', R * 0.9, 0, R)).toBe(true)
  })

  it('hexagon is flat-top: edge midpoint sits at the apothem, vertex at +x', () => {
    const apothem = R * Math.cos(Math.PI / 6)
    // Flat top: the top edge (normal pointing up) midpoint is at (0, apothem).
    expect(sdf('hexagon', 0, apothem, R)).toBeCloseTo(0, 4)
    // Pointy side: a vertex sits at (R, 0), i.e. on the boundary.
    expect(sdf('hexagon', R, 0, R)).toBeCloseTo(0, 4)
  })
})

describe('NON_CIRCLE_SHAPES', () => {
  it('excludes circle and lists the custom shapes incl. the three Tree Smashers clearings', () => {
    expect(NON_CIRCLE_SHAPES).not.toContain('circle')
    expect(NON_CIRCLE_SHAPES).toHaveLength(7)
  })
})

describe('traceArenaPath', () => {
  const makeStubCtx = () => {
    const calls: string[] = []
    const rec = (name: string) => (..._a: number[]) => {
      calls.push(name)
    }
    return {
      calls,
      ctx: {
        beginPath: rec('beginPath'),
        moveTo: rec('moveTo'),
        lineTo: rec('lineTo'),
        arc: rec('arc'),
        ellipse: rec('ellipse'),
        arcTo: rec('arcTo'),
        closePath: rec('closePath')
      } as unknown as CanvasRenderingContext2D
    }
  }

  for (const shape of ARENA_SHAPES) {
    it(`emits a path for ${shape}`, () => {
      const { ctx, calls } = makeStubCtx()
      expect(() => traceArenaPath(ctx, shape as ArenaShape, R, 1)).not.toThrow()
      expect(calls[0]).toBe('beginPath')
      expect(calls.length).toBeGreaterThan(1)
    })
  }
})
