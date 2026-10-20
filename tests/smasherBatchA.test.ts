// Batch A smashers (forest-floor critters, src/data/smashers/batchA.ts): the
// design contract — twelve distinct playstyles, sane data ranges, skill art
// and English copy for every skill, and no clash with any other smasher.
import { describe, it, expect } from 'vitest'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { BATCH_A, BATCH_A_IDS } from '@/data/smashers/batchA'
import { SMASHER_LIST } from '@/data/smasherCatalog'
import { SKILL_MOD_MAX, SKILL_MOD_MIN, SKILLS } from '@/data/skillCatalog'
import { SMASHER_SKILL_ART } from '@/use/skills/smasherSkillArt'
import { SIGNATURE_PALETTES } from '@/smashers/smasherRig'
import en from '@/i18n/locales/en'

const DEFS = BATCH_A_IDS.map(id => BATCH_A[id])
const EN = en as Record<string, unknown>

describe('batch A smashers', () => {
  it('twelve smashers, unlocking between stage 55 and 115', () => {
    expect(DEFS).toHaveLength(12)
    for (const d of DEFS) {
      expect(d.unlockStage, d.id).toBeGreaterThanOrEqual(55)
      expect(d.unlockStage, d.id).toBeLessThanOrEqual(115)
    }
    expect(new Set(DEFS.map(d => d.unlockStage)).size).toBe(12)
  })

  it('ids and skill ids are unique across the whole catalog', () => {
    const ids = SMASHER_LIST.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const skills = SMASHER_LIST.flatMap(s => s.skills.map(k => k.id))
    expect(new Set(skills).size).toBe(skills.length)
  })

  it('every smasher has a unique profile, disc + armour in range, three different effects', () => {
    const profiles = new Set(DEFS.map(d => Object.values(d.profile).join(',')))
    expect(profiles.size).toBe(12)
    for (const d of DEFS) {
      expect(d.disc, d.id).toBeDefined()
      expect(d.disc!).toBeGreaterThanOrEqual(0.75)
      expect(d.disc!).toBeLessThanOrEqual(1.35)
      expect(d.armor, d.id).toBeDefined()
      for (const v of [d.armor!.front, d.armor!.back]) {
        expect(v).toBeGreaterThanOrEqual(0.5)
        expect(v).toBeLessThanOrEqual(1.5)
      }
      expect(new Set(d.skills.map(s => s.effect)).size, d.id).toBe(3)
      for (const s of d.skills) {
        expect(SKILLS[s.effect], s.id).toBeDefined()
        const mods = Object.entries(s.mods)
        expect(mods.length, `${s.id} has mods`).toBeGreaterThan(0)
        for (const [k, m] of mods) {
          expect(k in SKILLS[s.effect].levels[0]!, `${s.id}.${k}`).toBe(true)
          expect(m!).toBeGreaterThanOrEqual(SKILL_MOD_MIN)
          expect(m!).toBeLessThanOrEqual(SKILL_MOD_MAX)
        }
      }
    }
  })

  it('archetypes spread over every top and bottom part', () => {
    expect(new Set(DEFS.map(d => d.archetype.top)).size).toBe(6)
    const bottoms = DEFS.map(d => d.archetype.bottom)
    for (const b of ['speedy', 'tanky', 'balanced'] as const) expect(bottoms.filter(x => x === b)).toHaveLength(4)
  })

  it('every smasher has a palette, English copy and art for all three skills', () => {
    for (const d of DEFS) {
      expect(SIGNATURE_PALETTES[d.id], d.id).toBeDefined()
      for (const k of [`smasher_${d.id}`, `smasher_${d.id}_species`, `smasher_${d.id}_desc`]) expect(typeof EN[k], k).toBe('string')
      for (const s of d.skills) {
        expect(SMASHER_SKILL_ART[s.id], s.id).toBeDefined()
        expect(typeof EN[`smasher_skill_${s.id}`], s.id).toBe('string')
        const desc = EN[`smasher_skill_${s.id}_desc`]
        expect(typeof desc, s.id).toBe('string')
        expect(desc as string).toMatch(/Strength: .+ Weakness: /)
      }
    }
  })
})
