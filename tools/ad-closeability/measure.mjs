#!/usr/bin/env node
// ─── Native ad closeability check ───────────────────────────────────────────
//
//   node tools/ad-closeability/measure.mjs               # 3 impressions
//   node tools/ad-closeability/measure.mjs --runs 5 --fresh
//   node tools/ad-closeability/measure.mjs --help
//
// Google Play's Families policy rejects any ad that "interferes with normal
// app use or game play, including rewarded or opt-in ads" and is "not
// closeable after 5 seconds". Whether an ad is closeable is decided by the ad
// network's creative template, NOT by our code — so it cannot be read off the
// source, and a Play review round to find out costs ~10 days.
//
// This script finds out in two minutes instead. It shows real impressions of
// the ad unit the installed build is configured with, on an emulator or a
// phone, and MEASURES when a close control becomes visible:
//
//   • it opens the ad through the plugin's own command (no game UI needed),
//   • reads the ad's DOM through the WebView debugger five times a second
//     (which controls exist, which are visible, what text is on screen),
//   • checks for Android's one-time "Viewing full screen" panel, which covers
//     the ad's top bar — and with it the close button — on a fresh device,
//   • screen-records the impression and writes a timeline strip (the top bar
//     of every half second) so the verdict can be checked by eye.
//
// A run PASSES when a close control is visible within the limit (5 s, with
// half a second of polling tolerance) and nothing covers it. "Skip to the next
// ad" is not a close control.
//
// Needs: a DEBUG build installed and running (`tauri android build --apk
// --debug` — a release WebView is not debuggable), adb, Node 22+.
// Emulators are always AdMob test devices, so impressions made here are never
// billed; on a phone, never tap the ad itself.
//
// Output: tools/ad-closeability/out/<timestamp>/ — report.md, report.json,
// run-N.mp4, run-N-strip.png. Exit code 0 = every run passed, 1 = a run
// failed, 2 = could not measure (no fill, app not running, not debuggable).
//
// With `--record`, a full pass also writes verified.json next to this file,
// naming the ad unit the device really requested. `pnpm
// tauri:build-android-aab` refuses to build with ads enabled without a fresh
// one for the configured unit (scripts/native-ads-gate.mjs).

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { RECORD_MIN_RUNS, VERIFIED_FILE } from './record.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

// ─── Arguments ──────────────────────────────────────────────────────────────

const HELP = `Native ad closeability check

  node tools/ad-closeability/measure.mjs [options]

  --runs N        impressions to measure                      (default 3)
  --seconds S     how long to watch each impression           (default 45)
  --limit S       a close control must be visible by here     (default 5)
  --record        on a full pass of ${RECORD_MIN_RUNS}+ runs, write verified.json — the
                  proof scripts/native-ads-gate.mjs asks for before a store
                  build with ads enabled
  --fresh         re-arm Android's one-time "Viewing full screen" panel first,
                  so run 1 is what a freshly reset review device shows
                  (default on emulators, off on phones)
  --no-fresh      never touch that setting
  --serial ID     adb device                                  (default: the only one attached)
  --pkg NAME      application id                              (default com.tree.smashers)
  --out DIR       report folder                               (default tools/ad-closeability/out/<timestamp>)
`

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP)
  process.exit(0)
}
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const RUNS = Number(opt('runs', 3))
const WATCH_S = Number(opt('seconds', 45))
const LIMIT_S = Number(opt('limit', 5))
const PKG = opt('pkg', 'com.tree.smashers')
/** Polling slack on top of the limit: the probe samples every POLL_MS and the
 *  ad's own template shows its control ON the 5-second mark. */
const TOLERANCE_MS = 500
const POLL_MS = 200
const LOAD_TIMEOUT_MS = 120_000
const APP_PAGE = 'tauri.localhost'

// ─── adb ────────────────────────────────────────────────────────────────────

const locateAdb = () => {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk')
  ].filter(Boolean)
  for (const root of roots) {
    const candidate = join(root, 'platform-tools', exe)
    if (existsSync(candidate)) return candidate
  }
  return exe
}
const ADB = locateAdb()

