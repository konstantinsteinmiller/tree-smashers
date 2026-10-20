#!/usr/bin/env node
/**
 * The Art Desk's slice step for the boss art (art-desk.config.json `slice`).
 *
 *   node art/bosses/slice-return.mjs art-sheets/painted/<stem>.png
 *
 * Finds the drawable by the painting's name (manifest.mjs `stem`), then:
 *   badge → tools/art-desk/slice.mjs --size 256x256 → public/images/boss-badges/<file>_256x256.webp
 * and writes the slicer receipt (art-sheets/painted/.sliced.json: the
 * reference revision it was cut against + the painting's own hash), which is
 * what turns its PAINT-STATUS row into ✓. Finally re-writes PAINT-STATUS.md.
 *
 * A painting cut against an older reference is refused (exit 1): the drawing
 * moved since it was painted — repaint, or park it in painted/stale/.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DRAWABLES, REFS_SUBDIR, SHEETS_DIR } from './manifest.mjs'
import { writeStatus } from './status.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const input = process.argv[2]
if (!input) {
  console.error('usage: slice-return.mjs <painted .png|.jpg>')
  process.exit(2)
}
const painting = resolve(ROOT, input)
const stem = basename(painting).replace(/\.[^.]+$/, '')
const d = DRAWABLES.find((x) => x.stem.toLowerCase() === stem.toLowerCase())
if (!d) {
  console.error(`slice-return: ${stem} is not a boss drawable (art/bosses/manifest.mjs)`)
  process.exit(2)
}
const rev = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 12)
const paintedDir = dirname(painting)
const receiptFile = join(paintedDir, '.sliced.json')
const receipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf-8')) : { files: {} }
receipt.files ??= {}
const refFile = join(ROOT, SHEETS_DIR, REFS_SUBDIR, `${d.stem}.png`)
const refRev = existsSync(refFile) ? rev(refFile) : null
const prev = receipt.files[basename(painting)]
const paintingRev = rev(painting)
if (prev?.painting === paintingRev && prev.rev && refRev && prev.rev !== refRev && !process.argv.includes('--stale-ok')) {
  console.error(`slice-return: ${basename(painting)} was cut against reference ${prev.rev}, the reference is now ${refRev} — repaint (or --stale-ok)`)
  process.exit(1)
}

const node = process.execPath
const run = (args) => {
  const r = spawnSync(node, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf-8' })
  if (r.status !== 0) process.exit(r.status ?? 1)
  return r.stdout
}
const tmp = mkdtempSync(join(tmpdir(), 'boss-slice-'))
const target = join(ROOT, 'public', d.target)
const name = basename(d.target).replace(/\.webp$/, '')
run(['tools/art-desk/slice.mjs', '--in', painting, '--out-dir', tmp, '--names', name, '--size', '256x256', '--pad', '0.02'])
copyFileSync(join(tmp, `${name}.webp`), target)
receipt.files[basename(painting)] = {
  rev: refRev,
  painting: paintingRev,
  at: new Date().toISOString(),
  targets: [d.target]
}
writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8')
writeStatus(ROOT)
console.log(target)
