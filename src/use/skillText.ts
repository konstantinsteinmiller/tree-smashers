// ─── Skill copy helpers (pure, no Vue) ──────────────────────────────────────
//
// Turns catalog numbers into the named params of the `skills.desc.<id>`
// messages (skills-feature.md §7.3, §10.5) and the "Next:" value strip, with
// decimals in the active locale's notation. All wording lives in the locale
// files; this only supplies numbers, so the UI never concatenates translated
// fragments.

import { SKILLS, SKILL_AUTOFILL_ORDER, SKILL_MAX_LEVEL, skillParams } from '@/data/skillCatalog'
import { fmtNum } from '@/utils/localeNumber'
import type { SkillId } from '@/types/skills'

// ─── Locale-aware numbers ───────────────────────────────────────────────────
//
// The formatter itself is shared (utils/localeNumber.ts — the always-on stat
// lines use it too); re-exported here for the skill copy and its tests.
export { fmtNum, numberFormatFor } from '@/utils/localeNumber'

/** A fraction as a percent number (0.05 → "5"); the % sign is placed by the message. */
export const pct = (f: number, locale = 'en'): string => fmtNum(f * 100, locale)

/** Named params for `skills.desc.<id>` at `level` (1…10), numbers in `locale`'s notation. */
export function skillDescParams(id: SkillId, level: number, locale = 'en'): Record<string, string> {
  const num = (n: number) => fmtNum(n, locale)
  const per = (f: number) => pct(f, locale)
  switch (id) {
    case 'phase_step': {
      const p = skillParams('phase_step', level)
      return { chance: per(p.chance), cd: num(p.cooldownMs / 1000) }
    }
    case 'guard_shell':
      return { pct: per(skillParams('guard_shell', level).shield) }
    case 'second_wind': {
      const p = skillParams('second_wind', level)
      return { threshold: per(p.threshold), pct: per(p.heal) }
    }
    case 'lucky_edge': {
      const p = skillParams('lucky_edge', level)
      return { chance: per(p.chance), mult: num(p.mult) }
    }
    case 'homing_rockets': {
      const p = skillParams('homing_rockets', level)
      return { n: String(p.everyN), pct: per(p.frac) }
    }
    case 'opening_salvo':
      return { pct: per(skillParams('opening_salvo', level).pct) }
    case 'momentum':
      return { pct: per(skillParams('momentum', level).perStack) }
    case 'hazard_ward': {
      const p = skillParams('hazard_ward', level)
      return { hazard: per(p.lava), chip: per(p.chip), shock: per(p.shockKeep) }
    }
    case 'static_charge':
      return { chance: per(skillParams('static_charge', level).chance) }
    case 'mirror_plate':
      return { chance: per(skillParams('mirror_plate', level).chance) }
  }
}

/** One value of the compact strip; `s` values go through `skills.seconds`, `%` through `skills.percent`. */
export interface SkillStatValue {
  value: string
  unit: '%' | '×' | 's' | ''
}

/** The values that change with the level, in the order the description names them. */
export function skillKeyValues(id: SkillId, level: number, locale = 'en'): SkillStatValue[] {
  const d = skillDescParams(id, level, locale)
  switch (id) {
    case 'phase_step':
      return [{ value: d.chance!, unit: '%' }, { value: d.cd!, unit: 's' }]
    case 'second_wind':
    case 'guard_shell':
    case 'opening_salvo':
    case 'momentum':
      return [{ value: d.pct!, unit: '%' }]
    case 'lucky_edge':
      return [{ value: d.chance!, unit: '%' }, { value: d.mult!, unit: '×' }]
    case 'homing_rockets':
      return [{ value: d.n!, unit: '' }, { value: d.pct!, unit: '%' }]
    case 'hazard_ward':
      return [{ value: d.hazard!, unit: '%' }, { value: d.chip!, unit: '%' }]
    case 'static_charge':
    case 'mirror_plate':
      return [{ value: d.chance!, unit: '%' }]
  }
}

