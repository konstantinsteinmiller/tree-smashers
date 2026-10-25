#!/usr/bin/env node
/**
 * Paint queue for the seasonal trees (#Paint5) — text-only Gemini jobs, one at
 * a time through tools/art-desk/paint.mjs (cross-process lock + throttle).
 *
 *   node tools/tower-sheets/season-paint-queue.mjs [--only halloween|christmas] [--dry]
 *
 * art-sheets/towers/season/<season>/<state>.prompt.txt (season-prompts.mjs) →
 * art-sheets/painted/towers-season/<season>/<state>.png. A painting that
 * exists is skipped (delete it to repaint). Stops on SIGNED_OUT (10) / QUOTA
 * (11); TEXT_ONLY / TIMEOUT / BROWSER: one retry, then the job is skipped.
 * Packing is separate: `node tools/tower-sheets/pack-single.mjs --season <s>`.
 * Log: art-sheets/towers-season-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEASON_STATES } from './season-prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
const args = process.argv.slice(2)
const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null })()
const LOG = join(A, 'towers-season-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); if (!args.includes('--dry')) appendFileSync(LOG, l + '\n') }

const jobs = ['halloween', 'christmas'].filter(s => !only || s === only).flatMap(season => SEASON_STATES.map(st => ({
  name: `${season}-${st}`,
  prompt: join(A, 'towers', 'season', season, `${st}.prompt.txt`),
  out: join(A, 'painted', 'towers-season', season, `${st}.png`)
}))).filter(j => !existsSync(j.out))
log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || 'nothing'}`)
if (args.includes('--dry')) process.exit(0)
for (const j of jobs) {
  mkdirSync(dirname(j.out), { recursive: true })
  for (let attempt = 1; attempt <= 2 && !existsSync(j.out); attempt++) {
    log(`${j.name}: painting (attempt ${attempt})`)
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'paint.mjs'), '--prompt-file', j.prompt, '--out', j.out],
      { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 20 * 60_000 })
    const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
    if (r.status === 0) { log(`${j.name}: OK ${line}`); break }
    log(`${j.name}: exit ${r.status} ${line}`)
    if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
  }
}
log('queue done')
