// ─── Arena props: decorative scenery AROUND the clearing, one set per theme ──
//
// Each arena theme (arenaThemes.ts) owns its own prop kinds — a meadow has
// trees, stones and flowers; a rocky steppe boulders, spires and rifts; a
// child's bedroom toys; … — painted as sprites (paintedProps.ts, one atlas per
// theme, tools/arena-props/pack.mjs) and placed here. A kind belongs to
// exactly ONE theme, so props never mix between themes.
//
// PURPOSEFUL placement, not uniform noise: props are placed as SCENES — a
// theme's little compositions (a tree grove with flowers at its feet, a
// boulder field along a rift, a toy chest with plushies and a ball …):
//  1. scene anchors (a scene's biggest piece) are thrown into the visible
//     margin; a BIG anchor must keep a wide berth from the rim (larger props
//     further out), and every anchor keeps a grass gap (SCENE_GAP) from the
//     scenes already placed, so groups read as groups;
//  2. its companions are set around the anchor, touching distance;
//  3. its small accents sit at the feet of the group, on the side that faces
//     the arena (smaller things closer to the rim);
//  4. a last pass lays small RIM TRIMS — two or three of the theme's smallest
//     pieces together — along the wall where the scenes left it bare.
// Flat ground decals (rifts, ponds, drifts, cooled lava) draw first.
//
// PURE and DETERMINISTIC: seeded by (theme, layout id) on its own mulberry32
// stream — never matchRng, never Math.random — identical on every load and on
// both PvP peers, and with ZERO gameplay effect: no physics reads it, it is not
// part of the match / PvP state hash, it is drawn once into the cached
// background layer (arenaBackdrop.ts).
//
// The guard (tests/arenaProps.test.ts) holds for every layout × arena type:
//  · every prop's FULL footprint circle (radius `r`, which the renderer maps
//    onto the sprite's own footprint — every visible pixel) stays outside the
//    clearing: geometric distance to the wall > r + RIM_CLEARANCE (the wooden
//    rim stroke reaches ~6 units past the wall);
//  · never on a team tower (towers are set into the wall and bulge past it);
//  · props never overlap each other;
//  · only kinds of the arena's own theme;
//  · nothing straddles the ±VIEW_SHORT_HALF line — the viewport edge on the
//    SHORT screen axis in every orientation (the camera fits the short axis to
//    2R + padding), so no prop is ever cut in half at a phone's side edges.
//    Beyond that line a prop is only visible on the long axis of the other
//    orientation, where the margin is wide.
import type { ArenaTheme } from '@/use/arenaThemes'
import { sdf, shapeOutline, type ArenaShape } from '@/use/arenaShapes'
import { MAX_TREES_PER_SIDE, towerPositions, treeRadiusFor } from '@/use/arenaTerrain'
import { PAINTED_PROPS } from '@/use/paintedProps'

/** big = scene anchors that stand far out; mid = companions; small = accents
 *  and rim trims; decal = flat on the ground (drawn first, no shadow). */
export type PropClass = 'big' | 'mid' | 'small'

export interface PropKind {
  /** Sprite id in PAINTED_PROPS[theme]. */
  id: string
  theme: ArenaTheme
  cls: PropClass
  /** Footprint radius range in arena units (the whole sprite fits in it). */
  r: readonly [number, number]
  /** Flat on the ground: drawn before everything else, no contact shadow. */
  decal?: boolean
  /** Draw a flat contact shadow (things that stand up). */
  shadow: boolean
}

const k = (theme: ArenaTheme, id: string, cls: PropClass, r: readonly [number, number], o: { decal?: boolean, shadow?: boolean } = {}): PropKind =>
  ({ id, theme, cls, r, decal: o.decal ?? false, shadow: o.shadow ?? !o.decal })

