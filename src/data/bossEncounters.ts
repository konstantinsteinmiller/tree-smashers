// ─── Stage-101+ boss encounters (bosses-100-feature.md §3, §5, §9, §12.1) ────
//
// Pure data + pure builders, no Vue — unit-testable like skinCatalog.ts, and
// importable by the league (LG7) and the Boss Lab without dragging the
// campaign's reactive state along.
//
// ── Layout ──
// The boss LAYOUT repeats every 200 stages; the DIFFICULTY keeps its 100-stage
// cycle (useSpinnerCampaign `cycleLevelBonus` / `cycleRewardMul`). In every
// odd 100-cycle (stages 101–200, 301–400, …) the ten x10 boss slots 110…200
// field the encounters below instead of the cycle copy of base stages
// 10…100; the x5 slots (105, 115, … 195) and 188 keep their cycle copies.
//
// ── Levels ──
// `enemyTeam` holds the CYCLE-1 part levels (what stage 101–200 fields). They
// are the tuning dial of the boss sim (`tools/skills-sim/bosses100.mjs`, which
// reads THIS table — keep `BOSS_ENCOUNTER_TABLE` a plain JS literal built only
// with `b()`), not a copy of the replaced stage's levels. A later odd cycle
// adds +22 per 100-cycle past the first: stage 310 = authored + 44.
//
// ── Rewards ──
// An encounter pays the REPLACED slot's reward row (trim + cycle multiplier);
// the campaign fills that in. The only extra is a trophy skin (§3.5): the
// first win over an encounter grants every skin in its `trophySkins`
// (idempotent). Trophy skins are earn-only (user decision B2) — the skin
// catalog's offer paths must exclude `BOSS_TROPHY_SKIN_IDS`.

import type { BottomPartId, BossAbility, BossTrait, TopPartId } from '@/types/spinner'
import type { ArenaType, Stage, StageBladeConfig } from '@/use/useSpinnerCampaign'
import type { LeagueTier } from '@/use/leagueTiers'

/** Boss layout period: stage `id` and `id + 200` field the same boss lineup. */
export const BOSS_LAYOUT_PERIOD = 200

/** The ten encounters, in slot order. */
export const BOSS_ENCOUNTER_IDS = [
  'cinder_tyrant',
  'glacier_warden',
  'frostbite_yeti',
  'twin_pyres',
  'blizzard_choir',
  'shattering_glacier',
  'frostfire_pact',
  'magma_titan',
  'blizzard_twins',
  'elemental_court'
] as const
export type BossEncounterId = (typeof BOSS_ENCOUNTER_IDS)[number]

/** Slots (1…200 of the layout period) that field a new encounter. */
export const BOSS_ENCOUNTER_SLOTS = [110, 120, 130, 140, 150, 160, 170, 180, 190, 200] as const
export type BossEncounterSlot = (typeof BOSS_ENCOUNTER_SLOTS)[number]

/**
 * Trophy skins worn by the new bosses (§3.5, §7.1) — earn-only. The ids are
 * the contract with the skin catalog / art pipeline (BW5): model ids in
 * `SPINNER_MODEL_IDS`, images `public/images/models/<id>_256x256.webp`,
 * names under `skins.<id>`.
 */
export const BOSS_TROPHY_SKIN_IDS = ['cinder', 'frost-vault', 'yeti'] as const
export type BossTrophySkinId = (typeof BOSS_TROPHY_SKIN_IDS)[number]

/** Canonical trait order (HUD chips, peek glyph row, intro card). */
export const BOSS_TRAITS: readonly BossTrait[] = ['ember', 'frost', 'chill']

export interface BossEncounter {
  id: BossEncounterId
  slot: BossEncounterSlot
  /** Translation key under `stages.` (`Stage.name`). */
  nameKey: `boss_${BossEncounterId}`
  arenaType: ArenaType
  bouncers?: number
  /** Cycle-1 levels; `bossTrait` set on the carriers. */
  enemyTeam: readonly StageBladeConfig[]
  /** Skins the first win over this encounter grants (earn-only trophies). */
  trophySkins: readonly BossTrophySkinId[]
}

