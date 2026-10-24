// ─── #UX3 painted balloon HP art: atlas loader + sprite draw (visual only) ──
//
// The balloons (@/use/balloonHp) and their pop burst (@/use/balloonPopFx)
// draw painted sprites once tools/balloon-sheets/pack.mjs has packed the two
// Art Desk sheets (party balloons full + partly deflated, and pop debris:
// torn rubber scraps + burst stars) into PAINTED_BALLOONS. The procedural
// shapes stay the fallback: until the atlas loads, with `?art=procedural`, in
// jsdom / node, and per sprite whenever it would be stretched past
// BALLOON_ART_MAX_UPSCALE device px per atlas px (render-sharpness rule — the
// atlas is sized for the largest balloon at ~3.2 device px per arena unit,
// i.e. a 3× phone, and never upscaled).
//
// Purely visual: no gameplay state, no RNG, never in the PvP hash.
import { PAINTED_BALLOONS, type PaintedBalloonAtlas, type PaintedBalloonSprite } from '@/use/paintedBalloons'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Above this many device px per atlas px a sprite is drawn procedurally. */
export const BALLOON_ART_MAX_UPSCALE = 1.02

let atlas: HTMLImageElement | null = null
let requested = false
/** Test seam: the registry the draw helpers read (the generated one by default). */
let sprites: PaintedBalloonAtlas | null = PAINTED_BALLOONS

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Start loading the painted balloon atlas (no-op when absent / already asked). */
export const preloadBalloonArt = (): void => {
  if (requested || !sprites || !artAllowed()) return
  requested = true
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => { atlas = img }
  img.src = prependBaseUrl(`images/balloons/${sprites.file}?v=${sprites.v}`)
}

/** The loaded atlas, or null (draw procedurally). Kicks off the load lazily. */
export const balloonAtlas = (): CanvasImageSource | null => {
  if (!atlas) preloadBalloonArt()
  return atlas
}

/** The packed sprite registry (null until the sheets are painted + packed). */
export const balloonSprites = (): PaintedBalloonAtlas | null => sprites

/** Tests only: swap the registry + a fake loaded atlas in (null = restore). */
export const __setBalloonArtForTest = (reg: PaintedBalloonAtlas | null, img: CanvasImageSource | null): void => {
  sprites = reg
  atlas = img as HTMLImageElement | null
  requested = img !== null
}

/** Variant `v` of `list` (deterministic: v is a slot / pool index). */
export const pickBalloonSprite = (list: readonly PaintedBalloonSprite[] | undefined, v: number): PaintedBalloonSprite | null =>
  !list || list.length === 0 ? null : list[((v % list.length) + list.length) % list.length]!

/** Would drawing `s` with its long side `len` arena units long at device
 *  scale `dev` stretch it past the sharpness limit? */
export const balloonSpriteTooSmall = (s: PaintedBalloonSprite, len: number, dev: number, long = Math.max(s.w, s.h)): boolean =>
  len * dev > long * BALLOON_ART_MAX_UPSCALE

/**
 * Draw an UPRIGHT sprite (balloon) with its bottom-centre at (cx, bottom),
 * `height` arena units tall, width by its aspect × `sx` (squash). Returns
 * false (nothing drawn) when that would upscale it — draw procedurally then.
 */
export const drawUprightSprite = (
  ctx: Ctx, img: CanvasImageSource, s: PaintedBalloonSprite, cx: number, bottom: number, height: number, dev: number, sx = 1
): boolean => {
  if (balloonSpriteTooSmall(s, height * Math.max(1, sx), dev, s.h)) return false
  const w = (height * s.w) / s.h * sx
  ctx.drawImage(img, s.x, s.y, s.w, s.h, cx - w / 2, bottom - height, w, height)
  return true
}

/**
 * Draw sprite `s` centred on (0, 0) of the CURRENT transform with its x axis
 * `len` units long and its height by aspect × `sy` (flip-flutter). Returns
 * false when that would upscale it.
 */
export const drawCentredSprite = (
  ctx: Ctx, img: CanvasImageSource, s: PaintedBalloonSprite, len: number, dev: number, sy = 1
): boolean => {
  if (balloonSpriteTooSmall(s, len, dev, s.w)) return false
  const h = (len * s.h) / s.w * sy
  ctx.drawImage(img, s.x, s.y, s.w, s.h, -len / 2, -h / 2, len, h)
  return true
}
