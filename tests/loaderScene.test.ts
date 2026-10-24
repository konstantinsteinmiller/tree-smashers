// The loader's key-art backdrop (tools/loader-art) — shared by #static-splash
// and FLogoProgress.vue through index.html's one loader sheet:
//   • the generated block is current (build.mjs output, not hand-edited);
//   • painted layers exist per orientation, are preloaded for it, stay small;
//   • the PIXEL GRID (render-sharpness rule — blur-probe measures SHARP):
//     paintings are files of 12-multiple px shown at exactly px ÷ DPR, the
//     slides step one device px at a time, every box / offset is rounded to
//     whole css px, the stars flash by opacity alone, the tree hit is a jolt
//     on whole-px poses, the camera dolly moves only the flat hill bands;
//   • the owner's style rules hold in the loader sheet and the inline art:
//     no blur / glow filters, no radial or any SVG gradient, hard shadows;
//     no stitches / felt on scenery;
//   • every scene animation is compositor-only (transform / opacity);
//   • reduced motion stops the whole scene;
//   • the tree hits land on the SMASHERS hop's landing (the sync).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — plain ESM tool module, no types
import { sceneCss, PAINTED_JSON, SLIDES, DPR_STEPS, PORTRAIT } from '../tools/loader-art/build.mjs'

