// ─── Arena props: decorative scenery scattered AROUND the clearing ───────────
//
// Trees, boulders, flowers, logs, a beehive, ponds, cute gravestones and (for
// the toy-box arena group) children's-bedroom toys, painted as sprites
// (paintedProps.ts, tools/arena-props/pack.mjs) and placed here.
//
// PURE and DETERMINISTIC: the scatter is seeded by the layout id (its own
// mulberry32 stream — never matchRng, never Math.random), so it is identical
// on every load and on both PvP peers, and it has ZERO gameplay effect: no
// physics reads it, it is not part of the match / PvP state hash, it is drawn
// once into the cached background layer (arenaBackdrop.ts).
//
// The guard (tests/arenaProps.test.ts) holds for every layout:
//  · every prop's FULL footprint circle (radius `r`, which the renderer maps
//    onto the sprite's own footprint — every visible pixel) stays outside the
//    clearing: geometric distance to the wall > r + RIM_CLEARANCE (the wooden
//    rim stroke reaches ~6 units past the wall);
//  · never on a team tower (towers are set into the wall and bulge past it);
//  · props never overlap each other;
//  · nothing straddles the ±VIEW_SHORT_HALF line — the viewport edge on the
//    SHORT screen axis in every orientation (the camera fits the short axis to
//    2R + padding), so no prop is ever cut in half at a phone's side edges.
//    Beyond that line a prop is only visible on the long axis of the other
//    orientation, where the margin is wide.
import { sdf, shapeOutline, type ArenaShape } from '@/use/arenaShapes'
import { TOWER_RADIUS_MUL, towerPosition } from '@/use/arenaTerrain'
import { PAINTED_PROPS } from '@/use/paintedProps'

export type PropClass = 'big' | 'mid' | 'small'
export type PropTheme = 'forest' | 'toybox'

export interface PropKind {
  /** Sprite id in PAINTED_PROPS. */
  id: string
  cls: PropClass
  /** Footprint radius range in arena units (the whole sprite fits in it). */
  r: readonly [number, number]
  /** Relative pick weight per theme (0 / absent = never in that theme). */
  w: Partial<Record<PropTheme, number>>
  /** Draw a flat contact shadow (things that stand up; not ponds / flowers). */
  shadow: boolean
}

export const PROP_KINDS: readonly PropKind[] = [
  // forest-a
  { id: 'oak', cls: 'big', r: [34, 42], w: { forest: 4, toybox: 2 }, shadow: true },
  { id: 'fir', cls: 'big', r: [30, 38], w: { forest: 3, toybox: 1 }, shadow: true },
  { id: 'blossom', cls: 'big', r: [32, 40], w: { forest: 2, toybox: 1 }, shadow: true },
  { id: 'boulder', cls: 'mid', r: [18, 24], w: { forest: 3, toybox: 1 }, shadow: true },
  { id: 'boulderPair', cls: 'mid', r: [18, 23], w: { forest: 2 }, shadow: true },
  { id: 'stones', cls: 'small', r: [11, 13], w: { forest: 3, toybox: 1 }, shadow: false },
  { id: 'bush', cls: 'mid', r: [14, 18], w: { forest: 4, toybox: 2 }, shadow: true },
  { id: 'flowers', cls: 'small', r: [9, 12], w: { forest: 5, toybox: 2 }, shadow: false },
  { id: 'fern', cls: 'small', r: [10, 13], w: { forest: 4, toybox: 1 }, shadow: false },
  // forest-b
  { id: 'log', cls: 'mid', r: [20, 26], w: { forest: 2 }, shadow: true },
  { id: 'logPile', cls: 'mid', r: [16, 20], w: { forest: 1 }, shadow: true },
  { id: 'beehive', cls: 'mid', r: [15, 18], w: { forest: 1 }, shadow: true },
  { id: 'pond', cls: 'big', r: [30, 38], w: { forest: 1.5 }, shadow: false },
  { id: 'pondReeds', cls: 'big', r: [30, 36], w: { forest: 1 }, shadow: false },
  { id: 'graveHeart', cls: 'small', r: [11, 13], w: { forest: 0.6 }, shadow: true },
  { id: 'gravePaw', cls: 'small', r: [11, 13], w: { forest: 0.6 }, shadow: true },
  { id: 'sunflowers', cls: 'mid', r: [14, 17], w: { forest: 1.5, toybox: 1 }, shadow: true },
  { id: 'honeyPot', cls: 'small', r: [11, 13], w: { forest: 0.8 }, shadow: true },
  // bedroom-a (toy-box group)
  { id: 'blocks', cls: 'mid', r: [13, 15], w: { toybox: 3 }, shadow: true },
  { id: 'bricks', cls: 'small', r: [12, 13], w: { toybox: 3 }, shadow: true },
  { id: 'teddy', cls: 'mid', r: [17, 20], w: { toybox: 2 }, shadow: true },
  { id: 'bunny', cls: 'mid', r: [16, 19], w: { toybox: 2 }, shadow: true },
  { id: 'ball', cls: 'small', r: [9, 11], w: { toybox: 2 }, shadow: true },
  { id: 'train', cls: 'mid', r: [14, 16], w: { toybox: 1.5 }, shadow: true },
  { id: 'rings', cls: 'small', r: [11, 13], w: { toybox: 1.5 }, shadow: true },
  { id: 'duck', cls: 'small', r: [9, 11], w: { toybox: 1.5 }, shadow: true },
  { id: 'crayons', cls: 'small', r: [10, 12], w: { toybox: 1.5 }, shadow: false }
]

