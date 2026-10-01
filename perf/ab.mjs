// Interleaved A/B/A/B perf runner for the arena.
//
//   node perf/ab.mjs --a "quality=high" --b "quality=low" --stage 48 --throttle 8
//   node perf/ab.mjs --b "abl=gradient" --stage 48          (probe-side ablation)
//   node perf/ab.mjs --b "skin=x" --stage 48 --throttle 8 --quality high
//
// Options:
//   --a / --b <query>     extra URL query for each arm (omit --b for a baseline run)
//   --stage <n>           seed the save at campaign stage n (default 1); seeded
//                         stages also mark intro / league-unlock / skills
//                         popups as seen so they never cover the arena
//   --quality high|low    pin the quality tier in BOTH arms (URL + stored pref +
//                         verdict). Use it at high throttle: at 8x the auto
//                         detector downgrades some reps and not others, which
//                         makes the results bimodal. An arm's own `quality=`
//                         query still wins for the URL override.
//   --throttle <x>        CDP CPU throttling rate (default 4)
//   --reps <n>            interleaved reps per arm (default 4)
//   --ms / --warmup <ms>  sample window (default 30000) / warmup (default 9000)
//   --seed <s>            game RNG seed (default 7)
//   --dist <dir>          build to serve (default dist)
//   --init <file>         extra init script run in both arms after the seed
//   --labelA/--labelB     column labels; --headed, --dc; --help
//
// Experiment switches for a NEW optimization go in a boot-frozen flag module
// the way `src/use/perfVariants.ts` did (see PERF-LEDGER.md) — and come back
// out again once the experiment has a verdict.
//
// * serves ./dist itself on `localhost` (the game only renders on localhost or
//   a portal hostname — 127.0.0.1 gets a blank page) on a random free port
//   (so a stale server from another project can never answer instead — the title is verified before measuring)
// * launches ONE Chrome per rep on a throw-away user-data-dir (fresh save, so
//   every rep starts at stage 1 with the same roster)
// * emulates a 412x915 dpr3 touch phone and applies CDP CPU throttling
// * drives a scripted, seed-fixed input sequence — identical in A and B
// * runs A B A B A B …, never A-then-B, so thermal drift and CPU boost cannot
//   masquerade as a win
//
// Prints per-metric median-across-reps and the baseline spread that a claimed
// win has to clear.

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs'
import { readFileSync as rfs } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedScript, qualityScript } from './scenario.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const probe = rfs(join(__dirname, 'probe-v2.js'), 'utf8')

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt
}
const has = (name) => argv.includes(`--${name}`)

if (has('help') || argv.includes('-h')) {
  const src = rfs(fileURLToPath(import.meta.url), 'utf8').split(/\r?\n/)
  const header = src.slice(0, src.findIndex((l) => !l.startsWith('//')))
  console.log(header.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}

const A_QUERY = arg('a', '')
const B_QUERY = arg('b', null)
const REPS = Number(arg('reps', 4))
const SAMPLE_MS = Number(arg('ms', 30000))
const WARMUP_MS = Number(arg('warmup', 9000))
const THROTTLE = Number(arg('throttle', 4))
const SEED = arg('seed', '7')
const DIST = join(ROOT, arg('dist', 'dist'))
const HEADED = has('headed')
const DC = has('dc')
const STAGE = Number(arg('stage', 1))
const LABEL_A = arg('labelA', A_QUERY || 'A')
const LABEL_B = arg('labelB', B_QUERY || 'B')
// Extra init script (a file) run in BOTH arms after the stage seed, before any
// app code — e.g. one that seeds a save shape keyed off a query param the
// B arm sets, so a save-state A/B stays interleaved in one run.
const INIT = arg('init', null)
const QUALITY = arg('quality', null)
if (QUALITY !== null && QUALITY !== 'high' && QUALITY !== 'low') {
  console.error(`--quality must be high or low, got "${QUALITY}"`)
  process.exit(1)
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
}

const serve = () =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0])
      let p = normalize(join(DIST, url === '/' ? '/index.html' : url))
      if (!p.startsWith(DIST)) {
        res.writeHead(403).end()
        return
      }
      readFile(p, (err, buf) => {
        if (err) {
          res.writeHead(404).end('not found')
          return
        }
        res.writeHead(200, {
          'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store'
        })
        res.end(buf)
      })
    })
    server.listen(0, 'localhost', () => resolve({ server, port: server.address().port }))
  })

