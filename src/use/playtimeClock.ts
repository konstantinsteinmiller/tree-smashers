// ─── Active playtime clock (interstitial pacing, roadmap #UX100) ───────────
//
// Counts ACTIVE playtime: wall time while the game is on screen and running.
// The owner of the clock (SpinnerArena) supplies the "is it active?" answer —
// not while an ad is in flight, not while the platform has the game paused,
// not while the tab is hidden — and the clock samples it once a second on a
// monotonic clock (`performance.now`, so moving the system clock does
// nothing). A late timer (background throttling, sleep, a debugger) adds at
// most PLAYTIME_MAX_TICK_DELTA_MS, never the whole gap.
//
// Persistence: the total lives in `smashers_ads_playtime_ms` (cloud payload).
// The clock never caches that number: `total()` is "what the save holds" plus
// the time counted since the last write. That matters because this module
// runs before the SaveManager has hydrated the cloud save — a hydration that
// lands mid-session simply becomes the new base, and the unsaved delta is
// added on top of it at the next flush instead of overwriting it with a
// pre-hydration snapshot. If storage refuses the write (null-storage shim,
// quota) the delta stays in memory and the session still paces correctly.

import {
  PLAYTIME_KEY,
  PLAYTIME_MAX_TICK_DELTA_MS,
  PLAYTIME_PERSIST_EVERY_MS,
  PLAYTIME_TICK_MS
} from '@/use/ads/interstitialConfig'

export interface PlaytimeClockDeps {
  /** Monotonic milliseconds. */
  now: () => number
  read: (key: string) => string | null
  /** Returns false when the write did not stick. */
  write: (key: string, value: string) => boolean
  /** Is the game being actively played right now? */
  isActive: () => boolean
}

export interface PlaytimeClock {
  /** Take one sample: the time since the previous sample counts if active. */
  sample: () => void
  /** Active playtime in ms: persisted total + unsaved delta. */
  total: () => number
  /** Write the unsaved delta into the save now. */
  flush: () => void
  /** Forget the previous sample (the next one only re-anchors). */
  rebase: () => void
}

const parseMs = (raw: string | null): number => {
  if (raw === null) return 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export const createPlaytimeClock = (deps: PlaytimeClockDeps): PlaytimeClock => {
  let pending = 0
  let sinceFlush = 0
  let lastSample: number | null = null

  const stored = (): number => parseMs(deps.read(PLAYTIME_KEY))

  const flush = (): void => {
    sinceFlush = 0
    if (pending <= 0) return
    if (deps.write(PLAYTIME_KEY, String(stored() + pending))) pending = 0
  }

  const sample = (): void => {
    const t = deps.now()
    const prev = lastSample
    lastSample = t
    if (prev === null) return
    const dt = Math.min(Math.max(0, t - prev), PLAYTIME_MAX_TICK_DELTA_MS)
    if (dt <= 0 || !deps.isActive()) return
    pending += dt
    sinceFlush += dt
    if (sinceFlush >= PLAYTIME_PERSIST_EVERY_MS) flush()
  }

  return {
    sample,
    total: () => stored() + pending,
    flush,
    rebase: () => {
      lastSample = null
    }
  }
}

// ─── The app's clock ────────────────────────────────────────────────────────

const browserDeps = (isActive: () => boolean): PlaytimeClockDeps => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  read: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  write: (key, value) => {
    try {
      localStorage.setItem(key, value)
      return localStorage.getItem(key) === value
    } catch {
      return false
    }
  },
  isActive
})

let activity: () => boolean = () => false
let clock: PlaytimeClock = createPlaytimeClock(browserDeps(() => activity()))
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Start counting. `isActive` is asked once per tick. Idempotent: a second
 * start only swaps the activity source.
 */
export const startPlaytimeClock = (isActive: () => boolean): void => {
  activity = isActive
  if (timer !== null) return
  clock.rebase()
  clock.sample()
  timer = setInterval(() => clock.sample(), PLAYTIME_TICK_MS)
}

/** Stop counting and write what was counted. */
export const stopPlaytimeClock = (): void => {
  if (timer !== null) clearInterval(timer)
  timer = null
  clock.sample()
  clock.flush()
  clock.rebase()
}

/** Active playtime so far, across sessions (ms). */
export const activePlaytimeMs = (): number => clock.total()

/** Write the unsaved playtime into the save now. */
export const flushPlaytime = (): void => clock.flush()

/** Test seam: a fresh clock on the browser deps (no timer running). */
export const resetPlaytimeClockForTests = (): void => {
  if (timer !== null) clearInterval(timer)
  timer = null
  activity = () => false
  clock = createPlaytimeClock(browserDeps(() => activity()))
}
