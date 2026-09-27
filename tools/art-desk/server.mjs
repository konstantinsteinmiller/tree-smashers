#!/usr/bin/env node
/**
 * ─── Art Desk ───────────────────────────────────────────────────────────────
 *
 *   pnpm art:desk                 # serve the desk and open it in the browser
 *   pnpm art:desk -- --no-open    # …without opening it
 *   pnpm art:desk -- --port 5200
 *
 * The operator's side of the art pipeline, in one page: every reference and
 * its prompt, what is painted and what is not, and the whole return trip —
 * save under the right name, slice, compress — on one painting at a time.
 *
 * Two ways to get a painting:
 *
 *   BY HAND. Copy the reference and the prompt from the desk, paste both at
 *   Gemini, press its download button. The desk is watching the Downloads
 *   folder for the job you copied from, and files what lands there under
 *   that job's name, then slices and compresses it. Dropping or pasting an
 *   image onto the desk does the same.
 *
 *   BY QUEUE. The desk drives gemini.google.com itself in chaos-arena's own
 *   Chrome profile (~/.art-desk/profiles/chaos-arena), one generation at a
 *   time, throttled — see gemini.mjs. The queue takes the same cross-process
 *   paint lock as `paint.mjs` (lock.mjs), so the desk and agents calling the
 *   CLI never drive the window at the same time, and the throttle gap is
 *   shared between them. The Gemini API has no
 *   free tier for image output, so a free account means the web app.
 *
 * Everything is local: the server binds 127.0.0.1, and writes are refused
 * without the desk's own header, so a web page cannot post into the repo.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { loadConfig } from './config.mjs'
import { IMAGE_EXT, imageSize, scanJobs } from './jobs.mjs'
import { processReturn, sliceAndCompress } from './pipeline.mjs'
import { withPaintLock } from './lock.mjs'
import { ledger } from './usage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const cfg = loadConfig(ROOT)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── State, and the one channel it reaches the page by ─────────────────────

const clients = new Set()
const send = (event, data) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}
const history = []
const log = (line, level = 'out', stem = null) => {
  const entry = { t: Date.now(), line: String(line), level, stem }
  history.push(entry)
  if (history.length > 800) history.shift()
  send('log', entry)
  ;(level === 'err' ? console.error : console.log)(`${stem ? `[${stem}] ` : ''}${line}`)
}

let jobs = []
let jobsAt = 0
const rescan = () => {
  jobs = scanJobs(cfg)
  jobsAt = Date.now()
  send('jobs', { at: jobsAt })
  return jobs
}
const jobFor = (stem) => (jobsAt ? jobs : rescan()).find((j) => j.stem === stem)
const summary = (j) => {
  const { prompt, ...rest } = j
  return { ...rest, promptChars: prompt.length }
}

// Re-read when anything the list is made of changes on disk — a manual drop
// in painted/, a re-export from the bench, a slice run in a terminal.
let rescanTimer = null
const rescanSoon = () => {
  clearTimeout(rescanTimer)
  rescanTimer = setTimeout(rescan, 400)
}
for (const d of [cfg.sheetsDir, cfg.paintedDir]) {
  if (existsSync(d)) {
    try {
      watch(d, rescanSoon)
    } catch { /* not watchable: the page still has a refresh button */
    }
  }
}

/**
 * One pipeline at a time. The slicer rewrites a shared receipt and each run
 * spawns its own Chrome; two in parallel would race on both.
 */
let chain = Promise.resolve()
const busy = new Set()
const exclusive = (fn) => {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {
  })
  return next
}

