import type { SkillRuntime } from '@/use/skills/skillCore'
import type { SmasherId } from '@/data/smasherCatalog'

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

/**
 * Stage-101+ boss mechanics (bosses-100-feature.md §4), carried by NPC bosses
 * next to their {@link BossAbility}:
 *  - 'ember' → Ember Nova: burn pulse around the carrier on the combat clock
 *  - 'frost' → Frost Lock: touch drains speed, the carrier's ram freezes
 *  - 'chill' → Frostbite: every touch adds a stacking slow
 */
export type BossTrait = 'ember' | 'frost' | 'chill'

export interface SpinnerConfig {
  /** The smasher this blade is (src/data/smasherCatalog.ts). Player blades
   *  always carry one; its archetype fills topPartId / bottomPartId, its level
   *  fills topLevel / bottomLevel (level − 1 each) and its unlocked skills ride
   *  on the blade itself. NPC blades without it look like the smasher of their
   *  parts (`smasherForParts`) and fight on their part stats only. */
  smasherId?: SmasherId
  /** Smasher level (1, 2, 3 …; no gameplay cap — clamped only to SMASHER_LEVEL_SANITY_MAX); only meaningful with smasherId. */
  level?: number
  topPartId: TopPartId
  bottomPartId: BottomPartId
  topLevel?: number
  bottomLevel?: number
  modelId?: string
  isBoss?: boolean
  bossAbility?: BossAbility
  /** Stage-101+ boss mechanic this blade carries (NPC bosses only). */
  bossTrait?: BossTrait
  /** Trait handed to this boss's split children (Shattering Glacier: 'chill');
   *  children otherwise drop the parent's trait. */
  shardTrait?: BossTrait
  /** Boss-tier HP (2×) without the boss size/spin/arena treatment. Read by the
   *  engine's blade setup; no current mode sets it. */
  bossStats?: boolean
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
  /** Peer-independent identity (PvP determinism): host team 0..n-1, guest
   *  team 100+i, spawned children derived from their parent. Unlike `id`
   *  (a per-client counter) it is identical on both PvP clients, so it
   *  orders collision pairs, the state hash and per-blade RNG streams. */
  syncKey: number
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
  /** Skill-clock time of the last shock (Static Charge proc, Frost Lock cold
   *  touch); gates re-shock to ≥250ms apart. */
  lastShockMs?: number
  wallBounceCount: number
  lastHitTime: number
  config: SpinnerConfig
  owner: 'player' | 'npc'
  isBoss: boolean
  // ── Smasher mechanics (use/smasherMechanics.ts) ───────────────────────
  /** Gameplay HEADING, a unit vector: the launch direction at launch, the
   *  velocity direction while moving, kept when stopped. Absent = the
   *  owner's default (player up, npc down). Deterministic (PvP-hashed when
   *  any armour is in play). */
  hx?: number
  hy?: number
  /** Radius multiplier of the blade: the smasher's catalog disc × its side's
   *  team-size multiplier (src/data/teamSize.ts); absent = 1. */
  disc?: number
  /** Directional armour (damage-taken multipliers); absent = neutral. */
  armor?: { front: number; back: number; look: 'blade' | 'bulwark' }
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
  // ── skills (skills-feature.md §10.1 / §10.3) ──────────────────────────
  /** Per-blade skill runtime state (`createBladeSkills`); only set when the
   *  blade's side has a non-empty loadout — unset is the no-skills fast path. */
  skills?: SkillRuntime
  /** Static Charge: the turn index on which this blade may not be launched. */
  stunnedForTurn?: number
  /** Static Charge: the turn index this blade is immune to a new stun
   *  (no two consecutive stuns). */
  stunImmuneTurn?: number
  /** Which rule set the launch lock `stunnedForTurn`: Static Charge
   *  ('stun') or the Glacier Warden's Frost Lock ('frost'). The
   *  never-lose-a-turn thaw clears frost locks only (bosses-100 §4.2). */
  lockKind?: 'stun' | 'frost'
  // ── boss traits (bosses-100-feature.md §4.3, §12.1) ───────────────────
  /** Frostbite: expiry team-turn per live chill stack, slots [0, chillN)
   *  live; allocated once per potential victim in initGame (trait matches). */
  chillExp?: Float64Array
  /** Frostbite: live chill stack count (statsFor: speed × (1 − 0.1·n)). */
  chillN?: number
  /** Frostbite: game time of the last chill stack (250 ms gate). */
  lastChillAt?: number
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

// (The meteor shower's pooled state lives in src/use/meteorShower.ts.)

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
  | 'ad_break'
  // The VS screen before the meteor intro (SpinnerArena-managed, like
  // 'ad_break'; src/use/vsIntro.ts). The engine treats it as idle.
  | 'vs_intro'
  | 'meteor_intro'
  | 'deciding_turn'
  | 'player_turn'
  | 'player_launched'
  | 'npc_turn'
  | 'npc_launched'
  | 'game_over'

export type GameResult = 'win' | 'lose' | null
