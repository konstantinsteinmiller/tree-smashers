#!/usr/bin/env node
/**
 * Painted loader layers → keyed, trimmed, PIXEL-EXACT webp + the registry,
 * then build.mjs.
 *
 *   node tools/loader-art/pack.mjs           pack whatever paintings exist
 *   node tools/loader-art/pack.mjs --revert  drop them (vector scene only)
 *
 * In:  art-sheets/painted/loader-<name>.png (tools/loader-art/paint-queue.mjs,
 *      TEXT-ONLY prompts in art-sheets/loader/), each on flat magenta:
 *        tree    one giant cartoon tree     → trimmed on all four sides
 *        forest  a forest band, edge to edge → trimmed at the top only, then
 *                laid next to its own mirror image, so the tile repeats
 *                sideways with no seam whatever the painted edges did
 *        front   the bottom-left corner bushes → trimmed on all sides
 *                (the scene tucks it past the screen corner and mirrors it
 *                for the right corner)
 *
 * Out: ONE FILE PER ORIENTATION per layer, pre-scaled to the device-pixel
 *      size the scene shows it at — public/images/loader/loader-<name>-<l|p>_<w>x<h>.webp
 *      — whose width and height are multiples of 12, so `<px> / DPR` is a
 *      whole css px at DPR 1, 2, 3 and 4: the browser then draws the file
 *      1 : 1 on whole device pixels and never resamples it (a resampled edge
 *      is a soft edge — blur-probe; Chrome's 1/64-px layout units turn
 *      e.g. 760 / 3 css px into a slightly-off scale). Never upscaled.
 *        l  (landscape / desktop): shown at <h>px / DPR — 1× desktop, 3× landscape phone
 *        p  (portrait, max-aspect-ratio 3/4): shown at <h>px / DPR — 3× tall phone
 *      tools/loader-art/painted.json { v, layers: { name: { l, p } } }, then
 *      build.mjs writes the sizes + files into index.html's loader CSS and
 *      preloads each file for its orientation.
 *      art-sheets/loader/<name>.preview.png — keyed, on the loader sky.
 * Key: a STEEP ramp (the matte edge turns in ~1 px, not 3) + despill.
 * A layer is REFUSED (left out, the vector one stays) when its painting is
 * mostly magenta or keys to nothing.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, PAINTED_JSON } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const a = process.argv.slice(2)
const OUT_DIR = join(ROOT, 'public', 'images', 'loader')
/** Device-pixel heights per orientation (multiples of 12), webp quality. */
export const LAYERS = {
  tree: { trim: 'all', h: { l: 600, p: 480 }, q: 0.8 },
  forest: { trim: 'top', mirror: true, h: { l: 336, p: 540 }, q: 0.7, sharpen: 0.6 },
  front: { trim: 'all', h: { l: 504, p: 300 }, q: 0.8 }
}
const GRID = 12
const removeOld = () => { if (existsSync(OUT_DIR)) for (const f of readdirSync(OUT_DIR)) if (f.startsWith('loader-')) unlinkSync(join(OUT_DIR, f)) }

if (a.includes('--revert')) {
  if (existsSync(PAINTED_JSON)) unlinkSync(PAINTED_JSON)
  removeOld()
  build()
  console.log('painted loader layers removed — vector scene only')
  process.exit(0)
}

const jobs = Object.entries(LAYERS).map(([name, how]) => ({ name, ...how, src: join(ROOT, 'art-sheets', 'painted', `loader-${name}.png`) })).filter((j) => existsSync(j.src))
if (!jobs.length) { console.error('no loader paintings in art-sheets/painted/ — run tools/loader-art/paint-queue.mjs'); process.exit(2) }

