// ─── Arena geometry ────────────────────────────────────────────────────────
//
// The battle arena was historically a hard circle (centre origin, radius
// ARENA_RADIUS). This module generalises the boundary to several shapes so a
// match can be staged in a non-circular arena where the walls
// actually change how blades ricochet.
//
// Everything here is PURE (no Vue, no canvas state beyond the path tracer) and
// works in arena-local coordinates centred at the origin. Each shape is
// inscribed within the bounding circle of radius `R` (= ARENA_RADIUS at the
// call sites), so the existing camera fit — which frames `2R + padding` — needs
// no changes whatever shape is active.
//
// The single source of truth for every shape is its signed distance function
// (`sdf`, negative inside, 0 on the boundary, positive outside). Collision
// response, placement clamping and inside-tests are all derived from it, and
// outward normals come from the SDF gradient (finite differences) so one
// implementation covers all shapes uniformly.

/** Parametric forest clearing (see CLEARING_SPECS), one per terrain layout ≥ 3. */
export type ClearingShape = `clearing${number}`
export type ArenaShape = 'circle' | 'oval' | 'hexagon' | 'diamond' | 'roundedRect' | 'clover' | 'squircle' | 'roundHex' | ClearingShape

/** All shapes including the classic circle. */
export const ARENA_SHAPES: ArenaShape[] = ['circle', 'oval', 'hexagon', 'diamond', 'roundedRect']
/** The non-circular shapes. */
export const NON_CIRCLE_SHAPES: ArenaShape[] = ['oval', 'hexagon', 'diamond', 'roundedRect', 'clover', 'squircle', 'roundHex']

// Shape proportions, expressed as fractions of the bounding radius R.
const OVAL_RY_RATIO = 0.72
const RRECT_HX_RATIO = 0.96
const RRECT_HY_RATIO = 0.70
const RRECT_CR_RATIO = 0.26

export interface WallHit {
  /** Outward unit normal at the contact point. */
  nx: number
  ny: number
  /** Where to place the blade centre so it sits just inside the wall. */
  clampX: number
  clampY: number
}

// ─── Signed distance functions ──────────────────────────────────────────────

const circleSdf = (x: number, y: number, R: number): number => Math.hypot(x, y) - R

// First-order ellipse distance estimate g/|∇g| — accurate near the boundary,
// which is exactly where collisions resolve.
const ovalSdf = (x: number, y: number, R: number): number => {
  const rx = R
  const ry = R * OVAL_RY_RATIO
  const g = (x * x) / (rx * rx) + (y * y) / (ry * ry) - 1
  const gx = (2 * x) / (rx * rx)
  const gy = (2 * y) / (ry * ry)
  const gl = Math.hypot(gx, gy)
  return gl < 1e-9 ? -Math.min(rx, ry) : g / gl
}

// Flat-top regular hexagon, circumradius R (vertices at k·60°). Convex
// max-of-half-planes SDF: apothem = R·cos(30°), edge normals at 30° + k·60°.
const hexSdf = (x: number, y: number, R: number): number => {
  const apothem = R * Math.cos(Math.PI / 6)
  let m = -Infinity
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3
    m = Math.max(m, x * Math.cos(a) + y * Math.sin(a) - apothem)
  }
  return m
}

// Rhombus with vertices on the axes at ±R: |x| + |y| ≤ R. |∇(|x|+|y|)| = √2.
const diamondSdf = (x: number, y: number, R: number): number =>
  (Math.abs(x) + Math.abs(y) - R) / Math.SQRT2

// Rounded rectangle (analytic SDF).
const roundedRectSdf = (x: number, y: number, R: number): number => {
  const hx = R * RRECT_HX_RATIO
  const hy = R * RRECT_HY_RATIO
  const cr = R * RRECT_CR_RATIO
  const qx = Math.abs(x) - hx + cr
  const qy = Math.abs(y) - hy + cr
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - cr
}

