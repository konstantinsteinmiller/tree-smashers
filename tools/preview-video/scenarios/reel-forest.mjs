/**
 * ─── REEL scene 2 — HEAL ARENA ──────────────────────────────────────────────
 *
 * Stage 9 (forest floor). Every blade starts WOUNDED (the forest rim only
 * heals a blade below max HP, and the pulse only plays when HP actually went
 * up), so each wall contact in the clip throws the green heal pulse with its
 * rising crosses. One blue shot drives a red into the rim; both bounce around
 * the edge and light it up.
 *
 *   0.00  drawn slingshot       0.35  release       ~0.8+  rim contacts → heals
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'forest',
  label: 'Heal arena — heal pulses',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 9,
      seed: 1337,
      // Blues just below full so every rim contact heals (and pulses) — at
      // 0.4 two of them died in the scene and the explosions stole it; reds
      // overcharged so the heal scene does not turn into a kill scene — a
      // first draft at 0.45 lost both reds to explosions inside a second.
      hp: { player: [0.9, 0.9, 0.9], npc: [3, 3, 3] },
      place: [
        { side: 'player', index: 0, x: -70, y: 125 },
        { side: 'player', index: 1, x: 60, y: 150 },
        { side: 'player', index: 2, x: 135, y: 70 },
        { side: 'npc', index: 0, x: 95, y: -110 },
        { side: 'npc', index: 1, x: -115, y: -60 }
      ],
      aim: { blade: 0, target: 0, power: 1 }
    })
  },

  async record(ctx) {
    await playScene(ctx, { holdMs: 350, expect: { heals: 2 }, posterMs: 900 })
  }
}
