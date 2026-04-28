import {
  applyBonusCoins,
  computeMeta,
  decideMerge,
  isPayloadKey,
  META_KEY,
  parseMeta,
  SAVE_KEYS,
  serializeMeta,
  type SaveMeta
} from './SaveMergePolicy'
import type {
  HydrateNotice,
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'

// ─── CrazyGames data-module strategy ───────────────────────────────────────
//
// Mirrors the game's localStorage into the CrazyGames SDK's `data` module so
// progress follows the player between devices on the CrazyGames portal.
//
// The SDK does not expose a "list keys" API, so we keep our own manifest of
// keys we've written. On boot we read the manifest, pull each key back from
// the SDK into localStorage, then patch-through every subsequent local
// write.
//
// Bulletproofing rules (added 2026-04 after a player-reported progress-loss
// bug — see SaveMergePolicy.ts header):
//   1. Track `hydrateState` explicitly. The previous implementation
//      collapsed "SDK returned an error" and "SDK returned no manifest"
//      into the same code path, which let a transient network blip during
//      boot wipe the player's cloud save (the game would default to a
//      fresh state and the next 500ms autosave would push those defaults
//      to remote, overwriting the actual save).
//   2. NEVER push to remote while `hydrateState` isn't a `success-*` state.
//      Local writes accumulate in `dirty` and flush on the next successful
//      hydrate. The local mirror is still always-on so the game keeps
//      working offline.
//   3. On a successful hydrate that finds remote data, run the merge
//      policy: higher progress score wins; if remote wins and local had
//      progress, award `winner.maxStage * 50` bonus coins.
//   4. When hydrate fails, schedule a background retry ladder
//      (5s → 15s → 45s → 2m → 5m → 15m loop) so a brief outage at boot
//      heals on its own without requiring the player to relaunch.

const KEYS_MANIFEST = '__save_internal__crazy_keys'
const FLUSH_DELAY_MS = 500
const HYDRATE_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000]
const HYDRATE_RETRY_LOOP_MS = 900_000  // every 15 min once the ladder is exhausted

interface SdkDataModule {
  getItem: (key: string) => Promise<string | null> | string | null
  setItem: (key: string, value: string) => Promise<void> | void
  removeItem: (key: string) => Promise<void> | void
}

/**
 * Resolves the SDK's data module. Injectable so unit tests can supply a
 * fake without standing up the full `window.CrazyGames` shape.
 */
export type CrazySdkDataGetter = () => SdkDataModule | null

export class CrazyGamesStrategy implements SaveStrategy {
  readonly name = 'crazyGames'

  private _hydrateState: HydrateState = 'pending'
  private local: LocalStorageAccessor | null = null
  private dirty = new Map<string, string | null>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private noticeListeners = new Set<HydrateNoticeListener>()

  constructor(private readonly getData: CrazySdkDataGetter) {
  }

