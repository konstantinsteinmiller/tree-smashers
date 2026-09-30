// D14 + D19: on EVERY build without rewarded ads (CrazyGames basic launch,
// itch, Glitch, GamePix, Y8, WaveDash, plain web, native without ads) the 2x
// switch exists and a boost costs SPEED_BOOST_COIN_PRICE coins instead of an
// ad. D17: the free first-time / daily gifts come first on every build. Ad
// builds keep their behaviour. See src/use/speedBoostPurchase.ts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SPEED_BOOST_COIN_PRICE,
  handleSpeedSwitchTap,
  isSpeedBoostUnaffordable,
  isSpeedSwitchOffered,
  type SpeedTapDeps
} from '@/use/speedBoostPurchase'

const BUILD_OFF: Record<string, string> = {
  VITE_APP_CRAZY_WEB: '', VITE_APP_CRAZY_GAMES_FULL_RELEASE: '', VITE_APP_GAME_DISTRIBUTION: '',
  VITE_APP_PLAYGAMA: '', VITE_APP_POKI: '', VITE_APP_NATIVE: '', VITE_APP_SHOW_MEDIATOR_ADS: '',
  VITE_APP_ITCH: '', VITE_APP_GLITCH: '', VITE_APP_GAMEPIX: '', VITE_APP_Y8: '', VITE_APP_WAVEDASH: ''
}
const CG_BASIC = { VITE_APP_CRAZY_WEB: 'true' }
const CG_BASIC_EXPLICIT_FALSE = { VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'false' }
const AD_BUILDS: Record<string, Record<string, string>> = {
  'CrazyGames full release': { VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'true' },
  GameDistribution: { VITE_APP_GAME_DISTRIBUTION: 'true' },
  Playgama: { VITE_APP_PLAYGAMA: 'true' },
  Poki: { VITE_APP_POKI: 'true' },
  'native + mediator ads': { VITE_APP_NATIVE: 'true', VITE_APP_SHOW_MEDIATOR_ADS: 'true' }
}
const NO_AD_BUILDS: Record<string, Record<string, string>> = {
  itch: { VITE_APP_ITCH: 'true' },
  Glitch: { VITE_APP_GLITCH: 'true' },
  GamePix: { VITE_APP_GAMEPIX: 'true' },
  Y8: { VITE_APP_Y8: 'true' },
  WaveDash: { VITE_APP_WAVEDASH: 'true' },
  'plain web': {},
  'native without ads': { VITE_APP_NATIVE: 'true' }
}

const setBuild = (env: Record<string, string>): void => {
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries({ ...BUILD_OFF, ...env })) vi.stubEnv(k, v)
}

/** Re-fold the module's build-time constants under the stubbed env. */
const loadFlag = async (): Promise<typeof import('@/use/speedBoostPurchase')> => {
  vi.resetModules()
  return import('@/use/speedBoostPurchase')
}

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('IS_COIN_SPEED_BOOST_BUILD (build-time flag)', () => {
  it('is on for CrazyGames basic launch', async () => {
    setBuild(CG_BASIC)
    expect((await loadFlag()).IS_COIN_SPEED_BOOST_BUILD).toBe(true)
    setBuild(CG_BASIC_EXPLICIT_FALSE)
    expect((await loadFlag()).IS_COIN_SPEED_BOOST_BUILD).toBe(true)
  })

  it.each(Object.entries(AD_BUILDS))('is off on ad build %s', async (_, env) => {
    setBuild(env)
    expect((await loadFlag()).IS_COIN_SPEED_BOOST_BUILD).toBe(false)
  })

  it.each(Object.entries(NO_AD_BUILDS))('is on for no-ad build %s', async (_, env) => {
    setBuild(env)
    expect((await loadFlag()).IS_COIN_SPEED_BOOST_BUILD).toBe(true)
  })

  it('is derived from the build-time HAS_REWARDED_ADS literal, never a runtime flag', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/speedBoostPurchase.ts'), 'utf8')
    expect(src).toMatch(/IS_COIN_SPEED_BOOST_BUILD: boolean = !HAS_REWARDED_ADS/)
    expect(src).not.toMatch(/flags/)
  })

  it('the price is one named constant of 100 coins', () => {
    expect(SPEED_BOOST_COIN_PRICE).toBe(100)
  })
})

