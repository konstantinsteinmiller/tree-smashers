// Skill core — the STRING-FREE part of the skill runtime that code outside the
// skill system must call on every build (skills flag on or off):
//
//   • the engine's single HP-loss path (`applyHpLoss`) and the launch / bounce /
//     stun / phase bookkeeping, which reduce to plain `hp -= dmg` / no-ops for a
//     blade without `skills` — i.e. always, on a build with skills off;
//   • the boss traits (`bosses/bossTraits.ts`), which share Frost Lock / Static
//     Charge turn semantics, Phase Step immunity and the Hazard Ward cut.
//
// Everything that CREATES skill state or rolls a skill lives in
// `skillRuntime.ts` (which re-exports this module), and reaches the engine only
// through the lazily installed skill port (`skills/skillEngine.ts`, loaded by
// `src/skills/skillsGate.ts`). A skills-off build therefore ships this file and
// nothing else of the skill runtime. Keep it that way: no catalog import, no
// skill-id strings, no allocation (tests/skillsFlagBoundary.test.ts).

import type { BladeSkills } from '@/types/skills'

// ─── Rule constants (§4; not tuning knobs) ─────────────────────────────────

/** Phase Step: how long a successful dodge keeps the bearer phased (§4.2). */
export const PHASE_WINDOW_MS = 300
/** Homing Rockets: flight time from volley to impact, game time (§4.6). */
export const ROCKET_FLIGHT_MS = 400
/** Static Charge shares the re-shock gate `lastShockMs` with Frost Lock (§4.10). */
export const STATIC_SHOCK_COOLDOWN_MS = 250
/** Speed kept after a Static Charge proc. */
export const SHOCK_BASE_KEEP = 0.1
/** refHit: fraction of the bearer's max launch speed (§4.6). */
export const REF_HIT_SPEED_FRACTION = 0.5
/** refHit: cap on the speed multiplier (Speedy builds, §4.6). */
export const REF_HIT_SPEED_MUL_CAP = 1.5

// ─── Bits (hot-path checks) ────────────────────────────────────────────────

// `SKILL_BIT[id]` (= 1 << index in SKILL_IDS) as plain numbers, so this module
// carries no skill-id strings (tests/skillsFlagBoundary.test.ts pins parity
// with the catalog).
export const B_PHASE = 1 // phase_step
export const B_SHELL = 2 // guard_shell
export const B_WIND = 4 // second_wind
export const B_LUCKY = 8 // lucky_edge
export const B_ROCKETS = 16 // homing_rockets
export const B_SALVO = 32 // opening_salvo
export const B_MOMENTUM = 64 // momentum
export const B_WARD = 128 // hazard_ward
export const B_STATIC = 256 // static_charge
export const B_MIRROR = 512 // mirror_plate
export const B_BANK = 1024 // bank_shot
export const B_ANCHOR = 2048 // anchor
export const B_TOWER = 4096 // tower_breaker
export const B_THORNS = 8192 // thorns

// ─── Types ─────────────────────────────────────────────────────────────────

/** Every way a blade loses HP. Only 'hit' (a collision hit) may roll skills. */
export type HpLossKind =
  | 'hit' // collision hit (incl. friendly fire — owner check decides skills)
  | 'chip' // Spiky chip
  | 'lava' // lava wall burn
  | 'burn' // Ember Nova (boss trait, bosses-100-feature.md §4.1) — a hazard: Hazard Ward cuts it like lava
  | 'thunder' // thunder-boss aura
  | 'reflect' // Mirror Plate reflection / Thorns recoil
  | 'rocket' // Homing Rockets impact
  | 'salvo' // Opening Salvo
  | 'link' // ghost-link mirror of another blade's loss

/** The blade fields the runtime reads/writes. `SpinnerState` satisfies it. */
export interface SkillBlade {
  id: number
  syncKey: number
  owner: 'player' | 'npc'
  hp: number
  maxHp: number
  vx: number
  vy: number
  config: { topPartId: string }
  skills?: BladeSkills
  lastShockMs?: number
  invulnerableUntil?: number
  linkedIds?: number[]
  stunnedForTurn?: number
  stunImmuneTurn?: number
}

/** The stat fields refHit needs — `SpinnerStats` (from `statsFor`) satisfies it. */
export interface SkillRefStats {
  damageMultiplier: number
  defenseMultiplier: number
  speedMultiplier: number
  totalWeight: number
}

/**
 * Runtime skill state of one bearer. Extends the persisted-shape
 * `BladeSkills` (§10.1) with the resolved params and the blade's RNG stream.
 * Only ever build it through `createBladeSkills`; the hooks read
 * `blade.skills` as this type.
 */
