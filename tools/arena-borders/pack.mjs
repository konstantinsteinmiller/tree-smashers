#!/usr/bin/env node
/**
 * Painted arena BORDERS → one tileable strip atlas per theme + registry.
 *
 *   node tools/arena-borders/pack.mjs [--ppu 6] [--q 0.9] [--only meadow,ruins]
 *
 * In:  art-sheets/painted/border-<theme>.png — three horizontal border strips
 *      stacked on flat magenta (prompts: tools/arena-borders/prompts.mjs).
 * Out: public/images/arena-borders/<theme>_<w>x<h>.webp — the theme's tiles,
 *      one row each (with wrap padding left / right so bilinear sampling at a
 *      tile end reads the continuation, not transparency);
 *      src/use/paintedBorders.ts — generated registry;
 *      art-sheets/arena-borders/<theme>.preview.png — the tiles joined in
 *      every order on the theme's ground (review the seams here).
 *
 * Steps (pixel work in tools/arena-borders/strip.mjs, decode / encode in a
 * throwaway headless Chrome — Node has no image codec):
 *  1. key the magenta ground, find the strips (findBands), trim tapered ends;
 *  2. measure each strip's arena-side BASELINE (median lowest painted row)
 *     and outer edge (median highest row) and scale it so baseline → outer
 *     edge = THICK_UNITS arena units at `ppu` px per unit — every variant the
 *     same thickness, baselines on one row (`inner`) — never upscaled: `ppu`
 *     drops to the thinnest strip's own resolution if that is below --ppu;
 *  3. buildTiles: one join block + min-error quilts → tiles that follow each
 *     other in ANY order; the shared `cut` column (a natural gap) is where a
 *     border may end beside a tree;
 *  4. MEASURE every seam (strip.mjs seamRatio over all ordered pairs + the
 *     quilts inside each tile) and REFUSE a variant above the threshold
 *     (MAX_SEAM / MAX_INTERNAL); a theme with < 2 good variants is not
 *     shipped (exit 1 — re-paint it: paint-queue.mjs --redo <theme>).
 *
 * Resolution: --ppu 6 px per arena unit covers a 3× phone (≈ 2.9 device px
 * per unit) and a 1440p / 4K-at-2× desktop (≈ 4.5); the engine falls back to
 * the procedural rim above MAX_BORDER_UPSCALE (arenaBorderArt.ts).
 */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_INTERNAL, MAX_SEAM, MAX_TONE, THICK_UNITS, toneDistance, buildTiles, crop, findBands, hcat, keyMagenta, makeImg, measureStrip, pairSeams, resample, trimEnds } from './strip.mjs'
// A strictly periodic strip (bedroom blocks) can measure high on the quilt metric yet cut cleanly: allow a per-run override, always check the seam preview.
const MAXI = Number(process.env.BORDER_MAX_INTERNAL) || MAX_INTERNAL

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const PPU = +opt('ppu', 6)
const Q = +opt('q', 0.9)
const only = opt('only', null)?.split(',')

/** Rows kept above the median outer edge (peaks) / below the baseline (bumps), in units. */
const PEAK_UNITS = 8
const BELOW_UNITS = 4
/** Quilt overlaps tried (best kept) and the join-block core, in units. */
const K_UNITS = [5, 7, 9, 12]
const CORE_UNITS = 14
const HPAD = 8
const VPAD = 2
const GROUND = { lava: '#5e5149', heal: '#3f6a3c', meadow: '#4f7d45', woodland: '#3f6a3c', rocky: '#8a8358', snowy: '#b9cbd8', volcanic: '#5e5149', ruins: '#6b4a40', bedroom: '#a8774c' }

const paintedDir = join(ROOT, 'art-sheets', 'painted')
const OUT_DIR = join(ROOT, 'public', 'images', 'arena-borders')
const PREVIEW_DIR = join(ROOT, 'art-sheets', 'arena-borders')
const REG = join(ROOT, 'src', 'use', 'paintedBorders.ts')

