// ─── Smasher catalog kit ────────────────────────────────────────────────────
//
// Shapes + authoring helpers shared by the catalog (src/data/smasherCatalog.ts)
// and its batch files (src/data/smashers/batch*.ts). Pure, type-only imports.

import type { BottomPartId, TopPartId } from '@/types/spinner'
import type { SkillId } from '@/types/skills'

export interface SmasherStatProfile {
  hp: number
  damage: number
  defense: number
  speed: number
  weight: number
}

/** Multipliers over the effect's level table, field by field. */
export type SkillMods = Partial<Record<string, number>>

export interface SmasherSkillDef {
  /** Unique id; i18n `smasher_skill_<id>` (name) + `smasher_skill_<id>_desc`. */
  id: string
  /** The skill-engine effect this skill runs on. */
  effect: SkillId
  mods: SkillMods
}

/** Directional armour: damage-TAKEN multipliers by where a hit lands relative
 *  to the smasher's heading (its launch / travel direction). 1 = neutral,
 *  < 1 = reinforced, > 1 = weak spot. The two sides between front and back
 *  stay 1. */
export interface SmasherArmor {
  front: number
  back: number
  /** How a reinforced zone is DRAWN: 'blade' = the sharp riveted steel plate
   *  (an attacker's edge), 'bulwark' = a chunky domed shield wall (a tank's
   *  fortification). Default: 'blade' for a damage-scaling smasher (profile
   *  damage >= BLADE_LOOK_DAMAGE), 'bulwark' for everyone else. Presentation
   *  only — the multipliers above are the whole mechanic. */
  look?: 'blade' | 'bulwark'
}

export interface SmasherDefOf<Id extends string> {
  id: Id
  /** i18n `smasher_<id>` (name), `smasher_<id>_species`, `smasher_<id>_desc`. */
  archetype: { top: TopPartId; bottom: BottomPartId }
  profile: SmasherStatProfile
  /** Highest campaign stage that must be reached to recruit it (1 = start). */
  unlockStage: number
  skills: readonly [SmasherSkillDef, SmasherSkillDef, SmasherSkillDef]
  /** Disc (collision + drawn) radius multiplier, 0.75 … 1.35; default 1.
   *  A big disc is easy to hit and hard to push, a small one slips through. */
  disc?: number
  /** Directional armour; default neutral. */
  armor?: SmasherArmor
}

export const sk = (id: string, effect: SkillId, mods: SkillMods = {}): SmasherSkillDef =>
  Object.freeze({ id, effect, mods: Object.freeze(mods) })

export const p = (hp: number, damage: number, defense: number, speed: number, weight = 1): SmasherStatProfile =>
  Object.freeze({ hp, damage, defense, speed, weight })