const bail = (message) => {
  console.error(`\n[ad-closeability] ${message}\n`)
  process.exit(2)
}

const pickSerial = () => {
  const explicit = opt('serial', '')
  if (explicit) return explicit
  let listing
  try {
    listing = execFileSync(ADB, ['devices']).toString()
  } catch {
    bail(`adb not found (${ADB}). Install the Android platform-tools or set ANDROID_HOME.`)
  }
  const devices = listing
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([id]) => id)
  if (devices.length === 0) bail('No device attached. Start an emulator or plug in a phone with USB debugging.')
  if (devices.length > 1) bail(`Several devices attached (${devices.join(', ')}) — pass --serial.`)
  return devices[0]
}
const SERIAL = pickSerial()
const IS_EMULATOR = SERIAL.startsWith('emulator-')
const FRESH = argv.includes('--no-fresh') ? false : argv.includes('--fresh') || IS_EMULATOR

const adb = (args) => execFileSync(ADB, ['-s', SERIAL, ...args], { maxBuffer: 512 * 1024 * 1024 })
const shell = (command) => adb(['shell', command]).toString().replace(/\r/g, '')
const topActivity = () => (shell("dumpsys activity activities | grep -E 'topResumedActivity' | head -1").match(/u0 (\S+)/) || [])[1] || ''
const adIsOpen = () => topActivity().includes('AdActivity')

/** The SDK prints each ad request at VERBOSE. That line is the only place the
 *  unit a build REALLY asks for can be read — the env file may have changed
 *  since the build that is installed. */
const lastAdRequest = () => {
  let log
  try {
    log = adb(['logcat', '-d', '-t', '6000']).toString()
  } catch {
    return null
  }
  const lines = log.split(/\r?\n/).filter((line) => line.includes('Sending request'))
  const line = lines[lines.length - 1]
  if (!line) return null
  const param = (name) => (line.match(new RegExp(`[?&]${name}=([^&\\s]*)`)) || [])[1] || ''
  const client = param('client')
  const slot = param('slotname')
  if (!client || !slot) return null
  return {
    unit: `${client}/${slot}`,
    testMode: param('adtest') === 'on',
    tfcd: param('tfcd') === '1',
    tfua: param('tfua') === '1',
    maxAdContentRating: param('max_ad_content_rating')
  }
}
/** Android's one-time immersive-mode hint. While it is up it covers the top
 *  quarter of the screen — the ad's close button included. */
const fullScreenPanelIsUp = () => shell('dumpsys window windows').includes('ImmersiveModeConfirmation')

// ─── WebView debugger ───────────────────────────────────────────────────────

const CDP_PORT = 9400 + Math.floor(Math.random() * 500)
let forwarded = false

