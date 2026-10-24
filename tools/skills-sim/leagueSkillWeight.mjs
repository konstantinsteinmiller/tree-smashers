// League LM5 — is a skill level worth 0.8 power in the league's team power?
//
// src/utils/playerBuild.ts `buildPower` = Σ part levels + round(0.8 × Σ skill
// levels), and leagueMath `expectedScore` was fitted (league.mjs k) on teams
// WITHOUT skills. This checks the weight: the challenger (default team, part
// level L, a 2-skill team loadout at skill level s on every blade) fights a
// skill-less ghost (default team, part level Lo) on the league arena — the
// same battle path as league.mjs k. Lo is set around the challenger's power AT
// THE SHIPPED WEIGHT (ratios 0.85 / 1.0 / 1.15), so a well-calibrated weight
// shows real ≈ E in every skill-level bin. Skill-less cells at the same (L, Lo)
// are the control (they carry E's own ~2 pt parity bias).
//
// Reports the maximum-likelihood weight w (K, P0 fixed at leagueMath's), the
// same fit relative to the control's bias, and real vs E per skill level.
//
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run --want 10 -- node leagueSkillWeight.mjs --n 160 --out out/league-skillweight.json
//   node leagueSkillWeight.mjs --report out/league-skillweight.json
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
// LM5 measured the linear model that shipped then; LG-PWR (leagueSkillPower.mjs) replaced it.
const W_SHIPPED = 0.8
if (!(K > 0 && P0 >= 0 && W_SHIPPED > 0)) throw new Error('constants not found')

// Every skill once, in five pairs (the team's two slots).
const PAIRS = [
  ['guard_shell', 'momentum'],
  ['homing_rockets', 'lucky_edge'],
  ['phase_step', 'second_wind'],
  ['static_charge', 'opening_salvo'],
  ['mirror_plate', 'hazard_ward']
]
const LEVELS = [8, 18, 30, 44]
const SKILL_LEVELS = [0, 2, 5, 10]
const RATIOS = [0.85, 1.0, 1.15]

const E = (own, opp) => 1 / (1 + ((opp + P0) / (own + P0)) ** K)
const powerOf = (c, w) => 4 * c.lvl + w * c.S

/** ML weight on the skilled cells for a logit offset `bias` (Newton-free golden search on w ∈ [0, 3]). */
const logLik = (cells, w, bias = 0) => {
  let ll = 0
  for (const c of cells) {
    const e0 = E(powerOf(c, w), 4 * c.olvl)
    const p = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-(Math.log(e0 / (1 - e0)) + bias)))))
    ll += c.score * Math.log(p) + (c.n - c.score) * Math.log(1 - p)
  }
  return ll
}
const fitW = (cells, bias = 0) => {
  let lo = 0
  let hi = 3
  for (let i = 0; i < 80; i++) {
    const a = lo + (hi - lo) * 0.382
    const b = lo + (hi - lo) * 0.618
    if (logLik(cells, a, bias) < logLik(cells, b, bias)) lo = a
    else hi = b
  }
  return (lo + hi) / 2
}
const fitBias = (cells) => {
  let lo = -2
  let hi = 2
  for (let i = 0; i < 80; i++) {
    const a = lo + (hi - lo) * 0.382
    const b = lo + (hi - lo) * 0.618
    if (logLik(cells, 0, a) < logLik(cells, 0, b)) lo = a
    else hi = b
  }
  return (lo + hi) / 2
}

