// GameDistribution.com ad provider — wraps the lazy-loaded
// `gameDistributionPlugin` in the cross-platform `AdProvider` surface
// consumed by `useAds`.
//
// Imports of the plugin module are STATIC, even though the original draft
// used `await import('@/utils/gameDistributionPlugin')`. Reason: this
// project's `vite.config.ts` runs `vite-plugin-javascript-obfuscator`
// over every src file except the small allow-list (main.ts, router,
// i18n) — its `stringArray` transform rewrites the literal `'@/...'`
// inside dynamic imports so Rollup can no longer recognise it as a
// chunk reference. The browser then sees the bare specifier and throws
// `Failed to resolve module specifier '@/utils/gameDistributionPlugin'`
// at runtime. A static import is detected by Rollup before the
// obfuscator runs, and tree-shaking eliminates the plugin code entirely
// in non-GD builds (because `useAds.ts` only references this provider
// when `isGameDistribution` is true, which `import.meta.env` resolves
// to a static `false` for other build modes).
//
// `gameDistributionPlugin()` is awaited from `init()` AND fired from
// `main.ts` in parallel. The plugin caches its init promise, so the
// second call is a no-op that resolves to the same result — by the time
// `useAds.initAds()` runs post-mount the SDK is typically already up.

import { computed } from 'vue'
import {
  gameDistributionPlugin,
  isGdAdsBlocked,
  isGdSdkActive,
  showMidgameAdGD,
  showRewardedAdGD
} from '@/utils/gameDistributionPlugin'
import type { AdProvider } from './types'

export const createGameDistributionProvider = (): AdProvider => {
  const isReady = computed(() => isGdSdkActive.value)
  return {
    name: 'gameDistribution',
    isReady,
    // GD SDK has no per-format readiness query; mirror the coarse gate.
    // The SDK reports "no fill" via the showAd() promise rejection at
    // request time, surfaced as `false` / no-op by the show wrappers.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked: isGdAdsBlocked,
    init: async () => {
      try {
        await gameDistributionPlugin()
      } catch (e) {
        console.warn('[ads/gd] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdGD(),
    showMidgameAd: () => showMidgameAdGD()
  }
}