export const PROP_KIND_BY_ID: Readonly<Record<string, PropKind>> = Object.fromEntries(PROP_KINDS.map(k => [k.id, k]))

// ── Geometry contract ────────────────────────────────────────────────────
/** Arena radius every layout is built at (ARENA_RADIUS in the engine). */
export const PROP_ARENA_R = 200
/** Half of the camera's fitted SHORT axis in arena units: the engine fits
 *  min(w, h) to 2·ARENA_RADIUS + ARENA_PADDING (200 + 76 / 2). */
export const VIEW_SHORT_HALF = 238
/** Scatter field half-size: covers the long axis of a 21:9 / 19.5:9 screen
 *  (VIEW_SHORT_HALF × 2.35 ≈ 560) with room to spare. */
export const FIELD_HALF = 600
/** Extra distance between a prop's footprint and the arena wall (the rim
 *  stroke reaches ~6 units past it). */
export const RIM_CLEARANCE = 10
/** Extra distance between a prop's footprint and a tower's body (the tower
 *  draws a contact shadow ~6 units past its radius). */
export const TOWER_CLEARANCE = 10
/** Gap between two props' footprints. */
export const PROP_GAP = 3
/** Blade radii the engine uses (desktop 26, PvP 27, phone 28): towers are
 *  round(blade × TOWER_RADIUS_MUL) and slide with their size. */
const BLADE_RADII = [26, 27, 28] as const

export interface PlacedProp {
  kind: string
  x: number
  y: number
  /** Footprint radius, arena units. */
  r: number
}

/** Tower discs to keep clear of: both sides, every tower size the engine
 *  builds (layout-independent of whether this match has towers on). */
export const towerKeepOut = (shape: ArenaShape, R = PROP_ARENA_R): { x: number; y: number; radius: number }[] => {
  const out: { x: number; y: number; radius: number }[] = []
  for (const b of BLADE_RADII) {
    const radius = Math.round(b * TOWER_RADIUS_MUL)
    for (const side of ['player', 'npc'] as const) {
      const p = towerPosition(side, R, radius, shape)
      out.push({ x: p.x, y: p.y, radius })
    }
  }
  return out
}

/** Geometric distance from (x, y) to the arena wall (the sampled outline),
 *  signed: positive outside the clearing, negative inside. */
const outlineMaxR = new Map<string, number>()
const maxOutlineRadius = (shape: ArenaShape, R: number): number => {
  const key = `${shape}:${R}`
  let m = outlineMaxR.get(key)
  if (m === undefined) {
    const pts = shapeOutline(shape, R)
    m = 0
    for (let i = 0; i < pts.length; i += 2) m = Math.max(m, Math.hypot(pts[i]!, pts[i + 1]!))
    outlineMaxR.set(key, m)
  }
  return m
}

export const wallDistance = (shape: ArenaShape, x: number, y: number, R = PROP_ARENA_R): number => {
  const pts = shapeOutline(shape, R)
  const n = pts.length / 2
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2]!
    const ay = pts[i * 2 + 1]!
    const j = (i + 1) % n
    const bx = pts[j * 2]!
    const by = pts[j * 2 + 1]!
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
    if (d < best) best = d
  }
  return sdf(shape, x, y, R) > 0 ? best : -best
}

