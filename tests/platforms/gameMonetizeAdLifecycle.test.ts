// ─── GameMonetize ad lifecycle ──────────────────────────────────────────────
//
// The GameMonetize SDK differs from every other provider here in ways that
// each silently break an integration written against a promise-returning SDK:
//
//   1. `sdk.showBanner()` returns VOID. The end of an ad is the
//      `SDK_GAME_START` event, so every show is resolved from events.
//   2. A show call with no `SDK_GAME_PAUSE` after it is a NO-FILL. Without a
//      short-circuit the game would sit parked behind an ad that never opens.
//   3. There is no rewarded format. A reward is granted only when the IMA
//      terminal event `ALL_ADS_COMPLETED` fired before the resume.
//   4. The "an ad is on screen" edge (`isGmAdShowing`, which `App.vue` turns
//      into a paused loop + paused music) must rise ONLY for a real ad and
//      must always fall again — including when the resume event never comes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Plugin = typeof import('@/utils/gameMonetizePlugin')

const fire = (name: string, extra: Record<string, unknown> = {}): void => {
  window.SDK_OPTIONS.onEvent({ name, ...extra })
}

/** Boot the plugin against a stub SDK that only has `showBanner`, like the live one. */
const boot = async (): Promise<{ plugin: Plugin; showBanner: ReturnType<typeof vi.fn> }> => {
  vi.resetModules()
  const plugin = await import('@/utils/gameMonetizePlugin')
  const ready = plugin.gameMonetizePlugin()
  // Let the async init body reach the point where SDK_OPTIONS + listeners exist.
  await vi.waitFor(() => expect(window.SDK_OPTIONS).toBeDefined())
  const showBanner = vi.fn()
  window.sdk = { showBanner }
  await vi.waitFor(() => expect(document.getElementById('gamemonetize-sdk')).not.toBeNull())
  fire('SDK_READY')
  await ready
  return { plugin, showBanner }
}

