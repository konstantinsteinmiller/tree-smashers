/**
 * ─── FAIL (30 s): "ahead the whole way, and lost it" ────────────────────────
 *
 * NOT the 10 s clip stretched. Five exchanges of the player CONFIDENTLY winning
 * — the lead is real and it is built in front of the viewer — and then a
 * collapse in the last eight seconds. The longer the clip spends ahead, the
 * more the ending reads as a mistake rather than as a difficulty wall, and
 * that is the read a fail clip is buying.
 *
 * WHAT THE VIEWER SEES — with NO interface
 *
 * The lava pit, three on three. The blue line takes a red blade apart, then
 * another, and for fifteen seconds it is a rout: two blue against one red,
 * the arena mostly blue. Then the last red will not die. It takes a blue with
 * it. The second blue over-commits chasing the finish, shatters on the way in,
 * and the arena is red. The retry is spinning up before the clip ends.
 *
 * BEAT SHEET  (30 s @ 30 fps = 900 frames; seconds into `record`)
 *
 *   0.0    ALREADY LOADED — frame 0 is a drawn slingshot
 *   0.6    exchange 1: first blood, a red shatters. 3 v 2
 *   5.5    exchange 2: a second red goes. 3 v 1 — this looks finished
 *  11.5    exchange 3: the last red survives a clean hit
 *  17.0    exchange 4: it takes a blue blade with it. 2 v 1
 *  22.5    exchange 5: THE MISTAKE — the over-commit, both blue shatter
 *  23.2    `poster` — the wreckage
 *  24.0    DEFEAT: the arena holds one red blade and nothing else
 *  25.0    the board wipes; the retry's meteor shower
 *  30.0    the retry is live and spinning
 *
 * (Times are the LANDSCAPE run, which is the slower of the two.)
 *
 * ── WHY THE COLLAPSE IS THE PLAYER'S FAULT ──
 *
 * At 3% HP any contact is fatal to BOTH sides, so the final over-committed
 * dive shatters the attacker rather than the target. The viewer sees a player
 * who was three-on-one and kept diving. That is nameable, which is what makes
 * it a clip somebody replays rather than a clip that says the game is unfair.
 *
 * The player is never given an unwinnable board: at exchange 5 they are still
 * 2 v 1 and ahead on the arena. Everything after that is the dive.
 */

import * as g from './_drive.mjs'

const STAGE = 17
const SEED = 2024

export default {
  id: 'fail-30s',
  label: 'Three-on-one, and thrown away',

  async setup(ctx) {
    await g.boot(ctx, { save: g.saveFixture(), seed: SEED, stage: STAGE })

    // An even board with one red already softened, so exchange 1 lands.
    await g.stageHp(ctx, { player: [2.5, 2.5, 2.5], npc: [0.06, 2.5, 2.5] })
    await ctx.evaluate(() => window.__smashers.aimAtBlade(0, 'npc', 0, 1))

    const s = await g.snapshot(ctx)
    ctx.log.info(`staged stage ${s.stage}: ${s.alive.player} blue vs ${s.alive.npc} red${ctx.clean ? ' (clean feed)' : ''}`)
  },

  async record(ctx) {
    const t = g.budget(ctx)
    await g.unfreeze(ctx)
    ctx.beat('open')

    // ── AUTHORING RULE, learned the expensive way ──
    //
    // Every exchange authors the WHOLE board, not just the blade that is
    // meant to die. A first cut authored only the victim and left everything
    // else at whatever the fight had left it on — and collateral did the
    // rest: exchange 3 of the fail sheet killed BOTH remaining reds instead
    // of one, the match ended in a win 10 s into a clip whose entire job is
    // to lose, and the only symptom was a warning about a missing turn.
    //
    // A blade at ~0.05 reliably dies on first contact. 1.0 is NOT enough to
    // survive one — this player team one-shots a full-HP stage-17 enemy — so
    // everything that must still be standing is overcharged to 2.5 (`setHp`
    // takes fractions above 1; the rings are hidden). Exactly ONE fragile
    // entry per exchange, and the beat sheet says what dies and when.
    //
    // Before the overcharge, exchange 1 cost the player a blade it was never
    // meant to lose and the clip's "three-on-one" lead was really two-on-one.

    // ── 0.0-5.0  first blood ──
    if (!(await g.shoot(ctx, t, { preAimed: true, aimMs: 600, settleMs: 3800, beat: 'ex1-first-blood' }))) return

    // ── a second red goes: 3 v 1, and this looks finished ──
    //
    // FIVE exchanges, not six. A sixth — a "press" beat between this and the
    // opening, in which nothing died — fit in portrait and did NOT fit in
    // landscape: the beats ran ~2.7 s later there and the clip ended at
    // `ex6-mistake@29.3s` with no verdict and no retry, i.e. a fail clip that
    // never shows the fail.
    //
    // The orientations genuinely differ in pace even though the arena scales
    // to `min(w, h)` in both: the VISIBLE EXTENTS either side of the arena do
    // not, and they feed wall-proximity and the NPC's aim, so blades bounce
    // and settle differently. Budget the slower orientation, not the one you
    // happened to draft against.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [2.5, 2.5, 2.5], npc: [0.05, 2.5] },
        aimMs: 700,
        settleMs: 3200,
        beat: 'ex2-rout'
      }))
    ) {
      return
    }
    ctx.log.info(`the rout: ${JSON.stringify((await g.snapshot(ctx)).alive)}`)

    // ── 14.0-18.0  the last red survives a clean hit ──
    // Pinned back to FULL: the shot connects and the blade holds anyway. This
    // is the beat that turns the clip — everything before it said "finished".
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [2.5, 2.5, 2.5], npc: [2.5] },
        aimMs: 700,
        settleMs: 3000,
        beat: 'ex3-it-holds'
      }))
    ) {
      return
    }

    // ── 18.0-22.0  it takes a blue blade with it ──
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [0.04, 2.5, 2.5], npc: [2.5] },
        aimMs: 700,
        settleMs: 2800,
        beat: 'ex4-first-loss'
      }))
    ) {
      return
    }

    // ── 22.0-24.5  THE MISTAKE ──
    // Both survivors to 3%: the dive shatters the attacker and the blade it
    // knocks into, and the arena is red.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [0.03, 0.03], npc: [2.5] },
        aimMs: 700,
        settleMs: 700,
        hero: 700,
        beat: 'ex5-mistake'
      }))
    ) {
      return
    }

    const verdict = await g.awaitVerdict(ctx, t, { maxMs: 2000 })
    ctx.beat('verdict')
    ctx.log.info(`verdict: ${verdict.result} — ${JSON.stringify(verdict.alive)}`)

    // ── the beat of defeat, kept short (see the 10 s sheet) ──
    if (!(await t.wait(700))) return

    await g.playAgain(ctx, { seed: SEED + 1 })
    ctx.beat('retry')
    await t.wait(t.left)
  }
}
