// ─── Arena THEMES (biomes) ───────────────────────────────────────────────────
//
// Every arena is dressed by exactly ONE theme. A theme owns
//  · its clearing floor — painted variants (paintedFloors.ts, keyed
//    `<theme>-<n>`; arenaFloorArt.ts) with a procedural fallback tinted by
//    THEME_LOOK[theme].floor,
//  · the backdrop around the clearing — a painted seamless tile
//    (arenaBackdrop.ts PAINTED_BACKDROPS) over THEME_LOOK[theme].backdrop,
//  · its OWN prop set (arenaProps.ts PROP_KINDS — every kind belongs to one
//    theme, so props never mix: no toy in a meadow, no fir on a lava plain).
//
// The mapping is deliberate, not random (themeFor):
//  · the dedicated arena types keep their identity —
//      forest → woodland  (deep old forest: spruce, birch, stumps, toadstools)
//      lava   → volcanic  (a long-COOLED volcanic plain: basalt, cooled lava
//                          rock, charred trees — no embers, no glow)
//      ice    → snowy     (snowfield: snowy firs, ice boulders, drifts)
//      boss   → ruins     (dusk heath with ancient ruins + rifts: the boss
//                          fight is staged somewhere older and stranger)
//  · the plain 'default' arena rotates three biomes by LAYOUT, following the
//    layout's own design (DEFAULT_THEME_BY_LAYOUT below):
//      bedroom — the toy-box group: every 7th layout from 6 (the first one is
//                campaign stage 7, after four meadows and the first boss);
//      rocky   — layouts the designer gave stony ground ('pebbles' / 'cones'
//                decor: ledges, peaks, rocks, brooks, dens) — except Mud
//                Hollow (1), whose painted floor is a trodden meadow;
//      snowy   — Snowy Clearing (12), a snow layout even on the plain arena;
//      meadow  — everything else (grass, flowers, ponds, groves).
//
// Purely decorative: nothing here is read by physics, RNG or the PvP state hash.
import type { DecorKind } from '@/use/arenaTerrain'
import type { ArenaType } from '@/use/useSpinnerCampaign'

export type ArenaTheme = 'meadow' | 'woodland' | 'rocky' | 'snowy' | 'volcanic' | 'ruins' | 'bedroom'

export const ARENA_THEME_IDS: readonly ArenaTheme[] = ['meadow', 'woodland', 'rocky', 'snowy', 'volcanic', 'ruins', 'bedroom']

/** Dedicated arena types → their theme. */
export const THEME_BY_ARENA_TYPE: Readonly<Record<Exclude<ArenaType, 'default'>, ArenaTheme>> = {
  forest: 'woodland',
  lava: 'volcanic',
  ice: 'snowy',
  boss: 'ruins'
}

const M = 'meadow' as const
const R = 'rocky' as const
const B = 'bedroom' as const
const S = 'snowy' as const

/** The plain arena's theme per terrain layout (arenaTerrain.ts LAYOUTS order). */
export const DEFAULT_THEME_BY_LAYOUT: readonly ArenaTheme[] = [
  M, // 0 mossyGlade
  M, // 1 mudHollow — painted as a trodden meadow
  M, // 2 twinIslands
  M, // 3 fernHollow
  M, // 4 mushroomRing
  M, // 5 beaverDam
  B, // 6 lilyPond — toy box
  M, // 7 acornAlley
  M, // 8 brambleMaze
  R, // 9 waterfallLedge — pebbles
  R, // 10 pineconePeak — cones, a peak
  M, // 11 honeyGrove
  S, // 12 snowyClearing — snow
  B, // 13 badgerBurrow — toy box
  M, // 14 owlHollow
  M, // 15 bluebellDell
  M, // 16 fireflyMeadow
  M, // 17 hedgehogHill
  M, // 18 willowBend
  M, // 19 foxgloveField
  B, // 20 berryPatch — toy box
  M, // 21 squirrelStash
  R, // 22 mossyRocks — pebbles
  M, // 23 cloverCrossing
  M, // 24 toadstoolCorner
  M, // 25 riverbank
  M, // 26 bumblebeeBower
  B, // 27 sunnySlope — toy box
  M, // 28 thistleThicket
  M, // 29 oldOakRoots
  R, // 30 puddleLane — pebbles
  M, // 31 logJam
  M, // 32 autumnLeaves
  M, // 33 frogHopMarsh
  B, // 34 rabbitWarren — toy box
  M, // 35 daisyChain
  M, // 36 mistyGlen
  M, // 37 logHideout
  R, // 38 stonyBrook — pebbles
  M, // 39 chestnutCorner
  M, // 40 moonlitGlade
  B, // 41 dandelionDrift — toy box
  M, // 42 birchGrove
  M, // 43 robinsRest
  M, // 44 elderberryEdge
  M, // 45 cattailCreek
  R, // 46 bearDen — pebbles
  M, // 47 sapSpring
  B, // 48 rainbowRidge — toy box
  M // 49 ancientGrove
]

