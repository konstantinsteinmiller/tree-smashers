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
const MIRROR_MAX = +(process.env.MIRROR_MAX ?? 2.4)
const sheets = readdirSync(OUT).map(f => f.match(/^([a-z0-9]+)_\d+x\d+\.webp$/)).filter(Boolean)
  .filter(m => !want.length || want.includes(m[1]))
const url = (p, t) => `data:${t};base64,${readFileSync(p).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let bad = 0
try {
  const page = await browser.newPage()
  for (const m of sheets) {
    const { rows: r, style, opp } = await page.evaluate(async ([pu, ru]) => {
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
      // facing: painted f must be nearer its own reference than the view
      // 180 degrees away (a face painted on a back view fails this)
      const opp = []
      for (let f = 0; f < N; f++) {
        const own = dist(p[f], q[f])
        const other = dist(p[f], q[(f + 16) % N])
        if (other < own * 1.05) opp.push(f)
      }
      const rows = []
      for (let f = 0; f < N; f++) {
        const g = (f + N - 1) % N
        const step = dist(p[f], p[g])
        const ref = Math.max(3, dist(q[f], q[g]))
        rows.push({ f, d: dist(p[f], q[f]), j: step / ref })
      }
      // the two painted halves (frames 0-15 / 16-31) must share one look:
      // mean colour and contrast of their opaque pixels
      const half = (f0) => {
        const C = P.width / 8
        const c = new OffscreenCanvas(P.width, P.height).getContext('2d')
        c.drawImage(P, 0, 0)
        const d = c.getImageData(0, (f0 >> 3) * C, P.width, C * 2).data
        let n = 0; const m = [0, 0, 0]; let l2 = 0
        for (let i = 0; i < d.length; i += 16) {
          if (d[i + 3] < 200) continue
          m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; l2 += (d[i] + d[i + 1] + d[i + 2]) ** 2 / 9; n++
        }
        const mean = m.map(v => v / n)
        const lum = (mean[0] + mean[1] + mean[2]) / 3
        return { mean, sd: Math.sqrt(l2 / n - lum * lum) }
      }
      const A = half(0); const B = half(16)
      // mirror pairs: frame f and frame 32-f show the character from mirrored
      // sides, so painted f should match painted 32-f flipped about as well as
      // the rig's own pair does (a half in another style, or a second head,
      // breaks this)
      const flip = (g) => { const o = new Float32Array(g.length); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let ch = 0; ch < 3; ch++) o[(y * 32 + x) * 3 + ch] = g[(y * 32 + (31 - x)) * 3 + ch]; return o }
      const mir = []
      for (const f of [2, 4, 6, 8, 10, 12, 14]) {
        const pd = dist(p[f], flip(p[32 - f]))
        const rd = Math.max(3, dist(q[f], flip(q[32 - f])))
        mir.push(pd - rd)
      }
      mir.sort((a, b) => a - b)
      const mirror = mir[mir.length >> 1]
      const style = { col: Math.hypot(A.mean[0] - B.mean[0], A.mean[1] - B.mean[1], A.mean[2] - B.mean[2]), sd: Math.abs(A.sd - B.sd), mirror }
      return { rows, style, opp }
    }, [url(join(OUT, m[0]), 'image/webp'), url(join(BARE, `${m[1]}.png`), 'image/png')])
    const dMed = r.map(x => x.d).sort((a, b) => a - b)[16]
    if (process.env.DUMP) console.log(r.map(x => `${x.f}:${x.d.toFixed(1)}/${x.j.toFixed(1)}`).join(" "))
    const styleBad = style.col > 22 || style.sd > 14 || style.mirror > MIRROR_MAX
    if (process.env.DUMP) console.log(`style col ${style.col.toFixed(1)} sd ${style.sd.toFixed(1)}`)
    const flags = r.filter(x => x.d > Math.max(14, dMed * 1.7) || x.j > 3.2)
    // the face / halves heuristics are advisory (false positives on round
    // plushes): only a broken turn fails; sheets get a visual review anyway
    if (flags.length || (process.env.STRICT && (styleBad || opp.length))) bad++
    console.log(`${m[1].padEnd(9)} ${flags.length ? 'BROKEN' : opp.length ? 'FACES-WRONG' : styleBad ? 'HALVES-DIFFER' : 'ok    '}${opp.length ? ` [${opp.join(',')}]` : ''} col ${style.col.toFixed(0)} sd ${style.sd.toFixed(0)} mirror ${style.mirror.toFixed(1)} median d ${dMed.toFixed(1)}  ${flags.map(x => `f${x.f}(d${x.d.toFixed(0)} j${x.j.toFixed(1)})`).join(' ')}`)
  }
} finally {
  await browser.close()
}
process.exit(bad ? 1 : 0)
