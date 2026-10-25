#!/usr/bin/env node
/**
 * Painted Team Tower trees, ONE PAINTING PER STATE → one high-res runtime atlas.
 *
 *   node tools/tower-sheets/pack-single.mjs [--scale 2] [--q 0.84] [--dir <paintings>] [--dry [--preview <png>]]
 *   node tools/tower-sheets/pack-single.mjs --season halloween|christmas [--dry]   (#Paint5)
 *
 * --season packs art-sheets/painted/towers-season/<season>/ (8 team states, the
 * debris scatter is shared) into public/images/towers/towers_<season>_WxH.webp,
 * registered to the SAME silhouettes/ground points/scale as the everyday atlas, and
 * records it in src/use/paintedSeasonTowers.json (towerArt.ts wears it in the
 * season's window).
 *
 * Why: the first tree art was ONE 1024² painting holding all nine sprites
 * (pack.mjs, art-sheets/painted/towers-trees.png) — ~146 atlas px of crown
 * half width, so the arena fit had to stop zooming where a 3× phone or a 2×
 * tablet would upscale it (towerArtMaxScale). Each state is now its own 1024²
 * painting (art-sheets/painted/towers-single/<name>.png, prompts in
 * art-sheets/towers/single/, text-only via tools/art-desk/paint.mjs).
 *
 * Registration — IDENTICAL to the old atlas, only `--scale` × denser: the old
 * atlas (the file PAINTED_TOWERS names, read before it is replaced) gives each
 * sprite's solid silhouette box and ground point (gx, gy). Each new painting is
 * keyed exactly like pack.mjs (edge ground colour, alpha ramp (d − 45) / 75,
 * 3 px despill, solid blobs α > 140, specks < 40 px dropped — all blobs are the
 * one object), then scaled so its silhouette matches the old silhouette ×
 * scale (the geometric mean of the width and height fits — the report
 * prints each painting's aspect against the old one) and given the old ground point at
 * the same place on its silhouette (fraction of the box width, the bottom).
 * ref = old ref × scale. The renderer (towerArt.ts) draws with k = radius ×
 * TOWER_ART_HALF_W / ref.halfW, so on screen every state lands where it did.
 * Never upscales a painting: REFUSES (exit 3) when a silhouette is too small.
 *
 * Out: public/images/towers/towers_<w>x<h>.webp, src/use/paintedTowers.ts,
 *      art-sheets/towers/atlas.preview.png (on grass green).
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
const SCALE = +opt('scale', 2)
const Q = +opt('q', 0.84)

export const ALL_NAMES = ['blue0', 'blue1', 'blue2', 'red0', 'red1', 'red2', 'blueFelled', 'redFelled', 'debris']
const SEASON = opt('season', null)
export const NAMES = SEASON ? ALL_NAMES.filter(n => n !== 'debris') : ALL_NAMES
const FILE_OF = {
  blue0: 'blue-healthy', blue1: 'blue-damaged', blue2: 'blue-nearly', blueFelled: 'blue-felled',
  red0: 'red-healthy', red1: 'red-damaged', red2: 'red-nearly', redFelled: 'red-felled', debris: 'debris'
}
const REG = join(ROOT, 'src', 'use', 'paintedTowers.ts')
const DIR = resolve(opt('dir', join(ROOT, 'art-sheets', 'painted', SEASON ? join('towers-season', SEASON) : 'towers-single')))
const SEASON_REG = join(ROOT, 'src', 'use', 'paintedSeasonTowers.json')
/** --dry: key, register and report, write nothing (--preview <png> keeps the atlas preview). */
const DRY = a.includes('--dry')

