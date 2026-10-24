#!/usr/bin/env node
/**
 * ─── The Tree Smashers logo, favicon and app icons — from code ──────────────
 *
 *   node tools/logo/build.mjs
 *
 * Draws every logo asset from one source (tools/logo/art.mjs) so all of them
 * are vector-sharp and agree with each other:
 *
 *   public/images/logo/emblem.svg          the smash disc (HUD logo, lockup)
 *   public/images/logo/word-tree.svg       "TREE"
 *   public/images/logo/word-smashers.svg   "SMASHERS"
 *   public/images/logo/logo.svg            the whole lockup in one file
 *   public/images/logo/logo_{192x192,512x512}.png, logo_256x256.webp
 *                                          the lockup on a transparent square
 *   public/favicon.svg, public/favicon.ico (16 / 32 / 48, PNG-in-ICO)
 *   public/images/icons/apple-touch-icon_180x180.png
 *   public/images/icons/icon_{192x192,512x512}.png
 *   public/images/icons/icon-maskable_{192x192,512x512}.png
 *   tools/logo/app-icon_1024x1024.png      source for the native icon sets
 *                                          (`npx tauri icon …`, electron)
 *   tools/logo/layout.json                 part boxes in the lockup
 * then runs emit.mjs → src/data/logoArt.ts + the index.html splash block.
 *
 * Letters: Lilita One glyph outlines (SIL OFL 1.1), fetched once from
 * google/fonts at a pinned commit into the OS temp dir; shaped with harfbuzz
 * (the wasm build subset-font already brings). Rasters are drawn by the
 * system Chrome (an SVG drawn into a canvas renders at the canvas size —
 * never an upscale).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { C, emblemBody, faviconBody, svgDoc, wordBody } from './art.mjs'
import { emit } from './emit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')

// ─── Font ────────────────────────────────────────────────────────────────────
const FONT_COMMIT = '90abd17b4f97671435798b6147b698aa9087612f'
const FONT_URL = `https://raw.githubusercontent.com/google/fonts/${FONT_COMMIT}/ofl/lilitaone/LilitaOne-Regular.ttf`
const cacheDir = join(tmpdir(), 'tree-smashers-logo')
mkdirSync(cacheDir, { recursive: true })
const fontFile = join(cacheDir, `LilitaOne-Regular-${FONT_COMMIT.slice(0, 8)}.ttf`)
if (!existsSync(fontFile)) {
  console.error(`fetching ${FONT_URL}`)
  const r = await fetch(FONT_URL)
  if (!r.ok) throw new Error(`font fetch failed: HTTP ${r.status}`)
  writeFileSync(fontFile, Buffer.from(await r.arrayBuffer()))
}
const hb = await import(pathToFileURL(createRequire(require.resolve('subset-font')).resolve('harfbuzzjs')).href)
const font = new hb.Font(new hb.Face(new hb.Blob(readFileSync(fontFile)), 0))
const shape = (text) => {
  const b = new hb.Buffer()
  b.addText(text)
  b.guessSegmentProperties()
  hb.shape(font, b)
  return b.getGlyphInfosAndPositions().map((g) => ({ d: font.glyphToPath(g.codepoint), adv: g.xAdvance }))
}

// ─── Parts (loose view boxes; trimmed below) ─────────────────────────────────
const tree = wordBody(shape('TREE'), {
  size: 170, face: C.leaf400, low: C.leaf500, high: C.leaf300,
  tilt: [-5, 3, -3, 5], hop: [0.02, -0.02, 0.01, -0.03], arch: 0.04, idp: 'tr'
})
const smashers = wordBody(shape('SMASHERS'), {
  size: 220, face: C.sun300, low: C.sun500, high: C.sun200,
  tilt: [-4, 3, -3, 4, -3, 3, -4, 4], hop: [0.01, -0.02, 0.015, -0.01, 0.02, -0.015, 0.01, -0.02], arch: 0.06, idp: 'sm'
})
const loose = {
  emblem: { vb: [-40, -40, 592, 592], body: emblemBody() },
  tree: { vb: [-80, -300, tree.width + 160, 420], body: tree.body },
  smashers: { vb: [-80, -380, smashers.width + 160, 520], body: smashers.body },
  favicon: { vb: [0, 0, 512, 512], body: faviconBody() },
  favicon16: { vb: [0, 0, 512, 512], body: faviconBody({ rim: false }) }
}

/** Minify: collapse whitespace between tags. */
const tidy = (s) => s.replace(/>\s+</g, '><').trim() + '\n'
const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