/** True when a prop footprint straddles a ±VIEW_SHORT_HALF line on either axis. */
export const straddlesViewEdge = (x: number, y: number, r: number): boolean => {
  for (const c of [Math.abs(x), Math.abs(y)]) {
    if (c + r > VIEW_SHORT_HALF - 2 && c - r < VIEW_SHORT_HALF + 2) return true
  }
  return false
}

/** Toy-box arena group (children's-bedroom set): every 7th layout from 6. */
export const propThemeFor = (layoutId: number | null): PropTheme =>
  layoutId !== null && layoutId % 7 === 6 ? 'toybox' : 'forest'

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seedOf = (layoutId: number | null, shape: ArenaShape): number => {
  if (layoutId !== null) return (Math.imul(layoutId + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0
  let h = 5381
  for (let i = 0; i < shape.length; i++) h = ((h << 5) + h + shape.charCodeAt(i)) | 0
  return h >>> 0
}

/** Kinds that can be placed: painted ones (a kind with no sprite yet is skipped). */
export const paintedPropIds = (): ReadonlySet<string> => new Set(Object.keys(PAINTED_PROPS?.sprites ?? {}))

/** Darts thrown per size class and the acceptance by distance to the wall
 *  (dense hugging the wall, thinner further out). */
const PASSES: readonly { cls: PropClass; darts: number }[] = [
  { cls: 'big', darts: 900 },
  { cls: 'mid', darts: 1400 },
  { cls: 'small', darts: 2600 }
]
const acceptAt = (d: number): number => (d < 60 ? 1 : d < 160 ? 0.5 : 0.28)

const cache = new Map<string, readonly PlacedProp[]>()

/**
 * The decorative scatter around one arena. Deterministic per
 * (layoutId, shape, available kinds); cached. `available` defaults to the
 * painted sprites, so an unpainted kind never takes a slot.
 */
export const arenaPropLayout = (
  layoutId: number | null, shape: ArenaShape, available: ReadonlySet<string> = paintedPropIds()
): readonly PlacedProp[] => {
  const key = `${layoutId ?? '-'}:${shape}:${[...available].sort().join(',')}`
  const hit = cache.get(key)
  if (hit) return hit
  const theme = propThemeFor(layoutId)
  const rng = mulberry32(seedOf(layoutId, shape))
  const towersOut = towerKeepOut(shape)
  const placed: PlacedProp[] = []
  for (const pass of PASSES) {
    const kinds = PROP_KINDS.filter(k => k.cls === pass.cls && available.has(k.id) && (k.w[theme] ?? 0) > 0)
    if (kinds.length === 0) continue
    const total = kinds.reduce((s, k) => s + k.w[theme]!, 0)
    for (let i = 0; i < pass.darts; i++) {
      // Always draw the same number of values per dart so one rejection
      // never shifts the stream of the next.
      const ux = rng()
      const uy = rng()
      const uk = rng()
      const ur = rng()
      const ua = rng()
      let pick = uk * total
      let kind = kinds[kinds.length - 1]!
      for (const k of kinds) {
        pick -= k.w[theme]!
        if (pick <= 0) {
          kind = k
          break
        }
      }
      const r = kind.r[0] + (kind.r[1] - kind.r[0]) * ur
      const x = (ux * 2 - 1) * FIELD_HALF
      const y = (uy * 2 - 1) * FIELD_HALF
      if (Math.abs(x) + r > FIELD_HALF || Math.abs(y) + r > FIELD_HALF) continue
      // Cheap reject first: the clearing is inscribed in R.
      if (Math.hypot(x, y) < PROP_ARENA_R * 0.6) continue
      if (straddlesViewEdge(x, y, r)) continue
      let blocked = false
      for (const t of towersOut) {
        if (Math.hypot(t.x - x, t.y - y) < t.radius + TOWER_CLEARANCE + r) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      for (const p of placed) {
        if (Math.hypot(p.x - x, p.y - y) < p.r + r + PROP_GAP) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      // Exact lower bound first (every outline point lies within maxR of
      // the centre): only near the wall is the polyline walked.
      const far = Math.hypot(x, y) - maxOutlineRadius(shape, PROP_ARENA_R)
      const d = far >= r + RIM_CLEARANCE ? far : wallDistance(shape, x, y)
      if (d < r + RIM_CLEARANCE) continue
      if (ua > acceptAt(d - r)) continue
      placed.push({ kind: kind.id, x, y, r })
    }
  }
  // Painter's order: further up the screen first (3/4 view).
  placed.sort((a, b) => a.y - b.y || a.x - b.x)
  cache.set(key, placed)
  return placed
}
