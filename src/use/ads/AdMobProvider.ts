// Google AdMob provider for the native (Tauri Android / iOS) build, wired
// through the Tauri plugin at `src-tauri/plugins/tauri-plugin-admob/`.
//
// ## Why this replaced LevelPlayProvider
//
// Google Play rejected com.tree.smashers (version codes 1000012 / 1000020) in
// 2026-09 under **Families Ad Format Requirements**: "Unclosable ads — ads
// interfere with app use and can't be closed after 5 seconds" and "Unclear
// ads/offers". Tree Smashers declares a child-directed audience, and the
// Families policy says that ads which interfere with normal app use —
// *including rewarded and opt-in ads* — must be closeable after 5 seconds.
//
// A mediation waterfall (LevelPlay/ironSource + Unity Ads + an AdMob adapter)
// gives the publisher no control over the winning creative at all, so the
// native build talks to Google's own SDK directly — AdMob is a Families
// Self-Certified Ads SDK — with no mediation adapters compiled in, and shows
// opt-in rewarded ads only.
//
// That did NOT settle it. Version code 1000024 shipped exactly this with a
// **rewarded interstitial** unit — Google's docs say those serve "only
// skippable ads" — and was rejected again: measured on device, the unit
// serves two-ad pods whose first close button appears 17–36 s in. Whether an
// ad is closeable after 5 seconds is Google's per-impression template choice;
// nothing in this file or in the request tags changes it.
//
// So ads on the native build stay OFF (`VITE_APP_SHOW_MEDIATOR_ADS=false`)
// until `tools/ad-closeability/measure.mjs` passes on the real ad unit — see
// `ADS_STATE.md` at the repo root for the measurements and the way back.
//
// ## Contract notes
//
//   • `showRewardedAd()` resolves `true` only when the SDK credited the
//     reward. A player who uses the ad's skip button resolves `false` and gets
//     nothing — that is the compliant path, not a bug.
//   • `showMidgameAd()` is a hard no-op. There is no interstitial code path in
//     the native plugin at all.
//   • Callers MUST show the rewarded-interstitial intro screen first. That is
//     handled centrally in `useAds.showRewardedAd()`, not here.
//
// App ID and ad unit IDs ship in the bundle from Vite env vars — they are
// public identifiers, not secrets.
import { ref } from 'vue'
// `@tauri-apps/api/core` is only meaningful inside a Tauri / native shell.
// On a web build this provider is never instantiated — it sits behind an
// `import.meta.env.VITE_APP_NATIVE === 'true'` gate in `resolveAdProvider`.
// A STATIC import of the package would nevertheless drag ~10KB of Tauri
// runtime globals into every web build's entry chunk. The build-time-gated
// ternary below makes the dynamic import reachable only on native builds, so
// Rollup eliminates both the call AND the tauri chunk everywhere else.
import type { invoke as TauriInvoke, addPluginListener as TauriAddPluginListener } from '@tauri-apps/api/core'
import type { AdProvider } from './types'

type TauriCore = { invoke: typeof TauriInvoke; addPluginListener: typeof TauriAddPluginListener }
let _tauriPromise: Promise<TauriCore> | null = null

const loadTauri: () => Promise<TauriCore> =
  import.meta.env.VITE_APP_NATIVE === 'true'
    ? () => {
      if (!_tauriPromise) {
        _tauriPromise = import('@tauri-apps/api/core').then((m) => ({
          invoke: m.invoke,
          addPluginListener: m.addPluginListener
        }))
      }
      return _tauriPromise
    }
    : () => Promise.reject(new Error('[ads/admob] @tauri-apps/api is only available on native builds'))

const invoke: typeof TauriInvoke = (async (...args: unknown[]) => {
  const t = await loadTauri()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t.invoke as any)(...args)
}) as unknown as typeof TauriInvoke

const addPluginListener: typeof TauriAddPluginListener = (async (...args: unknown[]) => {
  const t = await loadTauri()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t.addPluginListener as any)(...args)
}) as unknown as typeof TauriAddPluginListener

