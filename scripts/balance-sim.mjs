#!/usr/bin/env node
// ─── Part-level balance sim: runner + report ────────────────────────────────
//
// Shards tests/balance.sim.test.ts (real headless engine, seeded, skills and
// boss traits on) over ≤ 10 vitest processes, merges the shards into
// tools/balance-sim/results/<tag>-<mode>.json, and renders balance-report.md.
// Always through the worker budget (it caps os.availableParallelism()):
//
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run -- node scripts/balance-sim.mjs run ref  --tag after          # ~2 min
//   node "$B" run -- node scripts/balance-sim.mjs run rr1  --tag after          # ~10 min
//   node "$B" run -- node scripts/balance-sim.mjs run rr2  --tag after          # ~5 min
//   node "$B" run -- node scripts/balance-sim.mjs run camp --tag after          # ~8 min
//   node "$B" run -- node scripts/balance-sim.mjs run ref  --tag before --legacy # the pre-pass numbers
//   node scripts/balance-sim.mjs report                                          # → balance-report.md
//
// Options: --levels 5,15,30  --seeds N  --rr2 N  --stages 1-100,110  --tuning file.json
//          --sample k (rr1: k opponents per smasher, quick loop)
//          --legacy (smashers on the legacy part tables, NPC compensation off)
//          --print (print the merged summary of this run)

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const RES = join(ROOT, 'tools', 'balance-sim', 'results')
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const flag = (name) => args.includes(`--${name}`)

// ─── Aggregation ────────────────────────────────────────────────────────────

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)
const push = (m, k, v) => (m[k] ??= []).push(v)

/** { smasherId: { all, byL: {L: wr}, n } } */
export const summarize = (data) => {
  const per = {}
  const add = (id, L, v, terrain) => {
    push(per, `${id}`, v)
    push(per, `${id}@${L}`, v)
    push(per, `${id}#${terrain ? 't' : 'p'}`, v)
  }
  for (const { key: k, r } of data.rows) {
    if (data.mode === 'ref') add(k.id, k.L, k.side === 'player' ? r : 1 - r, k.terrain)
    else if (data.mode === 'rr1') {
      add(k.a, k.L, r, k.terrain)
      add(k.b, k.L, 1 - r, k.terrain)
    } else if (data.mode === 'rr2') {
      for (const id of k.A) add(id, k.L, r, k.terrain)
      for (const id of k.B) add(id, k.L, 1 - r, k.terrain)
    }
  }
  const out = {}
  for (const [k, v] of Object.entries(per)) out[k] = { wr: mean(v), n: v.length }
  return out
}

export const summarizeCamp = (data) => {
  const per = {}
  for (const { key: k, r } of data.rows) push(per, `${k.roster}|${k.stage}`, r)
  const out = {}
  for (const [k, v] of Object.entries(per)) out[k] = mean(v)
  return out
}

// ─── Run ───────────────────────────────────────────────────────────────────

