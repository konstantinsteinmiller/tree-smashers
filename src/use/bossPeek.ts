// ─── Boss peek — the "next boss" teaser on the campaign win screen ─────────
//
// The most exciting early moment is the stage-5 boss, and a player who only
// ever clears stage 1 or 2 never learns it is coming. So the win screen of the
// FIRST TWO stages after every boss (and of stages 1-2, counting the campaign
// start as a "boss") carries a small badge: the next boss's portrait, its name
// and the stage it waits on.
//
// Everything that DECIDES anything lives here, pure and injectable:
//
//   • whether the badge shows            (`getBossPeek` → null or a peek)
//   • which boss / which skin / which stage it names
//
// The component (`BossPeekBadge.vue`) only renders the object this returns.
//
// ── The schedule is read, never assumed ──
//
// Bosses are "every 5th stage" in the design notes, but the table is the
// source of truth and it is irregular: stage 88 is a boss too (the sandstorm
// trio between 85 and 90), and past 100 the base table repeats forever with
// scaled levels and a roman-numeral suffix. So nothing here does `% 5` — it
// asks the stage lookup `isBoss` and walks. With the shipped table that yields
//
//     show on  1 2 · 6 7 · 11 12 · … · 81 82 · 86 87 · 89 · 91 92 · 96 97 · 101 102 · …
//
// (89 is the first stage after the stage-88 boss; 90 is a boss again.)
//
// ── Keyed to the stage JUST PLAYED, not to progress ──
//
// The caller passes the id of the stage the battle was fought on, captured
// BEFORE `advanceStage()` runs. A replay of an already-cleared stage (only
// reachable through cheats / the preview seam today — a campaign win always
// advances) therefore behaves exactly like the first clear of that stage:
// the peek depends on where that stage sits in the schedule, never on how far
// the player has got.

import {
  getStageById,
  BASE_CAMPAIGN_LENGTH,
  type Stage,
  type StageBladeConfig
} from '@/use/useSpinnerCampaign'
import type { BossTrait, GameResult } from '@/types/spinner'
import { bossTraitsOf, type BossEncounterId } from '@/data/bossEncounters'
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'

/** Which kind of battle just ended. Only `'campaign'` can carry a peek. */
export type BattleMode = 'campaign' | 'daily' | 'pvp' | 'ghost' | 'cheat'

/** Stage lookup — `getStageById` in the game, a synthetic table in tests. */
export type StageLookup = (id: number) => Stage

/** How many win screens after a boss (or after the campaign start) carry it. */
export const BOSS_PEEK_WINDOW = 2

/**
 * Bound on the forward search for the next boss. The campaign repeats its
 * base table forever, so a boss that is not found within one full base cycle
 * does not exist — and the loop must terminate on a table without bosses.
 */
export const BOSS_SEARCH_LIMIT = BASE_CAMPAIGN_LENGTH

export interface BossPeek {
  /** The stage whose win screen this is. */
  wonStageId: number
  /** Stage number the next boss waits on (1-based, infinite campaign). */
  bossStageId: number
  /** `bossStageId - wonStageId` — 1 means "the very next stage". */
  stagesAway: number
  /** Translation key under `stages.` for the boss's name (e.g. `stage_5`). */
  nameKey: string
  /** Roman-numeral cycle suffix past stage 100 (`''` in the first cycle). */
  cycleSuffix: string
  /** Skin to show: the lone boss's, or the highest-level blade of a team. */
  modelId: string | null
  /** True when the boss stage fields more than one blade. */
  isTeam: boolean
  /** Stage-101+ encounter the boss stage fields (bosses-100-feature.md §5); absent for classic bosses. */
  encounterId?: BossEncounterId
  /** The encounter's boss mechanics in chip order (§7.2 trait glyph row); absent for classic bosses. */
  traits?: BossTrait[]
}

