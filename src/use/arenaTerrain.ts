import { sdf, type ArenaShape } from '@/use/arenaShapes'
// ─── Arena terrain: layouts (islands, speed boosters, pot holes …) + team towers ──
//
// Pure geometry / physics helpers for the Tree Smashers arena. The engine
// (useSpinnerGame) owns the live state; everything here is deterministic
// (no Math.random, no clocks) so both PvP peers build byte-identical arenas.
//
// Coordinates are arena-local in the HOST frame: the local player's home side
// is +y (bottom), the opponent's is −y (top). A PvP guest sees the arena
// y-mirrored, so it builds the layout with `flipY` — the host-frame geometry
// is then identical on both peers.
//
// Feature kinds (each one = one draw function in arenaTerrainDraw.ts = one
// sprite seam for the paint pipeline):
//  · islands  (stump / rock / pond) — static discs, the bouncer ricochet;
//  · boosters — speed ×BOOSTER_MUL along the blade's own velocity;
//  · holes    — mud (drag) or deep (stop dead in the core);
//  · arrows   — leaf ramps: one-way directional boosters (turn toward the
//               arrow + speed), share the booster budget;
//  · honey    — sticky patch, much stronger drag than mud, never stops;
//  · mushrooms — bouncy caps: a reflection with extra restitution while the
//               blade's boost budget lasts, a plain dull bounce after;
//  · logs     — capsule-shaped solids (segment + radius), damped reflection.

export type IslandKind = 'stump' | 'rock' | 'pond'

export interface TerrainIsland {
  x: number
  y: number
  radius: number
  kind: IslandKind
}

export interface TerrainBooster {
  x: number
  y: number
  radius: number
  /** Decor only: the direction the painted arrow points (radians). The boost
   *  itself always acts along the blade's own velocity. */
  angle: number
}

export interface TerrainHole {
  x: number
  y: number
  radius: number
  /** Deep hole: a blade that rolls into its core stops dead. Shallow (mud):
   *  strong extra drag while inside. */
  deep: boolean
}

/** Leaf ramp: steers a crossing blade toward `angle` and speeds it up. */
export interface TerrainArrow {
  x: number
  y: number
  radius: number
  angle: number
}

/** Sticky honey / bouncy mushroom cap: a plain disc. */
export interface TerrainDisc {
  x: number
  y: number
  radius: number
}

/** Fallen log: a capsule (segment a→b, half-thickness `radius`). */
export interface TerrainLog {
  ax: number
  ay: number
  bx: number
  by: number
  radius: number
}

/** Floor decor scattered by the arena renderer (see arenaTerrainDraw). */
export type DecorKind = 'tufts' | 'ferns' | 'flowers' | 'pebbles' | 'leaves' | 'snow' | 'reeds' | 'acorns' | 'cones' | 'toadstools'

export interface TerrainTheme {
  decor: DecorKind
  /** Floor fill override (only on the plain 'default' arena type; the
   *  lava / ice / … arena types keep their own palette). [base, light]. */
  floor?: readonly [string, string]
}

export interface TerrainLayout {
  id: number
  /** i18n key of the layout's display name. */
  nameKey: string
  theme: TerrainTheme
  islands: TerrainIsland[]
  boosters: TerrainBooster[]
  holes: TerrainHole[]
  arrows: TerrainArrow[]
  honey: TerrainDisc[]
  mushrooms: TerrainDisc[]
  logs: TerrainLog[]
}

// ── Tuning ────────────────────────────────────────────────────────────────
/** Speed multiplier of one booster pass. */
export const BOOSTER_MUL = 1.3
/** A boosted blade never exceeds this fraction of its own max launch speed. */
export const BOOSTER_CAP_RATIO = 1.15
/** Per-blade re-arm after a boost (sim ms). */
export const BOOSTER_COOLDOWN_MS = 600
/** At most this many boosts per blade per launch (a runaway guard). Shared by
 *  boosters, leaf arrows and mushroom kicks. */
export const BOOSTER_MAX_PER_LAUNCH = 3
/** Per physics substep velocity keep while a blade's centre is in mud. */
export const MUD_KEEP = 0.9
/** Fraction of a deep hole's radius that is the "stop" core. */
export const DEEP_CORE_RATIO = 0.65
/** Leaf arrow: speed multiplier (capped like a booster). */
export const ARROW_MUL = 1.2
/** Leaf arrow: weight of the arrow direction in the new heading
 *  (v̂ + w·d̂, normalised — never degenerate since w ≠ 1). */
export const ARROW_TURN = 1.5
/** Per substep velocity keep while a blade's centre is in honey. */
export const HONEY_KEEP = 0.8
/** Mushroom cap: reflected speed × this while the boost budget lasts. */
export const MUSHROOM_MUL = 1.25
/** Mushroom cap after the budget is spent / log: reflected speed × this. */
export const SOLID_KEEP = 0.85

