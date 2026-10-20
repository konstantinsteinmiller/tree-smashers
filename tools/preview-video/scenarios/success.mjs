/**
 * ─── SUCCESS (10 s): "outnumbered, then the cascade" ────────────────────────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the arena is the score
 *
 * A lava pit, three enemy blades above and a thin blue line below, already
 * spinning. One blue blade is pulled back on its slingshot from the very
 * first frame — the shot is loaded before the clip starts. It fires, crosses
 * the pit and shatters the first red blade on contact. The reds answer and
 * drive a blue one to the edge. Then the second pull-back, held long enough
 * to read as a decision, and the payoff: one launch that ricochets through
 * what is left of the enemy line and takes it apart, blade after blade, in
 * half a second. The victory meteor shower fills the arena, the board wipes,
 * and the next match is already spinning up when the clip ends.
 *
 * BEAT SHEET  (10 s @ 30 fps = 300 frames; seconds into `record`)
 *
 *   0.0   ALREADY LOADED — frame 0 is a drawn slingshot, not a static board
 *   0.8   RELEASE. The blade crosses the pit
 *   1.3   first contact: a red blade shatters
 *   2.8   the reds answer — their launch drives a blue blade to the wall
 *   4.55  the second pull-back, held: "the winning move is one input away"
 *   5.75  RELEASE — THE SHOT
 *   6.25  the cascade begins; the enemy line comes apart
 *   6.55  `poster` — past the white of the impact, where the wreckage reads
 *   7.0   the last red is gone: WIN, and the victory shower starts
 *   8.3   the board wipes into the next match
 *  10.0   the next match's meteor shower is still falling
 *
 * ── WHY THE HP IS AUTHORED, AND WHERE ──
 *
 * Every collision, every damage roll and the verdict itself are the real
 * simulation. What is authored is the HP each exchange is fought with, in
 * two places, both measured rather than guessed:
 *
 *   setup()    enemy 0 to 7% — a probe showed a full-power shot at a blade
 *              in that band shatters it on first contact (~280 ms), which is
 *              what puts the opening kill at 1.1 s instead of never.
 *   beat 4.55  the surviving reds to 8%. At that level ONE launch chained
 *              two kills in 190 ms and the third followed; at 20% the same
 *              launch killed exactly one and the clip has no payoff. This is
 *              the single number the whole beat sheet rests on.
 *
 * It is invisible: the HP rings are off in a clean feed, so there is no
 * counter on screen for a viewer to catch moving.
 *
 * ── WHY THE PLAYER STARTS A BLADE DOWN ──
 *
 * "I was losing and I turned it around" converts better than "I was level
 * and I won". `setup()` kills player blade 1 outright before the first
 * frame, so the clip opens two-against-three.
 */

import * as g from './_drive.mjs'

/** Stage 17: three enemies on a LAVA floor. Three blades fill the frame and
 *  the lava is the best-looking of the seven arena types at video size. */
const STAGE = 17

/** Pinned after a lot of takes: this is the seed whose opening coin flip
 *  gives the player the first turn AND whose enemy spawn jitter leaves the
 *  line spread across the top of the arena rather than stacked. */
const SEED = 1337

export default {
  id: 'success',
  label: 'Outnumbered, then the cascade',

  async setup(ctx) {
    await g.boot(ctx, { save: g.saveFixture(), seed: SEED, stage: STAGE })

    // Open a blade down and behind. Blade index 1 is the middle of the three,
    // so the survivors read as a broken line rather than a tidy pair.
    await g.stageHp(ctx, { player: [1, 0, 1], npc: [0.07, 1, 1] })

    // Load the opening shot NOW, in unrecorded time, so frame 0 already has
    // the slingshot drawn. `aim()` needs `player_turn` but not a running
    // physics tick, so it survives the freeze `boot()` ends on.
    await ctx.evaluate(() => window.__smashers.aimAtBlade(0, 'npc', 0, 1))

    const s = await g.snapshot(ctx)
    ctx.log.info(
      `staged stage ${s.stage}: ${s.alive.player} blue vs ${s.alive.npc} red` +
      `${ctx.clean ? ' (clean feed)' : ''}`
    )
  },

  async record(ctx) {
    const t = g.budget(ctx)
    await g.unfreeze(ctx)
    ctx.beat('open')

    // ── 0.0-4.55  the first exchange ──
    // Pre-aimed in setup, so this holds the existing pull-back and fires it.
    // `settleMs` is the MEASURED cycle: fire → +0.5 s first contact →
    // +2.0 s the enemy's turn → +2.5 s their launch → +3.75 s back to ours.
    // Spending exactly that lands the next beat on `player_turn` with nothing
    // still in flight.
    if (
      !(await g.shoot(ctx, t, {
        preAimed: true,
        aimMs: 800,
        settleMs: 3750,
        beat: 'first-blood'
      }))
    ) {
      return
    }

    // ── 4.55-7.3  THE SHOT ──
    // `author` drops the surviving reds to 8% — the measured band where a
    // single launch chains through the line instead of trading one for one —
    // and `shoot` applies it only once the board is at rest and it is
    // genuinely our turn. Authoring it from here instead would land while the
    // previous exchange is still resolving and win the match early; see the
    // `author` note in _drive.mjs.
    //
    // Aimed at enemy index 1, the middle of the surviving line, so the
    // ricochet has somewhere to go on both sides. `hero` at 800 ms puts the
    // poster AFTER the impact flash, where the wreckage reads.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 1,
        power: 1,
        author: { npc: [0.05, 0.05, 0.05] },
        aimMs: 900,
        settleMs: 900,
        hero: 700,
        beat: 'cascade'
      }))
    ) {
      return
    }

    // Let the cascade finish killing. A fixed settle cut away before the last
    // red died and left the clip's story as "and the arena is still half
    // full"; this spends only as long as the fight needs, through the budget,
    // so the shower and the restart still get their reserved seconds.
    const verdict = await g.awaitVerdict(ctx, t, { maxMs: 2200 })
    ctx.beat('verdict')
    ctx.log.info(`after the cascade: ${verdict.result} — ${JSON.stringify(verdict.alive)}`)

    // ── the victory shower the RENDERER paints ──
    // The only "YOU WIN" a clean feed gets, and it is 80 particles of it.
    if (!(await t.wait(900))) return

    // ── straight back in ──
    // No result screen exists in a clean feed, so a held final frame is just a
    // freeze. The restart's own meteor shower is the last thing on screen.
    await g.playAgain(ctx, { seed: SEED + 1 })
    ctx.beat('next')
    await t.wait(t.left)
  }
}