// Sizes are relative to the trees (big ≈ 30–42): a log is about a fifth of a
// tree's height, a flower patch a fifth; rifts vary widely so some run long.
export const PROP_KINDS: readonly PropKind[] = [
  // meadow — open grassland (forest-a / forest-b sheets)
  k('meadow', 'oak', 'big', [34, 42]),
  k('meadow', 'blossom', 'big', [32, 40]),
  k('meadow', 'pond', 'big', [30, 38], { decal: true }),
  k('meadow', 'pondReeds', 'big', [30, 36], { decal: true }),
  k('meadow', 'boulder', 'mid', [18, 24]),
  k('meadow', 'boulderPair', 'mid', [18, 23]),
  k('meadow', 'bush', 'mid', [12, 15]),
  k('meadow', 'sunflowers', 'mid', [10, 12]),
  k('meadow', 'beehive', 'mid', [15, 18]),
  k('meadow', 'stones', 'small', [11, 13], { shadow: false }),
  k('meadow', 'flowers', 'small', [6, 8], { shadow: false }),
  k('meadow', 'honeyPot', 'small', [11, 13]),
  k('meadow', 'graveHeart', 'small', [11, 13]),
  k('meadow', 'gravePaw', 'small', [11, 13]),
  // woodland — deep old forest (forest-a fir / fern, forest-b logs, woodland-a)
  k('woodland', 'fir', 'big', [30, 38]),
  k('woodland', 'spruce', 'big', [30, 38]),
  k('woodland', 'birch', 'big', [30, 38]),
  k('woodland', 'mossBoulder', 'mid', [18, 24]),
  k('woodland', 'hollowLog', 'mid', [8, 10]),
  k('woodland', 'log', 'mid', [7, 9]),
  k('woodland', 'logPile', 'mid', [7, 9]),
  k('woodland', 'mossyStump', 'mid', [14, 18]),
  k('woodland', 'blueberry', 'mid', [10, 12]),
  k('woodland', 'fern', 'small', [7, 9], { shadow: false }),
  k('woodland', 'toadstools', 'small', [6, 8]),
  k('woodland', 'mushroomRing', 'small', [9, 12], { decal: true }),
  k('woodland', 'leafPile', 'small', [7, 9], { shadow: false }),
  // rocky — dry mountain steppe (rocky-a)
  k('rocky', 'rockSpire', 'big', [26, 32]),
  k('rocky', 'boulderCluster', 'big', [26, 32]),
  k('rocky', 'rift', 'big', [28, 46], { decal: true }),
  k('rocky', 'greyBoulder', 'mid', [18, 24]),
  k('rocky', 'sandSlab', 'mid', [18, 24], { decal: true }),
  k('rocky', 'featherGrass', 'mid', [9, 11], { shadow: false }),
  k('rocky', 'riftSmall', 'small', [12, 20], { decal: true }),
  k('rocky', 'dryTuft', 'small', [6, 8], { shadow: false }),
  k('rocky', 'pebbles', 'small', [7, 9], { shadow: false }),
  // snowy — snowfield (snowy-a)
  k('snowy', 'snowFir', 'big', [30, 38]),
  k('snowy', 'snowFirPair', 'big', [28, 34]),
  k('snowy', 'frozenPond', 'big', [28, 34], { decal: true }),
  k('snowy', 'snowBoulder', 'mid', [18, 24]),
  k('snowy', 'iceCrystals', 'mid', [15, 19]),
  k('snowy', 'snowman', 'mid', [15, 18]),
  k('snowy', 'hollyBush', 'mid', [10, 13]),
  k('snowy', 'snowDrift', 'mid', [16, 22], { decal: true }),
  k('snowy', 'snowStones', 'small', [11, 13]),
  // volcanic — a long-cooled volcanic plain (volcanic-a)
  k('volcanic', 'deadTree', 'big', [30, 36]),
  k('volcanic', 'basaltColumns', 'big', [26, 32]),
  k('volcanic', 'cooledFlow', 'big', [26, 34], { decal: true }),
  k('volcanic', 'lavaRock', 'mid', [18, 24]),
  k('volcanic', 'charredStump', 'mid', [14, 18]),
  k('volcanic', 'ashCrack', 'mid', [20, 34], { decal: true }),
  k('volcanic', 'lavaStones', 'small', [11, 13]),
  k('volcanic', 'obsidian', 'small', [10, 13]),
  k('volcanic', 'ashTuft', 'small', [6, 8], { shadow: false }),
  // ruins — dusk heath with ancient ruins: the boss arena (ruins-a)
  k('ruins', 'stoneArch', 'big', [32, 40]),
  k('ruins', 'ruinsRift', 'big', [28, 46], { decal: true }),
  k('ruins', 'standingStone', 'mid', [16, 21]),
  k('ruins', 'brokenColumn', 'mid', [16, 20]),
  k('ruins', 'fallenColumn', 'mid', [16, 21]),
  k('ruins', 'ruinWall', 'mid', [20, 26]),
  k('ruins', 'heathBush', 'mid', [10, 13]),
  k('ruins', 'rubble', 'small', [11, 14]),
  k('ruins', 'runeStone', 'small', [12, 15], { decal: true }),
  // bedroom — a child's bedroom floor (bedroom-a / bedroom-b)
  k('bedroom', 'toyChest', 'big', [24, 30]),
  k('bedroom', 'rockingHorse', 'big', [22, 28]),
  k('bedroom', 'teddy', 'mid', [17, 20]),
  k('bedroom', 'bunny', 'mid', [16, 19]),
  k('bedroom', 'plushElephant', 'mid', [17, 20]),
  k('bedroom', 'train', 'mid', [14, 16]),
  k('bedroom', 'toyCar', 'mid', [13, 15]),
  k('bedroom', 'pullDuck', 'mid', [13, 15]),
  k('bedroom', 'xylophone', 'mid', [14, 17]),
  k('bedroom', 'blocks', 'mid', [13, 15]),
  k('bedroom', 'drum', 'small', [11, 13]),
  k('bedroom', 'books', 'small', [11, 13]),
  k('bedroom', 'bricks', 'small', [12, 13]),
  k('bedroom', 'rings', 'small', [11, 13]),
  k('bedroom', 'spinningTop', 'small', [9, 11]),
  k('bedroom', 'ball', 'small', [9, 11]),
  k('bedroom', 'duck', 'small', [9, 11]),
  k('bedroom', 'crayons', 'small', [10, 12], { shadow: false })
]