/** The theme that dresses an arena of `arenaType` on terrain layout `layoutId`
 *  (null = no layout: the plain meadow). */
export const themeFor = (arenaType: ArenaType, layoutId: number | null): ArenaTheme => {
  if (arenaType !== 'default') return THEME_BY_ARENA_TYPE[arenaType]
  if (layoutId === null) return 'meadow'
  const n = DEFAULT_THEME_BY_LAYOUT.length
  return DEFAULT_THEME_BY_LAYOUT[((layoutId % n) + n) % n]!
}

// ── Floors ─────────────────────────────────────────────────────────────────
/** Planned floor variants per theme, and the rotation offset that gives the
 *  theme's FIRST campaign stage variant 0 (painted first): meadow L0 (stage 1),
 *  rocky L22 (23), bedroom L6 (7), snowy L12 (13), volcanic L11 (12),
 *  woodland L5 (6), ruins L4 (5). Guarded by tests/arenaProps.test.ts. */
export const FLOOR_PLAN: Readonly<Record<ArenaTheme, { variants: number, offset: number }>> = {
  meadow: { variants: 4, offset: 0 },
  rocky: { variants: 3, offset: 2 },
  bedroom: { variants: 3, offset: 0 },
  snowy: { variants: 3, offset: 0 },
  volcanic: { variants: 3, offset: 1 },
  woodland: { variants: 3, offset: 1 },
  ruins: { variants: 3, offset: 2 }
}

/** Floor key (`<theme>-<n>`, PAINTED_FLOORS) of a layout in a theme. */
export const floorKeyFor = (theme: ArenaTheme, layoutId: number | null): string => {
  const p = FLOOR_PLAN[theme]
  const id = layoutId ?? 0
  return `${theme}-${(((id + p.offset) % p.variants) + p.variants) % p.variants}`
}

// ── Procedural look (fallbacks) ──────────────────────────────────────────────
export interface FloorPalette { rim: string, base: string, light: string, ring: string, tuft: string, flower: string }

export interface ThemeLook {
  /** Procedural clearing floor (until / unless the painted floor shows). */
  floor: FloorPalette
  /** Floor decor of the procedural floor: 'layout' = the layout's own kind. */
  decor: DecorKind | 'layout' | null
  /** Flat backdrop fill under (or instead of) the painted tile. */
  backdrop: string
}

