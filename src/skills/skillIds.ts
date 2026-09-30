// ─── The ten skill ids ──────────────────────────────────────────────────────
//
// A flag-boundary module (src/skills/ — never obfuscated, no imports), so the
// merge policy can count skill levels without pulling a skill module into a
// skills-off build. `src/types/skills.ts` re-exports it.
//
// ORDER IS STABLE: `SKILL_BIT` in the catalog (and the numeric bits in
// `use/skills/skillCore.ts`) is `1 << index`, so append new skills at the end,
// never reorder. (The order is the design's §10.1 list; the unlock order is
// `unlockStage`, see `SKILL_AUTOFILL_ORDER`.)
export const SKILL_IDS = [
  'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets',
  'opening_salvo', 'momentum', 'hazard_ward', 'static_charge', 'mirror_plate'
] as const
