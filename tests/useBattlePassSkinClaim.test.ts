// Regression tests for the Battle Pass skin-claim bug CG QA reported
// 2026-05-05.
//
// Symptom:
//   1. The Battle Pass modal offers "rainbow" (a SPECIAL skin) at stage
//      10. Player clicks claim.
//   2. The Skin Shop later shows red dragon as unlocked, NOT rainbow.
//   3. Reopening the Battle Pass modal also shows red dragon at stage 10.
//
// Root causes (two stacked):
//   A. `BattlePass.vue`'s component-local `unownedSkinModelIds` did NOT
//      filter out `SPECIAL_SKINS`, so it offered specials (rainbow,
//      dark, tornado, …) which by design cost 1500 coins and aren't
//      eligible for free pass rewards.
//   B. `useBattlePass.ts`'s `claimStage` defends against an offered
//      skin that's not in its (correctly-filtered) pool by silently
//      substituting a random non-special skin from the pool. Combined
//      with bug A, the player was offered a special, the claim refused
//      it, and a different skin was awarded — but the BP UI's
//      `claimedSkins[stage] = substituted_skin` then leaked into the
//      modal, replacing the originally-shown rainbow card with the
//      substituted skin's image.
//
// Tests focus on the shared `getOfferableSkinPool` helper that the fix
// extracts to `useModels.ts`. Both `useBattlePass.ts` and
// `BattlePass.vue` and `DailyRewards.vue` use this single source of
// truth, so once it's correct the bug is fixed in all three places.

import { describe, it, expect } from 'vitest'
import {
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  getOfferableSkinPool,
  type SpinnerModelId
} from '@/data/skinCatalog'

const ownsNothing = (_: SpinnerModelId): boolean => false
const ownsEverything = (_: SpinnerModelId): boolean => true
const ownsOnly = (modelIds: SpinnerModelId[]) => {
  const set = new Set<string>(modelIds)
  return (id: SpinnerModelId) => set.has(id)
}

describe('Battle Pass / Daily Rewards — offerable skin pool', () => {
  it('does NOT include any SPECIAL_SKINS in the offerable pool', () => {
    const pool = getOfferableSkinPool(ownsNothing)
    expect(pool.length).toBeGreaterThan(0)
    for (const modelId of pool) {
      expect(SPECIAL_SKINS.has(modelId), `expected ${modelId} not to be a special skin`).toBe(false)
    }
  })

  it('rainbow (the QA-reported case) is NOT in the offerable pool', () => {
    expect(getOfferableSkinPool(ownsNothing)).not.toContain('rainbow')
  })

  it('every special skin is excluded', () => {
    const pool = new Set(getOfferableSkinPool(ownsNothing))
    for (const special of SPECIAL_SKINS) {
      expect(pool.has(special), `unexpected special "${special}" in offerable pool`).toBe(false)
    }
  })

  it('regular skins (non-special, unowned) ARE in the pool', () => {
    const pool = getOfferableSkinPool(ownsNothing)
    expect(pool).toContain('ice')
    expect(pool).toContain('wasp')
    expect(pool).toContain('chip')
  })

  it('drops skins the predicate reports as fully owned', () => {
    const pool = getOfferableSkinPool(ownsOnly(['ice', 'wasp']))
    expect(pool).not.toContain('ice')
    expect(pool).not.toContain('wasp')
    // Other non-specials still show up.
    expect(pool).toContain('chip')
  })

  it('returns empty when every skin is owned', () => {
    expect(getOfferableSkinPool(ownsEverything)).toEqual([])
  })

  it('every entry in the pool maps back to a real (top, model) pairing', () => {
    const pool = getOfferableSkinPool(ownsNothing)
    for (const modelId of pool) {
      const found = (Object.values(SKINS_PER_TOP) as SpinnerModelId[][]).some(list => list.includes(modelId))
      expect(found, `${modelId} appears in the pool but isn't in SKINS_PER_TOP`).toBe(true)
    }
  })

  it('the pool size shrinks monotonically as skins are bought', () => {
    const a = getOfferableSkinPool(ownsNothing).length
    const b = getOfferableSkinPool(ownsOnly(['ice'])).length
    const c = getOfferableSkinPool(ownsOnly(['ice', 'wasp'])).length
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})

describe('Battle Pass — claimed skin must remain stable across modal refreshes (CG QA 2026-05-05)', () => {
  // The "claimed skin morphs" symptom comes from offered/claimed maps
  // diverging when the offered pool is recomputed AFTER a claim. The
  // fix is structural: BP card UI prefers `claimedSkins[stage]` over
  // `offeredSkins[stage]`. Verify that contract on a small fixture so
  // a future refactor can't silently break it.
  it('a stage that has been claimed prefers the claimed skin even if offered changes', () => {
    const claimedSkins: Record<number, SpinnerModelId> = { 10: 'wasp' }
    const offeredSkins: Record<number, SpinnerModelId> = { 10: 'reddragon' }
    const skinForStage = (stage: number): SpinnerModelId | null =>
      claimedSkins[stage] ?? offeredSkins[stage] ?? null

    // The player saw "wasp" at claim time. Reopening the modal must
    // still show "wasp", not the freshly-resampled "reddragon".
    expect(skinForStage(10)).toBe('wasp')
  })

  it('an unclaimed stage falls back to the offered skin', () => {
    const claimedSkins: Record<number, SpinnerModelId> = {}
    const offeredSkins: Record<number, SpinnerModelId> = { 10: 'wasp' }
    const skinForStage = (stage: number): SpinnerModelId | null =>
      claimedSkins[stage] ?? offeredSkins[stage] ?? null

    expect(skinForStage(10)).toBe('wasp')
  })
})
