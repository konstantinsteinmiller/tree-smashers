#!/usr/bin/env node
/**
 * Paint queue for the first-launch intro (#Intro1, art-sheets/intro/STORYBOARD.md)
 * — TEXT-ONLY Gemini jobs (no reference image) through tools/art-desk/paint.mjs,
 * which holds the cross-process paint lock and the throttle, so this waits its
 * turn behind (or ahead of) any other queue. Then packs them.
 *
 *   node tools/intro-art/paint-queue.mjs [--dry] [--no-pack] [--only trail,canopy]
 *
 * Jobs, in PRIORITY order (art-sheets/intro/<name>.prompt.txt →
 * art-sheets/painted/intro-<name>.png):
 *   trail        the five stepping stones of the stage trail (title card)
 *   hero-trees   the blue / red team trees flanking the logo (title card)
 *   canopy       the leafy canopy corner the camera sinks through (beat 1)
 *   skill-plate  the lower-third plate behind the skill card (beat 4)
 * then `node tools/intro-art/pack.mjs` (keyed, trimmed, sliced webp in
 * public/images/intro/ + the registry src/use/paintedIntro.ts; until a sprite
 * is packed the intro draws its vector / CSS version — src/use/introArt.ts).
 *
 * Re-runnable: a job whose painting already exists is skipped — move a refused
 * one to art-sheets/painted/stale/ to paint it again.
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that
 * code. TEXT_ONLY / TIMEOUT / BROWSER: one retry. Log: art-sheets/intro-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
/**
 * Owner rule: stitches / seams / felt belong ONLY on the stuffed-animal
 * smashers — never on scenery or UI. Every intro prompt must carry this
 * sentence verbatim (a job without it is skipped; tests/introArt.test.ts
 * checks the prompts too).
 */
export const NO_STITCHES = 'NO stitches, NO seams, NO felt or fabric texture'
/** Every prompt asks for the magenta key ground. */
export const MAGENTA = '#FF00FF'
export const QUEUE = ['trail', 'hero-trees', 'canopy', 'skill-plate'].map(name => ({
  name,
  prompt: join(A, 'intro', `${name}.prompt.txt`),
  out: join(A, 'painted', `intro-${name}.png`)
}))

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyAt = args.indexOf('--only')
const only = onlyAt >= 0 ? new Set((args[onlyAt + 1] ?? '').split(',')) : null
const LOG = join(A, 'intro-queue.log')
const log = (m) => {
  const l = `${new Date().toISOString()} ${m}`
  console.log(l)
  if (!dry) appendFileSync(LOG, l + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const done = QUEUE.filter(j => existsSync(j.out)).map(j => j.name)
  const jobs = QUEUE.filter(j => !existsSync(j.out) && (!only || only.has(j.name)))
  log(`intro queue: ${jobs.length} to paint — ${jobs.map(j => j.name).join(', ') || 'nothing'}${done.length ? ` (done: ${done.join(', ')})` : ''}`)
  for (const j of jobs) {
    const ok = existsSync(j.prompt) && readFileSync(j.prompt, 'utf-8').includes(NO_STITCHES) && readFileSync(j.prompt, 'utf-8').includes(MAGENTA)
    if (dry) log(`  ${j.name}: ${existsSync(j.prompt) ? (ok ? 'prompt ok' : 'PROMPT LACKS THE RULES') : 'NO PROMPT'} → ${j.out}`)
  }
  if (dry) process.exit(0)
  let painted = 0
  for (const j of jobs) {
    if (!existsSync(j.prompt)) { log(`${j.name}: SKIP no prompt ${j.prompt}`); continue }
    const text = readFileSync(j.prompt, 'utf-8')
    if (!text.includes(NO_STITCHES)) { log(`${j.name}: SKIP — the prompt lacks the scenery rule "${NO_STITCHES}…"`); continue }
    if (!text.includes(MAGENTA)) { log(`${j.name}: SKIP — the prompt lacks the ${MAGENTA} ground`); continue }
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
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'intro-art', 'pack.mjs')], { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
    log(`pack: exit ${r.status}`)
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  log(`intro queue done (${painted} painted)`)
}