// Google's documented test ad unit IDs. They always fill, are not tied to our
// AdMob account, and generate no invalid traffic. Used only when
// `VITE_APP_ADS_TEST_ADS=true` — never as a silent production fallback,
// because serving test ads to real users would be ad-fraud-adjacent and earns
// nothing.
const TEST_REWARDED_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/5354046379'
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917'
const TEST_REWARDED_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/6978759866'

const useTestAds = import.meta.env.VITE_APP_ADS_TEST_ADS === 'true'

// Which AdMob format the ANDROID ad unit is. The two load through different
// SDK classes, so the unit ID and the format travel together: a "Rewarded"
// unit with `rewarded`, a "Rewarded interstitial" unit with anything else.
// iOS loads a rewarded interstitial whatever this says.
type AdMobFormat = 'rewarded' | 'rewarded_interstitial'
const androidFormat: AdMobFormat =
  import.meta.env.VITE_APP_ADMOB_ANDROID_FORMAT === 'rewarded' ? 'rewarded' : 'rewarded_interstitial'

const androidRewardedUnit =
  (androidFormat === 'rewarded'
    ? import.meta.env.VITE_APP_ADMOB_ANDROID_REWARDED_ID
    : import.meta.env.VITE_APP_ADMOB_ANDROID_REWARDED_INTERSTITIAL_ID) ?? ''
const iosRewardedUnit = import.meta.env.VITE_APP_ADMOB_IOS_REWARDED_INTERSTITIAL_ID ?? ''

const isReady = ref(false)
const isRewardedReady = ref(false)
// No interstitial exists on native. Kept as a permanently-false ref so the
// shared `AdProvider` surface stays uniform and the midgame ad placement in
// `SpinnerArena` short-circuits before it ever parks the game in 'ad_break'.
const isInterstitialReady = ref(false)
// AdMob is a native SDK — no browser extension layer can intercept its
// requests, so the ad-blocker flag stays false and `AdsBlockedModal` never
// fires on native. "No fill" surfaces through `isRewardedReady` instead.
const isAdsBlocked = ref(false)
let initStarted = false

// On-screen debug surface — rendered by `NativeAdsDebugOverlay.vue`.
// Module-level so it's a singleton any component can read. Mobile builds have
// no reachable JS console, so this is the only way to diagnose init/load
// failures from a sideloaded APK or a TestFlight build.
type AdMobInitState = 'idle' | 'no-ad-unit' | 'starting' | 'ready' | 'failed'
export const adMobDebug = ref({
  platform: 'unknown' as 'android' | 'ios' | 'other' | 'unknown',
  adFormat: 'rewarded_interstitial' as AdMobFormat,
  adUnitConfigured: false,
  usingTestAds: useTestAds,
  initState: 'idle' as AdMobInitState,
  initError: '' as string,
  lastRewardedShowError: '' as string,
  events: [] as string[]
})

const stamp = (): string => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
const logDebug = (msg: string): void => {
  const line = `${stamp()} ${msg}`
  // Replace the ref with a new object so Vue picks up the change.
  adMobDebug.value = {
    ...adMobDebug.value,
    events: [...adMobDebug.value.events, line].slice(-12)
  }
}
const setDebug = (patch: Partial<typeof adMobDebug.value>): void => {
  adMobDebug.value = { ...adMobDebug.value, ...patch }
}

const detectPlatform = (): 'android' | 'ios' | 'other' => {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}

const resolveAdUnitId = (platform: 'android' | 'ios' | 'other'): string => {
  if (platform === 'android') {
    if (!useTestAds) return androidRewardedUnit
    return androidFormat === 'rewarded' ? TEST_REWARDED_ANDROID : TEST_REWARDED_INTERSTITIAL_ANDROID
  }
  if (platform === 'ios') {
    return useTestAds ? TEST_REWARDED_INTERSTITIAL_IOS : iosRewardedUnit
  }
  return ''
}

type InitResponse = { initialized: boolean }
type ShowAdResponse = { shown: boolean; rewarded?: boolean; error?: string }
// `error` is present only on `ready=false` events raised by an SDK load or
// display failure — surfaced in the debug overlay so "no fill" and "invalid
// ad unit ID" are distinguishable on device.
type StatePayload = { ready: boolean; error?: string }

