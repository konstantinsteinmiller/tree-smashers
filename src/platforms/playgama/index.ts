// ─── Playgama platform module ───────────────────────────────────────────────
//
// Playgama (playgama.com) is a casual-games portal that distributes its
// games via Playgama Bridge — a unified abstraction over 28+ portals
// (production Playgama, Yandex, CrazyGames, Poki, VK, GameSnacks, …).
// tree-smashers targets the production Playgama portal; the build runs in
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

// DESCRIPTOR ONLY — no `export … from '@/utils/playgamaPlugin'` here. The
// registry statically imports every descriptor, so a re-export of the Bridge
// wiring would land it in every other platform's entry graph. See the note in
// `../gamedistribution/index.ts` for what that cost us on the YouTube
// submission. App.vue, `resolveSaveStrategy` and `PlaygamaProvider` import the
// implementation from its own module instead.

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
