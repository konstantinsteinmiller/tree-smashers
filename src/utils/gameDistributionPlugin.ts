// ─── GameDistribution.com plugin ───────────────────────────────────────────
//
// Lazy-loaded module that owns everything the game talks to GameDistribution
// (gd.com) about. Mirrors the shape of `glitchPlugin.ts` — the bootstrap
// (`main.ts`) imports this only when `isGameDistribution` is true so non-GD
// builds don't ship the SDK loader code.
//
// What lives here:
//
//   1. `gameDistributionPlugin()` — initializes the SDK by setting
//      `window.GD_OPTIONS` (with the `gameId` from VITE_GAME_DISTRIBUTION_GAME_ID)
//      and injecting the SDK script tag. Resolves once the SDK fires its
//      `SDK_READY` event, or after a defensive 10s timeout if the SDK
//      never reports ready (offline, ad-blocker, etc.).
//
//   2. `createGameDistributionSaveStrategy()` — the SaveStrategy used by
//      `SaveManager`. GameDistribution has no cloud-save API as of 2026-04
//      so this is a thin wrapper around localStorage — see
//      `src/utils/save/GameDistributionStrategy.ts`.
//
//   3. `showRewardedAdGD()` / `showMidgameAdGD()` — Promise-based wrappers
//      around `gdsdk.showAd('rewarded')` / `gdsdk.showAd()`. Resolve `true`
//      for rewarded only when the player completed the video (signalled by
//      the SDK via the `SDK_REWARDED_WATCH_COMPLETE` event).
//
//   4. `preloadRewardedGD()` — fire-and-forget pre-warm so the next show
//      is instant.
//
//   5. `isGdSdkActive` reactive ref — mirrors into `GameDistributionProvider`
//      to drive the `AdProvider.isReady` gate.
//
// Outside of a GameDistribution build the module is never imported, and
// even if it were, `gameDistributionPlugin()` early-returns when
// `isGameDistribution` is false.
//
// SDK reference: https://github.com/GameDistribution/GD-HTML5/wiki

import { ref } from 'vue'
import { isGameDistribution } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { GameDistributionStrategy } from '@/utils/save/GameDistributionStrategy'
import type { SaveStrategy } from '@/utils/save/types'

const SDK_SRC = 'https://html5.api.gamedistribution.com/main.min.js'
const SDK_READY_TIMEOUT_MS = 10_000

declare global {
  interface Window {
    GD_OPTIONS?: any
    gdsdk?: any
  }
}

/** Reactive: true once the GD SDK has loaded and reported ready. */
export const isGdSdkActive = ref(false)

/**
 * Reactive: true once the GD SDK has reported that one of its partner ad
 * scripts (improvedigital headerlift, gamemonkey tracker, gamedock tracker,
 * etc.) was blocked by the player's browser — typically uBlock / AdGuard /
 * Brave Shields / Pi-hole. Detected by inspecting `SDK_ERROR` events with
 * `Blocked:` in the message (the same `ERR_BLOCKED_BY_CLIENT` chain that
 * surfaces in DevTools, except routed through the SDK's developer-event
 * channel). Wired into `AdProvider.isAdsBlocked` via `GameDistributionProvider`.
 *
 * One detected blocker is enough to flip the flag — we don't reset to false
 * if a later ad somehow succeeds, because once an extension is observed
 * blocking ANY partner script the rest of the ad chain typically degrades
 * silently and rewards still won't grant reliably.
 */
export const isGdAdsBlocked = ref(false)

// ─── Debug surface ────────────────────────────────────────────────────────
//
// Mirror of `levelPlayDebug` in LevelPlayProvider — a reactive snapshot
// the on-screen overlay renders. Populated as the SDK lifecycle progresses
// AND as SDK events arrive (the SDK fires many events; we tail the most
// recent so the dev can see what's happening on a deployed gd.com URL
// where there's no easy console access).

type GdInitPhase = 'idle' | 'no-game-id' | 'injecting' | 'awaiting-ready' | 'ready' | 'timed-out' | 'script-error'

export const gdDebug = ref({
  initPhase: 'idle' as GdInitPhase,
  gameIdPresent: false,
  scriptInjected: false,
  sdkReadyReceived: false,
  lastShowResult: '' as string,
  lastError: '' as string,
  events: [] as string[]
})

const stamp = (): string => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const debugLog = (msg: string): void => {
  gdDebug.value = {
    ...gdDebug.value,
    events: [...gdDebug.value.events, `${stamp()} ${msg}`].slice(-14)
  }
  // GameDistribution is web-only — devs have a browser console on the
  // gd.com preview URL, so the debug surface is just `console.info` when
  // VITE_APP_DEBUG=true (or `localStorage.setItem('debug','true')` then
  // refresh). The reactive `gdDebug` ref is still maintained for future
  // overlay use but is not rendered today.
  if (isDebug.value) console.info('[gd]', msg)
}

