/**
 * Procedural drawings of the three bosses-100+ trophy skins and their boss
 * badges (bosses-100-feature.md §7.1). ONE drawing per drawable, callable on
 * any 2D canvas at any size:
 *
 *   PAINTERS[id](ctx, size, { notation })
 *
 * They are the game's fallback art (build.mjs bakes them into the drop-in
 * paths, so every <img> and the arena renderer work before anything is
 * painted) AND the source of the badges' reference sheets (`notation: true`
 * maps every colour onto the four reference greys, so the painter gets
 * outline, parts and centre and nothing to trace).
 *
 * House skin construction (skins-new-designs.md): hex medallion → inner
 * ring(s) → themed rim, bold ink contour, 2-3 cel steps per shape with the
 * light from the top-left, EVEN-fold symmetry (the slicer and fit-skins
 * centre on the bounding box, which for an even-fold shape is the spin axis).
 *
 * No imports and no DOM access at import time: Node imports this module for
 * the registry tests, the browser runs it inside build.mjs's headless page.
 * Everything random is seeded, so a re-bake is byte-stable.
 */

const TAU = Math.PI * 2
const INK = '#16111c'

/** Seeded LCG — the same seed always draws the same coals / tufts. */
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

// ── Notation mode ───────────────────────────────────────────────────────────
// Reference sheets must show shape, never finish (PROMPT-ANATOMY: the
// reference is NOTATION). In notation mode every colour a painter asks for is
// replaced by one of the reference greys, by luminance.
const NOTATION_GREYS = ['#30343a', '#6c7179', '#a4a9b1', '#d3d6db']
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}
const makeCol = (notation) => (hex) => {
  if (!notation) return hex
  const l = lum(hex)
  return NOTATION_GREYS[l < 0.2 ? 0 : l < 0.42 ? 1 : l < 0.72 ? 2 : 3]
}

// ── Drawing kit (unit space: the skin's rim is radius 1) ────────────────────

const withShift = (ctx, dx, dy, build) => {
  ctx.save()
  ctx.translate(dx, dy)
  build(ctx)
  ctx.restore()
}

/**
 * Ink-outlined, cel-shaded fill of one shape. `build` adds the shape's
 * subpaths (even-odd, so a ring is two circles). Shade = the shape minus
 * itself shifted up-left (a bottom-right crescent), light = the shape minus
 * itself shifted down-right (a top-left crescent).
 */
const cel = (ctx, C, build, { base, shade, light, ink = 0.05, d = 0.07, h = 0.035 }) => {
  ctx.beginPath()
  build(ctx)
  if (ink) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = C(INK)
    ctx.lineWidth = ink
    ctx.stroke()
  }
  ctx.fillStyle = C(base)
  ctx.fill('evenodd')
  ctx.save()
  ctx.beginPath()
  build(ctx)
  ctx.clip('evenodd')
  if (shade) {
    ctx.beginPath()
    build(ctx)
    withShift(ctx, -d, -d, build)
    ctx.fillStyle = C(shade)
    ctx.fill('evenodd')
  }
  if (light) {
    ctx.beginPath()
    build(ctx)
    withShift(ctx, h, h, build)
    ctx.fillStyle = C(light)
    ctx.fill('evenodd')
  }
  ctx.restore()
}

/** Ink the union of several shapes at once (stroke all fat, then fill all). */
const union = (ctx, C, builds, fill, ink = 0.05) => {
  ctx.lineJoin = 'round'
  ctx.strokeStyle = C(INK)
  ctx.lineWidth = ink
  for (const b of builds) {
    ctx.beginPath()
    b(ctx)
    ctx.stroke()
  }
  ctx.fillStyle = C(fill)
  for (const b of builds) {
    ctx.beginPath()
    b(ctx)
    ctx.fill()
  }
}

