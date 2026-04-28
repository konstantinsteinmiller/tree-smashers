import type {
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import { isInternalKey } from './types'
import { SAVE_KEYS } from './SaveMergePolicy'
import type { LocalBackupLayer } from './LocalBackupLayer'

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
    private readonly backupLayer: LocalBackupLayer | null = null,
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

    // ── Phase 0: restore from IDB backup BEFORE strategy.hydrate() ──────────
    //
    // This is the force-close survival path. On the CrazyGames mobile app
    // (and similar webview wrappers), localStorage gets wiped when the OS
    // reclaims the webview process. Without this, a player relaunching
    // offline would see fresh defaults despite IDB still having their save.
    //
    // After restore, the strategy's hydrate() runs as before — it now sees
    // the IDB-seeded local state. If cloud has a higher-progress save,
    // SaveMergePolicy.decideMerge picks it; if cloud is unreachable, the
    // IDB-restored state is what the player keeps playing with.
    //
    // The restore is best-effort: any failure (no IDB, corrupted blob,
    // checksum mismatch) leaves localStorage untouched and lets the
    // strategy try to hydrate from cloud.
    if (this.backupLayer) {
      try {
        const snap = await this.backupLayer.readSnapshot()
        if (snap) {
          let restored = 0
          for (const [k, v] of Object.entries(snap.payload)) {
            // `isInternalKey` is also enforced when WRITING the snapshot,
            // so we shouldn't see internal keys here — but the defense
            // costs nothing.
            if (!isInternalKey(k)) {
              this.rawSet(k, v)
              restored++
            }
          }
          // Boot diagnostic — visible in CG mobile DevTools / desktop
          // console. Tells you whether IDB persisted across the last
          // close (essential signal when debugging force-close save loss).
          console.info(`[save] IDB backup restored ${restored} keys (savedAt=${snap.savedAt})`)
        } else {
          console.info('[save] IDB backup empty — first launch or IDB was cleared')
        }
      } catch (e) {
        console.warn('[save] backup-layer restore failed (non-fatal)', e)
      }
    }

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

    // ── Phase 4: persist post-hydrate state into IDB ────────────────────────
    //
    // Whatever the merged outcome was (IDB-restored + cloud merge applied,
    // or cloud-only, or local-only), write the current state back to the
    // backup layer so the next force-close has something to restore from.
    // Fire-and-forget — backup is a safety net, not a critical-path write.
    if (this.backupLayer) {
      void this.backupLayer.writeSnapshot(this.localAccessor()).catch((e) => {
        console.warn('[save] backup-layer write after hydrate failed', e)
      })
    }
  }

  /** Flush any pending writes. Best-effort — safe to await on unload. */
  async flush(): Promise<void> {
    await this.strategy.flush?.()
    // Also flush the IDB backup so a tab close mid-write doesn't leave
    // the backup behind the strategy.
    await this.backupLayer?.flush()
  }

  /** Release timers / listeners held by the strategy. */
  dispose(): void {
    this.strategy.dispose?.()
    this.backupLayer?.dispose()
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
      // Schedule a debounced IDB backup. The layer coalesces rapid
      // setItem calls into a single write so the hot path stays fast.
      this.backupLayer?.scheduleWrite(this.localAccessor())
    }

    this.storage.removeItem = (key: string) => {
      this.rawRemove(key)
      if (this.mirroring || isInternalKey(key)) return
      try {
        this.strategy.onLocalRemove(key)
      } catch (e) {
        console.warn(`[save] onLocalRemove("${key}") threw`, e)
      }
      // Removals also bump the backup — otherwise a "buy a power-up that
      // resets a flag" sequence would have an outdated IDB snapshot.
      this.backupLayer?.scheduleWrite(this.localAccessor())
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