/** Team tower body radius relative to the blade radius. */
export const TOWER_RADIUS_MUL = 1.35
/** Distance of each tower centre from the arena centre, × arena radius. */
export const TOWER_Y_RATIO = 0.8
/** Tower HP = this × the team's total blade max HP at spawn. */
export const TOWER_HP_RATIO = 0.6
/** Damage scale for blade → tower hits (on top of the engine's DAMAGE_SCALE). */
export const TOWER_DAMAGE_MUL = 1

// ── Layout tables ─────────────────────────────────────────────────────────
// Arena radius 200. Spawns: player row y=+80 |x|≤70; the opponent block on a
// terrain arena y∈[−141,−49] |x|≤91 incl. jitter (clamped into the shape);
// towers on the y axis set into the wall. With the largest disc (1.35 × the
// 28 blade radius ≈ 38) that leaves the mid band y≈15 (r ≤ 20) across the
// clearing plus the side lanes |x| ≥ 131 + r for every feature —
// tests/arenaLayouts.test.ts enforces it for every layout and shape.

type Feat = Partial<Omit<TerrainLayout, 'id' | 'nameKey' | 'theme'>>
const P = Math.PI
const UP = -P / 2
const DOWN = P / 2
const I = (x: number, y: number, radius: number, kind: IslandKind): TerrainIsland => ({ x, y, radius, kind })
const B = (x: number, y: number, radius: number, angle = UP): TerrainBooster => ({ x, y, radius, angle })
const MUD = (x: number, y: number, radius: number): TerrainHole => ({ x, y, radius, deep: false })
const PIT = (x: number, y: number, radius: number): TerrainHole => ({ x, y, radius, deep: true })
const A = (x: number, y: number, radius: number, angle: number): TerrainArrow => ({ x, y, radius, angle })
const D = (x: number, y: number, radius: number): TerrainDisc => ({ x, y, radius })
const G = (ax: number, ay: number, bx: number, by: number, radius: number): TerrainLog => ({ ax, ay, bx, by, radius })

