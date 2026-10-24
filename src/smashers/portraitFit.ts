// ─── Portrait fit: centre a drawn smasher in a round opening ───────────────
//
// The FRAME_BOX every portrait is laid out by is a fixed box (room for the
// tallest ears), so a short or wide smasher drawn by it sits low and its base
// disc runs into the bottom of a ROUND opening (owner: "badly centered for
// all smashers"). Instead of a guessed offset per smasher, measure what was
// actually drawn — its alpha — and solve the scale + shift that puts every
// opaque pixel inside the circle, the figure's bounds centred a little above
// the circle's centre. Pure: works on a raw RGBA buffer, no DOM.

export interface AlphaBounds {
  left: number
  top: number
  right: number
  bottom: number
  /** Per opaque row: [y, leftmost x, rightmost x] (pixel centres). The
   *  extreme points of the drawn shape are among these, so a convex
   *  constraint checked on them holds for every opaque pixel. */
  rows: Array<[number, number, number]>
}

/** Bounds of the pixels with alpha ≥ `threshold` in a w×h RGBA buffer, or null. */
export const alphaBounds = (data: ArrayLike<number>, w: number, h: number, threshold = 40): AlphaBounds | null => {
  let left = w, top = h, right = -1, bottom = -1
  const rows: Array<[number, number, number]> = []
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1
    const o = y * w * 4 + 3
    for (let x = 0; x < w; x++) if (data[o + x * 4]! >= threshold) { l = x; break }
    if (l < 0) continue
    for (let x = w - 1; x >= l; x--) if (data[o + x * 4]! >= threshold) { r = x; break }
    rows.push([y + 0.5, l + 0.5, r + 0.5])
    if (l < left) left = l
    if (r + 1 > right) right = r + 1
    if (y < top) top = y
    bottom = y + 1
  }
  return right < 0 ? null : { left, top, right, bottom, rows }
}

export interface CircleFitOptions {
  /** Circle radius as a fraction of min(w, h) / 2 (clear of the frame's lip). */
  fill?: number
  /** How far ABOVE the circle's centre the figure's bounds centre sits, as a
   *  fraction of the circle's radius (optical centring: a figure standing on
   *  a base reads low when it is mathematically centred). */
  lift?: number
  /** Never blow a small drawing up by more than this. */
  maxScale?: number
}

/** p' = c + scale · (p − anchor): where the drawing goes. */
export interface CircleFit {
  scale: number
  anchorX: number
  anchorY: number
  /** Where the bounds' centre lands. */
  cx: number
  cy: number
}

export const PORTRAIT_FIT_DEFAULTS: Required<CircleFitOptions> = { fill: 0.86, lift: 0.07, maxScale: 1.6 }

/**
 * Scale + shift so the measured shape fits the circle of radius
 * fill · min(w,h)/2 around the canvas centre, with its bounds centre `lift`
 * above that centre. For each extreme point v (relative to the bounds
 * centre) the constraint |s·v − L| ≤ R (L = the lift vector, pointing down
 * from the target to the circle centre) gives an upper bound on s; the
 * smallest wins.
 */
export const circleFit = (b: AlphaBounds, w: number, h: number, opts: CircleFitOptions = {}): CircleFit => {
  const { fill, lift, maxScale } = { ...PORTRAIT_FIT_DEFAULTS, ...opts }
  const R = (Math.min(w, h) / 2) * fill
  const ax = (b.left + b.right) / 2
  const ay = (b.top + b.bottom) / 2
  const cx = w / 2
  const cy = h / 2 - lift * R
  const Ly = h / 2 - cy // circle centre relative to the target point (+y down)
  let s = maxScale
  const bound = (vx: number, vy: number) => {
    const vv = vx * vx + vy * vy
    if (vv < 1e-9) return
    const vL = vy * Ly
    const disc = vL * vL - vv * (Ly * Ly - R * R)
    const sMax = (vL + Math.sqrt(Math.max(0, disc))) / vv
    if (sMax < s) s = sMax
  }
  for (const [y, l, r] of b.rows) {
    // pixel centres ± half a pixel: the pixel's outer corners
    const vy = y - ay + (y < ay ? -0.5 : 0.5)
    bound(l - 0.5 - ax, vy)
    bound(r + 0.5 - ax, vy)
  }
  return { scale: s, anchorX: ax, anchorY: ay, cx, cy }
}
