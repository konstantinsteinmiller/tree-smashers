// When can a player max skills? Walks the campaign stage by stage with the
// income model from econ.mjs and spends a fixed share of every coin earned
// after the unlock on skill upgrades.
import { PROFILES, incomeAtStage, bpCoinsBy, cumIncome } from './econ.mjs'
import { CATALOG_SKILL_COST } from './skills.mjs'

// SKILL_COST[L] = price of level L+1: [buy L1, L1→2, …, L9→10] (skills-feature.md §6.1).
// Read from src/data/skillCatalog.ts (single source); env SKILL_COST=150,100,…
// tries another price curve without touching the game.
export const SKILL_COST = process.env.SKILL_COST ? process.env.SKILL_COST.split(',').map(Number) : [...CATALOG_SKILL_COST]
export const UPGRADE_COST = SKILL_COST.slice(1)
export const PER_SKILL = SKILL_COST.reduce((a, b) => a + b, 0)
// unlock order (boss stage whose win lets the player BUY level 1) — skills-feature.md §6.2
export const DROPS = [
  ['mirror_plate', 10], ['phase_step', 15], ['guard_shell', 20], ['second_wind', 25], ['lucky_edge', 30],
  ['homing_rockets', 35], ['opening_salvo', 40], ['momentum', 45], ['hazard_ward', 50], ['static_charge', 55]
]

export const simulateShares = (profile, share) => {
  const lv = {}
  let wallet = 0
  const res = {}
  let prevBp = 0
  for (let s = 10; s <= 200; s++) {
    const bp = bpCoinsBy(s, profile)
    wallet += share * (incomeAtStage(s, profile) + (bp - prevBp))
    prevBp = bp
    for (const [id, st] of DROPS) if (st === s) lv[id] = 0 // cleared boss → may buy L1 from s+1
    // focus policy: owned skills in drop order, finish one before starting the next
    let bought = true
    while (bought) {
      bought = false
      for (const [id] of DROPS) {
        if (!(id in lv) || lv[id] >= 10) continue
        const c = SKILL_COST[lv[id]]
        if (wallet >= c) {
          wallet -= c
          lv[id]++
          bought = true
        }
        break
      }
    }
    const maxed = DROPS.filter(([id]) => lv[id] === 10).length
    if (maxed >= 2 && !res.two) res.two = s
    if (maxed >= 4 && !res.four) res.four = s
    if (maxed >= 10 && !res.all) {
      res.all = s
      break
    }
  }
  return res
}

if (process.argv[1].endsWith('skillecon.mjs')) {
  console.log('per skill (buy L1 + upgrades to L10):', PER_SKILL, ' all 10:', PER_SKILL * 10)
  for (const [name, p] of Object.entries(PROFILES)) {
    const inc = cumIncome(80, p) - cumIncome(9, p)
    console.log(`${name}: income stage 10→80 = ${inc.toFixed(0)}; all-10 cost = ${(100 * PER_SKILL * 10 / inc).toFixed(0)}% of it`)
    for (const share of [0.25, 0.3, 0.35, 0.4, 0.5]) {
      const r = simulateShares(p, share)
      console.log(`  share ${share * 100}% → 2 maxed @ stage ${r.two}, 4 maxed @ ${r.four}, all 10 @ ${r.all ?? '>200'}`)
    }
  }
}
