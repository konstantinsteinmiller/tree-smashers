/**
 * ─── REEL scene 1 — FIRE ARENA: burn + destroy ──────────────────────────────
 *
 * Stage 17 (lava floor, three reds). One blue shot: it shatters a weakened red
 * on contact (the DESTROY explosion), carries on into the lava wall and comes
 * off it wreathed in the painted flame-burn (the BURN), while the red it
 * glanced is knocked into the rim and catches fire too.
 *
 *   0.00  drawn slingshot (frame 0)      0.35  release
 *   ~0.6  first red shatters             ~0.9+ lava-wall contacts → flame burns
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'lava',
  label: 'Fire arena — burn and destroy',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 17,
      seed: 1337,
      // Red 0 dies on contact (explosion); the others are overcharged so the
      // lava rim burns them instead of killing them (a lethal touch skips the
      // burn — the explosion owns that moment).
      hp: { player: [3, 3, 3], npc: [0.04, 3, 3] },
      place: [
        { side: 'player', index: 0, x: -95, y: 120 },
        { side: 'player', index: 1, x: 40, y: 150 },
        { side: 'player', index: 2, x: 120, y: 95 },
        { side: 'npc', index: 0, x: -30, y: 5 },
        { side: 'npc', index: 1, x: 70, y: -120 },
        { side: 'npc', index: 2, x: -120, y: -95 }
      ],
      aim: { blade: 0, target: 0, power: 1 }
    })
  },

  async record(ctx) {
    await playScene(ctx, { holdMs: 350, expect: { kills: 1, burns: 1 }, posterMs: 700 })
  }
}
