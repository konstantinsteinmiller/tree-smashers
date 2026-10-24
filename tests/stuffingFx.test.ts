import { describe, it, expect } from 'vitest'
import { spawnStuffing, updateStuffing, type StuffingBurst } from '@/use/stuffingFx'

describe('stuffingFx (Watte death burst)', () => {
  it('is deterministic per position, caps bursts, halves on low tier and expires', () => {
    const a: StuffingBurst[] = []
    const b: StuffingBurst[] = []
    spawnStuffing(a, 100, 80, 30)
    spawnStuffing(b, 100, 80, 30)
    expect(a[0]!.puffs).toEqual(b[0]!.puffs)
    const low: StuffingBurst[] = []
    spawnStuffing(low, 100, 80, 30, true)
    expect(low[0]!.puffs.length).toBe(a[0]!.puffs.length / 2)
    for (let i = 0; i < 20; i++) spawnStuffing(a, i, i, 20)
    expect(a.length).toBeLessThanOrEqual(8)
    for (let i = 0; i < 80; i++) updateStuffing(a, 16)
    expect(a.length).toBe(0)
  })
})
