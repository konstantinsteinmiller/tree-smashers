#!/usr/bin/env node
/**
 * Paint queue for the smasher sheets — runs unattended through the Art Desk's
 * paint.mjs (one Gemini job at a time, its own throttle + daily cap).
 *
 *   node tools/smasher-sheets/paint-queue.mjs [ids…]      default: every bare reference not yet sliced
 *
 * Per smasher: paint part a (frames 0…15) and part b (frames 16…31) from the
 * 4 × 4 references (parts.mjs) and their prompts (prompts.mjs), then slice
 * (slice-painted.mjs). A part the slicer refuses is parked in painted/stale/
 * by the slicer and painted again — at most twice per part. Stops the whole
 * queue on SIGNED_OUT / QUOTA (exit 10 / 11): the next job would hit it too.
 * Log: art-sheets/smashers-bare/queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BARE = join(ROOT, 'art-sheets', 'smashers-bare')
const PAINTED = join(ROOT, 'art-sheets', 'painted')
const LOG = join(BARE, 'queue.log')
const log = m => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(LOG, line + '\n') }

// done = sliced from a full 32-frame painting (slice-painted.mjs writes <id>.full32);
// an older 17-frame mirrored sheet keeps shipping until its repaint lands
const sliced = new Set(readdirSync(BARE).map(f => f.match(/^([a-z0-9]+)\.full32$/)?.[1]).filter(Boolean))
let ids = process.argv.slice(2)
if (!ids.length) {
  ids = readdirSync(BARE).map(f => f.match(/^([a-z0-9]+)-a\.prompt\.txt$/)?.[1]).filter(Boolean).filter(id => !sliced.has(id))
}

const paint = (id, part) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/art-desk/paint.mjs'),
    '--prompt-file', join(BARE, `${id}-${part}.prompt.txt`),
    '--out', join(PAINTED, `smasher-${id}-${part}.png`),
    '--ref', join(BARE, `${id}-${part}.png`)], { cwd: ROOT, encoding: 'utf8' })
  const out = (r.stdout || '').trim()
  log(`${id}-${part}: paint exit ${r.status} ${out}`)
  if (r.status === 10 || r.status === 11) { log('STOP: ' + out); process.exit(r.status) }
  if (r.status !== 0) return false
  // a part is a SQUARE 4 × 4 sheet; anything else is not our answer (Gemini's
  // page once handed back 1408 × 768 photos from another conversation)
  const file = join(PAINTED, `smasher-${id}-${part}.png`)
  const png = readFileSync(file)
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  if (Math.abs(w - h) > 8) {
    mkdirSync(join(PAINTED, 'stale'), { recursive: true })
    renameSync(file, join(PAINTED, 'stale', `smasher-${id}-${part}.not-square-${w}x${h}-${Date.now()}.png`))
    log(`${id}-${part}: REFUSED ${w}x${h} — not a square sheet`)
    return false
  }
  return true
}

for (const id of ids) {
  let ok = false
  for (let round = 0; round < 3 && !ok; round++) {
    for (const part of ['a', 'b']) {
      if (existsSync(join(PAINTED, `smasher-${id}-${part}.png`))) continue
      if (!paint(id, part) && !paint(id, part)) break
    }
    if (!['a', 'b'].every(p => existsSync(join(PAINTED, `smasher-${id}-${p}.png`)))) continue
    const s = spawnSync(process.execPath, [join(ROOT, 'tools/smasher-sheets/slice-painted.mjs'), id, '--q', '0.78'], { cwd: ROOT, encoding: 'utf8' })
    log(`${id}: slice exit ${s.status} ${(s.stdout || '').trim()} ${(s.stderr || '').trim().split('\n').filter(l => !l.startsWith('ground')).join(' | ')}`)
    ok = s.status === 0
    if (ok) {
      // turn audit (audit-painted.mjs): a frame that flips to another view fails
      const au = spawnSync(process.execPath, [join(ROOT, 'tools/smasher-sheets/audit-painted.mjs'), id], { cwd: ROOT, encoding: 'utf8' })
      log(`${id}: audit exit ${au.status} ${(au.stdout || '').trim()}`)
      if (au.status !== 0) {
        ok = false
        mkdirSync(join(PAINTED, 'stale'), { recursive: true })
        for (const p of ['a', 'b']) renameSync(join(PAINTED, `smasher-${id}-${p}.png`), join(PAINTED, 'stale', `smasher-${id}-${p}.audit-${Date.now()}.png`))
        const marker = join(BARE, `${id}.full32`)
        if (existsSync(marker)) unlinkSync(marker)
        // the refused sheet must not ship: drop it, the rig drawing takes over
        const pub = join(ROOT, 'public/images/smashers')
        for (const f of readdirSync(pub)) if (f.startsWith(`${id}_`)) unlinkSync(join(pub, f))
        const reg = join(ROOT, 'src/smashers/paintedSmashers.ts')
        writeFileSync(reg, readFileSync(reg, 'utf8').split('\n').filter(l => !l.includes(`"${id}":`)).join('\n'))
      }
    }
  }
  if (!ok) log(`${id}: GAVE UP after 3 rounds — see painted/stale/`)
}
log('queue done')
