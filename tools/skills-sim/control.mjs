// Control: how much does a PLAIN +x% stat buff (no skills) move PI on a stage/build?
import { runBattle, teamFor } from './engine.mjs'
import { econLevel } from './econ.mjs'

const [team, st, n] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4] ?? 1500)]
const lvl = econLevel(st)
const t = teamFor(team, st, lvl)
const run = (buff) => {
  let k = 0, d = 0
  for (let i = 0; i < n; i++) {
    const b = { stageId: st, team: t, seed: st * 7777777 + i * 104729, playerStarts: i % 2 === 0, playerBuff: buff }
    k += runBattle({ ...b, mode: 'playerImmortal' }).turns
    d += runBattle({ ...b, mode: 'enemyImmortal' }).turns
  }
  return [k / n, d / n]
}
const [k0, d0] = run(undefined)
for (const [label, buff] of [['attack x1.15', { attack: 1.15 }], ['defense x1.15', { defense: 1.15 }], ['attack x1.15 + defense x1.15', {
  attack: 1.15,
  defense: 1.15
}]]) {
  const [k, d] = run(buff)
  console.log(`${team} S${st} ${label}: OFF ${(k0 / k).toFixed(3)} DEF ${(d / d0).toFixed(3)} PI ${((k0 / k) * (d / d0)).toFixed(3)}`)
}
