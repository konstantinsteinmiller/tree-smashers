// Reproduces the bug the user reported on the CrazyGames mobile app:
//
//   1. Player has local progress (stage 2, 80 coins).
//   2. Force-closes the CG mobile app.
//   3. Reopens. IDB was cleared by the OS (`[save] IDB backup empty` log).
//      Whether localStorage is also cleared depends on the WebView's
//      lifecycle — both scenarios are tested below.
//   4. Cloud has more progress (stage 11) from an earlier session.
//   5. Hydrate fires the merge banner with `+550 bonus coins`
//      (= remote.maxStage * 50).
//
// The user's complaint: the banner says "+550" but the game UI still shows
// stage 1, 0 coins. So writes from the merge don't appear to reach
// localStorage. This test asserts that after `SaveManager.init()` resolves,
// `localStorage` contains the merged remote values + the bonus delta —
// exactly what the composables would read at App.vue mount time.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrazyGamesStrategy } from '@/utils/save/CrazyGamesStrategy'
import { SaveManager } from '@/utils/save/SaveManager'
import { LocalBackupLayer, MemoryStore } from '@/utils/save/LocalBackupLayer'
import {
  computeMeta,
  META_KEY,
  SAVE_KEYS,
  serializeMeta
} from '@/utils/save/SaveMergePolicy'
import type { HydrateNotice } from '@/utils/save/types'

const KEYS_MANIFEST = '__save_internal__crazy_keys'

// Minimal SDK fake — same shape as the existing BulletproofScenarios.test.ts.
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

const seedRemote = (stage: number, coins: number, savedAt = '2026-04-26T10:00:00Z') => {
  const meta = serializeMeta(computeMeta(
    {
      get: (k: string) => {
        if (k === SAVE_KEYS.STAGE) return String(stage)
        if (k === SAVE_KEYS.COINS) return String(coins)
        return null
      }
    },
    savedAt
  ))
  return {
    [KEYS_MANIFEST]: JSON.stringify([SAVE_KEYS.STAGE, SAVE_KEYS.COINS, META_KEY]),
    [SAVE_KEYS.STAGE]: String(stage),
    [SAVE_KEYS.COINS]: String(coins),
    [META_KEY]: meta
  }
}

