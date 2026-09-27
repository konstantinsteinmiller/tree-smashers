// Regenerates skills-feature.md (repo root) from doc_template.md, content.mjs and
// the result JSONs in ./results (override with SKILLS_SIM_RESULTS=<dir>).
//   node fill.mjs           → out/skills-feature.preview.md (always safe)
//   node fill.mjs --write   → overwrites <repo>/skills-feature.md; refuses while any
//                             input is missing (only the headline results are kept in
//                             the repo — a full run regenerates the rest, see README)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { SKILL_DEFS, SKILL_IDS } from './skills.mjs'
import { CARDS, TABLE_COLS, I18N, LOCALES, DESC_PARAMS, L10_LINE } from './content.mjs'
import { getStageById, lockstepLevel } from './data.mjs'
import { econLevel, cumIncome, incomeAtStage, PROFILES, bpCoinsBy } from './econ.mjs'
import { simulateShares } from './skillecon.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const RESULTS = process.env.SKILLS_SIM_RESULTS ?? join(HERE, 'results')
const missing = []
const load = (name) => {
  const f = join(RESULTS, name)
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  missing.push(name)
  return []
}
const singles = load('v7_singles.json')
const pairs10 = load('v7_pairs10.json')
const pairsLow = load('v7_pairs15.json')
const team = [...load('v7_team.json'), ...load('v7_special.json')]
const robustLock = load('v7_robust_lock.json')
const robustGlass = load('v7_robust_glass.json')
const robustTank = load('v7_screen_tank.json')

const EXCLUDED = new Set()
const NAME = Object.fromEntries(SKILL_IDS.map(id => [id, CARDS[id].name]))
const nice = (key) => key.split('|').map(p => p.split('+').map(id => NAME[id] ?? id).join(' + ')).join('  ‖  ')

const index = (rows) => {
  const m = new Map()
  for (const r of rows) m.set(`${r.st}|${r.key}|${r.L}`, r)
  return m
}
const rse2 = (x, f) => {
  const m = x[f] / x.n
  if (x[f + '2'] === undefined) return 0
  const v = Math.max(0, x[f + '2'] / x.n - m * m)
  return v / x.n / (m * m)
}
const metric = (idx, st, key, L) => {
  const b = idx.get(`${st}|base|0`)
  const r = idx.get(`${st}|${key}|${L}`)
  if (!b || !r) return null
  const off = (b.ttk / b.n) / (r.ttk / r.n)
  const def = (r.ttd / r.n) / (b.ttd / b.n)
  const pi = off * def
  const se = pi * Math.sqrt(rse2(b, 'ttk') + rse2(r, 'ttk') + rse2(b, 'ttd') + rse2(r, 'ttd'))
  return { off, def, pi, se, wr: r.win / r.n, n: r.n, capA: r.capA, capB: r.capB }
}
const stagesOf = (rows) => [...new Set(rows.map(r => r.st))].sort((a, b) => a - b)
const f2 = (v) => v.toFixed(2)
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const stageLabel = (st) => {
  const s = getStageById(st)
  if (s.isBoss) {
    const ab = s.enemyTeam.find(e => e.bossAbility)?.bossAbility ?? 'plain'
    return `${st} boss:${ab}`
  }
  return `${st} ${s.arenaType ?? 'default'}`
}

// ── tables ──────────────────────────────────────────────────────────────
const idxS = index(singles)
const stS = stagesOf(singles)
const T_BASELINE = (() => {
  const lines = ['| stage | enemies (top/bottom tl/bl) | player lvl (econ / lockstep) | win rate | turns | TTK₀ | TTD₀ |', '|---|---|---|---|---|---|---|']
  for (const st of stS) {
    const b = idxS.get(`${st}|base|0`)
    const s = getStageById(st)
    const en = s.enemyTeam.map(e => `${e.topPartId}/${e.bottomPartId} ${e.topLevel}/${e.bottomLevel}`).join(', ')
    lines.push(`| ${stageLabel(st)} | ${en} | ${econLevel(st)} / ${lockstepLevel(st)} | ${Math.round(b.win / b.n * 100)}% | ${(b.turns / b.n).toFixed(1)} | ${(b.ttk / b.n).toFixed(1)} | ${(b.ttd / b.n).toFixed(1)} |`)
  }
  lines.push('', `N = ${idxS.get(`${stS[0]}|base|0`)?.n ?? '?'} battles per stage and mode.`)
  return lines.join('\n')
})()

