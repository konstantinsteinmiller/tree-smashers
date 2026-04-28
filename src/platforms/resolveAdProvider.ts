// ─── Ad-provider resolver ───────────────────────────────────────────────────
//
// Pure function. Takes the platform flags + the two ad-related flags
// (`showMediatorAds`, `isNative`) and returns the right `AdProvider`.
// Lifted from the inline ternary in `useAds.ts:29-35` so the branching
// is testable.
//
// Priority order MUST match `useAds.ts`'s historical ternary:
//   1. isCrazyWeb              → CrazyGames provider
//   2. isGameDistribution      → GameDistribution provider
//   3. showMediatorAds + isNative → LevelPlay (mobile mediation)
//   4. else                    → Noop (UI hidden, calls inert)
//
// All providers are constructed eagerly — they're cheap (no SDK init
// inside the constructor; init happens via `provider.init()` later).
// Adding a new ad-capable platform = add an arm here.

import { createCrazyGamesProvider } from '@/use/ads/CrazyGamesProvider'
import { createGameDistributionProvider } from '@/use/ads/GameDistributionProvider'
import { createLevelPlayProvider } from '@/use/ads/LevelPlayProvider'
import { createNoopProvider } from '@/use/ads/NoopProvider'
import type { AdProvider } from '@/use/ads/types'
import type { PlatformFlags } from './capabilities'

export interface AdResolverInput {
  flags: PlatformFlags
  /** True when the build wants to show mediator ads (LevelPlay), env-driven. */
  showMediatorAds: boolean
  /** True when running inside a Tauri / native shell (Android, iOS, desktop). */
  isNative: boolean
}

export const resolveAdProvider = (input: AdResolverInput): AdProvider => {
  const { flags, showMediatorAds, isNative } = input
  if (flags.isCrazyWeb) return createCrazyGamesProvider()
  if (flags.isGameDistribution) return createGameDistributionProvider()
  if (showMediatorAds && isNative) return createLevelPlayProvider()
  return createNoopProvider()
}
