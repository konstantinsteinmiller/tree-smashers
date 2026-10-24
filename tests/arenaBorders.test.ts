// Painted arena borders: registry, tiling seam metric, the strip mesh
// following every layout's wall, and the procedural fallback.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sdf, TERRAIN_SHAPES } from '@/use/arenaShapes'
import { createTower } from '@/use/arenaTerrain'
import { ARENA_THEME_IDS } from '@/use/arenaThemes'
import {
  BORDER_INSET, BORDER_TOWER_GAP, borderMesh, quadBaseline, tileSequence, type BorderStripSpec
} from '@/use/arenaBorderGeometry'
import { borderKeyFor, drawPaintedBorder } from '@/use/arenaBorderArt'
import { PAINTED_BORDERS } from '@/use/paintedBorders'
// @ts-expect-error — plain .mjs tool module (pixel helpers, no types)
import * as strip from '../tools/arena-borders/strip.mjs'

const R = 200
const BLADE = 28

/** Smooth, non-periodic "painted strip": value-noise colour bands under a
 *  bumpy alpha silhouette, sampled from one long canvas at offset `x0`. */
const fakeStrip = (x0: number, w: number, h: number) => {
  const img = strip.makeImg(w, h)
  const n = (x: number, f: number, p: number) => Math.sin(x * f + p) * 0.5 + Math.sin(x * f * 2.3 + p * 1.7) * 0.3
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + x0
      const top = h * 0.25 + n(X, 0.031, 1) * h * 0.12
      const i = (y * w + x) * 4
      if (y < top || y > h * 0.85) continue
      img.data[i] = 90 + 60 * n(X + y, 0.05, 0.3)
      img.data[i + 1] = 150 + 50 * n(X - y, 0.04, 2.1)
      img.data[i + 2] = 60 + 30 * n(X, 0.07, 4)
      img.data[i + 3] = 255
    }
  }
  return img
}

