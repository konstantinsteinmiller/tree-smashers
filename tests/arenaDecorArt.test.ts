// Painted floor decor (tools/decor-sheets → arenaDecorArt) — registry, the
// sprite choice mirroring the vector scatter, the resolution fallback and the
// prompt contract.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DecorKind } from '@/use/arenaTerrain'
import { DECOR_DRAW } from '@/use/arenaTerrainDraw'
import { THEME_LOOK } from '@/use/arenaThemes'
import { DECOR_UNITS, decorSpriteFor, drawDecorSprite, pebbleSprite, tuftSprite } from '@/use/arenaDecorArt'
import { PAINTED_DECOR, PAINTED_DECOR_NAMES, type PaintedDecor } from '@/use/paintedDecor'
// @ts-expect-error — plain .mjs tool module, no types
import { CELLS, prompt } from '../tools/decor-sheets/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const KINDS = Object.keys(DECOR_DRAW) as DecorKind[]

const fakeCtx = (scale: number) => {
  const calls: string[] = []
  const ctx = {
    getTransform: () => ({ a: scale, b: 0 }),
    save: () => calls.push('save'), restore: () => calls.push('restore'),
    translate: () => {}, rotate: () => {}, scale: () => {},
    drawImage: () => calls.push('drawImage')
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const META: PaintedDecor = {
  file: 'decor_384x384.webp',
  v: '00000000',
  rects: Object.fromEntries(PAINTED_DECOR_NAMES.map((n, i) => [n, [(i % 4) * 96 + 4, Math.floor(i / 4) * 96 + 4, 88, 80]])) as PaintedDecor['rects']
}

describe('decor registry (tools/decor-sheets/pack.mjs output)', () => {
  it('names the sheet cells in prompt order and covers every sprite with a size', () => {
    expect([...PAINTED_DECOR_NAMES]).toEqual(CELLS.map(([n]: [string]) => n))
    for (const n of PAINTED_DECOR_NAMES) expect(DECOR_UNITS[n], n).toBeGreaterThan(0)
  })

  it('a painted atlas exists, each rect inside its own 96 px cell', () => {
    if (!PAINTED_DECOR) return
    expect(existsSync(path.join(ROOT, 'public/images/terrain', PAINTED_DECOR.file))).toBe(true)
    PAINTED_DECOR_NAMES.forEach((n, i) => {
      const [x, y, w, h] = PAINTED_DECOR.rects[n]
      expect(x, n).toBeGreaterThanOrEqual((i % 4) * 96)
      expect(y, n).toBeGreaterThanOrEqual(Math.floor(i / 4) * 96)
      expect(x + w, n).toBeLessThanOrEqual((i % 4) * 96 + 96)
      expect(y + h, n).toBeLessThanOrEqual(Math.floor(i / 4) * 96 + 96)
    })
  })
})

describe('sprite choice mirrors the vector scatter', () => {
  it('every kind and spot maps to a sheet sprite', () => {
    for (const kind of KINDS) for (let i = 0; i < 40; i++) expect(PAINTED_DECOR_NAMES).toContain(decorSpriteFor(kind, i, THEME_LOOK.meadow.floor))
  })

  it('keeps the accent alternation (tufts: every 3rd spot is the small flower)', () => {
    const p = THEME_LOOK.meadow.floor
    expect([0, 1, 2, 3].map(i => decorSpriteFor('tufts', i, p))).toEqual(['flowerAccent', 'tuft', 'tuft', 'flowerAccent'])
    expect([0, 1].map(i => decorSpriteFor('toadstools', i, p))).toEqual(['toadstools', 'tuft'])
  })

  it('matches each theme floor: green / forest / dry / frosted tufts, sandstone / basalt / ruin pebbles', () => {
    expect(tuftSprite(THEME_LOOK.meadow.floor)).toBe('tuft')
    expect(tuftSprite(THEME_LOOK.woodland.floor)).toBe('darkTuft')
    expect(tuftSprite(THEME_LOOK.rocky.floor)).toBe('dryTuft')
    expect(tuftSprite(THEME_LOOK.snowy.floor)).toBe('frostTuft')
    expect(pebbleSprite(THEME_LOOK.rocky.floor)).toBe('pebbles')
    expect(pebbleSprite(THEME_LOOK.volcanic.floor)).toBe('basalt')
    expect(pebbleSprite(THEME_LOOK.ruins.floor)).toBe('rubble')
  })
})

describe('fallback', () => {
  it('draws the sprite at or below its own resolution, refuses above it (vector instead)', () => {
    const ok = fakeCtx(2)
    expect(drawDecorSprite(ok.ctx, {} as CanvasImageSource, META, 'tuft', 0, 0, 1)).toBe(true)
    expect(ok.calls.filter(c => c === 'drawImage')).toHaveLength(1)
    const big = fakeCtx(20)
    expect(drawDecorSprite(big.ctx, {} as CanvasImageSource, META, 'tuft', 0, 0, 1)).toBe(false)
    expect(big.calls).toHaveLength(0)
  })

  it('in node / jsdom the vector DECOR_DRAW is untouched (no atlas install)', () => {
    expect(DECOR_DRAW.tufts.toString()).toContain('flower(')
  })
})

describe('decor prompt', () => {
  it('one 4 × 4 sheet on flat magenta, floor-matching outline, no navy UI ink, no stitches', () => {
    const p = prompt()
    expect(CELLS).toHaveLength(16)
    expect(p).toMatch(/4 × 4 SPRITE SHEET/)
    expect(p).toMatch(/#FF00FF/)
    expect(p).toMatch(/not black, not navy/)
    expect(p).toMatch(/NO stitches/)
    expect(readFileSync(path.join(ROOT, 'tools/decor-sheets/pack.mjs'), 'utf8')).toMatch(/REFUSES the whole sheet/)
  })
})
