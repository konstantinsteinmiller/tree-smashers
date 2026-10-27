// ─── First-minutes battle onboarding rules (playtest run 1) ─────────────────
//
// Pure gates the arena reads, kept here so they are unit-tested:
//   - firstFightBoostFor  — the ×2 first-fight assist (#playtest-1-11)
//   - showWinRuleHint     — the "how to win" chip on tap-to-start (#playtest-1-6)
// (The stage-2 level-up lesson is made affordable by stage 1's own win reward,
// guarded in tests/battleOnboarding.test.ts — #playtest-1-9.)

import { TOWERS_FROM_STAGE } from '@/use/arenaTerrain'

/** The player fights at ×2 damage and HP until the first win — but only on
 *  stage 1, the one stage a genuine first-timer can be on without a win. A
 *  restored or seeded save further in must not fight one doubled stage and
 *  then a halved one. */
export const firstFightBoostFor = (hasFirstWin: boolean, stageId: number): boolean =>
  !hasFirstWin && stageId <= 1

/** Last campaign stage that still shows the win-rule chip: the stages after
 *  the trees first appear, through the first boss. */
export const WIN_RULE_HINT_LAST_STAGE = 5

/** The win rule (smash every enemy tree OR knock out every enemy smasher)
 *  is shown on tap-to-start from the first stage with trees through the
 *  first boss — campaign only (league / PvP / ghosts have their own intros). */
export const showWinRuleHint = (stageId: number, campaign: boolean): boolean =>
  campaign && stageId >= TOWERS_FROM_STAGE && stageId <= WIN_RULE_HINT_LAST_STAGE
