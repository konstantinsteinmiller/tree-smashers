#!/usr/bin/env node
/**
 * Painted roulette parts → keyed WebP + src/use/paintedRoulette.ts.
 *
 *   node tools/roulette-art/pack.mjs [--q 0.86]
 *
 * In:  art-sheets/painted/roulette-rim.png (one ring, magenta ground + hole),
 *      art-sheets/painted/roulette-parts.png (2 × 2: pointer | hub / bolt off | bolt on).
 * Out: public/images/roulette/painted-<part>_<W>x<H>.webp, sized for the largest
 *      wheel (MAX_WHEEL_SIZE 300 css px) at 3× DPR and NEVER upscaled:
 *        rim 900 · pointer 0.13 → 117 wide · hub 0.21 → 189 · bolt 0.052 → 48.
 * Rim: must be round (trimmed aspect within 4 %); its opening — the clear
 *      region 4-connected to the centre — must be round (within 8 %) and
 *      0.30–0.42 of the width in radius; `open` = that radius / width.
 *      Anything else is refused (the part stays out, the CSS rim stays).
 * Pointer: `pivotY` = the middle of the widest band in its top half (the cap's
 *      centre) / height.
 * A part that is not painted / refused stays OUT of the registry → CSS fallback.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openCanvas } from '../art-desk/imaging.mjs'
import { PAINTED, ROOT, keyCells, trimCells } from '../sprite-pack/lib.mjs'

const a = process.argv.slice(2)
const Q = Number((() => { const i = a.indexOf('--q'); return i >= 0 ? a[i + 1] : '0.86' })())
const OUT = join(ROOT, 'public', 'images', 'roulette')
const REG = join(ROOT, 'src', 'use', 'paintedRoulette.ts')
const WHEEL = 300 * 3
const MAX = {
  rim: [WHEEL, WHEEL],
  pointer: [Math.ceil(0.13 * WHEEL), Math.ceil(0.24 * WHEEL)],
  hub: [Math.ceil(0.21 * WHEEL), Math.ceil(0.21 * WHEEL)],
  bulbOff: [48, 48],
  bulbOn: [48, 48]
}
const FILE = { rim: 'rim', pointer: 'pointer', hub: 'hub', bulbOff: 'bolt-off', bulbOn: 'bolt-on' }

const reg = {}
const tmps = []
const { page, close } = await openCanvas(ROOT)
try {
  const specs = []
  const rimSrc = join(PAINTED, 'roulette-rim.png')
  if (existsSync(rimSrc)) {
    const k = keyCells(rimSrc, 1, 1, ['rim']); tmps.push(k.tmp)
    specs.push({ name: 'rim', png: k.cells.rim, maxW: MAX.rim[0], maxH: MAX.rim[1], pad: 1 })
  } else console.error('rim: not painted yet — CSS rim stays')
  const partsSrc = join(PAINTED, 'roulette-parts.png')
  if (existsSync(partsSrc)) {
    const names = ['pointer', 'hub', 'bulbOff', 'bulbOn']
    const k = keyCells(partsSrc, 2, 2, names); tmps.push(k.tmp)
    for (const n of names) specs.push({ name: n, png: k.cells[n], maxW: MAX[n][0], maxH: MAX[n][1], pad: 1 })
  } else console.error('parts: not painted yet — CSS pointer / hub / bolts stay')
  const res = specs.length ? await trimCells(page, specs, Q) : {}
  const meas = await page.evaluate(async ({ rim, pointer }) => {
    const load = async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }))
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      c.getContext('2d').drawImage(bmp, 0, 0)
      return { W: bmp.width, H: bmp.height, d: c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height).data }
    }
    const out = {}
    if (rim) {
      const { W, H, d } = await load(rim)
      const clear = (x, y) => d[(y * W + x) * 4 + 3] < 128
      if (Math.abs(W / H - 1) > 0.04) out.rim = { ok: false, why: `NOT_ROUND ${W}x${H}` }
      else if (!clear(W >> 1, H >> 1)) out.rim = { ok: false, why: 'NO_OPENING at the centre' }
      else {
        const seen = new Uint8Array(W * H)
        const st = [(H >> 1) * W + (W >> 1)]
        seen[st[0]] = 1
        let l = W; let r = -1; let t = H; let b = -1; let leak = false
        while (st.length) {
          const p = st.pop(); const x = p % W; const y = (p / W) | 0
          if (x < l) l = x
          if (x > r) r = x
          if (y < t) t = y
          if (y > b) b = y
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1) leak = true
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const q = ny * W + nx
            if (!seen[q] && clear(nx, ny)) { seen[q] = 1; st.push(q) }
          }
        }
        const hw = r - l + 1; const hh = b - t + 1
        const open = ((hw + hh) / 4) / W
        if (leak) out.rim = { ok: false, why: 'OPENING_LEAKS to the edge' }
        else if (Math.abs(hw / hh - 1) > 0.08) out.rim = { ok: false, why: `OPENING_NOT_ROUND ${hw}x${hh}` }
        else if (open < 0.30 || open > 0.42) out.rim = { ok: false, why: `OPENING_SIZE ${open.toFixed(3)}` }
        else out.rim = { ok: true, open: +open.toFixed(4) }
      }
    }
    if (pointer) {
      const { W, H, d } = await load(pointer)
      const width = (y) => { let n = 0; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) n++; return n }
      let best = -1; let row = 0
      for (let y = 0; y < (H >> 1); y++) { const n = width(y); if (n > best) { best = n; row = y } }
      let y0 = row; let y1 = row
      while (y0 > 0 && width(y0 - 1) >= best - 1) y0--
      while (y1 < H - 1 && width(y1 + 1) >= best - 1) y1++
      out.pointer = { ok: true, pivotY: +(((y0 + y1) / 2 + 0.5) / H).toFixed(4) }
    }
    return out
  }, { rim: res.rim?.ok ? res.rim.png : null, pointer: res.pointer?.ok ? res.pointer.png : null })

  mkdirSync(OUT, { recursive: true })
  for (const f of readdirSync(OUT)) if (f.startsWith('painted-')) rmSync(join(OUT, f))
  for (const [key, r] of Object.entries(res)) {
    if (!r.ok) { console.error(`${key}: REFUSED ${r.why} — CSS fallback stays`); continue }
    const m = meas[key]
    if (m && !m.ok) { console.error(`${key}: REFUSED ${m.why} — CSS fallback stays`); continue }
    const file = `painted-${FILE[key]}_${r.w}x${r.h}.webp`
    const buf = Buffer.from(r.b64, 'base64')
    writeFileSync(join(OUT, file), buf)
    const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
    reg[key] = { file, w: r.w, h: r.h, v, ...(key === 'rim' ? { open: m.open } : {}), ...(key === 'pointer' ? { pivotY: m.pivotY } : {}) }
    console.error(`${key}: ${file} (${Math.round(buf.length / 1024)} kB, from ${r.srcW}x${r.srcH})${m ? ' ' + JSON.stringify(m) : ''}`)
  }
} finally {
  await close()
  for (const t of tmps) rmSync(t, { recursive: true, force: true })
}

const ser = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} }`
const body = Object.entries(reg).map(([k, v]) => `  ${k}: ${ser(v)}`).join(',\n')
writeFileSync(REG, `// GENERATED by tools/roulette-art/pack.mjs — do not edit by hand.
// Painted roulette wheel parts in public/images/roulette/ (toy-box restyle).
// rim.open: radius of the rim's round opening as a fraction of the rim width
// (the turning face and the bolt ring are registered to it in
// RouletteWheel.vue). pointer.pivotY: the cap centre as a fraction of the
// pointer height. A missing part keeps its CSS / SVG drawing.
export interface PaintedRoulettePart { file: string, w: number, h: number, v: string }
export interface PaintedRoulette {
  rim?: PaintedRoulettePart & { open: number }
  pointer?: PaintedRoulettePart & { pivotY: number }
  hub?: PaintedRoulettePart
  bulbOff?: PaintedRoulettePart
  bulbOn?: PaintedRoulettePart
}
export const PAINTED_ROULETTE: PaintedRoulette = {${body ? `\n${body}\n` : ''}}
`)
console.log(`${REG} (${Object.keys(reg).length} parts)`)
