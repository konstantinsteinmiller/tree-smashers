// ─── Smasher atlas ──────────────────────────────────────────────────────────
//
// Prerendered smasher art for the battle canvas and the DOM:
//  - character SHEETS: the 32 yaw frames of one (smasher, skin, boss) look at
//    one resolution bucket, in a 4 × 4 grid on one offscreen canvas. Frames
//    are drawn lazily (first use) and the sheets live in a pixel-bounded LRU.
//  - DISC sprites: the top face of the turning disc (wood + team-coloured
//    rim + spin marks), drawn as a top-view circle; the battle draw squashes
//    and rotates it.
//  - PORTRAITS: a front 3/4 view on its disc as a cached data URL for <img>s.
//
// Resolution rule (render sharpness): a sheet's pixels-per-unit is the
// smallest bucket ≥ the device pixels the blade covers (radius × the canvas
// transform scale, which already includes the DPR), capped at 2× that — never
// drawn below css × dpr.

import type { SmasherId } from '@/data/smasherCatalog'
import {
  DISC_SQUASH, DISC_THICKNESS, FRAME_BOX, FRAME_H, FRAME_W, YAW_COLS, YAW_FRAMES, drawSmasher, frameYaw, mixHex
} from '@/smashers/smasherRig'
import { lookKey, smasherForSkin, smasherPalette } from '@/smashers/smasherSkins'

const BUCKETS = [12, 16, 20, 26, 32, 40, 50, 64, 80, 100, 128, 160, 200]
const COLS = YAW_COLS

/** Smallest bucket ≥ `need` device px per model unit. */
export const atlasBucket = (need: number): number => {
  for (const b of BUCKETS) if (b >= need) return b
  return BUCKETS[BUCKETS.length - 1]!
}

const makeCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null => {
  try {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c.getContext('2d') ? c : null
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  } catch { /* no canvas (tests) */ }
  return null
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

interface Sheet {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: Ctx2D
  cellW: number
  cellH: number
  ppu: number
  drawn: number
  id: SmasherId
  modelId?: string
  boss: boolean
}

// LRU by insertion order (a Map re-inserted on use), bounded by total pixels.
const PIXEL_BUDGET = 20_000_000
const sheets = new Map<string, Sheet | null>()
let sheetPixels = 0

const evict = () => {
  for (const [k, s] of sheets) {
    if (sheetPixels <= PIXEL_BUDGET) break
    sheets.delete(k)
    if (s) sheetPixels -= s.canvas.width * s.canvas.height
  }
}

const getSheet = (id: SmasherId, modelId: string | undefined, boss: boolean, ppu: number): Sheet | null => {
  const key = `${lookKey(id, modelId, boss)}@${ppu}`
  const hit = sheets.get(key)
  if (hit !== undefined) {
    sheets.delete(key)
    sheets.set(key, hit)
    return hit
  }
  const cellW = Math.ceil(FRAME_W * ppu)
  const cellH = Math.ceil(FRAME_H * ppu)
  const canvas = makeCanvas(cellW * COLS, cellH * Math.ceil(YAW_FRAMES / COLS))
  const ctx = canvas ? (canvas.getContext('2d') as Ctx2D | null) : null
  const sheet = canvas && ctx ? { canvas, ctx, cellW, cellH, ppu, drawn: 0, id, modelId, boss } : null
  sheets.set(key, sheet)
  if (sheet) {
    sheetPixels += sheet.canvas.width * sheet.canvas.height
    evict()
  }
  return sheet
}

const ensureFrame = (s: Sheet, frame: number) => {
  const bit = 1 << frame
  if (s.drawn & bit) return
  s.drawn |= bit
  const cx = (frame % COLS) * s.cellW
  const cy = Math.floor(frame / COLS) * s.cellH
  drawSmasher(s.ctx as CanvasRenderingContext2D, s.id, smasherPalette(s.id, s.modelId), frameYaw(frame),
    cx - FRAME_BOX.left * s.ppu, cy - FRAME_BOX.top * s.ppu, s.ppu, { boss: s.boss })
}

export interface SmasherFrameRef {
  image: CanvasImageSource
  sx: number
  sy: number
  sw: number
  sh: number
  /** Pixels per model unit of the source. */
  ppu: number
}

/** Source rect of one yaw frame, rendered on demand. Null without a canvas. */
export const smasherFrame = (
  id: SmasherId, modelId: string | undefined, boss: boolean, frame: number, devicePxPerUnit: number
): SmasherFrameRef | null => {
  const s = getSheet(id, modelId, boss, atlasBucket(devicePxPerUnit))
  if (!s) return null
  const f = ((frame % YAW_FRAMES) + YAW_FRAMES) % YAW_FRAMES
  ensureFrame(s, f)
  return { image: s.canvas, sx: (f % COLS) * s.cellW, sy: Math.floor(f / COLS) * s.cellH, sw: s.cellW, sh: s.cellH, ppu: s.ppu }
}

/**
 * Draw a smasher frame with the disc centre at (x, y) and `radius` css px per
 * model unit. `devicePxPerUnit` = radius × the context's device scale.
 */
export const drawSmasherFrame = (
  ctx: CanvasRenderingContext2D, id: SmasherId, modelId: string | undefined, boss: boolean,
  frame: number, x: number, y: number, radius: number, deviceScale: number
): boolean => {
  const ref = smasherFrame(id, modelId, boss, frame, radius * deviceScale)
  if (!ref) return false
  ctx.drawImage(ref.image, ref.sx, ref.sy, ref.sw, ref.sh,
    x + FRAME_BOX.left * radius, y + FRAME_BOX.top * radius, (ref.sw / ref.ppu) * radius, (ref.sh / ref.ppu) * radius)
  return true
}

// ─── Disc ────────────────────────────────────────────────────────────────────

const discs = new Map<string, (HTMLCanvasElement | OffscreenCanvas) | null>()

/** Paint the disc's top face as a top-view circle of radius `r` at (c, c). */
export const paintDiscTop = (ctx: Ctx2D, c: number, r: number, rim: string) => {
  const outline = '#2a1a10'
  const wood = '#d9a86a'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.arc(c, c, r * 0.97, 0, Math.PI * 2)
  ctx.fillStyle = rim
  ctx.fill()
  ctx.lineWidth = Math.max(1, r * 0.06)
  ctx.strokeStyle = outline
  ctx.stroke()
  // plush rim stitches
  ctx.setLineDash([r * 0.07, r * 0.06])
  ctx.beginPath()
  ctx.arc(c, c, r * 0.86, 0, Math.PI * 2)
  ctx.strokeStyle = mixHex(rim, '#ffffff', 0.55)
  ctx.lineWidth = Math.max(1, r * 0.03)
  ctx.stroke()
  ctx.setLineDash([])
  // wooden top
  ctx.beginPath()
  ctx.arc(c, c, r * 0.74, 0, Math.PI * 2)
  ctx.fillStyle = wood
  ctx.fill()
  ctx.lineWidth = Math.max(1, r * 0.035)
  ctx.strokeStyle = outline
  ctx.stroke()
  // spin marks: alternating wedges + tree rings so the turn reads
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, r * 0.72, a0, a0 + Math.PI / 6)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? '#c8935a' : '#e8bd84'
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(110, 66, 30, 0.55)'
  ctx.lineWidth = Math.max(1, r * 0.025)
  for (const k of [0.25, 0.45, 0.62]) {
    ctx.beginPath()
    ctx.arc(c, c, r * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  // one bold team-colour arrow notch at the edge
  ctx.beginPath()
  ctx.moveTo(c + r * 0.74, c)
  ctx.lineTo(c + r * 0.5, c - r * 0.12)
  ctx.lineTo(c + r * 0.5, c + r * 0.12)
  ctx.closePath()
  ctx.fillStyle = rim
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(1, r * 0.025)
  ctx.stroke()
}

const discSprite = (rim: string, ppu: number) => {
  const key = `${rim}@${ppu}`
  let c = discs.get(key)
  if (c === undefined) {
    const size = Math.ceil(ppu * 2) + 4
    c = makeCanvas(size, size)
    const ctx = c ? (c.getContext('2d') as Ctx2D | null) : null
    if (c && ctx) paintDiscTop(ctx, size / 2, ppu, rim)
    else c = null
    if (discs.size > 48) discs.clear()
    discs.set(key, c)
  }
  return c
}

/**
 * Draw the turning disc: flat drop shadow → side band → rotating top face.
 * `radius` css px; `rotation` the blade's spin.
 */
export const drawSmasherDisc = (
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number, rim: string, deviceScale: number,
  shadow = true
) => {
  const sq = DISC_SQUASH
  const side = radius * DISC_THICKNESS * Math.sqrt(1 - sq * sq)
  if (shadow) {
    // flat drop shadow (no blur)
    ctx.fillStyle = 'rgba(20, 12, 6, 0.28)'
    ctx.beginPath()
    ctx.ellipse(x + radius * 0.1, y + side + radius * 0.12, radius * 1.06, radius * sq * 1.06, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // side band
  ctx.fillStyle = mixHex(rim, '#1a0e08', 0.45)
  ctx.strokeStyle = '#2a1a10'
  ctx.lineWidth = Math.max(1, radius * 0.06)
  ctx.beginPath()
  ctx.ellipse(x, y + side, radius * 0.97, radius * sq * 0.97, 0, 0, Math.PI)
  ctx.lineTo(x - radius * 0.97, y)
  ctx.ellipse(x, y, radius * 0.97, radius * sq * 0.97, 0, Math.PI, 0, true)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  const sprite = discSprite(rim, atlasBucket(radius * deviceScale))
  if (!sprite) return
  const size = sprite.width
  const ppu = (size - 4) / 2
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, sq)
  ctx.rotate(rotation)
  const k = radius / ppu
  ctx.drawImage(sprite, -size / 2 * k, -size / 2 * k, size * k, size * k)
  ctx.restore()
}

// ─── Portraits ───────────────────────────────────────────────────────────────

const PORTRAIT_PX = 192
/** Portrait yaw frame: a little turned, the classic 3/4 front. */
const PORTRAIT_FRAME = 1
const portraits = new Map<string, string>()

const fallbackPortrait = (id: SmasherId): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-smasher="${id}"><circle cx="5" cy="5" r="4" fill="#d9a86a"/></svg>`)}`

/** Cached data URL of a smasher on its disc (front 3/4), for DOM <img>s. */
export const smasherPortraitUrl = (smasherId?: SmasherId, modelId?: string, boss = false): string => {
  const id = smasherId ?? (modelId ? smasherForSkin(modelId) : 'bramble')
  const key = lookKey(id, modelId, boss)
  const hit = portraits.get(key)
  if (hit) return hit
  const c = makeCanvas(PORTRAIT_PX, PORTRAIT_PX)
  if (!c || !(c instanceof HTMLCanvasElement)) return fallbackPortrait(id)
  const ctx = c.getContext('2d')!
  // fit FRAME_BOX into the square
  const ppu = PORTRAIT_PX / Math.max(FRAME_W, FRAME_H) * 1.02
  const ox = PORTRAIT_PX / 2
  const oy = PORTRAIT_PX / 2 - ((FRAME_BOX.top + FRAME_BOX.bottom) / 2) * ppu
  drawSmasherDisc(ctx, ox, oy, ppu, 0.4, '#e0b04a', 1)
  drawSmasher(ctx, id, smasherPalette(id, modelId), frameYaw(PORTRAIT_FRAME), ox, oy, ppu, { boss })
  let url: string
  try {
    url = c.toDataURL('image/png')
  } catch {
    url = fallbackPortrait(id)
  }
  portraits.set(key, url)
  return url
}
