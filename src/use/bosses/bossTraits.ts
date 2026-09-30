// Boss trait runtime — the pure, deterministic rules of the three stage-101+
// boss mechanics (bosses-100-feature.md §4, §6.1, §9, §12.1; user decisions
// B3/B4). NO Vue, no engine imports, no wall clock, no random numbers: every
// timing input is either the caller's tick-counted combat clock (Ember Nova)
// or a team turn index (Frost Lock, Frostbite); per-contact gates take the
// caller's SIMULATION clock as `now` — the engine passes `skillClock()`
// (tick-counted `simTickCount × FIXED_STEP_MS`, the same clock as the skills'
// rockets; PvP never carries traits), never the wall-clock `gameTime()`, so a
// replay at 1× and 2× sees identical gates.
//
//   ember — Ember Nova (Cinder Tyrant): every EMBER_PERIOD_MS of COMBAT clock
//           (advances only on physics substeps of a launched phase), each
//           living carrier hits every victim within
//           EMBER_RADIUS_MUL × carrier.radius + victim.radius for
//           max(1, EMBER_PCT × victim.maxHp), a hazard through `applyHpLoss`.
//           One hit per victim per nova, however many carriers reach it.
//   frost — Frost Lock (Glacier Warden): any contact drains the victim to
//           FROST_KEEP of its speed (Hazard Ward shockKeep applies; shares the
//           250 ms `lastShockMs` gate). A contact while the carrier is the
//           LAUNCHED blade freezes the victim for its team's next turn (the
//           skills' launch lock `stunnedForTurn`, `lockKind = 'frost'`); never
//           two turns in a row, never the team's last launchable blade, and an
//           all-frozen team thaws at its turn start (B3: no lost turns).
//   chill — Frostbite (Frostbite Yeti): every contact adds one stack
//           (−CHILL_PER_STACK speed multiplier, −CHILL_PER_STACK current
//           velocity on landing), cap CHILL_MAX; each stack lasts through the
//           victim team's next CHILL_TURNS turns (B4); a touch at the cap
//           replaces the stack that expires first. 1 stack / CHILL_GATE_MS.
//
// Contract
//   • Owner-agnostic: victim = a blade of another `owner` than the carrier.
//     Allies (partners, healers, twins, children) are never affected.
//   • A phased victim (Phase Step dodge window, `isPhased`) ignores every
//     contact effect (drain, lock, stack). Ember is a hazard: Phase Step does
//     not dodge it.
//   • The only skill state read: Hazard Ward (`wardShockKeep`, and `wardLava`
//     through `applyHpLoss`), Phase Step (`phasedUntil`), the shared launch
//     lock fields. Nothing here rolls a skill; burn damage goes through
//     `applyHpLoss`, which never procs anything.
//   • Zero allocation in the hot path: results are string literals, numbers,
//     bitmasks or caller-owned `out` objects created once. The only
//     allocation is a victim's Float64Array chill buffer, made once per blade
//     (preallocate with `initTraitVictim` in initGame).
//
// `BossTrait` comes from BW1 (`src/types/spinner.ts`). The SpinnerState
// runtime fields (chillExp/chillN/lastChillAt/lockKind, §12.1) are declared
// structurally here (`TraitBlade`, all optional); the compile-time guard
// below proves SpinnerState fits (SpinnerState declares them since BW3).

// skillCore, not skillRuntime / the catalog: the boss traits ship on every
// build, including skills-off ones, where only the string-free core may.
import {
  B_WARD,
  STATIC_SHOCK_COOLDOWN_MS,
  applyHpLoss,
  countPickable,
  isPhased,
  type HpLossKind,
  type HpLossResult,
  type SkillBlade,
  type SkillRuntime
} from '@/use/skills/skillCore'
import type { BossTrait, SpinnerState } from '@/types/spinner'

// ─── Types ─────────────────────────────────────────────────────────────────

/** The three stage-101+ boss mechanics (§12.1) — BW1's type, re-exported. */
export type { BossTrait }

/** Why a blade may not launch on its `stunnedForTurn`: Static Charge or Frost Lock. */
export type LaunchLockKind = 'stun' | 'frost'

/** The blade fields the trait runtime reads/writes. `SpinnerState` satisfies it
 *  (the trait fields are optional, so it does before BW1 adds them too). */
