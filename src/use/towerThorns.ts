// ─── Spiked tree: the thorny FRONT COVER of a team tower (visual) ──────────
//
// A spiked tree (TeamTower.spiked — the rule lives in @/use/arenaTerrain:
// boss-stage trees, see TOWER_SPIKES) wears a bramble garland on its FRONT:
// the arc of its outline that faces the clearing (TOWER_FRONT_HALF_ARC each side
// of its front — the only part a smasher can reach). Drawn by the tower-body seam
// (useSpinnerGame drawTowerBody) on top of the tree, so it is baked into the
// static layer with it and re-baked only when the tower's state changes.
//
//  · procedural (always available): a dark twisted vine along the front arc
//    with cream thorns pointing outward and a few leaves — flat fills + the
//    terrain's bold outline, NO blur / gradient / glow;
//  · painted (once tools/tower-sheets/paint-queue.mjs --only thorns has run):
//    PAINTED_THORNS bramble segments laid side by side along the same arc,
//    each rotated so its UP points away from the tree. Falls back to the
//    procedural garland until the atlas loads, above its own resolution
//    (render-sharpness rule — device scale from the context transform), with
//    `?art=procedural`, in jsdom / node.
//
// Purely visual: reads the tower geometry, writes nothing.
import { PAINTED_THORNS } from '@/use/paintedThorns'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const OUTLINE = '#2c2116'
const VINE = '#5e3b22'
const VINE_LIGHT = '#86593a'
const THORN = '#f2e6c8'
const THORN_SHADE = '#c9ae84'
const LEAF = '#3f7d36'

/** Share of the front half-arc the garland covers (keeps clear of the wall). */
export const THORN_ARC_FILL = 0.94
/** Procedural thorns along the arc. */
export const THORN_COUNT = 9
/** Painted segments along the arc, and each one's half width × tower radius
 *  (tools/tower-sheets/pack-thorns.mjs sizes the atlas for 0.46 × 38). */
export const THORN_SEGMENTS = 4
export const THORN_SEG_HALF_W = 0.46
/** Above this many device px per atlas px the procedural garland is drawn. */
const MAX_UPSCALE = 1.02

let atlas: HTMLImageElement | null = null
let requested = false
let revision = 0
/** Bumps when the painted thorn atlas lands — key the static bake on it. */
export const thornArtRevision = (): number => revision

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Start loading the painted thorn atlas (no-op when absent / already asked). */
export const preloadThornArt = (): void => {
  if (requested || !PAINTED_THORNS || !artAllowed()) return
  requested = true
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    atlas = img
    revision++
  }
  img.src = prependBaseUrl(`images/towers/${PAINTED_THORNS.file}?v=${PAINTED_THORNS.v}`)
}

const drawPainted = (ctx: Ctx, r: number, front: number, half: number): boolean => {
  const meta = PAINTED_THORNS
  if (!meta || meta.segments.length === 0) return false
  preloadThornArt()
  if (!atlas) return false
  let maxHalf = 0
  for (const s of meta.segments) if (s.halfW > maxHalf) maxHalf = s.halfW
  const k = (THORN_SEG_HALF_W * r) / maxHalf
  const t = ctx.getTransform()
  if (k * (Math.hypot(t.a, t.b) || 1) > MAX_UPSCALE) return false
  const span = (2 * half) / THORN_SEGMENTS
  const rb = r * 0.96
  for (let i = 0; i < THORN_SEGMENTS; i++) {
    const s = meta.segments[i % meta.segments.length]!
    const a = front - half + (i + 0.5) * span
    ctx.save()
    ctx.translate(Math.cos(a) * rb, Math.sin(a) * rb)
    ctx.rotate(a + Math.PI / 2)
    ctx.drawImage(atlas, s.x, s.y, s.w, s.h, -s.gx * k, -s.gy * k, s.w * k, s.h * k)
    ctx.restore()
  }
  return true
}

/** One thorn: base on the vine at angle `a`, tip `len` further out. */
const thorn = (ctx: Ctx, a: number, rv: number, len: number, w: number, lw: number) => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  // Tangent (−s, c): the base runs along the vine.
  const bx = c * rv
  const by = s * rv
  const tx = c * (rv + len)
  const ty = s * (rv + len)
  ctx.fillStyle = THORN
  ctx.beginPath()
  ctx.moveTo(bx - s * w, by + c * w)
  ctx.lineTo(tx, ty)
  ctx.lineTo(bx + s * w, by - c * w)
  ctx.closePath()
  ctx.fill()
  // Hard-edged shade on one flank (light from the top-left: flat, no gradient).
  ctx.fillStyle = THORN_SHADE
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(tx, ty)
  ctx.lineTo(bx + s * w, by - c * w)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(bx - s * w, by + c * w)
  ctx.lineTo(tx, ty)
  ctx.lineTo(bx + s * w, by - c * w)
  ctx.stroke()
}

const leaf = (ctx: Ctx, a: number, rv: number, len: number, lw: number) => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const L = len
  const W = len * 0.42
  ctx.save()
  ctx.transform(c, s, -s, c, c * rv, s * rv)
  ctx.fillStyle = LEAF
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(L * 0.5, -W, L, 0)
  ctx.quadraticCurveTo(L * 0.5, W, 0, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

const drawProcedural = (ctx: Ctx, r: number, front: number, half: number) => {
  const rv = r * 0.98
  const lw = Math.max(1.4, r * 0.05)
  ctx.save()
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // Thorns first: their bases tuck under the vine.
  const step = (2 * half) / THORN_COUNT
  for (let i = 0; i < THORN_COUNT; i++) {
    const a = front - half + (i + 0.5) * step
    thorn(ctx, a, rv, r * (i % 2 === 0 ? 0.42 : 0.31), r * 0.12, lw)
  }
  // Leaves in three gaps.
  for (const i of [2, 5, 7]) {
    const a = front - half + i * step
    leaf(ctx, a + step * 0.12, rv + r * 0.05, r * 0.22, lw * 0.8)
  }
  // The vine: outline, body, a lighter top tone.
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = r * 0.23
  ctx.beginPath()
  ctx.arc(0, 0, rv, front - half, front + half)
  ctx.stroke()
  ctx.strokeStyle = VINE
  ctx.lineWidth = r * 0.15
  ctx.beginPath()
  ctx.arc(0, 0, rv, front - half, front + half)
  ctx.stroke()
  ctx.strokeStyle = VINE_LIGHT
  ctx.lineWidth = r * 0.045
  ctx.beginPath()
  ctx.arc(0, 0, rv + r * 0.025, front - half * 0.97, front + half * 0.97)
  ctx.stroke()
  // Twist marks across the vine (two strands wound together).
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = lw * 0.8
  for (let i = 1; i < THORN_COUNT; i++) {
    const a = front - half + i * step
    const c = Math.cos(a)
    const s = Math.sin(a)
    ctx.beginPath()
    ctx.moveTo(c * (rv - r * 0.06) - s * r * 0.03, s * (rv - r * 0.06) + c * r * 0.03)
    ctx.lineTo(c * (rv + r * 0.06) + s * r * 0.03, s * (rv + r * 0.06) - c * r * 0.03)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draw the spiked front cover of a tower of radius `r` whose front faces
 * `front` (radians, arena frame — towards the clearing) and spans
 * ±`halfArc` (the reachable arc). Caller has translated to the tower centre.
 */
export const drawTowerThorns = (ctx: Ctx, r: number, front: number, halfArc: number): void => {
  const half = halfArc * THORN_ARC_FILL
  if (drawPainted(ctx, r, front, half)) return
  drawProcedural(ctx, r, front, half)
}
