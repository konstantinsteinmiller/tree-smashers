import { describe, expect, it } from 'vitest'
import { seasonOnDate } from '@/use/season'

const on = (y: number, m: number, d: number) => seasonOnDate(new Date(y, m - 1, d, 12))

describe('holiday seasons', () => {
  it('Halloween covers the week around Oct 31', () => {
    expect(on(2026, 10, 27)).toBeNull()
    expect(on(2026, 10, 28)).toBe('halloween')
    expect(on(2026, 10, 31)).toBe('halloween')
    expect(on(2026, 11, 3)).toBe('halloween')
    expect(on(2026, 11, 4)).toBeNull()
  })
  it('Christmas covers two weeks around Dec 25 and wraps the new year', () => {
    expect(on(2026, 12, 17)).toBeNull()
    expect(on(2026, 12, 18)).toBe('christmas')
    expect(on(2026, 12, 25)).toBe('christmas')
    expect(on(2026, 12, 31)).toBe('christmas')
    expect(on(2027, 1, 1)).toBe('christmas')
    expect(on(2027, 1, 2)).toBeNull()
  })
  it('is off the rest of the year', () => {
    expect(on(2026, 6, 15)).toBeNull()
  })
})
