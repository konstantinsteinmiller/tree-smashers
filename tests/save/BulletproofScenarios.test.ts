// End-to-end scenario tests for the bulletproof-save protocol. Each
// scenario simulates a real-world failure mode that previously cost
// players progress and asserts that the new strategy + manager
// combination handles it without overwriting cloud data.
//
// Scenarios cover the lifecycle the user described in the bug report:
//
//   1. Returning player on a fresh device (true cold start)
//   2. Returning player whose hydrate fails on first try, succeeds on retry
//   3. Returning player whose hydrate fails for the entire boot
//   4. New player on a clean device (no prior remote save)
//   5. Player advanced offline (local has more progress than remote)
//   6. Player advanced on another device (remote has more progress than local)
//   7. Identical local + remote (no needless re-write)
//   8. Hydrate failure → write happens locally → retry succeeds → flush
//      uses MERGED state, does NOT push fresh-defaults to remote.
//
// All scenarios use the CrazyGames SDK shape; the same logic is exercised
// against Glitch in GlitchStrategy.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrazyGamesStrategy } from '@/utils/save/CrazyGamesStrategy'
import { SaveManager } from '@/utils/save/SaveManager'
import {
  computeMeta,
  META_KEY,
  SAVE_KEYS,
  serializeMeta
} from '@/utils/save/SaveMergePolicy'

const KEYS_MANIFEST = '__save_internal__crazy_keys'

const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    })
  }
}

/** Build the SDK store contents for a returning player at stage N with
 *  a few coins. Mirrors what a real CrazyGames data module would hold. */
const seedReturningPlayer = (stage: number, coins: number) => {
  const meta = serializeMeta(computeMeta(
    {
      get: (k: string) => {
        if (k === SAVE_KEYS.STAGE) return String(stage)
        if (k === SAVE_KEYS.COINS) return String(coins)
        return null
      }
    },
    '2026-04-26T10:00:00Z'
  ))
  return {
    [KEYS_MANIFEST]: JSON.stringify([SAVE_KEYS.STAGE, SAVE_KEYS.COINS, META_KEY]),
    [SAVE_KEYS.STAGE]: String(stage),
    [SAVE_KEYS.COINS]: String(coins),
    [META_KEY]: meta
  }
}

