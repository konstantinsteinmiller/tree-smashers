/*
 * Procedural flame-burn frames — the DRAWING the painted strip stands in for.
 *
 * Plain browser JS (no imports): build-reference.mjs injects this file into a
 * headless page and calls `drawFlameFrame` once per cell. It is both
 *   · the reference sheet handed to the image model (on #FF00FF), and
 *   · the placeholder strip the game ships until a painting is accepted
 *     (on transparent).
 *
 * Registration contract — keep in sync with src/use/borderFx.ts:
 *   the spinner's centre sits at (ANCHOR_X, ANCHOR_Y) of the cell and its
 *   radius is DISK_R of the cell side. The disk itself is left EMPTY: the
 *   game draws the spinning top there, and the flames are composited over
 *   its outer rim.
 *
 * Arc of the 12 frames (0-based):
 *   0-2   ignite: a few small tongues catch around the rim, then the ring fills
 *   3-4   flare to peak: the tallest tongues, licking up above the top
 *   5-7   lick / flicker: same ring, tongues sway and trade heights
 *   8-9   die down: lower, thinner tongues, embers lift off
 *   10    embers and a puff of smoke rising off the top
 *   11    a wisp of smoke and two embers — nothing else
 */
;(function() {
  const ANCHOR_X = 0.5
  const ANCHOR_Y = 0.6
  const DISK_R = 0.28
  const FRAMES = 12

  // Flame height envelope and how much of the rim is burning, per frame.
  const ENVELOPE = [0.22, 0.42, 0.7, 1.0, 0.94, 0.84, 0.9, 0.76, 0.52, 0.3, 0.12, 0]
  // Which tongues are lit in the ignite frames (every Nth tongue).
  const IGNITE_EVERY = [3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]
  const N_TONGUES = 14
  // A continuous inked band along the circle read as a TUBE to the image
  // model (it painted a pink tyre under the flames), so the tongues alone
  // make the circle.
  const BAND = false

  // Palette — comic fire, matching public/images/vfx/explosion_*.
  const INK = '#4a1206'
  const OUTER = '#e8431a'
  const MID = '#ff8c1a'
  const INNER = '#ffd23a'
  const CORE = '#fff3b0'
  const SMOKE = '#5d5a58'
  const SMOKE_LIGHT = '#8a8683'
  const SMOKE_INK = '#262424'
  const EMBER = '#ffb52e'

  // Fixed per-tongue identity so frames stay coherent (seeded, not random).
  const tongues = []
  for (let k = 0; k < N_TONGUES; k++) {
    const jitter = Math.sin(k * 12.9898) * 0.08
    tongues.push({
      theta: (k / N_TONGUES) * Math.PI * 2 + jitter,
      phase: (k * 2.39996) % (Math.PI * 2), // golden-angle phases
      widthMul: 0.9 + 0.25 * Math.abs(Math.sin(k * 7.13)),
      // Alternate tall / short so the crown reads jagged, not like a gear.
      tall: k % 2 === 0 ? 1 : 0.68
    })
  }

  // Ember and smoke choreography, in units of the disk radius, relative to
  // the disk centre (y negative = up the screen).
  const EMBERS = [
    { x: -0.55, y: -1.05, r: 0.055, from: 8 },
    { x: 0.42, y: -1.15, r: 0.05, from: 8 },
    { x: 0.05, y: -1.3, r: 0.06, from: 9 },
    { x: -0.9, y: -0.55, r: 0.045, from: 9 },
    { x: 0.85, y: -0.65, r: 0.045, from: 9 }
  ]

  const angularHeight = (theta) => {
    const up = -Math.sin(theta) // 1 at the top of the rim, -1 at the bottom
    return 0.22 + 0.78 * Math.pow((up + 1) / 2, 1.4)
  }

  // Build one tongue's outline as a path (not yet filled/stroked).
  const tonguePath = (ctx, cx, cy, R, t, h, wMul, sway, shrink) => {
    const cos = Math.cos(t.theta)
    const sin = Math.sin(t.theta)
    // Direction: outward from the rim, bent upward (heat rises) — strongly
    // on the upper half, only a little on the lower half so bottom tongues
    // stay short and never fold back over the spinner.
    const lift = 0.95 * Math.max(0, -sin) + 0.22
    let dx = cos
    let dy = sin - lift
    const dl = Math.hypot(dx, dy) || 1
    dx /= dl
    dy /= dl
    const nx = -dy // perpendicular to the tongue
    const ny = dx
    const tx = -sin // rim tangent
    const ty = cos
    const rootR = R * (1 - 0.14 * shrink)
    const bx = cx + cos * rootR
    const by = cy + sin * rootR
    const w = ((2 * Math.PI * R) / N_TONGUES) * 1.35 * t.widthMul * wMul
    const len = h * shrink
    const tipSway = sway * len * 0.22
    const tipX = bx + dx * len + nx * tipSway
    const tipY = by + dy * len + ny * tipSway
    const lx = bx - tx * w / 2
    const ly = by - ty * w / 2
    const rx = bx + tx * w / 2
    const ry = by + ty * w / 2
    // S-curve: one flank bellies out, the other hugs in, swapped by sway.
    const c1x = bx + dx * len * 0.5 - nx * w * (0.55 + 0.25 * sway)
    const c1y = by + dy * len * 0.5 - ny * w * (0.55 + 0.25 * sway)
    const c2x = bx + dx * len * 0.42 + nx * w * (0.55 - 0.25 * sway)
    const c2y = by + dy * len * 0.42 + ny * w * (0.55 - 0.25 * sway)
    ctx.moveTo(lx, ly)
    ctx.quadraticCurveTo(c1x, c1y, tipX, tipY)
    ctx.quadraticCurveTo(c2x, c2y, rx, ry)
    // Close through a point just inside the rim so the root is solid.
    ctx.quadraticCurveTo(bx - dx * w * 0.35, by - dy * w * 0.35, lx, ly)
  }

  const litTongues = (f) => {
    const every = IGNITE_EVERY[f]
    if (!every) return []
    return tongues.filter((_, k) => k % every === 0)
  }

  // A thick band along the rim that ties the tongues into one ring of fire.
  const ringBand = (ctx, cx, cy, R, f, style, widthMul) => {
    const e = ENVELOPE[f]
    if (e <= 0.15) return
    ctx.beginPath()
    ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2)
    ctx.lineWidth = R * 0.13 * Math.min(1, e + 0.35) * widthMul
    ctx.strokeStyle = style
    ctx.stroke()
  }

  const puff = (ctx, x, y, r) => {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }

  const drawSmoke = (ctx, cx, cy, R, f, ink) => {
    // frame 9: a small puff at the top of the rim; 10: bigger, higher;
    // 11: a wisp higher still, broken into two small puffs.
    const clusters = {
      9: [[0.1, -1.16, 0.2], [-0.12, -1.28, 0.15]],
      10: [[0.12, -1.34, 0.24], [-0.16, -1.46, 0.19], [0.06, -1.6, 0.14]],
      11: [[0.2, -1.5, 0.18], [-0.04, -1.64, 0.13], [0.24, -1.74, 0.09]]
    }[f]
    if (!clusters) return
    ctx.beginPath()
    for (const [x, y, r] of clusters) puff(ctx, cx + x * R, cy + y * R, r * R)
    ctx.lineWidth = ink * 2
    ctx.strokeStyle = SMOKE_INK
    ctx.stroke()
    ctx.fillStyle = SMOKE
    ctx.fill()
    ctx.beginPath()
    for (const [x, y, r] of clusters) puff(ctx, cx + (x - r * 0.25) * R, cy + (y - r * 0.25) * R, r * R * 0.55)
    ctx.fillStyle = SMOKE_LIGHT
    ctx.fill()
  }

  const drawEmbers = (ctx, cx, cy, R, f, ink) => {
    if (f < 8) return
    const rise = (f - 8) * 0.14
    ctx.beginPath()
    let n = 0
    for (const e of EMBERS) {
      if (f < e.from) continue
      if (f === 11 && n >= 2) break
      n++
      puff(ctx, cx + e.x * R, cy + (e.y - rise) * R, e.r * R)
    }
    ctx.lineWidth = ink * 1.6
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.fillStyle = EMBER
    ctx.fill()
  }

  // Glowing ember fragments left on the rim once the flames are nearly out.
  const drawEmberRing = (ctx, cx, cy, R, f, ink) => {
    if (f < 9 || f > 10) return
    const segs = f === 9 ? 6 : 4
    ctx.lineCap = 'round'
    for (const [style, w] of [[INK, R * 0.14 + ink * 2], [OUTER, R * 0.14], [MID, R * 0.06]]) {
      ctx.beginPath()
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2 + 0.3
        ctx.moveTo(cx + Math.cos(a0) * R * 1.02, cy + Math.sin(a0) * R * 1.02)
        ctx.arc(cx, cy, R * 1.02, a0, a0 + (Math.PI * 2) / segs * 0.45)
      }
      ctx.lineWidth = w
      ctx.strokeStyle = style
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  /**
   * Draw frame `f` into the square cell whose top-left is (ox, oy) and whose
   * side is `S` px. Leaves every pixel that is not fire, ember or smoke alone.
   */
  const drawFlameFrame = (ctx, f, ox, oy, S) => {
    const cx = ox + S * ANCHOR_X
    const cy = oy + S * ANCHOR_Y
    const R = S * DISK_R
    const ink = Math.max(1, S * 0.011)
    const e = ENVELOPE[f]
    const maxLen = R * 0.95
    ctx.save()
    ctx.lineJoin = 'round'

    const lit = litTongues(f)
    const layers = [
      // [fill, height scale, width scale, root shrink]
      [OUTER, 1, 1, 1],
      [MID, 0.74, 0.66, 0.92],
      [INNER, 0.5, 0.42, 0.85],
      [CORE, 0.26, 0.24, 0.8]
    ]
    const sway = (t) => Math.sin(t.phase + f * 1.7)
    const flick = (t) => t.tall * (0.8 + 0.2 * Math.sin(t.phase * 1.3 + f * 2.1))

    if (lit.length) {
      // Ink silhouette first (thick stroke of the union), then the fills
      // cover its inner half, which leaves one clean outline around the fire.
      ctx.beginPath()
      for (const t of lit) {
        tonguePath(ctx, cx, cy, R, t, maxLen * e * angularHeight(t.theta) * flick(t), 1, sway(t), 1)
      }
      ctx.lineWidth = ink * 2.4
      ctx.strokeStyle = INK
      ctx.stroke()
      if (BAND && IGNITE_EVERY[f] === 1) ringBand(ctx, cx, cy, R, f, INK, 1 + (ink * 2.4) / (R * 0.13))

      for (let L = 0; L < layers.length; L++) {
        const [fill, hs, ws, shrink] = layers[L]
        if (L === 3 && e < 0.6) continue // no white core once it is dying
        if (BAND && L === 0 && IGNITE_EVERY[f] === 1) ringBand(ctx, cx, cy, R, f, OUTER, 1)
        if (BAND && L === 1 && IGNITE_EVERY[f] === 1) ringBand(ctx, cx, cy, R, f, MID, 0.45)
        ctx.beginPath()
        for (const t of lit) {
          tonguePath(ctx, cx, cy, R, t, maxLen * e * angularHeight(t.theta) * flick(t) * hs, ws, sway(t), shrink)
        }
        ctx.fillStyle = fill
        ctx.fill()
      }
    }

    drawEmberRing(ctx, cx, cy, R, f, ink)
    drawEmbers(ctx, cx, cy, R, f, ink)
    drawSmoke(ctx, cx, cy, R, f, ink)
    ctx.restore()
  }

  window.FLAME = { drawFlameFrame, FRAMES, ANCHOR_X, ANCHOR_Y, DISK_R }
})()
