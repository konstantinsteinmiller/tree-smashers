// Batch 3 group A — cheat / Boss Lab fights stay out of the campaign.
//
// G1  a cheat boss or Boss Lab fight pays only its own fixed coins (500 win /
//     100 loss) and leaves the saved campaign stage, the first-win flag and
//     every other persisted key untouched; the arena returns before any
//     campaign branch (advance, first win, BP, roulette, trophies).
// G2  during such a fight the stage badge chip reads "LAB", not the stage no.
// A2  an unowned trophy skin card names the first stage whose boss grants it.
// W1  useCheats loads useSkills on demand (no static import).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// useUser first (useMatch <-> useModels <-> useUser cycle guard).
await import('@/use/useUser')
const useSpinnerCampaign = (await import('@/use/useSpinnerCampaign')).default
const { loadCheatStage } = await import('@/use/useSpinnerCampaign')
const useSpinnerConfig = (await import('@/use/useSpinnerConfig')).default
const { buildBossLabStage, BOSS_LAB_REWARD_WIN, BOSS_LAB_REWARD_LOSE } = await import('@/use/bosses/bossLab')
const { settleLabBattle, labBattleCoins } = await import('@/use/labBattle')
const { STAGE_KEY } = await import('@/keys')
const { BOSS_TROPHY_SKIN_IDS, encounterForStageId, trophySkinFirstStage } = await import('@/data/bossEncounters')
const StageBadge = (await import('@/components/StageBadge.vue')).default
const en = (await import('@/i18n/locales/en')).default
const de = (await import('@/i18n/locales/de')).default

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')
const arenaSrc = read('src/views/SpinnerArena.vue')

const i18n = (locale = 'en') =>
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en, de } as any
  })

beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})

/** Every persisted key except the wallet — must survive a Lab fight unchanged. */
const snapshotExceptCoins = (coinsKeys: string[]) => {
  const out: Record<string, string | null> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    if (!coinsKeys.includes(k)) out[k] = localStorage.getItem(k)
  }
  return out
}

describe('G1 — cheat / Lab fights never touch the campaign', () => {
  const campaign = useSpinnerCampaign()
  const config = useSpinnerConfig()

  afterEach(() => loadCheatStage(null))

  const stages = () => [
    ['Boss Lab encounter', buildBossLabStage('cinder_tyrant', {
      levelMode: 'matched',
      arena: 'authored',
      peakTop: 30,
      peakBottom: 30
    })],
    ['Boss Lab sandbox', buildBossLabStage('sandbox_frost', {
      levelMode: 'campaign',
      arena: 'ice',
      peakTop: 5,
      peakBottom: 5
    })],
    ['classic cheat boss', campaign.buildCheatBossStage('healers')]
  ] as const

  it('Lab and cheat stages carry the fixed 500 / 100 rewards', () => {
    expect(BOSS_LAB_REWARD_WIN).toBe(500)
    expect(BOSS_LAB_REWARD_LOSE).toBe(100)
    for (const [, stage] of stages()) {
      expect(labBattleCoins(stage, 'win')).toBe(500)
      expect(labBattleCoins(stage, 'lose')).toBe(100)
    }
  })

  for (const result of ['win', 'lose'] as const) {
    it(`a ${result} pays the fixed coins and leaves stage + flags unchanged`, () => {
      campaign.currentStageId.value = 42
      localStorage.setItem(STAGE_KEY, '42')
      const firstWinBefore = config.hasFirstWin.value
      for (const [label, stage] of stages()) {
        loadCheatStage(stage)
        const coinsBefore = config.coins.value
        const before = snapshotExceptCoins([])
        const paid = settleLabBattle(stage, result, config.addCoins)
        const after = snapshotExceptCoins([])
        // Only the wallet key(s) may differ.
        const changed = Object.keys({ ...before, ...after }).filter(k => before[k] !== after[k])
        for (const k of changed) expect(after[k], `${label}: ${k}`).toBe(String(config.coins.value))

        expect(paid, label).toBe(result === 'win' ? 500 : 100)
        expect(config.coins.value - coinsBefore, label).toBe(paid)
        expect(campaign.currentStageId.value, label).toBe(42)
        expect(localStorage.getItem(STAGE_KEY), label).toBe('42')
        expect(config.hasFirstWin.value, label).toBe(firstWinBefore)
      }
    })
  }

  it('the arena settles a cheat / Lab fight BEFORE every campaign branch', () => {
    const watcher = arenaSrc.indexOf('watch(isGameOver, (over) => {')
    expect(watcher).toBeGreaterThan(0)
    const watcherEnd = arenaSrc.indexOf('const onRouletteResult', watcher)
    expect(watcherEnd).toBeGreaterThan(watcher)
    const branchAt = arenaSrc.indexOf('if (cheatStage.value && !ghostMode.value) {', watcher)
    expect(branchAt).toBeGreaterThan(watcher)
    const end = arenaSrc.indexOf('\n    }\n', branchAt)
    const branch = arenaSrc.slice(branchAt, end)
    expect(branch).toContain('settleLabBattle(cheatStage.value, gameResult.value, addCoins)')
    expect(branch).toContain('return')
    for (const forbidden of ['advanceStage', 'markFirstWin', 'recordPlayerStage', 'bpAward', 'grantBossTrophies', 'showRoulette', 'noteCampaign']) {
      expect(branch).not.toContain(forbidden)
    }
    // Every campaign side effect in the watcher comes after the early return.
    for (const later of ['noteCampaignBossWin()', 'const isBossWin', 'advanceStage()', 'markFirstWin()', 'bpAwardCampaignWin()', 'bpAwardLoss()']) {
      // Last occurrence inside the watcher (the daily branch has its own BP call).
      const at = arenaSrc.slice(0, watcherEnd).lastIndexOf(later)
      expect(at, later).toBeGreaterThan(branchAt)
    }
  })

  it('a cheat / Lab result is not posted to the leaderboard', () => {
    expect(arenaSrc).toContain('if (show && !cheatStage.value) reportLeaderboardRun()')
  })
})

