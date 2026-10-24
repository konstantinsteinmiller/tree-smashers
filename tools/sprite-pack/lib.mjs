/**
 * Shared helpers for the small text-only paint pipelines (tools/roulette-art,
 * tools/badge-icons, tools/decor-sheets, tools/armor-art):
 *
 *  - keyCells: the Art Desk slicer (tools/art-desk/slice.mjs — measured ground
 *    colour, despill, watermark guard) cuts a painting into an equal C × R grid
 *    of keyed PNG cells at NATIVE size (--fit cell: no rescale, no re-centring);
 *  - trimCells: trims each cell to its content (+ pad), refuses a cell that is
 *    empty or whose content touches the cell edge (a sprite spilling into its
 *    neighbour), and downsizes to a max box — NEVER upscales (the result is at
 *    most the painting's own pixels);
 *  - runQueue: one paint.mjs job at a time (cross-process lock + throttle live
 *    in paint.mjs), skips paintings that exist, one retry, stops on
 *    SIGNED_OUT (10) / QUOTA (11) with that exit code, then runs the packer.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const ART = join(ROOT, 'art-sheets')
export const PAINTED = join(ART, 'painted')

/** Shared style lines — the toy-box arena language (ui-catalog.md §1). */
export const NAVY = 'dark navy (#161a40)'
export const STYLE_FLAT = `Style: bright, chunky, toy-like cartoon game art. A bold, even, thick ${NAVY} outline around every shape and its main parts; flat cel shading with at most three tones per colour (highlight, base, shade); crisp hard edges; clean saturated colours, NO muddy tones.`
export const NO_FX = 'NO glow, NO blur, NO soft drop shadow, NO shadow on the ground, NO radial gradients, NO light rays, NO lens effects, NO text, NO letters, NO numbers, NO watermark.'
export const MAGENTA = 'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the art — no gradient, no texture, no floor, no shadow on it. It will be keyed to transparency, so never use magenta, pink-purple or hot pink inside the art itself.'

const pngSize = (p) => { const b = readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

/** Key a painting into C × R native-size cells. → { name: pngPath }, plus the temp dir to remove. */
export const keyCells = (src, cols, rows, names) => {
  const [W, H] = pngSize(src)
  const tmp = join(tmpdir(), `sprite-pack-${process.pid}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows)
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'slice.mjs'), '--in', src, '--out-dir', tmp,
    '--grid', `${cols}x${rows}`, '--size', `${cw}x${ch}`, '--fit', 'cell', '--png', '--quality', '1', '--names', names.map(n => n ?? '-').join(',')],
  { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (r.status !== 0) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`slice failed (${r.status})`) }
  const out = {}
  for (const n of names) if (n) out[n] = join(tmp, `${n}.png`)
  return { cells: out, tmp }
}

/**
 * In a page from tools/art-desk/imaging.mjs openCanvas: trim + downsize + encode.
 * specs: [{ name, png (path), maxW, maxH, pad (px at source scale), edge (bool: allow touching) }]
 * → { name: { ok, why?, w, h, b64, srcW, srcH } }
 */
export const trimCells = async (page, specs, q) => {
  const input = specs.map(s => ({ ...s, b64: readFileSync(s.png).toString('base64') }))
  return page.evaluate(async ({ input, q }) => {
    const res = {}
    for (const s of input) {
      const bin = Uint8Array.from(atob(s.b64), c => c.charCodeAt(0))
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      const W0 = bmp.width, H0 = bmp.height
      const c0 = new OffscreenCanvas(W0, H0)
      c0.getContext('2d').drawImage(bmp, 0, 0)
      const d = c0.getContext('2d').getImageData(0, 0, W0, H0).data
      let L = W0, R = -1, T = H0, B = -1, n = 0
      for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
        if (d[(y * W0 + x) * 4 + 3] > 40) { n++; if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y }
      }
      if (n < 200) { res[s.name] = { ok: false, why: 'EMPTY' }; continue }
      if (!s.edge && (L <= 1 || T <= 1 || R >= W0 - 2 || B >= H0 - 2)) { res[s.name] = { ok: false, why: `TOUCHES_EDGE (${L},${T})-(${R},${B}) of ${W0}x${H0}` }; continue }
      const pad = s.pad ?? 2
      L = Math.max(0, L - pad); T = Math.max(0, T - pad); R = Math.min(W0 - 1, R + pad); B = Math.min(H0 - 1, B + pad)
      const sw = R - L + 1, sh = B - T + 1
      const k = Math.min(1, s.maxW / sw, s.maxH / sh)
      const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k))
      const c1 = new OffscreenCanvas(w, h), g = c1.getContext('2d')
      g.imageSmoothingQuality = 'high'
      g.drawImage(c0, L, T, sw, sh, 0, 0, w, h)
      const u = new Uint8Array(await (await c1.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer())
      let bs = ''
      for (let i = 0; i < u.length; i += 0x8000) bs += String.fromCharCode(...u.subarray(i, i + 0x8000))
      const pb = new Uint8Array(await (await c1.convertToBlob({ type: 'image/png' })).arrayBuffer())
      let ps = ''
      for (let i = 0; i < pb.length; i += 0x8000) ps += String.fromCharCode(...pb.subarray(i, i + 0x8000))
      res[s.name] = { ok: true, w, h, b64: btoa(bs), png: btoa(ps), srcW: sw, srcH: sh }
    }
    return res
  }, { input, q })
}

/** Run a paint queue. jobs: [{ name, prompt (text), promptFile, out }]. */
export const runQueue = ({ tool, jobs, packArgs = [], args = process.argv.slice(2) }) => {
  const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null })()
  const dry = args.includes('--dry')
  const force = args.includes('--force')
  const LOG = join(ART, `${tool}-queue.log`)
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); if (!dry) appendFileSync(LOG, l + '\n') }
  const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
    { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30 * 60_000 })
  for (const j of jobs) { mkdirSync(dirname(j.promptFile), { recursive: true }); writeFileSync(j.promptFile, j.prompt + '\n') }
  const todo = jobs.filter(j => (!only || only.has(j.name)) && (force || !existsSync(j.out)))
  log(`queue: ${todo.length} to paint — ${todo.map(j => j.name).join(', ') || '(none)'}`)
  if (dry) return
  mkdirSync(PAINTED, { recursive: true })
  for (const j of todo) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`${j.name}: painting (attempt ${attempt})`)
      const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', j.promptFile, '--out', j.out])
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`${j.name}: OK ${line}`); break }
      log(`${j.name}: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    }
  }
  if (!args.includes('--no-pack')) {
    const p = node([tool, 'pack.mjs'], packArgs)
    log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
  }
  log('queue done')
}
