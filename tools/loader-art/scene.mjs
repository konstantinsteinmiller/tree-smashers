/**
 * ─── The loader's key-art scene, drawn by code ──────────────────────────────
 *
 * Every vector layer of the FLogoProgress / #static-splash backdrop, as small
 * SVG strings (flat fills, bold navy outlines, hard-edged cel tones — no blur,
 * no glow, no gradients of any kind; tests/loaderScene.test.ts guards it).
 * build.mjs inlines them as data URIs into the shared loader CSS in
 * index.html, so the static splash paints the whole scene in its FIRST frame
 * from inline CSS alone, and both DOMs read the same bytes.
 *
 * Tiles that repeat sideways (clouds, hills, forest, ground, drift) are
 * periodic by construction: their crest is a sum of whole-period sines and
 * every shape that crosses an edge is drawn again one tile over.
 *
 * Painted versions (tools/loader-art/pack.mjs → painted.json) replace the
 * tree, the forest band and the foreground corner; these stay the fallback.
 */

export const NAVY = '#161a40'

// deterministic randomness (the scene must not change from build to build)
const rng = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const n = (v) => String(Math.round(v))
const circle = (cx, cy, r, attrs = '') => `<circle cx='${n(cx)}' cy='${n(cy)}' r='${n(r)}'${attrs}/>`

/** A periodic crest y(x) over [0, W]: base + Σ a·sin(2πk·x/W + φ). */
const wave = (W, base, terms) => (x) => terms.reduce((s, [k, a, p]) => s + a * Math.sin((2 * Math.PI * k * x) / W + p), base)

/**
 * Catmull-Rom -> cubic Bezier through periodic samples of fn, from one sample
 * left of the tile to one sample right of it (so a stroked, closed outline
 * has its sides OUTSIDE the tile), closed down to y = H + 400.
 */
