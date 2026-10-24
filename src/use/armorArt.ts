// ─── Painted directional armour (art override) ──────────────────────────────
//
// drawArmorArcs (useSpinnerGame) draws a reinforced plate / a weak cloth patch
// as a ±60° arc on the disc rim. With PAINTED_ARMOR (tools/armor-art) the arc
// is laid from painted tiles instead: n tiles placed tangentially along the
// arc, each overlapping the next by 6 % in one fixed order (left to right), so
// nothing flickers or doubles. Per arc the vector drawing stays the fallback:
//  - until the strip has loaded (lazy: the first armoured blade asks for it);
//  - when a tile would be drawn ABOVE its own resolution (render-sharpness
//    rule: the device scale is read from the context transform);
//  - with `?art=procedural` (A/B), in jsdom / node.
import { PAINTED_ARMOR, type PaintedArmor } from '@/use/paintedArmor'
import { PAINTED_BULWARK } from '@/use/paintedBulwark'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type ArmorTile = 'plate' | 'patch'

// The tank BULWARK (tools/armor-art/pack-bulwark.mjs): one more tile strip with
// its own registry, laid by the same drawArmorTiles as the blade plate.
let bulwarkImg: HTMLImageElement | null = null
let bulwarkAsked = false

export const bulwarkTilesImage = (): HTMLImageElement | null => {
  if (bulwarkImg || bulwarkAsked) return bulwarkImg
  bulwarkAsked = true
  const meta = PAINTED_BULWARK
  if (!meta || !allowed()) return null
  const el = new Image()
  el.decoding = 'async'
  el.onload = () => { bulwarkImg = el }
  el.src = prependBaseUrl(`images/vfx/${meta.file}?v=${meta.v}`)
  return null
}

let img: HTMLImageElement | null = null
let asked = false

const allowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** The loaded tile strip, or null (not painted / loading / failed / procedural). */
export const armorTilesImage = (): HTMLImageElement | null => {
  if (img || asked) return img
  asked = true
  const meta = PAINTED_ARMOR
  if (!meta || !allowed()) return null
  const el = new Image()
  el.decoding = 'async'
  el.onload = () => { img = el }
  el.src = prependBaseUrl(`images/vfx/${meta.file}?v=${meta.v}`)
  return null
}

/**
 * Lay the arc a0 → a1 at ring radius `ringR` from `tile`s `band` units tall
 * (caller has translated to the disc centre). Returns false → the caller
 * draws the vector arc. Exported for tests.
 */
export const drawArmorTiles = (
  ctx: Ctx, strip: CanvasImageSource, meta: PaintedArmor, tile: ArmorTile,
  ringR: number, band: number, a0: number, a1: number
): boolean => {
  const [sx, sy, sw, sh] = meta[tile]
  const t = ctx.getTransform()
  const deviceScale = Math.hypot(t.a, t.b) || 1
  if (band * deviceScale > sh || band <= 0 || ringR <= 0) return false
  const span = a1 - a0
  const len = band * (sw / sh)
  const n = Math.max(2, Math.round((ringR * span) / len))
  const step = span / n
  const drawLen = ringR * step * 1.06
  for (let j = 0; j < n; j++) {
    ctx.save()
    ctx.rotate(a0 + step * (j + 0.5))
    ctx.translate(ringR, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(strip, sx, sy, sw, sh, -drawLen / 2, -band / 2, drawLen, band)
    ctx.restore()
  }
  return true
}
