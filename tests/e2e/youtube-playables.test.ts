// ─── End-to-end: the Playgama build inside YouTube's runtime ───────────────
//
// tree-smashers reaches YouTube Playables THROUGH Playgama, so the artefact
// under test is a normal Playgama build (`VITE_APP_PLAYGAMA=true`) with the
// YouTube channel modifier on top. Two QA rejections are pinned here:
//
//   2026-09-02 (Google) — "Game does not start. Uncaught TypeError: Cannot
//   read properties of null (reading 'getItem')". YouTube sets
//   `window.localStorage` AND `sessionStorage` to **null**, and a dozen
//   composables read them at module-evaluation time, so the app died before
//   `bootstrap()` ran. Fixed by `public/js/storage-shim.js` — a classic
//   `<script>`, because a module-graph import is deferred and loses the race
//   against the entry chunk's own static imports.
//
//   2026-09-04 (Playgama) — "Game does not start in two of three testing
//   environments. In an environment where it starts, it does not save
//   properly. Please update Bridge to v2." Fixed by moving the Bridge from
//   the CDN `<script>` to the `@playgama/bridge` npm package and dropping the
//   v1 storage-type plumbing.
//
// Neither is reproducible in jsdom, and the shim ordering only exists after a
// real build — so this runs the REAL `youtube`-mode build under
// `vite preview`, in Chromium, with both storages nulled before any page
// script runs and a faithful `window.ytgame` standing in for YouTube.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { preview, type PreviewServer } from 'vite'
import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
// Out-of-tree so the test never stomps the developer's `pnpm build:youtube`.
const OUT_DIR = path.resolve(PROJECT_ROOT, 'dist-youtube-e2e')

const YT_SDK = 'https://www.youtube.com/game_api/v1'

// The Bridge auto-detects YouTube with `hostname.includes('usercontent.goog')`
// — the same predicate that fires on `<id>.playables.usercontent.goog` in
// production. Chromium's `--host-resolver-rules` maps that name onto the local
// preview server, so the adapter selection under test is the REAL one rather
// than a `forciblySetPlatformId` we do not ship.
const GAME_HOST = 'e2e.playables.usercontent.goog'

let server: PreviewServer
let browser: Browser
let gameOrigin: string

/**
 * Stand-in for YouTube's `game_api/v1`, served in place of the real script.
 *
 * Only the surface the Bridge's `youtube` adapter actually touches, read off
 * `@playgama/bridge@2`'s YouTube platform bridge:
 *   `system.getLanguage / isAudioEnabled / onAudioEnabledChange / onPause /
 *    onResume`, `game.firstFrameReady / gameReady / loadData / saveData`,
 *   `ads.requestInterstitialAd / requestRewardedAd`, `engagement.*`.
 *
 * Delivering it as the SDK script (rather than via `addInitScript`) is the
 * point: it lands at exactly the moment the real one would, so the Bridge's
 * un-timed `waitFor('ytgame')` poll resolves the way it does on Playables.
 */
const FAKE_YTGAME = `
(function () {
  var calls = []
  var cloud = window.__ytSeed || ''
  var audioCb = null, pauseCb = null, resumeCb = null
  window.__ytCalls = calls
  window.__ytCloud = function () { return cloud }
  window.__ytEmitAudio = function (on) { if (audioCb) audioCb(on) }
  window.__ytEmitPause = function () { if (pauseCb) pauseCb() }
  window.__ytEmitResume = function () { if (resumeCb) resumeCb() }
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    game: {
      firstFrameReady: function () { calls.push({ m: 'firstFrameReady' }) },
      gameReady: function () { calls.push({ m: 'gameReady' }) },
      loadData: function () {
        calls.push({ m: 'loadData' })
        return Promise.resolve(cloud)
      },
      saveData: function (data) {
        calls.push({ m: 'saveData', data: data })
        cloud = data
        return Promise.resolve()
      }
    },
    system: {
      getLanguage: function () { return Promise.resolve('de-DE') },
      isAudioEnabled: function () { return true },
      onAudioEnabledChange: function (cb) { audioCb = cb; return function () {} },
      onPause: function (cb) { pauseCb = cb; return function () {} },
      onResume: function (cb) { resumeCb = cb; return function () {} }
    },
    ads: {
      requestInterstitialAd: function () { return Promise.resolve() },
      requestRewardedAd: function () { return Promise.resolve() }
    },
    engagement: {
      sendScore: function () { return Promise.resolve() },
      openYTContent: function () { return Promise.resolve() }
    }
  }
})()
`

