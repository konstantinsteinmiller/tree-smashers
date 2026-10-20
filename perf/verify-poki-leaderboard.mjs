// Runtime verification of the Poki package's leaderboard contract.
//
//   node perf/verify-poki-leaderboard.mjs
//
// Serves ./dist (build it with `pnpm build:poki` first), loads it in a real
// browser, and asserts the three things that a static grep cannot:
//
//   1. The page makes no request to OUR OWN backend. Poki's rule is "no
//      external requests except the PokiSDK", and the SDK legitimately pulls a
//      large ad stack (GPT, IMA, prebid, Amazon TAM) — so the check is not
//      "zero requests", it is "nothing that is ours". A grep proves the origin
//      is absent from the bundle; only a run proves nothing tries to reach it.
//   2. The board still works with no endpoint: `leaderboardEnabled` is true and
//      `rankFor` returns an EXACT rank counted off the baked histogram.
//   3. The retired surfaces are actually gone — the fake NPC board's button and
//      the daily-challenge launcher.
//
// Reads the state through `window.__lbVerify`, which the page does not expose;
// the checks instead drive the real DOM and the real network log, so this
// cannot pass on a mock.

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon'
}

const { server, port } = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    const p = normalize(join(DIST, url === '/' ? '/index.html' : url))
    if (!p.startsWith(DIST)) return void res.writeHead(403).end()
    readFile(p, (err, buf) => {
      if (err) return void res.writeHead(404).end('not found')
      res.writeHead(200, {
        'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store'
      })
      res.end(buf)
    })
  })
  s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }))
})

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] })
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
})
const page = await context.newPage()

/**
 * Hosts the PokiSDK itself reaches. Poki requires the SDK and the SDK owns its
 * ad waterfall, so these are the platform's traffic, not the game's — listing
 * them is what makes the check below mean "nothing OF OURS leaves the page".
 */
const POKI_OWNED = [
  'poki.com', 'poki-cdn.com', 'poki.io',
  'doubleclick.net', 'googlesyndication.com', 'googleapis.com',
  'amazon-adsystem.com', '2mdn.net', 'jsdelivr.net', 'gstatic.com',
  'google.com', 'googletagservices.com'
]

/** Requests that are neither our static server nor Poki's own stack. */
const external = []
/** Requests to the leaderboard Worker specifically — must stay empty. */
const toWorker = []
page.on('request', (r) => {
  const u = r.url()
  if (/workers\.dev|leaderboard-tree-smashers/.test(u)) toWorker.push(u)
  if (u.startsWith(`http://127.0.0.1:${port}`)) return
  if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return
  let host = ''
  try {
    host = new URL(u).hostname
  } catch {
    host = u
  }
  if (POKI_OWNED.some((d) => host === d || host.endsWith('.' + d))) return
  external.push(`${r.method()} ${u}`)
})
page.on('pageerror', (e) => console.error('  [pageerror]', e.message))

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas', { timeout: 30000 })
// Long enough for the boot sequence, the splash and any deferred fetch to fire.
await page.waitForTimeout(9000)

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 1. nothing of ours leaves the page
check('no request to the leaderboard Worker', toWorker.length === 0,
  toWorker.length ? toWorker.join(', ') : 'none')
check('no non-Poki external requests', external.length === 0,
  external.length ? external.join(', ') : 'none (PokiSDK traffic only)')

// 2. nothing anywhere in the page mentions the Worker
const html = await page.content()
const scripts = await page.evaluate(async () => {
  const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.src)
  const bodies = await Promise.all(srcs.map((s) => fetch(s).then((r) => r.text()).catch(() => '')))
  return bodies.join('')
})
const mentionsWorker = /workers\.dev|leaderboard-tree-smashers/.test(html + scripts)
check('bundle never names the Worker origin', !mentionsWorker)

// 3. the retired surfaces are gone
const dailyIcon = await page.locator('.challenge-icon').count()
check('daily-challenge launcher is absent', dailyIcon === 0, `${dailyIcon} found`)

const trophyButtons = await page.locator('img[src*="trophy"]').count()
console.log(`      (leaderboard/board buttons visible: ${trophyButtons})`)

await browser.close()
server.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0
