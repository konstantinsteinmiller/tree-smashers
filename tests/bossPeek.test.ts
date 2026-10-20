// Boss peek — the "next boss" teaser on the campaign win screen.
// Pins the show rule, the next-boss stage, the skin pick and the mode gate
// against the REAL campaign table (irregular stage-88 boss and the 100+ cycle
// included) plus synthetic tables for the edge cases the real one can't reach.

import { describe, expect, it } from 'vitest'
import {
  getBossPeek,
  battleModeOf,
  bossPreviewModelId,
  isInBossPeekWindow,
  findNextBossStageId,
  BOSS_PEEK_WINDOW,
  type BattleMode,
  type StageLookup
} from '@/use/bossPeek'
import { getStageById, type Stage, type StageBladeConfig } from '@/use/useSpinnerCampaign'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
import zh from '@/i18n/locales/zh'

const win = (wonStageId: number, mode: BattleMode = 'campaign') =>
  getBossPeek({ wonStageId, result: 'win', mode })

const blade = (modelId: string | undefined, topLevel: number, bottomLevel: number): StageBladeConfig => ({
  topPartId: 'round',
  bottomPartId: 'balanced',
  topLevel,
  bottomLevel,
  modelId,
  isBoss: true
})

/** Synthetic finite table: bosses at the given ids, nothing past `length`. */
const table = (bossIds: number[], length: number, team?: (id: number) => StageBladeConfig[]): StageLookup =>
  (id: number): Stage => ({
    id,
    name: `stage_${id}`,
    isBoss: id <= length && bossIds.includes(id),
    enemyTeam: team ? team(id) : [blade(`skin-${id}`, 1, 1)],
    rewardWin: 1,
    rewardLose: 1
  })

describe('boss peek — the real campaign schedule', () => {
  it('derives the boss stages from the table (every 5th plus the irregular 88)', () => {
    const bosses = Array.from({ length: 100 }, (_, i) => i + 1).filter(id => getStageById(id).isBoss)
    expect(bosses).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 88, 90, 95, 100])
  })

  it('shows on the first two win screens after the start and after each boss', () => {
    for (const id of [1, 2, 6, 7, 11, 12, 16, 17, 86, 87, 89, 91, 92, 96, 97, 101, 102, 106, 107]) {
      expect(win(id), `stage ${id}`).not.toBeNull()
    }
  })

  it('hides on the 3rd+ stage after a boss', () => {
    for (const id of [3, 4, 8, 9, 13, 14, 18, 19, 83, 84, 93, 94, 98, 99, 103, 104]) {
      expect(win(id), `stage ${id}`).toBeNull()
    }
  })

  it('never shows on a boss stage win screen', () => {
    for (const id of [5, 10, 15, 20, 85, 88, 90, 95, 100, 105, 188, 200]) {
      expect(getStageById(id).isBoss, `stage ${id} is a boss`).toBe(true)
      expect(win(id), `stage ${id}`).toBeNull()
    }
  })

  it('computes the full show set for 1-110 exactly', () => {
    const shown = Array.from({ length: 110 }, (_, i) => i + 1).filter(id => win(id) !== null)
    expect(shown).toEqual([
      1, 2, 6, 7, 11, 12, 16, 17, 21, 22, 26, 27, 31, 32, 36, 37, 41, 42, 46, 47,
      51, 52, 56, 57, 61, 62, 66, 67, 71, 72, 76, 77, 81, 82, 86, 87, 89, 91, 92,
      96, 97, 101, 102, 106, 107
    ])
  })

  it('names the correct next-boss stage and distance', () => {
    expect(win(1)).toMatchObject({ bossStageId: 5, stagesAway: 4, nameKey: 'stage_5' })
    expect(win(2)).toMatchObject({ bossStageId: 5, stagesAway: 3, nameKey: 'stage_5' })
    expect(win(6)).toMatchObject({ bossStageId: 10, stagesAway: 4, nameKey: 'stage_10' })
    expect(win(7)).toMatchObject({ bossStageId: 10, stagesAway: 3 })
    expect(win(11)).toMatchObject({ bossStageId: 15, stagesAway: 4 })
    expect(win(12)).toMatchObject({ bossStageId: 15, stagesAway: 3 })
    // Irregular stretch: 85 → 88 → 90.
    expect(win(86)).toMatchObject({ bossStageId: 88, stagesAway: 2, nameKey: 'stage_88' })
    expect(win(87)).toMatchObject({ bossStageId: 88, stagesAway: 1 })
    expect(win(89)).toMatchObject({ bossStageId: 90, stagesAway: 1, nameKey: 'stage_90' })
  })

  it('single boss → the boss skin', () => {
    expect(win(1)?.modelId).toBe('tornado') // stage 5 Cyclone Warlord
    expect(win(1)?.isTeam).toBe(false)
    expect(win(6)?.modelId).toBe('bear') // stage 10 split boss
    expect(win(11)?.modelId).toBe('snake') // stage 15 ghost boss
    expect(win(26)?.modelId).toBe('life-leech') // stage 30
  })

  it('boss team → the highest-level spinner of the team', () => {
    // Stage 20: castle 5+3, piranha 3+2, mysticaleye 4+3 → castle.
    expect(win(16)).toMatchObject({ bossStageId: 20, modelId: 'castle', isTeam: true })
    // Stage 100: mountain 61, gear 61, turtle 63, mysticaleye 61 → turtle.
    expect(win(96)).toMatchObject({ bossStageId: 100, modelId: 'turtle', isTeam: true })
    // Stage 95 includes a non-partner thunder blade; castle and piranha tie at
    // 56 → the first listed (castle) wins the tie.
    expect(win(91)).toMatchObject({ bossStageId: 95, modelId: 'castle' })
  })

  it('past the final boss the peek wraps into the next cycle', () => {
    // Stage 100 is the grand finale; 101 is cycle II of stage 1.
    const peek = win(101)
    expect(peek).toMatchObject({
      bossStageId: 105,
      stagesAway: 4,
      nameKey: 'stage_5',
      cycleSuffix: 'II',
      modelId: 'tornado'
    })
    expect(win(1)?.cycleSuffix).toBe('')
  })
})