export interface TraitBlade extends SkillBlade {
  x: number
  y: number
  radius: number
  config: { topPartId: string; bossTrait?: BossTrait }
  /** Chill: expiry team-turn per live stack, slots [0, chillN) live (compacted). */
  chillExp?: Float64Array
  /** Chill: live stack count (read by `statsFor` through `chillSpeedMul`). */
  chillN?: number
  /** Chill: game time of the last stack (CHILL_GATE_MS gate). */
  lastChillAt?: number
  /** Which rule set the launch lock `stunnedForTurn`. */
  lockKind?: LaunchLockKind
}

/** Compile-time guard (vue-tsc): the engine's blade must satisfy `TraitBlade`,
 *  so BW3 can pass `SpinnerState` straight in. */
type FitsTraitBlade<T extends TraitBlade> = T
export type SpinnerStateIsTraitBlade = FitsTraitBlade<SpinnerState>

export interface BossTraitTuning {
  /** Ember Nova period, combat-clock ms. */
  EMBER_PERIOD_MS: number
  /** Nova reach = this × carrier radius + victim radius (centre to centre). */
  EMBER_RADIUS_MUL: number
  /** Nova damage share of the victim's max HP (min 1). */
  EMBER_PCT: number
  /** Speed a cold touch leaves (before Hazard Ward). */
  FROST_KEEP: number
  /** Speed multiplier (and landing velocity cut) per chill stack. */
  CHILL_PER_STACK: number
  /** Chill stack cap. */
  CHILL_MAX: number
  /** A stack lasts through the victim team's next CHILL_TURNS turns. */
  CHILL_TURNS: number
  /** At most one stack per victim per this many game-time ms. */
  CHILL_GATE_MS: number
}

/** Shipped values (§4; mirrored by DEFAULT_KNOBS in tools/skills-sim/bosses100.mjs). */
export const BOSS_TRAIT_DEFAULTS: Readonly<BossTraitTuning> = Object.freeze({
  EMBER_PERIOD_MS: 2000,
  EMBER_RADIUS_MUL: 2.2,
  EMBER_PCT: 0.03,
  FROST_KEEP: 0.1,
  CHILL_PER_STACK: 0.1,
  CHILL_MAX: 5,
  CHILL_TURNS: 2,
  CHILL_GATE_MS: 250
})

/** Live tuning; mutable only from the Boss Lab (dev). Read at call time. */
export const BOSS_TRAIT_TUNING: BossTraitTuning = { ...BOSS_TRAIT_DEFAULTS }

/** Restore the shipped tuning (Boss Lab "reset", tests). */
export function resetBossTraitTuning(): void {
  Object.assign(BOSS_TRAIT_TUNING, BOSS_TRAIT_DEFAULTS)
}

/**
 * The `applyHpLoss` kind of a nova burn: `'burn'` (§4.1, §6.1) — a hazard
 * with lava's Hazard Ward share; Guard Shell absorbs it and Second Wind may
 * trigger on it like on any HP loss. Never procs a skill (only 'hit' rolls).
 */
export const EMBER_HP_LOSS_KIND: HpLossKind = 'burn'


// ─── Ember Nova: combat clock ──────────────────────────────────────────────

/** Float slack for the nova comparison: 1000/60 ms substeps summed in floating
 *  point land a hair under whole periods (600 substeps = 9999.9999… ms), which
 *  would push a nova one substep late. Same arithmetic on every peer, so it
 *  stays deterministic either way; the slack just makes novas land on exact
 *  multiples of the period. */
const CLOCK_EPS_MS = 1e-6

/** Per-match combat clock (hash-relevant: both fields). */
export interface BossClock {
  /** Combat ms so far (advances only on launched-phase substeps). */
  clockMs: number
  /** Combat-clock time of the next nova. */
  nextNovaAt: number
}

export const createBossClock = (): BossClock =>
  ({ clockMs: 0, nextNovaAt: BOSS_TRAIT_TUNING.EMBER_PERIOD_MS })

/** initGame: clock to 0, first nova after one full period. */
export function resetBossClock(c: BossClock): void {
  c.clockMs = 0
  c.nextNovaAt = BOSS_TRAIT_TUNING.EMBER_PERIOD_MS
}

/**
 * Advance the combat clock by one physics substep. Call once per SUBSTEP
 * (so simSpeed 2 sees the same novas per launch as 1×) after that substep's
 * collisions. `launchedPhase` = phase is `player_launched` | `npc_launched`;
 * otherwise (aiming, meteor intro, announcement, pause, ad, game over) the
 * clock does not move. Returns true when a nova is due on this substep (at
 * most one per substep). Float slack: CLOCK_EPS_MS.
 */
