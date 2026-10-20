#!/usr/bin/env node
/**
 * Split a bare smasher reference (8 × 4, 32 yaw frames) into the PAINTING parts.
 *
 * Why parts: asked for all 32 angles in one image, Gemini returned 56 cells at
 * 4:1 (bramble pilot, 2026-10-20) — it cannot hold an 8 × 4 lattice. A 3 × 3
 * square sheet it keeps. All 32 frames are PAINTED — no mirroring (a mirrored
 * half flips every one-sided detail: an acorn in one paw, a curled tail, a
 * patch over one eye) — in two square 4 × 4 sheets of 16 frames each:
 *
 *   part a: frames 0…15 (front → turning away)   part b: frames 16…31 (back → front)
 *
 * Frame 8 (part a, cell 9) and frame 24 (part b, cell 9) are the two side
 * views; the slicer matches part b's colours to part a there.
 *
 *   node tools/smasher-sheets/parts.mjs [--only bramble,…]
 *   → art-sheets/smashers-bare/<id>-a.png, <id>-b.png  (4 × 4, 384 px cells)
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const DIR = join(ROOT, 'art-sheets', 'smashers-bare')
const a = process.argv.slice(2)
const oi = a.indexOf('--only')
const only = oi >= 0 ? a[oi + 1].split(',') : null
export const PARTS = { a: [...Array(16).keys()], b: [...Array(16).keys()].map(f => f + 16) }
const G = 4

const ids = readdirSync(DIR).map(f => f.match(/^([a-z0-9]+(?:-boss)?)\.png$/)?.[1]).filter(Boolean)
  .filter(id => !only || only.includes(id))
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
try {
  const page = await browser.newPage()
  for (const id of ids) {
    const url = `data:image/png;base64,${readFileSync(join(DIR, `${id}.png`)).toString('base64')}`
    const out = await page.evaluate(async ([url, PARTS, G]) => {
      const img = new Image()
      img.src = url
      await img.decode()
      const C = img.width / 8
      const res = {}
      for (const [k, frames] of Object.entries(PARTS)) {
        const c = new OffscreenCanvas(C * G, C * G)
        const x = c.getContext('2d')
        frames.forEach((f, i) => x.drawImage(img, (f % 8) * C, (f >> 3) * C, C, C, (i % G) * C, Math.floor(i / G) * C, C, C))
        const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        res[k] = btoa(bin)
      }
      // symmetry: frame f vs mirrored frame 32-f, mean abs diff over the cell
      const full = new OffscreenCanvas(img.width, img.height).getContext('2d')
      full.drawImage(img, 0, 0)
      let diff = 0; let n = 0
      for (const f of [3, 6, 10, 13]) {
        const A = full.getImageData((f % 8) * C, (f >> 3) * C, C, C).data
        const g = 32 - f
        const B = full.getImageData((g % 8) * C, (g >> 3) * C, C, C).data
        for (let y = 0; y < C; y += 2) {
          for (let xx = 0; xx < C; xx += 2) {
            const i = (y * C + xx) * 4; const j = (y * C + (C - 1 - xx)) * 4
            diff += Math.abs(A[i] - B[j]) + Math.abs(A[i + 1] - B[j + 1]) + Math.abs(A[i + 2] - B[j + 2]); n += 3
          }
        }
      }
      res.sym = diff / n
      return res
    }, [url, PARTS, G])
    for (const k of Object.keys(PARTS)) writeFileSync(join(DIR, `${id}-${k}.png`), Buffer.from(out[k], 'base64'))
    console.log(`${id}: parts a,b (4 × 4)  mirror diff ${out.sym.toFixed(1)}`)
  }
} finally {
  await browser.close()
}