describe('arena border registry', () => {
  it('only knows real themes / special walls and ships every atlas it lists', () => {
    for (const [theme, b] of Object.entries(PAINTED_BORDERS)) {
      expect([...ARENA_THEME_IDS, 'lava', 'heal']).toContain(theme)
      const file = join(process.cwd(), 'public', 'images', 'arena-borders', b!.file)
      expect(existsSync(file), b!.file).toBe(true)
      expect(statSync(file).size).toBeLessThan(200 * 1024)
      expect(b!.file).toBe(`${theme}_${b!.w}x${b!.h}.webp`)
    }
  })

  it('every theme has ≥ 2 tileable variants inside its atlas, seams under the threshold', () => {
    for (const [theme, b] of Object.entries(PAINTED_BORDERS)) {
      expect(b!.tiles.length, theme).toBeGreaterThanOrEqual(2)
      for (const t of b!.tiles) {
        expect(t.y).toBeGreaterThanOrEqual(0)
        expect(t.y + b!.rowH).toBeLessThanOrEqual(b!.h)
        expect(t.w + 2 * b!.pad).toBeLessThanOrEqual(b!.w)
        expect(b!.cut).toBeGreaterThan(0)
        expect(b!.cut).toBeLessThan(t.w)
      }
      expect(b!.inner).toBeGreaterThan(0)
      expect(b!.inner).toBeLessThan(b!.rowH)
      expect(b!.seam, `${theme} seam`).toBeLessThanOrEqual(strip.MAX_SEAM)
      // bedroom (2026-10-23) is a strictly periodic row of identical cubes: the quilt metric reads
      // a clean cut between two cubes as a big change, so it was packed with BORDER_MAX_INTERNAL=3 after
      // its seam preview (art-sheets/arena-borders/bedroom.preview.png) was checked by eye.
      const maxQuilt = theme === 'bedroom' ? 3 : strip.MAX_INTERNAL
      expect(b!.quilt, `${theme} quilt`).toBeLessThanOrEqual(maxQuilt)
      // never upscaled on a 3× phone (≈ 2.9 device px per unit)
      expect(b!.ppu).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('tiling seam metric', () => {
  it('rates a seamless wrap low and a broken one high', () => {
    const w = 240
    const h = 60
    const periodic = strip.makeImg(w, h)
    const broken = strip.makeImg(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const v = 128 + 100 * Math.sin((x / w) * Math.PI * 2 * 3 + y * 0.1)
        periodic.data.set([v, 255 - v, 90, 255], i)
        const u = 128 + 100 * Math.sin((x / w) * Math.PI * 2 * 2.5 + y * 0.1)
        broken.data.set([u, 255 - u, 90, 255], i)
      }
    }
    expect(strip.seamRatio(periodic)).toBeLessThanOrEqual(1)
    expect(strip.seamRatio(broken)).toBeGreaterThan(3)
  })

  it('buildTiles joins unrelated strips so any tile follows any other without a visible seam', () => {
    const strips = [fakeStrip(0, 300, 64), fakeStrip(1000, 320, 64), fakeStrip(2500, 280, 64)]
    const { tiles, cut } = strip.buildTiles(strips, { K: 24, core: 40 })
    expect(tiles).toHaveLength(3)
    for (const p of strip.pairSeams(tiles)) expect(p.ratio, `${p.i}→${p.j}`).toBeLessThanOrEqual(strip.MAX_SEAM)
    for (const t of tiles) expect(cut).toBeLessThan(t.w)
    // every tile starts with the same join block
    for (const t of tiles.slice(1)) {
      for (let y = 0; y < 64; y++) expect(strip.columnJump(tiles[0], 0, t, 0)).toBe(0)
    }
  })

  it('a strip joined to itself without quilting shows its seam', () => {
    const s = fakeStrip(0, 300, 64)
    expect(strip.seamRatio(s)).toBeGreaterThan(strip.MAX_SEAM)
  })
})

const SPEC: BorderStripSpec = Object.values(PAINTED_BORDERS)[0] ?? {
  ppu: 6, rowH: 174, inner: 150, cut: 60, tiles: [{ y: 2, w: 380 }, { y: 180, w: 460 }, { y: 358, w: 420 }]
}

describe('border mesh follows the outline', () => {
  it('baseline on the wall (BORDER_INSET inside) for every layout, gap at each tree, no folds', () => {
    for (const [id, shape] of TERRAIN_SHAPES.entries()) {
      const towers = (['player', 'npc'] as const).map(s => createTower(s, R, BLADE, 100, shape))
      const mesh = borderMesh(SPEC, shape, R, towers, `meadow:${id}`)
      // A gap only where a tree still reaches into the wall (trees stand
      // inside the clearing now — fully inside means no gap at all).
      expect(mesh.arcs, shape).toBeGreaterThanOrEqual(1)
      // (a wavy wall can touch one tree twice: at most two gaps per tree)
      expect(mesh.arcs, shape).toBeLessThanOrEqual(2 * towers.length)
      for (const st of mesh.stretch) {
        expect(st).toBeGreaterThan(0.85)
        expect(st).toBeLessThan(1.18)
      }
      let worst = 0
      for (const q of mesh.quads) {
        const [bx, by] = quadBaseline(SPEC, q)
        // N = 0.5 arena units ≈ 1.5 device px on a 3× phone
        worst = Math.max(worst, Math.abs(sdf(shape, bx, by, R) + BORDER_INSET))
        // (0.9: the trees stand inside the clearing now, so the wall grazes the
        // gap's edge and an end quad's baseline reaches a little further in —
        // under the tree sprite, half width 1.2 r)
        for (const t of towers) expect(Math.hypot(bx - t.x, by - t.y)).toBeGreaterThan(t.radius * BORDER_TOWER_GAP * 0.9)
        expect(q.u0).toBeGreaterThanOrEqual(-1e-6)
        expect(q.u1).toBeLessThanOrEqual(SPEC.tiles[q.tile]!.w + 1e-6)
        expect(q.u1).toBeGreaterThan(q.u0)
        // no fold: inner and outer edge run the same way round
        const ix = q.i1x - q.i0x
        const iy = q.i1y - q.i0y
        const ox = q.o1x - q.o0x
        const oy = q.o1y - q.o0y
        expect(ix * ox + iy * oy, `${shape} fold`).toBeGreaterThan(0)
      }
      expect(worst, shape).toBeLessThan(0.5)
      // consecutive quads share their edge (no cracks)
      for (let k = 1; k < mesh.quads.length; k++) {
        const a = mesh.quads[k - 1]!
        const b = mesh.quads[k]!
        if (Math.hypot(a.i1x - b.i0x, a.i1y - b.i0y) > 1e-6) continue // next arc
        expect(Math.hypot(a.o1x - b.o0x, a.o1y - b.o0y)).toBeLessThan(1e-6)
      }
    }
  })

  it('without trees the border closes into one seamless loop', () => {
    const mesh = borderMesh(SPEC, 'clearing9', R, [], 'rocky:9')
    expect(mesh.arcs).toBe(1)
    const first = mesh.quads[0]!
    const last = mesh.quads[mesh.quads.length - 1]!
    expect(first.u0).toBeCloseTo(0, 6)
    expect(last.u1).toBeCloseTo(SPEC.tiles[last.tile]!.w, 4)
    expect(Math.hypot(last.i1x - first.i0x, last.i1y - first.i0y)).toBeLessThan(1e-3)
  })

  it('variant order is deterministic and varies by seed', () => {
    const a = tileSequence(SPEC, 3000, 'meadow:3:0')
    expect(tileSequence(SPEC, 3000, 'meadow:3:0')).toEqual(a)
    const others = ['meadow:4:0', 'meadow:5:0', 'ruins:3:0'].map(s => tileSequence(SPEC, 3000, s).join())
    expect(others.some(o => o !== a.join())).toBe(true)
    for (let k = 1; k < a.length; k++) expect(a[k]).not.toBe(a[k - 1])
  })
})

describe('which border an arena wears', () => {
  it('the lava arena wears the lava wall (hurts), the forest arena the heal wall (heals) — once painted — else the theme edge', () => {
    expect(borderKeyFor('lava', 'volcanic')).toBe(PAINTED_BORDERS.lava ? 'lava' : 'volcanic')
    expect(borderKeyFor('forest', 'woodland')).toBe(PAINTED_BORDERS.heal ? 'heal' : 'woodland')
    for (const t of ARENA_THEME_IDS) {
      expect(borderKeyFor('default', t)).toBe(t)
      expect(borderKeyFor('ice', t)).toBe(t)
      expect(borderKeyFor('boss', t)).toBe(t)
    }
  })
})

describe('procedural fallback', () => {
  const ctx = {
    getTransform: () => ({ a: 3, b: 0 }),
    save: () => { throw new Error('should not draw') }
  } as unknown as CanvasRenderingContext2D
  it('draws nothing (caller strokes the wooden rim) when the art cannot load (node / jsdom / ?art=procedural)', () => {
    for (const theme of ARENA_THEME_IDS) expect(drawPaintedBorder(ctx, theme, 'clover', R, [], 'x')).toBe(false)
  })
})
