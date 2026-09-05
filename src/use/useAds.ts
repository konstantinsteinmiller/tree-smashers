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
//   • `showMediatorAds && isNative` → Google AdMob (Tauri plugin, direct —
//                                  no mediation; see AdMobProvider.ts)
//   • everything else           → Noop (ads UI hidden, calls inert)
//
// The CrazyGames SDK is still initialised directly from `main.ts` — it
// has to run before the SaveManager hydrates. AdMob and GameDistribution
// init happen after mount via `initAds()` — AdMob because the native
// side needs the Android Activity / iOS ViewController to be alive,
// GameDistribution because the SDK script is dynamically injected and we
// don't want to pay that latency on the boot critical path.
import { computed, ref } from 'vue'
import {
  isCrazyWeb,
  isWaveDash,
  isItch,
  isGlitch,
  isGameDistribution,
  isY8,
  isGamePix,
  isPlaygama,
  isPoki,
  isNative,
  showMediatorAds
} from '@/use/useUser'
import type { AdProvider } from './ads/types'
import { resolveAdProvider } from '@/platforms/resolveAdProvider'
import { isRewardedThrottled, recordRewardedGranted } from '@/use/useRewardedThrottle'
import {
  requestRewardedIntro,
  requiresRewardedIntro,
  type RewardedIntroReward
} from '@/use/useRewardedIntro'

const provider: AdProvider = resolveAdProvider({
  flags: {
    isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isY8, isGamePix,
    isPlaygama, isPoki
  },
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

/**
 * Show a rewarded ad and report whether the reward was earned.
 *
 * @param reward what the player earns, shown on the intro screen. Structured
 *   rather than a string so the modal can render it through i18n. Optional —
 *   omit it and the generic copy is used.
 *
 * Two gates run before the provider is ever asked for an ad:
 *
 *   1. **Throttle.** Refuse the SDK call once the player has burned their
 *      10-minute budget. Returning `false` matches the contract callers
 *      already handle (no grant). The reward UI is already hidden via
 *      `isRewardedReady`, so this only fires if a placement bypassed it.
 *
 *   2. **Intro screen** (native builds). AdMob's rewarded-interstitial format
 *      requires a developer-supplied intro naming the reward with a working
 *      decline option, and Google Play's Families policy requires ads to be
 *      clearly distinguishable from game content. Declining resolves `false`
 *      and no ad request is made. This is the ONLY place the intro is
 *      triggered, so every present and future rewarded placement inherits it.
 *      See `useRewardedIntro.ts`.
 */
export const showRewardedAd = async (reward: RewardedIntroReward | null = null): Promise<boolean> => {
  if (isRewardedThrottled.value) return false
  if (requiresRewardedIntro) {
    const accepted = await requestRewardedIntro(reward)
    if (!accepted) return false
  }
  const granted = await provider.showRewardedAd()
  if (granted) {
    recordRewardedGranted()
  } else if (provider.isAdsBlocked.value && !isCrazyWeb) {
    // CrazyGames SDK shows its own ad-blocker dialog; suppress ours to
    // avoid stacking two explainers on top of each other.
    isAdsBlockedModalShown.value = true
  }
  return granted
}

/**
 * @param onImpression optional, and only meaningful for a provider that sets
 *   `managesMidgameAudio` (Poki). It fires on the real-ad edge — the one
 *   moment a portal without a pause signal gives the game to duck its audio —
 *   and never fires on a no-fill, so an unfilled break leaves the music alone.
 */
export const showMidgameAd = (onImpression?: () => void): Promise<void> =>
  provider.showMidgameAd(onImpression)

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