// Mechanic magnitudes (EMBER_PCT, CHILL_TURNS, …) are NOT here: they live in
// `BOSS_TRAIT_DEFAULTS` of src/use/bosses/bossTraits.ts (the runtime module),
// mirrored by DEFAULT_KNOBS in the sim. This table only says WHO carries WHICH
// trait (`bossTrait`, `shardTrait`) at which levels, on which arena.

/**
 * `b(top, bot, tl, bl, modelId, ability, trait?, extra?)` — one boss blade.
 * Every encounter blade is a boss; `'plain'` means no `bossAbility`.
 * (bosses100.mjs re-implements exactly this helper to evaluate the table.)
 */
const b = (
  top: TopPartId,
  bot: BottomPartId,
  tl: number,
  bl: number,
  modelId: string,
  ability: BossAbility | 'plain',
  trait?: BossTrait,
  extra: { shardTrait?: BossTrait } = {}
): StageBladeConfig => {
  const cfg: StageBladeConfig = {
    topPartId: top,
    bottomPartId: bot,
    topLevel: tl,
    bottomLevel: bl,
    modelId,
    isBoss: true,
    ...extra
  }
  if (ability !== 'plain') cfg.bossAbility = ability
  if (trait) cfg.bossTrait = trait
  return cfg
}

// ─── The table (§5). Levels are cycle-1 levels from the sim (§8.4). ─────────
// Keep this a plain JS literal (no TS syntax inside the brackets): the boss
// sim slices and evaluates it.
const BOSS_ENCOUNTER_TABLE: BossEncounter[] = [
  {
    id: 'cinder_tyrant', slot: 110, nameKey: 'boss_cinder_tyrant', arenaType: 'boss',
    trophySkins: ['cinder'],
    enemyTeam: [b('round', 'tanky', 22, 22, 'cinder', 'plain', 'ember')]
  },
  {
    id: 'glacier_warden', slot: 120, nameKey: 'boss_glacier_warden', arenaType: 'boss',
    trophySkins: ['frost-vault'],
    enemyTeam: [b('quadratic', 'speedy', 45, 45, 'frost-vault', 'plain', 'frost')]
  },
  {
    id: 'frostbite_yeti', slot: 130, nameKey: 'boss_frostbite_yeti', arenaType: 'boss',
    trophySkins: ['yeti'],
    enemyTeam: [b('triangle', 'tanky', 20, 20, 'yeti', 'plain', 'chill')]
  },
  {
    id: 'twin_pyres', slot: 140, nameKey: 'boss_twin_pyres', arenaType: 'boss',
    trophySkins: ['cinder'],
    enemyTeam: [b('round', 'balanced', 33, 33, 'cinder', 'ghost', 'ember')]
  },
  {
    id: 'blizzard_choir', slot: 150, nameKey: 'boss_blizzard_choir', arenaType: 'boss',
    trophySkins: ['yeti'],
    enemyTeam: [
      b('triangle', 'tanky', 18, 18, 'yeti', 'healers', 'chill'),
      b('cushioned', 'balanced', 17, 17, 'shell', 'healers'),
      b('quadratic', 'balanced', 17, 17, 'prisma', 'healers')
    ]
  },
  {
    id: 'shattering_glacier', slot: 160, nameKey: 'boss_shattering_glacier', arenaType: 'boss',
    trophySkins: ['frost-vault'],
    enemyTeam: [b('quadratic', 'speedy', 52, 52, 'frost-vault', 'split', 'frost', { shardTrait: 'chill' })]
  },
  {
    id: 'frostfire_pact', slot: 170, nameKey: 'boss_frostfire_pact', arenaType: 'boss',
    trophySkins: ['cinder', 'frost-vault'],
    enemyTeam: [
      b('round', 'tanky', 26, 26, 'cinder', 'partners', 'ember'),
      b('quadratic', 'speedy', 26, 26, 'frost-vault', 'partners', 'frost')
    ]
  },
  {
    id: 'magma_titan', slot: 180, nameKey: 'boss_magma_titan', arenaType: 'lava',
    trophySkins: [],
    enemyTeam: [b('cushioned', 'tanky', 46, 44, 'boulder', 'stat-switch', 'ember')]
  },
  {
    id: 'blizzard_twins', slot: 190, nameKey: 'boss_blizzard_twins', arenaType: 'ice',
    trophySkins: ['yeti'],
    enemyTeam: [b('triangle', 'tanky', 26, 26, 'yeti', 'ghost', 'chill')]
  },
  {
    id: 'elemental_court', slot: 200, nameKey: 'boss_elemental_court', arenaType: 'boss',
    trophySkins: ['cinder', 'frost-vault', 'yeti'],
    enemyTeam: [
      b('round', 'balanced', 24, 24, 'cinder', 'partners', 'ember'),
      b('quadratic', 'speedy', 24, 24, 'frost-vault', 'partners', 'frost'),
      b('triangle', 'tanky', 24, 24, 'yeti', 'partners', 'chill')
    ]
  }
]

