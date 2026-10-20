// ─── GameMonetize.com plugin ────────────────────────────────────────────────
//
// Owns everything the game says to GameMonetize. GameMonetize is purely an ad
// SDK: no cloud save, no locale, no loading / game-ready lifecycle, no site
// lock (it is a distribution network embedded across many partner domains).
//
// On every NON-GameMonetize build `resolve.alias` in `vite.config.ts` swaps
// this module for `gameMonetizePlugin.stub.ts`, exactly as it does for Poki:
// `GameMonetizeProvider` and `App.vue` import it statically, and an env-literal
// `if` cannot keep the SDK URL below out of an obfuscated bundle.
//
// The SDK is a rebrand of the older `gdsdk` (same `SDK_*` event names) with
// three differences this module is built around:
//
//   1. Init is `window.SDK_OPTIONS` + a global `window.sdk`. The options object
//      MUST exist before the script executes, so this module injects the script
//      itself — there is deliberately no tag in index.html.
//   2. `sdk.showBanner()` is the only show method in the live SDK and it
//      returns VOID. An ad's end is observed through the `SDK_GAME_START` event
//      ("advertisement done, resume the game"), never a returned promise, and a
//      show call that is not followed by `SDK_GAME_PAUSE` within a few seconds
//      is a no-fill.
//   3. There is no rewarded format and no rewarded-complete event. A "rewarded"
//      ad is the same interstitial; it counts as watched when the IMA terminal
//      event `ALL_ADS_COMPLETED` fired before the resume.
//
// What it publishes:
//   • `isGmSdkActive`   — SDK loaded and reported ready (the AdProvider gate).
//   • `isGmAdShowing`   — true between `SDK_GAME_PAUSE` and `SDK_GAME_START`.
//                         `App.vue` is the single owner that turns it into
//                         `setGamePaused()` + music pause/resume, as for Poki.
//   • `isGmAdsBlocked`  — a browser ad-blocker is in the way (AdsBlockedModal).
//
// No child-directed flag is passed in `SDK_OPTIONS`: child-directed treatment
// is a Tauri (app-store) build concern only.
//
// SDK reference: https://github.com/MonetizeGame/GameMonetize.com-SDK

import { ref } from 'vue'

const SDK_SRC = 'https://api.gamemonetize.com/sdk.js'
const SDK_SCRIPT_ID = 'gamemonetize-sdk'
const SDK_READY_TIMEOUT_MS = 10_000
// No `SDK_GAME_PAUSE` this soon after a show call means no ad is coming:
// resolve instead of leaving the game parked behind an ad that does not exist.
const NO_FILL_MS = 3_000
// Ceilings for an ad that opened but whose resume event never arrived (an
// ad-blocker killing the creative mid-flight). No honest ad reaches them.
const REWARDED_HARD_TIMEOUT_MS = 60_000
const INTERSTITIAL_HARD_TIMEOUT_MS = 45_000

const EVT_SDK_READY = 'SDK_READY'
const EVT_SDK_ERROR = 'SDK_ERROR'
// A blocked Google IMA loader is reported through these IMA-layer events
// ("IMA script failed to load! Probably due to an ADBLOCKER!"), NOT through
// SDK_ERROR, whose message is only "The SDK failed.".
const EVT_AD_SDK_ERROR = 'AD_SDK_ERROR'
const EVT_AD_ERROR = 'AD_ERROR'
const EVT_GAME_PAUSE = 'SDK_GAME_PAUSE'
const EVT_GAME_START = 'SDK_GAME_START'
// Never emitted by the live SDK; listened to only in case a later build adds it.
const EVT_REWARDED_COMPLETE = 'SDK_REWARDED_WATCH_COMPLETE'
const EVT_ALL_ADS_COMPLETED = 'ALL_ADS_COMPLETED'

declare global {
  interface Window {
    SDK_OPTIONS?: any
    // `sdk` is the documented global; `gamemonetize` is an alias some SDK
    // builds expose.
    sdk?: any
    gamemonetize?: any
  }
}

/** True once the SDK has loaded and reported ready. */
export const isGmSdkActive = ref(false)
/** True while an ad is on screen (SDK_GAME_PAUSE … SDK_GAME_START). */
export const isGmAdShowing = ref(false)
/** True once a browser ad-blocker was observed. Latches for the session. */
export const isGmAdsBlocked = ref(false)

let initPromise: Promise<void> | null = null

