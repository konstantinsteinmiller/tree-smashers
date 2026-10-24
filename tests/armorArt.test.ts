// Painted directional armour (tools/armor-art → armorArt) — registry, the
// tile layout along the rim arc, the resolution fallback and the prompt.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { armorTilesImage, drawArmorTiles } from '@/use/armorArt'
import { PAINTED_ARMOR, type PaintedArmor } from '@/use/paintedArmor'
// @ts-expect-error — plain .mjs tool module, no types
import { prompt } from '../tools/armor-art/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const META: PaintedArmor = { file: 'armor-tiles_300x182.webp', v: '00000000', plate: [0, 0, 300, 90], patch: [0, 92, 280, 90] }

const fakeCtx = (scale: number) => {
  const draws: number[][] = []
  const ctx = {
    getTransform: () => ({ a: scale, b: 0 }),
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    drawImage: (...a: unknown[]) => draws.push((a as number[]).slice(1))
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws }
}

describe('armour registry (tools/armor-art/pack.mjs output)', () => {
  it('a painted strip exists, both tiles wide enough to tile along an arc', () => {
    if (!PAINTED_ARMOR) return
    expect(existsSync(path.join(ROOT, 'public/images/vfx', PAINTED_ARMOR.file))).toBe(true)
    for (const t of [PAINTED_ARMOR.plate, PAINTED_ARMOR.patch]) {
      expect(t[2] / t[3]).toBeGreaterThanOrEqual(1.6)
      expect(t[3]).toBeLessThanOrEqual(120)
    }
  })

  it('never loads in node / jsdom (the vector arcs draw)', () => {
    expect(armorTilesImage()).toBeNull()
  })
})

describe('tile layout', () => {
  it('lays ≥ 2 overlapping tiles along a ±60° arc, in one fixed order', () => {
    const { ctx, draws } = fakeCtx(2)
    expect(drawArmorTiles(ctx, {} as CanvasImageSource, META, 'plate', 28, 10, -Math.PI / 3, Math.PI / 3)).toBe(true)
    expect(draws.length).toBeGreaterThanOrEqual(2)
    const len = draws[0]![6]!
    const arc = 28 * (2 * Math.PI / 3)
    expect(len * draws.length).toBeGreaterThan(arc) // overlap: no gaps
    expect(len * draws.length).toBeLessThan(arc * 1.1)
    for (const d of draws) expect(d.slice(0, 4)).toEqual([0, 0, 300, 90])
  })

  it('falls back above the tile resolution, or for a degenerate band', () => {
    expect(drawArmorTiles(fakeCtx(20).ctx, {} as CanvasImageSource, META, 'patch', 28, 10, 0, 2)).toBe(false)
    expect(drawArmorTiles(fakeCtx(1).ctx, {} as CanvasImageSource, META, 'patch', 28, 0, 0, 2)).toBe(false)
  })

  it('useSpinnerGame keeps the vector arcs as the per-arc fallback', () => {
    const s = readFileSync(path.join(ROOT, 'src/use/useSpinnerGame.ts'), 'utf8')
    expect(s).toContain("if (drawArmorTiles(ctx, tiles, PAINTED_ARMOR, mul < 1 ? 'plate' : 'patch',")
    expect(s).toContain('// Plate: dark outline, steel band, light top edge, rivets.')
  })
})

describe('armour prompt', () => {
  it('flat magenta, navy outline; stitches on the cloth patch only, none on the plate', () => {
    const p = prompt()
    expect(p).toMatch(/#FF00FF/)
    expect(p).toMatch(/navy \(#161a40\)/)
    const plate = p.split('\n').find((l: string) => l.startsWith('TOP'))!
    expect(plate).toMatch(/NO stitches/)
    expect(plate).toMatch(/NOT shiny steel/)
  })
})
