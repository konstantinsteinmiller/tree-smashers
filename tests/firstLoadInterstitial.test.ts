// ─── First-load interstitial (GameMonetize moderation requirement) ──────────
//
// "Ads should be shown the first time after the game loads."
//
// The bug this pins is a RACE, and it is one a naive test cannot see: the game
// has no menu and boots straight into the arena, while the ad SDK is a
// cross-origin script that reports ready a second or more later. A placement
// that checks readiness once at boot finds it false in every real session and
// never fires — yet passes any test that hands it a ready SDK. So the cases
// that matter here are the ones where readiness arrives LATE.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const isInterstitialReady = ref(false)
const isForcedDarkBlocking = ref(false)
const showMidgameAd = vi.fn(() => Promise.resolve())
const resetAdCounter = vi.fn()
const markFirstMidgameAdShown = vi.fn()

vi.mock('@/use/useAds', () => ({ isInterstitialReady, showMidgameAd }))
vi.mock('@/use/useForcedDarkModeGuard', () => ({ isForcedDarkBlocking }))
vi.mock('@/use/midgameCadence', () => ({ resetAdCounter, markFirstMidgameAdShown }))

// Imported lazily: the mock factories above close over the refs declared in
// this file, which a hoisted static import would reach before they exist.
type Mod = typeof import('@/use/useFirstLoadInterstitial')
let armFirstLoadInterstitial: Mod['armFirstLoadInterstitial']
let resetFirstLoadInterstitialForTests: Mod['resetFirstLoadInterstitialForTests']

describe('first-load interstitial', () => {
  beforeAll(async () => {
    ({ armFirstLoadInterstitial, resetFirstLoadInterstitialForTests } = await import('@/use/useFirstLoadInterstitial'))
  })

  beforeEach(() => {
    resetFirstLoadInterstitialForTests()
    isInterstitialReady.value = false
    isForcedDarkBlocking.value = false
    showMidgameAd.mockClear()
    resetAdCounter.mockClear()
    markFirstMidgameAdShown.mockClear()
  })

  it('fires when the SDK becomes ready AFTER the splash is already gone (the production order)', async () => {
    const splashGone = ref(false)
    armFirstLoadInterstitial(splashGone)

    splashGone.value = true
    await nextTick()
    // The one moment a boot-time check would have looked: not ready, no ad.
    expect(showMidgameAd).not.toHaveBeenCalled()

    isInterstitialReady.value = true
    await nextTick()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('fires when the splash clears after the SDK is ready', async () => {
    const splashGone = ref(false)
    isInterstitialReady.value = true
    armFirstLoadInterstitial(splashGone)
    await nextTick()
    // Never under the loading screen.
    expect(showMidgameAd).not.toHaveBeenCalled()

    splashGone.value = true
    await nextTick()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('fires immediately when both already hold at arming time', () => {
    isInterstitialReady.value = true
    armFirstLoadInterstitial(ref(true))
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('fires exactly once per page load, whatever readiness does afterwards', async () => {
    const splashGone = ref(true)
    isInterstitialReady.value = true
    armFirstLoadInterstitial(splashGone)
    expect(showMidgameAd).toHaveBeenCalledTimes(1)

    isInterstitialReady.value = false
    await nextTick()
    isInterstitialReady.value = true
    await nextTick()
    armFirstLoadInterstitial(splashGone)
    await nextTick()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('stays ARMED under the forced-dark-mode notice instead of being spent', async () => {
    isForcedDarkBlocking.value = true
    isInterstitialReady.value = true
    armFirstLoadInterstitial(ref(true))
    await nextTick()
    expect(showMidgameAd).not.toHaveBeenCalled()
    expect(resetAdCounter).not.toHaveBeenCalled()

    isForcedDarkBlocking.value = false
    await nextTick()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('restarts the between-battles cadence, so no second interstitial follows a battle later', () => {
    isInterstitialReady.value = true
    armFirstLoadInterstitial(ref(true))
    expect(resetAdCounter).toHaveBeenCalledTimes(1)
    expect(markFirstMidgameAdShown).toHaveBeenCalledTimes(1)
  })

  it('a rejected ad call is swallowed (the game must keep booting)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
    })
    showMidgameAd.mockImplementationOnce(() => Promise.reject(new Error('sdk exploded')))
    isInterstitialReady.value = true
    armFirstLoadInterstitial(ref(true))
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// The arm itself lives in a build-flag-gated branch of App.vue, which no unit
// test can import with the flag on (the alias/DCE happens at build time). Pin
// the source instead, so a refactor cannot quietly drop the placement.
describe('first-load interstitial — the GameMonetize build arms it', () => {
  const app = readFileSync(path.resolve(__dirname, '../src/App.vue'), 'utf8')

  it('App.vue arms it inside the GameMonetize block, on the splash-resolved edge', () => {
    const block = app.match(/if \(isGameMonetize\) \{[\s\S]*?\n\}/)
    expect(block, 'no `if (isGameMonetize) { … }` block in App.vue').not.toBeNull()
    expect(block![0]).toContain('armFirstLoadInterstitial(areAllAssetsLoaded)')
  })

  it('nothing else arms it (two armed paths would fire two ads back to back)', () => {
    expect(app.match(/armFirstLoadInterstitial\(/g)!.length).toBe(1)
  })
})
