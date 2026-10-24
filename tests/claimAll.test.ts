// #UX1b — battle pass "Claim all": every claimable pass + honour tier in one
// tap, ONE reveal with the coins summed. These pin the totals, that nothing is
// ever claimed (or a skin granted) twice, and that the claims are saved.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimAllVisible, claimAll, claimableCount, type ClaimAllDeps, type TierClaim } from '@/use/claimAll'
import type { SpinnerModelId } from '@/data/skinCatalog'

// useBattlePass pulls useModels (useMatch↔useModels↔useUser cycle) — load
// useUser first, mirroring the app's boot order.
import '@/use/useUser'
import useBattlePass, { bpCoinReward, bpIsJackpotStage, bpIsSkinStage, BP_JACKPOT_COINS } from '@/use/useBattlePass'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { getOfferableSkinPool, isSkinOwned, SKINS_PER_TOP } from '@/use/useModels'
import { topPartOfSkin } from '@/data/skinCatalog'

/** An in-memory pass + honour track with the same refusal rules as the real ones. */
const fakeTrack = (opts: {
  pass: Record<number, TierClaim>
  honor: number[]
  honorOffers?: Record<number, SpinnerModelId>
  pool: SpinnerModelId[]
}) => {
  const claimedPass = new Set<number>()
  const claimedHonor = new Set<number>()
  const owned = new Set<SpinnerModelId>()
  const deps: ClaimAllDeps = {
    pendingPass: () => Object.keys(opts.pass).map(Number).filter(s => !claimedPass.has(s)).sort((a, b) => a - b),
    passOffer: () => null,
    claimPass: (stage) => {
      if (claimedPass.has(stage) || !opts.pass[stage]) return null
      claimedPass.add(stage)
      const r = opts.pass[stage]!
      if (r.skin) owned.add(r.skin)
      return r
    },
    pendingHonor: () => opts.honor.filter(s => !claimedHonor.has(s)),
    honorOffer: (stage) => opts.honorOffers?.[stage],
    offerablePool: () => opts.pool.filter(s => !owned.has(s)),
    claimHonor: (stage) => {
      if (claimedHonor.has(stage)) return false
      claimedHonor.add(stage)
      return true
    },
    unlockSkin: (s) => { owned.add(s) },
    pick: (pool) => pool[0]!
  }
  return { deps, claimedPass, claimedHonor, owned }
}

describe('claimAll (orchestration)', () => {
  it('sums coins over every pass tier (jackpot tiers included) and lists every skin once', () => {
    const { deps } = fakeTrack({
      pass: {
        1: { coins: 30, skin: null },
        2: { coins: 35, skin: null },
        10: { coins: 0, skin: 'ice' },
        15: { coins: 3000, skin: null }
      },
      honor: [1, 2],
      honorOffers: { 1: 'wasp', 2: 'chip' },
      pool: ['ice', 'wasp', 'chip', 'turtle']
    })
    expect(claimableCount(deps)).toBe(6)
    const r = claimAll(deps)
    expect(r.passStages).toEqual([1, 2, 10, 15])
    expect(r.honorStages).toEqual([1, 2])
    expect(r.coins).toBe(3065)
    expect(r).not.toHaveProperty('diamonds')
    expect(r.skins).toEqual(['ice', 'wasp', 'chip'])
  })

  it('claims nothing twice: a second claim-all is empty', () => {
    const { deps } = fakeTrack({
      pass: { 1: { coins: 30, skin: null } },
      honor: [1],
      honorOffers: { 1: 'wasp' },
      pool: ['wasp', 'chip']
    })
    claimAll(deps)
    expect(claimableCount(deps)).toBe(0)
    expect(claimAll(deps)).toEqual({ passStages: [], honorStages: [], coins: 0, skins: [] })
  })

  it('gives an honour tier another skin when its advertised one was just granted by the pass', () => {
    const { deps } = fakeTrack({
      pass: { 10: { coins: 0, skin: 'ice' } },
      honor: [1],
      honorOffers: { 1: 'ice' },
      pool: ['ice', 'chip']
    })
    const r = claimAll(deps)
    expect(r.skins).toEqual(['ice', 'chip'])
    expect(new Set(r.skins).size).toBe(r.skins.length)
  })

  it('leaves honour tiers unclaimed when no offerable skin is left (like a single claim)', () => {
    const { deps, claimedHonor } = fakeTrack({
      pass: { 10: { coins: 0, skin: 'ice' } },
      honor: [1, 2],
      honorOffers: { 1: 'ice', 2: 'ice' },
      pool: ['ice']
    })
    const r = claimAll(deps)
    expect(r.honorStages).toEqual([])
    expect(claimedHonor.size).toBe(0)
  })

  it('skips a tier the claim refuses without counting it', () => {
    const { deps } = fakeTrack({ pass: { 1: { coins: 30, skin: null } }, honor: [], pool: [] })
    const refusing: ClaimAllDeps = { ...deps, pendingPass: () => [1, 2], claimPass: (s, o) => (s === 2 ? null : deps.claimPass(s, o)) }
    const r = claimAll(refusing)
    expect(r.passStages).toEqual([1])
    expect(r.coins).toBe(30)
  })
})

