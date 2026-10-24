#!/usr/bin/env node
/**
 * Paint queue for the team-tree sheets — text-only Gemini jobs through
 * tools/art-desk/paint.mjs (which holds the cross-process paint lock and the
 * throttle, so it waits its turn behind any other queue), then packs each
 * painted sheet straight into the game.
 *
 *   node tools/tower-sheets/paint-queue.mjs [--only thorns,trees] [--dry] [--no-pack] [--repack]
 *
 * Jobs (QUEUE): `thorns` — the spiked FRONT COVER of the tree (bramble
 * garland segments, art-sheets/towers/thorns.prompt.txt →
 * art-sheets/painted/towers-thorns.png → pack-thorns.mjs → paintedThorns.ts;
 * the procedural thorns in src/use/towerThorns.ts stay the fallback), and
 * `trees` — the tree states themselves (already painted; listed so a refused
 * sheet can be re-painted the same way). A job whose painting already exists
 * is skipped (packed only while its atlas is missing from public/, or with
 * --repack — so a re-run after a pack crash still wires the painting) —
 * move a refused one to art-sheets/painted/stale/ to paint it again.
 *
 * `hd-*` — the HD trees, ONE painting per state and team (art-sheets/towers/
 * single/<name>.prompt.txt → art-sheets/painted/towers-single/<name>.png);
 * pack-single.mjs packs them (same registration, 2× the density) once all
 * nine exist. `--only` takes job names (hd-blue-damaged,…).
 *
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11) — log + exit with that
 * code. TEXT_ONLY / TIMEOUT / BROWSER: one retry, then the job is skipped.
 * A pack that REFUSES the painting (wrong cell count / shape) moves it to
 * art-sheets/painted/stale/ and exits 1 — re-run to paint it again (a pack
 * that crashes leaves the painting in place and exits with its code).
 * Log: art-sheets/towers-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
const T = join(ROOT, 'tools', 'tower-sheets')
/** The HD per-state tree paintings, in paint order. */
export const SINGLE = ['blue-healthy', 'red-healthy', 'blue-damaged', 'red-damaged', 'blue-nearly', 'red-nearly', 'blue-felled', 'red-felled', 'debris']
export const QUEUE = [
  { name: 'thorns', prompt: join(A, 'towers', 'thorns.prompt.txt'), out: join(A, 'painted', 'towers-thorns.png'), pack: join(T, 'pack-thorns.mjs'), refused: 3, atlas: 'thorns_' },
  { name: 'trees', prompt: join(A, 'towers', 'trees.prompt.txt'), out: join(A, 'painted', 'towers-trees.png'), pack: join(T, 'pack.mjs'), refused: 1, atlas: 'towers_' },
  // HD trees: one painting per state (art-sheets/towers/single/), packed
  // together by pack-single.mjs once all nine exist — the last one packs.
  ...SINGLE.map((n, i) => ({
    name: `hd-${n}`, prompt: join(A, 'towers', 'single', `${n}.prompt.txt`), out: join(A, 'painted', 'towers-single', `${n}.png`),
    pack: i === SINGLE.length - 1 ? join(T, 'pack-single.mjs') : null, needs: SINGLE.map(m => join(A, 'painted', 'towers-single', `${m}.png`)),
    refused: -1, atlas: 'towers_2048' // a refusal names the painting(s) to redo — none is parked
  }))
]

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null })()
const LOG = join(A, 'towers-queue.log')
const ATLAS_DIR = join(ROOT, 'public', 'images', 'towers')
/** The job's runtime atlas is already in public/ (then an existing painting is not re-packed). */
const packed = (j) => existsSync(ATLAS_DIR) && readdirSync(ATLAS_DIR).some(f => f.startsWith(j.atlas))
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sel = QUEUE.filter(j => !only || only.has(j.name))
  const todo = sel.filter(j => !existsSync(j.out))
  log(`queue: ${todo.length} to paint — ${todo.map(j => j.name).join(', ') || 'nothing'}`)
  if (dry) process.exit(0)
  for (const j of sel) {
    let painted = false
    if (!existsSync(j.out)) {
      if (!existsSync(j.prompt)) { log(`${j.name}: SKIP no prompt ${j.prompt}`); continue }
      for (let attempt = 1; attempt <= 2 && !existsSync(j.out); attempt++) {
        log(`${j.name}: painting (attempt ${attempt})`)
        const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'paint.mjs'), '--prompt-file', j.prompt, '--out', j.out],
          { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 20 * 60_000 })
        const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
        if (r.status === 0) { log(`${j.name}: OK ${line}`); painted = true; break }
        log(`${j.name}: exit ${r.status} ${line}`)
        if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
      }
    }
    if (!j.pack || (j.needs && !j.needs.every(p => existsSync(p)))) continue
    if (!existsSync(j.out) || args.includes('--no-pack') || (!painted && packed(j) && !args.includes('--repack'))) continue
    const r = spawnSync(process.execPath, [j.pack], { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
    log(`${j.name}: pack exit ${r.status}`)
    if (r.status === j.refused) {
      // REFUSED: park the painting so the next run paints it again.
      const stale = join(A, 'painted', 'stale')
      mkdirSync(stale, { recursive: true })
      const to = join(stale, `${Date.now()}-${basename(j.out)}`)
      renameSync(j.out, to)
      log(`${j.name}: painting refused by the packer → ${to}; re-run to paint again`)
      process.exit(1)
    }
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  log('queue done')
}
