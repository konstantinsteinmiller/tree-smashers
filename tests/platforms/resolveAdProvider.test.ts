// Characterization tests for the ad-provider resolver. Mirrors the
// branching currently inlined in useAds.ts:29-35:
//   isCrazyWeb              → CrazyGames provider
//   isGameDistribution      → GameDistribution provider
//   showMediatorAds + isNative → LevelPlay provider
//   else                    → Noop provider

import { describe, expect, it } from 'vitest'
import { resolveAdProvider } from '@/platforms/resolveAdProvider'
import type { PlatformFlags } from '@/platforms/capabilities'

const allOff: PlatformFlags = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false
}

describe('resolveAdProvider', () => {
  it('returns Noop when no flag is set', () => {
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns CrazyGames when isCrazyWeb is set', () => {
    const provider = resolveAdProvider({
      flags: { ...allOff, isCrazyWeb: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('crazygames')
  })

  it('returns GameDistribution when isGameDistribution is set', () => {
    const provider = resolveAdProvider({
      flags: { ...allOff, isGameDistribution: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('gameDistribution')
  })

  it('returns LevelPlay when showMediatorAds AND isNative are both true', () => {
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: true,
      isNative: true
    })
    expect(provider.name).toBe('levelplay')
  })

  it('returns Noop when showMediatorAds is true but isNative is false (web build)', () => {
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: true,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop when isNative is true but showMediatorAds is false (no mediation)', () => {
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: true
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop on Glitch / itch / wavedash (no ad backend)', () => {
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
    it('isCrazyWeb wins over isGameDistribution when both are set', () => {
      const provider = resolveAdProvider({
        flags: { ...allOff, isCrazyWeb: true, isGameDistribution: true },
        showMediatorAds: false,
        isNative: false
      })
      expect(provider.name).toBe('crazygames')
    })

    it('isGameDistribution wins over LevelPlay when both conditions match', () => {
      const provider = resolveAdProvider({
        flags: { ...allOff, isGameDistribution: true },
        showMediatorAds: true,
        isNative: true
      })
      expect(provider.name).toBe('gameDistribution')
    })
  })
})