const freezeEncounter = (enc: BossEncounter): BossEncounter => {
  for (const cfg of enc.enemyTeam) Object.freeze(cfg)
  Object.freeze(enc.enemyTeam)
  Object.freeze(enc.trophySkins)
  return Object.freeze(enc)
}

// Module-scope values are built with `@__PURE__` calls: this is a bosses-gate
// boundary module (src/bosses/bosses100Gate.ts, unobfuscated), and a
// bosses100-off build must tree-shake the whole table when nothing reads it.

/** The ten encounters in slot order (frozen — builders hand out copies). */
export const BOSS_ENCOUNTERS: readonly BossEncounter[] = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ BOSS_ENCOUNTER_TABLE.map(freezeEncounter)
)

const BY_ID = /* @__PURE__ */ new Map<BossEncounterId, BossEncounter>(/* @__PURE__ */ BOSS_ENCOUNTERS.map(enc => [enc.id, enc]))
const BY_SLOT = /* @__PURE__ */ new Map<number, BossEncounter>(/* @__PURE__ */ BOSS_ENCOUNTERS.map(enc => [enc.slot, enc]))

export const isBossEncounterId = (value: unknown): value is BossEncounterId =>
  typeof value === 'string' && BY_ID.has(value as BossEncounterId)

export const getBossEncounter = (id: BossEncounterId): BossEncounter => {
  const enc = BY_ID.get(id)
  if (!enc) throw new Error(`unknown boss encounter: ${String(id)}`)
  return enc
}

/** Position of a stage id inside the 200-stage boss layout (1…200). */
export const layoutSlot = (stageId: number): number =>
  (((Math.floor(stageId) - 1) % BOSS_LAYOUT_PERIOD) + BOSS_LAYOUT_PERIOD) % BOSS_LAYOUT_PERIOD + 1

/** The encounter a layout slot (1…200) fields, or null for every other slot. */
export const encounterForSlot = (slot200: number): BossEncounter | null => BY_SLOT.get(slot200) ?? null

/** The encounter campaign stage `stageId` fields, or null (ids < 101 never do). */
export const encounterForStageId = (stageId: number): BossEncounter | null =>
  stageId > 100 ? encounterForSlot(layoutSlot(stageId)) : null

/**
 * How many times the player has met this encounter's slot: stage 101–200 →
 * 1, 301–400 → 2, 501–600 → 3 (`cycle` = the 100-stage cycle, always odd on
 * an encounter stage). Drives the name suffix: 1 → '', 2 → 'II', 3 → 'III'.
 */
export const encounterAppearance = (cycle: number): number => Math.max(1, Math.floor((cycle + 1) / 2))

/** Part-level function a builder applies to every authored blade. */
export type EncounterLevelFn = (
  cfg: Readonly<StageBladeConfig>,
  index: number
) => { topLevel: number; bottomLevel: number }

/** Level function: authored cycle-1 levels shifted by `delta` (never below 0). */
export const shiftLevels = (delta: number): EncounterLevelFn => (cfg) => ({
  topLevel: Math.max(0, cfg.topLevel + delta),
  bottomLevel: Math.max(0, cfg.bottomLevel + delta)
})

