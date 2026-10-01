// ─── Rewarded-ad intro screen (Families / AdMob requirement) ────────────────
//
// Two policies converge on the same UI, and this module is the single seam
// that satisfies both:
//
//   1. **AdMob rewarded interstitial.** Google's integration guide is
//      explicit: "Before displaying a rewarded interstitial ad to users, you
//      must present the user with an intro screen that provides clear reward
//      messaging and an option to skip the ad before it starts." Rewarded
//      interstitial is the only ad format the native build ships, because it
//      is the only AdMob format that serves skippable creatives exclusively —
//      which is what makes the ad closeable inside the 5 seconds that Google
//      Play's Families Ad Format Requirements demand.
//
//   2. **Families "unclear ads/offers".** The 2026-09 Play rejection of
//      com.chaos.arena also cited ads that are not clearly distinguishable
//      from app content. A modal that says the word "Advertisement" before
//      anything full-screen appears is the cleanest possible answer to that.
//
// ## Shape
//
// `requestRewardedIntro()` opens the modal and returns a promise that settles
// when the player picks. `true` → go show the ad. `false` → they declined, and
// no ad request is made at all.
//
// It is called from ONE place: `useAds.showRewardedAd()`. Every rewarded
// placement in the game (AdRewardButton, RewardedAdButton's 2x claim, the
// roulette respin, the 2x speed boost) routes through that function, so they
// all inherit the intro without a per-call-site change — and no future
// placement can forget it.
//
// ## Why native-only
//
// Web portals (CrazyGames, GameDistribution, Playgama, GamePix, …) run their
// own compliant rewarded flow and several of them show their own pre-ad
// prompt; stacking a second modal on top is worse UX and is not required by
// any of their QA checklists. The gate is therefore `isNative`.
import { ref } from 'vue'
import { isNative } from '@/use/useUser'

/** True on builds whose ad provider requires a developer-supplied intro
 *  screen before the ad is requested (native / AdMob rewarded interstitial). */
export const requiresRewardedIntro = isNative

/** Reactive: the modal is on screen and waiting for a choice. */
export const isRewardedIntroOpen = ref(false)

/**
 * What the player is about to earn, in structured form.
 *
 * Deliberately NOT a pre-built string: the modal renders it through i18n
 * (`rewardedIntro.rewardCoins` etc., interpolated into `rewardedIntro.bodyReward`),
 * so pluralisation and word order stay inside the translation files instead of
 * being concatenated in TypeScript. `null` selects the generic copy.
 */
export type RewardedIntroReward = {
  /** Quantity, for the currency kinds and 'fights' (extra league fights).
   *  Ignored by 'speed', 'respin' and 'skinAd' (one ad unlocks one skin). */
  amount?: number
  kind: 'coins' | 'diamonds' | 'speed' | 'respin' | 'skinAd' | 'fights'
}

export const rewardedIntroReward = ref<RewardedIntroReward | null>(null)

// Exactly one decision can be pending. A second `requestRewardedIntro` while
// the modal is already open would otherwise strand the first promise forever;
// we settle it as declined and take over.
let pendingResolve: ((accepted: boolean) => void) | null = null

const settle = (accepted: boolean): void => {
  const resolve = pendingResolve
  pendingResolve = null
  isRewardedIntroOpen.value = false
  rewardedIntroReward.value = null
  resolve?.(accepted)
}

/**
 * Show the intro screen and wait for the player's choice.
 *
 * @param reward what the player earns by watching; `null` for generic copy.
 * @returns `true` when the player opted in, `false` when they declined.
 */
export const requestRewardedIntro = (reward: RewardedIntroReward | null = null): Promise<boolean> => {
  // Take over from any already-open prompt rather than leaving it hanging.
  if (pendingResolve) settle(false)

  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve
    rewardedIntroReward.value = reward
    isRewardedIntroOpen.value = true
  })
}

/** Player opted in — the caller proceeds to request and show the ad. */
export const acceptRewardedIntro = (): void => settle(true)

/**
 * Player declined (button, backdrop tap, or Escape). No ad is requested and
 * no reward is granted. Declining must always be as easy as accepting — the
 * Families policy is explicit that the decline option may not be hidden,
 * obstructed, or non-functional.
 */
export const declineRewardedIntro = (): void => settle(false)
