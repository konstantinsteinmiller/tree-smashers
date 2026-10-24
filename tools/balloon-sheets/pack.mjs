#!/usr/bin/env node
/**
 * Painted #UX3 balloon HP art (party balloons + pop debris) → ONE small
 * runtime atlas.
 *
 *   node tools/balloon-sheets/pack.mjs [--ppu 3.2] [--q 0.88]
 *
 * In (both TEXT-ONLY Gemini paintings through tools/art-desk/paint.mjs, 4 × 3
 * objects on flat magenta):
 *   art-sheets/painted/balloon-pop.png (art-sheets/balloon-hp/pop.prompt.txt)
 *     row 1 blue rubber scraps · row 2 red rubber scraps · row 3 burst stars
 *   art-sheets/painted/balloon-balloons.png (art-sheets/balloon-hp/balloons.prompt.txt)
 *     row 1 blue balloons · row 2 red balloons · row 3 partly deflated
 *     (two blue, two red)
 * A missing balloons sheet is allowed (the pop sheet was painted first —
 * owner priority): the balloon lists stay empty and the renderer draws the
 * procedural balloons. A missing pop sheet exits 2.
 * Out: public/images/balloons/balloons_<w>x<h>.webp — keyed to alpha,
 *      trimmed, shelf-packed; src/use/paintedBalloons.ts — generated registry
 *      (PAINTED_BALLOONS); art-sheets/balloon-hp/atlas.preview.png — the atlas
 *      on arena-floor tan.
 * Exit: 0 ok · 2 no painting · 3 REFUSED (a cell is empty — re-paint) ·
 *      other = a crash.
 *
 * Key + despill + blobs: the tree packers' (tools/tower-sheets): ground colour
 * from the frame edge, alpha ramp (d − 45) / 75, magenta spill removed within
 * 3 px of the keyed ground, solid blobs (α > 140, specks < 40 px dropped)
 * merged per 4 × 3 cell by centroid; a cell with no blob REFUSES the sheet.
 *
 * Orientation: rubber scraps are turned so their LONG axis runs left → right
 * (the renderer spins them along the particle's rotation, like the procedural
 * shred). Balloons stay upright (knot down); burst stars as painted.
 *
 * Resolution (render-sharpness rule — never upscaled): each sprite's measured
 * axis maps to PPU × the largest on-screen size of its kind in arena units
 * (balloonHp.ts / balloonPopFx.ts at the largest disc, a boss of radius ≈ 38,
 * b = 0.34 r: balloon height 2.24 × 1.18 b; deflated ≤ 0.8 of that; scrap
 * length 1.05 b; burst 2 × 1.6 b × 0.95 × 1.3 punch), never above its painted
 * size; the renderer draws procedurally whenever a sprite would be stretched
 * past 1.02 device px per atlas px.
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
const Q = +opt('q', 0.88)

const B = 0.34 * 38
const H_FULL = 2.24 * 1.18 * B
/** Largest on-screen size per kind (arena units) along its measured axis. */
const MAX_LEN = { blue: H_FULL, red: H_FULL, low: 0.8 * H_FULL, scrapBlue: 1.05 * B, scrapRed: 1.05 * B, burst: 2 * 1.6 * B * 0.95 * 1.3 }
/** Measured axis per kind: 'h' height, 'w' width, 'long' after turning long axis → x. */
const AXIS = { blue: 'h', red: 'h', low: 'h', scrapBlue: 'long', scrapRed: 'long', burst: 'w' }

const ALL_SHEETS = [
  { src: 'balloon-pop.png', rows: ['scrapBlue', 'scrapRed', 'burst'], required: true },
  { src: 'balloon-balloons.png', rows: ['blue', 'red', 'low'], required: false }
]
const COLS = 4
const ROWS = 3