describe('gamemonetize ad lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_GAME_MONETIZE', 'true')
    vi.stubEnv('VITE_GAME_ID', 'test-game-id')
    // The ad-block probe must not touch the network; "reachable" = no blocker.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({})))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    document.getElementById('gamemonetize-sdk')?.remove()
    delete window.SDK_OPTIONS
    delete window.sdk
  })

  it('does nothing at all on a build without the GameMonetize flag', async () => {
    vi.stubEnv('VITE_APP_GAME_MONETIZE', '')
    vi.resetModules()
    const plugin = await import('@/utils/gameMonetizePlugin')
    await plugin.gameMonetizePlugin()
    expect(window.SDK_OPTIONS).toBeUndefined()
    expect(document.getElementById('gamemonetize-sdk')).toBeNull()
    expect(plugin.isGmSdkActive.value).toBe(false)
    expect(await plugin.showRewardedAdGM()).toBe(false)
  })

  it('sets SDK_OPTIONS before injecting the script, with the game id and no child-directed flag', async () => {
    const { plugin } = await boot()
    expect(plugin.isGmSdkActive.value).toBe(true)
    expect(window.SDK_OPTIONS.gameId).toBe('test-game-id')
    // Child-directed treatment is a Tauri-only concern.
    expect(Object.keys(window.SDK_OPTIONS).sort()).toEqual(['gameId', 'onEvent'])
    const tag = document.getElementById('gamemonetize-sdk') as HTMLScriptElement
    expect(tag.src).toBe('https://api.gamemonetize.com/sdk.js')
  })

  it('is idempotent: a second init neither injects a second script nor replaces the options', async () => {
    const { plugin } = await boot()
    const options = window.SDK_OPTIONS
    await plugin.gameMonetizePlugin()
    expect(window.SDK_OPTIONS).toBe(options)
    expect(document.querySelectorAll('script[src*="gamemonetize"]').length).toBe(1)
  })

  it('interstitial: raises the ad edge on SDK_GAME_PAUSE and resolves on SDK_GAME_START', async () => {
    const { plugin, showBanner } = await boot()
    let done = false
    const shown = plugin.showMidgameAdGM().then(() => {
      done = true
    })
    expect(showBanner).toHaveBeenCalledTimes(1)
    expect(plugin.isGmAdShowing.value).toBe(false)

    fire('SDK_GAME_PAUSE')
    expect(plugin.isGmAdShowing.value).toBe(true)
    await Promise.resolve()
    expect(done).toBe(false)

    fire('SDK_GAME_START')
    await shown
    expect(done).toBe(true)
    expect(plugin.isGmAdShowing.value).toBe(false)
  })

  it('no-fill: resolves by itself after ~3 s and never raises the ad edge', async () => {
    const { plugin } = await boot()
    vi.useFakeTimers()
    const edges: boolean[] = []
    const stop = (await import('vue')).watch(plugin.isGmAdShowing, (v) => edges.push(v), { flush: 'sync' })
    let done = false
    void plugin.showMidgameAdGM().then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(2_900)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(done).toBe(true)
    expect(edges).toEqual([])
    stop()
  })

  it('an ad that opened is NOT cut off by the no-fill timer', async () => {
    const { plugin } = await boot()
    vi.useFakeTimers()
    let done = false
    void plugin.showMidgameAdGM().then(() => {
      done = true
    })
    fire('SDK_GAME_PAUSE')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(done).toBe(false)
    expect(plugin.isGmAdShowing.value).toBe(true)
    fire('SDK_GAME_START')
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
  })

  it('an ad whose resume event never arrives is capped, and the game is released', async () => {
    const { plugin } = await boot()
    vi.useFakeTimers()
    let done = false
    void plugin.showMidgameAdGM().then(() => {
      done = true
    })
    fire('SDK_GAME_PAUSE')
    await vi.advanceTimersByTimeAsync(44_000)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(done).toBe(true)
    // Without this the pause gate would stay closed for the rest of the session.
    expect(plugin.isGmAdShowing.value).toBe(false)
  })

  it('rewarded: grants only when ALL_ADS_COMPLETED fired before the resume', async () => {
    const { plugin } = await boot()
    const watched = plugin.showRewardedAdGM()
    fire('SDK_GAME_PAUSE')
    fire('ALL_ADS_COMPLETED')
    fire('SDK_GAME_START')
    expect(await watched).toBe(true)
  })

  it('rewarded: a resume with no completion (skip / error) grants nothing', async () => {
    const { plugin } = await boot()
    const skipped = plugin.showRewardedAdGM()
    fire('SDK_GAME_PAUSE')
    fire('SDK_GAME_START')
    expect(await skipped).toBe(false)
  })

  it('rewarded: a no-fill grants nothing', async () => {
    const { plugin } = await boot()
    vi.useFakeTimers()
    const unfilled = plugin.showRewardedAdGM()
    await vi.advanceTimersByTimeAsync(3_100)
    expect(await unfilled).toBe(false)
  })

  it('a completion from an EARLIER ad cannot grant the next rewarded ad', async () => {
    const { plugin } = await boot()
    const first = plugin.showMidgameAdGM()
    fire('SDK_GAME_PAUSE')
    fire('ALL_ADS_COMPLETED')
    fire('SDK_GAME_START')
    await first

    const second = plugin.showRewardedAdGM()
    fire('SDK_GAME_PAUSE')
    fire('SDK_GAME_START')
    expect(await second).toBe(false)
  })

  it('flags an ad-blocker from the IMA-layer error, which SDK_ERROR alone never names', async () => {
    const { plugin } = await boot()
    expect(plugin.isGmAdsBlocked.value).toBe(false)
    fire('SDK_ERROR', { message: 'The SDK failed.' })
    expect(plugin.isGmAdsBlocked.value).toBe(false)
    fire('AD_SDK_ERROR', { message: 'IMA script failed to load! Probably due to an ADBLOCKER!' })
    expect(plugin.isGmAdsBlocked.value).toBe(true)
  })

  it('flags an ad-blocker when every ad-tech probe is refused (Brave Shields)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const { plugin } = await boot()
    await vi.waitFor(() => expect(plugin.isGmAdsBlocked.value).toBe(true))
  })

  it('settles init on a script load failure and reports ads as blocked', async () => {
    vi.resetModules()
    const plugin = await import('@/utils/gameMonetizePlugin')
    const ready = plugin.gameMonetizePlugin()
    await vi.waitFor(() => expect(document.getElementById('gamemonetize-sdk')).not.toBeNull())
    document.getElementById('gamemonetize-sdk')!.dispatchEvent(new Event('error'))
    await ready
    expect(plugin.isGmSdkActive.value).toBe(false)
    expect(plugin.isGmAdsBlocked.value).toBe(true)
    // Ad calls are inert rather than hanging.
    expect(await plugin.showRewardedAdGM()).toBe(false)
    await plugin.showMidgameAdGM()
  })
})
