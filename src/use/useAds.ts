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
import { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isNative, showMediatorAds } from '@/use/useUser'
import type { AdProvider } from './ads/types'
import { resolveAdProvider } from '@/platforms/resolveAdProvider'
import { isRewardedThrottled, recordRewardedGranted } from '@/use/useRewardedThrottle'

const provider: AdProvider = resolveAdProvider({
  flags: { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution },
  showMediatorAds,
  isNative
})

export const adProviderName = provider.name
// `isAdsReady` is the coarse "SDK initialised" gate. Most placements
// should NOT bind directly to it — they want a per-format readiness
// flag that flips false when no ad is currently loaded, so the UI
// disappears instead of offering a button that does nothing on tap.
export const isAdsReady = computed(() => provider.isReady.value)
// Throttle ride-along: when the player has already watched
// `MAX_REWARDED` rewarded videos in the trailing 10-min window, we
// flip `isRewardedReady` false so every reward placement
// (RouletteWheel respin, AdRewardButton, 2x speed boost) hides — the
// same UX as a no-fill SDK state. Anti-abuse for kids audience: caps
// the watch-only reward farming pattern.
export const isRewardedReady = computed(() =>
  provider.isRewardedReady.value && !isRewardedThrottled.value
)
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
  // Throttle gate: refuse the SDK call once the player has burned
  // their 10-min budget. Returning `false` here matches the
  // contract callers already handle (no grant). The reward UI is
  // already hidden via `isRewardedReady`, so this branch only fires
  // if a placement somehow bypassed that check.
  if (isRewardedThrottled.value) return false
  const granted = await provider.showRewardedAd()
  if (granted) {
    recordRewardedGranted()
  } else if (provider.isAdsBlocked.value) {
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
