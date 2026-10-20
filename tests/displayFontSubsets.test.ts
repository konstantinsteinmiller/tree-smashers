import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Self-hosted UI faces — Nunito (Latin / Latin-ext / Vietnamese / Cyrillic) and
 * Playpen Sans (Greek only), see `src/assets/css/fonts.sass`. Pins the contract
 * that keeps them lazy, self-hosted and licensed:
 *   • every subset the generator writes has an @font-face with the SAME
 *     unicode-range (a drifted range silently downloads the wrong file or
 *     falls back to system sans for a whole script);
 *   • the files and the OFL licences ship next to each other;
 *   • Playpen Sans is named only by the Greek stack.
 */
const ROOT = path.resolve(__dirname, '..')
const sass = readFileSync(path.join(ROOT, 'src/assets/css/fonts.sass'), 'utf8')
const script = readFileSync(path.join(ROOT, 'scripts/subset-display-font.mjs'), 'utf8')
const FONT_ROOT = path.join(ROOT, 'src/assets/css/font')

const scriptSubsets = (): Record<string, string> => {
  const body = script.match(/export const SUBSETS = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/^\s*'?([a-z-]+)'?: '([^']+)'/gm)) out[m[1]] = m[2]
  return out
}

/** subset → { face mixin, range } as declared in fonts.sass. */
const sassFaces = (): Record<string, { face: string; range: string }> => {
  const out: Record<string, { face: string; range: string }> = {}
  for (const m of sass.matchAll(/^\+(nunito|playpen)-face\('([a-z-]+)', '([^']+)'\)$/gm)) out[m[2]] = { face: m[1], range: m[3] }
  return out
}

const FILES: Record<string, string> = {
  latin: 'nunito/nunito-900-latin.woff2',
  'latin-ext': 'nunito/nunito-900-latin-ext.woff2',
  vietnamese: 'nunito/nunito-900-vietnamese.woff2',
  cyrillic: 'nunito/nunito-900-cyrillic.woff2',
  'cyrillic-ext': 'nunito/nunito-900-cyrillic-ext.woff2',
  greek: 'playpen-sans/playpen-sans-800-greek.woff2'
}

describe('UI font subsets (Nunito + Playpen Sans greek)', () => {
  it('declares one @font-face per generated subset, with identical unicode-ranges', () => {
    const subsets = scriptSubsets()
    expect(Object.keys(subsets).sort()).toEqual(Object.keys(FILES).sort())
    const faces = sassFaces()
    expect(Object.fromEntries(Object.entries(faces).map(([k, v]) => [k, v.range]))).toEqual(subsets)
    expect(faces.greek.face).toBe('playpen')
    for (const k of Object.keys(FILES)) if (k !== 'greek') expect(faces[k].face).toBe('nunito')
  })

  it('ships every woff2 subset and the OFL licences alongside', () => {
    for (const rel of Object.values(FILES)) {
      const file = path.join(FONT_ROOT, rel)
      expect(existsSync(file), file).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(2048)
    }
    for (const dir of ['nunito', 'playpen-sans']) {
      expect(readFileSync(path.join(FONT_ROOT, dir, 'OFL.txt'), 'utf8')).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i)
    }
  })

  it('names Nunito first in the Latin and CJK stacks, Playpen Sans only for Greek', () => {
    expect(sass).toMatch(/--font-stack-latin: 'Nunito',/)
    for (const k of ['sc', 'tc', 'jp', 'kr']) expect(sass).toMatch(new RegExp(`--font-stack-cjk-${k}: 'Nunito',`))
    expect(sass).toMatch(/--font-stack-greek: 'Playpen Sans', var\(--font-stack-sans\)/)
    const greekRule = sass.match(/html\[data-script='greek'\][^\n]*\n\s*--font-game: (.*)/)?.[1]
    expect(greekRule).toBe('var(--font-stack-greek)')
    const stackLines = sass.split('\n').filter((l) => /^\s*--font-stack-/.test(l) && /Playpen/.test(l))
    expect(stackLines).toHaveLength(1)
  })

  it('is self-hosted — no remote font URL anywhere in the stylesheet', () => {
    expect(sass).not.toMatch(/url\(\s*['"]?(https?:)?\/\//)
    expect(sass).not.toMatch(/@import\s+url/)
  })
})
