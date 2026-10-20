// Skill runtime — the pure, deterministic hook functions the physics loop calls
// (skills-feature.md §4 skills, §5 order of operations, §9.1 PvP streams,
// §10.3 hook points). NO Vue, no engine imports, no wall clock: every timing
// input is the caller's `gameTime()` (virtual tick clock in PvP), passed in as
// `now`.
//
// Contract highlights
//   • Owner-agnostic: "enemy" = a blade with a different `owner`. Player blades
//     and PvP-remote (`npc`) blades run through the same code. Same-owner pairs
//     (friendly fire, allies) never trigger a skill.
//   • Per-blade RNG streams: every bearer draws only from its own mulberry32
//     stream seeded by (match seed, syncKey) — never `matchRng()`. Both PvP
//     peers derive identical streams because `syncKey` is peer-independent, and
//     a match without skills never draws, so the physics stream is untouched.
//   • Zero allocation in the hot path: bitmask checks against resolved numeric
//     params stored on the runtime object at battle start; results go into
//     caller-owned `out` objects created once (see the `create*Result`
//     factories). No closures are created per call.
//   • No recursion: only collision hits (kind 'hit') roll Lucky Edge, Momentum,
//     Phase Step or Mirror Plate; `applyHpLoss` never calls back into them, and
//     the rocket counter is driven by contacts (`onEnemyContact`), never by
//     damage — so reflect / rocket / salvo / chip / hazard damage cannot proc
//     anything, and a reflection cannot be reflected.
//   • Numbers: every magnitude comes from `skillParams()` (catalog table ×
//     SKILL_POWER_SCALE); the product of attacker skill multipliers is clamped
//     to SKILL_HIT_MUL_CAP. The few fixed rule constants below (phase window,
//     rocket flight time, shock keep, …) are rules of §4, not tuning values.

import {
  SKILL_BIT,
  SKILL_HIT_MUL_CAP,
  SKILL_MAX_LEVEL,
  SKILL_BLADE_SLOTS,
  applySkillMods,
  isSkillId,
  skillParams,
  type BladeSkills,
  type SkillId,
  type SkillLoadout
} from '@/data/skillCatalog'
import { createRng } from '@/use/useDeterministicRng'
import {
  B_LUCKY, B_MIRROR, B_MOMENTUM, B_PHASE, B_ROCKETS, B_SALVO, B_SHELL, B_STATIC, B_WARD, B_WIND,
  SHOCK_BASE_KEEP, STATIC_SHOCK_COOLDOWN_MS, PHASE_WINDOW_MS, ROCKET_FLIGHT_MS,
  REF_HIT_SPEED_FRACTION, REF_HIT_SPEED_MUL_CAP, applyHpLoss, isPhased,
  type ContactSkillResult, type HpLossKind, type HpLossResult, type IncomingSkillResult,
  type OutgoingSkillResult, type SkillBlade, type SkillRefStats, type SkillRuntime
} from '@/use/skills/skillCore'

// The string-free core (HP loss, stun/phase bookkeeping, result types) lives in
// skillCore.ts so the engine and the boss traits can use it on a skills-off
// build; re-exported here so the runtime stays the one import for skill code.
export * from '@/use/skills/skillCore'

// ─── Rule constants (§4; not tuning knobs) ─────────────────────────────────


// Mirrors of engine constants in useSpinnerGame.ts (tests/skillRuntime.test.ts
// reads the engine source and fails on drift). Kept local so this module stays
// importable without the Vue engine graph.
/** = useSpinnerGame BASE_MAX_FORCE */
export const ENGINE_BASE_MAX_FORCE = 14
/** = useSpinnerGame DAMAGE_SCALE */
export const ENGINE_DAMAGE_SCALE = 1.4
/** = useSpinnerGame STOP_THRESHOLD */
export const ENGINE_STOP_THRESHOLD = 0.25


// ─── Per-blade RNG streams (§9.1) ──────────────────────────────────────────

/** Salt so no blade stream can coincide with the match stream (seeded `seed`). */
const STREAM_SALT = 0x9e3779b9

