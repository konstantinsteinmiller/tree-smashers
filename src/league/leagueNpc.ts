/**
 * ─── League NPC generator (LG1) ─────────────────────────────────────────────
 *
 * The bottom rung of the opponent ladder (live pool → device cache → baked
 * pool → THIS): a seeded team at a requested power, so the league always has
 * three cards to show — offline, on a kids build, on a fresh Worker with an
 * empty pool.
 *
 * WORKER-SHARED (league plan F5): the Worker regenerates an NPC opponent from
 * its id alone (`npcBuildFromId`) to recompute its power server-side. So:
 * relative imports only (no alias paths), no build-time env reads, no Vue, no
 * DOM, no Date.now(). Every function is pure and deterministic.
 *
 * IDS: `npc:<band>:<seed>` — `band` is the target team power the build was
 * generated for (an integer 1…NPC_MAX_POWER), `seed` an unsigned 32-bit int.
 * `generateNpcBuild(seed, band)` reproduces the build byte for byte anywhere.
 *
 * CATALOG: the part, skin and skill ids below are an EMBEDDED subset — the
 * Worker validates builds structurally and cannot import the client catalogs
 * (they pull in platform flags). Only long-standing ids are listed;
 * tests/leagueOpponents.test.ts cross-checks every one against the real
 * catalogs, so a rename fails the suite rather than a battle.
 */
import { createRng } from '../use/useDeterministicRng'
import { safeNameFor } from '../utils/nameDenylist'
import {
  BUILD_MAX_PART_LEVEL,
  BUILD_MAX_SKILL_LEVEL,
  buildPower,
  buildSkillPower,
  type PlayerBuildSkill,
  type PlayerBuildSpinner,
  type PlayerBuildV1
} from '../utils/playerBuild'

// ─── Embedded catalog subset ────────────────────────────────────────────────

/** Top part → the skins an NPC may wear with it (the four oldest regular
 *  skins of each top: no special, no ad-unlock, no earn-only trophy skin). */
export const NPC_SKINS_BY_TOP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  star: ['blades', 'ice', 'wasp', 'reddragon'],
  triangle: ['thunder', 'snake', 'phoenix', 'eagle'],
  round: ['nature', 'turtle', 'piranha', 'bear'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic'],
  cushioned: ['shell', 'shield', 'castle', 'mountain'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk']
})
export const NPC_TOP_IDS: readonly string[] = Object.freeze(Object.keys(NPC_SKINS_BY_TOP))
export const NPC_BOTTOM_IDS: readonly string[] = Object.freeze(['speedy', 'tanky', 'balanced'])
export const NPC_SKILL_IDS: readonly string[] = Object.freeze([
  'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets',
  'opening_salvo', 'momentum', 'hazard_ward', 'static_charge', 'mirror_plate'
])

// ─── Power bounds ───────────────────────────────────────────────────────────

const PART_SLOTS = 4
/** Highest power the generator can hit: four maxed parts + two maxed skills. */
export const NPC_MAX_POWER =
  PART_SLOTS * BUILD_MAX_PART_LEVEL +
  buildSkillPower(PART_SLOTS * BUILD_MAX_PART_LEVEL, [BUILD_MAX_SKILL_LEVEL, BUILD_MAX_SKILL_LEVEL])
/** Power from which an NPC carries one skill, and two (≈ the campaign's
 *  skill unlock at stage 10 / slot 2 at stage 20 in team power). */
export const NPC_ONE_SKILL_POWER = 20
export const NPC_TWO_SKILLS_POWER = 40
/** Skills never make up more than this share of an NPC's power. */
const MAX_SKILL_SHARE = 0.3

/** Salt so an NPC seed never replays another system's createRng stream. */
const NPC_RNG_SALT = 0x1ea9e0c7

export interface NpcOptions {
  /** false → no skills (a skills-off build): the parts carry all the power. */
  skills?: boolean
}

const clampPower = (p: number): number => {
  const n = Math.round(Number(p))
  return Number.isFinite(n) ? Math.min(NPC_MAX_POWER, Math.max(1, n)) : 1
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))] as T

/**
 * A deterministic NPC build at `targetPower` (clamped to 1…NPC_MAX_POWER).
 * `buildPower(result)` hits the target (±1 where rounding of the skill power
 * skips it; always within ±5 %).
 */