const themes = readdirSync(paintedDir)
  .map(f => /^border-([a-z]+)\.png$/.exec(f)?.[1])
  .filter(Boolean)
  .filter(t => !only || only.includes(t))
  .sort()
if (themes.length === 0) { console.error('no art-sheets/painted/border-<theme>.png'); process.exit(2) }
mkdirSync(OUT_DIR, { recursive: true })

// Keep the registry entries of themes not re-packed this run.
const previous = (() => {
  if (!existsSync(REG)) return {}
  const m = /PAINTED_BORDERS[^=]*=\s*(\{[\s\S]*\})\s*$/.exec(readFileSync(REG, 'utf-8'))
  try { return m ? JSON.parse(m[1]) : {} } catch { return {} }
})()

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage()
const decode = async (file) => {
  const r = await page.evaluate(async (url) => {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height)
    const x = c.getContext('2d', { colorSpace: 'srgb' })
    x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, img.width, img.height).data
    let bin = ''
    for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode(...d.subarray(i, i + 0x8000))
    return [img.width, img.height, btoa(bin)]
  }, `data:image/png;base64,${readFileSync(file).toString('base64')}`)
  return { w: r[0], h: r[1], data: new Uint8ClampedArray(Buffer.from(r[2], 'base64')) }
}
const encode = async (img, type, quality, ground = null) => Buffer.from(await page.evaluate(async ([w, h, b64, type, quality, ground]) => {
  const bin = Uint8ClampedArray.from(atob(b64), ch => ch.charCodeAt(0))
  const c = new OffscreenCanvas(w, h)
  const x = c.getContext('2d')
  const tmp = new OffscreenCanvas(w, h)
  tmp.getContext('2d').putImageData(new ImageData(bin, w, h), 0, 0)
  if (ground) { x.fillStyle = ground; x.fillRect(0, 0, w, h) }
  x.drawImage(tmp, 0, 0)
  const buf = new Uint8Array(await (await c.convertToBlob({ type, quality })).arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}, [img.w, img.h, Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).toString('base64'), type, quality, ground]), 'base64')