const DEF: [string, TerrainTheme, Feat][] = [
  // ── 0–2: the original three (stage 1 = the clean tutorial clearing) ──
  ['mossyGlade', { decor: 'tufts' }, {
    islands: [I(0, 15, 20, 'stump')],
    boosters: [B(-105, 15, 15, UP), B(108, 15, 15, DOWN)]
  }],
  ['mudHollow', { decor: 'pebbles' }, {
    boosters: [B(-150, 20, 14, UP), B(150, -20, 14, DOWN)],
    holes: [PIT(0, 15, 15), MUD(-66, 15, 19), MUD(66, 15, 19), MUD(-145, -25, 14), MUD(145, 25, 14)]
  }],
  ['twinIslands', { decor: 'reeds' }, {
    islands: [I(-108, 20, 25, 'rock'), I(118, 20, 25, 'pond')],
    boosters: [B(-42, 10, 14, UP), B(42, 10, 14, DOWN)],
    holes: [MUD(0, 10, 14)]
  }],
  // ── 3–10: one idea each, new kinds introduced one at a time ──
  ['fernHollow', { decor: 'ferns', floor: ['#6fb553', '#80c262'] }, {
    islands: [I(-70, 15, 18, 'stump'), I(70, 15, 18, 'rock')]
  }],
  ['mushroomRing', { decor: 'toadstools' }, {
    mushrooms: [D(0, 15, 18), D(-140, 10, 14), D(140, 10, 14)]
  }],
  ['beaverDam', { decor: 'reeds', floor: ['#79b85a', '#88c468'] }, {
    logs: [G(-60, 15, 60, 15, 11)],
    holes: [MUD(-140, 15, 16), MUD(140, 15, 16)]
  }],
  ['lilyPond', { decor: 'reeds', floor: ['#74bd60', '#86c96f'] }, {
    islands: [I(-90, 15, 20, 'pond'), I(90, 15, 20, 'pond')],
    holes: [MUD(0, 15, 16)]
  }],
  ['acornAlley', { decor: 'acorns' }, {
    islands: [I(0, 15, 16, 'stump')],
    boosters: [B(-70, 15, 14, UP), B(70, 15, 14, UP), B(-145, 15, 13, DOWN), B(145, 15, 13, DOWN)]
  }],
  ['brambleMaze', { decor: 'leaves', floor: ['#6aa84f', '#78b65c'] }, {
    islands: [I(-110, 15, 16, 'rock'), I(0, 15, 18, 'stump'), I(110, 15, 16, 'rock')]
  }],
  ['waterfallLedge', { decor: 'pebbles' }, {
    arrows: [A(-80, 15, 16, UP), A(80, 15, 16, UP)],
    islands: [I(0, 15, 18, 'pond')]
  }],
  ['pineconePeak', { decor: 'cones', floor: ['#6ead52', '#7cba60'] }, {
    mushrooms: [D(-65, 15, 14), D(65, 15, 14)],
    holes: [PIT(0, 15, 14)],
    boosters: [B(-138, 15, 12, UP), B(138, 15, 12, UP)]
  }],
  // ── 11–25: two or three kinds together ──
  ['honeyGrove', { decor: 'flowers', floor: ['#8cc35a', '#9cce68'] }, {
    honey: [D(-70, 15, 20), D(70, 15, 20)],
    islands: [I(0, 15, 16, 'stump')]
  }],
  ['snowyClearing', { decor: 'snow', floor: ['#cfe6f2', '#e2f0f8'] }, {
    boosters: [B(-100, 15, 14, UP), B(100, 15, 14, UP)],
    mushrooms: [D(0, 15, 16)],
    holes: [MUD(-150, 15, 13), MUD(150, 15, 13)]
  }],
  ['badgerBurrow', { decor: 'pebbles', floor: ['#7cae55', '#8aba62'] }, {
    holes: [PIT(-80, 15, 15), MUD(0, 15, 18), PIT(80, 15, 15)],
    islands: [I(-128, 15, 10, 'rock'), I(128, 15, 10, 'rock')]
  }],
  ['owlHollow', { decor: 'leaves', floor: ['#5f9f4a', '#6dad57'] }, {
    logs: [G(-150, -25, -150, 35, 10), G(150, -25, 150, 35, 10)],
    islands: [I(0, 15, 18, 'stump')],
    arrows: [A(-75, 15, 14, UP), A(75, 15, 14, UP)]
  }],
  ['bluebellDell', { decor: 'flowers', floor: ['#74b95e', '#84c56c'] }, {
    arrows: [A(-60, 15, 15, P), A(60, 15, 15, 0)],
    mushrooms: [D(-140, 15, 14), D(140, 15, 14)],
    holes: [MUD(0, 15, 14)]
  }],
  ['fireflyMeadow', { decor: 'flowers', floor: ['#6cae58', '#7dbb66'] }, {
    boosters: [B(-145, 15, 13, UP), B(145, 15, 13, UP)],
    honey: [D(0, 15, 18)],
    arrows: [A(-72, 15, 14, UP), A(72, 15, 14, UP)]
  }],
  ['hedgehogHill', { decor: 'leaves' }, {
    mushrooms: [D(-100, 15, 14), D(0, 15, 16), D(100, 15, 14)],
    holes: [MUD(-140, 15, 12), MUD(140, 15, 12)]
  }],
  ['willowBend', { decor: 'reeds', floor: ['#78bb5f', '#88c76d'] }, {
    logs: [G(-115, 5, -45, 25, 10), G(45, 25, 115, 5, 10)],
    holes: [PIT(0, 15, 13)],
    islands: [I(-150, 15, 11, 'pond'), I(150, 15, 11, 'pond')]
  }],
  ['foxgloveField', { decor: 'flowers' }, {
    honey: [D(-120, 15, 18), D(120, 15, 18)],
    arrows: [A(-40, 15, 14, UP), A(40, 15, 14, UP)]
  }],
  ['berryPatch', { decor: 'flowers', floor: ['#70b259', '#80bf67'] }, {
    islands: [I(-135, 15, 15, 'stump'), I(135, 15, 15, 'rock')],
    mushrooms: [D(-60, 15, 14), D(60, 15, 14)],
    holes: [MUD(0, 15, 14)]
  }],
  ['squirrelStash', { decor: 'acorns' }, {
    logs: [G(-95, 15, -30, 15, 10)],
    holes: [PIT(22, 15, 14)],
    mushrooms: [D(80, 15, 14)],
    boosters: [B(148, 15, 13, UP), B(-152, 15, 12, DOWN)]
  }],
  ['mossyRocks', { decor: 'pebbles', floor: ['#69aa52', '#77b75f'] }, {
    islands: [I(-140, 15, 15, 'rock'), I(-62, 15, 16, 'rock'), I(62, 15, 16, 'rock'), I(140, 15, 15, 'rock')],
    holes: [MUD(0, 15, 14)]
  }],
  ['cloverCrossing', { decor: 'tufts', floor: ['#7dc35e', '#8ece6c'] }, {
    arrows: [A(-118, 15, 13, 0), A(-45, 15, 14, UP), A(45, 15, 14, UP), A(118, 15, 13, P)],
    islands: [I(0, 15, 12, 'stump')]
  }],
  ['toadstoolCorner', { decor: 'toadstools', floor: ['#6fae55', '#7ebb62'] }, {
    mushrooms: [D(-150, 5, 13), D(-75, 15, 15), D(75, 15, 15), D(150, 5, 13)],
    honey: [D(0, 15, 18)]
  }],
  ['riverbank', { decor: 'reeds', floor: ['#72b85f', '#82c46c'] }, {
    islands: [I(-145, 15, 16, 'pond'), I(0, 15, 17, 'pond'), I(145, 15, 16, 'pond')],
    holes: [MUD(-72, 15, 17), MUD(72, 15, 17)]
  }],
  // ── 26–49: busy mixes ──
  ['bumblebeeBower', { decor: 'flowers', floor: ['#86c25c', '#96cd6a'] }, {
    honey: [D(-140, 15, 14), D(140, 15, 14)],
    arrows: [A(-68, 15, 14, UP), A(68, 15, 14, UP)],
    mushrooms: [D(0, 15, 15)]
  }],
  ['sunnySlope', { decor: 'flowers', floor: ['#8ec95f', '#a0d46e'] }, {
    boosters: [B(-150, 15, 13, UP), B(-90, 15, 13, UP), B(90, 15, 13, UP), B(150, 15, 13, UP)],
    holes: [PIT(0, 15, 14)],
    honey: [D(-40, 15, 11), D(40, 15, 11)]
  }],
  ['thistleThicket', { decor: 'leaves' }, {
    logs: [G(-135, 2, -75, 28, 9), G(75, 28, 135, 2, 9)],
    mushrooms: [D(0, 15, 14)],
    honey: [D(-150, -30, 12), D(150, -30, 12)]
  }],
  ['oldOakRoots', { decor: 'acorns', floor: ['#66a54e', '#74b25b'] }, {
    islands: [I(0, 15, 20, 'stump')],
    logs: [G(-145, 15, -65, 15, 9), G(65, 15, 145, 15, 9)]
  }],
  ['puddleLane', { decor: 'pebbles', floor: ['#76b65c', '#85c26a'] }, {
    holes: [MUD(-150, 15, 14), MUD(-90, 15, 16), PIT(0, 15, 14), MUD(90, 15, 16), MUD(150, 15, 14)],
    boosters: [B(-45, 15, 11, UP), B(45, 15, 11, UP)]
  }],
  ['logJam', { decor: 'leaves', floor: ['#71ad55', '#7fba62'] }, {
    logs: [G(-145, -20, -122, 38, 10), G(-55, 15, 55, 15, 10), G(145, -20, 122, 38, 10)]
  }],
  ['autumnLeaves', { decor: 'leaves', floor: ['#a3b456', '#b2c063'] }, {
    arrows: [A(-142, 15, 13, UP), A(-75, 15, 14, 0), A(0, 15, 14, UP), A(75, 15, 14, P), A(142, 15, 13, UP)]
  }],
  ['frogHopMarsh', { decor: 'reeds', floor: ['#6fb466', '#7fc073'] }, {
    islands: [I(-125, 15, 16, 'pond'), I(125, 15, 16, 'pond')],
    mushrooms: [D(-62, 15, 13), D(62, 15, 13)],
    holes: [MUD(0, 15, 16)]
  }],
  ['rabbitWarren', { decor: 'tufts', floor: ['#7cbd5c', '#8bc96a'] }, {
    holes: [PIT(-120, 15, 12), PIT(-60, 15, 12), PIT(0, 15, 12), PIT(60, 15, 12), PIT(120, 15, 12)]
  }],
  ['daisyChain', { decor: 'flowers', floor: ['#80c460', '#90cf6e'] }, {
    mushrooms: [D(-150, 15, 12), D(-50, 15, 12), D(50, 15, 12), D(150, 15, 12)],
    boosters: [B(-100, 15, 12, UP), B(0, 15, 12, UP), B(100, 15, 12, UP)]
  }],
  ['mistyGlen', { decor: 'ferns', floor: ['#79ad78', '#88b986'] }, {
    honey: [D(-110, 15, 18), D(110, 15, 18)],
    holes: [PIT(0, 15, 14)],
    arrows: [A(-48, 15, 12, UP), A(48, 15, 12, UP)],
    mushrooms: [D(-150, -30, 11), D(150, -30, 11)]
  }],
  ['logHideout', { decor: 'ferns' }, {
    logs: [G(-125, 15, -35, 15, 12), G(35, 15, 125, 15, 12)],
    boosters: [B(0, 15, 12, UP)],
    islands: [I(-150, -30, 11, 'rock'), I(150, -30, 11, 'rock')]
  }],
  ['stonyBrook', { decor: 'pebbles', floor: ['#6caf63', '#7bbb70'] }, {
    islands: [I(-150, 15, 14, 'rock'), I(-50, 15, 14, 'rock'), I(50, 15, 14, 'rock'), I(150, 15, 14, 'rock')],
    holes: [MUD(-100, 15, 14), MUD(0, 15, 14), MUD(100, 15, 14)]
  }],
  ['chestnutCorner', { decor: 'acorns', floor: ['#79ac50', '#87b85d'] }, {
    mushrooms: [D(-140, 15, 14), D(85, 15, 14)],
    logs: [G(-90, 15, -30, 15, 9)],
    honey: [D(22, 15, 16)],
    boosters: [B(150, 15, 13, UP)]
  }],
  ['moonlitGlade', { decor: 'toadstools', floor: ['#5f9a63', '#6ca770'] }, {
    holes: [PIT(0, 15, 16)],
    arrows: [A(-72, 15, 14, 0), A(72, 15, 14, P)],
    mushrooms: [D(-145, 15, 14), D(145, 15, 14)]
  }],
  ['dandelionDrift', { decor: 'flowers', floor: ['#8cc75c', '#9cd26a'] }, {
    arrows: [A(-150, 15, 12, UP), A(-80, 15, 12, -3 * P / 4), A(80, 15, 12, -P / 4), A(150, 15, 12, UP)],
    honey: [D(0, 15, 17)],
    mushrooms: [D(-150, -36, 10), D(150, -36, 10)]
  }],
  ['birchGrove', { decor: 'leaves', floor: ['#7ab95e', '#8ac56b'] }, {
    islands: [I(-95, 15, 15, 'rock'), I(0, 15, 15, 'stump'), I(95, 15, 15, 'rock')],
    arrows: [A(-48, 15, 11, UP), A(48, 15, 11, UP)]
  }],
  ['robinsRest', { decor: 'tufts' }, {
    mushrooms: [D(0, 15, 16)],
    logs: [G(-125, 8, -70, 25, 9), G(70, 25, 125, 8, 9)],
    honey: [D(-42, 15, 9), D(42, 15, 9)]
  }],
  ['elderberryEdge', { decor: 'flowers', floor: ['#6fa75a', '#7db467'] }, {
    honey: [D(-150, 15, 13), D(150, 15, 13)],
    mushrooms: [D(-95, 15, 13), D(95, 15, 13)],
    holes: [PIT(-38, 15, 13)],
    boosters: [B(38, 15, 13, UP)]
  }],
  ['cattailCreek', { decor: 'reeds', floor: ['#6eb362', '#7ebf6f'] }, {
    islands: [I(-152, 15, 14, 'pond'), I(152, 15, 14, 'pond')],
    logs: [G(-105, 15, -45, 15, 9), G(45, 15, 105, 15, 9)],
    holes: [MUD(0, 15, 15)]
  }],
  ['bearDen', { decor: 'pebbles', floor: ['#6d9f4d', '#7bac5a'] }, {
    holes: [PIT(0, 15, 18)],
    mushrooms: [D(-80, 15, 15), D(80, 15, 15)],
    honey: [D(-142, 15, 13), D(142, 15, 13)],
    arrows: [A(-148, -30, 10, DOWN), A(148, -30, 10, DOWN)]
  }],
  ['sapSpring', { decor: 'ferns', floor: ['#84b957', '#93c565'] }, {
    honey: [D(-100, 15, 15), D(0, 15, 15), D(100, 15, 15)],
    mushrooms: [D(-50, 15, 11), D(50, 15, 11)],
    arrows: [A(-148, 15, 11, UP), A(148, 15, 11, UP)]
  }],
  ['rainbowRidge', { decor: 'flowers', floor: ['#7fc263', '#8fce71'] }, {
    arrows: [A(-150, 15, 12, UP), A(150, 15, 12, UP)],
    boosters: [B(-100, 15, 12, UP), B(100, 15, 12, UP)],
    mushrooms: [D(-50, 15, 12), D(50, 15, 12)],
    honey: [D(0, 15, 13)]
  }],
  ['ancientGrove', { decor: 'ferns', floor: ['#5c9a48', '#6aa755'] }, {
    islands: [I(0, 15, 18, 'stump')],
    logs: [G(-140, -28, -140, 42, 10), G(140, -28, 140, 42, 10)],
    holes: [PIT(-65, 15, 13), PIT(65, 15, 13)],
    mushrooms: [D(-100, 15, 12), D(100, 15, 12)]
  }]
]

