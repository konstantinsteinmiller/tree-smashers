import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { SKILLS_KEY, SKILL_LOADOUT_KEY, SKILL_UI_KEY, STAGE_KEY, COINS_KEY } from '@/keys'

// useSkills is a module singleton that reads localStorage + the build flag at
// import time, so every case seeds storage, stubs the flag and re-imports a
// fresh module graph. useUser is imported first (project import-cycle rule).

interface Seed {
  stage?: number
  coins?: number
  skills?: Record<string, unknown>
  loadout?: unknown
  ui?: unknown
  flag?: 'true' | 'false' | ''
}

const boot = async (seed: Seed = {}) => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_SKILLS', seed.flag ?? 'true')
  localStorage.setItem(STAGE_KEY, String(seed.stage ?? 1))
  localStorage.setItem(COINS_KEY, String(seed.coins ?? 0))
  if (seed.skills) localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: 1, lv: seed.skills }))
  if (seed.loadout !== undefined) localStorage.setItem(SKILL_LOADOUT_KEY, JSON.stringify(seed.loadout))
  if (seed.ui !== undefined) localStorage.setItem(SKILL_UI_KEY, JSON.stringify(seed.ui))
  await import('@/use/useUser')
  const skills = (await import('@/use/useSkills')).default()
  const campaign = (await import('@/use/useSpinnerCampaign')).default()
  const config = (await import('@/use/useSpinnerConfig')).default()
  const status = await import('@/use/useSaveStatus')
  const setStage = (s: number) => {
    campaign.currentStageId.value = s
    localStorage.setItem(STAGE_KEY, String(s))
  }
  return { skills, campaign, config, status, setStage }
}

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useSkills — unlocks derived from the cleared stage', () => {
  it('nothing before the stage-10 boss is beaten', async () => {
    const { skills } = await boot({ stage: 10 })
    expect(skills.unlockedIds.value).toEqual([])
    expect(skills.slotCount.value).toBe(0)
  })

  it('stage-10 boss → Mirror Plate + slot 1; then one per boss every 5 stages', async () => {
    const { skills, setStage } = await boot({ stage: 11 })
    expect(skills.unlockedIds.value).toEqual(['mirror_plate'])
    expect(skills.slotCount.value).toBe(1)
    setStage(16)
    expect(skills.unlockedIds.value).toEqual(['mirror_plate', 'phase_step'])
    expect(skills.slotCount.value).toBe(1)
    setStage(20)
    expect(skills.slotCount.value).toBe(1)
    setStage(21)
    expect(skills.unlockedIds.value).toHaveLength(3)
    expect(skills.slotCount.value).toBe(2)
    setStage(56)
    expect(skills.unlockedIds.value).toHaveLength(10)
    expect(skills.unlockedIds.value.at(-1)).toBe('static_charge')
  })

  it('stage 101+ (infinite campaign) unlocks nothing new', async () => {
    const { skills, setStage } = await boot({ stage: 56 })
    const at56 = [...skills.unlockedIds.value]
    for (const s of [101, 111, 156, 500]) {
      setStage(s)
      expect(skills.unlockedIds.value).toEqual(at56)
      expect(skills.slotCount.value).toBe(2)
    }
  })

  it('shows the teaser from stage 8 until the first unlock', async () => {
    const { skills, setStage } = await boot({ stage: 7 })
    expect(skills.showTeaser.value).toBe(false)
    setStage(8)
    expect(skills.showTeaser.value).toBe(true)
    setStage(11)
    expect(skills.showTeaser.value).toBe(false)
  })
})