export interface BuildEncounterOptions {
  /** Stage id to stamp. Default −1: the cheat/league sentinel (never persists or advances). */
  stageId?: number
  /** Default 0 — the campaign passes the replaced slot's reward; LG7 owns league rewards. */
  rewardWin?: number
  rewardLose?: number
  /** Name suffix ('' → omitted, like `scaleStage`). */
  cycleSuffix?: string
  /** Override the authored arena (Boss Lab arena select). */
  arenaType?: ArenaType
}

/**
 * Build a playable {@link Stage} for any encounter — the one builder shared by
 * the campaign (`getStageById`), the Boss Lab and league gatekeepers (LG7).
 *
 * Pure and deterministic: the same arguments always give a deep-equal stage,
 * and the result shares no object with the table or with a previous call.
 * `level` defaults to the authored cycle-1 levels; a league passes a function
 * of the challenger's team power (e.g. `buildCheatBossStage`'s peak rule).
 * Carries `bossTrait` / `shardTrait` on the blades and `bossEncounterId` on
 * the stage; `isBoss` is always true (roulette, rubber band and boss HP follow
 * from it wherever the caller's mode allows them).
 */
export const buildBossEncounterStage = (
  id: BossEncounterId,
  level?: EncounterLevelFn,
  opts: BuildEncounterOptions = {}
): Stage => {
  const enc = getBossEncounter(id)
  const enemyTeam = enc.enemyTeam.map((cfg, i): StageBladeConfig => {
    const copy: StageBladeConfig = { ...cfg }
    if (level) {
      const lv = level(cfg, i)
      copy.topLevel = lv.topLevel
      copy.bottomLevel = lv.bottomLevel
    }
    return copy
  })
  const stage: Stage = {
    id: opts.stageId ?? -1,
    name: enc.nameKey,
    cycleSuffix: opts.cycleSuffix || undefined,
    isBoss: true,
    arenaType: opts.arenaType ?? enc.arenaType,
    enemyTeam,
    rewardWin: opts.rewardWin ?? 0,
    rewardLose: opts.rewardLose ?? 0,
    bossEncounterId: enc.id
  }
  if (enc.bouncers) stage.bouncers = enc.bouncers
  return stage
}

/** Distinct traits a roster carries (incl. shard traits), in {@link BOSS_TRAITS} order. */
export const bossTraitsOf = (team: readonly StageBladeConfig[]): BossTrait[] =>
  BOSS_TRAITS.filter(tr => team.some(cfg => cfg.bossTrait === tr || cfg.shardTrait === tr))

/**
 * Trophy skins a win on `stage` grants (before the ownership check), or []
 * for every non-encounter stage. The caller skips cheat / ghost / league modes.
 */
export const trophySkinsForStage = (stage: Pick<Stage, 'bossEncounterId'>): readonly BossTrophySkinId[] =>
  stage.bossEncounterId && isBossEncounterId(stage.bossEncounterId)
    ? getBossEncounter(stage.bossEncounterId).trophySkins
    : []

/**
 * The first campaign stage whose win grants trophy skin `skinId` (the shop's
 * "Beat stage N" hint, A2), or null for a skin no encounter grants. Every
 * encounter slot (110…200) lies in the first odd 100-cycle (101–200), where a
 * slot's stage id IS the slot — so the earliest granting encounter's slot is
 * the earliest stage.
 */
export const trophySkinFirstStage = (skinId: string): number | null => {
  let first: number | null = null
  for (const enc of BOSS_ENCOUNTERS) {
    if (!(enc.trophySkins as readonly string[]).includes(skinId)) continue
    if (first === null || enc.slot < first) first = enc.slot
  }
  return first
}

/**
 * League gatekeepers (decision B6 / design D6): the encounter guarding the
 * promotion INTO a tier. Lower promotions keep classic bosses (LG7 owns them).
 */
export const LEAGUE_GATEKEEPER_ENCOUNTERS: Readonly<Partial<Record<LeagueTier, BossEncounterId>>> = /* @__PURE__ */ Object.freeze({
  platinum: 'cinder_tyrant', // Gold → Platinum
  diamond: 'glacier_warden', // Platinum → Diamond
  champion: 'elemental_court' // Diamond → Champion
})
