/**
 * The Tree Smashers logo, drawn as SVG markup by code (tools/logo/build.mjs
 * writes the files). One source for every size: the loader lockup, the HUD
 * emblem, the favicon set and the app icons.
 *
 * Parts (each is a standalone SVG):
 *   emblem   — a "smash disc": a honey-wood tree slice (growth rings) in a
 *              blue felt rim with white stitches — the disc every smasher
 *              rides — stamped with a navy plush paw, split by a crack, wood
 *              chips flying off, two leaves sprouting from the rim, spin
 *              swooshes, all on a sun-yellow impact burst.
 *   tree     — "TREE", leaf green, chunky outlined display letters.
 *   smashers — "SMASHERS", sun yellow, bigger, the same treatment.
 *   favicon  — the emblem reduced to what survives 16–48 px: rim, wood face
 *              and the paw, with outlines that stay ≥ 1 px.
 *
 * UI-kit rules (src/assets/css/DESIGN.md): thick navy (#161a40) outlines,
 * flat fills with hard-edged two/three-tone bands, hard 0-blur drop shadows,
 * no blur / glow / radial gradients, no muddy brown (the wood is honey
 * orange, the bark is the blue felt rim).
 *
 * Letters: Lilita One (Juan Montoreano, SIL OFL 1.1) glyph OUTLINES — the
 * font itself is never shipped, only its paths baked into the SVG.
 */

export const C = {
  ink: '#161a40',
  royal800: '#1b2a7a',
  royal700: '#2338a8',
  royal600: '#2f4fd6',
  royal500: '#4570f0',
  royal400: '#6f95ff',
  ice50: '#ffffff',
  sun200: '#fff7a3',
  sun300: '#ffeb3b',
  sun400: '#ffd21a',
  sun500: '#ffae00',
  sun600: '#d98500',
  leaf300: '#c8f76a',
  leaf400: '#8be33a',
  leaf500: '#55c81e',
  leaf600: '#3ea814',
  leaf700: '#2a830d',
  berry500: '#f2306b',
  berry400: '#ff5c8f',
  sky300: '#7fdcff',
  sky500: '#13a3f2'
}

const f = (n) => (Math.round(n * 100) / 100).toString()
const pt = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
/** Comic impact burst: n points, every other point shorter (R2). */
const star = (cx, cy, R, r, n, rot, R2 = R) => {
  const p = []
  for (let i = 0; i < n * 2; i++) {
    const [x, y] = pt(cx, cy, i % 2 ? r : (i % 4 ? R2 : R), rot + (i * 180) / n)
    p.push(`${f(x)},${f(y)}`)
  }
  return p.join(' ')
}
/** An arc path on a circle from a0 to a1 degrees (clockwise in screen space). */
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0)
  const [x1, y1] = pt(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M${f(x0)},${f(y0)} A${f(r)},${f(r)} 0 ${large} 1 ${f(x1)},${f(y1)}`
}

// ─── The paw (navy plush stamp) ─────────────────────────────────────────────
// Local coordinates around the paw's centre, ~150 units wide.
const PAW_PAD = 'M-58,14 C-64,-26 -30,-44 0,-44 C30,-44 64,-26 58,14 C54,44 28,50 0,42 C-28,50 -54,44 -58,14 Z'
const PAW_TOES = [
  [-64, -52, 21, 27, -24],
  [-23, -84, 22, 28, -8],
  [23, -84, 22, 28, 8],
  [64, -52, 21, 27, 24]
]
const pawMarkup = (fill, glint, stitch) => {
  const toes = PAW_TOES.map(([x, y, rx, ry, r]) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})"/>`).join('')
  const glints = glint
    ? `<g fill="${glint}">${PAW_TOES.map(([x, y, rx, ry, r]) =>
      `<ellipse cx="${f(x - rx * 0.32)}" cy="${f(y - ry * 0.4)}" rx="${f(rx * 0.3)}" ry="${f(ry * 0.22)}" transform="rotate(${r - 30} ${f(x - rx * 0.32)} ${f(y - ry * 0.4)})"/>`).join('')}` +
      '<path d="M-40,-14 C-36,-30 -16,-36 2,-35 C-14,-30 -30,-24 -34,-10 Z"/></g>'
    : ''
  const stitches = stitch
    ? `<path d="${PAW_PAD}" transform="scale(0.74) translate(0,4)" fill="none" stroke="${stitch}" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="9 9"/>`
    : ''
  return `<g fill="${fill}"><path d="${PAW_PAD}"/>${toes}</g>${glints}${stitches}`
}