const report = (file) => {
  const { rows } = JSON.parse(readFileSync(file, 'utf8'))
  const skilled = rows.filter(r => r.S > 0)
  const control = rows.filter(r => r.S === 0)
  const tot = rows.reduce((a, r) => a + r.n, 0)
  const bias = fitBias(control)
  const w = fitW(skilled)
  const wRel = fitW(skilled, bias)
  const perPart = (x) => (x / 4).toFixed(2)
  console.log(`battles ${tot} (skilled ${skilled.reduce((a, r) => a + r.n, 0)}, control ${control.reduce((a, r) => a + r.n, 0)}); K ${K}, P0 ${P0}, shipped weight ${W_SHIPPED}`)
  console.log(`control (no skills): logit bias ${bias.toFixed(3)} (E under-predicts the challenger by that much)`)
  console.log(`ML weight, E as shipped:           w = ${w.toFixed(3)}  (= ${perPart(w)} part level on each of 4 parts per skill level)`)
  console.log(`ML weight, relative to the control: w = ${wRel.toFixed(3)}`)
  console.log('')
  console.log('| skill lvl (each of 2) | Σ skill lvl | battles | real win | E @ 0.8 | diff | control real | control E |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const s of SKILL_LEVELS) {
    const cells = rows.filter(r => r.s === s)
    if (!cells.length) continue
    const n = cells.reduce((a, r) => a + r.n, 0)
    const real = cells.reduce((a, r) => a + r.score, 0) / n
    const e = cells.reduce((a, r) => a + r.n * E(4 * r.lvl + Math.round(W_SHIPPED * r.S), 4 * r.olvl), 0) / n
    console.log(`| ${s} | ${2 * s} | ${n} | ${(100 * real).toFixed(1)} % | ${(100 * e).toFixed(1)} % | ${(100 * (real - e)).toFixed(1)} | | |`)
  }
  console.log('')
  console.log('| part lvl | skill lvl | real | E @ 0.8 | diff | w fit (this L) |')
  console.log('|---|---|---|---|---|---|')
  for (const L of LEVELS) {
    for (const s of SKILL_LEVELS.filter(x => x > 0)) {
      const cells = skilled.filter(r => r.lvl === L && r.s === s)
      if (!cells.length) continue
      const n = cells.reduce((a, r) => a + r.n, 0)
      const real = cells.reduce((a, r) => a + r.score, 0) / n
      const e = cells.reduce((a, r) => a + r.n * E(4 * r.lvl + Math.round(W_SHIPPED * r.S), 4 * r.olvl), 0) / n
      console.log(`| ${L} | ${s} | ${(100 * real).toFixed(1)} % | ${(100 * e).toFixed(1)} % | ${(100 * (real - e)).toFixed(1)} | ${fitW(skilled.filter(r => r.lvl === L && r.s === s)).toFixed(2)} |`)
    }
  }
  console.log('')
  console.log('per pair (all levels): ' + PAIRS.map(p => {
    const k = p.join('+')
    return `${k} w=${fitW(skilled.filter(r => r.pair === k)).toFixed(2)}`
  }).join(', '))
}

if (isMainThread && isEntry) {
  if (process.argv.includes('--report')) {
    report(arg('report'))
    process.exit(0)
  }
  const { regenEngine } = await import('./league.mjs')
  const engineUrl = regenEngine()
  const { DEFAULT_KNOBS } = await import('./bosses100.mjs')
  const N = Number(arg('n', 160))
  const out = arg('out', 'out/league-skillweight.json')
  const tasks = []
  const chunk = 40
  for (const lvl of LEVELS) for (const s of SKILL_LEVELS) for (const r of RATIOS) {
    const pairs = s === 0 ? [null] : PAIRS
    for (const pair of pairs) {
      // ghost level: the challenger's power at the SHIPPED weight, × ratio, /4
      // (the control uses the same Lo as the matching skilled cells)
      const S = 2 * s
      const olvl = Math.max(1, Math.round(((4 * lvl + Math.round(W_SHIPPED * S)) * r) / 4))
      const ctrl = s === 0
      const addFor = (sLvl, S2, p, o) => {
        for (let s0 = 0; s0 < N; s0 += chunk) tasks.push({ lvl, s: sLvl, S: S2, pair: p, olvl: o, s0, n: Math.min(chunk, N - s0) })
      }
      if (ctrl) {
        // control cells at every Lo the skilled cells use for this L and ratio
        for (const sk of SKILL_LEVELS) {
          const o = Math.max(1, Math.round(((4 * lvl + Math.round(W_SHIPPED * 2 * sk)) * r) / 4))
          addFor(0, 0, null, o)
        }
      } else addFor(s, S, pair.join('+'), olvl)
    }
  }
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  console.log(`skill weight: tasks ${tasks.length}, workers ${W}, N ${N}`)
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
        const a = agg.get(r.key)
        if (!a) agg.set(r.key, r)
        else {
          a.n += r.n
          a.score += r.score
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
  writeFileSync(out, JSON.stringify({ n: N, rows }, null, 1))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`)
  report(out)
} else if (!isMainThread && workerData?.engineUrl) {
  const { runBattle, teamFor } = await import(workerData.engineUrl)
  const knobs = workerData.knobs
  const scoreOf = (res) => (res.result === 'win' ? 1 : res.result === 'timeout' ? 0.5 : 0)
  parentPort.on('message', (t) => {
    const team = teamFor('default', 50, t.lvl)
    const ghost = teamFor('default', 50, t.olvl).map(c => ({ ...c }))
    const stage = { id: 50, name: 'league', isBoss: false, arenaType: 'default', enemyTeam: ghost }
    const skills = t.pair ? t.pair.split('+').map(id => ({ id, level: t.s })) : []
    const loadouts = team.map(() => skills.map(k => ({ ...k })))
    let score = 0
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      // common random numbers across skill levels / pairs for one (L, Lo)
      const seed = (t.lvl * 7919 + t.olvl * 104729 + i * 15485863) | 0
      score += scoreOf(runBattle({ stageId: 50, stage, team, loadouts, seed, playerStarts: i % 2 === 0, mode: 'real', knobs, npcTuning: workerData.npcTuning === 'on' }))
    }
    parentPort.postMessage({ key: `${t.lvl}|${t.s}|${t.pair ?? ''}|${t.olvl}`, lvl: t.lvl, s: t.s, S: t.S, pair: t.pair, olvl: t.olvl, n: t.n, score })
  })
}
