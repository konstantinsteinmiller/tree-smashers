// ─── Playgama Bridge plugin (SDK v2) ───────────────────────────────────────
//
// Wires the Playgama Bridge into chaos-arena's mute / pause / ad-cadence
// machinery. The Bridge is a unified abstraction over 25+ portals; it
// auto-detects the host from the parent-frame handshake and the URL, so we DO
// NOT pass `forciblySetPlatformId` — forcing an id breaks every context except
// the one chosen at build time (production portal, QA Tool, YouTube, …).
//
// ─── v1 → v2 migration (2026-09-04) ────────────────────────────────────────
//
// Playgama QA rejected the YouTube submission with "game does not start in two
// of three testing environments; in the one where it starts, it does not save
// properly — please update Bridge to v2". Four things changed here:
//
//   1. SOURCE. v1 came from a `<script src="https://bridge.playgama.com/...">`
//      tag; v2 comes from the `@playgama/bridge` npm package via
//      `playgamaBridgeLoader.ts`. The CDN build could never satisfy YouTube's
//      "no external calls" rule — it is a webpack bundle with
//      `publicPath = bridge.playgama.com/v1/stable/` that fetches its
//      per-platform adapter chunks at runtime and posts to `api.playgama.com`.
//      The npm build is one self-contained file with no chunk loading.
//
//   2. EVENTS. v1 subscribed on the sub-modules (`bridge.platform.on(...)`,
//      `bridge.advertisement.on(...)`) and `on()` returned an unsubscribe
//      function. In v2 `on()` returns VOID — you must call `off(name, cb)`
//      with the same callback reference. Getting this wrong leaks a listener
//      per ad shown, and the leaked listeners resolve LATER ads early.
//
//   3. STORAGE. The storage-type parameter is gone. v1 had to probe
//      `storage.isAvailable('platform_internal')` and pass a type to every
//      call; v2 picks cloud-vs-local itself. See `PlaygamaStrategy`.
//
//   4. `bridge.game` IS GONE. `setLoadingProgress` moved to
//      `bridge.setGameLoadingProgress(percent)` on the root object.
//
// The YouTube adapter additionally waits for `window.ytgame` with a poll that
// has NO timeout, so index.html must carry YouTube's own SDK tag on that build
// (vite.config.ts strips it everywhere else). Without it `initialize()` never
// settles — a very plausible reading of "the game does not start". Our own
// `INIT_TIMEOUT_MS` race is the backstop that keeps the splash from hanging
// regardless.
//
// Pause / audio wiring:
//   • PAUSE_STATE_CHANGED  — aggregated pause signal (visibility, ads,
//                            platform). Drives bgmusic pause/continue.
//   • AUDIO_STATE_CHANGED  — audio toggle from the portal chrome. This is a
//                            MUTE, not a pause: it drives `applyMute` in
//                            App.vue, never the pause path.
//   • VISIBILITY_STATE_CHANGED — backup signal in case PAUSE_STATE_CHANGED
//                                isn't emitted for tab hide on some portals.
//
// Ad show events flip `isPlaygamaAdShowing` only — never re-route into
// pauseMusic directly. Pause already comes via PAUSE_STATE_CHANGED above
// (the Bridge merges interstitial state into it), so a second subscription
// would double-pause and never resume.
//
// Rewarded grant rule: grant on the `'rewarded'` edge, NOT on `'closed'`.
// Playgama's docs explicitly note `'rewarded'` can fire BEFORE `'closed'`.
// Granting on `'closed'` alone is a certification-graded violation.

import { ref } from 'vue'
import { toShippedLocale } from '@/i18n'
import { loadPlaygamaBridge, type Bridge } from '@/utils/playgamaBridgeLoader'

const INIT_TIMEOUT_MS = 15_000

// ─── v2 event / message names ──────────────────────────────────────────────
// Hard-coded rather than read off `bridge.EVENT_NAME` so the values are
// greppable and usable before `initialize()` resolves. They match
// `@playgama/bridge`'s exported constants exactly; the package also ships them
// at `@playgama/bridge/constants`, but importing that would pull a second
// module into every build's graph for nine string literals.
const EVENT = {
  PAUSE_STATE_CHANGED: 'pause_state_changed',
  AUDIO_STATE_CHANGED: 'audio_state_changed',
  VISIBILITY_STATE_CHANGED: 'visibility_state_changed',
  INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
  REWARDED_STATE_CHANGED: 'rewarded_state_changed'
} as const

