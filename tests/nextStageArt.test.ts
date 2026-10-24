import { describe, expect, it } from 'vitest'
import { QUIET_MS, networkIsQuiet } from '@/use/nextStageArt'

describe('networkIsQuiet', () => {
  it('quiet when nothing finished recently', () => {
    expect(networkIsQuiet(10_000, [1000, 2000], false)).toBe(true)
  })
  it('busy while a resource finished inside the quiet window', () => {
    expect(networkIsQuiet(10_000, [10_000 - QUIET_MS + 50], false)).toBe(false)
  })
  it('never in a hidden tab, on save-data or a 2g link', () => {
    expect(networkIsQuiet(10_000, [], true)).toBe(false)
    expect(networkIsQuiet(10_000, [], false, { saveData: true })).toBe(false)
    expect(networkIsQuiet(10_000, [], false, { effectiveType: '2g' })).toBe(false)
    expect(networkIsQuiet(10_000, [], false, { effectiveType: '4g' })).toBe(true)
  })
})
