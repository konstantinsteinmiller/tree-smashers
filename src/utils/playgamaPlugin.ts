// ─── Playgama Bridge plugin ────────────────────────────────────────────────
//
// Loads the Playgama Bridge SDK (`window.bridge`, alias `window.playgamaBridge`)
// and wires it into chaos-arena's existing music-pause / ad-cadence
// machinery. The Bridge is a unified abstraction over 28+ portals — for the
// production Playgama portal, `bridge.platform.id === 'playgama'`; the same
// CDN script is also what runs inside the Playgama developer QA tool. We
// rely on the Bridge's built-in auto-detection per parent-frame handshake
// and DO NOT pass `forciblySetPlatformId` — see `vite.config.ts` for why.
//
// Pause / audio wiring:
//   • PAUSE_STATE_CHANGED  — aggregated pause signal (visibility, ads,
//                            platform). Drives bgmusic pause/continue.
//   • AUDIO_STATE_CHANGED  — audio toggle from the portal chrome. Routed
//                            into the same pause path: muted ≈ paused, so
//                            the SFX / music respect the host's mute UI.
//   • VISIBILITY_STATE_CHANGED — backup signal in case PAUSE_STATE_CHANGED
//                                isn't emitted for tab hide on some portals.
//
// Ad show events flip `isPlaygamaAdShowing` only — never re-route into
// pauseMusic directly. Pause already comes via PAUSE_STATE_CHANGED above
// (the Bridge's StateAggregator merges interstitial state into it), so a
// second subscription would double-pause and never resume.
//
// Rewarded grant rule: grant on the `'rewarded'` edge, NOT on `'closed'`.
// Playgama's docs explicitly note `'rewarded'` can fire BEFORE `'closed'`.
// Granting on `'closed'` alone is a certification-graded violation.

import { ref } from 'vue'
import { LANGUAGES } from '@/utils/enums'

const SDK_SRC = 'https://bridge.playgama.com/v1/stable/playgama-bridge.js'
const INIT_TIMEOUT_MS = 15_000

// Reactive surface consumed by `PlaygamaProvider` and `App.vue`.
export const isPlaygamaSdkActive = ref(false)
export const isPlaygamaAdsBlocked = ref(false)
export const isPlaygamaAdShowing = ref(false)
export const playgamaLocale = ref<string | null>(null)
export const playgamaDetectedId = ref<string | null>(null)

// ─── Platform audio / pause state ──────────────────────────────────────────
//
// Both are graded by Playgama certification and both were previously funnelled
// into `setPaused()` — i.e. they only ever paused the BACKGROUND MUSIC:
//
//   • "The game does not respond to the platform mute request." Muting is not
//     pausing: SFX kept playing at full volume through the portal's mute, and
//     unmuting could not restore anything because nothing had been muted.
//     `isPlaygamaAudioEnabled` now drives the real global mute (App.vue →
//     `applyMute`), which zeroes both volume refs — every SFX gain and the
//     music element derive from those.
//
//   • "The game continues running when a system overlay is opened. Subscribe
//     to the SDK pause event and stop the game loop." Pausing the music is not
//     stopping the loop: physics kept simulating under the overlay.
//     `isPlaygamaPaused` now additionally drives `setPhysicsSuspended`.
//
// `isAudioEnabled` defaults to true and `isPaused` to false so a non-Playgama
// build (where nothing ever writes these) is never accidentally muted/frozen.
export const isPlaygamaAudioEnabled = ref(true)
export const isPlaygamaPaused = ref(false)

let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false
let heldPause = false
let platformPaused = false
let visibilityHidden = false

