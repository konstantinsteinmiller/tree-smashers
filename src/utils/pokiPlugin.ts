// ─── Poki platform plugin ───────────────────────────────────────────────────
//
// Wraps PokiSDK v2 (https://game-cdn.poki.com/scripts/v2/poki-sdk.js) behind a
// small, safe surface. Nothing outside this file should touch `window.PokiSDK`,
// because three of the platform's rules are footguns this module exists to
// neutralise. The first two were found by de-minifying the shipped bundle and
// are in neither of Poki's docs; the third is a requirement Poki QA enforces by
// hand.
//
//   1. THE BAD-EVENT KILL SWITCH. A `gameplayStart()` landing within 50 ms of
//      the preceding `gameplayStop()` increments an internal `badEvents`
//      counter. At 10, `gameplayStart`, `gameplayStop` AND `commercialBreak`
//      all become no-ops for the rest of the session (the counter decays 1/s).
//      Nothing surfaces but a debug log line — the game keeps running and
//      simply stops earning.
//
//      This project drives the bracket from `watch(isGameplayActive, …)` in
//      `SpinnerArena.vue`, and `isGameplayActive` is a computed over the battle
//      phase plus every blocking modal. A modal closing in the same tick an ad
//      opens produces exactly the sub-50 ms stop→start pair
//      the SDK penalises. `pokiGameplayStart/Stop` below collapse duplicate
//      consecutive events and DEFER a start that lands inside the guard window
//      (cancelling it outright if a stop arrives first, so we never emit an
//      unmatched event).
//
//   2. `rewardedBreak()` IS NOT QUEUED BY THE LOADER SHIM. The 5.5 KB shim
//      queues `init` and `commercialBreak` for replay once the ~325 KB core
//      lands, but its `rewardedBreak` is a literal `() => Promise.resolve(false)`.
//      A rewarded button tapped in the first few hundred ms silently refuses the
//      reward. Hence `isPokiSdkActive` — flipped only after `init()` settles,
//      and the provider's `isRewardedReady` hangs off it.
//
//   3. `gameplayStart()` MAY NOT FIRE WITHOUT A PLAYER INTERACTION. A game that
//      boots straight into a live stage — no menu, which is what Poki's own C2P
//      advice pushes you toward — reports gameplay during mount, before anyone
//      has touched the page. `pokiGameplayStart()` therefore HOLDS such a start
//      behind a trusted-gesture gate and releases it on the first real
//      pointer/key event. See "The user-gesture gate".
//
// Poki has NO cloud-save API (its wrapper mirrors localStorage + IndexedDB
// itself — see PokiStrategy), NO audio-mute signal and NO pause signal. The
// game owns all three. The only ad-audio edge available is the `onStart`
// callback, which fires ONLY when a video ad genuinely opens — a no-fill
// resolves the promise without ever calling it. That is why PokiProvider sets
// `managesMidgameAudio: true`.
//
// NOTE ON THE PAUSE / AUDIO GATE: this module imports nothing from
// `useGamePause` or `useSound`, deliberately. Unlike the project this pattern
// came from, chaos-arena's `useAds` owns no ad gate — so the wrappers below
// publish `isPokiAdShowing` on the REAL-ad edge and `App.vue` is the single
// owner that turns that into `setGamePaused()` + music pause/resume, exactly
// as it already does for the Playgama Bridge's aggregated pause signal.
// One publisher, one owner: flipping the game's pause state from in here as
// well would give the gate two release points and let a resume land while the
// ad is still up.

import { ref, computed } from 'vue'

// ─── Types ──────────────────────────────────────────────────────────────────

export type PokiDeviceCategory = 'desktop' | 'mobile' | 'tablet'
export type PokiRewardedSize = 'small' | 'medium' | 'large'