const LAYOUTS: readonly TerrainLayout[] = DEF.map(([key, theme, f], id) => ({
  id,
  nameKey: `terrain.layout.${key}`,
  theme,
  islands: f.islands ?? [],
  boosters: f.boosters ?? [],
  holes: f.holes ?? [],
  arrows: f.arrows ?? [],
  honey: f.honey ?? [],
  mushrooms: f.mushrooms ?? [],
  logs: f.logs ?? []
}))

export const TERRAIN_LAYOUT_COUNT = LAYOUTS.length

/** i18n keys (without the `terrain.layout.` prefix), in layout order. */
export const TERRAIN_LAYOUT_KEYS: readonly string[] = DEF.map(d => d[0])

/** Campaign: stage 1 → layout 0, 2 → 1 … 50 → 49, 51 → 0 … */
export const layoutForStage = (stageId: number): number =>
  (((Math.floor(stageId) - 1) % TERRAIN_LAYOUT_COUNT) + TERRAIN_LAYOUT_COUNT) % TERRAIN_LAYOUT_COUNT

/** PvP / league / ghost: derived from the shared seed (both peers agree). */
export const layoutForSeed = (seed: number): number =>
  (((seed >>> 0) ^ ((seed >>> 0) >>> 16)) >>> 0) % TERRAIN_LAYOUT_COUNT

