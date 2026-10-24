// Bosses 100+ art — the drawables are registered, the game can find every
// one of them before anything is painted, and the paint status lists them.
//
//   • art/bosses/manifest.mjs registers 3 boss badges; each
//     has a painter (art/bosses/painters.mjs), a reference in the Art Desk's
//     sheets folder, a prompt block the desk can parse, and a drop-in file.
//   • The shipped files are the PROCEDURAL fallback until painted: status
//     says "needs painting" for every one of them (PAINT-STATUS.md too).
//   • src/data/bossArt.ts points at the badge files.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DRAWABLES,
  BOSSES,
  SHEETS_DIR,
  REFS_SUBDIR,
  PROMPT_DOC,
  STATUS_DOC,
  badgePrompt
} from '../art/bosses/manifest.mjs'
import { PAINTERS } from '../art/bosses/painters.mjs'
import { bossPaintStatus, renderStatus } from '../art/bosses/status.mjs'
import { parsePromptDoc } from '../tools/art-desk/jobs.mjs'
import { BOSS_ART, bossBadgeFile, bossBadgeImgPathForSkin, type BadgedBossId } from '@/data/bossArt'

const ROOT = resolve(__dirname, '..')

describe('boss art — registry', () => {
  it('registers a badge for each of the three new bosses', () => {
    expect(BOSSES.map((b: {
      encounter: string
    }) => b.encounter)).toEqual(['cinder_tyrant', 'glacier_warden', 'frostbite_yeti'])
    expect(DRAWABLES).toHaveLength(3)
    expect(DRAWABLES.every((d: { kind: string }) => d.kind === 'badge')).toBe(true)
    const stems = DRAWABLES.map((d: { stem: string }) => d.stem)
    expect(new Set(stems).size).toBe(stems.length)
  })

  it('every drawable has a painter, a drop-in file, and a reference', () => {
    for (const d of DRAWABLES) {
      expect(typeof PAINTERS[d.key], `${d.key} painter`).toBe('function')
      const target = join(ROOT, 'public', d.target)
      expect(existsSync(target), target).toBe(true)
      expect(statSync(target).size, `${d.target} suspiciously small`).toBeGreaterThan(2000)
      expect(existsSync(join(ROOT, SHEETS_DIR, REFS_SUBDIR, `${d.stem}.png`)), `${d.stem} reference`).toBe(true)
      for (const f of d.finishRefs) expect(existsSync(join(ROOT, f)), `finish ref ${f}`).toBe(true)
    }
  })

  it('src/data/bossArt.ts points at the registered badge files', () => {
    for (const boss of Object.keys(BOSS_ART) as BadgedBossId[]) {
      const d = DRAWABLES.find((x: { key: string }) => x.key === `badge/${boss}`)
      expect(d, boss).toBeTruthy()
      // the procedural crest bake, or — once tools/badge-icons has painted it — the toy-box repaint
      const painted = `images/boss-badges/painted-boss-${BOSS_ART[boss].badgeFile}_`
      const file = bossBadgeFile(boss)
      expect(file === d.target || file.startsWith(painted), file).toBe(true)
      expect(bossBadgeImgPathForSkin(BOSS_ART[boss].skin)).toContain(file)
    }
    expect(bossBadgeImgPathForSkin('boulder')).toBeNull()
  })
})

describe('boss art — prompts and paint status', () => {
  it('PROMPTS-bosses.md has one desk-parseable job per drawable, with its reference and target', () => {
    const doc = readFileSync(join(ROOT, SHEETS_DIR, PROMPT_DOC), 'utf8')
    const jobs = parsePromptDoc(doc, PROMPT_DOC)
    for (const d of DRAWABLES) {
      const j = jobs.find((x: { refName: string }) => x.refName === `${d.stem}.png`)
      expect(j, `${d.stem} job`).toBeTruthy()
      expect(j.target).toBe(d.target)
      const expected = badgePrompt(BOSSES.find((b: { encounter: string }) => b.encounter === d.encounter))
      expect(j.prompt.replace(/\r\n/g, '\n')).toBe(expected.replace(/\r\n/g, '\n').trimEnd())
    }
  })

  it('the status lists every new sheet as needing painting while the procedural fallback ships', () => {
    const rows = bossPaintStatus(ROOT)
    for (const d of DRAWABLES) {
      const r = rows.find((x: { stem: string }) => x.stem === d.stem)
      expect(r, d.stem).toBeTruthy()
      expect(r.doc).toBe(PROMPT_DOC)
      expect(['procedural', 'painted'], `${d.stem} ships`).toContain(r.shipped)
      // the procedural fallback always reads as "needs painting"
      if (r.shipped === 'procedural') expect(r.needsPainting, `${d.stem} needs painting`).toBe(true)
    }
    const md = renderStatus(rows)
    for (const r of rows.filter((x: { shipped: string }) => x.shipped === 'procedural')) {
      expect(md).toMatch(new RegExp(`${r.stem}.*NEEDS PAINTING`))
    }
  })

  it('the written PAINT-STATUS.md lists them too', () => {
    const md = readFileSync(join(ROOT, SHEETS_DIR, STATUS_DOC), 'utf8')
    for (const d of DRAWABLES) expect(md).toContain(`\`${d.stem}\``)
  })
})