export const createAdMobProvider = (): AdProvider => ({
  name: 'admob',
  isReady,
  isRewardedReady,
  isInterstitialReady,
  isAdsBlocked,
  init: async () => {
    if (initStarted) return
    initStarted = true

    const platform = detectPlatform()
    const rewardedAdUnitId = resolveAdUnitId(platform)

    const adFormat: AdMobFormat = platform === 'android' ? androidFormat : 'rewarded_interstitial'

    setDebug({ platform, adFormat, adUnitConfigured: !!rewardedAdUnitId })
    logDebug(`platform=${platform} format=${adFormat} unit=${rewardedAdUnitId ? (useTestAds ? 'TEST' : 'set') : 'EMPTY'}`)

    if (!rewardedAdUnitId) {
      setDebug({
        initState: 'no-ad-unit',
        initError: `no ${adFormat} ad unit for platform "${platform}"`
      })
      logDebug('init aborted: no ad unit id')
      console.warn(`[ads/admob] no ${adFormat} ad unit for platform "${platform}" — ads disabled`)
      return
    }

    // Subscribe BEFORE invoking init. The native side emits the first
    // `rewarded-state` from inside its init completion handler, so racing the
    // listener registration after init would drop it. Listeners are safe to
    // register early — the plugin queues `trigger()` calls until the webview
    // is ready to receive them.
    try {
      await addPluginListener<StatePayload>('admob', 'rewarded-state', (data) => {
        const r = !!data?.ready
        isRewardedReady.value = r
        const err = data?.error ?? ''
        logDebug(`rewarded-state ready=${r}${err ? ` err="${err}"` : ''}`)
        if (err) setDebug({ lastRewardedShowError: err })
      })
      logDebug('listener subscribed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logDebug(`listener subscribe failed: ${msg}`)
      console.warn('[ads/admob] failed to subscribe to rewarded-state', e)
    }

    try {
      setDebug({ initState: 'starting' })
      logDebug('invoke plugin:admob|init')
      const res = await invoke<InitResponse>('plugin:admob|init', {
        payload: {
          rewardedAdUnitId,
          adFormat,
          // ── Families / COPPA posture ──────────────────────────────────
          // TFCD only. Google's targeting guide says TFCD and TFUA must not
          // both be true, and a child-directed declaration is the stronger,
          // COPPA-anchored signal. The native side re-enforces this.
          tagForChildDirectedTreatment: true,
          tagForUnderAgeOfConsent: false,
          maxAdContentRating: 'G',
          designedForFamilies: true,
          useTestAds
        }
      })
      if (res.initialized) {
        isReady.value = true
        setDebug({ initState: 'ready', initError: '' })
        logDebug('init OK')
      } else {
        setDebug({ initState: 'failed', initError: 'plugin returned initialized=false' })
        logDebug('init returned initialized=false')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebug({ initState: 'failed', initError: msg })
      logDebug(`init threw: ${msg}`)
      console.warn('[ads/admob] init failed', e)
    }
  },
  showRewardedAd: async () => {
    if (!isReady.value) {
      logDebug('show_rewarded skipped: not ready')
      return false
    }
    try {
      logDebug('invoke show_rewarded')
      const res = await invoke<ShowAdResponse>('plugin:admob|show_rewarded')
      logDebug(
        `show_rewarded → shown=${res.shown} rewarded=${res.rewarded ?? false}${res.error ? ` err=${res.error}` : ''}`
      )
      if (res.error) setDebug({ lastRewardedShowError: res.error })
      return res.rewarded === true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebug({ lastRewardedShowError: msg })
      logDebug(`show_rewarded threw: ${msg}`)
      console.warn('[ads/admob] show_rewarded failed', e)
      return false
    }
  },
  // Families Ad Format Requirements: no full-screen advertising that the
  // player did not opt into, and none whose close affordance we can't
  // guarantee. There is no interstitial command in the native plugin, so this
  // cannot be made to do anything without a deliberate native change.
  showMidgameAd: async () => {
    logDebug('show_midgame no-op (Families: rewarded-only)')
  }
})
