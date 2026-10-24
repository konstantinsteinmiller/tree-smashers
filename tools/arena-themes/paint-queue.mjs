#!/usr/bin/env node
/**
 * Unattended paint queue for the arena THEMES (prop sheets, backdrop tiles,
 * clearing floors) — one text-only Gemini job at a time through
 * tools/art-desk/paint.mjs (which holds the cross-process lock + throttle).
 *
 *   node tools/arena-themes/paint-queue.mjs [--only <name,...>] [--dry]
 *
 * Priority order (QUEUE below): every theme's prop sheet first, then per
 * theme in campaign order its backdrop tile and the floor variant its first
 * stage uses (variant 0 — see arenaThemes.ts floorVariantFor), then the
 * remaining floor variants. A job whose output already exists is skipped, so
 * a re-run after a QUOTA stop continues where it left off (a refused prop
 * sheet is moved to art-sheets/painted/stale/ by pack.mjs → re-painted).
 *
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that
 * code. TEXT_ONLY / TIMEOUT / BROWSER: one retry, then the job is skipped.
 * Log: art-sheets/arena-themes-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
const sheet = s => ({ name: `props-${s}`, prompt: join(A, 'props', `${s}.prompt.txt`), out: join(A, 'painted', `props-${s}.png`) })
const bg = t => ({ name: `backdrop-${t}`, prompt: join(A, 'bg', `${t}.prompt.txt`), out: join(A, 'painted', `backdrop-${t}.png`) })
const floor = f => ({ name: `floor-${f}`, prompt: join(A, 'arena-floors', `${f}.prompt.txt`), out: join(A, 'painted', `arena-floor-${f}.png`) })

export const QUEUE = [
  ...['rocky-a', 'ruins-a', 'snowy-a', 'volcanic-a', 'woodland-a', 'bedroom-b'].map(sheet),
  ...['rocky', 'ruins', 'woodland', 'bedroom', 'volcanic', 'snowy'].flatMap(t => [bg(t), floor(`${t}-0`)]),
  ...['rocky', 'ruins', 'woodland', 'bedroom', 'volcanic', 'snowy'].map(t => floor(`${t}-1`)),
  ...['rocky', 'ruins', 'woodland', 'bedroom', 'volcanic', 'snowy'].map(t => floor(`${t}-2`)),
  floor('meadow-3')
]

const args = process.argv.slice(2)
const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null })()
const dry = args.includes('--dry')
const LOG = join(A, 'arena-themes-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jobs = QUEUE.filter(j => (!only || only.has(j.name)) && !existsSync(j.out))
  log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ')}`)
  if (dry) process.exit(0)
  for (const j of jobs) {
    if (!existsSync(j.prompt)) { log(`${j.name}: SKIP no prompt ${j.prompt}`); continue }
    for (let attempt = 1; attempt <= 2; attempt++) {
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
}
