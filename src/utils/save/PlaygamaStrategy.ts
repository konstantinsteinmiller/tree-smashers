import { isPlaygamaSdkActive, playgamaPlugin, getPlaygamaBridge } from '@/utils/playgamaPlugin'
import type { Bridge } from '@/utils/playgamaBridgeLoader'
import { isPayloadKey } from './SaveMergePolicy'
import type {
  HydrateNotice,
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'

// ─── Playgama Bridge save strategy (SDK v2) ────────────────────────────────
//
// Persists tree-smashers gameplay keys through `bridge.storage`.
//
// ─── Why the v1 version lost saves on YouTube ──────────────────────────────
//
// Playgama QA: "in an environment where it starts, it does not save properly."
// Two independent causes, both fixed here:
//
// 1. THE STORAGE-TYPE PROBE. v1's API took an explicit type on every call, so
//    this strategy had to choose one:
//
//        const cloud = await storage.isAvailable('platform_internal')
//        storage.set(key, value, cloud ? 'platform_internal' : 'local_storage')
//
//    On YouTube `local_storage` cannot work at all — Playables sets
//    `window.localStorage` to null — so any load where the probe answered
//    false or threw left us writing into a store that does not exist, and the
//    "successful" fallback meant nothing ever surfaced as an error. v2 deletes
//    the concept: `get/set/delete` take keys and values only and the Bridge
//    routes to `ytgame.game.saveData` itself.
//
// 2. PER-KEY WRITES AGAINST A WHOLE-BLOB BACKEND. This is the one that
//    actually ate data, and it survives the v2 upgrade unless you change the
//    write path. YouTube has no per-key storage: the Bridge's youtube adapter
//    implements `setDataToStorage` as
//
//        loadData() → merge the incoming keys → saveData(JSON.stringify(all))
//
//    i.e. a read-modify-write of the ENTIRE save. Fire two `storage.set` calls
//    without waiting and both read the same snapshot, then the second write
//    clobbers the first. v1 issued one call per key AND a second call for the
//    key manifest, concurrently — so a `smashers_coins` write and its own
//    manifest update raced, and one of them always lost. Observed directly:
//    coins written, `saveData` called, coins absent from the resulting blob.
//
//    So every write now goes through ONE coalesced, serialized batch:
//    `storage.set(keys[], values[])` with the manifest included, never more
//    than one in flight. That is also ~1 round trip instead of 2N on a backend
//    where each round trip is a full save.
//
// Kept from v1, because v2 did not change them:
//
//   • THE KEY MANIFEST. `bridge.storage` has no key enumeration, so we record
//     which keys we have written and read that first on hydrate. It is now
//     held as an in-memory Set — v1 re-read it from the local accessor on
//     every track/untrack, which was its own read-modify-write race and is why
//     settings keys reached the cloud but never made it into the manifest.
//
//   • THE RE-ENTRANCY GUARD. `SaveManager.setItem` is patched to forward
//     writes to `onLocalSet`, and the Bridge's local-storage path calls
//     `localStorage.setItem` internally during `storage.set` — which re-enters
//     our patched setter. Pure infinite recursion without the guard, and it
//     MUST stay populated across the await: the Bridge fires its internal
//     setItem synchronously inside the call.
//
//   • BOOT-TIME QUEUEING. SaveManager patches localStorage before this
//     strategy's `hydrate()` gets to wait for `initialize()`. Writes that race
//     ahead go into `dirty` and drain once the SDK reports active.

/** Coalescing window. Long enough that a battle-end burst (stage + coins +
 *  upgrades + meta) becomes one write, short enough to be invisible. */
const WRITE_DEBOUNCE_MS = 150

/** Retry cadence while the Bridge is still initializing. */
const FLUSH_POLL_MS = 250

const KEYS_MANIFEST = '__save_internal__playgama_keys'

/** Narrow view of the v2 storage module — keys and values only, no type. */
type BridgeStorage = {
  get: (key: string | string[], tryParseJson?: boolean) => Promise<unknown>
  set: (key: string | string[], value: unknown) => Promise<void>
  delete: (key: string | string[]) => Promise<void>
}

const getBridgeStorage = (): BridgeStorage | null => {
  const bridge: Bridge | null = getPlaygamaBridge()
  if (!bridge) return null
  // Module getters throw "Before using the SDK you must initialize it" when
  // touched pre-init. Probe the SDK-active flag first, and still wrap the
  // access in try/catch as defense-in-depth — the flag flip and the getter are
  // wired by separate Bridge internals that have raced before.
  if (!isPlaygamaSdkActive.value) return null
  try {
    return (bridge.storage as unknown as BridgeStorage) ?? null
  } catch {
    return null
  }
}

const parseManifest = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === 'string')
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

