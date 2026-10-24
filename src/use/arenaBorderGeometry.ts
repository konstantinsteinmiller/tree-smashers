// ─── Painted arena border: the strip mesh along the clearing's outline ──────
//
// PURE geometry for arenaBorderArt.ts (no canvas, no images — unit-tested in
// tests/arenaBorders.test.ts). A theme's border is a set of horizontally
// TILEABLE strips (tools/arena-borders/pack.mjs: any tile may follow any
// other); this module lays them along ANY clearing outline:
//  · the outline is sampled densely on the shape's own SDF (the same wall the
//    physics collides with) and re-parametrised by ARC LENGTH;
//  · the strip's arena-side baseline (registry row `inner`) runs BORDER_INSET
//    units inside the wall all the way round, so the painted edge is exactly
//    where a smasher bounces; the rest of the strip stands outward;
//  · offsets follow SMOOTHED normals (Gaussian over ~BORDER_NORMAL_SIGMA
//    units of arc), so tight concave bends never fold the outer edge over
//    itself, while the baseline stays on the wall;
//  · the outline is cut into ARCS between the trees (a gap of
//    BORDER_TOWER_GAP × tree radius around each tree centre, where the tree is
//    set into the wall); each arc starts and ends on the registry's `cut`
//    column (a natural gap between painted pieces), so a border ends beside a
//    tree without slicing through a stone or a bush. No trees → one closed
//    loop, seamless all round;
//  · per arc a deterministic sequence of tile variants (hash of layout, theme,
//    arc) is stretched by a few % so a whole number of tiles fills it exactly;
//  · each arc becomes quads (one tile each, a step of ≤ BORDER_MAX_STEP units
//    and shorter where the wall bends), drawn as two affine-mapped triangles.
// Purely decorative: nothing here touches physics, RNG or the PvP hash.
import { sdf, shapeOutline, type ArenaShape } from '@/use/arenaShapes'

/** Units the strip's arena-side baseline sits inside the collision wall
 *  (hides the floor's clipped edge under the painted lip). */
export const BORDER_INSET = 2
/** A tree interrupts the border where the wall is within this × its radius
 *  of the tree centre (the tree sprite covers the ends). */
export const BORDER_TOWER_GAP = 0.92
/** Max arc length of one quad; tighter bends get shorter quads. */
export const BORDER_MAX_STEP = 8
export const BORDER_MIN_STEP = 1.25
/** Max turn of the wall across one quad (radians). */
const MAX_TURN = 0.15
/** Gaussian smoothing of the offset normals (arc-length units). */
export const BORDER_NORMAL_SIGMA = 7

/** The registry fields the mesh needs (paintedBorders.ts PaintedBorder). */
export interface BorderStripSpec {
  ppu: number
  rowH: number
  inner: number
  cut: number
  tiles: readonly { y: number, w: number }[]
}

export interface BorderTower { x: number, y: number, radius: number }

/** One strip quad: texture columns [u0, u1) of tile `tile`; corners in arena
 *  units — `i*` on the strip's bottom row (v = rowH, arena side), `o*` on its
 *  top row (v = 0, outside), at u0 and u1. */
export interface BorderQuad {
  tile: number
  u0: number
  u1: number
  i0x: number, i0y: number, o0x: number, o0y: number
  i1x: number, i1y: number, o1x: number, o1y: number
}

export interface BorderMesh {
  quads: BorderQuad[]
  /** Number of arcs (0 trees → 1 closed loop). */
  arcs: number
  /** Per arc: texture stretch (arc length / painted length), ≈ 1. */
  stretch: number[]
}

// ── Outline by arc length ────────────────────────────────────────────────
interface Ring { x: Float64Array, y: Float64Array, s: Float64Array, len: number, nx: Float64Array, ny: Float64Array }

const RING_N = 720
const ringCache = new Map<string, Ring>()

/** The wall as a closed polyline (ray bisection on the SDF — every clearing
 *  is star-shaped), arc lengths and smoothed outward normals. */
