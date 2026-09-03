// ─── GameDistribution platform module ───────────────────────────────────────
//
// DESCRIPTOR ONLY — deliberately no `export … from '@/utils/gameDistributionPlugin'`.
//
// This file used to re-export the plugin, the strategy and the ad provider as
// a convenience barrel. `src/platforms/index.ts` statically imports every
// descriptor to build `ALL_PLATFORMS`, so those re-exports pulled the entire
// GD SDK loader into EVERY build's static entry graph — Rollup cannot prove a
// 500-LOC SDK module is side-effect-free, so it kept it.
//
// The cost was not theoretical. The Playgama build submitted to YouTube
// Playables in 2026-09 shipped a 277 KB `plugin-gd-*.js` chunk, preloaded
// from index.html, that had absorbed Vue and the gameplay composables; the
// crash YouTube QA reported (`Cannot read properties of null (reading
// 'getItem')`) was reported against that filename and took a bundle
// archaeology session to trace back to `useSpinnerConfig.ts`.
//
// Consumers import the implementation from its own module. `resolveSaveStrategy`
// and `GameDistributionProvider` already do exactly that, behind
// `import.meta.env.VITE_APP_*`-gated dynamic imports, which is what lets the
// GD chunk disappear from non-GD builds entirely.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'gamedistribution' as const,
  envFlag: 'GAME_DISTRIBUTION',
  capabilities: {
    hasCloudSave: false,                  // GD has no cloud save API
    hasAds: true,
    hostnameMatcher: 'gamedistribution.com',
    portalEnforcesAgeGate: false,         // GD aggregates traffic; we declare child-directed
    childDirectedAdSignal: true,          // tagForChildDirectedTreatment in GD_OPTIONS
    needsParentOriginCheck: false
  }
}
