#!/usr/bin/env node
// ─── Localization screenshot check ──────────────────────────────────────────
//
// Boots the REAL game in a private headless Chrome, in one locale, and
// screenshots the screens where text most often breaks — main menu, options,
// the language picker, the spinner config modal, a battle HUD and the win
// screen — at mobile landscape, mobile portrait and desktop. It also measures
// every shot for the defects a key-parity test cannot see: text overflowing
// its box, the page scrolling sideways, and the document attributes the font /
// RTL rules key off (`lang`, `data-script`, `data-dir`).
//
//   node scripts/l10n-screenshots.mjs --locale ar
//   node scripts/l10n-screenshots.mjs --locale pt-BR --screens menu,options,language
//   node scripts/l10n-screenshots.mjs --locale de --viewports mobile-landscape
//   node scripts/l10n-screenshots.mjs --browser-lang pt-PT      # detection: no stored choice,
//                                                               # the browser language decides
//   node scripts/l10n-screenshots.mjs --locale ar --out ./shots
//
// Output: PNGs + report.json in <out> (default: <os tmp>/tree-smashers-l10n/<locale>).
// Then LOOK at the PNGs: tofu (□), clipped or wrapped button captions, text
// running out of a badge, isolated (unjoined) Arabic letters, mixed fonts
// inside one word.
//
// Safety (see the user's CLAUDE.md "Browser MCP is locked"):
//   • a fresh Chrome with its own throwaway profile — never the MCP profile,
//     never a browser that is already open;
//   • a Vite dev server on a random free port, and the served <title> is
//     checked before anything is trusted, so a stale server from another game
//     can never be screenshotted by mistake.
//
// The dev server (not a build) is deliberate: the battle and win screens are
// reached through the dev-only `window.__smashers` seam (src/utils/previewSeam.ts).

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const { chromium } = require('playwright')
const { saveFixture } = await import(pathToFileURL(path.join(ROOT, 'tools/preview-video/scenarios/_drive.mjs')).href)

// ─── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(readmeFromHeader())
  process.exit(0)
}

const browserLang = arg('browser-lang')
const locale = arg('locale', browserLang ? null : 'en')
const ALL_SCREENS = ['menu', 'options', 'language', 'config', 'battle', 'win']
const screens = (arg('screens') ?? ALL_SCREENS.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
const VIEWPORTS = {
  'mobile-landscape': { width: 844, height: 390, mobile: true },
  'mobile-portrait': { width: 390, height: 844, mobile: true },
  desktop: { width: 1280, height: 720, mobile: false }
}
const viewports = (arg('viewports') ?? Object.keys(VIEWPORTS).join(',')).split(',').map((s) => s.trim())
const outDir = path.resolve(arg('out') ?? path.join(tmpdir(), 'tree-smashers-l10n', locale ?? `browser-${browserLang}`))
const CHROME = arg('chrome') ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

for (const s of screens) if (!ALL_SCREENS.includes(s)) fail(`unknown screen "${s}" (have: ${ALL_SCREENS.join(', ')})`)
for (const v of viewports) if (!VIEWPORTS[v]) fail(`unknown viewport "${v}" (have: ${Object.keys(VIEWPORTS).join(', ')})`)

function fail(msg) {
  console.error(`l10n-screenshots: ${msg}`)
  process.exit(1)
}

function readmeFromHeader() {
  return 'See the header of scripts/l10n-screenshots.mjs and src/i18n/TRANSLATION-GUIDE.md.'
}

// ─── Dev server on a random free port, verified by <title> ───────────────────

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })

const port = Number(arg('port')) || (await freePort())
// Bind and probe the SAME explicit address: `localhost` can resolve to ::1 on
// one side and 127.0.0.1 on the other, which looks exactly like a dead server.
const origin = `http://127.0.0.1:${port}`
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' }
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

const killServer = () => {
  if (server.exitCode !== null) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill('SIGTERM')
}
process.on('exit', killServer)
process.on('SIGINT', () => process.exit(130))

const deadline = Date.now() + 180_000
let title = null
while (Date.now() < deadline) {
  if (server.exitCode !== null) break
  try {
    // Generous per-request timeout: the first request pays for Vite's
    // dependency pre-bundling.
    const html = await (await fetch(origin, { signal: AbortSignal.timeout(30_000) })).text()
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    break
  } catch {
    await sleep(400)
  }
}
if (title === null) fail(`dev server never answered on ${origin}\n${serverLog}`)
if (title !== 'Tree Smashers') fail(`${origin} serves "${title}", not Tree Smashers — refusing to screenshot the wrong game`)
console.log(`l10n-screenshots: dev server ${origin} ("${title}")`)

// ─── Browser ──────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required']
})

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'

const save = saveFixture({
  smashers_intro_seen: '1',
  ...(locale ? { smashers_user_language: locale } : {})
})
if (!locale) delete save.smashers_user_language

/** Wait until the game is interactive: seam up, both splashes gone. */
const waitForGame = async (page) => {
  // Generous: the first load of a fresh dev server compiles the whole graph.
  await page.waitForFunction(() => !!window.__smashers && window.__smashers.snapshot().player.length > 0, null, { timeout: 120_000 })
  await page.waitForFunction(() => !document.getElementById('static-splash'), null, { timeout: 60_000 })
  await sleep(1800) // splash fade + menu entrance animations
}

