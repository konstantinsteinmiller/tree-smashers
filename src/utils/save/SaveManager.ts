import type {
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import { isInternalKey } from './types'
import { SAVE_KEYS } from './SaveMergePolicy'
import { BlobStorage } from './BlobStorage'
import { cgDebug } from './crazyDebugLog'

// ─── SaveManager ───────────────────────────────────────────────────────────
//
// Owns the Strategy, the raw localStorage bindings, and the
// monkey-patching that forwards writes into the strategy. One instance is
// created at boot (`main.ts`) and held as a module-level singleton; game
// code keeps calling plain `localStorage.setItem` unchanged — the manager
// intercepts and forwards.
//
// Boot-time sanity guard:
//   When the initial hydrate does NOT report `success-with-data` AND the
//   local snapshot looks "fresh-defaults" (stage<=1, no coins, no
//   upgrades, no skins), we run up to 3 retries spaced 1s apart before
//   resolving init(). This catches the "transient SDK / network blip
//   during boot" failure mode that was costing returning players their
//   entire progress. The 3-second worst-case delay only applies when
//   both conditions hit, which is precisely the at-risk case. Returning
//   players whose hydrate worked see no added latency.

const BOOT_SANITY_RETRIES = 3
const BOOT_SANITY_DELAY_MS = 1_000

export class SaveManager {
  private readonly storage: Storage
  // Holds gameplay state in memory and mirrors per-key into raw
  // localStorage so the existing synchronous module-load reads still
  // see persisted values across page reloads.
  private readonly blob: BlobStorage
  // Raw bindings captured before we replace the public ones, so the
  // clear() handler can still reach the original `Storage.clear` and
  // enumerate raw entries without re-entering the patched API.
  private readonly rawClear: () => void
  private readonly rawKey: (i: number) => string | null
  private readonly rawLength: () => number

  private patched = false
  private hydrated = false
  private mirroring = false

  constructor(
    private readonly strategy: SaveStrategy,
    storage: Storage = window.localStorage
  ) {
    this.storage = storage
    this.rawClear = storage.clear.bind(storage)
    this.rawKey = storage.key.bind(storage)
    this.rawLength = () => storage.length
    this.blob = new BlobStorage(storage)
  }

  /** Strategy name — useful for logs/tests. */
  get strategyName(): string {
    return this.strategy.name
  }

  /**
   * Forward a key/value to the strategy WITHOUT writing to localStorage.
   * Use for state that should sync to remote but doesn't need to live on
   * device (e.g. cross-device counters, leaderboard scratch). Internal
   * keys are filtered out. On `LocalStorageStrategy` (no remote backend)
   * this is a no-op.
   */
  setRemoteOnly(key: string, value: string): void {
    if (isInternalKey(key)) return
    try {
      this.strategy.onLocalSet(key, value)
    } catch (e) {
      console.warn(`[save] setRemoteOnly("${key}") threw`, e)
    }
  }

  /** Companion to setRemoteOnly for explicit removals. */
  removeRemoteOnly(key: string): void {
    if (isInternalKey(key)) return
    try {
      this.strategy.onLocalRemove(key)
    } catch (e) {
      console.warn(`[save] removeRemoteOnly("${key}") threw`, e)
    }
  }

  /** Current hydrate state from the underlying strategy. Live —
   *  changes as background retries run. */
  get hydrateState(): HydrateState {
    return this.strategy.hydrateState
  }

  isHydrated(): boolean {
    return this.hydrated
  }

  /** Subscribe to hydrate-state notices from the strategy. Returns
   *  an unsubscribe function. Used by the on-screen status banner. */
  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    return this.strategy.onHydrateNotice?.(listener) ?? (() => {
    })
  }

  /** Trigger a manual hydrate retry. Used by the "Retry sync" button
   *  on the offline banner. Returns the new hydrate state. */
  async retryHydrate(): Promise<HydrateState> {
    if (!this.strategy.retryHydrate) return this.strategy.hydrateState
    return this.strategy.retryHydrate(this.localAccessor())
  }

  /**
   * Hydrate the in-memory state from the backend, then patch
   * `localStorage.setItem` / `removeItem` so all future writes flow
   * through the strategy. Idempotent.
   *
   * MUST be awaited before the Vue app module graph loads, because
   * many composables read `localStorage.getItem(...)` at module
   * evaluation time.
   */
  async init(): Promise<void> {
    if (this.hydrated) return
    this.mirroring = true
    const local = this.localAccessor()

    try {
      await this.strategy.hydrate(local)
    } catch (e) {
      console.warn(`[save] hydrate failed (${this.strategy.name})`, e)
    }

    // Boot-time sanity guard: if the strategy didn't end up with
    // `success-with-data` AND local looks like a fresh-defaults install,
    // try a few quick retries before letting the app boot.
    if (this.strategy.retryHydrate && shouldRunSanityGuard(this.strategy.hydrateState, local)) {
      for (let i = 0; i < BOOT_SANITY_RETRIES; i++) {
        await sleep(BOOT_SANITY_DELAY_MS)
        const newState = await this.strategy.retryHydrate(local).catch((e): HydrateState => {
          console.warn('[save] sanity-guard retry threw', e)
          return this.strategy.hydrateState
        })
        if (newState === 'success-with-data' || newState === 'success-empty') break
      }
    }

    this.mirroring = false

    cgDebug(`init: hydrate phase complete (state=${this.strategy.hydrateState}); pre-patch snapshot stage=${local.get('spinner_campaign_stage')} coins=${local.get('spinner_player_coins')} team=${local.get('spinner_player_team')}`)

    this.patchLocalStorage()
    this.hydrated = true
  }

  /** Flush any pending writes. Best-effort — safe to await on unload. */
  async flush(): Promise<void> {
    await this.strategy.flush?.()
  }

  /** Release timers / listeners held by the strategy. */
  dispose(): void {
    this.strategy.dispose?.()
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Strategy-facing accessor. Reads and writes go through BlobStorage,
   *  which routes gameplay keys to the in-memory map (mirrored per-key
   *  into raw localStorage) and bypass keys straight through to raw. */
  private localAccessor(): LocalStorageAccessor {
    return {
      get: (key) => this.blob.get(key),
      set: (key, value) => {
        this.blob.set(key, value)
      },
      remove: (key) => {
        this.blob.remove(key)
      },
      keys: () => this.blob.keys()
    }
  }

  private patchLocalStorage(): void {
    if (this.patched) return
    this.patched = true

    this.storage.getItem = (key: string) => this.blob.get(key)

    this.storage.setItem = (key: string, value: string) => {
      const changed = this.blob.set(key, value)
      if (this.mirroring || isInternalKey(key)) return
      if (!changed) return
      try {
        this.strategy.onLocalSet(key, value)
      } catch (e) {
        console.warn(`[save] onLocalSet("${key}") threw`, e)
      }
    }

    this.storage.removeItem = (key: string) => {
      const changed = this.blob.remove(key)
      if (this.mirroring || isInternalKey(key)) return
      if (!changed) return
      try {
        this.strategy.onLocalRemove(key)
      } catch (e) {
        console.warn(`[save] onLocalRemove("${key}") threw`, e)
      }
    }

    // `clear()` wipes raw localStorage AND the in-memory state, then
    // emits a removeItem for every non-internal key so the strategy
    // stays in sync.
    this.storage.clear = () => {
      const all: string[] = []
      for (let i = 0; i < this.rawLength(); i++) {
        const k = this.rawKey(i)
        if (k !== null) all.push(k)
      }
      this.blob.clear()
      this.rawClear()
      for (const k of all) {
        if (isInternalKey(k)) continue
        try {
          this.strategy.onLocalRemove(k)
        } catch (e) {
          console.warn(`[save] onLocalRemove (clear) threw`, e)
        }
      }
    }
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

const shouldRunSanityGuard = (state: HydrateState, local: LocalStorageAccessor): boolean => {
  if (state === 'success-with-data') return false
  if (state === 'success-empty') return false
  return localLooksFresh(local)
}

const localLooksFresh = (local: LocalStorageAccessor): boolean => {
  const stage = parseInt(local.get(SAVE_KEYS.STAGE) ?? '1', 10) || 1
  if (stage > 1) return false
  const coins = parseInt(local.get(SAVE_KEYS.COINS) ?? '0', 10) || 0
  if (coins > 0) return false
  if (local.get(SAVE_KEYS.UPGRADES)) return false
  if (local.get(SAVE_KEYS.SKINS)) return false
  return true
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
