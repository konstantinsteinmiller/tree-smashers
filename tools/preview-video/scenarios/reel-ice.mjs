/**
 * ─── REEL scene 3 — ICE ARENA ───────────────────────────────────────────────
 *
 * Stage 13 (ice floor: frost rim, pale-blue neon, and 65 % less friction).
 * The ice's signature is the GLIDE — a hit sends both blades skating across
 * the whole rink and off the rim where any other floor would have stopped
 * them. One full-power blue shot into a red, then the long slide.
 *
 *   0.00  drawn slingshot      0.35  release      ~0.6  contact, then the glide
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'ice',
  label: 'Ice arena — the glide',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 13,
      seed: 1337,
      // Overcharged so nothing dies: this scene is about motion, not a kill.
      hp: { player: [3, 3, 3], npc: [3, 3] },
      place: [
        { side: 'player', index: 0, x: 60, y: 135 },
        { side: 'player', index: 1, x: -60, y: 150 },
        { side: 'player', index: 2, x: -140, y: 60 },
        { side: 'npc', index: 0, x: 15, y: -20 },
        { side: 'npc', index: 1, x: -80, y: -120 }
      ],
      aim: { blade: 0, target: 0, power: 1 }
    })
  },

  async record(ctx) {
    await playScene(ctx, { holdMs: 350, posterMs: 800 })
  }
}
