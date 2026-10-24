/**
 * Pure pixel work for the painted arena BORDERS (tools/arena-borders/pack.mjs):
 * key the magenta ground, find the three painted strips, measure each strip's
 * inner (arena-side) baseline, normalise them to one thickness, and turn them
 * into seamlessly TILEABLE strips that also join each other in any order.
 *
 * No I/O, no browser: every function takes / returns plain RGBA images
 * `{ w, h, data: Uint8ClampedArray }` (straight alpha), so the seam metric and
 * the tiler are unit-tested (tests/arenaBorders.test.ts).
 *
 * The join construction (why any tile may follow any tile):
 *   one JOIN block J (L px wide) is cut from strip a. Every tile i is
 *     T_i = J[K : L−K] ⊕ Q(J[L−K : L], B_i[t0 : t0+K]) ⊕ B_i[t0+K : t1−K] ⊕ Q(B_i[t1−K : t1], J[0 : K])
 *   where B_i is strip i, Q(·,·) a min-error-boundary quilt of two K px
 *   overlaps (image quilting: the cut runs where both agree), t0 / t1 the
 *   start / end columns searched for the cheapest quilts. Every tile STARTS
 *   with J[K …] and ENDS flowing into J[… K−1], so T_i → T_j is continuous for
 *   every i, j (and T_i → T_i: each tile tiles with itself).
 *   `cut` = a column of J's core with the least paint (a natural gap between
 *   pieces), the same column in every tile: where a border may END (beside a
 *   tree) without slicing through a stone or a bush.
 */

/** @typedef {{ w: number, h: number, data: Uint8ClampedArray }} Img */

/** Arena units from a strip's baseline to its median outer edge (pack.mjs). */
export const THICK_UNITS = 26
/** Refuse a variant whose join to any tile (seamRatio) is above MAX_SEAM, or
 *  whose own quilt cuts (internalSeamRatio) are above MAX_INTERNAL. */
export const MAX_SEAM = 1.0
export const MAX_INTERNAL = 1.6

export const makeImg = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) })

// ─── Key ──────────────────────────────────────────────────────────────────

/**
 * Magenta ground → alpha, in place (the arena-props packer's key): the ground
 * colour is MEASURED (most common 16-level bucket — Gemini's magenta drifts),
 * alpha ramps on the colour distance to it ((d − 45) / 75), the magenta family
 * at any brightness is ground, and within 3 px of the ground the magenta
 * component (min(R,B) − G) is taken out so contours get no pink rim.
 * Returns the measured ground colour.
 */
export const keyMagenta = (img) => {
  const { w: W, h: H, data: d } = img
  const buckets = new Map()
  for (let i = 0; i < d.length; i += 16) {
    const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)
    const b = buckets.get(key) ?? [0, 0, 0, 0]
    b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2]
    buckets.set(key, b)
  }
  let best = [0, 255, 0, 255]
  for (const b of buckets.values()) if (b[0] > best[0]) best = b
  const G = [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round)
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - G[0], d[i + 1] - G[1], d[i + 2] - G[2])
    d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 45) / 75)) * 255)
    const lo = Math.min(d[i], d[i + 2])
    const hi = Math.max(d[i], d[i + 2])
    if (lo > 60 && d[i + 1] < lo * 0.45 && hi - lo < hi * 0.25) d[i + 3] = 0
  }
  const near = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] === 255) continue
      for (let dy = -3; dy <= 3; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) near[yy * W + xx] = 1 }
      }
    }
  }
  for (let p = 0; p < W * H; p++) {
    if (!near[p]) continue
    const i = p * 4
    const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
    if (spill > 0) { d[i] -= spill; d[i + 2] -= spill }
  }
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0 }
  return G
}

// ─── Geometry helpers ─────────────────────────────────────────────────────

