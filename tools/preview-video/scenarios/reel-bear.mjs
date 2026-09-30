/**
 * ─── REEL scene 4 — BOSS: THE BEAR MOTHER splits ────────────────────────────
 *
 * Stage 10, the campaign's first ability boss (`bear` skin, bossAbility
 * 'split'). Her signature: when she dies she shatters into five mini blades
 * that burst outward, blinking while their spawn invulnerability lasts.
 * Staged so the first blue hit is the killing blow — she is centre-frame and
 * the swarm has the whole arena to spread into.
 *
 *   0.00  drawn slingshot      0.35  release      ~0.6  the kill → 5 cubs burst out
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'bear',
  label: 'Boss — the Bear Mother splits',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 10,
      seed: 1337,
      hp: { player: [3, 3, 3], npc: [0.02] },
      place: [
        { side: 'player', index: 0, x: 0, y: 140 },
        { side: 'player', index: 1, x: -120, y: 110 },
        { side: 'player', index: 2, x: 120, y: 110 },
        { side: 'npc', index: 0, x: 0, y: -45 }
      ],
      aim: { blade: 0, target: 0, power: 1 }
    })
  },

  async record(ctx) {
    await playScene(ctx, { holdMs: 350, expect: { spawned: 5 }, posterMs: 700 })
  }
}