export function tickBossClock(c: BossClock, stepMs: number, launchedPhase: boolean): boolean {
  if (!launchedPhase) return false
  c.clockMs += stepMs
  if (c.clockMs >= c.nextNovaAt - CLOCK_EPS_MS) {
    c.nextNovaAt += BOSS_TRAIT_TUNING.EMBER_PERIOD_MS
    return true
  }
  return false
}

/** 0 … 1 charge of the next nova (telegraph arc). */
export function novaCharge(c: BossClock): number {
  const p = BOSS_TRAIT_TUNING.EMBER_PERIOD_MS
  const f = 1 - (c.nextNovaAt - c.clockMs) / p
  return f < 0 ? 0 : f > 1 ? 1 : f
}

// ─── Ember Nova: targets and damage ────────────────────────────────────────

/** Ember nova reach from `carrier` to `victim`, centre to centre. */
export const emberReach = (carrier: TraitBlade, victim: TraitBlade): number =>
  BOSS_TRAIT_TUNING.EMBER_RADIUS_MUL * carrier.radius + victim.radius

/** Largest `blades` index `emberVictimMask` can report (bit 30). */
export const EMBER_MASK_MAX_BLADES = 31

/**
 * Victims of the nova that is due now: bit `i` set ⇔ `blades[i]` is hit.
 * Carriers = living blades with `bossTrait === 'ember'`; a victim is a living
 * blade of another owner than some carrier whose reach (boundary inclusive)
 * covers its centre. Each victim is in the mask at most once (one hit per
 * nova). Pass the engine's `syncKey`-ordered blade list and apply damage in
 * index order. Indices ≥ EMBER_MASK_MAX_BLADES are ignored.
 */
export function emberVictimMask(blades: readonly TraitBlade[]): number {
  let mask = 0
  const n = blades.length < EMBER_MASK_MAX_BLADES ? blades.length : EMBER_MASK_MAX_BLADES
  const mul = BOSS_TRAIT_TUNING.EMBER_RADIUS_MUL
  for (let c = 0; c < n; c++) {
    const car = blades[c] as TraitBlade
    if (car.hp <= 0 || car.config.bossTrait !== 'ember') continue
    const reach = mul * car.radius
    for (let i = 0; i < n; i++) {
      const bit = 1 << i
      if ((mask & bit) !== 0) continue
      const v = blades[i] as TraitBlade
      if (v.hp <= 0 || v.owner === car.owner) continue
      const r = reach + v.radius
      const dx = v.x - car.x
      const dy = v.y - car.y
      if (dx * dx + dy * dy <= r * r) mask |= bit
    }
  }
  return mask
}

/** Any living ember carrier in `blades` (a nova is only released if true). */
export function hasLivingEmberCarrier(blades: readonly TraitBlade[]): boolean {
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i] as TraitBlade
    if (b.hp > 0 && b.config.bossTrait === 'ember') return true
  }
  return false
}

/** Nova damage before skills: max(1, EMBER_PCT × maxHp). */
export function emberDamage(victim: TraitBlade): number {
  const d = BOSS_TRAIT_TUNING.EMBER_PCT * victim.maxHp
  return d > 1 ? d : 1
}

/**
 * Apply one nova hit through the single HP-loss path (Hazard Ward −lava
 * share, Guard Shell absorbs first, Second Wind may trigger on a non-lethal
 * burn). Returns the HP actually lost; details in `out`. Kills are the
 * caller's (`handleDeaths`).
 */
export function applyEmberBurn(victim: TraitBlade, out: HpLossResult | null = null): number {
  return applyHpLoss(victim, emberDamage(victim), EMBER_HP_LOSS_KIND, out)
}

// ─── Frost Lock ────────────────────────────────────────────────────────────

/** Speed fraction a cold touch leaves: FROST_KEEP + (1 − FROST_KEEP) × Hazard Ward shockKeep. */
export function frostTouchKeep(victim: TraitBlade): number {
  const keep = BOSS_TRAIT_TUNING.FROST_KEEP
  const s = victim.skills as SkillRuntime | undefined
  if (s === undefined || (s.has & B_WARD) === 0) return keep
  return keep + (1 - keep) * s.wardShockKeep
}

