// Playtest run 1 — battle rules, flow and onboarding (#playtest-1-6, -8, -9,
// -11, -14). Pins the pure gates the arena reads plus the economy fact the
// stage-2 Team lesson depends on, and that every new string ships in every
// locale.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { firstFightBoostFor, showWinRuleHint, WIN_RULE_HINT_LAST_STAGE } from '@/use/battleOnboarding'
import { createStuckWatch, RESULT_SURFACE_STUCK_MS } from '@/use/resultSurfaceWatchdog'
import { TOWERS_FROM_STAGE } from '@/use/arenaTerrain'
import { getStageById } from '@/use/useSpinnerCampaign'
import { smasherLevelCost } from '@/data/smasherCatalog'
import { rouletteGrantFor } from '@/use/rouletteGrants'

describe('#playtest-1-11 first-fight ×2 assist', () => {
  it('applies only before the first win AND on stage 1', () => {
    expect(firstFightBoostFor(false, 1)).toBe(true)
    expect(firstFightBoostFor(true, 1)).toBe(false)
    // A seeded / restored save deep in the campaign without the first-win
    // flag fought one doubled stage, then a halved one.
    expect(firstFightBoostFor(false, 2)).toBe(false)
    expect(firstFightBoostFor(false, 68)).toBe(false)
  })
})

describe('#playtest-1-6 win-rule chip', () => {
  it('shows from the first stage with trees through the first boss, campaign only', () => {
    expect(showWinRuleHint(TOWERS_FROM_STAGE - 1, true)).toBe(false)
    for (let s = TOWERS_FROM_STAGE; s <= WIN_RULE_HINT_LAST_STAGE; s++) {
      expect(showWinRuleHint(s, true)).toBe(true)
      expect(showWinRuleHint(s, false)).toBe(false)
    }
    expect(showWinRuleHint(WIN_RULE_HINT_LAST_STAGE + 1, true)).toBe(false)
  })
})

describe('#playtest-1-9 stage-2 Team lesson is affordable', () => {
  it('stage 1 win pays at least the first smasher level-up', () => {
    const cost = smasherLevelCost(1)
    expect(cost).not.toBeNull()
    expect(getStageById(1).rewardWin).toBeGreaterThanOrEqual(cost!)
  })
})

describe('#playtest-1-14 wheel prize math', () => {
  it('a multiplier grant pays base × multiplier (the label under the total)', () => {
    const g = rouletteGrantFor({ type: 'multiplier', multiplier: 3 } as never, 1275)
    expect(g.multiplier).toBe(3)
    expect(g.coins).toBe(3825)
  })
})

describe('#playtest-1-8 dead game_over watchdog', () => {
  const dead = { gameOver: true, campaign: true, surfacesInDom: 0, otherModalOpen: false }

  it('fires only after the dead state lasted the threshold', () => {
    const w = createStuckWatch()
    expect(w.sample(0, dead)).toBe(false)
    expect(w.sample(RESULT_SURFACE_STUCK_MS - 1, dead)).toBe(false)
    expect(w.sample(RESULT_SURFACE_STUCK_MS, dead)).toBe(true)
    // and re-arms after firing
    expect(w.sample(RESULT_SURFACE_STUCK_MS + 1, dead)).toBe(false)
  })

  it('a visible surface, another modal, a live battle or a non-campaign fight resets it', () => {
    for (const ok of [
      { ...dead, surfacesInDom: 1 },
      { ...dead, otherModalOpen: true },
      { ...dead, gameOver: false },
      { ...dead, campaign: false }
    ]) {
      const w = createStuckWatch()
      w.sample(0, dead)
      expect(w.sample(1000, ok)).toBe(false)
      // the clock restarted: still not stuck right after the threshold of the first sample
      expect(w.sample(RESULT_SURFACE_STUCK_MS + 500, dead)).toBe(false)
    }
  })
})

describe('new onboarding strings ship in every locale', () => {
  const dir = join(__dirname, '..', 'src', 'i18n', 'locales')
  const files = readdirSync(dir).filter(f => f.endsWith('.ts'))
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(dir, f), 'utf8')
    for (const k of ['winRule', 'firstFightBoost', 'firstFightBoostHint', 'teamSpotlight', 'wheelPrize']) {
      expect(src, `${f} ${k}`).toMatch(new RegExp(`'${k}': '[^']+'`))
    }
  })
})