describe('isSpeedSwitchOffered', () => {
  const none = { rewardedReady: false, boostActive: false, freeGift: false }

  it('CG basic launch: visible with no ad, no boost and no gift', async () => {
    setBuild(CG_BASIC)
    const m = await loadFlag()
    expect(m.isSpeedSwitchOffered(none)).toBe(true)
  })

  it.each(Object.entries(AD_BUILDS))('ad build %s: unchanged — needs an ad, a boost or a gift', async (_, env) => {
    setBuild(env)
    const m = await loadFlag()
    expect(m.isSpeedSwitchOffered(none)).toBe(false)
    expect(m.isSpeedSwitchOffered({ ...none, rewardedReady: true })).toBe(true)
    expect(m.isSpeedSwitchOffered({ ...none, boostActive: true })).toBe(true)
    expect(m.isSpeedSwitchOffered({ ...none, freeGift: true })).toBe(true)
  })

  it.each(Object.entries(NO_AD_BUILDS))('no-ad build %s: visible with no ad, no boost and no gift', async (_, env) => {
    setBuild(env)
    const m = await loadFlag()
    expect(m.isSpeedSwitchOffered(none)).toBe(true)
  })

  it('explicit coinBuild override', () => {
    expect(isSpeedSwitchOffered({ ...none, coinBuild: true })).toBe(true)
    expect(isSpeedSwitchOffered({ ...none, coinBuild: false })).toBe(false)
  })
})

describe('isSpeedBoostUnaffordable', () => {
  const at = (coins: number, extra: Partial<Parameters<typeof isSpeedBoostUnaffordable>[0]> = {}) =>
    isSpeedBoostUnaffordable({ coins, boostActive: false, freeGift: false, coinBuild: true, ...extra })

  it('only on the coin build, only without a running boost, only below the price', () => {
    expect(at(99)).toBe(true)
    expect(at(100)).toBe(false)
    expect(at(0, { boostActive: true })).toBe(false)
    expect(at(0, { coinBuild: false })).toBe(false)
  })

  it('never while a free gift is on offer — a broke first-timer can still take it', () => {
    expect(at(0, { freeGift: true })).toBe(false)
    expect(at(99, { freeGift: true })).toBe(false)
  })
})

// ─── Tap flow, wired to the real coin wallet (useSpinnerConfig.addCoins) ────

const makeHarness = async (coinBuild: boolean, startCoins: number) => {
  vi.resetModules()
  localStorage.setItem('spinner_coins', String(startCoins))
  // useUser first (useMatch ↔ useModels ↔ useUser cycle guard).
  await import('@/use/useUser')
  const { default: useSpinnerConfig } = await import('@/use/useSpinnerConfig')
  const wallet = useSpinnerConfig()
  let expiresAt = 0
  let speed: 1 | 2 = 1
  const grants: string[] = []
  const showAd = vi.fn()
  const claimFree = vi.fn((): 'first' | 'daily' | null => null)
  const deps: SpeedTapDeps = {
    isBoostActive: () => Date.now() < expiresAt,
    setSpeed: (v) => {
      speed = v
    },
    claimFree,
    grant: (kind) => {
      grants.push(kind)
      expiresAt = Date.now() + 3 * 60 * 1000
      speed = 2
    },
    showAd,
    coins: () => wallet.coins.value,
    spendCoins: (n) => wallet.addCoins(-n),
    coinBuild
  }
  return { wallet, deps, grants, showAd, claimFree, speed: () => speed }
}

