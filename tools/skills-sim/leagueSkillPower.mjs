// League LG-PWR — what is a skill worth in the league's team power?
//
// Successor to leagueSkillWeight.mjs (LM5), which found that no single linear
// weight fits and which measured on DEFAULT-vs-DEFAULT mirrors only (a mirror's
// win curve is far steeper than E's, so a stronger ghost read as "skills are
// worth less"). This run uses league.mjs k's grid instead — 4 × 4 archetypes
// (default / glass / tank / spiky), the challenger policy against the ghost
// NPC AI on the league arena — so the slope is the one E was fitted on.
//
// Challenger: archetype a at part level L with a two-skill team loadout (the
// same five pairs as LM5, covering all ten skills) at levels (A, B); B = 0 is
// a single-skill loadout, A = B = 0 the skill-less control. Ghost: archetype
// b, skill-less, part level round(L × r). Common random numbers per
// (a, b, L, Lo, battle).
//
//   run     simulate → --out file, then report
//   report  real vs E per bin for the SHIPPED buildPower (imported from
//           src/utils/playerBuild.ts) next to the LM5 linear 0.8 model
//   fit     maximum-likelihood fit of the model family
//             skillPower = round((parts + base) × Σ g(lv) / 1000),
//             g(lv) = round(a × lv^p)   (a front-loaded concave curve)
//           prints the best (base, a, p) and the integer g table.
//
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run --want 10 -- node leagueSkillPower.mjs run --n 24 --out out/league-skillpower.json
//   node leagueSkillPower.mjs report out/league-skillpower.json
//   node leagueSkillPower.mjs fit out/league-skillpower.json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import os from 'node:os'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const __file = fileURLToPath(import.meta.url)
const isEntry = !!process.argv[1] && resolve(process.argv[1]) === __file
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}

const mathSrc = readFileSync(`${HERE}../../src/league/leagueMath.ts`, 'utf8')
const num = (src, name) => Number(new RegExp(`export const ${name}\\s*=\\s*([0-9.]+)`).exec(src)?.[1])
const K = num(mathSrc, 'LEAGUE_K')
const P0 = num(mathSrc, 'LEAGUE_POWER_OFFSET')
if (!(K > 0 && P0 >= 0)) throw new Error('leagueMath constants not found')

const ARCH = ['default', 'glass', 'tank', 'spiky']
const PAIRS = [
  ['guard_shell', 'momentum'],
  ['homing_rockets', 'lucky_edge'],
  ['phase_step', 'second_wind'],
  ['static_charge', 'opening_salvo'],
  ['mirror_plate', 'hazard_ward']
]
const LEVELS = [6, 12, 20, 30, 44]
/** [A, B] skill levels; [0, 0] = control, [x, 0] = one skill. */
const LOADOUTS = [[0, 0], [1, 1], [2, 2], [3, 3], [5, 5], [7, 7], [10, 10], [3, 0], [10, 0], [5, 1], [10, 2]]
const RATIOS = [0.8, 0.95, 1.1, 1.25, 1.45]

const E = (own, opp) => 1 / (1 + ((opp + P0) / (own + P0)) ** K)
const logit = (p) => Math.log(p / (1 - p))
const sigm = (x) => 1 / (1 + Math.exp(-x))
const lvsOf = (r) => [r.A, r.B].filter(x => x > 0)

/** LM5's shipped model (linear 0.8), for the "before" column. */
const linearPower = (parts, lvs) => parts + Math.round(0.8 * lvs.reduce((a, b) => a + b, 0))
/** The model family, mirroring playerBuild.ts's integer arithmetic. */
const familyPower = (base, g) => (parts, lvs) => {
  let sum = 0
  for (const lv of lvs) sum += g[lv - 1]
  return parts + Math.round(((parts + base) * sum) / 1000)
}
const gTable = (a, p) => Array.from({ length: 10 }, (_, i) => Math.round(a * (i + 1) ** p))

const logLik = (rows, power, bias) => {
  let ll = 0
  for (const r of rows) {
    const e = E(power(4 * r.lvl, lvsOf(r)), 4 * r.olvl)
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigm(logit(e) + bias)))
    ll += r.score * Math.log(p) + (r.n - r.score) * Math.log(1 - p)
  }
  return ll
}
const golden = (f, lo, hi, it = 80) => {
  for (let i = 0; i < it; i++) {
    const a = lo + (hi - lo) * 0.382
    const b = lo + (hi - lo) * 0.618
    if (f(a) < f(b)) lo = a
    else hi = b
  }
  return (lo + hi) / 2
}
/** E's own logit bias on the skill-less control (challenger policy edge). */
const controlBias = (rows) => golden(b => logLik(rows.filter(r => r.A === 0), (p) => p, b), -2, 2)

