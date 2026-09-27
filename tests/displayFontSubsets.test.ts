import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Playpen Sans — the self-hosted display face for Latin-ext / Vietnamese /
 * Greek / Cyrillic (see `src/assets/css/fonts.sass`). Pins the contract that
 * keeps it lazy, self-hosted and licensed:
 *   • every subset the generator writes has an @font-face with the SAME
 *     unicode-range (a drifted range silently downloads the wrong file or
 *     falls back to system sans for a whole script);
 *   • the files and the OFL licence ship next to each other;
 *   • only the latin-ext / greek / cyrillic stacks name the face, so a
 *     Western-European locale never downloads it.
 */
const ROOT = path.resolve(__dirname, '..')
const sass = readFileSync(path.join(ROOT, 'src/assets/css/fonts.sass'), 'utf8')
const script = readFileSync(path.join(ROOT, 'scripts/subset-display-font.mjs'), 'utf8')
const FONT_DIR = path.join(ROOT, 'src/assets/css/font/playpen-sans')

const scriptSubsets = (): Record<string, string> => {
  const body = script.match(/export const SUBSETS = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/^\s*'?([a-z-]+)'?: '([^']+)'/gm)) out[m[1]] = m[2]
  return out
}

const sassFaces = (): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const m of sass.matchAll(/^\+playpen-face\('([a-z-]+)', '([^']+)'\)$/gm)) out[m[1]] = m[2]
  return out
}

describe('Playpen Sans display-face subsets', () => {
  it('declares one @font-face per generated subset, with identical unicode-ranges', () => {
    const subsets = scriptSubsets()
    expect(Object.keys(subsets).sort()).toEqual(['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext', 'vietnamese'])
    expect(sassFaces()).toEqual(subsets)
  })

  it('ships every woff2 subset and the OFL licence alongside', () => {
    for (const name of Object.keys(scriptSubsets())) {
      const file = path.join(FONT_DIR, `playpen-sans-800-${name}.woff2`)
      expect(existsSync(file), file).toBe(true)
      // Above Vite's 4 KB inline limit is not relied on (vite.config forbids
      // inlining woff2), but an empty file would mean a failed subset run.
      expect(statSync(file).size).toBeGreaterThan(2048)
    }
    expect(readFileSync(path.join(FONT_DIR, 'OFL.txt'), 'utf8')).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i)
  })

  it('is named only by the stacks of the scripts Angry cannot draw', () => {
    const latinStack = sass.match(/--font-stack-latin: (.*)/)?.[1] ?? ''
    expect(latinStack).not.toMatch(/Playpen/)
    expect(sass).toMatch(/--font-stack-display-ext: 'Playpen Sans', var\(--font-stack-sans\)/)
    const extRule = sass.match(/html\[data-script='latin-ext'\][^\n]*\n\s*--font-game: (.*)/)?.[1]
    expect(extRule).toBe('var(--font-stack-display-ext)')
    // No stack other than the display-ext one may mention the face.
    const stackLines = sass.split('\n').filter((l) => /^\s*--font-stack-/.test(l) && /Playpen/.test(l))
    expect(stackLines).toHaveLength(1)
  })

  it('is self-hosted — no remote font URL anywhere in the stylesheet', () => {
    expect(sass).not.toMatch(/url\(\s*['"]?(https?:)?\/\//)
    expect(sass).not.toMatch(/@import\s+url/)
  })
})
