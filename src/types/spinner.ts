// ─── Top & Bottom Part Identifiers ───────────────────────────────────────────

export const TOP_PART_IDS = {
  STAR: 'star',
  TRIANGLE: 'triangle',
  ROUND: 'round',
  QUADRATIC: 'quadratic',
  CUSHIONED: 'cushioned',
  PIERCER: 'piercer'
} as const

export type TopPartId = (typeof TOP_PART_IDS)[keyof typeof TOP_PART_IDS]

export const BOTTOM_PART_IDS = {
  SPEEDY: 'speedy',
  TANKY: 'tanky',
  BALANCED: 'balanced'
} as const

export type BottomPartId = (typeof BOTTOM_PART_IDS)[keyof typeof BOTTOM_PART_IDS]

// ─── Part Interfaces ─────────────────────────────────────────────────────────

export interface TopPart {
  id: TopPartId
  label: string
  damageMultiplier: number
  defenseMultiplier: number
  healthBonus: number
  shape: 'star' | 'spiky' | 'circle' | 'square' | 'cushion' | 'piercer'
}

export interface BottomPart {
  id: BottomPartId
  label: string
  speedMultiplier: number
  forceDecay: number
  healthBonus: number
  weight: number
}

// ─── Spinner Composition ────────────────────────────────────────────────────

/**
 * Special boss behaviors. Plain bosses just get the stat bump; abilities
 * opt into mechanics handled in useSpinnerGame:
 *  - 'ghost'    → splits into 2 linked blades on launch; shared damage;
 *                 no friendly fire with its ghost counterpart
 *  - 'split'    → on death, spawns 5 mini blades with temporary invincibility
 *  - 'partners' → every enemy blade in the team shares a group; no FF
 *  - 'healers'  → like 'partners' + heals on contact; 20% oversize only
 */
export type BossAbility =
  'ghost'
  | 'split'
  | 'partners'
  | 'healers'
  | 'child-emitter'
  | 'stat-switch'
  | 'life-leech'
  | 'thunder'

export interface SpinnerConfig {
  topPartId: TopPartId
  bottomPartId: BottomPartId
  topLevel?: number
  bottomLevel?: number
  modelId?: string
  isBoss?: boolean
  bossAbility?: BossAbility
}

export interface SpinnerStats {
  maxHp: number
  totalWeight: number
  damageMultiplier: number
  defenseMultiplier: number
  speedMultiplier: number
  forceDecay: number
  top: TopPart
  bottom: BottomPart
}

// ─── Runtime Spinner State ──────────────────────────────────────────────────

export interface SpinnerState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  // Acceleration ramp — blade builds speed over ACCEL_FRAMES after launch
  ax: number
  ay: number
  accelFramesLeft: number
  radius: number
  hp: number
  maxHp: number
  rotation: number
  rotationSpeed: number
  hitFlash: number
  /** Timestamp of last shock-arena zap; gates re-zap to ≥100ms apart. */
  lastShockMs?: number
  wallBounceCount: number
  lastHitTime: number
  config: SpinnerConfig
  owner: 'player' | 'npc'
  isBoss: boolean
  // ── Boss ability state ────────────────────────────────────────────────
  /** Blades sharing a groupId treat each other as allies (no FF damage). */
  groupId?: number
  /** For healer groups — friendly contact heals instead of nothing. */
  healsAllies?: boolean
  /** Partner/healer allies still physically collide (bounce + separate) but
   *  take no damage from each other. Ghost/split siblings leave this false
   *  so they continue to phase through one another. */
  bouncesAllies?: boolean
  /** Ghost-boss linkage — damage taken is mirrored to these blade ids. */
  linkedIds?: number[]
  /** Ghost-boss parents set this so the first launch triggers the split. */
  ghostPending?: boolean
  /** Split-boss state — this blade will shatter into mini blades on death. */
  splitsOnDeath?: boolean
  /** Set on split children to prevent recursive shattering. */
  isSplitChild?: boolean
  /** Timestamp (performance.now) until which the blade ignores collisions
   *  and renders as blinking — used by split-children while they settle. */
  invulnerableUntil?: number
  /** Multiplicative powerup buffs collected during the current match. Each
   *  pickup multiplies the corresponding entry (e.g. two attack pickups →
   *  attack: 1.25 * 1.25). Persisted for the lifetime of a single game and
   *  consumed by `statsFor()` when computing damage / defense / speed. */
  buffs?: {
    attack?: number
    defense?: number
    speed?: number
  }
  // ── child-emitter boss ────────────────────────────────────────────────
  /** Emits a mini distraction spinner on each collision. */
  isChildEmitter?: boolean
  /** Total children ever spawned by this emitter (used for HP scaling). */
  emittedChildCount?: number
  /** Mini spinners spawned by child-emitter — cannot emit further. */
  isEmittedChild?: boolean
  // ── stat-switch boss ──────────────────────────────────────────────────
  /** Swaps ATK/DEF depending on whose turn it is. */
  statSwitchPhase?: 'attack' | 'defense'
  // ── life-leech boss ───────────────────────────────────────────────────
  /** 30% of damage dealt is gained as self-heal. */
  isLifeLeech?: boolean
  // ── teleporter boss ───────────────────────────────────────────────────
  /** Passes through arena walls and emerges on the opposite side. */
  isTeleporter?: boolean
  // ── thunder boss ──────────────────────────────────────────────────────
  /** Deals 1 damage/sec to nearby blades within lightning bolt radius. */
  isThunder?: boolean
  /** Timestamp of last thunder damage tick per target blade id.
   *  Key is the target blade's numeric `id` (matches `SpinnerState.id`). */
  thunderLastHit?: Map<number, number>
}

// ─── Arena Powerup ───────────────────────────────────────────────────────────

/** Stat the powerup boosts on the first blade to touch it. */
export type PowerupStat = 'attack' | 'defense' | 'speed'

/** Lifecycle phases for the spawn → vanish animation. */
export type PowerupPhase = 'growing' | 'overgrow' | 'final' | 'vanishing'

export interface Powerup {
  id: number
  x: number
  y: number
  stat: PowerupStat
  phase: PowerupPhase
  /** Milliseconds elapsed since the powerup spawned (driven by the physics
   *  loop, so it pauses when the loop pauses — "in-arena simulated time"). */
  age: number
  /** Total lifetime in ms before an un-collected powerup begins to vanish. */
  lifetime: number
  /** Current rendered scale, 0..~1.15 driven by the lifecycle phases. */
  scale: number
  /** Collision radius in arena units. Equals BLADE_RADIUS when at full size. */
  radius: number
}

// ─── Meteor Shower Particle ──────────────────────────────────────────────────

export interface MeteorParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hue: number
}

// ─── Spritesheet Animation ──────────────────────────────────────────────────

export interface SpritesheetAnimation {
  x: number
  y: number
  frame: number
  timer: number
  frameDuration: number
  totalFrames: number
  frameWidth: number
  frameHeight: number
  scale: number
  vertical: boolean
  image: HTMLImageElement
}

// ─── Game Phase State Machine ────────────────────────────────────────────────

export type GamePhase =
  | 'idle'
  | 'tap_to_start'
  | 'meteor_intro'
  | 'deciding_turn'
  | 'player_turn'
  | 'player_launched'
  | 'npc_turn'
  | 'npc_launched'
  | 'game_over'

export type GameResult = 'win' | 'lose' | null