export const crop = (img, x0, y0, w, h) => {
  const out = makeImg(w, h)
  for (let y = 0; y < h; y++) {
    const sy = y + y0
    if (sy < 0 || sy >= img.h) continue
    for (let x = 0; x < w; x++) {
      const sx = x + x0
      if (sx < 0 || sx >= img.w) continue
      const s = (sy * img.w + sx) * 4
      const t = (y * w + x) * 4
      out.data[t] = img.data[s]; out.data[t + 1] = img.data[s + 1]; out.data[t + 2] = img.data[s + 2]; out.data[t + 3] = img.data[s + 3]
    }
  }
  return out
}

/** Horizontal concatenation (all the same height). */
export const hcat = (...imgs) => {
  const h = imgs[0].h
  const w = imgs.reduce((s, i) => s + i.w, 0)
  const out = makeImg(w, h)
  let x0 = 0
  for (const im of imgs) {
    if (im.h !== h) throw new Error('hcat: heights differ')
    for (let y = 0; y < h; y++) out.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), (y * w + x0) * 4)
    x0 += im.w
  }
  return out
}

/** Area-average resample (premultiplied — no dark fringes), any size. */
export const resample = (img, nw, nh) => {
  const pass = (src, sw, sh, dw, horizontal) => {
    // src: Float32Array premultiplied RGBA, sw × sh → dw along the axis
    const n = horizontal ? sw : sh
    const other = horizontal ? sh : sw
    const out = new Float32Array((horizontal ? dw * sh : sw * dw) * 4)
    const k = n / dw
    for (let o = 0; o < other; o++) {
      for (let j = 0; j < dw; j++) {
        const a = j * k
        const b = a + k
        const acc = [0, 0, 0, 0]
        for (let i = Math.floor(a); i < Math.ceil(b) && i < n; i++) {
          const wgt = Math.min(b, i + 1) - Math.max(a, i)
          if (wgt <= 0) continue
          const si = horizontal ? (o * sw + i) * 4 : (i * sw + o) * 4
          acc[0] += src[si] * wgt; acc[1] += src[si + 1] * wgt; acc[2] += src[si + 2] * wgt; acc[3] += src[si + 3] * wgt
        }
        const di = horizontal ? (o * dw + j) * 4 : (j * sw + o) * 4
        out[di] = acc[0] / k; out[di + 1] = acc[1] / k; out[di + 2] = acc[2] / k; out[di + 3] = acc[3] / k
      }
    }
    return out
  }
  const pm = new Float32Array(img.w * img.h * 4)
  for (let i = 0; i < pm.length; i += 4) {
    const a = img.data[i + 3] / 255
    pm[i] = img.data[i] * a; pm[i + 1] = img.data[i + 1] * a; pm[i + 2] = img.data[i + 2] * a; pm[i + 3] = img.data[i + 3]
  }
  const h1 = pass(pm, img.w, img.h, nw, true)
  const v1 = pass(h1, nw, img.h, nh, false)
  const out = makeImg(nw, nh)
  for (let i = 0; i < v1.length; i += 4) {
    const a = v1[i + 3]
    out.data[i + 3] = Math.round(a)
    if (a > 0.5) {
      const f = 255 / a
      out.data[i] = Math.round(v1[i] * f); out.data[i + 1] = Math.round(v1[i + 1] * f); out.data[i + 2] = Math.round(v1[i + 2] * f)
    }
  }
  return out
}

// ─── Strips on the sheet ──────────────────────────────────────────────────

const SOLID = 128

/** Share of solid pixels per row. */
export const rowCoverage = (img) => {
  const c = new Float64Array(img.h)
  for (let y = 0; y < img.h; y++) {
    let n = 0
    for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > SOLID) n++
    c[y] = n / img.w
  }
  return c
}

/** Share of solid pixels per column (rows y0..y1). */
export const colCoverage = (img, y0 = 0, y1 = img.h) => {
  const c = new Float64Array(img.w)
  for (let x = 0; x < img.w; x++) {
    let n = 0
    for (let y = y0; y < y1; y++) if (img.data[(y * img.w + x) * 4 + 3] > SOLID) n++
    c[x] = n / Math.max(1, y1 - y0)
  }
  return c
}