export interface SkillRuntime extends BladeSkills {
  /** mulberry32 state of this blade's own stream (hashable, PvP-safe). */
  rngState: number
  /** Test/tool override for the stream; null in the game. */
  rng: (() => number) | null
  // resolved params (0 when the skill is not carried)
  mirrorChance: number
  mirrorShare: number
  phaseChance: number
  phaseCooldownMs: number
  windThreshold: number
  windHeal: number
  luckyChance: number
  luckyMult: number
  momentumPerStack: number
  momentumMaxStacks: number
  rocketEveryN: number
  rocketFrac: number
  rocketMaxTargets: number
  salvoPct: number
  staticChance: number
  wardLava: number
  wardThunder: number
  wardChip: number
  wardShockKeep: number
  bankPct: number
  anchorResist: number
  towerPct: number
  thornsShare: number
}

export interface OutgoingSkillResult {
  /** Clamped product of the attacker skill multipliers (1 = nothing). */
  mul: number
  /** Lucky Edge fired (render as a crit number without shadowBlur). */
  lucky: boolean
  /** Momentum stacks that multiplied this hit (counted before it added one). */
  momentumStacks: number
  /** The product hit SKILL_HIT_MUL_CAP. */
  clamped: boolean
  /** Bank Shot cashed its rebound bonus on this hit. */
  bank: boolean
}

export interface IncomingSkillResult {
  /** Damage the defender actually takes from the hit. */
  taken: number
  /** Mirror Plate reflection to apply to the attacker (kind 'reflect'). */
  reflect: number
  /** Phase Step fired on this hit (new dodge, cooldown started). */
  dodged: boolean
  /** The hit fell inside an already-open phase window. */
  phased: boolean
  /** Mirror Plate fired. */
  mirrored: boolean
}

export interface HpLossResult {
  /** HP actually lost (after ward and shield) — the popup / combat-log number. */
  hpLost: number
  /** Amount the Guard Shell absorbed (cyan popup). */
  absorbed: number
  /** Amount Hazard Ward removed. */
  warded: number
  /** Second Wind heal applied (0 = none). */
  healed: number
  /** This loss emptied the shield. */
  shieldBroken: boolean
}

export interface ContactSkillResult<T extends SkillBlade = SkillBlade> {
  /** Homing Rockets fired a volley on this contact (targets may be 0 = fizzle). */
  volley: boolean
  /** Rockets in the volley (0…3); entries past this are stale. */
  volleyCount: number
  volleyTargets: (T | null)[]
  /** Damage per rocket (already split, min 1). */
  volleyDamage: number[]
  /** Game time the rockets land. */
  volleyArriveAt: number
  /** Static Charge fired: the enemy's speed was cut to SHOCK_BASE_KEEP. */
  shocked: boolean
  /** The shock also stunned it (false when stun-immune for that turn). */
  stunned: boolean
  /** The enemy-team turn index the blade is stunned for (valid if stunned). */
  stunTurn: number
}

export const createOutgoingResult = (): OutgoingSkillResult =>
  ({ mul: 1, lucky: false, momentumStacks: 0, clamped: false, bank: false })

export const createIncomingResult = (): IncomingSkillResult =>
  ({ taken: 0, reflect: 0, dodged: false, phased: false, mirrored: false })

export const createHpLossResult = (): HpLossResult =>
  ({ hpLost: 0, absorbed: 0, warded: 0, healed: 0, shieldBroken: false })

export function createContactResult<T extends SkillBlade = SkillBlade>(): ContactSkillResult<T> {
  return {
    volley: false,
    volleyCount: 0,
    volleyTargets: [null, null, null],
    volleyDamage: [0, 0, 0],
    volleyArriveAt: 0,
    shocked: false,
    stunned: false,
    stunTurn: 0
  }
}

/** Is the blade inside a Phase Step window at `now`? */
export const isPhased = (blade: SkillBlade, now: number): boolean =>
  blade.skills !== undefined && now < blade.skills.phasedUntil

/** Spiky chip from `source` onto `target` is skipped: target phased, enemy source. */
export const blocksEnemyChip = (target: SkillBlade, source: SkillBlade, now: number): boolean =>
  target.owner !== source.owner && isPhased(target, now)

/** Survivability for the anti-draw rule (§5 step 4): HP + remaining shield. */
export const effectiveHp = (blade: SkillBlade): number =>
  blade.hp + (blade.skills !== undefined ? blade.skills.shield : 0)

// ─── §5 step 5 — central HP loss ───────────────────────────────────────────

/** Hazard Ward multiplier for a loss of `kind` (1 = unchanged). */
export function hazardScale(blade: SkillBlade, kind: HpLossKind): number {
  const s = blade.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_WARD) === 0) return 1
  if (kind === 'lava' || kind === 'burn') return 1 - s.wardLava
  if (kind === 'thunder') return 1 - s.wardThunder
  if (kind === 'chip') return 1 - s.wardChip
  return 1
}

/**
 * The single HP-loss path (§5 step 5 / §10.3 item 9): Hazard Ward (lava,
 * thunder, chip) → Guard Shell absorb → HP → Second Wind (once, only when
 * this loss took HP and left 0 < hp ≤ threshold·maxHp; never on a kill).
 * Works for blades without skills (plain `hp -= dmg`). Never rolls a skill.
 * Returns the HP actually lost; details in `out` when given.
 */