const run = async (mode) => {
  const tag = opt('tag', 'after')
  const n = Math.max(1, Math.min(10, availableParallelism()))
  const dir = join(tmpdir(), `balance-sim-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(RES, { recursive: true })
  const env = {
    ...process.env,
    BALANCE_SIM: '1',
    BALANCE_MODE: mode,
    ...(opt('levels') ? { BALANCE_LEVELS: opt('levels') } : {}),
    ...(opt('seeds') ? { BALANCE_SEEDS: opt('seeds') } : {}),
    ...(opt('rr2') ? { BALANCE_RR2: opt('rr2') } : {}),
    ...(opt('rosters') ? { BALANCE_ROSTERS: opt('rosters') } : {}),
    ...(opt('sample') ? { BALANCE_RR1_SAMPLE: opt('sample') } : {}),
    ...(opt('stages') ? { BALANCE_STAGES: opt('stages') } : {}),
    ...(opt('tuning') ? { BALANCE_TUNING: resolve(opt('tuning')) } : {}),
    ...(flag('legacy') ? { BALANCE_LEGACY: '1' } : {})
  }
  const t0 = Date.now()
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((ok, fail) => {
    const out = join(dir, `shard-${i}.json`)
    const p = spawn('npx', ['vitest', 'run', 'tests/balance.sim.test.ts', '--maxWorkers=1', '--reporter=dot'], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...env, BALANCE_SHARD: `${i}/${n}`, BALANCE_OUT: out }
    })
    let err = ''
    p.stderr.on('data', d => (err += d))
    p.on('exit', code => (code === 0 && existsSync(out) ? ok() : fail(new Error(`shard ${i} failed (${code})\n${err.slice(-2000)}`))))
  })))
  const shards = Array.from({ length: n }, (_, i) => JSON.parse(readFileSync(join(dir, `shard-${i}.json`), 'utf8')))
  const merged = { mode, tag, at: new Date().toISOString(), env: { levels: env.BALANCE_LEVELS, seeds: env.BALANCE_SEEDS, rr2: env.BALANCE_RR2, stages: env.BALANCE_STAGES, legacy: !!env.BALANCE_LEGACY, tuning: env.BALANCE_TUNING ? JSON.parse(readFileSync(env.BALANCE_TUNING, 'utf8')) : null }, rows: shards.flatMap(s => s.rows), ...(shards[0].levels ? { levels: shards[0].levels } : {}), arche: shards[0].arche }
  const file = opt('out') ? resolve(opt('out')) : join(RES, `${tag}-${mode}.json`)
  writeFileSync(file, JSON.stringify(merged))
  rmSync(dir, { recursive: true, force: true })
  console.log(`${mode}: ${merged.rows.length} battles in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${file}`)
  if (flag('print')) printSummary(merged)
}

const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '–')

const printSummary = (data) => {
  if (data.mode === 'camp') {
    const s = summarizeCamp(data)
    console.log(Object.entries(s).map(([k, v]) => `${k} ${pct(v)}`).join('  '))
    return
  }
  const s = summarize(data)
  const ids = Object.keys(s).filter(k => !/[@#]/.test(k)).sort((a, b) => s[b].wr - s[a].wr)
  const levels = [...new Set(data.rows.map(r => r.key.L))].sort((a, b) => a - b)
  const wrs = ids.map(id => s[id].wr)
  for (const id of ids) console.log(`${id.padEnd(10)} ${pct(s[id].wr).padStart(4)}  ${levels.map(L => `L${L} ${pct(s[`${id}@${L}`]?.wr).padStart(4)}`).join('  ')}`)
  const sd = Math.sqrt(mean(wrs.map(w => (w - mean(wrs)) ** 2)))
  if (data.arche) {
    for (const part of [0, 1]) {
      const by = {}
      for (const id of ids) push(by, data.arche[id].split('/')[part], s[id].wr)
      console.log((part ? 'bottom ' : 'top    ') + Object.entries(by).map(([k, v]) => `${k} ${pct(mean(v))}`).join('  '))
    }
    for (const L of levels) {
      const by = {}
      for (const id of ids) if (s[`${id}@${L}`]) push(by, data.arche[id].split('/')[1], s[`${id}@${L}`].wr)
      console.log(`L${L} bottom ` + Object.entries(by).map(([k, v]) => `${k} ${pct(mean(v))}`).join('  '))
    }
  }
  console.log(`spread: min ${pct(Math.min(...wrs))} max ${pct(Math.max(...wrs))} sd ${(sd * 100).toFixed(1)} pts; in 40–60%: ${wrs.filter(w => w >= 0.4 && w <= 0.6).length}/${wrs.length}`)
}

// ─── Report ────────────────────────────────────────────────────────────────

const load = (tag, mode) => {
  const f = join(RES, `${tag}-${mode}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

const report = async () => {
  const modes = ['ref', 'rr1', 'rr2']
  const before = Object.fromEntries(modes.map(m => [m, load('before', m)]))
  const after = Object.fromEntries(modes.map(m => [m, load('after', m)]))
  const sb = Object.fromEntries(modes.map(m => [m, before[m] ? summarize(before[m]) : null]))
  const sa = Object.fromEntries(modes.map(m => [m, after[m] ? summarize(after[m]) : null]))
  const arche = [...Object.values(after), ...Object.values(before)].find(d => d?.arche)?.arche ?? {}
  const ids = Object.keys(arche)
  const order = ids.slice().sort((a, b) => (sa.rr1?.[b]?.wr ?? 0) - (sa.rr1?.[a]?.wr ?? 0))
  const L = [...new Set((after.rr1 ?? after.ref).rows.map(r => r.key.L))].sort((a, b) => a - b)
  const lines = []
  lines.push('| smasher | archetype | ref before | ref after | 1v1 RR before | 1v1 RR after | ' + L.map(l => `1v1 L${l}`).join(' | ') + ' | 2v2 before | 2v2 after |')
  lines.push('|---|---|---|---|---|---|' + L.map(() => '---|').join('') + '---|---|')
  for (const id of order) {
    const g = (s, k) => pct(s?.[k]?.wr)
    lines.push(`| ${id} | ${arche[id]} | ${g(sb.ref, id)} | ${g(sa.ref, id)} | ${g(sb.rr1, id)} | **${g(sa.rr1, id)}** | ${L.map(l => g(sa.rr1, `${id}@${l}`)).join(' | ')} | ${g(sb.rr2, id)} | **${g(sa.rr2, id)}** |`)
  }
  const stat = (s) => {
    if (!s) return '–'
    const w = ids.map(id => s[id]?.wr).filter(Number.isFinite)
    const sd = Math.sqrt(mean(w.map(x => (x - mean(w)) ** 2)))
    return `min ${pct(Math.min(...w))}, max ${pct(Math.max(...w))}, sd ${(sd * 100).toFixed(1)} pts, ${w.filter(x => x >= 0.4 && x <= 0.6).length}/${w.length} in 40–60 %`
  }
  const archLine = (s) => {
    if (!s) return '–'
    const by = {}
    for (const id of ids) if (s[id]) push(by, arche[id].split('/')[1], s[id].wr)
    return Object.entries(by).map(([k, v]) => `${k} ${pct(mean(v))}`).join(', ')
  }
  const cb = load('before', 'camp')
  const ca = load('after', 'camp')
  const cs = cb ? summarizeCamp(cb) : {}
  const cas = ca ? summarizeCamp(ca) : {}
  const stages = [...new Set((ca ?? cb)?.rows.map(r => r.key.stage) ?? [])].sort((a, b) => a - b)
  const rosters = [...new Set((ca ?? cb)?.rows.map(r => r.key.roster) ?? [])]
  const camp = []
  camp.push('| stage | player levels | ' + rosters.map(r => `${r} before | ${r} after | Δ`).join(' | ') + ' |')
  camp.push('|---|---|' + rosters.map(() => '---|---|---|').join(''))
  for (const st of stages) {
    const lv = (ca ?? cb).levels?.[st]
    camp.push(`| ${st} | ${lv ? lv.join('/') : ''} | ` + rosters.map(r => {
      const b = cs[`${r}|${st}`]
      const a = cas[`${r}|${st}`]
      return `${pct(b)} | ${pct(a)} | ${Number.isFinite(a - b) ? `${a - b >= 0 ? '+' : ''}${Math.round((a - b) * 100)}` : ''}`
    }).join(' | ') + ' |')
  }
  const bands = [[1, 10], [11, 20], [21, 40], [41, 60], [61, 80], [81, 100], [101, 200]]
  const bandLine = (s, r) => bands.map(([a, b]) => {
    const v = stages.filter(x => x >= a && x <= b).map(x => s[`${r}|${x}`]).filter(Number.isFinite)
    return `${a}–${b}: ${pct(mean(v))}`
  }).join(', ')
  const tmpl = (await import('../tools/balance-sim/reportTemplate.mjs')).default
  const md = tmpl
    .replace('{{SMASHER_TABLE}}', lines.join('\n'))
    .replace('{{SPREAD}}', [
      `- 1v1 round robin — before: ${stat(sb.rr1)}; after: ${stat(sa.rr1)}`,
      `- 2v2 mixes — before: ${stat(sb.rr2)}; after: ${stat(sa.rr2)}`,
      `- vs reference (2× Hootsie) — before: ${stat(sb.ref)}; after: ${stat(sa.ref)}`,
      `- archetype means (1v1 RR) — before: ${archLine(sb.rr1)}; after: ${archLine(sa.rr1)}`,
      `- archetype means (2v2) — before: ${archLine(sb.rr2)}; after: ${archLine(sa.rr2)}`
    ].join('\n'))
    .replace('{{CAMP_BANDS}}', rosters.map(r => `- **${r}** — before: ${bandLine(cs, r)}; after: ${bandLine(cas, r)}`).join('\n'))
    .replace('{{CAMP_TABLE}}', camp.join('\n'))
    .replace('{{RUNS}}', [...Object.values(before), ...Object.values(after), cb, ca].filter(Boolean).map(d => `- \`${d.tag}-${d.mode}\`: ${d.rows.length} battles, ${d.at.slice(0, 10)}, levels ${d.env.levels ?? 'default'}, seeds ${d.env.seeds ?? 'default'}${d.env.legacy ? ', legacy tables' : ''}`).join('\n'))
  writeFileSync(join(ROOT, 'balance-report.md'), md)
  console.log('wrote balance-report.md')
}

const [cmd, mode] = args
if (cmd === 'run') await run(mode)
else if (cmd === 'report') await report()
else if (cmd === 'print') printSummary(JSON.parse(readFileSync(resolve(mode), 'utf8')))
else {
  console.log('usage: balance-sim.mjs run <ref|rr1|rr2|camp> [--tag t] … | report | print <file>')
  process.exit(1)
}