/**
 * The horizontal strips on a keyed sheet, top to bottom: runs of rows whose
 * solid coverage is ≥ `core` (the body of a strip), grown out to the rows that
 * still carry paint (> `edge`, bumps and peaks) but never past the middle of
 * the gap to the next strip. Runs shorter than `minFrac` × H are dropped.
 */
export const findBands = (img, { core = 0.3, edge = 0.004, minFrac = 0.06 } = {}) => {
  const c = rowCoverage(img)
  const runs = []
  let s = -1
  for (let y = 0; y <= img.h; y++) {
    const on = y < img.h && c[y] >= core
    if (on && s < 0) s = y
    if (!on && s >= 0) {
      const prev = runs[runs.length - 1]
      if (prev && s - prev.b <= 4) prev.b = y
      else runs.push({ t: s, b: y })
      s = -1
    }
  }
  const body = runs.filter(r => r.b - r.t >= minFrac * img.h)
  return body.map((r, i) => {
    const lim0 = i > 0 ? Math.floor((body[i - 1].b + r.t) / 2) : 0
    const lim1 = i < body.length - 1 ? Math.ceil((r.b + body[i + 1].t) / 2) : img.h
    let t = r.t
    while (t > lim0 && c[t - 1] > edge) t--
    let b = r.b
    while (b < lim1 && c[b] > edge) b++
    return { top: t, bottom: b, coreTop: r.t, coreBottom: r.b }
  })
}

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0
}

/**
 * Where a strip's pieces sit: per column the lowest and the highest solid row;
 * `baseline` = the median lowest row (the arena-side edge), `top` = the median
 * highest row (the outer edge). Columns without paint are skipped.
 */
export const measureStrip = (img) => {
  const lows = []
  const highs = []
  for (let x = 0; x < img.w; x++) {
    let lo = -1
    let hi = -1
    for (let y = 0; y < img.h; y++) {
      if (img.data[(y * img.w + x) * 4 + 3] > SOLID) { if (hi < 0) hi = y; lo = y }
    }
    if (lo >= 0) { lows.push(lo + 1); highs.push(hi) }
  }
  return { baseline: median(lows), top: median(highs), peak: highs.length ? Math.min(...highs) : 0, low: lows.length ? Math.max(...lows) : 0, painted: lows.length / img.w }
}

/**
 * Columns at both ends where the strip thins out (an end cap the painter drew
 * despite the prompt, or a strip that stops short of the canvas edge): trimmed
 * while the column's solid share is below `share` × the median, at most
 * `maxFrac` of the width per side. → [x0, x1)
 */
export const trimEnds = (img, { share = 0.55, maxFrac = 0.2 } = {}) => {
  const c = colCoverage(img)
  const m = median(c)
  const lim = Math.floor(img.w * maxFrac)
  let x0 = 0
  while (x0 < lim && c[x0] < share * m) x0++
  let x1 = img.w
  while (img.w - x1 < lim && c[x1 - 1] < share * m) x1--
  return [x0, x1]
}

// ─── Seams ────────────────────────────────────────────────────────────────

/** Squared premultiplied RGBA difference (0..4) of pixel i in a vs j in b. */
const diff2 = (a, i, b, j) => {
  const aa = a[i + 3] / 255
  const ba = b[j + 3] / 255
  const dr = (a[i] * aa - b[j] * ba) / 255
  const dg = (a[i + 1] * aa - b[j + 1] * ba) / 255
  const db = (a[i + 2] * aa - b[j + 2] * ba) / 255
  const da = aa - ba
  return dr * dr + dg * dg + db * db + da * da
}

/**
 * Minimum-error vertical cut through two equally sized overlaps A | B
 * (image quilting): left of the path comes from A, right from B. Returns the
 * path (one column per row) and its RMS error (cost-weighted: outline
 * pixels count a tenth).
 */
