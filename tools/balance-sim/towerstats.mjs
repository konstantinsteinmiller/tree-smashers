// Tower stats of camp sim results: how fights end (tower kill vs knock-out)
// and how fast the enemy tree falls, per stage band, boss stages separately.
//
//   node tools/balance-sim/towerstats.mjs results/a-camp.json [results/b-camp.json …]
//
// Needs camp rows with `m` (tests/balance.sim.test.ts records it).
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const bands = [[2, 10], [11, 20], [21, 40], [41, 60], [61, 80], [81, 100], [101, 200]]
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%`.padStart(4) : '   –')
const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).padStart(5) : '    –')

const line = (label, rows) => {
  const n = rows.length
  const win = mean(rows.map(r => r.r))
  const wins = rows.filter(r => r.r === 1)
  const losses = rows.filter(r => r.r === 0)
  const winByTower = wins.length ? wins.filter(r => r.m.end === 'tower').length / wins.length : NaN
  const lossByTower = losses.length ? losses.filter(r => r.m.end === 'tower').length / losses.length : NaN
  const fell = rows.filter(r => r.m.nFellAt >= 0)
  const nLeft = mean(rows.filter(r => r.m.nTower >= 0).map(r => r.m.nTower))
  const pLeft = mean(rows.filter(r => r.m.pTower >= 0).map(r => r.m.pTower))
  const ratio = mean(rows.filter(r => r.m.towerRatio > 0).map(r => r.m.towerRatio))
  const tout = rows.filter(r => r.m.end === 'timeout').length / n
  return `${label.padEnd(16)} n${String(n).padStart(4)}  win ${pct(win)}  wins by tree ${pct(winByTower)}  losses by tree ${pct(lossByTower)}  ` +
    `enemy tree falls in ${pct(fell.length / n)} after ${num(mean(fell.map(r => r.m.nFellAt)))} launches  ` +
    `enemy tree left ${pct(nLeft)}  own tree left ${pct(pLeft)}  launches ${num(mean(rows.map(r => r.m.launches)))}  tree/team hp ${num(ratio, 2)}  timeouts ${pct(tout)}`
}

for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  const rows = d.rows.filter(r => r.m && r.key.stage >= 2)
  console.log(`\n== ${basename(f)} (${rows.length} fights with towers, tower aim ${d.env?.towerAim ?? '0.2 (default)'})`)
  for (const boss of [false, true]) {
    console.log(boss ? '-- boss stages' : '-- normal stages')
    for (const [a, b] of bands) {
      const sel = rows.filter(r => r.m.boss === boss && r.key.stage >= a && r.key.stage <= b)
      if (sel.length) console.log(line(`${a}–${b}`, sel))
    }
    console.log(line('all', rows.filter(r => r.m.boss === boss)))
  }
}