export const borderRing = (shape: ArenaShape, R: number): Ring => {
  const key = `${shape}:${R}`
  const hit = ringCache.get(key)
  if (hit) return hit
  const x = new Float64Array(RING_N)
  const y = new Float64Array(RING_N)
  // Bracket each ray around the engine's own coarse outline (180 rays,
  // cached), then bisect: ~14 SDF evaluations per ray instead of ~34.
  const coarse = shapeOutline(shape, R)
  const nC = coarse.length / 2
  const rC = (k: number): number => Math.hypot(coarse[(k % nC) * 2]!, coarse[(k % nC) * 2 + 1]!)
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const fk = (i / RING_N) * nC
    const k0 = Math.floor(fk)
    const est = rC(k0) + (rC(k0 + 1) - rC(k0)) * (fk - k0)
    let lo = Math.max(0, est - R * 0.03)
    let hi = est + R * 0.03
    if (sdf(shape, cx * lo, cy * lo, R) > 0) lo = 0
    if (sdf(shape, cx * hi, cy * hi, R) <= 0) hi = R * 1.5
    for (let j = 0; j < 16; j++) {
      const m = (lo + hi) / 2
      if (sdf(shape, cx * m, cy * m, R) <= 0) lo = m
      else hi = m
    }
    x[i] = cx * lo
    y[i] = cy * lo
  }
  const s = new Float64Array(RING_N + 1)
  for (let i = 0; i < RING_N; i++) {
    const j = (i + 1) % RING_N
    s[i + 1] = s[i]! + Math.hypot(x[j]! - x[i]!, y[j]! - y[i]!)
  }
  const len = s[RING_N]!
  // raw tangents → Gaussian-smoothed over arc length → outward normals
  const tx = new Float64Array(RING_N)
  const ty = new Float64Array(RING_N)
  for (let i = 0; i < RING_N; i++) {
    const p = (i + RING_N - 1) % RING_N
    const n = (i + 1) % RING_N
    tx[i] = x[n]! - x[p]!
    ty[i] = y[n]! - y[p]!
  }
  const ds = len / RING_N
  const half = Math.ceil((BORDER_NORMAL_SIGMA * 3) / ds)
  const wts: number[] = []
  for (let k = -half; k <= half; k++) wts.push(Math.exp(-0.5 * ((k * ds) / BORDER_NORMAL_SIGMA) ** 2))
  const nx = new Float64Array(RING_N)
  const ny = new Float64Array(RING_N)
  for (let i = 0; i < RING_N; i++) {
    let ax = 0
    let ay = 0
    for (let k = -half; k <= half; k++) {
      const j = (i + k + RING_N * 4) % RING_N
      const w = wts[k + half]!
      ax += tx[j]! * w
      ay += ty[j]! * w
    }
    // points run counter-clockwise in math axes → outward = (ty, −tx)
    const l = Math.hypot(ax, ay) || 1
    nx[i] = ay / l
    ny[i] = -ax / l
  }
  const ring = { x, y, s, len, nx, ny }
  ringCache.set(key, ring)
  return ring
}

/** Point + smoothed normal at arc length `t` (wrapped). */
const at = (r: Ring, t: number): [number, number, number, number] => {
  const L = r.len
  const u = ((t % L) + L) % L
  let lo = 0
  let hi = RING_N
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (r.s[m]! <= u) lo = m
    else hi = m
  }
  const j = (lo + 1) % RING_N
  const f = (u - r.s[lo]!) / Math.max(1e-9, r.s[lo + 1]! - r.s[lo]!)
  const px = r.x[lo]! + (r.x[j]! - r.x[lo]!) * f
  const py = r.y[lo]! + (r.y[j]! - r.y[lo]!) * f
  let nx = r.nx[lo]! + (r.nx[j]! - r.nx[lo]!) * f
  let ny = r.ny[lo]! + (r.ny[j]! - r.ny[lo]!) * f
  const l = Math.hypot(nx, ny) || 1
  nx /= l
  ny /= l
  return [px, py, nx, ny]
}

/** Local turn rate of the (smoothed) wall at `t` (radians per unit). */
const turnRate = (r: Ring, t: number): number => {
  const h = 1
  const a = at(r, t - h)
  const b = at(r, t + h)
  const cross = a[2] * b[3] - a[3] * b[2]
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, cross)))) / (2 * h)
}

// ── Arcs between the trees ───────────────────────────────────────────────
/** [start, end] arc-length intervals of the border (end may exceed len: wraps). */
export const borderArcs = (r: Ring, towers: readonly BorderTower[]): [number, number][] => {
  if (towers.length === 0) return [[0, r.len]]
  const blocked = new Uint8Array(RING_N)
  for (const t of towers) {
    const g = t.radius * BORDER_TOWER_GAP
    for (let i = 0; i < RING_N; i++) if (Math.hypot(r.x[i]! - t.x, r.y[i]! - t.y) < g) blocked[i] = 1
  }
  if (!blocked.some(b => b === 1)) return [[0, r.len]]
  // start just after a blocked run so no arc straddles index 0
  let i0 = 0
  while (!(blocked[i0] === 1 && blocked[(i0 + 1) % RING_N] === 0)) i0++
  /** Absolute arc length of ring index i0 + k (k may pass the seam). */
  const pos = (k: number): number => {
    const idx = i0 + k
    return idx <= RING_N ? r.s[idx]! : r.s[idx - RING_N]! + r.len
  }
  const arcs: [number, number][] = []
  let minArc = 4
  for (const t of towers) minArc = Math.max(minArc, t.radius)
  let start = -1
  for (let k = 1; k <= RING_N; k++) {
    const free = blocked[(i0 + k) % RING_N] === 0
    if (free && start < 0) start = k
    if (!free && start >= 0) {
      // the arc runs from the first free sample to the last free one
      // (a sliver shorter than a tree radius — a wavy wall touching a tree
      // twice — would squeeze a tile flat; it sits under the tree sprite)
      if (pos(k - 1) - pos(start) > minArc) arcs.push([pos(start), pos(k - 1)])
      start = -1
    }
  }
  return arcs
}