// Clover: polar r(θ) = R(0.86 − 0.055·cos 4θ) — four lobes on the diagonals
// (where the spawn rows sit), pinched on the axes (where the towers are set). Distance ≈ (|p| − r)·r/√(r² + r'²).
const CLOVER_BASE = 0.86
const CLOVER_AMP = 0.055
const cloverSdf = (x: number, y: number, R: number): number => {
  const d = Math.hypot(x, y)
  const t = Math.atan2(y, x)
  const r = R * (CLOVER_BASE - CLOVER_AMP * Math.cos(4 * t))
  const dr = 4 * R * CLOVER_AMP * Math.sin(4 * t)
  return (d - r) * r / Math.hypot(r, dr)
}

// Squircle rotated 45° (rounded diamond): |u|⁴ + |v|⁴ = a⁴ in the diagonal
// frame, a = R / 2^¼ so the tips on the axes touch R. First-order distance.
const SQ_A = 1 / Math.pow(2, 0.25)
const squircleSdf = (x: number, y: number, R: number): number => {
  const a = R * SQ_A
  const u = (x + y) / Math.SQRT2
  const v = (y - x) / Math.SQRT2
  const g = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25) - a
  // ∇ of the 4-norm has length ≤ 1 and ≥ 2^-¼; normalise for a true-ish distance.
  const n = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.75) || 1
  const gu = (u * u * u) / n
  const gv = (v * v * v) / n
  return g / (Math.hypot(gu, gv) || 1)
}

// Pointy-top hexagon (vertices on the y axis) with rounded corners: exact
// hexagon SDF of circumradius R − k, rotated 30°, minus the rounding k.
const HEX_ROUND = 0.16
const roundHexSdf = (x: number, y: number, R: number): number => {
  const k = R * HEX_ROUND
  const c = Math.cos(Math.PI / 6)
  const sn = Math.sin(Math.PI / 6)
  return hexSdf(x * c + y * sn, -x * sn + y * c, R - k / c) - k
}

// ── Organic wobble ───────────────────────────────────────────────────────
// The clearings are deliberately NOT perfectly regular: each base shape is
// warped by a radial factor w(θ) = 1 + Σ a·cos(kθ + 0). Cosine-only terms keep
// the arena mirror-symmetric top ↔ bottom (both teams get an equally fair half
// and the PvP guest's flipped view is the same arena), while the odd k break
// the left ↔ right symmetry and the mixed k break the 4-/6-fold regularity.
// The base is shrunk by 1 / max w so the warped outline stays inside R (the
// camera fit frames the R circle in both orientations).
export type Wobble = readonly (readonly [k: number, amp: number])[]
const WOBBLE: Record<'clover' | 'squircle' | 'roundHex', Wobble> = {
  clover: [[1, 0.03], [3, -0.035], [5, 0.025], [7, 0.015]],
  squircle: [[1, -0.05], [2, 0.03], [3, 0.015], [5, -0.02], [9, 0.012]],
  roundHex: [[1, 0.02], [3, 0.04], [4, -0.025], [7, 0.018]]
}
const wobbleAt = (w: Wobble, t: number): number => {
  let v = 1
  for (const [k, a] of w) v += a * Math.cos(k * t)
  return v
}
const wobbleMax = new Map<Wobble, number>()
const maxWobble = (w: Wobble): number => {
  let m = wobbleMax.get(w)
  if (m === undefined) {
    m = 0
    for (let i = 0; i < 720; i++) m = Math.max(m, wobbleAt(w, (i / 720) * Math.PI * 2))
    wobbleMax.set(w, m)
  }
  return m
}
const organicSdf = (
  base: (x: number, y: number, R: number) => number, w: Wobble, x: number, y: number, R: number
): number => {
  const f = wobbleAt(w, Math.atan2(y, x)) / maxWobble(w)
  return base(x / f, y / f, R) * f
}

// ── Parametric clearings ─────────────────────────────────────────────────
// Layouts 3+ are DATA: a base kind warped by a cosine-only harmonic table
// (cos kθ keeps top ↔ bottom mirror symmetry — fairness + the PvP guest's
// flipped view), normalised by max w so the outline stays inside R.
//  · 'round' — pure polar star r(θ) = R·w(θ)/max w, distance
//              (|p| − r)·r/√(r² + r'²) (accurate near the wall);
//  · 'clover' / 'squircle' / 'roundHex' — the legacy base SDFs, warped.
export type ClearingBase = 'round' | 'clover' | 'squircle' | 'roundHex'
export interface ClearingSpec {
  base: ClearingBase
  harmonics: Wobble
  /** Short descriptor (QA / contact sheet). */
  label: string
}

