import { isPlaygamaSdkActive, playgamaPlugin, getPlaygamaBridge } from '@/utils/playgamaPlugin'
import { isPayloadKey } from './SaveMergePolicy'
import type {
  HydrateNotice,
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'

// ─── Playgama Bridge save strategy ────────────────────────────────────────
//
// Persists chaos-arena gameplay keys via the Playgama Bridge's
// `bridge.storage` API. Prefers `platform_internal` (cloud) when the active
// portal supports it (production Playgama portal does as of Bridge v1.21.0)
// and falls back to `local_storage` otherwise. The QA Tool's "Game Saves"
// certification check WATCHES `bridge.storage.set` as its detection signal,
// so even on the local-storage code path we MUST call set() — skipping the
// call to dodge the re-entrancy loop fails certification.
//
// Re-entrancy:
//   `SaveManager.setItem` is patched to forward writes to `onLocalSet`. The
//   Bridge's `local_storage` adapter internally calls `localStorage.setItem`
//   during `bridge.storage.set`, which re-enters our patched setter — pure
//   infinite recursion without a guard. We hold a `writeInFlight: Set<key>`
//   for the full awaited duration of every `bridge.storage.set` so the
//   recursive `onLocalSet` short-circuits. The guard MUST stay populated
//   across the await — the Bridge fires its internal setItem synchronously
//   inside the call.
//
// Boot-time queueing:
//   SaveManager patches localStorage BEFORE this strategy's `hydrate()`
//   gets a chance to wait for `bridge.initialize()`. Writes that race
//   ahead of init go into `dirty: Map<key, string|null>` and flush via
//   `ensureFlushPoll()` once the SDK reports active.

type BridgeStorage = {
  isAvailable?: (type: string) => boolean | Promise<boolean>
  defaultType?: string
  set: (key: string, value: string, type?: string) => Promise<void> | void
  get: (keys: string | string[], type?: string) => Promise<any> | any
  delete: (key: string, type?: string) => Promise<void> | void
}

const FLUSH_POLL_MS = 250
const KEYS_MANIFEST = '__save_internal__playgama_keys'

const getBridgeStorage = (): BridgeStorage | null => {
  const bridge = getPlaygamaBridge()
  if (!bridge) return null
  // `bridge.storage` is a getter that THROWS "Before using the SDK you
  // must initialize it" if accessed before `bridge.initialize()` has
  // resolved. Probe via the SDK-active flag first, and still wrap the
  // access in try/catch as defense-in-depth (the flag-flip + the getter
  // are wired by separate Bridge internals that have raced before).
  if (!isPlaygamaSdkActive.value) return null
  try {
    return (bridge as any).storage ?? null
  } catch {
    return null
  }
}

const parseManifest = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

const shouldMirror = (key: string): boolean => isPayloadKey(key)

export class PlaygamaStrategy implements SaveStrategy {
  readonly name = 'playgama'

  private _hydrateState: HydrateState = 'pending'
  private local: LocalStorageAccessor | null = null
  private storageType = 'local_storage'
  private dirty = new Map<string, string | null>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  // Critical re-entrancy guard — see header comment.
  private writeInFlight = new Set<string>()
  private noticeListeners = new Set<HydrateNoticeListener>()
  private loggedQueueWrite = false

  get hydrateState(): HydrateState {
    return this._hydrateState
  }

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    this.local = local
    // Block on `bridge.initialize()` before touching `bridge.storage` —
    // the storage getter throws "Before using the SDK you must
    // initialize it" if accessed pre-init. The plugin has a 15s timeout
    // ceiling and the call is idempotent (a single singleton promise),
    // so SaveManager.init's overall worst-case latency is bounded.
    // Any local writes that fire during this await queue into `dirty`
    // and drain via `ensureFlushPoll` once the SDK becomes active.
    try {
      await playgamaPlugin()
    } catch (e) {
      console.warn('[playgama-save] plugin init threw', e)
    }

    const storage = getBridgeStorage()
    if (storage) {
      this.storageType = await resolveStorageType(storage)
      try {
        // Pull the manifest of remote keys (best-effort). Per-key fetches
        // populate the local accessor so module-level reads in useUser /
        // SpinnerCampaign / etc. see cloud values on first tick.
        const manifestRaw = await readRemoteKey(storage, KEYS_MANIFEST, this.storageType)
        const remoteKeys = parseManifest(manifestRaw)
        for (const key of remoteKeys) {
          if (!isPayloadKey(key)) continue
          try {
            const v = await readRemoteKey(storage, key, this.storageType)
            if (typeof v === 'string') local.set(key, v)
          } catch (e) {
            console.warn(`[playgama-save] hydrate get(${key}) failed`, e)
          }
        }
        if (manifestRaw && typeof manifestRaw === 'string') {
          local.set(KEYS_MANIFEST, manifestRaw)
        }
        this.setState(remoteKeys.length > 0 ? 'success-with-data' : 'success-empty', 'hydrated from bridge.storage')
      } catch (e) {
        console.warn('[playgama-save] hydrate failed — local-only this session', e)
        this.setState('success-empty', 'bridge.storage unavailable')
      }
    } else {
      // Bridge not initialized yet — local writes still happen, queued for
      // the post-init flush poll.
      this.setState('success-empty', 'bridge not ready, queuing writes')
      this.ensureFlushPoll()
    }
  }

  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  onLocalSet(key: string, value: string): void {
    if (!shouldMirror(key)) return
    // The re-entrancy guard. See header comment.
    if (this.writeInFlight.has(key)) return

    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) {
      this.dirty.set(key, value)
      this.ensureFlushPoll()
      if (!this.loggedQueueWrite) {
        this.loggedQueueWrite = true
        console.info('[playgama-save] queuing writes until bridge.initialize() resolves')
      }
      return
    }
    if (this.dirty.size > 0) void this.drainDirty()
    void this.writeKey(key, value)
    this.trackManifestKey(key)
  }

  onLocalRemove(key: string): void {
    if (!shouldMirror(key)) return
    if (this.writeInFlight.has(key)) return
    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) {
      this.dirty.set(key, null)
      this.ensureFlushPoll()
      return
    }
    if (this.dirty.size > 0) void this.drainDirty()
    void this.deleteKey(key)
    this.untrackManifestKey(key)
  }

  async flush(): Promise<void> {
    await this.drainDirty()
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
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

  private ensureFlushPoll(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setInterval(() => {
      if (!isPlaygamaSdkActive.value || !getBridgeStorage()) return
      if (this.dirty.size === 0) {
        if (this.flushTimer) {
          clearInterval(this.flushTimer)
          this.flushTimer = null
        }
        return
      }
      void this.drainDirty().catch((e) => console.warn('[playgama-save] flush drain failed', e))
    }, FLUSH_POLL_MS)
  }

  private async drainDirty(): Promise<void> {
    if (this.dirty.size === 0) return
    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) return
    const batch = [...this.dirty.entries()]
    this.dirty.clear()
    for (const [key, value] of batch) {
      if (value === null) {
        await this.deleteKey(key)
        this.untrackManifestKey(key)
      } else {
        await this.writeKey(key, value)
        this.trackManifestKey(key)
      }
    }
  }

  private async writeKey(key: string, value: string): Promise<void> {
    const storage = getBridgeStorage()
    if (!storage) return
    this.writeInFlight.add(key)
    try {
      await storage.set(key, value, this.storageType)
    } catch (e) {
      console.warn(`[playgama-save] set(${key}) threw`, e)
      this.dirty.set(key, value)
      this.ensureFlushPoll()
    } finally {
      this.writeInFlight.delete(key)
    }
  }

  private async deleteKey(key: string): Promise<void> {
    const storage = getBridgeStorage()
    if (!storage) return
    this.writeInFlight.add(key)
    try {
      await storage.delete(key, this.storageType)
    } catch (e) {
      console.warn(`[playgama-save] delete(${key}) threw`, e)
    } finally {
      this.writeInFlight.delete(key)
    }
  }

  private trackManifestKey(key: string): void {
    if (!this.local) return
    const current = parseManifest(this.local.get(KEYS_MANIFEST))
    if (current.includes(key)) return
    const next = [...current, key].sort()
    const serialized = JSON.stringify(next)
    this.local.set(KEYS_MANIFEST, serialized)
    void this.writeKey(KEYS_MANIFEST, serialized)
  }

  private untrackManifestKey(key: string): void {
    if (!this.local) return
    const current = parseManifest(this.local.get(KEYS_MANIFEST))
    if (!current.includes(key)) return
    const next = current.filter(k => k !== key)
    const serialized = JSON.stringify(next)
    this.local.set(KEYS_MANIFEST, serialized)
    void this.writeKey(KEYS_MANIFEST, serialized)
  }
}

const resolveStorageType = async (storage: BridgeStorage): Promise<string> => {
  if (typeof storage.isAvailable !== 'function') {
    return storage.defaultType ?? 'local_storage'
  }
  try {
    const cloud = await Promise.resolve(storage.isAvailable('platform_internal'))
    if (cloud) return 'platform_internal'
  } catch (e) {
    console.warn('[playgama-save] isAvailable(platform_internal) threw', e)
  }
  return 'local_storage'
}

const readRemoteKey = async (storage: BridgeStorage, key: string, type: string): Promise<string | null> => {
  try {
    const raw = await Promise.resolve(storage.get(key, type))
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'string') return raw
    // Some bridge platforms return a `{ [key]: value }` shape for single-key get.
    if (typeof raw === 'object' && raw !== null) {
      const v = (raw as any)[key]
      if (typeof v === 'string') return v
    }
    return null
  } catch (e) {
    console.warn(`[playgama-save] read(${key}) threw`, e)
    return null
  }
}
