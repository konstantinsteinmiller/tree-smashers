import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAILY_SPEED_GIFT_DURATION_MS,
  DAILY_SPEED_GIFT_KEY,
  DAILY_SPEED_GIFT_LOCAL_KEY,
  isDailySpeedGiftAvailable,
  lastDailyGiftDay,
  SPEED_GIFT_KEY,
  type DailySpeedGiftInput
} from '@/use/speedGiftGate'
import { utcDayKey } from '@/utils/dayKey'
import type { HydrateState } from '@/utils/save/types'

// ─── The pure gate ──────────────────────────────────────────────────────────

const base: DailySpeedGiftInput = {
  hydrate: 'success-with-data',
  firstGiftAvailable: false,
  today: '2026-09-30',
  cloudDay: null,
  localDay: null
}

describe('utcDayKey', () => {
  it('rolls over at 00:00 UTC, not local midnight', () => {
    expect(utcDayKey(Date.UTC(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30')
    expect(utcDayKey(Date.UTC(2026, 9, 1, 0, 0, 0))).toBe('2026-10-01')
  })
})

describe('isDailySpeedGiftAvailable', () => {
  it('is available on a day with no free boost spent yet', () => {
    expect(isDailySpeedGiftAvailable(base)).toBe(true)
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-09-29', localDay: '2026-09-28' })).toBe(true)
  })

  it('is spent for the rest of the day once used (cloud OR device mirror)', () => {
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-09-30' })).toBe(false)
    // A stale cloud blob brought an older day back — the device mirror holds.
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-09-20', localDay: '2026-09-30' })).toBe(false)
  })

  it('never re-opens a spent day when the clock is turned back', () => {
    expect(isDailySpeedGiftAvailable({ ...base, today: '2026-09-29', cloudDay: '2026-09-30' })).toBe(false)
  })

  it('hides while the first-time gift is available (it takes precedence)', () => {
    expect(isDailySpeedGiftAvailable({ ...base, firstGiftAvailable: true })).toBe(false)
  })

  it('fails closed while the save read is unsettled', () => {
    for (const hydrate of ['pending', 'failed-retrying', 'failed-final'] as HydrateState[]) {
      expect(isDailySpeedGiftAvailable({ ...base, hydrate })).toBe(false)
    }
    expect(isDailySpeedGiftAvailable({ ...base, hydrate: 'success-empty' })).toBe(true)
  })

  it('ignores garbage stored values and takes the later day', () => {
    const today = '2026-09-30'
    expect(lastDailyGiftDay('garbage', null, today)).toBe('')
    expect(lastDailyGiftDay('2026-09-01', '2026-09-03', today)).toBe('2026-09-03')
    expect(lastDailyGiftDay('2026-09-05', '2026-09-03', today)).toBe('2026-09-05')
  })

  it('a stored day 1–2 days ahead still blocks (clock rollback / skew)', () => {
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-10-01' })).toBe(false)
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-10-02' })).toBe(false)
    expect(isDailySpeedGiftAvailable({ ...base, localDay: '2026-10-02' })).toBe(false)
    // Across a month / year boundary too.
    expect(isDailySpeedGiftAvailable({ ...base, today: '2026-12-31', cloudDay: '2027-01-02' })).toBe(false)
  })

  it('a stored day more than 2 days ahead is corrupt / skew: ignored, gift available', () => {
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-10-03' })).toBe(true)
    expect(isDailySpeedGiftAvailable({ ...base, localDay: '2027-06-01' })).toBe(true)
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '9999-12-31', localDay: '2026-11-15' })).toBe(true)
    expect(isDailySpeedGiftAvailable({ ...base, today: '2026-12-31', cloudDay: '2027-01-03' })).toBe(true)
    expect(lastDailyGiftDay('2027-06-01', '2026-09-28', '2026-09-30')).toBe('2026-09-28')
  })

  it('ignoring a far-future day on one source keeps the other source blocking', () => {
    // Device mirror corrupt, cloud says today was already spent.
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2026-09-30', localDay: '2030-01-01' })).toBe(false)
    // Cloud corrupt, device mirror within tolerance ahead.
    expect(isDailySpeedGiftAvailable({ ...base, cloudDay: '2030-01-01', localDay: '2026-10-01' })).toBe(false)
  })

  it('lasts one minute', () => {
    expect(DAILY_SPEED_GIFT_DURATION_MS).toBe(60_000)
  })
})

// ─── The live composable (a "reload" = fresh module graph over the same storage) ─

// The daily gift is on every build (D17/D19). Each boot re-imports the
// module graph, so stubbed VITE_APP_* flags are re-folded per test.
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

const DAY1 = Date.UTC(2026, 8, 30, 12, 0, 0)
const DAY2 = Date.UTC(2026, 9, 1, 0, 0, 5)

/** An existing player: progress in the save, no first-time gift key. */
const seedExistingPlayer = () => {
  localStorage.setItem('smashers_campaign_stage', '7')
  localStorage.setItem('smashers_coins', '300')
  localStorage.setItem('smashers_last_result', 'win')
}

