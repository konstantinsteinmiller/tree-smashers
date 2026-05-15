// Playgama Bridge ad provider — wraps the lazy-loaded `playgamaPlugin` in
// the cross-platform `AdProvider` surface consumed by `useAds`.
//
// ## Heavy plugin import is DYNAMIC. Why:
//
// `@/utils/playgamaPlugin` is ~280 LOC plus the Bridge CDN script
// loader. Statically importing it from this file would chain in
// every line whenever `resolveAdProvider` statically imports
// `createPlaygamaProvider` — i.e. into every build's entry chunk,
// even when the actual `createPlaygamaProvider()` call sits in a
// dead `if ('false' === 'true')` branch for non-Playgama builds.
// CG's bundle-purity test (`bundlePurity.test.ts`) catches the
// regression by grepping for `bridge.playgama.com` /
// `in_game_loading_started` / `PlaygamaStrategy` literals in the
// CG hot-path chunks.
//
// Lazy-loading the plugin inside the provider methods means the
// non-Playgama build (CrazyGames, GD, etc.) never executes the
// dynamic import. Rollup emits the plugin as its own on-demand
// chunk that no production code path touches.
//
// Obfuscator constraint: `vite-plugin-javascript-obfuscator`'s
// `stringArray` transform rewrites the literal `'@/...'` inside
// dynamic imports, breaking them at runtime. THIS file MUST be on
// the obfuscator's exclude list in `vite.config.ts` — alongside
// `GameDistributionProvider` which uses the identical pattern.
// The plugin module itself can stay obfuscated; only files that
// *contain* `await import('@/...')` need the exclude.

import { ref, watch } from 'vue'
import type { AdProvider } from './types'

export const createPlaygamaProvider = (): AdProvider => {
  const isReady = ref(false)
  const isAdsBlocked = ref(false)

  // Cache the plugin module so repeated method calls only pay one
  // dynamic-import round trip.
  let pluginPromise: Promise<typeof import('@/utils/playgamaPlugin')> | null = null
  const loadPlugin = (): Promise<typeof import('@/utils/playgamaPlugin')> => {
    if (!pluginPromise) pluginPromise = import('@/utils/playgamaPlugin')
    return pluginPromise
  }

  return {
    name: 'playgama',
    isReady,
    // Bridge does not expose per-format inventory queries; mirror the
    // coarse gate. The ad show wrappers degrade gracefully (resolve
    // void / false) when no fill is available.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked,
    init: async () => {
      try {
        const m = await loadPlugin()
        await m.playgamaPlugin()
        // Mirror the plugin's reactive flags into the provider's local
        // refs so the `useAds` computed reads see updates.
        watch(m.isPlaygamaSdkActive, (v) => {
          isReady.value = v && !m.isPlaygamaAdsBlocked.value
        }, { immediate: true })
        watch(m.isPlaygamaAdsBlocked, (v) => {
          isAdsBlocked.value = v
          if (v) isReady.value = false
        }, { immediate: true })
      } catch (e) {
        console.warn('[ads/playgama] plugin init failed', e)
      }
    },
    showRewardedAd: async () => {
      const m = await loadPlugin()
      return m.showRewardedPG()
    },
    showMidgameAd: async () => {
      const m = await loadPlugin()
      await m.showInterstitialPG()
    }
  }
}