interface PokiSDKGlobal {
  init: (options?: Record<string, unknown>) => Promise<unknown>
  gameLoadingFinished: () => void
  gameplayStart: () => void
  gameplayStop: () => void
  commercialBreak: (onStart?: () => void) => Promise<unknown>
  rewardedBreak: (
    arg?: (() => void) | { onStart?: () => void, size?: PokiRewardedSize }
  ) => Promise<boolean>
  measure: (category: string, what?: string, action?: string) => void
  captureError: (err: unknown) => void
  getLanguage: () => string
  getDeviceInfo: () => { category: PokiDeviceCategory }
  getURLParam: (name: string) => string
  movePill: (topPercent: number, topPx: number) => void
  muteAd: () => void
  setVolume: (volume: number) => void
  setDebug: (on?: boolean) => void
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKGlobal
    /** Local-dev switch (set before init): no monetization; `init()` resolves
     *  in ~10 ms, `commercialBreak()` in 100 ms, `rewardedBreak()` resolves
     *  TRUE in ~200 ms. Lets the grant path be exercised without a stub. */
    __poki_no_ads?: boolean
  }
}

const SDK_SRC = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js'

/**
 * The SDK penalises a `gameplayStart` less than 50 ms after a `gameplayStop`.
 * 120 ms gives headroom for rAF jitter and for a promise chain that settles
 * inside a single frame.
 */
const MIN_EVENT_GAP_MS = 120

/** How long to wait for the shim to define `window.PokiSDK`. The tag is in
 *  index.html and module scripts are deferred, so in practice this resolves on
 *  the first poll; the budget only matters if the CDN is slow or blocked. */
const SDK_WAIT_TIMEOUT_MS = 8000

const getSdk = (): PokiSDKGlobal | null =>
  (typeof window !== 'undefined' && window.PokiSDK) || null

const warn = (...args: unknown[]): void => console.warn('[poki]', ...args)

// ─── Reactive state ─────────────────────────────────────────────────────────

/** True once `PokiSDK.init()` has SETTLED — resolved OR rejected. Poki's docs
 *  are explicit that a rejected init must still boot the game, and the core is
 *  loaded either way, so the real (queued) methods are live from that point.
 *  Every rewarded surface gates on this: before it flips, `rewardedBreak()`
 *  resolves `false` from the loader shim's stub. */
export const isPokiSdkActive = ref(false)

/**
 * Constant `false`. `PokiSDK.isAdBlocked()` is hardcoded `() => false` in the
 * shipped v2 core, and `rewardedBreak()` resolving `false` conflates "blocked",
 * "no fill" and "player skipped" — so there is no signal that could drive the
 * shared AdsBlockedModal without firing it on legitimate no-fills.
 *
 * Poki does not forbid such a modal (unlike the CrazyGames case, where the SDK
 * shows its own and `ownsAdBlockUi` suppresses ours to avoid stacking). It is
 * simply undetectable here. The binding requirement is the hard one from Poki's
 * requirements page — "games must remain fully playable when ad blockers are
 * active" — which is verified by playing the build with uBlock on, not by a flag.
 */
export const isPokiAdsBlocked = computed(() => false)

/** Portal language hint: `?iso_lang`, falling back to `navigator.language`.
 *  A HINT, not the player's choice — never persisted into LANGUAGE_KEY.
 *  Readable synchronously from the loader shim, before `init()` resolves. */
export const pokiLocale = ref<string | null>(null)

/** `'desktop' | 'mobile' | 'tablet'`. Poki requires tablets to be forced onto
 *  the MOBILE control scheme, and the SDK's classifier handles the iPadOS
 *  desktop-UA case (via `navigator.maxTouchPoints`) that a `pointer: coarse`
 *  media query gets wrong. Also readable pre-init. */
export const pokiDeviceCategory = ref<PokiDeviceCategory | null>(null)