const reg = { ...previous }
let failed = 0
try {
  for (const theme of themes) {
    const strips = []
    const notes = []
    // The main painting, plus any extra sheet border-<theme>.2.png, .3.png … painted from the same
    // prompt (#Consistency-13): more strips = more distinct tiles = a longer repeat round the arena.
    const sources = [`border-${theme}.png`, ...readdirSync(paintedDir).filter(f => new RegExp(`^border-${theme}\\.\\d+\\.png$`).test(f)).sort()]
    for (const [si, file] of sources.entries()) {
      const sheet = await decode(join(paintedDir, file))
      keyMagenta(sheet)
      const bands = findBands(sheet)
      for (const [i, b] of bands.entries()) {
        const tag = si === 0 ? `band ${i}` : `${file} band ${i}`
        const h = b.bottom - b.top
        if (h > sheet.h * 0.4) { notes.push(`${tag}: ${h} px tall — strips merged?`); continue }
        const full = crop(sheet, 0, b.top, sheet.w, h)
        const [x0, x1] = trimEnds(full)
        const s = crop(full, x0, 0, x1 - x0, h)
        const m = measureStrip(s)
        if (m.painted < 0.9) { notes.push(`${tag}: only ${(m.painted * 100).toFixed(0)} % of columns painted`); continue }
        if (m.baseline - m.top < 20) { notes.push(`${tag}: too thin`); continue }
        strips.push({ img: s, m, band: i, trim: [x0, sheet.w - x1] })
      }
    }
    if (strips.length < 2) { console.log(`${theme}: REFUSED — ${strips.length} usable strip(s); ${notes.join('; ')}`); failed++; continue }
    const ppu = Math.min(PPU, ...strips.map(s => (s.m.baseline - s.m.top) / THICK_UNITS))
    const above = Math.ceil((THICK_UNITS + PEAK_UNITS) * ppu)
    const below = Math.ceil(BELOW_UNITS * ppu)
    const rowH = above + below
    const normAll = strips.map(s => {
      const k = (THICK_UNITS * ppu) / (s.m.baseline - s.m.top)
      const r = resample(s.img, Math.round(s.img.w * k), Math.max(1, Math.round(s.img.h * k)))
      const base = Math.round(s.m.baseline * k)
      return crop(r, 0, base - above, r.w, rowH)
    })
    // Tone gate: a variant painted lighter / darker than strip 0 shows as a
    // patch wherever it meets another one — drop it (≥ 2 must remain).
    const tones = normAll.map(n => toneDistance(n, normAll[0]))
    let norm = normAll.filter((_, i) => tones[i] <= MAX_TONE)
    if (norm.length < 2) norm = normAll.map((n, i) => [n, tones[i]]).sort((x, y) => x[1] - y[1]).slice(0, 2).map(x => x[0])
    if (norm.length < normAll.length) notes.push(`tone ${tones.map(t => t.toFixed(0)).join('/')} → ${normAll.length - norm.length} variant(s) dropped (tone)`)
    const core = Math.round(CORE_UNITS * ppu)
    // Try several quilt overlaps; keep the result with the most variants,
    // then the gentlest worst quilt cut.
    let built = null
    let builtNotes = []
    for (const kU of K_UNITS) {
      const K = Math.round(kU * ppu)
      const tryNotes = []
      let keep = norm.map((_, i) => i)
      let b
      for (;;) {
        b = buildTiles(keep.map(i => norm[i]), { K, core })
        const pairs = pairSeams(b.tiles)
        const bad = new Map()
        for (const p of pairs) if (p.ratio > MAX_SEAM) { bad.set(p.i, (bad.get(p.i) ?? 0) + 1); bad.set(p.j, (bad.get(p.j) ?? 0) + 1) }
        b.report.forEach((r, i) => { if (r.internal > MAXI) bad.set(i, (bad.get(i) ?? 0) + 10) })
        b.pairs = pairs
        if (bad.size === 0) break
        // drop the worst variant other than the join's source (index 0)
        const worst = [...bad.entries()].filter(([i]) => i !== 0).sort((x, y) => y[1] - x[1])[0]
        if (!worst || keep.length <= 2) { b.failed = true; break }
        tryNotes.push(`variant ${keep[worst[0]]} dropped (seams)`)
        keep = keep.filter((_, i) => i !== worst[0])
      }
      b.kUnits = kU
      b.quiltMax = Math.max(...b.report.map(r => r.internal))
      const better = !built || (built.failed && !b.failed) ||
        (!b.failed && (b.tiles.length > built.tiles.length || (b.tiles.length === built.tiles.length && b.quiltMax < built.quiltMax)))
      if (better) { built = b; builtNotes = tryNotes }
    }
    notes.push(...builtNotes, `K ${built.kUnits} u`)
    const worstPair = Math.max(...built.pairs.map(p => p.ratio))
    const worstInternal = Math.max(...built.report.map(r => r.internal))
    if (built.failed) {
      console.log(`${theme}: REFUSED — seams too visible (pair ${worstPair.toFixed(2)} > ${MAX_SEAM} or quilt ${worstInternal.toFixed(2)} > ${MAXI}); ${notes.join('; ')}`)
      failed++
      continue
    }
    // atlas
    const tiles = built.tiles
    const aw = Math.max(...tiles.map(t => t.w)) + 2 * HPAD
    const ah = tiles.length * (rowH + 2 * VPAD)
    const atlas = makeImg(aw, ah)
    const rows = []
    tiles.forEach((t, i) => {
      const y0 = i * (rowH + 2 * VPAD) + VPAD
      const padded = hcat(crop(t, t.w - HPAD, 0, HPAD, rowH), t, crop(t, 0, 0, HPAD, rowH))
      for (let y = 0; y < rowH; y++) atlas.data.set(padded.data.subarray(y * padded.w * 4, (y + 1) * padded.w * 4), ((y0 + y) * aw) * 4)
      rows.push({ y: y0, w: t.w })
    })
    const webp = await encode(atlas, 'image/webp', Q)
    const file = `${theme}_${aw}x${ah}.webp`
    for (const f of readdirSync(OUT_DIR)) if (f.startsWith(`${theme}_`) && f !== file) unlinkSync(join(OUT_DIR, f))
    writeFileSync(join(OUT_DIR, file), webp)
    reg[theme] = {
      file, w: aw, h: ah, v: createHash('sha1').update(webp).digest('hex').slice(0, 8),
      ppu: +ppu.toFixed(3), rowH, inner: above, pad: HPAD, cut: built.cut,
      tiles: rows, seam: +worstPair.toFixed(3), quilt: +worstInternal.toFixed(3)
    }
    // preview: every ordered pair once, then each tile twice, on the theme's ground
    // one row per ordered pair i → j: [tile i][tile j][tile i] (both joins visible)
    const pairRows = []
    // (with more than 4 tiles — extra painted sheets — only each tile's cyclic neighbour: n² rows blow the page)
    for (let i = 0; i < tiles.length; i++) {
      if (tiles.length > 4) pairRows.push(hcat(tiles[i], tiles[(i + 1) % tiles.length], tiles[i]))
      else for (let j = 0; j < tiles.length; j++) pairRows.push(hcat(tiles[i], tiles[j], tiles[i]))
    }
    const pw = Math.max(...pairRows.map(r => r.w))
    const prevImg = makeImg(pw, pairRows.length * (rowH + 6))
    pairRows.forEach((r, k) => {
      for (let y = 0; y < rowH; y++) prevImg.data.set(r.data.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((k * (rowH + 6) + y) * pw) * 4)
    })
    mkdirSync(PREVIEW_DIR, { recursive: true })
    writeFileSync(join(PREVIEW_DIR, `${theme}.preview.png`), await encode(prevImg, 'image/png', 1, GROUND[theme]))
    console.log(`${file} ${(webp.length / 1024).toFixed(1)} kB · ${tiles.length} tiles (${rows.map(r => r.w).join('/')} px) · ppu ${ppu.toFixed(2)} · seam ${worstPair.toFixed(2)} · quilt ${worstInternal.toFixed(2)}${notes.length ? ` · ${notes.join('; ')}` : ''}`)
  }
} finally {
  await browser.close()
}