const circle = (r, x = 0, y = 0) => (c) => {
  c.moveTo(x + r, y)
  c.arc(x, y, r, 0, TAU)
}
const ring = (r0, r1) => (c) => {
  circle(r1)(c)
  circle(r0)(c)
}
const hex = (r) => (c) => {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * TAU
    if (i) c.lineTo(r * Math.cos(a), r * Math.sin(a))
    else c.moveTo(r * Math.cos(a), r * Math.sin(a))
  }
  c.closePath()
}
const poly = (pts) => (c) => {
  c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
  c.closePath()
}
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
const superellipse = (a, p) => (c) => {
  for (let i = 0; i <= 192; i++) {
    const t = (i / 192) * TAU
    const ct = Math.cos(t), st = Math.sin(t)
    const x = a * Math.sign(ct) * Math.abs(ct) ** (2 / p)
    const y = a * Math.sign(st) * Math.abs(st) ** (2 / p)
    if (i) c.lineTo(x, y)
    else c.moveTo(x, y)
  }
  c.closePath()
}
const rivet = (ctx, C, x, y, r, { base = '#5a5360', shade = '#221e27', light = '#b9b0bd' } = {}) => {
  cel(ctx, C, circle(r, x, y), { base, shade, light, ink: r * 0.55, d: r * 0.45, h: r * 0.3 })
}
const dot = (ctx, C, x, y, r, fill) => {
  ctx.beginPath()
  circle(r, x, y)(ctx)
  ctx.fillStyle = C(fill)
  ctx.fill()
}
const strokeLine = (ctx, C, pts, color, w) => {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = C(color)
  ctx.lineWidth = w
  ctx.stroke()
}

// ── Emblems — ONE drawing each, used in the skin medallion AND the badge ────
// Drawn in a unit box (fits radius ~1); the caller scales.

/** Cinder Tyrant: a single flame inside a ring. */
const flameRing = (ctx, C) => {
  cel(ctx, C, ring(0.66, 0.88), { base: '#ffb347', shade: '#d9601a', light: '#ffe4a3', ink: 0.13, d: 0.1, h: 0.06 })
  // three-tongued flame: a tall centre tongue, two shorter side tongues
  const flame = (s, dy) => (c) => {
    const P = (x, y) => [x * s, y * s + dy]
    c.moveTo(...P(0, 0.62))
    c.bezierCurveTo(...P(-0.34, 0.62), ...P(-0.52, 0.4), ...P(-0.5, 0.14))
    c.bezierCurveTo(...P(-0.49, -0.08), ...P(-0.4, -0.2), ...P(-0.3, -0.36))
    c.bezierCurveTo(...P(-0.28, -0.18), ...P(-0.22, -0.1), ...P(-0.14, -0.06))
    c.bezierCurveTo(...P(-0.2, -0.36), ...P(-0.08, -0.6), ...P(0.02, -0.8))
    c.bezierCurveTo(...P(0.08, -0.56), ...P(0.22, -0.4), ...P(0.24, -0.14))
    c.bezierCurveTo(...P(0.3, -0.2), ...P(0.34, -0.28), ...P(0.34, -0.4))
    c.bezierCurveTo(...P(0.46, -0.24), ...P(0.52, -0.04), ...P(0.5, 0.14))
    c.bezierCurveTo(...P(0.52, 0.4), ...P(0.34, 0.62), ...P(0, 0.62))
    c.closePath()
  }
  cel(ctx, C, flame(1, 0), { base: '#ff6a1a', shade: '#c2360f', light: '#ffa04a', ink: 0.12, d: 0.1, h: 0.05 })
  cel(ctx, C, flame(0.52, 0.26), { base: '#ffd27a', shade: '#ffb347', light: '#fff4d6', ink: 0, d: 0.06, h: 0.03 })
}

/** Snowflake with six arms and a barb pair on each (unit radius). */
const snowflake = (ctx, C, r, color, w) => {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * TAU
    strokeLine(ctx, C, [[0, 0], polar(r, a)], color, w)
    const m = polar(r * 0.55, a)
    strokeLine(ctx, C, [polar(r * 0.8, a - 0.42).map((v, k) => v * 0.6 + m[k] * 0.4), m, polar(r * 0.8, a + 0.42).map((v, k) => v * 0.6 + m[k] * 0.4)], color, w)
  }
}

