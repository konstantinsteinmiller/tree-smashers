// Skill catalog — pure data, NO Vue/composable dependencies (unit-testable
// like skinCatalog.ts). Binding design: skills-feature.md §4 (tables), §6
// (economy), §10.1 (data model).
//
// The level tables are VERBATIM copies of tools/skills-sim/skills.mjs — the
// balance proof in skills-feature.md §3 was measured on those numbers.
// tests/skillCatalog.test.ts imports the .mjs and fails on any drift. Re-tune
// loop: edit skills.mjs → re-run the pair sweep (worst pair ≤ 1.50 with ~3 %
// headroom) → copy the tables here and to skills-feature.md §4.
//
// Deliberately absent: any ad flag. The optional rewarded coin top-up (§6.5)
// is gated by the build-time HAS_REWARDED_ADS / isRewardedReady elsewhere.

import {
  SKILL_IDS,
  type SkillDef,
  type SkillId,
  type SkillParamsById,
  type SkillUnlockStage
} from '@/types/skills'

export { SKILL_IDS }
export type {
  SkillId,
  SkillTag,
  SkillDef,
  SkillLevelParams,
  SkillParamsById,
  SkillLoadout,
  SkillSlots,
  BladeSkills
} from '@/types/skills'

// ─── Constants ─────────────────────────────────────────────────────────────

export const SKILL_MAX_LEVEL = 10

/** Coins to reach level L+1, index L: [learn L1, L1→2, …, L9→10] (§6.1). */
export const SKILL_COST = [150, 100, 125, 150, 200, 250, 300, 350, 450, 575] as const

/** Learn L1 + every upgrade to L10 = 2,650 coins per skill (§6.1). */
export const SKILL_TOTAL_COST = SKILL_COST.reduce((a, b) => a + b, 0)

/** Team-wide slots; both player spinners carry every equipped skill. */
export const SKILL_TEAM_SLOTS = 2

/** The SKILLS section is teased from currentStageId >= 8. */
export const SKILL_TEASER_STAGE = 8

/** Highest CLEARED stage that opens slot 1 (the stage-10 boss). */
export const SKILL_UNLOCK_CLEARED = 10

/** Highest CLEARED stage that opens slot 2 (the stage-20 boss; user decision S2). */
export const SKILL_SLOT2_CLEARED = 20

/** Clamp on the product of attacker skill multipliers per hit (§5). */
export const SKILL_HIT_MUL_CAP = 2.2

/** Global hot-fix knob (§5): multiplies chances/percents, never cooldowns,
 *  `everyN`, thresholds, `share` or caps. 1 = the measured tables. */
export const SKILL_POWER_SCALE = 1

// ─── Level tables ──────────────────────────────────────────────────────────

/** Column tables → one row per level (a scalar column repeats on every
 *  level), mirroring the sim's `zip()`. */
function zipLevels<P extends object>(
  cols: { [F in keyof P]: number | readonly number[] }
): P[] {
  return Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => {
    const row: Record<string, number> = {}
    for (const [k, v] of Object.entries(cols) as [string, number | readonly number[]][]) {
      row[k] = typeof v === 'number' ? v : (v[i] as number)
    }
    return Object.freeze(row) as P
  })
}

