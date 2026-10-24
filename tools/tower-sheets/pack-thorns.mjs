#!/usr/bin/env node
/**
 * Painted spiked FRONT COVER of the team tree → one small runtime atlas.
 *
 *   node tools/tower-sheets/pack-thorns.mjs [--ppu 3.2] [--q 0.85]
 *
 * In:  art-sheets/painted/towers-thorns.png — 2 × 2 bramble-garland SEGMENTS on
 *      flat magenta (prompt: art-sheets/towers/thorns.prompt.txt, TEXT-ONLY):
 *      each one a short arched vine running left → right, thorns pointing UP,
 *      nothing on its bottom edge (the side that sits against the tree).
 * Out: public/images/towers/thorns_<w>x<h>.webp — keyed to alpha, trimmed,
 *      packed in one row; src/use/paintedThorns.ts — generated registry
 *      (PAINTED_THORNS, null until this has run); art-sheets/towers/
 *      thorns.preview.png — the atlas on grass green.
 * Exit: 0 ok · 2 no painting · 3 REFUSED (the painting is unusable — the
 *      paint queue parks it in art-sheets/painted/stale/) · other = a crash.
 *
 * Key + despill + blobs: exactly the tree packer's (pack.mjs): ground colour
 * from the frame edge, alpha ramp (d − 45) / 75, magenta spill removed within
 * 3 px of the keyed ground, solid blobs (α > 140, specks < 40 px dropped)
 * merged per 2 × 2 cell by centroid; a cell with no blob REFUSES the sheet.
 *
 * Registration (src/use/towerThorns.ts lays the segments side by side along
 * the tree's front arc, each rotated so its UP points away from the tree): a
 * segment's ANCHOR is the centre x of its solid silhouette and its bottom
 * (where the vine sits on the tree); `halfW` = half the silhouette width. One
 * scale for the whole sheet. Resolution: the widest segment's half width maps
 * to PPU × the largest segment half width in arena units (SEG_HALF_W below —
 * keep in step with towerThorns.ts), never above its painted size; the
 * renderer falls back to the procedural thorns above that density.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const PPU = +opt('ppu', 3.2)
const Q = +opt('q', 0.85)
/** Largest segment half width in arena units: towerThorns.ts THORN_SEG_HALF_W
 *  (0.46) × the largest tower radius (round(28 × TOWER_RADIUS_MUL 1.35) = 38). */
const SEG_HALF_W = 0.46 * 38

export const NAMES = ['seg0', 'seg1', 'seg2', 'seg3']

