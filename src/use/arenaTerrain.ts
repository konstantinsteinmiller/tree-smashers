import { sdf, TERRAIN_SHAPES, type ArenaShape } from '@/use/arenaShapes'
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
//  · islands  (stump / rock / pond) — static discs, a wall-like ricochet;
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
// ── Tree tuning (tower pass 2026-10, roadmap "Tree towers: a real objective")
// Measured with scripts/balance-sim.mjs camp (tools/balance-sim/towerstats.mjs,
// tunings tw-*.json): before, felling the tree was the easy route — a
// "tree rush" policy (aim at the tree 70 % of launches) beat brawling on
// normal stages (80 vs 74 %) and above all on boss stages (38 vs 26 %, 74 %
// of rush wins by the tree; 39 % of all boss wins came from the tree). Now:
// every tree 0.75 × team HP (was 0.6); the boss's tree × 1.5 on top and
// spiked; the player's own tree × 1.3 on a boss stage; the campaign boss
// blade's HP × 1.75 (was 2, CAMPAIGN_NPC_TUNING.bossHpMul) so the knock-out
// route gives back what the tree route lost. A lone boss's tree has
// 0.75·1.5·1.75 / (0.6·2) = 1.64 × its old HP. Boss stages (16 seeds): brawl
// 26 → 27 %, rush 38 → 24 % (the tree still decides a third of rush wins).

/** Tower HP = this × the team's total blade max HP at spawn (both sides,
 *  every mode — campaign, ghost, league, PvP). Was 0.6. */
export const TOWER_HP_RATIO = 0.75
/** Boss stages: the BOSS's tree gets this × its normal HP on top (the boss
 *  blade's own HP, CAMPAIGN_NPC_TUNING.bossHpMul, already counts into the
 *  team HP). */
export const BOSS_TOWER_HP_MUL = 1.5
/** Boss stages: the PLAYER's tree gets this × its normal HP (the boss AI
 *  rushes it too; keeps a boss fight about the fight, both ways). */
export const BOSS_STAGE_OWN_TREE_HP_MUL = 1.3
/** Spiked front cover: share of a damaging hit's impact damage (before Tower
 *  Breaker's bonus) that pricks the attacker. Owner's number. */
export const TOWER_SPIKE_RECOIL = 0.15
/** Which trees wear the spiked front cover: 'boss' = the boss's tree on a
 *  boss stage only, 'all' = every tree (both sides, every mode), 'none'. */
export type TowerSpikeRule = 'boss' | 'all' | 'none'
export const TOWER_SPIKES: TowerSpikeRule = 'boss'
/** Live tower tuning (the shipped values above; the balance sim overrides it
 *  in place — tests/balance.sim.test.ts BALANCE_TUNING). Read at createTower
 *  and on every tower hit, never cached. */
export const TOWER_TUNING: { hpRatio: number; bossHpMul: number; ownBossStageHpMul: number; spikeRecoil: number; spikes: TowerSpikeRule } = {
  hpRatio: TOWER_HP_RATIO,
  bossHpMul: BOSS_TOWER_HP_MUL,
  ownBossStageHpMul: BOSS_STAGE_OWN_TREE_HP_MUL,
  spikeRecoil: TOWER_SPIKE_RECOIL,
  spikes: TOWER_SPIKES
}
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

/** At most this many solid obstacles (islands, mushrooms, logs) per arena.
 *  The terrain solids are the arena's ONLY floor obstacles (no bumpers). */
export const MAX_SOLID_OBSTACLES = 2
/** The rare centre barrier: one bigger island to fling around. Capped so the
 *  spawn rows stay clear. */
const BIG_ISLAND_R = 22

/**
 * Obstacles are a RARE feature (owner, 2026-10-22). Per layout (= campaign
 * stage − 1): most clearings are open; every 4th has ONE obstacle (never in
 * the middle); every 9th has TWO (the outermost mirrored pair); every 12th
 * (offset) has one bigger centre island instead.
 */
