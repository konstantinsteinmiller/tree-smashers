// ─── First-load interstitial ────────────────────────────────────────────────
//
// GameMonetize moderation requires an ad the first time after the game loads
// (verbatim rejection: "Ads should be shown the first time after the game
// loads"). The ordinary cadence cannot provide it — its first interstitial
// comes before battle 2.
//
// Readiness is WATCHED, never sampled. The game has no main menu and boots
// straight into the arena, while the ad SDK is a cross-origin script injected
// after mount: at any single moment the boot path could look, the SDK is not
// ready yet, and a one-shot check there means no ad in any session, with
// nothing logged. So this fires on the first moment ALL of these hold:
//
//   • the splash is gone (`splashGone` — the same edge as the portals'
//     game-ready signals),
//   • an interstitial can be shown,
//   • the forced-dark-mode notice is not up (the placement stays armed under
//     it rather than being spent).
//
// Once per page load. Only `App.vue`'s GameMonetize block arms it, behind an
// env literal, so no other build ever calls into this module.

import { watch, type Ref } from 'vue'
import { isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { isForcedDarkBlocking } from '@/use/useForcedDarkModeGuard'
import { markFirstMidgameAdShown, resetAdCounter } from '@/use/midgameCadence'

let armed = false
let fired = false

export const armFirstLoadInterstitial = (splashGone: Ref<boolean>): void => {
  if (armed) return
  armed = true
  const stop = watch(
    [splashGone, isInterstitialReady, isForcedDarkBlocking],
    ([gone, ready, blocked]) => {
      if (fired || !gone || !ready || blocked) return
      fired = true
      // `stop` is not assigned yet when an immediate run gets here.
      queueMicrotask(() => stop())
      // This ad IS the first interstitial of the session: restart the
      // between-battles cadence from it, or the pre-battle placement would
      // request a second one a battle later, inside the window the SDK
      // rate-limits ("requested too soon").
      resetAdCounter()
      markFirstMidgameAdShown()
      // Audio and the game loop are paused on the SDK's own ad-opened edge
      // (`isGmAdShowing` in App.vue), which keeps the play intent — so music
      // resumes by itself when the ad closes, and a no-fill touches nothing.
      void showMidgameAd().catch((e) => console.warn('[first-load-ad] failed', e))
    },
    { immediate: true }
  )
}

/** Test seam. */
export const resetFirstLoadInterstitialForTests = (): void => {
  armed = false
  fired = false
}