/**
 * True only while a Poki ad video is genuinely on screen.
 *
 * Set from the `onStart` edge of `commercialBreak` / `rewardedBreak`, which
 * fires ONLY on a real fill — a no-fill resolves the promise without ever
 * calling it, so an unfilled break leaves the music and the result-screen
 * stinger untouched. Cleared when the promise settles, whatever the outcome.
 *
 * `App.vue` watches this and drives `setGamePaused()` + music. Poki publishes
 * no pause and no audio signal of its own, so this ref is the only edge the
 * game gets — see the note at the top of this file for why the wiring lives
 * there and not here.
 */
export const isPokiAdShowing = ref(false)

// ─── Boot ───────────────────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null

const ensureScriptTag = (): void => {
  if (typeof document === 'undefined') return
  if (document.querySelector(`script[src="${SDK_SRC}"]`)) return
  // Defensive: some QA wrappers serve their own index.html. Harmless when the
  // build-time tag is present (the query above short-circuits).
  const tag = document.createElement('script')
  tag.src = SDK_SRC
  tag.async = false
  document.head.appendChild(tag)
}

const waitForSdk = async (timeoutMs = SDK_WAIT_TIMEOUT_MS): Promise<PokiSDKGlobal | null> => {
  const deadline = Date.now() + timeoutMs
  for (; ;) {
    const sdk = getSdk()
    if (sdk) return sdk
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Read the portal language WITHOUT waiting for init. `getLanguage()` is fully
 * implemented in the loader shim, so it answers correctly the moment the tag has
 * run — which is what lets `main.ts` use the PARALLEL init arm and keep an ad
 * SDK off the first-paint critical path (Poki measures conversion-to-play on the
 * first `gameplayStart()`, so boot latency is revenue).
 */
export const readPokiLanguage = (): string | null => {
  const sdk = getSdk()
  if (!sdk) return null
  try {
    const raw = sdk.getLanguage?.()
    // Kept whole (`pt-br`, not `pt`): the region picks between our variant
    // files. `main.ts` maps it onto a shipped locale via `toShippedLocale`.
    const code = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (code) pokiLocale.value = code
    return code || null
  } catch (e) {
    warn('getLanguage threw', e)
    return null
  }
}

/**
 * Idempotent SDK boot. Safe to call from several entry points (`main.ts`, the
 * AdProvider's `init()`); they all join the same promise, so `PokiSDK.init()`
 * runs exactly once per page load. (Calling it twice only warns and returns the
 * original promise, but we don't rely on that.)
 */
export const pokiPlugin = (): Promise<void> => {
  if (initPromise) return initPromise

  initPromise = (async () => {
    ensureScriptTag()
    const sdk = await waitForSdk()
    if (!sdk) {
      warn('SDK never appeared — continuing without Poki (game stays playable)')
      return
    }

    readPokiLanguage()
    try {
      pokiDeviceCategory.value = sdk.getDeviceInfo?.().category ?? null
    } catch (e) {
      warn('getDeviceInfo threw', e)
    }

    // `setDebug(true)` is IGNORED on *.poki-gdn.com / gdn.poki.com and the
    // attempt is REPORTED to Poki as a `debugTrueInProduction` event. Never let
    // it out of dev.
    if (import.meta.env.DEV) {
      try {
        sdk.setDebug?.(true)
      } catch { /* non-fatal */
      }
    }

    try {
      await sdk.init({})
    } catch (e) {
      // Documented behaviour: "Initialized, something went wrong, load your game
      // anyway." The core script has loaded regardless, so the real methods are
      // live from here.
      warn('init() rejected — booting the game anyway', e)
    }

    isPokiSdkActive.value = true

    // Start banking gestures now, not at the first `pokiGameplayStart()`. If the
    // game boots straight into play, a player who taps during the splash has
    // already interacted by the time the bracket opens — and without this the
    // gate would hold their start until they tapped a SECOND time.
    startGestureWatch()
  })()

  return initPromise
}

// ─── Loading bracket ────────────────────────────────────────────────────────

let loadingFinishedSent = false

/**
 * The ONE strictly-required SDK call. Fired from `FLogoProgress.vue` on the
 * splash-resolved edge — the same edge that drives CrazyGames' `loadingStop`,
 * Playgama's `game_ready` and GamePix's `gameLoaded`.
 *
 * `gameLoadingStart()` and `gameLoadingProgress()` are `() => {}` in the v2
 * core — the loading bar is ours to drive, and there is nothing to report into.
 */
export const pokiGameLoadingFinished = (): void => {
  if (loadingFinishedSent) return
  const sdk = getSdk()
  if (!sdk) return
  loadingFinishedSent = true
  try {
    sdk.gameLoadingFinished()
  } catch (e) {
    warn('gameLoadingFinished threw', e)
  }
}

// ─── Gameplay bracket (bad-event-safe, gesture-gated) ───────────────────────

type Bracket = 'idle' | 'playing'

let bracket: Bracket = 'idle'
let lastStopEmittedAt = 0
let pendingStart: ReturnType<typeof setTimeout> | null = null
/** True once a `gameplayStart()` has actually reached the SDK and has not yet
 *  been closed by a `gameplayStop()`. Distinct from `bracket`, which is what the
 *  GAME thinks: between the two lies every start we are holding back. */
let startEmitted = false

const emitStart = (): void => {
  const sdk = getSdk()
  if (!sdk) return
  startEmitted = true
  try {
    sdk.gameplayStart()
  } catch (e) {
    warn('gameplayStart threw', e)
  }
}

const emitStop = (): void => {
  const sdk = getSdk()
  if (!sdk) return
  startEmitted = false
  try {
    sdk.gameplayStop()
  } catch (e) {
    warn('gameplayStop threw', e)
  }
  lastStopEmittedAt = performance.now()
}

/** Emit a start now, or at the far edge of the SDK's 50 ms bad-event window. */
const scheduleStart = (): void => {
  if (pendingStart) return
  const since = performance.now() - lastStopEmittedAt
  if (lastStopEmittedAt === 0 || since >= MIN_EVENT_GAP_MS) {
    emitStart()
    return
  }
  pendingStart = setTimeout(() => {
    pendingStart = null
    if (bracket === 'playing') emitStart()
  }, MIN_EVENT_GAP_MS - since)
}

// ─── The user-gesture gate ──────────────────────────────────────────────────
//
// POKI FORBIDS A `gameplayStart()` THAT NO PLAYER ASKED FOR. The bracket may
// only open off a real interaction, and this game has no menu — it boots
// straight into a live stage, so `isLiveGameplay` goes true during mount, before
// anybody has touched anything. Reporting that is wrong three ways:
//
//   • it is the QA rejection, in as many words;
//   • it inflates conversion-to-play with players who never played — C2P is
//     measured on the FIRST `gameplayStart()`, so a start fired on load makes
//     the Web Fit Test's 65 % gate meaningless in the direction that looks good
//     and then fails Poki's own funnel review;
//   • `gameplayStart()` takes a screen wake lock, and taking one on a page
//     nobody is playing is what browsers ship autoplay policies to stop.
//
// So a start requested before the first gesture is HELD (never dropped, never
// timed out) and released the moment one arrives — provided the bracket is still
// open by then. That keeps the C2P clock as tight as it can honestly be: the
// first frame the player acts on, not the first frame that renders.
//
// The listeners are capture-phase on `window`, so the canvas calling
// `stopPropagation()` / `preventDefault()` on its own pointer handlers — which
// `useGooInput` does — cannot hide the gesture from us. Only `isTrusted` events
// count: a synthetic `dispatchEvent` is not a player.

let userHasInteracted = false
let gestureListening = false

const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const

const onGesture = (e: Event): void => {
  if (!e.isTrusted) return
  pokiNoteUserInteraction()
}

const stopGestureWatch = (): void => {
  if (!gestureListening || typeof window === 'undefined') return
  gestureListening = false
  for (const type of GESTURE_EVENTS) {
    window.removeEventListener(type, onGesture, true)
  }
}

/** Idempotent. Called from `pokiPlugin()` so the gesture is banked even if it
 *  lands before the game asks to open the bracket. */
const startGestureWatch = (): void => {
  if (gestureListening || userHasInteracted || typeof window === 'undefined') return
  gestureListening = true
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
}

/**
 * Record that the player has genuinely interacted, releasing any held start.
 *
 * The `window` listeners above call this for real gestures; it is exported so a
 * call site that KNOWS it is on a player-driven path (and for the specs, where
 * `dispatchEvent` cannot produce a trusted event) can say so directly. Calling
 * it from a timer, a lifecycle hook or an SDK callback would defeat the whole
 * point of the gate.
 */
export const pokiNoteUserInteraction = (): void => {
  if (userHasInteracted) return
  userHasInteracted = true
  stopGestureWatch()
  // A start held back by the gate is now legal. If the bracket closed while we
  // waited (a modal, an ad, a death), nothing is owed.
  if (bracket === 'playing' && !startEmitted) scheduleStart()
}

/** Has the page seen a real gesture yet? Diagnostics and specs only. */
export const pokiHasUserInteracted = (): boolean => userHasInteracted

/**
 * Open the gameplay bracket.
 *
 * Idempotent, never emits inside the SDK's 50 ms bad-event window, and never
 * emits at all until the player has actually interacted (see the gate above).
 */
export const pokiGameplayStart = (): void => {
  if (bracket === 'playing') return
  bracket = 'playing'

  if (!userHasInteracted) {
    // Held, not dropped: `pokiNoteUserInteraction()` releases it.
    startGestureWatch()
    return
  }

  scheduleStart()
}

/**
 * Close the gameplay bracket: pause, modal, result screen, defeat, ad showing.
 * Emitted SYNCHRONOUSLY (never deferred) so it always precedes an ad request.
 *
 * If no start ever reached the SDK — deferred by the guard window, or held by
 * the gesture gate — this emits nothing rather than an unmatched stop.
 */
export const pokiGameplayStop = (): void => {
  if (bracket === 'idle') return
  bracket = 'idle'

  if (pendingStart) {
    clearTimeout(pendingStart)
    pendingStart = null
  }
  if (!startEmitted) return
  emitStop()
}

/** Test seam — resets the bracket state machine between specs. */
export const __resetPokiGameplayBracketForTests = (): void => {
  if (pendingStart) clearTimeout(pendingStart)
  pendingStart = null
  bracket = 'idle'
  lastStopEmittedAt = 0
  loadingFinishedSent = false
  startEmitted = false
  isPokiAdShowing.value = false
  stopGestureWatch()
  userHasInteracted = false
}

// ─── Ads ────────────────────────────────────────────────────────────────────

/**
 * Interstitial. Resolves when the ad finished, errored, or was never shown —
 * never rejects.
 *
 * POSITION IS IMPLICIT: the SDK reports this as a PREROLL until the first
 * `gameplayStart()` and a MIDROLL after it (`__gameStarted ? midroll : preroll`
 * in the core). The first-play placement this project fires before the opening
 * wave therefore lands as a preroll, which is what Poki wants.
 *
 * `onImpression` is invoked ONLY when a video ad genuinely opens. A no-fill
 * resolves without calling it — which is what `managesMidgameAudio: true` on the
 * provider exists to exploit: the win/lose stinger survives an unfilled break.
 */
export const showMidgameAdPoki = async (onImpression?: () => void): Promise<void> => {
  const sdk = getSdk()
  if (!sdk || !isPokiSdkActive.value) return
  try {
    await sdk.commercialBreak(() => {
      isPokiAdShowing.value = true
      try {
        onImpression?.()
      } catch (e) {
        warn('onImpression threw', e)
      }
    })
  } catch (e) {
    warn('commercialBreak threw', e)
  } finally {
    isPokiAdShowing.value = false
  }
}

/**
 * Rewarded video. Resolves `true` ONLY when the reward is earned.
 *
 * `size` is undocumented but real: 'small' | 'medium' | 'large' plays 1 | 2 | 3
 * ads back to back. We stay on 'small' — this game's rewards (respin, 2× speed,
 * revive) are single-ad sized, and chaining videos for the same payout is the
 * kind of thing Poki's monetization review pushes back on.
 *
 * Returns `false` when the SDK has not initialised — matching the loader shim's
 * own stub, so callers behave identically either way. The provider keeps the
 * button hidden until then, so a player should never reach this branch.
 */
export const showRewardedAdPoki = async (
  size: PokiRewardedSize = 'small',
  onImpression?: () => void
): Promise<boolean> => {
  const sdk = getSdk()
  if (!sdk || !isPokiSdkActive.value) return false
  try {
    return await sdk.rewardedBreak({
      size,
      onStart: () => {
        isPokiAdShowing.value = true
        try {
          onImpression?.()
        } catch (e) {
          warn('onImpression threw', e)
        }
      }
    })
  } catch (e) {
    warn('rewardedBreak threw', e)
    return false
  } finally {
    isPokiAdShowing.value = false
  }
}

/**
 * Mirror the player's own mute onto the ad video, so an ad isn't the loudest
 * thing on the page for someone who muted the game. Both calls are undocumented
 * but present in the shipped core, and both no-op under `__poki_no_ads`.
 */
export const syncPokiAdVolume = (volume: number): void => {
  const sdk = getSdk()
  if (!sdk) return
  try {
    if (volume <= 0) sdk.muteAd?.()
    else sdk.setVolume?.(volume)
  } catch (e) {
    warn('ad volume sync failed', e)
  }
}

// ─── Analytics / errors / chrome ────────────────────────────────────────────

const MEASURE_FORBIDDEN = /[/^]/

/**
 * Progression + interaction funnels, e.g.
 *   pokiMeasure('wave', String(wave), 'start' | 'complete' | 'fail')
 *   pokiMeasure('rewarded', 'respin', 'visible' | 'interact')
 *
 * Rules: `/` and `^` are rejected outright by the SDK; a `start` must be
 * followed by exactly one of `complete`/`fail`; pair `visible` with `interact`;
 * keep the values stable across versions or the funnels break.
 *
 * NEVER measure an ad impression — the SDK tracks those itself and a duplicate
 * corrupts the report.
 */
export const pokiMeasure = (category: string, what: string, action: string): void => {
  const sdk = getSdk()
  if (!sdk) return
  if ([category, what, action].some((v) => MEASURE_FORBIDDEN.test(v))) {
    warn('measure() args cannot contain "/" or "^" —', category, what, action)
    return
  }
  try {
    sdk.measure(category, what, action)
  } catch (e) {
    warn('measure threw', e)
  }
}

/** Feeds P4D's 24-hour Error Scanner. Wired to the app's global error handlers
 *  in `main.ts`. Must never throw — it runs from inside an error path. */
export const pokiCaptureError = (err: unknown): void => {
  const sdk = getSdk()
  if (!sdk) return
  try {
    sdk.captureError(err)
  } catch { /* swallow: never fail while reporting */
  }
}

/**
 * Move Poki's mobile nav pill off the game's top HUD. The pill is 46×62 px on
 * narrow screens / 92×64 px on wide ones and sits at the top of the canvas;
 * the platform default is `movePill(0, 24)`. Implemented as a
 * `window.top.postMessage`, so it silently no-ops outside the Poki wrapper —
 * harmless in the Inspector and in dev.
 */
export const pokiMovePill = (topPercent: number, topPx: number): void => {
  const sdk = getSdk()
  if (!sdk) return
  try {
    sdk.movePill(Math.min(50, Math.max(0, topPercent)), topPx)
  } catch (e) {
    warn('movePill threw', e)
  }
}