  get hydrateState(): HydrateState {
    return this._hydrateState
  }

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    this.local = local
    await this.runHydrateAttempt(local, 'hydrate')
    if (this._hydrateState === 'failed-retrying') {
      this.scheduleRetry()
    }
  }

  async retryHydrate(local: LocalStorageAccessor): Promise<HydrateState> {
    this.local = local
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    await this.runHydrateAttempt(local, 'retry')
    if (this._hydrateState === 'failed-retrying') {
      this.scheduleRetry()
    }
    return this._hydrateState
  }

  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  onLocalSet(key: string, value: string): void {
    if (!isPayloadKey(key) && key !== META_KEY) return
    this.dirty.set(key, value)
    this.trackKey(key)
    this.scheduleFlush()
  }

  onLocalRemove(key: string): void {
    if (!isPayloadKey(key) && key !== META_KEY) return
    this.dirty.set(key, null)
    this.untrackKey(key)
    this.scheduleFlush()
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.doFlush()
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.dirty.clear()
    this.noticeListeners.clear()
  }

  // ─── hydrate path ───────────────────────────────────────────────────────

  /** Single attempt at hydrating from the SDK. Sets hydrateState and
   *  emits a notice on completion. Never throws. */
  private async runHydrateAttempt(local: LocalStorageAccessor, source: 'hydrate' | 'retry'): Promise<void> {
    const data = this.getData()
    if (!data) {
      // SDK isn't available at all — strategy degrades to local-only.
      // This is a deterministic answer ("no remote exists for this build"),
      // not a transient failure, so flag as success-empty rather than
      // failed-* to unblock flushes (which become no-ops since `data` is
      // null inside doFlush anyway).
      this.setState('success-empty', source === 'retry' ? 'sdk unavailable' : 'sdk unavailable, local-only')
      return
    }

    let manifestRaw: string | null
    try {
      manifestRaw = await data.getItem(KEYS_MANIFEST) ?? null
    } catch (e) {
      console.warn('[save/crazy] hydrate manifest failed', e)
      this.setState('failed-retrying', `manifest fetch failed: ${describeError(e)}`)
      return
    }

    const remoteKeys = parseManifest(manifestRaw)

    // Genuine "fresh remote": SDK responded successfully but had no manifest.
    // Don't treat this as failure — flush local writes through normally.
    if (manifestRaw === null && remoteKeys.length === 0) {
      this.setState('success-empty', 'remote has no save')
      // Local writes already queued (e.g. from the boot module-load reads
      // that wrote defaults) should flush as the seed save.
      this.scheduleFlush()
      return
    }

    // Pull every tracked key. Per-key failures are logged but don't fail
    // the whole attempt — partial data is better than wiping local.
    const remoteSnapshot = new Map<string, string>()
    let perKeyErrors = 0
    for (const key of remoteKeys) {
      try {
        const value = await data.getItem(key)
        if (value !== null && value !== undefined) {
          remoteSnapshot.set(key, String(value))
        }
      } catch (e) {
        perKeyErrors++
        console.warn(`[save/crazy] hydrate getItem("${key}") failed`, e)
      }
    }

    // If every per-key fetch failed we don't actually have remote data —
    // treat as failure to retry, never overwrite local with empty.
    if (remoteKeys.length > 0 && remoteSnapshot.size === 0 && perKeyErrors > 0) {
      this.setState('failed-retrying', 'all per-key fetches failed')
      return
    }

    // Stronger guard: if the manifest claims payload keys exist but the SDK
    // returned only META_KEY (per-key getItem yielded `null` for every
    // STAGE/COINS/SKINS/etc. key), refuse the merge. Without this, a
    // remote-wins decision based on META_KEY's progressScore would fire
    // the "+N bonus coins" banner but write NOTHING to local — the
    // player would see a phantom restore that doesn't actually update
    // their stage / coins / skins. Treat as failed-retrying so the
    // background retry ladder gets another shot at fetching real values,
    // and never grant a bonus we can't back up with real data.
    //
    // The CrazyGames SDK on the mobile app exhibits this pattern after
    // a force-close: `data.getItem(KEYS_MANIFEST)` returns the historic
    // manifest, but `data.getItem(STAGE_KEY)` etc. return null until the
    // SDK has resynced with cloud. Honoring those nulls would lie to the
    // player.
    if (remoteKeys.length > 0) {
      let payloadKeysReturned = 0
      for (const k of remoteSnapshot.keys()) {
        if (k !== META_KEY && isPayloadKey(k)) payloadKeysReturned++
      }
      if (payloadKeysReturned === 0) {
        this.setState('failed-retrying', 'manifest claims payload keys but SDK returned only META')
        return
      }
    }

    // Build remote meta either from the manifest's META_KEY value or by
    // computing it from the remote snapshot (legacy saves predating this
    // module won't have a meta blob).
    const remoteMeta: SaveMeta | null =
      parseMeta(remoteSnapshot.get(META_KEY) ?? null)
      ?? (remoteSnapshot.size > 0
        ? computeMeta({ get: (k) => remoteSnapshot.get(k) ?? null })
        : null)

    const localMeta: SaveMeta | null =
      parseMeta(local.get(META_KEY))
      ?? (anyPayloadKeyPresent(local) ? computeMeta({ get: (k) => local.get(k) }) : null)

    const resolution = decideMerge(localMeta, remoteMeta)
    let bonusCoinsAwarded = 0

    switch (resolution.kind) {
      case 'remote-only':
      case 'remote-wins': {
        // Apply remote payload over local.
        for (const [key, value] of remoteSnapshot) {
          if (key === META_KEY) continue
          local.set(key, value)
        }
        // Always re-add META_KEY (either remote's or freshly computed).
        if (remoteMeta) local.set(META_KEY, serializeMeta(remoteMeta))

        if (resolution.kind === 'remote-wins' && resolution.bonusCoins > 0) {
          // Anti-farm guard: if this client already received the bonus
          // for THIS exact remote `savedAt`, don't pay it again. Without
          // the guard, a player could force-close → reopen → trigger
          // remote-wins repeatedly, harvesting the bonus on every cycle.
          // The flag is recorded in `local`'s META blob and survives
          // force-close via the LocalBackupLayer + the cloud round-trip.
          const alreadyReceived =
            !!localMeta?.bonusReceivedFor &&
            !!remoteMeta?.savedAt &&
            localMeta.bonusReceivedFor === remoteMeta.savedAt
          if (!alreadyReceived) {
            const newCoins = applyBonusCoins({ get: (k) => local.get(k) }, resolution.bonusCoins)
            local.set(SAVE_KEYS.COINS, newCoins)
            bonusCoinsAwarded = resolution.bonusCoins
            // Mark dirty so the bonus syncs back to remote.
            this.dirty.set(SAVE_KEYS.COINS, newCoins)
            this.trackKey(SAVE_KEYS.COINS)
            // Refresh meta to reflect the augmented coin total AND
            // record that this remote `savedAt` has been bonus-paid.
            const newMeta = computeMeta({ get: (k) => local.get(k) })
            if (remoteMeta?.savedAt) {
              newMeta.bonusReceivedFor = remoteMeta.savedAt
            }
            local.set(META_KEY, serializeMeta(newMeta))
            this.dirty.set(META_KEY, serializeMeta(newMeta))
            this.trackKey(META_KEY)
          }
        }
        break
      }
      case 'local-wins': {
        // Local already authoritative — flush it back so remote catches up.
        for (const key of local.keys()) {
          if (!isPayloadKey(key) && key !== META_KEY) continue
          const v = local.get(key)
          if (v != null) {
            this.dirty.set(key, v)
            this.trackKey(key)
          }
        }
        break
      }
      case 'tie-keep-local':
      case 'local-only':
        // Nothing to do.
        break
    }

    // Successful hydrate — clear retry counter and unblock flushes.
    this.retryAttempt = 0
    const hasData = resolution.kind !== 'local-only'
      || anyPayloadKeyPresent(local)
    this.setState(hasData ? 'success-with-data' : 'success-empty', resolutionReason(resolution), bonusCoinsAwarded)

    // If the merge produced dirty entries, schedule a flush to push them.
    if (this.dirty.size > 0) this.scheduleFlush()
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return
    const delay = this.retryAttempt < HYDRATE_RETRY_DELAYS_MS.length
      ? HYDRATE_RETRY_DELAYS_MS[this.retryAttempt]!
      : HYDRATE_RETRY_LOOP_MS
    this.retryAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      const local = this.local
      if (!local) return
      void this.retryHydrate(local)
    }, delay)
  }

  private setState(state: HydrateState, reason: string, bonusCoinsAwarded = 0): void {
    this._hydrateState = state
    const notice: HydrateNotice = { state, reason }
    if (bonusCoinsAwarded > 0) notice.bonusCoinsAwarded = bonusCoinsAwarded
    for (const fn of this.noticeListeners) {
      try {
        fn(notice)
      } catch (e) {
        console.warn('[save/crazy] notice listener threw', e)
      }
    }
  }

  // ─── flush path ─────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    if (!this.canFlush()) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.doFlush()
    }, FLUSH_DELAY_MS)
  }

  /** Hard guard: NEVER push to remote unless we successfully observed
   *  what the remote contained. Otherwise we risk overwriting cloud data
   *  with fresh-defaults. */
  private canFlush(): boolean {
    return this._hydrateState === 'success-with-data'
      || this._hydrateState === 'success-empty'
  }

  private async doFlush(): Promise<void> {
    if (!this.canFlush()) return
    const data = this.getData()
    if (!data) return
    if (this.dirty.size === 0) return

    // Compute a fresh meta from the current local state and include it
    // in the batch so remote always sees a self-describing save.
    const local = this.local
    if (local) {
      const meta = computeMeta({ get: (k) => local.get(k) })
      const serialized = serializeMeta(meta)
      // Write meta to local without re-entering onLocalSet — accessor.set
      // bypasses the SaveManager's patch.
      local.set(META_KEY, serialized)
      this.dirty.set(META_KEY, serialized)
      this.trackKey(META_KEY)
    }

    const batch = this.dirty
    this.dirty = new Map()
    for (const [key, value] of batch) {
      try {
        if (value !== null) {
          await data.setItem(key, value)
        } else {
          await data.removeItem(key)
        }
      } catch (e) {
        console.warn(`[save/crazy] sdk.data sync ("${key}") failed`, e)
        // Re-queue the failed write so the next flush retries it.
        this.dirty.set(key, value)
      }
    }
    try {
      const manifest = this.readManifest()
      await data.setItem(KEYS_MANIFEST, JSON.stringify(manifest))
    } catch (e) {
      console.warn('[save/crazy] manifest sync failed', e)
    }
  }

  // ─── manifest helpers ───────────────────────────────────────────────────

  private readManifest(): string[] {
    if (!this.local) return []
    const raw = this.local.get(KEYS_MANIFEST)
    return parseManifest(raw)
  }

  private writeManifest(keys: string[]): void {
    this.local?.set(KEYS_MANIFEST, JSON.stringify(keys))
  }

  private trackKey(key: string): void {
    const keys = this.readManifest()
    if (!keys.includes(key)) {
      keys.push(key)
      this.writeManifest(keys)
    }
  }

  private untrackKey(key: string): void {
    const keys = this.readManifest()
    const next = keys.filter(k => k !== key)
    if (next.length !== keys.length) this.writeManifest(next)
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

const anyPayloadKeyPresent = (local: LocalStorageAccessor): boolean => {
  for (const key of local.keys()) {
    if (isPayloadKey(key) && key !== META_KEY) return true
  }
  return false
}

const describeError = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

const resolutionReason = (r: { kind: string }): string => {
  switch (r.kind) {
    case 'remote-only':
      return 'restored from cloud'
    case 'remote-wins':
      return 'cloud was ahead — restored'
    case 'local-wins':
      return 'local ahead of cloud — pushing'
    case 'tie-keep-local':
      return 'cloud matches local'
    case 'local-only':
      return 'cloud has no save'
    default:
      return r.kind
  }
}
