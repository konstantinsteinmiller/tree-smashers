#!/usr/bin/env node
/**
 * ─── slice.mjs — magenta-keyed painting → drop-in WebP sprites ──────────────
 *
 *   node tools/art-desk/slice.mjs --in <painting> --out-dir <dir> [options]
 *
 *   --in <file>         the painting (PNG, JPEG or WebP)                 required
 *   --out-dir <dir>     where the sprites go (created)                   required
 *   --grid CxR          columns x rows of equal cells                    default 1x1
 *   --size WxH          every output sprite's pixel size                 default 256x256
 *   --names a,b,…       one file name per cell, row by row, no extension;
 *                       `-` skips a cell                                 default <in>-1, <in>-2, …
 *                       (the project's convention is `<id>_256x256`)
 *   --fit trim|cell     trim: cut each cell to its own content and centre it in
 *                             the target (icons, skins, single objects)  default
 *                       cell: scale the WHOLE cell uniformly, no trimming, no
 *                             re-centring — keeps registration across animation frames
 *   --pad <0..0.4>      trim only: margin kept around the content, as a fraction
 *                       of the target edge                               default 0.02
 *   --strip <name>      also compose all written cells, left to right, into ONE
 *                       strip <name>.webp (the vfx convention, e.g. big-spark_1280x256)
 *   --png               also write a PNG next to every WebP
 *   --quality <0..1>    WebP quality                                     default 0.82
 *   --no-key            keep the background (opaque art such as backdrops)
 *   --halo              unmix magenta out of EVERY pixel, not just the fringe: for
 *                       glowy VFX painted with soft light over the ground. It eats
 *                       pink/purple paint, so never for skins/icons with pinks.
 *
 * The key (slice-sheets.mjs lineage, SLICER.md §3, re-tuned for Gemini):
 *   · the ground colour is MEASURED from the frame, because Gemini's "magenta"
 *     is rarely #FF00FF; the hard key is distance-to-that-colour OR the
 *     channel test (G low, R and B high) — never a hue distance that eats pinks;
 *   · a 2 px band next to the keyed ground (and, on a soft ramp, any strongly
 *     magenta-hued pixel) is UNMIXED: the ground's share of the pixel is estimated from its
 *     magenta-ness (min(R,B) − G) and subtracted back out, which removes the
 *     anti-aliased pink fringe and JPEG spill without desaturating the art;
 *   · specks under 8 px (JPEG noise) are dropped before measuring a cell.
 *
 * Gemini's sparkle watermark: the full-size originals paint.mjs downloads
 * carry NO visible mark (measured Sept 2026: all four corners flat ground);
 * the sparkle is on the app's on-screen preview. As a safety net for the
 * on-page fallback image (and manual screenshots), every mark in the
 * bottom-right box (10% of the shorter side) that does NOT connect to art
 * outside the box is painted over with the ground colour, so it keys out.
 * A mark lying ON the art could not be separated.
 *
 * Grid cut lines (trim mode) snap to the nearest clean background gap within
 * 12% of a cell, since Gemini never lays a grid out to the pixel.
 *
 * Runs ONE headless Chrome on a throttle-free temp profile (imaging.mjs).
 * stdout: one line per file written; warnings and the report go to stderr.
 * Exit 0 ok, 1 failed, 2 bad arguments.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openCanvas, MIME_OF } from './imaging.mjs'
import { imageSize } from './jobs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const err = (m) => process.stderr.write(`${m}\n`)
const bad = (m) => {
  err(`BAD_ARGS: ${m}`)
  process.exit(2)
}

// ─── Arguments ───────────────────────────────────────────────────────────────
const VALUED = new Set(['--in', '--out-dir', '--grid', '--size', '--names', '--fit', '--pad', '--strip', '--quality'])
const FLAGS = new Set(['--png', '--no-key', '--halo'])
const o = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '-h' || a === '--help') {
    err(readFileSync(fileURLToPath(import.meta.url), 'utf-8').split('\n */')[0].split('\n').slice(2).map((l) => l.replace(/^ \*\/?\s?/, '')).join('\n'))
    process.exit(0)
  }
  if (VALUED.has(a)) {
    if (argv[i + 1] === undefined) bad(`${a} needs a value`)
    o[a] = argv[++i]
  } else if (FLAGS.has(a)) o[a] = true
  else bad(`unknown argument ${a}`)
}
if (!o['--in']) bad('--in is required')
if (!o['--out-dir']) bad('--out-dir is required')
const IN = resolve(o['--in'])
const OUT_DIR = resolve(o['--out-dir'])
if (!existsSync(IN)) bad(`no such file: ${IN}`)
const pair = (s, name) => {
  const m = /^(\d+)x(\d+)$/i.exec(s ?? '')
  if (!m || +m[1] < 1 || +m[2] < 1) bad(`${name} must look like 4x3, got ${s}`)
  return [+m[1], +m[2]]
}
const [COLS, ROWS] = pair(o['--grid'] ?? '1x1', '--grid')
const [TW, TH] = pair(o['--size'] ?? '256x256', '--size')
if (TW > 4096 || TH > 4096) bad('--size is capped at 4096 per edge')
const FIT = o['--fit'] ?? 'trim'
if (!['trim', 'cell'].includes(FIT)) bad('--fit is trim or cell')
const PAD = o['--pad'] != null ? Number(o['--pad']) : 0.02
if (!(PAD >= 0 && PAD <= 0.4)) bad('--pad must be between 0 and 0.4')
const QUALITY = o['--quality'] != null ? Number(o['--quality']) : 0.82
if (!(QUALITY > 0 && QUALITY <= 1)) bad('--quality must be in (0, 1]')
const N = COLS * ROWS
const stem = basename(IN, extname(IN))
let NAMES = o['--names'] ? o['--names'].split(',').map((s) => s.trim()) : null
if (NAMES && NAMES.length !== N) bad(`--names has ${NAMES.length} entries for a ${COLS}x${ROWS} grid (${N} cells)`)
if (!NAMES) NAMES = N === 1 ? [stem] : Array.from({ length: N }, (_, i) => `${stem}-${i + 1}`)
for (const n of NAMES) if (n !== '-' && (!n || /[\\/:*?"<>|]/.test(n) || /\.(webp|png)$/i.test(n))) bad(`bad cell name "${n}" — plain file names without extension`)
const STRIP = o['--strip'] ?? null
if (STRIP && /[\\/:*?"<>|]/.test(STRIP)) bad(`bad --strip name "${STRIP}"`)
const WANT_PNG = !!o['--png']
const KEY = !o['--no-key']
const HALO = !!o['--halo']
// The watermark box, as a fraction of the image's shorter side (measured on real returns, READY.md).
const WM_BOX = 0.1

const bytes = readFileSync(IN)
const size = imageSize(bytes)
if (!size) bad(`${IN} is not a PNG, JPEG or WebP`)

// ─── The page-side engine ────────────────────────────────────────────────────
// Everything below runs inside headless Chrome, on the decoded pixels.
const engine = async ({
                        b64,
                        mime,
                        COLS,
                        ROWS,
                        TW,
                        TH,
                        FIT,
                        PAD,
                        QUALITY,
                        NAMES,
                        STRIP,
                        WANT_PNG,
                        KEY,
                        HALO,
                        WM_BOX
                      }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const bmp = await createImageBitmap(new Blob([bin], { type: mime }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  })
  const W = bmp.width, H = bmp.height
  const src = new OffscreenCanvas(W, H)
  const sc = src.getContext('2d', { willReadFrequently: true })
  sc.drawImage(bmp, 0, 0)
  const img = sc.getImageData(0, 0, W, H)
  const d = img.data
  const NPX = W * H
  const report = { w: W, h: H, warnings: [], notes: [] }
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  // ── 1. What the ground actually is, measured on the frame ──
  const magentaish = (r, g, b) => r > 140 && b > 140 && g < Math.min(r, b) - 70 && Math.abs(r - b) < 90
  const border = []
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) border.push((y * W + x) * 4)
  for (let y = 2; y < H - 2; y++) for (const x of [0, 1, W - 2, W - 1]) border.push((y * W + x) * 4)
  const mag = border.filter((i) => magentaish(d[i], d[i + 1], d[i + 2]))
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[s.length >> 1]
  }
  let B = [255, 0, 255]
  if (mag.length >= border.length * 0.25) {
    B = [median(mag.map((i) => d[i])), median(mag.map((i) => d[i + 1])), median(mag.map((i) => d[i + 2]))]
  }
  report.ground = hex(...B)
  report.groundOnFrame = Math.round((mag.length / border.length) * 100)
  const mB = Math.max(40, Math.min(B[0], B[2]) - B[1])
  const hardBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const dist = Math.abs(r - B[0]) + Math.abs(g - B[1]) + Math.abs(b - B[2])
    return dist < 100 || (g < 80 && r > 180 && b > 180 && Math.abs(r - b) < 60)
  }

  // ── 2. Gemini's sparkle watermark, bottom-right of the WHOLE image ──
  // Every non-ground mark in the corner box that does NOT connect to anything
  // outside the box is the watermark (or a stray speck): painted over with the
  // ground so it keys out. Art that enters the box from outside is left alone.
  let keyed = 0
  if (KEY) {
    if (report.groundOnFrame < 25) {
      report.warnings.push(`the ground is not magenta (only ${report.groundOnFrame}% of the frame is) — keying with pure #ff00ff; check every sprite for leftover background`)
    }
    const s = Math.round(Math.min(W, H) * WM_BOX)
    const x0 = W - s, y0 = H - s
    const inBox = new Uint8Array(s * s)
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) inBox[y * s + x] = hardBg(((y0 + y) * W + x0 + x) * 4) ? 0 : 1
    const seen = new Uint8Array(s * s)
    let masked = 0, entering = 0
    for (let k0 = 0; k0 < s * s; k0++) {
      if (!inBox[k0] || seen[k0]) continue
      const comp = [k0]
      seen[k0] = 1
      let touchesEdge = false
      for (let n = 0; n < comp.length; n++) {
        const p = comp[n], px = p % s, py = (p / s) | 0
        if (px === 0 || py === 0) touchesEdge = true
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1], [px - 1, py - 1], [px + 1, py + 1], [px - 1, py + 1], [px + 1, py - 1]]) {
          if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
          const nk = ny * s + nx
          if (inBox[nk] && !seen[nk]) {
            seen[nk] = 1
            comp.push(nk)
          }
        }
      }
      if (touchesEdge) {
        entering += comp.length
        continue
      }
      for (const p of comp) {
        const i = ((y0 + ((p / s) | 0)) * W + x0 + (p % s)) * 4
        d[i] = B[0]
        d[i + 1] = B[1]
        d[i + 2] = B[2]
        d[i + 3] = 255
      }
      masked += comp.length
    }
    report.watermark = { box: s, masked, entering }
    if (masked) report.notes.push(`masked ${masked} px of isolated mark(s) in the bottom-right ${s}x${s} watermark box`)
    // Art reaching into the box is normal (a full grid's last cell does) and
    // the downloaded originals carry no visible mark, so that is not a warning.
  }

  // ── 3. The key: hard ground, then unmix the fringe ──
  const bg = new Uint8Array(NPX)
  if (KEY) {
    for (let k = 0; k < NPX; k++) if (hardBg(k * 4)) {
      bg[k] = 1
      d[k * 4 + 3] = 0
      keyed++
    }
    // JPEG noise pushes single pixels of magenta-ish ART (a hot pink) over the
    // key: tiny keyed islands (< 12 px) are given back, unless they really are
    // the ground colour (a genuine pin-hole gap in the art).
    {
      const seen = new Uint8Array(NPX)
      for (let k0 = 0; k0 < NPX; k0++) {
        if (!bg[k0] || seen[k0]) continue
        const comp = [k0]
        seen[k0] = 1
        for (let n = 0; n < comp.length; n++) {
          const p = comp[n], px = p % W, py = (p / W) | 0
          for (const nk of [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1, py > 0 ? p - W : -1, py < H - 1 ? p + W : -1]) {
            if (nk >= 0 && bg[nk] && !seen[nk]) {
              seen[nk] = 1
              comp.push(nk)
            }
          }
        }
        if (comp.length >= 12) continue
        for (const p of comp) {
          const i = p * 4
          if (Math.abs(d[i] - B[0]) + Math.abs(d[i + 1] - B[1]) + Math.abs(d[i + 2] - B[2]) < 60) continue
          bg[p] = 0
          d[i + 3] = 255
          keyed--
        }
      }
    }
    // Distance (in px, up to 3) to the nearest keyed pixel: two-pass chamfer.
    const near = new Uint8Array(NPX).fill(255)
    for (let k = 0; k < NPX; k++) if (bg[k]) near[k] = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x
      if (x > 0) near[k] = Math.min(near[k], near[k - 1] + 1)
      if (y > 0) near[k] = Math.min(near[k], near[k - W] + 1)
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const k = y * W + x
      if (x < W - 1) near[k] = Math.min(near[k], near[k + 1] + 1)
      if (y < H - 1) near[k] = Math.min(near[k], near[k + W] + 1)
    }
    const hadGround = keyed > NPX * 0.02
    for (let k = 0; k < NPX; k++) {
      if (bg[k]) continue
      const i = k * 4
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const m = Math.min(r, b) - g
      if (m <= 0) continue
      // P = a·F + (1−a)·B, and the art F carries (next to) no magenta-ness,
      // so the ground's share is m / m(B). Applied in full on the 2 px fringe
      // next to the keyed ground; elsewhere (a glow painted over the ground)
      // only on a soft ramp for magenta-hued pixels, so that pink art — which
      // is indistinguishable from "pink glow over magenta" — keeps its paint
      // and JPEG noise cannot punch holes into it. --halo unmixes everywhere.
      let share = Math.min(1, m / mB)
      if (!(hadGround && near[k] <= 2)) {
        const w = HALO ? (share > 0.1 ? 1 : 0) : Math.abs(r - b) < 70 ? Math.max(0, Math.min(1, (share - 0.5) / 0.3)) : 0
        if (w <= 0) continue
        share *= w
      }
      const a = 1 - share
      if (a < 0.1) {
        d[i + 3] = 0
        bg[k] = 1
        keyed++
        continue
      }
      const un = (v, gv) => {
        const f = (v - share * gv) / a
        return f < 0 ? 0 : f > 255 ? 255 : Math.round(f)
      }
      d[i] = un(r, B[0])
      d[i + 1] = un(g, B[1])
      d[i + 2] = un(b, B[2])
      d[i + 3] = Math.round(d[i + 3] * a)
    }
    report.keyedPct = Math.round((keyed / NPX) * 100)
    if (!hadGround) report.warnings.push('almost nothing was keyed — is this painting on magenta at all?')
    sc.putImageData(img, 0, 0)
  }
  const A = (x, y) => d[(y * W + x) * 4 + 3]

  // ── 4. Where the cells are ──
  const cutsFor = (n, len, clearAt) => {
    const cuts = [0]
    for (let i = 1; i < n; i++) {
      const nominal = Math.round((len * i) / n)
      if (FIT !== 'trim' || !KEY) {
        cuts.push(nominal)
        continue
      }
      const win = Math.round((len / n) * 0.12)
      let best = nominal, bestClear = -1
      for (let o = 0; o <= win; o++) {
        for (const at of o ? [nominal - o, nominal + o] : [nominal]) {
          if (at <= cuts[cuts.length - 1] || at >= len) continue
          const c = clearAt(at)
          if (c > bestClear + 1e-9) {
            best = at
            bestClear = c
          }
        }
        if (bestClear >= 0.999) break
      }
      if (bestClear < 0.97) report.warnings.push(`no clean gap near the ${i}. ${len === W ? 'column' : 'row'} cut (best ${Math.round(bestClear * 100)}% clear) — art may cross between cells`)
      cuts.push(best)
    }
    cuts.push(len)
    return cuts
  }
  const colClear = (x) => {
    let c = 0
    for (let y = 0; y < H; y++) if (A(x, y) < 8) c++
    return c / H
  }
  const rowClear = (y) => {
    let c = 0
    for (let x = 0; x < W; x++) if (A(x, y) < 8) c++
    return c / W
  }
  const xs = cutsFor(COLS, W, colClear)
  const ys = cutsFor(ROWS, H, rowClear)
  report.cuts = { x: xs, y: ys }

  // ── 5. Each cell: clean specks, measure, fit, encode ──
  const b64of = async (cv, type, q) => {
    const blob = await cv.convertToBlob(q != null ? { type, quality: q } : { type })
    const u = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  // Halving steps, then one final draw: canvas resampling of a big ratio in
  // one go aliases fine linework.
  const resample = (from, sx, sy, sw, sh, dw, dh) => {
    let cv = new OffscreenCanvas(sw, sh)
    cv.getContext('2d').drawImage(from, sx, sy, sw, sh, 0, 0, sw, sh)
    let w = sw, h = sh
    while (w / 2 >= dw && h / 2 >= dh) {
      const nx = new OffscreenCanvas(Math.round(w / 2), Math.round(h / 2))
      const c = nx.getContext('2d')
      c.imageSmoothingQuality = 'high'
      c.drawImage(cv, 0, 0, nx.width, nx.height)
      cv = nx
      w = nx.width
      h = nx.height
    }
    const outc = new OffscreenCanvas(dw, dh)
    const c = outc.getContext('2d')
    c.imageSmoothingQuality = 'high'
    c.drawImage(cv, 0, 0, dw, dh)
    return outc
  }

  const cells = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const idx = r * COLS + c
    const name = NAMES[idx]
    const cx0 = xs[c], cy0 = ys[r], cw = xs[c + 1] - xs[c], ch = ys[r + 1] - ys[r]
    if (name === '-') {
      cells.push({ name, skipped: true })
      continue
    }
    const cell = new OffscreenCanvas(cw, ch)
    const cc = cell.getContext('2d', { willReadFrequently: true })
    cc.drawImage(src, cx0, cy0, cw, ch, 0, 0, cw, ch)
    const id = cc.getImageData(0, 0, cw, ch)
    const q = id.data
    // Specks: connected components (alpha > 8) under 8 px.
    const lab = new Int32Array(cw * ch)
    let comp = 0, dropped = 0
    const stack = []
    for (let k = 0; k < cw * ch; k++) {
      if (lab[k] || q[k * 4 + 3] <= 8) continue
      comp++
      const members = []
      stack.push(k)
      lab[k] = comp
      while (stack.length) {
        const p = stack.pop()
        members.push(p)
        const px = p % cw, py = (p / cw) | 0
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
          const nk = ny * cw + nx
          if (!lab[nk] && q[nk * 4 + 3] > 8) {
            lab[nk] = comp
            stack.push(nk)
          }
        }
      }
      if (members.length < 8) {
        for (const p of members) q[p * 4 + 3] = 0
        dropped++
      }
    }
    cc.putImageData(id, 0, 0)
    let bx0 = cw, by0 = ch, bx1 = -1, by1 = -1, opaque = 0
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (q[(y * cw + x) * 4 + 3] <= 8) continue
      opaque++
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
    }
    const info = { name, cell: { x: cx0, y: cy0, w: cw, h: ch }, specks: dropped, warnings: [] }
    if (bx1 < 0) {
      info.empty = true
      info.warnings.push('the cell is EMPTY after keying')
      cells.push(info)
      continue
    }
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1
    info.content = { x: bx0, y: by0, w: bw, h: bh }
    info.coverage = Math.round((opaque / (cw * ch)) * 100)
    if (KEY && FIT === 'trim' && (bx0 === 0 || by0 === 0 || bx1 === cw - 1 || by1 === ch - 1)) {
      info.warnings.push('content touches the cell edge — it may be cut off, or a neighbour may have bled in')
    }
    if (KEY && opaque / (bw * bh) > 0.985 && bw * bh > cw * ch * 0.5) {
      info.warnings.push('the content fills its bounding box solidly — a background card may have survived the key')
    }
    let out
    if (FIT === 'trim') {
      const aw = TW * (1 - 2 * PAD), ah = TH * (1 - 2 * PAD)
      const k = Math.min(aw / bw, ah / bh)
      const dw = Math.max(1, Math.round(bw * k)), dh = Math.max(1, Math.round(bh * k))
      const scaled = resample(cell, bx0, by0, bw, bh, dw, dh)
      out = new OffscreenCanvas(TW, TH)
      out.getContext('2d').drawImage(scaled, Math.round((TW - dw) / 2), Math.round((TH - dh) / 2))
      info.scale = +k.toFixed(3)
    } else {
      const k = Math.min(TW / cw, TH / ch)
      const dw = Math.max(1, Math.round(cw * k)), dh = Math.max(1, Math.round(ch * k))
      const scaled = resample(cell, 0, 0, cw, ch, dw, dh)
      out = new OffscreenCanvas(TW, TH)
      out.getContext('2d').drawImage(scaled, Math.round((TW - dw) / 2), Math.round((TH - dh) / 2))
      info.scale = +k.toFixed(3)
      if (Math.abs(cw / ch - TW / TH) > 0.04 * (TW / TH)) info.warnings.push(`the cell is ${cw}x${ch}, not the target's ${TW}:${TH} shape — letterboxed`)
    }
    if (info.scale > 1.15) info.warnings.push(`upscaled ${info.scale}x — the painted object is small; it will look soft`)
    info.canvas = out
    cells.push(info)
  }

  const files = []
  for (const cinfo of cells) {
    if (!cinfo.canvas) continue
    files.push({ name: `${cinfo.name}.webp`, b64: await b64of(cinfo.canvas, 'image/webp', QUALITY) })
    if (WANT_PNG) files.push({ name: `${cinfo.name}.png`, b64: await b64of(cinfo.canvas, 'image/png') })
  }
  if (STRIP) {
    const live = cells.filter((x) => x.canvas)
    const st = new OffscreenCanvas(TW * live.length, TH)
    live.forEach((x, i) => st.getContext('2d').drawImage(x.canvas, i * TW, 0))
    files.push({ name: `${STRIP}.webp`, b64: await b64of(st, 'image/webp', QUALITY) })
    if (WANT_PNG) files.push({ name: `${STRIP}.png`, b64: await b64of(st, 'image/png') })
    report.strip = { name: STRIP, frames: live.length, w: st.width, h: st.height }
  }
  report.cells = cells.map(({ canvas, ...rest }) => rest)
  return { report, files }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
