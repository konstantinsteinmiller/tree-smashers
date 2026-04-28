// ─── Save-strategy resolver ─────────────────────────────────────────────────
//
// Pure function that takes the platform flags and returns the right
// `SaveStrategy`. Lifted from the inline ternary in `main.ts` so the
// branching is testable in isolation.
//
// ## All imports are STATIC, not dynamic. Why:
//
// `vite.config.ts` runs `vite-plugin-javascript-obfuscator` over every
// file in `src/` except a tiny allow-list (main.ts, router, i18n). Its
// `stringArray` transform rewrites string literals — including the
// `'@/...'` paths inside `await import('@/...')`. Rollup parses dynamic
// imports BEFORE obfuscation, so the build succeeds, but the OUTPUT
// chunk references the obfuscated string at runtime, which the browser
// can't resolve as a module specifier:
//
//   Uncaught TypeError: Failed to resolve module specifier '@/use/useCrazyGames'
//
// Static `import` statements are detected by Rollup pre-obfuscation
// AND survive the transform (the obfuscator doesn't touch top-of-file
// imports), so they're safe. The bundle-size cost is zero in practice
// because each `if (flags.isXxx)` arm is gated by a build-time literal
// (`import.meta.env.VITE_APP_XXX === 'true'`), and Rollup tree-shakes
// the inactive arms' imports away. Same trick already used by
// `GameDistributionProvider.ts` — see its file header for the full
// rationale.
//
// ## Priority order MUST match `main.ts`'s historical ternary:
//   1. isGlitch         → GlitchStrategy (fallback to LocalStorageStrategy)
//   2. isCrazyWeb       → CrazyGamesStrategy
//   3. isGameDistribution → GameDistributionStrategy (fallback to LocalStorageStrategy)
//   4. else              → LocalStorageStrategy

import { LocalStorageStrategy } from '@/utils/save/LocalStorageStrategy'
import { createGlitchSaveStrategy } from '@/utils/glitchPlugin'
import { createCrazyGamesSaveStrategy } from '@/use/useCrazyGames'
import { createGameDistributionSaveStrategy } from '@/utils/gameDistributionPlugin'
import type { SaveStrategy } from '@/utils/save/types'
import type { PlatformFlags } from './capabilities'

export const resolveSaveStrategy = async (flags: PlatformFlags): Promise<SaveStrategy> => {
  if (flags.isGlitch) {
    return createGlitchSaveStrategy() ?? new LocalStorageStrategy()
  }
  if (flags.isCrazyWeb) {
    return createCrazyGamesSaveStrategy()
  }
  if (flags.isGameDistribution) {
    return createGameDistributionSaveStrategy() ?? new LocalStorageStrategy()
  }
  return new LocalStorageStrategy()
}
