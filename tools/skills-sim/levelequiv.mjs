// How many part levels is a skill loadout worth? (skills-feature.md §9.1, PvP fairness)
// PI of "all 4 parts +k levels, no skills" vs the no-skill baseline, same seeds.
//   node levelequiv.mjs [stages=16,30,50,80] [n=600]
import { runBattle, teamFor } from './engine.mjs'
import { econLevel } from './econ.mjs'

const stages = (process.argv[2] ?? '16,30,50,80').split(',').map(Number)
const n = Number(process.argv[3] ?? 600)
for (const st of stages) {
  const L = econLevel(st)
  const measure = (lvl) => {
    const team = teamFor('default', st, lvl)
    let k = 0, d = 0
    for (let i = 0; i < n; i++) {
      const b = { stageId: st, team, seed: st * 1000003 + i * 7919, playerStarts: i % 2 === 0 }
      k += runBattle({ ...b, mode: 'playerImmortal' }).turns
      d += runBattle({ ...b, mode: 'enemyImmortal' }).turns
    }
    return [k / n, d / n]
  }
  const [k0, d0] = measure(L)
  const row = [2, 4, 6, 8].map((dk) => {
    const [k, d] = measure(L + dk)
    return `+${dk}: ${((k0 / k) * (d / d0)).toFixed(2)}`
  })
  console.log(`S${st} (part level ${L}) ${row.join('  ')}`)
}