const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const results = {}
try {
  const page = await browser.newPage()
  for (const j of jobs) {
    const url = `data:image/png;base64,${readFileSync(j.src).toString('base64')}`
    results[j.name] = await page.evaluate(async ([url, Q, trim, mirror, heights, GRID, sharpen]) => {
      const P = new Image(); P.src = url; await P.decode()
      const W = P.width, H = P.height
      const c = new OffscreenCanvas(W, H)
      const cx = c.getContext('2d')
      cx.drawImage(P, 0, 0)
      const pd = cx.getImageData(0, 0, W, H)
      const d = pd.data
      // ground colour = median of the top rows (every layer has magenta there)
      const edge = []
      for (let x = 0; x < W; x += 4) for (const y of [0, 1, 2]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
      const med = (k) => edge.map((e) => e[k]).sort((p, q) => p - q)[edge.length >> 1]
      const G = [med(0), med(1), med(2)]
      if (!(G[0] > 180 && G[2] > 180 && G[1] < 90)) return { error: `top edge is not magenta (${G})` }
      let keyed = 0
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
        // steep ramp: the painting's own anti-aliasing is kept, the key adds none
        d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 70) / 40)) * 255)
        if (d[i + 3] === 0) keyed++
      }
      const share = keyed / (W * H)
      if (share > 0.92 || share < 0.04) return { error: `keyed share ${(share * 100).toFixed(0)} % — not a cut-out on magenta` }
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
      // trim
      let l = W, r = -1, t = H, b = -1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
      const pad = 2
      const box = { l: Math.max(0, l - pad), t: Math.max(0, t - pad), r: Math.min(W - 1, r + pad), b: Math.min(H - 1, b + pad) }
      if (trim === 'top') { box.l = 0; box.r = W - 1; box.b = H - 1 }
      const sw = box.r - box.l + 1, sh = box.b - box.t + 1
      const toB64 = async (blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        return btoa(bin)
      }
      /** Halve while more than 2× too big, then one high-quality step: a clean downscale. */
      const scaled = (tw, th) => {
        let src = new OffscreenCanvas(sw, sh)
        src.getContext('2d').drawImage(c, box.l, box.t, sw, sh, 0, 0, sw, sh)
        while (src.width > tw * 2 && src.height > th * 2) {
          const h = new OffscreenCanvas(Math.round(src.width / 2), Math.round(src.height / 2))
          const hx = h.getContext('2d'); hx.imageSmoothingQuality = 'high'; hx.drawImage(src, 0, 0, h.width, h.height)
          src = h
        }
        const o = new OffscreenCanvas(tw, th)
        const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(src, 0, 0, tw, th)
        return o
      }
      const out = {}
      for (const [k, target] of Object.entries(heights)) {
        if (target > sh) return { error: `${k}: wants ${target} px high, the painting has only ${sh} (never upscale)` }
        // the exact grid size; the width snaps to the grid too (≤ 1 % stretch)
        const half = Math.max(GRID / 2, Math.round((sw * target / sh) / (mirror ? GRID / 2 : GRID)) * (mirror ? GRID / 2 : GRID))
        const piece = scaled(half, target)
        // light post-resize unsharp mask (3×3, colour only): a downscale
        // always softens edges a little; this restores the painting's edge
        if (sharpen > 0) {
          const px = piece.getContext('2d')
          const im = px.getImageData(0, 0, piece.width, piece.height)
          const s = im.data
          const src = new Uint8ClampedArray(s)
          const pw = piece.width, ph = piece.height
          for (let y = 1; y < ph - 1; y++) for (let x = 1; x < pw - 1; x++) {
            const i = (y * pw + x) * 4
            if (src[i + 3] === 0) continue
            for (let ch = 0; ch < 3; ch++) {
              let sum = 0
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[i + (dy * pw + dx) * 4 + ch]
              s[i + ch] = src[i + ch] + sharpen * (src[i + ch] - sum / 9)
            }
          }
          px.putImageData(im, 0, 0)
        }
        const o = new OffscreenCanvas(mirror ? half * 2 : half, target)
        const ox = o.getContext('2d')
        ox.drawImage(piece, 0, 0)
        if (mirror) { ox.save(); ox.translate(half * 2, 0); ox.scale(-1, 1); ox.drawImage(piece, 0, 0); ox.restore() }
        out[k] = { w: o.width, h: o.height, webp: await toB64(await o.convertToBlob({ type: 'image/webp', quality: Q })) }
        if (k === 'l') {
          const pv = new OffscreenCanvas(o.width, o.height)
          const px = pv.getContext('2d')
          px.fillStyle = '#55bff9'
          px.fillRect(0, 0, o.width, o.height)
          px.drawImage(o, 0, 0)
          out.preview = await toB64(await pv.convertToBlob({ type: 'image/png' }))
        }
      }
      return out
    }, [url, j.q, j.trim, !!j.mirror, j.h, GRID, j.sharpen ?? 0])
  }
} finally {
  await browser.close()
}

removeOld()
mkdirSync(OUT_DIR, { recursive: true })
const hash = createHash('sha1')
const layers = {}
for (const [name, r] of Object.entries(results)) {
  if (r.error) { console.error(`${name}: REFUSED — ${r.error} (move art-sheets/painted/loader-${name}.png to art-sheets/painted/stale/ and re-paint); the vector layer stays`); continue }
  layers[name] = {}
  for (const k of ['l', 'p']) {
    const v = r[k]
    const buf = Buffer.from(v.webp, 'base64')
    hash.update(buf)
    const file = `loader-${name}-${k}_${v.w}x${v.h}.webp`
    writeFileSync(join(OUT_DIR, file), buf)
    layers[name][k] = { file, w: v.w, h: v.h, bytes: buf.length }
    console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
  }
  writeFileSync(join(ROOT, 'art-sheets', 'loader', `${name}.preview.png`), Buffer.from(r.preview, 'base64'))
}
if (Object.keys(layers).length) writeFileSync(PAINTED_JSON, JSON.stringify({ v: hash.digest('hex').slice(0, 8), layers }, null, 2) + '\n')
else if (existsSync(PAINTED_JSON)) unlinkSync(PAINTED_JSON)
const b = build()
console.log(`loader scene rebuilt (${(b.bytes / 1024).toFixed(1)} kB of CSS; painted: ${b.painted.join(', ') || 'none'})`)
