import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TERRAIN_FEATURE_DRAW } from '@/use/arenaTerrainDraw'
import { drawPaintedLog } from '@/use/arenaTerrainArt'
import { PAINTED_LOG } from '@/use/paintedLog'
import type { TerrainLog } from '@/use/arenaTerrain'

/** A recording 2D-context stub: every method call by name. */
const recorder = () => {
  const calls: { name: string, args: unknown[] }[] = []
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, p) => {
      if (p in t) return t[p]
      if (p === 'getTransform') return () => ({ a: 1, b: 0 })
      return (...args: unknown[]) => { calls.push({ name: String(p), args }) }
    },
    set: (t, p, v) => { t[p] = v; return true }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}
const LOG: TerrainLog = { ax: -60, ay: 15, bx: 60, by: 15, radius: 11 }

describe('procedural log', () => {
  it('draws no dashes (no stitches on scenery)', () => {
    const { ctx, calls } = recorder()
    TERRAIN_FEATURE_DRAW.log(ctx, LOG)
    expect(calls.some(c => c.name === 'setLineDash')).toBe(false)
    const src = readFileSync(join(__dirname, '../src/use/arenaTerrainDraw.ts'), 'utf8')
    const body = src.slice(src.indexOf('const drawLog'), src.indexOf('export type TerrainFeatureKind'))
    expect(body).not.toMatch(/setLineDash|bark stripes/)
  })
})

describe('painted log slices', () => {
  it('registry slices fit the strip and the webp exists', () => {
    if (!PAINTED_LOG) return
    const m = PAINTED_LOG
    for (const [x, w] of [m.left, m.mid, m.right]) {
      expect(w).toBeGreaterThan(0)
      expect(x + w).toBeLessThanOrEqual(m.w)
    }
    expect(m.left[0] + m.left[1]).toBeLessThanOrEqual(m.mid[0])
    expect(m.mid[0] + m.mid[1]).toBeLessThanOrEqual(m.right[0])
    expect(m.top + m.body).toBeLessThanOrEqual(m.h)
    expect(existsSync(join(__dirname, '../public/images/terrain', m.file))).toBe(true)
  })

  it('draws caps + tiled middle covering the capsule at any length', () => {
    const m = PAINTED_LOG ?? { file: 'x', v: '0', w: 300, h: 140, body: 112, top: 14, left: [4, 60], mid: [68, 150], right: [222, 74] } as const
    for (const len of [20, 60, 120, 400]) {
      const { ctx, calls } = recorder()
      drawPaintedLog(ctx, { ax: 0, ay: 0, bx: len, by: 0, radius: 10 }, {} as CanvasImageSource, m)
      const draws = calls.filter(c => c.name === 'drawImage').map(c => c.args as number[])
      const xs = draws.map(a => [a[5]!, a[5]! + a[7]!])
      expect(Math.min(...xs.map(x => x[0]!))).toBeCloseTo(-10, 3)
      expect(Math.max(...xs.map(x => x[1]!))).toBeCloseTo(len + 10, 3)
      // every draw at the log's thickness scale; no gap between consecutive pieces
      for (const a of draws) expect(a[8]).toBeCloseTo(m.h * 20 / m.body, 3)
      const sorted = [...xs].sort((p, q) => p[0]! - q[0]!)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeLessThanOrEqual(sorted[i - 1]![1]! + 1e-6)
    }
  })
})