/** One spec per terrain layout id 3..49 (key = layout id; 0..2 are the
 *  legacy named shapes with their own wobble). */
export const CLEARING_SPECS: Readonly<Record<number, ClearingSpec>> = {
  3: { base: 'round', label: 'trefoil', harmonics: [[3, 0.07], [1, 0.03], [6, 0.012]] },
  4: { base: 'round', label: 'scalloped ring', harmonics: [[8, 0.03], [2, 0.05], [1, -0.02]] },
  5: { base: 'round', label: 'wide bean', harmonics: [[2, 0.09], [1, 0.05], [3, -0.025]] },
  6: { base: 'round', label: 'lily-pad notch', harmonics: [[1, -0.06], [2, 0.05], [12, 0.012], [3, 0.02]] },
  7: { base: 'round', label: 'tall capsule', harmonics: [[2, -0.07], [4, -0.025], [1, 0.02]] },
  8: { base: 'squircle', label: 'bramble diamond', harmonics: [[1, 0.03], [5, 0.025], [10, 0.012]] },
  9: { base: 'round', label: 'pinched peanut', harmonics: [[2, 0.11], [4, 0.04], [1, 0.02]] },
  10: { base: 'roundHex', label: 'pine-cone hex', harmonics: [[1, -0.04], [2, -0.03], [5, 0.02]] },
  11: { base: 'round', label: 'six-lobe honeycomb', harmonics: [[6, 0.035], [2, 0.04], [1, 0.02]] },
  12: { base: 'round', label: 'snow-drift egg', harmonics: [[1, 0.07], [2, 0.04], [5, 0.015]] },
  13: { base: 'clover', label: 'leaning clover', harmonics: [[1, 0.05], [2, -0.03], [3, -0.02]] },
  14: { base: 'round', label: 'pentagon', harmonics: [[5, 0.05], [2, 0.03], [1, -0.02]] },
  15: { base: 'round', label: 'bell', harmonics: [[1, 0.05], [3, -0.04], [2, 0.03], [7, 0.01]] },
  16: { base: 'round', label: 'meadow oval', harmonics: [[2, 0.06], [4, -0.02], [6, 0.015], [1, -0.03]] },
  17: { base: 'roundHex', label: 'spiky hex', harmonics: [[1, 0.02], [9, 0.018], [2, 0.03]] },
  18: { base: 'round', label: 'willow bend', harmonics: [[1, 0.06], [2, 0.06], [3, 0.03]] },
  19: { base: 'squircle', label: 'kite', harmonics: [[1, -0.05], [3, 0.03], [2, 0.03]] },
  20: { base: 'round', label: 'seven-lobe berry', harmonics: [[7, 0.03], [2, 0.03], [1, 0.03]] },
  21: { base: 'round', label: 'curled tail', harmonics: [[1, -0.07], [2, 0.03], [4, 0.025], [3, 0.02]] },
  22: { base: 'roundHex', label: 'boulder hex', harmonics: [[3, 0.045], [1, -0.03], [6, 0.012]] },
  23: { base: 'clover', label: 'cross clover', harmonics: [[2, -0.04], [6, 0.015], [1, 0.02]] },
  24: { base: 'round', label: 'toadstool cap', harmonics: [[1, -0.04], [2, 0.07], [3, -0.03], [4, 0.02]] },
  25: { base: 'round', label: 'river bank', harmonics: [[2, 0.1], [3, 0.03], [5, -0.015], [1, 0.03]] },
  26: { base: 'round', label: 'teardrop', harmonics: [[1, 0.08], [3, 0.025], [2, -0.02]] },
  27: { base: 'squircle', label: 'tilted lozenge', harmonics: [[1, 0.06], [2, -0.03], [4, 0.02]] },
  28: { base: 'round', label: 'thistle star', harmonics: [[5, 0.035], [10, 0.012], [1, 0.03], [2, 0.02]] },
  29: { base: 'round', label: 'root lobes', harmonics: [[4, 0.05], [1, 0.03], [3, 0.03]] },
  30: { base: 'round', label: 'long puddle', harmonics: [[2, 0.08], [6, 0.02], [1, -0.04]] },
  31: { base: 'roundHex', label: 'stretched hex', harmonics: [[2, 0.05], [1, 0.03], [4, -0.02]] },
  32: { base: 'round', label: 'maple leaf', harmonics: [[3, 0.05], [5, 0.025], [1, 0.03], [2, 0.02]] },
  33: { base: 'round', label: 'kidney', harmonics: [[1, -0.08], [2, 0.06], [3, 0.03]] },
  34: { base: 'clover', label: 'warren clover', harmonics: [[1, -0.04], [3, 0.03], [5, -0.02]] },
  35: { base: 'round', label: 'daisy petals', harmonics: [[9, 0.022], [2, 0.03], [1, 0.02]] },
  36: { base: 'round', label: 'cloud', harmonics: [[4, 0.035], [7, 0.02], [1, 0.03], [2, 0.03]] },
  37: { base: 'squircle', label: 'wide lozenge', harmonics: [[2, 0.05], [1, 0.03], [6, 0.012]] },
  38: { base: 'round', label: 'brook bend', harmonics: [[1, 0.05], [2, 0.08], [4, 0.025], [5, 0.01]] },
  39: { base: 'roundHex', label: 'chestnut hex', harmonics: [[1, 0.05], [3, -0.03], [2, 0.025]] },
  40: { base: 'round', label: 'crescent', harmonics: [[1, -0.09], [2, 0.04], [3, 0.035], [4, 0.015]] },
  41: { base: 'round', label: 'dandelion puff', harmonics: [[11, 0.016], [3, 0.03], [1, 0.02]] },
  42: { base: 'round', label: 'birch capsule', harmonics: [[2, -0.06], [6, 0.018], [1, 0.03]] },
  43: { base: 'clover', label: 'nest clover', harmonics: [[2, -0.035], [1, 0.03], [8, 0.008]] },
  44: { base: 'round', label: 'four lobes', harmonics: [[4, 0.04], [2, 0.05], [1, -0.03]] },
  45: { base: 'round', label: 'creek bean', harmonics: [[2, 0.09], [1, 0.04], [7, 0.012], [3, 0.02]] },
  46: { base: 'roundHex', label: 'den hex', harmonics: [[1, -0.05], [2, 0.04], [3, 0.03]] },
  47: { base: 'round', label: 'sap drop', harmonics: [[1, 0.09], [2, 0.02], [4, 0.015]] },
  48: { base: 'round', label: 'rainbow arch', harmonics: [[1, 0.06], [2, 0.07], [3, -0.02], [5, 0.012]] },
  49: { base: 'squircle', label: 'ancient grove', harmonics: [[1, 0.04], [4, -0.02], [7, 0.01], [2, 0.02]] }
}

