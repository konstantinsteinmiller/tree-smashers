// Parallel driver. Usage:
//   node run.mjs --set singles|pairs|all|team --levels 1,5,10 --stages 15,16,... --n 400 --out results.json [--team default] [--levelMode econ|lock] [--nogov]
// Smasher teams: --team smashers (the game's starting pair) | --team grizzle+vixie
//   levels: --levelMode econ (default: econ.mjs smasherEconLevels, the game-side
//   campaign model) | lock (lockstep part level + 1) | --smasherLevel 15[,12].
//   Configs: base = no skills, own = each smasher's own unlocked skills (--set ignored).
// Engine options: --npcTuning off (no CAMPAIGN_NPC_TUNING: the pre-smasher
//   numbers in skills-feature.md), --streak 2 (campaign boss loss streak →
//   bossHpRubberBandMul), --policy scripted (the game balance test's player).
// Worker count = WORKER_BUDGET_WORKERS (set by budget.mjs) or availableParallelism, max 10.
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import os from 'node:os'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __file = fileURLToPath(import.meta.url)

if (isMainThread) {
  const { SKILL_IDS } = await import('./skills.mjs')
  const { lockstepLevel } = await import('./data.mjs')
  const { econLevel, smasherEconLevels } = await import('./econ.mjs')
  const { isSmasherTeam } = await import('./engine.mjs')
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`)
    return i >= 0 ? process.argv[i + 1] : d
  }
  const set = arg('set', 'singles')
  const levels = arg('levels', '10').split(',').map(Number)
  const stages = arg('stages', '15,16,30,31,49,50,79,80,99,100').split(',').map(Number)
  const N = Number(arg('n', 400))
  const out = arg('out', 'results.json')
  const teamName = arg('team', 'default')
  const levelMode = arg('levelMode', 'econ')
  const governor = !process.argv.includes('--nogov')
  const chunk = Number(arg('chunk', 100))
  const engineOpts = {
    npcTuning: arg('npcTuning', 'on') !== 'off',
    bossLossStreak: Number(arg('streak', 0)),
    policy: arg('policy', 'typical')
  }
  const smasherTeam = isSmasherTeam(teamName)
  const smasherLevel = arg('smasherLevel', null)?.split(',').map(Number)

  const configs = [{ key: 'base', skills: [] }]
  if (smasherTeam) configs.push({ key: 'own', own: true })
  else if (set === 'singles' || set === 'all') for (const s of SKILL_IDS) configs.push({ key: s, skills: [s] })
  if (!smasherTeam && (set === 'pairs' || set === 'all')) {
    for (let i = 0; i < SKILL_IDS.length; i++) for (let j = i + 1; j < SKILL_IDS.length; j++) {
      configs.push({ key: `${SKILL_IDS[i]}+${SKILL_IDS[j]}`, skills: [SKILL_IDS[i], SKILL_IDS[j]] })
    }
  }
  if (!smasherTeam && set === 'custom') {
    for (const c of arg('configs', '').split(';').filter(Boolean)) {
      // format: a+b|c+d   (spinner1 skills | spinner2 skills)
      const [s1, s2] = c.split('|')
      configs.push({ key: c, perBlade: [s1.split('+').filter(Boolean), (s2 ?? s1).split('+').filter(Boolean)] })
    }
  }

  const tasks = []
  for (const st of stages) {
    const lvl = smasherTeam
      ? (smasherLevel ?? (levelMode === 'lock' ? [lockstepLevel(st) + 1] : smasherEconLevels(st)))
      : levelMode === 'lock' ? lockstepLevel(st) : econLevel(st)
    for (const c of configs) {
      for (const L of (c.key === 'base' || c.own ? [0] : levels)) {
        for (let s0 = 0; s0 < N; s0 += chunk) {
          tasks.push({
            st,
            lvl,
            key: c.key,
            skills: c.skills,
            perBlade: c.perBlade,
            own: !!c.own,
            engineOpts,
            L,
            s0,
            n: Math.min(chunk, N - s0),
            teamName,
            governor
          })
        }
      }
    }
  }
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  console.log(`tasks ${tasks.length}, workers ${W}, configs ${configs.length}, N ${N}`)
  const agg = new Map()
  let done = 0
  const t0 = Date.now()
  await new Promise((resolve) => {
    let next = 0
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
        const k = `${r.st}|${r.key}|${r.L}`
        const a = agg.get(k) ?? {
          st: r.st,
          lvl: r.lvl,
          key: r.key,
          L: r.L,
          n: 0,
          win: 0,
          turns: 0,
          ttk: 0,
          ttd: 0,
          ttk2: 0,
          ttd2: 0,
          capA: 0,
          capB: 0,
          procs: {},
          dealt: 0,
          taken: 0
        }
        for (const f of ['n', 'win', 'turns', 'ttk', 'ttd', 'ttk2', 'ttd2', 'capA', 'capB', 'dealt', 'taken']) a[f] += r[f]
        for (const [p, v] of Object.entries(r.procs)) a.procs[p] = (a.procs[p] ?? 0) + v
        agg.set(k, a)
        done++
        if (done % 200 === 0) process.stdout.write(`\r${done}/${tasks.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
        feed()
      })
      worker.on('error', (e) => {
        console.error(e)
        process.exit(1)
      })
      feed()
    }
  })
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  writeFileSync(out, JSON.stringify([...agg.values()], null, 1))
} else {
  const { runBattle, teamFor } = await import('./engine.mjs')
  parentPort.on('message', (t) => {
    const team = teamFor(t.teamName, t.st, t.lvl)
    // smasher team: 'own' = no loadout passed (each smasher brings its own
    // unlocked skills); 'base' = empty loadouts (skill-less control)
    const loadouts = t.own
      ? undefined
      : t.perBlade
        ? t.perBlade.map(ids => ids.map(id => ({ id, level: 10 })))
        : team.map(() => t.skills.map(id => ({ id, level: t.L })))
    const r = {
      st: t.st,
      lvl: t.lvl,
      key: t.key,
      L: t.L,
      n: 0,
      win: 0,
      turns: 0,
      ttk: 0,
      ttd: 0,
      ttk2: 0,
      ttd2: 0,
      capA: 0,
      capB: 0,
      procs: {},
      dealt: 0,
      taken: 0
    }
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      const seed = t.st * 1000003 + i * 7919
      const playerStarts = i % 2 === 0
      const base = { stageId: t.st, team, loadouts, seed, playerStarts, governor: t.governor, ...t.engineOpts }
      const real = runBattle({ ...base, mode: 'real' })
      const a = runBattle({ ...base, mode: 'playerImmortal' })
      const b = runBattle({ ...base, mode: 'enemyImmortal' })
      r.n++
      if (real.result === 'win') r.win++
      r.turns += real.turns
      r.ttk += a.turns
      r.ttk2 += a.turns * a.turns
      if (a.result !== 'win') r.capA++
      r.ttd += b.turns
      r.ttd2 += b.turns * b.turns
      if (b.result !== 'lose') r.capB++
      r.dealt += real.dmgDealt
      r.taken += real.dmgTaken
      for (const [p, v] of Object.entries(real.procs)) r.procs[p] = (r.procs[p] ?? 0) + v
    }
    parentPort.postMessage(r)
  })
}