/** Zigzag crack polygon: centre line from the rim (angle −40°) toward the paw. */
const crackWedge = (cx, cy, R) => {
  // [radius, angle offset, half width]
  const line = [[R + 16, -32, 14], [R - 20, -22, 11], [R - 40, -36, 8.5], [R - 62, -24, 5.5], [R - 80, -34, 0.5]]
  const pts = line.map(([r, a, w]) => {
    const [x, y] = pt(cx, cy, r, a)
    return { x, y, w, a: (a * Math.PI) / 180 }
  })
  const left = []
  const right = []
  for (const p of pts) {
    // offset perpendicular to the radius
    const nx = -Math.sin(p.a)
    const ny = Math.cos(p.a)
    left.push(`${f(p.x + nx * p.w)},${f(p.y + ny * p.w)}`)
    right.unshift(`${f(p.x - nx * p.w)},${f(p.y - ny * p.w)}`)
  }
  return [...left, ...right].join(' ')
}

// ─── Leaf ───────────────────────────────────────────────────────────────────
// A leaf along +x from its stem point (0,0), `len` long.
const leaf = (x, y, rot, len, o) => {
  const w = len * 0.36
  const body = `M0,0 C${f(len * 0.25)},${f(-w)} ${f(len * 0.75)},${f(-w)} ${f(len)},0 C${f(len * 0.75)},${f(w)} ${f(len * 0.25)},${f(w)} 0,0 Z`
  const top = `M0,0 C${f(len * 0.25)},${f(-w)} ${f(len * 0.75)},${f(-w)} ${f(len)},0 Z`
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">` +
    `<path d="${body}" fill="${C.leaf500}" stroke="${C.ink}" stroke-width="${o * 2}" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="${top}" fill="${C.leaf400}"/>` +
    `<path d="M${f(len * 0.08)},0 L${f(len * 0.8)},0" stroke="${C.leaf700}" stroke-width="${f(o * 0.75)}" stroke-linecap="round"/>` +
    '</g>'
}

/**
 * The full emblem, viewBox 0 0 512 512 (content is trimmed by build.mjs).
 * `burst` — the impact star behind the disc (off for the maskable / HUD
 * variants that bring their own plate).
 */