const SRC = join(ROOT, 'art-sheets', 'painted', 'towers-thorns.png')
if (!existsSync(SRC)) { console.error(`no painting: ${SRC}`); process.exit(2) }
const url = `data:image/png;base64,${readFileSync(SRC).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([url, names, PPU, Q, SEG_HALF_W]) => {
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
    const lab = new Int32Array(W * H).fill(-1)
    const blobs = []
    const stack = []
    for (let p0 = 0; p0 < W * H; p0++) {
      if (lab[p0] !== -1 || d[p0 * 4 + 3] <= 140) continue
      const b = { l: 1e9, t: 1e9, r: -1, b: -1, n: 0, sx: 0, sy: 0 }
      lab[p0] = blobs.length
      stack.push(p0)
      while (stack.length) {
        const p = stack.pop()
        const x = p % W, y = (p - x) / W
        b.n++; b.sx += x; b.sy += y
        if (x < b.l) b.l = x
        if (x > b.r) b.r = x
        if (y < b.t) b.t = y
        if (y > b.b) b.b = y
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (q >= 0 && lab[q] === -1 && d[q * 4 + 3] > 140) { lab[q] = blobs.length; stack.push(q) }
        }
      }
      blobs.push(b)
    }
    const cells = names.map(() => null)
    for (const b of blobs) {
      if (b.n < 40) continue
      const col = Math.min(1, Math.floor((b.sx / b.n) / (W / 2)))
      const row = Math.min(1, Math.floor((b.sy / b.n) / (H / 2)))
      const k = row * 2 + col
      const q = cells[k]
      cells[k] = q ? { l: Math.min(q.l, b.l), t: Math.min(q.t, b.t), r: Math.max(q.r, b.r), b: Math.max(q.b, b.b) } : { l: b.l, t: b.t, r: b.r, b: b.b }
    }
    const errors = []
    names.forEach((n, k) => { if (!cells[k]) errors.push(`cell ${k} (${n}): empty`) })
    // A segment must be wider than tall (it runs left → right along the arc).
    names.forEach((n, k) => { const q = cells[k]; if (q && (q.r - q.l) < (q.b - q.t) * 1.3) errors.push(`cell ${k} (${n}): not a left → right segment (${q.r - q.l + 1} × ${q.b - q.t + 1})`) })
    if (errors.length) return { errors }
    const maxHalf = Math.max(...cells.map(q => (q.r - q.l + 1) / 2))
    const s = Math.min(1, (PPU * SEG_HALF_W) / maxHalf)
    const PAD = 2
    let x = 0
    const items = names.map((name, k) => {
      const q = cells[k]
      const l = Math.max(0, q.l - 3), t = Math.max(0, q.t - 3)
      const r = Math.min(W - 1, q.r + 3), bt = Math.min(H - 1, q.b + 3)
      const w = r - l + 1, h = bt - t + 1
      const it = {
        name, l, t, w, h, dw: Math.ceil(w * s), dh: Math.ceil(h * s), ax: x,
        // anchor: silhouette centre x, silhouette bottom
        gx: (((q.l + q.r + 1) / 2) - l) * s, gy: (q.b + 1 - t) * s, halfW: ((q.r - q.l + 1) / 2) * s
      }
      x += it.dw + PAD
      return it
    })
    const AW = Math.ceil(x / 4) * 4
    const AH = Math.ceil(Math.max(...items.map(it => it.dh)) / 4) * 4
    const out = new OffscreenCanvas(AW, AH)
    const ox = out.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    const meta = {}
    const report = [`ground rgb(${G.join(',')}), scale ${s.toFixed(3)}`]
    for (const it of items) {
      ox.drawImage(c, it.l, it.t, it.w, it.h, it.ax, 0, it.dw, it.dh)
      meta[it.name] = { x: it.ax, y: 0, w: it.dw, h: it.dh, gx: +it.gx.toFixed(2), gy: +it.gy.toFixed(2), halfW: +it.halfW.toFixed(2) }
      report.push(`${it.name} ${it.dw}x${it.dh}`)
    }
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const pv = new OffscreenCanvas(AW, AH)
    const px = pv.getContext('2d')
    px.fillStyle = '#4f7d45'
    px.fillRect(0, 0, AW, AH)
    px.drawImage(out, 0, 0)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      meta, AW, AH, report
    }
  }, [url, NAMES, PPU, Q, SEG_HALF_W])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → move art-sheets/painted/towers-thorns.png to art-sheets/painted/stale/ and re-paint')
  process.exit(3)
}
const OUT_DIR = join(ROOT, 'public', 'images', 'towers')
mkdirSync(OUT_DIR, { recursive: true })
const file = `thorns_${res.AW}x${res.AH}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('thorns_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
mkdirSync(join(ROOT, 'art-sheets', 'towers'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'towers', 'thorns.preview.png'), Buffer.from(res.preview, 'base64'))
console.error(res.report.join('\n'))
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
const rows = NAMES.map(k => `    ${JSON.stringify(res.meta[k]).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`)
writeFileSync(join(ROOT, 'src', 'use', 'paintedThorns.ts'), `// GENERATED by tools/tower-sheets/pack-thorns.mjs — do not edit by hand.
// Painted spiked front cover of the team tree in public/images/towers/
// (src/use/towerThorns.ts): bramble-garland segments, each with its rect in
// the atlas (x, y, w, h), its ANCHOR (gx, gy: silhouette centre x + bottom,
// relative to the rect) and its silhouette half width — atlas px, one scale.
export interface PaintedThornSprite { x: number, y: number, w: number, h: number, gx: number, gy: number, halfW: number }
export const PAINTED_THORNS: { file: string, v: string, segments: readonly PaintedThornSprite[] } | null = {
  file: '${file}',
  v: '${v}',
  segments: [
${rows.join(',\n')}
  ]
}
`)
