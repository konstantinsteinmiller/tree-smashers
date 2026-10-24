#!/usr/bin/env node
/**
 * Painted title ribbons → 3-slice WebPs (left end, stretchable middle, right end)
 * + the generated registry FRibbon.vue reads.
 *
 *   node tools/ribbon-art/pack.mjs [--q 0.88]
 *
 * In:  art-sheets/painted/ribbon-<fam>.png (paint-queue.mjs), fam ∈ sun/leaf/berry/royal.
 * Key: tools/art-desk/slice.mjs (magenta measured on the frame → alpha, fringe
 *      unmixed) at the painting's native size, then trimmed to the banner.
 * Cut: the face is the straight band at the centre column; walking outward, the
 *      first column whose top/bottom edge leaves that band by > 2 px is where an
 *      end begins. The ends are cut a little inside the flat face (0.35 × face
 *      height past that point). The MIDDLE is one column: the per-row median of
 *      the flat face between the cuts — stretched horizontally it is seamless by
 *      construction. The last 10 px of each end are blended into that column so
 *      the joins carry no step; the residual step before blending is reported as
 *      `seam` (mean |ΔRGBA| per row and channel, 0–255).
 * Out: public/images/ribbon/<fam>-{l,m,r}_<W>x<H>.webp — height for the biggest
 *      ribbon (2.1 rem = 33.6 css px font) at 3× DPR, never upscaled;
 *      src/use/paintedRibbons.ts (null per family = the SVG ribbon stays).
 * A painting whose face is not straight (flat band < 30 % of the width) is
 * skipped with `NOT_STRAIGHT` (exit 3 when every painted family failed).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openCanvas } from '../art-desk/imaging.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const a = process.argv.slice(2)
const Q = Number((() => { const i = a.indexOf('--q'); return i >= 0 ? a[i + 1] : '0.88' })())
const FAMS = ['sun', 'leaf', 'berry', 'royal']
const OUT = join(ROOT, 'public', 'images', 'ribbon')
const REG = join(ROOT, 'src', 'use', 'paintedRibbons.ts')
/** The face is 1.9 em tall in FRibbon; the biggest ribbon font is 36 css px (turn banner); 3× DPR. */
const FACE_EM = 1.9
const PX_PER_EM_3X = 36 * 3

