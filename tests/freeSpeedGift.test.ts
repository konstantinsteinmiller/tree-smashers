import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isSpeedGiftAvailable,
  shouldGrantSpeedGift,
  SPEED_GIFT_KEY,
  SPEED_GIFT_USED_LOCAL_KEY,
  type SpeedGiftGateInput
} from '@/use/speedGiftGate'
import type { HydrateState } from '@/utils/save/types'

// ─── The pure gate ──────────────────────────────────────────────────────────

const base: SpeedGiftGateInput = {
  stored: null,
  usedLocally: false,
  hasProgress: false,
  pristineAtBoot: true,
  hydrate: 'success-empty'
}

describe('shouldGrantSpeedGift', () => {
  it('grants a genuine first-timer once the save read has settled', () => {
    expect(shouldGrantSpeedGift(base)).toBe(true)
    // LocalStorageStrategy reports success-with-data unconditionally.
    expect(shouldGrantSpeedGift({ ...base, hydrate: 'success-with-data' })).toBe(true)
  })

  it('waits while the cloud read is unsettled, fails closed when it gives up', () => {
    for (const hydrate of ['pending', 'failed-retrying', 'failed-final'] as HydrateState[]) {
      expect(shouldGrantSpeedGift({ ...base, hydrate })).toBe(false)
    }
  })

  it('never grants to a save with progress (existing / returning players)', () => {
    expect(shouldGrantSpeedGift({ ...base, hasProgress: true, pristineAtBoot: false })).toBe(false)
    // Cloud save hydrated with data: the progress is the returning player's.
    expect(shouldGrantSpeedGift({ ...base, hasProgress: true, hydrate: 'success-with-data' })).toBe(false)
    // Unknown (storage threw) fails closed.
    expect(shouldGrantSpeedGift({ ...base, hasProgress: null })).toBe(false)
  })

  it('grants a first-timer whose empty cloud read settled after their first match', () => {
    expect(shouldGrantSpeedGift({ ...base, hasProgress: true, pristineAtBoot: true })).toBe(true)
  })

  it('only moves forward: granted/used/locally-used is never re-granted', () => {
    expect(shouldGrantSpeedGift({ ...base, stored: 'granted' })).toBe(false)
    expect(shouldGrantSpeedGift({ ...base, stored: 'used' })).toBe(false)
    expect(shouldGrantSpeedGift({ ...base, usedLocally: true })).toBe(false)
  })
})

describe('isSpeedGiftAvailable', () => {
  it('is available only while granted and unused', () => {
    expect(isSpeedGiftAvailable({ stored: 'granted', usedLocally: false })).toBe(true)
    expect(isSpeedGiftAvailable({ stored: 'used', usedLocally: false })).toBe(false)
    expect(isSpeedGiftAvailable({ stored: null, usedLocally: false })).toBe(false)
    // A stale cloud blob brought 'granted' back, but this device spent it.
    expect(isSpeedGiftAvailable({ stored: 'granted', usedLocally: true })).toBe(false)
  })
})

// ─── The live composable (a "reload" = fresh module graph over the same storage) ─

// The gift is on every build (D17/D19). Each boot re-imports the module
// graph, so stubbed VITE_APP_* flags are re-folded per test.
const BUILD_OFF: Record<string, string> = {
  VITE_APP_CRAZY_WEB: '', VITE_APP_CRAZY_GAMES_FULL_RELEASE: '', VITE_APP_GAME_DISTRIBUTION: '',
  VITE_APP_PLAYGAMA: '', VITE_APP_POKI: '', VITE_APP_NATIVE: '', VITE_APP_SHOW_MEDIATOR_ADS: '',
  VITE_APP_ITCH: '', VITE_APP_GLITCH: '', VITE_APP_GAMEPIX: '', VITE_APP_Y8: '', VITE_APP_WAVEDASH: ''
}
const CG_FULL_RELEASE = { VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'true' }
const CG_BASIC_LAUNCH = { VITE_APP_CRAZY_WEB: 'true' }
const setBuild = (env: Record<string, string>): void => {
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries({ ...BUILD_OFF, ...env })) vi.stubEnv(k, v)
}

const boot = async (hydrate: HydrateState = 'success-with-data') => {
  vi.resetModules()
  const status = await import('@/use/useSaveStatus')
  status.hydrateState.value = hydrate
  const gift = await import('@/use/useFreeSpeedGift')
  return { status, gift }
}

