// ─── GamePix platform module ────────────────────────────────────────────────
//
// GamePix (gamepix.com) is a casual-games portal that hosts the game in
// an iframe under `*.gamepix.com`. They publish a Game SDK (banner /
// rewarded / interstitial ads, happy-moment, pause/ready signals,
// optional leaderboard) but consuming it is opt-in — for chaos-arena
// we ship the same minimal shape as itch.io and y8: no cloud-save API,
// no in-frame ads, no parent-origin handshake. The platform module
// exists so App.vue's hostname gate, the resolver chain, and the
// registry treat GamePix uniformly with the others.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'gamepix' as const,
  envFlag: 'GAMEPIX',
  capabilities: {
    hasCloudSave: false,
    hasAds: false,
    hostnameMatcher: 'gamepix',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