/**
 * Runs in page context BEFORE any script on the page. Recreates the one thing
 * about the Playables runtime our own environment cannot: null Web Storage.
 */
const nullOutWebStorage = (seed: string) => {
  // The exact shape YouTube ships. NOT `undefined` — `typeof null` is
  // 'object', which is why a `typeof localStorage === 'undefined'` guard
  // would not have saved us.
  Object.defineProperty(window, 'localStorage', { value: null, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: null, configurable: true })
  ;(window as any).__ytSeed = seed

  // Record WHERE every `visibilitychange` subscription comes from. Playables
  // forbids the Page Visibility API, and both vue-router (scroll restoration)
  // and the Playgama Bridge subscribe without us being able to stop them — so
  // the assertion has to distinguish third-party internals from our own code,
  // which a bare count cannot do.
  ;(window as any).__visibilityStacks = [] as string[]
  const nativeAdd = document.addEventListener.bind(document)
  document.addEventListener = ((type: string, ...rest: unknown[]) => {
    if (type === 'visibilitychange') {
      ;(window as any).__visibilityStacks.push(new Error().stack ?? '<no stack>')
    }
    return (nativeAdd as any)(type, ...rest)
  }) as typeof document.addEventListener
}

interface PageHarness {
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  externalRequests: string[]
}

interface OpenOptions {
  /** Seed for `ytgame.game.loadData()` — simulates a returning player. */
  seed?: string
  /** Serve an EMPTY SDK script so `window.ytgame` never appears. */
  withoutSdk?: boolean
}

const openGame = async (opts: OpenOptions = {}): Promise<PageHarness> => {
  const page = await browser.newPage()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []

  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith(gameOrigin) || url.startsWith('data:') || url.startsWith('blob:')) return
    externalRequests.push(url)
  })

  // Never hit youtube.com from CI, and never let the tag 404 into a console
  // error that would mask a real failure.
  await page.route(YT_SDK, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: opts.withoutSdk ? '' : FAKE_YTGAME
    })
  )

  await page.addInitScript(nullOutWebStorage, opts.seed ?? '')
  await page.goto(gameOrigin, { waitUntil: 'load' })
  return { page, pageErrors, consoleErrors, externalRequests }
}

const ytCalls = (page: Page) =>
  page.evaluate(() => (window as any).__ytCalls as { m: string; data?: string }[])