// ─── Portal language ───────────────────────────────────────────────────────
//
// Per the Bridge docs, `bridge.platform.language` is an ISO 639-1 code taken
// from the host platform (falling back to browser language), and must be read
// AFTER `initialize()` resolves — it is the source language for our i18n:
// https://wiki.playgama.com/playgama/bridge-sdk/api/platform#language
//
// Playgama QA reported "the language parameter was ignored on initialization"
// for Chinese TWICE. The contributing defects, and where each is now handled:
//
//   1. Tag width. The Bridge passes portal values through, so `zh-CN`,
//      `zh-Hant`, `ja`, `ko` and 3-letter ISO 639-2 codes all show up. Our
//      internal codes are `zh`/`jp`/`kr`, so a bare `split('-')[0]` left `ja`
//      as `ja` — not in `LANGUAGES` — and Japanese fell back to English too.
//      → `normalizePlaygamaLanguage` below, which now returns null rather
//        than an unshipped code.
//
//   2. Timing. `platform.language` is only readable post-init, which is after
//      `main.ts` wants to build the i18n instance. → the `localeReady` gate
//      below, plus a `watch(playgamaLocale)` in `main.ts` for the late answer.
//      (In practice `PlaygamaStrategy.hydrate()` already awaits this same
//      plugin singleton during `saveManager.init()`, so the gate is usually
//      settled before `main.ts` even asks.)
//
//   3. Persistence — the reason the SECOND report happened. `main.ts` used to
//      seed the portal locale into `spinner_user_language`, the same key that
//      holds the player's explicit OptionsModal choice. One load that missed
//      the portal answer wrote a value that then out-ranked every later
//      correct answer, and the cloud strategy synced that poisoned state to
//      every other device. → the portal locale is now applied to the live ref
//      and i18n ONLY, never written to storage. See `main.ts`.

/**
 * BCP-47 / ISO-639 tag → the internal code used by `LANGUAGES`.
 *
 * The Bridge documents `platform.language` as ISO 639-1 ("ru", "en"), but the
 * value is passed through from 28+ host portals and several of them hand back
 * a full BCP-47 tag or a 3-letter ISO 639-2 code instead. We therefore accept
 * both widths and normalise on the base subtag.
 *
 * Script subtags are deliberately collapsed: we only ship a Simplified
 * Chinese bundle, so `zh-Hant` / `zh-TW` / `zh-HK` resolve to `zh` too —
 * Traditional readers get Simplified rather than the English fallback, which
 * is the strictly better outcome and what Playgama QA is checking for.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  ja: 'jp',
  jpn: 'jp',
  ko: 'kr',
  kor: 'kr',
  zh: 'zh',
  cmn: 'zh',
  chi: 'zh',
  zho: 'zh',
  eng: 'en',
  deu: 'de',
  ger: 'de',
  spa: 'es',
  fra: 'fr',
  fre: 'fr',
  rus: 'ru'
}

/**
 * Returns an internal locale code that is guaranteed to be in `LANGUAGES`,
 * or `null` when the portal's language is one we don't ship.
 *
 * Returning `null` (rather than an unsupported code) is load-bearing: every
 * consumer treats a non-null value as "safe to apply", so an unshipped
 * language can never knock the player out of their stored choice.
 */
export const normalizePlaygamaLanguage = (raw: string): string | null => {
  const base = raw.toLowerCase().trim().split(/[-_]/)[0]
  if (!base) return null
  const code = LANGUAGE_ALIASES[base] ?? base
  return LANGUAGES.includes(code) ? code : null
}

/**
 * Read `bridge.platform.language` and publish it to `playgamaLocale`.
 *
 * Wrapped in try/catch and callable more than once on purpose. `platform` is
 * a getter that throws "Before using the SDK you must initialize it" when
 * touched too early (the same trap `PlaygamaStrategy` documents for
 * `bridge.storage`), and we call this from the failure path too — a Bridge
 * whose `initialize()` rejected or timed out often still exposes the
 * browser-derived fallback language the docs promise.
 *
 * Never clears a previously-resolved value: a later empty read must not undo
 * an earlier good one.
 */