export const minCut = (A, B) => {
  const { w, h } = A
  const e = new Float64Array(w * h)
  // A cut that runs along a painted OUTLINE (of either side) reads as one
  // piece overlapping the next — the natural look of a pile of stones or
  // blocks; a cut through a piece's flat interior shows a half-and-half
  // object. So outline pixels are cheap to cut through.
  const ink = (d, i) => d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 3 * 80
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const raw = diff2(A.data, i, B.data, i)
      e[y * w + x] = ink(A.data, i) || ink(B.data, i) ? raw * 0.02 : raw
    }
  }
  const acc = new Float64Array(w * h)
  const from = new Int8Array(w * h)
  for (let x = 0; x < w; x++) acc[x] = e[x]
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // steps of up to ±2 columns per row: the cut can follow a round outline
      let best = acc[(y - 1) * w + x]
      let bd = 0
      for (const d of [-1, 1, -2, 2]) {
        const xx = x + d
        if (xx >= 0 && xx < w && acc[(y - 1) * w + xx] < best) { best = acc[(y - 1) * w + xx]; bd = d }
      }
      acc[y * w + x] = best + e[y * w + x]
      from[y * w + x] = bd
    }
  }
  let bx = 0
  for (let x = 1; x < w; x++) if (acc[(h - 1) * w + x] < acc[(h - 1) * w + bx]) bx = x
  const path = new Int32Array(h)
  let sum = 0
  for (let y = h - 1; y >= 0; y--) {
    path[y] = bx
    sum += e[y * w + bx]
    bx += from[y * w + bx]
  }
  return { path, rms: Math.sqrt(sum / h / 4) }
}

/** Composite two overlaps along a cut (the cut pixel itself is a 50/50 mix). */
export const quilt = (A, B, path) => {
  const out = makeImg(A.w, A.h)
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4
      const p = path[y]
      if (x < p) out.data.set(A.data.subarray(i, i + 4), i)
      else if (x > p) out.data.set(B.data.subarray(i, i + 4), i)
      else {
        const aa = A.data[i + 3]
        const ba = B.data[i + 3]
        const a = (aa + ba) / 2
        out.data[i + 3] = Math.round(a)
        for (let c = 0; c < 3; c++) out.data[i + c] = a > 0 ? Math.round((A.data[i + c] * aa + B.data[i + c] * ba) / (2 * a)) : 0
      }
    }
  }
  return out
}

/** RMS premultiplied difference of column xa of `a` and column xb of `b`. */
export const columnJump = (a, xa, b, xb) => {
  let s = 0
  for (let y = 0; y < a.h; y++) s += diff2(a.data, (y * a.w + xa) * 4, b.data, (y * b.w + xb) * 4)
  return Math.sqrt(s / a.h / 4)
}

/**
 * THE tiling seam metric: how much the jump from the last column of `a` to
 * the first column of `b` (a = b: the tile's own wrap-around) exceeds the
 * strip's ordinary column-to-column change — the jump over the 95th
 * percentile of all neighbouring-column jumps inside `a` and `b`. ≤ 1 means
 * the seam is no harsher than the painting's own detail; a visible break in
 * the outline / colour runs well above it.
 */
export const seamRatio = (a, b = a) => {
  const jumps = []
  for (const im of a === b ? [a] : [a, b]) for (let x = 0; x < im.w - 1; x++) jumps.push(columnJump(im, x, im, x + 1))
  jumps.sort((x, y) => x - y)
  const p95 = jumps[Math.floor(jumps.length * 0.95)] || 1e-6
  return columnJump(a, a.w - 1, b, 0) / Math.max(p95, 1e-6)
}

/** Worst quilt-cut harshness inside a tile: the largest column jump within
 *  `ranges` ([x0, x1) column spans) over the tile's own 95th percentile. */
export const internalSeamRatio = (img, ranges) => {
  const jumps = []
  for (let x = 0; x < img.w - 1; x++) jumps.push(columnJump(img, x, img, x + 1))
  const sorted = [...jumps].sort((x, y) => x - y)
  const p95 = Math.max(sorted[Math.floor(sorted.length * 0.95)] || 0, 1e-6)
  let worst = 0
  for (const [x0, x1] of ranges) for (let x = Math.max(0, x0 - 1); x < Math.min(img.w - 1, x1); x++) worst = Math.max(worst, jumps[x])
  return worst / p95
}