const singleStats = {}
const T_SINGLES = (() => {
  const head = `| skill | L1 worst | L5 worst | ${stS.map(s => `S${s}`).join(' | ')} | **L10 median** | **L10 worst** | worst+2SE |`
  const sep = `|---|---|---|${stS.map(() => '---').join('|')}|---|---|---|`
  const rows = []
  for (const id of SKILL_IDS) {
    const per = (L) => stS.map(st => metric(idxS, st, id, L)).filter(Boolean)
    const l1 = per(1), l5 = per(5), l10 = per(10)
    if (!l10.length) continue
    const worst = l10.reduce((a, v) => (v.pi > a.pi ? v : a))
    const worstStage = stS[l10.indexOf(worst)]
    singleStats[id] = {
      med1: median(l1.map(v => v.pi)), med5: median(l5.map(v => v.pi)), med10: median(l10.map(v => v.pi)),
      max1: Math.max(...l1.map(v => v.pi)), max5: Math.max(...l5.map(v => v.pi)), max10: worst.pi, worstStage,
      medOff: median(l10.map(v => v.off)), medDef: median(l10.map(v => v.def)), ub: worst.pi + 2 * worst.se
    }
    const s = singleStats[id]
    rows.push({
      s: s.max10,
      line: `| ${NAME[id]} | ${f2(s.max1)} | ${f2(s.max5)} | ${l10.map(v => f2(v.pi)).join(' | ')} | **${f2(s.med10)}** | **${f2(s.max10)}** | ${f2(s.ub)} |`
    })
  }
  rows.sort((a, b) => b.s - a.s)
  return [head, sep, ...rows.map(r => r.line)].join('\n')
})()
const T_LEVELCURVE = (() => {
  const lines = ['', '', '| skill | L1 | L5 | L10 | L10 OFF × DEF (median) |', '|---|---|---|---|---|']
  for (const id of SKILL_IDS) {
    const s = singleStats[id]
    if (!s) continue
    lines.push(`| ${NAME[id]} | ${f2(s.med1)} | ${f2(s.med5)} | ${f2(s.med10)} | ${f2(s.medOff)} × ${f2(s.medDef)} |`)
  }
  return lines.join('\n')
})()

const idxP = index(pairs10)
const stP = stagesOf(pairs10)
let worstPair = null
const pairRows = []
const T_PAIRS10 = (() => {
  const keys = [...new Set(pairs10.filter(r => r.key !== 'base').map(r => r.key))]
  for (const k of keys) {
    const vals = stP.map(st => metric(idxP, st, k, 10))
    const ok = vals.filter(Boolean)
    const worst = ok.reduce((a, v) => (v.pi > a.pi ? v : a))
    const wst = stP[vals.indexOf(worst)]
    const med = median(ok.map(v => v.pi))
    pairRows.push({ k, vals, worst, wst, med })
  }
  pairRows.sort((a, b) => b.worst.pi - a.worst.pi)
  worstPair = pairRows.find(p => !EXCLUDED.has(p.k))
  const head = `| # | pair (both spinners) | ${stP.map(s => `S${s}`).join(' | ')} | median | **worst** | worst+2SE |`
  const sep = `|---|---|${stP.map(() => '---').join('|')}|---|---|---|`
  const lines = pairRows.map((p, i) => `| ${i + 1} | ${nice(p.k)}${EXCLUDED.has(p.k) ? ' ⛔ *(blocked, §5)*' : ''} | ${p.vals.map(v => (v ? f2(v.pi) : '–')).join(' | ')} | ${f2(p.med)} | **${f2(p.worst.pi)}** (S${p.wst}) | ${f2(p.worst.pi + 2 * p.worst.se)} |`)
  const n = pairs10.find(r => r.key !== 'base')?.n
  return [head, sep, ...lines, '', `N = ${n} battles per stage, pair and mode (${stP.length} stages × 45 pairs × 3 modes).`].join('\n')
})()

