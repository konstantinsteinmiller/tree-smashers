// ─── Leaderboard ghost skill loadouts (skills-feature.md §9.1) ─────────────
//
// Moved out of useLeaderboard.ts so the board carries no skill code: the
// arena derives a ghost's loadout at fight time through the lazily loaded
// arena skills module (skills builds only). Pure and deterministic in
// (`id`, `maxStage`) — a rematch replays the same loadout.

import { SKILLS, SKILL_MAX_LEVEL, unlockedSkillIds, unlockedSlotCount } from '@/data/skillCatalog'
import type { SkillId, SkillLoadout } from '@/types/skills'
import { createRng } from '@/use/useDeterministicRng'

/**
 * How much a skill is worth to a ghost in a ghost fight — the L10 median
 * power index from skills-feature.md §3.4. Ghost fights always run in the
 * 'default' arena (no lava / thunder / shock), so Hazard Ward, whose value
 * is all hazards, is scored as worthless there.
 */
export const GHOST_SKILL_VALUE: Readonly<Record<SkillId, number>> = Object.freeze({
  second_wind: 1.16,
  guard_shell: 1.15,
  opening_salvo: 1.13,
  phase_step: 1.11,
  mirror_plate: 1.09,
  homing_rockets: 1.08,
  lucky_edge: 1.08,
  momentum: 1.04,
  static_charge: 1.02,
  hazard_ward: 1.0
})

/** Seeded tie-break spread: skills within this much PI of each other trade
 *  places between ghosts, so the board does not field one identical pair. */
const GHOST_VALUE_JITTER = 0.03

/** FNV-1a over the entry id → the entry's own RNG seed. */
const hashId = (id: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The skill loadout a leaderboard ghost fights with (§9.1). Pure and
 * deterministic in (`id`, `maxStage`) — a rematch replays the same loadout,
 * and it only changes when the ghost climbs:
 *   • the ghost has cleared `maxStage − 1` (the player's own unlock rule):
 *     skills unlocked by then, 1 slot from the stage-10 boss, 2 from stage 20
 *   • the `slots` highest-value skills (GHOST_SKILL_VALUE + a seeded
 *     jitter from the entry's RNG, drawn in unlock order)
 *   • level = clamp(1 + ⌊(maxStage − unlockStage) / 7⌋, 1, 10)
 *   • returned in unlock order (slot 1 = the earlier skill)
 * Ignores the feature flag (pure rule); only a skills build ever loads it.
 */
export const ghostSkillLoadout = (entry: { id: string; maxStage: number }): SkillLoadout => {
  const maxStage = Math.floor(Number.isFinite(entry.maxStage) ? entry.maxStage : 0)
  const cleared = maxStage - 1
  const slots = unlockedSlotCount(cleared)
  if (slots === 0) return []
  const pool = unlockedSkillIds(cleared) // unlock order — fixed draw order
  const rng = createRng(hashId(entry.id))
  const scored = pool.map(id => ({ id, score: GHOST_SKILL_VALUE[id] + rng() * GHOST_VALUE_JITTER }))
  scored.sort((a, b) => b.score - a.score)
  const picked = new Set(scored.slice(0, slots).map(s => s.id))
  return pool
    .filter(id => picked.has(id))
    .map(id => ({
      id,
      level: Math.max(1, Math.min(SKILL_MAX_LEVEL, 1 + Math.floor((maxStage - SKILLS[id].unlockStage) / 7)))
    }))
}
