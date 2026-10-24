#!/usr/bin/env node
/**
 * Painted arena props → one runtime atlas PER ARENA THEME.
 *
 *   node tools/arena-props/pack.mjs [--ppu 3.2] [--q 0.82]
 *
 * In:  art-sheets/painted/props-<sheet>.png for every sheet in SHEETS that has
 *      been painted (3 × 3 objects on flat magenta, any size; prompts in
 *      art-sheets/props/<sheet>.prompt.txt — TEXT-ONLY, no reference, written
 *      by tools/arena-themes/prompts.mjs).
 * Out: public/images/props/<theme>_<w>x<h>.webp — every sprite of that theme
 *      (arenaProps.PROP_KINDS[].theme — a sheet may feed two themes, e.g.
 *      forest-a's fir goes to woodland, its oak to meadow) keyed to alpha,
 *      trimmed, shelf-packed; a match loads only its own theme's atlas;
 *      src/use/paintedProps.ts — generated registry (rect, anchor, footprint);
 *      art-sheets/props/atlas-<theme>.preview.png — each atlas on its ground.
 * A refused sheet (an empty cell) is moved to art-sheets/painted/stale/ and
 * left out; the others still pack (exit 1 so a queue knows to re-paint it).
 *
 * Key + despill: the smasher slicer's (tools/smasher-sheets/slice-painted.mjs):
 * the ground colour is measured on the frame, alpha ramps on the distance to
 * it, and within 3 px of the keyed ground the magenta component (min(R,B) − G)
 * is taken out, so a peach blossom survives and the contour has no pink rim.
 * The alpha ramp is tighter than the smasher slicer's ((d − 45) / 75 instead
 * of (d − 80) / 110): a toy's purple ring sits ~117 from a pale-magenta ground
 * and came back half see-through on the wider ramp; JPEG noise stays < 45.
 * Objects: connected solid blobs (α > 140, specks < 40 px dropped) are merged
 * per 3 × 3 cell by centroid — a beehive's bees or a stone cluster stay one
 * sprite. A cell with no blob REFUSES the sheet (the painting moves to
 * art-sheets/painted/stale/).
 * Resolution: each sprite is scaled so its footprint radius (the circle
 * around the bbox centre holding every pixel with α > 0.1) is
 * PPU × the kind's largest footprint in arena units (arenaProps.PROP_KINDS),
 * never above its painted size: at PPU 3.2 a prop is drawn at or below its
 * own resolution up to 3.2 device px per arena unit (phone 3× ≈ 2.5,
 * desktop 1080p ≈ 2.3).
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const PPU = +opt('ppu', 3.2)
const Q = +opt('q', 0.82)

/** Sheet → its 9 sprite ids, row by row (the prompt's order). */
export const SHEETS = {
  'forest-a': ['oak', 'fir', 'blossom', 'boulder', 'boulderPair', 'stones', 'bush', 'flowers', 'fern'],
  'forest-b': ['log', 'logPile', 'beehive', 'pond', 'pondReeds', 'graveHeart', 'gravePaw', 'sunflowers', 'honeyPot'],
  'bedroom-a': ['blocks', 'bricks', 'teddy', 'bunny', 'ball', 'train', 'rings', 'duck', 'crayons'],
  'bedroom-b': ['rockingHorse', 'pullDuck', 'toyCar', 'toyChest', 'books', 'xylophone', 'spinningTop', 'drum', 'plushElephant'],
  'rocky-a': ['greyBoulder', 'boulderCluster', 'rockSpire', 'sandSlab', 'rift', 'riftSmall', 'dryTuft', 'featherGrass', 'pebbles'],
  'snowy-a': ['snowFir', 'snowFirPair', 'snowBoulder', 'iceCrystals', 'snowDrift', 'snowman', 'snowStones', 'frozenPond', 'hollyBush'],
  'volcanic-a': ['basaltColumns', 'lavaRock', 'lavaStones', 'charredStump', 'deadTree', 'ashTuft', 'cooledFlow', 'ashCrack', 'obsidian'],
  'ruins-a': ['brokenColumn', 'fallenColumn', 'standingStone', 'ruinWall', 'stoneArch', 'rubble', 'ruinsRift', 'heathBush', 'runeStone'],
  'woodland-a': ['spruce', 'birch', 'mossyStump', 'toadstools', 'mushroomRing', 'hollowLog', 'mossBoulder', 'blueberry', 'leafPile']
}

