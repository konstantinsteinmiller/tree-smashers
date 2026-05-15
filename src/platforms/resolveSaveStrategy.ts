// ─── Save-strategy resolver ─────────────────────────────────────────────────
//
// Pure function that takes the platform flags and returns the right
// `SaveStrategy`. Lifted from the inline ternary in `main.ts` so the
// branching is testable in isolation.
//
// ## Imports are DYNAMIC — and gated by `import.meta.env.VITE_APP_*`. Why:
//
// The previous version of this file used static imports of every platform
// plugin, with the wrong claim that `flags.isXxx` would let Rollup
// tree-shake. It can't: `flags` is a runtime parameter, not a build-time
// constant, so Rollup conservatively keeps every import. That regressed
// the CrazyGames bundle from ~700KB to ~1.6MB transferred (CG QA flagged
// it 2026-04-30) because `gameDistributionPlugin.ts` (486 LOC) and
// `glitchPlugin.ts` were being inlined into the entry chunk for every
// build, including CrazyGames.
//
// The pre-refactor `main.ts` had it right: dynamic `await import('@/...')`
// inside `if (import.meta.env.VITE_APP_XXX === 'true') {}` branches.
// Rollup recognises the env literal as a constant, dead-code-eliminates
// the unmatched branches, and only the active platform's plugin chunk
// ends up in the bundle.
//
// The obfuscator catch — `vite-plugin-javascript-obfuscator`'s
// `stringArray` transform rewrites the `'@/...'` literals inside dynamic
// imports, breaking them at runtime. Solved by adding THIS file to the
// obfuscator's exclude list in `vite.config.ts` (alongside `main.ts`,
// `router/index.ts`, `i18n/index.ts`).
//
// ## Priority order MUST match `main.ts`'s historical ternary:
//   1. isGlitch          → GlitchStrategy (fallback to LocalStorageStrategy)
//   2. isCrazyWeb        → CrazyGamesStrategy
//   3. isGameDistribution → GameDistributionStrategy (fallback to LocalStorageStrategy)
//   4. isPlaygama        → PlaygamaStrategy (fallback to LocalStorageStrategy)
//   5. else              → LocalStorageStrategy

import type { SaveStrategy } from '@/utils/save/types'
import type { PlatformFlags } from './capabilities'

export const resolveSaveStrategy = async (_flags: PlatformFlags): Promise<SaveStrategy> => {
  if (import.meta.env.VITE_APP_GLITCH === 'true') {
    const { createGlitchSaveStrategy } = await import('@/utils/glitchPlugin')
    const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
    return createGlitchSaveStrategy() ?? new LocalStorageStrategy()
  }
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') {
    const { createCrazyGamesSaveStrategy } = await import('@/use/useCrazyGames')
    return createCrazyGamesSaveStrategy()
  }
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') {
    const { createGameDistributionSaveStrategy } = await import('@/utils/gameDistributionPlugin')
    const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
    return createGameDistributionSaveStrategy() ?? new LocalStorageStrategy()
  }
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
    // Construct the strategy here (rather than via a factory in
    // playgamaPlugin.ts) so the dynamic-import literal stays inside
    // this file — `resolveSaveStrategy.ts` is on the obfuscator's
    // exclude list. The plugin module is not, so any `await import`
    // call placed there would be mangled by the `stringArray`
    // transform and fail at runtime.
    try {
      const { PlaygamaStrategy } = await import('@/utils/save/PlaygamaStrategy')
      return new PlaygamaStrategy()
    } catch (e) {
      console.warn('[playgama] save strategy load failed', e)
      const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
      return new LocalStorageStrategy()
    }
  }
  const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
  return new LocalStorageStrategy()
}