const tmp = join(tmpdir(), `ribbon-pack-${process.pid}`)
mkdirSync(tmp, { recursive: true })
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const reg = {}
const { page, close } = await openCanvas(ROOT)
try {
  for (const fam of FAMS) {
    const src = join(ROOT, 'art-sheets', 'painted', `ribbon-${fam}.png`)
    reg[fam] = null
    if (!existsSync(src)) { console.error(`${fam}: not painted yet`); continue }
    // 1. Key the magenta at native resolution with the shared slicer.
    const head = readFileSync(src)
    const W0 = head.readUInt32BE(16), H0 = head.readUInt32BE(20)
    const k = spawnSync(process.execPath, [join(ROOT, 'tools', 'art-desk', 'slice.mjs'), '--in', src, '--out-dir', tmp,
      '--size', `${W0}x${H0}`, '--fit', 'cell', '--png', '--quality', '1', '--names', fam],
    { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
    if (k.status !== 0) { console.error(`${fam}: key failed`); continue }
    // 2. Cut + blend + scale + encode in the canvas.
    const r = await page.evaluate(async ({ b64, FACE_EM, PX, Q }) => {
      const toB64 = async (canvas) => {
        const u = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: Q })).arrayBuffer())
        let s = ''
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
        return btoa(s)
      }
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      let W = bmp.width, H = bmp.height
      const c0 = new OffscreenCanvas(W, H)
      c0.getContext('2d').drawImage(bmp, 0, 0)
      let d = c0.getContext('2d').getImageData(0, 0, W, H).data
      let L = W, R = -1, T = H, B = -1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 40) { if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y }
      }
      if (R < 0) return { ok: false, why: 'EMPTY' }
      const tw = R - L + 1, th = B - T + 1
      const c1 = new OffscreenCanvas(tw, th)
      c1.getContext('2d').drawImage(c0, L, T, tw, th, 0, 0, tw, th)
      W = tw; H = th
      d = c1.getContext('2d').getImageData(0, 0, W, H).data
      const A = (x, y) => d[(y * W + x) * 4 + 3]
      const top = new Int32Array(W).fill(-1), bot = new Int32Array(W).fill(-1)
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) if (A(x, y) > 128) { top[x] = y; break }
        for (let y = H - 1; y >= 0; y--) if (A(x, y) > 128) { bot[x] = y; break }
      }
      const med = (arr) => { const v = [...arr].sort((p, q) => p - q); return v[v.length >> 1] }
      const cx = W >> 1, span = Math.max(2, (W / 20) | 0)
      const T0 = med(top.slice(cx - span, cx + span)), B0 = med(bot.slice(cx - span, cx + span))
      const flat = (x) => Math.abs(top[x] - T0) <= 2 && Math.abs(bot[x] - B0) <= 2
      let eL = cx; while (eL > 0 && flat(eL - 1)) eL--
      let eR = cx; while (eR < W - 1 && flat(eR + 1)) eR++
      const fh = B0 - T0 + 1
      if (eR - eL < W * 0.3) return { ok: false, why: `NOT_STRAIGHT: flat band ${eR - eL}px of ${W}` }
      const inset = Math.round(fh * 0.35)
      const cL = eL + inset, cR = eR - inset
      const xs = []
      for (let x = cL + 4; x < cR - 4; x += Math.max(1, ((cR - cL) / 60) | 0)) xs.push(x)
      const col = new Uint8ClampedArray(H * 4)
      for (let y = 0; y < H; y++) for (let ch = 0; ch < 4; ch++) col[y * 4 + ch] = med(xs.map(x => d[(y * W + x) * 4 + ch]))
      const seamAt = (x) => {
        let s = 0
        for (let y = 0; y < H; y++) for (let ch = 0; ch < 4; ch++) s += Math.abs(d[(y * W + x) * 4 + ch] - col[y * 4 + ch])
        return +(s / (H * 4)).toFixed(2)
      }
      // How uniform is the face itself (worst column vs the median column)?
      const spread = Math.max(...xs.map(seamAt))
      const seam = { l: seamAt(cL), r: seamAt(cR), faceSpread: spread }
      const BL = 10
      for (let i = 0; i < BL; i++) {
        const t = (i + 1) / BL
        for (const x of [cL - BL + 1 + i, cR + BL - 1 - i]) for (let y = 0; y < H; y++) for (let ch = 0; ch < 4; ch++) {
          const p = (y * W + x) * 4 + ch
          d[p] = d[p] * (1 - t) + col[y * 4 + ch] * t
        }
      }
      const cB = new OffscreenCanvas(W, H)
      cB.getContext('2d').putImageData(new ImageData(d, W, H), 0, 0)
      const rowY = Math.round(T0 + fh * 0.15)
      let fL = 0; while (fL < cL && A(fL, rowY) <= 128) fL++
      let fR = W - 1; while (fR > cR && A(fR, rowY) <= 128) fR--
      const hOut = Math.min(H, Math.ceil(FACE_EM * H / fh * PX)), s = hOut / H
      const enc = async (sx, sw) => {
        const w = Math.max(1, Math.round(sw * s))
        const c = new OffscreenCanvas(w, hOut), g = c.getContext('2d')
        g.imageSmoothingQuality = 'high'
        g.drawImage(cB, sx, 0, sw, H, 0, 0, w, hOut)
        return { w, b64: await toB64(c) }
      }
      const cm = new OffscreenCanvas(1, H)
      cm.getContext('2d').putImageData(new ImageData(col, 1, H), 0, 0)
      const mc = new OffscreenCanvas(8, hOut), mg = mc.getContext('2d')
      mg.imageSmoothingQuality = 'high'
      mg.drawImage(cm, 0, 0, 1, H, 0, 0, 8, hOut)
      const l = await enc(0, cL + 1), rr = await enc(cR, W - cR)
      return {
        ok: true, src: { W, H, T0, B0, eL, eR, cL, cR, fL, fR }, seam, h: hOut,
        l, r: rr, m: { w: 8, b64: await toB64(mc) },
        faceTop: +(T0 / H).toFixed(4), faceBot: +((B0 + 1) / H).toFixed(4),
        faceL: +(fL / H).toFixed(4), faceR: +((W - 1 - fR) / H).toFixed(4)
      }
    }, { b64: readFileSync(join(tmp, `${fam}.png`)).toString('base64'), FACE_EM, PX: PX_PER_EM_3X, Q })
    if (!r.ok) { console.error(`${fam}: ${r.why}`); console.log(`${fam}: ${r.why}`); continue }
    const files = {}
    for (const part of ['l', 'm', 'r']) {
      const f = `${fam}-${part}_${r[part].w}x${r.h}.webp`
      writeFileSync(join(OUT, f), Buffer.from(r[part].b64, 'base64'))
      files[part] = { file: f, w: r[part].w }
    }
    const v = createHash('sha1').update(r.l.b64 + r.m.b64 + r.r.b64).digest('hex').slice(0, 8)
    reg[fam] = { ...files, h: r.h, faceTop: r.faceTop, faceBot: r.faceBot, faceL: r.faceL, faceR: r.faceR, v }
    console.error(`${fam}: src ${JSON.stringify(r.src)} seam ${JSON.stringify(r.seam)} → h ${r.h}, l ${r.l.w}, r ${r.r.w}`)
  }
} finally {
  await close()
  rmSync(tmp, { recursive: true, force: true })
}

const sl = (s) => `{ file: '${s.file}', w: ${s.w} }`
const fmt = (p) => p
  ? `{\n    l: ${sl(p.l)},\n    m: ${sl(p.m)},\n    r: ${sl(p.r)},\n    h: ${p.h}, faceTop: ${p.faceTop}, faceBot: ${p.faceBot}, faceL: ${p.faceL}, faceR: ${p.faceR}, v: '${p.v}'\n  }`
  : 'null'
writeFileSync(REG, `// GENERATED by tools/ribbon-art/pack.mjs — do not edit by hand.
// The painted title ribbons in public/images/ribbon/: a 3-slice per tone family
// (l = left end with its tail, m = one stretchable face column, r = right end).
// Fractions are of the slice HEIGHT h (faceTop/faceBot: the face band incl. its
// outline; faceL/faceR: where the face starts inside the left / right end).
// null = the SVG ribbon stays (src/components/atoms/FRibbon.vue).
export interface RibbonSlice { file: string, w: number }
export interface PaintedRibbon {
  l: RibbonSlice
  m: RibbonSlice
  r: RibbonSlice
  h: number
  faceTop: number
  faceBot: number
  faceL: number
  faceR: number
  v: string
}
export type RibbonFamily = 'sun' | 'leaf' | 'berry' | 'royal'
export const PAINTED_RIBBONS: Record<RibbonFamily, PaintedRibbon | null> = {
${FAMS.map(f => `  ${f}: ${fmt(reg[f])}`).join(',\n')}
}
`)
const n = FAMS.filter(f => reg[f]).length
console.log(`${REG} (${n}/4 families)`)
process.exit(n === 0 && FAMS.some(f => existsSync(join(ROOT, 'art-sheets', 'painted', `ribbon-${f}.png`))) ? 3 : 0)