// The registration source: the atlas the registry names now. After the first
// run it IS this packer's output — so its geometry is divided by its own
// scale (`base` in the registry comment) to get back to the original.
const regSrc = readFileSync(REG, 'utf8')
const oldFile = regSrc.match(/file: '([^']+)'/)[1]
const oldBase = +(regSrc.match(/\/\/ base scale: ([\d.]+)/)?.[1] ?? 1)
const oldSprites = {}
for (const n of NAMES) {
  const m = regSrc.match(new RegExp(`${n}: \\{x: ([\\d.]+), y: ([\\d.]+), w: ([\\d.]+), h: ([\\d.]+), gx: ([\\d.-]+), gy: ([\\d.-]+)\\}`))
  oldSprites[n] = { x: +m[1], y: +m[2], w: +m[3], h: +m[4], gx: +m[5], gy: +m[6] }
}
const rm = regSrc.match(/ref: \{halfW: ([\d.]+), dx: ([\d.-]+), dy: ([\d.-]+)\}/)
const oldRef = { halfW: +rm[1], dx: +rm[2], dy: +rm[3] }
const oldAtlas = join(ROOT, 'public', 'images', 'towers', oldFile)
const toUrl = (p, t) => `data:${t};base64,${readFileSync(p).toString('base64')}`
const paintings = {}
for (const n of NAMES) {
  const p = join(DIR, `${FILE_OF[n]}.png`)
  if (!existsSync(p)) { console.error(`no painting: ${p}`); process.exit(2) }
  paintings[n] = toUrl(p, 'image/png')
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([oldUrl, oldSprites, oldRef, oldBase, paintings, names, SCALE, Q]) => {
    const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i }
    // Old silhouettes (solid α > 140) inside each old sprite rect, ÷ base.
    const OA = await load(oldUrl)
    const oc = new OffscreenCanvas(OA.width, OA.height)
    const ocx = oc.getContext('2d')
    ocx.drawImage(OA, 0, 0)
    const od = ocx.getImageData(0, 0, OA.width, OA.height).data
    const old = {}
    for (const n of names) {
      const s = oldSprites[n]
      let l = 1e9, t = 1e9, r = -1, b = -1
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        if (od[(y * OA.width + x) * 4 + 3] > 140) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
      }
      const k = 1 / oldBase
      // box relative to the rect, plus the ground point, in ORIGINAL px
      old[n] = { l: (l - s.x) * k, t: (t - s.y) * k, w: (r - l + 1) * k, h: (b - t + 1) * k, gx: s.gx * k, gy: s.gy * k }
    }
    const errors = []
    const items = []
    for (const name of names) {
      const P = await load(paintings[name])
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
      // connected solid blobs; drop specks; everything else is the object
      const lab = new Uint8Array(W * H)
      const stack = []
      let q = null
      for (let p0 = 0; p0 < W * H; p0++) {
        if (lab[p0] || d[p0 * 4 + 3] <= 140) continue
        const bb = { l: 1e9, t: 1e9, r: -1, b: -1, n: 0, px: [] }
        lab[p0] = 1
        stack.push(p0)
        while (stack.length) {
          const p = stack.pop()
          const x = p % W, y = (p - x) / W
          bb.n++
          if (x < bb.l) bb.l = x
          if (x > bb.r) bb.r = x
          if (y < bb.t) bb.t = y
          if (y > bb.b) bb.b = y
          for (const nq of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
            if (nq >= 0 && !lab[nq] && d[nq * 4 + 3] > 140) { lab[nq] = 1; stack.push(nq) }
          }
        }
        if (bb.n < 40) continue
        q = q ? { l: Math.min(q.l, bb.l), t: Math.min(q.t, bb.t), r: Math.max(q.r, bb.r), b: Math.max(q.b, bb.b) } : bb
      }
      if (!q) { errors.push(`${name}: no object`); continue }
      if (q.l < 2 || q.t < 2 || q.r > W - 3 || q.b > H - 3) errors.push(`${name}: object touches the canvas edge`)
      cx.putImageData(pd, 0, 0)
      const ow = q.r - q.l + 1, oh = q.b - q.t + 1
      const o = old[name]
      const tw = o.w * SCALE, th = o.h * SCALE
      // geometric mean of the width and height fits: a painting a few % taller
      // or wider than the old one splits the difference on both axes
      const s = Math.sqrt((tw / ow) * (th / oh))
      if (s > 1.0001) errors.push(`${name}: painted silhouette ${ow}x${oh} too small for ${tw.toFixed(0)}x${th.toFixed(0)} (would upscale ×${s.toFixed(2)})`)
      const pad = 3
      const l = Math.max(0, q.l - pad), t = Math.max(0, q.t - pad)
      const r = Math.min(W - 1, q.r + pad), bt = Math.min(H - 1, q.b + pad)
      const w = r - l + 1, h = bt - t + 1
      // Ground point: the old one's place on the silhouette (fraction of
      // the box width; the bottom edge offset by the old gy − box bottom).
      const fx = (o.gx - o.l) / o.w
      const gyOff = (o.gy - (o.t + o.h)) * SCALE // atlas px below the silhouette bottom
      const sgx = (q.l - l) * s + fx * ow * s
      const sgy = (q.b + 1 - t) * s + gyOff
      items.push({
        name, c, l, t, w, h, s, dw: Math.ceil(w * s), dh: Math.ceil(h * s), gx: sgx, gy: sgy,
        aspect: (oh / ow) / (o.h / o.w), painted: `${ow}x${oh}`
      })
    }
    if (errors.length) return { errors }
    // shelf pack, tallest first
    const AW = 2048, PAD = 2
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
    const report = [`scale ×${SCALE} of the original registration`]
    for (const it of items) {
      // two-step downscale for large ratios keeps the ink lines crisp
      ox.drawImage(it.c, it.l, it.t, it.w, it.h, it.ax, it.ay, it.dw, it.dh)
      meta[it.name] = { x: it.ax, y: it.ay, w: it.dw, h: it.dh, gx: +it.gx.toFixed(2), gy: +it.gy.toFixed(2) }
      report.push(`${it.name.padEnd(11)} painted ${it.painted} → ${it.dw}x${it.dh} (×${it.s.toFixed(3)}, aspect vs old ${it.aspect.toFixed(3)})`)
    }
    const ref = { halfW: +(oldRef.halfW / oldBase * SCALE).toFixed(2), dx: +(oldRef.dx / oldBase * SCALE).toFixed(2), dy: +(oldRef.dy / oldBase * SCALE).toFixed(2) }
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
  }, [toUrl(oldAtlas, 'image/webp'), oldSprites, oldRef, oldBase, paintings, NAMES, SCALE, Q])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → re-paint the named file(s) in ' + DIR + '/')
  process.exit(3)
}
if (DRY) {
  console.error(res.report.join('\n'))
  console.log(`dry: ${res.AW}x${res.AH}, ${(Buffer.from(res.webp, 'base64').length / 1024).toFixed(1)} kB, ref ${JSON.stringify(res.ref)}`)
  if (opt('preview')) writeFileSync(opt('preview'), Buffer.from(res.preview, 'base64'))
  process.exit(0)
}
const OUT_DIR = join(ROOT, 'public', 'images', 'towers')
mkdirSync(OUT_DIR, { recursive: true })
const file = SEASON ? `towers_${SEASON}_${res.AW}x${res.AH}.webp` : `towers_${res.AW}x${res.AH}.webp`
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
for (const f of readdirSync(OUT_DIR)) if ((SEASON ? f.startsWith(`towers_${SEASON}_`) : /^towers_\d/.test(f)) && f !== file) unlinkSync(join(OUT_DIR, f))
writeFileSync(join(ROOT, 'art-sheets', 'towers', SEASON ? `atlas.${SEASON}.preview.png` : 'atlas.preview.png'), Buffer.from(res.preview, 'base64'))
console.error(res.report.join('\n'))
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
if (SEASON) {
  const reg = existsSync(SEASON_REG) ? JSON.parse(readFileSync(SEASON_REG, 'utf8')) : {}
  reg[SEASON] = { file, v, sprites: res.meta }
  writeFileSync(SEASON_REG, JSON.stringify(reg, null, 2) + '\n')
  process.exit(0)
}
const rows = NAMES.map(k => `    ${k}: ${JSON.stringify(res.meta[k]).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`)
writeFileSync(REG, `// GENERATED by tools/tower-sheets/pack-single.mjs — do not edit by hand.
// Painted Team Tower trees in public/images/towers/ (src/use/towerArt.ts), one
// painting per state (art-sheets/painted/towers-single/).
// Each sprite: its rect in the atlas (x, y, w, h) and its GROUND POINT (gx, gy,
// relative to the rect) — every state of one tree stands on the same point.
// ref = the healthy tree's silhouette: half width, and its centre relative to
// its ground point (dx, dy) — all in atlas px at one shared scale.
// base scale: ${SCALE} (× the original one-sheet registration; pack-single reads it back)
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