const MESSAGE = {
  GAME_READY: 'game_ready',
  IN_GAME_LOADING_STARTED: 'in_game_loading_started',
  IN_GAME_LOADING_STOPPED: 'in_game_loading_stopped',
  GAMEPLAY_STARTED: 'gameplay_started',
  GAMEPLAY_STOPPED: 'gameplay_stopped'
} as const

// Reactive surface consumed by `PlaygamaProvider` and `App.vue`.
export const isPlaygamaSdkActive = ref(false)
export const isPlaygamaAdsBlocked = ref(false)
export const isPlaygamaAdShowing = ref(false)
export const playgamaLocale = ref<string | null>(null)
export const playgamaDetectedId = ref<string | null>(null)

// ─── Platform audio / pause state ──────────────────────────────────────────
//
// Both are graded by Playgama certification and both were once funnelled into
// a single `setPaused()` — i.e. they only ever paused the BACKGROUND MUSIC:
//
//   • "The game does not respond to the platform mute request." Muting is not
//     pausing: SFX kept playing at full volume through the portal's mute, and
//     unmuting could not restore anything because nothing had been muted.
//     `isPlaygamaAudioEnabled` drives the real global mute (App.vue →
//     `applyMute`), which zeroes both volume refs — every SFX gain and the
//     music element derive from those.
//
//   • "The game continues running when a system overlay is opened. Subscribe
//     to the SDK pause event and stop the game loop." Pausing the music is not
//     stopping the loop: physics kept simulating under the overlay.
//     `isPlaygamaPaused` additionally drives the game-loop suspend.
//
// `isAudioEnabled` defaults to true and `isPaused` to false so a non-Playgama
// build (where nothing ever writes these) is never accidentally muted/frozen.
export const isPlaygamaAudioEnabled = ref(true)
export const isPlaygamaPaused = ref(false)

let sdk: Bridge | null = null
let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false
let heldPause = false
let platformPaused = false
let visibilityHidden = false

/** Raw Bridge handle for `PlaygamaStrategy`. Null until `playgamaPlugin()`
 *  has resolved AND `initialize()` actually succeeded. */
export const getPlaygamaBridge = (): Bridge | null => sdk

// ─── Portal language ───────────────────────────────────────────────────────
//
// `bridge.platform.language` is an ISO 639-1 code taken from the host platform
// (falling back to browser language), readable AFTER `initialize()` resolves.
// It is the source language for our i18n:
// https://wiki.playgama.com/playgama/bridge-sdk/api/platform
//
// Playgama QA reported "the language parameter was ignored on initialization"
// for Chinese TWICE. The contributing defects, and where each is now handled:
//
//   1. Tag width. The Bridge passes portal values through, so `zh-CN`,
//      `zh-Hant`, `ja`, `ko` and 3-letter ISO 639-2 codes all show up. Our
//      internal codes are `zh`/`jp`/`kr`, so a bare `split('-')[0]` left `ja`
//      as `ja` — not in `LANGUAGES` — and Japanese fell back to English too.
//      → `normalizePlaygamaLanguage` below returns null rather than an
//        unshipped code.
//
//   2. Timing. `platform.language` is only readable post-init, which is after
//      `main.ts` wants to build the i18n instance. → the `localeReady` gate
//      below, plus a `watch(playgamaLocale)` in `main.ts` for the late answer.
//
//   3. Persistence — the reason the SECOND report happened. `main.ts` used to
//      seed the portal locale into `spinner_user_language`, the same key that
//      holds the player's explicit OptionsModal choice. One load that missed
//      the portal answer wrote a value that then out-ranked every later
//      correct answer, and the cloud strategy synced that poisoned state to
//      every other device. → the portal locale is applied to the live ref and
//      i18n ONLY, never written to storage. See `main.ts`.