const T_PAIRS_LOW = (() => {
  if (!pairsLow.length) return '_(run pending)_'
  const idx = index(pairsLow)
  const st = stagesOf(pairsLow)
  const out = []
  for (const L of [1, 5]) {
    const keys = [...new Set(pairsLow.filter(r => r.L === L).map(r => r.key))]
    const rows = keys.map(k => {
      const v = st.map(s => metric(idx, s, k, L)).filter(Boolean)
      const w = v.reduce((a, x) => (x.pi > a.pi ? x : a))
      return { k, w, med: median(v.map(x => x.pi)) }
    }).sort((a, b) => b.w.pi - a.w.pi)
    out.push(`**L${L}:** worst pair ${nice(rows[0].k)} = **${f2(rows[0].w.pi)}**; median over all 45 pairs' worst stages = ${f2(median(rows.map(r => r.w.pi)))}.`)
  }
  return '\n\n' + out.join('\n\n')
})()

const T_WR = (() => {
  const lines = [`| loadout | ${stS.map(s => `S${s}`).join(' | ')} |`, `|---|${stS.map(() => '---').join('|')}|`]
  lines.push(`| none | ${stS.map(st => {
    const b = idxS.get(`${st}|base|0`)
    return `${Math.round(b.win / b.n * 100)}%`
  }).join(' | ')} |`)
  for (const id of SKILL_IDS) {
    lines.push(`| ${NAME[id]} L10 | ${stS.map(st => {
      const m = metric(idxS, st, id, 10)
      return m ? `${Math.round(m.wr * 100)}%` : '–'
    }).join(' | ')} |`)
  }
  for (const p of pairRows.slice(0, 5)) {
    lines.push(`| ${nice(p.k)}${EXCLUDED.has(p.k) ? ' ⛔' : ''} L10 | ${stS.map(st => {
      const m = metric(idxP, st, p.k, 10)
      return m ? `${Math.round(m.wr * 100)}%` : '–'
    }).join(' | ')} |`)
  }
  return lines.join('\n')
})()

let TEAM_MAX = '(pending)'
const T_TEAM = (() => {
  if (!team.length) return '_(run pending)_'
  const idx = index(team)
  const st = stagesOf(team)
  const keys = [...new Set(team.filter(r => r.key !== 'base').map(r => r.key))]
  const rows = keys.map(k => {
    const v = st.map(s => metric(idx, s, k, 10))
    const ok = v.filter(Boolean)
    const w = ok.reduce((a, x) => (x.pi > a.pi ? x : a))
    return { k, v, w, ws: st[v.indexOf(w)], med: median(ok.map(x => x.pi)) }
  }).sort((a, b) => b.w.pi - a.w.pi)
  TEAM_MAX = `${f2(rows[0].w.pi)}× (${nice(rows[0].k)}, stage ${rows[0].ws})`
  const head = `| Spinner 1 ‖ Spinner 2 | ${st.map(s => `S${s}`).join(' | ')} | median | **worst** |`
  const sep = `|---|${st.map(() => '---').join('|')}|---|---|`
  return [head, sep, ...rows.map(r => `| ${nice(r.k)} | ${r.v.map(x => (x ? f2(x.pi) : '–')).join(' | ')} | ${f2(r.med)} | **${f2(r.w.pi)}** (S${r.ws}) |`)].join('\n')
})()

