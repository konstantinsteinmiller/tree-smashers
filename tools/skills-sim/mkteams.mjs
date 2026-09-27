// Build the strongest legal 4-skill teams (2 disjoint pairs) from the pair sweep.
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(process.env.PAIRS_FILE ?? new URL('./results/v7_pairs10.json', import.meta.url), 'utf8'))
const base = new Map(rows.filter(r => r.key === 'base').map(r => [r.st, r]))
const byKey = new Map()
for (const r of rows) {
  if (r.key === 'base') continue
  const b = base.get(r.st)
  const pi = ((b.ttk / b.n) / (r.ttk / r.n)) * ((r.ttd / r.n) / (b.ttd / b.n))
  byKey.set(r.key, Math.max(byKey.get(r.key) ?? 0, pi))
}
// Phase Step + Static Charge may not share a spinner (skills-feature.md §5)
const EXCLUDED = new Set(['phase_step+static_charge'])
const pairs = [...byKey.entries()].filter(([k]) => !EXCLUDED.has(k)).sort((a, b) => b[1] - a[1])
const teams = new Set()
for (const [k1] of pairs.slice(0, 10)) {
  const s1 = k1.split('+')
  const partner = pairs.find(([k2]) => k2 !== k1 && !k2.split('+').some(x => s1.includes(x)))
  if (!partner) continue
  const t = [k1, partner[0]].sort().join('|')
  teams.add(t)
  if (teams.size >= 8) break
}
process.stdout.write([...teams].join(';'))
