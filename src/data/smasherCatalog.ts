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
// Levels: 1, 2, 3 … with no gameplay cap, bought with coins. A level counts as
// one upgrade of BOTH archetype parts in the old system, so a level-L smasher
// has the stats a spinner had with its top and bottom upgraded L − 1 times —
// up to SMASHER_TAPER_LEVEL (30); past it the per-level stat gain tapers
// (`smasherUpgradeLevel`) and every level costs ~8 % more on top of the
// quadratic curve (`smasherLevelCost`), so going deep gets ever harder without
// ever being walled off. Skill slot 1 is ready at level 1, slot 2 unlocks at
// level 10, slot 3 at 20; skill levels stop at 10 (the skill engine's table).

import type { BottomPartId, SpinnerConfig, TopPartId } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'
import {
  p,
  sk,
  type SkillMods,
  type SmasherArmor,
  type SmasherDefOf,
  type SmasherSkillDef,
  type SmasherStatProfile
} from '@/data/smashers/kit'
import { BATCH_A, BATCH_A_IDS } from '@/data/smashers/batchA'
import { BATCH_B, BATCH_B_IDS } from '@/data/smashers/batchB'
import { BATCH_C, BATCH_C_IDS } from '@/data/smashers/batchC'

export const BASE_SMASHER_IDS = [
  'bramble', 'thumper', 'grizzle', 'chomper', 'ramsey', 'vixie',
  'shellby', 'pecks', 'mossy', 'zippy', 'hootsie', 'tuskar'
] as const

export type BaseSmasherId = (typeof BASE_SMASHER_IDS)[number]

/** Every smasher: the base twelve, then the batches (src/data/smashers/). */
export const SMASHER_IDS = [...BASE_SMASHER_IDS, ...BATCH_A_IDS, ...BATCH_B_IDS, ...BATCH_C_IDS] as const

export type SmasherId = (typeof SMASHER_IDS)[number]

/** NOT a gameplay cap: a technical ceiling against corrupted / tampered saves
 *  and hostile PvP peers, so levels, costs and stats always stay finite. An
 *  honest player never gets near it (see `smasherLevelCost`). */
export const SMASHER_LEVEL_SANITY_MAX = 9999

/** Last level of the original (pre-uncap) curve: costs and stats up to here
 *  are unchanged; past it costs grow exponentially and stat gains taper. */
export const SMASHER_TAPER_LEVEL = 30

/** Per-level cost growth past SMASHER_TAPER_LEVEL (on top of the quadratic). */
export const SMASHER_COST_GROWTH = 1.08

/** Taper scale (upgrades) of the stat gain past SMASHER_TAPER_LEVEL: the
 *  marginal gain of a level is 1 / √(1 + x / S) of a pre-30 level. */
export const SMASHER_TAPER_SCALE = 5

/** Smasher level at which skill slot i (0-based) becomes ready. */
export const SKILL_SLOT_LEVELS = [1, 10, 20] as const

export type { SmasherStatProfile, SkillMods, SmasherSkillDef, SmasherArmor }

export type SmasherDef = SmasherDefOf<SmasherId>