// 24×24 glyphs, one path each, nonzero winding, solid (game-ui-icon-set
// GLYPH-AUTHORING.md). second_wind reuses the set's `heart` with a punched
// up-arrow. WP5 may refine the art; the catalog is the single source.
const ICONS: Record<SkillId, string> = {
  mirror_plate:
    'M21.8 12L16.9 20.49L7.1 20.49L2.2 12L7.1 3.51L16.9 3.51Z' +
    'M15.65 5.68L8.35 5.68L4.7 12L8.35 18.32L15.65 18.32L19.3 12Z' +
    'M6.6 12L11 7.9L11 10.6L16.8 10.6L16.8 13.4L11 13.4L11 16.1Z',
  phase_step:
    'M9 9.8A5.5 5.5 0 0 1 20 9.8L20 20.2L18.17 18.6L16.33 20.2L14.5 18.6L12.67 20.2L10.83 18.6L9 20.2Z' +
    'M11.95 10.2A1.15 1.15 0 1 0 14.25 10.2A1.15 1.15 0 1 0 11.95 10.2Z' +
    'M15.35 10.2A1.15 1.15 0 1 0 17.65 10.2A1.15 1.15 0 1 0 15.35 10.2Z' +
    'M2.4 10.65A1.25 1.25 0 0 1 3.65 9.4L6.35 9.4A1.25 1.25 0 0 1 7.6 10.65L7.6 10.65A1.25 1.25 0 0 1 6.35 11.9L3.65 11.9A1.25 1.25 0 0 1 2.4 10.65Z' +
    'M3.8 15.05A1.25 1.25 0 0 1 5.05 13.8L6.35 13.8A1.25 1.25 0 0 1 7.6 15.05L7.6 15.05A1.25 1.25 0 0 1 6.35 16.3L5.05 16.3A1.25 1.25 0 0 1 3.8 15.05Z',
  guard_shell:
    'M12 2.6L19.6 5.5L19.6 11C19.6 16.1 16.3 19.5 12 21.4C7.7 19.5 4.4 16.1 4.4 11L4.4 5.5Z',
  second_wind:
    'M3.88 12.04A5 5 0 1 1 12 6.33A5 5 0 1 1 20.12 12.04L12 21.1Z' +
    'M8.3 12.7L10.65 12.7L10.65 16.9L13.35 16.9L13.35 12.7L15.7 12.7L12 8.6Z',
  lucky_edge:
    'M4.4 8.4A4 4 0 1 1 12.4 8.4A4 4 0 1 1 4.4 8.4Z' +
    'M11.6 8.4A4 4 0 1 1 19.6 8.4A4 4 0 1 1 11.6 8.4Z' +
    'M4.4 15.6A4 4 0 1 1 12.4 15.6A4 4 0 1 1 4.4 15.6Z' +
    'M11.6 15.6A4 4 0 1 1 19.6 15.6A4 4 0 1 1 11.6 15.6Z' +
    'M9.4 12A2.6 2.6 0 1 1 14.6 12A2.6 2.6 0 1 1 9.4 12Z',
  homing_rockets:
    'M18.79 5.21C19.42 8.68 17.52 11.72 15.32 13.91L11.65 17.59L6.41 12.35L10.09 8.68C12.28 6.48 15.32 4.58 18.79 5.21Z' +
    'M6.34 12.85L2.52 11.58L4.5 9.6L10.16 9.03Z' +
    'M14.97 13.84L14.4 19.5L12.42 21.48L11.15 17.66Z' +
    'M7.76 13.13L10.87 16.24L5.21 18.79Z' +
    'M12.57 9.17A1.6 1.6 0 1 0 14.83 11.43A1.6 1.6 0 1 0 12.57 9.17Z',
  opening_salvo:
    'M12.4 15.8A3.4 3.4 0 1 1 19.2 15.8A3.4 3.4 0 1 1 12.4 15.8Z' +
    'M13.4 18.2L9.08 9.08L18.2 13.4Z' +
    'M5.1 16.8A2.3 2.3 0 1 1 9.7 16.8A2.3 2.3 0 1 1 5.1 16.8Z' +
    'M5.77 18.43L3.3 12.7L9.03 15.17Z' +
    'M14.5 7.2A2.3 2.3 0 1 1 19.1 7.2A2.3 2.3 0 1 1 14.5 7.2Z' +
    'M15.17 8.83L12.7 3.1L18.43 5.57Z',
  momentum:
    'M5.2 5.4A2 2 0 0 1 8.03 5.49L13.28 11.08A1.35 1.35 0 0 1 13.28 12.92L8.03 18.51A2 2 0 0 1 5.2 18.6A2 2 0 0 1 5.11 15.77L7.79 12.92A1.35 1.35 0 0 0 7.79 11.08L5.11 8.23A2 2 0 0 1 5.2 5.4Z' +
    'M12.2 5.4A2 2 0 0 1 15.03 5.49L20.28 11.08A1.35 1.35 0 0 1 20.28 12.92L15.03 18.51A2 2 0 0 1 12.2 18.6A2 2 0 0 1 12.11 15.77L14.79 12.92A1.35 1.35 0 0 0 14.79 11.08L12.11 8.23A2 2 0 0 1 12.2 5.4Z',
  hazard_ward:
    'M12 2.2L20.49 7.1L20.49 16.9L12 21.8L3.51 16.9L3.51 7.1Z' +
    'M12 6.6C10.4 9.2 8.4 10.9 8.4 14A3.6 3.6 0 0 0 15.6 14C15.6 10.9 13.6 9.2 12 6.6Z',
  static_charge:
    'M15.2 2.4L13 9.8L18.8 9.8L9.6 21.6L11 13.6L5.2 13.6L14 2.4Z'
}