/** Stable 32-bit hash of a string (ghost ids) — djb2. */
export const hashString = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** Campaign towers start at stage 2 (stage 1 is the pure tutorial fight). */
export const TOWERS_FROM_STAGE = 2

/** A fresh copy of layout `id` (mod count), optionally y-mirrored (PvP guest). */
export const buildTerrainLayout = (id: number, flipY = false): TerrainLayout => {
  const src = LAYOUTS[((id % TERRAIN_LAYOUT_COUNT) + TERRAIN_LAYOUT_COUNT) % TERRAIN_LAYOUT_COUNT]!
  const fy = flipY ? -1 : 1
  const fa = (a: number) => (flipY ? -a : a)
  return {
    id: src.id,
    nameKey: src.nameKey,
    theme: src.theme,
    islands: src.islands.map(i => ({ ...i, y: i.y * fy })),
    boosters: src.boosters.map(b => ({ ...b, y: b.y * fy, angle: fa(b.angle) })),
    holes: src.holes.map(h => ({ ...h, y: h.y * fy })),
    arrows: src.arrows.map(a => ({ ...a, y: a.y * fy, angle: fa(a.angle) })),
    honey: src.honey.map(h => ({ ...h, y: h.y * fy })),
    mushrooms: src.mushrooms.map(m => ({ ...m, y: m.y * fy })),
    logs: src.logs.map(l => ({ ...l, ay: l.ay * fy, by: l.by * fy }))
  }
}