beforeAll(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })

  // Build in a CHILD PROCESS, not via Vite's JS API.
  //
  // `loadEnv` lets `process.env` VITE_* values override `.env.<mode>.local`,
  // and the vitest process already has the base `.env` expanded into it — so
  // an in-process `build({ mode: 'youtube' })` silently picked up
  // `VITE_APP_PVP_ENABLED=true` from `.env` and shipped PeerJS into a build
  // that must make no external calls at all. A child process gets the same
  // clean environment `pnpm build:youtube` does, which is the artefact this
  // test is supposed to be making claims about.
  await new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      [
        path.resolve(PROJECT_ROOT, 'node_modules/vite/bin/vite.js'),
        'build',
        '--mode', 'youtube',
        '--base', './',
        '--outDir', OUT_DIR,
        '--logLevel', 'error'
      ],
      { cwd: PROJECT_ROOT, env: { ...process.env, VITE_APP_PVP_ENABLED: undefined } as NodeJS.ProcessEnv },
      (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve())
    )
  })

  // `configFile: false` + `root: OUT_DIR` is deliberate. Passing the project
  // config here made `preview()` fall back to the config's own `build.outDir`
  // ("dist") and quietly serve the developer's last manual build instead of
  // the one this test just produced — exactly the kind of stale artefact that
  // makes an e2e failure impossible to trust.
  server = await preview({
    root: OUT_DIR,
    configFile: false,
    build: { outDir: '.' },
    // `allowedHosts` because we address the server as a YouTube content host;
    // Vite rejects unknown Host headers by default.
    preview: { port: 5199, strictPort: true, host: '127.0.0.1', allowedHosts: true },
    logLevel: 'silent'
  })
  const localUrl = server.resolvedUrls!.local[0]!
  const port = new URL(localUrl).port
  gameOrigin = `http://${GAME_HOST}:${port}/`

  const servedIndex = await fetch(localUrl).then(r => r.text())
  const builtIndex = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8')
  if (servedIndex !== builtIndex) {
    throw new Error(`preview server is not serving ${OUT_DIR}`)
  }

  browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP ${GAME_HOST} 127.0.0.1`]
  })
}, 180_000)

afterAll(async () => {
  await browser?.close()
  await new Promise<void>((resolve) => server?.httpServer.close(() => resolve()))
})

describe('YouTube Playables build (Playgama channel)', () => {
  it('boots with null localStorage — no uncaught TypeError', async () => {
    const { page, pageErrors, consoleErrors } = await openGame()

    await page.waitForFunction(() => (window as any).__saveManager !== undefined, null, { timeout: 30_000 })

    // The literal regression. Assert on the message shape, not just "no
    // errors", so a future null-storage read is unmistakable in the output.
    expect(
      pageErrors.filter(e => /reading '(getItem|setItem|key|removeItem)'/.test(e)),
      `null-storage crash returned: ${pageErrors.join(' | ')}`
    ).toEqual([])
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([])
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([])

    // ...and the app actually rendered, rather than merely not throwing.
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.close()
  })

  it('reports that the storage shim engaged', async () => {
    const { page } = await openGame()
    const shim = await page.evaluate(() => (window as any).__storageShim)
    expect(shim.localStorage).toBe('accessor is null')
    expect(shim.sessionStorage).toBe('accessor is null')
    await page.close()
  })

  it('initializes Bridge v2 and drives YouTube through the youtube adapter', async () => {
    // `firstFrameReady` is called by the Bridge's YouTube adapter at the end of
    // its own init, so seeing it proves the whole chain: npm package loaded →
    // platform detected as `youtube` → `window.ytgame` picked up →
    // `initialize()` resolved. That chain failing is what "game does not start
    // in two of three testing environments" looks like from outside.
    const { page } = await openGame()
    await page.waitForFunction(
      () => ((window as any).__ytCalls as { m: string }[])?.some(c => c.m === 'firstFrameReady'),
      null,
      { timeout: 30_000 }
    )

    // And the certification-mandatory `game_ready` reaches YouTube once assets
    // are loaded — our `sendMessage('game_ready')` routes through the adapter
    // to `ytgame.game.gameReady()`.
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.waitForFunction(
      () => ((window as any).__ytCalls as { m: string }[]).some(c => c.m === 'gameReady'),
      null,
      { timeout: 30_000 }
    )
    await page.close()
  })

  it('still selects the Playgama save strategy', async () => {
    // The whole point of the channel model: YouTube must NOT knock the build
    // down to LocalStorageStrategy, which against a volatile in-memory shim
    // would mean no saves at all.
    const { page } = await openGame()
    await page.waitForFunction(() => (window as any).__saveManager !== undefined, null, { timeout: 30_000 })
    const name = await page.evaluate(() => (window as any).__saveManager.strategyName)
    expect(name).toBe('playgama')
    await page.close()
  })

  it('persists progress through ytgame.saveData via bridge.storage', async () => {
    // Playgama QA: "in an environment where it starts, it does not save
    // properly." v1 had to pick a storage TYPE and fell back to
    // `local_storage`, which cannot exist on Playables. v2 routes
    // `bridge.storage.set` to `ytgame.game.saveData` itself.
    const { page } = await openGame()
    // Wait for HYDRATION, not just for the handle to exist. `__saveManager` is
    // published before `init()` runs, and `init()` is what patches
    // `localStorage.setItem` to forward writes to the strategy — a write made
    // before that lands only in the in-memory shim and never reaches YouTube.
    await page.waitForFunction(
      () => (window as any).__saveManager?.isHydrated?.() === true,
      null,
      { timeout: 40_000 }
    )
    await page.evaluate(() => localStorage.setItem('smashers_coins', '4321'))

    await page.waitForFunction(
      () => ((window as any).__ytCalls as { m: string; data?: string }[])
        .some(c => c.m === 'saveData' && (c.data ?? '').includes('4321')),
      null,
      { timeout: 20_000 }
    )

    const methods = (await ytCalls(page)).map(c => c.m)
    // "Game MUST await loadData before calling saveData."
    expect(methods.indexOf('loadData')).toBeGreaterThanOrEqual(0)
    expect(methods.indexOf('loadData')).toBeLessThan(methods.indexOf('saveData'))
    await page.close()
  })

  it('rehydrates that progress on the next load', async () => {
    const { page } = await openGame()
    await page.waitForFunction(
      () => (window as any).__saveManager?.isHydrated?.() === true,
      null,
      { timeout: 40_000 }
    )
    await page.evaluate(() => localStorage.setItem('smashers_coins', '4321'))
    await page.waitForFunction(
      () => ((window as any).__ytCalls as { m: string; data?: string }[])
        .some(c => c.m === 'saveData' && (c.data ?? '').includes('4321')),
      null,
      { timeout: 20_000 }
    )
    const cloud = await page.evaluate(() => (window as any).__ytCloud())
    await page.close()

    // Fresh page seeded with what YouTube would hand back. Nothing survives in
    // Web Storage — the in-memory shim is wiped on reload by design — so a
    // value that comes back proves it came from the cloud save.
    const second = await openGame({ seed: cloud })
    await second.page.waitForFunction(
      () => (window as any).__saveManager?.isHydrated?.() === true,
      null,
      { timeout: 30_000 }
    )
    const coins = await second.page.evaluate(() => localStorage.getItem('smashers_coins'))
    expect(coins).toBe('4321')
    await second.page.close()
  })

  it('makes no external request other than YouTube\'s own SDK', async () => {
    // "Please note that any external server calls are prohibited on YouTube."
    // Since the v1 → v2 migration the Bridge is bundled from npm, so
    // `bridge.playgama.com` is gone entirely — and this runs with the Bridge
    // fully initialized, so the Bridge's own analytics would show up here too
    // if the youtube adapter emitted any.
    const { page, externalRequests } = await openGame()
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.waitForTimeout(3_000)

    const disallowed = externalRequests.filter(u => u !== YT_SDK)
    expect(disallowed, `external requests: ${disallowed.join(', ')}`).toEqual([])
    await page.close()
  })

  it('bundles the Playgama Bridge instead of loading it from the CDN', async () => {
    const html = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8')
    expect(html).not.toContain('bridge.playgama.com')
    expect(html).toContain('youtube.com/game_api/v1')

    const chunks = fs.readdirSync(path.join(OUT_DIR, 'assets')).filter(f => f.endsWith('.js'))
    const bridgeChunk = chunks.filter(f => /playgama-bridge/.test(f))
    expect(bridgeChunk, 'the Bridge npm package should ship as its own chunk').toHaveLength(1)
  })

  it('still starts when the ytgame SDK never appears', async () => {
    // The Bridge's youtube adapter waits for `window.ytgame` with a 100ms poll
    // that has NO timeout, so a missing/blocked SDK would hang `initialize()`
    // forever. `playgamaPlugin`'s own 15s race is the backstop. A boot that
    // hangs on the splash is indistinguishable from a crash to QA — which is
    // what "does not start in two of three testing environments" looks like.
    const { page, pageErrors } = await openGame({ withoutSdk: true })
    await page.waitForSelector('#app-root', { timeout: 40_000 })
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([])
    await page.close()
  })

  it('ships no CSP meta tag', async () => {
    // A meta-tag policy applies to the whole document, which on Playables is
    // shared with YouTube's own SDK and telemetry. Same call the Poki build
    // makes, for the same reason.
    const html = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8')
    expect(html).not.toContain('Content-Security-Policy')
  })

  it('subscribes to the Page Visibility API from no game code', async () => {
    // "Game MUST NOT use the web Page Visibility API or similar web APIs and
    // MUST only use Playables SDK onPause and onResume."
    //
    // Three of our modules used to subscribe: App.vue (music pause), main.ts
    // (save flush on background) and usePVP.ts (module-scope PeerJS reconnect,
    // registered even on PvP-disabled builds). All three are gated off here;
    // the Bridge's PAUSE_STATE_CHANGED — fed by Playables' own onPause on the
    // `youtube` adapter — drives music, the physics gate and the save flush.
    //
    // vue-router (scroll restoration) and the Bridge itself also subscribe and
    // we cannot stop either, so the assertion is "nothing from a GAME chunk".
    // Only the IMMEDIATE caller frame counts: `createRouter()` is called from
    // our entry chunk, so the router's own subscription has an `index-*.js`
    // frame further down its stack.
    const { page } = await openGame()
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.waitForTimeout(1_000)

    const stacks: string[] = await page.evaluate(() => (window as any).__visibilityStacks)
    const callerFrame = (stack: string): string => stack.split(/\r?\n/)[2] ?? ''
    const fromGameCode = stacks.filter(
      st => /\/assets\/(index|App|SpinnerArena|plugin-)/.test(callerFrame(st))
    )
    expect(
      fromGameCode,
      `game code subscribed to visibilitychange: ${fromGameCode.join(' --- ')}`
    ).toEqual([])

    // Positive control: the instrumentation is wired up, so an empty
    // `fromGameCode` means "nobody subscribed", not "nothing was recorded".
    expect(stacks.length).toBeGreaterThan(0)
    await page.close()
  })

  it('ships no PeerJS / WebRTC of our own (PvP needs an external TURN server)', async () => {
    // The vendored Bridge chunk is excluded on purpose: it carries WebRTC
    // constructor names for the Discord / Telegram adapters that never run on
    // the YouTube platform. This is about OUR PvP code, which
    // `.env.youtube.local` compiles out with `VITE_APP_PVP_ENABLED=false`.
    const chunks = fs.readdirSync(path.join(OUT_DIR, 'assets'))
      .filter(f => f.endsWith('.js') && !/playgama-bridge/.test(f))
    const leaks = chunks.filter(f =>
      /RTCPeerConnection|RTCDataChannel/.test(fs.readFileSync(path.join(OUT_DIR, 'assets', f), 'utf8'))
    )
    expect(leaks, `PeerJS leaked into: ${leaks.join(', ')}`).toEqual([])

    // And no peerjs chunk should be emitted at all — the build-time ternary in
    // `usePVP.ts` removes the dynamic import, not just its call site.
    const peerChunks = fs.readdirSync(path.join(OUT_DIR, 'assets')).filter(f => /peerjs/i.test(f))
    expect(peerChunks, `peerjs chunk emitted: ${peerChunks.join(', ')}`).toEqual([])
  })
})
