// D18 — the Battle Pass "days left" count must follow the wall clock while the
// screen is open: one timeout to the next 00:00 UTC (no polling), a refresh on
// returning to the foreground (visibilitychange; the YouTube Playables build
// uses the platform pause gate instead), the season-expiry reset if the season
// ends meanwhile, and full cleanup on unmount.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

vi.mock('@/use/usePvpStats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/use/usePvpStats')>()
  return { ...actual, resetHonorTrack: vi.fn(actual.resetHonorTrack) }
})

// useBattlePass pulls useModels (useMatch↔useModels↔useUser cycle) — load
// useUser first, mirroring the app's boot order.
import '@/use/useUser'
import useBattlePass, { startSeasonClock, refreshSeasonClock } from '@/use/useBattlePass'
import { resetHonorTrack } from '@/use/usePvpStats'
import { setGamePaused } from '@/use/useGamePause'
import { msUntilNextUtcMidnight, UTC_DAY_MS } from '@/utils/dayKey'

const bp = useBattlePass()

let visibility: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibility
})
const fireVisibility = (v: DocumentVisibilityState) => {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

const startSeason = (dayKey: string) => {
  bp.state.value = { ...bp.state.value, xp: 40, unlockedStages: 3, seasonStartedAt: dayKey }
}

let stop: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.mocked(resetHonorTrack).mockClear()
})
afterEach(() => {
  stop?.()
  stop = null
  vi.unstubAllEnvs()
  setGamePaused(false)
  vi.useRealTimers()
})

describe('msUntilNextUtcMidnight', () => {
  it('counts down to the next 00:00 UTC and is a full day exactly at midnight', () => {
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 2, 10, 23, 59, 0))).toBe(60_000)
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 2, 10, 0, 0, 0))).toBe(UTC_DAY_MS)
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 2, 10, 12, 0, 0))).toBe(UTC_DAY_MS / 2)
  })
})

describe('battle-pass season clock', () => {
  it('refreshes days-left when UTC midnight passes while open, with a single re-armed timeout', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 10, 23, 59, 0))
    startSeason('2026-03-01') // 9 days elapsed → 21 left
    expect(bp.daysUntilReset.value).toBe(21)

    stop = startSeasonClock()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(59_000) // 23:59:59 — still the same day
    expect(bp.daysUntilReset.value).toBe(21)

    vi.advanceTimersByTime(2_000) // past midnight (+1 s margin)
    expect(bp.daysUntilReset.value).toBe(20)
    // Re-armed for the NEXT midnight — still exactly one timer, no loop.
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(UTC_DAY_MS)
    expect(bp.daysUntilReset.value).toBe(19)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('without the clock the count goes stale (the D18 bug the clock fixes)', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 10, 12, 0, 0))
    startSeason('2026-03-01')
    expect(bp.daysUntilReset.value).toBe(21)
    vi.setSystemTime(Date.UTC(2026, 2, 12, 12, 0, 0))
    expect(bp.daysUntilReset.value).toBe(21) // cached — no state change
    refreshSeasonClock()
    expect(bp.daysUntilReset.value).toBe(19)
  })

  it('refreshes when the tab becomes visible again, not when it is hidden', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 10, 12, 0, 0))
    startSeason('2026-03-01')
    stop = startSeasonClock()
    expect(bp.daysUntilReset.value).toBe(21)

    // Backgrounded overnight: the timer was frozen, the clock moved 2 days.
    fireVisibility('hidden')
    vi.setSystemTime(Date.UTC(2026, 2, 12, 12, 0, 0))
    expect(bp.daysUntilReset.value).toBe(21)

    fireVisibility('visible')
    expect(bp.daysUntilReset.value).toBe(19)
    expect(vi.getTimerCount()).toBe(1) // resume re-arms, never stacks
  })

  it('runs the season-expiry reset when the season ends while open', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 30, 23, 59, 30))
    startSeason('2026-03-01') // 29 days elapsed → 1 left
    expect(bp.daysUntilReset.value).toBe(1)
    stop = startSeasonClock()

    vi.advanceTimersByTime(31_000)
    expect(bp.state.value.seasonStartedAt).toBeNull()
    expect(bp.state.value.unlockedStages).toBe(0)
    expect(bp.state.value.xp).toBe(0)
    expect(bp.daysUntilReset.value).toBeNull()
    expect(resetHonorTrack).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(localStorage.getItem('smashers_battle_pass')!)
    expect(saved.seasonStartedAt).toBeNull()
    expect(saved.unlockedStages).toBe(0)
  })

  it('does not reset an active season on a refresh', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 10, 12, 0, 0))
    startSeason('2026-03-01')
    refreshSeasonClock()
    expect(bp.state.value.seasonStartedAt).toBe('2026-03-01')
    expect(resetHonorTrack).not.toHaveBeenCalled()
  })

  it('stop() clears the timer and removes the visibility listener', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 10, 12, 0, 0))
    startSeason('2026-03-01')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const s = startSeasonClock()
    expect(vi.getTimerCount()).toBe(1)
    s()
    expect(vi.getTimerCount()).toBe(0)
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()

    expect(bp.daysUntilReset.value).toBe(21)
    vi.setSystemTime(Date.UTC(2026, 2, 12, 12, 0, 0))
    fireVisibility('visible')
    expect(bp.daysUntilReset.value).toBe(21) // no longer listening
  })

  it('YouTube build: never touches the Page Visibility API, refreshes on the platform resume edge', async () => {
    vi.stubEnv('VITE_APP_YOUTUBE', 'true')
    vi.setSystemTime(Date.UTC(2026, 2, 10, 12, 0, 0))
    startSeason('2026-03-01')
    const addSpy = vi.spyOn(document, 'addEventListener')
    stop = startSeasonClock()
    expect(addSpy).not.toHaveBeenCalledWith('visibilitychange', expect.anything())
    addSpy.mockRestore()
    expect(bp.daysUntilReset.value).toBe(21)

    setGamePaused(true) // Playables onPause → Bridge → pause gate
    vi.setSystemTime(Date.UTC(2026, 2, 12, 12, 0, 0))
    fireVisibility('visible') // must be ignored on this build
    expect(bp.daysUntilReset.value).toBe(21)

    setGamePaused(false) // onResume
    await nextTick()
    expect(bp.daysUntilReset.value).toBe(19)
    stop!()
    stop = null
    expect(vi.getTimerCount()).toBe(0)
  })
})