export const solidBudgetFor = (id: number): { count: 0 | 1 | 2, bigCentre: boolean } => {
  if (id % 9 === 8) return { count: 2, bigCentre: false }
  if (id % 12 === 6) return { count: 1, bigCentre: true }
  if (id % 4 === 3) return { count: 1, bigCentre: false }
  return { count: 0, bigCentre: false }
}

/** The central lane a non-centre obstacle must leave clear: |x| - r >= this
 *  (the largest disc, 1.35 x the 28 blade radius, passes down the middle). */
export const CENTRE_LANE_HALF = 38

type SolidSet = Pick<TerrainLayout, 'islands' | 'mushrooms' | 'logs'>
type FloorSet = Pick<TerrainLayout, 'boosters' | 'holes' | 'arrows' | 'honey'>
/** Nearest |x| of an obstacle's footprint edge (0 if it spans x = 0). */
const laneEdge = (x0: number, x1: number, r: number): number =>
  (x0 <= 0 && x1 >= 0 ? 0 : Math.min(Math.abs(x0), Math.abs(x1))) - r

/** Every spawn the engine can produce on a terrain arena (R 200, the largest
 *  disc 38, NPC jitter box ±11.2) — see tests/arenaLayouts.test.ts. */
const SPAWN_BOXES: readonly [number, number, number][] = [
  ...[1, 2, 3, 4].flatMap(n => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (i / (n - 1) - 0.5) * 140))
    .flatMap(x => [[x, 80, 0], [x, -80, 0]] as [number, number, number][])),
  ...([[0, -0.4], [-0.4, -0.4], [0.4, -0.4], [-0.4, -0.55], [0.4, -0.55], [0, -0.3], [-0.4, -0.65], [0.4, -0.65], [-0.4, -0.3], [0.4, -0.3]]
    .map(([x, y]) => [x! * 200, y! * 200, 11.2] as [number, number, number]))
]
const clearOfSpawns = (d: TerrainDisc): boolean => [d.y].every(y => SPAWN_BOXES.every(([sx, sy, j]) => {
  const nx = Math.max(sx - j, Math.min(sx + j, d.x))
  const ny = Math.max(sy - j, Math.min(sy + j, y))
  return Math.hypot(d.x - nx, y - ny) >= d.radius + 38 + 6
}))

const logDiscs = (l: TerrainLog): TerrainDisc[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(l.bx - l.ax, l.by - l.ay) / l.radius))
  return Array.from({ length: n + 1 }, (_, i) => ({ x: l.ax + ((l.bx - l.ax) * i) / n, y: l.ay + ((l.by - l.ay) * i) / n, radius: l.radius }))
}

