#!/usr/bin/env node
/**
 * Painted logo → the three lockup parts, with the SVG as fallback.
 *
 *   node tools/logo/pack.mjs [--q 0.9]     pack art-sheets/painted/logo.png
 *   node tools/logo/pack.mjs --revert      drop the painted parts (SVG only)
 *
 * In:  art-sheets/painted/logo.png — 3 parts stacked on flat magenta
 *      (prompt: art-sheets/logo/logo.prompt.txt, TEXT-ONLY, no reference):
 *        top     the emblem
 *        middle  "TREE"
 *        bottom  "SMASHERS"
 * Out: public/images/logo/painted-<part>_<w>x<h>.webp — keyed to alpha,
 *      trimmed, never upscaled; tools/logo/painted.json; then emit.mjs
 *      rewrites src/data/logoArt.ts and the index.html splash block, so each
 *      part becomes `<img src=svg srcset="painted Nw, svg 4096w" sizes=…>`:
 *      the browser shows the painting only where its pixels cover the part's
 *      css width × DPR, the crisp SVG everywhere else (the render-sharpness
 *      rule — a 1024 painting is enough for a phone at 2×, not at 3×).
 *      art-sheets/logo/painted.preview.png — the parts on loader green.
 *
 * Key + despill: the props packer's (tools/arena-props/pack.mjs). Parts =
 * bands of rows with solid pixels separated by ≥ 6 empty rows; exactly 3
 * bands, SMASHERS the widest, or the sheet is REFUSED (re-paint it).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emit, PARTS } from './emit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const Q = +opt('q', 0.9)
const LOGO_DIR = join(ROOT, 'public', 'images', 'logo')
const PAINTED_JSON = join(HERE, 'painted.json')
const removeOld = () => { for (const f of readdirSync(LOGO_DIR)) if (f.startsWith('painted-')) unlinkSync(join(LOGO_DIR, f)) }

if (a.includes('--revert')) {
  if (existsSync(PAINTED_JSON)) unlinkSync(PAINTED_JSON)
  removeOld()
  emit(ROOT)
  console.log('painted logo removed — SVG only')
  process.exit(0)
}

const SRC = join(ROOT, 'art-sheets', 'painted', 'logo.png')
if (!existsSync(SRC)) { console.error(`no painting: ${SRC}`); process.exit(2) }
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const url = `data:image/png;base64,${readFileSync(SRC).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([url, Q]) => {
    const P = new Image(); P.src = url; await P.decode()
    const W = P.width, H = P.height
    const c = new OffscreenCanvas(W, H)
    const cx = c.getContext('2d')
    cx.drawImage(P, 0, 0)
    const pd = cx.getImageData(0, 0, W, H)
    const d = pd.data
    const edge = []
    for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
    const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
    const G = [med(0), med(1), med(2)]
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 45) / 75)) * 255)
    }
    // despill within 3 px of the keyed ground
    const near = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] === 255) continue
      for (let dy = -3; dy <= 3; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) near[yy * W + xx] = 1 }
      }
    }
    for (let p = 0; p < W * H; p++) {
      if (!near[p]) continue
      const i = p * 4
      const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
      if (spill > 0) { d[i] -= spill; d[i + 2] -= spill }
    }
    cx.putImageData(pd, 0, 0)
    // bands of solid rows
    const solidRow = (y) => { let n = 0; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 140) n++; return n > 2 }
    const bands = []
    let start = -1, gap = 0
    for (let y = 0; y < H; y++) {
      if (solidRow(y)) { if (start < 0) start = y; gap = 0 } else if (start >= 0 && ++gap >= 6) { bands.push([start, y - gap]); start = -1; gap = 0 }
    }
    if (start >= 0) bands.push([start, H - 1])
    const big = bands.filter(([t, b]) => b - t > H * 0.04)
    if (big.length !== 3) return { errors: [`expected 3 stacked parts, found ${big.length} (bands ${JSON.stringify(bands)})`] }
    const parts = big.map(([t, b]) => {
      let l = W, r = -1
      for (let y = t; y <= b; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 140) { if (x < l) l = x; if (x > r) r = x }
      const pad = 3
      return { l: Math.max(0, l - pad), t: Math.max(0, t - pad), r: Math.min(W - 1, r + pad), b: Math.min(H - 1, b + pad) }
    })
    const w = p => p.r - p.l + 1
    const errors = []
    if (!(w(parts[2]) > w(parts[1]))) errors.push('"SMASHERS" (bottom) must be wider than "TREE" (middle)')
    const ea = w(parts[0]) / (parts[0].b - parts[0].t + 1)
    if (ea < 0.6 || ea > 1.6) errors.push(`emblem aspect ${ea.toFixed(2)} is not badge-like`)
    if (errors.length) return { errors }
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const out = []
    for (const p of parts) {
      const pw = p.r - p.l + 1, ph = p.b - p.t + 1
      const o = new OffscreenCanvas(pw, ph)
      o.getContext('2d').drawImage(c, p.l, p.t, pw, ph, 0, 0, pw, ph)
      out.push({ w: pw, h: ph, webp: await toB64(await o.convertToBlob({ type: 'image/webp', quality: Q })) })
    }
    const pv = new OffscreenCanvas(W, H)
    const px = pv.getContext('2d')
    px.fillStyle = '#6a9e5c'
    px.fillRect(0, 0, W, H)
    px.drawImage(c, 0, 0)
    return { out, preview: await toB64(await pv.convertToBlob({ type: 'image/png' })) }
  }, [url, Q])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → move art-sheets/painted/logo.png to art-sheets/painted/stale/ and re-run tools/logo/paint-queue.mjs')
  process.exit(1)
}
removeOld()
const parts = {}
const hash = createHash('sha1')
PARTS.forEach((name, i) => {
  const { w, h, webp } = res.out[i]
  const buf = Buffer.from(webp, 'base64')
  hash.update(buf)
  const file = `painted-${name}_${w}x${h}.webp`
  writeFileSync(join(LOGO_DIR, file), buf)
  parts[name] = { file, w, h }
  console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
})
mkdirSync(join(ROOT, 'art-sheets', 'logo'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'logo', 'painted.preview.png'), Buffer.from(res.preview, 'base64'))
writeFileSync(PAINTED_JSON, JSON.stringify({ v: hash.digest('hex').slice(0, 8), parts }, null, 2) + '\n')
emit(ROOT)
console.log('painted logo registered (src/data/logoArt.ts + index.html); SVG stays the fallback above the painting\'s resolution')