export const THEME_LOOK: Readonly<Record<ArenaTheme, ThemeLook>> = {
  meadow: {
    floor: { rim: '#4f8f3e', base: '#7cc05c', light: '#8fcd6b', ring: '#6aad4f', tuft: '#4f9a3c', flower: '#fff27a' },
    decor: 'layout',
    backdrop: '#4f7d45'
  },
  woodland: {
    floor: { rim: '#2f6b33', base: '#4e9a4e', light: '#5aa957', ring: '#428a44', tuft: '#2f7334', flower: '#ffd36b' },
    decor: 'layout',
    backdrop: '#3f6a3c'
  },
  rocky: {
    floor: { rim: '#7a6a48', base: '#c2a87a', light: '#cdb68a', ring: '#b39b6e', tuft: '#a08a5e', flower: '#e8dcc0' },
    decor: 'pebbles',
    backdrop: '#8a8358'
  },
  snowy: {
    floor: { rim: '#8fb8d6', base: '#d6ebf7', light: '#e4f2fb', ring: '#bcd8ec', tuft: '#a9cbe3', flower: '#ffffff' },
    decor: 'snow',
    backdrop: '#b9cbd8'
  },
  volcanic: {
    floor: { rim: '#4d3a2f', base: '#8a7466', light: '#977f70', ring: '#7a6658', tuft: '#5e4c40', flower: '#c9b8a6' },
    decor: 'pebbles',
    backdrop: '#5e5149'
  },
  ruins: {
    floor: { rim: '#4a2523', base: '#7a443c', light: '#875047', ring: '#6a3832', tuft: '#5a2c28', flower: '#ff8a6b' },
    decor: 'pebbles',
    backdrop: '#6b4a40'
  },
  bedroom: {
    floor: { rim: '#a8774c', base: '#e8d9bf', light: '#efe3cc', ring: '#dccaa8', tuft: '#cdb894', flower: '#bcd6ea' },
    decor: null,
    backdrop: '#a8774c'
  }
}

// ── Obstacles (solid terrain features) per theme ─────────────────────────────
// A mushroom on an ice field makes no sense (owner, 2026-10-22): every theme
// dresses the solid kinds in a look that belongs there. VISUAL ONLY — the
// feature's kind, radius and bounce (a mushroom-kind igloo still kicks like
// a mushroom cap) never change. 'plain' = the kind's own drawing
// (TERRAIN_FEATURE_DRAW, painted terrain atlas). Disc looks are painted in two
// 3 × 3 atlases (tools/terrain-sheets, sets obstacles-a / obstacles-b);
// logs keep a procedural themed drawing.
export type SolidKind = 'stump' | 'rock' | 'pond' | 'mushroom' | 'log'
export const OBSTACLE_LOOKS_A = ['igloo', 'snowStump', 'iceBoulder', 'frozenPond', 'charredStump', 'basaltRock', 'cooledLavaPool', 'lavaDome', 'boulder'] as const
export const OBSTACLE_LOOKS_B = ['brokenColumn', 'stoneBlock', 'ruinWell', 'runeDome', 'blockStack', 'cushion', 'toyPool', 'toyDrum', 'mossDome'] as const
export type DiscLook = typeof OBSTACLE_LOOKS_A[number] | typeof OBSTACLE_LOOKS_B[number]
export type LogLook = 'snowLog' | 'charredLog' | 'fallenColumn' | 'toyPlank'
export type ObstacleLook = 'plain' | DiscLook | LogLook

export const OBSTACLE_LOOK: Readonly<Record<ArenaTheme, Readonly<Record<SolidKind, ObstacleLook>>>> = {
  meadow: { stump: 'plain', rock: 'plain', pond: 'plain', mushroom: 'plain', log: 'plain' },
  woodland: { stump: 'plain', rock: 'plain', pond: 'plain', mushroom: 'plain', log: 'plain' },
  rocky: { stump: 'boulder', rock: 'plain', pond: 'plain', mushroom: 'mossDome', log: 'plain' },
  snowy: { stump: 'snowStump', rock: 'iceBoulder', pond: 'frozenPond', mushroom: 'igloo', log: 'snowLog' },
  volcanic: { stump: 'charredStump', rock: 'basaltRock', pond: 'cooledLavaPool', mushroom: 'lavaDome', log: 'charredLog' },
  ruins: { stump: 'brokenColumn', rock: 'stoneBlock', pond: 'ruinWell', mushroom: 'runeDome', log: 'fallenColumn' },
  bedroom: { stump: 'blockStack', rock: 'cushion', pond: 'toyPool', mushroom: 'toyDrum', log: 'toyPlank' }
}
