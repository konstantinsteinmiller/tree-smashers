// Single entry point for ad placements. Picks a provider at module load
// time based on build flags and re-exports a stable surface
// (`isAdsReady`, `showRewardedAd`, `showMidgameAd`, `initAds`) that the
// four in-game ad placements bind to without caring which backend is
// live.
//
// Provider selection:
//   • `isCrazyWeb` build        → CrazyGames SDK (gate also requires
//                                  `isCrazyGamesFullRelease` inside the
//                                  provider)
//   • `isGameDistribution` build → GameDistribution.com SDK
//   • `showMediatorAds && isNative` → Unity LevelPlay (Tauri plugin)
//   • everything else           → Noop (ads UI hidden, calls inert)
//
// The CrazyGames SDK is still initialised directly from `main.ts` — it
// has to run before the SaveManager hydrates. LevelPlay and GameDistribution
// init happen after mount via `initAds()` — LevelPlay because the native
// side needs the Android Activity / iOS ViewController to be alive,
// GameDistribution because the SDK script is dynamically injected and we
// don't want to pay that latency on the boot critical path.
import { computed, ref } from 'vue'
import { isCrazyWeb, isGameDistribution, isNative, showMediatorAds } from '@/use/useUser'
import type { AdProvider } from './ads/types'
import { createCrazyGamesProvider } from './ads/CrazyGamesProvider'
import { createGameDistributionProvider } from './ads/GameDistributionProvider'
import { createLevelPlayProvider } from './ads/LevelPlayProvider'
import { createNoopProvider } from './ads/NoopProvider'

const provider: AdProvider = isCrazyWeb
  ? createCrazyGamesProvider()
  : isGameDistribution
    ? createGameDistributionProvider()
    : (showMediatorAds && isNative)
      ? createLevelPlayProvider()
      : createNoopProvider()

export const adProviderName = provider.name
// `isAdsReady` is the coarse "SDK initialised" gate. Most placements
// should NOT bind directly to it — they want a per-format readiness
// flag that flips false when no ad is currently loaded, so the UI
// disappears instead of offering a button that does nothing on tap.
export const isAdsReady = computed(() => provider.isReady.value)
export const isRewardedReady = computed(() => provider.isRewardedReady.value)
export const isInterstitialReady = computed(() => provider.isInterstitialReady.value)
/** True once the active ad provider has detected a browser-extension
 *  ad-blocker (uBlock, AdGuard, Brave Shields, etc.). Drives the
 *  shared `AdsBlockedModal`. Always false on native builds. */
export const isAdsBlocked = computed(() => provider.isAdsBlocked.value)

/**
 * Toggled true by `showRewardedAd()` when the rewarded show resolved
 * `false` AND the active provider has detected an ad-blocker. The
 * `AdsBlockedModal` v-if's on this flag and exposes a dismiss action
 * via `dismissAdsBlockedModal()`.
 *
 * Only the REWARDED path triggers the modal — interstitial / midgame
 * ads aren't user-initiated, so a missed one shouldn't surface a
 * blocking explainer mid-game. The blocker flag itself still flips
 * true via that path so the modal will fire on the player's next
 * watch-ad tap.
 */
export const isAdsBlockedModalShown = ref(false)
export const dismissAdsBlockedModal = (): void => {
  isAdsBlockedModalShown.value = false
}

export const initAds = (): Promise<void> => provider.init()

export const showRewardedAd = async (): Promise<boolean> => {
  const granted = await provider.showRewardedAd()
  if (!granted && provider.isAdsBlocked.value) {
    isAdsBlockedModalShown.value = true
  }
  return granted
}

export const showMidgameAd = (): Promise<void> => provider.showMidgameAd()

const useAds = () => ({
  adProviderName,
  isAdsReady,
  isRewardedReady,
  isInterstitialReady,
  initAds,
  showRewardedAd,
  showMidgameAd
})

export default useAds
