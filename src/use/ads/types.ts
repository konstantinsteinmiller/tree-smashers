// Provider-agnostic ad surface. Every platform-specific ad backend
// (CrazyGames SDK, Google AdMob via the Tauri mobile plugin, etc.)
// implements this interface so the four in-game ad placements
// (midgame interstitial, AdRewardButton, RouletteWheel respin, 2x
// speed-boost reward) never have to know which provider is active.
//
// Three reactive readiness gates:
//   • `isReady`           — the SDK finished init AND we're in a build
//                           where ads are expected at all. Coarse gate
//                           kept for legacy callers.
//   • `isRewardedReady`   — a rewarded video is currently loaded and
//                           the next `showRewardedAd()` will play one.
//                           Drives v-if on AdRewardButton, the roulette
//                           respin button, and the 2x speed-boost
//                           switch — anything offering a rewarded ad.
//   • `isInterstitialReady` — an interstitial is currently loaded.
//                             Used to gate the midgame battle-cadence
//                             ad so we don't pause gameplay only to
//                             fall back to "no fill".
//
// Per-format readiness flips false the moment an ad is consumed (or
// fails to load) and flips back true on the next `onAdLoaded` event
// from the native SDK. This is what guarantees buttons disappear when
// inventory runs out — exactly what we want for a kids app where
// stale "watch ad" prompts that do nothing are user-hostile.
//
// Contract notes:
//   • `showRewardedAd` resolves `true` only if the video played all the
//     way through — callers grant the reward only on `true`.
//   • `showMidgameAd` resolves when the interstitial finished or
//     errored. It never rejects: callers `await` it and resume gameplay.
//   • `init` is idempotent and safe to call when the provider is inert
//     (e.g. Noop on unsupported platforms).
import type { Ref } from 'vue'

export interface AdProvider {
  /** Human-readable name for logs / telemetry. */
  readonly name: string
  /** Reactive: true once the SDK is up and serving ads is possible. */
  readonly isReady: Ref<boolean>
  /** Reactive: true when a rewarded video is loaded and showable now. */
  readonly isRewardedReady: Ref<boolean>
  /** Reactive: true when an interstitial is loaded and showable now. */
  readonly isInterstitialReady: Ref<boolean>
  /**
   * Reactive: true when the active SDK has detected that the player's
   * browser is blocking ad requests (uBlock, AdGuard, Brave Shields,
   * Pi-hole, etc.). Used by the in-game `AdsBlockedModal` to explain why
   * the watch-ad button just refused to grant a reward.
   *
   * Each provider populates this differently:
   *   - CrazyGames    → `sdk.ad.hasAdblock()` at init + error.code on show.
   *   - GameDistribution → SDK_ERROR events with `Blocked:` messages.
   *   - AdMob (native) → always false; mobile SDKs aren't subject to
   *                          browser-extension blockers.
   *   - Noop           → always false.
   *
   * IMPORTANT: granting rewards when ads were blocked is against most
   * platforms' TOS (and the publisher won't pay you). The modal is the
   * honest path — explain, don't reward.
   */
  readonly isAdsBlocked: Ref<boolean>
  /**
   * Reactive, optional: false once the portal has said it can NEVER serve a
   * rewarded ad in this session (Playgama Bridge's
   * `advertisement.isRewardedSupported`). Unlike `isRewardedReady` (nothing
   * loaded right now — try again soon) this is final, so the ad-unlock
   * placements switch to their coin price. Absent = supported.
   */
  readonly isRewardedSupported?: Ref<boolean>
  /**
   * True when the provider handles the ad-audio guarantee itself, on the
   * real-ad edge, rather than the caller muting up front.
   *
   * Poki is the reason this exists. `commercialBreak(onStart)` invokes
   * `onStart` ONLY when a video ad genuinely opens — a no-fill resolves the
   * promise without ever calling it. Muting before the request would cut the
   * win/lose stinger for an ad the player never saw, on every unfilled break.
   * Providers that pause via their portal's own signal (CrazyGames'
   * `adStarted`, the Playgama Bridge's PAUSE_STATE_CHANGED) leave this unset.
   */
  readonly managesMidgameAudio?: boolean
  /**
   * Reactive, optional: the provider's consent platform says the player must
   * be able to reopen their privacy choice (Google UMP in GDPR regions). The
   * Options menu shows a "Privacy settings" entry while this is true.
   */
  readonly privacyOptionsRequired?: Ref<boolean>
  /** Reopens the consent form. Only providers with a consent platform. */
  showPrivacyOptions?: () => Promise<void>
  init: () => Promise<void>
  showRewardedAd: () => Promise<boolean>
  /**
   * @param onImpression invoked only if a video ad actually opens. Providers
   *   that set `managesMidgameAudio` fire it on that edge; the rest ignore it.
   */
  showMidgameAd: (onImpression?: () => void) => Promise<void>
}
