/**
 * Writes the loader's key-art scene into index.html's shared loader CSS.
 *
 *   node tools/loader-art/build.mjs
 *
 * Between /* loader-scene:start *\/ and /* loader-scene:end *\/: every layer's
 * art as an inline SVG data URI (tools/loader-art/scene.mjs) — or, where
 * tools/loader-art/painted.json lists a painting (pack.mjs), the painted webp
 * per orientation — plus the PIXEL GRID numbers: whole-px tile sizes of the
 * sliding layers and their steps() (one device px per step at DPR 1/2/3/4),
 * and each painting's exact size, file px / DPR (`--ts-dpr`), so it is drawn
 * 1 : 1 and never resampled (render-sharpness rule). Between
 * <!-- loader-preload:start --> and <!-- loader-preload:end -->: a preload
 * per painted file for its orientation, so the static splash shows it in its
 * first frames. Layout and motion are hand-written in index.html around this
 * block; FLogoProgress.vue reads the same sheet.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as S from './scene.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
export const PAINTED_JSON = join(HERE, 'painted.json')

/** SVG → a CSS url() (single-quoted attributes inside a double-quoted url). */
export const uri = (svg) => `url("data:image/svg+xml,${svg
  .replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, '\'')}")`
const ar = (svg) => {
  const m = /width='([\d.]+)' height='([\d.]+)'/.exec(svg)
  return (Number(m[1]) / Number(m[2])).toFixed(4)
}

/** The DPR media steps the slides are generated for (whole device px at 1 / 2 / 3 / 4). */
export const DPR_STEPS = [[1, ''], [2, '(min-resolution: 1.51dppx)'], [3, '(min-resolution: 2.51dppx)'], [4, '(min-resolution: 3.01dppx)']]
/** Fixed whole-px tile sizes of the sliding layers: [selector, w, h] per height class. */
export const SLIDES = {
  tall: { media: '', clouds: { far: [784, 168], near: [880, 198] }, drift: { far: 380, near: 560 } },
  short: { media: '(max-height: 500px)', clouds: { far: [420, 90], near: [480, 108] }, drift: { far: 260, near: 380 } }
}
/** Portrait = the scene's tall-phone layout (same query as the hand CSS). */
export const PORTRAIT = '(max-aspect-ratio: 3/4)'

const and = (...q) => q.filter(Boolean).join(' and ')
const at = (media, body) => (media ? `@media ${media} { ${body} }` : body)
const tile = (svg) => svg.replace('<svg ', "<svg preserveAspectRatio='none' ")

