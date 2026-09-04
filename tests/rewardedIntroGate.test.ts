// ─── Rewarded-ad intro gate ─────────────────────────────────────────────────
//
// Guards the seam that keeps the native build inside Google Play's Families
// Ad Format Requirements. Two rules are load-bearing and easy to regress:
//
//   1. On a native build, NO ad request may leave the device before the player
//      has opted in on the intro screen. AdMob's rewarded-interstitial format
//      requires that screen, and Play's Families policy requires ads to be
//      clearly distinguishable from game content.
//   2. Declining must grant nothing and must not call the provider at all.
//
// Web builds must NOT get the extra modal — the portals run their own
// compliant rewarded flow.
//
// The i18n block is asserted too: a rewarded prompt that falls back to English
// on a German device is exactly the kind of thing store review flags, and a
// half-translated <i18n> block is invisible until someone plays in that locale.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LOCALES = ['en', 'de', 'fr', 'es', 'jp', 'kr', 'zh', 'ru'] as const
const INTRO_KEYS = [
  'badge',
  'title',
  'body',
  'bodyReward',
  'closeable',
  'rewardCoins',
  'rewardDiamonds',
  'rewardSpeed',
  'rewardRespin',
  'watch',
  'decline'
] as const

// A stand-in ad provider whose `showRewardedAd` always grants. If the intro
// gate leaks, the spy records the call and the assertion fires.
const showRewardedSpy = vi.fn(async () => true)

vi.mock('@/platforms/resolveAdProvider', async () => {
  const { ref } = await import('vue')
  return {
    resolveAdProvider: () => ({
      name: 'test-provider',
      isReady: ref(true),
      isRewardedReady: ref(true),
      isInterstitialReady: ref(false),
      isAdsBlocked: ref(false),
      init: async () => {
      },
      showRewardedAd: showRewardedSpy,
      showMidgameAd: async () => {
      }
    })
  }
})

/** Load `useAds` + `useRewardedIntro` fresh with `VITE_APP_NATIVE` stubbed.
 *  Both modules read the flag at import time, so the stub has to land before
 *  the dynamic import and the module registry has to be reset each time. */
const loadAds = async (native: boolean) => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_NATIVE', native ? 'true' : '')
  const ads = await import('@/use/useAds')
  const intro = await import('@/use/useRewardedIntro')
  return { ads, intro }
}

describe('rewarded intro gate', () => {
  beforeEach(() => {
    showRewardedSpy.mockClear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is required on native builds and skipped on web builds', async () => {
    const nativeRun = await loadAds(true)
    expect(nativeRun.intro.requiresRewardedIntro).toBe(true)

    const webRun = await loadAds(false)
    expect(webRun.intro.requiresRewardedIntro).toBe(false)
  })

  it('does not request an ad until the player accepts (native)', async () => {
    const { ads, intro } = await loadAds(true)

    const pending = ads.showRewardedAd({ kind: 'coins', amount: 125 })

    // Modal is up, provider untouched.
    expect(intro.isRewardedIntroOpen.value).toBe(true)
    expect(showRewardedSpy).not.toHaveBeenCalled()
    // The reward reached the modal in structured form, ready for i18n.
    expect(intro.rewardedIntroReward.value).toEqual({ kind: 'coins', amount: 125 })

    intro.acceptRewardedIntro()
    await expect(pending).resolves.toBe(true)
    expect(showRewardedSpy).toHaveBeenCalledTimes(1)
    expect(intro.isRewardedIntroOpen.value).toBe(false)
  })

  it('declining grants nothing and never touches the provider (native)', async () => {
    const { ads, intro } = await loadAds(true)

    const pending = ads.showRewardedAd({ kind: 'diamonds', amount: 1 })
    expect(intro.isRewardedIntroOpen.value).toBe(true)

    intro.declineRewardedIntro()
    await expect(pending).resolves.toBe(false)
    expect(showRewardedSpy).not.toHaveBeenCalled()
    expect(intro.isRewardedIntroOpen.value).toBe(false)
    expect(intro.rewardedIntroReward.value).toBeNull()
  })

  it('goes straight to the provider on web builds', async () => {
    const { ads, intro } = await loadAds(false)

    await expect(ads.showRewardedAd({ kind: 'coins', amount: 125 })).resolves.toBe(true)
    expect(showRewardedSpy).toHaveBeenCalledTimes(1)
    expect(intro.isRewardedIntroOpen.value).toBe(false)
  })

  it('a second request settles the first as declined instead of stranding it', async () => {
    const { ads, intro } = await loadAds(true)

    const first = ads.showRewardedAd({ kind: 'speed' })
    const second = ads.showRewardedAd({ kind: 'respin' })

    await expect(first).resolves.toBe(false)
    intro.acceptRewardedIntro()
    await expect(second).resolves.toBe(true)
    expect(showRewardedSpy).toHaveBeenCalledTimes(1)
  })
})

describe('RewardedAdIntroModal i18n', () => {
  // The copy lives in the component's own <i18n> block rather than the shared
  // locale files, so the usual locale-file test would not see it.
  const source = readFileSync(
    resolve(__dirname, '../src/components/atoms/RewardedAdIntroModal.vue'),
    'utf8'
  )
  const block = source.slice(source.indexOf('<i18n lang="yaml">'), source.indexOf('</i18n>'))

  it('carries every locale the game ships', () => {
    expect(block.length).toBeGreaterThan(0)
    for (const locale of LOCALES) {
      expect(block, `${locale} block missing`).toMatch(new RegExp(`^${locale}:$`, 'm'))
    }
  })

  it('defines every message in every locale', () => {
    for (const key of INTRO_KEYS) {
      const hits = block.match(new RegExp(`^\\s{4}${key}: `, 'gm')) ?? []
      expect(hits.length, `${key} defined ${hits.length}x, expected ${LOCALES.length}`).toBe(
        LOCALES.length
      )
    }
  })

  it('keeps the {reward} and {count} placeholders in every translation', () => {
    const bodyReward = block.match(/^\s{4}bodyReward: .*$/gm) ?? []
    expect(bodyReward.length).toBe(LOCALES.length)
    for (const line of bodyReward) expect(line, line).toContain('{reward}')

    for (const key of ['rewardCoins', 'rewardDiamonds'] as const) {
      const lines = block.match(new RegExp(`^\\s{4}${key}: .*$`, 'gm')) ?? []
      expect(lines.length).toBe(LOCALES.length)
      for (const line of lines) expect(line, line).toContain('{count}')
    }
  })
})
