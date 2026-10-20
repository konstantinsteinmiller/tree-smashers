// The owner's hard style rules, enforced over every stylesheet and SFC:
//   • no blur: no `filter: blur(…)`, no backdrop-filter, no blurred box- or
//     text-shadow (the third length of a shadow must be 0) — hard offset
//     shadows only;
//   • no radial gradients (CSS or canvas createRadialGradient in UI code).
// Dev-only overlays (perf meter, ads debug HUDs, vConsole) are exempt.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', 'src')
const EXEMPT = new Set([
  'components/atoms/FPerfMeter.vue',
  'components/atoms/LevelPlayDebugOverlay.vue',
  'components/atoms/NativeAdsDebugOverlay.vue',
  'components/atoms/VConsoleHideButton.vue'
])

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|sass|scss|css)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(ROOT)
  .map((p) => ({ p, rel: relative(ROOT, p).replace(/\\/g, '/') }))
  .filter((f) => !EXEMPT.has(f.rel))

/** Strip // and /* *\/ comments plus pug `//-` lines so prose can mention the rules. */
const code = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')

/** Split a shadow list on top-level commas. */
const layers = (v: string): string[] => {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of v) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

const LENGTH = /^-?(\d+(\.\d+)?|\.\d+)(px|rem|em|vmin|vh|vw)?$/
/** True when a shadow layer has a non-zero blur radius (3rd length). */
const isBlurred = (layer: string): boolean => {
  const tokens = layer
    .replace(/\b(rgba?|hsla?|var|calc|color-mix)\([^()]*(\([^()]*\)[^()]*)*\)/g, ' C ')
    .split(/\s+/)
    .filter((t) => t && t !== 'inset' && t !== 'C' && !/^#/.test(t) && !/^[a-z-]+$/i.test(t))
  const lengths = tokens.filter((t) => LENGTH.test(t))
  if (lengths.length < 3) return false
  return parseFloat(lengths[2]) !== 0
}

describe('UI style rules (no blur, no radial gradients)', () => {
  it('no filter: blur / backdrop-filter / radial-gradient anywhere in UI styles', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = code(readFileSync(f.p, 'utf8'))
      if (/blur\(/.test(src)) bad.push(`${f.rel}: blur()`)
      if (/backdrop-filter/.test(src)) bad.push(`${f.rel}: backdrop-filter`)
      if (/radial-gradient/.test(src)) bad.push(`${f.rel}: radial-gradient`)
    }
    expect(bad).toEqual([])
  })

  it('every box-shadow / text-shadow layer has a 0 blur radius', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = code(readFileSync(f.p, 'utf8'))
      const re = /(?:box|text)-shadow\s*:\s*([^;\n}"']+)/g
      for (let m = re.exec(src); m; m = re.exec(src)) {
        for (const layer of layers(m[1])) {
          if (isBlurred(layer)) bad.push(`${f.rel}: ${layer}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('the guard itself catches a blurred shadow and passes a hard one', () => {
    expect(isBlurred('0 4px 12px rgba(0, 0, 0, 0.5)')).toBe(true)
    expect(isBlurred('0 0 24px var(--x)')).toBe(true)
    expect(isBlurred('inset 0 3px 0 var(--color-leaf-300)')).toBe(false)
    expect(isBlurred('0 0 0 3px var(--color-ink)')).toBe(false)
    expect(isBlurred('2px -2px 0 #161a40')).toBe(false)
  })
})
