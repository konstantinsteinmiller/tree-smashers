// ─── End-to-end: the Playgama build boots inside YouTube's runtime ─────────
//
// Reproduces, and then guards, the 2026-09 YouTube QA rejection:
//
//     Game does not start. Console error:
//     Uncaught TypeError: Cannot read properties of null (reading 'getItem')
//       at plugin-gd-CQHccaXY.js:19:42110
//
// chaos-arena reaches YouTube Playables THROUGH Playgama, so the artefact
// under test is a normal Playgama build (`VITE_APP_PLAYGAMA=true`) with the
// YouTube channel modifier on top. The Bridge still owns saves, ads and
// lifecycle; what YouTube adds is a runtime the Bridge cannot paper over:
//
//   • `window.localStorage` and `window.sessionStorage` are **null**. A dozen
//     composables read them at module-evaluation time, so the app died before
//     `bootstrap()` ever ran. Not reproducible in jsdom.
//   • The failure was inside a PRODUCTION chunk graph. The shim that fixes it
//     is a classic `<script>` in index.html precisely because a module-graph
//     import is deferred and loses the race against the entry chunk's static
//     imports — an ordering that only exists after a build.
//
// So this runs the REAL `youtube`-mode build under `vite preview`, with
// `addInitScript` nulling both storages before a single page script runs.

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

const BRIDGE_CDN = 'https://bridge.playgama.com/v1/stable/playgama-bridge.js'

let server: PreviewServer
let browser: Browser
let baseUrl: string

/**
 * Runs in page context BEFORE any script on the page. Recreates the one thing
 * about the Playables runtime our own environment cannot: null Web Storage.
 */
const nullOutWebStorage = () => {
  // The exact shape YouTube ships. NOT `undefined` — `typeof null` is
  // 'object', which is why a `typeof localStorage === 'undefined'` guard
  // would not have saved us.
  Object.defineProperty(window, 'localStorage', { value: null, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: null, configurable: true })

  // Record WHERE every `visibilitychange` subscription comes from. Playables
  // forbids the Page Visibility API, and vue-router subscribes for scroll
  // restoration without us being able to stop it — so the assertion has to
  // distinguish framework internals from our own code, which a bare count
  // cannot do.
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

const openGame = async (): Promise<PageHarness> => {
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
    if (url.startsWith(baseUrl) || url.startsWith('data:') || url.startsWith('blob:')) return
    externalRequests.push(url)
  })

  // Serve the Bridge locally. We must neither hit Playgama's CDN from CI nor
  // let the tag fail into a console error that would mask a real failure. An
  // empty body is the right stub: the Bridge is absent, `playgamaPlugin` times
  // out, and the game must still boot — which is exactly the hostile case the
  // storage shim has to survive.
  await page.route(BRIDGE_CDN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  )

  await page.addInitScript(nullOutWebStorage)
  await page.goto(baseUrl, { waitUntil: 'load' })
  return { page, pageErrors, consoleErrors, externalRequests }
}

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
    preview: { port: 5199, strictPort: false },
    logLevel: 'silent'
  })
  baseUrl = server.resolvedUrls!.local[0]!

  const servedIndex = await fetch(baseUrl).then(r => r.text())
  const builtIndex = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8')
  if (servedIndex !== builtIndex) {
    throw new Error(`preview server is not serving ${OUT_DIR}`)
  }

  browser = await chromium.launch()
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

  it('survives the Bridge never answering', async () => {
    // The stubbed Bridge in `openGame` never defines `window.bridge`, so
    // `playgamaPlugin()` times out. The game must still reach the arena —
    // a boot that hangs on the splash is indistinguishable from the crash
    // as far as QA is concerned.
    const { page, pageErrors } = await openGame()
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    expect(pageErrors).toEqual([])
    await page.close()
  })

  it('makes no external request other than the Playgama Bridge', async () => {
    // "Please note that any external server calls are prohibited on YouTube."
    // The Bridge CDN tag is the one remaining exception and is tracked
    // separately — see the assertion below and VITE_APP_PLAYGAMA_BRIDGE_LOCAL.
    const { page, externalRequests } = await openGame()
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.waitForTimeout(2_000)

    const disallowed = externalRequests.filter(u => u !== BRIDGE_CDN)
    expect(disallowed, `external requests: ${disallowed.join(', ')}`).toEqual([])
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
    // (save flush on background) and usePVP.ts (module-scope PeerJS
    // reconnect, registered even on PvP-disabled builds). All three are gated
    // off here; the Bridge's PAUSE_STATE_CHANGED — fed by Playables' own
    // onPause on the `youtube` adapter — drives music, the physics gate and
    // the save flush instead.
    //
    // vue-router subscribes too, for scroll restoration, and we cannot stop it
    // without forking the router — so the assertion is "nothing from a GAME
    // chunk", not a raw count. Only the IMMEDIATE caller frame counts:
    // `createRouter()` is called from our entry chunk, so the router's own
    // subscription has an `index-*.js` frame further down its stack.
    const { page } = await openGame()
    await page.waitForSelector('#app-root', { timeout: 30_000 })
    await page.waitForTimeout(1_000)

    const stacks: string[] = await page.evaluate(() => (window as any).__visibilityStacks)
    const callerFrame = (stack: string): string => stack.split(/\r?\n/)[2] ?? ''
    const fromGameCode = stacks.filter(
      st => /\/assets\/(index|App|SpinnerArena|plugin)-/.test(callerFrame(st))
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

  it('ships no PeerJS / WebRTC (PvP is an external service)', async () => {
    const chunks = fs.readdirSync(path.join(OUT_DIR, 'assets')).filter(f => f.endsWith('.js'))
    const leaks = chunks.filter(f =>
      /RTCPeerConnection|RTCDataChannel/.test(fs.readFileSync(path.join(OUT_DIR, 'assets', f), 'utf8'))
    )
    expect(leaks, `PeerJS leaked into: ${leaks.join(', ')}`).toEqual([])
  })
})
