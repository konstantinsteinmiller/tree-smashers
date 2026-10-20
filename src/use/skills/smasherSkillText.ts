// ─── Smasher skill copy (pure, no Vue) ──────────────────────────────────────
//
// Supplies the named params of `smasher_skill_<id>_desc` — the numbers a
// smasher skill really fights with at a given skill level: the effect's level
// table (`skillParams`) × the skill's own mods (`applySkillMods`), in the
// active locale's decimal notation. The wording (strength + weakness) lives in
// the locale files; this never concatenates translated fragments.

import { applySkillMods, skillParams } from '@/data/skillCatalog'
import type { SmasherSkillDef } from '@/data/smasherCatalog'
import { fmtNum } from '@/utils/localeNumber'

/** Every param a smasher skill description may name. */
export type SmasherSkillDescParams = Record<string, string>

/** Params of `smasher_skill_<skill.id>_desc` at engine `level` (1…10). */
export function smasherSkillDescParams(skill: SmasherSkillDef, level: number, locale = 'en'): SmasherSkillDescParams {
  const num = (n: number) => fmtNum(n, locale)
  const per = (f: number) => fmtNum(f * 100, locale)
  const lv = Math.max(1, level)
  switch (skill.effect) {
    case 'mirror_plate': {
      const p = applySkillMods(skillParams('mirror_plate', lv), skill.mods)
      return { chance: per(p.chance), share: per(p.share) }
    }
    case 'phase_step': {
      const p = applySkillMods(skillParams('phase_step', lv), skill.mods)
      return { chance: per(p.chance), cd: num(p.cooldownMs / 1000) }
    }
    case 'guard_shell': {
      const p = applySkillMods(skillParams('guard_shell', lv), skill.mods)
      return { pct: per(p.shield) }
    }
    case 'second_wind': {
      const p = applySkillMods(skillParams('second_wind', lv), skill.mods)
      return { threshold: per(p.threshold), pct: per(p.heal) }
    }
    case 'lucky_edge': {
      const p = applySkillMods(skillParams('lucky_edge', lv), skill.mods)
      return { chance: per(p.chance), mult: num(p.mult) }
    }
    case 'homing_rockets': {
      const p = applySkillMods(skillParams('homing_rockets', lv), skill.mods)
      return { n: String(p.everyN), pct: per(p.frac) }
    }
    case 'opening_salvo': {
      const p = applySkillMods(skillParams('opening_salvo', lv), skill.mods)
      return { pct: per(p.pct) }
    }
    case 'momentum': {
      const p = applySkillMods(skillParams('momentum', lv), skill.mods)
      return { pct: per(p.perStack), stacks: String(p.maxStacks) }
    }
    case 'hazard_ward': {
      const p = applySkillMods(skillParams('hazard_ward', lv), skill.mods)
      return { hazard: per(p.lava), chip: per(p.chip), shock: per(p.shockKeep) }
    }
    case 'static_charge': {
      const p = applySkillMods(skillParams('static_charge', lv), skill.mods)
      return { chance: per(p.chance) }
    }
    case 'bank_shot':
      return { pct: per(applySkillMods(skillParams('bank_shot', lv), skill.mods).pct) }
    case 'anchor':
      return { pct: per(Math.min(0.8, applySkillMods(skillParams('anchor', lv), skill.mods).resist)) }
    case 'tower_breaker':
      return { pct: per(applySkillMods(skillParams('tower_breaker', lv), skill.mods).pct) }
    case 'thorns':
      return { pct: per(applySkillMods(skillParams('thorns', lv), skill.mods).share) }
  }
}

/** i18n keys of a smasher skill. */
export const smasherSkillNameKey = (skill: Pick<SmasherSkillDef, 'id'>): string => `smasher_skill_${skill.id}`
export const smasherSkillDescKey = (skill: Pick<SmasherSkillDef, 'id'>): string => `smasher_skill_${skill.id}_desc`