const BASE_SMASHERS: Readonly<Record<BaseSmasherId, SmasherDefOf<BaseSmasherId>>> = Object.freeze({
  // Hedgehog — spiky all-rounder that punishes whoever rams it.
  bramble: {
    id: 'bramble', archetype: { top: 'triangle', bottom: 'balanced' },
    profile: p(0.95, 0.95, 1.05, 0.95), unlockStage: 1, disc: 1, armor: { front: 0.85, back: 1.1 },
    skills: [
      sk('quill_burst', 'thorns', { share: 1.1 }),
      sk('curl_up', 'guard_shell', { shield: 1.2 }),
      sk('thorn_volley', 'homing_rockets', { everyN: 0.85, frac: 0.8 })
    ]
  },
  // Rabbit — glass-cannon kicker, fast and fragile.
  thumper: {
    id: 'thumper', archetype: { top: 'star', bottom: 'speedy' },
    profile: p(0.85, 1.15, 0.9, 1.1, 0.9), unlockStage: 1, disc: 0.85, armor: { front: 1, back: 1.15 },
    skills: [
      sk('double_kick', 'lucky_edge', { chance: 1.2, mult: 0.9 }),
      sk('hop_dodge', 'phase_step', { chance: 1.3, cooldownMs: 1.15 }),
      sk('carrot_rush', 'momentum', { perStack: 1.2 })
    ]
  },
  // Bear cub — heavy tank that refuses to go down.
  grizzle: {
    id: 'grizzle', archetype: { top: 'round', bottom: 'tanky' },
    profile: p(1.22, 0.93, 1.1, 0.85, 1.15), unlockStage: 3, disc: 1.2, armor: { front: 0.85, back: 1 },
    skills: [
      sk('honey_snack', 'second_wind', { heal: 1.3, threshold: 0.85 }),
      sk('bear_hug', 'guard_shell', { shield: 1.4 }),
      sk('grumpy_roar', 'static_charge', { chance: 0.9 })
    ]
  },
  // Beaver — the tree smasher: big crits, a hard-hitting opener.
  chomper: {
    id: 'chomper', archetype: { top: 'piercer', bottom: 'balanced' },
    profile: p(1.04, 1.27, 0.95, 1.0), unlockStage: 5, armor: { front: 0.8, back: 1.2 },
    skills: [
      sk('timber_bite', 'lucky_edge', { mult: 1.15, chance: 0.85 }),
      sk('log_slam', 'tower_breaker', { pct: 1.2 }),
      sk('dam_wall', 'hazard_ward', { lava: 1.2, thunder: 1.2, chip: 1.2, shockKeep: 1.2 })
    ]
  },
  // Ram — head-first bruiser, explosive but short-lived momentum.
  ramsey: {
    id: 'ramsey', archetype: { top: 'quadratic', bottom: 'tanky' },
    profile: p(1.12, 1.08, 1.05, 0.9, 1.2), unlockStage: 8, disc: 1.1, armor: { front: 0.6, back: 1.3 },
    skills: [
      sk('headbutt', 'opening_salvo', { pct: 1.35 }),
      sk('horn_charge', 'momentum', { perStack: 1.3, maxStacks: 0.67 }),
      sk('wool_guard', 'mirror_plate', { share: 1.2, chance: 0.8 })
    ]
  },
  // Fox — tricky striker, frequent small crits and slippery dodges.
  vixie: {
    id: 'vixie', archetype: { top: 'star', bottom: 'balanced' },
    profile: p(1.01, 1.21, 0.95, 1.05), unlockStage: 11, disc: 0.85, armor: { front: 1.1, back: 0.9 },
    skills: [
      sk('trick_step', 'phase_step', { chance: 1.15 }),
      sk('sly_strike', 'lucky_edge', { chance: 1.35, mult: 0.85 }),
      sk('fox_fire', 'homing_rockets', { frac: 1.15, everyN: 1.15 })
    ]
  },
  // Turtle — the slowest, toughest wall in the forest.
  shellby: {
    id: 'shellby', archetype: { top: 'cushioned', bottom: 'tanky' },
    profile: p(1.38, 0.89, 1.15, 0.8, 1.25), unlockStage: 15, disc: 1.25, armor: { front: 1.15, back: 0.6 },
    skills: [
      sk('shell_block', 'guard_shell', { shield: 1.5 }),
      sk('slow_heal', 'second_wind', { threshold: 1.15, heal: 0.9 }),
      sk('mossy_ward', 'hazard_ward', { lava: 1.4, thunder: 1.4, chip: 1.4, shockKeep: 1.4 })
    ]
  },
  // Woodpecker — rapid pecks that stack up, fragile body.
  pecks: {
    id: 'pecks', archetype: { top: 'piercer', bottom: 'speedy' },
    profile: p(1.05, 1.39, 0.9, 1.1, 0.85), unlockStage: 20, disc: 0.8, armor: { front: 0.8, back: 1.25 },
    skills: [
      sk('peck_peck', 'momentum', { maxStacks: 1.34, perStack: 0.85 }),
      sk('drill_beak', 'lucky_edge', { mult: 1.25, chance: 0.8 }),
      sk('feather_flurry', 'homing_rockets', { everyN: 0.85, frac: 0.85 })
    ]
  },
  // Sloth — sleepy cushion that lulls enemies into skipping turns.
  mossy: {
    id: 'mossy', archetype: { top: 'cushioned', bottom: 'balanced' },
    profile: p(1.08, 0.8, 1.1, 0.9, 1.05), unlockStage: 25, disc: 1.15, armor: { front: 1, back: 0.85 },
    skills: [
      sk('lazy_shield', 'guard_shell', { shield: 1.25 }),
      sk('nap_time', 'static_charge', { chance: 1.2 }),
      sk('leaf_mend', 'second_wind', { heal: 1.15 })
    ]
  },
  // Squirrel — hyperactive nut thrower, dodges on a short fuse.
  zippy: {
    id: 'zippy', archetype: { top: 'triangle', bottom: 'speedy' },
    profile: p(0.96, 1.12, 0.95, 1.15, 0.9), unlockStage: 30, disc: 0.78, armor: { front: 1.15, back: 1 },
    skills: [
      sk('nut_toss', 'homing_rockets', { everyN: 0.85, frac: 0.9 }),
      sk('acorn_armor', 'mirror_plate', { chance: 1.15 }),
      sk('dash_dodge', 'phase_step', { cooldownMs: 0.85, chance: 0.9 })
    ]
  },
  // Owl — balanced thinker whose feathers crackle with static.
  hootsie: {
    id: 'hootsie', archetype: { top: 'quadratic', bottom: 'balanced' },
    profile: p(1.23, 1.23, 1.0, 1.0), unlockStage: 40,
    skills: [
      sk('night_eye', 'lucky_edge'),
      sk('wing_ward', 'hazard_ward', { lava: 1.1, thunder: 1.1, chip: 1.1, shockKeep: 1.1 }),
      sk('static_feathers', 'static_charge', { chance: 1.3 })
    ]
  },
  // Boar — stubborn mud-roller that hands damage back.
  tuskar: {
    id: 'tuskar', archetype: { top: 'round', bottom: 'balanced' },
    profile: p(1.03, 0.98, 1.05, 0.95, 1.1), unlockStage: 50, disc: 1.1, armor: { front: 0.75, back: 1.15 },
    skills: [
      sk('tusk_toss', 'opening_salvo', { pct: 1.1 }),
      sk('mud_roll', 'mirror_plate', { share: 1.4, chance: 0.75 }),
      sk('stampede', 'momentum', { perStack: 1.1 })
    ]
  }
})

