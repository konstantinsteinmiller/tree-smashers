// High-N paired confirmation of the worst pairs on their worst stages.
// Per seed, the baseline and the pair run on the SAME seed in the same task,
// so the confidence interval uses the paired (influence-function) variance
// instead of the conservative independent one in report.mjs.
//   node confirm.mjs --pairs a+b;c+d --stages 15,30 --n 2000 --out confirm.json
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import os from 'node:os'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __file = fileURLToPath(import.meta.url)

if (isMainThread) {
  const { econLevel } = await import('./econ.mjs')
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`)
    return i >= 0 ? process.argv[i + 1] : d
  }
  const pairs = arg('pairs', '').split(';').filter(Boolean)
  const stages = arg('stages', '30').split(',').map(Number)
  const N = Number(arg('n', 2000))
  const teamName = arg('team', 'default')
  const levelMode = arg('levelMode', 'econ')
  const { lockstepLevel } = await import('./data.mjs')
  const chunk = 200
  const tasks = []
  for (const st of stages) for (const p of pairs) for (let s0 = 0; s0 < N; s0 += chunk) tasks.push({
    st,
    lvl: levelMode === 'lock' ? lockstepLevel(st) : econLevel(st),
    pair: p,
    s0,
    n: Math.min(chunk, N - s0),
    teamName
  })
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  const acc = new Map()
  let next = 0, done = 0
  const t0 = Date.now()
  await new Promise((resolve) => {
    let alive = W
    for (let w = 0; w < W; w++) {
      const worker = new Worker(__file)
      const feed = () => {
        if (next >= tasks.length) {
          worker.terminate()
          if (--alive === 0) resolve()
          return
        }
        worker.postMessage(tasks[next++])
      }
      worker.on('message', (r) => {
        const k = `${r.st}|${r.pair}`
        const a = acc.get(k) ?? { st: r.st, pair: r.pair, rows: [] }
        a.rows.push(...r.rows)
        acc.set(k, a)
        if (++done % 20 === 0) process.stdout.write(`\r${done}/${tasks.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
        feed()
      })
      worker.on('error', (e) => {
        console.error(e)
        process.exit(1)
      })
      feed()
    }
  })
  const out = []
  for (const a of acc.values()) {
    const n = a.rows.length
    const mean = (i) => a.rows.reduce((s, r) => s + r[i], 0) / n
    const [mK0, mKs, mD0, mDs] = [0, 1, 2, 3].map(mean)
    const off = mK0 / mKs
    const def = mDs / mD0
    const pi = off * def
    // influence function of log(PI) = log mK0 - log mKs + log mDs - log mD0
    const infl = a.rows.map(r => r[0] / mK0 - r[1] / mKs + r[3] / mDs - r[2] / mD0)
    const mi = infl.reduce((s, x) => s + x, 0) / n
    const v = infl.reduce((s, x) => s + (x - mi) ** 2, 0) / (n - 1) / n
    const se = Math.sqrt(v)
    out.push({
      st: a.st,
      pair: a.pair,
      team: teamName,
      n,
      off,
      def,
      pi,
      lo95: pi * Math.exp(-1.96 * se),
      hi95: pi * Math.exp(1.96 * se)
    })
  }
  out.sort((x, y) => y.hi95 - x.hi95)
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  for (const o of out) console.log(`S${o.st} ${o.pair}: PI ${o.pi.toFixed(3)} [95% ${o.lo95.toFixed(3)}–${o.hi95.toFixed(3)}] n=${o.n}`)
  writeFileSync(arg('out', 'confirm.json'), JSON.stringify(out, null, 1))
} else {
  const { runBattle, teamFor } = await import('./engine.mjs')
  parentPort.on('message', (t) => {
    const team = teamFor(t.teamName ?? 'default', t.st, t.lvl)
    const ids = t.pair.split('+')
    const lo = team.map(() => ids.map(id => ({ id, level: 10 })))
    const rows = []
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      const seed = t.st * 7777777 + i * 104729
      const ps = i % 2 === 0
      const b = { stageId: t.st, team, seed, playerStarts: ps }
      const k0 = runBattle({ ...b, mode: 'playerImmortal' }).turns
      const ks = runBattle({ ...b, loadouts: lo, mode: 'playerImmortal' }).turns
      const d0 = runBattle({ ...b, mode: 'enemyImmortal' }).turns
      const ds = runBattle({ ...b, loadouts: lo, mode: 'enemyImmortal' }).turns
      rows.push([k0, ks, d0, ds])
    }
    parentPort.postMessage({ st: t.st, pair: t.pair, rows })
  })
}
