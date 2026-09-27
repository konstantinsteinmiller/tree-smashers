#!/usr/bin/env node
/**
 * Register a painted flame-burn return onto the spinner anchor and write the
 * shipped strip.
 *
 *   node art/flame-burn/register-strip.mjs --cells <dir> [--out <strip.webp>] [--preview <png>] [--quality 0.8]
 *
 * Input: the 12 keyed cells the Art Desk slicer wrote from the painting,
 *   node tools/art-desk/slice.mjs --in <painting> --out-dir <dir> --grid 4x3 \
 *        --size 256x256 --fit cell --png --names f00,f01,…,f11
 * i.e. <dir>/f00.png … f11.png, each a whole cell scaled uniformly (no trim).
 *
 * Why this step exists: the fire is drawn AROUND a spinner the game draws, so
 * what has to line up is the empty round HOLE, not the flames' bounding box.
 * Gemini never lays a grid out to the pixel, so each cell's hole sits a few
 * pixels off wherever the cut line fell. For every frame whose ring is closed
 * the hole is flood-filled from the anchor, its centroid moved onto the
 * reference anchor (per frame — the hole is the one thing that must not
 * move), and ONE scale for the whole strip (median of hole radii vs the
 * reference's) makes the ring hug the spinner's rim. Frames with an open ring
 * (ignite, embers, smoke) borrow the translation of their nearest measured
 * neighbour.
 *
 * Refuses (exit 1) when fewer than 4 closed-ring frames are found, when the
 * scale correction is outside 0.7..1.4, or when a frame's hole drifts more
 * than 12% of a cell — those are repaints, not registration problems.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : d
}
const CELLS = arg('cells')
const OUT = resolve(arg('out', join(ROOT, 'public/images/vfx/flame-burn_1536x128.webp')))
const PREVIEW = arg('preview') ? resolve(arg('preview')) : null
const QUALITY = Number(arg('quality', '0.8'))
const STRIP_CELL = 128
const FRAMES = 12
if (!CELLS) {
  console.error('--cells <dir> is required')
  process.exit(2)
}

const names = Array.from({ length: FRAMES }, (_, i) => `f${String(i).padStart(2, '0')}.png`)
for (const n of names) if (!existsSync(join(CELLS, n))) {
  console.error(`missing ${join(CELLS, n)}`)
  process.exit(2)
}
const cellUrls = names.map((n) => 'data:image/png;base64,' + readFileSync(join(CELLS, n)).toString('base64'))

const browser = await chromium.launch({ channel: 'chrome', headless: true })
let result
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: readFileSync(join(HERE, 'flame-frames.js'), 'utf8') })
  result = await page.evaluate(async ({ cellUrls, STRIP_CELL, FRAMES, QUALITY }) => {
    const { drawFlameFrame, ANCHOR_X, ANCHOR_Y } = window.FLAME
    const load = (src) => new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = src
    })
    const imgs = await Promise.all(cellUrls.map(load))
    const S = imgs[0].naturalWidth

    // Flood-fill the hole from the anchor through transparent pixels.
    const hole = (alpha) => {
      const ax = Math.round(S * ANCHOR_X), ay = Math.round(S * ANCHOR_Y)
      let seed = -1
      // Nearest empty pixel to the anchor (the painter may leave a speck).
      for (let r = 0; r < S * 0.1 && seed < 0; r++) {
        for (let dy = -r; dy <= r && seed < 0; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = ax + dx, y = ay + dy
            if (x >= 0 && y >= 0 && x < S && y < S && alpha[y * S + x] < 60) {
              seed = y * S + x
              break
            }
          }
        }
      }
      if (seed < 0) return null
      const seen = new Uint8Array(S * S)
      const stack = [seed]
      seen[seed] = 1
      let n = 0, sx = 0, sy = 0, open = false
      while (stack.length) {
        const p = stack.pop()
        const x = p % S, y = (p / S) | 0
        n++
        sx += x
        sy += y
        if (x === 0 || y === 0 || x === S - 1 || y === S - 1) {
          open = true
          break
        }
        for (const q of [p - 1, p + 1, p - S, p + S]) {
          if (!seen[q] && alpha[q] < 60) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
      if (open || n < S * S * 0.02) return null
      return { cx: sx / n, cy: sy / n, r: Math.sqrt(n / Math.PI) }
    }
    const alphaOf = (source) => {
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const g = c.getContext('2d')
      if (typeof source === 'function') source(g) else g.drawImage(source, 0, 0, S, S)
      const d = g.getImageData(0, 0, S, S).data
      const a = new Uint8Array(S * S)
      for (let i = 0; i < S * S; i++) a[i] = d[i * 4 + 3]
      return a
    }

    const refHoles = []
    const holes = []
    for (let f = 0; f < FRAMES; f++) {
      refHoles.push(hole(alphaOf((g) => drawFlameFrame(g, f, 0, 0, S))))
      holes.push(hole(alphaOf(imgs[f])))
    }
    const measured = holes.map((h, f) => (h && refHoles[f] ? f : -1)).filter((f) => f >= 0)
    const ratios = measured.map((f) => refHoles[f].r / holes[f].r).sort((a, b) => a - b)
    const k = ratios.length ? ratios[(ratios.length - 1) >> 1] : 1
    const tx = S * ANCHOR_X, ty = S * ANCHOR_Y
    // Per-frame source centre: measured hole, else nearest measured frame's.
    const centre = []
    for (let f = 0; f < FRAMES; f++) {
      if (holes[f] && refHoles[f]) {
        centre.push([holes[f].cx, holes[f].cy])
        continue
      }
      let best = -1
      for (const m of measured) if (best < 0 || Math.abs(m - f) < Math.abs(best - f)) best = m
      centre.push(best >= 0 ? [holes[best].cx, holes[best].cy] : [tx, ty])
    }

    // Compose the strip: scale by k about the hole centre, land it on the anchor.
    const strip = document.createElement('canvas')
    strip.width = STRIP_CELL * FRAMES
    strip.height = STRIP_CELL
    const sg = strip.getContext('2d')
    sg.imageSmoothingQuality = 'high'
    const edge = []
    for (let f = 0; f < FRAMES; f++) {
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const g = c.getContext('2d')
      g.imageSmoothingQuality = 'high'
      const [cx, cy] = centre[f]
      g.setTransform(k, 0, 0, k, tx - cx * k, ty - cy * k)
      g.drawImage(imgs[f], 0, 0)
      // Content that ended up on the cell border after the move = cut off.
      const d = g.getImageData(0, 0, S, S).data
      let touch = 0
      for (let i = 0; i < S; i++) {
        for (const p of [i, (S - 1) * S + i, i * S, i * S + S - 1]) if (d[p * 4 + 3] > 140) touch++
      }
      edge.push(touch)
      sg.drawImage(c, 0, 0, S, S, f * STRIP_CELL, 0, STRIP_CELL, STRIP_CELL)
    }
    // Dark-ground review sheet with a stand-in spinner under each frame.
    const R = window.FLAME.DISK_R * 256
    const prev = document.createElement('canvas')
    prev.width = 256 * 4
    prev.height = 256 * 3
    const pg = prev.getContext('2d')
    pg.fillStyle = '#1a0c04'
    pg.fillRect(0, 0, prev.width, prev.height)
    for (let f = 0; f < FRAMES; f++) {
      const ox = (f % 4) * 256, oy = Math.floor(f / 4) * 256
      pg.beginPath()
      pg.arc(ox + 256 * ANCHOR_X, oy + 256 * ANCHOR_Y, R, 0, Math.PI * 2)
      pg.fillStyle = '#3b6fb0'
      pg.fill()
      pg.lineWidth = 3
      pg.strokeStyle = '#0d1a2a'
      pg.stroke()
      pg.drawImage(strip, f * STRIP_CELL, 0, STRIP_CELL, STRIP_CELL, ox, oy, 256, 256)
    }
    return {
      S, k,
      holes: holes.map((h, f) => (h ? {
        cx: +(h.cx / S).toFixed(3),
        cy: +(h.cy / S).toFixed(3),
        r: +(h.r / S).toFixed(3),
        refR: refHoles[f] ? +(refHoles[f].r / S).toFixed(3) : null
      } : null)),
      drift: measured.map((f) => Math.hypot(holes[f].cx - tx, holes[f].cy - ty) / S),
      edge,
      strip: strip.toDataURL('image/webp', QUALITY),
      preview: prev.toDataURL('image/png')
    }
  }, { cellUrls, STRIP_CELL, FRAMES, QUALITY })
} finally {
  await browser.close()
}

const b64 = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64')
console.log(`cell ${result.S}px, strip scale k=${result.k.toFixed(3)}`)
result.holes.forEach((h, f) => console.log(`  frame ${String(f + 1).padStart(2)}  ${h ? `hole centre (${h.cx}, ${h.cy}) r=${h.r} ref r=${h.refR}` : 'open ring — borrows a neighbour'}  edge px ${result.edge[f]}`))
const measuredN = result.holes.filter((h) => h && h.refR).length
const maxDrift = Math.max(0, ...result.drift)
if (PREVIEW) writeFileSync(PREVIEW, b64(result.preview))
if (measuredN < 4) {
  console.error(`REFUSED: only ${measuredN} frames have a closed ring around the anchor — the painting has no usable hole.`)
  process.exit(1)
}
if (result.k < 0.7 || result.k > 1.4) {
  console.error(`REFUSED: scale correction ${result.k.toFixed(2)} — the ring was painted at the wrong size; repaint.`)
  process.exit(1)
}
if (maxDrift > 0.12) {
  console.error(`REFUSED: a hole sits ${(maxDrift * 100).toFixed(0)}% of a cell off the anchor — the grid was re-composed; repaint.`)
  process.exit(1)
}
const bytes = b64(result.strip)
writeFileSync(OUT, bytes)
console.log(`wrote ${OUT} (${(bytes.length / 1024).toFixed(1)} kB)`)