const setDebug = (patch: Partial<typeof gdDebug.value>): void => {
  gdDebug.value = { ...gdDebug.value, ...patch }
}

// Internal handle captured at SDK_READY. We re-read from window.gdsdk on
// every ad call as a defensive belt-and-braces — the SDK occasionally
// reassigns the global between events.
let gdsdk: any = null
let initPromise: Promise<void> | null = null

// ─── Event bus ─────────────────────────────────────────────────────────────
//
// The SDK only exposes a single `onEvent` callback in `GD_OPTIONS`. We
// fan-out the events into a Set-of-listeners-per-event-name map so multiple
// parts of the app (rewarded grant detection, midgame pause/resume, etc.)
// can subscribe without fighting over the one callback slot.

type EventListener = (event: any) => void
const listeners = new Map<string, Set<EventListener>>()

const onSdkEvent = (eventName: string, listener: EventListener): (() => void) => {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set())
  listeners.get(eventName)!.add(listener)
  return () => listeners.get(eventName)?.delete(listener)
}

const dispatchEvent = (eventName: string, payload: any): void => {
  // Debug surface: every SDK event is logged so the on-device overlay
  // shows the live event stream. The SDK chats a LOT (LOADED, IMPRESSION,
  // VOLUME_CHANGED, …) — the ring buffer in `gdDebug.events` is sized
  // to keep only the most recent so the panel doesn't blow up.
  debugLog(`evt: ${eventName}`)
  const set = listeners.get(eventName)
  if (!set) return
  for (const cb of set) {
    try {
      cb(payload)
    } catch (e) {
      console.warn(`[gd] listener for ${eventName} threw`, e)
    }
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialise GameDistribution. Idempotent — multiple calls return the same
 * Promise. Resolves after SDK_READY (or the 10s timeout) so callers can
 * trust the SDK is usable on resolution.
 *
 * Safe to call when `isGameDistribution` is false — it's a no-op.
 */
export const gameDistributionPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') return
    if (!isGameDistribution) return

    const gameId = import.meta.env.VITE_GAME_DISTRIBUTION_GAME_ID
    setDebug({ gameIdPresent: !!gameId })
    if (!gameId) {
      setDebug({ initPhase: 'no-game-id', lastError: 'VITE_GAME_DISTRIBUTION_GAME_ID missing' })
      debugLog('init aborted: no game id')
      console.warn('[gd] VITE_GAME_DISTRIBUTION_GAME_ID is missing — SDK disabled')
      return
    }
    debugLog(`init starting (gameId=${String(gameId).slice(0, 8)}…)`)
    setDebug({ initPhase: 'injecting' })

    // GD_OPTIONS MUST be on window before the SDK script executes — the
    // script reads them synchronously at top of file.
    //
    // `tagForChildDirectedTreatment: true` declares the game as
    // child-directed to GD's ad stack (mirrors COPPA's `tag_for_child_
    // directed_treatment` and Google's TFCD). GD propagates this to its
    // bidder waterfall so personalized-ad demand is excluded and only
    // contextual / family-safe creatives are eligible. Required because
    // (a) the game is also published to Apple Kids / Google Families on
    // mobile via Tauri builds (where the LevelPlay plugin sets the
    // analogous flags) and (b) gd.com aggregates traffic from many
    // sites whose visitors include under-13 players — declaring it
    // here keeps the audience signal consistent across surfaces. See
    // https://github.com/GameDistribution/GD-HTML5/wiki for the option.
    //
    // Note: CrazyGames is 13+ only by their portal policy, so the
    // CrazyGames provider has no equivalent flag to set.
    window.GD_OPTIONS = {
      gameId,
      tagForChildDirectedTreatment: true,
      onEvent: (event: any) => {
        if (event && typeof event.name === 'string') {
          dispatchEvent(event.name, event)
        }
      }
      // Other GD_OPTIONS fields (advertisementSettings.debug, prefix,
      // userId, etc.) are intentionally omitted — defaults are correct
      // for kids/casual web games. Add here if you need to debug a
      // specific account or GDPR scenario.
    }

    // Permanent ad-blocker detection — the init-scoped SDK_ERROR listener
    // below unsubscribes once we settle (success or timeout), so we
    // register a separate one here that lives for the page lifetime.
    // Without it, blockers that activate AFTER init (e.g. user enables
    // their extension mid-session) wouldn't flip `isGdAdsBlocked`.
    onSdkEvent('SDK_ERROR', (event) => {
      const msg = String(event?.message ?? '')
      if (isAdBlockerError(msg)) {
        if (!isGdAdsBlocked.value) {
          isGdAdsBlocked.value = true
          debugLog('ad-blocker detected via SDK_ERROR (runtime)')
        }
      }
    })

    await new Promise<void>((resolve) => {
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        unsubReady()
        unsubError()
        gdsdk = window.gdsdk ?? null
        isGdSdkActive.value = !!gdsdk
        resolve()
      }

      const unsubReady = onSdkEvent('SDK_READY', () => {
        setDebug({ sdkReadyReceived: true, initPhase: 'ready' })
        debugLog('SDK_READY')
        settle()
      })
      const unsubError = onSdkEvent('SDK_ERROR', (event) => {
        const msg = String(event?.message ?? 'unknown')
        setDebug({ lastError: `SDK_ERROR: ${msg}` })
        debugLog(`SDK_ERROR: ${msg}`)
        console.warn('[gd] SDK_ERROR during init', event)
        if (isAdBlockerError(msg)) {
          isGdAdsBlocked.value = true
          debugLog('ad-blocker detected via SDK_ERROR')
        }
        // Don't settle on SDK_ERROR — the SDK may still recover and emit
        // SDK_READY afterward. We only fall back via the timeout.
      })

      // Defensive timeout — if the SDK never reports ready (ad blocker,
      // offline, GD CDN down), don't block the rest of boot indefinitely.
      const timer = setTimeout(() => {
        if (settled) return
        setDebug({ initPhase: 'timed-out', lastError: `SDK init timed out after ${SDK_READY_TIMEOUT_MS}ms` })
        debugLog(`timed out after ${SDK_READY_TIMEOUT_MS}ms`)
        console.warn(`[gd] SDK init timed out after ${SDK_READY_TIMEOUT_MS}ms — ad calls will no-op`)
        // Still capture window.gdsdk if it managed to attach without firing
        // SDK_READY — better to have a partial integration than none.
        settle()
      }, SDK_READY_TIMEOUT_MS)
      onSdkEvent('SDK_READY', () => clearTimeout(timer))

      // Inject the script tag now that GD_OPTIONS + listeners are in place.
      const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
      if (existing) {
        // Already present (HMR / repeat init) — the SDK should have fired
        // SDK_READY by now or will shortly. Don't add a duplicate.
        setDebug({ scriptInjected: true, initPhase: 'awaiting-ready' })
        debugLog('script already in DOM (skipping inject)')
        return
      }
      const script = document.createElement('script')
      script.src = SDK_SRC
      script.async = true
      script.onload = () => debugLog('script onload fired')
      script.onerror = () => {
        if (settled) return
        setDebug({ initPhase: 'script-error', lastError: `script load failed: ${SDK_SRC}` })
        debugLog(`script load FAILED: ${SDK_SRC}`)
        console.warn('[gd] SDK script failed to load')
        settle()
      }
      document.head.appendChild(script)
      setDebug({ scriptInjected: true, initPhase: 'awaiting-ready' })
      debugLog('script injected')
    })

    // Pre-warm a rewarded ad once the SDK is up so the first watch-ad
    // tap is instant. Failure here is non-fatal — the user's first show
    // call will trigger another preload internally.
    if (gdsdk) preloadRewardedGD()
  })()
  return initPromise
}

