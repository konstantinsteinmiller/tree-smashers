// Turns results JSON into markdown tables.
//   PI  = (TTK_base / TTK_cfg) * (TTD_cfg / TTD_base)
//   OFF = TTK_base / TTK_cfg     (how much faster the enemy team dies; player immortal)
//   DEF = TTD_cfg / TTD_base     (how much longer the player team lives; enemies immortal)
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2).filter(a => a.endsWith('.json'))
const levelFilter = (() => {
  const i = process.argv.indexOf('--L')
  return i >= 0 ? Number(process.argv[i + 1]) : null
})()
const mode = (() => {
  const i = process.argv.indexOf('--mode')
  return i >= 0 ? process.argv[i + 1] : 'pi'
})()
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')))
const byStage = new Map()
for (const r of rows) {
  const m = byStage.get(r.st) ?? new Map()
  m.set(`${r.key}|${r.L}`, r)
  byStage.set(r.st, m)
}
const stages = [...byStage.keys()].sort((a, b) => a - b)
const keys = [...new Set(rows.filter(r => r.key !== 'base').map(r => `${r.key}|${r.L}`))]
  .filter(k => levelFilter === null || k.endsWith(`|${levelFilter}`))
const metric = (st, k) => {
  const m = byStage.get(st)
  const b = m.get('base|0')
  const r = m.get(k)
  if (!b || !r) return null
  const mean = (x, f) => x[f] / x.n
  const rse2 = (x, f) => {
    const m = x[f] / x.n
    const v = Math.max(0, x[f + '2'] / x.n - m * m)
    return x[f + '2'] === undefined ? 0 : v / x.n / (m * m)
  }
  const off = (b.ttk / b.n) / (r.ttk / r.n)
  const def = (r.ttd / r.n) / (b.ttd / b.n)
  const se = off * def * Math.sqrt(rse2(b, 'ttk') + rse2(r, 'ttk') + rse2(b, 'ttd') + rse2(r, 'ttd'))
  return {
    off,
    def,
    pi: off * def,
    se,
    wr: r.win / r.n,
    wrBase: b.win / b.n,
    cap: r.capA + r.capB,
    procs: r.procs,
    n: r.n
  }
}
const fmt = (v) => v.toFixed(2)
const head = `| config | L | ${stages.map(s => `S${s}`).join(' | ')} | max |${mode === 'pi' ? ' max+2SE |' : ''}`
const sep = `|---|---|${stages.map(() => '---').join('|')}|---|${mode === 'pi' ? '---|' : ''}`
console.log(head)
console.log(sep)
const out = []
for (const k of keys) {
  const [cfg, L] = k.split('|')
  const vals = stages.map(st => metric(st, k))
  const pick = (x) => mode === 'off' ? x.off : mode === 'def' ? x.def : mode === 'wr' ? x.wr : x.pi
  const nums = vals.filter(Boolean).map(pick)
  const max = Math.max(...nums)
  const worst = vals.filter(Boolean).reduce((a, v) => (pick(v) > pick(a) ? v : a))
  const ub = mode === 'pi' ? max + 2 * worst.se : max
  out.push({
    k,
    line: `| ${cfg} | ${L} | ${vals.map(v => v ? (mode === 'wr' ? `${Math.round(pick(v) * 100)}%` : fmt(pick(v))) : '–').join(' | ')} | ${mode === 'wr' ? '' : fmt(max)} |${mode === 'pi' ? ' ' + fmt(ub) + ' |' : ''}`,
    max
  })
}
out.sort((a, b) => b.max - a.max)
for (const o of out) console.log(o.line)
if (mode === 'wr') {
  console.log(`| base | 0 | ${stages.map(st => `${Math.round(byStage.get(st).get('base|0').win / byStage.get(st).get('base|0').n * 100)}%`).join(' | ')} | |`)
}
