// ─── Painted tree-hit VFX: atlas loader + sprite draw (visual only) ────────
//
// The splinter burst and leaf cascade of @/use/towerHitFx draw one painted
// sprite per particle once tools/tower-sheets/pack-hitfx.mjs has packed the
// two Art Desk sheets (wood chips / bark flecks / sawdust puffs, and leaves)
// into PAINTED_HIT_FX. The procedural shapes stay the fallback: until the
// atlas loads, with `?art=procedural`, in jsdom / node, and per particle
// whenever its sprite would be stretched past MAX_UPSCALE device px per atlas
// px (render-sharpness rule — the atlas is sized for the largest particle at
// ~3.2 device px per arena unit, i.e. a 3× phone).
//
// Purely visual: no gameplay state, no RNG, never in the PvP hash.
import { PAINTED_HIT_FX, type PaintedHitFxSprite } from '@/use/paintedHitFx'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Painted sawdust puff width × the procedural disc's diameter: the painted
 *  puff is round where the procedural one is a flat (0.6) ellipse, so this
 *  keeps about the same footprint (tools/tower-sheets/pack-hitfx.mjs sizes
 *  the puffs for it). */
export const HIT_FX_PUFF_W = 0.8
/** Above this many device px per atlas px a particle is drawn procedurally. */
export const HIT_FX_MAX_UPSCALE = 1.02

let atlas: HTMLImageElement | null = null
let requested = false

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Start loading the painted hit-VFX atlas (no-op when absent / already asked). */
export const preloadHitFxArt = (): void => {
  if (requested || !PAINTED_HIT_FX || !artAllowed()) return
  requested = true
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => { atlas = img }
  img.src = prependBaseUrl(`images/towers/${PAINTED_HIT_FX.file}?v=${PAINTED_HIT_FX.v}`)
}

/** The loaded atlas, or null (draw procedurally). Kicks off the load lazily. */
export const hitFxAtlas = (): HTMLImageElement | null => {
  if (!atlas) preloadHitFxArt()
  return atlas
}

/** The packed sprite registry (null until the sheets are painted + packed). */
export const hitFxSprites = PAINTED_HIT_FX

/** Variant `v` of `list` (deterministic: v is the particle's spawn pool slot). */
export const pickHitFxSprite = (list: readonly PaintedHitFxSprite[], v: number): PaintedHitFxSprite | null =>
  list.length === 0 ? null : list[v % list.length]!

/**
 * Draw sprite `s` centred on (cx, cy) in the current transform, its long axis
 * (x) `len` arena units long and its height following the sprite's aspect.
 * Returns false (nothing drawn) when that would stretch the sprite past
 * HIT_FX_MAX_UPSCALE at device scale `dev` — draw the procedural shape then.
 */
export const drawHitFxSprite = (ctx: Ctx, img: HTMLImageElement, s: PaintedHitFxSprite, cx: number, cy: number, len: number, dev: number): boolean => {
  if (len * dev > s.w * HIT_FX_MAX_UPSCALE) return false
  const h = (len * s.h) / s.w
  ctx.drawImage(img, s.x, s.y, s.w, s.h, cx - len / 2, cy - h / 2, len, h)
  return true
}
