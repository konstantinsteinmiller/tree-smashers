// Verifies the adaptive quality tier end-to-end in a real browser:
//
//   node perf/quality-check.mjs
//
// Runs the same scripted fight at several CPU-throttle levels with
// `?quality=auto` and reports, for each, the frame rate the device achieved
// and the tier auto-detection settled on. Expectations:
//
//   fast device   -> stays 'high'   (nothing to fix)
//   slow device   -> flips to 'low' (measured fps under the 25 threshold)
//
// The tier is read back out of the same localStorage key the game persists,
// so this tests the shipped decision path, not a reimplementation of it.

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, readFileSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedScript } from './scenario.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const probe = readFileSync(join(__dirname, 'probe-v2.js'), 'utf8')
const DIST = join(ROOT, 'dist')

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d
}
const STAGE = Number(arg('stage', 48))
const PLAY_MS = Number(arg('ms', 30000))
const THROTTLES = arg('throttles', '1,4,8,16,24').split(',').map(Number)

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon'
}

const serve = () =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0])
      const p = normalize(join(DIST, url === '/' ? '/index.html' : url))
      if (!p.startsWith(DIST)) return void res.writeHead(403).end()
      readFile(p, (err, buf) => {
        if (err) return void res.writeHead(404).end('nf')
        res.writeHead(200, {
          'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store'
        })
        res.end(buf)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })

async function runOne(port, throttle) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
  })
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/126.0.0.0 Mobile Safari/537.36'
  })
  await context.addInitScript(probe)
  const seed = seedScript(STAGE)
  if (seed) await context.addInitScript({ content: seed })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })

  await page.goto(`http://127.0.0.1:${port}/index.html?quality=auto&seed=7`, {
    waitUntil: 'domcontentloaded'
  })
  if (!/tree smashers/i.test(await page.title())) throw new Error('wrong app served')
  await page.waitForSelector('canvas')
  await page.waitForTimeout(Math.max(9000, 6000 + throttle * 400))

  const box = await page.locator('canvas').first().boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const DRAGS = [[120, -140], [-130, -120], [60, -170], [-70, -150], [150, -110]]
  let i = 0
  const step = async () => {
    await page.touchscreen.tap(cx, cy).catch(() => {
    })
    const [dx, dy] = DRAGS[i++ % DRAGS.length]
    const sx = cx
    const sy = cy + box.height * 0.21
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + dx, sy + dy, { steps: 6 })
    await page.mouse.up()
  }
  await step().catch(() => {
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__perf.reset())

  const deadline = Date.now() + PLAY_MS
  while (Date.now() < deadline) {
    await page.waitForTimeout(2500)
    if (Date.now() >= deadline) break
    await step().catch(() => {
    })
  }

  const report = await page.evaluate(() => window.__perf.report())
  const verdict = await page.evaluate(() => {
    try {
      return localStorage.getItem('ca_device_quality_verdict') ?? 'high'
    } catch {
      return 'unknown'
    }
  })
  await browser.close()
  return { fps: report.fps, deltaP50: report.deltaP50, verdict }
}

const { server, port } = await serve()
console.log(`stage ${STAGE} | ${PLAY_MS / 1000}s per level | quality=auto\n`)
console.log('throttle    fps   deltaP50    tier settled on')
console.log('─'.repeat(48))
try {
  for (const t of THROTTLES) {
    const r = await runOne(port, t)
    console.log(
      `${String(t + 'x').padStart(6)}  ${String(r.fps).padStart(7)}  ` +
      `${String(r.deltaP50).padStart(8)}    ${r.verdict}`
    )
  }
} finally {
  server.close()
}