// ─── Tiles ────────────────────────────────────────────────────────────────

const sliceCols = (img, x0, x1) => crop(img, x0, 0, x1 - x0, img.h)

/**
 * Normalised strips (same height, baselines on the same row) → tiles that
 * tile with themselves and with each other, plus the shared `cut` column.
 * `K` = quilt overlap (px), `core` = width of the join block between its two
 * overlaps (px), `step` = search stride (px).
 */
export const buildTiles = (strips, { K, core, step = 2 }) => {
  const L = core + 2 * K
  const a = strips[0]
  // J: the block of strip a whose core holds the clearest natural gap.
  const cov = colCoverage(a)
  let js = 0
  let jc = K
  let jBest = Infinity
  for (let s = 0; s + L <= Math.floor(a.w * 0.35); s += step) {
    for (let x = s + K + 2; x < s + L - K - 2; x++) {
      const v = cov[x] + 0.5 * (cov[x - 1] + cov[x + 1])
      if (v < jBest) { jBest = v; js = s; jc = x - s }
    }
  }
  const J = sliceCols(a, js, js + L)
  const Jhead = sliceCols(J, 0, K)
  const Jtail = sliceCols(J, L - K, L)
  const Jcore = sliceCols(J, K, L - K)
  const tiles = []
  const report = []
  strips.forEach((B, i) => {
    // start join J → B (strip a continues J itself: identical overlap)
    let t0 = js + L - K
    let q0 = { path: new Int32Array(B.h).fill(0), rms: 0 }
    if (i > 0) {
      q0 = null
      for (let t = 0; t + K <= Math.floor(B.w * 0.3); t += step) {
        const c = minCut(Jtail, sliceCols(B, t, t + K))
        if (!q0 || c.rms < q0.rms) { q0 = c; t0 = t }
      }
    }
    // end join B → J
    let t1 = B.w
    let q1 = null
    const lo = Math.max(t0 + 2 * K + Math.floor(B.w * 0.35), Math.floor(B.w * 0.65))
    for (let t = B.w; t - K >= lo; t -= step) {
      const c = minCut(sliceCols(B, t - K, t), Jhead)
      if (!q1 || c.rms < q1.rms) { q1 = c; t1 = t }
    }
    const head = quilt(Jtail, sliceCols(B, t0, t0 + K), q0.path)
    const tail = quilt(sliceCols(B, t1 - K, t1), Jhead, q1.path)
    const tile = hcat(Jcore, head, sliceCols(B, t0 + K, t1 - K), tail)
    tiles.push(tile)
    const quilts = [[core, core + K], [tile.w - K, tile.w]]
    report.push({ t0, t1, w: tile.w, headRms: q0.rms, tailRms: q1.rms, internal: internalSeamRatio(tile, quilts) })
  })
  return { tiles, cut: jc - K, joinStart: js, report }
}

/** Every ordered pair's join (i → j) through the seam metric. */
export const pairSeams = (tiles) => {
  const out = []
  for (let i = 0; i < tiles.length; i++) for (let j = 0; j < tiles.length; j++) out.push({ i, j, ratio: seamRatio(tiles[i], tiles[j]) })
  return out
}

// ─── Tone ─────────────────────────────────────────────────────────────────

/** Mean colour of a strip's solid pixels ([r, g, b]). */
export const meanTone = (img) => {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] <= 128) continue
    r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0]
}

/** RGB distance of two strips' mean tones. Variants painted noticeably
 *  lighter / darker than the join's source read as patches where they meet
 *  (a quilt hides the cut, not a tone jump) — pack.mjs drops them above
 *  MAX_TONE. */
export const toneDistance = (a, b) => {
  const x = meanTone(a)
  const y = meanTone(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
export const MAX_TONE = 16