describe('Bulletproof save scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // ─── Scenario 1 ─────────────────────────────────────────────────────────
  // Returning player whose remote save loads cleanly on first try.
  // Expectation: localStorage gets stage=6, coins=720; hydrate state =
  // success-with-data; no boot-time retry runs.

  it('Scenario 1: returning player — clean hydrate, no boot retries', async () => {
    const data = makeFakeData(seedReturningPlayer(6, 720))
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await manager.init()

    expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('6')
    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('720')
    expect(manager.hydrateState).toBe('success-with-data')
    // Manifest fetched ONCE (no retry ladder).
    expect(data.getItem.mock.calls.filter(c => c[0] === KEYS_MANIFEST)).toHaveLength(1)
  })

  // ─── Scenario 2 ─────────────────────────────────────────────────────────
  // Returning player; first manifest fetch throws (network blip). Local
  // looks fresh (browser had no data). Sanity guard kicks in, retries
  // succeed, real cloud data lands.
  // This is the EXACT bug the user reported — must not lose progress.

  it('Scenario 2: returning player + transient SDK error — sanity-guard retry recovers', async () => {
    const seed = seedReturningPlayer(6, 720)
    const data = makeFakeData(seed)
    let calls = 0
    data.getItem.mockImplementation(async (key: string) => {
      calls++
      // First manifest fetch throws — simulates a transient SDK error
      // at boot. Subsequent calls succeed normally.
      if (key === KEYS_MANIFEST && calls === 1) throw new Error('transient SDK error')
      return seed[key as keyof typeof seed] ?? null
    })

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    const initPromise = manager.init()
    // Boot-time sanity guard waits 1s, retries; allow timers to fire.
    await vi.advanceTimersByTimeAsync(1_500)
    await initPromise

    expect(manager.hydrateState).toBe('success-with-data')
    expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('6')
    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('720')
  })

  // ─── Scenario 3 ─────────────────────────────────────────────────────────
  // Same as Scenario 2 but the SDK keeps failing. After 3 retries the
  // app boots in failed state. CRITICALLY: any local writes during this
  // session must NOT be flushed to remote (would overwrite the cloud
  // save with fresh defaults).

  it('Scenario 3: returning player + persistent failure — local writes do NOT flush to remote', async () => {
    const data = makeFakeData(seedReturningPlayer(6, 720))
    data.getItem.mockImplementation(async () => {
      throw new Error('persistent failure')
    })

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    const initPromise = manager.init()
    await vi.advanceTimersByTimeAsync(5_000)
    await initPromise

    expect(manager.hydrateState).toBe('failed-retrying')

    // Game now does its module-load default writes (fresh-player state).
    window.localStorage.setItem(SAVE_KEYS.STAGE, '1')
    window.localStorage.setItem(SAVE_KEYS.COINS, '0')
    await vi.advanceTimersByTimeAsync(2_000) // past the FLUSH_DELAY_MS

    // The setItem calls that happened are ONLY the failed manifest
    // fetches retrying — never the writes that would have wiped the cloud.
    const remoteWrites = data.setItem.mock.calls
    expect(remoteWrites).toHaveLength(0)
  })

  // ─── Scenario 4 ─────────────────────────────────────────────────────────
  // Brand new player, no remote save. Hydrate confirms empty.
  // Subsequent local writes flush normally as the seed save.

  it('Scenario 4: new player — empty remote confirmed, local seeds remote', async () => {
    const data = makeFakeData()  // no seed
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await manager.init()

    expect(manager.hydrateState).toBe('success-empty')

    // Player advances to stage 2.
    window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
    window.localStorage.setItem(SAVE_KEYS.COINS, '50')
    await vi.runAllTimersAsync()

    expect(data.store.get(SAVE_KEYS.STAGE)).toBe('2')
    expect(data.store.get(SAVE_KEYS.COINS)).toBe('50')
    // Meta blob is included so the next hydrate can decide merges.
    expect(data.store.get(META_KEY)).toBeTruthy()
  })

  // ─── Scenario 5 ─────────────────────────────────────────────────────────
  // Local has higher progress than remote (player advanced offline on
  // this device, e.g. via airplane mode, then came back online).
  // Expectation: local wins, local is pushed to remote on next flush,
  // NO bonus coins (player didn't lose anything).

  it('Scenario 5: local ahead of remote — local wins, pushed to remote', async () => {
    const data = makeFakeData(seedReturningPlayer(4, 200))   // remote stage 4

    // Pre-seed local with stage 5 + 300 coins (player advanced offline)
    window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
    window.localStorage.setItem(SAVE_KEYS.COINS, '300')
    window.localStorage.setItem(META_KEY, serializeMeta(computeMeta(
      { get: (k) => window.localStorage.getItem(k) },
      '2026-04-27T10:00:00Z'
    )))

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await manager.init()
    await vi.runAllTimersAsync()

    // Local is unchanged.
    expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('5')
    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('300')
    // Remote got the local push.
    expect(data.store.get(SAVE_KEYS.STAGE)).toBe('5')
    expect(data.store.get(SAVE_KEYS.COINS)).toBe('300')
  })

  // ─── Scenario 6 ─────────────────────────────────────────────────────────
  // Remote ahead of local (player advanced on another device). Local
  // had some progress, so the merge bonus applies: bonus = remote.maxStage * 50.

  it('Scenario 6: remote ahead of local — remote wins + bonus = remote.maxStage * 50', async () => {
    const data = makeFakeData(seedReturningPlayer(10, 500))   // remote stage 10

    // Local had a small amount of prior progress (stage 3, 100 coins).
    window.localStorage.setItem(SAVE_KEYS.STAGE, '3')
    window.localStorage.setItem(SAVE_KEYS.COINS, '100')
    window.localStorage.setItem(META_KEY, serializeMeta(computeMeta(
      { get: (k) => window.localStorage.getItem(k) },
      '2026-04-27T08:00:00Z'   // older than remote's 2026-04-26T10:00 — wait, actually older. Let me set newer.
    )))

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await manager.init()
    await vi.runAllTimersAsync()

    // Stage = remote's value (10), coins = remote's coins (500) + bonus (10 * 50 = 500) = 1000.
    expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('10')
    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('1000')
    // The bonus also got flushed to remote so the next session sees the augmented total.
    expect(data.store.get(SAVE_KEYS.COINS)).toBe('1000')
  })

  // ─── Scenario 7 ─────────────────────────────────────────────────────────
  // Local and remote are byte-identical. Don't trigger an unnecessary
  // re-upload.

  it('Scenario 7: identical local + remote — tie-keep-local, no re-upload', async () => {
    // Create a paired snapshot: same keys + same meta on both sides.
    const meta = computeMeta(
      { get: (k) => k === SAVE_KEYS.STAGE ? '5' : k === SAVE_KEYS.COINS ? '250' : null },
      '2026-04-27T10:00:00Z'
    )
    const seed = {
      [KEYS_MANIFEST]: JSON.stringify([SAVE_KEYS.STAGE, SAVE_KEYS.COINS, META_KEY]),
      [SAVE_KEYS.STAGE]: '5',
      [SAVE_KEYS.COINS]: '250',
      [META_KEY]: serializeMeta(meta)
    }
    const data = makeFakeData(seed)

    window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
    window.localStorage.setItem(SAVE_KEYS.COINS, '250')
    window.localStorage.setItem(META_KEY, serializeMeta(meta))

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await manager.init()
    await vi.runAllTimersAsync()

    // No setItem calls fired (besides any that the manifest tracking made).
    const realWrites = data.setItem.mock.calls.filter(c => c[0] !== KEYS_MANIFEST)
    expect(realWrites).toHaveLength(0)
  })

  // ─── Scenario 8 ─────────────────────────────────────────────────────────
  // Defining test for the bug fix. Reproduces what was happening before:
  // hydrate fails → modules read defaults → first autosave fires →
  // OLD code would push defaults to remote; NEW code must NOT.

  it('Scenario 8 (regression test): hydrate failure + module defaults must NOT overwrite remote', async () => {
    const seed = seedReturningPlayer(6, 720)
    const data = makeFakeData(seed)
    data.getItem.mockImplementation(async () => {
      throw new Error('blip')
    })

    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    const initPromise = manager.init()
    await vi.advanceTimersByTimeAsync(5_000)
    await initPromise

    // Simulate the game's modules reading localStorage at module load,
    // finding nothing, and persisting their fresh-defaults. This is what
    // useSpinnerCampaign / useSpinnerConfig actually do at module-eval.
    window.localStorage.setItem(SAVE_KEYS.STAGE, '1')
    window.localStorage.setItem(SAVE_KEYS.COINS, '0')
    window.localStorage.setItem(SAVE_KEYS.UPGRADES, JSON.stringify({ tops: {}, bottoms: {} }))
    await vi.advanceTimersByTimeAsync(2_000)

    // Remote store MUST still have the original returning-player save —
    // none of the fresh-defaults made it through.
    expect(data.store.get(SAVE_KEYS.STAGE)).toBe('6')
    expect(data.store.get(SAVE_KEYS.COINS)).toBe('720')
  })
})
