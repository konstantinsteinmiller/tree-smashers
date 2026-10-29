// Fit the stage table's `hp` and `dmg` (per-stage enemy HP and damage scale)
// to the curves in targets.mjs — the first-try win rate AND the fight length —
// from camp runs at several scales:
//   node tools/balance-sim/fithp.mjs run1.json run2.json … [--stages 6-99]
//        [--hp 0.4,2.5] [--dmg 0.7,1.4] [--lambda 0.6] [--table cur.json] [--win-only] [--json]
// A run's absolute scale per stage = its tuning (`stageHpScale[stage]` ×
// `npcHpScale`, `stageDmgScale[stage]` × `npcDmgScale`; tests/balance.sim.test.ts)
// or, where the tuning names none, the stage table scale it ran on
// (`--table`: { hp: { stage: x }, dmg: { stage: x } }, default 1).
// Model, one slope pair per group (regular / boss × early / mid / late) and an
// intercept per stage:
//   logit(win)      = a_s + bh·ln hp + bd·ln dmg     (alternating 1-D Newton,
//                     0.25 pseudo win + loss per point keeps 0 % / 100 % finite)
//   ln(launches)    = c_s + eh·ln hp + ed·ln dmg     (least squares, n-weighted)
// The win target is met exactly; the length target pulls `dmg` off 1 only as
// far as the prior allows (--lambda), `dmg` is clamped to its range and `hp`
// then solved from the win equation.
// --win-only: dmg stays 1 (or the table's), hp meets the win target only.
import { readFileSync } from 'node:fs'
import { isBossStage, stageLengthTarget, stageWinTarget } from './targets.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)
const files = args.filter((a, i) => a.endsWith('.json') && !args[i - 1]?.startsWith('--'))
const parse = (spec) => spec.split(',').flatMap(p => {
  const [a, b] = p.split('-').map(Number)
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
})
const only = opt('stages') ? new Set(parse(opt('stages'))) : null
const [HMIN, HMAX] = opt('hp', '0.4,2.5').split(',').map(Number)
const [DMIN, DMAX] = opt('dmg', '0.7,1.4').split(',').map(Number)
/** Weight of the "damage stays 1" prior against the length target (--lambda). */
const LAMBDA = Number(opt('lambda', 0.6))
/** The same prior on boss stages (--boss-lambda; default = --lambda). */
const BOSS_LAMBDA = Number(opt('boss-lambda', LAMBDA))
const table = opt('table') ? JSON.parse(readFileSync(opt('table'), 'utf8')) : { hp: {}, dmg: {} }
const winOnly = args.includes('--win-only')
/** --fresh 5,15,90 --keep tagX[,tagY]: those stages use only the run files whose name contains a tag
 *  (a rule change made the older data on them stale). */
const keepTags = opt('keep') ? opt('keep').split(',') : []
const skip = new Set((opt('fresh') ? parse(opt('fresh')) : []).map(s => `*|${s}`))
/** Boss stages may go softer on damage (--boss-dmg-min, default 0.5). */
const BOSS_DMIN = Number(opt('boss-dmg-min', 0.5))

/** points[stage] = [{ h: ln hp, d: ln dmg, w, n, L }] */
const points = new Map()
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  const t = d.env?.tuning ?? {}
  // Rows carry their absolute scale (m.hpS / m.dmgS, newer runs); older runs:
  // the tuning × the table they ran on.
  const per = new Map()
  for (const row of d.rows) {
    const s = row.key.stage
    if (only && !only.has(s)) continue
    if (skip.has(`*|${s}`) && !keepTags.some(t => f.includes(t))) continue
    const k = String(s)
    const hp = row.m?.hpS ?? (t.stageHpScale?.[k] ?? table.hp?.[k] ?? 1) * (t.npcHpScale ?? 1)
    const dmg = row.m?.dmgS ?? (t.stageDmgScale?.[k] ?? table.dmg?.[k] ?? 1) * (t.npcDmgScale ?? 1)
    const key = `${s}|${hp.toFixed(4)}|${dmg.toFixed(4)}`
    if (!per.has(key)) per.set(key, { s, hp, dmg, w: 0, n: 0, L: 0 })
    const c = per.get(key)
    c.w += row.r
    c.n++
    c.L += row.m?.launches ?? 0
  }
  for (const c of per.values()) {
    if (!points.has(c.s)) points.set(c.s, [])
    points.get(c.s).push({ h: Math.log(c.hp), d: Math.log(c.dmg), w: c.w + 0.25, n: c.n + 0.5, L: Math.max(0.5, c.L / c.n) })
  }
}

const group = (s) => `${isBossStage(s) ? 'boss' : 'reg'}-${s <= 20 ? 'early' : s <= 50 ? 'mid' : 'late'}`
const sig = (z) => 1 / (1 + Math.exp(-z))
const stages = [...points.keys()].sort((a, b) => a - b)
const groups = [...new Set(stages.map(group))]