// ── Team towers ───────────────────────────────────────────────────────────

export interface TeamTower {
  side: 'player' | 'npc'
  x: number
  y: number
  radius: number
  hp: number
  maxHp: number
  /** Hit flash 0..1 (VFX only). */
  flash: number
}

/** Share of a tower's outline inside the arena. Towers are SET INTO THE
 *  BORDER: only this much of the tree bulges into the clearing and can be hit
 *  by a smasher, the rest is behind the wall. */
export const TOWER_INSIDE_SHARE = 0.45

const insideShare = (shape: ArenaShape, R: number, x: number, y: number, r: number): number => {
  const N = 96
  let n = 0
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    if (sdf(shape, x + Math.cos(a) * r, y + Math.sin(a) * r, R) < 0) n++
  }
  return n / N
}

/** Tower centre: on the y axis at the team's own wall (player bottom, NPC
 *  top), slid along the axis until TOWER_INSIDE_SHARE of its outline is inside
 *  the arena. Bisection on the shape's SDF, so it fits every clearing shape
 *  whatever the wall's curvature there. */
export const towerPosition = (
  side: 'player' | 'npc', arenaRadius: number, towerRadius = 0, shape: ArenaShape = 'circle'
): { x: number; y: number } => {
  const dir = side === 'player' ? 1 : -1
  let lo = 0
  let hi = arenaRadius * 1.5
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (sdf(shape, 0, dir * m, arenaRadius) <= 0) lo = m
    else hi = m
  }
  if (towerRadius <= 0) return { x: 0, y: dir * lo }
  // Slide outward until the inside share drops to the target.
  let inner = lo - towerRadius
  let outer = lo + towerRadius
  for (let i = 0; i < 30; i++) {
    const m = (inner + outer) / 2
    if (insideShare(shape, arenaRadius, 0, dir * m, towerRadius) > TOWER_INSIDE_SHARE) inner = m
    else outer = m
  }
  return { x: 0, y: dir * ((inner + outer) / 2) }
}

export const createTower = (
  side: 'player' | 'npc', arenaRadius: number, bladeRadius: number, teamMaxHp: number,
  shape: ArenaShape = 'circle'
): TeamTower => {
  const radius = Math.round(bladeRadius * TOWER_RADIUS_MUL)
  const p = towerPosition(side, arenaRadius, radius, shape)
  const maxHp = Math.max(1, Math.round(teamMaxHp * TOWER_HP_RATIO))
  return { side, x: p.x, y: p.y, radius, hp: maxHp, maxHp, flash: 0 }
}

/** Damage of one blade → tower contact (static target: defense 1, the
 *  tower's weight cancels out — the hit is the blade's closing speed along
 *  the contact normal × its damage multiplier). */
export const towerHitDamage = (closingSpeed: number, damageMultiplier: number, damageScale: number): number =>
  Math.max(0, closingSpeed) * damageMultiplier * damageScale * TOWER_DAMAGE_MUL

/** Game result with towers: a side loses when all its smashers are dead OR
 *  its tower falls. The player wins ties (matches the legacy all-dead rule). */
export const decideResult = (
  playerAlive: number, npcAlive: number, playerTowerDown: boolean, npcTowerDown: boolean,
  /** Who takes a SIMULTANEOUS loss (both teams wiped / both towers down on
   *  the same tick). Must be a side both PvP clients agree on — each client
   *  calls its own team 'player', so a fixed 'player' default would make
   *  BOTH clients win. Campaign keeps the player-favouring default. */
  tieWinner: 'player' | 'npc' = 'player'
): 'win' | 'lose' | null => {
  const npcLost = npcAlive === 0 || npcTowerDown
  const playerLost = playerAlive === 0 || playerTowerDown
  if (!npcLost && !playerLost) return null
  if (npcLost && playerLost) return tieWinner === 'player' ? 'win' : 'lose'
  return npcLost ? 'win' : 'lose'
}