/** Tree Smashers forest clearings, one per terrain layout (arenaTerrain.ts):
 *  0 Mossy Glade = clover, 1 Mud Hollow = rounded diamond, 2 Twin Islands =
 *  rounded hex, 3..49 = CLEARING_SPECS. All mirror-symmetric in y. */
export const TERRAIN_SHAPES: readonly ArenaShape[] = [
  'clover', 'squircle', 'roundHex',
  ...Object.keys(CLEARING_SPECS).map(k => `clearing${k}` as ClearingShape)
]

const clearingSpecOf = (shape: string): ClearingSpec | undefined => CLEARING_SPECS[+shape.slice(8)]

const wobbleDeriv = (w: Wobble, t: number): number => {
  let v = 0
  for (const [k, a] of w) v -= a * k * Math.sin(k * t)
  return v
}

const polarSdf = (w: Wobble, x: number, y: number, R: number): number => {
  const d = Math.hypot(x, y)
  const t = Math.atan2(y, x)
  const s = R / maxWobble(w)
  const r = s * wobbleAt(w, t)
  const dr = s * wobbleDeriv(w, t)
  return (d - r) * r / Math.hypot(r, dr)
}

const BASE_SDF: Record<Exclude<ClearingBase, 'round'>, (x: number, y: number, R: number) => number> = {
  clover: (x, y, R) => cloverSdf(x, y, R),
  squircle: (x, y, R) => squircleSdf(x, y, R),
  roundHex: (x, y, R) => roundHexSdf(x, y, R)
}

