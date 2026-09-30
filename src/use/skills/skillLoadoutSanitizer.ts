// ─── Skill loadout sanitiser (PvP receive side, the league later) ──────────
//
// Split out of `use/loadoutSanitizer.ts` because it needs the catalog (known
// ids, max level, slot count): it is loaded only through the skills gate
// (`loadSkillLoadoutSanitizer`), so a skills-off build never bundles it. The
// rules are listed in loadoutSanitizer.ts.

import { SKILL_MAX_LEVEL, SKILL_TEAM_SLOTS, isSkillId } from '@/data/skillCatalog'
import type { SkillId, SkillLoadout } from '@/types/skills'

export interface SkillSanitizeOptions {
  /** "Level 1" lobby: every skill fights at L1. */
  levelOne?: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Sanitise a skill loadout (see the rules above). Never throws; returns a
 * fresh array, the input is not mutated.
 */
export function sanitizeSkillLoadout(raw: unknown, opts: SkillSanitizeOptions = {}): SkillLoadout {
  if (!Array.isArray(raw)) return []
  const out: SkillLoadout = []
  const seen = new Set<SkillId>()
  for (const entry of raw) {
    if (out.length >= SKILL_TEAM_SLOTS) break
    if (!isRecord(entry)) continue
    const id = entry.id
    if (!isSkillId(id) || seen.has(id)) continue
    const lvRaw = entry.level
    if (typeof lvRaw !== 'number' || !Number.isFinite(lvRaw) || lvRaw < 1) continue
    const level = opts.levelOne ? 1 : Math.min(SKILL_MAX_LEVEL, Math.floor(lvRaw))
    seen.add(id)
    out.push({ id, level })
  }
  return out
}