export const PROP_KIND_BY_ID: Readonly<Record<string, PropKind>> = Object.fromEntries(PROP_KINDS.map(p => [p.id, p]))

// ── Scenes: each theme's little compositions ─────────────────────────────
export interface PropScene {
  /** One of these is the scene's anchor (its biggest piece). */
  anchor: readonly string[]
  /** Companions set around the anchor: kinds + how many [min, max]. */
  around: readonly string[]
  aroundN: readonly [number, number]
  /** Small accents at the feet of the group, toward the arena. */
  feet: readonly string[]
  feetN: readonly [number, number]
  /** Relative pick weight. */
  w: number
}

const sc = (anchor: string[], around: string[], aroundN: [number, number], feet: string[], feetN: [number, number], w = 1): PropScene =>
  ({ anchor, around, aroundN, feet, feetN, w })

export const PROP_SCENES: Readonly<Record<ArenaTheme, { scenes: readonly PropScene[], rim: readonly string[] }>> = {
  meadow: {
    scenes: [
      sc(['oak', 'blossom'], ['oak', 'blossom', 'bush'], [1, 3], ['flowers', 'stones'], [2, 4], 3), // tree grove, flowers at its feet
      sc(['pond', 'pondReeds'], ['boulder', 'bush'], [1, 2], ['flowers', 'stones'], [2, 3], 1.2), // pond with a stone and flowers
      sc(['beehive'], ['sunflowers', 'bush'], [1, 3], ['honeyPot', 'flowers'], [1, 3], 1), // bee corner
      sc(['boulder', 'boulderPair'], ['boulder', 'bush'], [1, 2], ['stones', 'flowers'], [1, 3], 1.5), // stone pile
      sc(['graveHeart', 'gravePaw'], ['bush'], [1, 2], ['flowers'], [1, 2], 0.5) // cute little pet graves
    ],
    rim: ['flowers', 'stones']
  },
  woodland: {
    scenes: [
      sc(['fir', 'spruce', 'birch'], ['fir', 'spruce', 'birch', 'fir', 'spruce', 'blueberry'], [2, 5], ['fern', 'toadstools', 'leafPile'], [2, 4], 6), // tree grove (the woodland's main scene)
      sc(['hollowLog', 'log'], ['logPile', 'mossyStump'], [1, 2], ['fern', 'mushroomRing', 'leafPile'], [1, 3], 0.6), // woodpile
      sc(['mossyStump', 'mossBoulder'], ['blueberry'], [1, 2], ['toadstools', 'mushroomRing', 'fern'], [2, 3], 0.8) // fairy corner
    ],
    rim: ['fern', 'toadstools', 'leafPile']
  },
  rocky: {
    scenes: [
      sc(['rift'], ['greyBoulder', 'boulderCluster'], [1, 4], ['pebbles', 'dryTuft', 'riftSmall'], [2, 4], 2), // boulder field along a rift
      sc(['rockSpire', 'boulderCluster'], ['rockSpire', 'greyBoulder'], [1, 3], ['dryTuft', 'pebbles', 'featherGrass'], [1, 3], 2), // spires
      sc(['sandSlab'], ['featherGrass', 'greyBoulder'], [1, 3], ['dryTuft', 'pebbles'], [1, 3], 1) // sandstone ledge in the grass
    ],
    rim: ['dryTuft', 'pebbles', 'riftSmall']
  },
  snowy: {
    scenes: [
      sc(['snowFir', 'snowFirPair'], ['snowFir', 'snowFirPair', 'hollyBush'], [1, 3], ['snowDrift', 'snowStones'], [1, 3], 3), // snowy fir grove
      sc(['snowBoulder'], ['iceCrystals', 'snowBoulder'], [1, 3], ['snowStones', 'snowDrift'], [1, 2], 1.5), // ice boulder field
      sc(['frozenPond'], ['snowman', 'hollyBush', 'iceCrystals'], [1, 3], ['snowStones'], [1, 2], 1) // a snowman by the frozen pond
    ],
    rim: ['snowStones', 'snowDrift']
  },
  volcanic: {
    scenes: [
      sc(['deadTree'], ['charredStump', 'lavaRock'], [1, 3], ['ashTuft', 'lavaStones'], [1, 3], 1.5), // burnt wood
      sc(['basaltColumns'], ['lavaRock', 'basaltColumns'], [1, 3], ['obsidian', 'lavaStones'], [1, 3], 2), // basalt outcrop
      sc(['cooledFlow'], ['lavaRock', 'ashCrack'], [1, 3], ['obsidian', 'ashTuft'], [1, 3], 1.5) // cooled flow, cracked ground
    ],
    rim: ['ashTuft', 'lavaStones', 'obsidian']
  },
  ruins: {
    scenes: [
      sc(['stoneArch'], ['brokenColumn', 'ruinWall'], [1, 3], ['rubble', 'runeStone'], [1, 3], 1.5), // ruined gate
      sc(['brokenColumn', 'fallenColumn'], ['brokenColumn', 'fallenColumn'], [1, 3], ['rubble'], [1, 2], 2), // colonnade
      sc(['standingStone'], ['standingStone'], [2, 4], ['runeStone', 'heathBush'], [0, 2], 1), // little henge
      sc(['ruinsRift'], ['ruinWall', 'heathBush'], [1, 3], ['rubble'], [1, 2], 1.5) // the ground split open
    ],
    rim: ['rubble', 'heathBush']
  },
  bedroom: {
    scenes: [
      sc(['toyChest'], ['teddy', 'plushElephant', 'books'], [1, 3], ['ball', 'crayons', 'blocks'], [2, 3], 2), // the toy chest spilled out
      sc(['rockingHorse'], ['pullDuck', 'toyCar'], [1, 2], ['rings', 'spinningTop'], [1, 2], 1.5), // wooden toys
      sc(['teddy', 'bunny', 'plushElephant'], ['teddy', 'bunny', 'plushElephant'], [1, 2], ['ball', 'duck', 'drum'], [1, 2], 1.5), // plushies' tea party
      sc(['train'], ['toyCar', 'blocks'], [1, 2], ['bricks', 'rings'], [1, 2], 1), // train set
      sc(['xylophone'], ['blocks'], [1, 2], ['drum', 'spinningTop'], [1, 2], 1), // music corner
      sc(['books'], [], [0, 0], ['crayons'], [1, 2], 0.8) // picture books and crayons
    ],
    rim: ['crayons', 'ball', 'bricks', 'duck', 'spinningTop']
  }
}