/** Trim: render at 2 px per unit, find the alpha bounds, back to units. */
const trim = async ({ vb, body }) => {
  const svg = svgDoc(vb, body)
  const box = await page.evaluate(async ([url, vb]) => {
    const K = 2
    const img = new Image()
    img.src = url
    await img.decode()
    const W = Math.ceil(vb[2] * K)
    const H = Math.ceil(vb[3] * K)
    const c = new OffscreenCanvas(W, H)
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0, W, H)
    const d = x.getImageData(0, 0, W, H).data
    let l = W, t = H, r = -1, b = -1
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      if (d[(y * W + xx) * 4 + 3] > 2) { if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > b) b = y }
    }
    return { l: vb[0] + l / K, t: vb[1] + t / K, r: vb[0] + (r + 1) / K, b: vb[1] + (b + 1) / K, edge: l === 0 || t === 0 || r === W - 1 || b === H - 1 }
  }, [dataUrl(svg), vb])
  if (box.edge) throw new Error('logo part touches its loose view box — widen it in build.mjs')
  const pad = 2
  return [box.l - pad, box.t - pad, box.r - box.l + 2 * pad, box.b - box.t + 2 * pad].map((v) => Math.round(v * 10) / 10)
}

/** Render an SVG string to PNG / WebP bytes at w × h (centred, contained). */
const raster = async (svg, w, h, type = 'image/png', q = 0.92) => {
  const b64 = await page.evaluate(async ([url, w, h, type, q]) => {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = new OffscreenCanvas(w, h)
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, 0, 0, w, h)
    const blob = await c.convertToBlob({ type, quality: q })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  }, [dataUrl(svg), w, h, type, q])
  return Buffer.from(b64, 'base64')
}

/** PNG-in-ICO (Vista+; every browser reads it). */
const ico = (pngs) => {
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  let off = head.length
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16
    head.writeUInt8(size >= 256 ? 0 : size, e)
    head.writeUInt8(size >= 256 ? 0 : size, e + 1)
    head.writeUInt8(0, e + 2)
    head.writeUInt8(0, e + 3)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(buf.length, e + 8)
    head.writeUInt32LE(off, e + 12)
    off += buf.length
  })
  return Buffer.concat([head, ...pngs.map((p) => p.buf)])
}