const confirm = [...load('v7_confirm_default.json'), ...load('v7p_glass30.json'), ...load('v7p_tank30.json')].sort((a, b) => {
  const o = { default: 0, glass: 1, tank: 2 }
  return (o[a.team ?? 'default'] - o[b.team ?? 'default']) || (b.hi95 - a.hi95)
})
const T_ROBUST = (() => {
  const blocks = []
  for (const [label, rows] of [['Lockstep part level (enemy-matched, weaker player)', robustLock], ['Glass-cannon team (Star/Speedy + Piercer/Speedy)', robustGlass], ['Tank team (Soft Shell/Tanky + Round/Tanky) — all 10 singles and all 45 pairs on stages 15/30/31', robustTank]]) {
    if (!rows.length) {
      blocks.push(`- ${label}: _(run pending)_`)
      continue
    }
    const idx = index(rows)
    const st = stagesOf(rows)
    const keys = [...new Set(rows.filter(r => r.key !== 'base').map(r => r.key))]
    const res = keys.map(k => {
      const all = st.map(s => metric(idx, s, k, 10))
      const w = all.filter(Boolean).reduce((a, x) => (x.pi > a.pi ? x : a))
      return { k, w, wst: st[all.indexOf(w)] }
    })
    const singlesMax = res.filter(r => !r.k.includes('+')).sort((a, b) => b.w.pi - a.w.pi)
    const pairsMax = res.filter(r => r.k.includes('+')).sort((a, b) => b.w.pi - a.w.pi)
    blocks.push(`- **${label}** (N = ${rows.find(r => r.key !== 'base').n}, ${st.length} stages): strongest single ${singlesMax[0] ? `${nice(singlesMax[0].k)} ${f2(singlesMax[0].w.pi)} (S${singlesMax[0].wst})` : '–'}; strongest pair ${pairsMax[0] ? `${nice(pairsMax[0].k)} **${f2(pairsMax[0].w.pi)}** (S${pairsMax[0].wst})` : '–'}; pairs above 1.45: ${pairsMax.filter(r => r.w.pi > 1.45).length} of ${pairsMax.length}.`)
  }
  const tk = confirm.filter(c => (c.team ?? 'default') === 'tank').sort((a, b) => b.pi - a.pi)[0]
  if (tk) blocks.push(`  - Tank × stage 30 is a high-variance heal race (rare very long fights dominate the mean): the paired N = ${tk.n} re-run of its top pairs reads up to **${tk.pi.toFixed(2)}** (${nice(tk.pair)}, CI ${tk.lo95.toFixed(2)}–${tk.hi95.toFixed(2)}) — see the corner discussion below.`)
  return blocks.join('\n')
})()

let CONFIRM_MAX = null
const T_CONFIRM = (() => {
  if (!confirm.length) return '_(run pending)_'
  CONFIRM_MAX = confirm[0]
  const lines = ['| stage | team | pair (both spinners, L10) | N seeds | OFF | DEF | **PI** | 95 % CI |', '|---|---|---|---|---|---|---|---|']
  for (const c of confirm.filter(c => c.pi >= 1.30 || (c.team ?? 'default') !== 'default')) lines.push(`| ${stageLabel(c.st)} | ${c.team ?? 'default'} | ${nice(c.pair)}${EXCLUDED.has(c.pair) ? ' ⛔ *(blocked, §5)*' : ''} | ${c.n} | ${f2(c.off)} | ${f2(c.def)} | **${c.pi.toFixed(3)}** | ${c.lo95.toFixed(3)} – ${c.hi95.toFixed(3)} |`)
  lines.push('', `Default-team rows below 1.30 omitted (${confirm.filter(c => c.pi < 1.30 && (c.team ?? 'default') === 'default').length} more).`)
  return lines.join('\n')
})()