/**
 * Cold touch (Rule A): if the victim's shared shock gate (`lastShockMs`, sim
 * clock, 250 ms — same as shock walls and Static Charge) is open, cut its
 * velocity to `frostTouchKeep` and close the gate. Returns the keep applied,
 * 0 when gated. Does not check owner / phase (see `onTraitContact`).
 */
export function frostTouch(victim: TraitBlade, now: number): number {
  if (now - (victim.lastShockMs ?? -Infinity) < STATIC_SHOCK_COOLDOWN_MS) return 0
  victim.lastShockMs = now
  const keep = frostTouchKeep(victim)
  victim.vx *= keep
  victim.vy *= keep
  return keep
}

/**
 * Outcome of a freeze attempt:
 *   'locked'  — frozen for the victim team's next turn (new lock);
 *   'already' — already locked for that turn (frost or Static Charge): no-op;
 *   'immune'  — was locked for the turn before it (no two turns in a row);
 *   'cracked' — it is the team's last launchable blade for that turn: the ice
 *               cracks off, no lock (VFX + SFX, B3);
 *   'none'    — not applicable (dead victim / not attempted).
 */
export type FrostLockResult = 'none' | 'locked' | 'already' | 'immune' | 'cracked'

/**
 * Frozen solid (Rule B). Call only when the carrier is the launched blade.
 * `team` = the victim's team (all its blades, dead ones included — they are
 * skipped); `teamTurn` = that team's current turn index `t`; the lock is for
 * `t + 1`. Sets `stunnedForTurn = t + 1`, `stunImmuneTurn = t + 2`,
 * `lockKind = 'frost'` (shared with Static Charge, so neither rule can lock
 * a blade on two turns in a row).
 */
export function tryFrostLock(victim: TraitBlade, team: readonly TraitBlade[], teamTurn: number): FrostLockResult {
  if (victim.hp <= 0) return 'none'
  const next = teamTurn + 1
  if (victim.stunnedForTurn === next) return 'already'
  if ((victim.stunImmuneTurn ?? -Infinity) >= next) return 'immune'
  let others = 0
  for (let i = 0; i < team.length; i++) {
    const b = team[i] as TraitBlade
    if (b !== victim && b.hp > 0 && b.stunnedForTurn !== next) others++
  }
  if (others === 0) return 'cracked'
  victim.stunnedForTurn = next
  victim.stunImmuneTurn = next + 1
  victim.lockKind = 'frost'
  return 'locked'
}

/** Is the blade frost-locked (frozen) for its team turn `turn`? */
export const isFrostLockedFor = (blade: TraitBlade, turn: number): boolean =>
  blade.lockKind === 'frost' && blade.stunnedForTurn === turn

/**
 * Never a lost turn (B3, §4.2 rule 2): at the START of team turn `turn`, if
 * the team has living blades but none may launch, clear the frost locks for
 * that turn (Static Charge stuns stay — a fully stunned team still skips as
 * the skills rule it). Immunity is kept (sim parity: a thawed blade still
 * cannot be frozen for the following turn). Returns the number thawed.
 */
export function thawFrostLocks(team: readonly TraitBlade[], turn: number): number {
  let living = 0
  for (let i = 0; i < team.length; i++) if ((team[i] as TraitBlade).hp > 0) living++
  if (living === 0 || countPickable(team, turn) > 0) return 0
  let thawed = 0
  for (let i = 0; i < team.length; i++) {
    const b = team[i] as TraitBlade
    if (b.hp > 0 && isFrostLockedFor(b, turn)) {
      b.stunnedForTurn = undefined
      b.lockKind = undefined
      thawed++
    }
  }
  return thawed
}

// ─── Frostbite (chill) ─────────────────────────────────────────────────────

/** Preallocate a potential victim's chill buffer (initGame, once per blade). */
export function initTraitVictim(blade: TraitBlade): void {
  const cap = BOSS_TRAIT_TUNING.CHILL_MAX
  if (blade.chillExp === undefined || blade.chillExp.length < cap) blade.chillExp = new Float64Array(cap)
  blade.chillN = 0
}

/**
 * Outcome of a chill touch:
 *   'added'     — new stack (speed −10 %, current velocity −10 %);
 *   'refreshed' — at the cap: the stack that expires first now expires with
 *                 the new one (no growth, no velocity cut — sim parity);
 *   'gated'     — within CHILL_GATE_MS of the victim's last stack;
 *   'none'      — not applicable (see `onTraitContact`).
 */
export type ChillResult = 'none' | 'gated' | 'added' | 'refreshed'