const capSolids = (id: number, f: SolidSet, floor: FloorSet): SolidSet & FloorSet => {
  const { count, bigCentre } = solidBudgetFor(id)
  if (bigCentre) {
    const kind = f.islands.find(o => Math.abs(o.x) < 12)?.kind ?? f.islands[0]?.kind ?? 'stump'
    const big = I(0, 15, BIG_ISLAND_R, kind)
    // Floor features under / against the island are dropped (deterministic);
    // the rest of the layout keeps its character.
    const clear = <T extends { x: number; y: number; radius: number }>(a: T[]) =>
      a.filter(o => Math.hypot(o.x - big.x, o.y - big.y) >= o.radius + big.radius + 2)
    return {
      islands: [big], mushrooms: [], logs: [],
      boosters: clear(floor.boosters), holes: clear(floor.holes), arrows: clear(floor.arrows), honey: clear(floor.honey)
    }
  }
  const all = [
    ...f.islands.map(o => ({ edge: laneEdge(o.x, o.x, o.radius), cx: o.x, island: o as TerrainIsland | null, mush: null as TerrainDisc | null, log: null as TerrainLog | null })),
    ...f.mushrooms.map(o => ({ edge: laneEdge(o.x, o.x, o.radius), cx: o.x, island: null, mush: o, log: null })),
    ...f.logs.map(o => ({ edge: laneEdge(Math.min(o.ax, o.bx), Math.max(o.ax, o.bx), o.radius), cx: (o.ax + o.bx) / 2, island: null, mush: null, log: o }))
  ]
  // outermost first and never in the central lane: an obstacle in the middle
  // of the clearing blocks the main lane, so only side ones are kept
  const keep = all.filter(o => o.edge >= CENTRE_LANE_HALF)
    .sort((p, q) => Math.abs(q.cx) - Math.abs(p.cx) || p.cx - q.cx).slice(0, count)
  // A layout whose only solids sit in the middle: move its innermost solid
  // (same kind, radius capped) out to a free side spot, so the schedule holds.
  const src = all.filter(o => !keep.includes(o)).sort((p, q) => Math.abs(p.cx) - Math.abs(q.cx) || p.cx - q.cx)[0]
    ?? { edge: 0, cx: 0, island: I(0, 15, 14, 'stump') as TerrainIsland | null, mush: null as TerrainDisc | null, log: null as TerrainLog | null }
  if (keep.length < count) {
    const shape = TERRAIN_SHAPES[id % TERRAIN_SHAPES.length]!
    const placed = keep.flatMap(o => (o.log ? logDiscs(o.log) : [(o.island ?? o.mush)!]))
    const others = [...floor.boosters, ...floor.holes, ...floor.arrows, ...floor.honey]
    const need = count - keep.length
    const signs = need === 2 ? [-1, 1] : [keep[0] ? -Math.sign(keep[0].cx) || 1 : id % 2 ? 1 : -1]
    const r = Math.min(14, (src.island ?? src.mush ?? src.log)!.radius)
    const fits = (d: TerrainDisc) => sdf(shape, d.x, d.y, 200) <= -(d.radius + 6) && sdf(shape, d.x, -d.y, 200) <= -(d.radius + 6)
      && [...others, ...placed].every(o => Math.hypot(o.x - d.x, o.y - d.y) >= o.radius + d.radius + 4)
      && Math.abs(d.x) - d.radius >= CENTRE_LANE_HALF && clearOfSpawns(d)
    // mirrored pairs share one spot (x ↔ −x), so a pair is always symmetric
    search: for (const y of [15, -5, 35, -20, 50, -35, 65]) for (let ax = 160; ax >= CENTRE_LANE_HALF + r; ax--) {
      const cands = signs.map(sign => {
        const x = sign * ax
        return src.log ? { x, disc: null, log: G(x, y - 15, x, y + 15, Math.min(9, r)) } : { x, disc: { x, y, radius: r }, log: null }
      })
      if (!cands.every(c => (c.log ? logDiscs(c.log) : [c.disc!]).every(fits))) continue
      for (const c of cands) {
        keep.push({ edge: ax - r, cx: c.x, island: src.island && c.disc ? { ...c.disc, kind: src.island.kind } : null, mush: src.mush && c.disc ? c.disc : null, log: c.log })
      }
      break search
    }
  }
  return {
    ...floor,
    islands: keep.flatMap(o => (o.island ? [o.island] : [])),
    mushrooms: keep.flatMap(o => (o.mush ? [o.mush] : [])),
    logs: keep.flatMap(o => (o.log ? [o.log] : []))
  }
}

/**
 * Spread the floor hazards (boosters, pot holes, leaf arrows, honey) over the clearing
 * (owner 2026-10-23): the hand-authored layouts put nearly all of them on the middle
 * line (y ≈ 15), so every arena played like a horizontal corridor. Each feature keeps
 * its authored column (± a little) but gets a deterministic random HEIGHT (seeded by the
 * layout key, so both PvP peers and every run agree), re-rolled until it sits inside the
 * clearing, clear of every spawn box, solid obstacle, tree row and earlier hazard; if no
 * spot is found it keeps the authored one.
 */
