// ─── Painted arena borders (art override for the wooden rim) ────────────────
//
// Arena types whose WALL does something get their own wall instead of the
// theme's (borderKeyFor): 'lava' (lava arena — the wall HURTS on contact:
// molten crust, bright flat orange cracks, flame tongues) and 'heal' (forest
// arena — the wall HEALS on contact: leafy vines, flowers, hearts, plus
// signs). Every other arena wears its THEME's painted edge (tools/arena-borders: meadow
// bushes / logs / flowers, woodland mossy logs + roots, rocky boulder wall,
// snowy snow bank + ice, volcanic basalt ridge, ruins broken carved wall,
// bedroom toy blocks + pillows) as a few horizontally tileable strips
// (PAINTED_BORDERS). drawPaintedBorder lays them along the clearing's own SDF
// outline (arenaBorderGeometry.borderMesh: arc-length quads, the strip's
// arena-side baseline BORDER_INSET units inside the collision wall, a gap at
// each tree) and draws every quad as two affine-mapped triangles. It is drawn
// ONCE into the engine's static layer (useSpinnerGame drawStaticLayer) — no
// per-frame cost; the mesh is cached per theme / shape / trees / layout.
// Purely visual: the collision wall is unchanged.
//
// Procedural fallback (returns false → the caller strokes the wooden rim):
//  - the theme has no painted border;
//  - before its WebP has loaded (lazy, per theme; the static bake is re-keyed
//    on borderArtRevision());
//  - when the bake would upscale the strip more than MAX_BORDER_UPSCALE
//    (render-sharpness rule);
//  - with `?art=procedural` (A/B), in jsdom / node.
import { borderMesh, type BorderMesh, type BorderTower } from '@/use/arenaBorderGeometry'
import type { ArenaShape } from '@/use/arenaShapes'
import type { ArenaTheme } from '@/use/arenaThemes'
import { PAINTED_BORDERS, type BorderKey, type PaintedBorder } from '@/use/paintedBorders'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Above this upscale of the painted strip the procedural rim is drawn. */
export const MAX_BORDER_UPSCALE = 1.5
/** Device px every triangle's clip grows by (hides anti-aliased hairlines
 *  between neighbouring triangles; both sides show the same texture there). */
const CLIP_GROW_PX = 0.6

let revision = 0
/** Bumps when a painted border becomes available — key the static bake on it. */
export const borderArtRevision = (): number => revision

const images = new Map<BorderKey, HTMLImageElement | null>()

/** Which painted border an arena wears: the lava / heal wall on the arena
 *  types whose wall hurts / heals (when painted), else its theme's edge. */
export const borderKeyFor = (arenaType: ArenaType, theme: ArenaTheme): BorderKey => {
  if (arenaType === 'lava' && PAINTED_BORDERS.lava) return 'lava'
  if (arenaType === 'forest' && PAINTED_BORDERS.heal) return 'heal'
  return theme
}

import { whenDecoded } from '@/use/imageDecode'

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

const settled = new Map<BorderKey, Promise<void>>()

/** Start loading a border's painting (no-op when none / already asked);
 *  settles on load or error, never rejects — the splash awaits it (useAssets). */
export const preloadBorderArt = (theme: BorderKey): Promise<void> => {
  const meta = PAINTED_BORDERS[theme]
  if (!meta || !artAllowed()) return Promise.resolve()
  const known = settled.get(theme)
  if (known) return known
  images.set(theme, null)
  const p = new Promise<void>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => whenDecoded(img, () => {
      images.set(theme, img)
      revision++
      resolve()
    })
    img.onerror = () => resolve()
    img.src = prependBaseUrl(`images/arena-borders/${meta.file}?v=${meta.v}`)
  })
  settled.set(theme, p)
  return p
}

