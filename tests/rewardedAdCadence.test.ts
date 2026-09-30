// A COMPLETED rewarded ad counts as the ad break: the between-battles
// interstitial counter restarts, so no interstitial lands right before the
// next battle. A skipped / unfilled / declined / throttled rewarded ad played
// nothing and leaves the cadence alone. The interstitial itself still only
// fires before a battle (never between a battle and its result screen).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computed } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let rewardedOutcome = true
const providerShowRewarded = vi.fn(async () => rewardedOutcome)
const providerShowMidgame = vi.fn(async () => {
})

vi.mock('@/platforms/rewardedAdsBuild', () => ({ HAS_REWARDED_ADS: true }))
vi.mock('@/use/useRewardedIntro', () => ({
  requiresRewardedIntro: false,
  requestRewardedIntro: async () => true
}))
vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => ({
    name: 'test',
    isReady: computed(() => true),
    isRewardedReady: computed(() => true),
    isInterstitialReady: computed(() => true),
    isAdsBlocked: computed(() => false),
    init: async () => {
    },
    showRewardedAd: () => providerShowRewarded(),
    showMidgameAd: () => providerShowMidgame()
  })
}))

const { showRewardedAd } = await import('@/use/useAds')
const cadence = await import('@/use/midgameCadence')
const { resetRewardedThrottle } = await import('@/use/useRewardedThrottle')

/** The view's pre-battle check, minus provider readiness (always true here). */
const interstitialBeforeNextBattle = () => cadence.isMidgameAdDue()

/** Put the cadence where the NEXT battle would get an interstitial. */
const makeAdDue = () => {
  cadence.markFirstMidgameAdShown()
  cadence.resetAdCounter()
  cadence.incrementAdCounter()
  cadence.incrementAdCounter()
}

beforeEach(() => {
  rewardedOutcome = true
  providerShowRewarded.mockClear()
  resetRewardedThrottle()
})

describe('rewarded completion resets the interstitial cadence', () => {
  it('a completed rewarded ad (e.g. win-screen 3x, roulette respin) resets the counter', async () => {
    makeAdDue()
    // Result screen: 2 battles since the last ad; tapping continue would
    // make it 3 = the threshold → interstitial before the next battle.
    expect(cadence.battlesSinceAd()).toBe(2)
    expect(await showRewardedAd({ kind: 'coins', amount: 300 })).toBe(true)
    expect(cadence.battlesSinceAd()).toBe(0)
    expect(localStorage.getItem(cadence.AD_BATTLES_KEY)).toBe('0')
    // Tap-to-continue counts this battle → 1 < 3: no interstitial next.
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(false)
  })

  it('a skipped / unfilled rewarded ad does NOT reset it', async () => {
    makeAdDue()
    rewardedOutcome = false
    expect(await showRewardedAd({ kind: 'respin' })).toBe(false)
    expect(cadence.battlesSinceAd()).toBe(2)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })

  it('a throttled rewarded request (no ad played) does NOT reset it', async () => {
    makeAdDue()
    for (let i = 0; i < 20; i++) await showRewardedAd()
    const calls = providerShowRewarded.mock.calls.length
    cadence.resetAdCounter()
    cadence.incrementAdCounter()
    cadence.incrementAdCounter()
    await showRewardedAd()
    // Throttle refused before the provider → nothing played, nothing reset.
    expect(providerShowRewarded.mock.calls.length).toBe(calls)
    expect(cadence.battlesSinceAd()).toBe(2)
  })

  it('the cadence resumes normally afterwards (every 3 battles)', async () => {
    makeAdDue()
    await showRewardedAd()
    cadence.incrementAdCounter() // this battle
    cadence.incrementAdCounter() // next
    expect(interstitialBeforeNextBattle()).toBe(false)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })
})

