import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SKILLS_KEY, SKILL_UI_KEY, STAGE_KEY, COINS_KEY } from '@/keys'
import {
  REVEAL_MIN_GAP_MS,
  diffSkillTelemetry,
  nextRevealItem,
  queueIntroAfterClose,
  revealBlocksBattle,
  revealGateOpen,
  type RevealGateInput
} from '@/use/skillRevealGate'
import type { BattleMode } from '@/use/bossPeek'

// Skills intro / reveal gate (WP7, G12/G13). The pure rules are driven with the
// REAL useSkills singleton (fresh module graph per case, flag stubbed), so the
// scenarios below are the arena's actual decisions: queueIntroAfterClose on a
// result-screen close → nextRevealItem → revealGateOpen on tap_to_start.

const boot = async (seed: { stage: number; ui?: unknown; skills?: Record<string, number>; flag?: string }) => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_SKILLS', seed.flag ?? 'true')
  localStorage.clear()
  localStorage.setItem(STAGE_KEY, String(seed.stage))
  localStorage.setItem(COINS_KEY, '1000')
  if (seed.ui !== undefined) localStorage.setItem(SKILL_UI_KEY, JSON.stringify(seed.ui))
  if (seed.skills) localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: 1, lv: seed.skills }))
  const { SKILLS_BUILD: isSkillsEnabled } = await import('@/skills/skillsGate')
  const skills = (await import('@/use/useSkills')).default()
  const campaign = (await import('@/use/useSpinnerCampaign')).default()
  const setStage = (s: number) => {
    campaign.currentStageId.value = s
    localStorage.setItem(STAGE_KEY, String(s))
  }
  /** A result screen closed (win / loss) in `mode` → did it queue the intro? */
  const closeScreen = (result: 'win' | 'lose', mode: BattleMode = 'campaign') =>
    queueIntroAfterClose({ enabled: isSkillsEnabled, result, mode, shouldShow: skills.shouldShowSkillsIntro })
  const candidate = (introQueued: boolean) => nextRevealItem({
    introQueued,
    introPending: skills.isSkillsIntroPending.value,
    introIds: skills.introSkillIds.value,
    pendingReveals: skills.pendingReveals.value,
    pendingSlot: skills.pendingSlotReveal.value
  })
  return { skills, setStage, closeScreen, candidate, isSkillsEnabled }
}

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

/** A menu with nothing in the way. */
const openGate = (over: Partial<RevealGateInput> = {}): RevealGateInput => ({
  enabled: true,
  phase: 'tap_to_start',
  pvp: false,
  adActive: false,
  cutscene: false,
  modalOpen: false,
  surfaceOpen: false,
  now: 10_000,
  lastClosedAt: -Infinity,
  ...over
})

describe('skills intro — NEW player (stage-10 boss win)', () => {
  it('nothing before the stage-10 boss; queued by the roulette-reward close; opens with Mirror Plate', async () => {
    const { setStage, closeScreen, candidate } = await boot({ stage: 10 })
    // A stage-9 → 10 win close: no skill exists yet.
    expect(closeScreen('win')).toBe(false)
    expect(candidate(false)).toBeNull()
    // Boss win advances to 11 BEFORE the card / roulette; the arena queues
    // from onRouletteRewardContinue (a win close in campaign mode).
    setStage(11)
    expect(candidate(false)).toBeNull() // pending, but not queued → not shown on its own
    expect(closeScreen('win')).toBe(true)
    expect(candidate(true)).toEqual({ kind: 'intro', ids: ['mirror_plate'] })
  })

  it('seen only once the intro CLOSED; afterwards no lighter reveal replays it', async () => {
    const { skills, closeScreen, candidate } = await boot({ stage: 11 })
    expect(closeScreen('win')).toBe(true)
    expect(candidate(true)?.kind).toBe('intro')
    // Opened, not closed yet → still pending.
    expect(skills.isSkillsIntroPending.value).toBe(true)
    skills.markSkillsIntroSeen()
    expect(skills.isSkillsIntroPending.value).toBe(false)
    expect(candidate(true)).toBeNull()
    expect(closeScreen('win')).toBe(false)
  })
})

