#!/usr/bin/env node
/**
 * Paint queue for the skill icons + flavour sprites — one text-only Gemini job
 * at a time through tools/art-desk/paint.mjs (cross-process lock + throttle).
 *
 *   node tools/skill-art/paint-queue.mjs [--only icons-01,fx-01,single-log_slam] [--dry] [--no-pack]
 *
 * Writes the prompts first (prompts.mjs), then paints every job whose PNG is
 * missing: the sheets (art-sheets/painted/skill-<sheet>.png, nine icons each)
 * and a solo repaint (art-sheets/painted/skill-icon-<id>.png) for every icon
 * the reviewer rejected from its sheet (art-sheets/skill-art/rejected.json).
 * A re-run after a QUOTA stop continues where it left off; delete a PNG to
 * repaint it. Then runs pack.mjs.
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that code.
 * TEXT_ONLY / TIMEOUT / BROWSER: one retry, then the job is skipped.
 * Log: art-sheets/skill-art-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHEETS, singleIds } from './prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
export const queue = () => [
  ...SHEETS.map(s => ({ name: s.name, prompt: join(A, 'skill-art', `${s.name}.prompt.txt`), out: join(A, 'painted', `skill-${s.name}.png`) })),
  ...singleIds().map(id => ({ name: `single-${id}`, prompt: join(A, 'skill-art', `single-${id}.prompt.txt`), out: join(A, 'painted', `skill-icon-${id}.png`) }))
]

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null })()
  const dry = args.includes('--dry')
  const LOG = join(A, 'skill-art-queue.log')
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); if (!dry) appendFileSync(LOG, l + '\n') }
  const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
    { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 20 * 60_000 })

  const jobs = queue().filter(j => (!only || only.has(j.name)) && !existsSync(j.out))
  log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || '(none)'}`)
  if (dry) process.exit(0)
  if (node(['skill-art', 'prompts.mjs']).status !== 0) { log('prompts.mjs failed'); process.exit(1) }
  for (const j of jobs) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`${j.name}: painting (attempt ${attempt})`)
      const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', j.prompt, '--out', j.out])
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`${j.name}: OK ${line}`); break }
      log(`${j.name}: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) {
        log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`)
        if (!args.includes('--no-pack')) node(['skill-art', 'pack.mjs'])
        process.exit(r.status)
      }
    }
  }
  if (!args.includes('--no-pack')) {
    const p = node(['skill-art', 'pack.mjs'])
    log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
  }
  log('queue done')
}
