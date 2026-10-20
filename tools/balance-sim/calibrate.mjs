// One damped calibration step for the per-smasher profiles: reads a 1v1
// round-robin result, scales hp AND damage of every smasher outside 50 % ±
// dead band by g = exp(-2k · logit(wr)) and prints the new p(hp, damage, …)
// heads to paste into the catalog. Measured sensitivity: ln g = 0.25 moves a
// smasher ~1.6 logit (26 % → 65 %), so k ≈ 0.05 is a safe damped step.
// Several result files (rr1 / rr2 / ref) are averaged per smasher with equal
// weight; --write applies the suggestion to the catalog files in place.
// Usage: node tools/balance-sim/calibrate.mjs <result.json>… [--k 0.05] [--band 0.03] [--write]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = join(import.meta.dirname, '..', '..')
const CATALOG = ['src/data/smasherCatalog.ts', 'src/data/smashers/batchA.ts', 'src/data/smashers/batchB.ts', 'src/data/smashers/batchC.ts']
const src = CATALOG.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n')
const base = {}
for (const m of src.matchAll(/id: '(\w+)', archetype:[^\n]*\n?\s*profile: p\(([^)]*)\)/g)) {
  const v = m[2].split(',').map(Number)
  base[m[1]] = { hp: v[0], damage: v[1] }
}
const argv = process.argv.slice(2)
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d)
const k = Number(opt('k', 0.05))
const band = Number(opt('band', 0.03))
const files = argv.filter((a, i) => a.endsWith('.json') && !argv[i - 1]?.startsWith('--'))
const sums = {}
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  const one = {}
  for (const { key: x, r } of d.rows) {
    const add = (id, v) => (one[id] ??= []).push(v)
    if (d.mode === 'rr1') { add(x.a, r); add(x.b, 1 - r) }
    else if (d.mode === 'rr2') { for (const id of x.A) add(id, r); for (const id of x.B) add(id, 1 - r) }
    else if (d.mode === 'ref') add(x.id, x.side === 'player' ? r : 1 - r)
  }
  for (const [id, v] of Object.entries(one)) (sums[id] ??= []).push(v.reduce((a, b) => a + b, 0) / v.length)
}
const per = sums
const log = []
const next = {}
for (const [id, v] of Object.entries(per)) {
  const wr = v.reduce((a, b) => a + b, 0) / v.length
  if (Math.abs(wr - 0.5) <= band) continue
  const c = Math.min(0.95, Math.max(0.05, wr))
  const g = Math.exp(-k * Math.log(c / (1 - c)) * 2)
  const cur = base[id]
  next[id] = { hp: +(cur.hp * g).toFixed(2), damage: +(cur.damage * g).toFixed(2) }
  log.push(`${id.padEnd(10)} ${Math.round(wr * 100)}%  ×${g.toFixed(3)}  p(${+(cur.hp * g).toFixed(2)}, ${+(cur.damage * g).toFixed(2)}, …)`)
}
if (Object.keys(base).length !== 48) throw new Error(`parsed ${Object.keys(base).length} profiles`)
console.log(log.join('\n'))
if (argv.includes('--write')) {
  let n = 0
  for (const f of CATALOG) {
    const p = join(ROOT, f)
    const txt = readFileSync(p, 'utf8').replace(/(id: '(\w+)', archetype:[^\n]*\n?\s*profile: p\()([^,]+),\s*([^,]+),/g, (m, pre, id) => {
      const o = next[id]
      if (!o) return m
      n++
      return `${pre}${o.hp}, ${o.damage},`
    })
    writeFileSync(p, txt)
  }
  console.log(`wrote ${n} profiles`)
}
