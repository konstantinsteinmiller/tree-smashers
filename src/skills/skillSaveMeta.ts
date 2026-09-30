// ─── Skill levels in the save-merge score (SaveMergePolicy, G4) ─────────────
//
// A flag-boundary module (src/skills/ — never obfuscated; imports only other
// boundary modules): SaveMergePolicy calls it behind `SKILLS_BUILD`, so a
// skills-off build folds the call away and drops this file, the key and the
// id list with it.

import { SKILL_IDS } from '@/skills/skillIds'

/**
 * Σ learned skill levels in a stored `spinner_skills` value
 * (`{"v":1,"lv":{id: level}}`). Known ids only, each clamped to 0..10 so a
 * corrupt blob cannot outbid real progress. Missing / malformed → 0.
 */
export function storedSkillLevels(raw: string | null | undefined): number {
  if (!raw) return 0
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 0
  }
  const lv = parsed && typeof parsed === 'object' ? (parsed as { lv?: unknown }).lv : undefined
  if (!lv || typeof lv !== 'object') return 0
  let sum = 0
  for (const id of SKILL_IDS) {
    const v = (lv as Record<string, unknown>)[id]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) sum += Math.min(10, Math.floor(v))
  }
  return sum
}
