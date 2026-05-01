// ─── BlobStorage ───────────────────────────────────────────────────────────
//
// In-memory mirror of the gameplay-state subset of localStorage. Holds
// only allowlisted keys (`spinner_*`, `ca_*`, plus the META_KEY blob)
// so the strategy has a single, sortable source of truth to flush to
// the cloud — no chaos_state aggregation, no IDB backup, no persistence
// modes. Each gameplay write also lands in raw localStorage as its own
// per-key entry so module-load reads after a page reload still hit a
// real value before the strategy's hydrate completes.
//
// Bypass routing (developer toggles, internal save metadata, SDK scratch
// keys) flows straight to raw localStorage. Those keys never enter the
// in-memory map and are never enumerated by `keys()`.

import { isOwnInternalKey, isSdkScratchKey } from './types'
import { isPayloadKey } from './SaveMergePolicy'

/** Developer / debug toggles — touched by hand from DevTools, kept as
 *  their own raw localStorage entries. */
const DEV_BYPASS_KEYS: ReadonlySet<string> = new Set([
  'fps',
  'debug',
  'cheat',
  'campaign-test',
  'full_unlocked'
])

const isDevBypassKey = (key: string): boolean => DEV_BYPASS_KEYS.has(key)

/**
 * BlobStorage keeps allowlisted gameplay keys in an in-memory map, while
 * mirroring them per-key into the underlying Storage so the existing
 * synchronous `localStorage.getItem` reads continue to work across page
 * reloads. Non-gameplay keys (dev toggles, SDK scratch, internal save
 * bookkeeping) bypass the map entirely.
 *
 * Usage:
 *   const blob = new BlobStorage(window.localStorage)
 *   blob.set('spinner_coins', '100')   // → memory map AND raw localStorage
 *   blob.set('fps', 'true')            // → raw localStorage only
 *   blob.get('spinner_coins')          // → reads from memory map
 *   blob.keys()                        // → sorted gameplay keys only
 */
export class BlobStorage {
  private state: Map<string, string> = new Map()

  // Captured up-front so once SaveManager monkey-patches `setItem` /
  // `getItem` / `removeItem` on the same Storage instance, BlobStorage
  // keeps writing through the ORIGINAL implementations and never
  // recurses into the patched ones.
  private readonly rawGet: (key: string) => string | null
  private readonly rawSet: (key: string, value: string) => void
  private readonly rawRemove: (key: string) => void
  private readonly rawKey: (i: number) => string | null
  private readonly rawLength: () => number

  constructor(private readonly raw: Storage) {
    this.rawGet = raw.getItem.bind(raw)
    this.rawSet = raw.setItem.bind(raw)
    this.rawRemove = raw.removeItem.bind(raw)
    this.rawKey = raw.key.bind(raw)
    this.rawLength = () => raw.length
    this.seedFromRaw()
  }

  /** Pre-populate the in-memory map from any allowlisted gameplay keys
   *  already present in raw localStorage at construction time. Lets the
   *  strategy's hydrate read pre-existing values via `local.get(...)`
   *  before the cloud round-trip completes. */
  private seedFromRaw(): void {
    for (let i = 0; i < this.rawLength(); i++) {
      const k = this.rawKey(i)
      if (k == null) continue
      if (!isPayloadKey(k)) continue
      const v = this.rawGet(k)
      if (v != null) this.state.set(k, v)
    }
  }

  // ─── API ──────────────────────────────────────────────────────────────────

  /** Read a key. Allowlisted gameplay keys come from the in-memory map
   *  (with raw localStorage as fallback for the brief window before the
   *  map is seeded); everything else passes straight through to raw
   *  localStorage. */
  get(key: string): string | null {
    if (isDevBypassKey(key) || isSdkScratchKey(key) || isOwnInternalKey(key)) {
      return this.rawGet(key)
    }
    if (isPayloadKey(key)) {
      const v = this.state.get(key)
      if (v !== undefined) return v
      // Fallback: a key we haven't seen yet but raw localStorage has
      // (e.g. legacy entry written by a prior version). Promote into the
      // map so subsequent reads are O(1).
      const raw = this.rawGet(key)
      if (raw != null) this.state.set(key, raw)
      return raw
    }
    // Non-gameplay, non-bypass — just pass through. Anything we don't
    // explicitly classify lands in raw and stays out of our state.
    return this.rawGet(key)
  }

  /** Write a key. Returns `true` when the value actually changed,
   *  `false` for no-op writes. SaveManager uses the boolean to skip
   *  forwarding unchanged writes to the strategy. */
  set(key: string, value: string): boolean {
    if (isDevBypassKey(key) || isSdkScratchKey(key) || isOwnInternalKey(key)) {
      const prev = this.rawGet(key)
      if (prev === value) return false
      this.rawSet(key, value)
      return true
    }
    if (isPayloadKey(key)) {
      if (this.state.get(key) === value) return false
      this.state.set(key, value)
      // Mirror per-key into raw localStorage so a hard page reload
      // before the strategy hydrates still surfaces the previous
      // session's value to module-load reads.
      this.rawSet(key, value)
      return true
    }
    // Non-classified key — pass through.
    const prev = this.rawGet(key)
    if (prev === value) return false
    this.rawSet(key, value)
    return true
  }

  /** Remove a key. Returns `true` when something was actually removed. */
  remove(key: string): boolean {
    if (isDevBypassKey(key) || isSdkScratchKey(key) || isOwnInternalKey(key)) {
      const had = this.rawGet(key) !== null
      this.rawRemove(key)
      return had
    }
    if (isPayloadKey(key)) {
      const had = this.state.has(key)
      this.state.delete(key)
      this.rawRemove(key)
      return had
    }
    const had = this.rawGet(key) !== null
    this.rawRemove(key)
    return had
  }

  /** All allowlisted gameplay keys currently held, sorted
   *  alphabetically — Glitch's checksum requires sorted keys, and CG
   *  benefits from a deterministic order too. */
  keys(): string[] {
    return [...this.state.keys()].sort()
  }

  /** Drop every allowlisted gameplay key. Bypass keys (dev toggles, SDK
   *  scratch) are untouched so DevTools-set flags survive a `clear()`. */
  clear(): void {
    if (this.state.size === 0) return
    const keys = [...this.state.keys()]
    this.state.clear()
    for (const k of keys) this.rawRemove(k)
  }
}
