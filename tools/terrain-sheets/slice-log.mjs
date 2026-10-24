#!/usr/bin/env node
/**
 * Painted fallen log → 3-slice runtime strip.
 *
 *   node tools/terrain-sheets/slice-log.mjs [--body 112] [--q 0.85]
 *
 * In:  art-sheets/painted/terrain-log.png — three pieces of one horizontal log
 *      on magenta, left → right: bark end cap, tileable middle, cut-face end
 *      (prompt: art-sheets/terrain-log/log-slices.prompt.txt).
 * Out: public/images/terrain/log_<w>x<h>.webp — [left | mid | right], 4 px
 *      transparent gutters; src/use/paintedLog.ts (generated registry).
 *
 * The three pieces are found as the three widest runs of solid columns. The
 * log's thickness is the middle piece's solid row band; every piece is cut to
 * that band ± PAD of its height (moss may stick out) and scaled uniformly so
 * the band is --body px tall. The middle piece is trimmed 6 % on each side and
 * wrap-blended over its last 18 % so its left and right columns match (seam
 * check: mean RGBA difference of the edge columns, refused above 6).
 * --body 112: a log is ≤ 2 × 12 units thick and the arena bakes at ≤ ~4.6
 * device px / unit (desktop 2×, phone 3×), so 112 px is never upscaled; above
 * it the runtime falls back to the vector log. The painting is never upscaled
 * either: a source band thinner than --body is refused.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const BODY = +opt('body', 112)
const Q = +opt('q', 0.85)
const PAD = 0.26
const paintedDir = join(ROOT, 'art-sheets', 'painted')
const inPath = join(paintedDir, 'terrain-log.png')
if (!existsSync(inPath)) { console.error(`missing ${inPath}`); process.exit(2) }
const OUT_DIR = join(ROOT, 'public', 'images', 'terrain')

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([url, BODY, PAD, Q]) => {
    const img = new Image(); img.src = url; await img.decode()
    const W = img.width; const H = img.height
    const c0 = new OffscreenCanvas(W, H); const x0 = c0.getContext('2d')
    x0.drawImage(img, 0, 0)
    const pd = x0.getImageData(0, 0, W, H); const d = pd.data
    // key: distance from the border median colour (magenta)
    const edge = []
    for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
    const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
    const G = [med(0), med(1), med(2)]
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 80) / 110)) * 255)
      const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
      if (spill > 0 && d[i + 3] < 255) { d[i] -= spill; d[i + 2] -= spill }
    }
    x0.putImageData(pd, 0, 0)
    const solid = (x, y) => d[(y * W + x) * 4 + 3] > 140
    const colN = new Array(W).fill(0)
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (solid(x, y)) colN[x]++
    const runs = []
    let s = -1
    for (let x = 0; x <= W; x++) {
      const on = x < W && colN[x] > 3
      if (on && s < 0) s = x
      if (!on && s >= 0) { runs.push({ l: s, r: x }); s = -1 }
    }
    const pieces = runs.filter(r => r.r - r.l > W * 0.04).sort((p, q) => (q.r - q.l) - (p.r - p.l)).slice(0, 3).sort((p, q) => p.l - q.l)
    if (pieces.length !== 3) return { errors: [`found ${pieces.length} pieces, need 3 (runs ${runs.map(r => r.r - r.l).join(',')})`] }
    const rows = (p) => {
      let t = 1e9; let b = -1
      for (let y = 0; y < H; y++) for (let x = p.l; x < p.r; x++) if (solid(x, y)) { if (y < t) t = y; if (y > b) b = y; break }
      return { t, b: b + 1 }
    }
    const errors = []
    // middle band: rows solid across ≥ 90 % of the middle piece's width
    const m = pieces[1]
    let bt = -1; let bb = -1
    for (let y = 0; y < H; y++) {
      let n = 0
      for (let x = m.l; x < m.r; x++) if (solid(x, y)) n++
      if (n >= (m.r - m.l) * 0.9) { if (bt < 0) bt = y; bb = y + 1 }
    }
    if (bt < 0) return { errors: ['middle piece has no solid band'] }
    const band = bb - bt
    if (band < BODY) errors.push(`band ${band}px < ${BODY}px: would upscale`)
    for (const [i, p] of pieces.entries()) {
      const r = rows(p)
      if (r.b - r.t < band * 0.8 || r.b - r.t > band * (1 + 2 * PAD)) errors.push(`piece ${i}: height ${r.b - r.t} vs band ${band}`)
    }
    if (errors.length) return { errors }
    const k = BODY / band
    const top = Math.round(bt - band * PAD)
    const srcH = Math.round(band * (1 + 2 * PAD))
    const outH = Math.round(srcH * k)
    // the middle: trim 6 % per side, then wrap-blend the right end into the left
    const trim = Math.round((m.r - m.l) * 0.06)
    const mL = m.l + trim; const mW = m.r - m.l - 2 * trim
    const midW = Math.round(mW * k)
    const mid = new OffscreenCanvas(midW, outH); const mx = mid.getContext('2d')
    mx.imageSmoothingQuality = 'high'
    mx.drawImage(c0, mL, top, mW, srcH, 0, 0, midW, outH)
    const blendW = Math.round(midW * 0.18)
    const md = mx.getImageData(0, 0, midW, outH)
    const D = md.data
    const tileW = midW - blendW
    const tile = new Uint8ClampedArray(tileW * outH * 4)
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < tileW; x++) {
        const o = (y * tileW + x) * 4
        const i = (y * midW + x) * 4
        if (x < blendW) {
          const j = (y * midW + tileW + x) * 4
          const t = (x + 0.5) / blendW
          for (let c = 0; c < 4; c++) tile[o + c] = D[j + c] * (1 - t) + D[i + c] * t
        } else for (let c = 0; c < 4; c++) tile[o + c] = D[i + c]
      }
    }
    // seam: column tileW-1 should flow into column 0
    let diff = 0
    for (let y = 0; y < outH; y++) for (let c = 0; c < 4; c++) diff += Math.abs(tile[(y * tileW) * 4 + c] - tile[(y * tileW + tileW - 1) * 4 + c])
    const seam = diff / (outH * 4)
    if (seam > 6) return { errors: [`middle seam diff ${seam.toFixed(1)} > 6`] }
    // caps: drop the painted outline on the joining edge (5.5 % of the piece)
    const cut = p => Math.round((p.r - p.l) * 0.055)
    pieces[0] = { l: pieces[0].l, r: pieces[0].r - cut(pieces[0]) }
    pieces[2] = { l: pieces[2].l + cut(pieces[2]), r: pieces[2].r }
    const capW = p => Math.round((p.r - p.l) * k)
    const lW = capW(pieces[0]); const rW = capW(pieces[2])
    const GUT = 4
    const W2 = lW + tileW + rW + GUT * 4
    const out = new OffscreenCanvas(W2, outH); const ox = out.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    const lx = GUT; const mxp = lx + lW + GUT; const rx = mxp + tileW + GUT
    ox.drawImage(c0, pieces[0].l, top, pieces[0].r - pieces[0].l, srcH, lx, 0, lW, outH)
    ox.putImageData(new ImageData(tile, tileW, outH), mxp, 0)
    ox.drawImage(c0, pieces[2].l, top, pieces[2].r - pieces[2].l, srcH, rx, 0, rW, outH)
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    // preview: a long log (left + mid × 3 + right) on grass
    const pv = new OffscreenCanvas(lW + tileW * 3 + rW + 40, outH + 40); const px = pv.getContext('2d')
    px.fillStyle = '#7cc05c'; px.fillRect(0, 0, pv.width, pv.height)
    px.drawImage(out, lx, 0, lW, outH, 20, 20, lW, outH)
    for (let i = 0; i < 3; i++) px.drawImage(out, mxp, 0, tileW, outH, 20 + lW + i * tileW, 20, tileW, outH)
    px.drawImage(out, rx, 0, rW, outH, 20 + lW + tileW * 3, 20, rW, outH)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      meta: { w: W2, h: outH, body: BODY, top: Math.round(band * PAD * k), left: [lx, lW], mid: [mxp, tileW], right: [rx, rW] },
      seam
    }
  }, [`data:image/png;base64,${readFileSync(inPath).toString('base64')}`, BODY, PAD, Q])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED terrain log:\n  ' + res.errors.join('\n  '))
  mkdirSync(join(paintedDir, 'stale'), { recursive: true })
  renameSync(inPath, join(paintedDir, 'stale', `terrain-log.${Date.now()}.png`))
  console.error('  → moved to art-sheets/painted/stale/ (re-paint it)')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })
const { meta } = res
const file = `log_${meta.w}x${meta.h}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('log_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
mkdirSync(join(ROOT, 'art-sheets', 'terrain-log'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'terrain-log', 'log.sliced-preview.png'), Buffer.from(res.preview, 'base64'))
console.error(`seam diff ${res.seam.toFixed(2)}`)
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
writeFileSync(join(ROOT, 'src', 'use', 'paintedLog.ts'), `// GENERATED by tools/terrain-sheets/slice-log.mjs — do not edit by hand.
// Painted fallen log, 3 slices in one strip (public/images/terrain/): left
// bark cap | horizontally tileable middle | right cut-face cap. Each slice is
// [x, w] in the strip; the log's thickness (2 × radius) is \`body\` px, starting
// \`top\` px below the strip's top edge (moss may stick out above/below).
export interface PaintedLogMeta { file: string, v: string, w: number, h: number, body: number, top: number, left: readonly [number, number], mid: readonly [number, number], right: readonly [number, number] }
export const PAINTED_LOG: PaintedLogMeta | null =
  { file: ${JSON.stringify(file)}, v: '${v}', w: ${meta.w}, h: ${meta.h}, body: ${meta.body}, top: ${meta.top}, left: [${meta.left}], mid: [${meta.mid}], right: [${meta.right}] }
`)