// ── Geometry contract ────────────────────────────────────────────────────
/** Arena radius every layout is built at (ARENA_RADIUS in the engine). */
export const PROP_ARENA_R = 200
/** Nominal half of the camera's SHORT axis in arena units (the old fixed
 *  2R + 76 fit). The engine now fits each layout's real extent
 *  (@/use/arenaFit), so the true edge varies by a few % — this only keeps
 *  props from straddling the typical edge line. */
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
/** Gap between two props' footprints inside one scene. */
export const PROP_GAP = 3
/** Grass left between a new scene's anchor and anything already placed. */
export const SCENE_GAP = 44
/** A BIG prop's footprint keeps at least this much more from the rim
 *  (larger props further out; small ones may sit right at the rim). */
export const BIG_RIM_BERTH = 22
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

/** Tower discs to keep clear of: both sides, every tower size and tree
 *  count (1–3) the engine builds (layout-independent of whether this match has towers on). */
export const towerKeepOut = (shape: ArenaShape, R = PROP_ARENA_R): { x: number; y: number; radius: number }[] => {
  const out: { x: number; y: number; radius: number }[] = []
  for (const b of BLADE_RADII) {
    // Every tree count a campaign stage can have (1–3 per side).
    for (let n = 1; n <= MAX_TREES_PER_SIDE; n++) {
      const radius = treeRadiusFor(b, n)
      for (const side of ['player', 'npc'] as const) {
        for (const p of towerPositions(side, R, radius, shape, n, b)) out.push({ x: p.x, y: p.y, radius })
      }
    }
  }
  return out
}

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