/** murmur3 fmix32 — a bijection on uint32, so distinct syncKeys → distinct seeds. */
function fmix32(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Seed of the skill stream of the blade `syncKey` in the match seeded `seed`. */
export function bladeStreamSeed(seed: number, syncKey: number): number {
  return ((seed >>> 0) ^ fmix32(((syncKey | 0) ^ STREAM_SALT) >>> 0)) >>> 0 || 1
}

/** A standalone copy of a blade's skill stream (tests, tools, the sim). The
 *  runtime keeps the same stream inline in `SkillRuntime.rngState`. */
export const bladeStream = (seed: number, syncKey: number): (() => number) =>
  createRng(bladeStreamSeed(seed, syncKey))

/** Draw [0, 1) from the bearer's own stream (same algorithm as createRng). */
function roll(s: SkillRuntime): number {
  if (s.rng !== null) return s.rng()
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ─── Battle start ──────────────────────────────────────────────────────────

const clampLevel = (level: number): number =>
  Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))

/**
 * Build a bearer's runtime state at battle start (initGame). Returns
 * `undefined` for an empty / fully invalid loadout — leave `blade.skills`
 * unset then, so the engine's `!a.skills && !b.skills` fast path (and the
 * empty-loadout hash baseline) stays intact.
 *
 * Sanitises: unknown ids and duplicates dropped, at most SKILL_BLADE_SLOTS
 * entries, levels clamped to 1…10.
 *
 * @param seed    the match seed (`getMatchSeed()` / `currentMatchSeed()`)
 * @param syncKey the blade's peer-independent key
 * @param rng     optional stream override (tests / tools only)
 */
export function createBladeSkills(
  loadout: SkillLoadout | null | undefined,
  maxHp: number,
  syncKey: number,
  seed: number,
  rng: (() => number) | null = null
): SkillRuntime | undefined {
  if (!loadout || loadout.length === 0) return undefined
  const ids: SkillId[] = []
  const lv: Partial<Record<SkillId, number>> = {}
  const mods: Partial<Record<SkillId, Partial<Record<string, number>>>> = {}
  let has = 0
  for (const entry of loadout) {
    if (ids.length >= SKILL_BLADE_SLOTS) break
    const id = entry?.id
    if (!isSkillId(id) || (has & SKILL_BIT[id]) !== 0) continue
    ids.push(id)
    lv[id] = clampLevel(entry.level)
    if (entry.mods) mods[id] = entry.mods
    has |= SKILL_BIT[id]
  }
  if (has === 0) return undefined

  const s: SkillRuntime = {
    ids,
    lv,
    has,
    shield: 0,
    shieldMax: 0,
    dodgeReadyAt: -Infinity,
    phasedUntil: -Infinity,
    secondWindUsed: false,
    stacks: 0,
    rocketCount: 0,
    rngState: bladeStreamSeed(seed, syncKey),
    rng,
    mirrorChance: 0,
    mirrorShare: 0,
    phaseChance: 0,
    phaseCooldownMs: 0,
    windThreshold: 0,
    windHeal: 0,
    luckyChance: 0,
    luckyMult: 1,
    momentumPerStack: 0,
    momentumMaxStacks: 0,
    rocketEveryN: 0,
    rocketFrac: 0,
    rocketMaxTargets: 0,
    salvoPct: 0,
    staticChance: 0,
    wardLava: 0,
    wardThunder: 0,
    wardChip: 0,
    wardShockKeep: 0
  }
  for (const id of ids) {
    const level = lv[id] as number
    switch (id) {
      case 'mirror_plate': {
        const p = applySkillMods(skillParams('mirror_plate', level), mods.mirror_plate)
        s.mirrorChance = p.chance
        s.mirrorShare = p.share
        break
      }
      case 'phase_step': {
        const p = applySkillMods(skillParams('phase_step', level), mods.phase_step)
        s.phaseChance = p.chance
        s.phaseCooldownMs = p.cooldownMs
        break
      }
      case 'guard_shell': {
        const p = applySkillMods(skillParams('guard_shell', level), mods.guard_shell)
        s.shieldMax = s.shield = Math.max(1, Math.round(maxHp * p.shield))
        break
      }
      case 'second_wind': {
        const p = applySkillMods(skillParams('second_wind', level), mods.second_wind)
        s.windThreshold = p.threshold
        s.windHeal = p.heal
        break
      }
      case 'lucky_edge': {
        const p = applySkillMods(skillParams('lucky_edge', level), mods.lucky_edge)
        s.luckyChance = p.chance
        s.luckyMult = p.mult
        break
      }
      case 'momentum': {
        const p = applySkillMods(skillParams('momentum', level), mods.momentum)
        s.momentumPerStack = p.perStack
        s.momentumMaxStacks = p.maxStacks
        break
      }
      case 'homing_rockets': {
        const p = applySkillMods(skillParams('homing_rockets', level), mods.homing_rockets)
        s.rocketEveryN = p.everyN
        s.rocketFrac = p.frac
        s.rocketMaxTargets = p.maxTargets
        break
      }
      case 'opening_salvo':
        s.salvoPct = applySkillMods(skillParams('opening_salvo', level), mods.opening_salvo).pct
        break
      case 'static_charge':
        s.staticChance = applySkillMods(skillParams('static_charge', level), mods.static_charge).chance
        break
      case 'hazard_ward': {
        const p = applySkillMods(skillParams('hazard_ward', level), mods.hazard_ward)
        s.wardLava = p.lava
        s.wardThunder = p.thunder
        s.wardChip = p.chip
        s.wardShockKeep = p.shockKeep
        break
      }
    }
  }
  return s
}

