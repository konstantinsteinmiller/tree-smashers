// Characterization tests for the save-strategy resolver. Mirrors the exact
// branching that lives in main.ts:41-47 today. Confirms:
//   - Glitch flag → GlitchStrategy via lazy import (or LocalStorageStrategy fallback)
//   - CrazyGames flag → CrazyGamesStrategy via static import
//   - GameDistribution flag → GameDistributionStrategy via lazy import
//   - No flag → LocalStorageStrategy
//
// Each strategy class has a stable `name` property — we compare on that to
// avoid coupling the test to instance details. Tests construct strategies
// directly (no mocking), so they exercise the real classes.

import { describe, expect, it, vi } from 'vitest'
import { resolveSaveStrategy } from '@/platforms/resolveSaveStrategy'
import type { PlatformFlags } from '@/platforms/capabilities'

const allOff: PlatformFlags = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false
}

describe('resolveSaveStrategy', () => {
  it('returns LocalStorageStrategy when no flag is set', async () => {
    const strategy = await resolveSaveStrategy(allOff)
    expect(strategy.name).toBe('localStorage')
  })

  it('returns LocalStorageStrategy when only itch is set', async () => {
    const strategy = await resolveSaveStrategy({ ...allOff, isItch: true })
    expect(strategy.name).toBe('localStorage')
  })

  it('returns LocalStorageStrategy when only wavedash is set', async () => {
    const strategy = await resolveSaveStrategy({ ...allOff, isWaveDash: true })
    expect(strategy.name).toBe('localStorage')
  })

  it('returns CrazyGamesStrategy when isCrazyWeb is set', async () => {
    const strategy = await resolveSaveStrategy({ ...allOff, isCrazyWeb: true })
    expect(strategy.name).toBe('crazyGames')
  })

  it('returns GameDistributionStrategy when isGameDistribution is set', async () => {
    const strategy = await resolveSaveStrategy({ ...allOff, isGameDistribution: true })
    expect(strategy.name).toBe('gameDistribution')
  })

  it('returns GlitchStrategy or LocalStorageStrategy fallback when isGlitch is set (depends on env config)', async () => {
    // The Glitch plugin's `createGlitchSaveStrategy()` returns null when
    // VITE_APP_GLITCH_INSTALL_ID / TOKEN env vars are missing; the resolver
    // falls back to LocalStorageStrategy in that case. In test env these
    // are unset, so the fallback path runs.
    const strategy = await resolveSaveStrategy({ ...allOff, isGlitch: true })
    // Either the Glitch strategy (when env is fully configured) or
    // LocalStorageStrategy fallback (when not) — both are correct for
    // their respective configurations.
    expect(['glitch', 'localStorage']).toContain(strategy.name)
  })

  describe('priority ordering matches main.ts', () => {
    it('isGlitch wins over isCrazyWeb when both are set (Glitch is the first arm)', async () => {
      const strategy = await resolveSaveStrategy({
        ...allOff,
        isGlitch: true,
        isCrazyWeb: true
      })
      expect(['glitch', 'localStorage']).toContain(strategy.name)
    })

    it('isCrazyWeb wins over isGameDistribution when both are set (CG is the second arm)', async () => {
      const strategy = await resolveSaveStrategy({
        ...allOff,
        isCrazyWeb: true,
        isGameDistribution: true
      })
      expect(strategy.name).toBe('crazyGames')
    })
  })
})