/** Click a menu icon button until a modal is actually open (the menu can
 *  still be animating in and swallow the first tap). */
const clickIcon = async (page, imgPart) => {
  const btn = page.locator(`img[src*="${imgPart}"]`).first()
  for (let attempt = 0; attempt < 4; attempt++) {
    await btn.waitFor({ state: 'visible', timeout: 15_000 })
    await btn.click()
    try {
      await page.locator('.modal-overlay').first().waitFor({ state: 'visible', timeout: 4_000 })
      await sleep(900) // pop-in animation
      return
    } catch { /* not open yet — retry */
    }
  }
  throw new Error(`clicking ${imgPart} never opened a modal`)
}

const startBattle = async (page) => {
  await page.evaluate(() => window.__smashers.seed(1337))
  await page.evaluate(() => window.__smashers.begin())
  await page.waitForFunction(() => window.__smashers.snapshot().phase === 'player_turn', null, { timeout: 30_000 })
  await sleep(600)
}

const SCREENS = {
  menu: async () => {
  },
  options: async (page) => clickIcon(page, 'gears_128x128'),
  language: async (page) => {
    await clickIcon(page, 'gears_128x128')
    await page.locator('[data-testid="language-picker"]').click()
    await sleep(900)
  },
  config: async (page) => clickIcon(page, 'team_128x128'),
  battle: async (page) => startBattle(page),
  win: async (page) => {
    await startBattle(page)
    await page.evaluate(() => {
      window.__smashers.setSideHp('npc', 0.001)
      window.__smashers.aimAtBlade(0, 'npc', 0, 1)
      window.__smashers.fire()
    })
    await page.waitForFunction(() => window.__smashers.snapshot().result === 'win', null, { timeout: 30_000 })
    // The reward overlay animates in after the verdict.
    await sleep(3500)
  }
}

/** Text-overflow + document-state probe, run in the page. */
const probe = () => {
  const el = document.documentElement
  const overflow = []
  for (const node of document.body.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement)) continue
    const text = [...node.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!text) continue
    const cs = getComputedStyle(node)
    if (cs.display === 'none' || cs.visibility === 'hidden' || node.offsetParent === null) continue
    const clipsX = node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0
    if (clipsX && (cs.overflowX === 'visible' || cs.textOverflow === 'ellipsis')) {
      overflow.push({
        text: text.slice(0, 60),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        ellipsis: cs.textOverflow === 'ellipsis'
      })
    }
  }
  return {
    lang: el.getAttribute('lang'),
    locale: el.getAttribute('data-locale'),
    script: el.getAttribute('data-script'),
    dir: el.getAttribute('data-dir'),
    fontGame: getComputedStyle(el).getPropertyValue('--font-game').trim().slice(0, 80),
    pageScrollsSideways: el.scrollWidth > el.clientWidth + 1,
    overflow: overflow.slice(0, 25)
  }
}

mkdirSync(outDir, { recursive: true })
const report = { locale, browserLang, origin, shots: [] }
let problems = 0

for (const vpName of viewports) {
  const vp = VIEWPORTS[vpName]
  for (const screen of screens) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      ...(vp.mobile ? { userAgent: MOBILE_UA } : {}),
      ...(browserLang ? { locale: browserLang } : { locale: 'en-US' })
    })
    await context.addInitScript((s) => {
      try {
        localStorage.clear()
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
      } catch { /* private mode */
      }
    }, save)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const file = path.join(outDir, `${vpName}-${screen}.png`)
    try {
      // The first navigation of a fresh dev server compiles the module graph —
      // on a busy machine that alone can exceed Playwright's 30 s default.
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 })
      await waitForGame(page)
      await SCREENS[screen](page)
      await page.screenshot({ path: file })
      const info = await page.evaluate(probe)
      const shot = { viewport: vpName, screen, file, ...info, errors }
      report.shots.push(shot)
      const flags = []
      if (info.pageScrollsSideways) flags.push('PAGE SCROLLS SIDEWAYS')
      if (info.overflow.length) flags.push(`${info.overflow.length} overflowing text box(es)`)
      if (errors.length) flags.push(`${errors.length} page error(s)`)
      if (locale && info.locale !== locale) flags.push(`booted "${info.locale}", expected "${locale}"`)
      problems += flags.length
      console.log(`  ${vpName.padEnd(16)} ${screen.padEnd(9)} lang=${info.lang} script=${info.script} dir=${info.dir}${flags.length ? '  ⚠ ' + flags.join('; ') : ''}`)
    } catch (e) {
      problems++
      report.shots.push({ viewport: vpName, screen, file, failed: String(e), errors })
      console.log(`  ${vpName.padEnd(16)} ${screen.padEnd(9)} FAILED: ${String(e).split('\n')[0]}`)
      try {
        await page.screenshot({ path: file })
      } catch { /* page gone */
      }
    }
    await context.close()
  }
}

await browser.close()
writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\nl10n-screenshots: ${report.shots.length} shot(s) → ${outDir}`)
console.log(problems ? `⚠ ${problems} flag(s) — see report.json, then LOOK at the PNGs.` : 'No automatic flags — now LOOK at the PNGs (tofu, clipping, unjoined Arabic, mixed fonts).')
killServer()
process.exit(0)