export function emblemBody ({ burst = true } = {}) {
  const cx = 256
  const cy = 266
  const o = 8 // outline half width (visible outline)
  const R = 160 // disc outer radius
  const F = 124 // wood face radius
  const parts = []
  if (burst) {
    const sp = star(cx, cy - 4, 252, 184, 14, -90 + 9, 222)
    parts.push(`<polygon points="${sp}" transform="translate(0 12)" fill="${C.ink}" stroke="${C.ink}" stroke-width="${o * 2}" stroke-linejoin="round"/>`)
    parts.push(`<polygon points="${sp}" fill="${C.sun300}" stroke="${C.ink}" stroke-width="${o * 2}" stroke-linejoin="round" paint-order="stroke"/>`)
    parts.push(`<polygon points="${star(cx, cy - 4, 214, 160, 14, -90 + 9, 190)}" fill="${C.sun400}"/>`)
  }
  // spin swooshes (lower left, outside the rim)
  for (const [r, a0, a1] of [[R + 30, 118, 168], [R + 56, 128, 158]]) {
    const d = arc(cx, cy, r, a0, a1)
    parts.push(`<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="22" stroke-linecap="round"/>`)
    parts.push(`<path d="${d}" fill="none" stroke="${C.ice50}" stroke-width="8" stroke-linecap="round"/>`)
  }
  // flying wood chips (upper right)
  const chips = [[cx + 172, cy - 150, 20, 30], [cx + 204, cy - 96, 14, -20], [cx + 128, cy - 188, 12, 60]]
  for (const [x, y, s, r] of chips) {
    const pts = `${f(-s)},${f(-s * 0.5)} ${f(s * 0.9)},${f(-s * 0.8)} ${f(s)},${f(s * 0.6)} ${f(-s * 0.6)},${f(s * 0.7)}`
    parts.push(`<polygon points="${pts}" transform="translate(${f(x)} ${f(y)}) rotate(${r})" fill="${C.sun500}" stroke="${C.ink}" stroke-width="${o * 1.6}" stroke-linejoin="round" paint-order="stroke"/>`)
  }
  // leaves sprouting from the rim (upper left), behind the disc
  parts.push(leaf(cx - 88, cy - 128, -128, 120, o))
  parts.push(leaf(cx - 52, cy - 146, -92, 96, o))
  // disc: hard drop, felt rim, highlight, stitches
  parts.push(`<circle cx="${cx}" cy="${cy + 14}" r="${R + o}" fill="${C.ink}"/>`)
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.royal600}" stroke="${C.ink}" stroke-width="${o * 2}" paint-order="stroke"/>`)
  parts.push(`<path d="${arc(cx, cy, R - 9, 160, 290)}" fill="none" stroke="${C.royal400}" stroke-width="9" stroke-linecap="round"/>`)
  parts.push(`<path d="${arc(cx, cy, R - 10, 20, 140)}" fill="none" stroke="${C.royal700}" stroke-width="9" stroke-linecap="round"/>`)
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${f((R + F) / 2 + 2)}" fill="none" stroke="${C.ice50}" stroke-width="5" stroke-linecap="round" stroke-dasharray="12 11"/>`)
  // wood face: base, hard highlight crescent, growth rings
  parts.push('<defs><clipPath id="em-face"><circle cx="' + cx + '" cy="' + cy + '" r="' + F + '"/></clipPath></defs>')
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${F}" fill="${C.sun400}" stroke="${C.ink}" stroke-width="${o * 1.5}" paint-order="stroke"/>`)
  parts.push(`<g clip-path="url(#em-face)"><circle cx="${cx + 12}" cy="${cy + 14}" r="${F}" fill="${C.sun500}"/>` +
    [98, 72, 46].map((r, i) => `<circle cx="${cx + 4 - i * 2}" cy="${cy + 6 - i * 2}" r="${r}" fill="none" stroke="${C.sun600}" stroke-width="6"/>`).join('') +
    '</g>')
  // the crack: a jagged wedge from beyond the rim (upper right) into the
  // wood, wide where it was hit, tapering to a point
  parts.push(`<polygon points="${crackWedge(cx, cy, R)}" fill="${C.ink}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`)
  // the paw
  parts.push(`<g transform="translate(${cx - 10} ${cy + 26}) scale(0.86)">${pawMarkup(C.ink, C.royal500, null)}</g>`)
  return parts.join('\n')
}