// The catalogue's largest footprint per kind (TS → bundled with esbuild).
const esbuild = (() => {
  try { return require('esbuild') } catch { return createRequire(require.resolve('tsx'))('esbuild') }
})()
const built = await esbuild.build({
  stdin: { contents: `export { PROP_KINDS } from '@/use/arenaProps'\nexport { THEME_LOOK } from '@/use/arenaThemes'`, resolveDir: ROOT, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': join(ROOT, 'src') }, logLevel: 'error'
})
const tmpMod = join(tmpdir(), `arena-props-${process.pid}.mjs`)
writeFileSync(tmpMod, built.outputFiles[0].text)
const { PROP_KINDS, THEME_LOOK } = await import(pathToFileURL(tmpMod).href)
unlinkSync(tmpMod)
const maxR = Object.fromEntries(PROP_KINDS.map(k => [k.id, k.r[1]]))
const themeOf = Object.fromEntries(PROP_KINDS.map(k => [k.id, k.theme]))
const grounds = Object.fromEntries(Object.entries(THEME_LOOK).map(([t, l]) => [t, l.backdrop]))
for (const [s, ids] of Object.entries(SHEETS)) for (const id of ids) if (!themeOf[id]) { console.error(`${s}: ${id} is not in PROP_KINDS`); process.exit(2) }

const paintedDir = join(ROOT, 'art-sheets', 'painted')
const sheets = Object.keys(SHEETS).filter(s => existsSync(join(paintedDir, `props-${s}.png`)))
if (sheets.length === 0) { console.error('no painted prop sheets (art-sheets/painted/props-*.png)'); process.exit(2) }
const dataUrl = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([inputs, PPU, Q, themeOf, grounds]) => {
    const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i }
    const keyPainting = (P) => {
      const c = new OffscreenCanvas(P.width, P.height)
      const cx = c.getContext('2d')
      cx.drawImage(P, 0, 0)
      const pd = cx.getImageData(0, 0, P.width, P.height)
      const d = pd.data
      const W = P.width
      const H = P.height
      // Ground = the most common colour (16-level buckets, averaged) — the
      // canvas edge is not trusted: Gemini sometimes frames the sheet or
      // draws its cell grid in dark magenta despite the prompt.
      const buckets = new Map()
      for (let i = 0; i < d.length; i += 16) {
        const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)
        const b = buckets.get(key) ?? [0, 0, 0, 0]
        b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2]
        buckets.set(key, b)
      }
      let best = [0, 255, 0, 255]
      for (const b of buckets.values()) if (b[0] > best[0]) best = b
      const G = [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round)
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
        d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 45) / 75)) * 255)
        // Magenta family at any brightness (grid lines, dark frame, shade of
        // the key): green far below an even red + blue. No prop colour is
        // magenta / purple (the prompts forbid it), so this is the ground.
        const lo = Math.min(d[i], d[i + 2])
        const hi = Math.max(d[i], d[i + 2])
        if (lo > 60 && d[i + 1] < lo * 0.45 && hi - lo < hi * 0.25) d[i + 3] = 0
      }
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
      cx.putImageData(pd, 0, 0)
      return { canvas: c, d, W, H, G }
    }
    // connected solid blobs (4-connectivity), specks dropped
    const blobs = (d, W, H) => {
      const lab = new Int32Array(W * H).fill(-1)
      const out = []
      const stack = []
      for (let p0 = 0; p0 < W * H; p0++) {
        if (lab[p0] !== -1 || d[p0 * 4 + 3] <= 140) continue
        const b = { l: 1e9, t: 1e9, r: -1, b: -1, n: 0, sx: 0, sy: 0, lum: 0, light: 0 }
        lab[p0] = out.length
        stack.push(p0)
        while (stack.length) {
          const p = stack.pop()
          const x = p % W
          const y = (p - x) / W
          b.n++; b.sx += x; b.sy += y
          const i4 = p * 4
          if (d[i4] > 215 && d[i4 + 1] > 215 && d[i4 + 2] > 215) b.light++
          if (x < b.l) b.l = x
          if (x > b.r) b.r = x
          if (y < b.t) b.t = y
          if (y > b.b) b.b = y
          for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
            if (q >= 0 && lab[q] === -1 && d[q * 4 + 3] > 140) { lab[q] = out.length; stack.push(q) }
          }
        }
        out.push(b)
      }
      // Caption glyphs: Gemini sometimes letters each object ("SPRUCE") despite
      // the prompt. A caption (a word or a glyph) is a short blob, almost all white —
      // no prop is (a snowman / snow drift is far taller and carries its
      // outline and shading in the same blob).
      const glyph = b => b.light > b.n * 0.4 && (b.b - b.t) < H * 0.05
      dropped += out.filter(b => b.n >= 40 && glyph(b)).length
      return out.filter(b => b.n >= 40 && !glyph(b))
    }
    const sprites = []
    const errors = []
    const report = []
    let dropped = 0
    for (const { sheet, url, names, maxR } of inputs) {
      dropped = 0
      const K = keyPainting(await load(url))
      const cells = names.map(() => null)
      for (const b of blobs(K.d, K.W, K.H)) {
        const col = Math.min(2, Math.floor((b.sx / b.n) / (K.W / 3)))
        const row = Math.min(2, Math.floor((b.sy / b.n) / (K.H / 3)))
        const k = row * 3 + col
        const c = cells[k]
        cells[k] = c ? { l: Math.min(c.l, b.l), t: Math.min(c.t, b.t), r: Math.max(c.r, b.r), b: Math.max(c.b, b.b) } : { l: b.l, t: b.t, r: b.r, b: b.b }
      }
      report.push(`${sheet}: ground rgb(${K.G.join(',')})${dropped ? `, ${dropped} caption glyphs dropped` : ''}`)
      names.forEach((name, k) => {
        const c = cells[k]
        if (!c) { errors.push(`${sheet} cell ${k} (${name}): empty`); return }
        // include the soft alpha fringe: grow by 3 px, clamp
        const l = Math.max(0, c.l - 3), t = Math.max(0, c.t - 3)
        const r = Math.min(K.W - 1, c.r + 3), bt = Math.min(K.H - 1, c.b + 3)
        const w = r - l + 1, h = bt - t + 1
        const acx = w / 2, acy = h / 2
        let foot = 0
        for (let y = t; y <= bt; y++) {
          for (let x = l; x <= r; x++) {
            if (K.d[(y * K.W + x) * 4 + 3] > 25) {
              const dd = Math.hypot(x + 0.5 - l - acx, y + 0.5 - t - acy)
              if (dd > foot) foot = dd
            }
          }
        }
        foot += 1
        const s = Math.min(1, (PPU * maxR[name]) / foot)
        sprites.push({ sheet, name, src: K.canvas, l, t, w, h, s, footR: foot * s, painted: Math.round(foot) })
      })
    }
    const refused = new Set(errors.map(e => e.split(' ')[0]))
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const atlases = {}
    const byTheme = {}
    for (const sp of sprites) if (!refused.has(sp.sheet)) (byTheme[themeOf[sp.name]] ??= []).push(sp)
    for (const [theme, list] of Object.entries(byTheme)) {
      // shelf pack, tallest first
      const W = 1024
      const PAD = 2
      const items = list.map(sp => ({ ...sp, dw: Math.ceil(sp.w * sp.s), dh: Math.ceil(sp.h * sp.s) }))
      items.sort((p, q) => q.dh - p.dh)
      let x = 0, y = 0, rowH = 0
      for (const it of items) {
        if (x + it.dw + PAD > W) { x = 0; y += rowH + PAD; rowH = 0 }
        it.ax = x; it.ay = y
        x += it.dw + PAD
        rowH = Math.max(rowH, it.dh)
      }
      const H = Math.ceil((y + rowH) / 4) * 4
      const out = new OffscreenCanvas(W, H)
      const ox = out.getContext('2d')
      ox.imageSmoothingQuality = 'high'
      const meta = {}
      for (const it of items) {
        ox.drawImage(it.src, it.l, it.t, it.w, it.h, it.ax, it.ay, it.dw, it.dh)
        meta[it.name] = {
          x: it.ax, y: it.ay, w: it.dw, h: it.dh,
          cx: +(it.ax + it.w * it.s / 2).toFixed(2), cy: +(it.ay + it.h * it.s / 2).toFixed(2),
          footR: +it.footR.toFixed(2)
        }
        report.push(`${theme.padEnd(9)} ${it.name.padEnd(14)} painted footR ${it.painted}px → ${it.footR.toFixed(0)}px (x${it.s.toFixed(2)}), ${it.dw}x${it.dh}`)
      }
      const pv = new OffscreenCanvas(W, H)
      const px = pv.getContext('2d')
      px.fillStyle = grounds[theme] ?? '#4f7d45'
      px.fillRect(0, 0, W, H)
      px.drawImage(out, 0, 0)
      atlases[theme] = {
        webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
        preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
        meta, W, H
      }
    }
    return { errors, refused: [...refused], atlases, report }
  }, [sheets.map(s => ({ sheet: s, url: dataUrl(join(paintedDir, `props-${s}.png`)), names: SHEETS[s], maxR })), PPU, Q, themeOf, grounds])
} finally {
  await browser.close()
}