describe('boss peek — gates', () => {
  it('only the campaign carries it', () => {
    for (const mode of ['pvp', 'ghost', 'cheat'] as BattleMode[]) {
      for (const id of [1, 2, 6, 7]) expect(win(id, mode), `${mode} @${id}`).toBeNull()
    }
    expect(win(1, 'campaign')).not.toBeNull()
  })

  it('never on a lose screen (or an undecided result)', () => {
    for (const id of [1, 2, 6, 7]) {
      expect(getBossPeek({ wonStageId: id, result: 'lose', mode: 'campaign' })).toBeNull()
      expect(getBossPeek({ wonStageId: id, result: null, mode: 'campaign' })).toBeNull()
    }
  })

  it('rejects nonsense stage ids (cheat sentinel -1, 0, fractions)', () => {
    for (const id of [-1, 0, 1.5, Number.NaN]) expect(win(id), `id ${id}`).toBeNull()
  })

  it('maps the arena flags to one mode, PvP first', () => {
    expect(battleModeOf({})).toBe('campaign')
    expect(battleModeOf({ pvp: true, ghost: true })).toBe('pvp')
    expect(battleModeOf({ ghost: true, cheat: true })).toBe('ghost')
    expect(battleModeOf({ cheat: true })).toBe('cheat')
  })

  it('replaying a cleared stage behaves like the first clear (keyed to the stage played)', () => {
    // The input is only the stage id — no progress parameter can leak in.
    expect(win(1)).toEqual(win(1))
    expect(win(6)?.wonStageId).toBe(6)
  })
})