const SPREAD_Y = 105
const SPREAD_X_JITTER = 36
const spreadFloor = (id: number, key: string, l: SolidSet & FloorSet): SolidSet & FloorSet => {
  let s = 0x9e3779b9
  for (let i = 0; i < key.length; i++) s = Math.imul(s ^ key.charCodeAt(i), 16777619) >>> 0
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const shape = TERRAIN_SHAPES[id % TERRAIN_SHAPES.length]!
  const solids: TerrainDisc[] = [
    ...l.islands, ...l.mushrooms, ...l.logs.flatMap(logDiscs)
  ]
  const placed: TerrainDisc[] = []
  // Features not re-placed yet still stand where they were authored: a moved one must keep
  // clear of those too, or it can land on a neighbour that then stays put.
  const pending = new Set<TerrainDisc>([...l.boosters, ...l.holes, ...l.arrows, ...l.honey])
  const free = (d: TerrainDisc): boolean =>
    sdf(shape, d.x, d.y, 200) <= -(d.radius + 8) && sdf(shape, d.x, -d.y, 200) <= -(d.radius + 8)
    && clearOfSpawns(d)
    && solids.every(o => Math.hypot(o.x - d.x, o.y - d.y) >= o.radius + d.radius + 6)
    && placed.every(o => Math.hypot(o.x - d.x, o.y - d.y) >= o.radius + d.radius + 10)
    && [...pending].every(o => Math.hypot(o.x - d.x, o.y - d.y) >= o.radius + d.radius + 10)
  const move = <T extends TerrainDisc>(f: T): T => {
    pending.delete(f)
    for (let n = 0; n < 60; n++) {
      // Half the tries stay near the authored column, half roam the full width: the spawn
      // rows block the middle of the clearing, so the roaming ones reach the open flanks.
      const x = rnd() < 0.5
        ? Math.max(-170, Math.min(170, f.x + (rnd() - 0.5) * 2 * SPREAD_X_JITTER))
        : (rnd() * 2 - 1) * 170
      const y = (rnd() * 2 - 1) * SPREAD_Y
      const cand = { ...f, x, y }
      if (free(cand)) {
        placed.push(cand)
        return cand
      }
    }
    placed.push(f)
    return f
  }
  return {
    ...l,
    boosters: l.boosters.map(move),
    holes: l.holes.map(move),
    arrows: l.arrows.map(move),
    honey: l.honey.map(move)
  }
}

