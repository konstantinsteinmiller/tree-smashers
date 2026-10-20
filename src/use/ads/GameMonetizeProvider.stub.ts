// ─── GameMonetizeProvider no-op stub (non-GameMonetize builds only) ─────────
// See `PokiProvider.stub.ts` for rationale: `resolveAdProvider` STATICALLY
// imports every provider, so a foreign provider's function body — including
// its name literal — lives in every bundle unless aliased away. Paired with
// `gameMonetizePlugin.stub.ts`, which keeps the SDK URL out.
import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createGameMonetizeProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {
  },
  showRewardedAd: async () => false,
  showMidgameAd: async () => {
  }
})
