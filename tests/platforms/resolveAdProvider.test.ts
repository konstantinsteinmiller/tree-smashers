// Characterization tests for the ad-provider resolver.
//
// Branches now key off `import.meta.env.VITE_APP_*` literals (so Rollup
// can dead-code-eliminate the unused ad providers from each build's
// bundle) instead of the `flags` parameter — see the file header on
// `src/platforms/resolveAdProvider.ts` for why.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformFlags } from '@/platforms/capabilities'

const allOff: PlatformFlags = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false
}

const ALL_ENVS = ['VITE_APP_CRAZY_WEB', 'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_NATIVE'] as const

const clearEnv = () => {
  for (const k of ALL_ENVS) vi.stubEnv(k, '')
}

const loadResolver = async () => {
  vi.resetModules()
  const mod = await import('@/platforms/resolveAdProvider')
  return mod.resolveAdProvider
}

describe('resolveAdProvider', () => {
  beforeEach(clearEnv)
  afterEach(() => vi.unstubAllEnvs())

  it('returns Noop when no env flag is set', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns CrazyGames when VITE_APP_CRAZY_WEB env is set', async () => {
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isCrazyWeb: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('crazygames')
  })

  it('returns GameDistribution when VITE_APP_GAME_DISTRIBUTION env is set', async () => {
    vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isGameDistribution: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('gameDistribution')
  })

  it('returns LevelPlay when VITE_APP_NATIVE env is set AND showMediatorAds AND isNative are both true', async () => {
    vi.stubEnv('VITE_APP_NATIVE', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: true,
      isNative: true
    })
    expect(provider.name).toBe('levelplay')
  })

  it('returns Noop when showMediatorAds is true but isNative is false (web build)', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: true,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop when isNative is true but showMediatorAds is false (no mediation)', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: true
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop on Glitch / itch / wavedash (no ad backend)', async () => {
    const resolveAdProvider = await loadResolver()
    for (const flag of ['isGlitch', 'isItch', 'isWaveDash'] as const) {
      const provider = resolveAdProvider({
        flags: { ...allOff, [flag]: true },
        showMediatorAds: false,
        isNative: false
      })
      expect(provider.name, flag).toBe('noop')
    }
  })

  describe('priority ordering matches useAds.ts', () => {
    it('isCrazyWeb wins over isGameDistribution when both env flags are set', async () => {
      vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
      vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
      const resolveAdProvider = await loadResolver()
      const provider = resolveAdProvider({
        flags: { ...allOff, isCrazyWeb: true, isGameDistribution: true },
        showMediatorAds: false,
        isNative: false
      })
      expect(provider.name).toBe('crazygames')
    })

    it('isGameDistribution wins over LevelPlay when both env flags are set', async () => {
      vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
      vi.stubEnv('VITE_APP_NATIVE', 'true')
      const resolveAdProvider = await loadResolver()
      const provider = resolveAdProvider({
        flags: { ...allOff, isGameDistribution: true },
        showMediatorAds: true,
        isNative: true
      })
      expect(provider.name).toBe('gameDistribution')
    })
  })
})
