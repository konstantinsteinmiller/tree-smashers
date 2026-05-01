// GameDistribution.com ad provider — wraps the lazy-loaded
// `gameDistributionPlugin` in the cross-platform `AdProvider` surface
// consumed by `useAds`.
//
// ## Heavy plugin imports are DYNAMIC. Why:
//
// `@/utils/gameDistributionPlugin` is ~486 LOC and contains the GD SDK
// loader (script injection, ad event plumbing, save-strategy ctor).
// Statically importing it here pulls every line into whichever chunk
// imports this file — i.e. the entry chunk for every build, since
// `resolveAdProvider` references this provider sync regardless of the
// active platform.
//
// Loading the plugin lazily inside the provider methods means a
// non-GD build (CrazyGames, Glitch, etc.) never executes the dynamic
// import and Rollup emits the plugin as its own on-demand chunk that
// no production code path touches. Net win on the CG QA-flagged
// bundle bloat: ~150KB raw / ~50KB gzipped.
//
// Obfuscator note: the project's `vite-plugin-javascript-obfuscator`
// `stringArray` transform rewrites the literal `'@/...'` inside dynamic
// imports and breaks them at runtime. THIS file is excluded from the
// obfuscator (see `vite.config.ts`) so the dynamic-import string
// survives. The plugin module itself can stay obfuscated — the
// obfuscator is only harmful for files that *contain* `await import`.

import { ref, watch } from 'vue'
import type { AdProvider } from './types'

export const createGameDistributionProvider = (): AdProvider => {
  // Local refs the provider exposes in its `AdProvider` shape. They start
  // false and are bridged from the plugin's own refs once the plugin
  // module is loaded (see `init()` below).
  const isReady = ref(false)
  const isAdsBlocked = ref(false)

  // Cache the plugin module so repeated method calls only pay one
  // dynamic-import round trip. Vite/Rollup also cache module
  // instances, so this is mostly belt-and-suspenders.
  let pluginPromise: Promise<typeof import('@/utils/gameDistributionPlugin')> | null = null
  const loadPlugin = (): Promise<typeof import('@/utils/gameDistributionPlugin')> => {
    if (!pluginPromise) {
      pluginPromise = import('@/utils/gameDistributionPlugin')
    }
    return pluginPromise
  }

  return {
    name: 'gameDistribution',
    isReady,
    // GD SDK has no per-format readiness query; mirror the coarse gate.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked,
    init: async () => {
      try {
        const m = await loadPlugin()
        await m.gameDistributionPlugin()
        // Mirror the plugin's reactive flags into the provider's local
        // refs so consumers (computed in `useAds`) see updates.
        watch(m.isGdSdkActive, (v) => {
          isReady.value = v
        }, { immediate: true })
        watch(m.isGdAdsBlocked, (v) => {
          isAdsBlocked.value = v
        }, { immediate: true })
      } catch (e) {
        console.warn('[ads/gd] plugin init failed', e)
      }
    },
    showRewardedAd: async () => {
      const m = await loadPlugin()
      return m.showRewardedAdGD()
    },
    showMidgameAd: async () => {
      const m = await loadPlugin()
      return m.showMidgameAdGD()
    }
  }
}