/** Glacier Warden: a padlock with a snowflake keyhole. */
const padlock = (ctx, C) => {
  // shackle — a thick steel arch
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, -0.2, 0.42, Math.PI, 0)
  ctx.lineCap = 'butt'
  ctx.strokeStyle = C(INK)
  ctx.lineWidth = 0.3
  ctx.stroke()
  ctx.strokeStyle = C('#c9d6e3')
  ctx.lineWidth = 0.17
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -0.2, 0.42, Math.PI * 1.15, Math.PI * 1.45)
  ctx.strokeStyle = C('#ffffff')
  ctx.lineWidth = 0.06
  ctx.stroke()
  ctx.restore()
  // body
  const body = (c) => {
    c.moveTo(-0.62, -0.18)
    c.lineTo(0.62, -0.18)
    c.quadraticCurveTo(0.7, -0.18, 0.7, -0.1)
    c.lineTo(0.7, 0.66)
    c.quadraticCurveTo(0.7, 0.78, 0.58, 0.78)
    c.lineTo(-0.58, 0.78)
    c.quadraticCurveTo(-0.7, 0.78, -0.7, 0.66)
    c.lineTo(-0.7, -0.1)
    c.quadraticCurveTo(-0.7, -0.18, -0.62, -0.18)
    c.closePath()
  }
  cel(ctx, C, body, { base: '#6f8298', shade: '#3c4a5c', light: '#a9bccf', ink: 0.12, d: 0.12, h: 0.06 })
  // frost cap on the body's top edge
  const cap = (c) => {
    c.moveTo(-0.7, -0.08)
    c.lineTo(-0.7, -0.1)
    c.quadraticCurveTo(-0.7, -0.18, -0.62, -0.18)
    c.lineTo(0.62, -0.18)
    c.quadraticCurveTo(0.7, -0.18, 0.7, -0.1)
    c.lineTo(0.7, 0.02)
    for (let i = 0; i <= 7; i++) {
      const x = 0.7 - (i / 7) * 1.4
      c.lineTo(x, i % 2 ? 0.1 : 0.0)
    }
    c.closePath()
  }
  cel(ctx, C, cap, { base: '#f2fbff', shade: '#9fd8f2', light: '#ffffff', ink: 0.05, d: 0.05, h: 0 })
  // snowflake keyhole
  snowflake(ctx, C, 0.3, INK, 0.16)
  snowflake(ctx, C, 0.3, '#7fd4ff', 0.08)
  dot(ctx, C, 0, 0.31, 0.06, '#f2fbff')
}

/** Frostbite Yeti: a yeti face with two short tusks. */
const yetiFace = (ctx, C) => {
  // shaggy head: a disc with a fringe of pointed tufts
  const tufts = []
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU - Math.PI / 2
    // hooked, shaggy tufts (all curl the same way round)
    tufts.push((c) => {
      c.moveTo(...polar(0.6, a - 0.26))
      c.quadraticCurveTo(...polar(0.86, a - 0.2), ...polar(0.96, a + 0.14))
      c.quadraticCurveTo(...polar(0.78, a + 0.12), ...polar(0.6, a + 0.26))
      c.closePath()
    })
  }
  union(ctx, C, [circle(0.7), ...tufts], '#ffffff', 0.12)
  cel(ctx, C, circle(0.7), { base: '#ffffff', shade: '#c9d8e6', light: null, ink: 0, d: 0.14 })
  // blue-grey face
  const face = (c) => {
    c.moveTo(-0.46, -0.16)
    c.quadraticCurveTo(0, -0.4, 0.46, -0.16)
    c.quadraticCurveTo(0.56, 0.3, 0.3, 0.52)
    c.quadraticCurveTo(0, 0.66, -0.3, 0.52)
    c.quadraticCurveTo(-0.56, 0.3, -0.46, -0.16)
    c.closePath()
  }
  cel(ctx, C, face, { base: '#5a6d89', shade: '#3b4b63', light: '#7d91ad', ink: 0.08, d: 0.08, h: 0.04 })
  // heavy fur brow
  const brow = (c) => {
    c.moveTo(-0.52, -0.1)
    c.quadraticCurveTo(-0.26, -0.3, 0, -0.12)
    c.quadraticCurveTo(0.26, -0.3, 0.52, -0.1)
    c.lineTo(0.44, 0.02)
    c.quadraticCurveTo(0.22, -0.1, 0, 0.02)
    c.quadraticCurveTo(-0.22, -0.1, -0.44, 0.02)
    c.closePath()
  }
  cel(ctx, C, brow, { base: '#ffffff', shade: '#c9d8e6', light: null, ink: 0.07, d: 0.05 })
  // eyes — icy glow
  for (const s of [-1, 1]) {
    cel(ctx, C, circle(0.085, s * 0.2, 0.1), { base: '#9fe7e0', shade: '#4aa3d8', light: null, ink: 0.06, d: 0.04 })
  }
  // mouth + tusks
  const mouth = (c) => {
    c.moveTo(-0.24, 0.32)
    c.quadraticCurveTo(0, 0.44, 0.24, 0.32)
    c.quadraticCurveTo(0, 0.52, -0.24, 0.32)
    c.closePath()
  }
  cel(ctx, C, mouth, { base: '#1e2636', shade: null, light: null, ink: 0.06 })
  for (const s of [-1, 1]) {
    const tusk = poly([[s * 0.2, 0.36], [s * 0.3, 0.12], [s * 0.1, 0.4]])
    cel(ctx, C, tusk, { base: '#f4ecd6', shade: '#c9b98f', light: '#ffffff', ink: 0.06, d: 0.04, h: 0.02 })
  }
}

