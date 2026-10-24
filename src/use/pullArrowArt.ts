// ─── The three orbiting "this smasher is yours / pull it" arrows ─────────────
//
// Was a bare yellow triangle with a 1 px black stroke — out of the game's art style. Now
// an ornamented arrowhead in the toy-UI language: a chunky navy outline, a gold head with a
// light top band and a darker underside, two curled green leaf wings at the back and a berry
// gem in the middle. The painted sprite (tools/pull-arrow → PAINTED_PULL_ARROW) replaces it
// once packed and loaded; never drawn above its own resolution.
import { PAINTED_PULL_ARROW } from '@/use/paintedPullArrow'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const INK = '#161a40'
let img: HTMLImageElement | null = null
let asked = false

const allowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Start loading the painted arrow (no-op when absent / asked). */
export const preloadPullArrow = (): void => {
  if (asked || !PAINTED_PULL_ARROW || !allowed()) return
  asked = true
  const el = new Image()
  el.decoding = 'async'
  el.onload = () => { img = el }
  el.src = prependBaseUrl(`images/ui/${PAINTED_PULL_ARROW.file}?v=${PAINTED_PULL_ARROW.v}`)
}

/**
 * Draw one arrow whose TIP points along `dir` (radians), centred on (x, y),
 * `size` arena units from centre to tip.
 */
export const drawPullArrow = (ctx: Ctx, x: number, y: number, dir: number, size: number): void => {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(dir)
  const p = PAINTED_PULL_ARROW
  if (p) {
    preloadPullArrow()
    const t = ctx.getTransform()
    const deviceScale = Math.hypot(t.a, t.b) || 1
    const h = size * 2.3
    const w = h * (p.w / p.h)
    if (img && h * deviceScale <= p.h) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      ctx.restore()
      return
    }
  }
  const s = size
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // leaf wings (behind the head), curling back from the shoulders
  for (const side of [-1, 1] as const) {
    ctx.beginPath()
    ctx.moveTo(-s * 0.1, side * s * 0.35)
    ctx.quadraticCurveTo(-s * 0.95, side * s * 1.25, -s * 1.15, side * s * 0.45)
    ctx.quadraticCurveTo(-s * 0.7, side * s * 0.55, -s * 0.1, side * s * 0.35)
    ctx.closePath()
    ctx.fillStyle = '#5cc85a'
    ctx.strokeStyle = INK
    ctx.lineWidth = Math.max(1.4, s * 0.2)
    ctx.stroke()
    ctx.fill()
  }
  // the arrowhead: a chunky rounded kite, tip forward
  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.lineTo(-s * 0.55, s * 0.78)
  ctx.quadraticCurveTo(-s * 0.3, 0, -s * 0.55, -s * 0.78)
  ctx.closePath()
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1.8, s * 0.3)
  ctx.stroke()
  ctx.fillStyle = '#ffc93c'
  ctx.fill()
  // light band along the upper edge, darker underside
  ctx.beginPath()
  ctx.moveTo(s * 0.86, -s * 0.04)
  ctx.lineTo(-s * 0.4, -s * 0.62)
  ctx.lineTo(-s * 0.26, -s * 0.16)
  ctx.closePath()
  ctx.fillStyle = '#ffe98a'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(s * 0.86, s * 0.04)
  ctx.lineTo(-s * 0.4, s * 0.62)
  ctx.lineTo(-s * 0.26, s * 0.12)
  ctx.closePath()
  ctx.fillStyle = '#e89a1c'
  ctx.fill()
  // the berry gem
  ctx.beginPath()
  ctx.arc(s * 0.05, 0, s * 0.27, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.beginPath()
  ctx.arc(s * 0.05, 0, s * 0.19, 0, Math.PI * 2)
  ctx.fillStyle = '#e8456b'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(s * 0.0, -s * 0.07, s * 0.06, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
}