// ─── Save strategy ─────────────────────────────────────────────────────────

/**
 * Build the SaveStrategy used by SaveManager. GameDistribution has no
 * cloud-save API today, so this returns a local-only strategy. Kept as a
 * factory function (rather than a const instance) to mirror the
 * `createCrazyGamesSaveStrategy` / `createGlitchSaveStrategy` shape.
 */
export const createGameDistributionSaveStrategy = (): SaveStrategy =>
  new GameDistributionStrategy()

// ─── Rewarded video ad ────────────────────────────────────────────────────

/**
 * Show a rewarded ad. Resolves `true` iff the player watched the video
 * to completion — callers should grant the reward only on `true`.
 *
 * The "watched to completion" signal is the `SDK_REWARDED_WATCH_COMPLETE`
 * event. The promise returned by `gdsdk.showAd('rewarded')` resolves on
 * ad close regardless of completion, so we observe both: the event
 * marks the watch as complete, the promise tells us when to resolve.
 *
 * No-op (resolves false) when the SDK is not active.
 */
export const showRewardedAdGD = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const sdk = gdsdk ?? window.gdsdk
    if (!sdk || typeof sdk.showAd !== 'function') {
      setDebug({ lastShowResult: 'rewarded skipped (sdk not active)' })
      debugLog('show_rewarded skipped: sdk not active')
      resolve(false)
      return
    }

    let watchedComplete = false
    const unsubComplete = onSdkEvent('SDK_REWARDED_WATCH_COMPLETE', () => {
      watchedComplete = true
    })

    try {
      debugLog('invoke showAd(rewarded)')
      sdk.showAd('rewarded').then(
        () => {
          unsubComplete()
          setDebug({ lastShowResult: `rewarded → completed=${watchedComplete}` })
          debugLog(`show_rewarded → completed=${watchedComplete}`)
          resolve(watchedComplete)
        },
        (err: any) => {
          unsubComplete()
          const msg = describeAdError(err)
          setDebug({ lastShowResult: `rewarded error: ${msg}`, lastError: msg })
          debugLog(`show_rewarded error: ${msg}`)
          console.warn('[gd] showAd rewarded error', err)
          resolve(false)
        }
      )
    } catch (e) {
      unsubComplete()
      const msg = describeAdError(e)
      setDebug({ lastShowResult: `rewarded threw: ${msg}`, lastError: msg })
      debugLog(`show_rewarded threw: ${msg}`)
      console.warn('[gd] showAd rewarded threw', e)
      resolve(false)
    }
  })
}

