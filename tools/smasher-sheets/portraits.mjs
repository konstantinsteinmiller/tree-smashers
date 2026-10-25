#!/usr/bin/env node
/**
 * Painted smasher parts → hi-res portrait frames (VS screen, DOM portraits).
 *
 *   node tools/smasher-sheets/portraits.mjs            every shipped sheet
 *   node tools/smasher-sheets/portraits.mjs <id>…      just these (+ prune)
 *   node tools/smasher-sheets/portraits.mjs --prune    only drop orphans
 *   (pnpm art:portraits)
 *
 * The runtime sheets (slice-painted.mjs) are 208 px cells — 64 px per model
 * unit, too few for a big VS card. This cuts the few yaw frames portraits draw
 * (PORTRAIT_FRAMES: the DOM portrait's 1, the VS screen's 3 + 29) from the SAME
 * paintings at their own native resolution — never upscaled: the cell is sized
 * so every frame registers at scale ≤ 1 — keyed, despilled, part-b
 * colour-gained and bbox-registered onto the rig's frame box exactly as the
 * sheet cells are (shared keying.browser.js), as one row of cells:
 *   public/images/smashers/portraits/<id>_<cell>.webp
 *   src/smashers/paintedPortraits.ts (file, cell, frames, v, sheet)
 *
 * Source of truth = src/smashers/paintedSmashers.ts. Only an id with a shipped
 * sheet gets a portrait; each entry records its sheet's hash, the runtime
 * ignores an entry whose sheet is gone or re-cut, and every run prunes those
 * files + lines (slice-painted.mjs runs this for its id, the paint queue's
 * unship runs `--prune`).
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { livePortraits, registryField, shippedSheets } from './portraitRegistry.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
/** Keep in step with PORTRAIT_FRAME (smasherAtlas) and VS_PORTRAIT_FRAME (vsIntro). */
const PORTRAIT_FRAMES = [1, 3, 29]
const Q = 0.82
const args = process.argv.slice(2)
const prune = args.includes('--prune') || !args.includes('--force')
if (!args.includes('--force') && !args.includes('--prune')) console.log('portraits.mjs: retired (sheet cells are native resolution) — pass --force to cut separate portraits again; pruning only')
const ids = args.filter(x => !x.startsWith('--'))
const SHEET_REG = join(ROOT, 'src', 'smashers', 'paintedSmashers.ts')
const REG = join(ROOT, 'src', 'smashers', 'paintedPortraits.ts')
const OUT_DIR = join(ROOT, 'public', 'images', 'smashers', 'portraits')
const paintedDir = join(ROOT, 'art-sheets', 'painted')
const refPath = id => join(ROOT, 'art-sheets', 'smashers-bare', `${id}.png`)
const partPath = (id, k) => join(paintedDir, `smasher-${id}-${k}.png`)

const sheets = shippedSheets(readFileSync(SHEET_REG, 'utf8'))
const entries = livePortraits(existsSync(REG) ? readFileSync(REG, 'utf8') : '', sheets)

const want = prune ? [] : (ids.length ? ids : [...sheets.keys()])
const todo = want.filter(id => {
  if (!sheets.has(id)) { console.error(`${id}: no shipped sheet — no portrait`); return false }
  const ok = ['a', 'b'].every(k => existsSync(partPath(id, k))) && existsSync(refPath(id))
  if (!ok) { console.error(`${id}: painted parts or reference missing — keeps the sheet`); entries.delete(id) }
  return ok
})

