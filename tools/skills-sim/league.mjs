// League calibration (LG0) — the two fitted tables in src/league/leagueMath.ts.
//
//   k      fits LEAGUE_K and LEAGUE_POWER_OFFSET (P0) in expectedScore(own, opp)
//          = 1 / (1 + ((opp + P0) / (own + P0))^K) (a logistic of the log power ratio) by maximum likelihood on simulated
//          league battles: the challenger's team (player policy) against a
//          ghost team (NPC AI) — the league battle path (F8, ghostMode).
//          Grid: 4 x 4 team archetypes x own part level x power ratio, every
//          side 2 blades, power = sum of the 4 part levels (no skills).
//          Timeouts count as half a win. Prints K, the parity win rate, the
//          reliability table (predicted vs real per ratio bin), Brier score and
//          the per-level K so a drift with level shows up.
//   floor  fits TIER_FLOOR_POWER[tier] / GATEKEEPER_LEVEL[tier]: every part of the gatekeeper roster at
//          one level Lg, the challenger = the DEFAULT team at TIER_FLOOR_POWER
//          (power / 4 per part, remainder on the tops). Sweeps Lg and reports the
//          win rate with a 95 % CI; the chosen level must land in 55-65 %.
//          Rosters: split / healers / thunder = buildCheatBossStage's rosters
//          (useSpinnerCampaign.ts, 'boss' arena — the ones LG7 extracts as
//          buildAbilityBossStage); cinder_tyrant / glacier_warden /
//          elemental_court = src/data/bossEncounters.ts via bosses100.mjs
//          (authored arena + traits, patched engine).
//          --fallback: the bosses100-OFF build (LG7) — Platinum / Diamond /
//          Champion are classic ability bosses instead (LEAGUE_GATEKEEPER_FALLBACK
//          in src/league/leagueGatekeepers.ts: stat-switch / life-leech / partners,
//          buildAbilityBossStage rosters) at GATEKEEPER_FALLBACK_LEVEL (read
//          from the same file); no traits, 'boss' arena.
//
// The battle replica is bosses100.mjs's patched engine (ember / frost / chill
// traits + opts.stage), regenerated at start so a changed engine.mjs flows in.
//
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run --want 10 -- node league.mjs k --n 120 --out out/league-k.json
//   node "$B" run --want 10 -- node league.mjs floor --n 600 --out out/league-floor.json
//   node "$B" run --want 10 -- node league.mjs floor --fallback --tiers platinum,diamond,champion --n 1000 --span 1 --out out/league-floor-fallback.json
//   node league.mjs --report out/league-k.json      (or the floor file)
// Options (floor): --tiers bronze,gold  --span 4 (levels tried around the guess)  --fallback
// --npcTuning on|off: CAMPAIGN_NPC_TUNING on the NPC side. Default: off for k-mode ghosts
//   (they stand in for another player's smasher team), on for floor gatekeepers
//   (part-only bosses, as in the game). off reproduces the pre-smasher fits.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import os from 'node:os'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const __file = fileURLToPath(import.meta.url)
const isEntry = !!process.argv[1] && resolve(process.argv[1]) === __file
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}

// The values leagueMath.ts ships — the floor mode verifies against these.
const leagueMathSrc = readFileSync(`${HERE}../../src/league/leagueMath.ts`, 'utf8')
const tableOf = (name, src = leagueMathSrc) => {
  const m = new RegExp(`export const ${name}[^=]*=\\s*(?:/\\*[^*]*\\*/\\s*)?Object\\.freeze\\((\\{[^}]*\\})\\)`).exec(src)
  if (!m) throw new Error(`${name} not found`)
  return new Function(`return (${m[1]})`)()
}
export const TIER_FLOOR_POWER = tableOf('TIER_FLOOR_POWER')
export const GATEKEEPER_LEVEL = tableOf('GATEKEEPER_LEVEL')
// bosses100-off fallback gates (LG7) — src/league/leagueGatekeepers.ts.
const gatekeepersSrc = readFileSync(`${HERE}../../src/league/leagueGatekeepers.ts`, 'utf8')
export const GATEKEEPER_FALLBACK_LEVEL = tableOf('GATEKEEPER_FALLBACK_LEVEL', gatekeepersSrc)
export const LEAGUE_GATEKEEPER_FALLBACK = tableOf('LEAGUE_GATEKEEPER_FALLBACK', gatekeepersSrc)
const FALLBACK = process.argv.includes('--fallback')