const LAYOUTS: readonly TerrainLayout[] = DEF.map(([key, theme, f], id) => ({
  id,
  nameKey: `terrain.layout.${key}`,
  theme,
  ...spreadFloor(id, key, capSolids(id, { islands: f.islands ?? [], mushrooms: f.mushrooms ?? [], logs: f.logs ?? [] },
    { boosters: f.boosters ?? [], holes: f.holes ?? [], arrows: f.arrows ?? [], honey: f.honey ?? [] }))
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
  /** Wears the spiked front cover: an enemy hit on its front pricks the
   *  attacker for TOWER_TUNING.spikeRecoil × the impact (towerSpikeRecoil). */
  spiked: boolean
}

/** Legacy share of a tower's outline inside the arena (the trees used to be
 *  SET INTO THE BORDER, 45 % bulging into the clearing): the furthest OUT a
 *  tree may still stand (towerPosition). */
export const TOWER_INSIDE_SHARE = 0.45

/** Trees stand INSIDE the clearing (owner 2026-10-22: "move the player tree
 *  more inside the arena, so that it doesn't look so out of the arena"): the
 *  tree's whole collision outline sits this many arena units inside the wall,
 *  its back just touching it (no lane behind it, no border gap at it). Both
 *  sides alike, every clearing shape. */
export const TOWER_WALL_GAP = 1

/** Trees per side, campaign only (owner 2026-10-22): about 64 % of stages
 *  one tree, 28 % two, 8 % three — all of a side's trees must fall to win by
 *  trees. */
export const MAX_TREES_PER_SIDE = 3
/** Cumulative thresholds of the seeded tree count (one, two; else three). */
export const TREE_COUNT_ODDS: readonly [number, number] = [0.64, 0.92]
/** The tutorial arc (stages 1–5, the first boss at 5) keeps one tree. */
export const MULTI_TREES_FROM_STAGE = 6
/** Tree radius × this per tree count (several trees share the wall). */
export const TREE_COUNT_RADIUS_MUL: readonly number[] = [1, 0.85, 0.75]
/** Each tree's HP share of the single-tree HP per tree count (in total 1,
 *  1.1, 1.2 × — the extra trees are smaller targets too). Balance-sim
 *  pending (roadmap "Batched balance simulations"). */
export const TREE_COUNT_HP_SHARE: readonly number[] = [1, 0.55, 0.4]
/** Minimum centre distance between two neighbouring trees of a side, × tree
 *  radius (painted sprite half width 1.2 r: the crowns do not overlap). */
export const TREE_SPACING = 2.5

/** Deterministic hash of a campaign stage id → [0, 1) (no Math.random). */
const stageUnit = (stageId: number): number => {
  let h = Math.imul(Math.floor(stageId) ^ 0x7ee5, 0x9e3779b1) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Trees per side on a campaign stage, seeded by the stage id (a stage always
 *  gives the same count; both sides get the same count). PvP, league and
 *  ghost matches stay at one tree (their seeds are shared across peers and
 *  replays; see the roadmap). */
export const treeCountForStage = (stageId: number): number => {
  if (!Number.isFinite(stageId) || stageId < MULTI_TREES_FROM_STAGE) return 1
  const u = stageUnit(stageId)
  return u < TREE_COUNT_ODDS[0] ? 1 : u < TREE_COUNT_ODDS[1] ? 2 : 3
}

const clampTreeCount = (n: number): number => Math.max(1, Math.min(MAX_TREES_PER_SIDE, Math.floor(n) || 1))

/** Tree collision radius for a blade radius and a tree count. */
export const treeRadiusFor = (bladeRadius: number, count = 1): number =>
  Math.round(bladeRadius * TOWER_RADIUS_MUL * TREE_COUNT_RADIUS_MUL[clampTreeCount(count) - 1]!)

// The two outline tests below run inside 36-step bisections, 18 tree layouts per
// arena shape (arenaProps towerKeepOut) — ~1 s of main thread per new stage on a
// desktop, several on a weak phone (#Perf-1). Both stop sampling as soon as the
// answer is decided; the samples, their order and the result are unchanged.

/** Every outline sample of a disc has SDF <= `limit` (= the largest is). */
const outlineWithin = (shape: ArenaShape, R: number, x: number, y: number, r: number, limit: number): boolean => {
  const N = 48
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    if (sdf(shape, x + Math.cos(a) * r, y + Math.sin(a) * r, R) > limit) return false
  }
  return true
}

/** More than `share` of a disc's outline samples lie inside the wall. */
const insideShareAbove = (shape: ArenaShape, R: number, x: number, y: number, r: number, share: number): boolean => {
  const N = 96
  let n = 0
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    if (sdf(shape, x + Math.cos(a) * r, y + Math.sin(a) * r, R) < 0) n++
    if (n / N > share) return true
    if ((n + N - 1 - i) / N <= share) return false
  }
  return n / N > share
}

/** The row a team launches from (initGame: y = ±0.4 R, 1–4 smashers spread
 *  over ±0.35 R). A tree never stands on it. */
const SPAWN_ROW_Y = 0.4
const SPAWN_ROW_XS: readonly number[] = [0, -0.35, 0.35, -0.35 / 3, 0.35 / 3]
/** Clearance between a tree and a row spawn of a regular disc (a bigger
 *  disc is pushed clear at spawn — useSpinnerGame settleSpawnOverlaps). */
const SPAWN_CLEAR_GAP = 2

/** A tree at angle `theta` off the team's axis (player bottom, NPC top),
 *  on that ray: as far IN as it can stand — its whole outline TOWER_WALL_GAP
 *  inside the wall — unless the team's spawn row (regular disc `disc`) needs
 *  the room; never further out than the legacy set-into-the-wall spot
 *  (TOWER_INSIDE_SHARE of the outline inside). */
/** Bisection steps per boundary search: the bracket is 1.5 R = 300 units, so
 *  24 halvings land within 2e-5 units (36 used to, at 4e-9 — half again the
 *  outline sampling for no visible or physical difference). */
const BISECT_STEPS = 24

const treeOnRay = (dir: number, theta: number, R: number, r: number, shape: ArenaShape, disc: number): { x: number; y: number } => {
  // The spread search re-asks the same rays (the axis tree, the final spread).
  const key = `${dir}:${theta}:${R}:${r}:${shape}:${disc}`
  const hit = rayCache.get(key)
  if (hit) return { ...hit }
  const p = computeTreeOnRay(dir, theta, R, r, shape, disc)
  if (rayCache.size > 65536) rayCache.clear()
  rayCache.set(key, p)
  return { ...p }
}
const rayCache = new Map<string, { x: number; y: number }>()

const computeTreeOnRay = (dir: number, theta: number, R: number, r: number, shape: ArenaShape, disc: number): { x: number; y: number } => {
  const ux = Math.sin(theta)
  const uy = dir * Math.cos(theta)
  const bis = (ok: (m: number) => boolean, lo: number, hi: number): number => {
    // ok(lo) true, ok(hi) false → the boundary.
    for (let i = 0; i < BISECT_STEPS; i++) {
      const m = (lo + hi) / 2
      if (ok(m)) lo = m
      else hi = m
    }
    return lo
  }
  const top = R * 1.5
  const mIn = bis(m => outlineWithin(shape, R, ux * m, uy * m, r, -TOWER_WALL_GAP), 0, top)
  const mLegacy = bis(m => insideShareAbove(shape, R, ux * m, uy * m, r, TOWER_INSIDE_SHARE), mIn, top)
  const need = r + disc + SPAWN_CLEAR_GAP
  const clear = (m: number): boolean => {
    for (const sx of SPAWN_ROW_XS) if (Math.hypot(ux * m - sx * R, uy * m - dir * SPAWN_ROW_Y * R) < need) return false
    return true
  }
  // Smallest m (from mIn outward) that clears the row.
  let m = mIn
  if (!clear(m)) m = clear(mLegacy) ? bis(q => !clear(q), mIn, mLegacy) + 0.01 : mLegacy
  m = Math.min(m, mLegacy)
  return { x: ux * m + 0, y: uy * m + 0 }
}

/** Every tree centre of a side: 1 on the axis, 2 either side of it, 3 = the
 *  axis plus one either side — spread until neighbours are TREE_SPACING × r
 *  apart, each standing just inside its own wall. */
export const towerPositions = (
  side: 'player' | 'npc', arenaRadius: number, towerRadius: number, shape: ArenaShape = 'circle', count = 1,
  /** Regular smasher disc of the spawn row the trees keep clear of. */
  discRadius = Math.round(towerRadius / TOWER_RADIUS_MUL)
): { x: number; y: number }[] => {
  const key = `${side}:${arenaRadius}:${towerRadius}:${shape}:${count}:${discRadius}`
  const hit = treePosCache.get(key)
  if (hit !== undefined) return hit.map(p => ({ ...p }))
  const out = computeTowerPositions(side, arenaRadius, towerRadius, shape, count, discRadius)
  if (treePosCache.size > 4096) treePosCache.clear()
  treePosCache.set(key, out)
  return out.map(p => ({ ...p }))
}

/** Pure function of its arguments — memoised (props / fit / engine ask often). */
const treePosCache = new Map<string, { x: number; y: number }[]>()

const computeTowerPositions = (
  side: 'player' | 'npc', arenaRadius: number, towerRadius: number, shape: ArenaShape, count: number, discRadius: number
): { x: number; y: number }[] => {
  const dir = side === 'player' ? 1 : -1
  const n = clampTreeCount(count)
  if (towerRadius <= 0) return [towerPosition(side, arenaRadius, 0, shape)]
  const at = (thetas: number[]) => thetas.map(t => treeOnRay(dir, t, arenaRadius, towerRadius, shape, discRadius))
  if (n === 1) return at([0])
  const need = TREE_SPACING * towerRadius
  const spread = (d: number) => at(n === 2 ? [-d, d] : [-d, 0, d])
  const apart = (p: { x: number; y: number }[]): boolean => {
    for (let i = 0; i + 1 < p.length; i++) if (Math.hypot(p[i]!.x - p[i + 1]!.x, p[i]!.y - p[i + 1]!.y) < need) return false
    return true
  }
  // Coarse steps, then back off in fine steps to the smallest spread. The
  // neighbours only move apart as the spread grows, so each grid is searched
  // by bisection — same grid values (same float accumulation), same answer
  // as the linear scan, a third of the rays.
  const coarse: number[] = []
  let d = 0.02
  for (; d < 1.2; d += 0.05) coarse.push(d)
  d = firstOk(coarse, c => apart(spread(c))) ?? d
  const fine: number[] = []
  for (let f = Math.max(0.02, d - 0.05); f < d; f += 0.005) fine.push(f)
  return spread(firstOk(fine, f => apart(spread(f))) ?? d)
}

/** First value of a sorted grid where a monotone predicate turns true. */
const firstOk = (grid: readonly number[], ok: (v: number) => boolean): number | undefined => {
  let lo = 0
  let hi = grid.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ok(grid[mid]!)) hi = mid
    else lo = mid + 1
  }
  return grid[lo]
}