const binTable = (rows, models, key, label) => {
  const bins = new Map()
  for (const r of rows) {
    const k = key(r)
    const a = bins.get(k) ?? { n: 0, s: 0, e: models.map(() => 0) }
    a.n += r.n
    a.s += r.score
    models.forEach((m, i) => { a.e[i] += r.n * E(m.power(4 * r.lvl, lvsOf(r)), 4 * r.olvl) })
    bins.set(k, a)
  }
  console.log(`| ${label} | battles | real | ${models.map(m => `E ${m.name} | diff`).join(' | ')} |`)
  console.log(`|---|---|---|${models.map(() => '---|---').join('|')}|`)
  const max = models.map(() => 0)
  for (const [k, a] of bins) {
    const real = a.s / a.n
    const cols = models.map((m, i) => {
      const e = a.e[i] / a.n
      max[i] = Math.max(max[i], Math.abs(real - e))
      return `${(100 * e).toFixed(1)} % | ${(100 * (real - e)).toFixed(1)}`
    })
    console.log(`| ${k} | ${a.n} | ${(100 * real).toFixed(1)} % | ${cols.join(' | ')} |`)
  }
  console.log(`max |diff|: ${models.map((m, i) => `${m.name} ${(100 * max[i]).toFixed(1)}`).join(', ')}\n`)
}

const load = (file) => JSON.parse(readFileSync(file, 'utf8')).rows

const report = async (file) => {
  const rows = load(file)
  const { buildPower } = await import('../../src/utils/playerBuild.ts')
  const shipped = (parts, lvs) => {
    const l = Math.floor(parts / 4)
    const extra = parts - 4 * l
    const team = [0, 1].map(i => ({ t: 'round', b: 'tanky', tl: l + (i < extra ? 1 : 0), bl: l + (i + 2 < extra ? 1 : 0), m: 'x' }))
    return buildPower({ v: 1, team, sk: lvs.map((lv, i) => ({ id: `s${i}`, lv })) })
  }
  const models = [{ name: 'linear 0.8', power: linearPower }, { name: 'shipped', power: shipped }]
  // --base B --g 1,2,…  adds a candidate of the model family as a third column
  if (arg('g')) models.push({ name: 'candidate', power: familyPower(Number(arg('base', 0)), arg('g').split(',').map(Number)) })
  const tot = rows.reduce((a, r) => a + r.n, 0)
  const ctrl = rows.filter(r => r.A === 0)
  const bias = controlBias(rows)
  console.log(`battles ${tot} (control ${ctrl.reduce((a, r) => a + r.n, 0)}); K ${K}, P0 ${P0}; control logit bias ${bias.toFixed(3)}\n`)
  const lo = (r) => `${r.A}+${r.B}`
  binTable(rows, models, lo, 'skill lvls')
  binTable(rows.filter(r => r.A > 0), models, (r) => `L${r.lvl}`, 'part lvl (skilled)')
  binTable(ctrl, models, (r) => `L${r.lvl}`, 'part lvl (control)')
  binTable(rows.filter(r => r.A > 0), models, (r) => `L${r.lvl} ${lo(r)}`, 'part lvl × skills')
  binTable(rows.filter(r => r.A > 0), models, (r) => r.pair, 'pair')
  binTable(rows.filter(r => r.A > 0), models, (r) => r.a, 'challenger archetype')
  binTable(rows, models, (r) => r.ratio.toFixed(2), 'ghost ratio (part lvl)')
}

/** E only sees (L, Lo, levels): pool archetypes and pairs for the fit. */
const pool = (rows) => {
  const m = new Map()
  for (const r of rows) {
    const k = `${r.lvl}|${r.olvl}|${r.A}|${r.B}`
    const x = m.get(k) ?? { lvl: r.lvl, olvl: r.olvl, A: r.A, B: r.B, n: 0, score: 0 }
    x.n += r.n
    x.score += r.score
    m.set(k, x)
  }
  return [...m.values()]
}

const fit = (file) => {
  const rows = pool(load(file))
  const bias = controlBias(rows)
  const skilled = rows.filter(r => r.A > 0)
  console.log(`control logit bias ${bias.toFixed(3)} (held fixed; the skill value is fitted net of it)`)
  // Nonparametric view: per loadout, the ML multiplier m on (parts + base).
  for (const base of [0, 31, 62, 93, 124]) {
    let line = `base ${String(base).padStart(3)}:`
    let ll = 0
    for (const [A, B] of LOADOUTS.filter(([a]) => a > 0)) {
      const cells = skilled.filter(r => r.A === A && r.B === B)
      const pw = (m) => (parts) => parts + (parts + base) * m
      const m = golden(x => logLik(cells, pw(x), bias), -0.2, 1.5)
      ll += logLik(cells, pw(m), bias)
      // per part level multiplier, to see whether (parts + base) is the right scale
      const perL = LEVELS.map(L => golden(x => logLik(cells.filter(r => r.lvl === L), pw(x), bias), -0.5, 2).toFixed(3))
      line += `\n   ${A}+${B}: m ${(1000 * m).toFixed(0)}‰  per L ${perL.join(' ')}`
    }
    console.log(`${line}\n   total LL ${ll.toFixed(1)}`)
  }
  // Parametric: base, a, p on an integer grid of base, golden on a and p.
  let best = null
  for (let base = 0; base <= 160; base += 2) {
    if (arg('base') && base !== Number(arg('base'))) continue
    for (let p = 0.2; p <= 1.001; p += 0.02) {
      const a = golden(x => logLik(skilled, familyPower(base, gTable(x, p)), bias), 1, 300, 50)
      const ll = logLik(skilled, familyPower(base, gTable(a, p)), bias)
      if (!best || ll > best.ll) best = { base, p, a, ll }
    }
  }
  console.log(`\nbest: base ${best.base}, a ${best.a.toFixed(2)}, p ${best.p.toFixed(2)}, LL ${best.ll.toFixed(1)}`)
  console.log(`g table (‰ of parts + base per skill): [${gTable(best.a, best.p).join(', ')}]`)
  const lin = golden(w => logLik(skilled, (parts, lvs) => parts + w * lvs.reduce((x, y) => x + y, 0), bias), 0, 5)
  console.log(`for reference: best linear weight net of the control bias ${lin.toFixed(3)}, LL ${logLik(skilled, (parts, lvs) => parts + lin * lvs.reduce((x, y) => x + y, 0), bias).toFixed(1)}`)
}