// ── Hex medallion (the construction every skin shares) ─────────────────────
const medallion = (ctx, C, r, { base, shade, light, rim }, emblem, emblemScale = 0.62) => {
  cel(ctx, C, hex(r), { base: rim, shade: '#1a1620', light: null, ink: 0.05, d: r * 0.12 })
  cel(ctx, C, hex(r * 0.8), { base, shade, light, ink: 0.025, d: r * 0.14, h: r * 0.07 })
  ctx.save()
  ctx.scale(r * emblemScale, r * emblemScale)
  emblem(ctx, C)
  ctx.restore()
}

// ── Skins ───────────────────────────────────────────────────────────────────

/**
 * Cinder (the Cinder Tyrant, Round Guard): a round iron brazier — a smooth
 * closed rim of black cast iron, FOUR riveted grate bars crossing a bed of
 * glowing coals with molten cracks between them. Nothing leaves the circle.
 */
const cinder = (ctx, C) => {
  const R = rng(110)
  // cast-iron body (rim)
  cel(ctx, C, circle(1), { base: '#3b3640', shade: '#221e27', light: '#77707e', ink: 0.07, d: 0.09, h: 0.045 })
  // rim bevel line + rivets
  ctx.beginPath()
  circle(0.9)(ctx)
  ctx.strokeStyle = C('#221e27')
  ctx.lineWidth = 0.02
  ctx.stroke()
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(0.9, (i / 16) * TAU + Math.PI / 16)
    rivet(ctx, C, x, y, 0.035)
  }
  // coal bed: molten ground, then coal lumps with cracks left between them
  cel(ctx, C, circle(0.8), { base: '#ff7a1a', shade: '#d9481a', light: '#ffc25a', ink: 0.05, d: 0.05, h: 0.03 })
  const bands = [[0.38, 0.58, 9], [0.58, 0.8, 14]]
  for (const [r0, r1, n] of bands) {
    const off = R() * TAU
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU, a1 = off + ((i + 1) / n) * TAU
      const gap = 0.008
      const j = () => (R() - 0.5) * 0.04
      const ga0 = a0 + gap / r0, ga1 = a1 - gap / r0
      const pts = [
        polar(r0 + gap + j(), ga0), polar(r0 + gap + j(), (ga0 + ga1) / 2), polar(r0 + gap + j(), ga1),
        polar(r1 - gap + j(), a1 - gap / r1), polar(r1 - gap + j(), (a0 + a1) / 2 + j()), polar(r1 - gap + j(), a0 + gap / r1)
      ]
      const hot = R() < 0.25
      // a rounded lump (quadratic through the edge midpoints)
      const lump = (c) => {
        const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
        const s0 = m(pts[pts.length - 1], pts[0])
        c.moveTo(s0[0], s0[1])
        for (let k = 0; k < pts.length; k++) {
          const q = m(pts[k], pts[(k + 1) % pts.length])
          c.quadraticCurveTo(pts[k][0], pts[k][1], q[0], q[1])
        }
        c.closePath()
      }
      cel(ctx, C, lump, hot
        ? { base: '#c2461c', shade: '#7a2414', light: '#ff9a3a', ink: 0.018, d: 0.035, h: 0.03 }
        : { base: '#2e2124', shade: '#1a1216', light: '#5a4448', ink: 0.018, d: 0.03, h: 0.018 })
      if (hot) {
        const [cx, cy] = polar((r0 + r1) / 2 - 0.01, (a0 + a1) / 2 - 0.03)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((a0 + a1) / 2)
        ctx.beginPath()
        ctx.ellipse(0, 0, (r1 - r0) * 0.13, (r1 - r0) * 0.26, 0, 0, TAU)
        ctx.fillStyle = C('#ffd27a')
        ctx.fill()
        ctx.restore()
      }
    }
  }
  // grate: FOUR bars in a # (two vertical, two horizontal), clipped to the bed
  ctx.save()
  ctx.beginPath()
  circle(0.83)(ctx)
  ctx.clip()
  const barW = 0.1, off = 0.48
  const bar = (vertical, s) => (c) => {
    if (vertical) c.rect(s * off - barW / 2, -0.9, barW, 1.8)
    else c.rect(-0.9, s * off - barW / 2, 1.8, barW)
  }
  for (const s of [-1, 1]) cel(ctx, C, bar(true, s), {
    base: '#4a4450',
    shade: '#221e27',
    light: '#8d8594',
    ink: 0.035,
    d: 0.03,
    h: 0.02
  })
  for (const s of [-1, 1]) cel(ctx, C, bar(false, s), {
    base: '#4a4450',
    shade: '#221e27',
    light: '#8d8594',
    ink: 0.035,
    d: 0.03,
    h: 0.02
  })
  ctx.restore()
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rivet(ctx, C, sx * off, sy * off, 0.045)
  // bed edge re-inked over the bar ends
  ctx.beginPath()
  circle(0.815)(ctx)
  ctx.strokeStyle = C(INK)
  ctx.lineWidth = 0.035
  ctx.stroke()
  // inner iron ring with a molten seam
  cel(ctx, C, ring(0.29, 0.37), { base: '#4a4450', shade: '#221e27', light: '#8d8594', ink: 0.04, d: 0.04, h: 0.025 })
  ctx.beginPath()
  circle(0.33)(ctx)
  ctx.strokeStyle = C('#ff8a2a')
  ctx.lineWidth = 0.018
  ctx.stroke()
  medallion(ctx, C, 0.27, { base: '#3b3640', shade: '#221e27', light: '#5d5664', rim: '#2a252f' }, flameRing, 0.6)
}

