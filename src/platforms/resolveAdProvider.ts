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
// the LevelPlay and GameDistribution providers tree-shake to zero.
//
// `useAds.ts` calls this synchronously at module load, so the
// resolver stays sync — we keep static imports (instead of dynamic
// `await import`) so the function can return without async handoff.
//
// ## Priority order MUST match `useAds.ts`'s historical ternary:
//   1. isCrazyWeb              → CrazyGames provider
//   2. isGameDistribution      → GameDistribution provider
//   3. isPlaygama              → Playgama Bridge provider
//   4. showMediatorAds + isNative → LevelPlay (ironSource + AdMob + Unity Ads)
//   5. isPoki                  → Poki provider
//   6. isGameMonetize          → GameMonetize provider
//   7. else                    → Noop (UI hidden, calls inert)
//
// The Poki and GameMonetize imports are static like the rest, and on a build
// for another platform `resolve.alias` swaps each for its `*.stub.ts`
// (`PokiProvider.stub.ts`, `GameMonetizeProvider.stub.ts`). That alias is NOT
// belt-and-braces: this file statically imports every provider, so each
// provider's function body lands in every bundle — and the obfuscator's
// `stringArray` pass hoists string literals BEFORE esbuild folds the env
// comparison, so the PokiSDK URL survives dead-code elimination without it.

import { createCrazyGamesProvider } from '@/use/ads/CrazyGamesProvider'
import { createGameDistributionProvider } from '@/use/ads/GameDistributionProvider'
import { createLevelPlayProvider } from '@/use/ads/LevelPlayProvider'
import { createNoopProvider } from '@/use/ads/NoopProvider'
import { createPlaygamaProvider } from '@/use/ads/PlaygamaProvider'
import { createPokiProvider } from '@/use/ads/PokiProvider'
import { createGameMonetizeProvider } from '@/use/ads/GameMonetizeProvider'
import type { AdProvider } from '@/use/ads/types'
import type { PlatformFlags } from './capabilities'

export interface AdResolverInput {
  flags: PlatformFlags
  /** True when the native build should serve ads at all, env-driven via
   *  `VITE_APP_SHOW_MEDIATOR_ADS` (LevelPlay mediation). */
  showMediatorAds: boolean
  /** True when running inside a Tauri / native shell (Android, iOS, desktop). */
  isNative: boolean
}

export const resolveAdProvider = (input: AdResolverInput): AdProvider => {
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') return createCrazyGamesProvider()
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') return createGameDistributionProvider()
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') return createPlaygamaProvider()
  if (import.meta.env.VITE_APP_POKI === 'true') return createPokiProvider()
  if (import.meta.env.VITE_APP_GAME_MONETIZE === 'true') return createGameMonetizeProvider()
  if (import.meta.env.VITE_APP_NATIVE === 'true' && input.showMediatorAds && input.isNative) {
    return createLevelPlayProvider()
  }
  return createNoopProvider()
}
