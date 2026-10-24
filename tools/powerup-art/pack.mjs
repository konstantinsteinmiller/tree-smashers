#!/usr/bin/env node
/**
 * Painted power-up boxes -> the files the game already loads.
 *
 *   node tools/powerup-art/pack.mjs [--q 0.84]
 *
 * In:  art-sheets/painted/powerup-<stat>.png (magenta ground, from paint-queue.mjs)
 * Out: public/images/powerups/<stat>-box_256x256.webp - magenta keyed to alpha,
 *      trimmed, centred, 4% margin (tools/art-desk/slice.mjs, same keying as
 *      tools/ui-icons/pack.mjs). 256 px = the largest on-screen use (box drawn
 *      at 3 x pickup radius ~ 35 arena units, <= ~85 css px, x3 DPR) and the
 *      painting is far larger, so it is never upscaled.
 * The old file is copied once to art-sheets/painted/stale/powerup-<stat>-box.old.webp first.
 * A stat with no painting is left alone. Afterwards re-check POWERUP_PLATE
 * (src/data/uiArt.ts): the empty plate should sit at cx .5, cy .56, r .24.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOXES } from './prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const a = process.argv.slice(2)
const Q = (() => { const i = a.indexOf('--q'); return i >= 0 ? a[i + 1] : '0.84' })()
const OUT = join(ROOT, 'public', 'images', 'powerups')
const STALE = join(ROOT, 'art-sheets', 'painted', 'stale')
const TMP = join(ROOT, 'art-sheets', 'powerup-art', '.pack-tmp')
mkdirSync(STALE, { recursive: true })

let ok = 0
for (const stat of Object.keys(BOXES)) {
  const src = join(ROOT, 'art-sheets', 'painted', `powerup-${stat}.png`)
  if (!existsSync(src)) { console.error(`${stat}: not painted yet - old box stays`); continue }
  const base = `${stat}-box_256x256`
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true })
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'slice.mjs'),
    '--in', src, '--out-dir', TMP, '--size', '256x256', '--fit', 'trim', '--pad', '0.04', '--quality', Q, '--names', base],
  { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (r.status !== 0 || !existsSync(join(TMP, `${base}.webp`))) { console.error(`${stat}: slice failed (exit ${r.status}) - old box stays`); continue }
  const live = join(OUT, `${base}.webp`)
  const bak = join(STALE, `powerup-${stat}-box.old.webp`)
  if (existsSync(live) && !existsSync(bak)) copyFileSync(live, bak)
  renameSync(join(TMP, `${base}.webp`), live)
  console.error(`${stat}: ok`)
  ok++
}
rmSync(TMP, { recursive: true, force: true })
console.log(`powerup boxes packed: ${ok}/${Object.keys(BOXES).length}`)
