// ─── Arena backdrop: painted ground + decorative props around the clearing ───
//
// Replaces the flat FOREST_BACKDROP fill of the default background skin with
//  1. a painted, seamless highland-grass tile (PAINTED_BACKDROP, made by
//     tools/bg-tile/make-tile.mjs), anchored at the arena centre and scaled
//     with the arena — but NEVER above its own resolution (the tile shrinks
//     in arena units on a dense screen instead of being upscaled), and
//  2. the layout's deterministic prop scatter (arenaProps.ts) from the
//     painted prop atlas (paintedProps.ts).
// Both are pre-rendered ONCE into a device-resolution buffer (css × dpr, read
// from the context transform — render-sharpness rule) keyed on the viewport,
// the layout, the shape and the art load state; a frame is one opaque blit.
// Purely decorative: reads nothing from and writes nothing to the match.
//
// Returns false until the tile has loaded (the caller keeps its flat fill),
// with `?art=procedural`, and in jsdom / node.
import { arenaPropLayout, PROP_KIND_BY_ID } from '@/use/arenaProps'
import type { ArenaShape } from '@/use/arenaShapes'
import { PAINTED_PROPS } from '@/use/paintedProps'
import { prependBaseUrl } from '@/utils/function'

/** The painted backdrop tile (public/images/bg/). `units` = the most arena
 *  units one tile spans (it spans fewer where that would upscale it). */
export const PAINTED_BACKDROP = { file: 'highland-tile_768x768.webp', size: 768, units: 230, v: '094f4c95' } as const

type Buf = OffscreenCanvas | HTMLCanvasElement
type BufCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

let tileImg: HTMLImageElement | null = null
let atlasImg: HTMLImageElement | null = null
let started = false
let revision = 0
let buffer: Buf | null = null
let bufferKey = ''

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

const load = (src: string, done: (img: HTMLImageElement) => void) => {
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    done(img)
    revision++
  }
  img.src = prependBaseUrl(src)
}

const start = (): void => {
  if (started) return
  started = true
  load(`images/bg/${PAINTED_BACKDROP.file}?v=${PAINTED_BACKDROP.v}`, img => { tileImg = img })
  if (PAINTED_PROPS) load(`images/props/${PAINTED_PROPS.file}?v=${PAINTED_PROPS.v}`, img => { atlasImg = img })
}

const newBuffer = (w: number, h: number): Buf => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const bake = (b: BufCtx, bw: number, bh: number, unit: number, layoutId: number | null, shape: ArenaShape) => {
  const cx = bw / 2
  const cy = bh / 2
  // 1. ground tile — device size ≤ its own pixels (never upscaled)
  const tile = tileImg!
  const s = Math.min(1, (PAINTED_BACKDROP.units * unit) / tile.naturalWidth)
  const pat = b.createPattern(tile, 'repeat')
  if (pat) {
    b.save()
    b.translate(cx, cy)
    b.scale(s, s)
    b.fillStyle = pat
    b.fillRect(-cx / s, -cy / s, bw / s, bh / s)
    b.restore()
  }
  // 2. props
  if (!atlasImg || !PAINTED_PROPS) return
  const sprites = PAINTED_PROPS.sprites
  b.imageSmoothingQuality = 'high'
  for (const p of arenaPropLayout(layoutId, shape)) {
    const sp = sprites[p.kind]
    if (!sp) continue
    const px = cx + p.x * unit
    const py = cy + p.y * unit
    const rr = p.r * unit
    if (px + rr < 0 || px - rr > bw || py + rr < 0 || py - rr > bh) continue
    if (PROP_KIND_BY_ID[p.kind]?.shadow) {
      // flat contact shadow, inside the footprint (reach ≤ 0.84 r)
      b.fillStyle = 'rgba(0, 0, 0, 0.16)'
      b.beginPath()
      b.ellipse(px + rr * 0.06, py + rr * 0.1, rr * 0.78, rr * 0.62, 0, 0, Math.PI * 2)
      b.fill()
    }
    const k = rr / sp.footR
    b.drawImage(atlasImg, sp.x, sp.y, sp.w, sp.h, px - (sp.cx - sp.x) * k, py - (sp.cy - sp.y) * k, sp.w * k, sp.h * k)
  }
}

/**
 * Paint the backdrop for a canvas of `w` × `h` CSS px (the context carries
 * the dpr transform). `viewShortHalf` = arena units from the centre to the
 * edge of the screen's SHORT axis (the engine's camera fit). Returns false
 * when nothing was drawn (art not ready / disabled).
 */
export const drawArenaBackdrop = (
  ctx: CanvasRenderingContext2D, w: number, h: number,
  layoutId: number | null, shape: ArenaShape, viewShortHalf: number
): boolean => {
  if (!artAllowed()) return false
  start()
  if (!tileImg) return false
  let dpr = 1
  try {
    const m = ctx.getTransform()
    dpr = Math.hypot(m.a, m.b) || 1
  } catch { /* old engines: 1 */ }
  const bw = Math.max(1, Math.round(w * dpr))
  const bh = Math.max(1, Math.round(h * dpr))
  const key = `${bw}x${bh}:${layoutId ?? '-'}:${shape}:${revision}`
  if (key !== bufferKey || !buffer) {
    if (!buffer || buffer.width !== bw || buffer.height !== bh) buffer = newBuffer(bw, bh)
    const b = buffer.getContext('2d') as BufCtx | null
    if (!b) return false
    b.setTransform(1, 0, 0, 1, 0, 0)
    b.fillStyle = '#4f7d45'
    b.fillRect(0, 0, bw, bh)
    bake(b, bw, bh, Math.min(bw, bh) / (2 * viewShortHalf), layoutId, shape)
    bufferKey = key
  }
  ctx.drawImage(buffer as CanvasImageSource, 0, 0, w, h)
  return true
}