/**
 * One chill stack on `victim`. `teamTurn` = the victim team's current turn
 * index `t`; the stack expires when that team's turn `t + CHILL_TURNS` ends
 * (worked example: touched after your turn 7 → live on 8 and 9, gone when 9
 * ends). Does not check owner / phase (see `onTraitContact`).
 */
export function addChillStack(victim: TraitBlade, teamTurn: number, now: number): ChillResult {
  const T = BOSS_TRAIT_TUNING
  if (now - (victim.lastChillAt ?? -Infinity) < T.CHILL_GATE_MS) return 'gated'
  victim.lastChillAt = now
  const cap = T.CHILL_MAX
  let buf = victim.chillExp
  if (buf === undefined || buf.length < cap) {
    const grown = new Float64Array(cap)
    if (buf !== undefined) grown.set(buf)
    buf = victim.chillExp = grown
  }
  let n = victim.chillN ?? 0
  const exp = teamTurn + T.CHILL_TURNS
  if (n >= cap) {
    let mi = 0
    for (let i = 1; i < n; i++) if ((buf[i] as number) < (buf[mi] as number)) mi = i
    buf[mi] = exp
    victim.chillN = n
    return 'refreshed'
  }
  buf[n++] = exp
  victim.chillN = n
  const k = 1 - T.CHILL_PER_STACK
  victim.vx *= k
  victim.vy *= k
  return 'added'
}

/**
 * Remove every stack with expiry ≤ `endedTurn` (call when the victim team's
 * turn `endedTurn` ends — launched blade stopped or turn skipped — and again
 * at its next turn start with `turn − 1`; idempotent). Returns true when the
 * stack count changed (drop the `statsFor` cache / HUD).
 */
export function pruneChill(victim: TraitBlade, endedTurn: number): boolean {
  const n = victim.chillN ?? 0
  if (n === 0) return false
  const buf = victim.chillExp as Float64Array
  let w = 0
  for (let r = 0; r < n; r++) {
    const e = buf[r] as number
    if (e > endedTurn) buf[w++] = e
  }
  for (let r = w; r < n; r++) buf[r] = NaN
  victim.chillN = w
  return w !== n
}

/** `statsFor` factor: 1 − CHILL_PER_STACK × stacks (after powerup buffs). */
export function chillSpeedMul(blade: TraitBlade): number {
  const n = blade.chillN ?? 0
  return n === 0 ? 1 : 1 - BOSS_TRAIT_TUNING.CHILL_PER_STACK * n
}

/** Earliest expiry turn of the live stacks (NaN when none) — hash / HUD. */
export function chillEarliestExpiry(blade: TraitBlade): number {
  const n = blade.chillN ?? 0
  if (n === 0) return NaN
  const buf = blade.chillExp as Float64Array
  let m = buf[0] as number
  for (let i = 1; i < n; i++) if ((buf[i] as number) < m) m = buf[i] as number
  return m
}

// ─── Contact (resolveCollision armed branch) ───────────────────────────────

export interface TraitContactResult {
  /** Trait of the carrier that acted (null = nothing applied). */
  trait: BossTrait | null
  /** The victim was phased: every effect ignored. */
  phased: boolean
  /** Frost: speed kept by the cold touch (0 = gated / no touch). */
  keep: number
  /** Frost: freeze outcome ('none' when the carrier was not launched). */
  lock: FrostLockResult
  /** Chill: stack outcome. */
  chill: ChillResult
  /** Chill: live stacks after this contact. */
  stacks: number
}

export const createTraitContactResult = (): TraitContactResult =>
  ({ trait: null, phased: false, keep: 0, lock: 'none', chill: 'none', stacks: 0 })

/**
 * One ARMED contact of `carrier` onto `victim` — call twice per armed
 * contact, `(a, b)` and `(b, a)`, after the hits and reflections and before
 * the skills' `onEnemyContact` (§12.2 item 3). Applies only when the carrier
 * has a contact trait (frost / chill), both are alive, owners differ and the
 * victim is not phased at `now` (a Phase Step dodge on this very hit already
 * opened the window in `incomingSkill`, so it prevents drain, lock and stack).
 *
 * `victimTeam` / `victimTeamTurn` = the victim's team and its current turn
 * index (`turnIndexOf(victim.owner)`). Returns true when anything changed.
 */