describe('handleSpeedSwitchTap', () => {
  beforeEach(() => localStorage.clear())

  it('CG basic: buys a full boost for 100 coins, persisted through the wallet', async () => {
    const h = await makeHarness(true, 250)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('coins')
    expect(h.wallet.coins.value).toBe(150)
    expect(localStorage.getItem('spinner_coins')).toBe('150')
    expect(h.grants).toEqual(['full'])
    expect(h.speed()).toBe(2)
    expect(h.showAd).not.toHaveBeenCalled()
  })

  it('CG basic: a double tap charges once; later taps just toggle', async () => {
    const h = await makeHarness(true, 250)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('coins')
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('toggle')
    expect(handleSpeedSwitchTap(1, h.deps)).toBe('normal')
    expect(h.speed()).toBe(1)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('toggle')
    expect(h.speed()).toBe(2)
    expect(h.wallet.coins.value).toBe(150)
    expect(h.grants).toEqual(['full'])
  })

  it('CG basic: not enough coins blocks — no charge, no boost, no ad', async () => {
    const h = await makeHarness(true, 99)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('blocked')
    expect(h.wallet.coins.value).toBe(99)
    expect(h.grants).toEqual([])
    expect(h.speed()).toBe(1)
    expect(h.showAd).not.toHaveBeenCalled()
  })

  it('CG basic: exactly the price is enough and leaves 0', async () => {
    const h = await makeHarness(true, 100)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('coins')
    expect(h.wallet.coins.value).toBe(0)
  })

  it('a failing grant (storage throws) charges nothing', async () => {
    const h = await makeHarness(true, 250)
    h.deps.grant = () => {
      throw new Error('QuotaExceeded')
    }
    expect(() => handleSpeedSwitchTap(2, h.deps)).toThrow()
    expect(h.wallet.coins.value).toBe(250)
  })

  it('ad builds unchanged: gift first, then the ad — never coins', async () => {
    const h = await makeHarness(false, 5000)
    h.claimFree.mockReturnValueOnce('first').mockReturnValueOnce(null)
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('free-first')
    expect(h.grants).toEqual(['full'])
    // boost running → toggle
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('toggle')
    // expire it
    h.deps.isBoostActive = () => false
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('ad')
    expect(h.showAd).toHaveBeenCalledTimes(1)
    expect(h.wallet.coins.value).toBe(5000)
  })

  it('ad builds: the daily gift grants the short boost', async () => {
    const h = await makeHarness(false, 0)
    h.claimFree.mockReturnValueOnce('daily')
    expect(handleSpeedSwitchTap(2, h.deps)).toBe('free-daily')
    expect(h.grants).toEqual(['daily'])
  })
})

// ─── Priority on no-ad builds, wired to the real gift + wallet ─────────────
//
// running boost → free gift (FREE badge) → coin buy (100-coin sticker).

describe.each([
  ['CrazyGames basic launch', CG_BASIC],
  ['GamePix', { VITE_APP_GAMEPIX: 'true' }],
  ['itch', { VITE_APP_ITCH: 'true' }]
] as Array<[string, Record<string, string>]>)('no-ad build %s: free gift before the coin buy', (_, env) => {
  it('fresh save: FREE first (even with 0 coins), then the boost toggles, then 100 coins', async () => {
    localStorage.clear()
    setBuild(env)
    const h = await makeHarness(true, 0)
    const status = await import('@/use/useSaveStatus')
    status.hydrateState.value = 'success-empty'
    const gift = await import('@/use/useFreeSpeedGift')
    gift.__resetFreeSpeedGift()
    const m = await import('@/use/speedBoostPurchase')
    expect(m.IS_COIN_SPEED_BOOST_BUILD).toBe(true)
    h.deps.coinBuild = undefined // use the folded build flag
    h.deps.claimFree = gift.claimFreeSpeedBoost

    // Badge state: FREE wins; the 2x is not disabled despite 0 coins.
    expect(gift.hasAnyFreeSpeedGift.value).toBe(true)
    expect(m.isSpeedBoostUnaffordable({
      coins: 0,
      boostActive: false,
      freeGift: gift.hasAnyFreeSpeedGift.value
    })).toBe(false)

    expect(m.handleSpeedSwitchTap(2, h.deps)).toBe('free-first')
    expect(h.grants).toEqual(['full'])
    expect(h.wallet.coins.value).toBe(0)
    // Double tap during the boost: toggle, never a second claim or charge.
    expect(m.handleSpeedSwitchTap(2, h.deps)).toBe('toggle')

    // Boost over, gift spent: the coin price applies (disabled at 0 coins).
    h.deps.isBoostActive = () => false
    expect(gift.hasAnyFreeSpeedGift.value).toBe(false)
    expect(m.isSpeedBoostUnaffordable({ coins: 0, boostActive: false, freeGift: false })).toBe(true)
    expect(m.handleSpeedSwitchTap(2, h.deps)).toBe('blocked')
    h.wallet.addCoins(150)
    expect(m.handleSpeedSwitchTap(2, h.deps)).toBe('coins')
    expect(h.wallet.coins.value).toBe(50)
    expect(h.showAd).not.toHaveBeenCalled()
  })
})
