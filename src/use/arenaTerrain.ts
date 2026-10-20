import { sdf, type ArenaShape } from '@/use/arenaShapes'
// ─── Arena terrain: layouts (islands, speed boosters, pot holes) + team towers ──
//
// Pure geometry / physics helpers for the Tree Smashers arena. The engine
// (useSpinnerGame) owns the live state; everything here is deterministic
// (no Math.random, no clocks) so both PvP peers build byte-identical arenas.
//
// Coordinates are arena-local in the HOST frame: the local player's home side
// is +y (bottom), the opponent's is −y (top). A PvP guest sees the arena
// y-mirrored, so it builds the layout with `flipY` — the host-frame geometry
// is then identical on both peers.

export const TERRAIN_LAYOUT_COUNT = 3

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

export interface TerrainLayout {
  id: number
  /** i18n key of the layout's display name. */
  nameKey: string
  islands: TerrainIsland[]
  boosters: TerrainBooster[]
  holes: TerrainHole[]
}

// ── Tuning ────────────────────────────────────────────────────────────────
/** Speed multiplier of one booster pass. */
export const BOOSTER_MUL = 1.3
/** A boosted blade never exceeds this fraction of its own max launch speed. */
export const BOOSTER_CAP_RATIO = 1.15
/** Per-blade re-arm after a boost (sim ms). */
export const BOOSTER_COOLDOWN_MS = 600
/** At most this many boosts per blade per launch (a runaway guard). */
export const BOOSTER_MAX_PER_LAUNCH = 3
/** Per physics substep velocity keep while a blade's centre is in mud. */
export const MUD_KEEP = 0.9
/** Fraction of a deep hole's radius that is the "stop" core. */
export const DEEP_CORE_RATIO = 0.65

/** Team tower body radius relative to the blade radius. */
export const TOWER_RADIUS_MUL = 1.35
/** Distance of each tower centre from the arena centre, × arena radius. */
export const TOWER_Y_RATIO = 0.8
/** Tower HP = this × the team's total blade max HP at spawn. */
export const TOWER_HP_RATIO = 0.6
/** Damage scale for blade → tower hits (on top of the engine's DAMAGE_SCALE). */
export const TOWER_DAMAGE_MUL = 1

/** Campaign: stage 1 → layout 0, 2 → 1, 3 → 2, 4 → 0 … */
export const layoutForStage = (stageId: number): number =>
  (((Math.floor(stageId) - 1) % TERRAIN_LAYOUT_COUNT) + TERRAIN_LAYOUT_COUNT) % TERRAIN_LAYOUT_COUNT

/** PvP / league / ghost: derived from the shared seed (both peers agree). */
export const layoutForSeed = (seed: number): number =>
  ((seed >>> 0) ^ ((seed >>> 0) >>> 16)) % TERRAIN_LAYOUT_COUNT

/** Stable 32-bit hash of a string (ghost ids) — djb2. */
export const hashString = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** Campaign towers start at stage 2 (stage 1 is the pure tutorial fight). */
export const TOWERS_FROM_STAGE = 2

// Layout tables (arena radius 200; spawns: player row y=+80 |x|≤70; the
// opponent block on a terrain arena (see TERRAIN_NPC_BACK_ROW_Y in the
// engine) y∈[−141,−49] |x|≤91 incl. jitter; towers at y=±160).
const LAYOUTS: readonly TerrainLayout[] = [
  {
    id: 0,
    nameKey: 'terrain.layout.mossyGlade',
    islands: [{ x: 0, y: 10, radius: 22, kind: 'stump' }],
    boosters: [
      { x: -100, y: 0, radius: 16, angle: -Math.PI / 2 },
      { x: 108, y: 0, radius: 16, angle: Math.PI / 2 }
    ],
    holes: []
  },
  {
    id: 1,
    nameKey: 'terrain.layout.mudHollow',
    islands: [],
    boosters: [
      { x: -132, y: 28, radius: 16, angle: -Math.PI / 2 },
      { x: 132, y: -28, radius: 16, angle: Math.PI / 2 }
    ],
    holes: [
      { x: 0, y: 10, radius: 15, deep: true },
      { x: -64, y: 10, radius: 20, deep: false },
      { x: 64, y: 10, radius: 20, deep: false },
      { x: -128, y: -20, radius: 18, deep: false },
      { x: 128, y: 20, radius: 18, deep: false }
    ]
  },
  {
    id: 2,
    nameKey: 'terrain.layout.twinIslands',
    islands: [
      { x: -108, y: 20, radius: 25, kind: 'rock' },
      { x: 118, y: 20, radius: 25, kind: 'pond' }
    ],
    boosters: [
      { x: -42, y: 10, radius: 14, angle: -Math.PI / 2 },
      { x: 42, y: 10, radius: 14, angle: Math.PI / 2 }
    ],
    holes: [
      { x: 0, y: 10, radius: 14, deep: false }
    ]
  }
]

/** A fresh copy of layout `id` (mod count), optionally y-mirrored (PvP guest). */
export const buildTerrainLayout = (id: number, flipY = false): TerrainLayout => {
  const src = LAYOUTS[((id % TERRAIN_LAYOUT_COUNT) + TERRAIN_LAYOUT_COUNT) % TERRAIN_LAYOUT_COUNT]!
  const fy = flipY ? -1 : 1
  return {
    id: src.id,
    nameKey: src.nameKey,
    islands: src.islands.map(i => ({ ...i, y: i.y * fy })),
    boosters: src.boosters.map(b => ({ ...b, y: b.y * fy, angle: flipY ? -b.angle : b.angle })),
    holes: src.holes.map(h => ({ ...h, y: h.y * fy }))
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
  playerAlive: number, npcAlive: number, playerTowerDown: boolean, npcTowerDown: boolean
): 'win' | 'lose' | null => {
  const npcLost = npcAlive === 0 || npcTowerDown
  const playerLost = playerAlive === 0 || playerTowerDown
  if (!npcLost && !playerLost) return null
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
  /** Boosts taken during the current launch. */
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
}

/**
 * Applies boosters, mud and deep holes to one blade. `maxSpeed` is the
 * blade's own max launch speed; `now` is the sim clock. Never adds speed to a
 * resting blade and never traps one: a deep hole only removes velocity, and a
 * blade launched from inside it is exempt until it rolls out.
 */
export const applyGround = (
  layout: TerrainLayout, blade: GroundBlade, gs: GroundState, maxSpeed: number, now: number, out: GroundEffect
): GroundEffect => {
  out.boosted = false
  out.stopped = false
  out.inMud = false
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

  if (gs.boosts < BOOSTER_MAX_PER_LAUNCH && now >= gs.boostReadyAt) {
    for (const b of layout.boosters) {
      const dx = blade.x - b.x
      const dy = blade.y - b.y
      if (dx * dx + dy * dy > b.radius * b.radius) continue
      const cur = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
      const cap = maxSpeed * BOOSTER_CAP_RATIO
      const target = Math.min(cur * BOOSTER_MUL, Math.max(cur, cap))
      if (target > cur && cur > 0) {
        const k = target / cur
        blade.vx *= k
        blade.vy *= k
        out.boosted = true
      }
      gs.boosts++
      gs.boostReadyAt = now + BOOSTER_COOLDOWN_MS
      break
    }
  }
  return out
}

/** Every circle a terrain feature occupies (islands, boosters, holes). */
export const terrainCircles = (layout: TerrainLayout): { x: number; y: number; radius: number }[] => [
  ...layout.islands, ...layout.boosters, ...layout.holes
]
