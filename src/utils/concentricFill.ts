// ─── Concentric fills: radial-gradient look without a radial gradient ───────
//
// `createRadialGradient` (and `shadowBlur`, `ctx.filter = 'blur'`) are costly on
// weak GPUs / software canvases. A glow, aura or vignette is drawn here as a
// stack of flat-coloured rings (annuli, even-odd), each filled with the colour
// the gradient would have at that radius. The rings never overlap, so alpha
// stops come out exactly as specified rather than stacking up.

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Rgba = [number, number, number, number]

/** Parse `#rgb`, `#rrggbb` or `rgb()/rgba()` into [r, g, b, a]. */
export const parseColor = (c: string): Rgba => {
  const s = c.trim()
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map(x => x + x).join('') : s.slice(1, 7)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const m = s.match(/rgba?\(([^)]*)\)/)
  if (!m) return [0, 0, 0, 0]
  const p = m[1]!.split(',').map(v => parseFloat(v))
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1]
}

/** The colour of a gradient (offset → colour stops) at offset t ∈ [0, 1]. */
export const colorAt = (stops: readonly (readonly [number, string])[], t: number): string => {
  let a = stops[0]!
  let b = stops[stops.length - 1]!
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i]![0] && t <= stops[i + 1]![0]) { a = stops[i]!; b = stops[i + 1]!; break }
  }
  const span = b[0] - a[0]
  const k = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0
  const ca = parseColor(a[1])
  const cb = parseColor(b[1])
  const mix = (i: number) => ca[i]! + (cb[i]! - ca[i]!) * k
  return `rgba(${Math.round(mix(0))},${Math.round(mix(1))},${Math.round(mix(2))},${mix(3).toFixed(3)})`
}

/**
 * Fill a disc of radius `r` at (cx, cy) with `steps` flat rings approximating
 * a radial gradient from the centre (offset 0) to the edge (offset 1). With
 * `square`, the area between the disc and its bounding square takes the last
 * stop's colour (what `fillRect` with a radial gradient would paint).
 */
export const fillConcentric = (
  g: Ctx,
  cx: number,
  cy: number,
  r: number,
  stops: readonly (readonly [number, string])[],
  steps = 12,
  square = false
): void => {
  const TAU = Math.PI * 2
  if (square) {
    g.beginPath()
    g.rect(cx - r, cy - r, r * 2, r * 2)
    g.arc(cx, cy, r, 0, TAU)
    g.fillStyle = stops[stops.length - 1]![1]
    g.fill('evenodd')
  }
  for (let i = 0; i < steps; i++) {
    const outer = r * (1 - i / steps)
    const inner = r * (1 - (i + 1) / steps)
    // Sample the gradient at the ring's middle radius.
    g.fillStyle = colorAt(stops, (outer + inner) / 2 / r)
    g.beginPath()
    g.arc(cx, cy, outer, 0, TAU)
    if (inner > 0) g.arc(cx, cy, inner, 0, TAU, true)
    g.fill('evenodd')
  }
}
