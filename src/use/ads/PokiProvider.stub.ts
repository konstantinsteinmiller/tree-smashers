// ─── PokiProvider no-op stub (non-Poki builds only) ─────────────────────────
// See `CrazyGamesProvider.stub.ts` for rationale: `resolveAdProvider`
// STATICALLY imports every provider, so a foreign provider's function body —
// including its `name: 'poki'` literal — lives in every bundle unless aliased
// away. Paired with `pokiPlugin.stub.ts`, which keeps the SDK URL out.
import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createPokiProvider = (): AdProvider => ({
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
