// ─── Themed obstacle looks (visual only) ─────────────────────────────────────
//
// Every theme dresses every solid kind in a look that belongs there (an igloo,
// not a mushroom, on a snowfield); each themed disc look has a draw function
// and an atlas cell; drawing a layout in any theme never changes its geometry.
import { describe, expect, it } from 'vitest'
import { ARENA_THEME_IDS, OBSTACLE_LOOK, OBSTACLE_LOOKS_A, OBSTACLE_LOOKS_B } from '@/use/arenaThemes'
import { OBSTACLE_DRAW } from '@/use/arenaObstacleDraw'
import { renderTerrainFeatures } from '@/use/arenaTerrainDraw'
import { buildTerrainLayout, TERRAIN_LAYOUT_COUNT } from '@/use/arenaTerrain'

const recorder = () => {
  const calls: string[] = []
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'getTransform' ? () => ({ a: 1, b: 0 }) : (...a: unknown[]) => { calls.push(String(k)); return a }),
    set: () => true
  }) as unknown as CanvasRenderingContext2D
}

describe('themed obstacle looks', () => {
  it('snowy has an igloo for the mushroom; non-forest themes never show the forest mushroom/stump', () => {
    expect(OBSTACLE_LOOK.snowy.mushroom).toBe('igloo')
    for (const t of ['snowy', 'volcanic', 'ruins', 'bedroom'] as const) {
      for (const k of ['stump', 'rock', 'pond', 'mushroom', 'log'] as const) expect(OBSTACLE_LOOK[t][k], `${t}.${k}`).not.toBe('plain')
    }
    expect(OBSTACLE_LOOK.rocky.stump).toBe('boulder')
  })

  it('every disc look has a draw function and exactly one atlas cell', () => {
    const cells = [...OBSTACLE_LOOKS_A, ...OBSTACLE_LOOKS_B]
    expect(new Set(cells).size).toBe(18)
    for (const l of cells) expect(typeof OBSTACLE_DRAW[l]).toBe('function')
    for (const t of ARENA_THEME_IDS) {
      for (const [k, l] of Object.entries(OBSTACLE_LOOK[t])) {
        if (l === 'plain' || k === 'log') continue
        expect(cells, `${t}.${k}`).toContain(l)
      }
    }
  })

  it('drawing in any theme leaves the layout geometry untouched', () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const t = buildTerrainLayout(id)
      const before = JSON.stringify(t)
      for (const th of ARENA_THEME_IDS) renderTerrainFeatures(recorder(), t, th)
      expect(JSON.stringify(t)).toBe(before)
    }
  })
})