const meshes = new Map<string, BorderMesh>()
const meshFor = (theme: BorderKey, shape: ArenaShape, R: number, towers: readonly BorderTower[], seed: string): { mesh: BorderMesh, key: string } | null => {
  const meta = PAINTED_BORDERS[theme]
  if (!meta) return null
  const key = `${theme}:${meta.v}:${shape}:${R}:${seed}:${towers.map(t => `${t.x.toFixed(2)},${t.y.toFixed(2)},${t.radius}`).join(';')}`
  let m = meshes.get(key)
  if (!m) {
    if (meshes.size > 24) meshes.clear()
    m = borderMesh(meta, shape, R, towers, seed)
    meshes.set(key, m)
  }
  return { mesh: m, key }
}

// ── Device-pixel cache ──────────────────────────────────────────────────
// Warping the strips costs ~400–900 clipped drawImage calls (≈ 25 ms on a
// desktop, ≈ 100+ ms on a 4×-throttled phone). The static layer re-bakes
// whenever a tree changes damage state, so the warped border is kept as ONE
// device-pixel bitmap of its own bounding box per (mesh, transform): a re-bake
// is then a single 1 : 1 drawImage on whole device pixels (sharp). At most
// BORDER_CACHE_MAX bitmaps (≈ 4–7 MB each on a 3× phone) are kept.
const BORDER_CACHE_MAX = 2
interface CachedBorder { canvas: HTMLCanvasElement | OffscreenCanvas, dx: number, dy: number }
const bitmaps = new Map<string, CachedBorder>()

const newCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const drawMesh = (g: Ctx, img: CanvasImageSource, meta: PaintedBorder, mesh: BorderMesh, deviceScale: number): void => {
  const grow = CLIP_GROW_PX / deviceScale
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  for (const q of mesh.quads) {
    const tile = meta.tiles[q.tile]!
    const sx0 = meta.pad + q.u0
    const sx1 = meta.pad + q.u1
    const sTop = tile.y
    const sBot = tile.y + meta.rowH
    // (u0, bottom) i0 · (u0, top) o0 · (u1, bottom) i1
    drawTri(g, img, grow, sTop, sBot, meta.w, sx0, sBot, sx0, sTop, sx1, sBot, q.i0x, q.i0y, q.o0x, q.o0y, q.i1x, q.i1y)
    // (u0, top) o0 · (u1, top) o1 · (u1, bottom) i1
    drawTri(g, img, grow, sTop, sBot, meta.w, sx0, sTop, sx1, sTop, sx1, sBot, q.o0x, q.o0y, q.o1x, q.o1y, q.i1x, q.i1y)
  }
}

/** Draw source triangle (sx*, sy*) of `img` onto dest triangle (dx*, dy*). */
const drawTri = (
  ctx: Ctx, img: CanvasImageSource, grow: number, clipY0: number, clipY1: number, imgW: number,
  s0x: number, s0y: number, s1x: number, s1y: number, s2x: number, s2y: number,
  d0x: number, d0y: number, d1x: number, d1y: number, d2x: number, d2y: number
): void => {
  // affine M: source → dest
  const ux = s1x - s0x
  const uy = s1y - s0y
  const vx = s2x - s0x
  const vy = s2y - s0y
  const det = ux * vy - vx * uy
  if (Math.abs(det) < 1e-9) return
  const px = d1x - d0x
  const py = d1y - d0y
  const qx = d2x - d0x
  const qy = d2y - d0y
  const a = (px * vy - qx * uy) / det
  const b = (py * vy - qy * uy) / det
  const c = (qx * ux - px * vx) / det
  const d = (qy * ux - py * vx) / det
  const e = d0x - a * s0x - c * s0y
  const f = d0y - b * s0x - d * s0y
  // grown clip triangle
  const cx = (d0x + d1x + d2x) / 3
  const cy = (d0y + d1y + d2y) / 3
  ctx.save()
  ctx.beginPath()
  for (const [x, y] of [[d0x, d0y], [d1x, d1y], [d2x, d2y]] as const) {
    const l = Math.hypot(x - cx, y - cy) || 1
    const k = 1 + (grow * 2) / l
    ctx.lineTo(cx + (x - cx) * k, cy + (y - cy) * k)
  }
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  const x0 = Math.max(0, Math.floor(Math.min(s0x, s1x, s2x)) - 2)
  const x1 = Math.min(imgW, Math.ceil(Math.max(s0x, s1x, s2x)) + 2)
  const y0 = Math.max(clipY0, Math.floor(Math.min(s0y, s1y, s2y)) - 2)
  const y1 = Math.min(clipY1, Math.ceil(Math.max(s0y, s1y, s2y)) + 2)
  if (x1 > x0 && y1 > y0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0)
  ctx.restore()
}

