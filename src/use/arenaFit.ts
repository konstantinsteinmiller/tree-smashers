// ─── Arena fit: how big the board is drawn on screen ────────────────────────
//
// PRESENTATION ONLY. The simulation lives in arena units (ARENA_RADIUS 200,
// origin at the arena centre) and never reads anything from here; this module
// only picks the arena-units → css-px transform (scale + screen centre) that
// the renderer, the static-layer bake, the joystick overlay and pixelToGame
// all share. PvP stays deterministic: both peers simulate the same numbers
// whatever their screens are.
//
// The old fit was `min(w, h) / (2·R + 76)` — a circle plus uniform padding —
// which wasted the screen: the clearings are not circles, the trees set into
// the wall make the board TALLER than wide, and the HUD sits in the corners,
// not in a uniform band. The fit now:
//  · samples the ACTUAL extent of what must stay visible — the current
//    layout's outline (+ the rim and a smasher sticking out at the wall) and
//    every tower's painted tree + HP gauge (arenaFitPoints);
//  · fits those points separately on x and y into the safe area (viewport
//    minus device safe-area insets and a small edge gap), so portrait fits
//    the width tightly and landscape the height;
//  · keeps every one of those points out from under the opaque HUD rects
//    the view measures (stage badge, coins + chest, bottom button stacks,
//    stat cards …) — the corners of the screen are background and may stay
//    under HUD;
//  · may slide the board vertically (a few % of the height) when that buys
//    scale, e.g. a top bar that is taller than the bottom one.
import { shapeOutline, type ArenaShape } from '@/use/arenaShapes'

/** Arena-units margin around the outline: the log rim's outer half
 *  (borderWidth + 7 wide stroke) plus a smasher's sprite / gauge that pokes
 *  past the wall when it rests against it. */
export const FIT_OUTLINE_MARGIN = 16
/** Tower extent over its collision radius: painted tree half width
 *  (TOWER_ART_HALF_W 1.2) / half height (≈ 1.37) and the HP gauge arc
 *  (TOWER_GAUGE_R 1.42 + stroke), rounded up. */
export const FIT_TOWER_HALF_W = 1.45
export const FIT_TOWER_HALF_H = 1.5
/** Painted tree geometry over the collision radius (towerArt / paintedTowers:
 *  the healthy sprite's silhouette centre sits on the tower centre): crown
 *  top 1.37 r above it, trunk base 1.28 r below it, the face on the trunk
 *  ≈ 0.2–0.75 r below it. */
export const TREE_CROWN_TOP = 1.37
export const TREE_TRUNK_BASE = 1.28
/** Must-be-visible tree extent AWAY from the arena (the tree stands upright
 *  on both sides): the top (enemy) tree may tuck its outer crown off-screen
 *  down to 0.85 r — 0.52 r of the 1.37 r crown, 38 % —; the bottom (player)
 *  tree keeps its whole face and trunk down to 1.15 r (only the root flare
 *  may tuck). Toward the arena the HP gauge (1.42 r + stroke) always shows. */
export const FIT_TREE_OUT_TOP = 0.85
export const FIT_TREE_OUT_BOTTOM = 1.15
export const FIT_TREE_IN = 1.5
/** The tree's silhouette AWAY from the arena is narrower than its box: the
 *  player tree tapers to its trunk + root flare (≈ ±0.7 r at the trunk base,
 *  the crown's lower edge ≈ ±1.05 r at 0.45 r below the centre); the enemy
 *  tree's crown is round (≈ ±1.0 r near the tuck line). Toward the arena the
 *  HP gauge arc keeps the full box width. */
export const FIT_TREE_OUT_HALF_W = 0.62
export const FIT_TREE_OUT_TOP_HALF_W = 0.95
export const FIT_TREE_SHOULDER_X = 1.0
export const FIT_TREE_SHOULDER_Y = 0.5
/** Outline growth (arena units) that must stay clear of the opaque HUD — the
 *  screen edge still gets FIT_OUTLINE_MARGIN. The play area and the rim's
 *  inner part stay uncovered; a HUD button may overlap the rim's outer edge
 *  and the ground beyond it, never the floor a smasher stands on. */
export const FIT_HUD_OUTLINE_MARGIN = 4
/** Max share of the crown (centre → crown top) allowed off-screen. */
export const MAX_CROWN_OVERFLOW = 0.4
/** Css px between the important content and a viewport / safe-area edge. */
export const FIT_EDGE_GAP = 4
/** Css px between the important content and a HUD rect. */
export const FIT_HUD_GAP = 4

