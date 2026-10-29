// A campaign stage's enemy roster → the engine's `initGame` configs. Shared by
// every stage (classic and bosses 100+), so it lives outside the lazy boss
// glue (use/bosses/bossArenaUi.ts re-exports it). String-free: an optional
// boss field is forwarded only when the stage sets it.

import type { SpinnerConfig } from '@/types/spinner'
import { standardLook, type Stage, type StageBladeConfig } from '@/use/useSpinnerCampaign'

/** One stage enemy blade as the engine's `initGame` takes it. Every field the
 *  engine reads off a campaign enemy is forwarded; optional mechanic fields
 *  are only set when present (so classic stages build the same objects). */
export const stageBladeToConfig = (blade: Readonly<StageBladeConfig>): SpinnerConfig => {
  const e = standardLook(blade)
  const cfg: SpinnerConfig = {
    topPartId: e.topPartId,
    bottomPartId: e.bottomPartId,
    topLevel: e.topLevel,
    bottomLevel: e.bottomLevel,
    modelId: e.modelId,
    isBoss: e.isBoss,
    // ghost / split / partners / healers … activate from this.
    bossAbility: e.bossAbility
  }
  // Stage-101+ mechanics (§4): the carrier's trait and the split shards' trait.
  if (e.fxSkin !== undefined) cfg.fxSkin = e.fxSkin
  if (e.bossHpScale !== undefined) cfg.bossHpScale = e.bossHpScale
  if (e.stageHpScale !== undefined) cfg.stageHpScale = e.stageHpScale
  if (e.stageDmgScale !== undefined) cfg.stageDmgScale = e.stageDmgScale
  if (e.bossTrait !== undefined) cfg.bossTrait = e.bossTrait
  if (e.shardTrait !== undefined) cfg.shardTrait = e.shardTrait
  return cfg
}

/** The enemy roster of a stage, ready for `initGame`. */
export const stageEnemyConfigs = (stage: Pick<Stage, 'enemyTeam'>): SpinnerConfig[] =>
  stage.enemyTeam.map(stageBladeToConfig)