type SkillDefs = { [K in SkillId]: SkillDef<K> }

const def = <K extends SkillId>(d: SkillDef<K>): SkillDef<K> => Object.freeze(d)

/** The ten skills. Tables: skills-feature.md §4 = tools/skills-sim/skills.mjs. */
export const SKILLS: Readonly<SkillDefs> = Object.freeze({
  mirror_plate: def({
    id: 'mirror_plate', tag: 'DEF', unlockStage: 10, icon: ICONS.mirror_plate, color: '#e2e8f0',
    levels: zipLevels<SkillParamsById['mirror_plate']>({
      chance: [0.05, 0.06, 0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.15, 0.16],
      share: 0.5
    })
  }),
  phase_step: def({
    id: 'phase_step', tag: 'DEF', unlockStage: 15, icon: ICONS.phase_step, color: '#c4b5fd',
    levels: zipLevels<SkillParamsById['phase_step']>({
      chance: [0.035, 0.04, 0.045, 0.05, 0.06, 0.065, 0.07, 0.08, 0.09, 0.10],
      cooldownMs: [4000, 3800, 3700, 3500, 3300, 3200, 3000, 2800, 2700, 2500]
    })
  }),
  guard_shell: def({
    id: 'guard_shell', tag: 'DEF', unlockStage: 20, icon: ICONS.guard_shell, color: '#67e8f9',
    levels: zipLevels<SkillParamsById['guard_shell']>({
      shield: [0.05, 0.06, 0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.15, 0.16]
    })
  }),
  second_wind: def({
    id: 'second_wind', tag: 'SUS', unlockStage: 25, icon: ICONS.second_wind, color: '#4ade80',
    levels: zipLevels<SkillParamsById['second_wind']>({
      threshold: 0.35,
      heal: [0.06, 0.07, 0.09, 0.10, 0.11, 0.13, 0.14, 0.15, 0.17, 0.18]
    })
  }),
  lucky_edge: def({
    id: 'lucky_edge', tag: 'OFF', unlockStage: 30, icon: ICONS.lucky_edge, color: '#fbbf24',
    levels: zipLevels<SkillParamsById['lucky_edge']>({
      chance: [0.07, 0.08, 0.08, 0.09, 0.10, 0.10, 0.11, 0.12, 0.12, 0.13],
      mult: [1.50, 1.55, 1.60, 1.65, 1.70, 1.80, 1.85, 1.90, 1.95, 2.00]
    })
  }),
  homing_rockets: def({
    id: 'homing_rockets', tag: 'OFF', unlockStage: 35, icon: ICONS.homing_rockets, color: '#fb923c',
    levels: zipLevels<SkillParamsById['homing_rockets']>({
      everyN: [7, 7, 7, 6, 6, 6, 6, 5, 5, 5],
      frac: [0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.14, 0.15, 0.16, 0.17],
      maxTargets: 3
    })
  }),
  opening_salvo: def({
    id: 'opening_salvo', tag: 'OFF', unlockStage: 40, icon: ICONS.opening_salvo, color: '#f87171',
    levels: zipLevels<SkillParamsById['opening_salvo']>({
      pct: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14]
    })
  }),
  momentum: def({
    id: 'momentum', tag: 'OFF', unlockStage: 45, icon: ICONS.momentum, color: '#38bdf8',
    levels: zipLevels<SkillParamsById['momentum']>({
      perStack: [0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.07, 0.075],
      maxStacks: 3
    })
  }),
  hazard_ward: def({
    id: 'hazard_ward', tag: 'UTL', unlockStage: 50, icon: ICONS.hazard_ward, color: '#a3e635',
    levels: zipLevels<SkillParamsById['hazard_ward']>({
      lava: [0.15, 0.18, 0.21, 0.24, 0.27, 0.30, 0.33, 0.36, 0.38, 0.40],
      thunder: [0.15, 0.18, 0.21, 0.24, 0.27, 0.30, 0.33, 0.36, 0.38, 0.40],
      chip: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.14, 0.15],
      shockKeep: [0.02, 0.03, 0.04, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]
    })
  }),
  static_charge: def({
    id: 'static_charge', tag: 'CTL', unlockStage: 55, icon: ICONS.static_charge, color: '#facc15',
    levels: zipLevels<SkillParamsById['static_charge']>({
      chance: [0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.17, 0.18]
    })
  })
})