const crest = (W, H, fn, step) => {
  const cnt = Math.max(4, Math.round(W / step))
  const pt = (i) => [(i * W) / cnt, fn((((i % cnt) + cnt) % cnt) * W / cnt)]
  let d = `M${n(-W / cnt)} ${H + 400}L${n(-W / cnt)} ${n(pt(-1)[1])}`
  for (let i = -1; i <= cnt; i++) {
    const [p0, p1, p2, p3] = [pt(i - 1), pt(i), pt(i + 1), pt(i + 2)]
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`
  }
  return `${d}L${n(W + W / cnt)} ${H + 400}Z`
}

/** One crest, drawn as a lip / body / dark stack of the same shape shifted down. */
const stack = (d, layers, outline = 0) => `<defs><path id='k' d='${d}'/></defs>` + layers.map(([fill, dy], i) =>
  `<use href='#k'${dy ? ` y='${dy}'` : ''} fill='${fill}'${i === 0 && outline ? ` stroke='${NAVY}' stroke-width='${outline}'` : ''}/>`).join('')

/** A cel-shaded leaf clump (unit circle): dark rim + navy line, mid body, light cap. */
const CLUMP = (dark, mid, light, line = 0.05) => `<g id='c'><circle r='1' fill='${dark}' stroke='${NAVY}' stroke-width='${line}'/><circle cx='-.05' cy='-.12' r='.86' fill='${mid}'/><circle cx='-.26' cy='-.36' r='.42' fill='${light}'/></g>`
const useAt = (id, x, y, r) => `<use href='#${id}' transform='translate(${n(x)} ${n(y)})scale(${Math.round(r)})'/>`

const svg = (w, h, body, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='${vb}'>${body}</svg>`

/** Shapes that cross a tile edge are drawn again one tile over. */
const wrap = (items, W) => items.flatMap((c) => {
  const out = [c]
  if (c.x - c.r < 0) out.push({ ...c, x: c.x + W })
  if (c.x + c.r > W) out.push({ ...c, x: c.x - W })
  return out
})

// ─── Sky ─────────────────────────────────────────────────────────────────────

/** Flat sun rays: 18 solid wedges + thin streaks, white at low opacity. */
export const rays = () => {
  const cnt = 18
  const wedge = (inner, outer, half, off) => {
    let d = ''
    for (let i = 0; i < cnt; i++) {
      const a = ((i + off) / cnt) * Math.PI * 2
      const p = (r, ang) => `${n(Math.cos(ang) * r)} ${n(Math.sin(ang) * r)}`
      d += `M${p(inner, a - half * 0.25)}L${p(outer, a - half)}L${p(outer, a + half)}L${p(inner, a + half * 0.25)}Z`
    }
    return d
  }
  const step = Math.PI / cnt
  return svg(200, 200, `<path fill='#fff' fill-opacity='.15' d='${wedge(8, 142, step * 0.62, 0)}'/><path fill='#fff' fill-opacity='.28' d='${wedge(30, 142, step * 0.07, 0.5)}'/>`, '-100 -100 200 200')
}

/** Puffy flat clouds — a white body over a pale-sky underside, no outline. */
export const clouds = (seed, W, H, count, scale) => {
  const R = rng(seed)
  let top = ''
  for (let i = 0; i < count; i++) {
    const cx = (W / count) * (i + 0.2 + R() * 0.6)
    const cy = H * (0.4 + R() * 0.3)
    const w = scale * (0.75 + R() * 0.5)
    const puffs = [[-0.95, 0.14, 0.4], [-0.45, -0.1, 0.6], [0.16, -0.28, 0.74], [0.76, 0, 0.54], [1.18, 0.18, 0.36], [0.1, 0.2, 0.5]]
      .map(([dx, dy, r]) => ({ x: cx + dx * w, y: cy + dy * w, r: r * w }))
    for (const p of wrap(puffs, W)) top += circle(p.x, p.y, p.r)
  }
  return svg(W, H, `<defs><g id='u'>${top}</g></defs><use href='#u' y='${Math.round(scale * 0.18)}' fill='#b9e8ff'/><use href='#u' fill='#fff'/>`)
}

// ─── Hills ───────────────────────────────────────────────────────────────────

/** A rolling hill tile: a light lip over the body (+ a darker foot); optional navy crest line + round tree-tops. */
export const hills = ({ W, H, base, terms, lip, body, dark, outline = 0, tufts = 0, tuftTone, tuftLip, seed = 1 }) => {
  const fn = wave(W, base, terms)
  let s = stack(crest(W, H, fn, 100), [[lip, 0], [body, Math.round(H * 0.05)], [dark, Math.round(H * 0.32)]], outline)
  if (tufts) {
    // round tree-tops sitting on the crest (behind the line)
    const R = rng(seed)
    const items = []
    for (let i = 0; i < tufts; i++) {
      const x = (W / tufts) * (i + 0.15 + R() * 0.7)
      const r = H * (0.06 + R() * 0.05)
      items.push({ x, y: fn(x) + r * 0.35, r })
      items.push({ x: x + r * 0.9, y: fn(x + r * 0.9) + r * 0.6, r: r * 0.7 })
    }
    s = `<defs>${CLUMP(tuftTone, tuftTone, tuftLip, outline / 30)}</defs>${wrap(items, W).map((c) => useAt('c', c.x, c.y, c.r)).join('')}` + s
  }
  return svg(W, H, s)
}

// ─── Forest band (vector fallback of the painted one) ────────────────────────

export const forest = (W = 1200, H = 420) => {
  const R = rng(7)
  const row = (count, yTop, yJit, rMin, rJit) => Array.from({ length: count }, (_, i) => {
    const r = rMin + R() * rJit
    return { x: (W / count) * (i + 0.5) + (R() - 0.5) * (W / count) * 0.5, y: yTop + r + R() * yJit, r }
  })
  const back = wrap(row(8, 18, 40, 62, 34), W)
  const front = wrap(row(10, 96, 46, 54, 30), W)
  // two chunky cartoon pines in the back row
  const pines = [W * 0.27, W * 0.74].flatMap((x) => [x, x - W, x + W]).map((x) => {
    const t = 6
    const w = 74
    return `M${n(x)} ${t}C${n(x + 12)} ${t} ${n(x + w * 0.55)} ${t + 70} ${n(x + w * 0.7)} ${t + 90}L${n(x + w * 0.42)} ${t + 92}C${n(x + w * 0.7)} ${t + 120} ${n(x + w * 0.95)} ${t + 150} ${n(x + w)} ${t + 170}H${n(x - w)}C${n(x - w * 0.95)} ${t + 150} ${n(x - w * 0.7)} ${t + 120} ${n(x - w * 0.42)} ${t + 92}L${n(x - w * 0.7)} ${t + 90}C${n(x - w * 0.55)} ${t + 70} ${n(x - 12)} ${t} ${n(x)} ${t}Z`
  }).join('')
  const yBack = Math.round(Math.min(...back.map((c) => c.y)) + 40)
  const yFront = Math.round(Math.min(...front.map((c) => c.y)) + 60)
  const blobs = (list, grow) => list.map((c) => circle(c.x, c.y, c.r + grow)).join('')
  let s = `<defs>${CLUMP('#1f7d33', '#33a542', '#6fd04a', 0.05)}<g id='b'><path d='${pines}'/>${blobs(back, 0)}<rect y='${yBack}' width='${W}' height='${H}'/></g></defs>`
  // back row: navy union outline (stroke under the fill), two flat tones
  s += `<use href='#b' fill='${NAVY}' stroke='${NAVY}' stroke-width='12' stroke-linejoin='round'/><use href='#b' fill='#42b06a'/>`
  s += `<g fill='#7bd58e'>${back.map((c) => circle(c.x - c.r * 0.2, c.y - c.r * 0.3, c.r * 0.6)).join('')}</g>`
  // front row: union outline, solid base, then each crown cel-shaded
  s += `<g fill='${NAVY}'>${blobs(front, 7)}<rect y='${yFront}' width='${W}' height='${H}'/></g><rect fill='#1f7d33' y='${yFront}' width='${W}' height='${H}'/>`
  s += front.map((c) => useAt('c', c.x, c.y, c.r)).join('')
  return svg(W, H, s)
}

// ─── Ground strip ────────────────────────────────────────────────────────────

export const ground = (W = 1200, H = 200) => {
  const fn = wave(W, 44, [[1, 8, 0.4], [3, 6, 1.9], [5, 3, 0.2]])
  const R = rng(11)
  let tufts = ''
  for (let i = 0; i < 6; i++) {
    const x = (W / 6) * (i + 0.2 + R() * 0.6)
    const y = Math.round(fn(x) + 4)
    for (const xx of [x, x - W, x + W].filter((v) => v > -30 && v < W + 30)) tufts += `M${n(xx - 16)} ${y}l7-22 6 22 6-30 6 30 6-18 5 18z`
  }
  const s = `<path fill='#3ea814' stroke='${NAVY}' stroke-width='5' stroke-linejoin='round' d='${tufts}'/>` +
    stack(crest(W, H, fn, 100), [['#8be33a', 0], ['#59c62a', 14], ['#42ad22', 70]], 7)
  return svg(W, H, s)
}

// ─── The giant cartoon tree (vector fallback of the painted one) ───────────────

export const tree = () => {
  const W = 440
  const H = 520
  const clumps = [[120, 238, 78], [318, 238, 78], [220, 262, 92], [146, 156, 82], [292, 156, 82], [220, 108, 88], [86, 176, 52], [354, 176, 52]]
  const crown = clumps.map(([x, y, r]) => circle(x, y, r + 9)).join('')
  const trunk = 'M178 300L162 512L278 512L262 300Z'
  let s = `<g transform='rotate(6 220 512)'>`
  // trunk: navy outline, honey wood, light stripes, darker side, the crack
  s += `<path d='${trunk}' fill='#f2a23a' stroke='${NAVY}' stroke-width='12' stroke-linejoin='round'/>`
  s += `<path d='M236 300L262 300L278 512L248 512Z' fill='#d9772a'/>`
  s += `<path d='M190 330L184 500M212 320L210 506' stroke='#ffc86a' stroke-width='9' stroke-linecap='round'/>`
  s += `<path d='M170 392L198 404L190 420L226 432L218 450L262 458L262 440L232 434L240 416L206 404L212 388L174 378Z' fill='#fff0c8' stroke='${NAVY}' stroke-width='5' stroke-linejoin='round'/>`
  // crown: union outline, then each clump dark / mid / light
  s += `<defs>${CLUMP('#2e8f2a', '#4fbf2a', '#9be34f')}</defs><g fill='${NAVY}'>${crown}</g>`
  s += clumps.map(([x, y, r]) => useAt('c', x, y, r)).join('')
  // face: "> <" squeezed eyes, angry brows, an "ouch" mouth, blush
  s += `<g fill='none' stroke='${NAVY}' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'><path d='M168 214L190 226L168 238M272 214L250 226L272 238'/><path d='M160 192L196 204M280 192L244 204'/></g>`
  s += `<ellipse cx='220' cy='268' rx='15' ry='18' fill='${NAVY}'/><ellipse cx='220' cy='276' rx='8' ry='7' fill='#f2306b'/>`
  s += `<g fill='#ffb3c8'><ellipse cx='150' cy='262' rx='15' ry='9'/><ellipse cx='290' cy='262' rx='15' ry='9'/></g>`
  // a sticking plaster on a clump
  s += `<g transform='rotate(-28 304 118)'><rect x='278' y='106' width='52' height='22' rx='9' fill='#ffd9a8' stroke='${NAVY}' stroke-width='4'/><rect x='296' y='108' width='16' height='18' fill='#ffc27a'/></g>`
  s += '</g>'
  return svg(W, H, s)
}

/** The smash: a flat white star with a sun core and a navy outline. */
export const star = (points = 12, inner = 0.48, core = '#ffe45c') => {
  const p = (r, a) => `${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}`
  const path = (R1, R2) => Array.from({ length: points * 2 }, (_, i) => `${i ? 'L' : 'M'}${p(i % 2 ? R2 : R1, (i / (points * 2)) * Math.PI * 2 - Math.PI / 2)}`).join('') + 'Z'
  return svg(100, 100, `<path d='${path(47, 47 * inner)}' fill='#fff' stroke='${NAVY}' stroke-width='3.5' stroke-linejoin='round'/><path d='${path(30, 30 * inner)}' fill='${core}'/>`, '-50 -50 100 100')
}

/** Wood chips and torn leaves flying off a hit. */
export const chips = () => {
  const chip = (x, y, rot, s) => `<path transform='translate(${x} ${y}) rotate(${rot}) scale(${s})' d='M-14 -6L10 -10L16 4L-6 10Z' fill='#f2a23a' stroke='${NAVY}' stroke-width='4' stroke-linejoin='round'/>`
  const leaf = (x, y, rot, s) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'><path d='M0 -16C11 -9 11 9 0 16C-11 9 -11 -9 0 -16Z' fill='#6fd04a' stroke='${NAVY}' stroke-width='4'/><path d='M0 -12L0 12' stroke='${NAVY}' stroke-width='2.5'/></g>`
  return svg(200, 160, chip(40, 120, 20, 1.2) + chip(110, 40, -30, 1) + chip(170, 100, 60, 0.9) + leaf(70, 60, 40, 1.1) + leaf(150, 20, -60, 0.9) + leaf(186, 140, 100, 0.8))
}

// ─── Smasher on a spinning disc (silhouette) ─────────────────────────────────

/** A plush bear smasher, flat navy, angry white eyes, facing RIGHT; speed lines trail left. */
export const rider = () => {
  const body = `<g fill='${NAVY}'>${circle(150, 52, 17)}${circle(196, 50, 15)}${circle(172, 84, 42)}<ellipse cx='164' cy='140' rx='46' ry='36'/>${circle(212, 112, 15)}<path d='M200 120L222 96L232 106L210 130Z'/>${circle(122, 132, 13)}</g>`
  const eyes = `<path d='M176 74L198 68L196 84Z M150 72L168 76L162 88Z' fill='#fff'/>`
  const lines = `<g fill='#fff' opacity='.85'><rect x='8' y='70' width='86' height='11' rx='5.5'/><rect x='30' y='112' width='66' height='11' rx='5.5'/><rect x='0' y='152' width='94' height='11' rx='5.5'/></g>`
  return svg(240, 180, lines + body + eyes)
}

/** The disc it rides, seen from above (flattened + spun by CSS). */
export const disc = () => svg(100, 100,
  `${circle(0, 0, 49, ` fill='${NAVY}'`)}${circle(0, 0, 42, " fill='#f2a23a'")}` +
  `${circle(0, 0, 30, " fill='none' stroke='#ffc86a' stroke-width='5'")}${circle(0, 0, 15, " fill='none' stroke='#d9772a' stroke-width='5'")}` +
  `<path d='M0 -42L6 -18L-6 -18Z M36 21L14 12L20 2Z M-36 21L-20 2L-14 12Z' fill='${NAVY}'/>`, '-50 -50 100 100')

// ─── Drifting bits ───────────────────────────────────────────────────────────

const leafAt = (x, y, rot, s, fill = '#6fd04a', stroke = NAVY) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s})'><path d='M0 -16C11 -9 11 9 0 16C-11 9 -11 -9 0 -16Z' fill='${fill}'${stroke ? ` stroke='${stroke}' stroke-width='3.5'` : ''}/>${stroke ? `<path d='M0 -12L0 12' stroke='${stroke}' stroke-width='2.2'/>` : ''}</g>`

