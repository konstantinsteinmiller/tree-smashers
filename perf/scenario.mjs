// Scenario seeding for the perf harness.
//
// Writes save keys BEFORE any app code runs, so a rep can start in a heavy
// mid-campaign fight instead of the 2v2 stage-1 tutorial. Stage 1 is the
// LIGHTEST thing the renderer ever draws (no bouncers, no special-skin auras,
// two blades a side) — measuring only there hides most of the frame cost.
//
// Reference stages:
//   1   tutorial            — 2v2, default arena, no bouncers   (lightest)
//   46  tornado + shock     — tornado aura, 2 bouncers
//   48  ice + 3 bouncers    — 3 NPC blades, 3 bouncers
//   91  3 bouncers, 3 NPCs  — late-campaign roster              (heaviest)

export const seedScript = (stage) => {
  if (!stage || stage <= 1) return null
  const upgrades = JSON.stringify({
    tops: { star: 12, triangle: 12, round: 12, quadratic: 12, cushioned: 12, piercer: 12 },
    bottoms: { speedy: 12, tanky: 12, balanced: 12 }
  })
  // Stringified so it can be passed through addInitScript as one argument.
  return `(() => {
    try {
      localStorage.setItem('spinner_campaign_stage', '${stage}')
      localStorage.setItem('spinner_upgrades', ${JSON.stringify(upgrades)})
      localStorage.setItem('spinner_coins', '99999')
      // Suppress the first-play boost + intro so every rep opens on the same
      // steady-state fight rather than a one-off tutorial sequence.
      localStorage.setItem('spinner_first_win', 'true')
    } catch (e) { console.warn('[perf seed]', e) }
  })()`
}