let exit = 0
if (res.errors.length) {
  console.error('REFUSED:\n  ' + res.errors.join('\n  '))
  mkdirSync(join(paintedDir, 'stale'), { recursive: true })
  for (const sh of res.refused) {
    const p = join(paintedDir, `props-${sh}.png`)
    if (existsSync(p)) renameSync(p, join(paintedDir, 'stale', `props-${sh}.${Date.now()}.png`))
  }
  console.error('  → moved to art-sheets/painted/stale/ (re-paint it); packing the rest')
  exit = 1
}
const OUT_DIR = join(ROOT, 'public', 'images', 'props')
mkdirSync(OUT_DIR, { recursive: true })
const files = new Set()
const entries = []
for (const [theme, at] of Object.entries(res.atlases).sort()) {
  const file = `${theme}_${at.W}x${at.H}.webp`
  files.add(file)
  const buf = Buffer.from(at.webp, 'base64')
  writeFileSync(join(OUT_DIR, file), buf)
  writeFileSync(join(ROOT, 'art-sheets', 'props', `atlas-${theme}.preview.png`), Buffer.from(at.preview, 'base64'))
  console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB, ${Object.keys(at.meta).length} sprites`)
  const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
  const rows = Object.keys(at.meta).sort().map(k => `      ${k}: ${JSON.stringify(at.meta[k]).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}`)
  entries.push(`  ${theme}: {
    file: ${JSON.stringify(file)},
    v: '${v}',
    sprites: {
${rows.join(',\n')}
    }
  }`)
}
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.webp') && !files.has(f)) unlinkSync(join(OUT_DIR, f))
const old = join(ROOT, 'art-sheets', 'props', 'atlas.preview.png')
if (existsSync(old)) unlinkSync(old)
console.error(res.report.join('\n'))
writeFileSync(join(ROOT, 'src', 'use', 'paintedProps.ts'), `// GENERATED by tools/arena-props/pack.mjs — do not edit by hand.
// Painted arena props (decor around the clearing) in public/images/props/,
// one atlas per arena theme (a match loads only its own). Each sprite: its
// rect in the atlas (x, y, w, h), its anchor (cx, cy = the centre of its
// footprint circle) and footR = the radius of the circle around the anchor
// that holds every visible pixel (alpha > 0.1), all in atlas px.
import type { ArenaTheme } from '@/use/arenaThemes'
export interface PaintedPropSprite { x: number, y: number, w: number, h: number, cx: number, cy: number, footR: number }
export interface PaintedPropAtlas { file: string, v: string, sprites: Readonly<Record<string, PaintedPropSprite>> }
export const PAINTED_PROPS: Readonly<Partial<Record<ArenaTheme, PaintedPropAtlas>>> = {
${entries.join(',\n')}
}
`)
process.exit(exit)