/** The single tree's centre: on the y axis just inside the team's own wall
 *  (player bottom, NPC top). `towerRadius` 0 = the wall point itself. */
export const towerPosition = (
  side: 'player' | 'npc', arenaRadius: number, towerRadius = 0, shape: ArenaShape = 'circle'
): { x: number; y: number } => {
  const dir = side === 'player' ? 1 : -1
  if (towerRadius > 0) return treeOnRay(dir, 0, arenaRadius, towerRadius, shape, Math.round(towerRadius / TOWER_RADIUS_MUL))
  let lo = 0
  let hi = arenaRadius * 1.5
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (sdf(shape, 0, dir * m, arenaRadius) <= 0) lo = m
    else hi = m
  }
  return { x: 0, y: dir * lo }
}

/** Per-tree extras: `hpMul` on top of the team-HP share (boss trees), and
 *  the spiked front cover. Both PvP peers derive the same spec. */
export interface TowerSpec {
  hpMul?: number
  spiked?: boolean
}

/** The spec of a team's tree under TOWER_TUNING. `role`: 'boss' = the boss
 *  side of a boss stage (campaign: the NPC team carries a boss), 'bossFoe' =
 *  the team facing a boss, 'plain' = every other tree (PvP, league, ghosts,
 *  normal stages). */
