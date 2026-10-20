// Attribution run: capture a devtools timeline trace of a live battle under
// mobile emulation + CPU throttling and aggregate main-thread SELF time by
// event name, plus JS self time by function.
//
//   node perf/trace.mjs [--throttle 4] [--ms 12000] [--a "query=string"]
//
// Answers "where does the frame actually go" — the step SKILL.md § 1 calls
// "attribute the cost before choosing a lever".

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedScript } from './scenario.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const probe = readFileSync(join(__dirname, 'probe-v2.js'), 'utf8')

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d
}
const THROTTLE = Number(arg('throttle', 4))
const SAMPLE_MS = Number(arg('ms', 12000))
const WARMUP_MS = Number(arg('warmup', 9000))
const QUERY = arg('a', '')
const STAGE = Number(arg('stage', 1))
const DIST = join(ROOT, arg('dist', 'dist'))

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

const { server, port } = await serve()

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
const seedInit = seedScript(STAGE)
if (seedInit) await context.addInitScript({ content: seedInit })
const page = await context.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const cdp = await context.newCDPSession(page)
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

const qs = new URLSearchParams({ seed: '7' })
if (QUERY) for (const [k, v] of new URLSearchParams(QUERY)) qs.set(k, v)
await page.goto(`http://127.0.0.1:${port}/index.html?${qs}`, { waitUntil: 'domcontentloaded' })
const title = await page.title()
if (!/tree smashers/i.test(title)) throw new Error(`wrong app served: "${title}"`)
await page.waitForSelector('canvas')
await page.waitForTimeout(WARMUP_MS)

const box = await page.locator('canvas').first().boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const launch = async (dx, dy) => {
  const sx = cx
  const sy = cy + box.height * 0.21
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + dx, sy + dy, { steps: 6 })
  await page.mouse.up()
}
await page.touchscreen.tap(cx, cy).catch(() => {
})
await page.waitForTimeout(1800)
await launch(110, -150).catch(() => {
})
await page.waitForTimeout(1500)

// ── trace ──────────────────────────────────────────────────────────────────
const events = []
cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value))
await cdp.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: {
    includedCategories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'v8.execute',
      'blink.user_timing'
    ]
  }
})

await page.evaluate(() => window.__perf.reset())
const deadline = Date.now() + SAMPLE_MS
let i = 0
const DRAGS = [[120, -140], [-130, -120], [60, -170], [-70, -150], [150, -110]]
while (Date.now() < deadline) {
  await page.waitForTimeout(2200)
  if (Date.now() >= deadline) break
  await page.touchscreen.tap(cx, cy).catch(() => {
  })
  const [dx, dy] = DRAGS[i++ % DRAGS.length]
  await launch(dx, dy).catch(() => {
  })
}
const report = await page.evaluate(() => window.__perf.report())

const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.end')
await done
await browser.close()
server.close()

// ── aggregate ──────────────────────────────────────────────────────────────
// Find the renderer main thread: the one with the most CrRendererMain events.
const threadNames = new Map()
for (const e of events) {
  if (e.name === 'thread_name' && e.args?.name) threadNames.set(`${e.pid}:${e.tid}`, e.args.name)
}
const mainKey = [...threadNames.entries()].find(([, n]) => n === 'CrRendererMain')?.[0]
const [mpid, mtid] = mainKey ? mainKey.split(':').map(Number) : [null, null]

const onMain = events.filter(
  (e) => e.pid === mpid && e.tid === mtid && (e.ph === 'X' || e.ph === 'B') && typeof e.dur === 'number'
)
onMain.sort((a, b) => a.ts - b.ts || b.dur - a.dur)

// Self time = duration minus the duration of directly-nested children.
const stack = []
const self = new Map()
const total = new Map()
for (const e of onMain) {
  const end = e.ts + e.dur
  while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop()
  const parent = stack[stack.length - 1]
  if (parent) parent.childDur += e.dur
  stack.push({ name: e.name, end, dur: e.dur, childDur: 0, args: e.args })
  total.set(e.name, (total.get(e.name) ?? 0) + e.dur)
}
// Second pass to collect self durations as frames pop.
const stack2 = []
for (const e of onMain) {
  const end = e.ts + e.dur
  while (stack2.length && stack2[stack2.length - 1].end <= e.ts) {
    const f = stack2.pop()
    self.set(f.name, (self.get(f.name) ?? 0) + (f.dur - f.childDur))
  }
  const parent = stack2[stack2.length - 1]
  if (parent) parent.childDur += e.dur
  stack2.push({ name: e.name, end, dur: e.dur, childDur: 0 })
}
while (stack2.length) {
  const f = stack2.pop()
  self.set(f.name, (self.get(f.name) ?? 0) + (f.dur - f.childDur))
}

const spanUs = onMain.length ? onMain[onMain.length - 1].ts + onMain[onMain.length - 1].dur - onMain[0].ts : 1
const spanMs = spanUs / 1000

console.log('probe:', JSON.stringify(report))
console.log(`\nmain-thread self time over ${spanMs.toFixed(0)} ms of trace (${THROTTLE}x CPU throttle)`)
console.log('─'.repeat(66))
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
for (const [name, us] of rows) {
  const ms = us / 1000
  console.log(`${name.padEnd(40)}${ms.toFixed(1).padStart(9)} ms  ${((ms / spanMs) * 100).toFixed(1).padStart(6)}%`)
}

// JS function attribution from ProfileChunk samples if present.
const jsSelf = new Map()
const nodes = new Map()
for (const e of events) {
  if (e.name !== 'ProfileChunk') continue
  const cp = e.args?.data?.cpuProfile
  if (!cp) continue
  for (const nd of cp.nodes ?? []) nodes.set(nd.id, nd.callFrame)
  const samples = cp.samples ?? []
  const deltas = e.args?.data?.timeDeltas ?? []
  for (let k = 0; k < samples.length; k++) {
    const cf = nodes.get(samples[k])
    if (!cf) continue
    const key = `${cf.functionName || '(anon)'} ${String(cf.url || '').split('/').pop()}:${cf.lineNumber}`
    jsSelf.set(key, (jsSelf.get(key) ?? 0) + Math.max(0, deltas[k] ?? 0))
  }
}
if (jsSelf.size) {
  console.log('\ntop JS self time (sampled)')
  console.log('─'.repeat(66))
  for (const [k, us] of [...jsSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`${k.slice(0, 48).padEnd(50)}${(us / 1000).toFixed(1).padStart(9)} ms`)
  }
}

writeFileSync(join(__dirname, 'last-trace-summary.json'), JSON.stringify({
  report, spanMs, self: Object.fromEntries(rows), js: Object.fromEntries([...jsSelf.entries()].slice(0, 60))
}, null, 2))
