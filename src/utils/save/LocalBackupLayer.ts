// ─── LocalBackupLayer ───────────────────────────────────────────────────────
//
// Second-tier persistence that mirrors a snapshot of the player's save into
// IndexedDB. Sits ALONGSIDE the existing SaveStrategy (CrazyGames, Glitch,
// GameDistribution, LocalStorageStrategy) — never replaces it.
//
// ## Why this exists
//
// On the CrazyGames mobile app and similar webview wrappers, force-closing
// the app clears localStorage (the OS reclaims the webview's storage
// partition). When the player relaunches:
//
//   - localStorage is empty.
//   - If the device is online AND the cloud SDK is responsive, the
//     strategy's hydrate() restores from cloud → fine.
//   - If the device is offline OR the cloud SDK times out, the bulletproof
//     sanity guard sees `localLooksFresh=true` AND `success-empty` (or a
//     timed-out failure) and runs retries. After retries exhaust, the
//     player is treated as new — they see fresh defaults.
//
// IndexedDB on most mobile webviews survives force-close (it's tied to the
// app's data dir, not the webview process). Restoring from IDB before
// strategy.hydrate() means the player isn't fresh anymore — `localLooksFresh`
// returns false, the guard skips, and the player keeps playing while cloud
// catches up in the background. If cloud later resolves with a better
// snapshot, SaveMergePolicy.decideMerge handles the merge as it always did.
//
// ## What this does NOT solve
//
//   - "Clear App Data" / manual user wipe → IDB is gone too. Cloud recovers.
//   - iOS 7-day intelligent-tracking-prevention purge for non-PWA sites
//     (the CG mobile app is wrapped, so this may or may not apply).
//   - First-ever launch (genuinely new player). Correct outcome — no IDB,
//     no cloud, fresh defaults. The layer is a no-op in that case.
//
// ## Architecture
//
// `LocalBackupLayer` is constructed with an `AsyncKVStore`. Two
// implementations:
//
//   - `IndexedDBStore` — production, stores under DB `chaos-arena-backup`,
//     object store `snapshots`, key `'main'`.
//   - `MemoryStore` — tests, in-memory map.
//
// The layer reads / writes a single `BackupSnapshot` blob. The blob is
// the entire `localStorage` state minus internal keys, plus a checksum
// for corruption detection. Reads validate the checksum and return null
// on mismatch (treat as no snapshot — let the cloud handle restore).

import type { LocalStorageAccessor } from './types'
import { isInternalKey } from './types'

// Bumped when the blob's shape changes incompatibly. Older blobs are
// treated as missing (return null on read).
const SNAPSHOT_VERSION = 1
const SNAPSHOT_KEY = 'snapshot'
const DEBOUNCE_MS = 1_000
const IDB_NAME = 'chaos-arena-backup'
const IDB_STORE = 'snapshots'
const IDB_VERSION = 1

// ─── Public types ───────────────────────────────────────────────────────────

export interface BackupSnapshot {
  version: number
  savedAt: string
  payload: Record<string, string>
  checksum: string
}

export interface AsyncKVStore {
  get(key: string): Promise<string | null>

  set(key: string, value: string): Promise<void>

  remove(key: string): Promise<void>
}

// ─── Hash (djb2) — sufficient for corruption detection ──────────────────────
//
// Not cryptographic. Goal is "did the blob get truncated / partly written" —
// a 32-bit FNV-1a-style hash catches that with ~1 in 4 billion FP rate,
// which is fine. We avoid SubtleCrypto to keep `writeSnapshot` synchronous-
// friendly and to avoid the async ceremony in the hot setItem hook path.

const hashPayload = (payload: Record<string, string>): string => {
  // Sort keys so two equal payloads always produce the same hash, regardless
  // of insertion order.
  const keys = Object.keys(payload).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) {
      h = ((h << 5) + h + k.charCodeAt(i)) | 0
    }
    h = ((h << 5) + h + 0x1f) | 0  // separator
    const v = payload[k]!
    for (let i = 0; i < v.length; i++) {
      h = ((h << 5) + h + v.charCodeAt(i)) | 0
    }
    h = ((h << 5) + h + 0x1e) | 0  // separator
  }
  return (h >>> 0).toString(16)  // unsigned hex
}

// ─── MemoryStore (test impl) ────────────────────────────────────────────────

export class MemoryStore implements AsyncKVStore {
  private map = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key)
  }
}

// ─── IndexedDBStore (production impl) ───────────────────────────────────────
//
// Single-record store. The whole snapshot is one blob — no per-key sharding.
// Open lazily on first call so construction is cheap and never throws.