export const SMASHERS: Readonly<Record<SmasherId, SmasherDef>> = Object.freeze({
  ...BASE_SMASHERS, ...BATCH_A, ...BATCH_B, ...BATCH_C
})

export const SMASHER_LIST: readonly SmasherDef[] = SMASHER_IDS.map(id => SMASHERS[id])

export const isSmasherId = (v: unknown): v is SmasherId =>
  typeof v === 'string' && (SMASHER_IDS as readonly string[]).includes(v)

// ─── Release gate ───────────────────────────────────────────────────────────
//
// Owner (2026-10-22): "put emphasis on smashers 1–24 for now and put the other
// smashers for a later release". The catalog keeps all 48 (data, art, skills
// stay for the later release); the gate says which of them exist for a
// PLAYER. The ONE source of truth: the first RELEASED_SMASHER_COUNT ids of
// SMASHER_IDS (unlock order) — Bramble … Gastro by default.
//
// Rules every player-facing place follows (roadmap "Smasher release gate"):
//   • roster / team modal: only released smashers (+ a "coming soon" teaser),
//     EXCEPT an unreleased smasher a save already owns (grandfathered: nothing
//     is taken away, it stays in that player's roster and team);
//   • campaign: reaching an unreleased smasher's stage recruits nothing and
//     offers no premium unlock; legendary unlock list = released premiums only;
//   • enemies (campaign NPC looks, bosses, PvP bots, league NPCs / ghosts,
//     skin portraits) use released smashers only — unreleased ids in old
//     server data map to `releasedSmasherFallback` at the load boundary.
// `VITE_APP_SMASHERS_RELEASED` ("all" or 1–48, validated in vite.config.ts)
// overrides the count for dev / testing the later release.

export const DEFAULT_RELEASED_SMASHER_COUNT = 24

/** The flag value → released count (unset / invalid → the default). */
export const parseReleasedSmasherCount = (raw: unknown): number => {
  if (raw === 'all') return SMASHER_IDS.length
  const n = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN
  return Number.isInteger(n) ? Math.min(SMASHER_IDS.length, n) : DEFAULT_RELEASED_SMASHER_COUNT
}

