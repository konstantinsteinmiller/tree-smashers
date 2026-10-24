#!/usr/bin/env node
/**
 * Painted tree-hit VFX (wood splinters, bark flecks, sawdust puffs, falling
 * leaves) → ONE small runtime atlas.
 *
 *   node tools/tower-sheets/pack-hitfx.mjs [--ppu 3.2] [--q 0.85]
 *
 * In (both TEXT-ONLY Gemini paintings through tools/art-desk/paint.mjs, no
 * --ref, flat magenta ground):
 *   art-sheets/painted/treefx-splinters.png (art-sheets/tree-hit-fx/splinters.prompt.txt)
 *     wood bits in the top half (light chips + dark bark), sawdust puffs below
 *   art-sheets/painted/treefx-leaves.png (art-sheets/tree-hit-fx/leaves.prompt.txt)
 *     single leaves, green and yellowing
 * Out: public/images/towers/hitfx_<w>x<h>.webp — keyed to alpha, trimmed,
 *      shelf-packed; src/use/paintedHitFx.ts — generated registry
 *      (PAINTED_HIT_FX); art-sheets/tree-hit-fx/atlas.preview.png — the atlas
 *      on grass green, 4× nearest.
 * Exit: 0 ok · 2 no painting · 3 REFUSED (too few usable pieces — re-paint) ·
 *      other = a crash.
 *
 * Key + despill: exactly the tree packer's (pack.mjs): ground colour from the
 * frame edge, alpha ramp (d − 45) / 75, magenta spill removed within 3 px of
 * the keyed ground. Pieces = connected solid blobs (α > 140, ≥ 40 px, not on
 * the frame edge), NOT grid cells: Gemini tends to paint each "chip" cell as a
 * little burst of separate pieces, and every loose piece is exactly one
 * particle. Each blob is classified (SHEETS / classify: position + mean
 * colour of its non-outline pixels), chips / bark must be elongated (principal
 * axes ≥ 1.5 : 1) and near-convex (area ≥ 0.86 × convex hull — a clump of
 * touching pieces is not one splinter), puffs and leaves must have no enclosed ground (a ring-shaped
 * puff would show the floor through it); the biggest `want` per kind are kept
 * (anything under 20 % of the kind's biggest piece is a crumb and dropped).
 *
 * Orientation: chips, bark and leaves are turned so their LONG axis (the
 * principal axis of the silhouette) runs left → right — the renderer
 * (src/use/towerHitFxArt.ts) spins them along the particle's rotation exactly
 * like the procedural splinter / leaf it replaces, whose long axis is x.
 * Sawdust puffs keep the painted orientation (they never spin).
 *
 * Resolution (render-sharpness rule — never upscaled): every sprite's long
 * axis maps to PPU × the largest on-screen length of its particle kind in
 * arena units (towerHitFx.ts spawn sizes at the largest tower radius, 38 →
 * s = 1.9), never above its painted size; the renderer draws a particle
 * procedurally whenever it would stretch its sprite past 1.02 device px per
 * atlas px.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const PPU = +opt('ppu', 3.2)
const Q = +opt('q', 0.85)

/** Largest on-screen long axis per kind in arena units (towerHitFx.ts, s = 38 / 20):
 *  chip L = (4 + 4)·s · bark L = (3 + 2.5)·s · puff width 0.8 × 2 × 1.5 × (5 + 3)·s
 *  (HIT_FX_PUFF_W: a round painted puff covers about the procedural flat disc's area) ·
 *  leaf 2L = 2 × (2.5 + 1.5)·s (owner: leaves at half the first size). */
const S = 38 / 20
const MAX_LEN = { chip: 8 * S, bark: 5.5 * S, dust: 0.8 * 2 * 1.5 * 8 * S, leaf: 2 * 4 * S }

/** Sprites wanted per kind (the biggest clean pieces win); `min` = refuse below. */
const SHEETS = [
  { src: 'treefx-splinters.png', type: 'splinters', want: { chip: 6, bark: 6, dust: 4 }, min: 3 },
  { src: 'treefx-leaves.png', type: 'leaves', want: { leaf: 8, leafYellow: 4 }, min: 3 }
]

