import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { TopPartId, BottomPartId, BossAbility, BossTrait } from '@/types/spinner'
import { STAGE_KEY, UPGRADES_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'
import { SKINS_PER_TOP } from '@/data/skinCatalog'
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'
// Pure, unobfuscated boundary data (bosses gate header): every runtime use
// below sits behind BOSSES100_BUILD, so an off build drops the whole table.
import {
  buildBossEncounterStage,
  encounterAppearance,
  encounterForSlot,
  layoutSlot,
  shiftLevels,
  type BossEncounterId
} from '@/data/bossEncounters'

// ─── Stage Enemy Config ─────────────────────────────────────────────────────

export interface StageBladeConfig {
  topPartId: TopPartId
  bottomPartId: BottomPartId
  topLevel: number
  bottomLevel: number
  modelId?: string
  /** Gameplay-effect skin (dark / boulder / diamond / sandstorm / teleporter) kept when `modelId` is remapped to the painted standard skin. */
  fxSkin?: string
  isBoss?: boolean
  bossAbility?: BossAbility
  /** Per-stage boss HP scale (BOSS_STAGE_HP_SCALE); campaign bosses only. */
  bossHpScale?: number
  /** Stage HP / damage scale (the stage table's `hp` / `dmg` options), every enemy of the stage. */
  stageHpScale?: number
  stageDmgScale?: number
  /** Stage-101+ boss mechanic (bosses-100-feature.md §4); encounters only. */
  bossTrait?: BossTrait
  /** Trait the split children inherit (Shattering Glacier). */
  shardTrait?: BossTrait
}

export type ArenaType = 'default' | 'boss' | 'lava' | 'ice' | 'forest'

export const ARENA_TYPES: ArenaType[] = ['default', 'boss', 'lava', 'ice', 'forest']

/** Arena types that existed in older builds and were retired ('thunder' combo
 *  arena, 'shock' wall arena), mapped to the arena that replaced them. Old
 *  saves, ghosts, league snapshots and PvP peers may still name them. */
const RETIRED_ARENAS: Readonly<Record<string, ArenaType>> = { thunder: 'forest', shock: 'default' }

/**
 * Load-boundary guard: any arena name (persisted, received from a peer or
 * a server snapshot) becomes a live {@link ArenaType}. Retired names map to
 * their replacement, anything unknown to `fallback`. Pure and deterministic,
 * so both PvP clients resolve the same arena.
 */
export function sanitizeArenaType(value: unknown, fallback: ArenaType = 'default'): ArenaType {
  if (typeof value !== 'string') return fallback
  if ((ARENA_TYPES as string[]).includes(value)) return value as ArenaType
  return RETIRED_ARENAS[value] ?? fallback
}

export interface Stage {
  id: number
  /** Translation key for the stage name (e.g. 'stage_1') */
  name: string
  /** Cycle suffix for infinite campaign (e.g. 'II', 'III') — empty for cycle 0 */
  cycleSuffix?: string
  isBoss?: boolean
  arenaType?: ArenaType
  enemyTeam: StageBladeConfig[]
  rewardWin: number
  rewardLose: number
  /**
   * Set on the stage-101+ boss encounters (bosses-100-feature.md §5) — the
   * `BOSS_ENCOUNTERS` row this stage was built from. Absent on every stage of
   * the base table and its cycle copies.
   */
  bossEncounterId?: BossEncounterId
}

// ─── Compact authoring helpers ──────────────────────────────────────────────
// These let the 100-stage table below stay terse enough to read on one screen
// while still being fully hand-editable — tweak any entry inline without
// touching the helpers.

/**
 * `e(top, bot, tl, bl, modelId, ability?)` — build one enemy blade.
 * `ability` promotes the blade to a boss and opts it into a special mechanic
 * handled by useSpinnerGame. Passing `'plain'` makes it a stat-only boss.
 */
const e = (
  top: TopPartId,
  bot: BottomPartId,
  tl: number,
  bl: number,
  modelId: string,
  ability?: BossAbility | 'plain'
): StageBladeConfig => {
  const cfg: StageBladeConfig = {
    topPartId: top,
    bottomPartId: bot,
    topLevel: tl,
    bottomLevel: bl,
    modelId
  }
  if (ability) {
    cfg.isBoss = true
    if (ability !== 'plain') cfg.bossAbility = ability
  }
  return cfg
}

/** Campaign enemies wear their top's standard skin (the painted smasher look);
 *  the extra skins are not painted. The original id moves to `fxSkin`: it seeds
 *  the smasher pick and keeps the dark / boulder / diamond / sandstorm /
 *  teleporter mechanics firing. */
export const standardLook = (b: StageBladeConfig): StageBladeConfig => {
  const std = SKINS_PER_TOP[b.topPartId]?.[0]
  if (!std || !b.modelId || b.modelId === std) return b
  return { ...b, modelId: std, fxSkin: b.modelId }
}

/** `s(id, name, enemyTeam, rewardWin, rewardLose, opts?)` — build a stage.
 *  `opts.hp` / `opts.dmg` = the stage's HP and damage scale: every enemy's max
 *  HP (and so its trees) and every hit it lands × this. Fitted per stage by
 *  tools/balance-sim/fithp.mjs to the curve in tools/balance-sim/targets.mjs —
 *  HP sets how long the fight lasts, damage how hard it pushes back. */
const s = (
  id: number,
  name: string,
  enemyTeam: StageBladeConfig[],
  rewardWin: number,
  rewardLose: number,
  opts: { isBoss?: boolean; arenaType?: ArenaType; hp?: number; dmg?: number } = {}
): Stage => {
  const { hp, dmg, ...rest } = opts
  // Boss stages default to the dedicated 'boss' arena (red borders) UNLESS the
  // stage explicitly names another arena (e.g. a boss fight staged in 'lava').
  // This makes boss visuals a data-driven modifier and replaces the old
  // hard-coded `isBossStage ? 'boss'` override in useSpinnerGame.initGame.
  const arenaType: ArenaType | undefined = rest.arenaType ?? (rest.isBoss ? 'boss' : undefined)
  const team = enemyTeam.map(b => ({
    ...b,
    ...(hp !== undefined && hp !== 1 ? { stageHpScale: hp } : {}),
    ...(dmg !== undefined && dmg !== 1 ? { stageDmgScale: dmg } : {})
  }))
  return { id, name, enemyTeam: team, rewardWin, rewardLose, ...rest, arenaType }
}

// ─── Base 100 Hand-Editable Stages ─────────────────────────────────────────
//
// Pacing:
//   1-5    tutorial / low upgrades   (first boss at 5)
//   6-20   early game                (bosses at 10, 15, 20)
//   21-50  mid game                  (boss every 5)
//   51-80  late game                 (boss every 5)
//   81-100 endgame + showcase bosses (boss every 5, final at 100)
//
// Boss cadence: every 5th stage is a boss. The 20 boss slots cycle through
// five archetypes in order: plain → split → ghost → partners → healers,
// so each ability appears 4 times across 1-100.
//
// Difficulty curve (balance pass 2026-10-28): the rosters and levels say WHO
// a stage fields; each stage's `hp` / `dmg` option says how long it holds out
// and how hard it hits back. Both are fitted by `scripts/balance-sim.mjs camp`
// sweeps (tools/balance-sim/fithp.mjs) to tools/balance-sim/targets.mjs: a
// sure first win at stage 1, then a saw-tooth in every 5-stage block — a
// breather after each boss, each next stage a little harder, the boss the
// peak at ~55–75 % first-try for the scripted bot (bosses 5–15 gentlest) —
// and ~5–7-launch regular fights, ~9-launch boss fights.

const BASE_STAGES: Stage[] = [
  // ── Tutorial Arc (1-5) ────────────────────────────────────────────────────
  // Stages 1–3 (#G1): the tutorial is 1 vs 1 — the player owns one team slot
  // until stage 3 is won, so each opening stage fields ONE enemy, on a gentle
  // ramp: a slow defensive Turtle, then a balanced Mystic Eye, then a fast
  // Eagle (the first attacker). The designed lineup stays 1 enemy on replay
  // too (deterministic). A lone NPC's solo boost is cancelled
  // (CAMPAIGN_NPC_TUNING soloHpMul / soloDmgMul); the player's lone smasher
  // keeps its ×1.2. Levels fitted with `balance-sim.mjs camp` (~70–85 % wins).
  // Win pays 200 (was 100): the stage-2 Team lesson's first level-up costs
  // smasherLevelCost(1) = 192, and a first-timer holding 100 was asked for
  // it (#playtest-1-9; guarded in tests/battleOnboarding.test.ts).
  s(1, 'stage_1', [
    e('round', 'balanced', 1, 1, 'turtle')
  ], 200, 30, { hp: 0.6, dmg: 0.5 }),
  s(2, 'stage_2', [
    e('quadratic', 'balanced', 2, 3, 'mysticaleye')
  ], 100, 30, { hp: 1.05, dmg: 0.9 }),
  s(3, 'stage_3', [
    e('triangle', 'speedy', 4, 5, 'eagle')
  ], 100, 35, { hp: 0.75, dmg: 0.75 }),
  s(4, 'stage_4', [
    e('star', 'balanced', 1, 0, 'reddragon'),
    e('quadratic', 'speedy', 1, 1, 'chip'),
    e('cushioned', 'balanced', 0, 0, 'mountain')
  ], 110, 35, { hp: 0.7, dmg: 1.1 }),
  s(5, 'stage_5', [
    // First boss: was 5/5 (8-29 % first try in the 2026-10-28 sims).
    e('star', 'speedy', 4, 4, 'tornado', 'plain')
  ], 200, 50, { isBoss: true, hp: 1.1, dmg: 0.7 }),

  // ── Early Game (6-20) ─────────────────────────────────────────────────────
  s(6, 'stage_6', [
    e('piercer', 'speedy', 2, 1, 'teleporter'),
    e('round', 'tanky', 1, 2, 'galaxy')
  ], 140, 45, { arenaType: 'forest', hp: 0.6, dmg: 1.2 }),
  s(7, 'stage_7', [
    e('star', 'speedy', 2, 2, 'tornado'),
    e('triangle', 'speedy', 2, 1, 'thunder'),
    e('quadratic', 'balanced', 1, 1, 'mysticaleye')
  ], 160, 50, { hp: 1.15 }),
  s(8, 'stage_8', [
    e('star', 'balanced', 3, 2, 'axe'),
    e('cushioned', 'tanky', 2, 3, 'castle')
  ], 180, 55, { hp: 0.6, dmg: 1.05 }),
  s(9, 'stage_9', [
    e('star', 'speedy', 3, 3, 'reddragon'),
    e('quadratic', 'tanky', 3, 3, 'chip'),
    e('triangle', 'balanced', 2, 2, 'eagle')
  ], 200, 60, { arenaType: 'forest', hp: 0.75, dmg: 1.05 }),
  // 10 — SPLIT boss (archetype 2)
  s(10, 'stage_10', [
    e('round', 'balanced', 3, 1, 'bear', 'split')
  ], 350, 90, { isBoss: true, dmg: 1.1 }),
  s(11, 'stage_11', [
    e('triangle', 'speedy', 3, 3, 'thunderstorm', 'thunder'),
    e('cushioned', 'tanky', 3, 3, 'shell')
  ], 200, 65, { arenaType: 'forest', hp: 0.4, dmg: 1.15 }),
  s(12, 'stage_12', [
    e('star', 'speedy', 4, 3, 'axe'),
    e('round', 'tanky', 3, 4, 'turtle'),
    e('quadratic', 'balanced', 3, 3, 'mysticaleye')
  ], 210, 65, { arenaType: 'lava', hp: 0.6 }),
  s(13, 'stage_13', [
    e('round', 'tanky', 4, 4, 'galaxy'),
    e('cushioned', 'balanced', 3, 3, 'mountain')
  ], 220, 70, { arenaType: 'ice', hp: 0.7, dmg: 1.25 }),
  s(14, 'stage_14', [
    e('star', 'speedy', 4, 4, 'ice'),
    e('triangle', 'speedy', 4, 3, 'eagle'),
    e('quadratic', 'tanky', 3, 3, 'chip')
  ], 230, 70, { arenaType: 'forest', hp: 1.3, dmg: 1.15 }),
  // 15 — GHOST boss (archetype 3)
  s(15, 'stage_15', [
    e('triangle', 'speedy', 8, 10, 'snake', 'ghost')
  ], 420, 110, { isBoss: true, hp: 1.05, dmg: 0.8 }),
  s(16, 'stage_16', [
    e('star', 'speedy', 5, 4, 'reddragon'),
    e('quadratic', 'tanky', 4, 5, 'angelic')
  ], 240, 75, { hp: 0.9, dmg: 1.1 }),
  s(17, 'stage_17', [
    e('star', 'speedy', 5, 5, 'axe'),
    e('triangle', 'balanced', 5, 4, 'phoenix'),
    e('round', 'tanky', 4, 5, 'piranha')
  ], 260, 80, { arenaType: 'lava', hp: 0.8, dmg: 1.1 }),
  s(18, 'stage_18', [
    e('quadratic', 'balanced', 5, 5, 'prisma'),
    e('cushioned', 'tanky', 5, 5, 'mountain')
  ], 250, 75, { arenaType: 'ice', hp: 0.85, dmg: 1.4 }),
  s(19, 'stage_19', [
    e('star', 'speedy', 6, 5, 'ice'),
    e('triangle', 'speedy', 5, 5, 'salamaner'),
    e('quadratic', 'tanky', 5, 5, 'mysticaleye')
  ], 280, 85, { arenaType: 'forest', hp: 0.9, dmg: 1.1 }),
  // 20 — PARTNERS boss (archetype 4)
  s(20, 'stage_20', [
    e('cushioned', 'tanky', 5, 3, 'castle', 'partners'),
    e('round', 'balanced', 3, 2, 'piranha', 'partners'),
    e('quadratic', 'balanced', 4, 3, 'mysticaleye', 'partners')
  ], 500, 130, { isBoss: true, hp: 0.8, dmg: 1.2 }),

  // ── Mid Game (21-50) ──────────────────────────────────────────────────────
  s(21, 'stage_21', [
    e('star', 'speedy', 6, 10, 'tornado'),
    e('cushioned', 'tanky', 6, 7, 'shield')
  ], 300, 90, { arenaType: 'forest', hp: 0.9, dmg: 1.4 }),
  s(22, 'stage_22', [
    e('star', 'speedy', 4, 3, 'reddragon'),
    e('triangle', 'speedy', 6, 6, 'eagle'),
    e('piercer', 'speedy', 3, 2, 'teleporter'),
    e('round', 'tanky', 6, 7, 'galaxy')
  ], 320, 95, { arenaType: 'ice', hp: 0.8, dmg: 1.2 }),
  s(23, 'stage_23', [
    e('star', 'balanced', 7, 8, 'blades'),
    e('quadratic', 'tanky', 7, 8, 'prisma')
  ], 310, 90, { hp: 0.75, dmg: 1.15 }),
  s(24, 'stage_24', [
    e('star', 'speedy', 7, 7, 'axe'),
    e('triangle', 'speedy', 7, 6, 'snake'),
    e('cushioned', 'tanky', 6, 7, 'gear')
  ], 340, 100, { dmg: 1.15 }),
  // 25 — HEALERS boss (archetype 5)
  s(25, 'stage_25', [
    e('cushioned', 'speedy', 7, 6, 'mountain', 'healers'),
    e('round', 'balanced', 7, 7, 'piranha', 'healers'),
    e('quadratic', 'balanced', 7, 7, 'mysticaleye', 'healers')
  ], 560, 140, { isBoss: true, dmg: 1.1 }),
  s(26, 'stage_26', [
    e('star', 'speedy', 8, 8, 'reddragon'),
    e('quadratic', 'tanky', 9, 8, 'mysticaleye')
  ], 350, 100, { hp: 0.7, dmg: 1.1 }),
  s(27, 'stage_27', [
    e('star', 'speedy', 8, 8, 'axe'),
    e('triangle', 'speedy', 8, 8, 'thunder'),
    e('cushioned', 'tanky', 8, 8, 'mountain')
  ], 380, 110, { arenaType: 'lava', hp: 0.65, dmg: 0.95 }),
  s(28, 'stage_28', [
    e('star', 'speedy', 9, 8, 'tornado'),
    e('round', 'tanky', 8, 9, 'piranha')
  ], 370, 105, { arenaType: 'forest', hp: 0.9, dmg: 1.4 }),
  s(29, 'stage_29', [
    e('star', 'speedy', 12, 8, 'blades'),
    e('triangle', 'speedy', 9, 12, 'eagle'),
    e('quadratic', 'balanced', 10, 9, 'prisma')
  ], 420, 120, { hp: 1.4, dmg: 0.95 }),
  // 30 — LIFE-LEECH boss
  s(30, 'stage_30', [
    e('triangle', 'speedy', 19, 21, 'life-leech', 'life-leech')
  ], 800, 200, { isBoss: true, hp: 1.4, dmg: 0.8 }),
  s(31, 'stage_31', [
    e('triangle', 'speedy', 12, 9, 'phoenix'),
    e('quadratic', 'tanky', 9, 9, 'angelic')
  ], 430, 125, { arenaType: 'forest', hp: 0.75, dmg: 1.15 }),
  s(32, 'stage_32', [
    e('star', 'speedy', 10, 9, 'axe'),
    e('cushioned', 'tanky', 9, 10, 'gear'),
    e('round', 'balanced', 9, 9, 'turtle')
  ], 450, 130, { arenaType: 'lava', hp: 0.75, dmg: 1.25 }),
  s(33, 'stage_33', [
    e('round', 'tanky', 10, 10, 'galaxy'),
    e('cushioned', 'balanced', 9, 10, 'mountain'),
    e('star', 'speedy', 9, 9, 'reddragon')
  ], 460, 135, { arenaType: 'ice', hp: 0.85, dmg: 1.25 }),
  s(34, 'stage_34', [
    e('quadratic', 'balanced', 10, 10, 'mysticaleye'),
    e('triangle', 'speedy', 10, 9, 'eagle')
  ], 440, 130, { hp: 2.05, dmg: 1.1 }),
  // 35 — SPLIT boss
  s(35, 'stage_35', [
    e('triangle', 'tanky', 15, 10, 'piranha', 'split')
  ], 900, 210, { isBoss: true, hp: 1.1, dmg: 0.95 }),
  s(36, 'stage_36', [
    e('star', 'speedy', 11, 10, 'tornado'),
    e('triangle', 'speedy', 10, 11, 'salamaner')
  ], 470, 140, { arenaType: 'lava', hp: 2.75, dmg: 0.85 }),
  s(37, 'stage_37', [
    e('round', 'tanky', 11, 11, 'galaxy'),
    e('quadratic', 'balanced', 11, 10, 'prisma'),
    e('cushioned', 'tanky', 10, 11, 'castle')
  ], 490, 145, { arenaType: 'ice', hp: 0.75, dmg: 1.4 }),
  s(38, 'stage_38', [
    e('cushioned', 'balanced', 11, 11, 'mountain'),
    e('round', 'balanced', 11, 11, 'turtle')
  ], 480, 140, { arenaType: 'forest', hp: 1.4, dmg: 1.4 }),
  s(39, 'stage_39', [
    e('star', 'speedy', 12, 11, 'ice'),
    e('triangle', 'speedy', 11, 11, 'eagle'),
    e('quadratic', 'tanky', 11, 11, 'chip')
  ], 510, 150, { arenaType: 'ice', hp: 1.4, dmg: 1.1 }),
  // 40 — GHOST boss
  s(40, 'stage_40', [
    e('triangle', 'tanky', 22, 20, 'salamaner', 'ghost')
  ], 1000, 230, { isBoss: true, hp: 1.6, dmg: 0.75 }),
  s(41, 'stage_41', [
    e('star', 'speedy', 15, 18, 'blades'),
    e('triangle', 'balanced', 13, 15, 'snake')
  ], 520, 155, { arenaType: 'forest', hp: 1.55, dmg: 0.7 }),
  s(42, 'stage_42', [
    e('star', 'speedy', 13, 14, 'axe'),
    e('cushioned', 'tanky', 12, 15, 'gear'),
    e('round', 'tanky', 12, 14, 'turtle')
  ], 540, 160, { arenaType: 'lava', hp: 0.8, dmg: 1.15 }),
  s(43, 'stage_43', [
    e('round', 'tanky', 13, 13, 'galaxy'),
    e('quadratic', 'balanced', 12, 12, 'mysticaleye')
  ], 530, 155, { arenaType: 'ice', hp: 1.45, dmg: 1.3 }),
  s(44, 'stage_44', [
    e('cushioned', 'balanced', 13, 12, 'mountain'),
    e('triangle', 'speedy', 12, 13, 'salamaner'),
    e('quadratic', 'tanky', 12, 12, 'prisma')
  ], 550, 165, { arenaType: 'forest', hp: 1.15, dmg: 1.4 }),
  // 45 — PARTNERS boss
  s(45, 'stage_45', [
    e('cushioned', 'tanky', 12, 15, 'castle', 'partners'),
    e('piercer', 'balanced', 13, 11, 'turtle', 'partners'),
    e('star', 'balanced', 11, 9, 'reddragon', 'partners')
  ], 1100, 250, { isBoss: true, hp: 0.9, dmg: 1.05 }),
  s(46, 'stage_46', [
    e('star', 'speedy', 14, 13, 'tornado'),
    e('triangle', 'speedy', 13, 14, 'eagle')
  ], 560, 170, { arenaType: 'forest', hp: 2.9, dmg: 0.75 }),
  s(47, 'stage_47', [
    e('star', 'speedy', 14, 14, 'axe'),
    e('cushioned', 'tanky', 13, 14, 'gear')
  ], 570, 170, { arenaType: 'lava', hp: 1.35, dmg: 1.1 }),
  s(48, 'stage_48', [
    e('round', 'tanky', 14, 14, 'galaxy'),
    e('quadratic', 'balanced', 14, 13, 'prisma'),
    e('star', 'speedy', 13, 14, 'reddragon')
  ], 580, 175, { arenaType: 'ice', hp: 1.15, dmg: 1.4 }),
  s(49, 'stage_49', [
    e('cushioned', 'balanced', 14, 14, 'mountain'),
    e('triangle', 'speedy', 14, 13, 'salamaner'),
    e('round', 'tanky', 13, 14, 'piranha')
  ], 590, 175, { arenaType: 'forest', hp: 1.35, dmg: 1.3 }),
  // 50 — HEALERS boss
  s(50, 'stage_50', [
    e('cushioned', 'balanced', 14, 14, 'mountain', 'healers'),
    e('round', 'balanced', 14, 11, 'turtle', 'healers'),
    e('cushioned', 'speedy', 14, 12, 'shell', 'healers'),
    e('quadratic', 'speedy', 16, 11, 'mysticaleye', 'healers')
  ], 1300, 280, { isBoss: true, hp: 1.05, dmg: 1.2 }),

  // ── Late Game (51-80) ─────────────────────────────────────────────────────
  s(51, 'stage_51', [
    e('star', 'speedy', 15, 14, 'tornado'),
    e('quadratic', 'tanky', 14, 15, 'chip')
  ], 600, 180, { arenaType: 'ice', hp: 1.35, dmg: 1.15 }),
  s(52, 'stage_52', [
    e('star', 'speedy', 15, 15, 'axe'),
    e('triangle', 'speedy', 15, 14, 'snake'),
    e('cushioned', 'tanky', 14, 15, 'castle')
  ], 620, 185, { arenaType: 'lava', hp: 1.25, dmg: 1.3 }),
  s(53, 'stage_53', [
    e('round', 'tanky', 15, 15, 'galaxy'),
    e('quadratic', 'balanced', 15, 15, 'prisma')
  ], 610, 180, { arenaType: 'ice', hp: 1.1, dmg: 1.4 }),
  s(54, 'stage_54', [
    e('star', 'speedy', 16, 15, 'ice'),
    e('triangle', 'speedy', 15, 16, 'eagle'),
    e('quadratic', 'tanky', 15, 15, 'mysticaleye')
  ], 640, 190, { arenaType: 'lava', hp: 2, dmg: 1.2 }),
  // 55 — CHILD-EMITTER boss
  s(55, 'stage_55', [
    e('round', 'tanky', 25, 30, 'dark', 'child-emitter')
  ], 1200, 260, { isBoss: true, hp: 0.95, dmg: 1.3 }),
  s(56, 'stage_56', [
    e('cushioned', 'balanced', 16, 15, 'mountain'),
    e('round', 'tanky', 15, 16, 'turtle'),
    e('triangle', 'speedy', 15, 15, 'salamaner')
  ], 650, 195, { arenaType: 'forest', hp: 0.85, dmg: 1.4 }),
  s(57, 'stage_57', [
    e('star', 'speedy', 16, 16, 'reddragon'),
    e('quadratic', 'tanky', 16, 16, 'chip')
  ], 660, 200, { arenaType: 'lava', hp: 1.7, dmg: 1.15 }),
  s(58, 'stage_58', [
    e('round', 'tanky', 16, 16, 'galaxy'),
    e('cushioned', 'balanced', 16, 16, 'shell'),
    e('star', 'speedy', 15, 16, 'tornado')
  ], 670, 200, { arenaType: 'ice', hp: 1.15, dmg: 1.4 }),
  s(59, 'stage_59', [
    e('star', 'speedy', 17, 16, 'ice'),
    e('triangle', 'balanced', 16, 17, 'eagle')
  ], 680, 205, { arenaType: 'forest', hp: 2.1, dmg: 1.1 }),
  // 60 — SPLIT boss
  s(60, 'stage_60', [
    e('quadratic', 'tanky', 26, 29, 'mysticaleye', 'split')
  ], 1350, 290, { isBoss: true, hp: 0.9, dmg: 1.05 }),
  s(61, 'stage_61', [
    e('star', 'speedy', 17, 17, 'blades'),
    e('triangle', 'speedy', 17, 17, 'snake'),
    e('cushioned', 'tanky', 17, 17, 'gear')
  ], 690, 210, { arenaType: 'ice', hp: 1.1, dmg: 1.25 }),
  s(62, 'stage_62', [
    e('star', 'speedy', 18, 17, 'axe'),
    e('round', 'tanky', 17, 21, 'bear')
  ], 700, 210, { arenaType: 'lava', hp: 1.15, dmg: 1.1 }),
  s(63, 'stage_63', [
    e('quadratic', 'balanced', 18, 18, 'prisma'),
    e('round', 'tanky', 18, 18, 'galaxy'),
    e('cushioned', 'balanced', 17, 17, 'mountain')
  ], 720, 215, { arenaType: 'ice', hp: 0.85, dmg: 1.3 }),
  s(64, 'stage_64', [
    e('star', 'speedy', 18, 23, 'ice'),
    e('triangle', 'balanced', 23, 17, 'salamaner')
  ], 730, 220, { arenaType: 'lava', hp: 2.2, dmg: 0.7 }),
  // 65 — GHOST boss
  s(65, 'stage_65', [
    e('star', 'balanced', 34, 28, 'reddragon', 'ghost')
  ], 1500, 310, { isBoss: true, hp: 2.4, dmg: 0.55 }),
  s(66, 'stage_66', [
    e('star', 'speedy', 19, 18, 'tornado'),
    e('quadratic', 'tanky', 18, 19, 'chip'),
    e('triangle', 'speedy', 18, 18, 'eagle')
  ], 740, 225, { hp: 1.25 }),
  s(67, 'stage_67', [
    e('star', 'speedy', 19, 19, 'axe'),
    e('cushioned', 'tanky', 19, 19, 'castle')
  ], 750, 225, { arenaType: 'lava', hp: 1.4, dmg: 0.75 }),
  s(68, 'stage_68', [
    e('round', 'tanky', 19, 19, 'galaxy'),
    e('cushioned', 'balanced', 19, 18, 'mountain'),
    e('star', 'speedy', 18, 19, 'reddragon')
  ], 760, 230, { arenaType: 'ice', dmg: 1.1 }),
  s(69, 'stage_69', [
    e('cushioned', 'balanced', 19, 19, 'mountain'),
    e('triangle', 'speedy', 19, 19, 'salamaner'),
    e('round', 'tanky', 19, 19, 'turtle')
  ], 770, 230, { arenaType: 'forest', dmg: 1.2 }),
  // 70 — PARTNERS boss
  s(70, 'stage_70', [
    e('star', 'balanced', 18, 18, 'reddragon', 'partners'),
    e('triangle', 'balanced', 18, 18, 'thunder', 'partners'),
    e('quadratic', 'balanced', 18, 18, 'chip', 'partners'),
    e('cushioned', 'balanced', 18, 18, 'gear', 'partners')
  ], 1700, 340, { isBoss: true, hp: 1.1, dmg: 0.9 }),
  s(71, 'stage_71', [
    e('star', 'speedy', 20, 19, 'blades'),
    e('triangle', 'speedy', 26, 24, 'life-leech', 'life-leech')
  ], 780, 235, { arenaType: 'forest', hp: 0.6, dmg: 0.7 }),
  s(72, 'stage_72', [
    e('star', 'speedy', 20, 20, 'axe'),
    e('cushioned', 'tanky', 19, 20, 'gear'),
    e('round', 'balanced', 19, 19, 'turtle')
  ], 800, 240, { arenaType: 'lava', hp: 1.3 }),
  s(73, 'stage_73', [
    e('round', 'tanky', 20, 20, 'galaxy'),
    e('quadratic', 'balanced', 20, 19, 'prisma')
  ], 810, 245, { arenaType: 'ice', hp: 1.35, dmg: 1.1 }),
  s(74, 'stage_74', [
    e('cushioned', 'balanced', 20, 20, 'mountain'),
    e('triangle', 'speedy', 20, 19, 'eagle'),
    e('star', 'speedy', 19, 20, 'reddragon')
  ], 820, 245, { arenaType: 'forest', hp: 1.95, dmg: 0.8 }),
  // 75 — HEALERS boss
  s(75, 'stage_75', [
    e('cushioned', 'balanced', 20, 20, 'mountain', 'healers'),
    e('round', 'balanced', 20, 20, 'piranha', 'healers'),
    e('cushioned', 'balanced', 20, 20, 'gear', 'healers'),
    e('quadratic', 'balanced', 20, 20, 'mysticaleye', 'healers')
  ], 1900, 380, { isBoss: true, hp: 1.3, dmg: 1.1 }),
  s(76, 'stage_76', [
    e('star', 'speedy', 21, 20, 'ice'),
    e('triangle', 'speedy', 20, 21, 'salamaner'),
    e('quadratic', 'tanky', 20, 20, 'chip')
  ], 830, 250, { arenaType: 'ice', hp: 0.95, dmg: 0.9 }),
  s(77, 'stage_77', [
    e('star', 'speedy', 21, 21, 'axe'),
    e('piercer', 'balanced', 20, 21, 'scorpion')
  ], 840, 250, { arenaType: 'lava', hp: 3, dmg: 0.8 }),
  s(78, 'stage_78', [
    e('round', 'tanky', 21, 21, 'galaxy'),
    e('cushioned', 'balanced', 21, 21, 'shell')
  ], 850, 255, { arenaType: 'ice', hp: 1.2, dmg: 1.4 }),
  s(79, 'stage_79', [
    e('star', 'speedy', 22, 21, 'tornado'),
    e('triangle', 'speedy', 21, 22, 'eagle'),
    e('quadratic', 'tanky', 21, 21, 'mysticaleye')
  ], 870, 260, { arenaType: 'lava', hp: 1.95, dmg: 1.05 }),
  // 80 — STAT-SWITCH boss
  s(80, 'stage_80', [
    e('cushioned', 'tanky', 36, 32, 'boulder', 'stat-switch')
  ], 1800, 360, { isBoss: true, hp: 1.2, dmg: 0.9 }),

  // ── Endgame Showcase (81-100) ─────────────────────────────────────────────
  s(81, 'stage_81', [
    e('piercer', 'speedy', 22, 22, 'scorpion'),
    e('triangle', 'speedy', 22, 21, 'snake'),
    e('star', 'speedy', 21, 22, 'reddragon')
  ], 880, 265, { hp: 1.95, dmg: 0.7 }),
  s(82, 'stage_82', [
    e('star', 'speedy', 22, 22, 'axe'),
    e('cushioned', 'tanky', 22, 22, 'gear'),
    e('quadratic', 'balanced', 22, 22, 'chip')
  ], 900, 270, { arenaType: 'lava', hp: 0.8, dmg: 1.4 }),
  s(83, 'stage_83', [
    e('round', 'tanky', 23, 22, 'galaxy'),
    e('quadratic', 'balanced', 22, 23, 'prisma'),
    e('cushioned', 'balanced', 22, 22, 'mountain')
  ], 910, 270, { arenaType: 'ice', hp: 0.6, dmg: 1.4 }),
  s(84, 'stage_84', [
    e('cushioned', 'balanced', 23, 23, 'mountain'),
    e('round', 'tanky', 22, 23, 'turtle'),
    e('triangle', 'speedy', 23, 22, 'salamaner')
  ], 920, 275, { arenaType: 'forest', hp: 0.6, dmg: 1.35 }),
  // 85 — CHILD-EMITTER boss (2nd appearance)
  s(85, 'stage_85', [
    e('round', 'tanky', 41, 48, 'dark', 'child-emitter')
  ], 2100, 400, { isBoss: true, hp: 0.85, dmg: 1.35 }),
  s(86, 'stage_86', [
    e('star', 'speedy', 23, 23, 'reddragon'),
    e('quadratic', 'tanky', 23, 23, 'angelic')
  ], 930, 280, { arenaType: 'lava', hp: 1.05, dmg: 1.1 }),
  s(87, 'stage_87', [
    e('round', 'tanky', 24, 23, 'galaxy'),
    e('cushioned', 'balanced', 23, 24, 'shell'),
    e('star', 'speedy', 23, 23, 'tornado')
  ], 950, 285, { arenaType: 'ice', hp: 0.75, dmg: 1.4 }),
  // 88 — PARTNERS boss (sandstorm trio)
  s(88, 'stage_88', [
    e('cushioned', 'tanky', 27, 27, 'sandstorm', 'partners'),
    e('cushioned', 'balanced', 26, 26, 'sandstorm', 'partners'),
    e('cushioned', 'balanced', 25, 26, 'sandstorm', 'partners')
  ], 2200, 410, { isBoss: true, hp: 0.85, dmg: 1.3 }),
  s(89, 'stage_89', [
    e('star', 'speedy', 25, 24, 'ice'),
    e('triangle', 'speedy', 24, 25, 'salamaner'),
    e('quadratic', 'tanky', 24, 24, 'chip')
  ], 990, 295, { arenaType: 'forest', hp: 1.05, dmg: 1.25 }),
  // 90 — GHOST boss
  s(90, 'stage_90', [
    e('star', 'speedy', 45, 48, 'reddragon', 'ghost')
  ], 2400, 440, { isBoss: true, hp: 2.75, dmg: 0.5 }),
  s(91, 'stage_91', [
    e('star', 'speedy', 25, 25, 'blades'),
    e('piercer', 'speedy', 25, 24, 'demon'),
    e('triangle', 'speedy', 24, 25, 'eagle')
  ], 1000, 300, { hp: 1.9, dmg: 0.7 }),
  s(92, 'stage_92', [
    e('star', 'speedy', 26, 25, 'axe'),
    e('cushioned', 'tanky', 25, 26, 'castle'),
    e('round', 'tanky', 25, 25, 'turtle')
  ], 1020, 305, { arenaType: 'lava', hp: 0.65 }),
  s(93, 'stage_93', [
    e('round', 'tanky', 26, 26, 'galaxy'),
    e('cushioned', 'balanced', 26, 25, 'mountain'),
    e('star', 'speedy', 25, 26, 'reddragon')
  ], 1040, 310, { arenaType: 'ice', hp: 0.75, dmg: 1.25 }),
  s(94, 'stage_94', [
    e('cushioned', 'balanced', 26, 26, 'mountain'),
    e('triangle', 'speedy', 26, 25, 'salamaner'),
    e('quadratic', 'balanced', 25, 26, 'mysticaleye'),
    e('round', 'tanky', 25, 25, 'piranha')
  ], 1060, 315, { arenaType: 'forest', hp: 0.7, dmg: 1.3 }),
  // 95 — PARTNERS boss (with thunder partner)
  s(95, 'stage_95', [
    e('cushioned', 'tanky', 28, 28, 'castle', 'partners'),
    e('round', 'tanky', 28, 28, 'piranha', 'partners'),
    e('triangle', 'tanky', 27, 27, 'thunderstorm', 'thunder'),
    e('quadratic', 'balanced', 28, 23, 'mysticaleye', 'partners')
  ], 2700, 480, { isBoss: true, dmg: 1.1 }),
  s(96, 'stage_96', [
    e('star', 'speedy', 27, 26, 'tornado'),
    e('triangle', 'speedy', 27, 26, 'snake'),
    e('cushioned', 'tanky', 26, 27, 'gear')
  ], 1080, 320, { arenaType: 'ice', hp: 0.75, dmg: 1.05 }),
  s(97, 'stage_97', [
    e('star', 'speedy', 27, 27, 'axe'),
    e('piercer', 'speedy', 26, 27, 'scorpion'),
    e('quadratic', 'tanky', 27, 26, 'chip')
  ], 1100, 325, { arenaType: 'lava', hp: 0.95, dmg: 0.75 }),
  s(98, 'stage_98', [
    e('star', 'speedy', 28, 27, 'reddragon'),
    e('quadratic', 'balanced', 27, 28, 'prisma'),
    e('triangle', 'speedy', 27, 27, 'eagle')
  ], 1120, 330, { hp: 1.3, dmg: 0.95 }),
  s(99, 'stage_99', [
    e('star', 'speedy', 28, 28, 'ice'),
    e('triangle', 'speedy', 28, 27, 'phoenix'),
    e('quadratic', 'tanky', 27, 28, 'angelic'),
    e('cushioned', 'balanced', 27, 27, 'mountain')
  ], 1150, 340, { arenaType: 'lava', hp: 1.05 }),
  // 100 — HEALERS boss (grand finale)
  s(100, 'stage_100', [
    e('cushioned', 'balanced', 29, 32, 'mountain', 'healers'),
    e('cushioned', 'tanky', 28, 33, 'gear', 'healers'),
    e('round', 'balanced', 33, 30, 'turtle', 'healers'),
    e('quadratic', 'speedy', 29, 32, 'mysticaleye', 'healers')
  ], 3500, 600, { isBoss: true, dmg: 1.2 })
]

// ─── Boss tuning pass (balance sims 2026-10-28, #playtest-1-2) ──────────────
// A lone boss's parts never sit above LONE_BOSS_LEVEL_CAP × the mean part
// level of the regular stage before it: the hand levels (child-emitter 80 at
// 41/48, ghost 90 at 45/48 vs a ~22-25 team) plus the boss HP floor made
// walls no HP tuning could open — their damage decided the fight.
export const LONE_BOSS_LEVEL_CAP = 1.4
/** Per-boss-stage HP scale on top of CAMPAIGN_NPC_TUNING.bossHpMul, fitted
 *  by `balance-sim.mjs camp` sweeps to a ~50-60 % first-try win for the
 *  scripted player (no loss-streak relief). Missing = 1. */
export const BOSS_STAGE_HP_SCALE: Readonly<Record<number, number>> = Object.freeze({
  5: 0.71, 10: 1.26, 15: 1.14, 20: 1.49, 25: 0.71, 30: 0.86, 35: 0.71,
  40: 0.71, 45: 1.00, 50: 0.71, 55: 1.00, 60: 1.00, 65: 0.57, 70: 0.71,
  75: 0.57, 80: 0.46, 85: 1.00, 88: 0.71, 90: 0.57, 95: 0.37, 100: 0.37
})
const meanPartLevel = (st: Stage): number =>
  st.enemyTeam.reduce((n, b) => n + b.topLevel + b.bottomLevel, 0) / (2 * Math.max(1, st.enemyTeam.length))
for (let i = 1; i < BASE_STAGES.length; i++) {
  const st = BASE_STAGES[i]!
  if (!st.isBoss) continue
  const scale = BOSS_STAGE_HP_SCALE[st.id]
  if (st.enemyTeam.length === 1) {
    // At least +4 levels of headroom so the early bosses (stage 4's team is
    // level ~0.5) are not flattened to level 1.
    const ref = meanPartLevel(BASE_STAGES[i - 1]!)
    const cap = Math.max(Math.round(LONE_BOSS_LEVEL_CAP * ref), Math.round(ref + 4))
    const b = st.enemyTeam[0]!
    st.enemyTeam = [{ ...b, topLevel: Math.min(b.topLevel, cap), bottomLevel: Math.min(b.bottomLevel, cap) }]
  }
  if (scale !== undefined && scale !== 1) st.enemyTeam = st.enemyTeam.map(b => b.isBoss ? { ...b, bossHpScale: scale } : b)
}

// ─── Infinite Campaign (stages 101 and beyond) ──────────────────────────────
// After the 100 hand-crafted stages, the campaign loops back to stage 1
// indefinitely. Each "cycle" past the first bumps enemy part levels and
// multiplies rewards so progression stays meaningful without requiring
// more hand-written entries. Stages 101-200 are cycle 1, 201-300 cycle 2,
// and so on forever.

export const BASE_CAMPAIGN_LENGTH = BASE_STAGES.length

// Roman-numeral suffix for cycle > 0 (purely cosmetic name differentiation).
const CYCLE_SUFFIX = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const cycleSuffix = (cycle: number): string =>
  cycle <= 0 ? '' : (CYCLE_SUFFIX[cycle] ?? `x${cycle + 1}`)

/**
 * Scaling curves — applied on top of a base stage for cycle `c` ≥ 1.
 *   levels   → +10 per cycle so enemies stay roughly in lockstep with a
 *              player who's been upgrading their own parts.
 *   rewards  → +35% per cycle (linear). Intentionally slower than the
 *              cycle's upgrade-cost growth (which is quadratic via the
 *              L>10 term in upgradeCost), so every loop tightens the
 *              economy and makes rewarded-ad tops-up genuinely useful.
 */
const cycleLevelBonus = (cycle: number) => cycle * 22
const cycleRewardMul = (cycle: number) => 1 + cycle * 0.35

// ── Mid-game reward trim ──────────────────────────────────────────────────
// Stages 20–100 run on trimmed win rewards so the player keeps bumping
// into "I need a bit more" moments roughly every few stages — exactly the
// pressure point where a rewarded video or the 10-min chest unlocks the next
// upgrade tier. Bosses get a softer trim so their milestone payouts still feel
// like a reward spike.
//
// This note used to say "+100" for both offers, and that stopped being true
// long before anyone noticed: they paid a FLAT 125 / 100 while `upgradeCost`
// grows quadratically past level 10, so an ad went from ~0.9 of an upgrade at
// stage 5 to ~0.09 at stage 99 and the pressure point it was supposed to
// relieve simply stopped existing. Both offers are now derived from the
// current stage's loss reward (`useStageRewards.ts`), which holds them at
// roughly 0.75–1.4 upgrades all the way out.
const MID_TRIM_START = 20
const MID_TRIM_END = 100
const MID_TRIM_REG = 0.55
const MID_TRIM_BOSS = 0.75

const tightenMidGame = (stage: Stage): Stage => {
  // NOTE: id here is the BASE-stage id (1..100), so the trim band applies
  // to the same "slot" of every cycle — the mid-game tightness is a
  // permanent spine of the campaign, not just a one-time cycle-1 quirk.
  if (stage.id < MID_TRIM_START || stage.id > MID_TRIM_END) return stage
  const mul = stage.isBoss ? MID_TRIM_BOSS : MID_TRIM_REG
  return { ...stage, rewardWin: Math.round(stage.rewardWin * mul) }
}

/** Produce a scaled copy of a base stage for an arbitrary later cycle. */
const scaleStage = (base: Stage, targetId: number, cycle: number): Stage => {
  if (cycle <= 0) return { ...base, id: targetId }
  const lvlBonus = cycleLevelBonus(cycle)
  const rewardMul = cycleRewardMul(cycle)
  const suffix = cycleSuffix(cycle)
  return {
    ...base,
    id: targetId,
    cycleSuffix: suffix || undefined,
    // The stage HP / damage scales are fitted to the base campaign's player
    // curve: the cycle copies keep their own (unscaled) tuning.
    enemyTeam: base.enemyTeam.map(({ stageHpScale: _hp, stageDmgScale: _dmg, ...cfg }) => ({
      ...cfg,
      topLevel: cfg.topLevel + lvlBonus,
      bottomLevel: cfg.bottomLevel + lvlBonus
    })),
    rewardWin: Math.round(base.rewardWin * rewardMul),
    rewardLose: Math.round(base.rewardLose * rewardMul)
  }
}

/**
 * Look up the stage for any 1-based id. There is no upper bound — stages
 * past 100 auto-generate from the base 100 with ever-increasing difficulty.
 */
export const getStageById = (id: number): Stage => {
  if (id < 1) return tightenMidGame({ ...BASE_STAGES[0]!, id: 1 })
  const cycle = Math.floor((id - 1) / BASE_CAMPAIGN_LENGTH)
  const baseIdx = (id - 1) % BASE_CAMPAIGN_LENGTH
  // Trim BEFORE cycle scaling so the cycle reward multiplier compounds
  // on top of the already-tightened base — the mid-game squeeze persists
  // (and grows relatively tighter) in every cycle.
  const base = tightenMidGame(BASE_STAGES[baseIdx]!)
  const scaled = scaleStage(base, id, cycle)
  // Stage-101+ bosses (bosses-100-feature.md §3): the boss LAYOUT repeats
  // every 200 stages, so in every odd cycle the x10 boss slots 110…200 field
  // a new encounter instead of the cycle copy. It pays the replaced slot's
  // reward (already trimmed + cycle-scaled above) and is authored at cycle-1
  // levels, so it gains the level bonus of every cycle past the first.
  // bosses100-off build (VITE_APP_FEATURE_BOSSES100=false): no encounter — the
  // cycle copy exactly as before the feature (tests/fixtures/…preBosses100).
  const encounter = BOSSES100_BUILD && cycle > 0 ? encounterForSlot(layoutSlot(id)) : null
  if (!encounter) return scaled
  return buildBossEncounterStage(encounter.id, shiftLevels(cycleLevelBonus(cycle) - cycleLevelBonus(1)), {
    stageId: id,
    rewardWin: scaled.rewardWin,
    rewardLose: scaled.rewardLose,
    cycleSuffix: newEncounterSuffix(cycle)
  })
}

/**
 * Name suffix of a new boss encounter in 100-cycle `cycle` (odd): its first
 * appearance (101–200) has none, the second (301–400) reads "II", the third
 * "III" — counted per appearance, not per cycle like the cycle copies.
 */
export const newEncounterSuffix = (cycle: number): string => cycleSuffix(encounterAppearance(cycle) - 1)

/**
 * Legacy `STAGES` export — the campaign is now infinite, but some existing
 * consumers (cheats, leaderboard tick logic, etc.) still expect an array
 * they can index or iterate. We materialize the first two cycles (200
 * stages) so iteration-based code keeps working; use `getStageById(id)`
 * for arbitrary lookups beyond that.
 */
export const STAGES: Stage[] = Array.from(
  { length: BASE_CAMPAIGN_LENGTH * 2 },
  (_, i) => getStageById(i + 1)
)

// ─── Upgrade Definitions ────────────────────────────────────────────────────

/** Per-level bonus for each top part (leans into the part's identity) */
export const TOP_UPGRADE_BONUS: Record<TopPartId, { damage: number; defense: number; hp: number }> = {
  star: { damage: 0.16, defense: 0.03, hp: 1 },  // glass cannon
  triangle: { damage: 0.08, defense: 0.05, hp: 2 },  // aggressive balanced
  round: { damage: 0.04, defense: 0.08, hp: 4 },  // defensive
  quadratic: { damage: 0.06, defense: 0.06, hp: 3 },  // true balanced
  cushioned: { damage: 0.03, defense: 0.10, hp: 5 },  // pure tank
  piercer: { damage: 0.11, defense: 0.03, hp: 1 }    // tank piercer
}

/** Per-level bonus for each bottom part */
export const BOTTOM_UPGRADE_BONUS: Record<BottomPartId, { speed: number; decay: number; hp: number }> = {
  speedy: { speed: 0.09, decay: 0.00015, hp: 1 },  // leans into speed
  tanky: { speed: 0.02, decay: 0.00020, hp: 4 },  // leans into survival
  balanced: { speed: 0.04, decay: 0.00018, hp: 2 }   // balanced
}

// ─── Legacy-part NPC compensation (part-level balance pass) ─────────────────
//
// Smashers read their own tuned part tables (useSpinnerConfig
// SMASHER_TOP_PARTS …) while part-only enemies — every campaign stage, boss
// encounter, league gatekeeper and ghost — keep the legacy ones. A PART-ONLY
// NPC blade (outside PvP) gets an HP multiplier keyed on its own part level
// (mean of top and bottom; piecewise linear, flat past the ends) so the
// player's smasher team meets the same stage-by-stage resistance as before
// the pass. Fitted per 10-stage band with `scripts/balance-sim.mjs camp`
// (balance-report.md): the starting team got stronger at low levels (Speedy's
// HP no longer starts at 0) and a little weaker around smasher level 17–20.
//   enemy level  ~1.4 (stages 1–10) … ~8 (21–30)  → ×1.25
//                ~11 (31–40)                      → ×0.92
//                ~14–17 (41–60)                   → ×0.97–1.0
//                ~19–27 (61–100)                  → ×1.15
//                ≥ 33 (101+)                      → ×1.07
//
// TEAM SIZE (src/data/teamSize.ts). A side that fields one blade gets the solo
// boost (×1.2 damage and max HP) — owner-agnostic, so a LONE campaign NPC (a
// solo boss: stages 5, 10, 15, 30 …) would get it too. Campaign compositions
// are designed, not chosen, so a part-only NPC fighting alone has the boost
// offset here (soloHpMul / soloDmgMul, × the boost = its designed strength):
// measured with the boost kept, solo-boss stages fell 71 → 44 % (stages 5, 10)
// and 23 → 16 % (later solo bosses) for the default player.
//
// The sizes themselves also move the curve: every blade is sized by its own
// side's count, so a stage's NPC team of 1 / 3 / 4 is no longer the player's
// size (2 → ×0.783, 3+ → ×0.675, a lone boss ×0.9 × 1.6). countHpMul (keyed
// on the NPC team's count, 4+ → [4]) refits that, measured per stage type
// with `scripts/balance-sim.mjs camp --team-late 1|2|3` (numbers: roadmap.md,
// "Team size" entry).
export const CAMPAIGN_NPC_TUNING: {
  hpCurve: [number, number][]
  dmgMul: number
  soloHpMul: number
  soloDmgMul: number
  countHpMul: [number, number, number, number]
  /** HP multiplier of a campaign BOSS blade (was a flat 2). Retuned with the
   *  spiked boss tree (arenaTerrain TOWER_TUNING): the tree is no longer the
   *  easy route, so the knock-out route gives a little back. */
  bossHpMul: number
  /** #playtest-1-2/-3 boss curve, ONE rule for every campaign boss: a boss
   *  blade's max HP never falls below the HP a neutral (quadratic + balanced)
   *  blade has at the same part levels — a glass-cannon archetype must not
   *  make a paper boss (stage 90's star/speedy Bat King had 96 HP between
   *  walls 88 and 95) … */
  bossHpFloor: boolean
  /** … and the boss HP budget is shared by the boss blades: × this per
   *  number of boss blades on the NPC team (1, 2, 3, 4+). Partner / healer
   *  trios and quartets (stages 20, 25, 50, 75, 88, 95, 100) were the walls,
   *  lone bosses fell in a few turns. The tree follows (0.75 × team HP). */
  bossCountHpMul: [number, number, number, number]
} = {
  hpCurve: [[0, 0.8], [3, 0.95], [5, 1.18], [8, 1.35], [11, 1.0], [14, 1.05], [17, 1.08], [20, 1.22], [27, 1.15], [33, 1.1]],
  dmgMul: 1,
  soloHpMul: 1 / 1.2,
  soloDmgMul: 1 / 1.2,
  countHpMul: [0.88, 1, 0.9, 0.85],
  bossHpMul: 1.75,
  bossHpFloor: true,
  bossCountHpMul: [1, 0.9, 0.8, 0.7]
}

/** Boss-team HP share per boss-blade count (#playtest-1-2). */
export const campaignBossCountHpMul = (bossCount: number): number => {
  const c = CAMPAIGN_NPC_TUNING.bossCountHpMul
  return c[Math.min(4, Math.max(1, Math.floor(bossCount))) - 1] ?? 1
}

/** HP multiplier of a part-only NPC on a campaign team of `count` blades. */
export const campaignNpcCountHpMul = (count: number): number => {
  const c = CAMPAIGN_NPC_TUNING.countHpMul
  return c[Math.min(4, Math.max(1, Math.floor(count))) - 1] ?? 1
}

/** HP multiplier of a part-only NPC blade at part level `level`. */
export const campaignNpcHpMul = (level: number): number => {
  const c = CAMPAIGN_NPC_TUNING.hpCurve
  if (c.length === 0) return 1
  if (level <= c[0]![0]) return c[0]![1]
  for (let i = 1; i < c.length; i++) {
    const [l1, m1] = c[i]!
    if (level <= l1) {
      const [l0, m0] = c[i - 1]!
      return m0 + ((m1 - m0) * (level - l0)) / (l1 - l0)
    }
  }
  return c[c.length - 1]![1]
}

// ─── Boss Rubber-Banding ────────────────────────────────────────────────────
//
// Frustrated-player nudge: each consecutive *campaign* loss (any stage since
// #playtest-1-15; bosses only before) shaves a chunk off the next fight's NPC
// max HP, capped so the fight is never trivially won (bosses 50 %, regular
// stages 30 %). Resets to 0 on a campaign boss win. Does NOT apply to PvP, ghost,
// or cheat stages — gating happens at the call sites in SpinnerArena's
// game-over watcher (increment) and useSpinnerGame.createBladeState
// (consume).
//
// Formula:
//   reduction = min(0.5, floor(streak / 2) * 0.10)
//     streak  0-1 → 0%  full HP
//     streak  2-3 → 10%
//     streak  4-5 → 20%
//     ...
//     streak ≥10  → 50% cap
//
// Persisted under `smashers_boss_loss_streak`. The `smashers_` prefix means
// the SaveManager mirrors it to the cloud strategy, so the nudge follows
// the player across devices — a frustrating boss on mobile carries its
// rubber-band into the desktop session.

const BOSS_LOSS_STREAK_KEY = 'smashers_boss_loss_streak'
const BOSS_HP_REDUCTION_PER_STEP = 0.10  // 10% off per `STEP` losses
const BOSS_HP_REDUCTION_STEP = 2         // losses required per +1 reduction tier
const BOSS_HP_REDUCTION_CAP = 0.5        // never drop the boss below 50% HP

const loadBossLossStreak = (): number => {
  try {
    const raw = localStorage.getItem(BOSS_LOSS_STREAK_KEY)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

const bossLossStreak: Ref<number> = ref(loadBossLossStreak())

// Re-read on hydrate-success bump (same pattern as currentStageId / upgrades).
// Needed because module init reads localStorage synchronously, but on
// cloud-only builds the SaveManager hydrate may complete after this
// module evaluates.
watch(saveDataVersion, () => {
  bossLossStreak.value = loadBossLossStreak()
})

const persistBossLossStreak = () => {
  if (bossLossStreak.value > 0) {
    localStorage.setItem(BOSS_LOSS_STREAK_KEY, String(bossLossStreak.value))
  } else {
    // Keep the key absent rather than writing "0" — fewer cloud bytes,
    // and a brand-new player's hydrate stays a no-op for this key.
    localStorage.removeItem(BOSS_LOSS_STREAK_KEY)
  }
}

export const noteCampaignBossLoss = () => {
  bossLossStreak.value++
  persistBossLossStreak()
}

export const noteCampaignBossWin = () => {
  if (bossLossStreak.value === 0) return
  bossLossStreak.value = 0
  persistBossLossStreak()
}

/** Cap of the rubber band on a NON-boss stage (#playtest-1-15: the band used
 *  to help on boss stages only, so a regular-stage wall like 13 or 87 gave a
 *  losing player nothing but the same tip). Lower than the boss cap: regular
 *  stages are shorter and the band should nudge, not hand out wins. */
const STAGE_HP_REDUCTION_CAP = 0.3

/** Rubber-band reduction (0 … cap) for a loss streak — pure. */
export const rubberBandReduction = (streak: number, isBoss: boolean): number => {
  const tiers = Math.floor(Math.max(0, streak) / BOSS_HP_REDUCTION_STEP)
  return Math.min(isBoss ? BOSS_HP_REDUCTION_CAP : STAGE_HP_REDUCTION_CAP, tiers * BOSS_HP_REDUCTION_PER_STEP)
}

/** Multiplier (0..1] applied to a campaign boss's max HP. 1 = full HP. */
export const bossHpRubberBandMul = (): number => 1 - rubberBandReduction(bossLossStreak.value, true)

/** Multiplier (0..1] applied to EVERY campaign NPC's max HP (boss or not):
 *  the streak counts consecutive campaign losses on any stage. */
export const campaignHpRubberBandMul = (isBoss: boolean): number => 1 - rubberBandReduction(bossLossStreak.value, isBoss)

/** Is the loss-streak assist active right now (the lose-screen tip says so)? */
export const rubberBandActive = (): boolean => rubberBandReduction(bossLossStreak.value, false) > 0

/** Last campaign stage of the 1-vs-1 tutorial arc on which the PLAYER always
 *  launches first (#playtest-1-21: stage 3 was won with zero input — the
 *  lone enemy opened, rammed the player's smasher and died on the exchange).
 *  The tutorial must be won by the player's own launches. */
export const PLAYER_FIRST_UNTIL_STAGE = 3

/** Forced first turn of a campaign stage (undefined = the usual bias). */
export const campaignFirstTurn = (stageId: number): 'player' | undefined =>
  stageId >= 1 && stageId <= PLAYER_FIRST_UNTIL_STAGE ? 'player' : undefined

/** Cost for upgrading to a given level. Linear base of 100 + (level-1)*20
 *  plus a quadratic "mid/late game" term that kicks in past level 10 so
 *  the upgrade economy tightens as enemies reach high levels — keeping
 *  stage rewards meaningful and ad-pressure present all the way through.
 *
 *  Curve:
 *    L<=10  → unchanged from the old linear formula (forgiving early game)
 *    L>10   → extra 3*(L-10)² coins per level
 *    e.g. L=15: +75, L=20: +300, L=25: +675, L=30: +1200
 */
export const upgradeCost = (toLevel: number): number => {
  const extra = toLevel > 10 ? 3 * (toLevel - 10) * (toLevel - 10) : 0
  return 100 + (toLevel - 1) * 20 + extra
}

// ─── Persistence ────────────────────────────────────────────────────────────
// STAGE_KEY / UPGRADES_KEY imported from `@/keys` at the top of this file.

export interface PlayerUpgrades {
  tops: Record<TopPartId, number>
  bottoms: Record<BottomPartId, number>
}

const DEFAULT_UPGRADES: PlayerUpgrades = {
  tops: { star: 0, triangle: 0, round: 0, quadratic: 0, cushioned: 0, piercer: 0 },
  bottoms: { speedy: 0, tanky: 0, balanced: 0 }
}

const loadStage = (): number => {
  try {
    const raw = localStorage.getItem(STAGE_KEY)
    if (raw) {
      const n = parseInt(raw, 10)
      // No upper bound — the campaign is infinite. Any stored positive
      // integer is valid and maps to a cycle via getStageById.
      if (n >= 1) return n
    }
  } catch { /* fall through */
  }
  return 1
}

const loadUpgrades = (): PlayerUpgrades => {
  try {
    const raw = localStorage.getItem(UPGRADES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.tops && parsed?.bottoms) return {
        tops: { ...DEFAULT_UPGRADES.tops, ...parsed.tops },
        bottoms: { ...DEFAULT_UPGRADES.bottoms, ...parsed.bottoms }
      }
    }
  } catch { /* fall through */
  }
  return JSON.parse(JSON.stringify(DEFAULT_UPGRADES))
}

// ─── Singleton State ────────────────────────────────────────────────────────

const currentStageId: Ref<number> = ref(loadStage())
const playerUpgrades: Ref<PlayerUpgrades> = ref(loadUpgrades())

// Re-read from localStorage whenever the SaveManager reports a successful
// (re)hydrate. Required for the case where the strategy's first hydrate
// failed (e.g., CG SDK returned partial data on the mobile app post-
// force-close), the composable initialised with stale defaults, and a
// background retry later succeeded with the real cloud values. Without
// this watcher the player would see stage=1 forever despite cloud being
// restored to localStorage.
watch(saveDataVersion, () => {
  currentStageId.value = loadStage()
  playerUpgrades.value = loadUpgrades()
})

// ─── Cheat Stage Override ───────────────────────────────────────────────────
// Cheats (see useCheats.ts) may inject a one-shot custom stage — typically
// to demo a specific boss ability scaled to the player's current upgrades.
// When set, `currentStage` returns this stage instead of the campaign one,
// and `stageReinitSignal` is bumped so any active SpinnerArena view re-runs
// initGame with the new enemy team.
const cheatStage: Ref<Stage | null> = ref(null)
const stageReinitSignal: Ref<number> = ref(0)

// ─── Derived ────────────────────────────────────────────────────────────────

const currentStage = computed(() => cheatStage.value ?? getStageById(currentStageId.value))

// Campaign is now infinite — there is no "last" stage. Kept as a computed
// that's always false so existing consumers compile unchanged.
const isLastStage = computed(() => false)

// ─── Actions ────────────────────────────────────────────────────────────────

const saveState = () => {
  localStorage.setItem(STAGE_KEY, currentStageId.value.toString())
  localStorage.setItem(UPGRADES_KEY, JSON.stringify(playerUpgrades.value))
}

const advanceStage = () => {
  // Infinite campaign — always advance.
  currentStageId.value++
  saveState()
}

const upgradeTop = (partId: TopPartId): boolean => {
  const current = playerUpgrades.value.tops[partId]
  const cost = upgradeCost(current + 1)
  // Caller is responsible for checking coins — return false if level is already maxed
  playerUpgrades.value = {
    ...playerUpgrades.value,
    tops: { ...playerUpgrades.value.tops, [partId]: current + 1 }
  }
  saveState()
  return true
}

const upgradeBottom = (partId: BottomPartId): boolean => {
  const current = playerUpgrades.value.bottoms[partId]
  const cost = upgradeCost(current + 1)
  playerUpgrades.value = {
    ...playerUpgrades.value,
    bottoms: { ...playerUpgrades.value.bottoms, [partId]: current + 1 }
  }
  saveState()
  return true
}

// ─── Ability Boss Stage Builder ─────────────────────────────────────────────

/**
 * Part-level function of {@link buildAbilityBossStage}: the levels of the
 * `index`-th roster blade, given its parts. The cheat menu scales to the
 * player's upgrades; a league gatekeeper (LG7) passes FIXED levels.
 */
export type AbilityLevelFn = (
  top: TopPartId,
  bottom: BottomPartId,
  index: number
) => { topLevel: number; bottomLevel: number }

/**
 * Build a boss-showcase stage for a specific `ability` — PURE: the levels come
 * only from `level`, so the same arguments always give a deep-equal stage that
 * shares no object with a previous call. The enemy roster is chosen to
 * highlight each ability's mechanic:
 *
 *   ghost    → single ghost boss (splits on launch)
 *   split    → single split boss (shatters into 5 on death)
 *   partners → 3-blade partner team (no FF between them)
 *   healers  → 4-blade healer team (no FF + heal-on-contact, 20% oversize)
 *
 * Shared by the cheat menu ({@link buildCheatBossStage}) and the league's
 * classic gatekeepers (src/league/leagueGatekeepers.ts). Stage id −1 (the
 * sentinel: never persists or advances), 'boss' arena, name `cheat_<ability>`.
 */
export const buildAbilityBossStage = (ability: BossAbility, level: AbilityLevelFn): Stage => {
  let index = 0
  const at = (
    top: TopPartId,
    bot: BottomPartId,
    modelId: string,
    bossAbility: BossAbility
  ): StageBladeConfig => {
    const lv = level(top, bot, index++)
    return e(top, bot, lv.topLevel, lv.bottomLevel, modelId, bossAbility)
  }

  let name = 'cheat_boss'
  let enemyTeam: StageBladeConfig[] = []

  switch (ability) {
    case 'ghost':
      name = 'cheat_ghost'
      enemyTeam = [
        at('triangle', 'speedy', 'snake', 'ghost')
      ]
      break
    case 'split':
      name = 'cheat_split'
      enemyTeam = [
        at('round', 'tanky', 'piranha', 'split')
      ]
      break
    case 'partners':
      name = 'cheat_partners'
      enemyTeam = [
        at('cushioned', 'tanky', 'castle', 'partners'),
        at('round', 'tanky', 'turtle', 'partners'),
        at('quadratic', 'balanced', 'mysticaleye', 'partners')
      ]
      break
    case 'healers':
      name = 'cheat_healers'
      enemyTeam = [
        at('cushioned', 'balanced', 'mountain', 'healers'),
        at('round', 'balanced', 'piranha', 'healers'),
        at('cushioned', 'balanced', 'gear', 'healers'),
        at('quadratic', 'balanced', 'mysticaleye', 'healers')
      ]
      break
    case 'child-emitter':
      name = 'cheat_child_emitter'
      enemyTeam = [
        at('round', 'tanky', 'dark', 'child-emitter')
      ]
      break
    case 'stat-switch':
      name = 'cheat_stat_switch'
      enemyTeam = [
        at('cushioned', 'tanky', 'boulder', 'stat-switch')
      ]
      break
    case 'life-leech':
      name = 'cheat_life_leech'
      enemyTeam = [
        at('triangle', 'speedy', 'snake', 'life-leech')
      ]
      break
    case 'thunder':
      name = 'cheat_thunder'
      enemyTeam = [
        at('triangle', 'tanky', 'thunderstorm', 'thunder')
      ]
      break
  }

  return {
    id: -1, // sentinel — cheat stages never persist or advance
    name,
    isBoss: true,
    arenaType: 'boss', // keep the boss-arena visuals for ability showcases
    enemyTeam,
    // Rough mid-campaign reward band — not meaningful, just non-zero.
    rewardWin: 500,
    rewardLose: 100
  }
}

// ─── Cheat Stage Builder ────────────────────────────────────────────────────

/**
 * Build a boss-showcase stage scaled to the player's current upgrade levels
 * (see {@link buildAbilityBossStage} for the rosters). Each enemy blade's part
 * levels are matched to the player's corresponding upgrade level so the fight
 * is fair regardless of progression.
 */
export const buildCheatBossStage = (ability: BossAbility): Stage => {
  const tops = playerUpgrades.value.tops
  const bots = playerUpgrades.value.bottoms
  // Level used for parts the player hasn't upgraded on their own team —
  // falls back to the player's peak level so the boss stays threatening.
  const peakTop = Math.max(0, ...Object.values(tops))
  const peakBot = Math.max(0, ...Object.values(bots))
  return buildAbilityBossStage(ability, (top, bot) => ({
    topLevel: Math.max(tops[top] ?? 0, peakTop),
    bottomLevel: Math.max(bots[bot] ?? 0, peakBot)
  }))
}

/**
 * Activate a cheat stage and kick any active arena view to re-init its
 * game loop. Pass `null` to clear the override and return to the regular
 * campaign stage.
 */
export const loadCheatStage = (stage: Stage | null) => {
  cheatStage.value = stage
  stageReinitSignal.value++
}

/**
 * Kick any active arena view to rebuild its game loop against whatever
 * `currentStage` now resolves to, WITHOUT touching the cheat override.
 *
 * Used by the full-progress reset: the saveDataVersion bump gets
 * `currentStageId` / `playerUpgrades` back to their defaults, but the
 * arena is still holding the blades and enemy team it built from the old
 * stage — the player would be looking at a stage-30 boss with stage-1
 * stats until the next battle ended.
 */
export const requestStageReinit = () => {
  stageReinitSignal.value++
}

// ─── Public API ─────────────────────────────────────────────────────────────

const useSpinnerCampaign = () => ({
  currentStageId,
  currentStage,
  isLastStage,
  playerUpgrades,
  stageReinitSignal,
  cheatStage,
  bossLossStreak,
  advanceStage,
  upgradeTop,
  upgradeBottom,
  upgradeCost,
  buildCheatBossStage,
  loadCheatStage
})

export default useSpinnerCampaign
