// Per-stage campaign stats of one or more camp runs (balance-sim.mjs camp):
//   node tools/balance-sim/campstats.mjs a.json [b.json …] [--band] [--stages 1-100]
// Per stage: win rate (vs the STAGE_WIN_TARGET curve), player launches
// (mean / p90), how the fight ended (tree / knock-out / sudden death), the
// winner's margin (player smasher HP left on a win), trees per side.
// Several files: one win-rate column per file. --band: 5-stage blocks only.
import { readFileSync } from 'node:fs'
import { stageWinTarget } from './targets.mjs'

const args = process.argv.slice(2)
const files = args.filter(a => a.endsWith('.json'))
const band = args.includes('--band')
const si = args.indexOf('--stages')
const parse = (spec) => spec.split(',').flatMap(p => {
  const [a, b] = p.split('-').map(Number)
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
})
const only = si >= 0 ? new Set(parse(args[si + 1])) : null

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)
const pctl = (a, p) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
const pct = (v) => (Number.isFinite(v) ? String(Math.round(v * 100)).padStart(3) : '  –')

const runs = files.map(f => {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  const per = new Map()
  for (const row of d.rows) {
    const s = row.key.stage
    if (only && !only.has(s)) continue
    if (!per.has(s)) per.set(s, [])
    per.get(s).push(row)
  }
  return { f, per }
})
const stages = [...new Set(runs.flatMap(r => [...r.per.keys()]))].sort((a, b) => a - b)

const head = ['stage', 'tgt', ...files.map((_, i) => `w${i}`), 'n', 'L', 'L90', 'tree', 'sd', 'mrg', 'T']
console.log(head.map(h => h.padStart(5)).join(''))
const last = runs[runs.length - 1]
const groups = band
  ? Array.from(new Set(stages.map(s => Math.ceil(s / 5))), b => stages.filter(s => Math.ceil(s / 5) === b))
  : stages.map(s => [s])
for (const g of groups) {
  const rowsOf = (run) => g.flatMap(s => run.per.get(s) ?? [])
  const rs = rowsOf(last)
  const ms = rs.map(r => r.m).filter(Boolean)
  const wins = rs.filter(r => r.r === 1 && r.m)
  const cells = [
    band ? `${g[0]}-${g[g.length - 1]}` : String(g[0]),
    pct(mean(g.map(stageWinTarget))),
    ...runs.map(run => pct(mean(rowsOf(run).map(r => r.r)))),
    String(rs.length),
    mean(ms.map(m => m.launches)).toFixed(1),
    String(pctl(ms.map(m => m.launches), 0.9)),
    pct(mean(ms.map(m => (m.end === 'tower' ? 1 : 0)))),
    pct(mean(ms.map(m => (m.sd ? 1 : 0)))),
    pct(mean(wins.map(r => r.m.pHp ?? NaN).filter(Number.isFinite))),
    String(ms[0]?.trees ?? '')
  ]
  console.log(cells.map(c => String(c).padStart(5)).join(''))
}