/**
 * Frost Vault (the Glacier Warden, Quad Core): a square steel vault door
 * frozen over — four rounded frost-crusted lobes at the corners with heavy
 * bolts iced in, and a spoked vault wheel as the inner ring.
 */
const frostVault = (ctx, C) => {
  const R = rng(120)
  const A = 0.8
  // steel face
  cel(ctx, C, superellipse(A, 5), { base: '#4a5a6e', shade: '#34404f', light: '#7f93aa', ink: 0.07, d: 0.09, h: 0.045 })
  // riveted inner frame of the door
  ctx.beginPath()
  superellipse(A * 0.84, 5)(ctx)
  ctx.strokeStyle = C('#2c3644')
  ctx.lineWidth = 0.022
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    for (const t of [-0.3, 0, 0.3]) {
      const a = (i / 4) * TAU
      const [x, y] = [Math.cos(a) * A * 0.84 - Math.sin(a) * t, Math.sin(a) * A * 0.84 + Math.cos(a) * t]
      rivet(ctx, C, x * 0.96, y * 0.96, 0.03, { base: '#6f8298', shade: '#2c3644', light: '#c9d6e3' })
    }
  }
  // frost creeping along the door edges (jagged white crust, 4-fold)
  ctx.save()
  ctx.beginPath()
  superellipse(A, 5)(ctx)
  ctx.clip()
  for (let q = 0; q < 4; q++) {
    ctx.save()
    ctx.rotate((q / 4) * TAU)
    const pts = [[-0.9, -A - 0.1], [0.9, -A - 0.1]]
    for (let i = 0; i <= 14; i++) {
      const x = 0.9 - (i / 14) * 1.8
      const depth = 0.07 + (i % 2 ? 0.06 : 0) + R() * 0.03 + Math.max(0, Math.abs(x) - 0.35) * 0.3
      pts.push([x, -A + depth])
    }
    cel(ctx, C, poly(pts), { base: '#dff4ff', shade: '#9fd8f2', light: '#ffffff', ink: 0.022, d: 0.03, h: 0.015 })
    ctx.restore()
  }
  ctx.restore()
  ctx.beginPath()
  superellipse(A, 5)(ctx)
  ctx.strokeStyle = C(INK)
  ctx.lineWidth = 0.04
  ctx.stroke()
  // four frost-crusted corner lobes, each with a heavy bolt iced in
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU
    const [x, y] = polar(0.7, a)
    cel(ctx, C, circle(0.27, x, y), { base: '#bfe8fb', shade: '#2a7fc9', light: '#ffffff', ink: 0.06, d: 0.1, h: 0.05 })
    // hex bolt head
    ctx.save()
    ctx.translate(x, y)
    cel(ctx, C, hex(0.12), { base: '#6f8298', shade: '#34404f', light: '#c9d6e3', ink: 0.035, d: 0.04, h: 0.02 })
    // ice glaze over the bolt's outer half (it is frozen IN)
    ctx.rotate(a)
    const glaze = (c) => {
      c.moveTo(0.02, -0.2)
      c.quadraticCurveTo(0.08, 0, 0.02, 0.2)
      c.lineTo(0.22, 0.12)
      c.lineTo(0.22, -0.12)
      c.closePath()
    }
    ctx.beginPath()
    circle(0.25)(ctx)
    ctx.clip()
    cel(ctx, C, glaze, { base: '#dff4ff', shade: '#7fd4ff', light: '#ffffff', ink: 0.02, d: 0.03, h: 0.015 })
    ctx.restore()
    // icicle glints
    const [gx, gy] = polar(0.8, a - 0.12)
    dot(ctx, C, gx, gy, 0.03, '#ffffff')
  }
  // vault recess + spoked wheel (the inner ring)
  cel(ctx, C, circle(0.5), { base: '#2c3644', shade: '#1c232e', light: null, ink: 0.045, d: 0.05 })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    const [x0, y0] = polar(0.25, a), [x1, y1] = polar(0.47, a)
    strokeLine(ctx, C, [[x0, y0], [x1, y1]], INK, 0.085)
    strokeLine(ctx, C, [[x0, y0], [x1, y1]], '#a9bccf', 0.045)
  }
  cel(ctx, C, ring(0.36, 0.44), { base: '#a9bccf', shade: '#5f7085', light: '#eef5fb', ink: 0.045, d: 0.05, h: 0.03 })
  // handle knobs on the wheel (4, on the axes)
  for (let i = 0; i < 4; i++) {
    const [x, y] = polar(0.44, (i / 4) * TAU)
    cel(ctx, C, circle(0.06, x, y), {
      base: '#7fd4ff',
      shade: '#2a7fc9',
      light: '#f2fbff',
      ink: 0.03,
      d: 0.03,
      h: 0.02
    })
  }
  medallion(ctx, C, 0.27, { base: '#2a7fc9', shade: '#1d5d99', light: '#7fd4ff', rim: '#2c3644' }, padlock, 0.56)
}