const getSdk = (): any => {
  if (typeof window === 'undefined') return null
  return window.sdk ?? window.gamemonetize ?? null
}

// ─── Event bus ──────────────────────────────────────────────────────────────
//
// The SDK takes ONE `onEvent` callback. It is fanned out to listeners per
// event name so the pause bridge, each pending show and the ad-block detection
// can subscribe independently.

type SdkListener = (event: any) => void
const listeners = new Map<string, Set<SdkListener>>()

const onSdkEvent = (eventName: string, listener: SdkListener): (() => void) => {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set())
  listeners.get(eventName)!.add(listener)
  return () => listeners.get(eventName)?.delete(listener)
}

const dispatchSdkEvent = (eventName: string, payload: any): void => {
  const set = listeners.get(eventName)
  if (!set) return
  for (const cb of [...set]) {
    try {
      cb(payload)
    } catch (e) {
      console.warn(`[gamemonetize] listener for ${eventName} threw`, e)
    }
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────

/**
 * Initialise GameMonetize. Idempotent — every caller gets the same promise
 * (`main.ts` starts it in parallel with boot, the AdProvider's `init()` joins
 * it). Resolves on `SDK_READY`, on an init-time `SDK_ERROR`, or after a 10 s
 * timeout; it never rejects, so a blocked SDK cannot stall anything.
 */
export const gameMonetizePlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') return
    if (import.meta.env.VITE_APP_GAME_MONETIZE !== 'true') return

    const gameId = import.meta.env.VITE_GAME_ID
    if (!gameId) {
      console.warn('[gamemonetize] VITE_GAME_ID is missing — SDK disabled')
      return
    }

    // Must be on `window` before the SDK script runs: it reads it synchronously.
    window.SDK_OPTIONS = {
      gameId,
      onEvent: (event: any) => {
        if (event && typeof event.name === 'string') dispatchSdkEvent(event.name, event)
      }
    }

    // Page-lifetime ad bracket. Plain assignments, so unbalanced or repeated
    // SDK callbacks cannot latch the game paused.
    onSdkEvent(EVT_GAME_PAUSE, () => {
      isGmAdShowing.value = true
    })
    onSdkEvent(EVT_GAME_START, () => {
      isGmAdShowing.value = false
    })

    // Ad-blocker detection, part 1: blockers that stop the IMA loader make the
    // SDK say so.
    for (const evt of [EVT_AD_SDK_ERROR, EVT_AD_ERROR, EVT_SDK_ERROR]) {
      onSdkEvent(evt, (event) => {
        if (isAdBlockerError(describeEvent(event))) isGmAdsBlocked.value = true
      })
    }
    // Part 2: Brave Shields lets the SDK reach SDK_READY and then blocks the
    // ad's video resources, so the ad just times out and NO event mentions a
    // blocker. Reproduce the block by probing the same ad-tech endpoints.
    void probeAdBlocked().then((blocked) => {
      if (blocked) isGmAdsBlocked.value = true
    })

    await new Promise<void>((resolve) => {
      let settled = false
      const settle = (): void => {
        if (settled) return
        settled = true
        unsubReady()
        unsubError()
        clearTimeout(timer)
        isGmSdkActive.value = !!getSdk()
        resolve()
      }

      const unsubReady = onSdkEvent(EVT_SDK_READY, settle)
      // An SDK_ERROR during init is terminal (the ad loader could not set up),
      // so settle now rather than burn the full timeout.
      const unsubError = onSdkEvent(EVT_SDK_ERROR, (event) => {
        console.warn('[gamemonetize] SDK_ERROR during init —', describeEvent(event))
        settle()
      })
      const timer = setTimeout(() => {
        if (settled) return
        console.warn(`[gamemonetize] SDK init timed out after ${SDK_READY_TIMEOUT_MS}ms — ad calls will no-op`)
        settle()
      }, SDK_READY_TIMEOUT_MS)

      if (document.getElementById(SDK_SCRIPT_ID)) return
      const script = document.createElement('script')
      script.id = SDK_SCRIPT_ID
      script.src = SDK_SRC
      script.async = true
      script.onerror = () => {
        if (settled) return
        console.warn('[gamemonetize] SDK script failed to load (ad-blocker / CSP / network)')
        isGmAdsBlocked.value = true
        settle()
      }
      document.head.appendChild(script)
    })
  })()
  return initPromise
}

// ─── Show wrappers ──────────────────────────────────────────────────────────

