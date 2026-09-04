// ─── Ad-provider resolver ───────────────────────────────────────────────────
//
// Pure function. Returns the right `AdProvider` for the active build.
// Lifted from the inline ternary in `useAds.ts:29-35` so the branching
// is testable.
//
// ## Branches are gated on `import.meta.env.VITE_APP_*`, not the input
// flags. Why:
//
// The previous version branched on `input.flags.isXxx` — runtime
// parameters that Rollup cannot statically analyse. Result: every
// platform's provider was bundled into every build, dragging
// `@tauri-apps/api/core` (via the native ads provider) and the GD provider
// into CrazyGames builds and inflating the entry chunk.
//
// `import.meta.env.VITE_APP_X` is replaced with a string literal at
// build time. `if ('false' === 'true')` is dead code, and Rollup
// removes both the branch AND any imports only reached through it.
// Net effect: a CrazyGames build only links `CrazyGamesProvider`;
// the AdMob and GameDistribution providers tree-shake to zero.
//
// `useAds.ts` calls this synchronously at module load, so the
// resolver stays sync — we keep static imports (instead of dynamic
// `await import`) so the function can return without async handoff.
//
// ## Priority order MUST match `useAds.ts`'s historical ternary:
//   1. isCrazyWeb              → CrazyGames provider
//   2. isGameDistribution      → GameDistribution provider
//   3. isPlaygama              → Playgama Bridge provider
//   4. showMediatorAds + isNative → AdMob (direct, no mediation)
//   5. else                    → Noop (UI hidden, calls inert)

import { createCrazyGamesProvider } from '@/use/ads/CrazyGamesProvider'
import { createGameDistributionProvider } from '@/use/ads/GameDistributionProvider'
import { createAdMobProvider } from '@/use/ads/AdMobProvider'
import { createNoopProvider } from '@/use/ads/NoopProvider'
import { createPlaygamaProvider } from '@/use/ads/PlaygamaProvider'
import type { AdProvider } from '@/use/ads/types'
import type { PlatformFlags } from './capabilities'

export interface AdResolverInput {
  flags: PlatformFlags
  /** True when the native build should serve ads at all, env-driven via
   *  `VITE_APP_SHOW_MEDIATOR_ADS`. The name is historical — the native path
   *  no longer uses a mediator; it talks to AdMob directly. */
  showMediatorAds: boolean
  /** True when running inside a Tauri / native shell (Android, iOS, desktop). */
  isNative: boolean
}

export const resolveAdProvider = (input: AdResolverInput): AdProvider => {
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') return createCrazyGamesProvider()
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') return createGameDistributionProvider()
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') return createPlaygamaProvider()
  if (import.meta.env.VITE_APP_NATIVE === 'true' && input.showMediatorAds && input.isNative) {
    return createAdMobProvider()
  }
  return createNoopProvider()
}
