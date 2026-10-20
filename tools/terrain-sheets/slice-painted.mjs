#!/usr/bin/env node
/**
 * Painted terrain features → runtime atlas.
 *
 *   node tools/terrain-sheets/slice-painted.mjs [--cell 320] [--q 0.8]
 *
 * In:  art-sheets/painted/terrain-features.png (3 × 3, any size, magenta ground)
 *      art-sheets/terrain/features.png (export.mjs: the real draw functions,
 *      feature radius = 0.36 of a cell, centred, KINDS order)
 * Out: public/images/terrain/features_<3c>x<3c>.webp (same lattice, keyed);
 *      src/use/paintedTerrain.ts (generated registry, no 404 probes).
 *
 * Each cell's solid bbox is registered onto the reference cell's (uniform scale
 * = mean of the width and height ratios, bbox centre → centre). A cell that is
 * empty, off by more than 0.6–1.6×, or whose width and height ratios disagree
 * by more than 1.35× REFUSES the sheet; the painting moves to painted/stale/.
 * 320 px cells → a feature radius of 115 px: the arena bakes a feature of radius
 * ≤ 25 units at ≤ ~4.6 device px / unit (1080p desktop at 2×), and falls back to the
 * vector drawing above the sprite's own resolution.
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
const CELL = +opt('cell', 320)
const Q = +opt('q', 0.8)
const KINDS = ['stump', 'rock', 'pond', 'mushroom', 'mud', 'deepHole', 'honey', 'booster', 'leafArrow']
const R_FRAC = 0.36
const paintedDir = join(ROOT, 'art-sheets', 'painted')
const inPath = join(paintedDir, 'terrain-features.png')
const refPath = join(ROOT, 'art-sheets', 'terrain', 'features.png')
if (!existsSync(inPath)) { console.error(`missing ${inPath}`); process.exit(2) }
const OUT_DIR = join(ROOT, 'public', 'images', 'terrain')
const dataUrl = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([paintUrl, refUrl, CELL, Q]) => {
    const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i }
    const grab = img => {
      const c = new OffscreenCanvas(img.width, img.height)
      const x = c.getContext('2d')
      x.drawImage(img, 0, 0)
      return x.getImageData(0, 0, img.width, img.height)
    }
    const P = await load(paintUrl)
    const R = await load(refUrl)
    const pd = grab(P)
    const d = pd.data
    const W = P.width
    const H = P.height
    const edge = []
    for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
    const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
    const G = [med(0), med(1), med(2)]
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 80) / 110)) * 255)
    }
    // despill within 3 px of the keyed ground only
    const near = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] === 255) continue
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= H) continue
          for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) near[yy * W + xx] = 1 }
        }
      }
    }
    for (let p = 0; p < W * H; p++) {
      if (!near[p]) continue
      const i = p * 4
      const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
      if (spill > 0) { d[i] -= spill; d[i + 2] -= spill }
    }
    const keyed = new OffscreenCanvas(W, H)
    keyed.getContext('2d').putImageData(pd, 0, 0)
    const bbox = (D, Wd, x0, y0, w, h, solid) => {
      let l = 1e9; let t = 1e9; let r = -1; let bt = -1; let n = 0
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          if (solid(D, (y * Wd + x) * 4)) { n++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > bt) bt = y }
        }
      }
      return n < 30 ? null : { l: l - x0, t: t - y0, r: r - x0 + 1, b: bt - y0 + 1 }
    }
    const rd = grab(R).data
    const RC = R.width / 3
    const refSolid = (D, i) => !(D[i] > 180 && D[i + 1] < 60 && D[i + 2] > 180)
    const out = new OffscreenCanvas(CELL * 3, CELL * 3)
    const ox = out.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    const report = []
    const errors = []
    const pcw = W / 3
    const pch = H / 3
    for (let c = 0; c < 9; c++) {
      const col = c % 3
      const row = Math.floor(c / 3)
      const rb = bbox(rd, R.width, Math.round(col * RC), Math.round(row * RC), Math.round(RC), Math.round(RC), refSolid)
      const x0 = Math.round(col * pcw)
      const y0 = Math.round(row * pch)
      const cw = Math.min(Math.round(pcw), W - x0)
      const ch = Math.min(Math.round(pch), H - y0)
      const pb = bbox(d, W, x0, y0, cw, ch, (D, i) => D[i + 3] > 140)
      if (!rb || !pb) { errors.push(`cell ${c}: empty ${!rb ? 'reference' : 'painted'}`); continue }
      const rw = ((rb.r - rb.l) / RC) / ((pb.r - pb.l) / pcw)
      const rh = ((rb.b - rb.t) / RC) / ((pb.b - pb.t) / pch)
      if (rw < 0.6 || rw > 1.6 || rh < 0.6 || rh > 1.6) errors.push(`cell ${c}: size off by x${rw.toFixed(2)}/x${rh.toFixed(2)}`)
      if (Math.max(rw, rh) / Math.min(rw, rh) > 1.35) errors.push(`cell ${c}: shape disagrees (w x${rw.toFixed(2)} vs h x${rh.toFixed(2)})`)
      const kk = CELL / RC
      const s = (((rb.r - rb.l) + (rb.b - rb.t)) * kk) / ((pb.r - pb.l) + (pb.b - pb.t))
      const dcx = col * CELL + ((rb.l + rb.r) / 2) * kk
      const dcy = row * CELL + ((rb.t + rb.b) / 2) * kk
      const scx = x0 + (pb.l + pb.r) / 2
      const scy = y0 + (pb.t + pb.b) / 2
      ox.save()
      ox.beginPath()
      ox.rect(col * CELL, row * CELL, CELL, CELL)
      ox.clip()
      ox.setTransform(s, 0, 0, s, dcx - scx * s, dcy - scy * s)
      ox.drawImage(keyed, x0, y0, cw, ch, x0, y0, cw, ch)
      ox.restore()
      report.push(`${c}:x${rw.toFixed(2)}/${rh.toFixed(2)}`)
    }
    if (errors.length) return { errors }
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const pv = new OffscreenCanvas(out.width, out.height)
    const px = pv.getContext('2d')
    px.fillStyle = '#7cc05c'
    px.fillRect(0, 0, pv.width, pv.height)
    px.drawImage(out, 0, 0)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      report
    }
  }, [dataUrl(inPath), dataUrl(refPath), CELL, Q])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED terrain features:\n  ' + res.errors.join('\n  '))
  mkdirSync(join(paintedDir, 'stale'), { recursive: true })
  renameSync(inPath, join(paintedDir, 'stale', `terrain-features.${Date.now()}.png`))
  console.error('  → moved to art-sheets/painted/stale/ (re-paint it)')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })
const file = `features_${CELL * 3}x${CELL * 3}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('features_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
writeFileSync(join(ROOT, 'art-sheets', 'terrain', 'features.sliced-preview.png'), Buffer.from(res.preview, 'base64'))
console.error(`ratios ${res.report.join(' ')}`)
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
writeFileSync(join(ROOT, 'src', 'use', 'paintedTerrain.ts'), `// GENERATED by tools/terrain-sheets/slice-painted.mjs — do not edit by hand.
// Painted terrain feature atlas in public/images/terrain/: 3 × 3 cells in
// PAINTED_TERRAIN_KINDS order, each feature centred with its radius = rFrac of
// a cell; directional kinds point to +x (angle 0).
export const PAINTED_TERRAIN: { file: string, cell: number, rFrac: number, v: string } | null =
  { file: ${JSON.stringify(file)}, cell: ${CELL}, rFrac: ${R_FRAC}, v: '${v}' }
export const PAINTED_TERRAIN_KINDS = ${JSON.stringify(KINDS)} as const
`)
