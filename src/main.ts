import { createApp, watch } from 'vue'
import router from '@/router'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import { createI18n } from 'vue-i18n'
import {
  applyDocumentLocale,
  clearExplicitLanguageChoice,
  hasExplicitLanguageChoice,
  LANGUAGE_KEY,
  loadLocaleMessages,
  notePortalLanguageChange,
  resolveInitialLocale,
  setI18nLocale,
  isSupportedLocale,
  toShippedLocale,
  buildPluralRules
} from '@/i18n'
import {
  initCrazyGames, crazyLocale, crazyPlayerName, isCrazyLoggedIn, startLoading
} from '@/use/useCrazyGames'
import { setSdkNameSource } from '@/use/usePlayerIdentity'
import { initAds } from '@/use/useAds'
import useUser, {
  isCrazyWeb,
  isWaveDash,
  isItch,
  isGlitch,
  isGameDistribution,
  isY8,
  isGamePix,
  isPlaygama,
  isPoki,
  isGameMonetize
} from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'
import { SaveManager } from '@/utils/save/SaveManager'
import { resolveSaveStrategy } from '@/platforms/resolveSaveStrategy'
import { installSaveStatus } from '@/use/useSaveStatus'
import { bootstrapVConsoleFromUrl, setVConsoleMounter } from '@/use/useVConsole'
import { installBootDiagnostics } from '@/utils/bootDiagnostics'
import { startForcedDarkModeGuard } from '@/use/useForcedDarkModeGuard'
import { registerPauseSyncer } from '@/use/useGamePause'

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
  // FIRST thing in bootstrap. Prints the `[diag] boot` banner (build flags,
  // base, href + the host-appended fragment, storage-shim state, framing) and
  // arms window-level `error` / `unhandledrejection` taps, so a rejection
  // thrown out of any `await` below is loud instead of leaving a finished
  // splash sitting over nothing. Also installs `window.__smashersDebug()` for a
  // full snapshot on demand — the one expression to ask portal QA to run.
  installBootDiagnostics(router)

  // Forced dark-mode guard. Re-applies the opt-out metas from index.html (a
  // build transform could drop them) and starts watching for an overrider
  // that those cannot stop — Dark Reader's filter modes, Chromium's force-dark
  // flag on a light OS. `ForcedDarkModeModal` (App.vue) is what the player
  // sees; the loader is deliberately not gated on it.
  //
  // Re-checks ride the pause gate rather than `visibilitychange`: YouTube
  // Playables forbids Page Visibility listeners, and coming back from a
  // platform pause is when a player has just switched the overrider off.
  // `?darkguard=off` is the preview recorder's seam, dev builds only.
  startForcedDarkModeGuard({
    disabled: import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('darkguard') === 'off',
    subscribeRecheck: (recheck) => registerPauseSyncer(recheck),
    onDetected: (r) => console.info('[forced-dark] override detected:', r.kind, r.confidence, r.browser),
    onContinueAnyway: (r) => console.info('[forced-dark] player continued anyway:', r.kind)
  })

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
  // Why this matters: tree-smashers's main bundle ballooned by ~250KB
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
    // Where the leaderboard's tier-2 display name comes from. PUSHED IN, never
    // imported by `usePlayerIdentity`: a lazy `await import('@/use/useCrazyGames')`
    // over there would be resolved by Vite at TRANSFORM time, so the module
    // could not compile in a project without that exact file — and the
    // try/catch around it, which only ever catches at runtime, would look like
    // protection while providing none.
    setSdkNameSource(() => crazyPlayerName.value)
    // CrazyGames is the ONLY platform this game ships to that has real player
    // accounts, so it is the only one that installs an auth gate. Every other
    // build leaves it unset, which means "no account concept" and keeps the
    // leaderboard fully available — see `setLeaderboardAuthGate`.
    //
    // Installed BEFORE `initCrazyGames()` on purpose: the gate has to be in
    // place for the window between module evaluation and SDK init, or a result
    // screen that renders inside it would offer a guest the board it is meant
    // to be hidden from. `isCrazyLoggedIn` starts false, so that window is
    // closed rather than open.
    //
    // Imported dynamically, and AWAITED. A static import here would drag the
    // leaderboard module — and the ~6 kB board snapshot baked into it — out of
    // the lazy route chunk it lives in and into the entry bundle of EVERY
    // build, which is bytes CG counts against cold-launch load size. Awaiting
    // keeps the ordering guarantee above; the module is on the arena's critical
    // path anyway, so this costs no extra round trip in practice.
    const { setLeaderboardAuthGate } = await import('@/use/useLiveLeaderboard')
    setLeaderboardAuthGate(() => isCrazyLoggedIn.value)
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
      // The host injects the SDK as `window.Wavedash` (docs.wavedash.com/sdk/setup:
      // `init()` is REQUIRED and synchronous) and, on older wrappers, as a
      // `window.WavedashJS` promise. Reading only the old name left the SDK
      // un-initialised on the current host, so every leaderboard upload failed.
      const w = window as any
      const sdk = await (w.Wavedash ?? w.WavedashJS)
      if (sdk) await sdk.init({ debug: isDebug.value })
    } catch (e) {
      console.warn('[Wavedash] SDK init failed:', e)
    }
    // The env LITERAL, not `isWaveDash`: the dynamic import below must fold
    // away in every other build (main.ts is excluded from obfuscation, so the
    // literal survives to Rollup's dead-branch pass).
    if (import.meta.env.VITE_APP_WAVEDASH === 'true') {
      // The host injects the SDK as `window.Wavedash` (current docs) and also
      // as `window.WavedashJS` (older wrappers; a Promise there). `await`
      // handles both shapes.
      const wavedashSdk = async (): Promise<any> => {
        const w = window as any
        return (await (w.Wavedash ?? w.WavedashJS)) ?? null
      }
      // Our own board's rows carry the Wavedash username — every Wavedash
      // player is signed in, so this is the name they are known by there.
      setSdkNameSource(async () => {
        const sdk = await wavedashSdk()
        const name = sdk?.getUsername?.()
        return typeof name === 'string' ? name : null
      })
      // The Wavedash leaderboard: score mirror + the modal's Wavedash tab.
      // Not awaited — no run can be reported before the arena mounts, and the
      // modal's tab appears reactively once this lands.
      void import('@/platforms/wavedash/wavedashLeaderboard')
        .then(({ installWavedashLeaderboard }) => installWavedashLeaderboard(wavedashSdk))
        .catch((e) => console.warn('[Wavedash] leaderboard unavailable:', e))
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
    isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isY8, isGamePix,
    isPlaygama, isPoki, isGameMonetize
  })

  // CrazyGames cloud-only mode: gameplay state and our save bookkeeping
  // (`__save_*`) live in memory only; `sdk.data` is the sole persistence
  // backend. CG QA explicitly requires that no `smashers_*` / `ca_*` /
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

  // Defense-in-depth `smashers_*` / `ca_*` / `__save_*` safety remove on
  // CG builds. BlobStorage's `scrubRawForCloudOnly()` already wiped these
  // at construction (it seeded into `state` first, so progress is
  // preserved); this second pass catches anything BlobStorage missed.
  // MUST run BEFORE `saveManager.init()` because init patches
  // `localStorage.setItem` / `removeItem` to forward to the strategy —
  // calling the patched removeItem on a `smashers_*` key would issue a
  // cloud delete via `sdk.data.removeItem`, wiping the player's save.
  // Pre-init, `localStorage.removeItem` is still native and these
  // removes are local-only.
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') {
    try {
      const stragglers: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && (k.startsWith('smashers_') || k.startsWith('ca_') || k.startsWith('__save_'))) {
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
  //
  // YouTube Playables is the exception. "Game MUST NOT use the web Page
  // Visibility API or similar web APIs and MUST only use Playables SDK
  // `onPause` and `onResume`" — so on that build the SDK's pause edge is the
  // flush trigger instead. It carries the same guarantee ("the game has a
  // short window to save any state before it is evicted") and reaches the
  // whole SaveManager, not just the strategy's own pause hook.
  const flushOnHide = (): void => {
    if (document.visibilityState === 'hidden') {
      void saveManager.flush().catch((e) => {
        console.warn('[save] visibilitychange flush failed', e)
      })
    }
  }
  if (import.meta.env.VITE_APP_YOUTUBE === 'true') {
    // The Bridge's PAUSE_STATE_CHANGED is the only lifecycle signal we are
    // allowed to consume here, and on the `youtube` adapter it is fed by
    // Playables' own `onPause` — which exists precisely because "the game has
    // a short window to save any state before it is evicted".
    void import('@/utils/playgamaPlugin').then(({ isPlaygamaPaused }) => {
      watch(isPlaygamaPaused, (paused) => {
        if (!paused) return
        void saveManager.flush().catch((e) => {
          console.warn('[save] platform-pause flush failed', e)
        })
      })
    })
  } else {
    document.addEventListener('visibilitychange', flushOnHide)
    window.addEventListener('pagehide', () => {
      void saveManager.flush().catch((e) => {
        console.warn('[save] pagehide flush failed', e)
      })
    })
  }

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
  // Assigned once the i18n instance exists (further down). The late-arrival
  // watcher registered inside the dynamic import below calls through this
  // holder, so it is safe to wire the watcher up before i18n is built.
  let applyPortalLocale: (code: string) => void = () => {
  }

  let playgamaLocaleGate: Promise<string | null> | null = null
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
    playgamaLocaleGate = import('@/utils/playgamaPlugin').then(
      async ({ playgamaPlugin, playgamaLoadingStart, playgamaLocaleReady, playgamaLocale }) => {
        void playgamaPlugin().then(() => playgamaLoadingStart())
        // Late-arrival path. The block comment below promised this and the
        // code never delivered it: when the Bridge answered after the boot
        // budget expired, `platform.language` was read, stored in the ref,
        // and then read by nobody — the exact "language parameter was
        // ignored on initialization" that Playgama QA reported twice.
        //
        // `playgamaLocale` only ever holds a code we actually ship (the
        // plugin's `normalizePlaygamaLanguage` returns null otherwise), so
        // any non-null value here is safe to apply.
        watch(playgamaLocale, (code) => {
          if (code) applyPortalLocale(code)
        })
        await playgamaLocaleReady
        return playgamaLocale.value
      }
    )
  }

  // ─── Poki ───────────────────────────────────────────────────────────────
  //
  // PARALLEL init, deliberately not awaited. Poki has no cloud-save API, so
  // nothing in `PokiStrategy.hydrate()` waits on it, and `getLanguage()` is
  // implemented in the 5.5 KB loader shim — readable synchronously, long
  // before the ~325 KB ad core lands. Not awaiting is the point rather than
  // an optimisation: Poki measures conversion-to-play on the first
  // `gameplayStart()`, so boot latency is revenue.
  let pkLocale: string | null = null
  if (import.meta.env.VITE_APP_POKI === 'true') {
    const { pokiPlugin, readPokiLanguage, pokiCaptureError } = await import('@/utils/pokiPlugin')
    pkLocale = readPokiLanguage()
    void pokiPlugin()

    // Feeds P4D's 24-hour Error Scanner. Registered here so the window-level
    // handlers cover the whole boot path; the Vue-level one is attached at
    // `createApp` below, because Vue swallows render / lifecycle errors
    // before they ever reach `window.onerror`.
    window.addEventListener('error', (e) => pokiCaptureError(e.error ?? e.message))
    window.addEventListener('unhandledrejection', (e) => pokiCaptureError(e.reason))
  }

  // ─── GameMonetize ───────────────────────────────────────────────────────
  //
  // PARALLEL init, not awaited. The plugin sets `window.SDK_OPTIONS`, injects
  // the SDK script and settles on SDK_READY; the AdProvider's `init()` (via
  // `initAds()` after mount) joins the same promise. Nothing on the boot path
  // depends on it: GameMonetize is ads only — no save API, no locale, no
  // loading / game-ready signal. Starting it here rather than after mount buys
  // the first-load interstitial about a second (`useFirstLoadInterstitial`).
  if (import.meta.env.VITE_APP_GAME_MONETIZE === 'true') {
    void import('@/utils/gameMonetizePlugin').then(({ gameMonetizePlugin }) => gameMonetizePlugin())
  }

  // ─── Portal locale ─────────────────────────────────────────────────────
  //
  // Both CrazyGames and Playgama tell us which language the player picked on
  // the portal. That hint is the source language for first-time players (it
  // NEVER overrides an explicit in-game choice — see `applyPortalLocale`).
  //
  // CG QA: NO locally-saved data on CG builds — we no longer mirror the
  // CrazyGames-reported locale into sessionStorage. The portal locale is
  // passed straight into resolveInitialLocale below so it influences the
  // first-paint i18n bundle without touching any storage surface.
  //
  // CrazyGames' locale is readable synchronously (initCrazyGames() was
  // awaited at the top of bootstrap). Playgama's is not: `bridge.platform
  // .language` only exists after `bridge.initialize()` resolves. So we race
  // the Bridge against a budget — long enough to win on a healthy
  // connection, short enough that a blocked/absent SDK can never stall the
  // splash screen. If the Bridge answers after it, the `watch(playgamaLocale)`
  // registered above applies the portal language reactively.
  //
  // In practice the gate is usually already settled by the time we get here:
  // `PlaygamaStrategy.hydrate()` awaits the very same `playgamaPlugin()`
  // singleton during `saveManager.init()` above, so the Bridge handshake has
  // normally completed and this race resolves on the first tick. The budget
  // is the safety net for the builds where the strategy bailed early.
  const PORTAL_LOCALE_BUDGET_MS = 3000
  const pgLocale = playgamaLocaleGate
    ? await Promise.race([
      playgamaLocaleGate,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PORTAL_LOCALE_BUDGET_MS))
    ]).catch(() => null)
    : null

  const cgLocale = crazyLocale.value
  // Whichever portal we are actually running on is the only one that can
  // report anything, so a simple coalesce is unambiguous. `||` rather than
  // `??` on purpose: an empty string is as meaningless as null here.
  //
  // CrazyGames and Poki hand over RAW tags (`pt-BR`, `zh-TW`, `de`); Playgama's
  // is already normalised by its plugin. `toShippedLocale` maps every one of
  // them onto a shipped internal code (idempotent on codes) or null — region
  // and script subtags included, so a Brazilian and a Portuguese player land
  // in different files, and a Traditional-Chinese player in `zh-TW`.
  const rawPortalLocale = cgLocale || pgLocale || pkLocale
  const portalLocale = toShippedLocale(rawPortalLocale)

  // Did the PLATFORM language change since our last load? If so it outranks a
  // stored in-game choice — that choice is now stale. This is the case
  // Playgama QA demonstrated: pick English in-game, then flip the platform
  // language to Chinese in the guided testing tools and reload. Must run
  // BEFORE `resolveInitialLocale`, which would otherwise short-circuit on the
  // stored English and never look at the portal.
  if (portalLocale && notePortalLanguageChange(portalLocale)) {
    console.info('[i18n] portal language switched to', portalLocale, '— dropping stored choice')
    clearExplicitLanguageChoice()
  }

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
    fallbackWarn: false,
    // CLDR-aware `a | b | c` branch selection per language (ru/uk/pl/cs/ar…
    // have 3–6 categories). Used by the coin-count aria labels
    // (sfc.SmasherTeamModal.levelUpAria, spinner.tripleCoinsAria),
    // called as t(key, named, count).
    pluralRules: buildPluralRules()
  })

  // Stamp `<html lang|data-locale|data-script|data-dir>` for the boot locale.
  // `lang` drives the browser's CJK glyph variants, line breaking and
  // language-aware uppercasing; `data-script` / `data-dir` select the font
  // stack, the typography corrections and the RTL text rule in `fonts.sass` —
  // all have to be right on the FIRST paint, not just after a runtime switch.
  applyDocumentLocale(initial)

  // ─── Language authority ────────────────────────────────────────────────
  //
  // Two sources, and the split between them is what Playgama QA's repeated
  // "language parameter was ignored on initialization" came down to:
  //
  //   • The PLAYER's choice lives in `smashers_user_language` and is written
  //     by exactly one path — the OptionsModal dropdown. It is authoritative
  //     forever and syncs through the cloud strategy.
  //   • The PORTAL's language (Playgama `bridge.platform.language`, CG
  //     `systemInfo.locale`) is re-reported on every single load, so it
  //     never needs persisting. It drives the live `userLanguage` ref and
  //     i18n only.
  //
  // The old code seeded the portal locale INTO `smashers_user_language`. That
  // made the two indistinguishable, so the first load that failed to get a
  // portal answer in time wrote 'en'-equivalent state that then out-ranked
  // every subsequent correct answer — the bug survived a re-test because it
  // had persisted itself into the player's cloud save. We no longer write
  // the portal locale anywhere; assigning the ref keeps OptionsModal's
  // dropdown showing the language actually on screen.
  const { userLanguage: storedLang } = useUser()

  // `userLanguage` is the single source of truth for what is on screen, and
  // this is the one place it gets pushed into i18n. Every late-arriving
  // correction therefore lands the same way, whether it comes from the
  // OptionsModal dropdown, a slow Bridge answering after the boot budget, or
  // a background cloud retry finally delivering the player's choice from
  // another device. `setI18nLocale` lazy-loads the locale chunk and no-ops
  // when the locale is already active, so re-entry is free.
  watch(storedLang, (code) => {
    if (isSupportedLocale(code)) void setI18nLocale(i18n, code)
  })

  applyPortalLocale = (code: string): void => {
    if (!isSupportedLocale(code)) return
    // A platform language SWITCH outranks the stored choice (see the boot-time
    // check above); this covers the switch landing mid-session rather than
    // across a reload. `notePortalLanguageChange` is idempotent, so re-running
    // it for the value we already recorded at boot reports no change.
    if (notePortalLanguageChange(code)) {
      console.info('[i18n] portal language switched to', code, '— dropping stored choice')
      clearExplicitLanguageChoice()
    } else if (hasExplicitLanguageChoice()) {
      // Ordinary load: an explicit in-game choice always wins over the portal.
      return
    }
    storedLang.value = code
  }

  {
    const { isDbInitialized: dbReady } = await import('@/use/useMatch')
    let stopLangSync: (() => void) | null = null
    stopLangSync = watch(
      dbReady,
      (ready) => {
        if (!ready) return
        stopLangSync?.()
        // Cloud hydrate has landed by now, so this probe sees the player's
        // real choice if they have one on any device.
        const chosen = localStorage.getItem(LANGUAGE_KEY)
        if (isSupportedLocale(chosen)) {
          storedLang.value = chosen
          return
        }
        // No explicit choice — mirror whatever we booted with (portal or
        // browser) into the ref so the OptionsModal dropdown agrees with
        // the screen, then let the portal correct it if it answers late.
        storedLang.value = initial
        if (portalLocale) applyPortalLocale(portalLocale)
      },
      { immediate: true }
    )
  }

  // Expose the instance globally so composables / skills that want to
  // trigger a runtime locale switch (e.g. OptionsModal) can resolve the
  // active i18n without prop-drilling.
  ;(window as any).__i18n = i18n

  const app = createApp(App)

  if (import.meta.env.VITE_APP_POKI === 'true') {
    const { pokiCaptureError } = await import('@/utils/pokiPlugin')
    app.config.errorHandler = (err) => pokiCaptureError(err)
  }

  app.use(router)
  app.use(i18n)

  app.mount('#app')

  // Kick off the ad provider's init after mount. For CrazyGames the
  // SDK is already up (initCrazyGames ran above) so this is a no-op;
  // for AdMob the native bridge needs the Android Activity / iOS
  // ViewController to be alive, which is true once the webview has
  // rendered. Never awaited — ads are not on the critical path, and
  // placements stay hidden via `isAdsReady` until the provider signals
  // ready.
  void initAds().catch((e) => console.warn('[ads] init failed', e))

  // Signal to Wavedash that the game is fully loaded and ready
  if (isWaveDash) {
    try {
      const w = window as any
      const sdk = await (w.Wavedash ?? w.WavedashJS)
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