export function applyHpLoss(
  target: SkillBlade,
  dmg: number,
  kind: HpLossKind,
  out: HpLossResult | null = null
): number {
  if (out !== null) {
    out.hpLost = 0
    out.absorbed = 0
    out.warded = 0
    out.healed = 0
    out.shieldBroken = false
  }
  if (!(dmg > 0) || target.hp <= 0) return 0
  const s = target.skills as SkillRuntime | undefined
  if (s !== undefined) {
    if ((s.has & B_WARD) !== 0) {
      const scaled = dmg * hazardScale(target, kind)
      if (out !== null) out.warded = dmg - scaled
      dmg = scaled
    }
    if (s.shield > 0 && dmg > 0) {
      const a = s.shield < dmg ? s.shield : dmg
      s.shield -= a
      dmg -= a
      if (out !== null) {
        out.absorbed = a
        out.shieldBroken = s.shield <= 0
      }
    }
  }
  const before = target.hp
  target.hp = before - dmg > 0 ? before - dmg : 0
  const lost = before - target.hp
  if (out !== null) out.hpLost = lost
  if (
    s !== undefined &&
    (s.has & B_WIND) !== 0 &&
    !s.secondWindUsed &&
    lost > 0 &&
    target.hp > 0 &&
    target.hp <= s.windThreshold * target.maxHp
  ) {
    const room = target.maxHp - target.hp
    const want = s.windHeal * target.maxHp
    const heal = want < room ? want : room
    target.hp += heal
    s.secondWindUsed = true
    if (out !== null) out.healed = heal
  }
  return lost
}

// ─── Momentum bookkeeping ──────────────────────────────────────────────────

/** Call from `beginLaunch(blade)` for every launch: Momentum stacks reset. */
export function beginLaunchSkills(blade: SkillBlade): void {
  const s = blade.skills
  if (s === undefined) return
  s.stacks = 0
  if (s.banked !== undefined) {
    s.banked = false
    s.bankUsed = false
  }
}

/** Wall / bouncer rebound of `blade`: +1 Momentum stack during its own launch. */
export function onOwnBounce(blade: SkillBlade, launchedBladeId: number | null): void {
  const s = blade.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_MOMENTUM) === 0 || launchedBladeId !== blade.id) return
  if (s.stacks < s.momentumMaxStacks) s.stacks++
}

// ─── Smasher-only effects (no RNG) ─────────────────────────────────────────

/** Bank Shot: a rebound (wall, island, bumper, tower) of `blade` during its
 *  own launch arms this launch's one bonus hit. */
export function onBankRebound(blade: SkillBlade, launchedBladeId: number | null): void {
  const s = blade.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_BANK) === 0 || launchedBladeId !== blade.id || s.bankUsed === true) return
  s.banked = true
}

/** Anchor: fraction of the knockback speed `blade` keeps when an enemy
 *  contact pushes it while it is NOT the launched blade (1 = no anchor). */
export function anchorKeep(blade: SkillBlade, launchedBladeId: number | null): number {
  const s = blade.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_ANCHOR) === 0 || launchedBladeId === blade.id) return 1
  return 1 - s.anchorResist
}

/** Tower Breaker: multiplier on `blade`'s damage to a team tower. */
export function towerDamageMul(blade: SkillBlade): number {
  const s = blade.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_TOWER) === 0) return 1
  return 1 + s.towerPct
}

/** Thorns: recoil onto `att` for an enemy hit of `dmg` that landed on the
 *  bearer's SPIKED side (`spikedHit`: its reinforced cone — the back when
 *  its armour is stronger behind, else the front),
 *  `share·dmg / max(1, attackerDefense)` (the Mirror Plate rule). Apply with
 *  kind 'reflect' — it never procs anything. */
export function thornsRecoil(
  def: SkillBlade, att: SkillBlade, dmg: number, spikedHit: boolean, attackerDefense: number
): number {
  const s = def.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_THORNS) === 0 || !spikedHit || !(dmg > 0) || att.owner === def.owner) return 0
  return (dmg * s.thornsShare) / Math.max(1, attackerDefense)
}

// ─── Stun turn semantics (§4.10) ───────────────────────────────────────────

/** May not be picked for the team turn `turnIndex`. */
export const isStunnedFor = (blade: SkillBlade, turnIndex: number): boolean =>
  blade.stunnedForTurn === turnIndex

/** Living, non-stunned blades of `team` for `turnIndex`; 0 while any live →
 *  the whole team turn is skipped (normal end-of-turn bookkeeping). */
export function countPickable(team: readonly SkillBlade[], turnIndex: number): number {
  let n = 0
  for (let i = 0; i < team.length; i++) {
    const b = team[i] as SkillBlade
    if (b.hp > 0 && b.stunnedForTurn !== turnIndex) n++
  }
  return n
}
