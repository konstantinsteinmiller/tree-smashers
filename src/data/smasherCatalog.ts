// ─── Smasher catalog ────────────────────────────────────────────────────────
//
// Pure data, no Vue. A SMASHER is one cute-but-angry stuffed animal sitting on
// a turning disc. It replaces the old top + bottom spinner composition: every
// smasher carries a fixed ARCHETYPE (one top part + one bottom part of the old
// system) so all the physics and damage rules keyed on parts (spiky chip,
// piercer, cushion, weight, force decay …) keep working bit for bit, and on top
// of it a unique stat PROFILE and three unique SKILLS.
//
// Skills reuse the ten battle-tested skill effects of the skill engine
// (`src/data/skillCatalog.ts`); a smasher skill is one effect plus MODS that
// multiply its level table, so two skills on the same effect have different
// strengths and weaknesses (e.g. a stronger dodge with a longer cooldown).
//
// Levels: 1 … SMASHER_MAX_LEVEL, bought with coins. A level counts as one
// upgrade of BOTH archetype parts in the old system, so a level-L smasher has
// the stats a spinner had with its top and bottom upgraded L − 1 times.
// Skill slot 1 is ready at level 1, slot 2 unlocks at level 10, slot 3 at 20.

import type { BottomPartId, SpinnerConfig, TopPartId } from '@/types/spinner'
import type { SkillId, SkillLoadout } from '@/types/skills'

export const SMASHER_IDS = [
  'bramble', 'thumper', 'grizzle', 'chomper', 'ramsey', 'vixie',
  'shellby', 'pecks', 'mossy', 'zippy', 'hootsie', 'tuskar'
] as const

export type SmasherId = (typeof SMASHER_IDS)[number]

export const SMASHER_MAX_LEVEL = 30

/** Smasher level at which skill slot i (0-based) becomes ready. */
export const SKILL_SLOT_LEVELS = [1, 10, 20] as const

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

export interface SmasherDef {
  id: SmasherId
  /** i18n `smasher_<id>` (name), `smasher_<id>_species`, `smasher_<id>_desc`. */
  archetype: { top: TopPartId; bottom: BottomPartId }
  profile: SmasherStatProfile
  /** Highest campaign stage that must be reached to recruit it (1 = start). */
  unlockStage: number
  skills: readonly [SmasherSkillDef, SmasherSkillDef, SmasherSkillDef]
}

const sk = (id: string, effect: SkillId, mods: SkillMods = {}): SmasherSkillDef =>
  Object.freeze({ id, effect, mods: Object.freeze(mods) })

const p = (hp: number, damage: number, defense: number, speed: number, weight = 1): SmasherStatProfile =>
  Object.freeze({ hp, damage, defense, speed, weight })

