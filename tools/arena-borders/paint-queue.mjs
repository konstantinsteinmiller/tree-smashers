#!/usr/bin/env node
/**
 * Paint queue for the painted ARENA BORDERS — one text-only Gemini job at a
 * time through tools/art-desk/paint.mjs (which holds the cross-process paint
 * lock + throttle; this script just waits its turn).
 *
 *   node tools/arena-borders/paint-queue.mjs [--only meadow,ruins] [--redo snowy] [--dry] [--no-pack]
 *
 * Writes the prompts first (prompts.mjs), paints
 * art-sheets/painted/border-<key>.png for every border not painted yet (a
 * re-run after a QUOTA stop continues where it left off), then runs pack.mjs.
 * `--redo <themes>` parks the existing painting in art-sheets/painted/stale/
 * (border-<theme>.<n>.png) and paints it again — after a review found
 * stitches, muddy colours, visible seams or an edge that does not read as the
 * theme's (at most 2 repaints per theme: the stale folder counts them).
 * Order: the two special walls first (owner priority — 'lava' for the lava
 * arena type, whose wall hurts; 'heal' for the forest arena type, whose wall
 * heals), then the themes by their first campaign stage: meadow (1), ruins
 * (5, the first boss), woodland (6), bedroom (7), volcanic (12), snowy (13),
 * rocky (23).
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that code.
 * TEXT_ONLY / TIMEOUT / BROWSER: one retry, then the job is skipped.
 * Log: art-sheets/arena-borders-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
export const BORDER_ORDER = ['lava', 'heal', 'meadow', 'ruins', 'woodland', 'bedroom', 'volcanic', 'snowy', 'rocky']
export const MAX_REPAINTS = 2
export const QUEUE = BORDER_ORDER.map(theme => ({
  name: theme,
  prompt: join(A, 'arena-borders', `${theme}.prompt.txt`),
  out: join(A, 'painted', `border-${theme}.png`)
}))

const STALE = join(A, 'painted', 'stale')
export const repaintsOf = (theme) => existsSync(STALE)
  ? readdirSync(STALE).filter(f => new RegExp(`^border-${theme}\\.\\d+\\.png$`).test(f)).length
  : 0

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const list = (flag) => { const i = args.indexOf(flag); return i >= 0 ? new Set(args[i + 1].split(',')) : null }
  const only = list('--only')
  const redo = list('--redo') ?? new Set()
  const dry = args.includes('--dry')
  const LOG = join(A, 'arena-borders-queue.log')
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); if (!dry) appendFileSync(LOG, l + '\n') }
  const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
    { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30 * 60_000 })

  for (const t of redo) {
    const j = QUEUE.find(q => q.name === t)
    if (!j || !existsSync(j.out)) continue
    const n = repaintsOf(t)
    if (n >= MAX_REPAINTS) { log(`${t}: already repainted ${n}× — keeping the current painting`); continue }
    if (dry) { log(`${t}: would park for a repaint (${n + 1}/${MAX_REPAINTS})`); continue }
    mkdirSync(STALE, { recursive: true })
    renameSync(j.out, join(STALE, `border-${t}.${n + 1}.png`))
    log(`${t}: parked for a repaint (${n + 1}/${MAX_REPAINTS})`)
  }
  const jobs = QUEUE.filter(j => (!only || only.has(j.name) || redo.has(j.name)) && (dry ? !existsSync(j.out) || redo.has(j.name) : !existsSync(j.out)))
  log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || '(none)'}`)
  if (dry) process.exit(0)
  if (node(['arena-borders', 'prompts.mjs']).status !== 0) { log('prompts.mjs failed'); process.exit(1) }
  for (const j of jobs) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`${j.name}: painting (attempt ${attempt})`)
      const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', j.prompt, '--out', j.out])
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`${j.name}: OK ${line}`); break }
      log(`${j.name}: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    }
  }
  if (!args.includes('--no-pack') && existsSync(join(ROOT, 'tools', 'arena-borders', 'pack.mjs'))) {
    const p = node(['arena-borders', 'pack.mjs'])
    log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
  }
  log('queue done')
}