/**
 * Returns an internal locale code that is guaranteed to be SHIPPED, or `null`
 * when the portal's language is one we do not ship.
 *
 * Delegates to the shared normaliser (`src/i18n/languages.ts`), which every
 * platform's language signal goes through. It keeps region and script
 * subtags where we ship a variant (`pt-BR` / `pt-PT`, `zh-Hant` / `zh-TW` /
 * `zh-HK` → Traditional), maps ISO 639-2 and legacy codes (`ja` / `jpn` →
 * `jp`, `ua` → `uk`), and falls back to the nearest shipped sibling
 * (Traditional → Simplified) before giving up.
 *
 * Returning `null` (rather than an unsupported code) is load-bearing: every
 * consumer treats a non-null value as "safe to apply", so an unshipped
 * language can never knock the player out of their stored choice.
 */
export const normalizePlaygamaLanguage = (raw: string): string | null => toShippedLocale(raw)

// Last raw tag we logged. The poll below runs every 2s, so logging is
// change-only — otherwise DevTools fills with identical lines and the QA
// console becomes useless for spotting the events that matter.
let lastLoggedLanguageTag: string | null = null

/**
 * Read `platform.language` off the given bridge and publish it to
 * `playgamaLocale`.
 *
 * Takes the handle as a parameter rather than reading the module-level `sdk`
 * so the failure path can still recover a language from a bridge whose
 * `initialize()` rejected — `sdk` stays null there on purpose, so nothing else
 * starts using a half-initialized SDK.
 *
 * Never clears a previously-resolved value: a later empty read must not undo
 * an earlier good one.
 */
const readPortalLanguage = (bridge: Bridge | null = sdk): void => {
  try {
    const raw = bridge?.platform?.language
    if (typeof raw !== 'string' || raw.length === 0) {
      if (lastLoggedLanguageTag !== '') {
        lastLoggedLanguageTag = ''
        console.info('[playgama] portal reported no language — keeping stored/browser locale')
      }
      return
    }
    const code = normalizePlaygamaLanguage(raw)
    if (raw !== lastLoggedLanguageTag) {
      lastLoggedLanguageTag = raw
      console.info('[playgama] portal language:', raw, '→', code ?? '(unsupported, ignored)')
    }
    if (code) playgamaLocale.value = code
  } catch (e) {
    console.warn('[playgama] platform.language read threw', e)
  }
}

/**
 * Poll `platform.language` for a mid-session switch.
 *
 * The Bridge exposes NO language-change event (confirmed against the v2
 * platform API), and the docs assume a single read at startup — fine when the
 * portal reloads the frame on a language change. Playgama's guided testing
 * tools can flip the language without a reload, and with no event to subscribe
 * to a poll is the only way to notice.
 *
 * The cost is a property read plus a string compare, skipped entirely while
 * the document is hidden. `playgamaLocale` is a ref, so a detected change
 * flows straight into the `watch` in `main.ts`.
 */
const LANGUAGE_POLL_MS = 2000
let languagePollId: ReturnType<typeof setInterval> | null = null

const startLanguageWatch = (): void => {
  if (languagePollId !== null || typeof window === 'undefined') return
  languagePollId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    readPortalLanguage()
  }, LANGUAGE_POLL_MS)
  window.addEventListener('focus', () => readPortalLanguage())
}

// Resolves as soon as we know whether the portal has a language for us —
// either because `initialize()` finished, or because it failed / timed out.
// `main.ts` races this against a short budget so a slow or unreachable
// Bridge can never hold up first paint.
let resolveLocaleReady: () => void = () => {
}
export const playgamaLocaleReady: Promise<void> = new Promise((resolve) => {
  resolveLocaleReady = resolve
})

// ─── Music pause bridge ─────────────────────────────────────────────────────
// `useMusic()` lives in a singleton composable. App.vue hands us the live
// controls so this module never imports `useSound` (which would re-introduce
// the useSound ↔ useUser ↔ useMatch circular-import deadlock).
type MusicControls = { pauseMusic: () => void; continueMusic: () => void }
let musicHandle: MusicControls | null = null

export const registerPlaygamaMusicControls = (controls: MusicControls): void => {
  musicHandle = controls
}

/**
 * Recombine the two pause inputs and publish the result.
 *
 * `PAUSE_STATE_CHANGED` is already the Bridge's aggregated signal, but not
 * every host portal emits it for a plain tab-hide, so `VISIBILITY_STATE_CHANGED`
 * is kept as a second input. OR-ing them here (rather than letting each
 * subscriber call `setPaused` directly) is what stops a visibility event from
 * resuming a platform pause that is still active — the old code could resume
 * the music *underneath* an open interstitial.
 */
