// ─── Skill copy helpers (pure, no Vue) ──────────────────────────────────────
//
// Turns catalog numbers into the named params of the `skills.desc.<id>`
// messages (skills-feature.md §7.3, §10.5) and the "Next:" value strip, with
// decimals in the active locale's notation. All wording lives in the locale
// files; this only supplies numbers, so the UI never concatenates translated
// fragments.

import { SKILL_MAX_LEVEL, skillParams } from '@/data/skillCatalog'
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
    case 'bank_shot':
      return { pct: per(skillParams('bank_shot', level).pct) }
    case 'anchor':
      return { pct: per(skillParams('anchor', level).resist) }
    case 'tower_breaker':
      return { pct: per(skillParams('tower_breaker', level).pct) }
    case 'thorns':
      return { pct: per(skillParams('thorns', level).share) }
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
    case 'bank_shot':
    case 'anchor':
    case 'tower_breaker':
    case 'thorns':
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