const paintings = SHEETS.map(sh => join(ROOT, 'art-sheets', 'painted', sh.src))
for (const p of paintings) if (!existsSync(p)) { console.error(`no painting: ${p}`); process.exit(2) }
const urls = paintings.map(p => `data:image/png;base64,${readFileSync(p).toString('base64')}`)

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
let res
try {
  const page = await browser.newPage()
  res = await page.evaluate(async ([urls, sheets, PPU, Q, MAX_LEN]) => {
    /** Splinters sheet: wood bits in the top half (light = chip, dark = bark),
     *  sawdust puffs below. Leaves sheet: yellowing when red ≈ green. */
    const classify = (type, m) => type === 'splinters'
      ? (m.cy < 0.5 ? (m.lum > 140 ? 'chip' : 'bark') : 'dust')
      : (m.r > m.g * 0.88 ? 'leafYellow' : 'leaf')
    const errors = []
    const report = []
    /** Every cut sprite: { kind, canvas } (keyed, turned, trimmed, scaled). */
    const sprites = []

    const trim = (cv) => {
      const g = cv.getContext('2d')
      const { width: W, height: H } = cv
      const d = g.getImageData(0, 0, W, H).data
      let l = W, t = H, r = -1, b = -1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
      }
      if (r < 0) return null
      const o = new OffscreenCanvas(r - l + 1, b - t + 1)
      o.getContext('2d').drawImage(cv, l, t, o.width, o.height, 0, 0, o.width, o.height)
      return o
    }
    /** Halving steps, then one final high-quality step (clean downscale). */
    const scaleTo = (cv, s) => {
      let cur = cv
      let left = s
      while (left < 0.5) {
        const o = new OffscreenCanvas(Math.max(1, Math.round(cur.width / 2)), Math.max(1, Math.round(cur.height / 2)))
        const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'
        g.drawImage(cur, 0, 0, o.width, o.height)
        left *= cur.width / o.width
        cur = o
      }
      const o = new OffscreenCanvas(Math.max(1, Math.round(cur.width * left)), Math.max(1, Math.round(cur.height * left)))
      const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'
      g.drawImage(cur, 0, 0, o.width, o.height)
      return o
    }

    for (let si = 0; si < urls.length; si++) {
      const P = new Image(); P.src = urls[si]; await P.decode()
      const W = P.width, H = P.height
      const c = new OffscreenCanvas(W, H)
      const cx = c.getContext('2d')
      cx.drawImage(P, 0, 0)
      const pd = cx.getImageData(0, 0, W, H)
      const d = pd.data
      // Ground = median of the vivid-magenta pixels (Gemini sometimes frames
      // the sheet with pale-pink cell lines, so the frame edge alone lies);
      // the frame edge only when the sheet has no vivid magenta at all.
      let edge = []
      for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 2] > 200 && d[i + 1] < 90) edge.push([d[i], d[i + 1], d[i + 2]])
      if (edge.length < 1000) {
        edge = []
        for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; edge.push([d[i], d[i + 1], d[i + 2]]) }
      }
      const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
      const G = [med(0), med(1), med(2)]
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
        d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 45) / 75)) * 255)
      }
      const near = new Uint8Array(W * H)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] === 255) continue
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= H) continue
          for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) near[yy * W + xx] = 1 }
        }
      }
      for (let p = 0; p < W * H; p++) {
        if (!near[p]) continue
        const i = p * 4
        const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
        if (spill > 0) { d[i] -= spill; d[i + 2] -= spill }
      }
      cx.putImageData(pd, 0, 0)
      // Solid blobs → cells by centroid.
      const lab = new Int32Array(W * H).fill(-1)
      const blobs = []
      const stack = []
      for (let p0 = 0; p0 < W * H; p0++) {
        if (lab[p0] !== -1 || d[p0 * 4 + 3] <= 140) continue
        const b = { l: 1e9, t: 1e9, r: -1, b: -1, n: 0, sx: 0, sy: 0, id: blobs.length }
        lab[p0] = blobs.length
        stack.push(p0)
        while (stack.length) {
          const p = stack.pop()
          const x = p % W, y = (p - x) / W
          b.n++; b.sx += x; b.sy += y
          if (x < b.l) b.l = x
          if (x > b.r) b.r = x
          if (y < b.t) b.t = y
          if (y > b.b) b.b = y
          for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
            if (q >= 0 && lab[q] === -1 && d[q * 4 + 3] > 140) { lab[q] = blobs.length; stack.push(q) }
          }
        }
        blobs.push(b)
      }
      // Classify every solid blob (one loose piece = one sprite), keep the
      // biggest clean ones per kind.
      const kinds = {}
      for (const b of blobs) {
        if (b.n < 40) continue
        if (b.l <= 1 || b.t <= 1 || b.r >= W - 2 || b.b >= H - 2) continue
        const mx = b.sx / b.n, my = b.sy / b.n
        let n = 0, R = 0, Gs = 0, B = 0, m20 = 0, m02 = 0, m11 = 0, hole = 0
        for (let y = b.t; y <= b.b; y++) for (let x = b.l; x <= b.r; x++) {
          const p = y * W + x
          if (lab[p] !== b.id) continue
          const ux = x - mx, uy = y - my
          m20 += ux * ux; m02 += uy * uy; m11 += ux * uy
          const i = p * 4
          if (d[i] + d[i + 1] + d[i + 2] > 210) { n++; R += d[i]; Gs += d[i + 1]; B += d[i + 2] }
        }
        // Enclosed ground (a ring-shaped puff): ground in the bbox not reachable from its border.
        const bw = b.r - b.l + 1, bh = b.b - b.t + 1
        const seen = new Uint8Array(bw * bh)
        const st = []
        for (let x = 0; x < bw; x++) for (const y of [0, bh - 1]) st.push(y * bw + x)
        for (let y = 0; y < bh; y++) for (const x of [0, bw - 1]) st.push(y * bw + x)
        while (st.length) {
          const q = st.pop()
          if (seen[q]) continue
          const x = q % bw, y = (q - x) / bw
          if (lab[(y + b.t) * W + (x + b.l)] === b.id) continue
          seen[q] = 1
          if (x > 0) st.push(q - 1)
          if (x < bw - 1) st.push(q + 1)
          if (y > 0) st.push(q - bw)
          if (y < bh - 1) st.push(q + bw)
        }
        for (let q = 0; q < bw * bh; q++) if (!seen[q] && lab[(Math.floor(q / bw) + b.t) * W + (q % bw) + b.l] !== b.id) hole++
        const tr = m20 + m02, det = m20 * m02 - m11 * m11
        const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det))
        const elong = Math.sqrt(l1 / Math.max(1e-6, l2))
        // Solidity = area / convex-hull area: a single splinter is close to
        // convex, a clump of touching pieces is not.
        const pts = []
        for (let y = b.t; y <= b.b; y++) {
          let lo = -1, hi = -1
          for (let x = b.l; x <= b.r; x++) if (lab[y * W + x] === b.id) { if (lo < 0) lo = x; hi = x }
          if (lo >= 0) { pts.push([lo, y], [hi + 1, y], [lo, y + 1], [hi + 1, y + 1]) }
        }
        pts.sort((p, q) => p[0] - q[0] || p[1] - q[1])
        const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
        const lower = [], upper = []
        for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
        for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
        const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
        let hullA = 0
        for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; hullA += p[0] * q[1] - q[0] * p[1] }
        const solidity = b.n / Math.max(1, Math.abs(hullA) / 2)
        const lum = n ? (R + Gs + B) / (3 * n) : 0
        const kind = classify(sheets[si].type, { cy: my / H, lum, r: n ? R / n : 0, g: n ? Gs / n : 0, b: n ? B / n : 0 })
        if (!kind) continue
        if ((kind === 'chip' || kind === 'bark') && (elong < 1.5 || solidity < 0.86)) continue
        if (kind === 'dust' && hole > b.n * 0.005) continue
        if (kind.startsWith('leaf') && hole > b.n * 0.02) continue
        b.mx = mx; b.my = my
        b.theta = kind === 'dust' ? 0 : 0.5 * Math.atan2(2 * m11, m20 - m02)
        ;(kinds[kind] ??= []).push(b)
      }
      for (const [kind, want] of Object.entries(sheets[si].want)) {
        const list = (kinds[kind] ?? []).sort((p, q) => q.n - p.n)
        const big = list.length ? list[0].n : 0
        const pick = list.filter(b => b.n >= big * 0.2).slice(0, want)
        if (pick.length < Math.min(want, sheets[si].min)) { errors.push(`${sheets[si].src}: only ${pick.length} usable ${kind} piece(s)`); continue }
        report.push(`  ${kind}: ${pick.length} of ${list.length} candidates`)
        for (const q of pick) {
        // Cut the piece: its own solid pixels + the soft edge (≤ 2 px) around them.
        const l = Math.max(0, q.l - 3), t = Math.max(0, q.t - 3)
        const r = Math.min(W - 1, q.r + 3), bt = Math.min(H - 1, q.b + 3)
        const cw = r - l + 1, ch = bt - t + 1
        const cut = new OffscreenCanvas(cw, ch)
        const cg = cut.getContext('2d')
        cg.drawImage(c, l, t, cw, ch, 0, 0, cw, ch)
        const cd = cg.getImageData(0, 0, cw, ch)
        const own = new Uint8Array(cw * ch)
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (lab[(y + t) * W + (x + l)] === q.id) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy
            if (xx >= 0 && yy >= 0 && xx < cw && yy < ch) own[yy * cw + xx] = 1
          }
        }
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const id = lab[(y + t) * W + (x + l)]
          if (id === q.id) continue
          if (id !== -1 || !own[y * cw + x]) cd.data[(y * cw + x) * 4 + 3] = 0
        }
        cg.putImageData(cd, 0, 0)
        const mx = q.mx, my = q.my, theta = q.theta
        const diag = Math.ceil(Math.hypot(cw, ch)) + 4
        const rot = new OffscreenCanvas(diag, diag)
        const rg = rot.getContext('2d')
        rg.imageSmoothingQuality = 'high'
        rg.translate(diag / 2, diag / 2)
        rg.rotate(-theta)
        rg.drawImage(cut, -(mx - l), -(my - t))
        let src = trim(rot)
        // Long axis vertical after the turn (θ ambiguity) → a quarter turn more.
        if (kind !== 'dust' && src.height > src.width) {
          const q2 = new OffscreenCanvas(src.height, src.width)
          const g2 = q2.getContext('2d')
          g2.translate(q2.width / 2, q2.height / 2); g2.rotate(Math.PI / 2)
          g2.drawImage(src, -src.width / 2, -src.height / 2)
          src = q2
        }
        const target = PPU * MAX_LEN[kind === 'leafYellow' ? 'leaf' : kind]
        const s = Math.min(1, target / src.width)
        if (s === 1 && target > src.width * 1.01) report.push(`  note: ${kind} piece painted smaller than target (${src.width} < ${target.toFixed(0)} px)`)
        const fin = trim(scaleTo(src, s)) ?? scaleTo(src, s)
        sprites.push({ kind, canvas: fin })
        }
      }
      report.push(`${sheets[si].src}: ${W}x${H}, ground rgb(${G.join(',')}), ${blobs.filter(b => b.n >= 40).length} blobs`)
    }
    if (errors.length) return { errors, report }

    // Shelf pack (tallest first), 2 px gutter.
    const PAD = 2
    const order = sprites.map((s, i) => i).sort((p, q) => sprites[q].canvas.height - sprites[p].canvas.height)
    const total = sprites.reduce((n, s) => n + (s.canvas.width + PAD) * (s.canvas.height + PAD), 0)
    const AWmax = Math.max(Math.ceil(Math.sqrt(total) * 1.15), ...sprites.map(s => s.canvas.width + PAD))
    let x = 0, y = 0, shelf = 0, AW = 0
    const place = []
    for (const i of order) {
      const cv = sprites[i].canvas
      if (x + cv.width > AWmax) { x = 0; y += shelf + PAD; shelf = 0 }
      place[i] = { x, y }
      x += cv.width + PAD
      if (x > AW) AW = x
      if (cv.height > shelf) shelf = cv.height
    }
    AW = Math.ceil(AW / 4) * 4
    const AH = Math.ceil((y + shelf) / 4) * 4
    const out = new OffscreenCanvas(AW, AH)
    const ox = out.getContext('2d')
    const meta = { chip: [], bark: [], dust: [], leaf: [], leafYellow: [] }
    sprites.forEach((s, i) => {
      ox.drawImage(s.canvas, place[i].x, place[i].y)
      meta[s.kind].push({ x: place[i].x, y: place[i].y, w: s.canvas.width, h: s.canvas.height })
    })
    for (const k of Object.keys(meta)) report.push(`${k}: ${meta[k].map(m => `${m.w}x${m.h}`).join(' ')}`)
    const toB64 = async blob => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const SC = 4
    const pv = new OffscreenCanvas(AW * SC, AH * SC)
    const px = pv.getContext('2d')
    px.fillStyle = '#4f7d45'
    px.fillRect(0, 0, pv.width, pv.height)
    px.imageSmoothingEnabled = false
    px.drawImage(out, 0, 0, pv.width, pv.height)
    return {
      webp: await toB64(await out.convertToBlob({ type: 'image/webp', quality: Q })),
      preview: await toB64(await pv.convertToBlob({ type: 'image/png' })),
      meta, AW, AH, report
    }
  }, [urls, SHEETS, PPU, Q, MAX_LEN])
} finally {
  await browser.close()
}