// ── Ground effects (per blade, per physics substep) ───────────────────────

export interface GroundBlade {
  x: number
  y: number
  vx: number
  vy: number
  accelFramesLeft: number
}

export interface GroundState {
  /** Sim-clock ms at which this blade's next boost is allowed. */
  boostReadyAt: number
  /** Boosts taken during the current launch (boosters, arrows, mushrooms). */
  boosts: number
  /** Launched from inside a deep hole: the hole ignores it until it leaves. */
  holeExempt: boolean
}

export const newGroundState = (): GroundState => ({ boostReadyAt: 0, boosts: 0, holeExempt: false })

/** True when the point lies within a deep hole's stop core. */
export const inDeepCore = (layout: TerrainLayout, x: number, y: number): boolean => {
  for (const h of layout.holes) {
    if (!h.deep) continue
    const r = h.radius * DEEP_CORE_RATIO
    const dx = x - h.x
    const dy = y - h.y
    if (dx * dx + dy * dy <= r * r) return true
  }
  return false
}

/** Effect flags of one applyGround call (for VFX/SFX hooks). */
export interface GroundEffect {
  boosted: boolean
  stopped: boolean
  inMud: boolean
  /** Turned by a leaf arrow (also sets `boosted` when it sped up). */
  steered?: boolean
  inHoney?: boolean
}

const boostReady = (gs: GroundState, now: number): boolean =>
  gs.boosts < BOOSTER_MAX_PER_LAUNCH && now >= gs.boostReadyAt

const spendBoost = (gs: GroundState, now: number): void => {
  gs.boosts++
  gs.boostReadyAt = now + BOOSTER_COOLDOWN_MS
}

/** Booster speed law: ×mul, never above max(cur, maxSpeed × cap). */
const boostedSpeed = (cur: number, mul: number, maxSpeed: number): number =>
  Math.min(cur * mul, Math.max(cur, maxSpeed * BOOSTER_CAP_RATIO))

/**
 * Applies boosters, leaf arrows, mud, honey and deep holes to one blade.
 * `maxSpeed` is the blade's own max launch speed; `now` is the sim clock.
 * Never adds speed to a resting blade and never traps one: a deep hole only
 * removes velocity, mud / honey only scale it down (a slowed blade still
 * comes to rest → the turn ends), and a blade launched from inside a deep
 * hole is exempt until it rolls out.
 */
export const applyGround = (
  layout: TerrainLayout, blade: GroundBlade, gs: GroundState, maxSpeed: number, now: number, out: GroundEffect
): GroundEffect => {
  out.boosted = false
  out.stopped = false
  out.inMud = false
  out.steered = false
  out.inHoney = false
  if (gs.holeExempt && !inDeepCore(layout, blade.x, blade.y)) gs.holeExempt = false
  // The launch ramp is never interfered with.
  if (blade.accelFramesLeft > 0) return out
  const spd = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
  if (spd <= 0) return out

  for (const h of layout.holes) {
    const dx = blade.x - h.x
    const dy = blade.y - h.y
    const d2 = dx * dx + dy * dy
    if (h.deep) {
      const r = h.radius * DEEP_CORE_RATIO
      if (d2 <= r * r && !gs.holeExempt) {
        blade.vx = 0
        blade.vy = 0
        out.stopped = true
        return out
      }
    } else if (d2 <= h.radius * h.radius) {
      blade.vx *= MUD_KEEP
      blade.vy *= MUD_KEEP
      out.inMud = true
    }
  }
  for (const h of layout.honey) {
    const dx = blade.x - h.x
    const dy = blade.y - h.y
    if (dx * dx + dy * dy <= h.radius * h.radius) {
      blade.vx *= HONEY_KEEP
      blade.vy *= HONEY_KEEP
      out.inHoney = true
    }
  }

  if (boostReady(gs, now)) {
    for (const b of layout.boosters) {
      const dx = blade.x - b.x
      const dy = blade.y - b.y
      if (dx * dx + dy * dy > b.radius * b.radius) continue
      const cur = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
      const target = boostedSpeed(cur, BOOSTER_MUL, maxSpeed)
      if (target > cur && cur > 0) {
        const k = target / cur
        blade.vx *= k
        blade.vy *= k
        out.boosted = true
      }
      spendBoost(gs, now)
      return out
    }
    for (const a of layout.arrows) {
      const dx = blade.x - a.x
      const dy = blade.y - a.y
      if (dx * dx + dy * dy > a.radius * a.radius) continue
      const cur = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
      if (cur > 0) {
        const hx = blade.vx / cur + ARROW_TURN * Math.cos(a.angle)
        const hy = blade.vy / cur + ARROW_TURN * Math.sin(a.angle)
        const hl = Math.sqrt(hx * hx + hy * hy) // ≥ ARROW_TURN − 1 > 0
        const target = boostedSpeed(cur, ARROW_MUL, maxSpeed)
        blade.vx = (hx / hl) * target
        blade.vy = (hy / hl) * target
        out.steered = true
        out.boosted = target > cur
      }
      spendBoost(gs, now)
      return out
    }
  }
  return out
}

