import { describe, expect, it } from 'vitest'
import { alphaBounds, circleFit, PORTRAIT_FIT_DEFAULTS } from '@/smashers/portraitFit'

/** A w×h RGBA buffer with the given opaque rectangles / ellipses. */
const buf = (w: number, h: number, shapes: Array<(x: number, y: number) => boolean>) => {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (shapes.some(f => f(x + 0.5, y + 0.5))) d[(y * w + x) * 4 + 3] = 255
  }
  return d
}
const rect = (l: number, t: number, r: number, b: number) => (x: number, y: number) => x >= l && x < r && y >= t && y < b
const ell = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

const W = 200
/** Apply the fit and check every opaque pixel's corners land inside the circle. */
const check = (d: Uint8ClampedArray) => {
  const b = alphaBounds(d, W, W)!
  const f = circleFit(b, W, W)
  const R = W / 2 * PORTRAIT_FIT_DEFAULTS.fill
  let worst = 0
  for (const [y, l, r] of b.rows) for (const x of [l - 0.5, r + 0.5]) for (const yy of [y - 0.5, y + 0.5]) {
    const px = f.cx + f.scale * (x - f.anchorX)
    const py = f.cy + f.scale * (yy - f.anchorY)
    worst = Math.max(worst, Math.hypot(px - W / 2, py - W / 2))
  }
  return { b, f, R, worst }
}

// Shapes like the smashers that sat low: a figure standing on a wide base
// disc low in the FRAME_BOX layout — tall, wide, small.
const SHAPES = {
  tall: [rect(80, 20, 120, 150), ell(100, 160, 50, 18)],
  wide: [rect(30, 110, 170, 150), ell(100, 165, 70, 22)],
  small: [rect(90, 120, 110, 150), ell(100, 160, 25, 9)],
  lowBase: [ell(100, 150, 45, 40), ell(100, 185, 60, 14)]
}

describe('portrait circle fit (BossPeekBadge)', () => {
  for (const [name, shapes] of Object.entries(SHAPES)) {
    it(`${name}: every pixel inside the opening, centred slightly high`, () => {
      const { f, R, worst } = check(buf(W, W, shapes))
      expect(worst).toBeLessThanOrEqual(R + 0.01)
      // tight: something touches the circle unless the scale cap held it back
      if (f.scale < PORTRAIT_FIT_DEFAULTS.maxScale) expect(worst).toBeGreaterThan(R - 1)
      // bounds centre: horizontally centred, lifted above the disc centre
      expect(f.cx).toBeCloseTo(W / 2, 5)
      expect(W / 2 - f.cy).toBeCloseTo(PORTRAIT_FIT_DEFAULTS.lift * R, 5)
    })
  }

  it('moves a low-sitting figure UP (the reported bug)', () => {
    const { b, f } = check(buf(W, W, SHAPES.lowBase))
    expect((b.top + b.bottom) / 2).toBeGreaterThan(W / 2) // sits low as drawn
    expect(f.cy).toBeLessThan(W / 2) // lands above centre
  })

  it('empty canvas → null', () => {
    expect(alphaBounds(new Uint8ClampedArray(16 * 16 * 4), 16, 16)).toBeNull()
  })
})