const entries = Object.keys(reg).sort().map(t => `  ${JSON.stringify(t)}: ${JSON.stringify(reg[t])}`)
writeFileSync(REG, `// GENERATED by tools/arena-borders/pack.mjs — do not edit by hand.
// Painted arena borders per theme in public/images/arena-borders/: one row per
// tileable strip variant (any variant may follow any other), each padded by
// \`pad\` px of its own wrap-around on both sides. Rows are \`rowH\` px tall; the
// arena-side baseline sits on row \`inner\`; \`ppu\` = px per arena unit; \`cut\`
// = the column (in every tile) where a border may end beside a tree; \`seam\` /
// \`quilt\` = the worst measured seam ratios (tools/arena-borders/strip.mjs).
import type { ArenaTheme } from '@/use/arenaThemes'
/** An arena theme's edge, or a special wall ('lava' hurts, 'heal' heals). */
export type BorderKey = ArenaTheme | 'lava' | 'heal'
export interface PaintedBorder {
  file: string, w: number, h: number, v: string, ppu: number, rowH: number, inner: number, pad: number, cut: number,
  tiles: readonly { y: number, w: number }[], seam: number, quilt: number
}
export const PAINTED_BORDERS: Readonly<Partial<Record<BorderKey, PaintedBorder>>> = {
${entries.join(',\n')}
}
`)
console.log(`registry: ${Object.keys(reg).length} theme(s)${failed ? ` · ${failed} refused` : ''}`)
process.exit(failed ? 1 : 0)