const runReturn = (stem, bytes, source) => exclusive(async () => {
  const job = jobFor(stem)
  if (!job) throw new Error(`no job ${stem}`)
  busy.add(stem)
  send('busy', [...busy])
  const jlog = (line, level) => log(line, level, stem)
  try {
    jlog(`— return from ${source}`)
    const r = bytes ? await processReturn(cfg, job, bytes, { log: jlog }) : await sliceAndCompress(cfg, job, join(cfg.paintedDir, job.painting), { log: jlog })
    jlog(r.ok
      ? `✓ done — ${r.written.length} file(s) written${r.compressed ? `, ${r.compressed} compressed` : ''}`
      : `✗ ${r.error}`, r.ok ? 'ok' : 'err')
    send('result', {
      stem,
      ok: r.ok,
      error: r.error ?? null,
      written: (r.written ?? []).map((f) => relative(cfg.root, f).split(sep).join('/'))
    })
    return r
  } finally {
    busy.delete(stem)
    send('busy', [...busy])
    rescan()
  }
})

// ─── By hand: the Downloads folder, armed for one job ───────────────────────

let armed = null // { stem, at }
const arm = (stem) => {
  armed = stem ? { stem, at: Date.now() } : null
  send('armed', armed)
}
const importing = new Set()
const stableSize = async (file) => {
  let last = -1
  for (let i = 0; i < 40; i++) {
    const size = existsSync(file) ? statSync(file).size : -1
    if (size > 0 && size === last) return true
    last = size
    await sleep(400)
  }
  return false
}
const importDownload = async (file, why) => {
  if (!armed || importing.has(file)) return
  const { stem } = armed
  importing.add(file)
  try {
    if (!(await stableSize(file))) return
    const bytes = readFileSync(file)
    if (!imageSize(bytes)) return
    arm(null)
    log(`picked up ${file} (${why})`, 'out', stem)
    await runReturn(stem, bytes, 'Downloads')
  } catch (e) {
    log(`✗ ${e.message}`, 'err', stem)
  } finally {
    importing.delete(file)
  }
}
if (cfg.watchDir && existsSync(cfg.watchDir)) {
  try {
    watch(cfg.watchDir, (_, name) => {
      if (!armed || !name || !IMAGE_EXT.test(name)) return
      const file = join(cfg.watchDir, name)
      if (!existsSync(file)) return
      if (statSync(file).mtimeMs < armed.at - 2000) return
      importDownload(file, 'new download')
    })
  } catch (e) {
    console.warn(`not watching ${cfg.watchDir}: ${e.message}`)
  }
}
/** The newest image in Downloads since the job was armed — the watcher's manual twin. */
const latestDownload = () => {
  if (!cfg.watchDir || !existsSync(cfg.watchDir)) return null
  return readdirSync(cfg.watchDir)
    .filter((f) => IMAGE_EXT.test(f))
    .map((f) => ({ f: join(cfg.watchDir, f), m: statSync(join(cfg.watchDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0] ?? null
}

// ─── By queue: Gemini, throttled ────────────────────────────────────────────

const { usedToday, countGeneration } = ledger(cfg.gemini.usageFile)

const auto = {
  running: false,
  queue: [],
  current: null,
  phase: 'idle',
  nextAt: null,
  attempts: {},
  lastError: null,
  settings: {
    gapSeconds: cfg.gemini.gapSeconds,
    jitterSeconds: cfg.gemini.jitterSeconds,
    dailyCap: cfg.gemini.dailyCap,
    retries: cfg.gemini.retries
  }
}
const autoState = () => ({ ...auto, usedToday: usedToday(), attempts: undefined })
const pushAuto = () => send('auto', autoState())
/** Progress for the page; `quiet` ones (a ticking counter) stay out of the log. */
const phase = (p, stem = auto.current, quiet = false) => {
  auto.phase = p
  pushAuto()
  if (stem && !quiet) log(`· ${p}`, 'out', stem)
}

let gemini = null
const driver = async () => {
  if (!gemini) {
    const { Gemini } = await import('./gemini.mjs')
    gemini = new Gemini({ root: cfg.root, ...cfg.gemini, log: (l, level) => log(l, level) })
  }
  return gemini
}

/** Sleep that a Stop can cut short. */
let wake = null
const pause = (ms) => new Promise((r) => {
  const t = setTimeout(r, ms)
  wake = () => {
    clearTimeout(t)
    r()
  }
})

const runQueue = async () => {
  if (auto.running) return
  auto.running = true
  auto.lastError = null
  pushAuto()
  let failuresInARow = 0
  try {
    while (auto.running && auto.queue.length) {
      if (usedToday() >= auto.settings.dailyCap) {
        auto.lastError = `daily cap reached (${usedToday()}/${auto.settings.dailyCap}) — raise it in the settings, or come back tomorrow`
        break
      }
      const stem = auto.queue[0]
      const job = jobFor(stem)
      if (!job?.ref && !job?.styleRefs?.length) {
        log(`✗ skipped — ${job ? 'no reference image; export it first' : 'unknown job'}`, 'err', stem)
        auto.queue.shift()
        continue
      }
      if (job.styleRefsMissing?.length) {
        log(`✗ skipped — its finish references are not on disk yet: ${job.styleRefsMissing.join(', ')}`, 'err', stem)
        auto.queue.shift()
        continue
      }
      auto.current = stem
      auto.attempts[stem] = (auto.attempts[stem] ?? 0) + 1
      let outcome = 'failed'
      try {
        const g = await driver()
        const t0 = Date.now()
        // The paint lock is shared with paint.mjs: it waits for any CLI job
        // in flight and for the throttle gap, whoever painted last.
        const got = await withPaintLock(cfg.gemini.profileDir, {
          gapSeconds: auto.settings.gapSeconds,
          jitterSeconds: auto.settings.jitterSeconds,
          label: `art desk queue (${stem})`,
          log: (l) => log(l, 'out', stem)
        }, ({ markSpent }) => g.paint({
          // Finish references first, the layout reference LAST (DESK.md).
          refFile: job.ref ? join(cfg.sheetsDir, job.ref) : null,
          styleFiles: (job.styleRefs ?? []).map((f) => join(ROOT, f)),
          prompt: job.prompt,
          timeoutMs: cfg.gemini.timeoutSeconds * 1000,
          onPhase: (p, quiet) => phase(p, stem, quiet),
          onSent: markSpent
        }))
        countGeneration()
        log(`Gemini answered in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${got.chatUrl}`, 'out', stem)
        const r = await runReturn(stem, got.bytes, 'Gemini')
        outcome = r.ok ? 'ok' : 'unusable'
      } catch (e) {
        if (e.counted) countGeneration()
        log(`✗ ${e.message}`, 'err', stem)
        auto.lastError = e.message
        if (['QUOTA', 'SIGNED_OUT', 'CONSENT', 'BROWSER'].includes(e.code)) {
          // Nothing the next job does will go differently; keep this one queued.
          auto.running = false
          break
        }
        outcome = 'unusable'
      }
      if (outcome === 'ok') {
        auto.queue.shift()
        failuresInARow = 0
      } else {
        failuresInARow++
        if (auto.attempts[stem] > auto.settings.retries) {
          log(`giving up on it after ${auto.attempts[stem]} attempt(s)`, 'err', stem)
          auto.queue.shift()
        }
        if (failuresInARow >= cfg.gemini.maxConsecutiveFailures) {
          auto.lastError = `${failuresInARow} failures in a row — stopped so the quota is not burned on a problem`
          break
        }
      }
      auto.current = null
      if (!auto.running || !auto.queue.length) break
      // The gap before the next generation is waited out inside withPaintLock.
    }
  } finally {
    auto.running = false
    auto.current = null
    auto.nextAt = null
    auto.phase = auto.lastError ? 'stopped' : 'idle'
    pushAuto()
    if (auto.lastError) log(`queue stopped: ${auto.lastError}`, 'err')
  }
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json'
}
const servable = [cfg.sheetsDir, cfg.paintedDir, cfg.outDir]
const inside = (dir, full) => {
  const r = relative(dir, full)
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}
const safeFile = (rel) => {
  const full = resolve(cfg.root, rel)
  return servable.some((d) => inside(d, full)) ? full : null
}
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}
const body = (req, limit = 40 * 1024 * 1024) => new Promise((res, rej) => {
  const chunks = []
  let n = 0
  req.on('data', (c) => {
    n += c.length
    if (n > limit) {
      rej(new Error('too large'))
      req.destroy()
    } else chunks.push(c)
  })
  req.on('end', () => res(Buffer.concat(chunks)))
  req.on('error', rej)
})

let port = Number(argOf('--port') ?? cfg.port)
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      return res.end(readFileSync(join(HERE, 'desk.html')))
    }
    if (req.method === 'GET' && p === '/file') {
      const full = safeFile(url.searchParams.get('p') ?? '')
      if (!full || !existsSync(full) || !statSync(full).isFile()) {
        res.writeHead(404)
        return res.end()
      }
      const st = statSync(full)
      const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304)
        return res.end()
      }
      res.writeHead(200, {
        'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
        etag,
        'cache-control': 'no-cache'
      })
      return res.end(readFileSync(full))
    }
    if (req.method === 'GET' && p === '/api/state') {
      if (!jobsAt || url.searchParams.has('rescan')) rescan()
      const rel = (d) => relative(cfg.root, d).split(sep).join('/')
      return json(res, 200, {
        project: cfg.project,
        root: cfg.root,
        sheetsRel: rel(cfg.sheetsDir),
        paintedRel: rel(cfg.paintedDir),
        outRel: rel(cfg.outDir),
        watchDir: cfg.watchDir,
        geminiUrl: cfg.gemini.url,
        jobs: jobs.map(summary),
        armed,
        busy: [...busy],
        auto: autoState(),
        log: history.slice(-300)
      })
    }
    if (req.method === 'GET' && p === '/api/job') {
      const job = jobFor(url.searchParams.get('stem'))
      return job ? json(res, 200, job) : json(res, 404, { error: 'no such job' })
    }
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write('retry: 1500\n\n')
      clients.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 20000)
      req.on('close', () => {
        clearInterval(ping)
        clients.delete(res)
      })
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(404)
      return res.end()
    }
    // Writes only from the desk itself: a custom header forces a CORS
    // preflight that this server never answers, and the origin must be ours.
    const origin = req.headers.origin
    if (req.headers['x-art-desk'] !== '1' || (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))) {
      return json(res, 403, { error: 'not from the desk' })
    }

    if (p === '/api/return') {
      const stem = url.searchParams.get('stem')
      if (!jobFor(stem)) return json(res, 404, { error: 'no such job' })
      const bytes = await body(req)
      if (!imageSize(bytes)) return json(res, 400, { error: 'that is not a PNG, JPEG or WebP image' })
      if (armed?.stem === stem) arm(null)
      runReturn(stem, bytes, url.searchParams.get('source') ?? 'the desk').catch((e) => log(`✗ ${e.message}`, 'err', stem))
      return json(res, 202, { ok: true })
    }
    if (p === '/api/slice') {
      const stem = url.searchParams.get('stem')
      const job = jobFor(stem)
      if (!job?.painting) return json(res, 400, { error: 'nothing painted for it yet' })
      runReturn(stem, null, 're-slice').catch((e) => log(`✗ ${e.message}`, 'err', stem))
      return json(res, 202, { ok: true })
    }
    if (p === '/api/arm') {
      const { stem } = JSON.parse((await body(req)).toString() || '{}')
      if (stem && !jobFor(stem)) return json(res, 404, { error: 'no such job' })
      arm(stem ?? null)
      return json(res, 200, { armed })
    }
    if (p === '/api/import-latest') {
      if (!armed) return json(res, 400, { error: 'copy a job first, so the desk knows what the download is' })
      const latest = latestDownload()
      if (!latest) return json(res, 404, { error: `no image in ${cfg.watchDir}` })
      importDownload(latest.f, 'imported by hand')
      return json(res, 202, { file: latest.f })
    }
    if (p === '/api/auto') {
      const a = JSON.parse((await body(req)).toString() || '{}')
      // While running, queue[0] is the generation in flight and stays put.
      const place = (stems, front) => {
        const valid = (stems ?? []).filter((s) => jobFor(s) && !(auto.running && s === auto.current))
        auto.queue = auto.queue.filter((s) => !valid.includes(s))
        auto.queue.splice(front ? (auto.running && auto.current ? 1 : 0) : auto.queue.length, 0, ...valid)
      }
      if (a.action === 'enqueue') {
        place(a.stems, a.front)
      } else if (a.action === 'dequeue') {
        auto.queue = auto.queue.filter((s) => !(a.stems ?? []).includes(s) || (auto.running && s === auto.current))
      } else if (a.action === 'clear') {
        auto.queue = auto.running && auto.current ? [auto.current] : []
      } else if (a.action === 'settings') {
        for (const k of Object.keys(auto.settings)) {
          const v = Number(a.settings?.[k])
          if (Number.isFinite(v) && v >= 0) auto.settings[k] = v
        }
      } else if (a.action === 'start') {
        if (a.stems) place(a.stems, a.front)
        runQueue()
      } else if (a.action === 'stop') {
        auto.running = false
        wake?.()
        log('stop requested — the generation in flight, if any, is allowed to finish')
      }
      pushAuto()
      return json(res, 200, autoState())
    }
    if (p === '/api/gemini/open') {
      const g = await driver()
      const s = await g.open()
      log(`Gemini window ${s.launched ? 'launched' : 'is already open'} (${cfg.gemini.profileDir}) — if it shows a sign-in button, press "Sign in" instead`)
      return json(res, 200, s)
    }
    if (p === '/api/gemini/signin') {
      if (auto.running) return json(res, 409, { error: 'the queue is running — stop it first' })
      const g = await driver()
      const s = await g.signInWindow()
      log(s.opened
        ? 'sign-in window opened (no automation port — Google refuses a sign-in otherwise). Sign in, then CLOSE that window.'
        : 'the sign-in window is already open — sign in there, then close it')
      return json(res, 200, s)
    }
    if (p === '/api/gemini/status') {
      const g = await driver()
      return json(res, 200, await g.status())
    }
    res.writeHead(404)
    res.end()
  } catch (e) {
    log(`✗ ${e.message}`, 'err')
    if (!res.headersSent) json(res, e.code === 'BROWSER' ? 503 : 500, { error: e.message })
  }
})