/**
 * One ad cycle. Resolves `true` iff the ad played to the end.
 *
 * Event-driven because the show call returns nothing: `SDK_GAME_PAUSE` is the
 * "an ad really opened" edge, `ALL_ADS_COMPLETED` the "it played through" one,
 * and `SDK_GAME_START` the end of the cycle. A resume with no completion
 * before it (skip, error, no-fill) resolves `false`.
 */
const runAd = (type: 'rewarded' | 'interstitial', hardTimeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const sdk = getSdk()
    if (!sdk) {
      resolve(false)
      return
    }

    let completed = false
    let adStarted = false
    let settled = false
    const finish = (granted: boolean): void => {
      if (settled) return
      settled = true
      for (const unsub of unsubs) unsub()
      clearTimeout(noFillTimer)
      clearTimeout(hardTimer)
      // A cycle that ended on a timer never saw its resume event: release the
      // game here, or it would stay paused behind an ad that is gone.
      isGmAdShowing.value = false
      resolve(granted)
    }

    const unsubs = [
      onSdkEvent(EVT_ALL_ADS_COMPLETED, () => {
        completed = true
      }),
      onSdkEvent(EVT_REWARDED_COMPLETE, () => {
        completed = true
      }),
      onSdkEvent(EVT_GAME_PAUSE, () => {
        adStarted = true
        clearTimeout(noFillTimer)
      }),
      onSdkEvent(EVT_GAME_START, () => finish(completed))
    ]
    const noFillTimer = setTimeout(() => {
      if (!adStarted) finish(false)
    }, NO_FILL_MS)
    const hardTimer = setTimeout(() => finish(completed), hardTimeoutMs)

    // `showAd` exists on the gdsdk lineage and takes a 'rewarded' argument; the
    // live GameMonetize SDK only has `showBanner`. Either may return a promise.
    try {
      let ret: any
      if (typeof sdk.showAd === 'function') ret = type === 'rewarded' ? sdk.showAd('rewarded') : sdk.showAd()
      else if (typeof sdk.showBanner === 'function') ret = sdk.showBanner()
      else {
        finish(false)
        return
      }
      if (ret && typeof ret.catch === 'function') {
        ret.catch((e: unknown) => {
          console.warn(`[gamemonetize] show ${type} rejected`, e)
          finish(false)
        })
      }
    } catch (e) {
      console.warn(`[gamemonetize] show ${type} threw`, e)
      finish(false)
    }
  })

/** Rewarded: resolves `true` only when the ad played to the end. */
export const showRewardedAdGM = (): Promise<boolean> => runAd('rewarded', REWARDED_HARD_TIMEOUT_MS)

/** Interstitial: resolves when the ad closed, was not filled, or timed out. */
export const showMidgameAdGM = async (): Promise<void> => {
  await runAd('interstitial', INTERSTITIAL_HARD_TIMEOUT_MS)
}

// ─── Ad-blocker detection ───────────────────────────────────────────────────

const describeEvent = (event: any): string => {
  if (typeof event?.message === 'string') return event.message
  try {
    return JSON.stringify(event)
  } catch {
    return String(event)
  }
}

const isAdBlockerError = (text: string): boolean => {
  const s = text.toLowerCase()
  return s.includes('blocked:')
    || s.includes('err_blocked_by_client')
    || s.includes('adblock')
    || s.includes('adsblocked')
}

// Reachable for everyone but an ad-blocker. `adsbygoogle.js` is the canonical
// ad-block test URL; `2mdn` is the instream-video host Brave was seen blocking.
const AD_BLOCK_BAIT_URLS: ReadonlyArray<string> = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://s0.2mdn.net/instream/video/client.js'
]

/**
 * True only when EVERY bait request was actively blocked. A timeout counts as
 * unknown, so a slow connection cannot raise the ads-blocked modal. `no-cors`
 * fetches do not execute the script, so the probe has no side effects.
 */
const probeAdBlocked = async (): Promise<boolean> => {
  if (typeof fetch !== 'function') return false
  const check = async (url: string): Promise<'ok' | 'blocked' | 'unknown'> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    try {
      await fetch(`${url}?_=${Date.now()}`, {
        method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal
      })
      return 'ok'
    } catch (e) {
      return (e as { name?: string })?.name === 'AbortError' ? 'unknown' : 'blocked'
    } finally {
      clearTimeout(timer)
    }
  }
  const results = await Promise.all(AD_BLOCK_BAIT_URLS.map(check))
  return results.every((r) => r === 'blocked')
}