/**
 * Normalise whatever `storage.get(key)` handed back into a string or null.
 *
 * v2 returns the value directly for a single key, but some platform adapters
 * answer with a `{ [key]: value }` object, and `tryParseJson` (which we do NOT
 * ask for) can turn a stored JSON string back into an object. Our payload is
 * strings all the way down, so anything else is re-serialised rather than
 * dropped — losing a save to a shape mismatch is the one outcome worth extra
 * code to avoid.
 */
const coerceStoredValue = (raw: unknown, key: string): string | null => {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (typeof raw === 'object') {
    const own = (raw as Record<string, unknown>)[key]
    if (typeof own === 'string') return own
    if (own !== undefined && own !== null) return JSON.stringify(own)
    try {
      return JSON.stringify(raw)
    } catch {
      return null
    }
  }
  return null
}

export class PlaygamaStrategy implements SaveStrategy {
  readonly name = 'playgama'

  private _hydrateState: HydrateState = 'pending'
  private local: LocalStorageAccessor | null = null
  /** Pending writes (value) and removals (null), keyed by storage key. */
  private dirty = new Map<string, string | null>()
  /** Every payload key we have ever written. Source of truth for the
   *  manifest — never re-read from storage, so concurrent writes cannot race
   *  each other into a partial list. */
  private manifest = new Set<string>()
  private manifestDirty = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  /** Serializes batches: the Bridge's YouTube adapter read-modify-writes the
   *  whole save, so two overlapping batches lose data. */
  private flushInFlight: Promise<void> | null = null
  // Critical re-entrancy guard — see header comment.
  private writeInFlight = new Set<string>()
  private noticeListeners = new Set<HydrateNoticeListener>()
  private loggedQueueWrite = false

  get hydrateState(): HydrateState {
    return this._hydrateState
  }

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    this.local = local
    // Block on `initialize()` before touching `bridge.storage` — the module
    // getter throws pre-init. The plugin has a 15s timeout ceiling and the
    // call is a single singleton promise, so SaveManager.init's worst-case
    // latency is bounded. Local writes during this await queue into `dirty`
    // and drain once the SDK becomes active.
    try {
      await playgamaPlugin()
    } catch (e) {
      console.warn('[playgama-save] plugin init threw', e)
    }

    const storage = getBridgeStorage()
    if (!storage) {
      // Bridge not initialized — local writes still happen, queued for the
      // post-init poll.
      this.setState('success-empty', 'bridge not ready, queuing writes')
      this.ensureFlushPoll()
      return
    }

    try {
      const manifestRaw = await storage.get(KEYS_MANIFEST)
      const remoteKeys = parseManifest(coerceStoredValue(manifestRaw, KEYS_MANIFEST))
        .filter(isPayloadKey)

      if (remoteKeys.length > 0) {
        // ONE batched read. v2 `get()` accepts an array, which matters on
        // YouTube where every read is a full `ytgame.game.loadData()`.
        const values = await storage.get(remoteKeys)
        const asRecord = (values ?? {}) as Record<string, unknown>
        remoteKeys.forEach((key, i) => {
          const raw = Array.isArray(values) ? values[i] : asRecord[key]
          const value = coerceStoredValue(raw, key)
          if (typeof value === 'string') {
            local.set(key, value)
            this.manifest.add(key)
          }
        })
      }

      // Mirror the manifest locally. Without this the first write after a
      // reload rebuilds it from scratch and orphans every key the cloud
      // already had — the exact bug that cost us the CrazyGames build.
      const manifestValue = coerceStoredValue(manifestRaw, KEYS_MANIFEST)
      if (manifestValue) local.set(KEYS_MANIFEST, manifestValue)

      this.setState(
        remoteKeys.length > 0 ? 'success-with-data' : 'success-empty',
        'hydrated from bridge.storage'
      )
    } catch (e) {
      console.warn('[playgama-save] hydrate failed — local-only this session', e)
      this.setState('success-empty', 'bridge.storage unavailable')
    }