// ── economy tables ──────────────────────────────────────────────────────
const T_INCOME = (() => {
  const lines = ['| stage s | econ part level | typical income of the neighbouring regular stage (s ± 1) | cumulative campaign-only | cumulative typical | cumulative engaged |', '|---|---|---|---|---|---|']
  for (const s of [15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100]) {
    lines.push(`| ${s} | ${econLevel(s)} | ${Math.round(incomeAtStage(s % 100 === 0 ? s - 1 : s + 1, PROFILES.typical))} | ${Math.round(cumIncome(s, PROFILES.campaignOnly)).toLocaleString('en')} | ${Math.round(cumIncome(s, PROFILES.typical)).toLocaleString('en')} | ${Math.round(cumIncome(s, PROFILES.engaged)).toLocaleString('en')} |`)
  }
  const d = (p) => Math.round(cumIncome(80, p) - cumIncome(9, p)).toLocaleString('en')
  lines.push('', `Income earned **during stages 10–80**: campaign-only ${d(PROFILES.campaignOnly)}, typical ${d(PROFILES.typical)}, engaged ${d(PROFILES.engaged)} coins. All ten skills (26,500) = ${Math.round(2650000 / (cumIncome(80, PROFILES.typical) - cumIncome(9, PROFILES.typical)))} % of the typical figure.`)
  return lines.join('\n')
})()
const T_SKILLECON = (() => {
  const lines = ['| profile | share of income to skills | first 2 maxed | 4 slotted maxed | all 10 maxed |', '|---|---|---|---|---|']
  for (const [name, p] of Object.entries(PROFILES)) {
    for (const share of [0.25, 0.35, 0.5]) {
      const r = simulateShares(p, share)
      lines.push(`| ${name} | ${share * 100}% | stage ${r.two} | stage ${r.four} | ${r.all ? `stage ${r.all}` : '> 200'} |`)
    }
  }
  return lines.join('\n')
})()

// ── cards ───────────────────────────────────────────────────────────────
const levelTable = (id) => {
  const cols = TABLE_COLS[id]
  const lv = SKILL_DEFS[id].levels
  const head = `| level | ${lv.map((_, i) => `L${i + 1}`).join(' | ')} |`
  const sep = `|---|${lv.map(() => '---').join('|')}|`
  const rows = cols.map(([k, h, fmt]) => `| ${h} | ${lv.map(p => fmt(typeof k === 'function' ? k(p) : p[k])).join(' | ')} |`)
  const cost = `| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |`
  return [head, sep, ...rows, cost].join('\n')
}
let CARDS_MD = ''
let n = 0
for (const id of ['mirror_plate', 'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets', 'opening_salvo', 'momentum', 'hazard_ward', 'static_charge']) {
  n++
  const c = CARDS[id]
  const s = singleStats[id]
  const measured = s
    ? `L1 median ${f2(s.med1)} · L5 median ${f2(s.med5)} · **L10 median ${f2(s.med10)}, worst ${f2(s.max10)} (stage ${s.worstStage})** · L10 split OFF ${f2(s.medOff)} × DEF ${f2(s.medDef)}`
    : '_(pending)_'
  CARDS_MD += `### 4.${n} ${c.name} — \`${id}\` · ${c.tag} · drop: stage ${c.drop}

*${c.fantasy}*

- **Effect:** ${c.effect}
- **Proc / rules:** ${c.rules}
- **Counterplay / limits:** ${c.counter}
- **Softens:** ${c.softens}
- **Edge cases:** ${c.edges}
- **Measured PI:** ${measured}
- **Icon / colour:** ${c.glyph}, \`${c.color}\`. VFX, audio, budget and \`FX.low\`: §8.2–8.3.
- **i18n:** \`skills.names.${id}\`, \`skills.desc.${id}\` — params: ${DESC_PARAMS[id]}.

${levelTable(id)}

`
}