const GATE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion']
// buildCheatBossStage rosters (useSpinnerCampaign.ts) — LG7 extracts them.
const e = (top, bot, modelId, ability) => ({ topPartId: top, bottomPartId: bot, modelId, isBoss: true, bossAbility: ability })
const CLASSIC = {
  bronze: [e('round', 'tanky', 'piranha', 'split')],
  silver: [
    e('cushioned', 'balanced', 'mountain', 'healers'),
    e('round', 'balanced', 'piranha', 'healers'),
    e('cushioned', 'balanced', 'gear', 'healers'),
    e('quadratic', 'balanced', 'mysticaleye', 'healers')
  ],
  gold: [e('triangle', 'tanky', 'thunderstorm', 'thunder')]
}
// buildAbilityBossStage rosters of the fallback abilities (tests/leagueGatekeepers
// pins these against the real builder).
export const ABILITY_ROSTERS = {
  split: CLASSIC.bronze,
  healers: CLASSIC.silver,
  thunder: CLASSIC.gold,
  'stat-switch': [e('cushioned', 'tanky', 'boulder', 'stat-switch')],
  'life-leech': [e('triangle', 'speedy', 'snake', 'life-leech')],
  partners: [
    e('cushioned', 'tanky', 'castle', 'partners'),
    e('round', 'tanky', 'turtle', 'partners'),
    e('quadratic', 'balanced', 'mysticaleye', 'partners')
  ],
  ghost: [e('triangle', 'speedy', 'snake', 'ghost')],
  'child-emitter': [e('round', 'tanky', 'dark', 'child-emitter')]
}
export const CLASSIC_ROSTERS = CLASSIC
const gateLevel = (tier) => (FALLBACK && LEAGUE_GATEKEEPER_FALLBACK[tier] ? GATEKEEPER_FALLBACK_LEVEL[tier] : GATEKEEPER_LEVEL[tier])
const ENCOUNTER_SLOT = { platinum: 110, diamond: 120, champion: 200 } // cinder_tyrant, glacier_warden, elemental_court

export const regenEngine = () => {
  mkdirSync(`${HERE}out`, { recursive: true })
  // --n 0: patch + write out/engine-bosses.gen.mjs, run no battles
  execFileSync(process.execPath, [`${HERE}bosses100.mjs`, '--n', '0', '--noold', '--slots', '110', '--out', `${HERE}out/league-engine-regen.json`],
    { stdio: 'ignore', env: { ...process.env, WORKER_BUDGET_WORKERS: '1' } })
  return pathToFileURL(`${HERE}out/engine-bosses.gen.mjs`).href
}