describe('skills intro — EXISTING player (past stage 10 when skills ship)', () => {
  it('stage 30: nothing on load / menu, nothing on a loss close; the next WIN close queues every unlock', async () => {
    const { closeScreen, candidate } = await boot({ stage: 30 })
    expect(candidate(false)).toBeNull()
    expect(closeScreen('lose')).toBe(false)
    expect(closeScreen('win')).toBe(true)
    const item = candidate(true)
    expect(item?.kind).toBe('intro')
    expect(item?.ids).toEqual(['mirror_plate', 'phase_step', 'guard_shell', 'second_wind'])
  })

  it('ghost and daily wins count (non-PvP); PvP never, win or lose', async () => {
    const { closeScreen } = await boot({ stage: 30 })
    expect(closeScreen('win', 'pvp')).toBe(false)
    expect(closeScreen('lose', 'pvp')).toBe(false)
    expect(closeScreen('win', 'ghost')).toBe(true)
    expect(closeScreen('win', 'daily')).toBe(true)
  })

  it('drop-off on the win screen: the queue is not persisted → the NEXT win close shows it', async () => {
    let s = await boot({ stage: 30 })
    // Win screen up, player leaves before closing it: nothing queued, nothing marked.
    expect(s.skills.isSkillsIntroPending.value).toBe(true)
    // Reload: a fresh module graph, same save.
    s = await boot({ stage: 31, ui: JSON.parse(localStorage.getItem(SKILL_UI_KEY) ?? 'null') ?? undefined })
    expect(s.candidate(false)).toBeNull()
    expect(s.closeScreen('win')).toBe(true)
    expect(s.candidate(true)?.kind).toBe('intro')
  })
})

describe('lighter reveals after the intro', () => {
  const seen = (ids: string[], slot2 = false) => ({ v: 1, seen: ids, intro: true, slot2Seen: slot2, filled: 1 })

  it('stage 15 boss → one skill reveal; markSeen consumes it', async () => {
    const { skills, candidate } = await boot({ stage: 16, ui: seen(['mirror_plate']) })
    expect(candidate(false)).toEqual({ kind: 'skill', ids: ['phase_step'] })
    skills.markSeen('phase_step')
    expect(candidate(false)).toBeNull()
  })

  it('stage 20 boss → the slot-2 reveal carrying Guard Shell', async () => {
    const { candidate } = await boot({ stage: 21, ui: seen(['mirror_plate', 'phase_step']) })
    expect(candidate(false)).toEqual({ kind: 'slot', ids: ['guard_shell'] })
  })

  it('several catch-up unlocks at once → one combined reveal', async () => {
    const { candidate } = await boot({ stage: 31, ui: seen(['mirror_plate', 'phase_step', 'guard_shell'], true) })
    expect(candidate(false)).toEqual({ kind: 'combined', ids: ['second_wind', 'lucky_edge'] })
  })

  it('flag off: no intro, no reveal, nothing queues', async () => {
    const { closeScreen, candidate, isSkillsEnabled } = await boot({ stage: 40, flag: 'false' })
    expect(isSkillsEnabled).toBe(false)
    expect(closeScreen('win')).toBe(false)
    expect(candidate(true)).toBeNull()
  })
})

describe('revealGateOpen (G13)', () => {
  it('opens on an idle tap_to_start menu', () => {
    expect(revealGateOpen(openGate())).toBe(true)
  })

  it('only on tap_to_start — never mid-battle, on a result screen phase or in an ad break', () => {
    for (const phase of ['idle', 'meteor_intro', 'deciding_turn', 'player_turn', 'player_launched',
      'npc_turn', 'npc_launched', 'game_over', 'ad_break']) {
      expect(revealGateOpen(openGate({ phase }))).toBe(false)
    }
  })

  it('never over an ad, the cutscene / loader, PvP (lobby, invite auto-join) or any other modal', () => {
    expect(revealGateOpen(openGate({ adActive: true }))).toBe(false)
    expect(revealGateOpen(openGate({ cutscene: true }))).toBe(false)
    expect(revealGateOpen(openGate({ pvp: true }))).toBe(false)
    expect(revealGateOpen(openGate({ modalOpen: true }))).toBe(false)
    expect(revealGateOpen(openGate({ surfaceOpen: true }))).toBe(false)
    expect(revealGateOpen(openGate({ enabled: false }))).toBe(false)
  })

  it(`two skills surfaces are at least ${REVEAL_MIN_GAP_MS} ms apart`, () => {
    expect(revealGateOpen(openGate({ now: 5000, lastClosedAt: 5000 - REVEAL_MIN_GAP_MS + 1 }))).toBe(false)
    expect(revealGateOpen(openGate({ now: 5000, lastClosedAt: 5000 - REVEAL_MIN_GAP_MS }))).toBe(true)
  })

  it('an open surface blocks beginBattle', () => {
    expect(revealBlocksBattle({ surfaceOpen: true })).toBe(true)
    expect(revealBlocksBattle({ surfaceOpen: false })).toBe(false)
  })
})

describe('diffSkillTelemetry (Poki funnel)', () => {
  it('unlock, learn, upgrade, maxed, equip', () => {
    const prev = { unlocked: ['mirror_plate'] as const, levels: { mirror_plate: 9 }, slots: [null, null] as const }
    const next = {
      unlocked: ['mirror_plate', 'phase_step'] as const,
      levels: { mirror_plate: 10, phase_step: 1 },
      slots: ['phase_step', null] as const
    }
    expect(diffSkillTelemetry(
      { ...prev, unlocked: [...prev.unlocked], slots: [...prev.slots] },
      { ...next, unlocked: [...next.unlocked], slots: [...next.slots] },
      10
    )).toEqual([
      { what: 'phase_step', action: 'unlock' },
      { what: 'mirror_plate', action: 'upgrade' },
      { what: 'mirror_plate', action: 'maxed' },
      { what: 'phase_step', action: 'learn' },
      { what: 'phase_step', action: 'equip' }
    ])
  })

  it('no change → no events; an unequip is not an event', () => {
    const a = {
      unlocked: ['mirror_plate' as const],
      levels: { mirror_plate: 2 },
      slots: ['mirror_plate' as const, null]
    }
    expect(diffSkillTelemetry(a, a, 10)).toEqual([])
    expect(diffSkillTelemetry(a, { ...a, slots: [null, null] }, 10)).toEqual([])
  })
})