/** True when `blade` carries `id` (O(1) bitmask; UI / engine convenience). */
export const hasSkill = (blade: SkillBlade, id: SkillId): boolean =>
  blade.skills !== undefined && (blade.skills.has & SKILL_BIT[id]) !== 0

// ─── §5 step 2 — attacker skills ───────────────────────────────────────────

/**
 * Attacker-side multiplier for one collision hit A→B (§5 step 2): Lucky Edge
 * (skipped when the hit is already a positional / Star crit) → Momentum
 * (`1 + perStack·stacks`, then stacks + 1 while A is the launched blade) →
 * clamp the product to SKILL_HIT_MUL_CAP. Returns the multiplier (1 when no
 * skill applies); multiply the hit by it before the defender step.
 *
 * Rolls only for kind 'hit', dmg > 0 and an enemy target.
 */
export function outgoingSkillMul(
  att: SkillBlade,
  def: SkillBlade,
  dmg: number,
  kind: HpLossKind,
  isCrit: boolean,
  launchedBladeId: number | null,
  out: OutgoingSkillResult
): number {
  out.mul = 1
  out.lucky = false
  out.momentumStacks = 0
  out.clamped = false
  const s = att.skills as SkillRuntime | undefined
  if (s === undefined || kind !== 'hit' || !(dmg > 0) || att.owner === def.owner) return 1
  let mul = 1
  if ((s.has & B_LUCKY) !== 0 && !isCrit && roll(s) < s.luckyChance) {
    mul *= s.luckyMult
    out.lucky = true
  }
  if ((s.has & B_MOMENTUM) !== 0 && launchedBladeId === att.id) {
    out.momentumStacks = s.stacks
    mul *= 1 + s.momentumPerStack * s.stacks
    if (s.stacks < s.momentumMaxStacks) s.stacks++
  }
  if (mul > SKILL_HIT_MUL_CAP) {
    mul = SKILL_HIT_MUL_CAP
    out.clamped = true
  }
  out.mul = mul
  return mul
}

// ─── §5 step 3 — defender skills ───────────────────────────────────────────

/**
 * Defender-side resolution of one collision hit A→B (§5 step 3): an open
 * phase window negates it; else Phase Step (off cooldown) rolls and, if it
 * fires, negates it and stops; else Mirror Plate rolls (takes
 * `dmg·(1−share)`, reflects `dmg·share / max(1, attackerDefense)`).
 *
 * `attackerDefense` = the attacker's `statsFor(att).defenseMultiplier`.
 * Rolls only for kind 'hit', dmg > 0 and an enemy attacker; otherwise
 * `out.taken = dmg` untouched.
 */