const connectDebugger = () => {
  const pid = shell(`pidof ${PKG}`).trim().split(/\s+/)[0]
  if (!pid) bail(`${PKG} is not running. Install the debug build and open the app first.`)
  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`])
  forwarded = true
}
/** `log.tag.Ads` as we found it; `undefined` until we change it. */
let previousLogLevel
const logAdRequests = () => {
  previousLogLevel = shell('getprop log.tag.Ads').trim()
  shell('setprop log.tag.Ads VERBOSE')
}
const cleanup = () => {
  try {
    if (previousLogLevel !== undefined) execFileSync(ADB, ['-s', SERIAL, 'shell', `setprop log.tag.Ads "${previousLogLevel}"`])
    if (forwarded) execFileSync(ADB, ['-s', SERIAL, 'forward', '--remove', `tcp:${CDP_PORT}`])
  } catch {
    // Both die with the device anyway.
  }
  previousLogLevel = undefined
  forwarded = false
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))

const listPages = async () => {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
    return pages.filter((page) => page.type === 'page')
  } catch {
    return null
  }
}

/** One debugger connection to one WebView page. */
class Page {
  constructor(info) {
    this.id = info.id
    this.url = info.url
    this.socket = new WebSocket(info.webSocketDebuggerUrl)
    this.pending = new Map()
    this.nextId = 1
    this.closed = false
    this.ready = new Promise((ok, fail) => {
      this.socket.onopen = ok
      this.socket.onerror = () => fail(new Error('debugger socket failed'))
    })
    this.socket.onclose = () => {
      this.closed = true
    }
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const waiter = this.pending.get(message.id)
      if (!waiter) return
      this.pending.delete(message.id)
      waiter(message)
    }
  }

  /** Evaluate in the page; resolves `undefined` on any failure or timeout. */
  async evaluate(expression, timeoutMs = 1500) {
    if (this.closed) return undefined
    try {
      await this.ready
    } catch {
      return undefined
    }
    const id = this.nextId++
    const reply = await Promise.race([
      new Promise((ok) => {
        this.pending.set(id, ok)
        this.socket.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true }
          })
        )
      }),
      sleep(timeoutMs).then(() => null)
    ])
    this.pending.delete(id)
    if (!reply || reply.result?.exceptionDetails) return undefined
    return reply.result?.result?.value
  }

  close() {
    try {
      this.socket.close()
    } catch {
      // Already gone.
    }
  }
}

const pages = new Map()
/** Open a connection to every page we have not seen; return [app, others]. */
const syncPages = async () => {
  const listing = await listPages()
  if (!listing) return null
  const live = new Set(listing.map((page) => page.id))
  for (const [id, page] of pages) {
    if (!live.has(id)) {
      page.close()
      pages.delete(id)
    }
  }
  for (const info of listing) {
    if (!pages.has(info.id)) pages.set(info.id, new Page(info))
  }
  const all = [...pages.values()]
  return { app: all.find((page) => page.url.includes(APP_PAGE)), others: all.filter((page) => !page.url.includes(APP_PAGE)) }
}

// ─── What the ad page is asked ──────────────────────────────────────────────
//
// Runs inside the ad's own WebView. Class names are the ad network's and can
// change, so nothing here matches a specific name: a control is anything whose
// class, id or aria-label says close / dismiss / skip, and it counts only when
// it is really on screen (sized, inside the viewport, not hidden, not faded
// out by an ancestor).

const PROBE = `(() => {
  const vw = innerWidth, vh = innerHeight
  if (document.visibilityState !== 'visible' || !vw || !vh) {
    return { showing: false, text: (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120) }
  }
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return null
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const cs = getComputedStyle(node)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.2) return null
    }
    return r
  }
  const controls = { close: null, skip: null }
  const selector = '[class*=close i],[id*=close i],[aria-label*=close i],[class*=dismiss i],[id*=dismiss i],[aria-label*=dismiss i],[class*=skip i],[id*=skip i],[aria-label*=skip i]'
  for (const el of document.querySelectorAll(selector)) {
    const r = shown(el)
    if (!r) continue
    const name = [typeof el.className === 'string' ? el.className : '', el.id, el.getAttribute('aria-label') || ''].join(' ')
    const kind = /close|dismiss/i.test(name) ? 'close' : 'skip'
    const area = r.width * r.height
    // Keep the smallest hit: the button itself rather than its container.
    if (!controls[kind] || area < controls[kind].area) {
      controls[kind] = { name: name.trim().slice(0, 60), x: r.left + r.width / 2, y: r.top + r.height / 2, area }
    }
  }
  const text = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent.replace(/\\s+/g, ' ').trim()
    if (!value || value.length > 60 || !node.parentElement) continue
    const r = shown(node.parentElement)
    // The top bar only: that is where the countdown and the pod counter live.
    if (r && r.top < vh * 0.12) text.push(value)
  }
  return { showing: true, dpr: devicePixelRatio, close: controls.close, skip: controls.skip, text: text.join(' · ') }
})()`

const probeAd = async (others) => {
  const replies = await Promise.all(others.map((page) => page.evaluate(PROBE, 900)))
  return replies.find((reply) => reply?.showing) || null
}

// ─── One impression ─────────────────────────────────────────────────────────

const FIRE = `(() => {
  const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke
  if (!invoke) return 'no-tauri'
  window.__adCloseability = { result: null }
  invoke('plugin:admob|show_rewarded').then(
    (result) => { window.__adCloseability.result = result },
    (error) => { window.__adCloseability.result = { shown: false, error: String(error) } }
  )
  return 'fired'
})()`
const RESULT = `JSON.stringify(window.__adCloseability ? window.__adCloseability.result : null)`

const tap = (x, y) => adb(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))])

/** SIGINT makes the device-side recorder write the mp4 index; pulling a file
 *  that is still being recorded yields one no player can open. */
const stopRecorder = () => {
  try {
    shell('pkill -INT screenrecord')
  } catch {
    // Already finished on its own time limit.
  }
}

/** Close the open ad through its own controls; true once the game is back. */
const closeAd = async () => {
  const deadline = Date.now() + 150_000
  while (Date.now() < deadline) {
    if (!adIsOpen()) return true
    if (fullScreenPanelIsUp()) {
      // "Got it" — bottom right of the panel on every Android version that has it.
      const size = shell('wm size').match(/(\d+)x(\d+)/)
      if (size) tap(Number(size[1]) * 0.857, Number(size[2]) * 0.208)
      await sleep(800)
      continue
    }
    const state = await syncPages()
    const ad = state ? await probeAd(state.others) : null
    const control = ad?.close || ad?.skip
    if (control) tap(control.x * ad.dpr, control.y * ad.dpr)
    await sleep(control ? 1500 : 1000)
  }
  return !adIsOpen()
}

const measureOnce = async (index, outDir) => {
  const run = { index, opened: false, samples: [], notes: [] }
  if (adIsOpen()) await closeAd()

  let state = await syncPages()
  if (!state?.app) {
    bail(
      `Could not reach the game's WebView through the debugger.\n` +
      `  • is ${PKG} in the foreground?\n` +
      `  • is it a DEBUG build? (tauri android build --apk --debug) — a release WebView is not debuggable.`
    )
  }

  const video = `/sdcard/ad-closeability-${index}.mp4`
  shell(`rm -f ${video}`)
  const recorder = spawn(
    ADB,
    ['-s', SERIAL, 'shell', 'screenrecord', '--time-limit', String(Math.min(180, WATCH_S + 12)), '--bit-rate', '6000000', video],
    { detached: true, stdio: 'ignore' }
  )
  recorder.unref()
  await sleep(1500)

  // Fire, and keep firing while the SDK has no ad loaded yet.
  const loadDeadline = Date.now() + LOAD_TIMEOUT_MS
  let openedAt = 0
  while (!openedAt) {
    const fired = await state.app.evaluate(FIRE)
    if (fired !== 'fired') bail(`The page has no Tauri bridge (${fired}). Is this the native build?`)
    const waitUntil = Date.now() + 6000
    while (Date.now() < waitUntil && !openedAt) {
      state = (await syncPages()) || state
      const ad = await probeAd(state.others)
      if (ad) {
        openedAt = Date.now()
        break
      }
      const result = JSON.parse((await state.app.evaluate(RESULT)) || 'null')
      if (result && result.shown === false) {
        run.notes.push(`show refused: ${result.error || 'unknown'}`)
        break
      }
      await sleep(150)
    }
    if (openedAt) break
    if (Date.now() > loadDeadline) {
      run.notes.push('no ad became available (no fill, or ads are disabled in this build)')
      stopRecorder()
      return run
    }
    await sleep(3000)
  }
  run.opened = true

  let panelChecked = 0
  while (Date.now() - openedAt < WATCH_S * 1000) {
    const started = Date.now()
    state = (await syncPages()) || state
    const ad = await probeAd(state.others)
    const t = Date.now() - openedAt
    if (!ad) {
      if (!adIsOpen()) {
        run.notes.push(`ad closed by itself after ${(t / 1000).toFixed(1)} s`)
        break
      }
    } else {
      run.samples.push({ t, close: !!ad.close, closeName: ad.close?.name || '', skip: !!ad.skip, text: ad.text })
    }
    // The system panel is slow to query, so sample it twice: once it has had
    // time to slide in, and once at the limit.
    if ((panelChecked === 0 && t > 1500) || (panelChecked === 1 && t > LIMIT_S * 1000)) {
      panelChecked++
      if (fullScreenPanelIsUp()) run.panel = true
    }
    const spent = Date.now() - started
    if (spent < POLL_MS) await sleep(POLL_MS - spent)
  }

  run.closedCleanly = await closeAd()
  const result = JSON.parse((await state.app?.evaluate(RESULT)) || 'null')
  run.rewarded = result?.rewarded === true
  stopRecorder()
  // The plugin reloads as soon as an ad is dismissed, so by now the log's
  // newest request is for the same unit this impression came from.
  await sleep(2500)
  run.request = lastAdRequest()

  try {
    adb(['pull', video, join(outDir, `run-${index}.mp4`)])
    shell(`rm -f ${video}`)
    run.video = `run-${index}.mp4`
  } catch {
    run.notes.push('no screen recording (screenrecord is unavailable on this device)')
  }
  return run
}