const canvas = await openCanvas(ROOT)
let res
try {
  res = await canvas.page.evaluate(engine, {
    b64: bytes.toString('base64'),
    mime: MIME_OF[size.type],
    COLS,
    ROWS,
    TW,
    TH,
    FIT,
    PAD,
    QUALITY,
    NAMES,
    STRIP,
    WANT_PNG,
    KEY,
    HALO,
    WM_BOX
  })
} catch (e) {
  err(`✗ ${e.message.split('\n')[0]}`)
  await canvas.close()
  process.exit(1)
}
await canvas.close()

const { report, files } = res
err(`${basename(IN)}  ${report.w}x${report.h} ${size.type}  grid ${COLS}x${ROWS} → ${TW}x${TH}  fit=${FIT}`)
if (size.type === 'jpg') err('  · JPEG input: expect a faint fringe; the unmix pass removes most of it')
if (KEY) err(`  · ground ${report.ground} (${report.groundOnFrame}% of the frame), keyed ${report.keyedPct}% of the image`)
for (const n of report.notes) err(`  · ${n}`)
for (const w of report.warnings) err(`  ! ${w}`)
mkdirSync(OUT_DIR, { recursive: true })
const byName = new Map(files.map((f) => [f.name, f]))
let empties = 0
for (const c of report.cells) {
  if (c.skipped) {
    err(`  - ${c.name}: skipped`)
    continue
  }
  if (c.empty) empties++
  const f = byName.get(`${c.name}.webp`)
  const tag = c.empty ? 'EMPTY' : `content ${c.content.w}x${c.content.h} in ${c.cell.w}x${c.cell.h} cell, scale ${c.scale}${c.specks ? `, ${c.specks} speck(s) dropped` : ''}`
  err(`  → ${c.name}  ${tag}${f ? `  ${(Buffer.from(f.b64, 'base64').length / 1024).toFixed(1)} kB` : ''}`)
  for (const w of c.warnings) err(`      ! ${w}`)
}
for (const f of files) {
  const full = join(OUT_DIR, f.name)
  writeFileSync(full, Buffer.from(f.b64, 'base64'))
  process.stdout.write(`${full}\n`)
}
if (report.strip) err(`  ⇒ strip ${report.strip.name}.webp  ${report.strip.w}x${report.strip.h} (${report.strip.frames} frames)`)
process.exit(empties ? 1 : 0)