export function incomingSkill(
  def: SkillBlade,
  att: SkillBlade,
  dmg: number,
  kind: HpLossKind,
  now: number,
  attackerDefense: number,
  out: IncomingSkillResult
): void {
  out.taken = dmg
  out.reflect = 0
  out.dodged = false
  out.phased = false
  out.mirrored = false
  const s = def.skills as SkillRuntime | undefined
  if (s === undefined || kind !== 'hit' || !(dmg > 0) || att.owner === def.owner) return
  if (now < s.phasedUntil) {
    out.taken = 0
    out.phased = true
    return
  }
  if ((s.has & B_PHASE) !== 0 && now >= s.dodgeReadyAt && roll(s) < s.phaseChance) {
    s.dodgeReadyAt = now + s.phaseCooldownMs
    s.phasedUntil = now + PHASE_WINDOW_MS
    out.taken = 0
    out.dodged = true
    return
  }
  if ((s.has & B_MIRROR) !== 0 && roll(s) < s.mirrorChance) {
    out.taken = dmg * (1 - s.mirrorShare)
    out.reflect = (dmg * s.mirrorShare) / Math.max(1, attackerDefense)
    out.mirrored = true
  }
}

// ─── Reference hit (Homing Rockets) ────────────────────────────────────────

/**
 * The collision formula at 50 % of the attacker's max speed (speed factor
 * capped at 1.5), no crit / combo / speed advantage, with the attacker's
 * Piercer/Star defence rule and the target's weight + defence (§4.6).
 * Pass `statsFor(...)` of both blades (split-child modifiers included).
 */