describe('useSkills — learn and upgrade', () => {
  it('learning costs 150 and needs the unlock', async () => {
    const { skills, config } = await boot({ stage: 11, coins: 1000 })
    expect(skills.learn('phase_step')).toBe('locked')
    expect(config.coins.value).toBe(1000)
    expect(skills.learn('mirror_plate')).toBe('ok')
    expect(config.coins.value).toBe(850)
    expect(skills.levelOf('mirror_plate')).toBe(1)
    expect(stored(SKILLS_KEY)).toEqual({ v: 1, lv: { mirror_plate: 1 } })
    expect(skills.learn('mirror_plate')).toBe('learned')
  })

  it('learning is refused when unaffordable', async () => {
    const { skills, config } = await boot({ stage: 11, coins: 149 })
    expect(skills.learn('mirror_plate')).toBe('coins')
    expect(config.coins.value).toBe(149)
    expect(skills.levelOf('mirror_plate')).toBe(0)
    expect(localStorage.getItem(SKILLS_KEY)).toBeNull()
  })

  it('upgrade deducts the catalog cost and stops at L10', async () => {
    const { skills, config } = await boot({ stage: 11, coins: 10_000 })
    expect(skills.upgrade('mirror_plate')).toBe('ok') // learn
    for (let l = 1; l < 10; l++) expect(skills.upgrade('mirror_plate')).toBe('ok')
    expect(skills.levelOf('mirror_plate')).toBe(10)
    expect(config.coins.value).toBe(10_000 - 2650)
    expect(skills.nextCost('mirror_plate')).toBeNull()
    expect(skills.upgrade('mirror_plate')).toBe('max')
    expect(config.coins.value).toBe(10_000 - 2650)
  })

  it('upgrade is refused when the next level is unaffordable', async () => {
    const { skills, config } = await boot({ stage: 11, coins: 150 + 99, skills: {} })
    expect(skills.upgrade('mirror_plate')).toBe('ok')
    expect(skills.upgrade('mirror_plate')).toBe('coins') // 1→2 costs 100
    expect(config.coins.value).toBe(99)
  })

  it('stored levels of a skill not unlocked by the current stage are ignored, not deleted', async () => {
    const { skills, setStage } = await boot({ stage: 11, skills: { mirror_plate: 3, static_charge: 5, bogus: 4 } })
    expect(skills.levels.value).toEqual({ mirror_plate: 3 })
    expect(stored(SKILLS_KEY).lv.static_charge).toBe(5)
    setStage(56)
    expect(skills.levelOf('static_charge')).toBe(5)
  })
})

describe('useSkills — slots and loadout', () => {
  it('slot 1 auto-fills on the first learn; slot 2 stays closed before stage 20', async () => {
    const { skills } = await boot({ stage: 16, coins: 1000 })
    skills.learn('mirror_plate')
    expect(skills.slots.value).toEqual(['mirror_plate', null])
    skills.learn('phase_step')
    expect(skills.slots.value).toEqual(['mirror_plate', null])
    expect(skills.equip(1, 'phase_step')).toBe('slot-locked')
  })

  it('slot 2 opening auto-fills with the earliest learned, unequipped skill', async () => {
    const { skills, setStage } = await boot({ stage: 16, coins: 1000 })
    skills.learn('mirror_plate')
    skills.learn('phase_step')
    setStage(21)
    expect(skills.loadoutForBattle('campaign')).toEqual([
      { id: 'mirror_plate', level: 1 },
      { id: 'phase_step', level: 1 }
    ])
  })

  it('a slot the player emptied is not refilled by the slot-open path', async () => {
    const { skills } = await boot({ stage: 30, coins: 1000, skills: { mirror_plate: 1, phase_step: 1 } })
    skills.syncAutofill()
    expect(skills.slots.value).toEqual(['mirror_plate', 'phase_step'])
    skills.unequip(1)
    expect(skills.loadoutForBattle('campaign')).toEqual([{ id: 'mirror_plate', level: 1 }])
  })

  it('equip into the other slot swaps', async () => {
    const { skills } = await boot({
      stage: 30, skills: { mirror_plate: 2, phase_step: 4 },
      loadout: { v: 1, slots: ['mirror_plate', 'phase_step'] }
    })
    expect(skills.equip(0, 'phase_step')).toBe('ok')
    expect(skills.slots.value).toEqual(['phase_step', 'mirror_plate'])
    expect(stored(SKILL_LOADOUT_KEY)).toEqual({ v: 1, slots: ['phase_step', 'mirror_plate'] })
    expect(skills.equip(0, 'guard_shell')).toBe('not-learned')
  })

  it('cleans a corrupt / unlearned / duplicate / locked loadout', async () => {
    const { skills } = await boot({
      stage: 16, skills: { phase_step: 1 },
      loadout: { v: 1, slots: ['mirror_plate', 'phase_step'] }
    })
    // mirror_plate not learned; slot 2 locked at stage 16
    expect(skills.slots.value).toEqual([null, null])

    const dup = await boot({
      stage: 30,
      skills: { phase_step: 1 },
      loadout: { v: 1, slots: ['phase_step', 'phase_step'] }
    })
    expect(dup.skills.slots.value).toEqual(['phase_step', null])

    for (const junk of ['nope', { slots: 'x' }, { v: 1, slots: [42, { a: 1 }] }, null]) {
      const b = await boot({ stage: 30, skills: { phase_step: 1 }, loadout: junk })
      expect(b.skills.slots.value).toEqual([null, null])
    }
    localStorage.clear()
    vi.resetModules()
    localStorage.setItem(SKILL_LOADOUT_KEY, '{not json')
    localStorage.setItem(SKILLS_KEY, '{nope')
    const broken = await boot({ stage: 30 })
    expect(broken.skills.slots.value).toEqual([null, null])
    expect(broken.skills.levels.value).toEqual({})
  })

  it('levelOne clamps every level to 1', async () => {
    const { skills } = await boot({
      stage: 30, skills: { mirror_plate: 7, phase_step: 3 },
      loadout: { v: 1, slots: ['mirror_plate', 'phase_step'] }
    })
    expect(skills.loadoutForBattle('pvp', { levelOne: true })).toEqual([
      { id: 'mirror_plate', level: 1 },
      { id: 'phase_step', level: 1 }
    ])
    expect(skills.loadoutForBattle('daily')).toEqual([
      { id: 'mirror_plate', level: 7 },
      { id: 'phase_step', level: 3 }
    ])
  })
})

