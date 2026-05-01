import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrazyGamesStrategy } from '@/utils/save/CrazyGamesStrategy'
import { SaveManager } from '@/utils/save/SaveManager'
import { SAVE_KEYS, META_KEY } from '@/utils/save/SaveMergePolicy'

// Fake CrazyGames `data` module — keeps an in-memory map so we can assert
// on what got mirrored. The real SDK API is a subset we can fully cover
// here (`getItem` / `setItem` / `removeItem`).
const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    })
  }
}

const MANIFEST_KEY = '__save_internal__crazy_keys'

const initWithFakeTimers = async (manager: SaveManager) => {
  const p = manager.init()
  await vi.runAllTimersAsync()
  await p
}

describe('CrazyGamesStrategy (per-key)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('hydrates localStorage from the SDK manifest at boot', async () => {
    const data = makeFakeData({
      [MANIFEST_KEY]: JSON.stringify([SAVE_KEYS.COINS, SAVE_KEYS.STAGE]),
      [SAVE_KEYS.COINS]: '150',
      [SAVE_KEYS.STAGE]: '3'
    })
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('150')
    expect(window.localStorage.getItem(SAVE_KEYS.STAGE)).toBe('3')
  })

  it('mirrors subsequent writes to the SDK after a debounce, sorted', async () => {
    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    window.localStorage.setItem(SAVE_KEYS.STAGE, '2')
    window.localStorage.setItem(SAVE_KEYS.COINS, '20')

    expect(data.setItem).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    // Per-key writes plus the manifest. Verify both gameplay values landed.
    const writes = data.setItem.mock.calls.filter(c => c[0] !== MANIFEST_KEY)
    expect(writes).toContainEqual([SAVE_KEYS.COINS, '20'])
    expect(writes).toContainEqual([SAVE_KEYS.STAGE, '2'])

    // Wire ordering is sorted alphabetically.
    const orderedKeys = writes.map(c => c[0])
    expect(orderedKeys).toEqual([...orderedKeys].sort())

    // Manifest carries the full sorted key list.
    const manifest = JSON.parse(data.store.get(MANIFEST_KEY)!)
    expect(manifest).toContain(SAVE_KEYS.COINS)
    expect(manifest).toContain(SAVE_KEYS.STAGE)
  })

  it('does NOT mirror non-allowlisted keys (vConsole / ad-tech / dev flags)', async () => {
    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    window.localStorage.setItem(SAVE_KEYS.COINS, '99')
    window.localStorage.setItem('vConsole_switch_x', '0')
    window.localStorage.setItem('prebid11_exp_1_26', 'false')
    window.localStorage.setItem('li-module-enabled', 'true')

    await vi.runAllTimersAsync()

    const writes = data.setItem.mock.calls.map(c => c[0])
    expect(writes).toContain(SAVE_KEYS.COINS)
    expect(writes).not.toContain('vConsole_switch_x')
    expect(writes).not.toContain('prebid11_exp_1_26')
    expect(writes).not.toContain('li-module-enabled')
  })

  it('mirrors removeItem to the SDK and drops the key from the manifest', async () => {
    const data = makeFakeData({
      [MANIFEST_KEY]: JSON.stringify([SAVE_KEYS.COINS]),
      [SAVE_KEYS.COINS]: '5'
    })
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    window.localStorage.removeItem(SAVE_KEYS.COINS)
    await vi.runAllTimersAsync()

    expect(data.removeItem).toHaveBeenCalledWith(SAVE_KEYS.COINS)
    expect(JSON.parse(data.store.get(MANIFEST_KEY)!)).not.toContain(SAVE_KEYS.COINS)
  })

  it('no-ops gracefully when the SDK is unavailable', async () => {
    const manager = new SaveManager(new CrazyGamesStrategy(() => null))
    await initWithFakeTimers(manager)

    expect(() => window.localStorage.setItem(SAVE_KEYS.COINS, '1')).not.toThrow()
    await vi.runAllTimersAsync()
    expect(window.localStorage.getItem(SAVE_KEYS.COINS)).toBe('1')
  })

  it('flush() pushes pending writes synchronously on demand', async () => {
    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    window.localStorage.setItem(SAVE_KEYS.COINS, '1')
    expect(data.setItem).not.toHaveBeenCalled()

    await manager.flush()

    expect(data.setItem).toHaveBeenCalledWith(SAVE_KEYS.COINS, '1')
  })

  it('does not mirror hydration writes back to the SDK', async () => {
    const data = makeFakeData({
      [MANIFEST_KEY]: JSON.stringify([SAVE_KEYS.COINS]),
      [SAVE_KEYS.COINS]: '150'
    })
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    expect(data.setItem).not.toHaveBeenCalled()
  })

  it('META blob rides along with each flush so the next hydrate can merge', async () => {
    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    window.localStorage.setItem(SAVE_KEYS.STAGE, '4')
    await vi.runAllTimersAsync()

    expect(data.store.get(META_KEY)).toBeTruthy()
    const meta = JSON.parse(data.store.get(META_KEY)!)
    expect(meta.savedAt).toBeTruthy()
    expect(meta.maxStage).toBe(4)
  })

  // ─── Settings-stranding regression ──────────────────────────────────────
  // Background: useUser.ts holds language / difficulty / sound-volume /
  // music-volume in module-level Vue refs. The composable only writes a
  // value to localStorage when the player explicitly opens OptionsModal
  // and changes it via setSettingValue(). A player who never touches
  // settings produces zero localStorage writes for those keys, so the
  // strategy's onLocalSet path never fires and the cloud ends up without
  // them. To round-trip correctly the strategy MUST sweep local payload
  // keys after the merge resolution and queue any value missing from
  // sdk.data.

  it('pushes settings keys present in local but missing from sdk.data', async () => {
    // Simulates useUser.ts having seeded its current ref values into
    // localStorage just before the strategy runs (the `useUser` side
    // of the fix). Cloud is empty.
    window.localStorage.setItem('spinner_user_sound_volume', '0.7')
    window.localStorage.setItem('spinner_user_music_volume', '0.6')
    window.localStorage.setItem('spinner_user_language', 'en')
    window.localStorage.setItem('spinner_user_difficulty', 'medium')

    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    // Every settings key reaches sdk.data after init resolves.
    expect(data.setItem).toHaveBeenCalledWith('spinner_user_sound_volume', '0.7')
    expect(data.setItem).toHaveBeenCalledWith('spinner_user_music_volume', '0.6')
    expect(data.setItem).toHaveBeenCalledWith('spinner_user_language', 'en')
    expect(data.setItem).toHaveBeenCalledWith('spinner_user_difficulty', 'medium')

    // Manifest carries every settings key — next refresh's hydrate
    // fast-path will read them back without needing recovery.
    const manifest = JSON.parse(data.store.get(MANIFEST_KEY)!)
    expect(manifest).toContain('spinner_user_sound_volume')
    expect(manifest).toContain('spinner_user_music_volume')
    expect(manifest).toContain('spinner_user_language')
    expect(manifest).toContain('spinner_user_difficulty')
  })

  it('does NOT re-push settings keys that already match sdk.data', async () => {
    // Player previously synced — both sides agree on every key. The
    // post-hydrate sweep should dedupe via lastSentByKey and skip a
    // redundant flush so QA doesn't see spurious writes on every load.
    window.localStorage.setItem('spinner_user_language', 'es')

    const data = makeFakeData({
      [MANIFEST_KEY]: JSON.stringify(['spinner_user_language']),
      'spinner_user_language': 'es'
    })
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    expect(data.setItem).not.toHaveBeenCalled()
  })

  it('on a fresh-remote hydrate, seeds sdk.data with every local payload key', async () => {
    // Cloud is fresh (no manifest). Local has full gameplay state from
    // the last session AND user settings. Every local payload key must
    // reach sdk.data so the player's first cloud save is complete.
    window.localStorage.setItem(SAVE_KEYS.STAGE, '5')
    window.localStorage.setItem(SAVE_KEYS.COINS, '300')
    window.localStorage.setItem('spinner_user_language', 'fr')

    const data = makeFakeData()
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    await initWithFakeTimers(manager)

    expect(data.setItem).toHaveBeenCalledWith(SAVE_KEYS.STAGE, '5')
    expect(data.setItem).toHaveBeenCalledWith(SAVE_KEYS.COINS, '300')
    expect(data.setItem).toHaveBeenCalledWith('spinner_user_language', 'fr')
  })
})
