// Sim ↔ real-engine parity check for smasher teams and campaign NPC tuning.
//
// Plays the SAME fixed matchups (stage, team, smasher levels, seeds) on
//   game: the real headless engine — validate/engineParity.sim.test.ts, sharded
//         over ≤ 10 vitest processes (the tests/balance.sim.test.ts driver:
//         scripted player, skills + boss traits on, seeded), and
//   sim:  engine.mjs with policy 'scripted' and the same 4-minute battle cap,
// on the battlefield both have: the stage's arena and power-ups, no
// terrain, no team towers. The two engines draw from different random streams,
// so a seed is NOT the same battle on both sides — agreement is statistical:
// win rate (timeouts ½) and the end-of-battle HP margin (player HP share left −
// enemy HP share left) per matchup, with a two-proportion z score.
//
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run -- node validate.mjs --n 120 --out out/parity.json      # ~5 min
//   node validate.mjs --game out/parity-game.json --n 120                 # sim side only, reuse a game run
//   node validate.mjs --report out/parity.json
// Options: --n seeds per matchup (default 120) · --only key1,key2 · --npcTuning off (sim side)
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBattle, teamFor } from './engine.mjs'
import { getStageById, SMASHERS, RELEASED_SMASHER_IDS } from './data.mjs'
import { econLevel, smasherEconLevels } from './econ.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '../..')
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}

// ── Matchups ───────────────────────────────────────────────────────────────
// Smasher teams at the game-side campaign economy (smasherEconLevels = the
// balance test's campLevels) over every arena kind, regular + boss stages;
// two part-only control teams (the pre-smasher player model).
const newestBy = (stage) => {
  const un = RELEASED_SMASHER_IDS.filter(id => SMASHERS[id].unlockStage <= stage)
  return `${un[un.length - 1]}+${un[un.length - 2]}`
}
const MATCHUPS = [
  ...[3, 7, 12, 13, 20, 30, 45, 61, 85, 99].map(st => ({ team: 'smashers', st })),
  { team: 'grizzle+vixie', st: 35 },
  { team: 'grizzle+vixie', st: 52 },
  { team: 'shellby+pecks', st: 74 },
  { team: newestBy(100), st: 100 },
  { team: 'default', st: 20 },
  { team: 'default', st: 50 }
].map(m => {
  const lvl = m.team === 'default' ? econLevel(m.st) : smasherEconLevels(m.st)
  return { ...m, lvl, key: `${m.team}@${m.st}` }
})

const N = Number(arg('n', 120))
const only = arg('only', null)?.split(',')
const matchups = only ? MATCHUPS.filter(m => only.includes(m.key)) : MATCHUPS
const seedOf = (mi, s) => 70000 + mi * 1000 + s
const jobs = []
matchups.forEach((m) => {
  const mi = MATCHUPS.indexOf(m)
  for (let s = 0; s < N; s++) jobs.push({ key: m.key, player: teamFor(m.team, m.st, m.lvl), stage: m.st, seed: seedOf(mi, s) })
})

