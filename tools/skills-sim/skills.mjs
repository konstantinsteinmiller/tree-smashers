// FINAL skill tables (L1..L10), explicit so the doc and the sim share one
// source. Percentages are fractions. Tuned so every skill's worst measured
// stage at L10 sits at ~1.20x power; see skills-feature.md §3.
const zip = (obj) => Array.from({ length: 10 }, (_, i) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? v[i] : v])))

export const SKILL_DEFS = {
  guard_shell: { tag: 'DEF', levels: zip({ shield: [0.05, 0.06, 0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.15, 0.16] }) },
  phase_step: {
    tag: 'DEF', levels: zip({
      chance: [0.035, 0.04, 0.045, 0.05, 0.06, 0.065, 0.07, 0.08, 0.09, 0.10],
      cooldownMs: [4000, 3800, 3700, 3500, 3300, 3200, 3000, 2800, 2700, 2500]
    })
  },
  mirror_plate: {
    tag: 'DEF',
    levels: zip({ chance: [0.05, 0.06, 0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.15, 0.16], share: 0.5 })
  },
  second_wind: {
    tag: 'SUS',
    levels: zip({ threshold: 0.35, heal: [0.06, 0.07, 0.09, 0.10, 0.11, 0.13, 0.14, 0.15, 0.17, 0.18] })
  },
  lucky_edge: {
    tag: 'OFF', levels: zip({
      chance: [0.07, 0.08, 0.08, 0.09, 0.10, 0.10, 0.11, 0.12, 0.12, 0.13],
      mult: [1.50, 1.55, 1.60, 1.65, 1.70, 1.80, 1.85, 1.90, 1.95, 2.00]
    })
  },
  momentum: {
    tag: 'OFF',
    levels: zip({ perStack: [0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.07, 0.075], maxStacks: 3 })
  },
  homing_rockets: {
    tag: 'OFF', levels: zip({
      everyN: [7, 7, 7, 6, 6, 6, 6, 5, 5, 5],
      frac: [0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.14, 0.15, 0.16, 0.17], maxTargets: 3
    })
  },
  opening_salvo: { tag: 'OFF', levels: zip({ pct: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14] }) },
  static_charge: { tag: 'CTL', levels: zip({ chance: [0.07, 0.08, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.17, 0.18] }) },
  hazard_ward: {
    tag: 'UTL', levels: zip({
      lava: [0.15, 0.18, 0.21, 0.24, 0.27, 0.30, 0.33, 0.36, 0.38, 0.40],
      thunder: [0.15, 0.18, 0.21, 0.24, 0.27, 0.30, 0.33, 0.36, 0.38, 0.40],
      chip: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.14, 0.15],
      shockKeep: [0.02, 0.03, 0.04, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]
    })
  }
}
export const SKILL_IDS = Object.keys(SKILL_DEFS)
