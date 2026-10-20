/**
 * ─── Tiny JSON-over-localStorage accessor ───────────────────────────────────
 *
 * The leaderboard modules were written against a game with one central save
 * blob (`getState` / `setState`). Tree Smashers does not have one — every
 * composable owns its own `localStorage` key of plain text (see `src/keys.ts`)
 * — so this is the adapter, and it is deliberately the whole adapter: two
 * functions, no store, no reactivity.
 *
 * Writes go through `localStorage.setItem`, which `SaveManager` patches on the
 * cloud-save builds. That is what makes a `smashers_`-prefixed key here reach
 * the platform's cloud store without this module knowing anything about it —
 * and equally why a key that must NOT sync has to be named outside the payload
 * prefixes (see `SaveMergePolicy.PAYLOAD_PREFIXES`).
 *
 * Never throws. Private mode, a full quota and a corrupt entry all resolve to
 * the fallback, because every caller is on a path that must not be able to
 * break a run.
 */

export const getState = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    // Values written by this module are JSON. A value written by an older
    // build (or by hand in devtools) may be a bare string, and `JSON.parse`
    // would throw on it — treat that as the string it is rather than losing it.
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  } catch {
    return fallback
  }
}

export const setState = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* private mode or quota — the feature degrades, the game does not */
  }
}

/**
 * Push pending writes to the platform's cloud store now, without waiting for
 * the save layer's debounce.
 *
 * `usePlayerIdentity` needs this the moment it mints an id: the debounce is
 * ~200 ms, and a reload inside that window would mint a SECOND identity, which
 * is the one failure here that cannot be repaired afterwards (the player ends
 * up with two rows and no way to merge them).
 */
export const flushSaveNow = async (): Promise<void> => {
  try {
    const sm = (window as unknown as { __saveManager?: { flush?: () => Promise<void> } }).__saveManager
    await sm?.flush?.()
  } catch { /* no manager on a local-only build, or the strategy refused */
  }
}