// Last raw tag we logged. The poll below runs every 2s, so logging is
// change-only — otherwise DevTools fills with identical lines and the QA
// console becomes useless for spotting the events that matter.
let lastLoggedLanguageTag: string | null = null

const readPortalLanguage = (): void => {
  try {
    const bridge = getBridge()
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
 * The Bridge exposes NO language-change event (confirmed against the platform
 * API reference), and the docs assume a single read at startup — which is fine
 * when the portal reloads the frame on a language change. Playgama's guided
 * testing tools can flip the language without a reload, and with no event to
 * subscribe to a poll is the only way to notice.
 *
 * The cost is a property read plus a string compare, skipped entirely while the
 * document is hidden. `playgamaLocale` is a ref, so a detected change flows
 * straight into the `watch` in `main.ts` — nothing else has to be re-plumbed.
 */
const LANGUAGE_POLL_MS = 2000
let languagePollId: ReturnType<typeof setInterval> | null = null

const startLanguageWatch = (): void => {
  if (languagePollId !== null || typeof window === 'undefined') return
  languagePollId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    readPortalLanguage()
  }, LANGUAGE_POLL_MS)
  window.addEventListener('focus', readPortalLanguage)
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

const getBridge = (): any =>
  typeof window === 'undefined' ? null : (window as any).bridge ?? (window as any).playgamaBridge ?? null

export const getPlaygamaBridge = (): any => getBridge()

// ─── Music pause bridge ─────────────────────────────────────────────────────
// `useMusic()` lives in a singleton composable. We resolve the handle lazily
// to avoid touching `useUser` at module-evaluation time (circular-import
// hazard documented in `useSound.ts`).
type MusicControls = { pauseMusic: () => void; continueMusic: () => void }
let musicHandle: MusicControls | null = null
const getMusicControls = (): MusicControls | null => {
  if (musicHandle) return musicHandle
  try {
    // Eager require pattern via static-equivalent dynamic — keeps the
    // dep-graph cycle-safe at boot. Plain dynamic import doesn't help
    // because we want a sync handle; the require-cache trick is enough.
    // Falls back to null if anything throws.
    const mod = (window as any).__useSoundModuleCache
    if (mod && typeof mod.useMusic === 'function') {
      musicHandle = mod.useMusic() as MusicControls
      return musicHandle
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Recombine the two pause inputs and publish the result.
 *
 * `PAUSE_STATE_CHANGED` is already the Bridge's aggregated signal, but not
 * every host portal emits it for a plain tab-hide, so `VISIBILITY_STATE_CHANGED`
 * is kept as a second input. OR-ing them here (rather than letting each
 * subscriber call `setPaused` directly, as before) is what stops a visibility
 * event from resuming a platform pause that is still active — the old code
 * could resume the music *underneath* an open interstitial.
 */
const syncPauseState = (): void => {
  const paused = platformPaused || visibilityHidden
  // Drives the game-loop suspend via App.vue. Assigned unconditionally so a
  // late subscriber still observes the current value.
  isPlaygamaPaused.value = paused
  if (paused === heldPause) return
  heldPause = paused
  const controls = getMusicControls()
  if (!controls) return
  if (paused) controls.pauseMusic()
  else controls.continueMusic()
}

/**
 * Read `bridge.platform.isAudioEnabled`. Per the docs this is the CURRENT
 * audio permission state and "must be read manually on game start" — the
 * `AUDIO_STATE_CHANGED` event only fires on subsequent changes, so a player
 * who arrives with the portal already muted would never be muted at all if we
 * relied on the event alone. That is exactly the reported failure.
 */
const readPlatformAudioState = (): void => {
  try {
    const enabled = getBridge()?.platform?.isAudioEnabled
    if (typeof enabled === 'boolean') {
      isPlaygamaAudioEnabled.value = enabled
      console.info('[playgama] initial platform audio enabled:', enabled)
    }
  } catch (e) {
    console.warn('[playgama] isAudioEnabled read threw', e)
  }
}

/**
 * Allow consumers (App.vue) to register the live `useMusic()` controls.
 * Called once at app mount so the plugin doesn't have to import useSound
 * directly (avoids the useSound ↔ useUser ↔ useMatch cycle).
 */
export const registerPlaygamaMusicControls = (controls: MusicControls): void => {
  musicHandle = controls
}

// ─── SDK script loader ─────────────────────────────────────────────────────
// Build-time tag injection happens via index.html for `pnpm build:playgama`;
// for dev / non-Playgama-mode reruns, we lazily inject the script if missing.

let scriptInjectPromise: Promise<any> | null = null
const ensureSdkLoaded = (): Promise<any> => {
  if (scriptInjectPromise) return scriptInjectPromise
  scriptInjectPromise = new Promise((resolve) => {
    const existing = getBridge()
    if (existing) {
      resolve(existing)
      return
    }
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }
    const tag = document.createElement('script')
    tag.src = SDK_SRC
    tag.async = false
    tag.onload = () => resolve(getBridge())
    tag.onerror = () => {
      console.warn('[playgama] SDK script failed to load — ads disabled')
      resolve(null)
    }
    document.head.appendChild(tag)
    // Hard ceiling in case neither onload nor onerror fires (some QA
    // sandboxes intercept the request and never respond).
    setTimeout(() => resolve(getBridge()), 10_000)
  })
  return scriptInjectPromise
}

// ─── Public init ────────────────────────────────────────────────────────────

export const playgamaPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const sdkRoot = await ensureSdkLoaded()
    if (!sdkRoot) {
      isPlaygamaAdsBlocked.value = true
      resolveLocaleReady()
      return
    }
    const bridge = getBridge()
    if (!bridge || typeof bridge.initialize !== 'function') {
      console.warn('[playgama] bridge object missing initialize()')
      isPlaygamaAdsBlocked.value = true
      resolveLocaleReady()
      return
    }
    try {
      await Promise.race([
        bridge.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
        )
      ])
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge?.platform?.id ?? null
      console.info('[playgama] initialized — platform.id:', playgamaDetectedId.value)

      // Per the Bridge docs: "Read this after initialization and use it as
      // the source language for your localization system."
      readPortalLanguage()
      // Same rule for audio: the initial value must be read manually on game
      // start — `AUDIO_STATE_CHANGED` only covers subsequent changes, so a
      // player entering an already-muted portal is only handled here.
      readPlatformAudioState()
      // Resolve the locale gate regardless of the outcome so `main.ts` stops
      // waiting the moment we know the answer (or know there isn't one).
      resolveLocaleReady()

      const ev = bridge?.EVENT_NAME ?? {}
      const pauseEventName = ev.PAUSE_STATE_CHANGED ?? 'pause_state_changed'
      const audioEventName = ev.AUDIO_STATE_CHANGED ?? 'audio_state_changed'
      const visibilityEventName = ev.VISIBILITY_STATE_CHANGED ?? 'visibility_state_changed'
      const interstitialEventName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
      const rewardedEventName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'

      // Certification-graded: stop the game loop while a system overlay is up.
      // `isPlaygamaPaused` is consumed by App.vue → `setPhysicsSuspended`.
      bridge.platform?.on?.(pauseEventName, (isPaused: boolean) => {
        platformPaused = !!isPaused
        syncPauseState()
      })
      // Certification-graded: obey the platform mute. This is a MUTE, not a
      // pause — routing it into the pause path (as this did) left every SFX
      // audible and made unmute a no-op.
      bridge.platform?.on?.(audioEventName, (isEnabled: boolean) => {
        isPlaygamaAudioEnabled.value = isEnabled !== false
        readPortalLanguage()
      })
      bridge.platform?.on?.(visibilityEventName, (state: string) => {
        visibilityHidden = state === 'hidden'
        syncPauseState()
        readPortalLanguage()
      })
      startLanguageWatch()
      bridge.advertisement?.on?.(interstitialEventName, (state: string) => {
        if (state === 'opened' || state === 'loading') isPlaygamaAdShowing.value = true
        else if (state === 'closed' || state === 'failed') isPlaygamaAdShowing.value = false
      })
      bridge.advertisement?.on?.(rewardedEventName, (state: string) => {
        if (state === 'opened' || state === 'loading') isPlaygamaAdShowing.value = true
        else if (state === 'closed' || state === 'failed') isPlaygamaAdShowing.value = false
        // 'rewarded' is the grant edge — handled in `showRewardedPG()`.
      })

      // Catch interstitials that may have opened pre-init.
      if (bridge.advertisement?.interstitialState === 'opened') {
        isPlaygamaAdShowing.value = true
        platformPaused = true
        syncPauseState()
      }
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
      // A rejected / timed-out `initialize()` must NOT cost us the language.
      // The Bridge documents a browser-language fallback for `platform
      // .language`, and it is frequently readable even when the portal
      // handshake never completed. Ads are lost here; localisation need not
      // be. Guarded internally, so a still-throwing getter is harmless.
      readPortalLanguage()
    } finally {
      // Unblock the boot-locale race on every exit path — a Bridge that
      // never answers must not leave `main.ts` waiting on a dead promise.
      resolveLocaleReady()
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ────────────────────────────────────────────────────

const sendMessage = (name: string, params?: any): void => {
  const bridge = getBridge()
  try {
    bridge?.platform?.sendMessage?.(name, params)
  } catch (e) {
    console.warn('[playgama] sendMessage failed', e)
  }
}

export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_started')
}

export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_stopped')
  if (gameReadySent) return
  gameReadySent = true
  // Certification-mandatory. Playgama explicitly rejects submissions
  // that never fire `game_ready`.
  sendMessage('game_ready')
}

export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage('gameplay_started')
}