// ─── Midgame interstitial ad ──────────────────────────────────────────────

/**
 * Show an interstitial (midgame) ad. Resolves when the ad closes —
 * success or failure — so callers can `await` it before resuming the
 * next match.
 *
 * `gdsdk.showAd()` with no argument defaults to the interstitial ad type.
 * No-op (resolves immediately) when the SDK is not active.
 */
export const showMidgameAdGD = (): Promise<void> => {
  return new Promise((resolve) => {
    const sdk = gdsdk ?? window.gdsdk
    if (!sdk || typeof sdk.showAd !== 'function') {
      setDebug({ lastShowResult: 'interstitial skipped (sdk not active)' })
      debugLog('show_interstitial skipped: sdk not active')
      resolve()
      return
    }
    try {
      debugLog('invoke showAd()')
      sdk.showAd().then(
        () => {
          setDebug({ lastShowResult: 'interstitial → closed' })
          debugLog('show_interstitial → closed')
          resolve()
        },
        (err: any) => {
          const msg = describeAdError(err)
          setDebug({ lastShowResult: `interstitial error: ${msg}`, lastError: msg })
          debugLog(`show_interstitial error: ${msg}`)
          console.warn('[gd] showAd interstitial error', err)
          resolve()
        }
      )
    } catch (e) {
      const msg = describeAdError(e)
      setDebug({ lastShowResult: `interstitial threw: ${msg}`, lastError: msg })
      debugLog(`show_interstitial threw: ${msg}`)
      console.warn('[gd] showAd interstitial threw', e)
      resolve()
    }
  })
}

// ─── Pre-warm ──────────────────────────────────────────────────────────────

/**
 * Tell the SDK to pre-load a rewarded ad so the next `showRewardedAdGD()`
 * call has zero startup latency. Fire-and-forget — failures are logged
 * but never propagated; the show call will trigger its own preload if
 * the SDK doesn't have one cached.
 */
export const preloadRewardedGD = (): void => {
  const sdk = gdsdk ?? window.gdsdk
  if (!sdk || typeof sdk.preloadAd !== 'function') {
    debugLog('preloadAd skipped: sdk not active')
    return
  }
  try {
    debugLog('invoke preloadAd(rewarded)')
    sdk.preloadAd('rewarded')
      .then(() => debugLog('preloadAd(rewarded) → ready'))
      .catch((e: any) => {
        const msg = describeAdError(e)
        debugLog(`preloadAd(rewarded) error: ${msg}`)
        console.warn('[gd] preloadAd rewarded error', e)
      })
  } catch (e) {
    const msg = describeAdError(e)
    debugLog(`preloadAd(rewarded) threw: ${msg}`)
    console.warn('[gd] preloadAd rewarded threw', e)
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

/** Recognise SDK_ERROR / show-error messages that indicate an ad-blocker.
 *  GD's SDK reports browser-extension blocks as `Blocked: <url>` strings
 *  routed through SDK_ERROR; some generic chains stuff `ERR_BLOCKED_BY_CLIENT`
 *  or `adblock` into the message. Match all three patterns. */
const isAdBlockerError = (text: unknown): boolean => {
  const s = String(text ?? '').toLowerCase()
  return s.includes('blocked:')
    || s.includes('err_blocked_by_client')
    || s.includes('adblock')
    || s.includes('adsblocked')
}

const describeAdError = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const anyE = e as any
    if (typeof anyE.message === 'string') return anyE.message
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}

// ─── Default export (composable-style convenience) ────────────────────────

const useGameDistribution = () => ({
  isGdSdkActive,
  gameDistributionPlugin,
  createGameDistributionSaveStrategy,
  showRewardedAdGD,
  showMidgameAdGD,
  preloadRewardedGD,
  onSdkEvent
})

export default useGameDistribution