type Variant = { file: string, w: number, h: number }
const ROOT = join(__dirname, '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/\r/g, '')
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
const painted = existsSync(PAINTED_JSON) ? JSON.parse(readFileSync(PAINTED_JSON, 'utf8')) as { v: string, layers: Record<string, { l: Variant, p: Variant }> } : null
const block = /\/\* loader-scene:start[^\n]*\n\s*([\s\S]*?)\n\s*\/\* loader-scene:end \*\//.exec(style)?.[1] ?? ''
const keyframes = (name: string): string => new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n {6}\\}`).exec(style)?.[1] ?? ''
const sec = (v: string): number => Number(v.replace('s', ''))
const rule = (sel: string, from = style): string => { const i = from.indexOf(sel); return i < 0 ? '' : from.slice(i, from.indexOf('}', i)) }

describe('loader scene: generated art', () => {
  it('the block in index.html is what tools/loader-art/build.mjs writes (run it after editing scene.mjs)', () => {
    expect(block).not.toBe('')
    expect(block.replace(/\s+/g, ' ')).toBe((sceneCss(painted) as string).replace(/\s+/g, ' '))
  })

  it('painted layers exist per orientation, are preloaded for it and stay small', () => {
    if (!painted) return
    const perOrientation = { l: 0, p: 0 }
    for (const [name, layer] of Object.entries(painted.layers)) {
      for (const k of ['l', 'p'] as const) {
        const v = layer[k]
        const file = join(ROOT, 'public', 'images', 'loader', v.file)
        expect(existsSync(file), v.file).toBe(true)
        expect(v.file).toBe(`loader-${name}-${k}_${v.w}x${v.h}.webp`)
        expect(readFileSync(file).subarray(8, 12).toString(), v.file).toBe('WEBP')
        const size = statSync(file).size
        expect(size, v.file).toBeLessThan(100 * 1024)
        perOrientation[k] += size
        const media = k === 'p' ? PORTRAIT : `not all and ${PORTRAIT}`
        expect(html).toContain(`<link rel="preload" href="/images/loader/${v.file}?v=${painted.v}" as="image" type="image/webp" media="${media}">`)
      }
    }
    expect(perOrientation.l).toBeLessThan(160 * 1024)
    expect(perOrientation.p).toBeLessThan(160 * 1024)
  })
})

describe('loader scene: pixel grid (nothing resampled — blur-probe SHARP)', () => {
  it('--ts-dpr steps round the device pixel ratio UP and land exactly on 1, 2, 3, 4', () => {
    const steps = [...style.matchAll(/@media \(min-resolution: ([\d.]+)dppx\) \{ :root \{ --ts-dpr: ([\d.]+); \} \}/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as const)
    expect(steps.length).toBeGreaterThanOrEqual(5)
    let prev = 1
    for (const [from, dpr] of steps) {
      expect(from).toBeLessThanOrEqual(prev + 0.011) // no gap between steps
      expect(dpr).toBeGreaterThan(prev)
      prev = dpr
    }
    for (const d of [2, 3, 4]) expect(steps.map((s) => s[1])).toContain(d)
  })

  it('paintings are 12-multiple px files shown at exactly px ÷ DPR (whole css px at DPR 1–4)', () => {
    if (!painted) return
    for (const [name, layer] of Object.entries(painted.layers)) {
      for (const v of [layer.l, layer.p]) {
        expect(v.w % 12, `${v.file} width`).toBe(0)
        expect(v.h % 12, `${v.file} height`).toBe(0)
        expect(block, name).toContain(`calc(${v.w}px / var(--ts-dpr))`)
        expect(block, name).toContain(`calc(${v.h}px / var(--ts-dpr))`)
      }
    }
  })

  it('the slides move one device px per step: steps(tile width × DPR) per height class and DPR', () => {
    for (const cls of Object.values(SLIDES) as { clouds: Record<string, [number, number]>, drift: Record<string, number> }[]) {
      for (const [dpr] of DPR_STEPS as [number, string][]) {
        for (const k of ['far', 'near']) {
          expect(block).toContain(`.ts-clouds--${k} { ${dpr === 1 ? `--w: ${cls.clouds[k]![0]}px; --h: ${cls.clouds[k]![1]}px; ` : ''}animation-timing-function: steps(${cls.clouds[k]![0] * dpr}); }`)
          expect(block).toContain(`.ts-drift--${k} { ${dpr === 1 ? `--tile: ${cls.drift[k]}px; ` : ''}animation-timing-function: steps(${cls.drift[k]! * dpr}); }`)
        }
      }
    }
    for (const n of ['ts-slide', 'ts-fall']) expect(keyframes(n), n).toMatch(/var\(--(w|tile)\)/)
  })

  it('every box and offset of the scene is rounded to whole css px where round() exists', () => {
    const grid = style.slice(style.indexOf('@supports (width: round(1.5px, 1px))'))
    for (const sel of ['.ts-sun {', '.ts-clouds--far {', '.ts-hills--far {', '.ts-forest {', '.ts-ground {', '.ts-tree {', '.ts-tree::before {', '.ts-front {', '.ts-burst {']) {
      expect(rule(sel, grid), sel).toMatch(/round\(/)
    }
  })

  it('only the flat hill bands ride the camera dolly; trees, forest, ground and bushes hold still', () => {
    const users = [...style.matchAll(/\n {6}([^\n{}@]+)\{[^}]*animation: ts-dolly/g)].map((m) => m[1]!.trim())
    expect(users).toEqual(['.ts-hills'])
    for (const sel of ['.ts-forest', '.ts-ground', '.ts-front::before', '.ts-trees {']) expect(rule(sel), sel).not.toMatch(/animation:/)
  })

  it('the stars flash by opacity alone and the tree hit is a jolt on whole-px poses held by steps(1)', () => {
    for (const n of ['ts-burst', 'ts-tree-star']) expect(keyframes(n), n).not.toMatch(/transform/)
    const hit = keyframes('ts-tree-hit')
    expect(hit).not.toMatch(/rotate|scale/)
    for (const m of hit.matchAll(/translate\(([^)]*)\)/g)) for (const v of m[1]!.split(',')) expect(v.trim(), m[0]).toMatch(/^-?\d+(px)?$/)
    expect(rule('.ts-tree {')).toMatch(/ts-tree-hit [^;]*steps\(1, end\)/)
  })
})

describe('loader scene: style rules (flat, hard, no blur)', () => {
  const svgs = [...block.matchAll(/data:image\/svg\+xml,([^")]+)/g)].map((m) => decodeURIComponent(m[1]!))

  it('no blur, glow, backdrop filter or radial gradient in the loader sheet', () => {
    const css = style.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("data:[^"]*"\)/g, 'url()')
    expect(css).not.toMatch(/blur\(|backdrop-filter|radial-gradient|drop-shadow/)
    for (const m of css.matchAll(/(?:box|text)-shadow\s*:\s*([^;]+)/g)) {
      for (const layer of m[1]!.split(/,(?![^(]*\))/)) {
        const lengths = layer.replace(/rgba?\([^)]*\)/g, '').trim().split(/\s+/).filter((t) => /^-?[\d.]+(px|em|vmin)?$/.test(t))
        if (lengths.length >= 3) expect(parseFloat(lengths[2]!), layer).toBe(0)
      }
    }
  })

  it('the inline art is flat: no SVG gradients, filters, blur or opacity masks', () => {
    expect(svgs.length).toBeGreaterThan(10)
    for (const s of svgs) expect(s).not.toMatch(/Gradient|<filter|feGaussian|<mask|blur/i)
  })

  // Owner rule: stitches / seams / felt only on the stuffed-animal smashers —
  // never on scenery. Every layer of this backdrop is scenery.
  it('no stitches on scenery: no dashed strokes in the inline art', () => {
    for (const s of svgs) expect(s).not.toMatch(/dasharray/i)
  })

  it('no stitches on scenery: every loader paint prompt carries the rule and never asks for stitches / felt', () => {
    const rule = 'NO stitches, NO seams, NO felt or fabric texture on trees, bushes, hills or any scenery — only the plush characters may have stitches'
    for (const name of ['tree', 'forest', 'front']) {
      const p = readFileSync(join(ROOT, 'art-sheets', 'loader', `${name}.prompt.txt`), 'utf8')
      expect(p, name).toContain(rule)
      // every mention of stitches / seams / felt is a prohibition
      const rest = p.split(rule).join('')
      for (const m of rest.matchAll(/[^\n.]*\b(stitch\w*|seams?|felt)\b[^\n.]*/gi)) expect(m[0], `${name}: "${m[0].trim()}"`).toMatch(/\bno\b|\bnot\b/i)
    }
  })
})

describe('loader scene: motion', () => {
  const names = [...new Set([...style.matchAll(/animation:\s*([a-z-]+) /g)].map((m) => m[1]!))]
    .filter((n) => /^ts-(turn|slide|dolly|fall|sway|tree-|fly-|run-|burst)/.test(n))

  it('every scene keyframe animates transform / opacity only (compositor)', () => {
    expect(names.length).toBeGreaterThanOrEqual(10)
    for (const n of names) {
      const body = keyframes(n)
      expect(body, n).not.toBe('')
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]!)
      expect(props.filter((p) => !['transform', 'opacity', 'animation-timing-function'].includes(p)), n).toEqual([])
    }
  })

  it('reduced motion stops every backdrop animation (pseudo-elements too) and hides the riders and hits', () => {
    const rm = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const sel of ['.ts-backdrop div,', '.ts-backdrop div::before,', '.ts-backdrop div::after,']) expect(rm).toContain(sel)
    for (const sel of ['.ts-zoom,', '.ts-burst,', '.ts-tree::before,', '.ts-tree::after']) expect(rm).toContain(sel)
  })

  it('tree hits and the impact star land on the SMASHERS hop landing', () => {
    const beat = /\.ts-logo__anim--smashers \{[^}]*ts-beat ([\d.]+)s ([\d.]+)s/.exec(style)!
    const [period, delay] = [sec(beat[1]!), sec(beat[2]!)]
    const landPct = /(\d+)% \{ transform: translateY\(2%\) scale\(1, 0\.95\)/.exec(keyframes('ts-beat'))![1]!
    const landing = delay + period * (Number(landPct) / 100)
    const onBeat = (t: number): boolean => Math.abs(((t - landing) % period + period) % period) < 0.06 ||
      Math.abs(((t - landing) % period + period) % period - period) < 0.06
    // trees: hit at 50 % of a 5.6 s loop, delays via --hit
    const hitPct = 50
    const treeDur = sec(/animation: ts-tree-hit ([\d.]+)s/.exec(style)![1]!)
    const hits = [...style.matchAll(/--hit: ([\d.]+)s/g)].map((m) => sec(m[1]!))
    expect(hits.length).toBe(2)
    for (const h of hits) expect(onBeat(h + treeDur * hitPct / 100), `tree hit ${h}`).toBe(true)
    expect(keyframes('ts-tree-hit')).toMatch(/49\.99% \{ transform: none; \}\s*50% \{ transform: translate/)
    // the two trees alternate: one hit per hop
    expect(Math.abs(hits[0]! - hits[1]!) % treeDur).toBeCloseTo(period, 2)
    // impact star behind the logo: pops at 0 % of its loop
    const burst = /animation: ts-burst ([\d.]+)s ([\d.]+)s/.exec(style)!
    expect(onBeat(sec(burst[2]!))).toBe(true)
    expect(sec(burst[1]!) % period).toBeCloseTo(0, 5)
  })
})