describe('claimAll with the real battle pass', () => {
  const bp = useBattlePass()
  const { coins } = useSpinnerConfig()

  beforeEach(() => {
    localStorage.removeItem('smashers_battle_pass')
    localStorage.removeItem('smashers_owned_skins')
    bp.state.value = {
      xp: 0,
      unlockedStages: 16,
      claimedStages: [3],
      claimedSkins: {},
      offeredSkins: {},
      seasonStartedAt: null
    }
  })

  const realDeps = (): ClaimAllDeps => ({
    pendingPass: () => {
      const out: number[] = []
      for (let s = 1; s <= bp.unlockedStages.value; s++) if (!bp.isStageClaimed(s)) out.push(s)
      return out
    },
    passOffer: () => null,
    claimPass: (stage, offer) => bp.claimStage(stage, offer),
    pendingHonor: () => [],
    honorOffer: () => null,
    offerablePool: () => getOfferableSkinPool(),
    claimHonor: () => false,
    unlockSkin: vi.fn()
  })

  it('claims every unlocked tier once, pays the summed coins and saves the claims', () => {
    const before = coins.value
    const r = claimAll(realDeps())
    const expected = Array.from({ length: 16 }, (_, i) => i + 1).filter(s => s !== 3)
    expect(r.passStages).toEqual(expected)

    let expectedCoins = 0
    for (const s of expected) {
      if (bpIsJackpotStage(s)) { expectedCoins += BP_JACKPOT_COINS; continue }
      if (bpIsSkinStage(s) && r.skins.length > 0) continue
      expectedCoins += bpCoinReward(s)
    }
    expect(r.coins).toBe(expectedCoins)
    expect(r).not.toHaveProperty('diamonds') // stage 15 pays coins now
    expect(r.skins).toHaveLength(1) // stage 10
    expect(coins.value - before).toBe(expectedCoins)

    // Every tier exactly once, in the save.
    const saved = JSON.parse(localStorage.getItem('smashers_battle_pass') ?? '{}')
    expect([...saved.claimedStages].sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(new Set(saved.claimedStages).size).toBe(saved.claimedStages.length)
    expect(saved.claimedSkins[10]).toBe(r.skins[0])
    const top = topPartOfSkin(r.skins[0]!)
    expect(top && isSkinOwned(top, r.skins[0]!)).toBe(true)
    expect(SKINS_PER_TOP[top!]).toContain(r.skins[0])

    // And a second claim-all finds nothing.
    expect(claimAll(realDeps()).passStages).toEqual([])
  })
})

describe('claimAllVisible (#UX1c)', () => {
  it('shows from two waiting tiers, pass and honour together', () => {
    expect(claimAllVisible(2, 0)).toBe(true)
    expect(claimAllVisible(1, 1)).toBe(true)
    expect(claimAllVisible(0, 2)).toBe(true)
  })
  it('shows for the honour track alone when the pass has nothing waiting', () => {
    expect(claimAllVisible(0, 1)).toBe(true)
  })
  it('never for a single pass tier (its own claim button is right there) or nothing', () => {
    expect(claimAllVisible(1, 0)).toBe(false)
    expect(claimAllVisible(0, 0)).toBe(false)
  })
})