describe('POKI build: a completed rewarded ad leaves the cadence alone', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('POKI keeps the counter, so the commercialBreak still fires at the next natural break', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    makeAdDue()
    expect(await showRewardedAd({ kind: 'coins', amount: 300 })).toBe(true)
    expect(providerShowRewarded).toHaveBeenCalled()
    // Not reset: still 2, the tap-to-continue makes it 3 → break requested.
    expect(cadence.battlesSinceAd()).toBe(2)
    expect(localStorage.getItem(cadence.AD_BATTLES_KEY)).toBe('2')
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })

  it('every other portal still resets (POKI flag off)', async () => {
    vi.stubEnv('VITE_APP_POKI', 'false')
    makeAdDue()
    expect(await showRewardedAd()).toBe(true)
    expect(cadence.battlesSinceAd()).toBe(0)
  })

  it('the gate is a build-time literal, not a runtime flags param', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/midgameCadence.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export const noteRewardedAdCompleted'))
    expect(fn).toMatch(/import\.meta\.env\.VITE_APP_POKI === 'true'\) return/)
    expect(fn.indexOf('VITE_APP_POKI')).toBeLessThan(fn.indexOf('resetAdCounter()'))
  })
})

describe('R6: a completed rewarded ad satisfies a new player FIRST interstitial', () => {
  afterEach(() => vi.unstubAllEnvs())

  /** Fresh player: first-ad fast-path not consumed, counter at the fresh 1. */
  const freshPlayer = () => {
    localStorage.setItem(cadence.AD_FIRST_KEY, '0')
    localStorage.setItem(cadence.AD_BATTLES_KEY, '1')
  }

  it('non-Poki: the rewarded ad consumes the first-ad slot; no interstitial before battle 2', async () => {
    vi.stubEnv('VITE_APP_POKI', 'false')
    freshPlayer()
    expect(cadence.firstMidgameAdShown()).toBe(false)
    expect(cadence.midgameAdThreshold()).toBe(2)
    expect(await showRewardedAd({ kind: 'coins', amount: 50 })).toBe(true)
    expect(cadence.firstMidgameAdShown()).toBe(true)
    expect(localStorage.getItem(cadence.AD_FIRST_KEY)).toBe('1')
    expect(cadence.midgameAdThreshold()).toBe(3)
    // Battle 1 done → would have hit the fast-path 2 before; now not due.
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(false)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(false)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })

  it('non-Poki: a skipped rewarded ad leaves the first-ad slot open', async () => {
    vi.stubEnv('VITE_APP_POKI', 'false')
    freshPlayer()
    rewardedOutcome = false
    expect(await showRewardedAd()).toBe(false)
    expect(cadence.firstMidgameAdShown()).toBe(false)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })

  it('Poki: the first-ad fast-path is untouched (break before battle 2 still requested)', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    freshPlayer()
    expect(await showRewardedAd()).toBe(true)
    expect(cadence.firstMidgameAdShown()).toBe(false)
    expect(localStorage.getItem(cadence.AD_FIRST_KEY)).toBe('0')
    expect(cadence.battlesSinceAd()).toBe(1)
    cadence.incrementAdCounter()
    expect(interstitialBeforeNextBattle()).toBe(true)
  })

  it('the first-ad mark sits behind the same build-time Poki literal', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/midgameCadence.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export const noteRewardedAdCompleted'))
    expect(fn.indexOf('VITE_APP_POKI')).toBeLessThan(fn.indexOf('markFirstMidgameAdShown()'))
  })
})

describe('SpinnerArena still gates the interstitial before the battle', () => {
  const src = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')
  it('reads the shared cadence and fires only inside beginBattle', () => {
    expect(src).toContain('from \'@/use/midgameCadence\'')
    expect(src).not.toMatch(/const battlesSinceAd/)
    const begin = src.indexOf('const beginBattle = async')
    const due = src.indexOf('if (shouldShowMidgameAdNow())', begin)
    const start = src.indexOf('startMatch()', begin)
    expect(due).toBeGreaterThan(begin)
    expect(due).toBeLessThan(start)
    // Only one call site for the interstitial.
    expect(src.match(/showMidgameAd\(\)/g)?.length).toBe(1)
  })
})
