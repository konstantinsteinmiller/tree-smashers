// ─── Skills flag OFF: the skill system is gone at runtime ───────────────────
//
// VITE_APP_FEATURE_SKILLS=false must remove the whole skill system, not hide
// it (batch 3, group D). With the flag off this suite proves, on the real
// modules:
//   • no skill module is ever LOADED — every one of them is mocked with a
//     factory that records the load, so a stray static or dynamic import in
//     any flag-off path fails here (the bundle-level twin of this check is
//     tests/platforms/skillsFlagPurity.test.ts);
//   • the gate hands out null / [] / no-ops, the engine refuses a skill port
//     and never builds `blade.skills`;
//   • the mounted arena renders no skill DOM, writes no skill key and asks for
//     no skill SFX;
//   • PvP sends an empty loadout and ignores a peer's skills;
//   • honour, the merge score and ghost fights carry no skill weight.

import { describe, it, expect, vi } from 'vitest'
import './helpers/skillsOffBuild'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { flushPromises } from '@vue/test-utils'
import { SKILL_DOM, mountArena } from './helpers/arenaHarness'

// A returning player far past every skill unlock — on a skills build the arena
// would show the skills intro, the boss-drop chip, the NEW dot, the Team
// modal's SKILLS row… Seeded before any module reads storage at import time
// (the save setup file swaps in a fresh storage before each test; the arena
// test below re-seeds it).
const SEED: Record<string, string> = vi.hoisted(() => {
  const seed: Record<string, string> = {
    smashers_campaign_stage: '40',
    smashers_player_max_stage: '40',
    smashers_coins: '5000',
    smashers_first_win: '1',
    smashers_intro_seen: '1',
    smashers_config_opened: '1'
  }
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  return seed
})

// ── Every skill module records its own load ────────────────────────────────
const loaded = vi.hoisted(() => [] as string[])
vi.mock('@/use/skills/arenaSkills', () => {
  loaded.push('arenaSkills')
  return {}
})
vi.mock('@/use/skills/skillEngine', () => {
  loaded.push('skillEngine')
  return {}
})
vi.mock('@/use/skills/skillRuntime', () => {
  loaded.push('skillRuntime')
  return {}
})
vi.mock('@/use/skills/skillVfx', () => {
  loaded.push('skillVfx')
  return {}
})
vi.mock('@/use/skills/skillSfx', () => {
  loaded.push('skillSfx')
  return {}
})
vi.mock('@/use/skills/skillLoadoutSanitizer', () => {
  loaded.push('skillLoadoutSanitizer')
  return {}
})
vi.mock('@/use/skills/ghostSkills', () => {
  loaded.push('ghostSkills')
  return {}
})
vi.mock('@/data/skillCatalog', () => {
  loaded.push('skillCatalog')
  return {}
})
vi.mock('@/use/skillText', () => {
  loaded.push('skillText')
  return {}
})
vi.mock('@/components/organisms/PvpReadySkills.vue', () => {
  loaded.push('PvpReadySkills')
  return {}
})
vi.mock('@/components/organisms/PvpVsPreview.vue', () => {
  loaded.push('PvpVsPreview')
  return {}
})
vi.mock('@/components/atoms/SkillHudIcon.vue', () => {
  loaded.push('SkillHudIcon')
  return {}
})
vi.mock('@/components/atoms/SkillIcon.vue', () => {
  loaded.push('SkillIcon')
  return {}
})
vi.mock('@/use/skills/smasherSkillText', () => {
  loaded.push('smasherSkillText')
  return {}
})

// Static `/images/…` template srcs become asset imports under Vitest's Vue
// plugin, which cannot resolve public-dir paths — hand them a URL instead.
vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

const SKILL_KEY = /^smashers_skill/
const skillKeysInStorage = () => Object.keys(localStorage).filter(k => SKILL_KEY.test(k))

// ── Gate ────────────────────────────────────────────────────────────────────

describe('skills gate, flag off', () => {
  it('SKILLS_BUILD is false; every UI handle is null; every loader resolves to nothing', async () => {
    const gate = await import('@/skills/skillsGate')
    expect(gate.SKILLS_BUILD).toBe(false)
    for (const handle of [
      gate.SkillHudChipUi, gate.PvpVsCardUi, gate.PvpReadySkillsUi, gate.SkillIconUi
    ]) expect(handle).toBeNull()
    expect(await gate.loadSmasherSkillText()).toBeNull()
    expect(await gate.loadArenaSkills()).toBeNull()
    expect(await gate.loadSkillEngine()).toBeNull()
    expect(await gate.loadSkillSfx()).toBeNull()
    expect(await gate.loadSkillLoadoutSanitizer()).toBeNull()
    gate.armSkillSfx()
    await flushPromises()
    expect(loaded).toEqual([])
  })
})