describe('CrazyGames mobile force-close recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('localStorage preserved + IDB cleared (the user\'s scenario)', () => {
    it('merges cloud-stage=11 + bonus=550 into localStorage AND fires the banner', async () => {
      // Local: previous-session state survived force-close.
      window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
      window.localStorage.setItem(SAVE_KEYS.COINS, '80')
      window.localStorage.setItem(META_KEY, serializeMeta(computeMeta(
        { get: (k) => window.localStorage.getItem(k) },
        '2026-04-27T12:00:00Z'
      )))

      // Cloud: older bigger save.
      const data = makeFakeData(seedRemote(11, 2000))

      // IDB: empty (CG mobile cleared it).
      const idbStore = new MemoryStore()
      const backupLayer = new LocalBackupLayer(idbStore)

      const notices: HydrateNotice[] = []
      const strategy = new CrazyGamesStrategy(() => data)
      strategy.onHydrateNotice?.((n) => notices.push(n))

      const manager = new SaveManager(strategy, backupLayer)
      await manager.init()
      await vi.runAllTimersAsync()

      // The merge ran. Banner was driven by this notice with bonusCoinsAwarded=550.
      const winner = notices.find(n => n.bonusCoinsAwarded === 550)
      expect(winner, 'expected a hydrate notice with bonusCoinsAwarded=550').toBeDefined()

      // After init resolves, localStorage MUST contain the merged remote values
      // — the composables that load next will read these.
      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('11')
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('2550')   // 2000 + 550 bonus

      backupLayer.dispose()
    })
  })

  describe('localStorage cleared + IDB cleared (worst case)', () => {
    it('still restores cloud values into localStorage on cold launch', async () => {
      // localStorage starts empty — both partitions wiped on force-close.
      // (In this case there is no localMeta, so decideMerge returns
      // 'remote-only' and bonusCoins is 0 — no banner. But the UI
      // should still show the restored stage / coins.)
      const data = makeFakeData(seedRemote(11, 2000))
      const backupLayer = new LocalBackupLayer(new MemoryStore())
      const manager = new SaveManager(new CrazyGamesStrategy(() => data), backupLayer)
      await manager.init()
      await vi.runAllTimersAsync()

      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('11')
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('2000')

      backupLayer.dispose()
    })
  })

  describe('anti-farm: bonus only paid once per remote savedAt', () => {
    it('skips bonus on second hydrate when localMeta.bonusReceivedFor === remoteMeta.savedAt', async () => {
      const remoteSavedAt = '2026-04-26T10:00:00Z'
      const data = makeFakeData(seedRemote(11, 2000, remoteSavedAt))

      // Local: progress that's worse than cloud, AND the META blob already
      // carries `bonusReceivedFor` matching cloud's savedAt — i.e., this
      // client previously received the +N bonus for this same remote save.
      window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
      window.localStorage.setItem(SAVE_KEYS.COINS, '80')
      const localMetaBlob = computeMeta(
        { get: (k) => window.localStorage.getItem(k) },
        '2026-04-27T12:00:00Z'
      )
      localMetaBlob.bonusReceivedFor = remoteSavedAt
      window.localStorage.setItem(META_KEY, serializeMeta(localMetaBlob))

      const notices: HydrateNotice[] = []
      const strategy = new CrazyGamesStrategy(() => data)
      strategy.onHydrateNotice?.((n) => notices.push(n))

      const manager = new SaveManager(strategy, new LocalBackupLayer(new MemoryStore()))
      await manager.init()
      await vi.runAllTimersAsync()

      // No bonus banner — already paid.
      const bonusNotice = notices.find(n => n.bonusCoinsAwarded && n.bonusCoinsAwarded > 0)
      expect(bonusNotice, 'should NOT pay bonus for the same remote savedAt twice').toBeUndefined()

      // Cloud values still get applied (player's actual save is restored),
      // just without the bonus on top.
      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('11')
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('2000')   // remote value, no bonus
    })

    it('DOES pay bonus when remote savedAt is newer than the recorded one', async () => {
      const oldSavedAt = '2026-04-20T10:00:00Z'
      const newSavedAt = '2026-04-26T10:00:00Z'
      const data = makeFakeData(seedRemote(11, 2000, newSavedAt))

      // Local recorded a bonus for an OLDER remote savedAt — a newer
      // remote save (different savedAt) should re-pay the bonus.
      window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
      window.localStorage.setItem(SAVE_KEYS.COINS, '80')
      const localMetaBlob = computeMeta(
        { get: (k) => window.localStorage.getItem(k) },
        '2026-04-27T12:00:00Z'
      )
      localMetaBlob.bonusReceivedFor = oldSavedAt
      window.localStorage.setItem(META_KEY, serializeMeta(localMetaBlob))

      const notices: HydrateNotice[] = []
      const strategy = new CrazyGamesStrategy(() => data)
      strategy.onHydrateNotice?.((n) => notices.push(n))

      const manager = new SaveManager(strategy, new LocalBackupLayer(new MemoryStore()))
      await manager.init()
      await vi.runAllTimersAsync()

      const bonusNotice = notices.find(n => n.bonusCoinsAwarded && n.bonusCoinsAwarded > 0)
      expect(bonusNotice, 'should pay bonus when remote savedAt differs').toBeDefined()
      expect(bonusNotice!.bonusCoinsAwarded).toBe(550)
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('2550')
    })
  })

  describe('cloud manifest has STAGE/COINS but per-key fetches return null', () => {
    // Simulates a CG SDK quirk where the manifest is intact but per-key
    // reads return null (perhaps a partial sync state). The merge can
    // ONLY trust META_KEY's blob — but if it falls back to remote-wins
    // because META says high progress, individual key writes would be
    // lost (because they aren't in remoteSnapshot). This is the suspect
    // path for the user's bug: banner fires with bonus, but stage / coins
    // never actually get restored.
    it('does NOT show "remote-wins" + bonus when only META_KEY came back', async () => {
      // Local has small progress.
      window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
      window.localStorage.setItem(SAVE_KEYS.COINS, '80')
      window.localStorage.setItem(META_KEY, serializeMeta(computeMeta(
        { get: (k) => window.localStorage.getItem(k) },
        '2026-04-27T12:00:00Z'
      )))

      // Cloud manifest claims STAGE / COINS / META exist, but only META
      // actually returns data. STAGE and COINS getItem returns null.
      const remoteMeta = serializeMeta(computeMeta(
        { get: (k) => k === SAVE_KEYS.STAGE ? '11' : k === SAVE_KEYS.COINS ? '2000' : null },
        '2026-04-26T10:00:00Z'
      ))
      const data = {
        store: new Map<string, string | null>([
          [KEYS_MANIFEST, JSON.stringify([SAVE_KEYS.STAGE, SAVE_KEYS.COINS, META_KEY])],
          [SAVE_KEYS.STAGE, null as any],
          [SAVE_KEYS.COINS, null as any],
          [META_KEY, remoteMeta]
        ]),
        getItem: vi.fn(async (key: string) => {
          const v = data.store.get(key)
          return v === undefined ? null : v
        }),
        setItem: vi.fn(async (key: string, value: string) => {
          data.store.set(key, value)
        }),
        removeItem: vi.fn(async (key: string) => {
          data.store.delete(key)
        })
      }

      const notices: HydrateNotice[] = []
      const strategy = new CrazyGamesStrategy(() => data as any)
      strategy.onHydrateNotice?.((n) => notices.push(n))

      const manager = new SaveManager(strategy, new LocalBackupLayer(new MemoryStore()))
      await manager.init()
      // Don't run retry timers — they'll loop forever in this fixture
      // because the mock SDK always returns null for STAGE/COINS.
      // The behavior we care about is what `init()` resolves to: no
      // phantom bonus, no overwrite of local with empty.

      // No bonus banner — the player shouldn't see "+550" without an
      // actual restore. Hydrate state should be failed-retrying so the
      // background retry ladder will have another shot at the cloud.
      const bonusNotice = notices.find(n => n.bonusCoinsAwarded && n.bonusCoinsAwarded > 0)
      expect(bonusNotice, 'should NOT have awarded a phantom bonus').toBeUndefined()
      expect(strategy.hydrateState).toBe('failed-retrying')

      // Local state untouched — the player keeps their existing progress.
      // The retry loop will replace it with cloud data once the SDK
      // returns real values.
      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('2')
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('80')

      // Stop the retry ladder so it doesn't leak into other tests.
      strategy.dispose?.()
    })
  })
})
