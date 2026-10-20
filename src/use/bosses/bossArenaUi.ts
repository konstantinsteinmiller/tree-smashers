// Boss 100+ arena glue (bosses-100-feature.md §3.5, §7.2, §7.3 — work package
// BW6). Pure decisions the arena view (SpinnerArena.vue) wires up, kept out of
// the SFC so they are unit-testable:
//
//   • stageBladeToConfig   — a stage's enemy blade → the engine's SpinnerConfig,
//                            forwarding the boss mechanic fields (bossAbility,
//                            bossTrait, shardTrait). Dropping bossTrait here
//                            meant no trait ever activated in the campaign.
//   • bossTrophiesFor      — which trophy skins a finished battle may grant:
//                            a real campaign WIN of an encounter stage only
//                            (never cheat / Boss Lab, ghost, PvP,
//                            league), before the ownership check.
//   • grantBossTrophies    — grant them (idempotent) and return the ones this
//                            win newly unlocked — what the reward screen shows.
//   • frozenBladeAtTap     — a tap that would pick a FROZEN spinner: the arena
//                            answers it with shake + crack + hint instead of a
//                            silent no-op (the freeze must never read as a bug).
//   • traitCardView        — the stat card's frozen / chill presentation.

import type { GameResult } from '@/types/spinner'
import type { Stage } from '@/use/useSpinnerCampaign'
import type { BattleMode } from '@/use/bossPeek'
import { trophySkinsForStage, type BossTrophySkinId } from '@/data/bossEncounters'
import { BOSS_TRAIT_TUNING, type TraitHudRow } from '@/use/bosses/bossTraits'

// `stageBladeToConfig` / `stageEnemyConfigs` live in the shared
// `@/use/stageBladeConfig` (every stage needs them, this module is lazy —
// bosses gate); re-exported for the tests.
export { stageBladeToConfig, stageEnemyConfigs } from '@/use/stageBladeConfig'

/** Battle kinds that never grant a trophy, beyond the arena's BattleMode. */
export type TrophyMode = BattleMode | 'league'

export interface BossTrophyInput {
  /** The stage the battle was fought on — read BEFORE `advanceStage()`. */
  stage: Pick<Stage, 'id' | 'bossEncounterId'>
  result: GameResult
  mode: TrophyMode
}

/**
 * Trophy skins this battle may grant (§3.5): only a campaign WIN of a real
 * encounter stage (id ≥ 101). A cheat / Boss Lab stage (id −1), a ghost, the
 * PvP and league gatekeepers (LG7) get nothing.
 */
export const bossTrophiesFor = ({ stage, result, mode }: BossTrophyInput): readonly BossTrophySkinId[] => {
  if (result !== 'win' || mode !== 'campaign') return []
  if (!Number.isInteger(stage.id) || stage.id < 101) return []
  return trophySkinsForStage(stage)
}

/**
 * Grant the trophies of a finished battle through `grant` (useModels
 * `grantTrophySkins` — idempotent, persists through the owned-skins key) and
 * return the skins THIS call newly unlocked, in encounter order. [] when the
 * battle grants nothing or every skin was already owned.
 */
export const grantBossTrophies = (
  input: BossTrophyInput,
  grant: (ids: readonly BossTrophySkinId[]) => readonly string[]
): BossTrophySkinId[] => {
  const ids = bossTrophiesFor(input)
  if (ids.length === 0) return []
  return grant(ids).filter((id): id is BossTrophySkinId => ids.includes(id as BossTrophySkinId))
}

/** Blade fields the tap test reads (SpinnerState satisfies it). */
export interface TapBlade {
  id: number
  x: number
  y: number
  radius: number
  hp: number
}

/**
 * The engine picks the nearest PICKABLE living blade within 3 radii of a tap
 * (`beginDrag`). When the nearest living blade in that reach is a frozen one,
 * the player aimed at the frozen spinner: return its index in `blades` (the
 * arena answers with shake + crack + hint and does NOT start a drag, so the
 * other spinner stays selected). −1 when the tap is not on a frozen blade.
 */
export const frozenBladeAtTap = (
  blades: readonly TapBlade[],
  hud: readonly Pick<TraitHudRow, 'frozen'>[],
  x: number,
  y: number
): number => {
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i]!
    if (b.hp <= 0) continue
    const dist = Math.hypot(x - b.x, y - b.y)
    if (dist < b.radius * 3 && dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best >= 0 && hud[best]?.frozen === true ? best : -1
}

export interface TraitCardView {
  frozen: boolean
  /** Live chill stacks 0…CHILL_MAX (pips). */
  chill: number
  /** Speed loss in percent for the aria label (CHILL_PER_STACK × stacks, 10 % each by default). */
  chillPct: number
}

const NO_TRAIT: TraitCardView = Object.freeze({ frozen: false, chill: 0, chillPct: 0 })

/** Stat-card presentation of one blade's trait HUD row (dead / absent → none). */
export const traitCardView = (row: TraitHudRow | undefined, dead = false): TraitCardView => {
  if (!row || dead) return NO_TRAIT
  const chill = Math.max(0, Math.min(BOSS_TRAIT_TUNING.CHILL_MAX, row.chill | 0))
  if (!row.frozen && chill === 0) return NO_TRAIT
  const chillPct = Math.round(Math.min(1, chill * BOSS_TRAIT_TUNING.CHILL_PER_STACK) * 100)
  return { frozen: row.frozen, chill, chillPct }
}

// ─── Boss intro card (§7.2) ─────────────────────────────────────────────────
// Plays INSIDE the engine's 1,600 ms meteor intro (no added time): 250 ms in,
// 900 ms hold, 350 ms out. Pause-aware (createPausableTimer).
export const BOSS_INTRO_IN_MS = 250
export const BOSS_INTRO_HOLD_MS = 900
export const BOSS_INTRO_OUT_MS = 350
export const BOSS_INTRO_TOTAL_MS = BOSS_INTRO_IN_MS + BOSS_INTRO_HOLD_MS + BOSS_INTRO_OUT_MS
/** The engine's meteor-intro length the card must fit inside. */
export const METEOR_INTRO_MS = 1600
