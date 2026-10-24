// #UX1c — localised number grouping for the win screen's rank badge.
import { describe, expect, it } from 'vitest'
import { fmtGrouped } from '@/utils/localeNumber'

describe('fmtGrouped', () => {
  it('groups whole numbers per locale with Latin digits', () => {
    expect(fmtGrouped(33883, 'en')).toBe('33,883')
    expect(fmtGrouped(257114, 'de')).toBe('257.114')
    expect(fmtGrouped(1234567, 'en')).toBe('1,234,567')
    // Arabic keeps Latin digits like every other number the game prints.
    expect(fmtGrouped(33883, 'ar')).toMatch(/^33.883$/)
  })
  it('leaves small numbers alone and rounds', () => {
    expect(fmtGrouped(42, 'en')).toBe('42')
    expect(fmtGrouped(999.6, 'en')).toBe('1,000')
  })
})