describe('useSkills — migration, hydrate, flag', () => {
  it('an existing player past stage 10 learns nothing on the first skills build', async () => {
    const { skills, config } = await boot({ stage: 42, coins: 5000 })
    expect(skills.unlockedIds.value.length).toBe(7)
    expect(skills.levels.value).toEqual({})
    expect(skills.loadoutForBattle('campaign')).toEqual([])
    expect(config.coins.value).toBe(5000)
    expect(localStorage.getItem(SKILLS_KEY)).toBeNull()
  })

  it('re-reads every key on a saveDataVersion bump (late cloud hydrate)', async () => {
    const { skills, campaign, status } = await boot({ stage: 1 })
    expect(skills.loadoutForBattle('campaign')).toEqual([])
    localStorage.setItem(STAGE_KEY, '31')
    localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: 1, lv: { mirror_plate: 4, guard_shell: 2 } }))
    localStorage.setItem(SKILL_LOADOUT_KEY, JSON.stringify({ v: 1, slots: ['guard_shell', 'mirror_plate'] }))
    localStorage.setItem(SKILL_UI_KEY, JSON.stringify({ v: 1, seen: [], intro: true, slot2Seen: true, filled: 2 }))
    status.refreshSaveBackedState()
    await nextTick()
    expect(campaign.currentStageId.value).toBe(31)
    expect(skills.loadoutForBattle('campaign')).toEqual([
      { id: 'guard_shell', level: 2 },
      { id: 'mirror_plate', level: 4 }
    ])
    expect(skills.isSkillsIntroPending.value).toBe(false)
  })

  it('flag off → nothing unlocked, empty loadouts, mutations refused', async () => {
    for (const flag of ['false', ''] as const) {
      const { skills, config } = await boot({
        flag, stage: 60, coins: 5000,
        skills: { mirror_plate: 5 }, loadout: { v: 1, slots: ['mirror_plate', null] }
      })
      expect(skills.isSkillsEnabled).toBe(false)
      expect(skills.unlockedIds.value).toEqual([])
      expect(skills.slotCount.value).toBe(0)
      for (const mode of ['campaign', 'daily', 'pvp', 'ghost', 'cheat'] as const) {
        expect(skills.loadoutForBattle(mode)).toEqual([])
      }
      expect(skills.learn('phase_step')).toBe('disabled')
      expect(skills.upgrade('mirror_plate')).toBe('disabled')
      expect(skills.equip(0, 'mirror_plate')).toBe('disabled')
      expect(config.coins.value).toBe(5000)
      expect(skills.shouldShowSkillsIntro({ trigger: 'win-closed', mode: 'campaign' })).toBe(false)
    }
  })

  it('dev cheats: own-all toggles unlocks without persisting; max sets L10; wipe clears the keys', async () => {
    const { skills } = await boot({ stage: 1 })
    skills.setDevOwnAllSkills(true)
    expect(skills.unlockedIds.value).toHaveLength(10)
    expect(skills.slotCount.value).toBe(2)
    skills.devMaxAllSkills()
    expect(skills.levelOf('static_charge')).toBe(10)
    expect(skills.loadoutForBattle('cheat')).toHaveLength(2)
    skills.setDevOwnAllSkills(false)
    expect(skills.unlockedIds.value).toEqual([])
    skills.devWipeSkills()
    expect(localStorage.getItem(SKILLS_KEY)).toBeNull()
    expect(localStorage.getItem(SKILL_LOADOUT_KEY)).toBeNull()
    expect(localStorage.getItem(SKILL_UI_KEY)).toBeNull()
  })
})

