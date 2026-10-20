// ─── GameMonetize platform module ───────────────────────────────────────────
//
// DESCRIPTOR ONLY — no `export … from '@/utils/gameMonetizePlugin'`. Every
// descriptor is statically imported by `../index.ts`, so a re-export here
// would put the SDK plugin into every build's entry graph (see the warning at
// the top of that file).
//
// Consumers import the implementation from its own module:
//   • `@/utils/gameMonetizePlugin`        — SDK init, ad bracket, show wrappers
//   • `@/utils/save/GameMonetizeStrategy` — local-only save strategy
//   • `@/use/ads/GameMonetizeProvider`    — AdProvider wrapper
//
// GameMonetize is an ad DISTRIBUTION network: one upload is embedded across
// many partner sites, so there is no hostname to lock to and `capabilities.ts`
// treats this arm as flag-only, like Playgama and Poki. Its SDK is ads only —
// no cloud save, no locale, no loading / game-ready signals.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'gamemonetize' as const,
  envFlag: 'GAME_MONETIZE',
  capabilities: {
    hasCloudSave: false,
    hasAds: true,
    // Deliberately empty: NO hostname gate (see above).
    hostnameMatcher: '',
    portalEnforcesAgeGate: false,
    // Child-directed ad treatment is a Tauri (app-store) build concern only.
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
