import { describe, expect, it } from 'vitest'
import { TERRAIN_LAYOUT_COUNT, buildTerrainLayout } from '@/use/arenaTerrain'

// Owner 2026-10-23: floor hazards used to sit on the middle line (y ~ 15) of nearly every
// layout. spreadFloor re-rolls their height per layout.
describe('hazard spread', () => {
  const feats = Array.from({ length: TERRAIN_LAYOUT_COUNT }, (_, i) => buildTerrainLayout(i))
    .flatMap(l => [...l.boosters, ...l.holes, ...l.arrows, ...l.honey])

  it('well under all of the hazards sit on the middle line (authored: ~95 %; the spawn rows block most of the rest)', () => {
    expect(feats.length).toBeGreaterThan(40)
    const onMiddle = feats.filter(f => Math.abs(f.y - 15) < 12).length
    expect(onMiddle / feats.length).toBeLessThan(0.65)
  })
  it('they reach both halves and the upper / lower thirds', () => {
    expect(feats.some(f => f.y > 50)).toBe(true)
    expect(feats.some(f => f.y < -50)).toBe(true)
  })
  it('is deterministic (same layout twice = same positions)', () => {
    expect(buildTerrainLayout(7)).toEqual(buildTerrainLayout(7))
  })
})