describe('useSkills — skills intro pending', () => {
  const WIN = { trigger: 'win-closed', mode: 'campaign' } as const

  it('new player: not pending before stage 10; pending right after the stage-10 boss win', async () => {
    const { skills, setStage } = await boot({ stage: 10 })
    expect(skills.isSkillsIntroPending.value).toBe(false)
    expect(skills.shouldShowSkillsIntro(WIN)).toBe(false)
    setStage(11) // the stage-10 win advanced the stage
    expect(skills.isSkillsIntroPending.value).toBe(true)
    expect(skills.shouldShowSkillsIntro(WIN)).toBe(true)
    expect(skills.introSkillIds.value).toEqual(['mirror_plate'])
    // No lighter reveal competes with the intro.
    expect(skills.pendingReveals.value).toEqual([])
  })

  it('existing player: pending from first load, but only a win-screen close shows it', async () => {
    const { skills } = await boot({ stage: 37 })
    expect(skills.isSkillsIntroPending.value).toBe(true)
    expect(skills.shouldShowSkillsIntro({ trigger: 'menu' })).toBe(false)
    expect(skills.shouldShowSkillsIntro({ trigger: 'loss-closed', mode: 'campaign' })).toBe(false)
    expect(skills.shouldShowSkillsIntro({ trigger: 'win-closed', mode: 'pvp' })).toBe(false)
    expect(skills.shouldShowSkillsIntro(WIN)).toBe(true)
    expect(skills.introSkillIds.value).toEqual(
      ['mirror_plate', 'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets']
    )
  })

  it('drop-off on the win screen: still pending next session until markSkillsIntroSeen', async () => {
    await boot({ stage: 11 })
    // Player closes the tab on the win screen: nothing was marked.
    const next = await boot({ stage: 11 })
    expect(next.skills.shouldShowSkillsIntro(WIN)).toBe(true)
    next.skills.markSkillsIntroSeen()
    expect(stored(SKILL_UI_KEY).intro).toBe(true)
    const after = await boot({ stage: 11 })
    expect(after.skills.shouldShowSkillsIntro(WIN)).toBe(false)
  })

  it('after the intro, later unlocks queue the lighter reveal', async () => {
    const { skills, setStage } = await boot({ stage: 11 })
    skills.markSkillsIntroSeen()
    expect(skills.pendingReveals.value).toEqual([])
    setStage(16)
    expect(skills.pendingReveals.value).toEqual(['phase_step'])
    skills.markSeen('phase_step')
    expect(skills.pendingReveals.value).toEqual([])
    setStage(21)
    expect(skills.pendingReveals.value).toEqual(['guard_shell'])
    expect(skills.pendingSlotReveal.value).toBe(true)
    skills.markSlot2Seen()
    expect(skills.pendingSlotReveal.value).toBe(false)
  })

  it('a progress reset wipes skills, so the intro can show again', async () => {
    const { skills, campaign } = await boot({ stage: 25, coins: 500 })
    skills.learn('mirror_plate')
    skills.markSkillsIntroSeen()
    const { resetAllProgress } = await import('@/use/useResetProgress')
    await resetAllProgress()
    await nextTick()
    expect(localStorage.getItem(SKILLS_KEY)).toBeNull()
    expect(localStorage.getItem(SKILL_LOADOUT_KEY)).toBeNull()
    expect(localStorage.getItem(SKILL_UI_KEY)).toBeNull()
    expect(campaign.currentStageId.value).toBe(1)
    expect(skills.levels.value).toEqual({})
    expect(skills.isSkillsIntroPending.value).toBe(false)
    campaign.currentStageId.value = 11
    expect(skills.shouldShowSkillsIntro(WIN)).toBe(true)
    expect(skills.levelOf('mirror_plate')).toBe(0)
  })
})