const clearingSdf = (spec: ClearingSpec, x: number, y: number, R: number): number =>
  spec.base === 'round' ? polarSdf(spec.harmonics, x, y, R) : organicSdf(BASE_SDF[spec.base], spec.harmonics, x, y, R)

/** True for shapes drawn from their sampled outline (no analytic path). */
export const isOutlineShape = (shape: ArenaShape): boolean =>
  shape === 'clover' || shape === 'squircle' || shape === 'roundHex' || shape.startsWith('clearing')

/** Signed distance to the arena boundary (negative inside).
 *  The forest clearings are evaluated at |y|: they are mirror-symmetric in
 *  theory, and this makes them BITWISE symmetric too (a rotated-hexagon SDF
 *  is not), so a PvP guest's y-flipped wall hits match the host's exactly. */
export const sdf = (shape: ArenaShape, x: number, y: number, R: number): number => {
  if (shape.startsWith('clearing')) {
    const spec = clearingSpecOf(shape)
    if (spec !== undefined) return clearingSdf(spec, x, Math.abs(y), R)
  }
  switch (shape) {
    case 'oval':
      return ovalSdf(x, y, R)
    case 'hexagon':
      return hexSdf(x, y, R)
    case 'diamond':
      return diamondSdf(x, y, R)
    case 'roundedRect':
      return roundedRectSdf(x, y, R)
    case 'clover':
      return organicSdf(cloverSdf, WOBBLE.clover, x, Math.abs(y), R)
    case 'squircle':
      return organicSdf(squircleSdf, WOBBLE.squircle, x, Math.abs(y), R)
    case 'roundHex':
      return organicSdf(roundHexSdf, WOBBLE.roundHex, x, Math.abs(y), R)
    case 'circle':
    default:
      return circleSdf(x, y, R)
  }
}

/** Outward unit normal at (x,y) via central differences of the SDF. Falls
 *  back to the radial direction at a near-zero gradient (e.g. dead centre). */
const gradient = (shape: ArenaShape, x: number, y: number, R: number): [number, number] => {
  const e = 0.5
  const gx = sdf(shape, x + e, y, R) - sdf(shape, x - e, y, R)
  const gy = sdf(shape, x, y + e, R) - sdf(shape, x, y - e, R)
  const l = Math.hypot(gx, gy)
  if (l < 1e-9) {
    const r = Math.hypot(x, y) || 1
    return [x / r, y / r]
  }
  return [gx / l, gy / l]
}

// ─── Public geometry helpers ────────────────────────────────────────────────

/** True when a point (with optional clearance `margin`) is inside the arena. */
export const isInside = (shape: ArenaShape, x: number, y: number, R: number, margin = 0): boolean =>
  sdf(shape, x, y, R) <= -margin

/**
 * Wall-collision query for a blade of the given `radius` centred at (x,y).
 * Returns null when the blade is clear of the wall, otherwise the outward
 * normal plus a clamped centre position pushed just inside (by `pushInside`).
 * Callers keep their own reflection / bounce-boost logic and just consume the
 * normal + clamp point.
 */
export const resolveWall = (
  shape: ArenaShape,
  x: number,
  y: number,
  radius: number,
  R: number,
  pushInside = 0.5
): WallHit | null => {
  const pen = sdf(shape, x, y, R) + radius
  if (pen <= 0) return null
  const [nx, ny] = gradient(shape, x, y, R)
  const move = pen + pushInside
  return { nx, ny, clampX: x - nx * move, clampY: y - ny * move }
}

/**
 * Pull a point back inside the arena so a circle of `radius` (plus optional
 * `extra` clearance) fits. No-op when already inside. Used for placing
 * power-ups / spawned blades on non-circular floors.
 */