/**
 * Yeti (the Frostbite Yeti, Spiky): a round body ringed ALL the way round by
 * shaggy white fur tufts tipped with icicle spikes pointing straight out, a
 * band of blue-grey hide as the inner ring.
 */
const yeti = (ctx, C) => {
  const R = rng(130)
  const N = 16
  // icicle spikes (behind the fur), two facets each
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU
    const half = (Math.PI / N) * 0.78
    const base0 = polar(0.6, a - half), base1 = polar(0.62, a + half), tip = polar(0.995, a)
    const mid = polar(0.66, a)
    union(ctx, C, [poly([base0, tip, base1])], '#9fe7e0', 0.05)
    // shaded facet (clockwise side), light ridge
    ctx.beginPath()
    poly([mid, tip, base1])(ctx)
    ctx.fillStyle = C('#4aa3d8')
    ctx.fill()
    strokeLine(ctx, C, [polar(0.7, a - half * 0.35), polar(0.93, a - half * 0.08)], '#eafffc', 0.022)
  }
  // shaggy fur ring: fat, overlapping tufts with hooked tips (all curl the
  // same way round) — a shaded back layer and a white front layer
  const tuft = (a, r0, r1, w, hook) => (c) => {
    const P = (r, da) => polar(r, a + da)
    c.moveTo(...P(r0, -w))
    c.bezierCurveTo(...P(r0 + (r1 - r0) * 0.55, -w * 1.15), ...P(r1 * 0.98, -w * 0.35), ...P(r1, hook))
    c.bezierCurveTo(...P(r1 - (r1 - r0) * 0.3, w * 0.2), ...P(r0 + (r1 - r0) * 0.45, w * 1.1), ...P(r0, w))
    c.closePath()
  }
  const back = [], front = []
  const step = TAU / (2 * N)
  // a mane, not a saw: tips lean a little either way and lengths vary
  for (let i = 0; i < 2 * N; i++) {
    back.push(tuft(i * step + step / 2, 0.46, 0.79 + (R() - 0.5) * 0.06, step * 0.95, (R() - 0.5) * step * 0.6))
  }
  for (let i = 0; i < 2 * N; i++) {
    front.push(tuft(i * step, 0.42, 0.71 + (i % 2 ? -0.03 : 0.02) + (R() - 0.5) * 0.05, step * 0.9, (R() - 0.5) * step * 0.7))
  }
  union(ctx, C, [circle(0.6), ...back], '#bccde0', 0.05)
  union(ctx, C, [circle(0.55), ...front], '#ffffff', 0.035)
  // fur shading: a bottom-right shadow over the front layer
  ctx.save()
  ctx.beginPath()
  for (const f of front) f(ctx)
  circle(0.55)(ctx)
  ctx.clip('nonzero')
  ctx.beginPath()
  circle(0.8, 0.12, 0.12)(ctx)
  circle(0.8, 0.03, 0.03)(ctx)
  ctx.fillStyle = C('#dfe9f2')
  ctx.fill('evenodd')
  ctx.restore()
  // fur strands, curling with the tufts
  for (let i = 0; i < 2 * N; i++) {
    const a = i * step
    ctx.beginPath()
    ctx.moveTo(...polar(0.5, a - step * 0.2))
    ctx.quadraticCurveTo(...polar(0.6, a - step * 0.25), ...polar(0.66, a + step * 0.2))
    ctx.strokeStyle = C('#a9bdd1')
    ctx.lineWidth = 0.014
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  // blue-grey hide band (inner ring) with stitching
  cel(ctx, C, ring(0.3, 0.46), { base: '#3b4b63', shade: '#2a3649', light: '#5a6d89', ink: 0.045, d: 0.05, h: 0.03 })
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU
    strokeLine(ctx, C, [polar(0.36, a), polar(0.4, a + 0.06)], '#9fb3c8', 0.016)
  }
  medallion(ctx, C, 0.27, { base: '#9fe7e0', shade: '#4aa3d8', light: '#eafffc', rim: '#2a3649' }, yetiFace, 0.62)
}

