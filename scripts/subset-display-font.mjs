#!/usr/bin/env node
// ─── Display face for the scripts `Angry` cannot draw ───────────────────────
//
// `Angry` (angrybirds-regular.ttf) is Latin-1 only. Latin-extended, Vietnamese,
// Cyrillic (incl. Kazakh) and Greek locales used to drop to plain system sans.
// They now use Playpen Sans (TypeTogether, SIL OFL 1.1) — a bold comic face
// that covers all of them, incl. Uzbek ʻ (U+02BB).
//
// This script rebuilds the self-hosted woff2 subsets from the upstream
// variable font, pinned to one google/fonts commit so a rerun is byte-stable:
//
//   node scripts/subset-display-font.mjs
//
// npm-only (subset-font = harfbuzz compiled to wasm; no python / fonttools).
// Output: src/assets/css/font/playpen-sans/playpen-sans-800-<subset>.woff2
// plus OFL.txt. The @font-face blocks in `src/assets/css/fonts.sass` carry
// the SAME unicode-range per subset — keep the two in sync (the test
// `tests/displayFontSubsets.test.ts` checks it).
//
// One weight (800) is instanced from the `wght` axis: `Angry` is a single
// heavy weight too, so every string in the game already reads as one weight.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))

const COMMIT = '8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5'
const UPSTREAM = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/playpensans`
const WEIGHT = 800
const OUT = path.join(ROOT, 'src/assets/css/font/playpen-sans')

/** Google-Fonts-style subsets. MUST match the unicode-range lines in fonts.sass. */
export const SUBSETS = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  'cyrillic-ext': 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  greek: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF'
}

const codepoints = (range) => {
  const out = []
  for (const part of range.split(',')) {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-')
    const lo = parseInt(a, 16)
    const hi = b ? parseInt(b, 16) : lo
    for (let c = lo; c <= hi; c++) out.push(c)
  }
  return out
}

const fetchCached = async (name) => {
  const dir = path.join(tmpdir(), 'chaos-arena-font-src', COMMIT)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  if (!existsSync(file)) {
    const res = await fetch(`${UPSTREAM}/${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(file)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let subsetFont
  try {
    subsetFont = require('subset-font')
  } catch {
    console.error('subset-display-font: `subset-font` is not installed — run `pnpm add -D subset-font` first.')
    process.exit(1)
  }
  const src = await fetchCached('PlaypenSans[wght].ttf')
  const license = await fetchCached('OFL.txt')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, 'OFL.txt'), license)
  for (const [name, range] of Object.entries(SUBSETS)) {
    // Codepoints the face lacks are simply dropped by the subsetter.
    const text = String.fromCodePoint(...codepoints(range).filter((c) => c > 0x1f && (c < 0xd800 || c > 0xdfff)))
    const woff2 = await subsetFont(src, text, {
      targetFormat: 'woff2',
      variationAxes: { wght: WEIGHT },
      noLayoutClosure: true
    })
    const file = path.join(OUT, `playpen-sans-${WEIGHT}-${name}.woff2`)
    writeFileSync(file, woff2)
    console.log(`${path.relative(ROOT, file)}  ${(woff2.length / 1024).toFixed(1)} KB`)
  }
}
