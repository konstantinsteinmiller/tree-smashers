// ─── Cheat / Boss Lab fight settlement (batch 3, G1) ─────────────────────────
//
// A cheat boss stage (useCheats `spawnCheatBoss`) or a Boss Lab launch is a
// TEST fight, not a campaign battle. Its result pays the stage's own fixed
// coins (Boss Lab `BOSS_LAB_REWARD_WIN` / `_LOSE` = 500 / 100; the classic
// cheat bosses the same 500 / 100 from `buildCheatBossStage`) and nothing
// else: no stage advance, no first-win flag, no battle-pass xp, no roulette,
// no trophy, no rubber band, no tip counters. SpinnerArena's game-over watcher
// calls this and returns before any campaign branch runs.
//
// Pure (no Vue, no campaign state) so the "touches nothing" contract is
// testable without mounting the arena.

import type { GameResult } from '@/types/spinner'
import type { Stage } from '@/use/useSpinnerCampaign'

/** Coins a finished cheat / Lab fight pays: the stage's fixed win or lose row. */
export const labBattleCoins = (
  stage: Pick<Stage, 'rewardWin' | 'rewardLose'>,
  result: GameResult | undefined
): number => {
  const coins = result === 'win' ? stage.rewardWin : stage.rewardLose
  return Number.isFinite(coins) && coins > 0 ? Math.round(coins) : 0
}

/**
 * Settle a cheat / Lab fight: pay its fixed coins through `addCoins` and
 * report how many were paid (the result screen's `+N`). The ONLY side effect.
 */
export const settleLabBattle = (
  stage: Pick<Stage, 'rewardWin' | 'rewardLose'>,
  result: GameResult | undefined,
  addCoins: (amount: number) => void
): number => {
  const coins = labBattleCoins(stage, result)
  if (coins > 0) addCoins(coins)
  return coins
}
