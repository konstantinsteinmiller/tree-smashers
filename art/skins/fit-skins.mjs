#!/usr/bin/env node
/**
 * Radial fit for sliced skins → the game's drop-in WebP.
 *
 *   node art/skins/fit-skins.mjs --out-dir <dir> [--quality 0.82] [--box id,id] <keyed.png>...
 *        (file name → id: "<id>_256x256.png" or "<id>.png"; --box: bounding-box fit for those ids)
 *
 * Why a second step after tools/art-desk/slice.mjs: the slicer's `--fit trim`
 * fills the square with the content's BOUNDING BOX, but the renderer clips
 * every skin to the INSCRIBED CIRCLE (useSpinnerGame renderBlade) and the
 * shipped skins are fitted so their farthest solid pixel sits on that circle
 * (measured maxR ≈ 1.0). A square-ish skin (pyramid, checkmate) trimmed to its
 * box would lose its corners in game. So: slice to a big lossless PNG, then
 * here — centre on the solid bounding-box centre (every template is even-fold
 * symmetric, so that is the spin axis), scale so the farthest solid pixel
 * (alpha > 140) lands at 127 px, and encode 256x256 WebP.
 *
 * Also reports what the review needs: size, solid coverage per radius band,
 * magenta-fringe pixels left after the key.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const oi = args.indexOf('--out-dir')
if (oi < 0 || !args[oi + 1]) {
  console.error('usage: fit-skins.mjs --out-dir <dir> <png>...')
  process.exit(2)
}
const outDir = resolve(args[oi + 1])
const qi = args.indexOf('--quality')
const quality = qi >= 0 ? Number(args[qi + 1]) : 0.82
const bi = args.indexOf('--box')
const BOX = new Set(bi >= 0 ? args[bi + 1].split(',') : [])
const files = args.filter((a, i) => ![oi, oi + 1, qi, qi + 1, bi, bi + 1].includes(i))
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.goto('about:blank')
  for (const f of files) {
    const id = basename(f).replace(/\.png$/i, '').replace(/_256x256$/, '')
    const box = BOX.has(id)
    const r = await page.evaluate(async ({ b64, quality, box }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const W = img.naturalWidth, H = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const x = c.getContext('2d')
      x.drawImage(img, 0, 0)
      const d = x.getImageData(0, 0, W, H).data
      let minX = W, minY = H, maxX = -1, maxY = -1
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        if (d[(y * W + xx) * 4 + 3] > 140) {
          if (xx < minX) minX = xx
          if (xx > maxX) maxX = xx
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      if (maxX < 0) return { error: 'empty' }
      const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2
      let maxR = 0
      for (let y = minY; y <= maxY; y++) for (let xx = minX; xx <= maxX; xx++) {
        if (d[(y * W + xx) * 4 + 3] > 140) {
          const rr = Math.hypot(xx + 0.5 - cx, y + 0.5 - cy)
          if (rr > maxR) maxR = rr
        }
      }
      // circle (default): the farthest solid pixel lands on the in-game clip
      // circle. box: the bounding box fills the square instead — for skins
      // whose thin points run DIAGONALLY (narwhal tusks), where a circle fit
      // shrinks the body to half size; the points then reach into the corners
      // and the game's clip trims their tips, like the shipped spiky-eagle.
      // In practice that cut ~40% off narwhal/drill/lancer tips in game, so the
      // shipped three were refitted with the circle fit — prefer it.
      const k = box ? 255 / Math.max(maxX - minX + 1, maxY - minY + 1) : 127 / maxR
      // Step the downscale in halves for a clean result, then the final draw.
      let src = c, sw = W, sh = H, sk = k
      while (sk < 0.5) {
        const h = document.createElement('canvas')
        h.width = Math.ceil(sw / 2)
        h.height = Math.ceil(sh / 2)
        const hx = h.getContext('2d')
        hx.imageSmoothingQuality = 'high'
        hx.drawImage(src, 0, 0, h.width, h.height)
        src = h
        sk *= 2
      }
      const scaleSrc = sw / src.width
      const o = document.createElement('canvas')
      o.width = 256
      o.height = 256
      const ox = o.getContext('2d')
      ox.imageSmoothingQuality = 'high'
      ox.translate(128, 128)
      ox.scale(k * scaleSrc, k * scaleSrc)
      ox.translate(-cx / scaleSrc, -cy / scaleSrc)
      ox.drawImage(src, 0, 0)
      const od = ox.getImageData(0, 0, 256, 256).data
      const bands = new Array(10).fill(0), tot = new Array(10).fill(0)
      let pink = 0, semi = 0
      for (let y = 0; y < 256; y++) for (let xx = 0; xx < 256; xx++) {
        const i = (y * 256 + xx) * 4
        const rr = Math.hypot(xx + 0.5 - 128, y + 0.5 - 128) / 128
        const b = Math.min(9, Math.floor(rr * 10))
        if (rr <= 1) {
          tot[b]++
          if (od[i + 3] > 140) bands[b]++
        }
        if (od[i + 3] > 8 && od[i + 3] <= 140) semi++
        if (od[i + 3] > 60 && od[i] > 180 && od[i + 2] > 160 && od[i + 1] < 100) pink++
      }
      const url = o.toDataURL('image/webp', quality)
      return {
        W, H, bbox: [minX, minY, maxX, maxY], maxR: Math.round(maxR), k: +k.toFixed(3),
        offCentre: [+(cx - W / 2).toFixed(1), +(cy - H / 2).toFixed(1)], pink, semi,
        bands: bands.map((v, i) => Math.round(v / tot[i] * 100)), webp: url.split(',')[1]
      }
    }, { b64: readFileSync(f).toString('base64'), quality, box })
    if (r.error) {
      console.error(`${id}: ${r.error}`)
      process.exitCode = 1
      continue
    }
    const out = join(outDir, `${id}_256x256.webp`)
    writeFileSync(out, Buffer.from(r.webp, 'base64'))
    const kb = (statSync(out).size / 1024).toFixed(1)
    console.log(`${id.padEnd(12)}${box ? ' [box]' : ''} src ${r.W}x${r.H} maxR ${r.maxR} k ${r.k} → ${out} ${kb}kB  pink ${r.pink} semi ${r.semi}  bands ${r.bands.join(' ')}`)
  }
} finally {
  await browser.close()
}
