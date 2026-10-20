/**
 * Procedural drawings of the three bosses-100+ boss
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
 * House construction: bold ink contour, 2-3 cel steps per shape with the
 * light from the top-left, even-fold symmetry (the slicer centres on the
 * bounding box).
 *
 * No imports and no DOM access at import time: Node imports this module for
 * the registry tests, the browser runs it inside build.mjs's headless page.
 * Nothing is random, so a re-bake is byte-stable.
 */

const TAU = Math.PI * 2
const INK = '#16111c'

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

// ── Drawing kit (unit space: radius 1 = the drawing's edge) ────────────────────

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

// ── Emblems — ONE drawing each, drawn on the badge ────
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
  'badge/cinder_tyrant': wrap(cinderBadge),
  'badge/glacier_warden': wrap(wardenBadge),
  'badge/frostbite_yeti': wrap(yetiBadge)
}

if (typeof window !== 'undefined') window.BOSS_PAINTERS = PAINTERS
