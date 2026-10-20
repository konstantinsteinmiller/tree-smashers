// ─── Team + skill loadout sanitiser (PvP now, the league later) ─────────────
//
// Pure, dependency-light (types + pure catalogs only — no Vue, no composable),
// so the PvP message handler, the league's battle builder and tests can all
// run a peer-supplied (= untrusted) build through ONE rule set.
//
// Both sides of a lockstep match must feed the engine the SAME loadouts, so:
//   • the SENDER sanitises what it sends and keeps the sanitised copy locally,
//   • the RECEIVER re-sanitises what arrives (a modded or old client can send
//     anything) with the lobby config IT holds.
// Both run the same pure function on the same input → identical output.
//
// Skill loadout rules (skills-feature.md §9.1) — implemented by
// `use/skills/skillLoadoutSanitizer.ts` (catalog-dependent, so it is only ever
// loaded through the skills gate; a skills-off build passes no sanitiser and
// every skill loadout comes out empty):
//   • array of { id, level }; anything else → []
//   • unknown ids dropped; duplicates dropped (first one wins)
//   • level must be a finite number ≥ 1 (a level-0 skill is not learned →
//     dropped); floored, then clamped to SKILL_MAX_LEVEL (11 → 10)
//   • at most SKILL_TEAM_SLOTS (2) entries, in the sender's slot order
//   • `levelOne` lobbies clamp every level to 1
//
// Team rules (mirror the lobby's own `buildPvpTeam`):
//   • at most `teamSize` spinners (1 or 2), in order
//   • known top / bottom part ids only (an unknown entry is dropped)
//   • part levels: finite, floored, 0…PART_LEVEL_SANITY_MAX; `levelOne` → 1
//   • `modelId` kept only when it is a known skin id (it becomes an image path)
//   • `smasherId` (+ `level`): a known smasher id rebuilds the whole config
//     from the catalogue (`smasherConfig`, level clamped 1…30, `levelOne` →
//     1), so parts and part levels always match the smasher; an unknown id is
//     ignored and the entry falls back to its parts
//   • boss flags (`isBoss`, `bossAbility`, `bossStats`) are never accepted
//     from a peer — they are campaign-only engine switches

import { SPINNER_MODEL_IDS } from '@/data/skinCatalog'
import {
  BOTTOM_PART_IDS,
  TOP_PART_IDS,
  type BottomPartId,
  type SpinnerConfig,
  type TopPartId
} from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'
import { clampSmasherLevel, isSmasherId, smasherConfig } from '@/data/smasherCatalog'

/** Honest part levels grow slowly (upgrade costs escalate); anything past
 *  this is a tampered save or a hostile peer — clamp so stats stay finite. */
export const PART_LEVEL_SANITY_MAX = 200

/** A skill-loadout sanitiser (`sanitizeSkillLoadout`); null = skills off. */
export type SkillSanitizer = (raw: unknown, opts?: { levelOne?: boolean }) => SkillLoadout

export interface TeamSanitizeOptions {
  /** Lobby team size; longer teams are cut. */
  teamSize: number
  /** "Level 1" lobby: every part level becomes 1. */
  levelOne?: boolean
}

export interface SanitizedPvpLoadout {
  team: SpinnerConfig[]
  skills: SkillLoadout
}

const TOP_IDS = new Set<string>(Object.values(TOP_PART_IDS))
const BOTTOM_IDS = new Set<string>(Object.values(BOTTOM_PART_IDS))
const MODEL_IDS = new Set<string>(SPINNER_MODEL_IDS)

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const sanitizePartLevel = (v: unknown, levelOne: boolean | undefined): number | undefined => {
  if (levelOne) return 1
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(PART_LEVEL_SANITY_MAX, Math.floor(v)))
}

/**
 * Sanitise a PvP team (see the rules above). Returns only the fields the
 * engine reads from a remote spinner; never throws.
 */
export function sanitizePvpTeam(raw: unknown, opts: TeamSanitizeOptions): SpinnerConfig[] {
  if (!Array.isArray(raw)) return []
  const size = opts.teamSize === 2 ? 2 : 1
  const out: SpinnerConfig[] = []
  for (const entry of raw) {
    if (out.length >= size) break
    if (!isRecord(entry)) continue
    if (isSmasherId(entry.smasherId)) {
      const model = typeof entry.modelId === 'string' && MODEL_IDS.has(entry.modelId) ? entry.modelId : undefined
      out.push(smasherConfig(entry.smasherId, opts.levelOne ? 1 : clampSmasherLevel(entry.level), model))
      continue
    }
    const top = entry.topPartId
    const bottom = entry.bottomPartId
    if (typeof top !== 'string' || !TOP_IDS.has(top)) continue
    if (typeof bottom !== 'string' || !BOTTOM_IDS.has(bottom)) continue
    const cfg: SpinnerConfig = {
      topPartId: top as TopPartId,
      bottomPartId: bottom as BottomPartId
    }
    const tl = sanitizePartLevel(entry.topLevel, opts.levelOne)
    const bl = sanitizePartLevel(entry.bottomLevel, opts.levelOne)
    if (tl !== undefined) cfg.topLevel = tl
    if (bl !== undefined) cfg.bottomLevel = bl
    if (typeof entry.modelId === 'string' && MODEL_IDS.has(entry.modelId)) cfg.modelId = entry.modelId
    out.push(cfg)
  }
  return out
}

/**
 * Sanitise a whole player build (team + skills) against a lobby config.
 * `null` = unusable (no valid spinner left) — the caller must not mark that
 * peer ready. `sanitizeSkills` null (a skills-off build, or before the gate
 * resolved it) → the skills are ignored: always `[]`.
 */
export function sanitizePvpLoadout(
  team: unknown,
  skills: unknown,
  opts: TeamSanitizeOptions,
  sanitizeSkills: SkillSanitizer | null
): SanitizedPvpLoadout | null {
  const cleanTeam = sanitizePvpTeam(team, opts)
  if (cleanTeam.length === 0) return null
  return { team: cleanTeam, skills: sanitizeSkills ? sanitizeSkills(skills, { levelOne: opts.levelOne }) : [] }
}

/** Σ skill levels of a loadout (honour maths, power displays). */
export function skillLevelSum(loadout: SkillLoadout | null | undefined): number {
  if (!loadout) return 0
  let sum = 0
  for (const s of loadout) sum += s.level
  return sum
}
