import { createApp, watch } from 'vue'
import router from '@/router'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import { createI18n } from 'vue-i18n'
import {
  applyDocumentLocale,
  loadLocaleMessages,
  resolveInitialLocale,
  setI18nLocale,
  isSupportedLocale
} from '@/i18n'
import { LANGUAGES } from '@/utils/enums'
import { initCrazyGames, crazyLocale, startLoading } from '@/use/useCrazyGames'
import { initAds } from '@/use/useAds'
import useUser, {
  isCrazyWeb,
  isWaveDash,
  isItch,
  isGlitch,
  isGameDistribution,
  isY8,
  isGamePix,
  isPlaygama
} from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'
import { SaveManager } from '@/utils/save/SaveManager'
import { resolveSaveStrategy } from '@/platforms/resolveSaveStrategy'
import { installSaveStatus } from '@/use/useSaveStatus'
import { bootstrapVConsoleFromUrl, setVConsoleMounter } from '@/use/useVConsole'

// ─── Build-config self-check ──────────────────────────────────────────────
//
// CG QA reported "saves only land locally". Root cause was a build that
// shipped without `VITE_APP_CRAZY_WEB=true`, so `resolveSaveStrategy`
// silently picked `LocalStorageStrategy` (a no-op `onLocalSet`) instead of
// `CrazyGamesStrategy`. Detect the mismatch at boot and surface it loudly
// in DevTools so it can be spotted before QA has to chase it again.
//
// The heuristic is intentionally conservative — referrer-based and
// portal-domain-suffix-only — to avoid false positives on dev / preview.
const looksLikeCrazyGamesPortal = (): boolean => {
  try {
    const ref = document.referrer
    if (!ref) return false
    const host = new URL(ref).hostname
    return host === 'crazygames.com'
      || host.endsWith('.crazygames.com')
      || host === '1001juegos.com'
      || host.endsWith('.1001juegos.com')
  } catch {
    return false
  }
}

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
  //
  // Build-time gate: vConsole is only useful for on-device debugging on
  // native (Tauri) builds — `VITE_APP_NATIVE=true`. On CrazyGames /
  // GameDistribution / Glitch / Itch builds it adds a ~300KB chunk to
  // dist/ that nobody downloads (and CG QA flagged as build dead weight
  // on 2026-04-30). The `import.meta.env`-gated ternary makes the
  // dynamic import unreachable on web builds — Rollup eliminates the
  // import call AND the vconsole chunk entirely.
  //
  // If we ever need vConsole on a web build (e.g. for CG mobile-app QA),
  // set `VITE_APP_INCLUDE_VCONSOLE=true` in the relevant `.env.<mode>`
  // and the `|| ===` arm below pulls it back in.
  if (
    import.meta.env.VITE_APP_NATIVE === 'true'
    || import.meta.env.VITE_APP_INCLUDE_VCONSOLE === 'true'
  ) {
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
  }

  // Build-config self-check (see `looksLikeCrazyGamesPortal` comment above).
  if (looksLikeCrazyGamesPortal() && !isCrazyWeb) {
    console.error(
      '[save] BUILD MISCONFIGURED: page is hosted under a CrazyGames portal ' +
      '(referrer=' + document.referrer + ') but VITE_APP_CRAZY_WEB is not "true". ' +
      'CrazyGamesStrategy will NOT run and saves will only land in localStorage. ' +
      'Rebuild with `pnpm build:crazy-web` and ensure .env.crazy-web(.local) sets the flag.'
    )
  }

  // Platform SDK init — must happen before App loads.
  if (isCrazyWeb) {
    await initCrazyGames()
    // Explicit `loadingStart` immediately after SDK init. The SDK
    // technically auto-enters the "loading" state on init, but CG QA's
    // tooling does NOT register the load window unless we fire the
    // event ourselves. Without this, the download-size measurement on
    // QA's dashboard ends up empty. The matching `loadingStop` fires
    // from `FLogoProgress.vue` once the splash screen resolves.
    startLoading()
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
    isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isY8, isGamePix, isPlaygama
  })

  // CrazyGames cloud-only mode: gameplay state and our save bookkeeping
  // (`__save_*`) live in memory only; `sdk.data` is the sole persistence
  // backend. CG QA explicitly requires that no `spinner_*` / `ca_*` /
  // `__save_*` keys appear in raw localStorage — only dev toggles
  // (`fps`, `debug`, `cheat`, `campaign-test`, `full_unlocked`) are
  // exempt. Inline env-literal so Vite tree-shakes the dead branch on
  // non-CG builds and the persistToRaw=false path is gone entirely.
  const persistToRaw = import.meta.env.VITE_APP_CRAZY_WEB !== 'true'
  const saveManager = new SaveManager(strategy, window.localStorage, {
    blob: { persistToRaw }
  })
    // Expose immediately, BEFORE the awaited `init()`. CG QA reported that
    // `window.__saveManager` was undefined when probed in the live console;
    // setting it here makes the handle available the moment construction
    // finishes, even if init() hits an unexpected throw before the patches
    // are installed. Lets QA confirm `strategyName === 'crazyGames'` no
    // matter the hydrate timing.
  ;(window as any).__saveManager = saveManager

  // Defense-in-depth `spinner_*` / `ca_*` / `__save_*` safety remove on
  // CG builds. BlobStorage's `scrubRawForCloudOnly()` already wiped these
  // at construction (it seeded into `state` first, so progress is
  // preserved); this second pass catches anything BlobStorage missed.
  // MUST run BEFORE `saveManager.init()` because init patches
  // `localStorage.setItem` / `removeItem` to forward to the strategy —
  // calling the patched removeItem on a `spinner_*` key would issue a
  // cloud delete via `sdk.data.removeItem`, wiping the player's save.
  // Pre-init, `localStorage.removeItem` is still native and these
  // removes are local-only.
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') {
    try {
      const stragglers: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && (k.startsWith('spinner_') || k.startsWith('ca_') || k.startsWith('__save_'))) {
          stragglers.push(k)
        }
      }
      for (const k of stragglers) window.localStorage.removeItem(k)
    } catch { /* harmless */
    }
  }

  // Install the reactive bridge BEFORE init() so the boot-time sanity
  // guard's hydrate-state transitions are observable from useSaveStatus
  // even though no Vue components have mounted yet — the strategy may
  // emit notices via background retries during init.
  installSaveStatus(saveManager)
  await saveManager.init()

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

  // NOTE: gates below use `import.meta.env.VITE_APP_*` literals (not the
  // `isGlitch` / `isGameDistribution` constants imported from useUser).
  // Rollup's cross-module constant propagation isn't always reliable, so
  // imported constants don't always tree-shake the dynamic-import branch.
  // Inline literals always do — Vite substitutes them with `'true'` /
  // `'false'` strings at build time, the dead branch is eliminated, and
  // the `await import('@/...')` call (and its target chunk) disappears
  // entirely from non-matching builds.
  if (import.meta.env.VITE_APP_GLITCH === 'true') {
    const { glitchPlugin } = await import('@/utils/glitchPlugin')
    glitchPlugin()
  }

  // GameDistribution: kick off SDK script injection in parallel with the
  // rest of the boot. We don't await — the AdProvider's `init()` (called
  // post-mount via `initAds()`) will await the same promise, so by the
  // time the player can see "watch ad" buttons the SDK is ready. Saves
  // ~1-2 seconds of perceived loading vs awaiting here on the critical
  // path.
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') {
    void import('@/utils/gameDistributionPlugin').then(({ gameDistributionPlugin }) => {
      gameDistributionPlugin()
    })
  }

  // Playgama Bridge: parallel init mirrors the GD pattern. The plugin is
  // idempotent — both the AdProvider's `init()` and the SaveStrategy's
  // `hydrate()` re-await this same promise so there is exactly one
  // `bridge.initialize()` per page load. `playgamaLoadingStart` fires
  // `in_game_loading_started` once the SDK is alive — paired with
  // `playgamaGameLoadingStop` (in App.vue, on `areAllAssetsLoaded`)
  // which fires both `in_game_loading_stopped` AND the certification-
  // mandatory `game_ready` edge.
  //
  // `playgamaLocaleGate` is awaited (with a short budget) further down, just
  // before the i18n instance is built — the Bridge only exposes
  // `platform.language` once `initialize()` has resolved, and Playgama QA
  // rejected the 2026-08 build because we built i18n before that ever
  // happened and every player got English.
  //
  // NOTE: the plugin symbols are pulled from THIS dynamic import rather than
  // a static one at the top of the file. `resolveSaveStrategy` and the
  // GameDistribution branch follow the same rule: a static import would put
  // `playgamaPlugin` (and the Bridge wiring it drags in) into the main chunk
  // of every non-Playgama build.
  let playgamaLocaleGate: Promise<string | null> | null = null
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
    playgamaLocaleGate = import('@/utils/playgamaPlugin').then(
      async ({ playgamaPlugin, playgamaLoadingStart, playgamaLocaleReady, playgamaLocale }) => {
        void playgamaPlugin().then(() => playgamaLoadingStart())
        await playgamaLocaleReady
        return playgamaLocale.value
      }
    )
  }

  // ─── Portal locale ─────────────────────────────────────────────────────
  //
  // Both CrazyGames and Playgama tell us which language the player picked on
  // the portal. That hint seeds the boot locale for first-time players (it
  // NEVER overrides an explicit in-game choice — see the watcher below).
  //
  // CG QA: NO locally-saved data on CG builds — we no longer mirror the
  // CrazyGames-reported locale into sessionStorage. The portal locale is
  // passed straight into resolveInitialLocale below so it influences the
  // first-paint i18n bundle without touching any storage surface.
  //
  // CrazyGames' locale is readable synchronously (initCrazyGames() was
  // awaited at the top of bootstrap). Playgama's is not: `bridge.platform
  // .language` only exists after `bridge.initialize()` resolves. So we race
  // the Bridge against a small budget — long enough to win on a healthy
  // connection, short enough that a blocked/absent SDK can never stall the
  // splash screen. If the Bridge answers late, the watcher below still
  // applies the portal language reactively.
  const PORTAL_LOCALE_BUDGET_MS = 1500
  const pgLocale = playgamaLocaleGate
    ? await Promise.race([
      playgamaLocaleGate,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PORTAL_LOCALE_BUDGET_MS))
    ]).catch(() => null)
    : null

  const cgLocale = crazyLocale.value
  // Whichever portal we are actually running on is the only one that can
  // report anything, so a simple coalesce is unambiguous. `||` rather than
  // `??` on purpose: an empty string is as meaningless as null here, and
  // `crazyLocale` is derived from a `split()` that can produce one.
  const rawPortalLocale = cgLocale || pgLocale
  const portalLocale =
    rawPortalLocale && LANGUAGES.includes(rawPortalLocale) ? rawPortalLocale : null

  const { default: App } = await import('@/App.vue')

  // Resolve and LOAD just the initial locale bundle before creating the
  // i18n instance. The English fallback is loaded in parallel so missing
  // keys are never undefined while the active locale's chunk is still
  // in flight. If the initial locale IS English we only fetch once.
  const initial = resolveInitialLocale(portalLocale)
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

  // Stamp `<html lang>` / `<html data-locale>` for the boot locale. `lang`
  // drives the browser's CJK font-fallback and line-breaking heuristics, and
  // `data-locale` gates the CJK typography corrections in `fonts.sass` — both
  // have to be right on the FIRST paint, not just after a runtime switch.
  applyDocumentLocale(initial)

  // Apply the player's saved language once hydrate finishes. The portal
  // locale (`portalLocale` — CrazyGames or Playgama) is used ONLY to seed
  // first-time players; it never overrides an explicit OptionsModal choice.
  // After hydrate has populated localStorage from the cloud backend, a null
  // value at `spinner_user_language` means "this player has never picked a
  // language on any device" and we can safely seed the portal locale.
  // useUser.ts deliberately does NOT seed a language default, so the
  // null/non-null probe here is a reliable signal.
  {
    const { userLanguage: storedLang, setSettingValue } = useUser()
    const { isDbInitialized: dbReady } = await import('@/use/useMatch')
    let stopLangSync: (() => void) | null = null
    stopLangSync = watch(
      dbReady,
      (ready) => {
        if (!ready) return
        stopLangSync?.()
        const hasStoredLanguage = localStorage.getItem('spinner_user_language') != null
        if (!hasStoredLanguage && portalLocale) {
          setSettingValue('language', portalLocale)
        }
        // Apply whichever language is now authoritative — the stored
        // value (cloud-hydrated or just-seeded). Never `portalLocale`
        // unconditionally, because that's what was overwriting an
        // explicit Spanish choice on every English-portal refresh.
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
