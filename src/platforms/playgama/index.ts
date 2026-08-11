// ─── Playgama platform module ───────────────────────────────────────────────
//
// Playgama (playgama.com) is a casual-games portal that distributes its
// games via Playgama Bridge — a unified abstraction over 28+ portals
// (production Playgama, Yandex, CrazyGames, Poki, VK, GameSnacks, …).
// chaos-arena targets the production Playgama portal; the build runs in
// an iframe whose parent is detected automatically by the Bridge at
// `bridge.initialize()` time. We do NOT pass `forciblySetPlatformId` —
// the Bridge's auto-detection picks the right protocol per parent-frame
// handshake (see `vite.config.ts` + `playgamaPlugin.ts` for the failure
// modes of overriding it).
//
// Playgama supports cloud save (via `bridge.storage` with
// `platform_internal` storage type) and the full ad waterfall (rewarded,
// interstitial). The hostname matcher is empty / wildcard — Playgama's
// Technical Requirements explicitly forbid runtime URL gating, so the
// capability resolver passes the platform through on every host once
// the flag is set.

export type { PlatformModule } from '../types'

// Strategy class (cloud-save backed by `bridge.storage`).
export { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'

// Plugin surface (SDK init, locale, lifecycle messages, ad show wrappers).
export {
  playgamaPlugin,
  playgamaLoadingStart,
  playgamaGameLoadingStop,
  playgamaGameplayStart,
  playgamaGameplayStop,
  showInterstitialPG,
  showRewardedPG,
  isPlaygamaSdkActive,
  isPlaygamaAdsBlocked,
  isPlaygamaAdShowing,
  playgamaLocale,
  playgamaLocaleReady,
  registerPlaygamaMusicControls
} from '@/utils/playgamaPlugin'

// AdProvider wrapper.
export { createPlaygamaProvider } from '@/use/ads/PlaygamaProvider'

// Platform-module descriptor for the registry. Empty `hostnameMatcher`
// signals "no URL gate" — capabilities.ts treats the Playgama arm as
// flag-only and skips the hostname check entirely.
export const platform = {
  id: 'playgama' as const,
  envFlag: 'PLAYGAMA',
  capabilities: {
    hasCloudSave: true,
    hasAds: true,
    hostnameMatcher: '',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