describe('useFreeSpeedGift', () => {
  beforeEach(() => {
    localStorage.clear()
    setBuild(CG_FULL_RELEASE)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('shows the gift to a new player and persists the grant', async () => {
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(true)
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('granted')
  })

  it('an unused gift survives a reload after the player has made progress', async () => {
    await boot()
    localStorage.setItem('spinner_campaign_stage', '3')
    localStorage.setItem('spinner_coins', '120')
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(true)
  })

  it('consumes on use, persists it, and the next tap falls through to the ad path', async () => {
    const { gift } = await boot()
    expect(gift.consumeFreeSpeedGift()).toBe(true)
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('used')
    expect(localStorage.getItem(SPEED_GIFT_USED_LOCAL_KEY)).toBe('1')
    // Second tap: no gift left → caller shows the rewarded ad as before.
    expect(gift.consumeFreeSpeedGift()).toBe(false)
  })

  it('is not re-granted after a reload', async () => {
    const first = await boot()
    first.gift.consumeFreeSpeedGift()
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(gift.consumeFreeSpeedGift()).toBe(false)
  })

  it('does not grant a returning player whose cloud save hydrates after boot', async () => {
    // New device: empty localStorage, cloud read still in flight.
    const { status, gift } = await boot('pending')
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    // The hydrate lands with the player's save …
    localStorage.setItem('spinner_campaign_stage', '12')
    localStorage.setItem('spinner_last_result', 'win')
    status.hydrateState.value = 'success-with-data'
    status.saveDataVersion.value++
    await nextTick()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBeNull()
  })

  it('a hydrate that brings back a spent gift is honoured on a fresh device', async () => {
    const { status, gift } = await boot('pending')
    localStorage.setItem('spinner_campaign_stage', '4')
    localStorage.setItem(SPEED_GIFT_KEY, 'used')
    status.hydrateState.value = 'success-with-data'
    await nextTick()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
  })

  it('a stale cloud blob restoring "granted" cannot hand out a second gift on this device', async () => {
    const { status, gift } = await boot()
    gift.consumeFreeSpeedGift()
    // Background re-hydrate: an older cloud save wins the merge.
    localStorage.setItem(SPEED_GIFT_KEY, 'granted')
    status.saveDataVersion.value++
    await nextTick()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
  })

  it('grants a first-timer when an initially pending read settles empty', async () => {
    const { status, gift } = await boot('pending')
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    status.hydrateState.value = 'success-empty'
    await nextTick()
    expect(gift.hasFreeSpeedGift.value).toBe(true)
  })

  // D17/D19: the gift is on EVERY build — builds without rewarded ads buy
  // the 2x for coins once it is spent (speedBoostPurchase.ts).
  const NO_AD_BUILDS: Array<[string, Record<string, string>]> = [
    ['CrazyGames basic launch', CG_BASIC_LAUNCH],
    ['itch', { VITE_APP_ITCH: 'true' }],
    ['Glitch', { VITE_APP_GLITCH: 'true' }],
    ['GamePix', { VITE_APP_GAMEPIX: 'true' }],
    ['Y8', { VITE_APP_Y8: 'true' }],
    ['WaveDash', { VITE_APP_WAVEDASH: 'true' }],
    ['plain web', {}],
    ['native without ads', { VITE_APP_NATIVE: 'true' }]
  ]

  it.each(NO_AD_BUILDS)('grants, persists and consumes the gift on no-ad build %s', async (_, env) => {
    setBuild(env)
    const { gift } = await boot('success-empty')
    expect(gift.hasFreeSpeedGift.value).toBe(true)
    expect(gift.hasAnyFreeSpeedGift.value).toBe(true)
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('granted')
    expect(gift.claimFreeSpeedBoost()).toBe('first')
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('used')
    expect(localStorage.getItem(SPEED_GIFT_USED_LOCAL_KEY)).toBe('1')
    // Same day: the daily is stamped by the first-time gift — nothing left.
    expect(gift.claimFreeSpeedBoost()).toBeNull()
  })

  it('no-ad build: an existing player gets no first-time gift (daily only)', async () => {
    setBuild(CG_BASIC_LAUNCH)
    localStorage.setItem('spinner_campaign_stage', '9')
    localStorage.setItem('spinner_coins', '400')
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBeNull()
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
  })

  it('no-ad build: a spent gift is not re-granted after a reload', async () => {
    setBuild({ VITE_APP_GAMEPIX: 'true' })
    ;(await boot()).gift.claimFreeSpeedBoost()
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(gift.consumeFreeSpeedGift()).toBe(false)
  })

  it('shows on every rewarded-ads build (GD, Playgama, Poki, CG full release)', async () => {
    for (const env of [
      { VITE_APP_GAME_DISTRIBUTION: 'true' },
      { VITE_APP_PLAYGAMA: 'true' },
      { VITE_APP_POKI: 'true' },
      CG_FULL_RELEASE
    ]) {
      localStorage.clear()
      setBuild(env)
      const { gift } = await boot()
      expect(gift.hasFreeSpeedGift.value).toBe(true)
    }
  })

  it('does not depend on the runtime ad provider', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/useFreeSpeedGift.ts'), 'utf8')
    expect(src).not.toMatch(/from '@\/use\/useAds'/)
  })
})