// ─── Arena wiring (source-level: SpinnerArena is too heavy to mount) ────────
// The glue lives in use/skills/arenaSkills.ts (lazy, skills builds only); the
// arena calls it through `sk.value?.…`. The flag-off side of this wiring is
// pinned in tests/skillsFlagBoundary.test.ts.
describe('SpinnerArena wiring', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n')
  const src = read('../src/views/SpinnerArena.vue')
  const glue = read('../src/use/skills/arenaSkills.ts')
  const bodyIn = (text: string, name: string) => {
    const start = text.search(new RegExp(`(const ${name} = |function ${name} ?\\()`))
    expect(start, name).toBeGreaterThan(0)
    const end = text.indexOf('\n}\n', start)
    return text.slice(start, end)
  }
  const body = (name: string) => bodyIn(src, name)

  it('beginBattle: skills surface gate runs BEFORE the interstitial and startMatch', () => {
    const b = body('beginBattle')
    const take = b.indexOf('if (sk.value?.takesBattleTap()) return')
    const ad = b.indexOf('if (shouldShowMidgameAdNow())')
    const start = b.indexOf('startMatch()')
    expect(take).toBeGreaterThan(0)
    expect(ad).toBeGreaterThan(take)
    expect(start).toBeGreaterThan(ad)
    // …and inside the glue: an open surface blocks first, then a pending one takes the tap.
    expect(glue).toMatch(/revealBlocksBattle\(\{ surfaceOpen: surfaceOpen\.value \}\) \|\| tryOpenSurface\(\)/)
  })

  it('intro queued from the roulette-reward continue (after the boss card → roulette → reward) and from the win-screen close', () => {
    expect(body('onRouletteRewardContinue')).toMatch(/initCampaignGame\(\)\n[\s\S]*sk\.value\?\.queueIntro\('win'/)
    expect(body('onRewardContinue')).toMatch(/sk\.value\?\.queueIntro\(closedResult, closedMode\)/)
    // Boss-defeated → roulette order untouched.
    expect(body('onBossDefeatedDone')).toContain('if (pendingBossReward.value) showRoulette.value = true')
  })

  it('seen is marked only when the intro closes', () => {
    expect(src).not.toContain('markSkillsIntroSeen')
    expect(glue.match(/markSkillsIntroSeen\(\)/g)?.length).toBe(1)
    expect(bodyIn(glue, 'closeIntro')).toContain('skills.markSkillsIntroSeen()')
  })

  it('every campaign init goes through initCampaignGame; ghost/daily/PvP pass loadouts', () => {
    // The only stage-team init left is inside initCampaignGame itself.
    expect(src.match(/stageNpcTeam\(\),/g)?.length).toBe(1)
    expect(body('initCampaignGame')).toContain('stageNpcTeam(),')
    expect(src.match(/initCampaignGame\(\)/g)!.length).toBeGreaterThanOrEqual(10)
    expect(body('onGhostFight')).toContain('battleSkillOptions(\'ghost\', entry)')
    expect(body('startDailyChallenge')).toContain('battleSkillOptions(\'daily\')')
    expect(src).toMatch(/role: pvpRole\.value \?\? undefined/)
    expect(src).toMatch(/seed: currentMatchSeed\(\),\n\s*\.\.\.pvpSkillOptions/)
    expect(src).toMatch(/honorSkills\.mine,\n\s*honorSkills\.theirs/)
    // The ghost's loadout is derived at fight time; the board carries none.
    expect(bodyIn(glue, 'ghostLoadout')).toContain('entry.skills ?? ghostSkillLoadout(entry)')
  })

  it('skills surfaces render only through the gate handles', () => {
    for (const [pick, comp] of [
      ['SkillsIntroUi', 'SkillsIntroScreen'], ['SkillRevealUi', 'SkillRevealOverlay'],
      ['SkillPickerUi', 'SkillPickerModal'], ['SkillHudChip', 'SkillHudIcon'], ['PvpVsCard', 'PvpVsPreview']
    ]) {
      // Never rendered directly by tag — only through the (lazy / null) handle.
      expect(src).not.toMatch(new RegExp(`^\\s+${comp}\\(`, 'm'))
      expect(src).toMatch(new RegExp(`v-if="${pick}( |")`))
    }
    expect(src).toMatch(/from '@\/skills\/skillsGate'/)
  })
})