// ── i18n appendix ───────────────────────────────────────────────────────
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
let I18N_MD = 'Paste as a top-level `skills` entry of each locale file (English first). Strings contain no `|`, `@` or raw `{`/`}` other than named params. French uses `’` (no escaping needed).\n\n'
for (const loc of LOCALES) {
  const L = I18N[loc]
  const obj = (o, ind) => Object.entries(o).map(([k, v]) => `${ind}'${k}': '${esc(v)}'`).join(',\n')
  I18N_MD += `**${loc}.ts**\n\n\`\`\`ts\n  'skills': {\n${obj(L.ui, '    ')},\n    'names': {\n${obj(L.names, '      ')}\n    },\n    'desc': {\n${obj(L.desc, '      ')}\n    }\n  },\n\`\`\`\n\n`
}

// ── runs ────────────────────────────────────────────────────────────────
const runInfo = (label, rows) => rows.length ? `${label} (N=${rows.find(r => r.key !== 'base')?.n}, ${stagesOf(rows).length} stages)` : null
const RUNS = [runInfo('single skills L1/L5/L10', singles), runInfo('45 pairs at L10', pairs10), runInfo('45 pairs at L1 and L5', pairsLow), runInfo('4-skill teams', team), runInfo('lockstep level', robustLock), runInfo('glass team', robustGlass), runInfo('tank team', robustTank)].filter(Boolean).join('; ') + '. Battles are counted per mode (real, player-immortal, enemy-immortal).'