/** Near: a few big outlined leaves and one wood chip per (large) tile. */
export const driftNear = () => svg(560, 560,
  leafAt(90, 120, 30, 1.25) + leafAt(360, 300, -50, 1.05, '#9be34f') + leafAt(200, 470, 80, 1.4) +
  `<path transform='translate(470 70) rotate(25)' d='M-12 -5L9 -9L14 3L-5 9Z' fill='#f2a23a' stroke='${NAVY}' stroke-width='3.5' stroke-linejoin='round'/>`)

/** Far: small flat leaves, chips and confetti, no outline. */
export const driftFar = () => svg(380, 380,
  leafAt(60, 70, 60, 0.6, '#b8f07a', '') + leafAt(250, 160, -20, 0.55, '#9be34f', '') + leafAt(150, 320, 110, 0.6, '#c8f76a', '') +
  `<rect x='310' y='40' width='12' height='7' rx='2' fill='#ffd21a' transform='rotate(30 316 43)'/>` +
  `<rect x='40' y='230' width='12' height='7' rx='2' fill='#fff' transform='rotate(-40 46 233)'/>` +
  `<rect x='330' y='300' width='11' height='6' rx='2' fill='#ffae00' transform='rotate(70 335 303)'/>`)

// ─── Foreground corner (vector fallback of the painted one) ──────────────────

