// ─── Painted floor decor (art override) ─────────────────────────────────────
//
// Swaps DECOR_DRAW's vector tufts / ferns / pebbles … for sprites from one
// small atlas (public/images/terrain/decor_*.webp, PAINTED_DECOR — generated
// by tools/decor-sheets/pack.mjs). Decor only shows on the PROCEDURAL floor
// (a painted floor carries its own), and is drawn once into the static arena
// bake, never per frame. Per draw the vector drawing stays the fallback:
//  - until the atlas has loaded (the caller bumps its art revision, which is
//    part of the static bake's cache key);
//  - when the sprite would be drawn ABOVE its own resolution (render-sharpness
//    rule: the bake's device scale is read from the context transform);
//  - with `?art=procedural` (A/B), in jsdom / node.
// The sprite choice mirrors the vector scatter exactly (same `i` alternation
// of the kind and its accent), so the painted scatter covers the same spots:
// no extra sprites, nothing doubled over a feature (the caller's own
// terrainBlocksDecor test still decides where decor may go).
import type { DecorKind } from '@/use/arenaTerrain'
import { DECOR_DRAW, type DecorPalette } from '@/use/arenaTerrainDraw'
import { PAINTED_DECOR, type DecorSpriteName, type PaintedDecor } from '@/use/paintedDecor'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Drawn size (arena units, the sprite's longer side) per sprite. The vector
 *  decor spans 4–10 units; the paintings read a little bigger. */
export const DECOR_UNITS: Readonly<Record<DecorSpriteName, number>> = {
  tuft: 8, ferns: 10, flowers: 8, pebbles: 7, leaves: 8, snow: 8, reeds: 11, acorns: 6.5,
  cones: 7.5, toadstools: 7.5, flowerAccent: 5.5, dryTuft: 8, frostTuft: 8, basalt: 7, rubble: 7, darkTuft: 8
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The tuft look of a theme palette (the vector tints one tuft per theme). */
export const tuftSprite = (p: DecorPalette): DecorSpriteName => {
  const [r, g, b] = hex(p.tuft)
  if (b > g && b > r) return 'frostTuft'
  if (g > r + 20 && g > b) return r + g + b < 250 ? 'darkTuft' : 'tuft'
  return 'dryTuft'
}

/** The pebble look of a theme palette, by its floor base colour. */
export const pebbleSprite = (p: DecorPalette): DecorSpriteName => {
  if (!p.base) return 'pebbles'
  const [r, g] = hex(p.base)
  if (g >= 0x90) return 'pebbles'
  return r - g > 40 ? 'rubble' : 'basalt'
}

/** Which sprite the scatter spot `i` of `kind` shows — the same alternation
 *  as the vector DECOR_DRAW (every n-th spot is the kind's accent). */
export const decorSpriteFor = (kind: DecorKind, i: number, p: DecorPalette): DecorSpriteName => {
  switch (kind) {
    case 'tufts': return i % 3 === 0 ? 'flowerAccent' : tuftSprite(p)
    case 'flowers': return i % 2 === 1 ? tuftSprite(p) : 'flowers'
    case 'ferns': return i % 3 === 0 ? 'flowerAccent' : 'ferns'
    case 'pebbles': return i % 3 === 0 ? tuftSprite(p) : pebbleSprite(p)
    case 'leaves': return i % 3 === 0 ? tuftSprite(p) : 'leaves'
    case 'snow': return i % 4 === 0 ? tuftSprite(p) : 'snow'
    case 'reeds': return i % 3 === 0 ? 'flowerAccent' : 'reeds'
    case 'acorns': return i % 2 === 1 ? tuftSprite(p) : 'acorns'
    case 'cones': return i % 2 === 1 ? tuftSprite(p) : 'cones'
    case 'toadstools': return i % 2 === 1 ? tuftSprite(p) : 'toadstools'
  }
}

/** Sprites that lie flat and may turn (leaves, stones); the rest stand up and
 *  only mirror. */
const TURNS: ReadonlySet<DecorSpriteName> = new Set<DecorSpriteName>(['leaves', 'pebbles', 'basalt', 'rubble', 'snow'])

/** Draw one painted decor sprite; false = the caller draws the vector one
 *  (exported for tests; `img` is the loaded atlas). */
export const drawDecorSprite = (ctx: Ctx, img: CanvasImageSource, meta: PaintedDecor, name: DecorSpriteName, x: number, y: number, i: number): boolean => {
  const [sx, sy, sw, sh] = meta.rects[name]
  const units = DECOR_UNITS[name]
  const t = ctx.getTransform()
  const deviceScale = Math.hypot(t.a, t.b) || 1
  if (units * deviceScale > Math.max(sw, sh)) return false
  const k = units / Math.max(sw, sh)
  const w = sw * k
  const h = sh * k
  ctx.save()
  ctx.translate(x, y)
  if (TURNS.has(name)) ctx.rotate(i * 1.3)
  else if (i % 2 === 1) ctx.scale(-1, 1)
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  ctx.restore()
  return true
}

const allowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

let installed = false

/** Load the atlas and wrap DECOR_DRAW; `onReady` bumps the static bake's art
 *  revision when the atlas lands. Idempotent; a no-op without a painting. */
export const installDecorArt = (onReady: () => void): void => {
  const meta = PAINTED_DECOR
  if (installed || !meta || !allowed()) return
  installed = true
  let atlas: HTMLImageElement | null = null
  const el = new Image()
  el.decoding = 'async'
  el.onload = () => {
    atlas = el
    onReady()
  }
  el.src = prependBaseUrl(`images/terrain/${meta.file}?v=${meta.v}`)
  for (const kind of Object.keys(DECOR_DRAW) as DecorKind[]) {
    const vector = DECOR_DRAW[kind]
    DECOR_DRAW[kind] = (ctx, x, y, i, p) => {
      if (atlas && drawDecorSprite(ctx, atlas, meta, decorSpriteFor(kind, i, p), x, y, i)) return
      vector(ctx, x, y, i, p)
    }
  }
}