if (todo.length) {
  const require = createRequire(join(ROOT, 'package.json'))
  const { chromium } = require('playwright')
  const dataUrl = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  try {
    const page = await browser.newPage()
    await page.addScriptTag({ content: readFileSync(join(ROOT, 'tools', 'smasher-sheets', 'keying.browser.js'), 'utf8') })
    for (const id of todo) {
      const res = await page.evaluate(async ([aUrl, bUrl, refUrl, FRAMES, Q]) => {
        const { load, grab, keyPainting, meanRGB, matchPartB, register } = globalThis.SmasherKeying
        const R = await load(refUrl)
        const rd = grab(R).data
        const RC = R.width / 8
        const A = keyPainting(await load(aUrl))
        const B = keyPainting(await load(bUrl))
        matchPartB(B, meanRGB(A, 8))
        const regs = FRAMES.map(f => {
          const P = f < 16 ? A : B
          const r = register(P, rd, R.width, RC, f, f % 16)
          if (!r.rb || !r.pb) throw new Error(`frame ${f}: empty cell`)
          return { f, P, ...r }
        })
        // the cell at which every frame registers at scale ≤ 1 (native, never up)
        const CELL = 2 * Math.floor(Math.min(...regs.map(r => (r.pb.b - r.pb.t) * RC / (r.rb.b - r.rb.t))) / 2)
        const kk = CELL / RC
        const out = new OffscreenCanvas(CELL * FRAMES.length, CELL)
        const ox = out.getContext('2d')
        ox.imageSmoothingQuality = 'high'
        const scales = []
        regs.forEach(({ P, rb, pb, x0, y0, cw, ch }, i) => {
          const s = ((rb.b - rb.t) * kk) / (pb.b - pb.t)
          scales.push(s.toFixed(3))
          const dcx = i * CELL + ((rb.l + rb.r) / 2) * kk
          const dby = rb.b * kk
          ox.save()
          ox.beginPath()
          ox.rect(i * CELL, 0, CELL, CELL)
          ox.clip()
          ox.setTransform(s, 0, 0, s, dcx - (x0 + (pb.l + pb.r) / 2) * s, dby - (y0 + pb.b) * s)
          ox.drawImage(P.keyed, x0, y0, cw, ch, x0, y0, cw, ch)
          ox.restore()
        })
        const buf = new Uint8Array(await (await out.convertToBlob({ type: 'image/webp', quality: Q })).arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        return { CELL, webp: btoa(bin), scales }
      }, [dataUrl(partPath(id, 'a')), dataUrl(partPath(id, 'b')), dataUrl(refPath(id)), PORTRAIT_FRAMES, Q])
      mkdirSync(OUT_DIR, { recursive: true })
      const file = `${id}_${res.CELL}.webp`
      const buf = Buffer.from(res.webp, 'base64')
      writeFileSync(join(OUT_DIR, file), buf)
      const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
      entries.set(id, ` file: "${file}", cell: ${res.CELL}, frames: [${PORTRAIT_FRAMES.join(', ')}], v: '${v}', sheet: '${sheets.get(id)}' `)
      console.log(`portrait ${file} ${(buf.length / 1024).toFixed(1)} kB (scales ${res.scales.join(' ')})`)
    }
  } finally {
    await browser.close()
  }
}

// files: only the registered one per id survives
const keep = new Set([...entries.values()].map(b => registryField(b, 'file')))
if (existsSync(OUT_DIR)) {
  for (const f of readdirSync(OUT_DIR)) {
    if (!keep.has(f)) { unlinkSync(join(OUT_DIR, f)); console.error(`pruned portrait ${f}`) }
  }
}
const lines = [...entries].sort((p, q) => p[0].localeCompare(q[0])).map(([id, b]) => `  ${JSON.stringify(id)}: {${b}},`)
writeFileSync(REG, `// GENERATED by tools/smasher-sheets/portraits.mjs — do not edit by hand.
// Hi-res painted portrait frames in public/images/smashers/portraits/: one row
// of \`frames\` cells of \`cell\` px on the sheet's lattice (FRAME_BOX at 0.94 of
// a cell, centred), cut from the paintings at native resolution. \`sheet\` is
// the hash of the paintedSmashers.ts sheet it was cut with — the runtime
// ignores an entry whose sheet is gone or re-cut (paintedPortraitFor).
export interface PaintedPortrait { file: string, cell: number, frames: readonly number[], v: string, sheet: string }
export const PAINTED_PORTRAITS: Readonly<Record<string, PaintedPortrait>> = {
${lines.join('\n')}
}
`)
