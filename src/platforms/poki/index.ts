// ─── Poki platform module ───────────────────────────────────────────────────
//
// DESCRIPTOR ONLY — deliberately no `export … from '@/utils/pokiPlugin'`.
//
// The upstream template for this file re-exports the plugin, the strategy and
// the provider as a convenience barrel. That is wrong in this repo:
// `src/platforms/index.ts` statically imports every descriptor to build
// `ALL_PLATFORMS`, so a re-export drags that platform's SDK into EVERY build's
// entry graph. It is how the Playgama build we submitted to YouTube Playables
// ended up preloading a 277 KB `plugin-gd-*.js` chunk. See the warning at the
// top of `../index.ts`.
//
// (The `resolve.alias` stub swap in `vite.config.ts` would blunt the damage
// here — non-Poki builds would pull the no-op stub rather than the real module
// — but "a stub in every bundle" is still worse than nothing in them, and the
// rule is easier to hold than to reason about per platform.)
//
// Consumers import the implementation from its own module:
//   • `@/utils/pokiPlugin`        — init, gameplay bracket, ad wrappers, measure
//   • `@/utils/save/PokiStrategy` — local-only save strategy
//   • `@/use/ads/PokiProvider`    — AdProvider wrapper
//
// Poki is unlike every other portal in this matrix in three ways, all of which
// are handled elsewhere and none of which are visible from this descriptor:
// it ships NO CSP meta tag (`csp.ts` returns '' for the Poki build), it forbids
// every external runtime request, and it has no cloud-save API — its wrapper
// mirrors the iframe's whole localStorage + IndexedDB for logged-in players
// with no game code involved.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'poki' as const,
  envFlag: 'POKI',
  capabilities: {
    // No cloud-save API, and none needed — see `PokiStrategy` for the three
    // rules that come with the wrapper doing it for us (1 MB gzip cap, the
    // reserved `poki_` key prefix, and the incognito try/catch requirement).
    hasCloudSave: false,
    hasAds: true,
    // Deliberately empty: NO hostname gate. The bundle has to run in the Poki
    // Inspector (inspector.poki.dev) and in P4D Preview as well as on the
    // production `*.poki-gdn.com` origin, so a URL gate would fail QA before
    // it ever reached a player. `capabilities.ts` treats the Poki arm as
    // flag-only, like Playgama.
    hostnameMatcher: '',
    portalEnforcesAgeGate: false,
    // Poki Kids (`?tag=kids`) is handled inside the SDK itself: the ad core is
    // never loaded and every call auto-resolves. Nothing for the game to
    // signal, and nothing to gate behind a reward there — `rewardedBreak()`
    // resolves `false`.
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
