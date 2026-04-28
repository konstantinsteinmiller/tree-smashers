import { createApp, watch } from 'vue'
import router from '@/router'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import { createI18n } from 'vue-i18n'
import {
  loadLocaleMessages,
  resolveInitialLocale,
  setI18nLocale,
  isSupportedLocale
} from '@/i18n'
import { GAME_USER_LANGUAGE } from '@/utils/constants.ts'
import { LANGUAGES } from '@/utils/enums'
import { initCrazyGames, crazyLocale } from '@/use/useCrazyGames'
import { initAds } from '@/use/useAds'
import useUser, { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution } from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'
import { SaveManager } from '@/utils/save/SaveManager'
import { resolveSaveStrategy } from '@/platforms/resolveSaveStrategy'
import { LocalBackupLayer, IndexedDBStore } from '@/utils/save/LocalBackupLayer'
import { installSaveStatus } from '@/use/useSaveStatus'
import { bootstrapVConsoleFromUrl, setVConsoleMounter } from '@/use/useVConsole'

const bootstrap = async () => {
  // vConsole is mounted on demand via either:
  //   • the StageBadge chord (N taps in 60s) — see `useVConsole.ts`
  //   • a URL query/hash flag (`?vconsole=1` or `#vconsole`)
  //
  // The actual vConsole LIBRARY (~250KB gzipped) is dynamically
  // imported HERE in main.ts — main.ts is in the obfuscator's exclude
  // list, so the bare-specifier dynamic import survives. Rollup
  // splits vConsole into its own lazy chunk that's only fetched when
  // a trigger fires. The `useVConsole.ts` state machine doesn't
  // import the library directly; we install the mounter via
  // `setVConsoleMounter` so vConsole stays out of the main chunk
  // and off the hot path.
  //
  // Why this matters: chaos-arena's main bundle ballooned by ~250KB
  // gzipped when vConsole was statically imported. CrazyGames flagged
  // the regression. Putting the dynamic-import here fixes it without
  // breaking the trigger paths.
  setVConsoleMounter(
    async () => {
      const { default: VConsole } = await import('vconsole')
      return new VConsole()
    },
    (instance) => {
      ;(instance as { destroy: () => void }).destroy()
    }
  )
  bootstrapVConsoleFromUrl()

  // Platform SDK init — must happen before App loads.
  if (isCrazyWeb) {
    await initCrazyGames()
  } else if (isWaveDash) {
    try {
      const sdk = await (window as any).WavedashJS
      if (sdk) await sdk.init({ debug: isDebug.value })
    } catch (e) {
      console.warn('[Wavedash] SDK init failed:', e)
    }
  }

  // Pick the save strategy by build flag. `SaveManager.init()` hydrates
  // localStorage from the chosen backend and then patches
  // `localStorage.setItem` / `removeItem` to mirror writes back. Must
  // resolve before `@/App.vue` is imported because many composables read
  // `localStorage` at module-evaluation time.
  //
  // The branching now lives in `@/platforms/resolveSaveStrategy` so it's
  // unit-testable in isolation. Adding a platform = add an arm there,
  // not edit this file.
  const strategy = await resolveSaveStrategy({
    isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution
  })

  // IDB-backed second-tier persistence. Survives force-close on mobile
  // webviews (CG mobile app in particular) where localStorage gets wiped
  // but the app's IDB partition stays. The layer is platform-agnostic —
  // every save strategy gets the same safety net. See
  // src/utils/save/LocalBackupLayer.ts for the failure-mode rationale.
  const backupLayer = new LocalBackupLayer(new IndexedDBStore())
  const saveManager = new SaveManager(strategy, backupLayer)
  // Install the reactive bridge BEFORE init() so the boot-time sanity
  // guard's hydrate-state transitions are observable from useSaveStatus
  // even though no Vue components have mounted yet — the strategy may
  // emit notices via background retries during init.
  installSaveStatus(saveManager)
  await saveManager.init()
  ;(window as any).__saveManager = saveManager

  // ─── Background / close flush — critical for mobile webviews ───────────
  //
  // On the CrazyGames mobile app (and any other wrapper webview), force-close
  // kills the JS process before the strategy's 500ms debounce or the IDB
  // backup's 1000ms debounce can fire. Without this hook, the player's
  // last few minutes of progress sit in the dirty queue and die with the
  // process — the cloud / IDB never saw them.
  //
  // Two events because each catches a different lifecycle path:
  //   • `visibilitychange` — fires on background/foreground on every modern
  //     mobile WebView. Most reliable signal we get.
  //   • `pagehide` — fires on tab close, navigation away, and on iOS Safari
  //     when the page is being unloaded for memory pressure.
  //
  // Both call SaveManager.flush(), which awaits the strategy's flush AND
  // the backup layer's flush. The OS doesn't wait for our promise, so this
  // is best-effort — the strategy's setItem may not finish before the
  // process is suspended. But it dramatically widens the window where
  // writes complete vs. relying on the natural debounce.
  const flushOnHide = (): void => {
    if (document.visibilityState === 'hidden') {
      void saveManager.flush().catch((e) => {
        console.warn('[save] visibilitychange flush failed', e)
      })
    }
  }
  document.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('pagehide', () => {
    void saveManager.flush().catch((e) => {
      console.warn('[save] pagehide flush failed', e)
    })
  })

  if (isGlitch) {
    const { glitchPlugin } = await import('@/utils/glitchPlugin')
    glitchPlugin()
  }

  // GameDistribution: kick off SDK script injection in parallel with the
  // rest of the boot. We don't await — the AdProvider's `init()` (called
  // post-mount via `initAds()`) will await the same promise, so by the
  // time the player can see "watch ad" buttons the SDK is ready. Saves
  // ~1-2 seconds of perceived loading vs awaiting here on the critical
  // path.
  if (isGameDistribution) {
    void import('@/utils/gameDistributionPlugin').then(({ gameDistributionPlugin }) => {
      gameDistributionPlugin()
    })
  }

  // If CrazyGames reported a supported player locale, persist it as the
  // session hint so resolveInitialLocale picks it up below and every
  // subsequent boot in this tab stays consistent with the portal's
  // preference rather than a stale browser default.
  const cgLocale = crazyLocale.value
  if (cgLocale && LANGUAGES.includes(cgLocale)) {
    sessionStorage.setItem(GAME_USER_LANGUAGE, cgLocale)
  }

  const { default: App } = await import('@/App.vue')

  // Resolve and LOAD just the initial locale bundle before creating the
  // i18n instance. The English fallback is loaded in parallel so missing
  // keys are never undefined while the active locale's chunk is still
  // in flight. If the initial locale IS English we only fetch once.
  const initial = resolveInitialLocale(GAME_USER_LANGUAGE)
  const needsFallback = initial !== 'en'
  const [initialMsgs, fallbackMsgs] = await Promise.all([
    loadLocaleMessages(initial).catch(() => ({})),
    needsFallback ? loadLocaleMessages('en').catch(() => ({})) : Promise.resolve(null)
  ])

  const i18n: any = createI18n({
    locale: initial,
    fallbackLocale: 'en',
    messages: needsFallback
      ? { [initial]: initialMsgs, en: fallbackMsgs ?? {} }
      : { en: initialMsgs },
    missingWarn: false,
    fallbackWarn: false
  })

  // If the SDK gave us a supported locale, push it through the user store
  // so userLanguage (and anything reactive to it) lines up with i18n. We
  // wait for IndexedDB hydration so we don't race with the saved-
  // preference loader and end up writing then immediately overwriting.
  if (cgLocale && LANGUAGES.includes(cgLocale)) {
    const { userLanguage: storedLanguage, setSettingValue } = useUser()
    const { isDbInitialized } = await import('@/use/useMatch')
    let stop: (() => void) | null = null
    stop = watch(
      isDbInitialized,
      (ready) => {
        if (!ready) return
        stop?.()
        if (storedLanguage.value !== cgLocale) {
          setSettingValue('language', cgLocale)
        }
        // cgLocale is the one we already loaded above, so this is a
        // cheap no-op on the loader side.
        setI18nLocale(i18n, cgLocale)
      },
      { immediate: true }
    )
  }

  // Sync i18n locale when IndexedDB hydrates the saved language on reload
  // (skip when CrazyGames already controls locale). If the hydrated
  // locale differs from what we booted with, `setI18nLocale` will fetch
  // the new chunk on-the-fly before swapping.
  if (!(cgLocale && LANGUAGES.includes(cgLocale))) {
    const { userLanguage: storedLang } = useUser()
    const { isDbInitialized: dbReady } = await import('@/use/useMatch')
    let stopLangSync: (() => void) | null = null
    stopLangSync = watch(
      dbReady,
      (ready) => {
        if (!ready) return
        stopLangSync?.()
        if (isSupportedLocale(storedLang.value)) {
          setI18nLocale(i18n, storedLang.value)
        }
      },
      { immediate: true }
    )
  }

  // Expose the instance globally so composables / skills that want to
  // trigger a runtime locale switch (e.g. OptionsModal) can resolve the
  // active i18n without prop-drilling.
  ;(window as any).__i18n = i18n

  const app = createApp(App)

  app.use(router)
  app.use(i18n)

  app.mount('#app')

  // Kick off the ad provider's init after mount. For CrazyGames the
  // SDK is already up (initCrazyGames ran above) so this is a no-op;
  // for LevelPlay the native bridge needs the Android Activity / iOS
  // ViewController to be alive, which is true once the webview has
  // rendered. Never awaited — ads are not on the critical path, and
  // placements stay hidden via `isAdsReady` until the provider signals
  // ready.
  void initAds().catch((e) => console.warn('[ads] init failed', e))

  // Signal to Wavedash that the game is fully loaded and ready
  if (isWaveDash) {
    try {
      const sdk = await (window as any).WavedashJS
      if (sdk) {
        sdk.updateLoadProgressZeroToOne?.(1)
        sdk.readyForEvents?.()
      }
    } catch (e) {
      console.warn('[Wavedash] ready signal failed:', e)
    }
  }
}

bootstrap()
