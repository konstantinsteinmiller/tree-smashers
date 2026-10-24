#!/usr/bin/env node
/**
 * Paint queue for the logo — one text-only Gemini job through
 * tools/art-desk/paint.mjs (which holds the cross-process paint lock and the
 * throttle, so it waits its turn behind any other queue), then packs it.
 *
 *   node tools/logo/paint-queue.mjs [--dry] [--no-pack]
 *
 * Job: art-sheets/logo/logo.prompt.txt → art-sheets/painted/logo.png, then
 * `node tools/logo/pack.mjs` (parts + registry + index.html; the SVG stays the
 * fallback). Skipped when the painting already exists — move a refused one to
 * art-sheets/painted/stale/ to paint it again.
 *
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that
 * code. TEXT_ONLY / TIMEOUT / BROWSER: one retry. Log: art-sheets/logo-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
export const QUEUE = [
  { name: 'logo', prompt: join(A, 'logo', 'logo.prompt.txt'), out: join(A, 'painted', 'logo.png') }
]

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const LOG = join(A, 'logo-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jobs = QUEUE.filter(j => !existsSync(j.out))
  log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || 'nothing'}`)
  if (dry) process.exit(0)
  let painted = false
  for (const j of jobs) {
    if (!existsSync(j.prompt)) { log(`${j.name}: SKIP no prompt ${j.prompt}`); continue }
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`${j.name}: painting (attempt ${attempt})`)
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'paint.mjs'), '--prompt-file', j.prompt, '--out', j.out],
        { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 20 * 60_000 })
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`${j.name}: OK ${line}`); painted = true; break }
      log(`${j.name}: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    }
  }
  if ((painted || jobs.length === 0) && !args.includes('--no-pack') && existsSync(QUEUE[0].out)) {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'logo', 'pack.mjs')], { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
    log(`pack: exit ${r.status}`)
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  log('queue done')
}