// ─── Verdict ────────────────────────────────────────────────────────────────

const judge = (run) => {
  if (!run.opened) return { ...run, verdict: 'NO AD', reason: run.notes.join('; ') }
  const firstClose = run.samples.find((sample) => sample.close)
  const firstSkip = run.samples.find((sample) => sample.skip)
  const texts = []
  for (const sample of run.samples) {
    const label = sample.text.replace(/\d+ seconds?/g, 'N s')
    if (label && texts[texts.length - 1]?.label !== label) texts.push({ t: sample.t, label })
  }
  const closeAt = firstClose ? firstClose.t : null
  const skipAt = firstSkip ? firstSkip.t : null
  const pod = run.samples.some((sample) => /\bAd \d+ of \d+\b/i.test(sample.text))
  const reasons = []
  if (closeAt === null) reasons.push(`no close control in ${WATCH_S} s`)
  else if (closeAt > LIMIT_S * 1000 + TOLERANCE_MS) reasons.push(`close control appeared after ${(closeAt / 1000).toFixed(1)} s`)
  if (run.panel) reasons.push('Android "Viewing full screen" panel covered the top bar')
  if (pod) reasons.push('multi-ad pod (closing one ad opens the next)')
  return {
    ...run,
    closeAt,
    skipAt,
    pod,
    timeline: texts,
    verdict: reasons.length ? 'FAIL' : 'PASS',
    reason: reasons.join('; ')
  }
}