// ─── fitting ─────────────────────────────────────────────────────────────────
// E = 1 / (1 + ((opp + P0) / (own + P0))^K). A plain ratio (P0 = 0) fits
// badly across levels — part upgrades ADD to base stats, so at low levels a
// level ratio overstates the real strength ratio (per-level K ran 1.3 at L4 to
// 4.9 at L48). The offset P0 absorbs the base stats; K is then level-flat.
const expected = (x, K) => 1 / (1 + Math.exp(-K * x))
const lnr = (c, P0) => Math.log((c.own + P0) / (c.opp + P0))
/** Max-likelihood K for a fixed P0 — Newton on the 1-D log-likelihood. */
const fitK = (cells, P0 = 0) => {
  let K = 2
  for (let it = 0; it < 80; it++) {
    let g = 0
    let h = 0
    for (const c of cells) {
      const x = lnr(c, P0)
      const p = expected(x, K)
      g += x * (c.s - c.n * p)
      h -= c.n * x * x * p * (1 - p)
    }
    const step = g / h
    K -= step
    if (Math.abs(step) < 1e-9) break
  }
  return K
}
const logLik = (cells, K, P0) => {
  let ll = 0
  for (const c of cells) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, expected(lnr(c, P0), K)))
    ll += c.s * Math.log(p) + (c.n - c.s) * Math.log(1 - p)
  }
  return ll
}
/** Joint fit: golden-free integer grid on P0 (0…200), ML K at each. */
const fitKP0 = (cells) => {
  let best = { K: fitK(cells, 0), P0: 0 }
  best.ll = logLik(cells, best.K, 0)
  for (let P0 = 1; P0 <= 200; P0++) {
    const K = fitK(cells, P0)
    const ll = logLik(cells, K, P0)
    if (ll > best.ll) best = { K, P0, ll }
  }
  return best
}
const brier = (cells, K, P0) => {
  // per-battle Brier from cell sums: s(1-p)^2 + (n-s)p^2 (a timeout's 0.5 blurs it slightly)
  let sum = 0
  let n = 0
  for (const c of cells) {
    const p = expected(lnr(c, P0), K)
    sum += c.s * (1 - p) ** 2 + (c.n - c.s) * p * p
    n += c.n
  }
  return sum / n
}

const reportK = (rows) => {
  const cells = rows.map(r => ({ s: r.score, n: r.n, lvl: r.lvl, own: r.own, opp: r.opp }))
  const K0 = fitK(cells, 0)
  const { K, P0 } = fitKP0(cells)
  const tot = cells.reduce((a, c) => a + c.n, 0)
  const par = cells.filter(c => c.own === c.opp)
  const parWr = par.reduce((a, c) => a + c.s, 0) / par.reduce((a, c) => a + c.n, 0)
  console.log(`battles ${tot}, cells ${cells.length}, parity win rate ${(100 * parWr).toFixed(1)} %  (coin-flip Brier 0.2500)`)
  console.log(`plain ratio:  K = ${K0.toFixed(3)}  Brier ${brier(cells, K0, 0).toFixed(4)}`)
  console.log(`with offset:  K = ${K.toFixed(3)}  P0 = ${P0}  Brier ${brier(cells, K, P0).toFixed(4)}`)
  const table = (label, key) => {
    const bins = new Map()
    for (const c of cells) {
      const b = key(c)
      const a = bins.get(b) ?? { n: 0, s: 0, p: 0 }
      a.n += c.n
      a.s += c.s
      a.p += c.n * expected(lnr(c, P0), K)
      bins.set(b, a)
    }
    console.log(`| ${label} | battles | real win | E | diff |`)
    console.log('|---|---|---|---|---|')
    let maxAbs = 0
    for (const [b, a] of [...bins].sort((p, q) => p[0] - q[0])) {
      const d = a.s / a.n - a.p / a.n
      maxAbs = Math.max(maxAbs, Math.abs(d))
      console.log(`| ${b} | ${a.n} | ${(100 * a.s / a.n).toFixed(1)} % | ${(100 * a.p / a.n).toFixed(1)} % | ${(100 * d).toFixed(1)} |`)
    }
    console.log(`max |real - E|: ${(100 * maxAbs).toFixed(1)} pts`)
  }
  table('own/opp', c => (Math.round((c.own / c.opp) * 10) / 10).toFixed(1))
  table('E decile', c => Math.min(9, Math.floor(10 * expected(lnr(c, P0), K))) / 10)
  const lvls = [...new Set(cells.map(c => c.lvl))].sort((a, b) => a - b)
  console.log('per own part level K (plain ratio): ' + lvls.map(l => `L${l} ${fitK(cells.filter(c => c.lvl === l), 0).toFixed(2)}`).join(', '))
  console.log(`per own part level K (P0 ${P0}):      ` + lvls.map(l => `L${l} ${fitK(cells.filter(c => c.lvl === l), P0).toFixed(2)}`).join(', '))
  const arch = [...new Set(rows.map(r => r.a))]
  console.log('parity win by own archetype (all ghosts): ' + arch.map(a => {
    const p = rows.filter(r => r.a === a && r.own === r.opp)
    return `${a} ${(100 * p.reduce((x, r) => x + r.score, 0) / p.reduce((x, r) => x + r.n, 0)).toFixed(0)} %`
  }).join(', '))
}