export const SMASHERS: Readonly<Record<SmasherId, SmasherDef>> = Object.freeze({
  // Hedgehog — spiky all-rounder that punishes whoever rams it.
  bramble: {
    id: 'bramble', archetype: { top: 'triangle', bottom: 'balanced' },
    profile: p(1.0, 1.0, 1.05, 0.95), unlockStage: 1,
    skills: [
      sk('quill_burst', 'mirror_plate', { chance: 1.3, share: 0.8 }),
      sk('curl_up', 'guard_shell', { shield: 1.2 }),
      sk('thorn_volley', 'homing_rockets', { everyN: 0.85, frac: 0.8 })
    ]
  },
  // Rabbit — glass-cannon kicker, fast and fragile.
  thumper: {
    id: 'thumper', archetype: { top: 'star', bottom: 'speedy' },
    profile: p(0.85, 1.15, 0.9, 1.1, 0.9), unlockStage: 1,
    skills: [
      sk('double_kick', 'lucky_edge', { chance: 1.2, mult: 0.9 }),
      sk('hop_dodge', 'phase_step', { chance: 1.3, cooldownMs: 1.15 }),
      sk('carrot_rush', 'momentum', { perStack: 1.2 })
    ]
  },
  // Bear cub — heavy tank that refuses to go down.
  grizzle: {
    id: 'grizzle', archetype: { top: 'round', bottom: 'tanky' },
    profile: p(1.25, 0.95, 1.1, 0.85, 1.15), unlockStage: 3,
    skills: [
      sk('honey_snack', 'second_wind', { heal: 1.3, threshold: 0.85 }),
      sk('bear_hug', 'guard_shell', { shield: 1.4 }),
      sk('grumpy_roar', 'static_charge', { chance: 0.9 })
    ]
  },
  // Beaver — the tree smasher: big crits, a hard-hitting opener.
  chomper: {
    id: 'chomper', archetype: { top: 'piercer', bottom: 'balanced' },
    profile: p(0.95, 1.15, 0.95, 1.0), unlockStage: 5,
    skills: [
      sk('timber_bite', 'lucky_edge', { mult: 1.15, chance: 0.85 }),
      sk('log_slam', 'opening_salvo', { pct: 1.2 }),
      sk('dam_wall', 'hazard_ward', { lava: 1.2, thunder: 1.2, chip: 1.2, shockKeep: 1.2 })
    ]
  },
  // Ram — head-first bruiser, explosive but short-lived momentum.
  ramsey: {
    id: 'ramsey', archetype: { top: 'quadratic', bottom: 'tanky' },
    profile: p(1.1, 1.05, 1.05, 0.9, 1.2), unlockStage: 8,
    skills: [
      sk('headbutt', 'opening_salvo', { pct: 1.35 }),
      sk('horn_charge', 'momentum', { perStack: 1.3, maxStacks: 0.67 }),
      sk('wool_guard', 'mirror_plate', { share: 1.2, chance: 0.8 })
    ]
  },
  // Fox — tricky striker, frequent small crits and slippery dodges.
  vixie: {
    id: 'vixie', archetype: { top: 'star', bottom: 'balanced' },
    profile: p(0.9, 1.1, 0.95, 1.05), unlockStage: 11,
    skills: [
      sk('trick_step', 'phase_step', { chance: 1.15 }),
      sk('sly_strike', 'lucky_edge', { chance: 1.35, mult: 0.85 }),
      sk('fox_fire', 'homing_rockets', { frac: 1.15, everyN: 1.15 })
    ]
  },
  // Turtle — the slowest, toughest wall in the forest.
  shellby: {
    id: 'shellby', archetype: { top: 'cushioned', bottom: 'tanky' },
    profile: p(1.3, 0.85, 1.15, 0.8, 1.25), unlockStage: 15,
    skills: [
      sk('shell_block', 'guard_shell', { shield: 1.5 }),
      sk('slow_heal', 'second_wind', { threshold: 1.15, heal: 0.9 }),
      sk('mossy_ward', 'hazard_ward', { lava: 1.4, thunder: 1.4, chip: 1.4, shockKeep: 1.4 })
    ]
  },
  // Woodpecker — rapid pecks that stack up, fragile body.
  pecks: {
    id: 'pecks', archetype: { top: 'piercer', bottom: 'speedy' },
    profile: p(0.85, 1.2, 0.85, 1.1, 0.85), unlockStage: 20,
    skills: [
      sk('peck_peck', 'momentum', { maxStacks: 1.34, perStack: 0.85 }),
      sk('drill_beak', 'lucky_edge', { mult: 1.25, chance: 0.8 }),
      sk('feather_flurry', 'homing_rockets', { everyN: 0.85, frac: 0.85 })
    ]
  },
  // Sloth — sleepy cushion that lulls enemies into skipping turns.
  mossy: {
    id: 'mossy', archetype: { top: 'cushioned', bottom: 'balanced' },
    profile: p(1.2, 0.9, 1.1, 0.9, 1.05), unlockStage: 25,
    skills: [
      sk('lazy_shield', 'guard_shell', { shield: 1.25 }),
      sk('nap_time', 'static_charge', { chance: 1.2 }),
      sk('leaf_mend', 'second_wind', { heal: 1.15 })
    ]
  },
  // Squirrel — hyperactive nut thrower, dodges on a short fuse.
  zippy: {
    id: 'zippy', archetype: { top: 'triangle', bottom: 'speedy' },
    profile: p(0.85, 1.05, 0.9, 1.15, 0.9), unlockStage: 30,
    skills: [
      sk('nut_toss', 'homing_rockets', { everyN: 0.85, frac: 0.9 }),
      sk('acorn_armor', 'mirror_plate', { chance: 1.15 }),
      sk('dash_dodge', 'phase_step', { cooldownMs: 0.85, chance: 0.9 })
    ]
  },
  // Owl — balanced thinker whose feathers crackle with static.
  hootsie: {
    id: 'hootsie', archetype: { top: 'quadratic', bottom: 'balanced' },
    profile: p(1.0, 1.0, 1.0, 1.0), unlockStage: 40,
    skills: [
      sk('night_eye', 'lucky_edge'),
      sk('wing_ward', 'hazard_ward', { lava: 1.1, thunder: 1.1, chip: 1.1, shockKeep: 1.1 }),
      sk('static_feathers', 'static_charge', { chance: 1.3 })
    ]
  },
  // Boar — stubborn mud-roller that hands damage back.
  tuskar: {
    id: 'tuskar', archetype: { top: 'round', bottom: 'balanced' },
    profile: p(1.1, 1.05, 1.05, 0.95, 1.1), unlockStage: 50,
    skills: [
      sk('tusk_toss', 'opening_salvo', { pct: 1.1 }),
      sk('mud_roll', 'mirror_plate', { share: 1.4, chance: 0.75 }),
      sk('stampede', 'momentum', { perStack: 1.1 })
    ]
  }
})