// ─── Timeline strip ─────────────────────────────────────────────────────────

const buildStrip = (outDir, run) => {
  if (!run.video) return
  let ffmpeg
  try {
    ffmpeg = createRequire(join(REPO_ROOT, 'package.json'))('ffmpeg-static')
  } catch {
    return
  }
  const frames = join(outDir, `frames-${run.index}`)
  mkdirSync(frames, { recursive: true })
  try {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', join(outDir, run.video), '-vf', 'fps=2,scale=540:-2', join(frames, 'f-%04d.png')])
    const count = readdirSync(frames).length
    if (!count) return
    execFileSync(ffmpeg, [
      '-y', '-loglevel', 'error', '-start_number', '1', '-i', join(frames, 'f-%04d.png'), '-frames:v', '1',
      '-vf', `crop=iw:ih*0.065:0:0,tile=2x${Math.ceil(count / 2)}`, join(outDir, `run-${run.index}-strip.png`)
    ])
    run.strip = `run-${run.index}-strip.png`
  } catch {
    // Evidence only — the verdict does not depend on it.
  } finally {
    rmSync(frames, { recursive: true, force: true })
  }
}

// ─── Proof for the release gate ─────────────────────────────────────────────

const record = (overall, measured, units, request) => {
  const blockers = []
  if (overall !== 'PASS') blockers.push(`the check did not pass (${overall})`)
  if (measured.length < RECORD_MIN_RUNS) blockers.push(`${measured.length} impression(s) measured, ${RECORD_MIN_RUNS} needed`)
  if (units.length !== 1) {
    blockers.push(units.length ? `more than one ad unit seen (${units.join(', ')})` : 'the ad unit could not be read from the device log')
  }
  if (blockers.length) {
    console.log(`[ad-closeability] NOT recorded — ${blockers.join('; ')}`)
    return
  }
  writeFileSync(
    VERIFIED_FILE,
    JSON.stringify(
      {
        unit: units[0],
        verifiedAt: new Date().toISOString(),
        runs: measured.length,
        closeVisibleAtMs: measured.map((run) => run.closeAt),
        limitSeconds: LIMIT_S,
        device: SERIAL,
        testMode: request.testMode,
        tfcd: request.tfcd,
        tfua: request.tfua,
        maxAdContentRating: request.maxAdContentRating
      },
      null,
      2
    ) + '\n'
  )
  console.log(`[ad-closeability] recorded ${units[0]} → ${VERIFIED_FILE}`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

const seconds = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`)

const main = async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = resolve(opt('out', join(HERE, 'out', stamp)))
  mkdirSync(outDir, { recursive: true })

  connectDebugger()
  logAdRequests()
  console.log(`[ad-closeability] device ${SERIAL} · ${PKG} · ${RUNS} run(s) · limit ${LIMIT_S} s`)
  if (FRESH) {
    shell('settings delete secure immersive_mode_confirmations')
    console.log('[ad-closeability] re-armed the one-time "Viewing full screen" panel (fresh-device run)')
  }

  const runs = []
  for (let index = 1; index <= RUNS; index++) {
    const run = judge(await measureOnce(index, outDir))
    buildStrip(outDir, run)
    runs.push(run)
    console.log(
      `  run ${index}: ${run.verdict.padEnd(5)} close ${seconds(run.closeAt)} · skip ${seconds(run.skipAt)}` +
      (run.reason ? ` · ${run.reason}` : '')
    )
  }

  const measured = runs.filter((run) => run.opened)
  const failed = measured.filter((run) => run.verdict === 'FAIL')
  const overall = !measured.length ? 'NOT MEASURED' : failed.length ? 'FAIL' : measured.length < RUNS ? 'INCOMPLETE' : 'PASS'
  const units = [...new Set(measured.map((run) => run.request?.unit).filter(Boolean))]
  const request = measured.map((run) => run.request).find(Boolean) || null
  const tags = request
    ? [request.tfcd && 'TFCD', request.tfua && 'TFUA', request.maxAdContentRating && `rating ${request.maxAdContentRating}`, request.testMode ? 'test mode' : 'LIVE fill']
      .filter(Boolean)
      .join(', ')
    : 'not read'

  const lines = [
    `# Ad closeability — ${overall}`,
    '',
    `Device \`${SERIAL}\` · \`${PKG}\` · limit ${LIMIT_S} s · ${new Date().toISOString()}`,
    '',
    `Ad unit \`${units.join('`, `') || 'unknown'}\` · request: ${tags}`,
    '',
    '| Run | Verdict | Close control visible | Skip control visible | System panel | Why |',
    '|---|---|---|---|---|---|',
    ...runs.map((run) =>
      `| ${run.index} | ${run.verdict} | ${seconds(run.closeAt)} | ${seconds(run.skipAt)} | ${run.panel ? 'covering the ad' : 'no'} | ${run.reason || ''} |`
    ),
    ''
  ]
  for (const run of measured) {
    lines.push(`## Run ${run.index} — top bar over time`, '')
    for (const step of run.timeline) lines.push(`- ${seconds(step.t)}: ${step.label}`)
    if (run.strip) lines.push('', `![top bar, two frames a second](${run.strip})`)
    lines.push('')
  }
  writeFileSync(join(outDir, 'report.md'), lines.join('\n'))
  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify({ overall, serial: SERIAL, pkg: PKG, limitSeconds: LIMIT_S, units, request, runs: runs.map(({ samples, ...rest }) => ({ ...rest, sampleCount: samples.length })) }, null, 2)
  )

  console.log(`\n[ad-closeability] ${overall} — unit ${units.join(', ') || 'unknown'} (${tags}) — ${join(outDir, 'report.md')}`)
  if (argv.includes('--record')) record(overall, measured, units, request)
  for (const page of pages.values()) page.close()
  process.exit(overall === 'PASS' ? 0 : overall === 'FAIL' ? 1 : 2)
}

await main()