describe('G2 — LAB badge', () => {
  const mountBadge = (props: Record<string, unknown>, locale = 'en') =>
    mount(StageBadge, {
      props: { stageId: 42, name: 'cheat_healers', isBoss: true, ...props },
      global: { plugins: [i18n(locale)] }
    })

  it('shows LAB instead of the stage number during a cheat / Lab fight', () => {
    const chip = mountBadge({ lab: true }).find('.game-text').text()
    expect(chip).toBe('LAB')
    expect(chip).not.toContain('42')
  })

  it('is translated (de) and the campaign badge still shows the number', () => {
    expect(mountBadge({ lab: true }, 'de').find('.game-text').text()).toBe('LABOR')
    expect(mountBadge({ lab: false }).find('.game-text').text()).toBe('💀42')
    expect(mountBadge({ lab: false, isBoss: false }).find('.game-text').text()).toBe('42')
  })

  it('the arena passes the cheat-stage state to the badge', () => {
    expect(arenaSrc).toMatch(/StageBadge\([\s\S]*?:lab="!!cheatStage"[\s\S]*?\)/)
  })
})

describe('A2 — trophy card names the stage', () => {
  it('each trophy skin maps to the first stage whose boss grants it', () => {
    expect(trophySkinFirstStage('cinder')).toBe(110)
    expect(trophySkinFirstStage('frost-vault')).toBe(120)
    expect(trophySkinFirstStage('yeti')).toBe(130)
    expect(trophySkinFirstStage('alpha')).toBeNull()
    for (const skin of BOSS_TROPHY_SKIN_IDS) {
      const n = trophySkinFirstStage(skin)!
      expect(encounterForStageId(n)?.trophySkins).toContain(skin)
      for (let s = 1; s < n; s++) expect(encounterForStageId(s)?.trophySkins ?? [], `stage ${s}`).not.toContain(skin)
    }
  })

  it('renders "Beat stage N" per skin in en and de', () => {
    const { global } = i18n('en')
    const t = global.t as (k: string, p: Record<string, unknown>) => string
    expect(t('trophySkin.beatStage', { n: trophySkinFirstStage('cinder') })).toBe('Beat stage 110')
    expect(t('trophySkin.beatStage', { n: trophySkinFirstStage('yeti') })).toBe('Beat stage 130')
    global.locale.value = 'de'
    expect(t('trophySkin.beatStage', { n: trophySkinFirstStage('frost-vault') })).toBe('Schaffe Etappe 120')
  })

  it('the shop card uses the lookup', () => {
    const modal = read('src/components/organisms/SmasherTeamModal.vue')
    expect(modal).toContain('t(\'trophySkin.beatStage\', { n })')
    expect(modal).toContain('trophySkinFirstStage(modelId)')
    expect(modal).toContain('span.game-text {{ trophyCardText(modelId) }}')
  })
})

describe('W1 — cheats never pull the retired skill state in', () => {
  const cheats = read('src/use/useCheats.ts')
  it('no import of useSkills (removed); smasher cheats use the roster', () => {
    expect(cheats).not.toMatch(/@\/use\/useSkills/)
    expect(cheats).toContain("import { levelUpSmasher, resetRoster } from '@/use/useSmashers'")
    expect(read('src/skills/skillsGate.ts')).not.toContain("import('@/use/useSkills')")
  })
})
