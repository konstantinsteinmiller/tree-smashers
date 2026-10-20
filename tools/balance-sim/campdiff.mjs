// Banded campaign win-rate comparison of two camp results: node campdiff.mjs a.json b.json
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')))
const agg = (d) => { const m = {}; for (const { key: k, r } of d.rows) (m[`${k.roster}|${k.stage}`] ??= []).push(r); return m }
const A = agg(a), B = agg(b)
const bands = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 70], [71, 80], [81, 90], [91, 100], [101, 200]]
for (const roster of ['default', 'newest']) {
  const out = []
  let tot = [0, 0, 0]
  for (const [lo, hi] of bands) {
    const ka = [], kb = []
    for (const [k, v] of Object.entries(A)) { const [r, s] = k.split('|'); if (r === roster && +s >= lo && +s <= hi) ka.push(...v) }
    for (const [k, v] of Object.entries(B)) { const [r, s] = k.split('|'); if (r === roster && +s >= lo && +s <= hi) kb.push(...v) }
    const ma = ka.reduce((x, y) => x + y, 0) / ka.length, mb = kb.reduce((x, y) => x + y, 0) / kb.length
    tot[0] += ma * ka.length; tot[1] += mb * kb.length; tot[2] += ka.length
    out.push(`${lo}-${hi}: ${Math.round(ma * 100)}→${Math.round(mb * 100)}`)
  }
  console.log(`${roster}: ${out.join('  ')}  | all ${Math.round(tot[0] / tot[2] * 100)}→${Math.round(tot[1] / tot[2] * 100)}`)
}