export interface FitRect { x0: number; y0: number; x1: number; y1: number }
export interface FitInsets { top: number; right: number; bottom: number; left: number }
export interface ArenaView {
  /** css px per arena unit */
  scale: number
  /** screen position (css px) of the arena origin */
  cx: number
  cy: number
}

export const legacyArenaView = (w: number, h: number): ArenaView => ({
  scale: Math.min(w, h) / (200 * 2 + 76),
  cx: w / 2,
  cy: h / 2
})

/** The points (arena units, flat x,y pairs) that must stay on screen (or,
 *  with outlineMargin = FIT_HUD_OUTLINE_MARGIN, clear of opaque HUD): the
 *  outline grown by the margin, and each tower's extent — 9 points: the box
 *  width toward the arena, the tree's tapering silhouette away from it. */
export const arenaFitPoints = (
  shape: ArenaShape, R: number, towers: readonly { x: number; y: number; radius: number }[],
  /** `full`: the whole tree box (the first content fit — kept for A/B). */
  treeMode: 'tucked' | 'full' = 'tucked',
  /** Outline growth (arena units): FIT_OUTLINE_MARGIN for the screen-edge
   *  set, FIT_HUD_OUTLINE_MARGIN for the HUD-avoid set. */
  outlineMargin = FIT_OUTLINE_MARGIN
): Float32Array => {
  const ol = shapeOutline(shape, R)
  const n = ol.length / 2
  const out = new Float32Array(ol.length + towers.length * 18)
  for (let i = 0; i < n; i++) {
    const x = ol[i * 2]!
    const y = ol[i * 2 + 1]!
    const d = Math.hypot(x, y) || 1
    // Radial growth: every clearing is star-shaped and nearly convex, and
    // the margin is small against R, so this is the outline offset to well
    // under a unit.
    out[i * 2] = x + (x / d) * outlineMargin
    out[i * 2 + 1] = y + (y / d) * outlineMargin
  }
  let k = ol.length
  for (const t of towers) {
    const hw = t.radius * FIT_TOWER_HALF_W
    // Extent up (−y) and down (+y) from the tower centre.
    let up = t.radius * FIT_TOWER_HALF_H
    let down = up
    if (treeMode === 'tucked') {
      const top = t.y < 0
      up = t.radius * (top ? FIT_TREE_OUT_TOP : FIT_TREE_IN)
      down = t.radius * (top ? FIT_TREE_IN : FIT_TREE_OUT_BOTTOM)
    }
    if (treeMode === 'full') {
      for (const [sx, sy] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0]] as const) {
        out[k++] = t.x + sx * hw
        out[k++] = t.y + (sy < 0 ? -up : sy > 0 ? down : 0)
      }
      continue
    }
    // Tucked: the full box width toward the arena (the gauge arc), the
    // tree's own tapering silhouette away from it (o = away direction).
    const r = t.radius
    const o = t.y < 0 ? -1 : 1
    const away = o < 0 ? up : down
    const toward = o < 0 ? down : up
    const awayW = (o < 0 ? FIT_TREE_OUT_TOP_HALF_W : FIT_TREE_OUT_HALF_W) * r
    for (const [px, py] of [
      [-hw, -o * toward], [0, -o * toward], [hw, -o * toward], [hw, 0], [-hw, 0],
      [FIT_TREE_SHOULDER_X * r, o * FIT_TREE_SHOULDER_Y * r], [-FIT_TREE_SHOULDER_X * r, o * FIT_TREE_SHOULDER_Y * r],
      [awayW, o * away], [-awayW, o * away]
    ] as const) {
      out[k++] = t.x + px
      out[k++] = t.y + py
    }
  }
  return out
}

/** Bounding box of the fit points (arena units). */
export const fitPointsBounds = (pts: Float32Array): FitRect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!, y = pts[i + 1]!
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

const fits = (
  pts: Float32Array, s: number, cx: number, cy: number, safe: FitRect, avoid: readonly FitRect[],
  hudPts: Float32Array = pts
): boolean => {
  for (let i = 0; i < pts.length; i += 2) {
    const px = cx + pts[i]! * s
    const py = cy + pts[i + 1]! * s
    if (px < safe.x0 || px > safe.x1 || py < safe.y0 || py > safe.y1) return false
  }
  for (let i = 0; i < hudPts.length; i += 2) {
    const px = cx + hudPts[i]! * s
    const py = cy + hudPts[i + 1]! * s
    for (let j = 0; j < avoid.length; j++) {
      const r = avoid[j]!
      if (px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1) return false
    }
  }
  return true
}