export function sceneCss (painted) {
  const P = painted?.layers ?? {}
  const url = (f) => `url("/images/loader/${f}?v=${painted.v}")`
  /** A painted layer: its exact file px ÷ DPR per orientation, under the given size vars. */
  const pic = (name, sel, wVar, hVar) => {
    const l = P[name]?.l
    const p = P[name]?.p
    if (!l || !p) return null
    const set = (v) => `${wVar}: calc(${v.w}px / var(--ts-dpr)); ${hVar}: calc(${v.h}px / var(--ts-dpr)); background-image: ${url(v.file)};`
    return [`${sel} { ${set(l)} }`, `@media ${PORTRAIT} { ${sel} { ${set(p)} } }`]
  }
  const out = []
  out.push(`.ts-rays { background-image: ${uri(S.rays())}; }`)

  // sliding tiles: whole-px tiles, one device px per step at DPR 1 / 2 / 3 / 4
  const cloudArt = { far: tile(S.clouds(3, 1400, 300, 3, 70)), near: tile(S.clouds(9, 1600, 360, 2, 110)) }
  for (const k of ['far', 'near']) out.push(`.ts-clouds--${k} { background-image: ${uri(cloudArt[k])}; }`)
  out.push(`.ts-drift--far { background-image: ${uri(tile(S.driftFar()))}; }`, `.ts-drift--near { background-image: ${uri(tile(S.driftNear()))}; }`)
  for (const cls of Object.values(SLIDES)) {
    for (const [dpr, res] of DPR_STEPS) {
      const rules = []
      for (const k of ['far', 'near']) {
        const [w, h] = cls.clouds[k]
        rules.push(`.ts-clouds--${k} { ${dpr === 1 ? `--w: ${w}px; --h: ${h}px; ` : ''}animation-timing-function: steps(${w * dpr}); }`)
        const t = cls.drift[k]
        rules.push(`.ts-drift--${k} { ${dpr === 1 ? `--tile: ${t}px; ` : ''}animation-timing-function: steps(${t * dpr}); }`)
      }
      out.push(at(and(cls.media, res), rules.join(' ')))
    }
  }

  const hillsFar = tile(S.hills({ W: 1600, H: 400, base: 70, terms: [[1, 26, 0.6], [2, 18, 2.2], [3, 10, 4.1]], lip: '#b6ecd9', body: '#8fdcc6', dark: '#7fd0bd' }))
  const hillsMid = tile(S.hills({ W: 1400, H: 400, base: 92, terms: [[1, 22, 1.4], [2, 16, 5.0], [4, 7, 0.3]], lip: '#93e39a', body: '#5cc681', dark: '#4fb873', outline: 4, tufts: 7, tuftTone: '#3fae68', tuftLip: '#6fd08a', seed: 5 }))
  const ground = tile(S.ground())
  out.push(`.ts-hills--far { --ar: ${ar(hillsFar)}; background-image: ${uri(hillsFar)}; }`)
  out.push(`.ts-hills--mid { --ar: ${ar(hillsMid)}; background-image: ${uri(hillsMid)}; }`)
  out.push(`.ts-ground { --ar: ${ar(ground)}; background-image: ${uri(ground)}; }`)

  const forestSvg = tile(S.forest())
  out.push(...(pic('forest', '.ts-forest', '--w', '--h') ?? [`.ts-forest { --ar: ${ar(forestSvg)}; background-image: ${uri(forestSvg)}; }`]))
  const treeSvg = S.tree()
  out.push(...(pic('tree', '.ts-tree', '--tw', '--th') ?? [`.ts-tree { --ar: ${ar(treeSvg)}; background-image: ${uri(treeSvg)}; }`]))
  out.push(`.ts-tree::before, .ts-burst { background-image: ${uri(S.star())}; }`)
  out.push(`.ts-tree::after { background-image: ${uri(S.chips())}; }`)
  out.push(`.ts-zoom__body::after { background-image: ${uri(S.rider())}; }`)
  out.push(`.ts-zoom__disc::before { background-image: ${uri(S.disc())}; }`)
  const frontSvg = S.front()
  const frontPic = pic('front', '.ts-front', '--fw', '--fh')
  if (frontPic) {
    // the pseudo-elements carry the art; the vars live on .ts-front
    out.push(...frontPic.map((r) => r.replace(/ background-image: [^;]+;/, '')))
    out.push(`.ts-front::before, .ts-front::after { background-image: ${url(P.front.l.file)}; }`, `@media ${PORTRAIT} { .ts-front::before, .ts-front::after { background-image: ${url(P.front.p.file)}; } }`)
  } else {
    out.push(`.ts-front { --ar: ${ar(frontSvg)}; }`, `.ts-front::before, .ts-front::after { background-image: ${uri(frontSvg)}; }`)
  }
  return out.join('\n      ')
}

/** <link rel=preload> per painted file, each for its own orientation. */
export function preloads (painted) {
  const out = []
  for (const l of Object.values(painted?.layers ?? {})) {
    out.push(`<link rel="preload" href="/images/loader/${l.l.file}?v=${painted.v}" as="image" type="image/webp" media="not all and ${PORTRAIT}">`)
    out.push(`<link rel="preload" href="/images/loader/${l.p.file}?v=${painted.v}" as="image" type="image/webp" media="${PORTRAIT}">`)
  }
  return out.join('\n')
}

export function build () {
  const painted = existsSync(PAINTED_JSON) ? JSON.parse(readFileSync(PAINTED_JSON, 'utf8')) : null
  const htmlPath = join(ROOT, 'index.html')
  let html = readFileSync(htmlPath, 'utf8')
  const block = `/* loader-scene:start — generated by tools/loader-art/build.mjs (do not edit by hand) */\n      ${sceneCss(painted)}\n      /* loader-scene:end */`
  const re = /\/\* loader-scene:start[\s\S]*?\/\* loader-scene:end \*\//
  if (!re.test(html)) throw new Error('index.html has no /* loader-scene:start */ … /* loader-scene:end */ block')
  html = html.replace(re, () => block)
  const pre = preloads(painted)
  const preRe = /<!-- loader-preload:start -->[\s\S]*?<!-- loader-preload:end -->/
  if (!preRe.test(html)) throw new Error('index.html has no <!-- loader-preload:start --> … <!-- loader-preload:end --> block')
  html = html.replace(preRe, () => `<!-- loader-preload:start -->${pre ? `\n${pre}\n` : ''}<!-- loader-preload:end -->`)
  writeFileSync(htmlPath, html)
  return { bytes: Buffer.byteLength(block), painted: Object.keys(painted?.layers ?? {}) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build()
  console.log(`loader scene → index.html (${(r.bytes / 1024).toFixed(1)} kB of CSS; painted: ${r.painted.join(', ') || 'none — vector only'})`)
}
