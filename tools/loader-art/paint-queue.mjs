#!/usr/bin/env node
/**
 * Paint queue for the loader's key-art scene — TEXT-ONLY Gemini jobs (no
 * reference image) through tools/art-desk/paint.mjs, which holds the
 * cross-process paint lock and the throttle, so this waits its turn behind
 * any other queue (e.g. the smasher sheets). Then packs them.
 *
 *   node tools/loader-art/paint-queue.mjs [--dry] [--no-pack] [--only tree,forest]
 *
 * Jobs (art-sheets/loader/<name>.prompt.txt → art-sheets/painted/loader-<name>.png):
 *   tree    the giant cartoon tree being smashed (cut-out, magenta key)
 *   forest  the mid-distance forest band, edge to edge (cut-out sky, magenta)
 *   front   the bottom-left foreground bushes (cut-out, magenta);
 *           mirrored for the bottom-right corner by the scene
 * then `node tools/loader-art/pack.mjs` (keyed, trimmed webp in
 * public/images/loader/ + tools/loader-art/painted.json + the generated
 * scene block in index.html; the vector layers stay the fallback).
 *
 * A job whose painting already exists is skipped — move a refused one to
 * art-sheets/painted/stale/ to paint it again.
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that
 * code. TEXT_ONLY / TIMEOUT / BROWSER: one retry. Log: art-sheets/loader-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
/**
 * Owner rule: stitches / seams / felt belong ONLY on the stuffed-animal
 * smashers (and their felt disc rims) — never on scenery. Every loader prompt
 * is scenery, so each must carry this sentence verbatim (a job without it is
 * skipped; tests/loaderScene.test.ts checks the prompts too).
 */
export const NO_STITCHES = 'NO stitches, NO seams, NO felt or fabric texture on trees, bushes, hills or any scenery — only the plush characters may have stitches'
export const QUEUE = ['tree', 'forest', 'front'].map(name => ({
  name,
  prompt: join(A, 'loader', `${name}.prompt.txt`),
  out: join(A, 'painted', `loader-${name}.png`)
}))

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyAt = args.indexOf('--only')
const only = onlyAt >= 0 ? new Set((args[onlyAt + 1] ?? '').split(',')) : null
const LOG = join(A, 'loader-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jobs = QUEUE.filter(j => !existsSync(j.out) && (!only || only.has(j.name)))
  log(`queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || 'nothing'}`)
  if (dry) process.exit(0)
  let painted = 0
  for (const j of jobs) {
    if (!existsSync(j.prompt)) { log(`${j.name}: SKIP no prompt ${j.prompt}`); continue }
    if (!readFileSync(j.prompt, 'utf-8').includes(NO_STITCHES)) { log(`${j.name}: SKIP — the prompt lacks the scenery rule "${NO_STITCHES}…"`); continue }
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`${j.name}: painting (attempt ${attempt})`)
      const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'paint.mjs'), '--prompt-file', j.prompt, '--out', j.out],
        { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 40 * 60_000 })
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`${j.name}: OK ${line}`); painted++; break }
      log(`${j.name}: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    }
  }
  if (!args.includes('--no-pack') && QUEUE.some(j => existsSync(j.out))) {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'loader-art', 'pack.mjs')], { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
    log(`pack: exit ${r.status}`)
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  log(`queue done (${painted} painted)`)
}
