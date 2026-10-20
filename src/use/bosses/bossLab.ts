// Boss Lab — the dev cheat for the stage-101+ bosses (bosses-100-feature.md
// §11, work package BW7). Pure data + builders + a little session state; the
// modal (`BossLabModal.vue`, an async chunk that only DEV builds reference)
// renders it.
//
//   • 13 entries: the ten encounters in slot order, then three single-trait
//     sandboxes (one lone carrier of ember / frost / chill on a Quad Core
//     body) for isolating a mechanic;
//   • every Lab fight is a cheat stage (id −1: never persists, never grants a
//     trophy) built through the SAME encounter builder the campaign and the
//     league use (`buildBossEncounterStage`), paying the Lab's own rewards
//     (500 / 100, like the classic cheat bosses);
//   • level: `campaign` = the authored cycle-1 levels (the player fights with
//     his real team), `matched` = every enemy part at the player's peak
//     upgrade level (buildCheatBossStage's rule; the arena then gives the
//     player the usual cheat +25 so the fight stays winnable);
//   • arena: as authored, or forced to boss / lava / ice / forest.

import { ref } from 'vue'
import type { BossTrait } from '@/types/spinner'
import type { ArenaType, Stage, StageBladeConfig } from '@/use/useSpinnerCampaign'
import {
  BOSS_ENCOUNTERS,
  BOSS_TRAITS,
  bossTraitsOf,
  buildBossEncounterStage,
  getBossEncounter,
  type BossEncounterId
} from '@/data/bossEncounters'
import { bossPreviewModelId } from '@/use/bossPeek'

/** Rewards of every Lab fight (the classic cheat bosses pay the same). */
export const BOSS_LAB_REWARD_WIN = 500
export const BOSS_LAB_REWARD_LOSE = 100

export type BossLabSandboxId = `sandbox_${BossTrait}`
export type BossLabEntryId = BossEncounterId | BossLabSandboxId

export interface BossLabEntry {
  id: BossLabEntryId
  kind: 'encounter' | 'sandbox'
  /** Campaign slot (110 … 200) of an encounter; null for a sandbox. */
  slot: number | null
  /** Translation key under `stages.` (sandboxes borrow the debut boss's name). */
  nameKey: string
  traits: BossTrait[]
  /** Skin shown on the tile (the lead boss's). */
  modelId: string
}

/** Debut encounter of each trait — the sandbox borrows its name, skin and levels. */
const DEBUT: Readonly<Record<BossTrait, BossEncounterId>> = {
  ember: 'cinder_tyrant',
  frost: 'glacier_warden',
  chill: 'frostbite_yeti'
}

export const BOSS_LAB_ENTRIES: readonly BossLabEntry[] = Object.freeze([
  ...BOSS_ENCOUNTERS.map((enc): BossLabEntry => ({
    id: enc.id,
    kind: 'encounter',
    slot: enc.slot,
    nameKey: enc.nameKey,
    traits: bossTraitsOf(enc.enemyTeam),
    modelId: bossPreviewModelId(enc.enemyTeam) ?? 'cinder'
  })),
  ...BOSS_TRAITS.map((trait): BossLabEntry => {
    const debut = getBossEncounter(DEBUT[trait])
    return {
      id: `sandbox_${trait}`,
      kind: 'sandbox',
      slot: null,
      nameKey: debut.nameKey,
      traits: [trait],
      modelId: debut.enemyTeam[0]!.modelId ?? 'cinder'
    }
  })
])

export type BossLabLevelMode = 'campaign' | 'matched'
export type BossLabArena = 'authored' | Extract<ArenaType, 'boss' | 'lava' | 'ice' | 'forest'>
export const BOSS_LAB_ARENAS: readonly BossLabArena[] = ['authored', 'boss', 'lava', 'ice', 'forest']

export interface BossLabOptions {
  levelMode: BossLabLevelMode
  arena: BossLabArena
  /** The player's peak top / bottom upgrade levels (matched mode). */
  peakTop: number
  peakBottom: number
}

/** Suffix a sandbox stage carries after the borrowed boss name (dev-only copy). */
export const BOSS_LAB_SANDBOX_SUFFIX = '· sandbox'

/**
 * Build the cheat stage of one Lab entry. Encounters go through
 * `buildBossEncounterStage` (id −1, Lab rewards); a sandbox is one carrier of
 * the trait on a Quad Core / Balanced body at the debut boss's levels.
 */
export const buildBossLabStage = (id: BossLabEntryId, opts: BossLabOptions): Stage => {
  const matched = opts.levelMode === 'matched'
  const peak = (): { topLevel: number; bottomLevel: number } => ({
    topLevel: Math.max(0, opts.peakTop),
    bottomLevel: Math.max(0, opts.peakBottom)
  })
  const arenaType = opts.arena === 'authored' ? undefined : opts.arena
  const entry = BOSS_LAB_ENTRIES.find(e => e.id === id)
  if (!entry) throw new Error(`unknown Boss Lab entry: ${String(id)}`)

  if (entry.kind === 'encounter') {
    return buildBossEncounterStage(entry.id as BossEncounterId, matched ? peak : undefined, {
      stageId: -1,
      rewardWin: BOSS_LAB_REWARD_WIN,
      rewardLose: BOSS_LAB_REWARD_LOSE,
      arenaType
    })
  }

  const trait = entry.traits[0]!
  const debut = getBossEncounter(DEBUT[trait]).enemyTeam[0]!
  const lv = matched ? peak() : { topLevel: debut.topLevel, bottomLevel: debut.bottomLevel }
  const carrier: StageBladeConfig = {
    topPartId: 'quadratic',
    bottomPartId: 'balanced',
    topLevel: lv.topLevel,
    bottomLevel: lv.bottomLevel,
    modelId: entry.modelId,
    isBoss: true,
    bossTrait: trait
  }
  return {
    id: -1,
    name: entry.nameKey,
    cycleSuffix: BOSS_LAB_SANDBOX_SUFFIX,
    isBoss: true,
    arenaType: arenaType ?? 'boss',
    enemyTeam: [carrier],
    rewardWin: BOSS_LAB_REWARD_WIN,
    rewardLose: BOSS_LAB_REWARD_LOSE
  }
}

/** Index of the entry after `index` (wraps round). */
export const nextBossLabIndex = (index: number): number =>
  index < 0 ? 0 : (index + 1) % BOSS_LAB_ENTRIES.length

// ─── Session state (per page; never persisted) ─────────────────────────────

/** Index of the last entry launched from the Lab (−1 = none yet). */
export const bossLabLastIndex = ref(-1)
export const bossLabLevelMode = ref<BossLabLevelMode>('campaign')
export const bossLabArena = ref<BossLabArena>('authored')