const syncPauseState = (): void => {
  const paused = platformPaused || visibilityHidden
  // Drives the game-loop suspend via App.vue. Assigned unconditionally so a
  // late subscriber still observes the current value.
  isPlaygamaPaused.value = paused
  if (paused === heldPause) return
  heldPause = paused
  if (!musicHandle) return
  if (paused) musicHandle.pauseMusic()
  else musicHandle.continueMusic()
}

/**
 * Read `platform.isAudioEnabled`. This is the CURRENT audio permission state
 * and must be read manually on game start — `AUDIO_STATE_CHANGED` only fires
 * on subsequent changes, so a player who arrives with the portal already muted
 * would never be muted at all if we relied on the event alone. That is exactly
 * the failure Playgama QA reported.
 */
const readPlatformAudioState = (): void => {
  try {
    const enabled = sdk?.platform?.isAudioEnabled
    if (typeof enabled === 'boolean') {
      isPlaygamaAudioEnabled.value = enabled
      console.info('[playgama] initial platform audio enabled:', enabled)
    }
  } catch (e) {
    console.warn('[playgama] isAudioEnabled read threw', e)
  }
}

// ─── Public init ────────────────────────────────────────────────────────────

export const playgamaPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const bridge = await loadPlaygamaBridge()
    if (!bridge) {
      isPlaygamaAdsBlocked.value = true
      resolveLocaleReady()
      return
    }

    try {
      // The timeout is not belt-and-braces. The Bridge's YouTube adapter waits
      // for `window.ytgame` with an un-timed 100ms poll, so a build that
      // reaches Playables without YouTube's own SDK tag would hang here
      // forever and the splash would never clear.
      await Promise.race([
        bridge.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
        )
      ])
      sdk = bridge
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge.platform?.id ?? null
      // Mirror onto `window` for `bootDiagnostics`. That module is in every
      // build's entry graph, so it must not import this one — see the rules
      // at the top of `bootDiagnostics.ts`. One assignment here is the whole
      // price of having "which portal did the Bridge think it was on?" in the
      // diagnostic snapshot.
      try {
        ;(window as any).__playgamaPlatformId = playgamaDetectedId.value
      } catch { /* non-fatal */
      }
      console.info(
        '[playgama] Bridge v%s initialized — platform.id: %s',
        bridge.version,
        playgamaDetectedId.value
      )

      // Per the Bridge docs: "Read this after initialization and use it as
      // the source language for your localization system."
      readPortalLanguage(bridge)
      // Same rule for audio: the initial value must be read manually on game
      // start — `AUDIO_STATE_CHANGED` only covers subsequent changes.
      readPlatformAudioState()
      // Resolve the locale gate regardless of the outcome so `main.ts` stops
      // waiting the moment we know the answer (or know there is not one).
      resolveLocaleReady()

      // v2: every module forwards its events onto the bridge root, and `on()`
      // returns void (v1 returned an unsubscribe function). Subscribing at the
      // root keeps one surface for all five events.
      bridge.on(EVENT.PAUSE_STATE_CHANGED, (isPaused: boolean) => {
        platformPaused = !!isPaused
        syncPauseState()
      })
      // Certification-graded: obey the platform mute. This is a MUTE, not a
      // pause — routing it into the pause path leaves every SFX audible and
      // makes unmute a no-op.
      bridge.on(EVENT.AUDIO_STATE_CHANGED, (isEnabled: boolean) => {
        isPlaygamaAudioEnabled.value = isEnabled !== false
        readPortalLanguage(bridge)
      })
      bridge.on(EVENT.VISIBILITY_STATE_CHANGED, (state: string) => {
        visibilityHidden = state === 'hidden'
        syncPauseState()
        readPortalLanguage(bridge)
      })
      startLanguageWatch()

      bridge.on(EVENT.INTERSTITIAL_STATE_CHANGED, (state: string) => {
        if (state === 'opened' || state === 'loading') isPlaygamaAdShowing.value = true
        else if (state === 'closed' || state === 'failed') isPlaygamaAdShowing.value = false
      })
      bridge.on(EVENT.REWARDED_STATE_CHANGED, (state: string) => {
        if (state === 'opened' || state === 'loading') isPlaygamaAdShowing.value = true
        else if (state === 'closed' || state === 'failed') isPlaygamaAdShowing.value = false
        // 'rewarded' is the grant edge — handled in `showRewardedPG()`.
      })

      // Catch an interstitial that may have opened pre-init.
      if (bridge.advertisement?.interstitialState === 'opened') {
        isPlaygamaAdShowing.value = true
        platformPaused = true
        syncPauseState()
      }
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
      // A rejected / timed-out `initialize()` must NOT cost us the language.
      // The Bridge documents a browser-language fallback for
      // `platform.language`, and it is frequently readable even when the
      // portal handshake never completed. Ads are lost here; localisation need
      // not be. `sdk` deliberately stays null so no other caller starts using
      // a half-initialized SDK, hence the explicit handle.
      readPortalLanguage(bridge)
    } finally {
      // Unblock the boot-locale race on every exit path — a Bridge that
      // never answers must not leave `main.ts` waiting on a dead promise.
      resolveLocaleReady()
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ────────────────────────────────────────────────────

const sendMessage = (name: string, params?: Record<string, unknown>): void => {
  try {
    // v2 `sendMessage` returns a promise that rejects on portals which do not
    // implement the message. That is not a game-facing failure.
    const result = sdk?.platform?.sendMessage?.(name, params)
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {
      })
    }
  } catch (e) {
    console.warn('[playgama] sendMessage failed', e)
  }
}