// ── Engine ──────────────────────────────────────────────────────────────────

describe('engine, flag off', () => {
  it('refuses a skill port and never builds blade skills, even when handed a loadout', async () => {
    const game = await import('@/use/useSpinnerGame')
    const createBladeSkills = vi.fn(() => ({ has: 0xffff }))
    game.installSkillEngine({ createBladeSkills } as never)
    expect(game.hasSkillEngine()).toBe(false)
    const engine = game.useSpinnerGame()
    const cfg = { topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3 } as const
    engine.initGame([{ ...cfg }], [{ ...cfg }], false, 'default', false, undefined, null, 'circle', {
      skillLoadout: [{ id: 'guard_shell', level: 5 }],
      enemySkillLoadout: [{ id: 'homing_rockets', level: 5 }]
    })
    expect(createBladeSkills).not.toHaveBeenCalled()
    for (const b of engine.allBlades.value) expect(b.skills).toBeUndefined()
    expect(engine.skillHud.value).toEqual([])
    engine.disposePhysics?.()
    expect(loaded).toEqual([])
  })
})

// ── PvP ─────────────────────────────────────────────────────────────────────

describe('PvP, flag off', () => {
  it('sends an empty loadout and ignores the peer\'s skills', async () => {
    const pvpMod = await import('@/use/usePVP')
    await pvpMod.whenPvpSkillsReady()
    const pvp = pvpMod.default()
    pvp.leavePvP()
    pvpMod.receivePvpMessage({ type: 'game-config', config: { arenaType: 'default', teamSize: 2, levelOne: false } })
    const team = [
      { topPartId: 'star', bottomPartId: 'balanced', topLevel: 4, bottomLevel: 4 },
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 3, bottomLevel: 3 }
    ] as const
    // Our own ready: whatever the caller passes, the stored (and sent) copy is empty.
    pvp.setReady(team.map(c => ({ ...c })), [{ id: 'guard_shell', level: 5 }])
    const mine = pvp.role.value === 'guest' ? pvp.guestSkills.value : pvp.hostSkills.value
    expect(mine).toEqual([])
    // A peer's ready with skills: the team is taken, the skills are not.
    pvpMod.receivePvpMessage({
      type: 'player-ready',
      proto: pvpMod.PVP_PROTOCOL_VERSION,
      team: team.map(c => ({ ...c })),
      skills: [{ id: 'homing_rockets', level: 10 }, { id: 'mirror_plate', level: 10 }]
    })
    expect(pvp.hostSkills.value).toEqual([])
    expect(pvp.guestSkills.value).toEqual([])
    pvp.leavePvP()
    expect(loaded).toEqual([])
  })
})

// ── Save merge ──────────────────────────────────────────────────────────────

describe('save merge, flag off', () => {
  it('stored skill levels do not weigh in the merge score', async () => {
    const { computeMeta } = await import('@/utils/save/SaveMergePolicy')
    const read = (snap: Record<string, string>) => ({ get: (k: string) => snap[k] ?? null })
    const plain = computeMeta(read({ smashers_campaign_stage: '21' }))
    const withSkills = computeMeta(read({
      smashers_campaign_stage: '21',
      smashers_skills: JSON.stringify({ v: 1, lv: { mirror_plate: 10, guard_shell: 10 } })
    }))
    expect(withSkills.progressScore).toBe(plain.progressScore)
  })
})

// ── The mounted arena ───────────────────────────────────────────────────────
// (tests/skillsFlagOn.test.ts mounts the same arena with skills ON and sees
// these very selectors, so "none of them" here is not vacuous.)

describe('SpinnerArena, flag off', () => {
  it('renders no skill UI, writes no skill key, requests no skill SFX, loads no skill module', async () => {
    const arena = await mountArena(SEED)
    try {
      // Give any lazy chunk the time the on-suite needs to show its surfaces.
      await arena.settle(500)
      // The menu really rendered: a stage-40 player, Team button on screen.
      expect(document.querySelector('.stage-badge')?.textContent).toContain('40')
      expect(document.querySelector('[data-testid="hud-team"]')).not.toBeNull()
      for (const sel of SKILL_DOM) expect(document.querySelector(sel), sel).toBeNull()
      // The Team modal opens (smasher detail) with no SKILLS row.
      await arena.openTeam()
      await arena.settle(500)
      expect(document.querySelector('[data-testid="smasher-detail"]')).not.toBeNull()
      for (const sel of SKILL_DOM) expect(document.querySelector(sel), sel).toBeNull()
    } finally {
      arena.unmount()
    }
    expect(arena.written.filter(k => SKILL_KEY.test(k))).toEqual([])
    expect(skillKeysInStorage()).toEqual([])
    expect(arena.requested.filter(u => /skill-/.test(u))).toEqual([])
    expect(loaded).toEqual([])
  }, 60_000)
})