/** Favicon-grade emblem: rim, face, paw — nothing finer than the outline. */
export function faviconBody ({ rim = true } = {}) {
  const cx = 256
  const cy = 256
  const parts = []
  parts.push(`<circle cx="${cx}" cy="${cy}" r="252" fill="${C.ink}"/>`)
  if (rim) {
    // ≥ 32 px: the blue felt rim (≥ 2 px) between two navy lines
    parts.push(`<circle cx="${cx}" cy="${cy}" r="218" fill="${C.royal600}"/>`)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="170" fill="${C.ink}"/>`)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="150" fill="${C.sun400}"/>`)
    parts.push(`<g transform="translate(${cx} ${cy + 26}) scale(1.36)">${pawMarkup(C.ink, null, null)}</g>`)
  } else {
    // 16 px, drawn on the 16-px grid (×32): the wood face inside one navy
    // ring (1.25 px), a pad and four toes as separate dots with 1-px gaps
    parts.push(`<circle cx="${cx}" cy="${cy}" r="212" fill="${C.sun400}"/>`)
    parts.push(`<g fill="${C.ink}"><ellipse cx="256" cy="324" rx="92" ry="72"/>` +
      '<circle cx="132" cy="214" r="38"/><circle cx="208" cy="148" r="40"/><circle cx="304" cy="148" r="40"/><circle cx="380" cy="214" r="38"/></g>')
  }
  return parts.join('\n')
}

// ─── Lettering ──────────────────────────────────────────────────────────────

/**
 * Chunky outlined display word from glyph paths.
 * glyphs: [{ d, adv }] in font units (y up), upem 1000.
 * Per letter: hard drop shadow, navy outline, face, a darker lower band and a
 * light top band (hard edges, clipped in the letter's own coordinates), a
 * small tilt and baseline hop so the word bounces, and a gentle arch.
 */
export function wordBody (glyphs, {
  size, face, low, high, tilt, hop, arch = 0, track = -0.02, outline = 0.085, shadow = 0.075, idp
}) {
  const s = size / 1000
  const o = outline * 1000 // outline (visible) in font units
  const total = glyphs.reduce((a, g) => a + g.adv * (1 + track), 0) - glyphs.at(-1).adv * track
  let x = 0
  const defs = [
    `<clipPath id="${idp}-low" clipPathUnits="userSpaceOnUse"><rect x="-400" y="-400" width="2000" height="${400 + 236}"/></clipPath>`,
    `<clipPath id="${idp}-high" clipPathUnits="userSpaceOnUse"><rect x="-400" y="${510}" width="2000" height="600"/></clipPath>`
  ]
  const letters = glyphs.map((g, i) => {
    const cxl = x + g.adv / 2
    const u = (cxl - total / 2) / (total / 2) // -1..1 across the word
    const y = -arch * size * (1 - u * u) + (hop[i % hop.length] ?? 0) * size
    const r = (tilt[i % tilt.length] ?? 0) + u * arch * 18
    const tr = `translate(${f(x * s)} ${f(y)}) rotate(${f(r)} ${f((g.adv / 2) * s)} ${f(-0.35 * size)}) scale(${f(s)} ${f(-s)})`
    x += g.adv * (1 + track)
    defs.push(`<path id="${idp}-g${i}" d="${g.d}"/>`)
    return { tr, i }
  })
  const use = (i, attrs = '') => `<use href="#${idp}-g${i}" ${attrs}/>`
  const sh = shadow * 1000
  const out = [`<defs>${defs.join('')}</defs>`]
  // one merged shadow under the whole word
  out.push(`<g fill="${C.ink}" stroke="${C.ink}" stroke-width="${f(o * 2)}" stroke-linejoin="round">` +
    letters.map((l) => `<g transform="${l.tr}"><g transform="translate(0 ${f(-sh)})">${use(l.i)}</g></g>`).join('') + '</g>')
  // letters stacked left → right like stickers: outline, face, bands
  for (const l of letters) {
    out.push(`<g transform="${l.tr}">` +
      use(l.i, `fill="${C.ink}" stroke="${C.ink}" stroke-width="${f(o * 2)}" stroke-linejoin="round"`) +
      use(l.i, `fill="${face}"`) +
      use(l.i, `fill="${low}" clip-path="url(#${idp}-low)"`) +
      use(l.i, `fill="${high}" clip-path="url(#${idp}-high)"`) +
      '</g>')
  }
  return { body: out.join('\n'), width: total * s }
}

export const svgDoc = (vb, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}"${extra}>\n${body}\n</svg>\n`
