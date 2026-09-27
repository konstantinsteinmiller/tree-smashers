import { describe, expect, it } from 'vitest'
import { fitFontPx } from '@/use/useFitText'

describe('fitFontPx (tap-to-start title auto-fit)', () => {
  it('leaves text that already fits alone', () => {
    expect(fitFontPx(30, 408, 184)).toBeNull()
    expect(fitFontPx(30, 408, 408.4)).toBeNull()
  })

  it('shrinks overflowing text by the overflow ratio, with headroom', () => {
    // ru at 568x320: ~476px of text into 408px of room.
    const px = fitFontPx(30, 408, 476)!
    expect(px).toBeLessThan(30 * 408 / 476)
    expect(px).toBeGreaterThan(30 * 408 / 476 * 0.95)
  })

  it('never goes below the floor and ignores unmeasured boxes', () => {
    expect(fitFontPx(30, 50, 2000, 12)).toBe(12)
    expect(fitFontPx(30, 0, 400)).toBeNull()
    expect(fitFontPx(0, 400, 800)).toBeNull()
  })
})