export type TowerRole = 'boss' | 'bossFoe' | 'plain'
export const towerSpecFor = (role: TowerRole): TowerSpec => ({
  hpMul: role === 'boss' ? TOWER_TUNING.bossHpMul : role === 'bossFoe' ? TOWER_TUNING.ownBossStageHpMul : 1,
  spiked: TOWER_TUNING.spikes === 'all' || (TOWER_TUNING.spikes === 'boss' && role === 'boss')
})

export const createTower = (
  side: 'player' | 'npc', arenaRadius: number, bladeRadius: number, teamMaxHp: number,
  shape: ArenaShape = 'circle', spec: TowerSpec = {}
): TeamTower => createTowers(side, arenaRadius, bladeRadius, teamMaxHp, shape, spec, 1)[0]!

/** All `count` trees of a side (1–3): smaller and with a share of the HP each
 *  when there are several (TREE_COUNT_RADIUS_MUL / TREE_COUNT_HP_SHARE). */
export const createTowers = (
  side: 'player' | 'npc', arenaRadius: number, bladeRadius: number, teamMaxHp: number,
  shape: ArenaShape = 'circle', spec: TowerSpec = {}, count = 1
): TeamTower[] => {
  const n = clampTreeCount(count)
  const radius = treeRadiusFor(bladeRadius, n)
  const maxHp = Math.max(1, Math.round(teamMaxHp * TOWER_TUNING.hpRatio * (spec.hpMul ?? 1) * TREE_COUNT_HP_SHARE[n - 1]!))
  return towerPositions(side, arenaRadius, radius, shape, n, bladeRadius)
    .map(p => ({ side, x: p.x, y: p.y, radius, hp: maxHp, maxHp, flash: 0, spiked: spec.spiked === true }))
}

