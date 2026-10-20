#!/usr/bin/env node
/**
 * Painted → seamless background tile.
 *   node tools/bg-tile/make-tile.mjs <painted.png> <out.webp> [--size 512] [--q 0.8]
 * Gemini does not hold a wrap, so the seam is made here: the painting is
 * cross-faded with itself rolled by half a tile, weighted by distance to the
 * edge (its own centre where it is whole, the rolled copy at the borders where
 * the painting's edges would meet). The output wraps exactly; a 2 × 2 preview
 * is written next to it (<out>.preview.png) to check by eye.
 *
 * --hard  (flat, two-tone cel textures): a cross-fade ghosts two drift shapes
 *         over each other into soft, blurred bands. With --hard every pixel
 *         keeps a hard edge instead: each copy is split into its dark "drift"
 *         and light "ground" tone (luminance vs the median), the two drift
 *         masks are smoothed, blended with the same edge weight and
 *         THRESHOLDED — the drift shapes morph into each other inside the seam
 *         band — and each pixel takes its colour from whichever copy has the
 *         chosen tone (the heavier one when both do; the tone's mean colour
 *         when neither does). No pixel is ever a mix of the two copies.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const [src, out] = a
const size = +opt('size', 512), q = +opt('q', 0.8), hard = a.includes('--hard')
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
try {
  const p = await b.newPage()
  const res = await p.evaluate(async ([data, size, q, hard]) => {
    const img = new Image(); img.src = data; await img.decode()
    const c = new OffscreenCanvas(size, size), x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, 0, 0, size, size)
    const I = x.getImageData(0, 0, size, size).data
    const O = new Uint8ClampedArray(I.length), h = size / 2
    const ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
    const N = size * size
    const lum = new Float32Array(N)
    for (let p = 0; p < N; p++) lum[p] = I[p * 4] * 0.3 + I[p * 4 + 1] * 0.59 + I[p * 4 + 2] * 0.11
    const thr = Float32Array.from(lum).sort()[N >> 1] - 6
    const dark = new Float32Array(N)
    for (let p = 0; p < N; p++) dark[p] = lum[p] < thr ? 1 : 0
    // two box-blur passes (wrapping) → a smooth drift field for the morph
    const blur = (src, r) => {
      const t = new Float32Array(N), o = new Float32Array(N), n = 2 * r + 1
      for (let y = 0; y < size; y++) { let acc = 0; for (let k = -r; k <= r; k++) acc += src[y * size + ((k + size) % size)]; for (let x = 0; x < size; x++) { t[y * size + x] = acc / n; acc += src[y * size + (x + r + 1) % size] - src[y * size + (x - r + size) % size] } }
      for (let x = 0; x < size; x++) { let acc = 0; for (let k = -r; k <= r; k++) acc += t[((k + size) % size) * size + x]; for (let y = 0; y < size; y++) { o[y * size + x] = acc / n; acc += t[((y + r + 1) % size) * size + x] - t[((y - r + size) % size) * size + x] } }
      return o
    }
    const field = blur(blur(dark, Math.round(size / 40)), Math.round(size / 40))
    const mean = [[0, 0, 0, 0], [0, 0, 0, 0]]
    for (let p = 0; p < N; p++) { const m = mean[dark[p]]; m[0] += I[p * 4]; m[1] += I[p * 4 + 1]; m[2] += I[p * 4 + 2]; m[3]++ }
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
      const d = Math.min(xx, y, size - 1 - xx, size - 1 - y) / size
      // --hard: a wobbled band, so the morph boundary never runs along a
      // straight line of equal distance to the edge
      const wob = hard ? 0.05 * (Math.sin(xx / size * 6 * Math.PI + 1.3) * Math.sin(y / size * 4 * Math.PI + 0.4) + Math.sin((xx + y) / size * 10 * Math.PI)) : 0
      const w = hard ? ss((d - 0.05 + wob) / 0.22) : ss((d - 0.04) / 0.16)
      const pi = y * size + xx, pj = ((y + h) % size) * size + (xx + h) % size
      const i = pi * 4, j = pj * 4
      if (!hard) {
        for (let k = 0; k < 3; k++) O[i + k] = I[i + k] * w + I[j + k] * (1 - w)
      } else if (w >= 0.999 || w <= 0.001) {
        const src = w >= 0.5 ? i : j
        for (let k = 0; k < 3; k++) O[i + k] = I[src + k]
      } else {
        const want = (field[pi] * w + field[pj] * (1 - w)) >= 0.5 ? 1 : 0
        const okI = dark[pi] === want, okJ = dark[pj] === want
        const src = okI && okJ ? (w >= 0.5 ? i : j) : okI ? i : okJ ? j : -1
        const m = mean[want]
        for (let k = 0; k < 3; k++) O[i + k] = src >= 0 ? I[src + k] : m[k] / m[3]
      }
      O[i + 3] = 255
    }
    x.putImageData(new ImageData(O, size, size), 0, 0)
    const blob = await c.convertToBlob({ type: 'image/webp', quality: q })
    const pv = new OffscreenCanvas(size * 2, size * 2), px = pv.getContext('2d')
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px.drawImage(c, u * size, v * size)
    const pb = await pv.convertToBlob({ type: 'image/png' })
    const b64 = async bl => { const r = new FileReader(); return new Promise(ok => { r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(bl) }) }
    return [await b64(blob), await b64(pb)]
  }, [`data:image/png;base64,${readFileSync(src).toString('base64')}`, size, q, hard])
  writeFileSync(out, Buffer.from(res[0], 'base64'))
  writeFileSync(out + '.preview.png', Buffer.from(res[1], 'base64'))
  console.log(out, Buffer.from(res[0], 'base64').length, 'bytes')
} finally { await b.close() }