// ── win model ──
const a = new Map(stages.map(s => [s, 0]))
const bh = new Map(groups.map(g => [g, -2]))
const bd = new Map(groups.map(g => [g, -2]))
const varies = (g, key) => stages.some(s => group(s) === g && new Set(points.get(s).map(p => p[key].toFixed(4))).size > 1)
for (let it = 0; it < 300; it++) {
  for (const s of stages) {
    let g1 = 0
    let h = 0
    for (const p of points.get(s)) {
      const q = sig(a.get(s) + bh.get(group(s)) * p.h + bd.get(group(s)) * p.d)
      g1 += p.w - p.n * q
      h += p.n * q * (1 - q)
    }
    a.set(s, a.get(s) + g1 / Math.max(h, 1e-6))
  }
  for (const [slope, key] of [[bh, 'h'], [bd, 'd']]) {
    for (const g of groups) {
      if (!varies(g, key)) continue
      let g1 = 0
      let h = 0
      for (const s of stages) {
        if (group(s) !== g) continue
        for (const p of points.get(s)) {
          const q = sig(a.get(s) + bh.get(g) * p.h + bd.get(g) * p.d)
          g1 += (p.w - p.n * q) * p[key]
          h += p.n * q * (1 - q) * p[key] * p[key]
        }
      }
      if (h > 1e-6) slope.set(g, Math.min(-0.3, Math.max(-12, slope.get(g) + g1 / h)))
    }
  }
}

// ── length model (weighted least squares, stage intercepts) ──
const c = new Map(stages.map(s => [s, 0]))
const eh = new Map(groups.map(g => [g, 0.5]))
const ed = new Map(groups.map(g => [g, -0.3]))
for (let it = 0; it < 200; it++) {
  for (const s of stages) {
    let num = 0
    let den = 0
    for (const p of points.get(s)) {
      num += p.n * (Math.log(p.L) - eh.get(group(s)) * p.h - ed.get(group(s)) * p.d)
      den += p.n
    }
    c.set(s, num / den)
  }
  for (const [slope, other, key, okey] of [[eh, ed, 'h', 'd'], [ed, eh, 'd', 'h']]) {
    for (const g of groups) {
      if (!varies(g, key)) continue
      let num = 0
      let den = 0
      for (const s of stages) {
        if (group(s) !== g) continue
        for (const p of points.get(s)) {
          num += p.n * p[key] * (Math.log(p.L) - c.get(s) - other.get(g) * p[okey])
          den += p.n * p[key] * p[key]
        }
      }
      if (den > 1e-9) slope.set(g, num / den)
    }
  }
}

const out = { hp: {}, dmg: {} }
const lines = []
const r2 = (v) => Math.round(v * 20) / 20 // 0.05 steps
for (const s of stages) {
  const tw = stageWinTarget(s)
  const tl = stageLengthTarget(s)
  if (!Number.isFinite(tw)) continue
  const g = group(s)
  const lw = Math.log(Math.min(0.97, Math.max(0.03, tw)) / (1 - Math.min(0.97, Math.max(0.03, tw)))) - a.get(s)
  let xh
  let xd
  if (winOnly) {
    xd = Math.log(table.dmg?.[String(s)] ?? 1)
    xh = (lw - bd.get(g) * xd) / bh.get(g)
  } else {
    // Win is the hard target: on the line bh·xh + bd·xd = lw the fight length
    // moves as ln L = K + m·xd. Length is the soft one: xd minimises
    // (K + m·xd − ln Lt)² + LAMBDA·xd², a prior that keeps the damage near 1
    // (damage barely changes the length by itself — a strict length target
    // would trade HP 0.4 for damage 1.5: paper enemies that hit like trucks).
    const K = c.get(s) + eh.get(g) * lw / bh.get(g)
    const m = ed.get(g) - eh.get(g) * bd.get(g) / bh.get(g)
    xd = (m * (Math.log(tl) - K)) / (m * m + (isBossStage(s) ? BOSS_LAMBDA : LAMBDA))
    xd = Math.min(Math.log(DMAX), Math.max(Math.log(isBossStage(s) ? BOSS_DMIN : DMIN), xd))
    xh = (lw - bd.get(g) * xd) / bh.get(g)
  }
  // HP at its bound: the damage closes the rest of the win gap (within range).
  const xhc = Math.min(Math.log(HMAX), Math.max(Math.log(HMIN), xh))
  if (xhc !== xh) {
    xh = xhc
    xd = Math.min(Math.log(DMAX), Math.max(Math.log(isBossStage(s) ? BOSS_DMIN : DMIN), (lw - bh.get(g) * xh) / bd.get(g)))
  }
  const hp = r2(Math.min(HMAX, Math.max(HMIN, Math.exp(xh))))
  const dmg = r2(Math.exp(xd))
  out.hp[s] = hp
  out.dmg[s] = dmg
  const predW = sig(a.get(s) + bh.get(g) * Math.log(hp) + bd.get(g) * Math.log(dmg))
  const predL = Math.exp(c.get(s) + eh.get(g) * Math.log(hp) + ed.get(g) * Math.log(dmg))
  const obs = points.get(s).map(p => `${Math.exp(p.h).toFixed(2)}/${Math.exp(p.d).toFixed(2)}:${Math.round(((p.w - 0.25) / (p.n - 0.5)) * 100)}%,${p.L.toFixed(1)}`).join(' ')
  lines.push(`${String(s).padStart(4)} tgt ${Math.round(tw * 100)}% ${tl}L  hp ${hp.toFixed(2)}${hp === HMIN || hp === HMAX ? '*' : ' '} dmg ${dmg.toFixed(2)}  → ${Math.round(predW * 100)}% ${predL.toFixed(1)}L  (${obs})`)
}
if (args.includes('--json')) console.log(JSON.stringify(out))
else {
  console.log(lines.join('\n'))
  console.log('win slopes ' + groups.map(g => `${g} h${bh.get(g).toFixed(2)} d${bd.get(g).toFixed(2)}`).join('  '))
  console.log('len slopes ' + groups.map(g => `${g} h${eh.get(g).toFixed(2)} d${ed.get(g).toFixed(2)}`).join('  '))
  console.log(JSON.stringify(out))
}
