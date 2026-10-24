#!/usr/bin/env node
/**
 * Painted "next boss" portal frame (BossPeekBadge.vue) — one TEXT-ONLY Gemini
 * job through tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.mjs.
 *
 *   node tools/boss-frame-art/paint-queue.mjs [--force] [--out-name boss-frame] [--no-pack]
 *
 * Writes art-sheets/boss-frame/frame.prompt.txt, paints
 * art-sheets/painted/<out-name>.png (skipped when it exists unless --force).
 * Stops on SIGNED_OUT (10) / QUOTA (11). Log: art-sheets/boss-frame-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prompt } from './prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
const args = process.argv.slice(2)
const name = (() => { const i = args.indexOf('--out-name'); return i >= 0 ? args[i + 1] : 'boss-frame' })()
const LOG = join(A, 'boss-frame-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }
const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
  { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 60 * 60_000 })

mkdirSync(join(A, 'boss-frame'), { recursive: true })
const pf = join(A, 'boss-frame', 'frame.prompt.txt'), out = join(A, 'painted', `${name}.png`)
writeFileSync(pf, prompt() + '\n')
if (existsSync(out) && !args.includes('--force')) log(`${name}: exists, skipped`)
else {
  let ok = false
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    log(`${name}: painting (attempt ${attempt})`)
    const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', pf, '--out', out])
    const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
    log(`${name}: exit ${r.status} ${line}`)
    if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    ok = r.status === 0
  }
  if (!ok) { log(`${name}: painting failed`); process.exit(1) }
}
if (!args.includes('--no-pack')) {
  const p = node(['boss-frame-art', 'pack.mjs'])
  log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
}
log('queue done')