const SHEETS = ALL_SHEETS.filter(sh => existsSync(join(ROOT, 'art-sheets', 'painted', sh.src)))
for (const sh of ALL_SHEETS) {
  if (sh.required && !SHEETS.includes(sh)) { console.error(`no painting: art-sheets/painted/${sh.src}`); process.exit(2) }
  if (!sh.required && !SHEETS.includes(sh)) console.error(`note: art-sheets/painted/${sh.src} not painted yet — balloons stay procedural`)
}
const urls = SHEETS.map(sh => `data:image/png;base64,${readFileSync(join(ROOT, 'art-sheets', 'painted', sh.src)).toString('base64')}`)

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([urls, sheets, COLS, ROWS, PPU, Q, MAX_LEN, AXIS]) => {
    const errors = []
    const report = []
    const sprites = []

    const trim = (cv) => {
      const g = cv.getContext('2d')
      const { width: W, height: H } = cv
      const d = g.getImageData(0, 0, W, H).data
      let l = W, t = H, r = -1, b = -1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
      }
      if (r < 0) return null
      const o = new OffscreenCanvas(r - l + 1, b - t + 1)
      o.getContext('2d').drawImage(cv, l, t, o.width, o.height, 0, 0, o.width, o.height)
      return o
    }
    /** Halving steps, then one final high-quality step (clean downscale). */
    const scaleTo = (cv, s) => {
      let cur = cv
      let left = s
      while (left < 0.5) {
        const o = new OffscreenCanvas(Math.max(1, Math.round(cur.width / 2)), Math.max(1, Math.round(cur.height / 2)))
        const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'
        g.drawImage(cur, 0, 0, o.width, o.height)
        left *= cur.width / o.width
        cur = o
      }
      const o = new OffscreenCanvas(Math.max(1, Math.round(cur.width * left)), Math.max(1, Math.round(cur.height * left)))
      const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'
      g.drawImage(cur, 0, 0, o.width, o.height)
      return o
    }

    for (let si = 0; si < urls.length; si++) {
      const P = new Image(); P.src = urls[si]; await P.decode()
      const W = P.width, H = P.height
      const c = new OffscreenCanvas(W, H)
      const cx = c.getContext('2d')
      cx.drawImage(P, 0, 0)
      const pd = cx.getImageData(0, 0, W, H)
      const d = pd.data
      // Ground colour = median of the frame edge (the magenta as painted).
      const edge = []
      for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
      const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
      const G = [med(0), med(1), med(2)]
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
        d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 45) / 75)) * 255)
      }
      // Despill: magenta cast removed near the keyed ground.
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
      // Solid blobs → cells by centroid.
      const lab = new Int32Array(W * H).fill(-1)
      const blobs = []
      const stack = []
      for (let p0 = 0; p0 < W * H; p0++) {
        if (lab[p0] !== -1 || d[p0 * 4 + 3] <= 140) continue
        const b = { l: 1e9, t: 1e9, r: -1, b: -1, n: 0, sx: 0, sy: 0, id: blobs.length }
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
      const cells = Array.from({ length: COLS * ROWS }, () => null)
      for (const b of blobs) {
        if (b.n < 40) continue
        const col = Math.min(COLS - 1, Math.floor((b.sx / b.n) / (W / COLS)))
        const row = Math.min(ROWS - 1, Math.floor((b.sy / b.n) / (H / ROWS)))
        const k = row * COLS + col
        const q = cells[k]
        if (q) { q.l = Math.min(q.l, b.l); q.t = Math.min(q.t, b.t); q.r = Math.max(q.r, b.r); q.b = Math.max(q.b, b.b); q.ids.add(b.id) }
        else cells[k] = { l: b.l, t: b.t, r: b.r, b: b.b, ids: new Set([b.id]) }
      }
      for (let k = 0; k < cells.length; k++) {
        const kind = sheets[si].rows[Math.floor(k / COLS)]
        const q = cells[k]
        if (!q) { errors.push(`${sheets[si].src} cell ${k} (${kind}): empty`); continue }
        const spins = AXIS[kind] === 'long'
        let n = 0, mx = 0, my = 0
        for (let y = q.t; y <= q.b; y++) for (let x = q.l; x <= q.r; x++) if (q.ids.has(lab[y * W + x])) { n++; mx += x; my += y }
        mx /= n; my /= n
        let m20 = 0, m02 = 0, m11 = 0
        if (spins) {
          for (let y = q.t; y <= q.b; y++) for (let x = q.l; x <= q.r; x++) if (q.ids.has(lab[y * W + x])) { const ux = x - mx, uy = y - my; m20 += ux * ux; m02 += uy * uy; m11 += ux * uy }
        }
        const theta = spins ? 0.5 * Math.atan2(2 * m11, m20 - m02) : 0
        const l = Math.max(0, q.l - 3), t = Math.max(0, q.t - 3)
        const r = Math.min(W - 1, q.r + 3), bt = Math.min(H - 1, q.b + 3)
        const cw = r - l + 1, ch = bt - t + 1
        const cut = new OffscreenCanvas(cw, ch)
        const cg = cut.getContext('2d')
        cg.drawImage(c, l, t, cw, ch, 0, 0, cw, ch)
        // Clear solid pixels of another cell's blob poking in.
        const cd = cg.getImageData(0, 0, cw, ch)
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const id = lab[(y + t) * W + (x + l)]
          if (id !== -1 && !q.ids.has(id)) cd.data[(y * cw + x) * 4 + 3] = 0
        }
        cg.putImageData(cd, 0, 0)
        let tr
        if (spins) {
          const diag = Math.ceil(Math.hypot(cw, ch)) + 4
          const rot = new OffscreenCanvas(diag, diag)
          const rg = rot.getContext('2d')
          rg.imageSmoothingQuality = 'high'
          rg.translate(diag / 2, diag / 2)
          rg.rotate(-theta)
          rg.drawImage(cut, -(mx - l), -(my - t))
          tr = trim(rot)
          if (tr.height > tr.width) {
            const q2 = new OffscreenCanvas(tr.height, tr.width)
            const g2 = q2.getContext('2d')
            g2.translate(q2.width / 2, q2.height / 2); g2.rotate(Math.PI / 2)
            g2.drawImage(tr, -tr.width / 2, -tr.height / 2)
            tr = q2
          }
        } else {
          tr = trim(cut)
        }
        const axis = AXIS[kind]
        const measured = axis === 'h' ? tr.height : tr.width
        const target = PPU * MAX_LEN[kind]
        const s = Math.min(1, target / measured)
        if (s === 1 && target > measured * 1.01) report.push(`  note: ${sheets[si].src} cell ${k} painted smaller than target (${measured} < ${target.toFixed(0)} px)`)
        const fin = trim(scaleTo(tr, s)) ?? scaleTo(tr, s)
        // Deflated row: (a)(b) blue, (c)(d) red.
        const key = kind === 'low' ? ((k % COLS) < 2 ? 'blueLow' : 'redLow') : kind
        sprites.push({ kind: key, canvas: fin })
      }
      report.push(`${sheets[si].src}: ${W}x${H}, ground rgb(${G.join(',')}), ${blobs.filter(b => b.n >= 40).length} blobs`)
    }
    if (errors.length) return { errors }

    // Shelf pack (tallest first), 2 px gutter.
    const PAD = 2
    const order = sprites.map((s, i) => i).sort((p, q) => sprites[q].canvas.height - sprites[p].canvas.height)
    const total = sprites.reduce((n, s) => n + (s.canvas.width + PAD) * (s.canvas.height + PAD), 0)
    const AWmax = Math.max(Math.ceil(Math.sqrt(total) * 1.15), ...sprites.map(s => s.canvas.width + PAD))
    let x = 0, y = 0, shelf = 0, AW = 0
    const place = []
    for (const i of order) {
      const cv = sprites[i].canvas
      if (x + cv.width > AWmax) { x = 0; y += shelf + PAD; shelf = 0 }
      place[i] = { x, y }
      x += cv.width + PAD
      if (x > AW) AW = x
      if (cv.height > shelf) shelf = cv.height
    }
    AW = Math.ceil(AW / 4) * 4
    const AH = Math.ceil((y + shelf) / 4) * 4
    const out = new OffscreenCanvas(AW, AH)
    const ox = out.getContext('2d')
    const meta = { blue: [], red: [], blueLow: [], redLow: [], scrapBlue: [], scrapRed: [], burst: [] }
    sprites.forEach((s, i) => {
      ox.drawImage(s.canvas, place[i].x, place[i].y)
      meta[s.kind].push({ x: place[i].x, y: place[i].y, w: s.canvas.width, h: s.canvas.height })
    })
    for (const k of Object.keys(meta)) report.push(`${k}: ${meta[k].map(m => `${m.w}x${m.h}`).join(' ')}`)
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const SC = 2
    const pv = new OffscreenCanvas(AW * SC, AH * SC)
    const px = pv.getContext('2d')
    px.fillStyle = '#c9b48f'
    px.fillRect(0, 0, pv.width, pv.height)
    px.imageSmoothingEnabled = false
    px.drawImage(out, 0, 0, pv.width, pv.height)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      meta, AW, AH, report
    }
  }, [urls, SHEETS, COLS, ROWS, PPU, Q, MAX_LEN, AXIS])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → move the painting to art-sheets/painted/stale/ and re-paint')
  process.exit(3)
}
const OUT_DIR = join(ROOT, 'public', 'images', 'balloons')
mkdirSync(OUT_DIR, { recursive: true })
const file = `balloons_${res.AW}x${res.AH}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('balloons_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
mkdirSync(join(ROOT, 'art-sheets', 'balloon-hp'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'balloon-hp', 'atlas.preview.png'), Buffer.from(res.preview, 'base64'))
console.error(res.report.join('\n'))
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
const list = (k) => res.meta[k].length === 0 ? '[]' : `[\n${res.meta[k].map(m => `    { x: ${m.x}, y: ${m.y}, w: ${m.w}, h: ${m.h} }`).join(',\n')}\n  ]`
writeFileSync(join(ROOT, 'src', 'use', 'paintedBalloons.ts'), `// GENERATED by tools/balloon-sheets/pack.mjs — do not edit by hand.
// Painted #UX3 balloon HP art in public/images/balloons/ (src/use/balloonArt.ts):
// each sprite's rect in the atlas (atlas px). Balloons are upright (knot at
// the bottom); rubber scraps are turned so their LONG axis runs along x.
// An empty list = not painted yet (that part stays procedural).
export interface PaintedBalloonSprite { x: number, y: number, w: number, h: number }
export interface PaintedBalloonAtlas {
  file: string
  v: string
  blue: readonly PaintedBalloonSprite[]
  red: readonly PaintedBalloonSprite[]
  blueLow: readonly PaintedBalloonSprite[]
  redLow: readonly PaintedBalloonSprite[]
  scrapBlue: readonly PaintedBalloonSprite[]
  scrapRed: readonly PaintedBalloonSprite[]
  burst: readonly PaintedBalloonSprite[]
}
export const PAINTED_BALLOONS: PaintedBalloonAtlas | null = {
  file: '${file}',
  v: '${v}',
  blue: ${list('blue')},
  red: ${list('red')},
  blueLow: ${list('blueLow')},
  redLow: ${list('redLow')},
  scrapBlue: ${list('scrapBlue')},
  scrapRed: ${list('scrapRed')},
  burst: ${list('burst')}
}
`)
