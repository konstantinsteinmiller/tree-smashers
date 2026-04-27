import type {
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import { isInternalKey } from './types'
import { SAVE_KEYS } from './SaveMergePolicy'

// ─── SaveManager ───────────────────────────────────────────────────────────
//
// Owns the Strategy, the raw localStorage bindings, and the
// monkey-patching that forwards writes into the strategy. One instance is
// created at boot (`main.ts`) and held as a module-level singleton; game
// code keeps calling plain `localStorage.setItem` unchanged — the manager
// intercepts and forwards.
//
// Boot-time sanity guard (added 2026-04 with the bulletproof-save rework):
//   When the initial hydrate does NOT report `success-with-data` AND the
//   local snapshot looks "fresh-defaults" (stage<=1, no coins, no
//   upgrades, no skins), we run up to 3 retries spaced 1s apart before
//   resolving init(). This catches the common "transient SDK / network
//   blip during boot" failure mode that was costing returning players
//   their entire progress. The 3-second worst-case delay only applies
//   when both conditions hit, which is precisely the at-risk case.
//   Returning players whose hydrate worked see no added latency.

const BOOT_SANITY_RETRIES = 3
const BOOT_SANITY_DELAY_MS = 1_000

export class SaveManager {
  private readonly rawSet: (key: string, value: string) => void
  private readonly rawRemove: (key: string) => void
  private readonly rawClear: () => void
  private readonly storage: Storage

  private patched = false
  private hydrated = false
  private mirroring = false

  constructor(
    private readonly strategy: SaveStrategy,
    storage: Storage = window.localStorage
  ) {
    this.storage = storage
    // Capture raw bindings before we replace them so the mirror can
    // actually write without recursing into itself.
    this.rawSet = storage.setItem.bind(storage)
    this.rawRemove = storage.removeItem.bind(storage)
    this.rawClear = storage.clear.bind(storage)
  }

  /** Strategy name — useful for logs/tests. */
  get strategyName(): string {
    return this.strategy.name
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
   * Hydrate the local mirror from the backend, then patch
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
    // try a few quick retries before letting the app boot. This is the
    // last line of defense against the "transient blip wipes returning
    // player" failure — for a true fresh player every retry will return
    // success-empty quickly and the loop exits early.
    if (this.strategy.retryHydrate && shouldRunSanityGuard(this.strategy.hydrateState, local)) {
      for (let i = 0; i < BOOT_SANITY_RETRIES; i++) {
        await sleep(BOOT_SANITY_DELAY_MS)
        const newState = await this.strategy.retryHydrate(local).catch((e): HydrateState => {
          console.warn('[save] sanity-guard retry threw', e)
          return this.strategy.hydrateState
        })
        // Stop early on any conclusive answer (data found OR confirmed empty).
        if (newState === 'success-with-data' || newState === 'success-empty') break
      }
    }

    this.mirroring = false
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

  private localAccessor(): LocalStorageAccessor {
    return {
      get: (key) => this.storage.getItem(key),
      set: (key, value) => this.rawSet(key, value),
      remove: (key) => this.rawRemove(key),
      keys: () => {
        const out: string[] = []
        for (let i = 0; i < this.storage.length; i++) {
          const k = this.storage.key(i)
          if (k !== null) out.push(k)
        }
        return out
      }
    }
  }

  private patchLocalStorage(): void {
    if (this.patched) return
    this.patched = true

    this.storage.setItem = (key: string, value: string) => {
      this.rawSet(key, value)
      if (this.mirroring || isInternalKey(key)) return
      try {
        this.strategy.onLocalSet(key, value)
      } catch (e) {
        console.warn(`[save] onLocalSet("${key}") threw`, e)
      }
    }

    this.storage.removeItem = (key: string) => {
      this.rawRemove(key)
      if (this.mirroring || isInternalKey(key)) return
      try {
        this.strategy.onLocalRemove(key)
      } catch (e) {
        console.warn(`[save] onLocalRemove("${key}") threw`, e)
      }
    }

    // `clear()` is rarely used by the game but keeping the mirror honest
    // matters if it ever is. Emits a remove for every tracked key.
    this.storage.clear = () => {
      const keys: string[] = []
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i)
        if (k !== null) keys.push(k)
      }
      this.rawClear()
      for (const k of keys) {
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

/**
 * The boot-time sanity guard runs only when (a) the strategy didn't end
 * up confirming it has data, AND (b) the local snapshot looks like a
 * fresh-defaults install. The conjunction is what makes the 3-second
 * worst-case latency only hit the at-risk case — returning players whose
 * hydrate worked (or who really are brand new with confirmed-empty
 * remote) skip the wait entirely.
 */
const shouldRunSanityGuard = (state: HydrateState, local: LocalStorageAccessor): boolean => {
  if (state === 'success-with-data') return false
  if (state === 'success-empty') return false
  // 'pending' (strategy didn't update state — bug or no data path), or
  // 'failed-retrying' / 'failed-final': retry if local is suspiciously empty.
  return localLooksFresh(local)
}

/** A local snapshot is "fresh-defaults" if a brand-new player on a clean
 *  device would produce these exact values. If hydrate failed AND local
 *  matches this shape, we have no idea whether the player is genuinely
 *  new or had a real save we couldn't reach — retry to find out. */
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