export function onTraitContact(
  carrier: TraitBlade,
  victim: TraitBlade,
  now: number,
  launchedBladeId: number | null,
  victimTeam: readonly TraitBlade[],
  victimTeamTurn: number,
  out: TraitContactResult
): boolean {
  out.trait = null
  out.phased = false
  out.keep = 0
  out.lock = 'none'
  out.chill = 'none'
  out.stacks = victim.chillN ?? 0
  const trait = carrier.config.bossTrait
  if (trait === undefined || trait === 'ember') return false
  if (carrier.hp <= 0 || victim.hp <= 0 || carrier.owner === victim.owner) return false
  if (isPhased(victim, now)) {
    out.phased = true
    return false
  }
  out.trait = trait
  if (trait === 'frost') {
    out.keep = frostTouch(victim, now)
    if (launchedBladeId === carrier.id) out.lock = tryFrostLock(victim, victimTeam, victimTeamTurn)
    return out.keep > 0 || out.lock === 'locked'
  }
  out.chill = addChillStack(victim, victimTeamTurn, now)
  out.stacks = victim.chillN ?? 0
  return out.chill === 'added' || out.chill === 'refreshed'
}

// ─── Turn bookkeeping ──────────────────────────────────────────────────────

/**
 * End of team turn `endedTurn` (its launched blade stopped, or the turn was
 * skipped): drop expired chill stacks and the stale `lockKind` of locks that
 * are over. Returns true when HUD-visible state changed.
 */
export function endTeamTurnTraits(team: readonly TraitBlade[], endedTurn: number): boolean {
  let changed = false
  for (let i = 0; i < team.length; i++) {
    const b = team[i] as TraitBlade
    if (pruneChill(b, endedTurn)) changed = true
    if (b.lockKind !== undefined && !((b.stunnedForTurn ?? -Infinity) > endedTurn)) {
      b.lockKind = undefined
      changed = true
    }
  }
  return changed
}

/**
 * Start of team turn `turn`, BEFORE the selection / auto-select / skip check
 * (`countPickable`): re-apply chill expiry (`turn − 1`), then thaw an
 * all-frozen team. Returns the number of blades thawed (0 = none; > 0 → play
 * the crack VFX + HUD event).
 */
export function beginTeamTurnTraits(team: readonly TraitBlade[], turn: number): number {
  for (let i = 0; i < team.length; i++) pruneChill(team[i] as TraitBlade, turn - 1)
  return thawFrostLocks(team, turn)
}

// ─── HUD + hash ────────────────────────────────────────────────────────────

/** One HUD row per local blade (`bossTraitHud`, §12.2). */
export interface TraitHudRow {
  /** Frost-locked for its team's next turn (ice card, tap-shake). */
  frozen: boolean
  /** Live chill stacks (0…CHILL_MAX pips). */
  chill: number
}

export const createTraitHudRow = (): TraitHudRow => ({ frozen: false, chill: 0 })

/**
 * Fill `row` for `blade`; `nextTurn` = its team's next turn index
 * (`turnIndexOf(owner) + 1`). Returns true when the row changed (publish
 * with `triggerRef` only then).
 */
export function writeTraitHud(blade: TraitBlade, nextTurn: number, row: TraitHudRow): boolean {
  const frozen = blade.hp > 0 && isFrostLockedFor(blade, nextTurn)
  const chill = blade.hp > 0 ? (blade.chillN ?? 0) : 0
  if (row.frozen === frozen && row.chill === chill) return false
  row.frozen = frozen
  row.chill = chill
  return true
}

/** Does any blade carry a trait (the engine's `traitsActive` fast path)? */
export function hasBossTraits(blades: readonly TraitBlade[]): boolean {
  for (let i = 0; i < blades.length; i++) if ((blades[i] as TraitBlade).config.bossTrait !== undefined) return true
  return false
}

/**
 * Per-blade hash fragment (§9): lock kind, lock immunity, chill count and
 * earliest expiry (`stunnedForTurn` is already hashed by the skills).
 * Append only in matches with traits so trait-free hashes stay unchanged.
 */
export function traitHashPart(b: TraitBlade): string {
  const e = chillEarliestExpiry(b)
  return `${b.lockKind ?? '-'},${b.stunImmuneTurn ?? '-'},${b.chillN ?? 0},${Number.isNaN(e) ? '-' : e}`
}

/** Once-per-hash fragment: the combat clock (§9). */
export const bossClockHashPart = (c: BossClock): string => `${c.clockMs},${c.nextNovaAt}`