export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage('gameplay_stopped')
}

// ─── Ad show wrappers ──────────────────────────────────────────────────────

export const showInterstitialPG = (): Promise<void> => {
  const bridge = getBridge()
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showInterstitial) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const ev = bridge?.EVENT_NAME ?? {}
    const interstitialEventName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
    const off = bridge.advertisement?.on?.(interstitialEventName, (state: string) => {
      if (settled) return
      if (state === 'closed' || state === 'failed') {
        settled = true
        try {
          off?.()
        } catch { /* ignore */
        }
        resolve()
      }
    })
    try {
      bridge.advertisement.showInterstitial()
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      if (!settled) {
        settled = true
        try {
          off?.()
        } catch { /* ignore */
        }
        resolve()
      }
    }
  })
}

export const showRewardedPG = (): Promise<boolean> => {
  const bridge = getBridge()
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showRewarded) {
    return Promise.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    const ev = bridge?.EVENT_NAME ?? {}
    const rewardedEventName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'
    const off = bridge.advertisement?.on?.(rewardedEventName, (state: string) => {
      if (settled) return
      if (state === 'rewarded') {
        rewarded = true
        return
      }
      if (state === 'closed' || state === 'failed') {
        settled = true
        try {
          off?.()
        } catch { /* ignore */
        }
        resolve(rewarded)
      }
    })
    try {
      bridge.advertisement.showRewarded()
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      if (!settled) {
        settled = true
        try {
          off?.()
        } catch { /* ignore */
        }
        resolve(rewarded)
      }
    }
  })
}

// NOTE: this file MUST stay free of `await import('@/...')` literals.
// `vite-plugin-javascript-obfuscator`'s `stringArray` transform mangles
// dynamic-import specifiers it sees here, and the browser then fails to
// resolve them at runtime. The save-strategy factory lives in
// `resolveSaveStrategy.ts` (which is on the obfuscator's exclude list)
// for the same reason.