/** Geometric distance from (x, y) to the arena wall (the sampled outline),
 *  signed: positive outside the clearing, negative inside. */
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

const seedOf = (theme: ArenaTheme, layoutId: number | null, shape: ArenaShape): number => {
  let h = 5381
  const s = `${theme}:${layoutId === null ? shape : ''}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  if (layoutId !== null) h ^= Math.imul(layoutId + 1, 0x9e3779b1) ^ 0x5bd1e995
  return h >>> 0
}

/** Kinds that can be placed: painted ones of every theme (a kind with no
 *  sprite yet is skipped). */
export const paintedPropIds = (): ReadonlySet<string> => {
  const out = new Set<string>()
  for (const atlas of Object.values(PAINTED_PROPS)) for (const id of Object.keys(atlas?.sprites ?? {})) out.add(id)
  return out
}

/** Scene darts: thrown into the two visible bands (portrait top/bottom,
 *  landscape left/right) — the corners beyond both short-axis edges are
 *  never on screen. */
const SCENE_DARTS = 700
const RIM_DARTS = 260

const cache = new Map<string, readonly PlacedProp[]>()

/**
 * The decorative props around one arena dressed in `theme`. Deterministic per
 * (theme, layoutId, shape, available kinds); cached. `available` defaults to
 * the painted sprites, so an unpainted kind never takes a slot.
 */
export const arenaPropLayout = (
  theme: ArenaTheme, layoutId: number | null, shape: ArenaShape, available: ReadonlySet<string> = paintedPropIds()
): readonly PlacedProp[] => {
  const key = `${theme}:${layoutId ?? '-'}:${shape}:${[...available].sort().join(',')}`
  const hit = cache.get(key)
  if (hit) return hit
  const rng = mulberry32(seedOf(theme, layoutId, shape))
  const towersOut = towerKeepOut(shape)
  const maxR = maxOutlineRadius(shape, PROP_ARENA_R)
  const placed: PlacedProp[] = []
  const usable = (id: string): boolean => available.has(id) && PROP_KIND_BY_ID[id]?.theme === theme
  const pickFrom = (ids: readonly string[]): PropKind | null => {
    const ok = ids.filter(usable)
    const u = rng()
    return ok.length ? PROP_KIND_BY_ID[ok[Math.min(ok.length - 1, Math.floor(u * ok.length))]!]! : null
  }

  /** Edge-to-wall distance of a footprint, or -1 when it is not allowed there. */
  const fits = (x: number, y: number, r: number, gap: number): number => {
    if (Math.abs(x) + r > FIELD_HALF || Math.abs(y) + r > FIELD_HALF) return -1
    if (Math.hypot(x, y) < PROP_ARENA_R * 0.6) return -1
    if (straddlesViewEdge(x, y, r)) return -1
    for (const t of towersOut) if (Math.hypot(t.x - x, t.y - y) < t.radius + TOWER_CLEARANCE + r) return -1
    for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < p.r + r + gap) return -1
    // Exact lower bound first (every outline point lies within maxR of the
    // centre): only near the wall is the polyline walked.
    const far = Math.hypot(x, y) - maxR
    const d = far >= r + RIM_CLEARANCE ? far : wallDistance(shape, x, y)
    if (d < r + RIM_CLEARANCE) return -1
    return d - r
  }
  const radiusOf = (kind: PropKind): number => kind.r[0] + (kind.r[1] - kind.r[0]) * rng()
  /** A point in one of the two visible bands. */
  const dart = (): [number, number] => {
    const band = rng()
    const u = (rng() * 2 - 1)
    const v = (rng() * 2 - 1)
    return band < 0.5 ? [u * VIEW_SHORT_HALF, v * FIELD_HALF] : [u * FIELD_HALF, v * VIEW_SHORT_HALF]
  }
  /** Try to set `kind` touching `parent`, preferring angles around `aim`. */
  const besides = (parent: PlacedProp, kind: PropKind, aim: number, spread: number): PlacedProp | null => {
    const r = radiusOf(kind)
    const a0 = aim + (rng() * 2 - 1) * spread
    const slack = rng() * 2
    for (let i = 0; i < 10; i++) {
      // fan out from the aimed angle: 0, +, −, ++, −− …
      const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.42
      const dist = parent.r + r + PROP_GAP + 0.5 + slack
      const x = parent.x + Math.cos(a) * dist
      const y = parent.y + Math.sin(a) * dist
      const edge = fits(x, y, r, PROP_GAP)
      if (edge >= 0 && (kind.cls !== 'big' || edge >= BIG_RIM_BERTH)) return { kind: kind.id, x, y, r }
    }
    return null
  }

  const def = PROP_SCENES[theme]
  const scenes = def.scenes.filter(s => s.anchor.some(usable))
  const totalW = scenes.reduce((s, x) => s + x.w, 0)

  // 1–3. Scenes.
  for (let i = 0; i < SCENE_DARTS && scenes.length; i++) {
    let pick = rng() * totalW
    let scene = scenes[scenes.length - 1]!
    for (const s of scenes) {
      pick -= s.w
      if (pick <= 0) { scene = s; break }
    }
    const anchorKind = pickFrom(scene.anchor)!
    const r = radiusOf(anchorKind)
    const [x, y] = dart()
    const edge = fits(x, y, r, SCENE_GAP)
    if (edge < 0) continue
    // larger props further out
    if (anchorKind.cls === 'big' && edge < BIG_RIM_BERTH) continue
    const anchor: PlacedProp = { kind: anchorKind.id, x, y, r }
    placed.push(anchor)
    const group: PlacedProp[] = [anchor]
    // toward the arena centre: the side the small accents gather on
    const inward = Math.atan2(-y, -x)
    const nAround = scene.aroundN[0] + Math.floor(rng() * (scene.aroundN[1] - scene.aroundN[0] + 1))
    for (let j = 0; j < nAround; j++) {
      const kind = pickFrom(scene.around)
      if (!kind) break
      const p = besides(anchor, kind, rng() * Math.PI * 2, Math.PI)
      if (p) { placed.push(p); group.push(p) }
    }
    const nFeet = scene.feetN[0] + Math.floor(rng() * (scene.feetN[1] - scene.feetN[0] + 1))
    for (let j = 0; j < nFeet; j++) {
      const kind = pickFrom(scene.feet)
      if (!kind) break
      const parent = group[Math.floor(rng() * group.length)]!
      const p = besides(parent, kind, inward, Math.PI * 0.45)
      if (p) { placed.push(p); group.push(p) }
    }
  }

  // 4. Rim trims: two or three small pieces together, close to the wall.
  const rimKinds = def.rim.filter(usable).map(id => PROP_KIND_BY_ID[id]!)
  for (let i = 0; i < RIM_DARTS && rimKinds.length; i++) {
    const kind = rimKinds[Math.floor(rng() * rimKinds.length)]!
    const r = radiusOf(kind)
    const [x, y] = dart()
    const n = 1 + Math.floor(rng() * 2)
    const edge = fits(x, y, r, SCENE_GAP * 0.8)
    if (edge < 0 || edge > 22) continue
    const first: PlacedProp = { kind: kind.id, x, y, r }
    placed.push(first)
    // along the wall: perpendicular to the inward direction
    const along = Math.atan2(-y, -x) + Math.PI / 2 * (rng() < 0.5 ? 1 : -1)
    for (let j = 0; j < n; j++) {
      const p = besides(first, rimKinds[Math.floor(rng() * rimKinds.length)]!, along, 0.5)
      if (p) placed.push(p)
    }
  }

  // Painter's order: flat ground decals first, then further up the screen
  // first (3/4 view).
  const flat = (p: PlacedProp) => (PROP_KIND_BY_ID[p.kind]?.decal ? 0 : 1)
  placed.sort((a, b) => flat(a) - flat(b) || a.y - b.y || a.x - b.x)
  cache.set(key, placed)
  return placed
}
