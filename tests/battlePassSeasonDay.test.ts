// D15 — the battle-pass season clock now runs on the shared UTC day helper
// (utils/dayKey) instead of its own inline math. The old code was:
//   season start  = new Date().toISOString().slice(0, 10)
//   elapsed days  = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000)
//   days left     = max(0, 30 - elapsed)        (0 → season expired → reset)
// Both old and new are pure UTC, so they must agree to the millisecond in
// every timezone — these tests pin that across a full year, across the
// EU / US / southern-hemisphere DST switches, and across year and leap-day
// rollovers, so existing saves keep their season and progress.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { UTC_DAY_MS, utcDayKey, utcDaysSince } from '@/utils/dayKey'

const SEASON_DAYS = 30
const HOUR = 60 * 60 * 1000

const oldStartKey = (now: number): string => new Date(now).toISOString().slice(0, 10)
const oldDaysLeft = (startedAt: string, now: number): number => {
  const elapsed = Math.floor((now - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))
  const r = SEASON_DAYS - elapsed
  return r > 0 ? r : 0
}
const newDaysLeft = (startedAt: string, now: number): number => {
  const r = SEASON_DAYS - utcDaysSince(startedAt, now)
  return r > 0 ? r : 0
}

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Australia/Sydney', 'Pacific/Chatham']
const originalTz = process.env.TZ

describe.each(ZONES)('battle-pass season day math is unchanged (TZ=%s)', (tz) => {
  beforeAll(() => {
    process.env.TZ = tz
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('really runs in that zone (the DST cases are not vacuous)', () => {
    const jan = new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()
    const jul = new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()
    if (tz === 'UTC') expect([jan, jul]).toEqual([0, 0])
    else expect(jan).not.toBe(jul)
  })

  it('season start key equals the old expression every hour of 2026 + rollover', () => {
    const from = Date.UTC(2026, 0, 1)
    const to = Date.UTC(2027, 0, 3)
    const bad: number[] = []
    for (let t = from; t < to; t += HOUR) {
      if (utcDayKey(t) !== oldStartKey(t)) bad.push(t)
      // ...and 1 ms before each hour, where a day key flips at 00:00 UTC
      if (utcDayKey(t - 1) !== oldStartKey(t - 1)) bad.push(t - 1)
    }
    expect(bad).toEqual([])
  })

  it('days-left equals the old computation for every season start in a full year', () => {
    // Every start day from 2026-01-01 to 2027-01-01, sampled hourly from one
    // day before the start to two days past the end (and 1 ms before each
    // hour), which crosses every DST switch and the 2026→2027 rollover.
    let checked = 0
    const bad: string[] = []
    for (let s = Date.UTC(2026, 0, 1); s <= Date.UTC(2027, 0, 1); s += UTC_DAY_MS) {
      const key = oldStartKey(s)
      for (let t = s - UTC_DAY_MS; t <= s + (SEASON_DAYS + 2) * UTC_DAY_MS; t += HOUR) {
        for (const at of [t, t - 1]) {
          checked++
          if (newDaysLeft(key, at) !== oldDaysLeft(key, at)) bad.push(`${key}@${at}`)
        }
      }
    }
    expect(bad).toEqual([])
    expect(checked).toBeGreaterThan(500_000)
  })

  it('agrees minute-by-minute across the DST switch instants', () => {
    const switches = [
      Date.UTC(2026, 2, 8, 7), // US spring forward
      Date.UTC(2026, 2, 29, 1), // EU spring forward
      Date.UTC(2026, 3, 4, 16), // Sydney fall back
      Date.UTC(2026, 8, 26, 14), // Chatham spring forward
      Date.UTC(2026, 9, 3, 16), // Sydney spring forward
      Date.UTC(2026, 9, 25, 1), // EU fall back
      Date.UTC(2026, 10, 1, 6) // US fall back
    ]
    for (const sw of switches) {
      const bad: number[] = []
      for (let t = sw - 3 * HOUR; t <= sw + 3 * HOUR; t += 60_000) {
        if (utcDayKey(t) !== oldStartKey(t)) bad.push(t)
        for (const back of [0, 1, 15, 29, 30, 31]) {
          const key = oldStartKey(t - back * UTC_DAY_MS)
          if (newDaysLeft(key, t) !== oldDaysLeft(key, t)) bad.push(t)
        }
      }
      expect(bad).toEqual([])
    }
  })
})

describe('season boundaries (exact, UTC)', () => {
  it('a season lasts exactly 30 UTC days, across a year rollover', () => {
    expect(utcDaysSince('2026-12-15', Date.UTC(2026, 11, 15, 0))).toBe(0)
    expect(newDaysLeft('2026-12-15', Date.UTC(2026, 11, 15, 23, 59))).toBe(30)
    expect(newDaysLeft('2026-12-15', Date.UTC(2027, 0, 13, 23, 59, 59, 999))).toBe(1)
    expect(newDaysLeft('2026-12-15', Date.UTC(2027, 0, 14))).toBe(0) // expires 2027-01-14 00:00 UTC
  })

  it('counts Feb 29 in a leap year and not in a common year', () => {
    expect(newDaysLeft('2028-02-15', Date.UTC(2028, 2, 15, 23))).toBe(1)
    expect(newDaysLeft('2028-02-15', Date.UTC(2028, 2, 16))).toBe(0)
    expect(newDaysLeft('2027-02-15', Date.UTC(2027, 2, 16, 23))).toBe(1)
    expect(newDaysLeft('2027-02-15', Date.UTC(2027, 2, 17))).toBe(0)
  })

  it('utcDaysSince edge values: before the start, and an unparsable key', () => {
    expect(utcDaysSince('2026-06-10', Date.UTC(2026, 5, 9, 12))).toBe(-1)
    expect(Number.isNaN(utcDaysSince('garbage', Date.UTC(2026, 5, 9)))).toBe(true)
  })
})

describe('useBattlePass keeps an existing save across the switch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads a mid-season save, then expires it at 00:00 UTC on day 30', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 11, 31, 23, 30)) // day 29 of a 2026-12-02 season
    localStorage.setItem('smashers_battle_pass', JSON.stringify({
      xp: 40,
      unlockedStages: 7,
      claimedStages: [1, 2],
      claimedSkins: {},
      offeredSkins: {},
      seasonStartedAt: '2026-12-02'
    }))
    // Import order mirrors the app (useUser first) to dodge the
    // useMatch↔useModels↔useUser cycle.
    await import('@/use/useUser')
    const { default: useBattlePass } = await import('@/use/useBattlePass')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const bp = useBattlePass()
    expect(bp.state.value.seasonStartedAt).toBe('2026-12-02')
    expect(bp.state.value.unlockedStages).toBe(7)
    expect(bp.daysUntilReset.value).toBe(1)

    // Next UTC midnight (also the year rollover) ends the season on reload.
    vi.setSystemTime(Date.UTC(2027, 0, 1, 0, 0))
    saveDataVersion.value++
    await Promise.resolve()
    expect(bp.state.value.unlockedStages).toBe(0)
    expect(bp.state.value.seasonStartedAt).toBeNull()

    // The first XP of the new season stamps today's UTC day key.
    bp.awardLoss()
    expect(bp.state.value.seasonStartedAt).toBe('2027-01-01')
    const saved = JSON.parse(localStorage.getItem('smashers_battle_pass')!)
    expect(saved.seasonStartedAt).toBe('2027-01-01')
  })
})