if (isMainThread && isEntry) {
  const mode = process.argv[2]
  if (mode === 'report') {
    await report(process.argv[3])
    process.exit(0)
  }
  if (mode === 'fit') {
    fit(process.argv[3])
    process.exit(0)
  }
  if (mode !== 'run') throw new Error('usage: node leagueSkillPower.mjs run|report|fit …')
  const { regenEngine } = await import('./league.mjs')
  const engineUrl = regenEngine()
  const { DEFAULT_KNOBS } = await import('./bosses100.mjs')
  const N = Number(arg('n', 24))
  const NC = Number(arg('nc', 5 * N)) // the control carries every skilled cell's baseline
  const out = arg('out', 'out/league-skillpower.json')
  const tasks = []
  const chunk = 24
  for (const a of ARCH) for (const b of ARCH) for (const lvl of LEVELS) for (const ratio of RATIOS) {
    const olvl = Math.max(1, Math.round(lvl * ratio))
    for (const [A, B] of LOADOUTS) {
      const pairs = A === 0 ? [null] : PAIRS
      const n = A === 0 ? NC : N
      for (const pair of pairs) {
        for (let s0 = 0; s0 < n; s0 += chunk) tasks.push({ a, b, lvl, olvl, ratio, A, B, pair: pair?.join('+') ?? null, s0, n: Math.min(chunk, n - s0) })
      }
    }
  }
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  console.log(`skill power: tasks ${tasks.length}, battles ${tasks.reduce((x, t) => x + t.n, 0)}, workers ${W}`)
  const agg = new Map()
  const t0 = Date.now()
  await new Promise((done) => {
    let next = 0
    let alive = W
    for (let w = 0; w < W; w++) {
      const worker = new Worker(__file, { workerData: { engineUrl, npcTuning: arg('npcTuning', null), knobs: DEFAULT_KNOBS } })
      const feed = () => {
        if (next >= tasks.length) {
          worker.terminate()
          if (--alive === 0) done()
          return
        }
        worker.postMessage(tasks[next++])
      }
      worker.on('message', (r) => {
        const x = agg.get(r.key)
        if (!x) agg.set(r.key, r)
        else {
          x.n += r.n
          x.score += r.score
        }
        feed()
      })
      worker.on('error', (err) => {
        console.error(err)
        process.exit(1)
      })
      feed()
    }
  })
  const rows = [...agg.values()]
  writeFileSync(out, JSON.stringify({ n: N, nc: NC, rows }))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`)
  await report(out)
} else if (!isMainThread && workerData?.engineUrl) {
  const { runBattle, teamFor } = await import(workerData.engineUrl)
  const knobs = workerData.knobs
  const scoreOf = (res) => (res.result === 'win' ? 1 : res.result === 'timeout' ? 0.5 : 0)
  parentPort.on('message', (t) => {
    const team = teamFor(t.a, 50, t.lvl)
    const ghost = teamFor(t.b, 50, t.olvl).map(c => ({ ...c }))
    const stage = { id: 50, name: 'league', isBoss: false, arenaType: 'default', enemyTeam: ghost }
    const ids = t.pair ? t.pair.split('+') : []
    const skills = [[ids[0], t.A], [ids[1], t.B]].filter(([id, lv]) => id && lv > 0).map(([id, level]) => ({ id, level }))
    const loadouts = team.map(() => skills.map(k => ({ ...k })))
    let score = 0
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      const seed = ((t.lvl * 7919 + t.olvl * 104729 + i * 15485863) ^ (ARCH.indexOf(t.a) * 31 + ARCH.indexOf(t.b) * 977)) | 0
      score += scoreOf(runBattle({ stageId: 50, stage, team, loadouts, seed, playerStarts: i % 2 === 0, mode: 'real', knobs, npcTuning: workerData.npcTuning === 'on' }))
    }
    parentPort.postMessage({
      key: `${t.a}|${t.b}|${t.lvl}|${t.olvl}|${t.A}|${t.B}|${t.pair ?? ''}`,
      a: t.a, b: t.b, lvl: t.lvl, olvl: t.olvl, ratio: t.ratio, A: t.A, B: t.B, pair: t.pair, n: t.n, score
    })
  })
}
