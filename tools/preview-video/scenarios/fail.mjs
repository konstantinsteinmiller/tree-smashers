/**
 * ─── FAIL (10 s): "the one you want to run back" ────────────────────────────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the arena is the score
 *
 * The same lava pit, three-on-three, everything even. The blue line loads a
 * shot and takes a red blade apart on first contact — this looks won. The
 * reds answer hard and the blue blades come back scarred. Then the greedy
 * second shot: a blue blade dives into what is left of the enemy line, and
 * instead of finishing it, it shatters on the way in. The second blue goes
 * with it. The last red swings through an empty half of the arena and the
 * blue line is gone. The board wipes and the retry is already spinning up.
 *
 * The read the clip is buying: THAT WAS AVOIDABLE. The player was a blade up
 * and threw it on one over-committed launch.
 *
 * BEAT SHEET  (10 s @ 30 fps = 300 frames; seconds into `record`)
 *
 *   0.0   ALREADY LOADED — frame 0 is a drawn slingshot
 *   0.8   RELEASE
 *   1.3   first contact: a red shatters. The player is a blade up
 *   2.8   the reds answer
 *   4.55  the second pull-back, held — the same shape as the winning one
 *   5.75  RELEASE — THE MISTAKE
 *   6.0   the blue blade shatters on contact instead of killing
 *   6.35  `poster` — the wreckage, where it reads
 *   6.4   the second blue goes with it
 *   6.9   the last blue is gone: DEFEAT
 *   7.2   the board wipes; the retry's meteor shower fills the arena
 *  10.0   the retry is live and spinning
 *
 * ── WHY THE LOSS IS NEAR, NOT WIDE ──
 *
 * A wipe the player was never in reads as "this game is unfair" and converts
 * nothing. The measured shape that works: the player wins the first exchange
 * outright (enemy 0 authored to 7%, dies on first contact), and only THEN is
 * the blue line authored to the brink. What kills them is their own launch —
 * at 5% HP any contact is fatal to both sides, so the over-committed dive
 * shatters the attacker. That is a mistake a viewer can name, which is the
 * whole job of a fail clip.
 *
 * Probed end-to-end: player launches at 5% → first blue dies at +237 ms, the
 * second at +625 ms, the reds answer at +1168 ms, defeat at +1492 ms.
 */

import * as g from './_drive.mjs'

/** The same arena as the success clip, deliberately: a portal A/B is
 *  comparing the STORY, and changing the floor underneath it changes what is
 *  being measured. */
const STAGE = 17
const SEED = 2024

export default {
  id: 'fail',
  label: 'A blade up, and thrown away',

  async setup(ctx) {
    await g.boot(ctx, { save: g.saveFixture(), seed: SEED, stage: STAGE })

    // THE SAME OPENING POSITION AS THE SUCCESS CLIP — two blue against three
    // red, one red already hurt. That is deliberate and it is the most useful
    // property of the pair: a portal A/B is measuring the STORY, and starting
    // both clips from the identical board makes the comparison about the
    // ending rather than about which one was dealt a better hand.
    await g.stageHp(ctx, { player: [1, 0, 1], npc: [0.07, 1, 1] })

    // Load the opening shot so frame 0 is a drawn slingshot, not a board.
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

    // ── 0.0-4.55  the exchange the player WINS ──
    // `settleMs` is the measured cycle back to `player_turn` (see the success
    // sheet): fire → +0.5 s contact → +2.0 s their turn → +3.75 s ours.
    if (
      !(await g.shoot(ctx, t, {
        preAimed: true,
        aimMs: 500,
        settleMs: 3750,
        beat: 'first-blood'
      }))
    ) {
      return
    }

    // ── 4.55-7.2  THE MISTAKE ──
    // `author` drops the blue line to 5%, applied only once the board is at
    // rest and it is our turn — authoring mid-flight would let the blades
    // already in motion end the match early (see `author` in _drive.mjs).
    //
    // 5% is not a nerf of the enemy's damage: at that level ANY contact is
    // fatal to BOTH sides, which is exactly why the dive below shatters the
    // attacker instead of the target. Full power straight into the surviving
    // enemy line — the same shape as the winning shot in the success clip,
    // and here it is the losing one.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [0.03, 0.03] },
        aimMs: 700,
        settleMs: 700,
        hero: 600,
        beat: 'mistake'
      }))
    ) {
      return
    }

    // The wipe is the player's OWN doing and needs no enemy turn: at 3% the
    // launched blade shatters on first contact (~250 ms) and the one it
    // knocks into goes ~400 ms later, so the defeat lands inside a second.
    //
    // That is why this clip opens two blue rather than three. An earlier cut
    // fought 3v3 and the dive killed only two — the third blue was finished
    // by the enemy's ANSWERING turn, ~3 s later, which pushed the verdict to
    // 9 s and left no room for the retry. Two blue is the version that fits
    // in ten seconds.
    const verdict = await g.awaitVerdict(ctx, t, { maxMs: 1800 })
    ctx.beat('verdict')
    ctx.log.info(`after the punish: ${verdict.result} — ${JSON.stringify(verdict.alive)}`)

    // ── the beat of defeat ──
    // A beat of an arena holding nothing but red. There is no ceremony to cut
    // to, and that absence IS the loss — but it has to be allowed to land
    // before the retry wipes it away. Kept SHORT: an emptied arena is the one
    // shot in either clip with nothing happening in it, and an earlier cut
    // held it for 1.9 s, which is dead air by any measure.
    if (!(await t.wait(700))) return

    // ── straight into the retry ──
    // A loss has NO ceremony in a clean feed — no shower, no result screen,
    // nothing but the last blue blade ceasing to exist. Without this the clip
    // ends on a held frame of an arena with three red blades idling in it.
    // The retry is both the motion and the invitation.
    await g.playAgain(ctx, { seed: SEED + 1 })
    ctx.beat('retry')
    await t.wait(t.left)
  }
}