// ── Boss badges — the boss's crest: a big hex shield carrying its emblem ────

const badge = (palette, emblem, extra) => (ctx, C) => {
  // outer hex frame
  cel(ctx, C, hex(0.98), {
    base: palette.frame,
    shade: palette.frameShade,
    light: palette.frameLight,
    ink: 0.07,
    d: 0.1,
    h: 0.05
  })
  if (extra?.frame) extra.frame(ctx, C)
  // inner field
  cel(ctx, C, hex(0.78), {
    base: palette.field,
    shade: palette.fieldShade,
    light: palette.fieldLight,
    ink: 0.04,
    d: 0.14,
    h: 0.06
  })
  if (extra?.field) extra.field(ctx, C)
  // corner studs on the frame
  for (let i = 0; i < 6; i++) {
    const [x, y] = polar(0.88, -Math.PI / 2 + (i / 6) * TAU)
    rivet(ctx, C, x, y, 0.045, palette.stud)
  }
  ctx.save()
  ctx.scale(0.62, 0.62)
  emblem(ctx, C)
  ctx.restore()
}

const cinderBadge = badge(
  {
    frame: '#3b3640',
    frameShade: '#221e27',
    frameLight: '#77707e',
    field: '#2e2124',
    fieldShade: '#1a1216',
    fieldLight: '#4a3438',
    stud: { base: '#5a5360', shade: '#221e27', light: '#b9b0bd' }
  },
  flameRing,
  {
    // molten cracks through the coal-dark field
    field: (ctx, C) => {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU + Math.PI / 6
        strokeLine(ctx, C, [polar(0.7, a), polar(0.58, a + 0.08), polar(0.62, a + 0.16)], '#ff6a1a', 0.035)
        strokeLine(ctx, C, [polar(0.7, a), polar(0.58, a + 0.08)], '#ffd27a', 0.012)
      }
    }
  }
)