const out = {}
try {
  // ── trimmed part SVGs ──
  const vbs = {}
  for (const [name, part] of Object.entries(loose)) {
    vbs[name] = name.startsWith('favicon') ? part.vb : await trim(part)
    out[name] = tidy(svgDoc(vbs[name], part.body))
  }

  // ── lockup: emblem on top, TREE tucked under it, SMASHERS below ──
  // Units = SMASHERS's own; the lockup is as wide as SMASHERS.
  const [sx, , sw, sh] = vbs.smashers
  const em = vbs.emblem
  const tr = vbs.tree
  const emW = sw * 0.46
  const emH = (em[3] / em[2]) * emW
  const boxes = {}
  boxes.emblem = { x: (sw - emW) / 2, y: 0, w: emW, h: emH }
  boxes.tree = { x: (sw - tr[2]) / 2, y: emH * 0.8, w: tr[2], h: tr[3] }
  boxes.smashers = { x: 0, y: boxes.tree.y + tr[3] * 0.8, w: sw, h: sh }
  const W = sw
  const H = boxes.smashers.y + sh
  const nest = (svg, b) => svg.replace('<svg xmlns="http://www.w3.org/2000/svg" ', `<svg x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" `)
  out.logo = tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">` +
    nest(out.emblem, boxes.emblem) + nest(out.tree, boxes.tree) + nest(out.smashers, boxes.smashers) + '</svg>')
  void sx

  // square lockup (transparent) for logo_* rasters
  const side = Math.max(W, H) * 1.04
  const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${((W - side) / 2).toFixed(1)} ${((H - side) / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}">` +
    out.logo.replace('<svg xmlns="http://www.w3.org/2000/svg" ', `<svg x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" `) + '</svg>'

  // app icon plate: royal square, hard diagonal stripes, the emblem centred
  const plate = (scale) => {
    const s = 512
    const ew = s * scale
    const eh = (em[3] / em[2]) * ew
    const stripes = Array.from({ length: 9 }, (_, i) => {
      const x0 = -s + i * 128
      return `<polygon points="${x0},${s} ${x0 + 64},${s} ${x0 + 64 + s},0 ${x0 + s},0" fill="${C.royal500}"/>`
    }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="${C.royal600}"/>${stripes}` +
      out.emblem.replace('<svg xmlns="http://www.w3.org/2000/svg" ', `<svg x="${((s - ew) / 2).toFixed(1)}" y="${((s - eh) / 2 + s * 0.01).toFixed(1)}" width="${ew.toFixed(1)}" height="${eh.toFixed(1)}" `) + '</svg>'
  }
  const icon = plate(0.86)
  const maskable = plate(0.66)

  // ── write ──
  const L = join(ROOT, 'public', 'images', 'logo')
  const I = join(ROOT, 'public', 'images', 'icons')
  mkdirSync(L, { recursive: true })
  mkdirSync(I, { recursive: true })
  const files = { emblem: 'emblem.svg', tree: 'word-tree.svg', smashers: 'word-smashers.svg' }
  for (const [k, f] of Object.entries(files)) writeFileSync(join(L, f), out[k])
  writeFileSync(join(L, 'logo.svg'), out.logo)
  writeFileSync(join(ROOT, 'public', 'favicon.svg'), out.favicon)
  writeFileSync(join(L, 'logo_512x512.png'), await raster(square, 512, 512))
  writeFileSync(join(L, 'logo_192x192.png'), await raster(square, 192, 192))
  writeFileSync(join(L, 'logo_256x256.webp'), await raster(square, 256, 256, 'image/webp', 0.9))
  const fav = [
    { size: 16, buf: await raster(out.favicon16, 16, 16) },
    { size: 32, buf: await raster(out.favicon, 32, 32) },
    { size: 48, buf: await raster(out.favicon, 48, 48) }
  ]
  writeFileSync(join(ROOT, 'public', 'favicon.ico'), ico(fav))
  writeFileSync(join(I, 'apple-touch-icon_180x180.png'), await raster(icon, 180, 180))
  writeFileSync(join(I, 'icon_192x192.png'), await raster(icon, 192, 192))
  writeFileSync(join(I, 'icon_512x512.png'), await raster(icon, 512, 512))
  writeFileSync(join(I, 'icon-maskable_192x192.png'), await raster(maskable, 192, 192))
  writeFileSync(join(I, 'icon-maskable_512x512.png'), await raster(maskable, 512, 512))
  writeFileSync(join(HERE, 'app-icon_1024x1024.png'), await raster(icon, 1024, 1024))

  const v = createHash('sha1').update(out.emblem + out.tree + out.smashers + out.favicon).digest('hex').slice(0, 8)
  const pct = (b) => ({ x: (b.x / W) * 100, y: (b.y / H) * 100, w: (b.w / W) * 100, h: (b.h / H) * 100 })
  const layout = {
    v,
    W: Math.round(W),
    H: Math.round(H),
    aspect: W / H,
    // the lockup's css width: min(84vw, maxCssWidth, heightShare × 100vh × aspect)
    maxCssWidth: 620,
    heightShare: 0.44,
    emblemAspect: em[2] / em[3],
    files,
    boxes: Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, pct(b)]))
  }
  writeFileSync(join(HERE, 'layout.json'), JSON.stringify(layout, null, 2) + '\n')
  console.log(`logo ${v}: lockup ${layout.W}×${layout.H} (aspect ${layout.aspect.toFixed(3)}), emblem.svg ${out.emblem.length} B, word-tree.svg ${out.tree.length} B, word-smashers.svg ${out.smashers.length} B`)
} finally {
  await browser.close()
}

emit(ROOT)
console.log('wrote src/data/logoArt.ts + index.html splash block')