// ── stats ──────────────────────────────────────────────────────────────────
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const spread = (xs) => (xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs))

// ── one rep ────────────────────────────────────────────────────────────────
async function runRep(port, query, repIdx) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !HEADED,
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
  const pin = qualityScript(QUALITY)
  if (pin) await context.addInitScript({ content: pin })
  if (INIT) await context.addInitScript({ path: INIT })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('  [pageerror]', e.message))

  const cdp = await context.newCDPSession(page)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

  const qs = new URLSearchParams()
  qs.set('seed', SEED)
  if (DC) qs.set('dc', '1')
  if (QUALITY) qs.set('quality', QUALITY)
  if (query) for (const [k, v] of new URLSearchParams(query)) qs.set(k, v)

  const url = `http://localhost:${port}/index.html?${qs}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const title = await page.title()
  if (!/chaos/i.test(title)) {
    throw new Error(`served the wrong app: title="${title}" at ${url}`)
  }

  await page.waitForSelector('canvas', { timeout: 30000 })
  await page.waitForTimeout(WARMUP_MS)

  const box = await page.locator('canvas').first().boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // Fixed, non-random input script — identical bytes in A and B.
  const DRAGS = [
    [-18, 0.20, 120, -140], [22, 0.22, -130, -120], [-5, 0.19, 60, -170],
    [30, 0.21, -70, -150], [-26, 0.23, 150, -110], [10, 0.20, -110, -160],
    [-14, 0.22, 90, -130], [26, 0.19, -40, -170], [0, 0.21, 130, -150],
    [-30, 0.20, -150, -120], [18, 0.23, 40, -160], [-8, 0.22, -90, -140]
  ]
  let dragI = 0
  const tap = async () => {
    await page.touchscreen.tap(cx, cy).catch(() => {
    })
  }
  const launch = async () => {
    const [ox, oyF, dx, dy] = DRAGS[dragI++ % DRAGS.length]
    const sx = cx + ox
    const sy = cy + box.height * oyF
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + dx * 0.5, sy + dy * 0.5, { steps: 4 })
    await page.mouse.move(sx + dx, sy + dy, { steps: 4 })
    await page.mouse.up()
  }

  // Get out of tap_to_start / any intro gate, then start the first launch.
  await tap()
  await page.waitForTimeout(1800)
  await launch().catch(() => {
  })
  await page.waitForTimeout(1500)

  // Measurement window opens here — everything above is warmup.
  await page.evaluate(() => window.__perf.reset())

  const deadline = Date.now() + SAMPLE_MS
  while (Date.now() < deadline) {
    await page.waitForTimeout(2200)
    if (Date.now() >= deadline) break
    // A tap first: harmless mid-battle, and it clears a result screen if the
    // match ended so the next launch re-enters combat instead of idling.
    await tap()
    await launch().catch(() => {
    })
  }

  const report = await page.evaluate(() => window.__perf.report())
  const shot = join(__dirname, `shot-rep${repIdx}-${query || 'base'}.png`.replace(/[^\w.-]/g, '_'))
  await page.screenshot({ path: shot })
  await browser.close()
  return { ...report, shot }
}

// ── main ───────────────────────────────────────────────────────────────────
const METRICS = [
  'workP50', 'workP95', 'workP99', 'workMean',
  'deltaP50', 'deltaP95', 'over16Pct', 'over33Pct', 'over50Pct',
  'fps', 'heapSlopeKB', 'heapPeakMB', 'longTasks', 'drawCallsPerFrame'
]

const { server, port } = await serve()
console.log(
  `serving ${DIST} on :${port} | throttle ${THROTTLE}x | 412x915 dpr3 | ` +
  `${REPS} reps x ${SAMPLE_MS / 1000}s | seed ${SEED} | stage ${STAGE} | quality ${QUALITY ?? 'auto'}`
)

const results = { A: [], B: [] }
try {
  for (let r = 0; r < REPS; r++) {
    process.stdout.write(`rep ${r + 1}/${REPS}  A(${LABEL_A}) …`)
    const a = await runRep(port, A_QUERY, r)
    results.A.push(a)
    process.stdout.write(` p95=${a.workP95}ms fps=${a.fps}\n`)
    if (B_QUERY !== null) {
      process.stdout.write(`rep ${r + 1}/${REPS}  B(${LABEL_B}) …`)
      const b = await runRep(port, B_QUERY, r)
      results.B.push(b)
      process.stdout.write(` p95=${b.workP95}ms fps=${b.fps}\n`)
    }
  }
} finally {
  server.close()
}

console.log('\n' + '─'.repeat(74))
const pad = (s, w) => String(s).padStart(w)
console.log(
  `${'metric'.padEnd(20)}${pad('A ' + LABEL_A, 16)}${pad('B ' + LABEL_B, 16)}${pad('delta', 12)}${pad('A spread', 10)}`
)
for (const m of METRICS) {
  const av = results.A.map((x) => x[m]).filter((x) => x !== null && x !== undefined)
  if (av.length === 0) continue
  const am = median(av)
  const asp = spread(av)
  if (B_QUERY === null) {
    console.log(`${m.padEnd(20)}${pad(am.toFixed(2), 16)}${pad('—', 16)}${pad('—', 12)}${pad(asp.toFixed(2), 10)}`)
    continue
  }
  const bv = results.B.map((x) => x[m]).filter((x) => x !== null && x !== undefined)
  const bm = median(bv)
  const pctChange = am === 0 ? 0 : ((bm - am) / am) * 100
  console.log(
    `${m.padEnd(20)}${pad(am.toFixed(2), 16)}${pad(bm.toFixed(2), 16)}` +
    `${pad((pctChange >= 0 ? '+' : '') + pctChange.toFixed(1) + '%', 12)}${pad(asp.toFixed(2), 10)}`
  )
}
console.log('─'.repeat(74))

if (B_QUERY !== null) {
  // Primary metric is FRAME DELTA, not work-per-frame.
  //
  // The skill's default primary is p95 work-per-frame, and for a JS-bound game
  // that is right. This game is not JS-bound: `perf/trace.mjs` puts Paint at
  // ~67% of main-thread time and all JS at ~16%, because canvas 2D draw calls
  // are *recorded* cheaply inside the rAF callback and *rasterised* afterwards.
  // Work-per-frame therefore cannot see the thing we are optimizing — a change
  // that halves raster cost shows up as +0.5% work and -50% frame delta.
  // Work-per-frame is still reported above, as a regression guard.
  const aD = results.A.map((x) => x.deltaP50)
  const bD = results.B.map((x) => x.deltaP50)
  const am = median(aD)
  const bm = median(bD)
  const gain = ((am - bm) / am) * 100
  const noise = spread(aD)
  const workA = median(results.A.map((x) => x.workP95))
  const workB = median(results.B.map((x) => x.workP95))
  const workRegressed = workA > 0 && (workB - workA) / workA > 0.1
  const verdict =
    workRegressed ? 'MIXED — frame delta improved but workP95 regressed >10%; check the trace'
      : gain >= 5 && (am - bm) > noise ? 'KEEP'
        : gain >= 3 ? 'MARGINAL — keep only if it also removes complexity'
          : Math.abs(gain) < 3 ? 'NULL RESULT — revert to the simpler code'
            : 'WORSE — revert'
  console.log(
    `primary: deltaP50 ${am.toFixed(2)} -> ${bm.toFixed(2)} ms ` +
    `(${gain >= 0 ? '-' : '+'}${Math.abs(gain).toFixed(1)}%), baseline spread ${noise.toFixed(2)} ms`
  )
  console.log(`guard:   workP95  ${workA.toFixed(2)} -> ${workB.toFixed(2)} ms`)
  console.log(`VERDICT: ${verdict}`)
}

console.log('\nraw:', JSON.stringify(results, null, 1))
