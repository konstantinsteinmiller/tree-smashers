import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAINTED_SMASHERS } from '@/smashers/paintedSmashers'
import { PAINTED_PORTRAITS } from '@/smashers/paintedPortraits'
import {
  PORTRAIT_MIN_FIT, choosePortraitArt, paintedLatticePpu, paintedPortraitFor
} from '@/smashers/smasherAtlas'
import { VS_PORTRAIT_FRAME } from '@/use/vsIntro'
import { livePortraits, shippedSheets } from '../tools/smasher-sheets/portraitRegistry.mjs'

const ROOT = join(__dirname, '..')
const DIR = join(ROOT, 'public', 'images', 'smashers', 'portraits')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('painted portrait registry — derived from the shipped sheets', () => {
  it('every portrait belongs to a shipped sheet with the same hash', () => {
    for (const [id, p] of Object.entries(PAINTED_PORTRAITS)) {
      expect(PAINTED_SMASHERS[id], `${id}: portrait without a shipped sheet`).toBeTruthy()
      expect(p.sheet, `${id}: portrait cut from another sheet`).toBe(PAINTED_SMASHERS[id]!.v)
      expect(paintedPortraitFor(id)).toBe(p)
    }
  })

  it('files on disk are exactly the registered ones (no orphan after an unship)', () => {
    const files = existsSync(DIR) ? readdirSync(DIR).sort() : []
    expect(files).toEqual(Object.values(PAINTED_PORTRAITS).map(p => p.file).sort())
  })

  it('holds the frames the VS screen and DOM portraits draw, with more px than the sheet', () => {
    for (const [id, p] of Object.entries(PAINTED_PORTRAITS)) {
      for (const f of [1, VS_PORTRAIT_FRAME.me, VS_PORTRAIT_FRAME.them]) expect(p.frames, id).toContain(f)
      expect(p.cell, id).toBeGreaterThan(PAINTED_SMASHERS[id]!.cell)
      expect(p.file).toBe(`${id}_${p.cell}.webp`)
    }
  })

  it('every shipped sheet whose paintings are on hand has a portrait', () => {
    for (const id of Object.keys(PAINTED_SMASHERS)) {
      const parts = ['a', 'b'].every(k => existsSync(join(ROOT, 'art-sheets', 'painted', `smasher-${id}-${k}.png`)))
      if (parts) expect(PAINTED_PORTRAITS[id], `${id}: run node tools/smasher-sheets/portraits.mjs ${id}`).toBeTruthy()
    }
  })

  it('an unshipped or re-cut sheet drops its portrait at runtime', () => {
    const p = { file: 'x_256.webp', cell: 256, frames: [1, 3, 29], v: 'p', sheet: 's1' }
    const sheet = { file: 'x_1664x832.webp', cell: 208, v: 's1' }
    expect(paintedPortraitFor('x', { x: sheet }, { x: p })).toBe(p)
    expect(paintedPortraitFor('x', {}, { x: p })).toBeNull()
    expect(paintedPortraitFor('x', { x: { ...sheet, v: 's2' } }, { x: p })).toBeNull()
  })

  it('the generator derives the list from the sheet registry text (paint-queue unship = line removed)', () => {
    const sheetsText = read('src/smashers/paintedSmashers.ts')
    const portraitText = read('src/smashers/paintedPortraits.ts')
    const all = livePortraits(portraitText, shippedSheets(sheetsText))
    expect([...all.keys()].sort()).toEqual(Object.keys(PAINTED_PORTRAITS).sort())
    const victim = Object.keys(PAINTED_PORTRAITS)[0]
    if (!victim) return
    // the paint queue's unship: drop the sheet line
    const unshipped = sheetsText.split('\n').filter(l => !l.includes(`"${victim}":`)).join('\n')
    const live = livePortraits(portraitText, shippedSheets(unshipped))
    expect(live.has(victim)).toBe(false)
    expect(live.size).toBe(all.size - 1)
  })

  it('the paint queue unship prunes portraits too', () => {
    expect(read('tools/smasher-sheets/paint-queue.mjs')).toMatch(/portraits\.mjs'\), '--prune'/)
    expect(read('tools/smasher-sheets/slice-painted.mjs')).toMatch(/portraits\.mjs/)
  })
})

describe('choosePortraitArt — never upscale, prefer painted smaller over the rig', () => {
  const portrait = { ppu: paintedLatticePpu(254), name: 'portrait' }
  const sheet = { ppu: paintedLatticePpu(208), name: 'sheet' }

  it('takes the portrait at full size when it has the device px', () => {
    expect(choosePortraitArt([portrait, sheet], 70, 1)).toEqual({ art: portrait, fit: 1 })
  })

  it('takes the sheet when only it is loaded and suffices', () => {
    expect(choosePortraitArt([null, sheet], 50, 1)).toEqual({ art: sheet, fit: 1 })
  })

  it('shrinks the best painting to exactly 1:1 device px when slightly short (3× phone)', () => {
    const c = choosePortraitArt([portrait, sheet], 35, 3)!
    expect(c.art).toBe(portrait)
    expect(c.fit).toBeCloseTo(portrait.ppu / 105, 6)
    // drawn device px per unit = css ppu × fit × dpr = the art's own ppu
    expect(35 * c.fit * 3).toBeCloseTo(portrait.ppu, 6)
  })

  it('falls back to the rig when the painting would shrink below PORTRAIT_MIN_FIT', () => {
    const need = portrait.ppu / (PORTRAIT_MIN_FIT * 0.9)
    expect(choosePortraitArt([portrait, sheet], need, 1)).toBeNull()
    expect(choosePortraitArt([null, null], 10, 1)).toBeNull()
  })

  it('prefers whichever painting has more px when both are short', () => {
    expect(choosePortraitArt([null, sheet], 40, 2)!.art).toBe(sheet)
    expect(choosePortraitArt([portrait, sheet], 40, 2)!.art).toBe(portrait)
  })
})