// ── Game side ──────────────────────────────────────────────────────────────
const runGame = async () => {
  const n = Math.max(1, Math.min(10, availableParallelism()))
  const dir = join(tmpdir(), `skills-sim-parity-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const jobFile = join(dir, 'jobs.json')
  writeFileSync(jobFile, JSON.stringify(jobs))
  const t0 = Date.now()
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((ok, fail) => {
    const out = join(dir, `shard-${i}.json`)
    const p = spawn('npx', ['vitest', 'run', 'tools/skills-sim/validate/engineParity.sim.test.ts', '--maxWorkers=1', '--reporter=dot'], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, SKILLS_SIM_PARITY: jobFile, PARITY_SHARD: `${i}/${n}`, PARITY_OUT: out }
    })
    let err = ''
    p.stderr.on('data', d => (err += d))
    p.on('exit', code => (code === 0 && existsSync(out) ? ok() : fail(new Error(`shard ${i} failed (${code})\n${err.slice(-2000)}`))))
  })))
  const rows = Array.from({ length: n }, (_, i) => JSON.parse(readFileSync(join(dir, `shard-${i}.json`), 'utf8'))).flat()
  rmSync(dir, { recursive: true, force: true })
  console.log(`game: ${rows.length} battles in ${((Date.now() - t0) / 1000).toFixed(0)} s (${n} shards)`)
  return rows
}

// ── Sim side ───────────────────────────────────────────────────────────────
// 14 400 frames of 17 ms (the harness cap) in 60 Hz engine ticks
const MAX_TICKS = Math.round(60 * 60 * 4 * 17 / (1000 / 60))
const runSim = () => jobs.map(j => {
  const r = runBattle({
    stageId: j.stage, team: j.player, seed: j.seed, playerStarts: j.seed % 2 === 0,
    policy: 'scripted', maxTurns: Infinity, maxTicks: MAX_TICKS, npcTuning: arg('npcTuning', 'on') !== 'off'
  })
  return { key: j.key, seed: j.seed, r: r.result === 'win' ? 1 : r.result === 'lose' ? 0 : 0.5, pHp: r.pHp, nHp: r.nHp }
})

// ── Compare ────────────────────────────────────────────────────────────────
const summarize = (rows) => {
  const by = new Map()
  for (const x of rows) {
    const a = by.get(x.key) ?? { n: 0, w: 0, t: 0, m: 0, m2: 0 }
    a.n++
    a.w += x.r
    if (x.r === 0.5) a.t++
    const mg = x.pHp - x.nHp
    a.m += mg
    a.m2 += mg * mg
    by.set(x.key, a)
  }
  return by
}
const report = (res) => {
  const G = summarize(res.game)
  const S = summarize(res.sim)
  const pct = (v) => `${(100 * v).toFixed(1)}%`
  console.log(`\n| matchup | levels | arena | n | game win | sim win | Δ win | z | game margin | sim margin | Δ margin (±2SE) |`)
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  let absSum = 0, over2 = 0, k = 0, xs = [], ys = []
  for (const m of res.matchups) {
    const g = G.get(m.key), s = S.get(m.key)
    if (!g || !s) continue
    const pg = g.w / g.n, psim = s.w / s.n
    const pool = (g.w + s.w) / (g.n + s.n)
    const se = Math.sqrt(Math.max(1e-9, pool * (1 - pool) * (1 / g.n + 1 / s.n)))
    const z = (psim - pg) / se
    const mg = g.m / g.n, ms = s.m / s.n
    const vg = g.m2 / g.n - mg * mg, vs = s.m2 / s.n - ms * ms
    const seM = Math.sqrt(vg / g.n + vs / s.n)
    const st = getStageById(m.st)
    absSum += Math.abs(psim - pg)
    if (Math.abs(z) > 2) over2++
    k++
    xs.push(pg)
    ys.push(psim)
    console.log(`| ${m.key} | ${Array.isArray(m.lvl) ? m.lvl.join('/') : `parts ${m.lvl}`} | ${st.arenaType ?? 'default'}${st.isBoss && st.arenaType !== 'boss' ? ' boss' : ''} | ${g.n} | ${pct(pg)} | ${pct(psim)} | ${((psim - pg) * 100).toFixed(1)} | ${z.toFixed(2)} | ${mg.toFixed(3)} | ${ms.toFixed(3)} | ${(ms - mg).toFixed(3)} ± ${(2 * seM).toFixed(3)} |`)
  }
  const mean = (a) => a.reduce((p, v) => p + v, 0) / a.length
  const mx = mean(xs), my = mean(ys)
  const cov = xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0)
  const r = cov / Math.sqrt(xs.reduce((p, x) => p + (x - mx) ** 2, 0) * ys.reduce((p, y) => p + (y - my) ** 2, 0))
  const allG = res.game.reduce((p, x) => p + x.r, 0) / res.game.length
  const allS = res.sim.reduce((p, x) => p + x.r, 0) / res.sim.length
  console.log(`\nmatchups ${k} · mean |Δ win| ${(100 * absSum / k).toFixed(1)} pts · |z| > 2 in ${over2} · Pearson r(win) ${r.toFixed(3)} · pooled win game ${pct(allG)} / sim ${pct(allS)}`)
}

if (process.argv.includes('--report')) {
  report(JSON.parse(readFileSync(arg('report'), 'utf8')))
  process.exit(0)
}
mkdirSync(join(HERE, 'out'), { recursive: true })
const gameFile = arg('game', null)
const game = gameFile ? JSON.parse(readFileSync(gameFile, 'utf8')) : await runGame()
if (!gameFile) writeFileSync(join(HERE, 'out/parity-game.json'), JSON.stringify(game))
const t0 = Date.now()
const sim = runSim()
console.log(`sim: ${sim.length} battles in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
const res = { at: new Date().toISOString(), n: N, matchups, game, sim }
writeFileSync(arg('out', join(HERE, 'out/parity.json')), JSON.stringify(res))
report(res)
