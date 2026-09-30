// Builds WITHOUT rewarded ads (CrazyGames basic launch, itch, Glitch, GamePix,
// Y8, WaveDash, plain web, native without ads) must show NO
// watch-an-ad-for-a-reward placement — even if the provider claims an ad is
// ready (a CG build shipped to basic launch with the full-release flag on did
// exactly that: a "+N coins" button that can never pay out).
//
// Every placement binds to `useAds.isRewardedReady` / `useAds.showRewardedAd`,
// so the build gate lives there. This spec pins:
//   • the choke point: false / refused on every no-ad build, untouched on ad
//     builds, even with a provider that swears it is ready;
//   • the placements themselves (AdRewardButton "+N coins", RewardedAdButton
//     win-screen "3x coins") render on ad builds and not on no-ad builds;
//   • no placement bypasses the choke point by importing a provider directly.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A provider that ALWAYS claims a rewarded ad is loaded and would grant it.
const providerShow = vi.fn(async () => true)
vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => ({
    name: 'fake-ready',
    isReady: ref(true),
    isRewardedReady: ref(true),
    isInterstitialReady: ref(true),
    isAdsBlocked: ref(false),
    init: async () => {
    },
    showRewardedAd: () => providerShow(),
    showMidgameAd: async () => {
    }
  })
}))

// AdRewardButton's static `/images/...` src compiles to an import.
vi.mock('/images/icons/movie_128x96.webp', () => ({ default: 'movie.webp' }))

const BUILD_OFF: Record<string, string> = {
  VITE_APP_CRAZY_WEB: '', VITE_APP_CRAZY_GAMES_FULL_RELEASE: '', VITE_APP_GAME_DISTRIBUTION: '',
  VITE_APP_PLAYGAMA: '', VITE_APP_POKI: '', VITE_APP_NATIVE: '', VITE_APP_SHOW_MEDIATOR_ADS: '',
  VITE_APP_ITCH: '', VITE_APP_GLITCH: '', VITE_APP_GAMEPIX: '', VITE_APP_Y8: '', VITE_APP_WAVEDASH: ''
}
const AD_BUILDS: Array<[string, Record<string, string>]> = [
  ['CrazyGames full release', { VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'true' }],
  ['GameDistribution', { VITE_APP_GAME_DISTRIBUTION: 'true' }],
  ['Playgama', { VITE_APP_PLAYGAMA: 'true' }],
  ['Poki', { VITE_APP_POKI: 'true' }]
]
const NO_AD_BUILDS: Array<[string, Record<string, string>]> = [
  ['CrazyGames basic launch', { VITE_APP_CRAZY_WEB: 'true' }],
  ['itch', { VITE_APP_ITCH: 'true' }],
  ['Glitch', { VITE_APP_GLITCH: 'true' }],
  ['GamePix', { VITE_APP_GAMEPIX: 'true' }],
  ['Y8', { VITE_APP_Y8: 'true' }],
  ['WaveDash', { VITE_APP_WAVEDASH: 'true' }],
  ['plain web', {}]
]

const setBuild = (env: Record<string, string>): void => {
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries({ ...BUILD_OFF, ...env })) vi.stubEnv(k, v)
}

const loadAds = async () => {
  vi.resetModules()
  // useUser first (useMatch ↔ useModels ↔ useUser cycle guard).
  await import('@/use/useUser')
  return import('@/use/useAds')
}

const i18n = () =>
  createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

const mountButtons = async () => {
  await loadAds()
  const AdRewardButton = (await import('@/components/organisms/AdRewardButton.vue')).default
  const RewardedAdButton = (await import('@/components/organisms/RewardedAdButton.vue')).default
  const coins = mount(AdRewardButton, { global: { plugins: [i18n()] } })
  const double = mount(RewardedAdButton, { props: { baseCoins: 40 }, global: { plugins: [i18n()] } })
  return { coins, double }
}

beforeEach(() => {
  localStorage.clear()
  providerShow.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('useAds choke point', () => {
  it.each(NO_AD_BUILDS)('no-ad build %s: never ready, never shows, never grants', async (_, env) => {
    setBuild(env)
    const ads = await loadAds()
    expect(ads.isRewardedReady.value).toBe(false)
    expect(await ads.showRewardedAd({ kind: 'coins', amount: 100 })).toBe(false)
    expect(providerShow).not.toHaveBeenCalled()
  })

  it.each(AD_BUILDS)('ad build %s: unchanged — ready and granted', async (_, env) => {
    setBuild(env)
    const ads = await loadAds()
    expect(ads.isRewardedReady.value).toBe(true)
    expect(await ads.showRewardedAd({ kind: 'coins', amount: 100 })).toBe(true)
    expect(providerShow).toHaveBeenCalledTimes(1)
  })
})

describe('reward placements', () => {
  it.each(NO_AD_BUILDS)('no-ad build %s: no "+coins" and no "3x coins" ad button', async (_, env) => {
    setBuild(env)
    const { coins, double } = await mountButtons()
    expect(coins.find('button.adReward').exists()).toBe(false)
    expect(double.find('button.reward-3x').exists()).toBe(false)
  })

  it.each(AD_BUILDS)('ad build %s: both ad buttons render', async (_, env) => {
    setBuild(env)
    const { coins, double } = await mountButtons()
    expect(coins.find('button.adReward').exists()).toBe(true)
    expect(double.find('button.reward-3x').exists()).toBe(true)
  })
})

describe('no placement bypasses useAds', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(f) ? [p] : []
    })

  it('components and views get rewarded ads only from @/use/useAds', () => {
    const root = resolve(__dirname, '../src')
    const files = [...walk(join(root, 'components')), ...walk(join(root, 'views'))]
    const offenders = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8')
      return [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)]
        .filter(([, names, from]) => /showRewarded|isRewardedReady/.test(names!) && from !== '@/use/useAds')
        .map(([, , from]) => `${f} <- ${from}`)
    })
    expect(offenders).toEqual([])
  })

  it('the gate is the build-time HAS_REWARDED_ADS literal', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/useAds.ts'), 'utf8')
    expect(src).toMatch(/HAS_REWARDED_ADS && provider\.isRewardedReady\.value/)
    expect(src).toMatch(/if \(!HAS_REWARDED_ADS\) return false/)
  })
})
