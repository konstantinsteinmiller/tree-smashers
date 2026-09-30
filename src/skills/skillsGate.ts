// ─── Skills flag boundary (VITE_APP_FEATURE_SKILLS, opt-in) ──────────────────
//
// The ONE module that reads the skills build flag, and the ONE place the skill
// system enters the module graph from the outside: every skill surface and
// every skill module is reached through a handle exported here, and each
// handle is `SKILLS_BUILD ? <lazy import> : null`.
//
// Why a gate, not `if (isSkillsEnabled)` at every call site:
//   • Rollup only drops what it can PROVE is dead. A module-scope ternary on
//     the env literal, in a module the obfuscator never touches, always folds;
//     the dead branch's `import()` is then never emitted, so a skills-off build
//     contains no skill chunk, no skill component and no skill string at all.
//   • An obfuscated module that is statically imported can never be dropped —
//     its string-array bootstrap is a top-level side effect. So the skill
//     modules must not be statically reachable from shared code, only through
//     the dynamic imports below.
//   • `vite.config.ts` excludes `src/skills/` from obfuscation (the obfuscator
//     rewrites `import()` specifiers into lookups Rollup can no longer resolve,
//     and used to string-array the 'true'/'false' of the comparison — batch-3
//     Q1 / league plan F1 — so folding was random per build).
//
// Rules (tests/skillsFlagBoundary.test.ts):
//   1. Only this file reads `import.meta.env.VITE_APP_FEATURE_SKILLS`.
//   2. Code outside the skill system imports skill modules only through this
//      gate (type-only imports are fine) — or the string-free boundary modules
//      next to it (skillKeys, skillIds, skillSaveMeta) and `skills/skillCore`.
//   3. Nothing in `src/skills/` imports an obfuscated module (an unused static
//      import of one would still pull it in).
//   4. Consumers render a handle with `component(v-if="X" :is="X")` and call a
//      loader through the Promise it returns (null / [] / no-op when off).
//
// Allowed residue on a skills-off build: `skills.*` translations inside the
// lazy per-locale chunks (shared by every build; league plan O9).

import { defineAsyncComponent, shallowRef, type ShallowRef } from 'vue'
import type { SkillLoadout } from '@/types/skills'

/** Build-time skills switch. Folded to a literal in every build. */
export const SKILLS_BUILD: boolean = import.meta.env.VITE_APP_FEATURE_SKILLS === 'true'

// ─── UI handles (null on a skills-off build) ─────────────────────────────────

/** First-unlock introduction (drum roll → panel → "Pick your skill"). */
export const SkillsIntroUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/SkillsIntroScreen.vue'))
  : null
/** Lighter reveal for later unlocks / the slot-2 reveal. */
export const SkillRevealUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/SkillRevealOverlay.vue'))
  : null
/** Skill picker (learn / upgrade / equip). */
export const SkillPickerUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/SkillPickerModal.vue'))
  : null
/** HUD chip under a spinner's stat card. */
export const SkillHudChipUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/SkillHudIcon.vue'))
  : null
/** PvP VS card (both teams + loadouts) inside the deciding_turn window. */
export const PvpVsCardUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/PvpVsPreview.vue'))
  : null
/** Boss-drop chip on the stage badge / boss peek badge. */
export const SkillDropChipUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/atoms/SkillDropChip.vue'))
  : null
/** The Team modal's SKILLS section (tiles, picker, NEW badge, auto-fill). */
export const TeamSkillsSectionUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/TeamSkillsSection.vue'))
  : null
/** One side's loadout row on the PvP lobby ready card. */
export const PvpReadySkillsUi = SKILLS_BUILD
  ? defineAsyncComponent(() => import('@/components/organisms/PvpReadySkills.vue'))
  : null

/** Warm the intro / reveal / picker (the arena calls it as soon as a surface
 *  can come up), through each async wrapper's own loader so the first render
 *  is synchronous and the drum roll never waits on a fetch or a tick. */
export const prefetchSkillSurfaces = (): void => {
  for (const ui of [SkillsIntroUi, SkillRevealUi, SkillPickerUi]) {
    const load = (ui as { __asyncLoader?: () => Promise<unknown> } | null)?.__asyncLoader
    if (load) void load().catch(() => { /* retried on first render */
    })
  }
}

// ─── Module loaders ──────────────────────────────────────────────────────────
//
// Each is a ternary on SKILLS_BUILD, so the `import()` only exists in a skills
// build. Off, they resolve to null (or do nothing).

export type SkillsApi = ReturnType<typeof import('@/use/useSkills').default>
export type ArenaSkillsModule = typeof import('@/use/skills/arenaSkills')
export type SkillEnginePort = typeof import('@/use/skills/skillEngine')
export type SkillSfxModule = typeof import('@/use/skills/skillSfx')
export type SkillLoadoutSanitizer = (raw: unknown, opts?: { levelOne?: boolean }) => SkillLoadout

const skillsApi: ShallowRef<SkillsApi | null> = shallowRef(null)
let skillsApiLoad: Promise<SkillsApi | null> | null = null

/** The useSkills API (skill state, loadouts, reveals); null when off. */
export const loadSkillsApi = (): Promise<SkillsApi | null> =>
  SKILLS_BUILD
    ? (skillsApiLoad ??= import('@/use/useSkills').then(m => (skillsApi.value = m.default())))
    : Promise.resolve(null)

/** Reactive handle on the useSkills API: null until loaded, forever null when
 *  off. Starts the load on first use. */
export const useSkillsApi = (): Readonly<ShallowRef<SkillsApi | null>> => {
  if (SKILLS_BUILD) void loadSkillsApi()
  return skillsApi
}

/** SpinnerArena's skill glue (loadouts, reveal gate, HUD rows, SFX requests). */
export const loadArenaSkills = (): Promise<ArenaSkillsModule | null> =>
  SKILLS_BUILD ? import('@/use/skills/arenaSkills') : Promise.resolve(null)

/** The engine's skill port (runtime hooks + VFX). The engine never creates a
 *  skill until it is installed (`installSkillEngine`). */
export const loadSkillEngine = (): Promise<SkillEnginePort | null> =>
  SKILLS_BUILD ? import('@/use/skills/skillEngine') : Promise.resolve(null)

/** Skill SFX (battle set + drum roll). */
export const loadSkillSfx = (): Promise<SkillSfxModule | null> =>
  SKILLS_BUILD ? import('@/use/skills/skillSfx') : Promise.resolve(null)

/** Arm the gated skill-SFX preload (useAssets' deferred tier). No-op when off. */
export const armSkillSfx = (): void => {
  if (SKILLS_BUILD) {
    void import('@/use/skills/skillSfx')
      .then(m => m.armSkillSfxPreload())
      .catch(() => { /* best-effort */
      })
  }
}

/** PvP receive-side skill sanitiser (usePVP); null when off → peers' skills
 *  are ignored and this client sends none. */
export const loadSkillLoadoutSanitizer = (): Promise<SkillLoadoutSanitizer | null> =>
  SKILLS_BUILD
    ? import('@/use/skills/skillLoadoutSanitizer').then(m => m.sanitizeSkillLoadout)
    : Promise.resolve(null)

/** Dev cheats (a / y / o): run `fn` with the useSkills API; no-op when off. */
export const withSkillsApi = (fn: (api: SkillsApi) => void): void => {
  if (SKILLS_BUILD) {
    void loadSkillsApi()
      .then(api => {
        if (api) fn(api)
      })
      .catch(() => { /* dev only */
      })
  }
}