const releasedFlag = (): unknown => {
  try {
    return import.meta.env?.VITE_APP_SMASHERS_RELEASED
  } catch {
    return undefined
  }
}

/** How many smashers (catalog order) this build releases. */
export const RELEASED_SMASHER_COUNT: number = parseReleasedSmasherCount(releasedFlag())

/** The released smashers, in unlock order. */
export const RELEASED_SMASHER_IDS: readonly SmasherId[] = Object.freeze(SMASHER_IDS.slice(0, RELEASED_SMASHER_COUNT))

/** Held back for the later release (empty when the flag opens all). */
export const UNRELEASED_SMASHER_IDS: readonly SmasherId[] = Object.freeze(SMASHER_IDS.slice(RELEASED_SMASHER_COUNT))

const RELEASED_SET: ReadonlySet<string> = new Set<string>(RELEASED_SMASHER_IDS)

export const isReleasedSmasher = (id: unknown): boolean => typeof id === 'string' && RELEASED_SET.has(id)

export const RELEASED_SMASHER_LIST: readonly SmasherDef[] = RELEASED_SMASHER_IDS.map(id => SMASHERS[id])

/** A released stand-in for any smasher (itself when released): same top +
 *  bottom archetype, else same top, else Bramble — deterministic by id, so
 *  both sides of a lockstep match map an old ghost the same way. */
export const releasedSmasherFallback = (id: SmasherId): SmasherId => {
  if (RELEASED_SET.has(id)) return id
  const { top, bottom } = SMASHERS[id].archetype
  const exact = RELEASED_SMASHER_LIST.filter(s => s.archetype.top === top && s.archetype.bottom === bottom)
  const pool = exact.length ? exact : RELEASED_SMASHER_LIST.filter(s => s.archetype.top === top)
  if (pool.length === 0) return 'bramble'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return pool[h % pool.length]!.id
}

export const clampSmasherLevel = (level: unknown): number => {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 1
  return Math.min(SMASHER_LEVEL_SANITY_MAX, Math.max(1, n))
}

/** Coins to go from `level` to `level + 1`; null only at the technical
 *  sanity ceiling. One smasher level is one upgrade of both archetype parts,
 *  so it costs about two part upgrades. Levels 2 … 30 keep the original
 *  quadratic prices; every level past 30 multiplies by SMASHER_COST_GROWTH. */
export const smasherLevelCost = (level: number): number | null => {
  if (!Number.isInteger(level) || level < 1 || level >= SMASHER_LEVEL_SANITY_MAX) return null
  const to = level + 1
  const extra = to > 10 ? 3 * (to - 10) * (to - 10) : 0
  const base = (100 + (to - 1) * 20 + extra) * 1.6
  const steep = to > SMASHER_TAPER_LEVEL ? SMASHER_COST_GROWTH ** (to - SMASHER_TAPER_LEVEL) : 1
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(base * steep))
}

/** Effective part-upgrade count of a smasher whose parts are upgraded `n`
 *  times: `n` up to SMASHER_TAPER_LEVEL − 1, then diminishing returns
 *  (√ taper — unbounded but ever slower; Math.sqrt is exactly rounded, so
 *  lock-step PvP stays bit-identical across engines). */
export const smasherUpgradeLevel = (n: number): number => {
  const knee = SMASHER_TAPER_LEVEL - 1
  if (!(n > knee)) return n
  const x = n - knee
  return knee + 2 * SMASHER_TAPER_SCALE * (Math.sqrt(1 + x / SMASHER_TAPER_SCALE) - 1)
}

/** Number of skill slots ready at this level (1 … 3). */
export const unlockedSkillCount = (level: number): number =>
  SKILL_SLOT_LEVELS.filter(l => clampSmasherLevel(level) >= l).length

/** Skill-engine level (1 … 10) of slot `slot` for a smasher at `level`: L1
 *  when the slot opens, +1 every two smasher levels after that, capped at 10
 *  (the skill tables end there — slot 3 maxes at smasher level 38; deeper
 *  levels only add tapered stats). */
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
  // Released smashers only (release gate): no enemy the player can't get.
  const exact = RELEASED_SMASHER_LIST.filter(s => s.archetype.top === top && s.archetype.bottom === bottom)
  const pool = exact.length ? exact : RELEASED_SMASHER_LIST.filter(s => s.archetype.top === top)
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
