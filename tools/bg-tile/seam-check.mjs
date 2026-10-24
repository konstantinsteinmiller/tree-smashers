#!/usr/bin/env node
/**
 * Wrap check for the seamless backdrop tiles.
 *
 *   node tools/bg-tile/seam-check.mjs [file.webp ...]   (default: every *-tile_*.webp in public/images/bg)
 *
 * For each tile: the mean colour jump across the wrap (last column -> first
 * column, last row -> first row) divided by the 97th-percentile jump between two
 * ADJACENT interior pixels (the art's own hard edges). A clean wrap scores ~0;
 * a visible seam scores high (> MAX = flagged, exit 3). Advisory: always look at
 * the 2 x 2 preview in art-sheets/bg/<theme>-tile.preview.png as well.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { openCanvas } from '../art-desk/imaging.mjs'
import { ROOT } from '../sprite-pack/lib.mjs'

const MAX = 0.35
const dir = join(ROOT, 'public', 'images', 'bg')
const args = process.argv.slice(2)
const files = args.length ? args.map(f => resolve(f)) : readdirSync(dir).filter(f => /-tile_\d+x\d+\.webp$/.test(f) && !/^bg-tile/.test(f)).map(f => join(dir, f))

const { page, close } = await openCanvas(ROOT)
let bad = 0
try {
  for (const f of files) {
    const b64 = readFileSync(f).toString('base64')
    const r = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/webp;base64,${b64}`)).blob())
      const w = bmp.width, h = bmp.height
      const c = new OffscreenCanvas(w, h)
      const g = c.getContext('2d')
      g.drawImage(bmp, 0, 0)
      const d = g.getImageData(0, 0, w, h).data
      const px = (x, y, k) => d[(y * w + x) * 4 + k]
      const diff = (x0, y0, x1, y1) => Math.abs(px(x0, y0, 0) - px(x1, y1, 0)) + Math.abs(px(x0, y0, 1) - px(x1, y1, 1)) + Math.abs(px(x0, y0, 2) - px(x1, y1, 2))
      let wrapX = 0, wrapY = 0
      const inner = []
      for (let y = 0; y < h; y++) wrapX += diff(w - 1, y, 0, y)
      for (let x = 0; x < w; x++) wrapY += diff(x, h - 1, x, 0)
      for (let x = 0; x < w - 1; x += 2) for (let y = 0; y < h; y += 2) inner.push(diff(x, y, x + 1, y))
      for (let y = 0; y < h - 1; y += 2) for (let x = 0; x < w; x += 2) inner.push(diff(x, y, x, y + 1))
      inner.sort((p, q) => p - q)
      // flat cel art has long runs of zero change: compare against the 97th percentile (its real edges)
      const edge = Math.max(1, inner[Math.floor(inner.length * 0.97)])
      return { w, h, sx: (wrapX / h) / edge, sy: (wrapY / w) / edge }
    }, b64)
    const worst = Math.max(r.sx, r.sy)
    const verdict = worst > MAX ? 'SEAM' : 'ok'
    if (worst > MAX) bad++
    console.log(`${verdict.padEnd(5)} ${f.split(/[\\/]/).pop()}  wrapX ${r.sx.toFixed(2)}  wrapY ${r.sy.toFixed(2)}`)
  }
} finally {
  await close()
}
process.exit(bad ? 3 : 0)