export const front = () => {
  const W = 420
  const H = 300
  const bushes = [[30, 150, 92], [140, 214, 76], [250, 262, 62], [-10, 250, 90], [92, 280, 70], [340, 300, 48]]
  let s = ''
  // grass blades fanning out behind
  s += `<path d='M52 140L36 34L82 120Z M112 170L130 70L136 168Z M196 214L232 128L222 214Z M300 262L330 196L320 264Z' fill='#3ea814' stroke='${NAVY}' stroke-width='6' stroke-linejoin='round'/>`
  s += `<defs>${CLUMP('#2e8f2a', '#4fbf2a', '#9be34f')}</defs><g fill='${NAVY}'>${bushes.map(([x, y, r]) => circle(x, y, r + 8)).join('')}</g>`
  s += bushes.map(([x, y, r]) => useAt('c', x, y, r)).join('')
  // a red cartoon mushroom with white dots
  s += `<g stroke='${NAVY}' stroke-width='6' stroke-linejoin='round'><path d='M186 196L182 236L214 236L208 196Z' fill='#fff3d6'/><path d='M158 200C158 160 236 160 236 200Z' fill='#e8402f'/></g>`
  s += `<g fill='#fff'>${circle(180, 186, 7)}${circle(204, 176, 6)}${circle(222, 190, 5)}</g>`
  // two daisies
  const daisy = (x, y, petal, core) => {
    let p = ''
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      p += circle(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 8)
    }
    return `<g fill='${petal}' stroke='${NAVY}' stroke-width='4'>${p}</g>${circle(x, y, 7, ` fill='${core}' stroke='${NAVY}' stroke-width='3'`)}`
  }
  s += daisy(92, 118, '#ffd21a', '#ffae00') + daisy(282, 226, '#fff', '#ffd21a')
  return svg(W, H, s)
}