/** Largest scale (and vertical slide) that keeps every fit point inside the
 *  safe area and outside every HUD rect. Horizontal centre = the safe
 *  area's centre, offset by the extent's own lean. */
export const fitArenaView = (
  w: number, h: number, pts: Float32Array,
  insets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 },
  hud: readonly FitRect[] = [],
  /** Scale ceiling (css px per unit) — e.g. the painted trees' native
   *  resolution on this display (towerArtMaxScale). */
  maxScale = Infinity,
  /** The points that must stay clear of the HUD rects (default: `pts`) —
   *  arenaFitPoints(…, FIT_HUD_OUTLINE_MARGIN): the rim's outer edge may
   *  pass under a corner button, the play area and the trees may not. */
  hudPts: Float32Array = pts
): ArenaView => {
  const safe: FitRect = {
    x0: insets.left + FIT_EDGE_GAP,
    y0: insets.top + FIT_EDGE_GAP,
    x1: w - insets.right - FIT_EDGE_GAP,
    y1: h - insets.bottom - FIT_EDGE_GAP
  }
  const avoid = hud
    .filter(r => r.x1 > r.x0 && r.y1 > r.y0)
    .map(r => ({ x0: r.x0 - FIT_HUD_GAP, y0: r.y0 - FIT_HUD_GAP, x1: r.x1 + FIT_HUD_GAP, y1: r.y1 + FIT_HUD_GAP }))
  const b = fitPointsBounds(pts)
  const sw = Math.max(1, safe.x1 - safe.x0)
  const sh = Math.max(1, safe.y1 - safe.y0)
  const midX = (safe.x0 + safe.x1) / 2
  const midY = (safe.y0 + safe.y1) / 2
  // Upper bound: the extent fitted into the safe box on each axis, centred.
  const sMax = Math.min(sw / (b.x1 - b.x0), sh / (b.y1 - b.y0), maxScale)
  // Some clearings lean (cos θ harmonics): centre the extent, not the origin.
  const xMid = (b.x0 + b.x1) / 2
  const cxOf0 = (s: number) => midX - xMid * s
  // Candidates: centred on the extent's own middle, then slides — vertical
  // (8 % of the height) and horizontal (8 % of the width: a corner HUD stack
  // on one side only, or a tree's trunk between two bottom stacks).
  const yMid = (b.y0 + b.y1) / 2
  let best: ArenaView = { scale: 0, cx: midX, cy: midY }
  const SLIDES = 12
  const SLIDES_X = 6
  const stepOf = (k: number) => (k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2))
  for (let kx = 0; kx <= SLIDES_X * 2; kx++) for (let k = 0; k <= SLIDES * 2; k++) {
    const dxPx = (stepOf(kx) / SLIDES_X) * 0.08 * w
    const dyPx = (stepOf(k) / SLIDES) * 0.08 * h
    const cxOf = (s: number) => cxOf0(s) + dxPx
    let lo = 0
    let hi = sMax
    const cyOf = (s: number) => midY + dyPx - yMid * s
    // Only a candidate that beats the best by > 0.2 % is worth a search.
    if (best.scale > 0) {
      const s0 = best.scale * 1.002
      if (s0 >= sMax || !fits(pts, s0, cxOf(s0), cyOf(s0), safe, avoid, hudPts)) continue
      lo = s0
    }
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      if (fits(pts, m, cxOf(m), cyOf(m), safe, avoid, hudPts)) lo = m
      else hi = m
    }
    if (lo > 0 && lo >= best.scale * 1.002) best = { scale: lo, cx: cxOf(lo), cy: cyOf(lo) }
  }
  if (best.scale <= 0) {
    // Nothing fits clear of the HUD (tiny viewport) — fall back to fitting
    // the safe area alone, HUD ignored.
    const s = sMax
    return { scale: s, cx: cxOf0(s), cy: midY - yMid * s }
  }
  return best
}

/** Fill ratio on the limiting axis: content extent (px) over the safe area. */
export const fillRatio = (
  view: ArenaView, pts: Float32Array, w: number, h: number,
  insets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 }
): { x: number; y: number; limiting: number } => {
  const b = fitPointsBounds(pts)
  const x = ((b.x1 - b.x0) * view.scale) / (w - insets.left - insets.right)
  const y = ((b.y1 - b.y0) * view.scale) / (h - insets.top - insets.bottom)
  return { x, y, limiting: Math.max(x, y) }
}
