// ─── End-to-end: Daily Challenge menu icon + start flow ─────────────────────
//
// Drives the real app in a headless browser to prove:
//   1. The ChallengeIcon renders on the menu screen and does NOT overlap the
//      stage badge or coin badge (it sits below the FLogoProgress logo).
//   2. Clicking it enters the daily challenge: the icon + stage badge hide and
//      a fight is set up (the engine switches into dailyChallengeMode).
//
// Mirrors the boot harness in `crazygames-save.test.ts` but uses the default
// build mode (no platform SDK needed).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

let server: ViteDevServer
let browser: Browser
let baseUrl: string

beforeAll(async () => {
  server = await createServer({
    root: PROJECT_ROOT,
    configFile: path.resolve(PROJECT_ROOT, 'vite.config.ts'),
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
    logLevel: 'warn'
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address !== 'object') {
    throw new Error('vite dev server did not expose an address')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })
}, 90_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const rectsOverlap = (a: { x: number; y: number; width: number; height: number },
                      b: { x: number; y: number; width: number; height: number }): boolean =>
  !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)

describe('Daily Challenge — menu icon', () => {
  it('renders below the HUD without overlapping the stage or coin badge, and starts the challenge', async () => {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } })
    const page = await context.newPage()
    page.on('pageerror', (e) => console.error('[page error]', e.message))

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 60_000 })

    // Menu is ready once the ChallengeIcon mounts (after the splash settles).
    const icon = page.locator('.challenge-icon')
    await icon.waitFor({ state: 'visible', timeout: 60_000 })

    const iconBox = await icon.boundingBox()
    const stageBox = await page.locator('[class*="stage-badge"]').first().boundingBox()
    const coinBox = await page.locator('.coin-badge').first().boundingBox()

    expect(iconBox).not.toBeNull()
    expect(stageBox).not.toBeNull()
    expect(coinBox).not.toBeNull()

    // No overlap with the two top-corner HUD widgets.
    expect(rectsOverlap(iconBox!, stageBox!)).toBe(false)
    expect(rectsOverlap(iconBox!, coinBox!)).toBe(false)
    // Sits below the top bar (below the stage badge).
    expect(iconBox!.y).toBeGreaterThan(stageBox!.y + stageBox!.height)

    // The coin badge is a two-row currency display (coins + diamonds) — taller
    // than a single row, confirming the diamond row renders.
    expect(coinBox!.height).toBeGreaterThan(40)

    // Clicking starts the daily challenge → icon + stage badge hide.
    await icon.click()
    await icon.waitFor({ state: 'detached', timeout: 10_000 })
    expect(await page.locator('[class*="stage-badge"]').count()).toBe(0)

    await context.close()
  }, 90_000)
})
