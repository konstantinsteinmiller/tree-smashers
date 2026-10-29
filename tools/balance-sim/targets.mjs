// ─── Campaign difficulty curve: target first-try win rate per stage ─────────
//
// The win rate the balance-sim scripted player (random target ± 14°, random
// 55–100 % pull, no loss-streak relief, the coin-economy team of
// tests/balance.sim.test.ts) should reach on its FIRST try at each base stage.
// A real player aims better than the bot, and the loss-streak rubber band
// (−10 % enemy HP per two losses) softens every repeat, so these are floors
// of the felt experience, not the experience itself.
//
// Shape (owner brief 2026-10-28: "exciting campaign, beatable and fun; boss
// every 5th stage a challenge but not a wall; stage 1 a forced easy win"):
//   · stage 1 a sure, fast win (first-fight assist on top); 2–4 a gentle ramp;
//   · a saw-tooth inside every 5-stage block: the stage after a boss is a
//     breather, each next one a little harder, the boss the peak;
//   · the blocks tighten slowly over the campaign (early, mid, late bands).
// The stage table's `hp` option (useSpinnerCampaign.ts) is fitted to this
// curve by tools/balance-sim/fithp.mjs.

/** Boss stages of the base campaign: every 5th, plus the stage-88 trio. */
export const isBossStage = (id) => id % 5 === 0 || id === 88

/** Regular stages: [breather, …, the stage before the boss] per band. */
const REG = {
  early: [0.92, 0.88, 0.84, 0.8], // 6–20
  mid: [0.9, 0.85, 0.8, 0.76], // 21–50
  late: [0.88, 0.83, 0.78, 0.74] // 51–100
}

/** Bosses: the first ones gentle, then a steady ~60 % first-try — a real
 *  test, never a wall (with the loss-streak relief ≥ 9 in 10 bot runs clear
 *  every boss within three tries); the finale a touch harder. */
export const bossWinTarget = (id) =>
  id <= 5 ? 0.75 : id <= 10 ? 0.7 : id <= 15 ? 0.65 : id <= 45 ? 0.6 : id < 100 ? 0.58 : 0.55

/** Fight length: the scripted player's launches per fight (mean). One launch
 *  each way is ~8 s of real play, so 6–8 launches is a 50–70 s stage and a
 *  ~9-launch boss stays clear of sudden death (24 hand-offs ≈ 12 launches).
 *  Stage 1 is over in two launches; very short fights (1–3 launches) are coin
 *  flips decided by who lands the first big hit, very long ones drag. */
export const stageLengthTarget = (id) => {
  if (id <= 1) return 2
  if (id <= 4) return [2, 2, 3, 4, 5][id]
  if (id > 100) return NaN
  if (isBossStage(id)) return id <= 15 ? 7 : 9
  const p = id === 89 ? 1 : ((id - 1) % 5)
  return (id <= 20 ? [5, 5.5, 6, 6.5] : [5.5, 6, 6.5, 7])[Math.min(3, p)]
}

export const stageWinTarget = (id) => {
  if (id <= 1) return 1
  if (id <= 4) return [1, 1, 0.95, 0.92, 0.9][id]
  if (id > 100) return NaN
  if (isBossStage(id)) return bossWinTarget(id)
  const band = id <= 20 ? REG.early : id <= 50 ? REG.mid : REG.late
  // Position after the last boss (1 = the breather). 86/87 follow 85, 89 follows 88.
  const p = id === 89 ? 1 : ((id - 1) % 5)
  return band[Math.min(3, p)]
}