const listen = () => new Promise((res, rej) => {
  server.once('error', rej)
  server.listen(port, '127.0.0.1', () => {
    server.off('error', rej)
    res()
  })
})
for (let tries = 0; ; tries++) {
  try {
    await listen()
    break
  } catch (e) {
    if (e.code !== 'EADDRINUSE' || tries > 20) throw e
    port++
  }
}

rescan()
const address = `http://127.0.0.1:${port}/`
const sheets = jobs.filter((j) => j.kind !== 'single')
const tally = sheets.reduce((a, j) => ((a[j.mark] = (a[j.mark] ?? 0) + 1), a), {})
console.log(`Art Desk — ${cfg.project}  ${address}`)
console.log(`  ${sheets.length} references: ${tally['·'] ?? 0} to paint, ${tally['!'] ?? 0} to repaint, ${tally['?'] ?? 0} painted but not sliced, ${tally['✓'] ?? 0} done`
  + ` (+ ${jobs.length - sheets.length} single-object prompts, ${jobs.filter((j) => j.kind === 'single' && j.ref).length} with a reference exported)`)
console.log(`  watching ${cfg.watchDir ?? '(no Downloads folder)'} for returns`)
if (!argv.includes('--no-open')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', address]]
    : process.platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]]
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref()
}