export class IndexedDBStore implements AsyncKVStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(
    private readonly dbName: string = IDB_NAME,
    private readonly storeName: string = IDB_STORE
  ) {
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('indexedDB not available'))
        return
      }
      const req = window.indexedDB.open(this.dbName, IDB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    })
    // Don't cache a rejected promise — next call should retry.
    this.dbPromise.catch(() => {
      this.dbPromise = null
    })
    return this.dbPromise
  }

  async get(key: string): Promise<string | null> {
    const db = await this.openDb().catch(() => null)
    if (!db) return null
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).get(key)
      req.onsuccess = () => {
        const v = req.result
        resolve(typeof v === 'string' ? v : null)
      }
      req.onerror = () => resolve(null)
    })
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.openDb().catch(() => null)
    if (!db) return
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const req = tx.objectStore(this.storeName).put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()  // best-effort — never throw on backup write
    })
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDb().catch(() => null)
    if (!db) return
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const req = tx.objectStore(this.storeName).delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
  }
}

// ─── LocalBackupLayer ───────────────────────────────────────────────────────

export class LocalBackupLayer {
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAccessor: LocalStorageAccessor | null = null
  private snapshotPresentAfterInit = false
  private initialized = false

  constructor(private readonly store: AsyncKVStore) {
  }

  /**
   * Probe the store for an existing snapshot. Sets the sync-readable
   * `hasSnapshot()` flag based on what's there. Safe to call any time;
   * subsequent calls are cheap re-probes.
   */
  async init(): Promise<void> {
    const snap = await this.readSnapshot()
    this.snapshotPresentAfterInit = snap !== null
    this.initialized = true
  }

  /**
   * Did the store have a valid snapshot when `init()` ran? Sync — useful
   * for callers that need the answer before awaiting anything else.
   */
  hasSnapshot(): boolean {
    return this.snapshotPresentAfterInit
  }

  /**
   * Read + validate the current snapshot. Returns null when nothing is
   * stored, the blob is malformed, the version is older than ours, or
   * the checksum doesn't match the payload.
   */
  async readSnapshot(): Promise<BackupSnapshot | null> {
    const raw = await this.store.get(SNAPSHOT_KEY).catch(() => null)
    if (!raw) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null

    const blob = parsed as Partial<BackupSnapshot>
    if (typeof blob.version !== 'number' || blob.version < SNAPSHOT_VERSION) return null
    if (typeof blob.savedAt !== 'string') return null
    if (typeof blob.checksum !== 'string') return null
    if (!blob.payload || typeof blob.payload !== 'object') return null

    const expected = hashPayload(blob.payload as Record<string, string>)
    if (expected !== blob.checksum) return null

    return blob as BackupSnapshot
  }

  /**
   * Capture the current localStorage state into the store. Only non-internal
   * keys (those that don't start with the SaveManager's reserved prefixes)
   * are included — internal manifests would round-trip through us and back
   * into the strategy's own bookkeeping.
   */
  async writeSnapshot(local: LocalStorageAccessor): Promise<void> {
    const payload = this.buildPayload(local)
    const blob: BackupSnapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      payload,
      checksum: hashPayload(payload)
    }
    await this.store.set(SNAPSHOT_KEY, JSON.stringify(blob)).catch(() => {
      // Best-effort. Backup write failure is logged, not propagated.
    })
  }

  /**
   * Schedule a debounced write. Multiple rapid calls coalesce into a single
   * flush. The patched `localStorage.setItem` in SaveManager calls this on
   * every game-state write — debouncing keeps IDB I/O off the hot path.
   */
  scheduleWrite(local: LocalStorageAccessor): void {
    this.pendingAccessor = local
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      const accessor = this.pendingAccessor
      this.pendingAccessor = null
      if (accessor) {
        void this.writeSnapshot(accessor).catch((e) => {
          console.warn('[backup] scheduled writeSnapshot failed', e)
        })
      }
    }, DEBOUNCE_MS)
  }

  /** Flush any pending debounced write immediately. */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    const accessor = this.pendingAccessor
    this.pendingAccessor = null
    if (accessor) {
      await this.writeSnapshot(accessor)
    }
  }

  /** Remove the snapshot. Used by `SaveManager.clear()` (when added). */
  async clear(): Promise<void> {
    await this.store.remove(SNAPSHOT_KEY).catch(() => {
    })
    this.snapshotPresentAfterInit = false
  }

  /** Cancel pending writes. Call on page unload / SaveManager dispose. */
  dispose(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.pendingAccessor = null
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private buildPayload(local: LocalStorageAccessor): Record<string, string> {
    const out: Record<string, string> = {}
    for (const key of local.keys()) {
      if (isInternalKey(key)) continue
      const v = local.get(key)
      if (v !== null) out[key] = v
    }
    return out
  }
}
