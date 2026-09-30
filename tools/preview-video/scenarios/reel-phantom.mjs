/**
 * ─── REEL scene 5 (alternative) — BOSS: THE PHANTOM TWIN phases ─────────────
 *
 * Stage 15 (`snake` skin, bossAbility 'ghost'). The signature: on its first
 * launch the translucent boss PHASES into two linked halves that charge side
 * by side and share one health pool. That happens on the ENEMY's turn, so:
 *
 *   setup   a feather-light blue shot resolves in unrecorded time, and the
 *           game freezes on the first tick of `npc_turn` (`freezeOnPhase`)
 *   record  the boss "thinks" for the game's own 500 ms, launches, and splits
 *
 *   0.00  boss poised     ~0.5  launch → the twin phases out beside it
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'phantom',
  label: 'Boss — the Phantom Twin phases',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 15,
      seed: 1337,
      hp: { player: [3, 3, 3], npc: [3] },
      place: [
        { side: 'player', index: 0, x: -130, y: 90 },
        { side: 'player', index: 1, x: 0, y: 150 },
        { side: 'player', index: 2, x: 130, y: 90 },
        { side: 'npc', index: 0, x: 0, y: -70 }
      ],
      // A soft shot from the left blade into its own corner of the rim — it just has to end the
      // player's turn and stay out of the boss's way. Not softer than ~0.25:
      // a pull that ends inside the blade's own radius is the game's CANCEL
      // gesture, the turn never ends, and setup would wait forever.
      aim: { blade: 0, angle: (3 * Math.PI) / 4, power: 0.35 }
    })
    const phase = await ctx.evaluate(() => {
      const c = window.__chaos
      const frozen = c.freezeOnPhase('npc_turn')
      c.fire()
      c.unfreeze()
      return Promise.race([frozen, new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 15_000))])
    })
    if (phase === 'TIMEOUT') throw new Error('reel-phantom: the player turn never ended — npc_turn was not reached')
    ctx.log.info(`frozen on ${phase}`)
  },

  async record(ctx) {
    await playScene(ctx, { fire: false, expect: { spawned: 1 }, posterMs: 900 })
  }
}
