// LocalBackupLayer — second-tier persistence that survives force-close on
// mobile webviews (CrazyGames mobile app, in particular). Mirrors a subset
// of localStorage into an IndexedDB blob so a player whose localStorage
// got wiped (force-close + offline cold launch) doesn't see fresh defaults.
//
// Tests use an injected MemoryStore so they don't need fake-indexeddb.
// Production wiring uses IndexedDBStore (covered by integration tests in
// SaveManager.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalBackupLayer, MemoryStore } from '@/utils/save/LocalBackupLayer'
import type { LocalStorageAccessor } from '@/utils/save/types'
import { SAVE_KEYS } from '@/utils/save/SaveMergePolicy'

// Build a LocalStorageAccessor over `window.localStorage` so the layer's
// payload mirroring matches what SaveManager passes in production.
const accessor = (): LocalStorageAccessor => ({
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

describe('LocalBackupLayer with MemoryStore', () => {
  let store: MemoryStore
  let layer: LocalBackupLayer

  beforeEach(() => {
    store = new MemoryStore()
    layer = new LocalBackupLayer(store)
  })

  afterEach(() => {
    layer.dispose()
  })

  describe('readSnapshot', () => {
    it('returns null when nothing has been stored', async () => {
      const snap = await layer.readSnapshot()
      expect(snap).toBeNull()
    })

    it('returns null when the stored blob is malformed JSON', async () => {
      await store.set('snapshot', 'not-json{')
      const snap = await layer.readSnapshot()
      expect(snap).toBeNull()
    })

    it('returns null when the checksum does not match the payload', async () => {
      // Forge a snapshot with mismatched checksum.
      const tampered = JSON.stringify({
        version: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        meta: null,
        payload: { [SAVE_KEYS.STAGE]: '5' },
        checksum: 'bogus'
      })
      await store.set('snapshot', tampered)
      const snap = await layer.readSnapshot()
      expect(snap).toBeNull()
    })

    it('returns null when the stored version is older than the current one', async () => {
      // Force a v0 blob.
      const oldVersion = JSON.stringify({
        version: 0,
        savedAt: '2026-01-01T00:00:00.000Z',
        meta: null,
        payload: {},
        checksum: 'whatever'
      })
      await store.set('snapshot', oldVersion)
      const snap = await layer.readSnapshot()
      expect(snap).toBeNull()
    })
  })

  describe('writeSnapshot', () => {
    it('persists a payload of every non-internal localStorage key', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '7')
      window.localStorage.setItem(SAVE_KEYS.COINS, '420')
      window.localStorage.setItem('__save_internal__crazy_keys', '["x"]')   // internal — must NOT be backed up

      await layer.writeSnapshot(accessor())
      const snap = await layer.readSnapshot()

      expect(snap).not.toBeNull()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('7')
      expect(snap!.payload[SAVE_KEYS.COINS]).toBe('420')
      expect(snap!.payload['__save_internal__crazy_keys']).toBeUndefined()
    })

    it('round-trips reliably — write, then read, returns the same payload', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      window.localStorage.setItem(SAVE_KEYS.COINS, '300')
      window.localStorage.setItem(SAVE_KEYS.UPGRADES, '{"tops":{"star":3}}')
      window.localStorage.setItem(SAVE_KEYS.SKINS, '["star:rainbow"]')

      await layer.writeSnapshot(accessor())
      const snap = await layer.readSnapshot()

      expect(snap!.payload).toMatchObject({
        [SAVE_KEYS.STAGE]: '5',
        [SAVE_KEYS.COINS]: '300',
        [SAVE_KEYS.UPGRADES]: '{"tops":{"star":3}}',
        [SAVE_KEYS.SKINS]: '["star:rainbow"]'
      })
    })

    it('overwrites a previous snapshot', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '3')
      await layer.writeSnapshot(accessor())

      window.localStorage.setItem(SAVE_KEYS.STAGE, '8')
      await layer.writeSnapshot(accessor())

      const snap = await layer.readSnapshot()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('8')
    })

    it('writes a checksum that validates on read', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      await layer.writeSnapshot(accessor())

      const raw = await store.get('snapshot')
      const parsed = JSON.parse(raw!)
      expect(parsed.checksum).toBeTruthy()
      expect(typeof parsed.checksum).toBe('string')
      expect(parsed.checksum.length).toBeGreaterThan(0)

      // Read should still validate.
      const snap = await layer.readSnapshot()
      expect(snap).not.toBeNull()
    })
  })

  describe('scheduleWrite — debounced', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not write immediately', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      layer.scheduleWrite(accessor())
      // Flush any pending microtasks but DON'T advance timers.
      await Promise.resolve()
      const raw = await store.get('snapshot')
      expect(raw).toBeNull()
    })

    it('writes after the debounce window elapses', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      layer.scheduleWrite(accessor())
      await vi.advanceTimersByTimeAsync(2000)
      const snap = await layer.readSnapshot()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('5')
    })

    it('coalesces rapid writes into a single flush', async () => {
      const writeSpy = vi.spyOn(store, 'set')
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      layer.scheduleWrite(accessor())
      window.localStorage.setItem(SAVE_KEYS.STAGE, '6')
      layer.scheduleWrite(accessor())
      window.localStorage.setItem(SAVE_KEYS.STAGE, '7')
      layer.scheduleWrite(accessor())
      await vi.advanceTimersByTimeAsync(2000)

      // One write — the debounce coalesced 3 calls.
      expect(writeSpy).toHaveBeenCalledTimes(1)
      const snap = await layer.readSnapshot()
      expect(snap!.payload[SAVE_KEYS.STAGE]).toBe('7')
    })
  })

  describe('hasSnapshot (sync, post-init)', () => {
    it('returns false when init found nothing', async () => {
      await layer.init()
      expect(layer.hasSnapshot()).toBe(false)
    })

    it('returns true when init found a valid snapshot', async () => {
      window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
      await layer.writeSnapshot(accessor())
      const fresh = new LocalBackupLayer(store)
      await fresh.init()
      expect(fresh.hasSnapshot()).toBe(true)
      fresh.dispose()
    })
  })
})
