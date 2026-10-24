#!/usr/bin/env node
/**
 * Painted smasher parts → runtime sheet.
 *
 *   node tools/smasher-sheets/slice-painted.mjs <id> [--cell 208] [--q 0.82]
 *
 * In:  art-sheets/painted/smasher-<id>-a.png, -b.png — 4 × 4 cells each, any
 *      size, magenta ground: frames 0…15 and 16…31 (see parts.mjs). Every frame
 *      is painted; nothing is mirrored.
 *      art-sheets/smashers-bare/<id>.png — the rig's 8 × 4 reference, no disc.
 * Out: public/images/smashers/<id>_<8c>x<4c>.webp — 8 × 4 cells of <cell> px on
 *      the reference's lattice (FRAME_BOX at 0.94 of a cell, centred), keyed to
 *      alpha; src/smashers/paintedSmashers.ts regenerated from every sliced sheet;
 *      art-sheets/smashers-bare/<id>.sliced-preview.png on the arena green.
 *
 * Per cell: key the measured ground, take the SOLID bbox (α > 140) and register
 * it onto the reference cell's solid bbox (height → scale, bottom + centre x →
 * offset). An empty cell, a height off by more than 0.6–1.6×, or a width that
 * disagrees with the height REFUSES the sheet (loud): that painting is not a
 * turnaround of this drawing. The offending part moves to
 * art-sheets/painted/stale/ (never deleted, never re-read) — re-paint it.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const id = a[0]
if (!id || id.startsWith('--')) { console.error('usage: slice-painted.mjs <id>'); process.exit(2) }
// 208 px cells → 64 px per model unit: the battle draws a smasher at ~55 device
// px/unit (desktop 2×, phone 3× after the arena fit), and the atlas falls back to
// the rig above the sheet's ppu — never drawn below css × dpr. The 3 × 3 square
// returns (~340 px cells) carry the detail for it; 8 × 4 × 208 ≈ 150–220 kB.
const CELL = +opt('cell', 208)
const Q = +opt('q', 0.82)
const LIKE_MAX = +opt('like-max', 14)
const PARTS = { a: [...Array(16).keys()], b: [...Array(16).keys()].map(f => f + 16) }
const G = 4
const paintedDir = join(ROOT, 'art-sheets', 'painted')
const partPath = k => join(paintedDir, `smasher-${id}-${k}.png`)
for (const k of Object.keys(PARTS)) if (!existsSync(partPath(k))) { console.error(`missing ${partPath(k)}`); process.exit(2) }
const refPath = join(ROOT, 'art-sheets', 'smashers-bare', `${id}.png`)
const OUT_DIR = join(ROOT, 'public', 'images', 'smashers')
const dataUrl = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  // key / despill / gain / registration shared with portraits.mjs
  await page.addScriptTag({ content: readFileSync(join(ROOT, 'tools', 'smasher-sheets', 'keying.browser.js'), 'utf8') })
  res = await page.evaluate(async ([partUrls, PARTS, refUrl, CELL, Q, LIKE_MAX, G]) => {
    const { load, grab, keyPainting, refSolid, meanRGB, matchPartB, register } = globalThis.SmasherKeying
    const R = await load(refUrl)
    const rd = grab(R).data
    const RC = R.width / 8
    const out = new OffscreenCanvas(CELL * 8, CELL * 4)
    const ox = out.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    const report = []
    const errors = []
    const grounds = []
    const done = new Set()
    let sideA = null
    for (const [k, frames] of Object.entries(PARTS)) {
      const P = keyPainting(await load(partUrls[k]))
      grounds.push(`${k}:rgb(${P.G})`)
      if (k === 'a') sideA = meanRGB(P, 8)
      else if (sideA) report.push(`gain${k}=${matchPartB(P, sideA).map(g => g.toFixed(2)).join('/')}`)
      frames.forEach((f, idx) => {
        if (done.has(f)) return
        const col = f % 8
        const row = f >> 3
        const { rb, pb, x0, y0, cw, ch, pcw, pch } = register(P, rd, R.width, RC, f, idx)
        if (!rb || !pb) { errors.push(`frame ${f} (part ${k}): empty ${!rb ? 'reference' : 'painted'} cell`); return }
        if (pb.t <= 1 || pb.l <= 1 || pb.r >= cw - 1 || pb.b >= ch - 1) report.push(`!edge${f}`)
        const kk = CELL / RC
        const s = ((rb.b - rb.t) * kk) / (pb.b - pb.t)
        const rel = ((rb.b - rb.t) / RC) / ((pb.b - pb.t) / pch)
        const wrel = ((rb.r - rb.l) / RC) / ((pb.r - pb.l) / pcw)
        if (rel < 0.6 || rel > 1.6) errors.push(`frame ${f} (part ${k}): painted height off by x${rel.toFixed(2)} vs reference`)
        if (wrel / rel < 0.7 || wrel / rel > 1.4) errors.push(`frame ${f} (part ${k}): painted width/height disagree (x${wrel.toFixed(2)} vs x${rel.toFixed(2)})`)
        const dcx = col * CELL + ((rb.l + rb.r) / 2) * kk
        const dby = row * CELL + rb.b * kk
        const scx = x0 + (pb.l + pb.r) / 2
        const sby = y0 + pb.b
        ox.save()
        ox.beginPath()
        ox.rect(col * CELL, row * CELL, CELL, CELL)
        ox.clip()
        ox.setTransform(s, 0, 0, s, dcx - scx * s, dby - sby * s)
        ox.drawImage(P.keyed, x0, y0, cw, ch, x0, y0, cw, ch)
        ox.restore()
        done.add(f)
        report.push(`${f}:x${rel.toFixed(2)}`)
      })
    }
    // facing check: each registered cell must look more like its reference
    // than like the MIRRORED reference (a model that turns the face the wrong
    // way paints a perfectly plausible cell that reads as a wrong-way spin).
    const tiny = (src, sx, sy, sw, flip) => {
      const c = new OffscreenCanvas(24, 24)
      const x = c.getContext('2d')
      x.fillStyle = '#808080'
      x.fillRect(0, 0, 24, 24)
      if (flip) { x.translate(24, 0); x.scale(-1, 1) }
      x.drawImage(src, sx, sy, sw, sw, 0, 0, 24, 24)
      return x.getImageData(0, 0, 24, 24).data
    }
    const refKeyed = new OffscreenCanvas(R.width, R.height)
    {
      const id = grab(R)
      for (let i = 0; i < id.data.length; i += 4) if (refSolid(id.data, i) === false) id.data[i + 3] = 0
      refKeyed.getContext('2d').putImageData(id, 0, 0)
    }
    const dist = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); return s }
    for (const f of done) {
      const o = tiny(out, (f % 8) * CELL, (f >> 3) * CELL, CELL, false)
      const same = dist(o, tiny(refKeyed, (f % 8) * RC, (f >> 3) * RC, RC, false))
      const per = same / (24 * 24 * 3)
      report.push(`d${f}=${per.toFixed(0)}`)
      if (per > LIKE_MAX) errors.push(`frame ${f} (part ${f < 16 ? 'a' : 'b'}): does not look like its reference cell (diff ${per.toFixed(0)} > ${LIKE_MAX})`)
      if (f === 0 || f === 16) continue // front / back are symmetric
      const mirr = dist(o, tiny(refKeyed, (f % 8) * RC, (f >> 3) * RC, RC, true))
      if (mirr < same * 0.9) errors.push(`frame ${f} (part ${f < 16 ? 'a' : 'b'}): faces the WRONG way (mirror matches ${(mirr / same).toFixed(2)}x)`)
    }
    // part b must look as much like ITS reference as part a does (hootsie: a
    // part b that turned the face back toward the viewer in a different
    // colour passed every per-cell bound at ~1.6× part a's median difference)
    const dOf = f => +(report.find(r => r.startsWith(`d${f}=`)) ?? 'd=0').split('=')[1]
    const median = fs => { const v = fs.map(dOf).sort((p, q) => p - q); return v[v.length >> 1] }
    const ma = median(PARTS.a)
    const mb = median(PARTS.b)
    if (mb > Math.max(6, ma * 1.4)) errors.push(`frames 16-31 (part b): unlike its reference (median diff ${mb} vs part a ${ma})`)
    if (ma > Math.max(6, mb * 1.4)) errors.push(`frames 0-15 (part a): unlike its reference (median diff ${ma} vs part b ${mb})`)
    if (errors.length) return { errors, report }
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const pv = new OffscreenCanvas(out.width, out.height)
    const px = pv.getContext('2d')
    px.fillStyle = '#3d6b3a'
    px.fillRect(0, 0, pv.width, pv.height)
    px.drawImage(out, 0, 0)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      report,
      ground: grounds.join(' ')
    }
  }, [Object.fromEntries(Object.keys(PARTS).map(k => [k, dataUrl(partPath(k))])), PARTS, dataUrl(refPath), CELL, Q, LIKE_MAX, G])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error(`REFUSED ${id}:\n  ` + res.errors.join('\n  '))
  mkdirSync(join(paintedDir, 'stale'), { recursive: true })
  const bad = new Set(res.errors.map(e => e.match(/part (\w)/)?.[1]).filter(Boolean))
  for (const k of bad) {
    renameSync(partPath(k), join(paintedDir, 'stale', `smasher-${id}-${k}.${Date.now()}.png`))
    console.error(`  → part ${k} moved to art-sheets/painted/stale/ (re-paint it)`)
  }
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const file = `${id}_${CELL * 8}x${CELL * 4}.webp`
const buf = Buffer.from(res.webp, 'base64')
// one sheet per smasher: a re-cut at another cell size replaces the old file
for (const f of readdirSync(OUT_DIR)) if (f.startsWith(`${id}_`) && f !== file) unlinkSync(join(OUT_DIR, f))
writeFileSync(join(OUT_DIR, file), buf)
writeFileSync(join(ROOT, 'art-sheets', 'smashers-bare', `${id}.sliced-preview.png`), Buffer.from(res.preview, 'base64'))
// marks the sheet as a full 32-frame painting (the paint queue skips it)
writeFileSync(join(ROOT, 'art-sheets', 'smashers-bare', `${id}.full32`), file + '\n')
console.error(`ground ${res.ground}; height ratios ${res.report.join(' ')}`)
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)

// regenerate the runtime registry from what is on disk (this run's file wins per id)
const byId = new Map()
for (const f of readdirSync(OUT_DIR)) {
  const m = f.match(/^([a-z0-9-]+)_(\d+)x(\d+)\.webp$/)
  if (m && (!byId.has(m[1]) || m[0] === file)) byId.set(m[1], m)
}
const entries = [...byId.values()].sort((p, q) => p[1].localeCompare(q[1])).map(m => {
  const v = createHash('sha1').update(readFileSync(join(OUT_DIR, m[0]))).digest('hex').slice(0, 8)
  return `  ${JSON.stringify(m[1])}: { file: ${JSON.stringify(m[0])}, cell: ${+m[2] / 8}, v: '${v}' },`
})
writeFileSync(join(ROOT, 'src', 'smashers', 'paintedSmashers.ts'), `// GENERATED by tools/smasher-sheets/slice-painted.mjs — do not edit by hand.
// Painted smasher sheets in public/images/smashers/: 8 × 4 yaw frames on the
// rig's lattice (FRAME_BOX at 0.94 of a cell, centred), character only (the
// disc stays procedural). Only listed ids are ever fetched — an unpainted
// smasher costs no request and keeps its procedural drawing.
export interface PaintedSmasherSheet { file: string, cell: number, v: string }
export const PAINTED_SMASHERS: Readonly<Record<string, PaintedSmasherSheet>> = {
${entries.join('\n')}
}
`)

// the hi-res VS portraits follow the sheet: re-cut this id's (the sheet's
// hash changed) and drop any whose sheet no longer ships
{
  const { spawnSync } = await import('node:child_process')
  const pr = spawnSync(process.execPath, [join(ROOT, 'tools', 'smasher-sheets', 'portraits.mjs'), id], { cwd: ROOT, stdio: 'inherit' })
  if (pr.status !== 0) console.error(`portraits.mjs ${id} exit ${pr.status} (the VS screen keeps the sheet / rig)`)
}