const wardenBadge = badge(
  {
    frame: '#4a5a6e',
    frameShade: '#34404f',
    frameLight: '#7f93aa',
    field: '#2a7fc9',
    fieldShade: '#1d5d99',
    fieldLight: '#7fd4ff',
    stud: { base: '#6f8298', shade: '#2c3644', light: '#c9d6e3' }
  },
  padlock,
  {
    // frost crust on the two upper edges of the frame
    frame: (ctx, C) => {
      const v = [-5 / 6, -1 / 2, -1 / 6].map((k) => polar(0.98, k * Math.PI))
      const edge = []
      for (let e = 0; e < 2; e++) {
        for (let i = 0; i < 6; i++) {
          const t = i / 6
          edge.push([v[e][0] + (v[e + 1][0] - v[e][0]) * t, v[e][1] + (v[e + 1][1] - v[e][1]) * t])
        }
      }
      edge.push(v[2])
      const inner = edge.map(([x, y], i) => {
        const k = 1 - (i % 2 ? 0.15 : 0.09) * (i === 0 || i === edge.length - 1 ? 0.2 : 1)
        return [x * k, y * k]
      }).reverse()
      cel(ctx, C, poly([...edge, ...inner]), {
        base: '#dff4ff',
        shade: '#9fd8f2',
        light: '#ffffff',
        ink: 0.03,
        d: 0.03,
        h: 0.015
      })
    }
  }
)

const yetiBadge = badge(
  {
    frame: '#3b4b63',
    frameShade: '#2a3649',
    frameLight: '#5a6d89',
    field: '#9fe7e0',
    fieldShade: '#4aa3d8',
    fieldLight: '#eafffc',
    stud: { base: '#dfe9f2', shade: '#8ea3b8', light: '#ffffff' }
  },
  yetiFace,
  {
    // icicles hanging off the lower frame edges
    frame: (ctx, C) => {
      for (const [x, len] of [[-0.5, 0.14], [-0.2, 0.2], [0.2, 0.2], [0.5, 0.14]]) {
        const y0 = 0.98 * Math.cos(Math.PI / 6) - Math.abs(x) * Math.tan(Math.PI / 6) - 0.02
        cel(ctx, C, poly([[x - 0.05, y0 - 0.06], [x + 0.05, y0 - 0.06], [x, y0 + len]]), {
          base: '#9fe7e0',
          shade: '#4aa3d8',
          light: '#eafffc',
          ink: 0.025,
          d: 0.02,
          h: 0.01
        })
      }
    }
  }
)

/**
 * Every painter: `(ctx, size, { notation })` draws onto a TRANSPARENT
 * `size`×`size` canvas area at the origin, centred, so the farthest solid
 * pixel (outline included) lands on the in-game clip circle.
 */
const wrap = (draw) => (ctx, size, { notation = false } = {}) => {
  const C = makeCol(notation)
  ctx.save()
  ctx.translate(size / 2, size / 2)
  // rim radius 1 + half the rim ink (0.035) sits ~1 px inside the square
  const s = (size / 2 - 1) / 1.035
  ctx.scale(s, s)
  draw(ctx, C)
  ctx.restore()
}

export const PAINTERS = {
  'skin/cinder': wrap(cinder),
  'skin/frost-vault': wrap(frostVault),
  'skin/yeti': wrap(yeti),
  'badge/cinder_tyrant': wrap(cinderBadge),
  'badge/glacier_warden': wrap(wardenBadge),
  'badge/frostbite_yeti': wrap(yetiBadge)
}

if (typeof window !== 'undefined') window.BOSS_PAINTERS = PAINTERS