describe('useSkills — Team button NEW dot (viewed, not learned)', () => {
  const UI = { v: 1, seen: [], intro: true, slot2Seen: true, filled: 1 }

  it('shows for a newly unlocked skill and clears once the picker viewed it — even unlearned', async () => {
    const { skills } = await boot({ stage: 11, ui: UI })
    expect(skills.hasUnviewedSkill.value).toBe(true)
    skills.markViewed(skills.unlockedIds.value)
    expect(skills.isLearned('mirror_plate')).toBe(false)
    expect(skills.hasUnviewedSkill.value).toBe(false)
    expect(stored(SKILL_UI_KEY).viewed).toEqual(['mirror_plate'])
    // The reveal is a separate surface: viewing in the picker does not eat it.
    expect(skills.pendingReveals.value).toEqual(['mirror_plate'])
  })

  it('the reveal / intro showing the skill counts as viewing it', async () => {
    const { skills, setStage } = await boot({ stage: 11, ui: { ...UI, intro: false } })
    expect(skills.hasUnviewedSkill.value).toBe(true)
    skills.markSkillsIntroSeen()
    expect(skills.hasUnviewedSkill.value).toBe(false)
    setStage(16)
    expect(skills.hasUnviewedSkill.value).toBe(true)
    skills.markSeen('phase_step')
    expect(skills.hasUnviewedSkill.value).toBe(false)
  })

  it('persists across a reload and a late cloud hydrate', async () => {
    const first = await boot({ stage: 16, ui: UI })
    first.skills.markViewed(first.skills.unlockedIds.value)
    expect(first.skills.hasUnviewedSkill.value).toBe(false)
    // Reload: fresh module graph, same storage.
    vi.resetModules()
    await import('@/use/useUser')
    const reloaded = (await import('@/use/useSkills')).default()
    expect(reloaded.hasUnviewedSkill.value).toBe(false)
    // Hydrate: the cloud blob (another device viewed nothing) → dot back;
    // the cloud blob carrying `viewed` → dot stays off.
    const status = await import('@/use/useSaveStatus')
    localStorage.setItem(SKILL_UI_KEY, JSON.stringify(UI))
    status.refreshSaveBackedState()
    await nextTick()
    expect(reloaded.hasUnviewedSkill.value).toBe(true)
    localStorage.setItem(SKILL_UI_KEY, JSON.stringify({ ...UI, viewed: ['mirror_plate', 'phase_step'] }))
    status.refreshSaveBackedState()
    await nextTick()
    expect(reloaded.hasUnviewedSkill.value).toBe(false)
  })

  it('returns for the next newly unlocked skill only', async () => {
    const { skills, setStage } = await boot({ stage: 11, ui: UI })
    skills.markViewed(skills.unlockedIds.value)
    setStage(16)
    expect(skills.hasUnviewedSkill.value).toBe(true)
    skills.markViewed(skills.unlockedIds.value)
    expect(skills.hasUnviewedSkill.value).toBe(false)
    expect(stored(SKILL_UI_KEY).viewed).toEqual(['mirror_plate', 'phase_step'])
  })

  it('learned skills never light it; locked ids are never recorded; junk is dropped on parse', async () => {
    const { skills } = await boot({
      stage: 16, coins: 500, skills: { mirror_plate: 1, phase_step: 1 },
      ui: { ...UI, viewed: ['nope', 42] }
    })
    expect(skills.hasUnviewedSkill.value).toBe(false)
    skills.markViewed(['static_charge'])
    expect(skills.isSkillViewed('static_charge')).toBe(false)
  })

  it('a pending slot-2 reveal still lights it', async () => {
    const { skills } = await boot({
      stage: 21, skills: { mirror_plate: 1, phase_step: 1, guard_shell: 1 },
      ui: { ...UI, slot2Seen: false }
    })
    expect(skills.hasUnviewedSkill.value).toBe(true)
    skills.markSlot2Seen()
    expect(skills.hasUnviewedSkill.value).toBe(false)
  })
})