export function refHit(att: SkillRefStats, attTopPartId: string, def: SkillRefStats): number {
  let defMul = def.defenseMultiplier
  if (attTopPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
  else if (attTopPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
  const spd = att.speedMultiplier < REF_HIT_SPEED_MUL_CAP ? att.speedMultiplier : REF_HIT_SPEED_MUL_CAP
  const closing = REF_HIT_SPEED_FRACTION * ENGINE_BASE_MAX_FORCE * spd
  return ((closing * att.damageMultiplier * att.totalWeight) / (def.totalWeight * defMul)) * ENGINE_DAMAGE_SCALE
}

// ─── §5 step 6 — contact skills ────────────────────────────────────────────

const isInvulnerableAt = (b: SkillBlade, now: number): boolean =>
  b.invulnerableUntil !== undefined && now < b.invulnerableUntil

const isLinked = (a: SkillBlade, b: SkillBlade): boolean =>
  (a.linkedIds !== undefined && a.linkedIds.includes(b.id)) ||
  (b.linkedIds !== undefined && b.linkedIds.includes(a.id))

/**
 * Pick up to `max` volley targets from `foes` into out.volleyTargets:
 * enemies of `bearer`, alive, not invulnerable, lowest HP first (ties by
 * syncKey — array order differs between PvP peers), ghost-linked twins
 * counted once. O(max·n), no allocation.
 */
function pickVolleyTargets<T extends SkillBlade>(
  bearer: SkillBlade,
  foes: readonly T[],
  now: number,
  max: number,
  out: ContactSkillResult<T>
): number {
  const tg = out.volleyTargets
  let count = 0
  for (let k = 0; k < max && k < tg.length; k++) {
    let best: T | null = null
    for (let i = 0; i < foes.length; i++) {
      const f = foes[i] as T
      if (f.owner === bearer.owner || f.hp <= 0 || isInvulnerableAt(f, now)) continue
      let taken = false
      for (let j = 0; j < count; j++) {
        const c = tg[j] as T
        if (c === f || isLinked(c, f)) {
          taken = true
          break
        }
      }
      if (taken) continue
      if (best === null || f.hp < best.hp || (f.hp === best.hp && f.syncKey < best.syncKey)) best = f
    }
    if (best === null) break
    tg[count++] = best
  }
  for (let j = count; j < tg.length; j++) tg[j] = null
  return count
}

/**
 * Once per ARMED contact between `bearer` and an enemy (§5 step 6), after
 * both hits and the reflections are applied — call it for EACH blade of the
 * pair that carries skills (owner-agnostic):
 *
 *   • Homing Rockets: +1 contact; at `everyN` the counter resets and a volley
 *     is chosen from `foes` (the bearer's enemy team; filtered here). Each
 *     rocket deals `max(1, frac·refHit(bearer, target) / count)`, landing at
 *     `now + ROCKET_FLIGHT_MS` — apply with `applyHpLoss(t, d, 'rocket')` via
 *     the engine's damage path; skip targets dead / invulnerable on arrival.
 *   • Static Charge: only when `enemy` is the launched blade, alive and still
 *     moving; shares the 250 ms `lastShockMs` gate; on a proc the enemy keeps
 *     10 % speed and is stunned for `enemyTurnIndex + 1` unless immune (a
 *     blade stunned for turn T cannot be stunned for T + 1).
 *
 * `enemyTurnIndex` = the enemy team's turn counter for the launch in progress
 * (`npcTurnIndex` after its increment in `launchNpc`; per side in PvP).
 * `statsOf` = the engine's `statsFor` (passed by reference, not a new closure).
 */
export function onEnemyContact<T extends SkillBlade>(
  bearer: SkillBlade,
  enemy: SkillBlade,
  now: number,
  launchedBladeId: number | null,
  enemyTurnIndex: number,
  foes: readonly T[],
  statsOf: (b: SkillBlade) => SkillRefStats,
  out: ContactSkillResult<T>
): void {
  out.volley = false
  out.volleyCount = 0
  out.volleyArriveAt = 0
  out.shocked = false
  out.stunned = false
  out.stunTurn = 0
  const s = bearer.skills as SkillRuntime | undefined
  if (s === undefined || bearer.hp <= 0 || bearer.owner === enemy.owner) return

  if ((s.has & B_ROCKETS) !== 0) {
    s.rocketCount++
    if (s.rocketCount >= s.rocketEveryN) {
      s.rocketCount = 0
      out.volley = true
      const n = pickVolleyTargets(bearer, foes, now, s.rocketMaxTargets, out)
      out.volleyCount = n
      out.volleyArriveAt = now + ROCKET_FLIGHT_MS
      if (n > 0) {
        const bs = statsOf(bearer)
        for (let i = 0; i < n; i++) {
          const d = (s.rocketFrac * refHit(bs, bearer.config.topPartId, statsOf(out.volleyTargets[i] as T))) / n
          out.volleyDamage[i] = d > 1 ? d : 1
        }
      }
    }
  }

  if (
    (s.has & B_STATIC) !== 0 &&
    enemy.hp > 0 &&
    launchedBladeId === enemy.id &&
    Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy) > ENGINE_STOP_THRESHOLD &&
    now - (enemy.lastShockMs ?? -Infinity) >= STATIC_SHOCK_COOLDOWN_MS &&
    roll(s) < s.staticChance
  ) {
    enemy.lastShockMs = now
    enemy.vx *= SHOCK_BASE_KEEP
    enemy.vy *= SHOCK_BASE_KEEP
    out.shocked = true
    const next = enemyTurnIndex + 1
    if ((enemy.stunImmuneTurn ?? -Infinity) < next) {
      enemy.stunnedForTurn = next
      enemy.stunImmuneTurn = next + 1
      out.stunned = true
      out.stunTurn = next
    }
  }
}

// ─── Opening Salvo (§4.7) ──────────────────────────────────────────────────

/** Salvo percent a team fires (highest carrier; 0 = no salvo). Once per team. */
export function teamSalvoPct(team: readonly SkillBlade[]): number {
  let pct = 0
  for (let i = 0; i < team.length; i++) {
    const s = (team[i] as SkillBlade).skills as SkillRuntime | undefined
    if (s !== undefined && (s.has & B_SALVO) !== 0 && s.salvoPct > pct) pct = s.salvoPct
  }
  return pct
}

/** Non-lethal salvo damage on one living enemy: `min(max(1, pct·maxHp), hp − 1)`,
 *  0 when nothing to take. Apply with kind 'salvo'. */
export function salvoDamage(target: SkillBlade, pct: number): number {
  if (!(pct > 0) || target.hp <= 1) return 0
  const d = pct * target.maxHp
  const want = d > 1 ? d : 1
  const cap = target.hp - 1
  return want < cap ? want : cap
}
