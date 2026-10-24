// Scenario seeding for the perf harness.
//
// Writes save keys BEFORE any app code runs, so a rep can start in a heavy
// mid-campaign fight instead of the 2v2 stage-1 tutorial. Stage 1 is the
// LIGHTEST thing the renderer ever draws (no special-skin auras,
// two blades a side) — measuring only there hides most of the frame cost.
//
// Reference stages:
//   1   tutorial            — 2v2, default arena                (lightest)
//   46  tornado + shock     — tornado aura
//   48  ice                 — 3 NPC blades
//   91  3 NPCs              — late-campaign roster              (heaviest)
// (Stages 46 / 48 / 91 also carried 2–3 pinball bumpers until 2026-10-20;
// the bumpers are gone — older PERF-LEDGER rows were measured with them.)
//
// Any seeded stage also marks the intro cutscene, the league unlock popup and
// the skills intros as seen, so no dialog covers the arena while measuring.

export const seedScript = (stage) => {
  if (!stage || stage <= 1) return null
  const upgrades = JSON.stringify({
    tops: { star: 12, triangle: 12, round: 12, quadratic: 12, cushioned: 12, piercer: 12 },
    bottoms: { speedy: 12, tanky: 12, balanced: 12 }
  })
  // Stringified so it can be passed through addInitScript as one argument.
  return `(() => {
    try {
      localStorage.setItem('smashers_campaign_stage', '${stage}')
      localStorage.setItem('smashers_upgrades', ${JSON.stringify(upgrades)})
      localStorage.setItem('smashers_coins', '99999')
      // Suppress the first-play boost + intro so every rep opens on the same
      // steady-state fight rather than a one-off tutorial sequence.
      localStorage.setItem('smashers_first_win', 'true')
      localStorage.setItem('smashers_intro_seen', '1')
      // Past the league unlock stage (13) a "League unlocked!" popup — and the
      // skills intro / slot-2 reveal — open over the arena, and a rep then
      // measures a static dialog instead of the fight. Mark them all as seen.
      localStorage.setItem('smashers_league', JSON.stringify({
        v: 1, unlocked: true, unlockSeen: true, claimedSeason: -1, unclaimed: null
      }))
      localStorage.setItem('smashers_skill_ui', JSON.stringify({
        v: 1, seen: ${JSON.stringify(SKILL_IDS)}, intro: true, slot2Seen: true, filled: 2
      }))
    } catch (e) { console.warn('[perf seed]', e) }
  })()`
}

// Mirrors src/skills/skillIds.ts (kept literal: this runs in plain Node).
const SKILL_IDS = [
  'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets',
  'opening_salvo', 'momentum', 'hazard_ward', 'static_charge', 'mirror_plate'
]

/** Pins the quality tier for the whole rep. `?quality=` alone only sets the
 *  preference for this load; the stored pref + verdict make sure the auto
 *  detector can never flip the tier mid-rep (at 8x CPU it otherwise does, and
 *  reps come out bimodal). */
export const qualityScript = (tier) => {
  if (tier !== 'high' && tier !== 'low') return null
  return `(() => {
    try {
      localStorage.setItem('treesmashers_quality_pref', '${tier}')
      localStorage.setItem('treesmashers_quality_verdict', '${tier}')
    } catch (e) { console.warn('[perf quality]', e) }
  })()`
}
