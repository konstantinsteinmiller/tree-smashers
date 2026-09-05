// ─── Poki ad lifecycle ──────────────────────────────────────────────────────
//
// Covers the two Poki-specific ad behaviours that differ from every other
// provider in this repo, both verified against the shipped SDK bundle:
//
//   1. REWARDED READINESS GATING. PokiSDK ships as a 5.5 KB loader shim that
//      fetches a ~325 KB core. The shim QUEUES `init` and `commercialBreak` for
//      replay once the core lands — but its `rewardedBreak` is a literal
//      `() => Promise.resolve(false)`. So a rewarded button live during the
//      first few hundred ms silently refuses the reward: no ad, no error, no
//      grant. `isRewardedReady` therefore hangs off "init has settled", not off
//      "a provider exists".
//
//   2. IMPRESSION-ONLY-ON-FILL. `commercialBreak(onStart)` invokes `onStart`
//      ONLY when a video ad genuinely opens ("not every commercialBreak()
//      triggers an ad"). That is what makes `managesMidgameAudio: true` correct
//      here: `useAds` hands its `killAudioForAd` down as `onImpression`, so an
//      unfilled break leaves the win/lose stinger and the music untouched
//      instead of cutting them for an ad the player never saw.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SdkStub {
  rewardedCalls: unknown[]
  commercialCalls: unknown[]
}

const loadPlugin = async () => {
  vi.resetModules()
  return await import('@/utils/pokiPlugin')
}

/**
 * @param fill whether the SDK should report that an ad actually opened
 *             (i.e. whether it invokes the `onStart` callback)
 */
const installSdk = (fill: boolean, granted = true): SdkStub => {
  const stub: SdkStub = { rewardedCalls: [], commercialCalls: [] }
  ;(window as unknown as { PokiSDK: unknown }).PokiSDK = {
    init: () => Promise.resolve(),
    gameLoadingFinished: () => {
    },
    gameplayStart: () => {
    },
    gameplayStop: () => {
    },
    commercialBreak: (onStart?: () => void) => {
      stub.commercialCalls.push(onStart)
      if (fill) onStart?.()
      return Promise.resolve()
    },
    rewardedBreak: (arg?: unknown) => {
      stub.rewardedCalls.push(arg)
      if (fill && arg && typeof arg === 'object' && 'onStart' in arg) {
        (arg as { onStart?: () => void }).onStart?.()
      }
      return Promise.resolve(fill && granted)
    },
    measure: () => {
    },
    captureError: () => {
    },
    getLanguage: () => 'de',
    getDeviceInfo: () => ({ category: 'tablet' }),
    setDebug: () => {
    }
  }
  return stub
}

describe('poki ad lifecycle', () => {
  beforeEach(() => {
    installSdk(true)
  })
  afterEach(() => {
    delete (window as unknown as { PokiSDK?: unknown }).PokiSDK
  })

  it('refuses a rewarded ad before init settles, without calling the SDK', async () => {
    const stub = installSdk(true)
    const { showRewardedAdPoki, isPokiSdkActive } = await loadPlugin()

    // No `pokiPlugin()` yet — this is the window in which the loader shim's
    // stub would resolve `false` on its own.
    expect(isPokiSdkActive.value).toBe(false)
    await expect(showRewardedAdPoki()).resolves.toBe(false)
    expect(stub.rewardedCalls).toHaveLength(0)
  })

  it('grants only after init has settled, and requests a single-ad rewarded', async () => {
    const stub = installSdk(true)
    const { pokiPlugin, showRewardedAdPoki, isPokiSdkActive } = await loadPlugin()

    await pokiPlugin()
    expect(isPokiSdkActive.value).toBe(true)

    await expect(showRewardedAdPoki()).resolves.toBe(true)
    expect(stub.rewardedCalls).toHaveLength(1)
    // The object form is undocumented but real; `size` maps to 1/2/3 ads
    // back-to-back. Single-ad rewards only.
    expect(stub.rewardedCalls[0]).toMatchObject({ size: 'small' })
  })

  it('does not grant when the rewarded break resolves false', async () => {
    installSdk(false)
    const { pokiPlugin, showRewardedAdPoki } = await loadPlugin()
    await pokiPlugin()

    // A `false` here conflates blocked / no-fill / player-skipped — Poki gives
    // no way to tell them apart (`isAdBlocked()` is hardcoded `() => false`),
    // which is why no ad-blocker modal is surfaced on this platform.
    await expect(showRewardedAdPoki()).resolves.toBe(false)
  })

  it('fires onImpression when the interstitial actually opens', async () => {
    installSdk(true)
    const { pokiPlugin, showMidgameAdPoki } = await loadPlugin()
    await pokiPlugin()

    const onImpression = vi.fn()
    await showMidgameAdPoki(onImpression)
    expect(onImpression).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onImpression on a no-fill, so audio survives an unfilled break', async () => {
    installSdk(false)
    const { pokiPlugin, showMidgameAdPoki } = await loadPlugin()
    await pokiPlugin()

    const onImpression = vi.fn()
    await showMidgameAdPoki(onImpression)
    // `useAds` passes its `killAudioForAd` here; not calling it is what keeps
    // the result-screen stinger alive when Poki decides not to serve an ad.
    expect(onImpression).not.toHaveBeenCalled()
  })

  it('still resolves (never rejects) when the SDK throws', async () => {
    const { pokiPlugin, showMidgameAdPoki, showRewardedAdPoki } = await loadPlugin()
    await pokiPlugin()
    ;(window as unknown as { PokiSDK: Record<string, unknown> }).PokiSDK.commercialBreak =
      () => {
        throw new Error('boom')
      }
    ;(window as unknown as { PokiSDK: Record<string, unknown> }).PokiSDK.rewardedBreak =
      () => {
        throw new Error('boom')
      }

    await expect(showMidgameAdPoki()).resolves.toBeUndefined()
    await expect(showRewardedAdPoki()).resolves.toBe(false)
  })

  it('reads language and device category synchronously, before init resolves', async () => {
    installSdk(true)
    const { readPokiLanguage, pokiPlugin, pokiDeviceCategory } = await loadPlugin()

    // `getLanguage()` is implemented in the loader shim, so it answers before
    // the core lands — this is what lets main.ts use the parallel init arm.
    expect(readPokiLanguage()).toBe('de')

    await pokiPlugin()
    // Tablets must be forced onto the mobile control scheme (Poki hard
    // requirement); the SDK's own classifier is the source of truth.
    expect(pokiDeviceCategory.value).toBe('tablet')
  })

  it('exposes the provider contract useAds depends on', async () => {
    vi.resetModules()
    const { createPokiProvider } = await import('@/use/ads/PokiProvider')
    const provider = createPokiProvider()

    expect(provider.name).toBe('poki')
    // Mute on the real-ad edge, not up front — see the file header.
    expect(provider.managesMidgameAudio).toBe(true)
    // No Poki ad-block signal exists, so the shared AdsBlockedModal can never
    // fire here. `ownsAdBlockUi` stays unset: there is no platform popup to
    // collide with either (that is the CrazyGames case).
    expect(provider.isAdsBlocked.value).toBe(false)
    expect(provider.ownsAdBlockUi).toBeUndefined()
    // Both formats gate on "init settled".
    expect(provider.isRewardedReady.value).toBe(false)
    expect(provider.isInterstitialReady.value).toBe(false)
  })
})