describe('daily free speed-up (live)', () => {
  beforeEach(() => {
    localStorage.clear()
    setBuild(CG_FULL_RELEASE)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(DAY1)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('an existing player gets the daily gift, not the first-time gift', async () => {
    seedExistingPlayer()
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(false)
    expect(gift.hasDailySpeedGift.value).toBe(true)
    expect(gift.hasAnyFreeSpeedGift.value).toBe(true)
  })

  it('claims as a daily (1-minute) boost, persists the day, then falls to the ad path', async () => {
    seedExistingPlayer()
    const { gift } = await boot()
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-09-30')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_LOCAL_KEY)).toBe('2026-09-30')
    expect(gift.hasAnyFreeSpeedGift.value).toBe(false)
    // Next tap: nothing free → caller shows the rewarded ad as before.
    expect(gift.claimFreeSpeedBoost()).toBeNull()
    expect(gift.consumeDailySpeedGift()).toBe(false)
  })

  it('is not re-granted the same day after a reload', async () => {
    seedExistingPlayer()
    ;(await boot()).gift.claimFreeSpeedBoost()
    const { gift } = await boot()
    expect(gift.hasDailySpeedGift.value).toBe(false)
    expect(gift.claimFreeSpeedBoost()).toBeNull()
  })

  it('is not re-granted by a hydrate / stale cloud merge that drops or rewinds the day', async () => {
    seedExistingPlayer()
    const { status, gift } = await boot()
    gift.claimFreeSpeedBoost()
    // Stale blob wins: older day.
    localStorage.setItem(DAILY_SPEED_GIFT_KEY, '2026-09-25')
    status.saveDataVersion.value++
    await nextTick()
    expect(gift.hasDailySpeedGift.value).toBe(false)
    // Blob without the key at all.
    localStorage.removeItem(DAILY_SPEED_GIFT_KEY)
    status.saveDataVersion.value++
    await nextTick()
    expect(gift.hasDailySpeedGift.value).toBe(false)
  })

  it('a cloud save from another device that spent today blocks it here', async () => {
    const { status, gift } = await boot('pending')
    expect(gift.hasAnyFreeSpeedGift.value).toBe(false)
    seedExistingPlayer()
    localStorage.setItem(DAILY_SPEED_GIFT_KEY, '2026-09-30')
    status.hydrateState.value = 'success-with-data'
    status.saveDataVersion.value++
    await nextTick()
    expect(gift.hasDailySpeedGift.value).toBe(false)
  })

  it('the first-time gift comes first, and its day counts as used today', async () => {
    const { gift } = await boot()
    expect(gift.hasFreeSpeedGift.value).toBe(true)
    expect(gift.hasDailySpeedGift.value).toBe(false)
    expect(gift.claimFreeSpeedBoost()).toBe('first')
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('used')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-09-30')
    expect(gift.hasAnyFreeSpeedGift.value).toBe(false)
    expect(gift.claimFreeSpeedBoost()).toBeNull()
  })

  it('is available again on the next UTC day (without reload) and after a reload', async () => {
    seedExistingPlayer()
    const { gift } = await boot()
    gift.claimFreeSpeedBoost()
    vi.setSystemTime(DAY2)
    gift.refreshFreeSpeedGiftDay()
    expect(gift.hasDailySpeedGift.value).toBe(true)
    const again = await boot()
    expect(again.gift.hasDailySpeedGift.value).toBe(true)
    expect(again.gift.claimFreeSpeedBoost()).toBe('daily')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-10-01')
  })

  it('a first-time player gets the daily gift the day after using the first-time gift', async () => {
    ;(await boot()).gift.claimFreeSpeedBoost()
    vi.setSystemTime(DAY2)
    const { gift } = await boot()
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
  })

  it('turning the clock back does not re-grant', async () => {
    seedExistingPlayer()
    vi.setSystemTime(DAY2)
    ;(await boot()).gift.claimFreeSpeedBoost()
    vi.setSystemTime(DAY1)
    const { gift } = await boot()
    expect(gift.hasDailySpeedGift.value).toBe(false)
  })

  it('a far-future stored day is ignored live, and claiming overwrites both keys with today', async () => {
    seedExistingPlayer()
    localStorage.setItem(DAILY_SPEED_GIFT_KEY, '2027-03-15')
    localStorage.setItem(DAILY_SPEED_GIFT_LOCAL_KEY, '2026-10-03')
    const { gift } = await boot()
    expect(gift.hasDailySpeedGift.value).toBe(true)
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-09-30')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_LOCAL_KEY)).toBe('2026-09-30')
    // Spent for today now; tomorrow it opens normally.
    expect(gift.hasDailySpeedGift.value).toBe(false)
    vi.setSystemTime(DAY2)
    gift.refreshFreeSpeedGiftDay()
    expect(gift.hasDailySpeedGift.value).toBe(true)
  })

  it('a stored day 2 days ahead still blocks live (rollback protection kept)', async () => {
    seedExistingPlayer()
    localStorage.setItem(DAILY_SPEED_GIFT_KEY, '2026-10-02')
    const { gift } = await boot()
    expect(gift.hasDailySpeedGift.value).toBe(false)
    expect(gift.claimFreeSpeedBoost()).toBeNull()
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-10-02')
  })

  it.each([
    ['CrazyGames basic launch', CG_BASIC_LAUNCH],
    ['plain web', {}],
    ['itch', { VITE_APP_ITCH: 'true' }],
    ['GamePix', { VITE_APP_GAMEPIX: 'true' }]
  ] as Array<[string, Record<string, string>]>)('no-ad build %s: daily gift offered once per UTC day', async (_, env) => {
    setBuild(env)
    seedExistingPlayer()
    const { gift } = await boot()
    expect(gift.hasAnyFreeSpeedGift.value).toBe(true)
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-09-30')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_LOCAL_KEY)).toBe('2026-09-30')
    expect(gift.claimFreeSpeedBoost()).toBeNull()
    vi.setSystemTime(DAY2)
    gift.refreshFreeSpeedGiftDay()
    expect(gift.claimFreeSpeedBoost()).toBe('daily')
  })

  it('offers nothing while the save read is unsettled', async () => {
    seedExistingPlayer()
    const { gift } = await boot('failed-retrying')
    expect(gift.hasDailySpeedGift.value).toBe(false)
    expect(gift.claimFreeSpeedBoost()).toBeNull()
  })
})
