// ─── Skill system types (skills-feature.md §10.1) ──────────────────────────
//
// Pure types + the id list. The level tables, costs and helpers live in
// `src/data/skillCatalog.ts`; this file stays dependency-free so both the
// catalog and `spinner.ts` can import it without a cycle.

// The ten skill ids live in the flag-boundary module `src/skills/skillIds.ts`
// (so the save-merge score can count levels on any build without pulling this
// file in); ORDER IS STABLE — see there.
import { SKILL_IDS } from '@/skills/skillIds'

export { SKILL_IDS }

export type SkillId = (typeof SKILL_IDS)[number]

export type SkillTag = 'DEF' | 'SUS' | 'OFF' | 'CTL' | 'UTL'

export type SkillUnlockStage = 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55

// ─── Per-level parameters, one shape per skill ─────────────────────────────
// Fractions, not percents (0.05 = 5 %). Field names match
// tools/skills-sim/skills.mjs so the parity test can compare them 1:1.

export interface GuardShellParams {
  shield: number
}

export interface PhaseStepParams {
  chance: number;
  cooldownMs: number
}

export interface MirrorPlateParams {
  chance: number;
  share: number
}

export interface SecondWindParams {
  threshold: number;
  heal: number
}

export interface LuckyEdgeParams {
  chance: number;
  mult: number
}

export interface MomentumParams {
  perStack: number;
  maxStacks: number
}

export interface HomingRocketsParams {
  everyN: number;
  frac: number;
  maxTargets: number
}

export interface OpeningSalvoParams {
  pct: number
}

export interface StaticChargeParams {
  chance: number
}

export interface HazardWardParams {
  lava: number;
  thunder: number;
  chip: number;
  shockKeep: number
}

/** Maps every skill id to its level-parameter shape. */
export interface SkillParamsById {
  guard_shell: GuardShellParams
  phase_step: PhaseStepParams
  mirror_plate: MirrorPlateParams
  second_wind: SecondWindParams
  lucky_edge: LuckyEdgeParams
  momentum: MomentumParams
  homing_rockets: HomingRocketsParams
  opening_salvo: OpeningSalvoParams
  static_charge: StaticChargeParams
  hazard_ward: HazardWardParams
}

export type SkillLevelParams = SkillParamsById[SkillId]

export interface SkillDef<K extends SkillId = SkillId> {
  id: K
  tag: SkillTag
  /** Boss stage whose clear unlocks the skill (learnable for SKILL_COST[0]). */
  unlockStage: SkillUnlockStage
  /** 24×24 viewBox SVG path data, ONE path, nonzero winding (game-ui-icon-set
   *  style). Used by <SkillIcon> (DOM) and `new Path2D()` (canvas). */
  icon: string
  /** Accent colour for HUD ring / popups. */
  color: string
  /** Reserved: skills that may not be equipped together with this one.
   *  Empty in v7 (skills-feature.md §3.8). */
  excludes?: readonly SkillId[]
  /** Length SKILL_MAX_LEVEL; index 0 = L1. */
  levels: readonly SkillParamsById[K][]
}

// ─── Loadouts ──────────────────────────────────────────────────────────────

/** The team's persisted slots (`smashers_skill_loadout`), `null` = empty. */
export type SkillSlots = [SkillId | null, SkillId | null]

/** What a battle receives (initGame opts, PvP `player-ready`): the equipped
 *  skills with their levels, ≤ 2 entries. */
export type SkillLoadout = {
  id: SkillId
  level: number
  /** Per-field multipliers over the level table — a smasher skill is one
   *  effect plus mods (src/data/smasherCatalog.ts). Absent = the plain table. */
  mods?: Partial<Record<string, number>>
  /** The smasher skill id this entry came from (HUD / i18n only). */
  key?: string
}[]

/** Per-blade runtime skill state (one per bearer; created by the runtime). */
export interface BladeSkills {
  /** ≤ 2, from the loadout. */
  ids: SkillId[]
  lv: Partial<Record<SkillId, number>>
  /** Bitmask of SKILL_BIT for O(1) checks in the hot path. */
  has: number
  shield: number
  shieldMax: number
  /** gameTime ms */
  dodgeReadyAt: number
  /** gameTime ms */
  phasedUntil: number
  secondWindUsed: boolean
  /** Momentum, reset per own launch. */
  stacks: number
  rocketCount: number
}
