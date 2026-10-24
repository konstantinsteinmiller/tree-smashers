#!/usr/bin/env node
/**
 * Painted Team Tower trees → one runtime atlas.
 *
 *   node tools/tower-sheets/pack.mjs [--ppu 3.2] [--q 0.82]
 *
 * In:  art-sheets/painted/towers-trees.png — 3 × 3 objects on flat magenta
 *      (prompt: art-sheets/towers/trees.prompt.txt, TEXT-ONLY, no reference):
 *        row 1  blue tree: healthy, damaged, nearly destroyed
 *        row 2  red tree:  healthy, damaged, nearly destroyed
 *        row 3  blue felled stump, red felled stump, leaf/splinter debris
 * Out: public/images/towers/towers_<w>x<h>.webp — keyed to alpha, trimmed,
 *      shelf-packed; src/use/paintedTowers.ts — generated registry;
 *      art-sheets/towers/atlas.preview.png — the atlas on grass green.
 *
 * Key + despill: the props packer's (tools/arena-props/pack.mjs): ground
 * colour measured on the frame edge, alpha ramps on the distance to it
 * ((d − 45) / 75), magenta spill taken out within 3 px of the keyed ground.
 * Objects = connected solid blobs (α > 140, specks < 40 px dropped) merged per
 * 3 × 3 cell by centroid; a cell with no blob REFUSES the sheet.
 *
 * Registration: every sprite keeps its GROUND POINT — the painted cell's
 * centre x and the bottom of its solid silhouette — so all damage states of
 * one tree stand on the same spot when drawn with one scale. The whole sheet
 * shares ONE scale (from the healthy tree), so the stump is as small relative
 * to the tree as it was painted.
 * Resolution: the healthy tree's half width is mapped to PPU × the largest
 * tower art half width in arena units (round(28 × TOWER_RADIUS_MUL) = 38 ×
 * TOWER_ART_HALF_W 1.2), never above its painted size; the renderer falls
 * back to the procedural tree above that density (src/use/towerArt.ts).
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
const Q = +opt('q', 0.82)
/** Largest tower art half width in arena units (38 × 1.2). */
const MAX_HALF_W = 38 * 1.2

export const NAMES = ['blue0', 'blue1', 'blue2', 'red0', 'red1', 'red2', 'blueFelled', 'redFelled', 'debris']

const SRC = join(ROOT, 'art-sheets', 'painted', 'towers-trees.png')
if (!existsSync(SRC)) { console.error(`no painting: ${SRC}`); process.exit(2) }
const url = `data:image/png;base64,${readFileSync(SRC).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([url, names, PPU, Q, MAX_HALF_W]) => {
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
    // connected solid blobs
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
      const col = Math.min(2, Math.floor((b.sx / b.n) / (W / 3)))
      const row = Math.min(2, Math.floor((b.sy / b.n) / (H / 3)))
      const k = row * 3 + col
      const q = cells[k]
      cells[k] = q ? { l: Math.min(q.l, b.l), t: Math.min(q.t, b.t), r: Math.max(q.r, b.r), b: Math.max(q.b, b.b) } : { l: b.l, t: b.t, r: b.r, b: b.b }
    }
    const errors = []
    names.forEach((n, k) => { if (!cells[k]) errors.push(`cell ${k} (${n}): empty`) })
    if (errors.length) return { errors }
    const healthy = cells[0]
    const s = Math.min(1, (PPU * MAX_HALF_W) / ((healthy.r - healthy.l + 1) / 2))
    const items = names.map((name, k) => {
      const q = cells[k]
      const l = Math.max(0, q.l - 3), t = Math.max(0, q.t - 3)
      const r = Math.min(W - 1, q.r + 3), bt = Math.min(H - 1, q.b + 3)
      const w = r - l + 1, h = bt - t + 1
      const gx = ((k % 3) + 0.5) * (W / 3) // painted cell centre x
      const gy = q.b + 1 // bottom of the solid silhouette
      return { name, l, t, w, h, gx: (gx - l) * s, gy: (gy - t) * s, dw: Math.ceil(w * s), dh: Math.ceil(h * s), solid: q }
    })
    // shelf pack, tallest first
    const AW = 1024, PAD = 2
    const order = [...items].sort((p, q) => q.dh - p.dh)
    let x = 0, y = 0, rowH = 0
    for (const it of order) {
      if (x + it.dw + PAD > AW) { x = 0; y += rowH + PAD; rowH = 0 }
      it.ax = x; it.ay = y
      x += it.dw + PAD
      rowH = Math.max(rowH, it.dh)
    }
    const AH = Math.ceil((y + rowH) / 4) * 4
    const out = new OffscreenCanvas(AW, AH)
    const ox = out.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    const meta = {}
    const report = [`ground rgb(${G.join(',')}), scale ${s.toFixed(3)}`]
    for (const it of items) {
      ox.drawImage(c, it.l, it.t, it.w, it.h, it.ax, it.ay, it.dw, it.dh)
      meta[it.name] = { x: it.ax, y: it.ay, w: it.dw, h: it.dh, gx: +it.gx.toFixed(2), gy: +it.gy.toFixed(2) }
      report.push(`${it.name.padEnd(11)} ${it.dw}x${it.dh}`)
    }
    // Healthy tree: its silhouette's centre relative to its ground point —
    // the renderer puts THAT centre on the tower's collision centre.
    const hb = items[0].solid
    const ref = {
      halfW: +(((hb.r - hb.l + 1) / 2) * s).toFixed(2),
      dx: +((((hb.l + hb.r + 1) / 2) - (W / 6)) * s).toFixed(2),
      dy: +((((hb.t + hb.b + 1) / 2) - (hb.b + 1)) * s).toFixed(2)
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
      meta, ref, AW, AH, report
    }
  }, [url, NAMES, PPU, Q, MAX_HALF_W])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → re-paint art-sheets/painted/towers-trees.png')
  process.exit(1)
}
const OUT_DIR = join(ROOT, 'public', 'images', 'towers')
mkdirSync(OUT_DIR, { recursive: true })
const file = `towers_${res.AW}x${res.AH}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('towers_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
mkdirSync(join(ROOT, 'art-sheets', 'towers'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'towers', 'atlas.preview.png'), Buffer.from(res.preview, 'base64'))
console.error(res.report.join('\n'))
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
const rows = NAMES.map(k => `    ${k}: ${JSON.stringify(res.meta[k]).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`)
writeFileSync(join(ROOT, 'src', 'use', 'paintedTowers.ts'), `// GENERATED by tools/tower-sheets/pack.mjs — do not edit by hand.
// Painted Team Tower trees in public/images/towers/ (src/use/towerArt.ts).
// Each sprite: its rect in the atlas (x, y, w, h) and its GROUND POINT (gx, gy,
// relative to the rect) — every state of one tree stands on the same point.
// ref = the healthy tree's silhouette: half width, and its centre relative to
// its ground point (dx, dy) — all in atlas px at one shared scale.
export interface PaintedTowerSprite { x: number, y: number, w: number, h: number, gx: number, gy: number }
export type PaintedTowerName = ${NAMES.map(n => `'${n}'`).join(' | ')}
export const PAINTED_TOWERS: { file: string, v: string, ref: { halfW: number, dx: number, dy: number }, sprites: Readonly<Record<PaintedTowerName, PaintedTowerSprite>> } | null = {
  file: '${file}',
  v: '${v}',
  ref: ${JSON.stringify(res.ref).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},
  sprites: {
${rows.join(',\n')}
  }
}
`)
