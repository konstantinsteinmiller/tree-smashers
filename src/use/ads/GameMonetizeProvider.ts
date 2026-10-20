// GameMonetize.com ad provider — wraps `gameMonetizePlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// The plugin import is STATIC, like `PokiProvider`: a dynamic `import('@/…')`
// in a file that is not on the obfuscator's exclude list has its specifier
// mangled by the `stringArray` pass. On every other build `resolve.alias`
// swaps both this file and the plugin for their stubs.
//
// `managesMidgameAudio` is left unset: nothing mutes up front for this
// provider. The SDK's own `SDK_GAME_PAUSE` edge (published as `isGmAdShowing`,
// consumed in `App.vue`) pauses the loop and the music, and it fires only when
// an ad really opens — so a no-fill leaves the audio alone.

import { computed } from 'vue'
import {
  gameMonetizePlugin,
  isGmAdsBlocked,
  isGmSdkActive,
  showMidgameAdGM,
  showRewardedAdGM
} from '@/utils/gameMonetizePlugin'
import type { AdProvider } from './types'

export const createGameMonetizeProvider = (): AdProvider => {
  const isReady = computed(() => isGmSdkActive.value)
  return {
    name: 'gamemonetize',
    isReady,
    // The SDK has no per-format readiness query; both mirror the coarse gate.
    // A no-fill resolves `false` / returns within ~3 s (see the plugin), and
    // `useRewardedThrottle` caps how often a rewarded button can be offered.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked: isGmAdsBlocked,
    init: async () => {
      try {
        await gameMonetizePlugin()
      } catch (e) {
        console.warn('[ads/gamemonetize] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdGM(),
    showMidgameAd: () => showMidgameAdGM()
  }
}