export const SMASHER_LIST: readonly SmasherDef[] = SMASHER_IDS.map(id => SMASHERS[id])

export const isSmasherId = (v: unknown): v is SmasherId =>
  typeof v === 'string' && (SMASHER_IDS as readonly string[]).includes(v)

export const clampSmasherLevel = (level: unknown): number => {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 1
  return Math.min(SMASHER_MAX_LEVEL, Math.max(1, n))
}

/** Coins to go from `level` to `level + 1`; null at max. One smasher level is
 *  one upgrade of both archetype parts, so it costs about two part upgrades. */
export const smasherLevelCost = (level: number): number | null => {
  if (!Number.isInteger(level) || level < 1 || level >= SMASHER_MAX_LEVEL) return null
  const to = level + 1
  const extra = to > 10 ? 3 * (to - 10) * (to - 10) : 0
  return Math.round((100 + (to - 1) * 20 + extra) * 1.6)
}

/** Number of skill slots ready at this level (1 … 3). */
export const unlockedSkillCount = (level: number): number =>
  SKILL_SLOT_LEVELS.filter(l => clampSmasherLevel(level) >= l).length

/** Skill-engine level (1 … 10) of slot `slot` for a smasher at `level`: L1
 *  when the slot opens, +1 every two smasher levels after that. */
export const smasherSkillLevel = (level: number, slot: number): number => {
  const open = SKILL_SLOT_LEVELS[slot] ?? Infinity
  const lv = clampSmasherLevel(level)
  if (lv < open) return 0
  return Math.min(10, 1 + Math.floor((lv - open) / 2))
}

/** Which smasher an NPC blade looks like: the first smasher of the matching
 *  archetype top, picked deterministically by its model id so a stage's
 *  enemy team always looks the same. */
export const smasherForParts = (top: TopPartId, bottom: BottomPartId, seedKey = ''): SmasherId => {
  const exact = SMASHER_LIST.filter(s => s.archetype.top === top && s.archetype.bottom === bottom)
  const pool = exact.length ? exact : SMASHER_LIST.filter(s => s.archetype.top === top)
  if (pool.length === 0) return 'bramble'
  let h = 0
  for (let i = 0; i < seedKey.length; i++) h = (h * 31 + seedKey.charCodeAt(i)) >>> 0
  return pool[h % pool.length]!.id
}

/** The battle config of a smasher at `level`: archetype parts, both upgraded
 *  level − 1 times (see the header), plus its id and level. */
export const smasherConfig = (id: SmasherId, level: number, modelId?: string): SpinnerConfig => {
  const def = SMASHERS[id]
  const lv = clampSmasherLevel(level)
  const cfg: SpinnerConfig = {
    smasherId: id,
    level: lv,
    topPartId: def.archetype.top,
    bottomPartId: def.archetype.bottom,
    topLevel: lv - 1,
    bottomLevel: lv - 1
  }
  if (modelId) cfg.modelId = modelId
  return cfg
}

/** The skills a smasher blade brings into battle: every slot its level has
 *  opened, at the slot's engine level, with the skill's mods. Empty for a
 *  config without a smasher. */
export const smasherLoadout = (config: Pick<SpinnerConfig, 'smasherId' | 'level'>): SkillLoadout => {
  if (!isSmasherId(config.smasherId)) return []
  const def = SMASHERS[config.smasherId]
  const out: SkillLoadout = []
  def.skills.forEach((skill, slot) => {
    const level = smasherSkillLevel(config.level ?? 1, slot)
    if (level > 0) out.push({ id: skill.effect, level, mods: { ...skill.mods }, key: skill.id })
  })
  return out
}

/** Smasher skill def by its unique id. */
export const smasherSkillById = (key: string): { smasher: SmasherDef; slot: number; skill: SmasherSkillDef } | null => {
  for (const smasher of SMASHER_LIST) {
    const slot = smasher.skills.findIndex(s => s.id === key)
    if (slot >= 0) return { smasher, slot, skill: smasher.skills[slot]! }
  }
  return null
}