    // Anything written while we were awaiting the Bridge is now sendable.
    if (this.dirty.size > 0) this.scheduleFlush()
  }

  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  onLocalSet(key: string, value: string): void {
    if (!isPayloadKey(key)) return
    // The re-entrancy guard. See header comment.
    if (this.writeInFlight.has(key)) return
    this.dirty.set(key, value)
    if (!this.manifest.has(key)) {
      this.manifest.add(key)
      this.manifestDirty = true
    }
    this.scheduleFlush()
  }

  onLocalRemove(key: string): void {
    if (!isPayloadKey(key)) return
    if (this.writeInFlight.has(key)) return
    this.dirty.set(key, null)
    if (this.manifest.delete(key)) this.manifestDirty = true
    this.scheduleFlush()
  }

  async flush(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.drain()
  }

  dispose(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.dirty.clear()
    this.noticeListeners.clear()
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private setState(state: HydrateState, reason: string): void {
    this._hydrateState = state
    const notice: HydrateNotice = { state, reason }
    for (const fn of this.noticeListeners) {
      try {
        fn(notice)
      } catch (e) {
        console.warn('[playgama-save] notice listener threw', e)
      }
    }
  }

  private scheduleFlush(): void {
    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) {
      this.ensureFlushPoll()
      if (!this.loggedQueueWrite) {
        this.loggedQueueWrite = true
        console.info('[playgama-save] queuing writes until bridge.initialize() resolves')
      }
      return
    }
    if (this.debounceTimer !== null) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.drain().catch(e => console.warn('[playgama-save] flush failed', e))
    }, WRITE_DEBOUNCE_MS)
  }

  /** Poll for the SDK becoming available, then hand back to the debounce. */
  private ensureFlushPoll(): void {
    if (this.pollTimer !== null) return
    this.pollTimer = setInterval(() => {
      if (!isPlaygamaSdkActive.value || !getBridgeStorage()) return
      clearInterval(this.pollTimer!)
      this.pollTimer = null
      if (this.dirty.size > 0 || this.manifestDirty) this.scheduleFlush()
    }, FLUSH_POLL_MS)
  }

  /**
   * Write every pending change as ONE batch, with at most one batch in flight.
   *
   * The serialization is not an optimisation. On YouTube each `storage.set` is
   * `loadData → merge → saveData` over the whole blob, so two overlapping
   * calls both read the same snapshot and the later one silently drops the
   * earlier one's keys.
   */
  private async drain(): Promise<void> {
    if (this.flushInFlight) {
      await this.flushInFlight.catch(() => {
      })
    }
    if (this.dirty.size === 0 && !this.manifestDirty) return
    const storage = getBridgeStorage()
    if (!storage) {
      this.ensureFlushPoll()
      return
    }

    const batch = [...this.dirty.entries()]
    const includeManifest = this.manifestDirty
    this.dirty.clear()
    this.manifestDirty = false

    const sets = batch.filter((e): e is [string, string] => e[1] !== null)
    const deletes = batch.filter(e => e[1] === null).map(e => e[0])

    if (includeManifest) {
      const serialized = JSON.stringify([...this.manifest].sort())
      // Keep the local mirror in step so a later hydrate-free reload still
      // knows the key set.
      this.local?.set(KEYS_MANIFEST, serialized)
      sets.push([KEYS_MANIFEST, serialized])
    }

    this.flushInFlight = (async () => {
      if (sets.length > 0) {
        const keys = sets.map(e => e[0])
        for (const k of keys) this.writeInFlight.add(k)
        try {
          await storage.set(keys, sets.map(e => e[1]))
        } catch (e) {
          console.warn('[playgama-save] batched set failed — requeuing', e)
          for (const [k, v] of sets) if (k !== KEYS_MANIFEST) this.dirty.set(k, v)
          if (includeManifest) this.manifestDirty = true
          this.ensureFlushPoll()
        } finally {
          for (const k of keys) this.writeInFlight.delete(k)
        }
      }
      if (deletes.length > 0) {
        for (const k of deletes) this.writeInFlight.add(k)
        try {
          await storage.delete(deletes)
        } catch (e) {
          console.warn('[playgama-save] batched delete failed', e)
        } finally {
          for (const k of deletes) this.writeInFlight.delete(k)
        }
      }
    })()

    try {
      await this.flushInFlight
    } finally {
      this.flushInFlight = null
    }

    // A write that landed during the round trip re-arms the debounce rather
    // than being swallowed by this batch.
    if (this.dirty.size > 0 || this.manifestDirty) this.scheduleFlush()
  }
}
