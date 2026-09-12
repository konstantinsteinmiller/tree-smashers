/**
 * ─── SUCCESS (30 s): "a whole campaign run in miniature" ────────────────────
 *
 * NOT the 10 s clip stretched. Five exchanges across TWO arenas, with an
 * escalation a viewer can see: the player is pushed to one blade, claws back,
 * and the clip ends on a fresh stage rather than on the win.
 *
 * WHAT THE VIEWER SEES — with NO interface
 *
 * A lava pit, three red blades against three blue. The first exchanges go
 * badly: the reds take a blue blade, then another, and the arena is two-on-one
 * against a single surviving blue. It holds, trades, and starts taking them
 * back — and then the cascade: one launch through the last of the red line and
 * the arena is blue. The victory shower fills the pit, the board wipes, and
 * the next stage opens on ICE, a different floor entirely, with a fresh fight
 * already in motion as the clip ends.
 *
 * BEAT SHEET  (30 s @ 30 fps = 900 frames; seconds into `record`)
 *
 *   0.0    ALREADY LOADED — frame 0 is a drawn slingshot
 *   0.6    exchange 1: the player trades into the red line — a red shatters
 *   5.5    exchange 2: the reds answer and take a blue blade
 *   9.9    exchange 3: THE LOW POINT — a second blue goes; one left, two reds
 *  15.3    exchange 4: it takes one back — two-on-one becomes one-on-one
 *  22.0    exchange 5: THE PAYOFF — the last red goes; the arena is blue
 *  22.9    `poster` — past the flash, where the wreckage reads
 *  23.5    the victory shower
 *  25.0    the board wipes into stage 18 — an ICE arena
 *  30.0    the new fight is live and spinning
 *
 * ── WHY THE SECOND ARENA IS FREE ──
 *
 * A campaign win calls `advanceStage`, so the restart at 26 s rebuilds on
 * stage 18 rather than 17 — and stage 18 is an ICE floor, not lava. Nothing
 * here asks for that; it falls out of the game's own progression. It is worth
 * knowing about because it is the single best thing in the clip: thirty
 * seconds that show only one arena look like a game with one arena.
 *
 * ── THE ARITHMETIC ──
 *
 * The HP each exchange is fought with is authored (see `_drive.mjs`); the
 * collisions, damage and verdict are the real simulation. The shape:
 *
 *   ex 1   blue 3 v red 3 → 3 v 2   the opening trade establishes the game
 *   ex 2   blue 3 v red 2 → 2 v 2   a blue authored to 4% dies to the answer
 *   ex 3   blue 2 v red 2 → 1 v 2   a second blue goes: THE LOW POINT
 *   ex 4   blue 1 v red 2 → 1 v 1   the survivor takes one back (red to 5%)
 *   ex 5   blue 1 v red 1 → 1 v 0   the kill (last red to 5%) → WIN
 */

import * as g from './_drive.mjs'

const STAGE = 17
const SEED = 1337

export default {
  id: 'success-30s',
  label: 'Pushed to one blade, then the comeback',

  async setup(ctx) {
    await g.boot(ctx, { save: g.saveFixture(), seed: SEED, stage: STAGE })

    // A full, even board. Thirty seconds has room to EARN the deficit that
    // the 10 s clip has to start from.
    await g.stageHp(ctx, { player: [1, 1, 1], npc: [2.5, 2.5, 2.5] })
    await ctx.evaluate(() => window.__chaos.aimAtBlade(0, 'npc', 0, 1))

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
    // A blade at ~0.05 reliably dies on first contact. But 1.0 is NOT enough
    // to survive: this player team one-shots a full-HP stage-17 enemy, so a
    // red line pinned to 1 loses a blade every single exchange and the match
    // is over in three. Hence 2.5 — `setHp` takes fractions above 1 and the
    // rings are hidden, so a blade that has to still be standing at the
    // payoff is simply overcharged until it is. Exactly ONE fragile entry per
    // exchange; everything else at 2.5.

    // ── 0.0-5.5  establish: an even trade ──
    if (!(await g.shoot(ctx, t, { preAimed: true, aimMs: 600, settleMs: 4200, beat: 'ex1' }))) return
    // (ex1 needs no `author`: setup already pinned the even board, and a
    //  board of full-HP blades cannot lose one in a single exchange.)

    // ── 5.5-10.5  the reds take a blue blade ──
    // Authored to 4%: the blue that launches into the red line does not come
    // back. The player is now behind, and it happened in front of the viewer
    // rather than before the clip started.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [0.04, 1, 1], npc: [2.5, 2.5, 2.5] },
        aimMs: 700,
        settleMs: 3600,
        beat: 'ex2-lose-a-blade'
      }))
    ) {
      return
    }

    // ── 10.5-15.0  THE LOW POINT: a second blue goes ──
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 1,
        power: 1,
        author: { player: [0.04, 1], npc: [2.5, 2.5, 2.5] },
        aimMs: 700,
        settleMs: 3200,
        beat: 'ex3-low-point'
      }))
    ) {
      return
    }
    ctx.log.info(`low point: ${JSON.stringify((await g.snapshot(ctx)).alive)}`)

    // ── the survivor takes one back: 1 v 2 becomes 1 v 1 ──
    // Also a PACING decision, not only a story one. The enemy takes one turn
    // per living blade, so every exchange fought at 1 v 2 costs roughly twice
    // the clock of one fought at 1 v 1 — an earlier cut held this beat at
    // 1 v 2 and ran out of clip before the payoff.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [2.5], npc: [0.05, 2.5] },
        aimMs: 700,
        settleMs: 2800,
        beat: 'ex4-one-back'
      }))
    ) {
      return
    }

    // ── THE PAYOFF ──
    //
    // FIVE exchanges, not six. Six was written first and measured at ~33 s of
    // clip: the enemy takes one turn per living blade, so the cycle runs ~4.5 s
    // at 3 v 3, ~6.7 s while the board is 1 v 2, and ~4.7 s at 1 v 1. Six
    // exchanges pushed the verdict to 28.9 s and left 0.1 s for the ending —
    // the clip lost its whole last beat to one exchange too many.
    //
    // This is the number to re-derive if the stage or the team changes: count
    // the cycles, do not assume the 10 s sheet's pacing scales.
    if (
      !(await g.shoot(ctx, t, {
        blade: 0,
        target: 0,
        power: 1,
        author: { player: [2.5], npc: [0.05] },
        aimMs: 700,
        settleMs: 700,
        hero: 900,
        beat: 'ex5-cascade'
      }))
    ) {
      return
    }

    const verdict = await g.awaitVerdict(ctx, t, { maxMs: 2200 })
    ctx.beat('verdict')
    ctx.log.info(`verdict: ${verdict.result} — ${JSON.stringify(verdict.alive)}`)

    // ── the victory shower ──
    if (!(await t.wait(800))) return

    // ── the next stage: a DIFFERENT arena (see the header) ──
    await g.playAgain(ctx, { seed: SEED + 1 })
    ctx.beat('next-stage')
    await t.wait(t.left)
  }
}