/**
 * Draw the painted border of `theme` around the clearing (caller has
 * translated to the arena origin and scaled to arena units). `towers` = the
 * trees set into the wall (the border leaves a gap there), `seed` varies the
 * tile order (layout id). Returns false when the caller should draw its
 * procedural rim instead.
 */
/** Owner 2026-10-23: trees no longer stand inside the arena walls, so the wall runs
 *  unbroken (no gap at each tree). The geometry still supports gaps — flip to bring them back. */
export const BORDER_TREE_GAPS = false
const NO_TOWERS: readonly BorderTower[] = []

export const drawPaintedBorder = (
  ctx: Ctx, theme: BorderKey, shape: ArenaShape, R: number, towers: readonly BorderTower[], seed: string
): boolean => {
  if (!BORDER_TREE_GAPS) towers = NO_TOWERS
  const meta = PAINTED_BORDERS[theme]
  if (!meta) return false
  preloadBorderArt(theme)
  const img = images.get(theme)
  if (!img) return false
  const t = ctx.getTransform()
  const deviceScale = Math.hypot(t.a, t.b) || 1
  if (deviceScale > meta.ppu * MAX_BORDER_UPSCALE) return false
  const m = meshFor(theme, shape, R, towers, seed)
  if (!m) return false
  const { mesh } = m
  // device-space bounding box of the mesh under the current transform
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const q of mesh.quads) {
    for (const [x, y] of [[q.i0x, q.i0y], [q.o0x, q.o0y], [q.i1x, q.i1y], [q.o1x, q.o1y]] as const) {
      const dx = t.a * x + t.c * y + t.e
      const dy = t.b * x + t.d * y + t.f
      if (dx < x0) x0 = dx
      if (dx > x1) x1 = dx
      if (dy < y0) y0 = dy
      if (dy > y1) y1 = dy
    }
  }
  const ox = Math.floor(x0) - 2
  const oy = Math.floor(y0) - 2
  const w = Math.ceil(x1) + 2 - ox
  const h = Math.ceil(y1) + 2 - oy
  const fx = (t.e - ox) - Math.round(t.e - ox)
  const fy = (t.f - oy) - Math.round(t.f - oy)
  const key = `${m.key}:${t.a.toFixed(5)},${t.b.toFixed(5)},${t.c.toFixed(5)},${t.d.toFixed(5)}:${fx.toFixed(3)},${fy.toFixed(3)}:${w}x${h}`
  let hit = bitmaps.get(key)
  if (!hit) {
    const canvas = w > 0 && h > 0 && w * h < 40e6 ? newCanvas(w, h) : null
    const g = canvas?.getContext('2d') as Ctx | null | undefined
    if (!canvas || !g) {
      // no buffer (memory pressure / exotic browser): warp straight into ctx
      const prev = ctx.imageSmoothingEnabled
      drawMesh(ctx, img, meta, mesh, deviceScale)
      ctx.imageSmoothingEnabled = prev
      return true
    }
    g.setTransform(t.a, t.b, t.c, t.d, t.e - ox, t.f - oy)
    drawMesh(g, img, meta, mesh, deviceScale)
    while (bitmaps.size >= BORDER_CACHE_MAX) bitmaps.delete(bitmaps.keys().next().value!)
    hit = { canvas, dx: ox - t.e, dy: oy - t.f }
    bitmaps.set(key, hit)
  } else {
    // most recently used last
    bitmaps.delete(key)
    bitmaps.set(key, hit)
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(hit.canvas as CanvasImageSource, Math.round(t.e + hit.dx), Math.round(t.f + hit.dy))
  ctx.restore()
  return true
}
