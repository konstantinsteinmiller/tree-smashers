// Smasher skin painting pipeline (tools/smasher-sheets/skins.mjs + paint-queue --skins + smasherAtlas.paintedSkinKey).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SMASHER_SKINS, smasherSkinIdOf } from '@/data/smasherSkinCatalog'
import { SMASHER_IDS } from '@/data/smasherCatalog'
import { paintedSkinKey } from '@/smashers/smasherAtlas'
// @ts-expect-error plain .mjs tool
import { readSkinDefs } from '../tools/smasher-sheets/skins.mjs'
// @ts-expect-error plain .mjs tool
import { rows, skinPrompt } from '../tools/smasher-sheets/prompts.mjs'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('skin pipeline — briefs', () => {
  it('the tool reads exactly the catalog briefs (one source of truth), one per smasher', () => {
    const defs = readSkinDefs() as Record<string, { kind: string, theme: string, concept: string }>
    expect(Object.keys(defs).sort()).toEqual([...SMASHER_IDS].sort())
    for (const id of SMASHER_IDS) expect(defs[id], id).toEqual(SMASHER_SKINS[id])
  })

  it('every smasher has a prompt row and its skin prompt carries the concept, not the base palette rule', () => {
    const defs = readSkinDefs() as Record<string, { kind: string, concept: string }>
    const byId = new Map((rows as Array<{ id: string }>).map(r => [r.id, r]))
    for (const id of SMASHER_IDS) {
      const row = byId.get(id)
      expect(row, `${id}: no prompt row`).toBeTruthy()
      for (const part of ['a', 'b']) {
        const p = skinPrompt(row, defs[id], part) as string
        expect(p, id).toContain(defs[id]!.concept)
        expect(p).toContain('SKIN VARIANT')
        expect(p).not.toContain("keep the layout reference's palette")
        expect(p).toContain('16 cells')
        expect(p).toContain('#FF00FF')
      }
    }
  })
})

describe('skin pipeline — runtime sheet choice', () => {
  const sheets = { bramble: { file: 'bramble_2048x1024.webp', cell: 256, v: 'a' }, 'bramble-skin': { file: 'bramble-skin_2048x1024.webp', cell: 256, v: 'b' } }

  it('a smasher wearing its own painted skin draws the skin sheet', () => {
    expect(paintedSkinKey('bramble', smasherSkinIdOf('bramble'), sheets)).toBe('bramble-skin')
  })

  it('every other look keeps the signature sheet or the rig', () => {
    expect(paintedSkinKey('bramble', undefined, sheets)).toBeNull()
    expect(paintedSkinKey('bramble', 'fire', sheets)).toBeNull()
    expect(paintedSkinKey('thumper', smasherSkinIdOf('bramble'), sheets)).toBeNull() // another smasher's skin
    expect(paintedSkinKey('thumper', smasherSkinIdOf('thumper'), sheets)).toBeNull() // skin not painted yet → rig colourway
  })
})

describe('skin pipeline — queue wiring', () => {
  it('paint-queue --skins slices skins at 256 px with the relaxed colour check and skips the turn audit', () => {
    const q = read('tools/smasher-sheets/paint-queue.mjs')
    expect(q).toContain("'--skins'")
    expect(q).toContain("'--like-max', '70'")
    expect(q).toContain("id.replace(/-skin$/, '')")
    expect(q).toContain("!id.endsWith('-skin')")
    expect(read('package.json')).toContain('"art:skins"')
  })
})