export interface BossPeekInput {
  /** Id of the stage the battle was fought on — captured before any advance. */
  wonStageId: number
  result: GameResult
  mode: BattleMode
}

/**
 * Reduce the arena's mode flags to one {@link BattleMode}. Precedence mirrors
 * the game-over watcher, which checks PvP first and then the daily challenge.
 */
export const battleModeOf = (flags: {
  pvp?: boolean
  daily?: boolean
  ghost?: boolean
  cheat?: boolean
}): BattleMode => {
  if (flags.pvp) return 'pvp'
  if (flags.daily) return 'daily'
  if (flags.ghost) return 'ghost'
  if (flags.cheat) return 'cheat'
  return 'campaign'
}

/** A blade's overall level — the sum of both part levels. */
export const bladeLevel = (b: Pick<StageBladeConfig, 'topLevel' | 'bottomLevel'>): number =>
  (b.topLevel ?? 0) + (b.bottomLevel ?? 0)

/**
 * The skin that represents a boss stage: the only blade of a lone boss, or the
 * HIGHEST-LEVEL blade of a boss team. Ties keep the first blade in table
 * order (the one the stage author listed as the lead). Blades without a
 * `modelId` are skipped; `null` when none has one.
 */
export const bossPreviewModelId = (team: readonly StageBladeConfig[]): string | null => {
  let best: StageBladeConfig | null = null
  for (const blade of team) {
    if (!blade.modelId) continue
    if (!best || bladeLevel(blade) > bladeLevel(best)) best = blade
  }
  return best?.modelId ?? null
}

/**
 * True when `stageId` is one of the first {@link BOSS_PEEK_WINDOW} stages after
 * the previous boss stage — or after the campaign start, which counts as one.
 */
export const isInBossPeekWindow = (stageId: number, getStage: StageLookup = getStageById): boolean => {
  for (let k = 1; k <= BOSS_PEEK_WINDOW; k++) {
    const id = stageId - k
    // Checked BEFORE the lookup: `getStageById` clamps ids below 1 to stage 1.
    if (id < 1) return true
    if (getStage(id).isBoss) return true
  }
  return false
}

/** First boss stage strictly after `afterId`, or null within the search bound. */
export const findNextBossStageId = (
  afterId: number,
  getStage: StageLookup = getStageById,
  limit: number = BOSS_SEARCH_LIMIT
): number | null => {
  for (let id = afterId + 1; id <= afterId + limit; id++) {
    if (getStage(id).isBoss) return id
  }
  return null
}

/**
 * Should this result screen carry the boss peek, and what does it say?
 *
 * Returns null — no badge — for: any non-campaign mode (daily challenge, PvP,
 * leaderboard ghost, cheat stage), a loss, a boss stage's own win (that path
 * shows the roulette anyway), a stage outside the post-boss window, or a
 * schedule with no boss left to tease.
 */
export const getBossPeek = (
  { wonStageId, result, mode }: BossPeekInput,
  getStage: StageLookup = getStageById
): BossPeek | null => {
  if (mode !== 'campaign' || result !== 'win') return null
  if (!Number.isInteger(wonStageId) || wonStageId < 1) return null
  if (getStage(wonStageId).isBoss) return null
  if (!isInBossPeekWindow(wonStageId, getStage)) return null

  const bossStageId = findNextBossStageId(wonStageId, getStage)
  if (bossStageId === null) return null

  const boss = getStage(bossStageId)
  return {
    wonStageId,
    bossStageId,
    stagesAway: bossStageId - wonStageId,
    nameKey: boss.name,
    cycleSuffix: boss.cycleSuffix ?? '',
    modelId: bossPreviewModelId(boss.enemyTeam),
    isTeam: boss.enemyTeam.length > 1,
    ...(BOSSES100_BUILD && boss.bossEncounterId
      ? { encounterId: boss.bossEncounterId, traits: bossTraitsOf(boss.enemyTeam) }
      : {})
  }
}