/** `1 << index in SKILL_IDS` — for the per-blade `has` bitmask. */
export const SKILL_BIT: Readonly<Record<SkillId, number>> = Object.freeze(
  Object.fromEntries(SKILL_IDS.map((id, i) => [id, 1 << i])) as Record<SkillId, number>
)

/** Unlock order (by boss stage, 10 → 55). Auto-fill puts the earliest learned,
 *  unequipped skill of this list into an empty unlocked slot (§6.2). */
export const SKILL_AUTOFILL_ORDER: readonly SkillId[] = Object.freeze(
  [...SKILL_IDS].sort((a, b) => SKILLS[a].unlockStage - SKILLS[b].unlockStage)
)

// ─── Helpers ───────────────────────────────────────────────────────────────

export const isSkillId = (v: unknown): v is SkillId =>
  typeof v === 'string' && (SKILL_IDS as readonly string[]).includes(v)

const clampLevel = (level: number): number =>
  Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))

/** Fields SKILL_POWER_SCALE multiplies (§5); `mult` scales as 1 + (m − 1)·s. */
const SCALED_FIELDS = new Set([
  'chance', 'shield', 'heal', 'pct', 'frac', 'perStack', 'lava', 'thunder', 'chip', 'shockKeep'
])

/** A copy of `params` with the §5 power scale applied (identity at 1). */
export function applySkillPowerScale<P extends object>(params: P, scale: number): P {
  if (scale === 1) return params
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(params) as [string, number][]) {
    if (k === 'mult') out[k] = 1 + (v - 1) * scale
    else out[k] = SCALED_FIELDS.has(k) ? v * scale : v
  }
  return out as P
}

/** Parameters of `id` at `level` (clamped to 1…10), power scale applied. */
export function skillParams<K extends SkillId>(id: K, level: number): SkillParamsById[K] {
  const row = SKILLS[id].levels[clampLevel(level) - 1] as SkillParamsById[K]
  return applySkillPowerScale(row, SKILL_POWER_SCALE)
}

/** Coins for the next level from `level` (0 → 150 = learn); null at max or invalid. */
export function skillCost(level: number): number | null {
  if (!Number.isInteger(level) || level < 0 || level >= SKILL_MAX_LEVEL) return null
  return SKILL_COST[level] ?? null
}

/** Skills whose boss has been cleared (derived, never stored — §6.2). */
export function unlockedSkillIds(highestCleared: number): SkillId[] {
  return SKILL_AUTOFILL_ORDER.filter(id => highestCleared >= SKILLS[id].unlockStage)
}

/** Open team slots for the highest cleared stage: 0 / 1 (≥10) / 2 (≥20). */
export function unlockedSlotCount(highestCleared: number): 0 | 1 | 2 {
  if (highestCleared >= SKILL_SLOT2_CLEARED) return 2
  if (highestCleared >= SKILL_UNLOCK_CLEARED) return 1
  return 0
}

/** Reads `excludes` both ways; always true in v7. */
export function canEquipTogether(a: SkillId, b: SkillId): boolean {
  if (a === b) return false
  return !(SKILLS[a].excludes?.includes(b) || SKILLS[b].excludes?.includes(a))
}

/** The boss stage that unlocks `id`. */
export const skillUnlockStage = (id: SkillId): SkillUnlockStage => SKILLS[id].unlockStage
