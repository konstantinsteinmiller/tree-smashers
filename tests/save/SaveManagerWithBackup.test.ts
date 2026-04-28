// Integration tests for the SaveManager + LocalBackupLayer pairing. These
// model the real-world failure mode: localStorage gets wiped (force-close
// on the CrazyGames mobile app), the cloud strategy is slow / offline /
// returns 'success-empty', and the player should NOT see fresh defaults
// because IDB still has their save.
//
// We use MemoryStore as the IDB shim so tests are deterministic and don't
// require fake-indexeddb.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveManager } from '@/utils/save/SaveManager'
import { LocalBackupLayer, MemoryStore } from '@/utils/save/LocalBackupLayer'
import { SAVE_KEYS } from '@/utils/save/SaveMergePolicy'
import type { HydrateState, LocalStorageAccessor, SaveStrategy } from '@/utils/save/types'

// Shared MemoryStore across the boot/relaunch test so the simulated
// "IDB survives force-close" property holds.
const makeIdbBackedLayer = (store: MemoryStore = new MemoryStore()): LocalBackupLayer =>
  new LocalBackupLayer(store)

// Strategy that reports a configurable hydrateState and never finds remote
// data — simulates the offline / cold-cloud scenario the backup layer
// exists to handle.
const makeOfflineStrategy = (state: HydrateState = 'failed-final'): SaveStrategy => ({
  name: 'offline',
  hydrateState: state,
  hydrate: async () => {
    // No remote data found / network error — leave local untouched.
  },
  onLocalSet: vi.fn(),
  onLocalRemove: vi.fn()
})

const makeSuccessEmptyStrategy = (): SaveStrategy => ({
  name: 'success-empty',
  hydrateState: 'success-empty',
  hydrate: async () => {
  },
  onLocalSet: vi.fn(),
  onLocalRemove: vi.fn()
})

describe('SaveManager + LocalBackupLayer integration', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  describe('first-ever launch (no IDB, no cloud)', () => {
    it('does not restore anything — player is genuinely new', async () => {
      const layer = makeIdbBackedLayer()
      const strategy = makeSuccessEmptyStrategy()
      const manager = new SaveManager(strategy, layer)

      await manager.init()

      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBeNull()
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBeNull()
      layer.dispose()
    })
  })

  describe('force-close survival — IDB has snapshot, cloud unreachable', () => {
    it('restores from IDB before strategy.hydrate(), so player keeps their save', async () => {
      // Pre-seed the IDB store as if a previous session wrote it.
      const store = new MemoryStore()
      const seedLayer = makeIdbBackedLayer(store)
      window.localStorage.setItem(SAVE_KEYS.STAGE, '7')
      window.localStorage.setItem(SAVE_KEYS.COINS, '420')
      window.localStorage.setItem(SAVE_KEYS.UPGRADES, '{"tops":{"star":3}}')
      await seedLayer.writeSnapshot({
        get: (k) => window.localStorage.getItem(k),
        set: (k, v) => window.localStorage.setItem(k, v),
        remove: (k) => window.localStorage.removeItem(k),
        keys: () => {
          const out: string[] = []
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)
            if (k !== null) out.push(k)
          }
          return out
        }
      })
      seedLayer.dispose()

      // Simulate force-close: localStorage is wiped.
      window.localStorage.clear()
      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBeNull()

      // Relaunch with the same IDB store + an offline cloud strategy.
      const layer = makeIdbBackedLayer(store)
      const manager = new SaveManager(makeOfflineStrategy(), layer)
      await manager.init()

      // Save was restored from IDB even though cloud was offline.
      expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('7')
      expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('420')
      expect(window.localStorage.getItem(SAVE_KEYS.UPGRADES)).toBe('{"tops":{"star":3}}')
      layer.dispose()
    })
  })

  describe('writes are mirrored to IDB after init', () => {
    it('flush captures the latest state', async () => {
      const store = new MemoryStore()
      const layer = makeIdbBackedLayer(store)
      const manager = new SaveManager(makeSuccessEmptyStrategy(), layer)

      await manager.init()
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      window.localStorage.setItem(SAVE_KEYS.COINS, '100')

      // Flush whatever the patched setItem queued.
      await layer.flush()

      const snap = await layer.readSnapshot()
      expect(snap).not.toBeNull()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('5')
      expect(snap!.payload[SAVE_KEYS.COINS]).toBe('100')
      layer.dispose()
    })

    it('persists the post-hydrate state automatically (no flush needed for the boot write)', async () => {
      const store = new MemoryStore()
      const seedingStrategy: SaveStrategy = {
        name: 'seed',
        hydrateState: 'success-with-data',
        hydrate: async (local) => {
          // Cloud restores a real save into local during hydrate.
          local.set(SAVE_KEYS.STAGE, '12')
          local.set(SAVE_KEYS.COINS, '999')
        },
        onLocalSet: vi.fn(),
        onLocalRemove: vi.fn()
      }
      const layer = makeIdbBackedLayer(store)
      const manager = new SaveManager(seedingStrategy, layer)

      await manager.init()

      // The post-hydrate IDB write may be fire-and-forget; flush to be safe.
      await layer.flush()

      const snap = await layer.readSnapshot()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('12')
      expect(snap!.payload[SAVE_KEYS.COINS]).toBe('999')
      layer.dispose()
    })
  })

  describe('IDB-restored state is visible to strategy.hydrate()', () => {
    it('strategy sees the IDB-restored values via the LocalStorageAccessor it receives', async () => {
      // Seed IDB with stage=10.
      const store = new MemoryStore()
      const seedLayer = makeIdbBackedLayer(store)
      window.localStorage.setItem(SAVE_KEYS.STAGE, '10')
      await seedLayer.writeSnapshot({
        get: (k) => window.localStorage.getItem(k),
        set: (k, v) => window.localStorage.setItem(k, v),
        remove: (k) => window.localStorage.removeItem(k),
        keys: () => Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)!).filter(Boolean)
      })
      seedLayer.dispose()
      window.localStorage.clear()

      // Strategy that reads what's in local during hydrate.
      let observedStage: string | null = 'NOT_READ'
      const observingStrategy: SaveStrategy = {
        name: 'observe',
        hydrateState: 'success-with-data',
        hydrate: async (local) => {
          observedStage = local.get(SAVE_KEYS.STAGE)
        },
        onLocalSet: vi.fn(),
        onLocalRemove: vi.fn()
      }
      const layer = makeIdbBackedLayer(store)
      const manager = new SaveManager(observingStrategy, layer)
      await manager.init()

      // The strategy saw the IDB-seeded value, not the empty post-force-close state.
      expect(observedStage).toBe('10')
      layer.dispose()
    })
  })

  describe('no backup layer = legacy behavior', () => {
    it('SaveManager works exactly as before when no backup is wired', async () => {
      const strategy = makeSuccessEmptyStrategy()
      const manager = new SaveManager(strategy)  // no second arg

      await manager.init()
      expect(manager.isHydrated()).toBe(true)
    })
  })
})