// ── Deterministic variant sequence ───────────────────────────────────────
const hash32 = (str: string): number => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Tile indices for a run of `lenPx` painted px: a seeded pick that never
 *  repeats the previous tile (when there are ≥ 2), as many tiles as bring the
 *  stretch closest to 1. */
export const tileSequence = (spec: BorderStripSpec, lenPx: number, seed: string): number[] => {
  const n = spec.tiles.length
  const rnd = mulberry(hash32(seed))
  const seq: number[] = []
  let sum = 0
  let best: number[] = []
  let bestErr = Infinity
  for (let guard = 0; guard < 400; guard++) {
    let k = Math.floor(rnd() * n)
    if (n > 1 && seq.length > 0 && k === seq[seq.length - 1]) k = (k + 1 + Math.floor(rnd() * (n - 1))) % n
    seq.push(k)
    sum += spec.tiles[k]!.w
    const err = Math.abs(Math.log(lenPx / sum))
    if (err < bestErr) { bestErr = err; best = [...seq] }
    if (sum > lenPx * 1.2) break
  }
  return best
}

// ── Mesh ─────────────────────────────────────────────────────────────────
/** Offset (units, + outward from the wall) of strip row `v`. */
export const rowOffset = (spec: BorderStripSpec, v: number): number => -BORDER_INSET + (spec.inner - v) / spec.ppu

/**
 * The strip quads of a theme's border around `shape` (radius `R`), broken at
 * `towers`. `seed` varies the tile order per layout / theme.
 */
export const borderMesh = (
  spec: BorderStripSpec, shape: ArenaShape, R: number, towers: readonly BorderTower[], seed: string
): BorderMesh => {
  const ring = borderRing(shape, R)
  const arcs = borderArcs(ring, towers)
  const closed = arcs.length === 1 && arcs[0]![1] - arcs[0]![0] >= ring.len - 1e-6
  const oIn = rowOffset(spec, spec.rowH)
  const oOut = rowOffset(spec, 0)
  const quads: BorderQuad[] = []
  const stretch: number[] = []
  arcs.forEach(([a, b], ai) => {
    const arcLen = b - a
    // painted px along this arc: closed loop = whole tiles from column 0;
    // open arc = from `cut` of the first tile to `cut` of the tile after the last
    const seq = tileSequence(spec, arcLen * spec.ppu, `${seed}:${ai}`)
    const total = seq.reduce((s, k) => s + spec.tiles[k]!.w, 0)
    const pxPerUnit = total / arcLen
    stretch.push(spec.ppu / pxPerUnit)
    const u0 = closed ? 0 : spec.cut
    // tile boundaries in global painted px
    const bounds: { start: number, tile: number }[] = []
    let acc = 0
    for (const k of seq) { bounds.push({ start: acc, tile: k }); acc += spec.tiles[k]!.w }
    if (!closed) bounds.push({ start: acc, tile: seq[0]! }) // the shared head (J) of any tile
    // walk the arc
    let t = 0
    let bi = 0
    while (t < arcLen - 1e-6) {
      const U = u0 + t * pxPerUnit
      while (bi + 1 < bounds.length && bounds[bi + 1]!.start <= U + 1e-6) bi++
      const tileEnd = bi + 1 < bounds.length ? bounds[bi + 1]!.start : Infinity
      const step = Math.min(BORDER_MAX_STEP, Math.max(BORDER_MIN_STEP, MAX_TURN / Math.max(1e-6, turnRate(ring, a + t))))
      let t1 = Math.min(arcLen, t + step)
      const tEndTile = (tileEnd - u0) / pxPerUnit
      if (t1 > tEndTile - 1e-6) t1 = Math.max(t + 1e-3, tEndTile)
      if (t1 > arcLen) t1 = arcLen
      const p0 = at(ring, a + t)
      const p1 = at(ring, a + t1)
      const tileStart = bounds[bi]!.start
      quads.push({
        tile: bounds[bi]!.tile,
        u0: U - tileStart,
        u1: u0 + t1 * pxPerUnit - tileStart,
        i0x: p0[0] + p0[2] * oIn, i0y: p0[1] + p0[3] * oIn,
        o0x: p0[0] + p0[2] * oOut, o0y: p0[1] + p0[3] * oOut,
        i1x: p1[0] + p1[2] * oIn, i1y: p1[1] + p1[3] * oIn,
        o1x: p1[0] + p1[2] * oOut, o1y: p1[1] + p1[3] * oOut
      })
      t = t1
    }
  })
  return { quads, arcs: arcs.length, stretch }
}

/** The baseline point (painted row `inner`) at the start of a quad — on the
 *  wall, BORDER_INSET inside it (tests). */
export const quadBaseline = (spec: BorderStripSpec, q: BorderQuad): [number, number] => {
  const f = (spec.rowH - spec.inner) / spec.rowH
  return [q.i0x + (q.o0x - q.i0x) * f, q.i0y + (q.o0y - q.i0y) * f]
}