// ── Solids: mushroom caps + logs (per blade, per physics substep) ─────────

export interface SolidBlade {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export interface SolidEffect {
  /** Bounced off a solid this substep. */
  bounced: boolean
  /** The bounce was a mushroom kick (extra restitution). */
  kicked: boolean
  /** Contact point (VFX). */
  hitX: number
  hitY: number
}

export const newSolidEffect = (): SolidEffect => ({ bounced: false, kicked: false, hitX: 0, hitY: 0 })

/** Closest point of a log's axis segment to (x, y). */
export const logClosest = (l: TerrainLog, x: number, y: number): { x: number; y: number } => {
  const sx = l.bx - l.ax
  const sy = l.by - l.ay
  const len2 = sx * sx + sy * sy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - l.ax) * sx + (y - l.ay) * sy) / len2)) : 0
  return { x: l.ax + sx * t, y: l.ay + sy * t }
}

/**
 * Mushroom caps and logs: push the blade out of the solid along the contact
 * normal and reflect the inbound velocity. A mushroom kicks (×MUSHROOM_MUL,
 * capped like a booster) while the blade's shared boost budget lasts, a plain
 * dull bounce (×SOLID_KEEP) afterwards; a log always dulls. So a blade can
 * gain energy at most BOOSTER_MAX_PER_LAUNCH times per launch — no endless
 * pinball between a cap and a wall — and every solid only ever pushes out.
 */
export const collideSolids = (
  layout: TerrainLayout, blade: SolidBlade, gs: GroundState, maxSpeed: number, now: number, out: SolidEffect
): SolidEffect => {
  out.bounced = false
  out.kicked = false
  const hit = (cx: number, cy: number, r: number, mushroom: boolean) => {
    const dx = blade.x - cx
    const dy = blade.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const min = blade.radius + r
    if (dist >= min || dist < 0.01) return
    const nx = dx / dist
    const ny = dy / dist
    blade.x += nx * (min - dist)
    blade.y += ny * (min - dist)
    const dot = blade.vx * nx + blade.vy * ny
    if (dot >= 0) return
    let rx = blade.vx - 2 * dot * nx
    let ry = blade.vy - 2 * dot * ny
    const cur = Math.sqrt(rx * rx + ry * ry)
    let k = SOLID_KEEP
    if (mushroom && boostReady(gs, now)) {
      k = cur > 0 ? boostedSpeed(cur, MUSHROOM_MUL, maxSpeed) / cur : 1
      spendBoost(gs, now)
      out.kicked = true
    }
    rx *= k
    ry *= k
    blade.vx = rx
    blade.vy = ry
    out.bounced = true
    out.hitX = cx + nx * r
    out.hitY = cy + ny * r
  }
  for (const m of layout.mushrooms) hit(m.x, m.y, m.radius, true)
  for (const l of layout.logs) {
    const c = logClosest(l, blade.x, blade.y)
    hit(c.x, c.y, l.radius, false)
  }
  return out
}

/** Every circle a terrain feature occupies (islands, boosters, holes, arrows,
 *  honey, mushrooms, and each log as a chain of discs along its axis). */
export const terrainCircles = (layout: TerrainLayout): { x: number; y: number; radius: number }[] => {
  const out: { x: number; y: number; radius: number }[] = [
    ...layout.islands, ...layout.boosters, ...layout.holes, ...layout.arrows, ...layout.honey, ...layout.mushrooms
  ]
  for (const l of layout.logs) {
    const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
    const n = Math.max(1, Math.ceil(len / l.radius))
    for (let i = 0; i <= n; i++) {
      out.push({ x: l.ax + ((l.bx - l.ax) * i) / n, y: l.ay + ((l.by - l.ay) * i) / n, radius: l.radius })
    }
  }
  return out
}

/** Solid features (islands, mushrooms, logs) as circles — for line-of-sight
 *  and placement checks. */
export const terrainSolidCircles = (layout: TerrainLayout): { x: number; y: number; radius: number }[] => {
  const out: { x: number; y: number; radius: number }[] = [...layout.islands, ...layout.mushrooms]
  for (const l of layout.logs) {
    const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
    const n = Math.max(1, Math.ceil(len / l.radius))
    for (let i = 0; i <= n; i++) {
      out.push({ x: l.ax + ((l.bx - l.ax) * i) / n, y: l.ay + ((l.by - l.ay) * i) / n, radius: l.radius })
    }
  }
  return out
}