if (res.errors) {
  console.error((res.report ?? []).join('\n'))
  console.error('REFUSED:\n  ' + res.errors.join('\n  ') + '\n  → move the painting to art-sheets/painted/stale/ and re-paint')
  process.exit(3)
}
const OUT_DIR = join(ROOT, 'public', 'images', 'towers')
mkdirSync(OUT_DIR, { recursive: true })
const file = `hitfx_${res.AW}x${res.AH}.webp`
for (const f of readdirSync(OUT_DIR)) if (f.startsWith('hitfx_') && f !== file) unlinkSync(join(OUT_DIR, f))
const buf = Buffer.from(res.webp, 'base64')
writeFileSync(join(OUT_DIR, file), buf)
mkdirSync(join(ROOT, 'art-sheets', 'tree-hit-fx'), { recursive: true })
writeFileSync(join(ROOT, 'art-sheets', 'tree-hit-fx', 'atlas.preview.png'), Buffer.from(res.preview, 'base64'))
console.error(res.report.join('\n'))
console.log(`${file} ${(buf.length / 1024).toFixed(1)} kB`)
const v = createHash('sha1').update(buf).digest('hex').slice(0, 8)
const list = (k) => `[\n${res.meta[k].map(m => `    { x: ${m.x}, y: ${m.y}, w: ${m.w}, h: ${m.h} }`).join(',\n')}\n  ]`
writeFileSync(join(ROOT, 'src', 'use', 'paintedHitFx.ts'), `// GENERATED by tools/tower-sheets/pack-hitfx.mjs — do not edit by hand.
// Painted tree-hit VFX in public/images/towers/ (src/use/towerHitFxArt.ts):
// each sprite's rect in the atlas (atlas px). Chips, bark flecks and leaves
// are turned so their LONG axis runs along x; sawdust puffs are upright.
export interface PaintedHitFxSprite { x: number, y: number, w: number, h: number }
export interface PaintedHitFxAtlas {
  file: string
  v: string
  chip: readonly PaintedHitFxSprite[]
  bark: readonly PaintedHitFxSprite[]
  dust: readonly PaintedHitFxSprite[]
  leaf: readonly PaintedHitFxSprite[]
  leafYellow: readonly PaintedHitFxSprite[]
}
export const PAINTED_HIT_FX: PaintedHitFxAtlas | null = {
  file: '${file}',
  v: '${v}',
  chip: ${list('chip')},
  bark: ${list('bark')},
  dust: ${list('dust')},
  leaf: ${list('leaf')},
  leafYellow: ${list('leafYellow')}
}
`)
