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

const SDK_SRC = 'https://bridge.playgama.com/v1/stable/playgama-bridge.js'
const INIT_TIMEOUT_MS = 15_000

// Reactive surface consumed by `PlaygamaProvider` and `App.vue`.
export const isPlaygamaSdkActive = ref(false)
export const isPlaygamaAdsBlocked = ref(false)
export const isPlaygamaAdShowing = ref(false)
export const playgamaLocale = ref<string | null>(null)
export const playgamaDetectedId = ref<string | null>(null)

let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false
let heldPause = false
let visibilityHidden = false

// ─── Portal language ───────────────────────────────────────────────────────
//
// Playgama QA (2026-08) reported "the language parameter was ignored on
// initialization" for Chinese. Two separate bugs caused it:
//
//   1. `main.ts` only ever consumed `crazyLocale` when picking the boot
//      locale — `playgamaLocale` was exported here and read by nobody.
//   2. The Bridge reports a BCP-47 tag (`zh-CN`, `zh-Hans`, `ja`, `ko`,
//      `pt-BR`, …) but this project's internal codes are `zh`, `jp`, `kr`.
//      A bare `split('-')[0]` turned `ja` into `ja`, which is not in
//      `LANGUAGES`, so Japanese silently fell back to English too.
//
// `normalizePlaygamaLanguage` fixes (2); the `localeReady` gate below fixes
// the timing half of (1) — `bridge.platform.language` only becomes readable
// after `bridge.initialize()` resolves, which is *after* `main.ts` needs to
// build the i18n instance.

/** BCP-47 (or portal-specific) tag → the internal code used by `LANGUAGES`. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ja: 'jp',
  jpn: 'jp',
  ko: 'kr',
  kor: 'kr',
  zh: 'zh',
  cmn: 'zh',
  chi: 'zh',
  zho: 'zh'
}

export const normalizePlaygamaLanguage = (raw: string): string | null => {
  const base = raw.toLowerCase().split(/[-_]/)[0]
  if (!base) return null
  return LANGUAGE_ALIASES[base] ?? base
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

const setPaused = (paused: boolean): void => {
  if (paused === heldPause) return
  heldPause = paused
  const controls = getMusicControls()
  if (!controls) return
  if (paused) controls.pauseMusic()
  else if (!visibilityHidden) controls.continueMusic()
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

      const lang = bridge?.platform?.language
      if (typeof lang === 'string' && lang.length > 0) {
        playgamaLocale.value = normalizePlaygamaLanguage(lang)
        console.info('[playgama] portal language:', lang, '→', playgamaLocale.value)
      } else {
        console.info('[playgama] portal reported no language — keeping stored/browser locale')
      }
      // Resolve the locale gate regardless of the outcome so `main.ts` stops
      // waiting the moment we know the answer (or know there isn't one).
      resolveLocaleReady()

      const ev = bridge?.EVENT_NAME ?? {}
      const pauseEventName = ev.PAUSE_STATE_CHANGED ?? 'pause_state_changed'
      const audioEventName = ev.AUDIO_STATE_CHANGED ?? 'audio_state_changed'
      const visibilityEventName = ev.VISIBILITY_STATE_CHANGED ?? 'visibility_state_changed'
      const interstitialEventName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
      const rewardedEventName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'

      bridge.platform?.on?.(pauseEventName, (isPaused: boolean) => setPaused(!!isPaused))
      bridge.platform?.on?.(audioEventName, (isEnabled: boolean) => {
        if (isEnabled === false) setPaused(true)
        else if (heldPause && !visibilityHidden) setPaused(false)
      })
      bridge.platform?.on?.(visibilityEventName, (state: string) => {
        visibilityHidden = state === 'hidden'
        setPaused(visibilityHidden)
      })
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
        setPaused(true)
      }
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
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
