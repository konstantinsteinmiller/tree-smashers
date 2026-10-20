// Phase 3 — boss-arena is now a data-driven modifier, not a hard-coded
// override. Boss stages default to the 'boss' arena; explicit arenas win;
// non-boss stages keep their own (or none).

import { describe, expect, it } from 'vitest'
import { ARENA_TYPES, getStageById, buildCheatBossStage, sanitizeArenaType, STAGES } from '@/use/useSpinnerCampaign'

describe('boss arena type is data-driven', () => {
  it('boss stages with no explicit arena default to the boss arena', () => {
    expect(getStageById(5).isBoss).toBe(true)
    expect(getStageById(5).arenaType).toBe('boss')
    expect(getStageById(10).arenaType).toBe('boss')
  })

  it('non-boss stages keep their explicit arena', () => {
    // Stage 6 is a non-boss 'forest' arena.
    expect(getStageById(6).isBoss).toBeFalsy()
    expect(getStageById(6).arenaType).toBe('forest')
    // Stage 12 is a non-boss 'lava' arena.
    expect(getStageById(12).arenaType).toBe('lava')
  })

  it('plain non-boss stages with no arena get no arena type (→ default at runtime)', () => {
    expect(getStageById(1).isBoss).toBeFalsy()
    expect(getStageById(1).arenaType).toBeUndefined()
  })

  it('the boss arena type survives infinite-campaign cycle scaling', () => {
    // Stage 105 = cycle 1 of base stage 5 (a boss).
    expect(getStageById(105).isBoss).toBe(true)
    expect(getStageById(105).arenaType).toBe('boss')
  })

  it('cheat boss showcase stages keep the boss arena visuals', () => {
    expect(buildCheatBossStage('ghost').arenaType).toBe('boss')
  })
})

describe('retired arenas (thunder combo, shock walls)', () => {
  it('no stage, and no selectable arena, names a retired arena', () => {
    expect(ARENA_TYPES).not.toContain('thunder')
    expect(ARENA_TYPES).not.toContain('shock')
    for (const st of STAGES) expect(['thunder', 'shock']).not.toContain(st.arenaType)
  })

  it('old saves / ghosts / peers naming a retired arena load as a live one', () => {
    expect(sanitizeArenaType('thunder')).toBe('forest')
    expect(sanitizeArenaType('shock')).toBe('default')
    expect(sanitizeArenaType('lava')).toBe('lava')
    expect(sanitizeArenaType('nope')).toBe('default')
    expect(sanitizeArenaType(undefined)).toBe('default')
    expect(sanitizeArenaType(42, 'boss')).toBe('boss')
  })
})
