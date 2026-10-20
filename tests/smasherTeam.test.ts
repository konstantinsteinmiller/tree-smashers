// ─── Smasher team: level-up spend, skill unlocks, per-blade loadouts ────────
//
// The Team modal (SmasherTeamModal) replaced the part pickers: one smasher =
// one unit, levelled with coins. Pinned here:
//   • the Level-Up button charges exactly `smasherLevelCost(level)`, refuses
//     when short, and raises the roster level;
//   • skill slot 2 opens at Lv 10 and slot 3 at Lv 20 (catalog + loadout);
//   • team slots swap instead of duplicating a smasher;
//   • the roster's per-blade loadout reaches initGame: every smasher blade
//     fights with its OWN skills (effect + mods), not a shared side loadout.

import './helpers/skillsBuild'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { installSkillPort } from './helpers/skillsBuild'
import {
  SKILL_SLOT_LEVELS,
  SMASHERS,
  smasherConfig,
  smasherLevelCost,
  smasherLoadout,
  smasherSkillLevel,
  unlockedSkillCount
} from '@/data/smasherCatalog'

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))

const i18n = () =>
  createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('skill unlocks by smasher level', () => {
  it('slot 1 is ready at Lv 1, slot 2 opens at Lv 10, slot 3 at Lv 20', () => {
    expect(SKILL_SLOT_LEVELS).toEqual([1, 10, 20])
    for (const [lv, n] of [[1, 1], [9, 1], [10, 2], [19, 2], [20, 3], [30, 3]] as const) {
      expect(unlockedSkillCount(lv), `Lv ${lv}`).toBe(n)
      expect(smasherLoadout({ smasherId: 'bramble', level: lv }).length, `Lv ${lv}`).toBe(n)
    }
    expect(smasherSkillLevel(9, 1)).toBe(0)
    expect(smasherSkillLevel(10, 1)).toBe(1)
    expect(smasherSkillLevel(20, 2)).toBe(1)
  })

  it('a loadout entry is the skill\'s effect with its own mods and key', () => {
    const lo = smasherLoadout({ smasherId: 'thumper', level: 20 })
    const def = SMASHERS.thumper
    expect(lo.map(e => e.id)).toEqual(def.skills.map(s => s.effect))
    expect(lo.map(e => e.key)).toEqual(def.skills.map(s => s.id))
    expect(lo[0]!.mods).toEqual(def.skills[0]!.mods)
  })
})

const mountModal = async (coins: number, team = ['bramble', 'thumper'] as const) => {
  localStorage.setItem('smashers_coins', String(coins))
  await import('@/use/useUser')
  const { default: SmasherTeamModal } = await import('@/components/organisms/SmasherTeamModal.vue')
  const smashers = await import('@/use/useSmashers')
  const config = await import('@/use/useSpinnerConfig')
  const w = mount(SmasherTeamModal, {
    props: { modelValue: true, initialTeam: team.map(id => smasherConfig(id, 1)), bestStage: 1 },
    global: { plugins: [i18n()], stubs: { teleport: true, BGSkinButton: true } },
    attachTo: document.body
  })
  await flushPromises()
  return { w, smashers, config: config.default() }
}

describe('Team modal — level up', () => {
  it('charges exactly the level cost and raises the roster level', async () => {
    const { w, smashers, config } = await mountModal(10_000)
    const cost = smasherLevelCost(1)!
    await w.find('[data-testid="level-up"] button').trigger('click')
    expect(smashers.smasherLevel('bramble')).toBe(2)
    expect(config.coins.value).toBe(10_000 - cost)
    // The save event carries the team at the new level.
    const saved = w.emitted('save')!.at(-1)![0] as { smasherId: string; level: number }[]
    expect(saved[0]).toMatchObject({ smasherId: 'bramble', level: 2 })
    w.unmount()
  })

  it('refuses when the player is short, spending nothing', async () => {
    const { w, smashers, config } = await mountModal(smasherLevelCost(1)! - 1)
    await w.find('[data-testid="level-up"] button').trigger('click')
    expect(smashers.smasherLevel('bramble')).toBe(1)
    expect(config.coins.value).toBe(smasherLevelCost(1)! - 1)
    w.unmount()
  })

  it('a level-10 smasher shows its second skill unlocked, the third locked', async () => {
    const { w, smashers } = await mountModal(1_000_000)
    for (let i = 0; i < 9; i++) await w.find('[data-testid="level-up"] button').trigger('click')
    expect(smashers.smasherLevel('bramble')).toBe(10)
    await flushPromises()
    const rows = w.findAll('[data-testid="smasher-skills"] .skill-row')
    expect(rows.length).toBe(3)
    expect(rows.map(r => r.classes().includes('is-locked'))).toEqual([false, false, true])
    w.unmount()
  })
})

describe('Team modal — team slots', () => {
  it('putting a team member into the other slot swaps instead of duplicating', async () => {
    const { w } = await mountModal(0)
    // bramble is selected (slot 1); put it into slot 2.
    await w.find('[data-testid="put-in-slot-1"]').trigger('click')
    const saved = w.emitted('save')!.at(-1)![0] as { smasherId: string }[]
    expect(saved.map(c => c.smasherId)).toEqual(['thumper', 'bramble'])
    w.unmount()
  })

  it('a locked smasher cannot join the team', async () => {
    const { w } = await mountModal(0)
    await w.find('[data-testid="roster-pecks"]').trigger('click')
    expect(w.find('[data-testid="put-in-slot-0"]').exists()).toBe(false)
    expect(w.emitted('save')).toBeUndefined()
    w.unmount()
  })
})

describe('per-blade loadouts reach initGame', () => {
  it('every smasher blade fights with its own unlocked skills; the side loadout is empty', async () => {
    // useUser first (useMatch <-> useModels <-> useUser import cycle).
    await import('@/use/useUser')
    const game = await import('@/use/useSpinnerGame')
    await installSkillPort()
    const { teamConfigs, levelUpSmasher } = await import('@/use/useSmashers')
    for (let i = 0; i < 9; i++) levelUpSmasher('thumper') // Lv 10 → two skills
    const team = teamConfigs([smasherConfig('bramble', 1), smasherConfig('thumper', 1)])
    const engine = game.useSpinnerGame()
    const npc = { topPartId: 'round', bottomPartId: 'balanced', topLevel: 0, bottomLevel: 0 } as const
    engine.initGame(team, [{ ...npc }], false, 'default', 0, false, undefined, null, 'circle', {
      skillLoadout: [],
      enemySkillLoadout: []
    })
    const [a, b] = engine.playerBlades.value
    expect(a!.skills?.ids).toEqual([SMASHERS.bramble.skills[0].effect])
    expect(b!.skills?.ids).toEqual(SMASHERS.thumper.skills.slice(0, 2).map(s => s.effect))
    // A part-only NPC without a side loadout carries nothing.
    expect(engine.npcBlades.value[0]!.skills).toBeUndefined()
    // The HUD shows each blade's own chips.
    expect(engine.skillHud.value.map(r => r.map(c => c.id))).toEqual([
      [SMASHERS.bramble.skills[0].effect],
      SMASHERS.thumper.skills.slice(0, 2).map(s => s.effect)
    ])
    engine.disposePhysics?.()
  })
})
