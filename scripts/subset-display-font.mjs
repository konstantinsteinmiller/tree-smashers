#!/usr/bin/env node
// ─── Self-hosted display faces (family-friendly rounded UI type) ────────────
//
// The game's UI face is NUNITO (Vernon Adams et al., SIL OFL 1.1) — a rounded
// sans that reads soft and friendly at heavy weights. It covers Latin,
// Latin-extended, Vietnamese and Cyrillic (incl. Kazakh). It has NO Greek, so
// Greek keeps PLAYPEN SANS (TypeTogether, SIL OFL 1.1), a rounded comic face.
// Every other script (CJK, Arabic, Devanagari, Thai) uses OS faces — see
// src/assets/css/fonts.sass.
//
//   node scripts/subset-display-font.mjs
//
// Pinned to one google/fonts commit so a rerun is byte-stable. npm-only
// (subset-font = harfbuzz in wasm). Output per face:
//   src/assets/css/font/<dir>/<file>-<weight>-<subset>.woff2  + OFL.txt
// The @font-face blocks in fonts.sass carry the SAME unicode-range per subset
// (tests/displayFontSubsets.test.ts checks it).
//
// One weight per face is instanced from the wght axis: the whole UI is set in
// one heavy weight (900 for Nunito, 800 for Playpen Sans).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))

const COMMIT = '8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5'

/** Google-Fonts-style subsets. MUST match the unicode-range lines in fonts.sass. */
export const SUBSETS = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  'cyrillic-ext': 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  greek: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF'
}

/** Which face draws which subsets. */
export const FACES = [
  { family: 'nunito', file: 'Nunito[wght].ttf', dir: 'nunito', prefix: 'nunito', weight: 900, subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic', 'cyrillic-ext'] },
  { family: 'playpensans', file: 'PlaypenSans[wght].ttf', dir: 'playpen-sans', prefix: 'playpen-sans', weight: 800, subsets: ['greek'] }
]

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

const fetchCached = async (family, name) => {
  const dir = path.join(tmpdir(), 'tree-smashers-font-src', COMMIT, family)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/${family}/${encodeURIComponent(name)}`)
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
  for (const face of FACES) {
    const src = await fetchCached(face.family, face.file)
    const license = await fetchCached(face.family, 'OFL.txt')
    const out = path.join(ROOT, 'src/assets/css/font', face.dir)
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, 'OFL.txt'), license)
    for (const name of face.subsets) {
      const range = SUBSETS[name]
      // Codepoints the face lacks are simply dropped by the subsetter.
      const text = String.fromCodePoint(...codepoints(range).filter((c) => c > 0x1f && (c < 0xd800 || c > 0xdfff)))
      const woff2 = await subsetFont(src, text, { targetFormat: 'woff2', variationAxes: { wght: face.weight }, noLayoutClosure: true })
      const file = path.join(out, `${face.prefix}-${face.weight}-${name}.woff2`)
      writeFileSync(file, woff2)
      console.log(`${path.relative(ROOT, file)}  ${(woff2.length / 1024).toFixed(1)} KB`)
    }
  }
}