/** Has every tree of `side` fallen? (false when the side has no trees). */
export const allTreesDown = (towers: readonly Pick<TeamTower, 'side' | 'hp'>[], side: 'player' | 'npc'): boolean => {
  let any = false
  for (const t of towers) {
    if (t.side !== side) continue
    if (t.hp > 0) return false
    any = true
  }
  return any
}

/** The tree an attacker at (x, y) goes for among `side`'s LIVING trees: the
 *  weakest one (HP share), ties → the nearest. null = none standing. */
export const pickTargetTree = <T extends Pick<TeamTower, 'side' | 'hp' | 'maxHp' | 'x' | 'y'>>(
  towers: readonly T[], side: 'player' | 'npc', x: number, y: number
): T | null => {
  let best: T | null = null
  let bestK = Infinity
  let bestD = Infinity
  for (const t of towers) {
    if (t.side !== side || t.hp <= 0) continue
    const k = t.hp / t.maxHp
    const d = Math.hypot(t.x - x, t.y - y)
    if (k < bestK - 1e-9 || (Math.abs(k - bestK) <= 1e-9 && d < bestD)) {
      best = t
      bestK = k
      bestD = d
    }
  }
  return best
}

/** Damage of one blade → tower contact (static target: defense 1, the
 *  tower's weight cancels out — the hit is the blade's closing speed along
 *  the contact normal × its damage multiplier). */
export const towerHitDamage = (closingSpeed: number, damageMultiplier: number, damageScale: number): number =>
  Math.max(0, closingSpeed) * damageMultiplier * damageScale * TOWER_DAMAGE_MUL

/** Half-angle of a tree's FRONT — the arc of its outline a smasher can
 *  reach. The trees stand inside the clearing now (only their back touches
 *  the wall), so the front wraps everything but the back; the spiked cover
 *  spans it. (Was π × TOWER_INSIDE_SHARE while the trees sat in the wall.) */
export const TOWER_FRONT_HALF_ARC = Math.PI * 0.75

/** Direction the tree's front faces (radians, towards the arena centre). */
export const towerFrontAngle = (t: Pick<TeamTower, 'x' | 'y'>): number => Math.atan2(-t.y, -t.x)

/** Is the contact normal (unit, tower → blade) on the tree's front arc? */
export const onTowerFront = (t: Pick<TeamTower, 'x' | 'y'>, nx: number, ny: number): boolean => {
  const len = Math.hypot(t.x, t.y)
  if (len < 1e-9) return true
  return (nx * -t.x + ny * -t.y) / len >= Math.cos(TOWER_FRONT_HALF_ARC)
}

/**
 * Spiked front cover: HP the ATTACKER loses for a hit that dealt `impactDmg`
 * to a spiked tree's front (0 for a bare tree or a hit off the front).
 * `impactDmg` is the plain impact (towerHitDamage) — Tower Breaker's bonus is
 * not spiked. Gameplay: deterministic, applied by the engine as a 'reflect'
 * HP loss (Guard Shell absorbs it, it never procs a skill).
 */
export const towerSpikeRecoil = (t: Pick<TeamTower, 'x' | 'y' | 'spiked'>, nx: number, ny: number, impactDmg: number): number =>
  t.spiked && impactDmg > 0 && onTowerFront(t, nx, ny) ? impactDmg * TOWER_TUNING.spikeRecoil : 0

/** Game result with towers: a side loses when all its smashers are dead OR
 *  ALL its trees have fallen (allTreesDown). The player wins ties (matches the legacy all-dead rule). */
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