export const generateNpcBuild = (seed: number, targetPower: number, opts: NpcOptions = {}): PlayerBuildV1 => {
  const target = clampPower(targetPower)
  const rng = createRng(((seed >>> 0) ^ NPC_RNG_SALT) >>> 0)

  // Skills first: count by power, levels scaled with it, share capped.
  const sk: PlayerBuildSkill[] = []
  if (opts.skills !== false) {
    const count = target >= NPC_TWO_SKILLS_POWER ? 2 : target >= NPC_ONE_SKILL_POWER ? 1 : 0
    const pool = [...NPC_SKILL_IDS]
    for (let i = 0; i < count; i++) {
      const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
      const id = pool.splice(idx, 1)[0] as string
      const lv = Math.round((target / 14) * (0.8 + 0.4 * rng()))
      sk.push({ id, lv: Math.min(BUILD_MAX_SKILL_LEVEL, Math.max(1, lv)) })
    }
    // Keep the skill share bounded (small teams stay part-driven).
    const cap = Math.max(0, Math.floor(target * MAX_SKILL_SHARE))
    // (skill power grows with the parts; measured at the whole target it is an upper bound)
    while (sk.length > 0 && buildSkillPower(target, sk.map((k) => k.lv)) > cap) {
      const top = sk.reduce((m, k) => (k.lv > m.lv ? k : m))
      if (top.lv > 1) top.lv--
      else sk.pop()
    }
  }
  // Parts: parts + buildSkillPower(parts) should equal the target. Skill power
  // grows by < 1 per part level, so the fixed point is reached in a few steps
  // (within ±1 of the target where rounding skips it).
  const lvs = sk.map((k) => k.lv)
  let parts = Math.min(PART_SLOTS * BUILD_MAX_PART_LEVEL, target)
  for (let i = 0; i < 8; i++) {
    const next = Math.max(0, Math.min(PART_SLOTS * BUILD_MAX_PART_LEVEL, target - buildSkillPower(parts, lvs)))
    if (next === parts) break
    parts = next
  }

  // Split the parts over 4 slots with jittered weights, exactly.
  const weights = Array.from({ length: PART_SLOTS }, () => 0.7 + 0.6 * rng())
  const wSum = weights.reduce((a, b) => a + b, 0)
  const levels = weights.map((w) => Math.min(BUILD_MAX_PART_LEVEL, Math.floor((parts * w) / wSum)))
  let rest = parts - levels.reduce((a, b) => a + b, 0)
  for (let guard = 0; rest > 0 && guard < 10_000; guard++) {
    const i = Math.floor(rng() * PART_SLOTS)
    if ((levels[i] as number) < BUILD_MAX_PART_LEVEL) {
      levels[i] = (levels[i] as number) + 1
      rest--
    }
  }

  const team: PlayerBuildSpinner[] = []
  for (let s = 0; s < 2; s++) {
    const t = pick(NPC_TOP_IDS, rng())
    const b = pick(NPC_BOTTOM_IDS, rng())
    const m = pick(NPC_SKINS_BY_TOP[t] as readonly string[], rng())
    team.push({ t, b, tl: levels[s * 2] as number, bl: levels[s * 2 + 1] as number, m })
  }
  return { v: 1, team, sk }
}

// ─── Ids and names ──────────────────────────────────────────────────────────

const NPC_ID_RE = /^npc:(\d{1,4}):(\d{1,10})$/

/** `npc:<band>:<seed>` — band = the (clamped) target power, seed uint32. */
export const npcId = (band: number, seed: number): string => `npc:${clampPower(band)}:${seed >>> 0}`

/** Parse an NPC id; null when it is not one (or out of range). */
export const parseNpcId = (id: unknown): { band: number; seed: number } | null => {
  if (typeof id !== 'string') return null
  const m = NPC_ID_RE.exec(id)
  if (!m) return null
  const band = Number(m[1])
  const seed = Number(m[2])
  if (band < 1 || band > NPC_MAX_POWER || seed > 0xffffffff) return null
  return { band, seed }
}

export const isNpcId = (id: unknown): boolean => parseNpcId(id) !== null

/** Regenerate an NPC's build from its id (the Worker's recompute path). */
export const npcBuildFromId = (id: unknown, opts: NpcOptions = {}): PlayerBuildV1 | null => {
  const p = parseNpcId(id)
  return p === null ? null : generateNpcBuild(p.seed, p.band, opts)
}

/** Power of an NPC id's build; null when the id is not an NPC id. */
export const npcPowerFromId = (id: unknown, opts: NpcOptions = {}): number | null => {
  const b = npcBuildFromId(id, opts)
  return b === null ? null : buildPower(b)
}

/**
 * A safe, generated display name for any opponent id (NPC, baked, or a real
 * player on a kids build) — the same guest-style stand-in the denylist masks
 * names with, so it never advertises being generated.
 */
export const generatedOpponentName = (id: string): string => safeNameFor(`league:${id}`)
