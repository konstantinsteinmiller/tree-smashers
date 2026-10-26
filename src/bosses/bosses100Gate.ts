// ─── Bosses 100+ flag boundary (VITE_APP_FEATURE_BOSSES100, opt-in) ──────────
//
// The ONE module that reads the bosses100 build flag, and the ONE place the
// stage-101+ boss feature (trait encounters at stages 110…200, their traits,
// VFX / SFX, trophy skins, intro card, trait chips, Boss Lab) enters the module
// graph from the outside. Mirrors src/skills/skillsGate.ts:
//
//   • every feature surface / module is reached through a handle exported
//     here, each `BOSSES100_BUILD ? <lazy import> : null`, so on a
//     bosses100-off build the `import()` is never emitted;
//   • the engine's trait rules + VFX come in as a PORT (`loadBossTraitEngine`
//     → useSpinnerGame `installBossTraitEngine`), never as a static import;
//   • `vite.config.ts` keeps this directory (and the two pure data modules
//     below) out of obfuscation, so the comparison always folds and unused
//     exports tree-shake.
//
// The two static boundary modules: `@/data/bossEncounters` (the encounter
// table — the campaign's `getStageById` is synchronous) and `@/data/bossArt`.
// Shared code may import them statically, but every RUNTIME use must sit
// behind `BOSSES100_BUILD` so Rollup drops the table on an off build.
//
// Rules (tests/bosses100FlagBoundary.test.ts):
//   1. Only this file reads `import.meta.env.VITE_APP_FEATURE_BOSSES100`.
//   2. Code outside the feature imports feature modules only through this
//      gate (type-only imports are fine), or the two boundary data modules.
//   3. Nothing in `src/bosses/` imports an obfuscated module.
//
// Flag OFF: stages 110…200 (and their cycle repeats) are the old cycle copies
// byte for byte; no trait ever runs; no trophy is granted and no unowned
// trophy card is shown (an owned one stays usable); no intro card, trait chip
// or boss crest. Allowed residue: `stages.boss_*` / `bosses.*` translations
// in the lazy per-locale chunks (shared by every build; league plan O9).

import { defineAsyncComponent } from 'vue'

/** Build-time bosses100 switch. Folded to a literal in every build. */
export const BOSSES100_BUILD: boolean = import.meta.env.VITE_APP_FEATURE_BOSSES100 === 'true'

// ─── UI handles (null on a bosses100-off build) ─────────────────────────────

/** Encounter intro card inside the meteor intro (§7.2). */
export const BossIntroCardUi = BOSSES100_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/BossIntroCard.vue'))
  : null
/** "Next boss" peek on the win screen (badge + trait glyphs). */
export const BossPeekBadgeUi = BOSSES100_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/BossPeekBadge.vue'))
  : null
/** Trait glyph (ember / frost / chill) — stat-card chips, peek glyph row. */
export const BossTraitGlyphUi = BOSSES100_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/BossTraitGlyph.vue'))
  : null
/** Trophy card on the roulette reward screen (§3.5). */
export const BossTrophyCardUi = BOSSES100_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/BossTrophyCard.vue'))
  : null
/** Boss Lab — a DEV-only cheat modal (§11). */
export const BossLabUi = import.meta.env.DEV && BOSSES100_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/BossLabModal.vue'))
  : null

// ─── Module loaders ─────────────────────────────────────────────────────────

export type BossTraitEnginePort = typeof import('@/use/bosses/bossTraitEngine')
export type BossArenaUiModule = typeof import('@/use/bosses/bossArenaUi')

/** The engine's trait port (rules + VFX + SFX); null when off. */
export const loadBossTraitEngine = (): Promise<BossTraitEnginePort | null> =>
  BOSSES100_BUILD ? import('@/use/bosses/bossTraitEngine') : Promise.resolve(null)

/** SpinnerArena's boss glue (trophies, frozen-tap test, stat-card view); null when off. */
export const loadBossArenaUi = (): Promise<BossArenaUiModule | null> =>
  BOSSES100_BUILD ? import('@/use/bosses/bossArenaUi') : Promise.resolve(null)
