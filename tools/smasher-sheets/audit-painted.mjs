#!/usr/bin/env node
/**
 * Audit shipped painted smasher sheets for a broken turn.
 *
 *   node tools/smasher-sheets/audit-painted.mjs [ids…]
 *
 * Per frame: how unlike its rig reference cell it is (d), and how far it jumps
 * from the previous frame compared with the rig's own jump (j = painted step /
 * reference step). A frame that flips to another view (a front face in the
 * back-turn) shows up as a large d and a jump far above the rig's.
 * Exit 1 if any sheet is flagged.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const OUT = join(ROOT, 'public', 'images', 'smashers')
const BARE = join(ROOT, 'art-sheets', 'smashers-bare')
const want = process.argv.slice(2)
const sheets = readdirSync(OUT).map(f => f.match(/^([a-z0-9]+)_\d+x\d+\.webp$/)).filter(Boolean)
  .filter(m => !want.length || want.includes(m[1]))
const url = (p, t) => `data:${t};base64,${readFileSync(p).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let bad = 0
try {
  const page = await browser.newPage()
  for (const m of sheets) {
    const r = await page.evaluate(async ([pu, ru]) => {
      const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i }
      const P = await load(pu)
      const R = await load(ru)
      const N = 32
      const tiny = (img, f, magentaKey) => {
        const C = img.width / 8
        const c = new OffscreenCanvas(32, 32)
        const x = c.getContext('2d')
        x.drawImage(img, (f % 8) * C, (f >> 3) * C, C, C, 0, 0, 32, 32)
        const d = x.getImageData(0, 0, 32, 32).data
        const g = new Float32Array(32 * 32 * 3)
        for (let i = 0, k = 0; i < d.length; i += 4) {
          const bg = magentaKey ? (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) : d[i + 3] < 128
          for (let ch = 0; ch < 3; ch++) g[k++] = bg ? 128 : d[i + ch]
        }
        return g
      }
      const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length }
      const p = []; const q = []
      for (let f = 0; f < N; f++) { p.push(tiny(P, f, false)); q.push(tiny(R, f, true)) }
      const rows = []
      for (let f = 0; f < N; f++) {
        const g = (f + N - 1) % N
        const step = dist(p[f], p[g])
        const ref = Math.max(3, dist(q[f], q[g]))
        rows.push({ f, d: dist(p[f], q[f]), j: step / ref })
      }
      return rows
    }, [url(join(OUT, m[0]), 'image/webp'), url(join(BARE, `${m[1]}.png`), 'image/png')])
    const dMed = r.map(x => x.d).sort((a, b) => a - b)[16]
    if (process.env.DUMP) console.log(r.map(x => `${x.f}:${x.d.toFixed(1)}/${x.j.toFixed(1)}`).join(" "))
    const flags = r.filter(x => x.d > Math.max(14, dMed * 1.7) || x.j > 3.2)
    if (flags.length) bad++
    console.log(`${m[1].padEnd(9)} ${flags.length ? 'BROKEN' : 'ok    '} median d ${dMed.toFixed(1)}  ${flags.map(x => `f${x.f}(d${x.d.toFixed(0)} j${x.j.toFixed(1)})`).join(' ')}`)
  }
} finally {
  await browser.close()
}
process.exit(bad ? 1 : 0)
