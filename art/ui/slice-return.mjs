#!/usr/bin/env node
/**
 * The Art Desk's slice step for the UI art sets (art/slice-return.mjs routes
 * `ui-*` paintings here).
 *
 *   node art/ui/slice-return.mjs art-sheets/painted/<stem>.png [--stale-ok]
 *
 * Cuts the set's grid (manifest.mjs) with tools/art-desk/slice.mjs — trim fit,
 * one 256x256 WebP per panel, the empty panel skipped — straight into
 * public/<target>, then writes the slicer receipt (painted/.sliced.json).
 * A painting cut against an older reference is refused (exit 1).
 *
 * After a set lands, list its files in src/data/uiArt.ts — the runtime only
 * requests painted files listed there (no 404s on a portal's console).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REFS_SUBDIR, SHEETS_DIR, setByStem } from './manifest.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const input = process.argv[2]
if (!input) {
  console.error('usage: slice-return.mjs <painted .png|.jpg>')
  process.exit(2)
}
const painting = resolve(ROOT, input)
const stem = basename(painting).replace(/\.[^.]+$/, '')
const set = setByStem(stem)
if (!set) {
  console.error(`slice-return: ${stem} is not a UI art set (art/ui/manifest.mjs)`)
  process.exit(2)
}
const rev = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 12)
const receiptFile = join(dirname(painting), '.sliced.json')
const receipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf-8')) : { files: {} }
receipt.files ??= {}
const refFile = join(ROOT, SHEETS_DIR, REFS_SUBDIR, `${set.stem}.png`)
const refRev = existsSync(refFile) ? rev(refFile) : null
const prev = receipt.files[basename(painting)]
const paintingRev = rev(painting)
if (prev?.painting === paintingRev && prev.rev && refRev && prev.rev !== refRev && !process.argv.includes('--stale-ok')) {
  console.error(`slice-return: ${basename(painting)} was cut against reference ${prev.rev}, the reference is now ${refRev} — repaint (or --stale-ok)`)
  process.exit(1)
}

// One output dir per set (every cell of a set shares its folder).
const targets = set.cells.filter(Boolean).map((c) => c.target)
const outDir = join(ROOT, 'public', dirname(targets[0]))
const names = set.cells.map((c) => (c ? basename(c.target).replace(/\.webp$/, '') : '-')).join(',')
const r = spawnSync(process.execPath, [
  'tools/art-desk/slice.mjs', '--in', painting, '--out-dir', outDir,
  '--grid', `${set.grid.cols}x${set.grid.rows}`, '--names', names,
  '--size', `${set.size}x${set.size}`, '--pad', '0.04'
], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf-8' })
if (r.status !== 0) process.exit(r.status ?? 1)
process.stdout.write(r.stdout)

receipt.files[basename(painting)] = {
  rev: refRev,
  painting: paintingRev,
  at: new Date().toISOString(),
  targets
}
writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8')