const reportFloor = (rows) => {
  console.log('| tier | floor power | player part lvl | gatekeeper lvl | battles | win | 95 % CI | shipped |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const p = r.score / r.n
    const ci = 1.96 * Math.sqrt(p * (1 - p) / r.n)
    const shipped = r.fallback ? GATEKEEPER_FALLBACK_LEVEL[r.tier] : GATEKEEPER_LEVEL[r.tier]
    const mark = shipped === r.glvl && TIER_FLOOR_POWER[r.tier] === r.power ? (p >= 0.55 && p <= 0.65 ? 'OK' : 'OUT') : ''
    console.log(`| ${r.tier}${r.fallback ? ` (${r.fallback})` : ''} | ${r.power} | ${r.plvl} | ${r.glvl} | ${r.n} | ${(100 * p).toFixed(1)} % | ±${(100 * ci).toFixed(1)} | ${mark} |`)
  }
}

const report = (file) => {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data.mode === 'k') reportK(data.rows)
  else reportFloor(data.rows)
}

// ─── main ────────────────────────────────────────────────────────────────────
if (isMainThread && isEntry) {
  if (process.argv.includes('--report')) {
    report(arg('report'))
    process.exit(0)
  }
  const mode = process.argv[2]
  if (mode !== 'k' && mode !== 'floor') throw new Error('usage: node league.mjs k|floor [--n N] [--out file]')
  const engineUrl = regenEngine()
  // imported on the main thread only: bosses100.mjs's own worker branch would
  // hijack a worker that imported it
  const { DEFAULT_KNOBS, ENCOUNTERS } = await import('./bosses100.mjs')
  const encounters = Object.fromEntries(Object.values(ENCOUNTER_SLOT).map(s => [s, ENCOUNTERS[s]]))
  const N = Number(arg('n', mode === 'k' ? 120 : 600))
  const out = arg('out', `out/league-${mode}.json`)
  const tasks = []
  const chunk = 40
  if (mode === 'k') {
    const ARCH = ['default', 'glass', 'tank', 'spiky']
    const LEVELS = [4, 8, 12, 18, 26, 36, 48]
    const RATIOS = [0.6, 0.7, 0.8, 0.9, 1.0, 1.12, 1.25, 1.45, 1.7]
    for (const a of ARCH) for (const b of ARCH) for (const lvl of LEVELS) for (const r of RATIOS) {
      const olvl = Math.max(1, Math.round(lvl / r))
      for (let s0 = 0; s0 < N; s0 += chunk) tasks.push({ mode, a, b, lvl, olvl, s0, n: Math.min(chunk, N - s0) })
    }
  } else {
    const tiers = arg('tiers', GATE_TIERS.join(',')).split(',')
    const span = Number(arg('span', 3))
    // --gl bronze=2-4,champion=10-20 / --pw bronze=28-40: explicit sweeps
    const ranges = (name) => Object.fromEntries((arg(name, '') || '').split(',').filter(Boolean).map(kv => {
      const [k, v] = kv.split('=')
      const [lo, hi] = v.split('-').map(Number)
      return [k, [lo, hi ?? lo]]
    }))
    const gl = ranges('gl')
    const pw = ranges('pw')
    for (const tier of tiers) {
      const g = gateLevel(tier)
      const [glo, ghi] = gl[tier] ?? [Math.max(0, g - span), g + span]
      const [plo, phi] = pw[tier] ?? [TIER_FLOOR_POWER[tier], TIER_FLOOR_POWER[tier]]
      for (let glvl = glo; glvl <= ghi; glvl++) for (let power = plo; power <= phi; power++) {
        const fallback = FALLBACK ? LEAGUE_GATEKEEPER_FALLBACK[tier] ?? null : null
        for (let s0 = 0; s0 < N; s0 += chunk) tasks.push({ mode, tier, power, glvl, fallback, s0, n: Math.min(chunk, N - s0) })
      }
    }
  }
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  console.log(`${mode}: tasks ${tasks.length}, workers ${W}, N ${N}`)
  const agg = new Map()
  const t0 = Date.now()
  await new Promise((done) => {
    let next = 0
    let alive = W
    for (let w = 0; w < W; w++) {
      const worker = new Worker(__file, { workerData: { engineUrl, npcTuning: arg('npcTuning', null), knobs: DEFAULT_KNOBS, encounters, rosters: ABILITY_ROSTERS } })
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
  writeFileSync(out, JSON.stringify({ mode, n: N, rows }, null, 1))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`)
  report(out)
} else if (!isMainThread && workerData?.engineUrl) {
  const { runBattle, teamFor } = await import(workerData.engineUrl)
  const ENCOUNTERS = workerData.encounters
  const knobs = workerData.knobs
  const scoreOf = (res) => (res.result === 'win' ? 1 : res.result === 'timeout' ? 0.5 : 0)
  parentPort.on('message', (t) => {
    let score = 0
    if (t.mode === 'k') {
      const team = teamFor(t.a, 50, t.lvl)
      const ghost = teamFor(t.b, 50, t.olvl).map(c => ({ ...c }))
      // stageId 50: power-ups on, default arena, no terrain (league arena)
      const stage = { id: 50, name: 'league', isBoss: false, arenaType: 'default', enemyTeam: ghost }
      for (let i = t.s0; i < t.s0 + t.n; i++) {
        const seed = (t.lvl * 7919 + t.olvl * 104729 + i * 15485863) ^ (t.a.length * 31 + t.b.length)
        // the ghost stands in for another player's (smasher) team: no
        // CAMPAIGN_NPC_TUNING unless --npcTuning on (game: league ghosts carry smasherIds)
        score += scoreOf(runBattle({ stageId: 50, stage, team, seed, playerStarts: i % 2 === 0, mode: 'real', knobs, npcTuning: workerData.npcTuning === 'on' }))
      }
      parentPort.postMessage({ key: `${t.a}|${t.b}|${t.lvl}|${t.olvl}`, a: t.a, b: t.b, lvl: t.lvl, own: 4 * t.lvl, opp: 4 * t.olvl, n: t.n, score })
      return
    }
    const base = Math.floor(t.power / 4)
    const extra = t.power - 4 * base // remainder on the tops, then bottoms
    const team = teamFor('default', 50, base).map((c, i) => ({
      ...c,
      topLevel: base + (i < extra ? 1 : 0),
      bottomLevel: base + (i + 2 < extra ? 1 : 0)
    }))
    const slot = t.fallback ? undefined : ENCOUNTER_SLOT[t.tier]
    const roster = t.fallback ? workerData.rosters[t.fallback] : slot ? ENCOUNTERS[slot].team : CLASSIC[t.tier]
    const stage = {
      id: slot ?? 50, name: `gate-${t.tier}`, isBoss: true,
      arenaType: slot ? ENCOUNTERS[slot].arena : 'boss',
      enemyTeam: roster.map(c => ({ ...c, topLevel: t.glvl, bottomLevel: t.glvl }))
    }
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      const seed = (t.power * 1000003 + t.glvl * 7919 + i * 15485863) | 0
      // gatekeepers are part-only NPC bosses: CAMPAIGN_NPC_TUNING applies (--npcTuning off = pre-smasher)
      score += scoreOf(runBattle({ stageId: 50, stage, team, seed, playerStarts: i % 2 === 0, mode: 'real', knobs, npcTuning: workerData.npcTuning !== 'off' }))
    }
    parentPort.postMessage({ key: `${t.tier}|${t.fallback ?? ''}|${t.glvl}|${t.power}`, tier: t.tier, fallback: t.fallback ?? undefined, power: t.power, plvl: t.power / 4, glvl: t.glvl, n: t.n, score })
  })
}
