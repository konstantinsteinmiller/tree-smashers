// Boss roulette pays the DEFEATED BOSS stage's reward — on both spins.
//
// The boss-win branch advances the stage before the roulette opens, and the
// live `rewardAmount` then reads the NEXT (non-boss) stage. Boss 5 used to pay
// 140 x multiplier (stage 6) instead of 200 x multiplier (stage 5). The base is
// now snapshotted before `advanceStage()`, and both the first spin and the
// additive "Spin Again" respin multiply that snapshot. Which reward a spin
// lands is the wheel's business (pinned by the recorded-outcome replay in
// rouletteWheel.test.ts) and is not touched here.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// useUser first (useMatch <-> useModels <-> useUser cycle guard).
await import('@/use/useUser')
const { getStageById } = await import('@/use/useSpinnerCampaign')
const { rouletteGrantFor } = await import('@/use/rouletteGrants')

const src = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')

const fnBody = (name: string): string => {
  const start = src.indexOf(`const ${name} = `)
  expect(start).toBeGreaterThan(0)
  // The SFC may be checked out with CRLF line endings.
  const m = /\r?\n\}\r?\n/.exec(src.slice(start))
  expect(m).not.toBeNull()
  return src.slice(start, start + m!.index)
}

describe('boss roulette base = the boss stage reward', () => {
  it('boss stages pay more than the stage after them (the bug was visible)', () => {
    for (const id of [5, 10, 15, 20]) {
      const boss = getStageById(id)
      expect(boss.isBoss).toBe(true)
      expect(getStageById(id + 1).rewardWin).not.toBe(boss.rewardWin)
    }
  })

  it('both spins multiply the boss stage rewardWin (e.g. boss 5)', () => {
    const boss = getStageById(5)
    const base = boss.rewardWin
    const first = rouletteGrantFor({ type: 'multiplier', multiplier: 2 }, base)
    const respin = rouletteGrantFor({ type: 'multiplier', multiplier: 3 }, base)
    expect(first.coins).toBe(Math.round(base * 2))
    expect(respin.coins).toBe(Math.round(base * 3))
    expect(first.coins + respin.coins).toBe(Math.round(base * 5))
    const skin = rouletteGrantFor({ type: 'skin', skin: { topPartId: 'alpha' as any, modelId: 'n1' as any } }, base)
    expect(skin.coins).toBe(base)
  })

  it('SpinnerArena snapshots the boss reward BEFORE advancing the stage', () => {
    const branch = src.indexOf('if (isBossWin) {')
    expect(branch).toBeGreaterThan(0)
    const snap = src.indexOf('rouletteBaseCoins.value = rewardAmount.value', branch)
    const adv = src.indexOf('advanceStage()', branch)
    const ret = src.indexOf('return', branch)
    expect(snap).toBeGreaterThan(branch)
    expect(snap).toBeLessThan(adv)
    expect(adv).toBeLessThan(ret)
  })

  it('every landed spin (first + Spin Again) reads the snapshot, never the live rewardAmount', () => {
    const body = fnBody('onRouletteResult')
    expect(body).toContain('rouletteGrantFor(result, rouletteBaseCoins.value)')
    expect(body).not.toContain('rewardAmount')
    // The wheel emits `result` once per landed spin — first and respin both
    // go through this single handler.
    expect(src).toMatch(/RouletteWheel\(@result="onRouletteResult"/)
  })
})
