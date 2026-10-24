#!/usr/bin/env node
/**
 * Painted title ribbon (FRibbon.vue) — one TEXT-ONLY Gemini job per tone family
 * (sun / leaf / berry / royal) through tools/art-desk/paint.mjs (cross-process
 * lock + throttle), then pack.mjs.
 *
 *   node tools/ribbon-art/paint-queue.mjs [--force] [--only leaf,berry] [--no-pack]
 *
 * Writes art-sheets/ribbon/<fam>.prompt.txt, paints art-sheets/painted/ribbon-<fam>.png
 * (skipped when it exists unless --force). Stops on SIGNED_OUT (exit 10) and
 * QUOTA (exit 11). Log: art-sheets/ribbon-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FAMILIES, prompt } from './prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
const args = process.argv.slice(2)
const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : Object.keys(FAMILIES) })()
const LOG = join(A, 'ribbon-queue.log')
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }
const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
  { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 60 * 60_000 })

mkdirSync(join(A, 'ribbon'), { recursive: true })
for (const fam of only) {
  const pf = join(A, 'ribbon', `${fam}.prompt.txt`), out = join(A, 'painted', `ribbon-${fam}.png`)
  writeFileSync(pf, prompt(fam) + '\n')
  if (existsSync(out) && !args.includes('--force')) { log(`${fam}: exists, skipped`); continue }
  let ok = false
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    log(`${fam}: painting (attempt ${attempt})`)
    const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', pf, '--out', out])
    const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
    log(`${fam}: exit ${r.status} ${line}`)
    if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    ok = r.status === 0
  }
  if (!ok) log(`${fam}: painting failed`)
}
if (!args.includes('--no-pack')) {
  const p = node(['ribbon-art', 'pack.mjs'])
  log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
}
log('queue done')