export const clampInside = (
  shape: ArenaShape,
  x: number,
  y: number,
  radius: number,
  R: number,
  extra = 0
): { x: number; y: number } => {
  const allowed = -(radius + extra)
  let px = x
  let py = y
  // A few Newton steps along the SDF gradient. Exact in one step for the
  // linear SDFs (circle/diamond) and converges fast near the boundary for the
  // curved/cornered ones (oval/hexagon/roundedRect).
  for (let i = 0; i < 8; i++) {
    const sd = sdf(shape, px, py, R)
    if (sd <= allowed) return { x: px, y: py }
    const [nx, ny] = gradient(shape, px, py, R)
    px -= nx * (sd - allowed)
    py -= ny * (sd - allowed)
  }
  // Safety net for pathologically far inputs: bisect along the segment toward
  // the origin (always inside) until the point fits. Guarantees a valid result.
  if (sdf(shape, px, py, R) > allowed) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      if (sdf(shape, px * (1 - m), py * (1 - m), R) <= allowed) hi = m
      else lo = m
    }
    px *= 1 - hi
    py *= 1 - hi
  }
  return { x: px, y: py }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const traceRoundedRect = (ctx: AnyCtx, hx: number, hy: number, cr: number): void => {
  ctx.moveTo(-hx + cr, -hy)
  ctx.lineTo(hx - cr, -hy)
  ctx.arcTo(hx, -hy, hx, -hy + cr, cr)
  ctx.lineTo(hx, hy - cr)
  ctx.arcTo(hx, hy, hx - cr, hy, cr)
  ctx.lineTo(-hx + cr, hy)
  ctx.arcTo(-hx, hy, -hx, hy - cr, cr)
  ctx.lineTo(-hx, -hy + cr)
  ctx.arcTo(-hx, -hy, -hx + cr, -hy, cr)
  ctx.closePath()
}

/**
 * Begin a fresh path describing the arena boundary at `R * scale`, centred at
 * the origin (caller has already translated). Use for fill / stroke / clip of
 * the floor, neon border, glow halo, and inner rings.
 */
// Boundary polylines of the SDF-only shapes, found by bisection along rays
// from the centre (every shape is star-shaped). Cached per shape + R.
const OUTLINE_SAMPLES = 180
const outlineCache = new Map<string, Float32Array>()
export const shapeOutline = (shape: ArenaShape, R: number): Float32Array => {
  const key = `${shape}:${R}`
  const hit = outlineCache.get(key)
  if (hit) return hit
  const pts = new Float32Array(OUTLINE_SAMPLES * 2)
  for (let i = 0; i < OUTLINE_SAMPLES; i++) {
    const a = (i / OUTLINE_SAMPLES) * Math.PI * 2
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    let lo = 0
    let hi = R * 1.5
    for (let j = 0; j < 30; j++) {
      const m = (lo + hi) / 2
      if (sdf(shape, cx * m, cy * m, R) <= 0) lo = m
      else hi = m
    }
    pts[i * 2] = cx * lo
    pts[i * 2 + 1] = cy * lo
  }
  outlineCache.set(key, pts)
  return pts
}

export const traceArenaPath = (ctx: AnyCtx, shape: ArenaShape, R: number, scale = 1): void => {
  ctx.beginPath()
  if (isOutlineShape(shape)) {
    const pts = shapeOutline(shape, R)
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i]! * scale
      const py = pts[i + 1]! * scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    return
  }
  switch (shape) {
    case 'oval':
      ctx.ellipse(0, 0, R * scale, R * OVAL_RY_RATIO * scale, 0, 0, Math.PI * 2)
      break
    case 'diamond': {
      const r = R * scale
      ctx.moveTo(r, 0)
      ctx.lineTo(0, r)
      ctx.lineTo(-r, 0)
      ctx.lineTo(0, -r)
      ctx.closePath()
      break
    }
    case 'hexagon': {
      const r = R * scale
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3
        const px = Math.cos(a) * r
        const py = Math.sin(a) * r
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'roundedRect':
      traceRoundedRect(ctx, R * RRECT_HX_RATIO * scale, R * RRECT_HY_RATIO * scale, R * RRECT_CR_RATIO * scale)
      break
    case 'circle':
    default:
      ctx.arc(0, 0, R * scale, 0, Math.PI * 2)
      break
  }
}