export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STARTED)
}

export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STOPPED)
  if (gameReadySent) return
  gameReadySent = true
  // Certification-mandatory, and required step 5 of the v2 API docs: "call
  // platform.sendMessage('game_ready') when the first playable frame loads".
  // Playgama explicitly rejects submissions that never fire it.
  sendMessage(MESSAGE.GAME_READY)
}

export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage(MESSAGE.GAMEPLAY_STARTED)
}

export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage(MESSAGE.GAMEPLAY_STOPPED)
}

/**
 * Report load progress to the portal. v2 moved this off the deleted
 * `bridge.game` module onto the root object.
 */
export const playgamaSetLoadingProgress = (percent: number): void => {
  try {
    sdk?.setGameLoadingProgress?.(percent)
  } catch (e) {
    console.warn('[playgama] setGameLoadingProgress failed', e)
  }
}

// ─── Ad show wrappers ──────────────────────────────────────────────────────
//
// v2 CHANGE: `on()` returns void. v1 handed back an unsubscribe function and
// these wrappers called it; keeping that shape would leak one listener per ad
// shown, and the leaked listeners would resolve LATER ads early. Unsubscribe
// with `off(name, sameCallbackReference)` instead.

export const showInterstitialPG = (): Promise<void> => {
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showInterstitial) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const onState = (state: string): void => {
      if (settled) return
      if (state !== 'closed' && state !== 'failed') return
      settled = true
      bridge.off(EVENT.INTERSTITIAL_STATE_CHANGED, onState)
      resolve()
    }
    bridge.on(EVENT.INTERSTITIAL_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showInterstitial()
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      if (!settled) {
        settled = true
        bridge.off(EVENT.INTERSTITIAL_STATE_CHANGED, onState)
        resolve()
      }
    }
  })
}

export const showRewardedPG = (): Promise<boolean> => {
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showRewarded) {
    return Promise.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    const onState = (state: string): void => {
      if (settled) return
      // Grant on the 'rewarded' edge — it can arrive BEFORE 'closed', and
      // waiting for 'closed' alone is a certification-graded violation.
      if (state === 'rewarded') {
        rewarded = true
        return
      }
      if (state !== 'closed' && state !== 'failed') return
      settled = true
      bridge.off(EVENT.REWARDED_STATE_CHANGED, onState)
      resolve(rewarded)
    }
    bridge.on(EVENT.REWARDED_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showRewarded()
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      if (!settled) {
        settled = true
        bridge.off(EVENT.REWARDED_STATE_CHANGED, onState)
        resolve(rewarded)
      }
    }
  })
}

// NOTE: this file MUST stay free of `import('...')` expressions. The
// obfuscator's `stringArray` transform mangles dynamic-import specifiers, and
// the browser then fails to resolve them at runtime. The Bridge import lives
// in `playgamaBridgeLoader.ts` and the save-strategy factory in
// `resolveSaveStrategy.ts` — both are on the obfuscator's exclude list.