let doc = readFileSync(join(HERE, 'doc_template.md'), 'utf8')
const rep = (k, v) => {
  doc = doc.split(k).join(v)
}
rep('{{T_BASELINE}}', T_BASELINE)
rep('{{T_SINGLES}}', T_SINGLES)
rep('{{T_LEVELCURVE}}', T_LEVELCURVE)
rep('{{T_PAIRS10}}', T_PAIRS10)
rep('{{T_PAIRS_LOW}}', T_PAIRS_LOW)
rep('{{T_CONFIRM}}', T_CONFIRM)
{
  // §3.10 early-game check: stages 10–20, L1/L3/L5, every single and every pair
  const early = load('v8_early.json')
  const idx = index(early)
  const st = stagesOf(early)
  const lines = [`| level | ${st.map(s => stageLabel(s)).join(' | ')} |`, `|---|${st.map(() => '---').join('|')}|`]
  const worstBy = (L, pairs) => st.map(s => {
    const keys = [...new Set(early.filter(r => r.L === L && r.key.includes('+') === pairs).map(r => r.key))]
    let best = null
    for (const k of keys) {
      const m = metric(idx, s, k, L)
      if (m && (!best || m.pi > best.m.pi)) best = { k, m }
    }
    return best
  })
  for (const L of [1, 3, 5]) {
    for (const pairs of [false, true]) {
      const w = worstBy(L, pairs)
      if (!w.some(Boolean)) continue
      lines.push(`| L${L} worst ${pairs ? 'pair' : 'single'} | ${w.map(x => (x ? `${f2(x.m.pi)} <sub>${nice(x.k)}</sub>` : '–')).join(' | ')} |`)
    }
  }
  const b = st.map(s => idx.get(`${s}|base|0`))
  lines.push(`| win rate, no skills | ${b.map(x => (x ? `${Math.round(x.win / x.n * 100)}%` : '–')).join(' | ')} |`)
  const allPi = early.filter(r => r.key !== 'base').map(r => metric(idx, r.st, r.key, r.L)).filter(Boolean)
  const maxPair = Math.max(...allPi.map(m => m.pi))
  lines.push('', `N = ${early.find(r => r.key !== 'base')?.n ?? '?'} battles per cell and mode; the highest value anywhere in the grid is **${f2(maxPair)}**.`)
  rep('{{T_EARLY}}', lines.join('\n'))
}
{
  const find = (pair, st, team = 'default') => confirm.find(c => c.pair === pair && c.st === st && (c.team ?? 'default') === team)
  const ci = (c) => `${c.lo95.toFixed(3)}–${c.hi95.toFixed(3)}`
  const ps = find('phase_step+static_charge', 30)
  rep('{{PS_SC}}', ps ? `${ps.pi.toFixed(3)} (paired 95 % CI ${ci(ps)})` : 'below the confirmation threshold')
  const tank = confirm.filter(c => (c.team ?? 'default') === 'tank' && c.st === 30).sort((a, b) => b.pi - a.pi)
  rep('{{TANK30}}', tank.length ? tank.slice(0, 3).map(c => `${nice(c.pair)} ${c.pi.toFixed(2)}`).join(', ') : '?')
  const m = metric(idxS, 30, 'phase_step', 10)
  rep('{{PS_OFF30}}', m ? f2(m.off) : '?')
}
rep('{{T_WR}}', T_WR)
rep('{{T_TEAM}}', T_TEAM)
{
  const order = ['mirror_plate', 'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets', 'opening_salvo', 'momentum', 'hazard_ward', 'static_charge']
  const lines = ['| # | skill | tag | boss drop | at L10 | PI L10 median / worst |', '|---|---|---|---|---|---|']
  order.forEach((id, i) => {
    const st = singleStats[id]
    lines.push(`| ${i + 1} | **${CARDS[id].name}** | ${CARDS[id].tag} | ${CARDS[id].drop} | ${L10_LINE[id]} | ${st ? `${f2(st.med10)} / ${f2(st.max10)}` : '?'} |`)
  })
  rep('{{T_SKILL_SUMMARY}}', lines.join('\n'))
}
rep('{{T_ROBUST}}', T_ROBUST)
rep('{{T_INCOME}}', T_INCOME)
rep('{{T_SKILLECON}}', T_SKILLECON)
rep('{{CARDS}}', CARDS_MD)
rep('{{I18N}}', I18N_MD)
rep('{{RUNS}}', RUNS)
const meds = Object.values(singleStats).map(s => s.med10)
rep('{{SINGLE_MEDIAN_RANGE}}', `${f2(Math.min(...meds))}–${f2(Math.max(...meds))}×`)
rep('{{SINGLE_MAX}}', `${f2(Math.max(...Object.values(singleStats).map(s => s.max10)))}×`)
rep('{{TEAM_MAX}}', TEAM_MAX)
const wc = confirm.find(c => worstPair && c.pair === worstPair.k && c.st === worstPair.wst && (c.team ?? 'default') === 'default')
rep('{{WORST_PAIR_CI}}', wc ? `paired high-N re-run: ${wc.pi.toFixed(3)}, 95 % CI ${wc.lo95.toFixed(3)}–${wc.hi95.toFixed(3)}` : 'see §3.5')
rep('{{WORST_PAIR}}', worstPair ? `${nice(worstPair.k)} = ${f2(worstPair.worst.pi)}× on stage ${worstPair.wst}` : '?')
for (const id of SKILL_IDS) {
  rep(`{{MED:${id}}}`, singleStats[id] ? f2(singleStats[id].med10) : '?')
  rep(`{{MAX:${id}}}`, singleStats[id] ? f2(singleStats[id].max10) : '?')
}
const left = doc.match(/\{\{[A-Z_:a-z]+\}\}/g)
if (left) console.warn('unfilled placeholders:', [...new Set(left)])
if (missing.length) console.warn('missing result files (tables show "run pending"):', missing.join(', '))
let outFile
if (process.argv.includes('--write')) {
  if (missing.length) {
    console.error('refusing --write while inputs are missing')
    process.exit(1)
  }
  outFile = join(HERE, '..', '..', 'skills-feature.md')
} else {
  mkdirSync(join(HERE, 'out'), { recursive: true })
  outFile = join(HERE, 'out', 'skills-feature.preview.md')
}
writeFileSync(outFile, doc)
console.log('wrote', outFile)
console.log('written', doc.length, 'chars; worst pair', worstPair && nice(worstPair.k), worstPair && f2(worstPair.worst.pi))