describe('boss peek — synthetic schedules', () => {
  it('last boss of a finite campaign → no peek (nothing left to tease)', () => {
    const finite = table([5, 10], 12)
    expect(getBossPeek({ wonStageId: 6, result: 'win', mode: 'campaign' }, finite)).toMatchObject({ bossStageId: 10 })
    // After the last boss there is no next boss inside the search bound.
    expect(findNextBossStageId(11, finite)).toBeNull()
    expect(getBossPeek({ wonStageId: 11, result: 'win', mode: 'campaign' }, finite)).toBeNull()
    expect(getBossPeek({ wonStageId: 12, result: 'win', mode: 'campaign' }, finite)).toBeNull()
  })

  it('a table without any boss never shows (and the search terminates)', () => {
    const none = table([], 50)
    expect(getBossPeek({ wonStageId: 1, result: 'win', mode: 'campaign' }, none)).toBeNull()
  })

  it('back-to-back bosses: the stage between them is inside the window', () => {
    const tight = table([3, 4, 9], 20)
    expect(isInBossPeekWindow(5, tight)).toBe(true)
    expect(isInBossPeekWindow(6, tight)).toBe(true)
    expect(isInBossPeekWindow(7, tight)).toBe(false)
    expect(getBossPeek({ wonStageId: 2, result: 'win', mode: 'campaign' }, tight)).toMatchObject({
      bossStageId: 3,
      stagesAway: 1
    })
  })

  it('the window is two stages wide', () => {
    expect(BOSS_PEEK_WINDOW).toBe(2)
  })
})

describe('bossPreviewModelId', () => {
  it('lone boss → its skin', () => {
    expect(bossPreviewModelId([blade('dark', 25, 30)])).toBe('dark')
  })

  it('team → highest summed level, first wins ties, skin-less blades skipped', () => {
    expect(bossPreviewModelId([blade('a', 1, 1), blade('b', 3, 0), blade('c', 2, 1)])).toBe('b')
    expect(bossPreviewModelId([blade('a', 2, 2), blade('b', 3, 1)])).toBe('a')
    expect(bossPreviewModelId([blade(undefined, 99, 99), blade('b', 1, 1)])).toBe('b')
    expect(bossPreviewModelId([blade(undefined, 1, 1)])).toBeNull()
    expect(bossPreviewModelId([])).toBeNull()
  })

  it('every real boss resolves to a skin that ships an image in the catalog of names', () => {
    const skins = en.skins as Record<string, string>
    for (let id = 1; id <= 100; id++) {
      const stage = getStageById(id)
      if (!stage.isBoss) continue
      const modelId = bossPreviewModelId(stage.enemyTeam)
      expect(modelId, `stage ${id}`).toBeTruthy()
      expect(skins[modelId!], `stage ${id} skin ${modelId} has a name`).toBeTruthy()
    }
  })
})

describe('boss peek — i18n keys in every locale', () => {
  // Globbed, not listed: a locale file added later must carry the keys too.
  const globbed = import.meta.glob<Record<string, any>>('../src/i18n/locales/*.ts', { eager: true, import: 'default' })
  const locales: Record<string, any> = Object.fromEntries(
    Object.entries(globbed).map(([file, msgs]) => [file.replace(/^.*\/(\w+)\.ts$/, '$1'), msgs])
  )
  const KEYS = ['nextBoss', 'stagesAway', 'nextUp', 'portraitAlt'] as const

  it('covers at least the eight shipped locales', () => {
    for (const code of ['en', 'de', 'es', 'fr', 'jp', 'kr', 'ru', 'zh']) expect(locales[code], code).toBeTruthy()
    expect(locales.de).toBe(de)
    expect(locales.zh).toBe(zh)
  })

  for (const [name, loc] of Object.entries(locales)) {
    it(`${name} defines every bossPeek key, with its placeholders`, () => {
      const block = loc?.bossPeek
      expect(block, `${name}.bossPeek missing`).toBeTruthy()
      for (const key of KEYS) {
        expect(typeof block[key], `${name}.bossPeek.${key}`).toBe('string')
        expect(block[key].trim().length, `${name}.bossPeek.${key} empty`).toBeGreaterThan(0)
      }
      expect(block.nextBoss).toContain('{n}')
      expect(block.stagesAway).toContain('{n}')
      expect(block.portraitAlt).toContain('{name}')
    })
  }
})
