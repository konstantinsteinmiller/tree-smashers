// Config list for the robustness runs: all 10 singles + the 10 strongest pairs.
import { readFileSync } from 'node:fs'
import { SKILL_IDS } from './skills.mjs'

const rows = JSON.parse(readFileSync(process.env.PAIRS_FILE ?? new URL('./results/v7_pairs10.json', import.meta.url), 'utf8'))
const base = new Map(rows.filter(r => r.key === 'base').map(r => [r.st, r]))
const worst = new Map()
for (const r of rows) {
  if (r.key === 'base') continue
  const b = base.get(r.st)
  const pi = ((b.ttk / b.n) / (r.ttk / r.n)) * ((r.ttd / r.n) / (b.ttd / b.n))
  worst.set(r.key, Math.max(worst.get(r.key) ?? 0, pi))
}
const top = [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)
process.stdout.write([...SKILL_IDS, ...top].join(';'))