export interface SkillValuesTextOptions {
  /** Shipped locale code for the decimal separator ("2,5" in de/ru/fr). Default 'en'. */
  locale?: string
  /** `skills.percent` formatter — the sign's side and spacing differ ("5%", "5 %", "%5"). Default `${n}%`. */
  percent?: (n: string) => string
}

/**
 * Compact strip for "Next: {values}". Seconds and the percent sign are placed
 * by the locale's `skills.seconds` / `skills.percent` messages, decimals by
 * `numberFormatFor(locale)`.
 */
export function skillValuesText(
  id: SkillId,
  level: number,
  seconds: (n: string) => string,
  opts: SkillValuesTextOptions = {}
): string {
  const percent = opts.percent ?? ((n: string) => `${n}%`)
  return skillKeyValues(id, level, opts.locale)
    .map(v => (v.unit === 's' ? seconds(v.value) : v.unit === '%' ? percent(v.value) : v.unit === '×' ? `×${v.value}` : v.value))
    .join(' · ')
}

/** Level bar fill, 0…1. */
export const skillLevelFraction = (level: number): number =>
  Math.max(0, Math.min(1, level / SKILL_MAX_LEVEL))

/** The skill a boss stage drops, or null (non-boss stage / beyond the drop table). */
export const skillDroppedAt = (stageId: number): SkillId | null =>
  SKILL_AUTOFILL_ORDER.find(id => SKILLS[id].unlockStage === stageId) ?? null

export interface BossDropChip {
  id: SkillId
  /** Before the first skill unlock the drop is teased as "?" (§7.1, §7.5). */
  mystery: boolean
}

/**
 * The boss-drop chip for `bossStageId` (§7.5): shown while that boss's skill
 * is still locked, from the teaser stage on. Stages 1–7 see nothing, the
 * stage-10 boss is a "?" until skills exist, later bosses show their glyph.
 */
export function bossDropChip(
  bossStageId: number,
  highestCleared: number,
  enabled: boolean,
  teaserStage: number
): BossDropChip | null {
  if (!enabled) return null
  const id = skillDroppedAt(bossStageId)
  if (!id) return null
  if (highestCleared >= SKILLS[id].unlockStage) return null
  if (highestCleared + 1 < teaserStage) return null
  const first = SKILL_AUTOFILL_ORDER[0]!
  return { id, mystery: highestCleared < SKILLS[first].unlockStage && id === first }
}

// ─── Skill picker order (§7.3) ──────────────────────────────────────────────

export type PickerCardKind = 'here' | 'free' | 'other' | 'unlearned' | 'locked'

export interface PickerCard {
  id: SkillId
  kind: PickerCardKind
}

/**
 * Card order for the picker opened on `slot` (null = no slot context):
 * equipped in this slot → learned & unequipped → equipped in the other slot →
 * unlocked but not learned → locked. Inside each group: unlock (boss) order.
 */
export function pickerCards(
  slot: number | null,
  slots: readonly (SkillId | null)[],
  isUnlocked: (id: SkillId) => boolean,
  isLearned: (id: SkillId) => boolean
): PickerCard[] {
  const rank: Record<PickerCardKind, number> = { here: 0, free: 1, other: 2, unlearned: 3, locked: 4 }
  const kindOf = (id: SkillId): PickerCardKind => {
    if (!isUnlocked(id)) return 'locked'
    if (!isLearned(id)) return 'unlearned'
    const at = slots.indexOf(id)
    if (at === -1) return 'free'
    if (slot == null) return 'here'
    return at === slot ? 'here' : 'other'
  }
  return SKILL_AUTOFILL_ORDER
    .map((id, order) => ({ id, kind: kindOf(id), order }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.order - b.order)
    .map(({ id, kind }) => ({ id, kind }))
}
