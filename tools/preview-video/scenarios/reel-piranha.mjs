/**
 * ─── REEL scene 5 — BOSS: THE PIRANHA ───────────────────────────────────────
 *
 * Stage 35 "The Ravenous Swarm" — the campaign's piranha boss (`piranha`
 * skin, bossAbility 'split'). The game has no separate "phase" ability for
 * the piranha: its signature is the same split-on-death as the Bear Mother's,
 * and what reads as "phasing" is the swarm itself — five minis that pass
 * through one another and blink while invulnerable. Shot from the left
 * diagonal so it does not frame like the bear scene.
 *
 * `reel-phantom.mjs` is the alternative for this slot: the Phantom Twin's
 * ghost PHASE (one blade becomes two translucent halves on launch).
 *
 *   0.00  drawn slingshot      0.35  release      ~0.6  the kill → the swarm bursts
 */
import { stageScene, playScene } from './_reel.mjs'

export default {
  id: 'piranha',
  label: 'Boss — the Piranha swarm',

  async setup(ctx) {
    await stageScene(ctx, {
      stage: 35,
      seed: 1337,
      hp: { player: [3, 3, 3], npc: [0.01] },
      place: [
        { side: 'player', index: 0, x: -120, y: 110 },
        { side: 'player', index: 1, x: 30, y: 150 },
        { side: 'player', index: 2, x: 140, y: 60 },
        { side: 'npc', index: 0, x: 25, y: -35 }
      ],
      aim: { blade: 0, target: 0, power: 1 }
    })
  },

  async record(ctx) {
    await playScene(ctx, { holdMs: 350, expect: { spawned: 5 }, posterMs: 700 })
  }
}
