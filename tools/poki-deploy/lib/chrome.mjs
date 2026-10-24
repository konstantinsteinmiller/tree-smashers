// A headed Chrome on a PERSISTENT profile, plus the CDP plumbing the P4D and
// Inspector passes run on.
//
// ── Why headed, and why a persistent profile ──
//
// P4D is behind Google SSO. A throwaway profile means a full OAuth dance on
// every deploy — with 2FA that is not automatable, and should not be: the login
// belongs to the human. So the profile lives OUTSIDE the repo (one Poki account
// serves every game) and the cookies survive between runs. The FIRST run opens
// a real window and waits for the user to sign in; every run after walks
// straight in.
//
// It is also where the Inspector's QA ticks live — Poki keeps them in
// `localStorage` on `inspector.poki.dev`, keyed by version id, NOT on its
// server. Tick them from a temp profile and they vanish when Chrome exits, and
// the user who opens the Inspector later sees an untouched checklist. Same
// profile, or the QA pass is write-only.
//
// ── Never fight another session for a profile ──
//
// Chrome refuses a second instance on a locked user-data-dir; the second
// process exits quietly and its `--remote-debugging-port` never opens, which
// reads as "Chrome did not start" when the truth is "someone else has it".
// `launch()` therefore probes the port FIRST and reuses a live instance, and
// reports which case it hit rather than killing anything — a browser you did
// not start belongs to work you cannot see.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const DEFAULT_PROFILE = join(homedir(), '.poki-deploy', 'chrome-profile')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

export const findChrome = () => {
  const hit = CHROME_CANDIDATES.find(p => existsSync(p))
  if (!hit) throw new Error(`no Chrome found — set CHROME_PATH (looked in: ${CHROME_CANDIDATES.join(', ')})`)
  return hit
}

const portAlive = async port => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) })
    return r.ok
  } catch { return false }
}

/** Launch (or adopt) a headed Chrome with the debugging port open. */
export const launch = async ({ profile = DEFAULT_PROFILE, port = 9333, chrome = null } = {}) => {
  if (await portAlive(port)) return { port, adopted: true, profile }

  mkdirSync(profile, { recursive: true })
  const exe = chrome ?? findChrome()
  const child = spawn(exe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,OptimizationGuideModelDownloading',
    // The QA pass hides the tab behind its own pause checks; Chrome's built-in
    // background throttling would otherwise produce the pause we are trying to
    // attribute to the GAME, and the check would pass for the wrong reason.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1500,1000',
    'about:blank',
  ], { stdio: 'ignore', detached: true })
  child.unref()

  for (let i = 0; i < 160; i++) {
    if (await portAlive(port)) return { port, adopted: false, profile, pid: child.pid }
    await sleep(250)
  }
  throw new Error(
    `Chrome never opened debugging port ${port}. The usual cause is another Chrome already `
    + `running on ${profile} without a debugging port — close that window (it is this tool's own `
    + `profile, not your browsing session) or pass --port with a free port.`,
  )
}

/** One CDP connection, with flattened sessions so the game's cross-origin
 *  iframe is drivable as a first-class target. */
export class Cdp {
  #ws; #id = 0; #pending = new Map(); #handlers = new Set()
  targets = new Map()          // sessionId -> targetInfo
  #sessionOf = new Map()       // targetId  -> sessionId

  static async attach (port, urlMatch = '') {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const t = list.find(x => x.type === 'page' && x.url.includes(urlMatch))
      ?? list.find(x => x.type === 'page')
    if (!t) throw new Error('no page target to attach to')
    return Cdp.connect(t.webSocketDebuggerUrl)
  }

  static async open (port, url) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json()
    const c = await Cdp.connect(t.webSocketDebuggerUrl)
    c.targetId = t.id
    c.port = port
    return c
  }

  /** Close the tab this connection owns. Without it every run leaves its
   *  Inspector and Versions tabs behind, and after a handful of deploys the
   *  window is a wall of near-identical tabs — each still holding a live game
   *  and its ad stack. */
  async closeTab () {
    if (!this.targetId || !this.port) return false
    this.close()
    await fetch(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`).catch(() => {})
    return true
  }

  static async connect (wsUrl) {
    const c = new Cdp()
    await c.#init(wsUrl)
    return c
  }

  async #init (wsUrl) {
    this.#ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      this.#ws.onopen = res
      this.#ws.onerror = () => rej(new Error(`could not open a CDP socket at ${wsUrl}`))
    })
    this.#ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.method) {
        if (m.method === 'Target.attachedToTarget') {
          this.targets.set(m.params.sessionId, m.params.targetInfo)
          this.#sessionOf.set(m.params.targetInfo.targetId, m.params.sessionId)
        }
        // A child frame attaches while it is still about:blank and navigates
        // afterwards. Without this the map holds "about:blank" forever and a
        // url match for the game frame never succeeds.
        if (m.method === 'Target.targetInfoChanged') {
          const sid = this.#sessionOf.get(m.params.targetInfo.targetId)
          if (sid) this.targets.set(sid, m.params.targetInfo)
        }
        if (m.method === 'Target.detachedFromTarget') this.targets.delete(m.params.sessionId)
        for (const h of this.#handlers) h(m)
        return
      }
      const p = this.#pending.get(m.id)
      if (!p) return
      this.#pending.delete(m.id)
      m.error ? p.rej(new Error(`${m.error.message} (${m.error.code})`)) : p.res(m.result)
    }
    await this.send('Page.enable')
    await this.send('Runtime.enable')
  }

  send (method, params = {}, sessionId) {
    return new Promise((res, rej) => {
      const id = ++this.#id
      this.#pending.set(id, { res, rej })
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  on (fn) { this.#handlers.add(fn); return () => this.#handlers.delete(fn) }

  /** Evaluate in a frame, returning a plain value. Throws with the page-side
   *  message rather than a generic "evaluation failed". */
  async eval (expression, { sessionId, timeout = 30000 } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, timeout,
    }, sessionId)
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    }
    return r.result.value
  }

  async navigate (url, { waitMs = 25000, settleMs = 2500 } = {}) {
    const loaded = new Promise(res => {
      const off = this.on(m => { if (m.method === 'Page.loadEventFired') { off(); res() } })
    })
    await this.send('Page.navigate', { url })
    await Promise.race([loaded, sleep(waitMs)])
    await sleep(settleMs)
  }

  /** Attach to child targets (the game's cross-origin iframe) as flat sessions. */
  async autoAttach () {
    await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  }

  /** The session id of the first attached target whose url matches.
   *  Falls back to ASKING each iframe target where it is: `targetInfoChanged`
   *  can be missed, and a frame that attached as about:blank would otherwise
   *  never match however long you wait. */
  async waitForFrame (match, { timeout = 30000 } = {}) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      for (const [sessionId, info] of this.targets) {
        if (info.url.includes(match)) return sessionId
      }
      for (const [sessionId, info] of this.targets) {
        if (info.type !== 'iframe' && info.type !== 'page') continue
        const href = await this.eval('location.href', { sessionId, timeout: 2000 }).catch(() => '')
        if (href && href.includes(match)) return sessionId
      }
      // Re-arm: a cross-origin navigation of the tab can outrun the setting.
      await this.autoAttach().catch(() => {})
      await sleep(500)
    }
    return null
  }

  /** Wait until `expr` evaluates truthy in the given frame. Returns the value,
   *  or null on timeout — callers decide whether a timeout is a failure. */
  async waitFor (expr, { sessionId, timeout = 30000, every = 400 } = {}) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      try {
        const v = await this.eval(expr, { sessionId })
        if (v) return v
      } catch { /* the frame may be navigating */ }
      await sleep(every)
    }
    return null
  }

  async screenshot (path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
    return path
  }

  close () { try { this.#ws.close() } catch { /* already gone */ } }
}

/** A real click at viewport coordinates on the TOP-LEVEL page. Browser-level
 *  input routing delivers it into whichever frame sits under the point, so this
 *  reaches the game inside its cross-origin iframe — and it arrives with
 *  `isTrusted: true`, which a Poki build's gameplayStart gate insists on. An
 *  `element.click()` synthesised inside the frame does NOT, and a harness built
 *  on one silently proves nothing about the gate. */
export const clickAt = async (cdp, x, y, { button = 'left' } = {}) => {
  const base = { x: Math.round(x), y: Math.round(y), button, clickCount: 1, buttons: 1 }
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 })
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
  await sleep(40)
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 })
}

/** Drag, the way a player steers. */
export const dragAt = async (cdp, from, to, { steps = 12, holdMs = 30 } = {}) => {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(from.x), y: Math.round(from.y), buttons: 0 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1, buttons: 1 })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', button: 'left', buttons: 1,
      x: Math.round(from.x + ((to.x - from.x) * i) / steps),
      y: Math.round(from.y + ((to.y - from.y) * i) / steps),
    })
    await sleep(holdMs)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(to.x), y: Math.round(to.y), button: 'left', buttons: 0 })
}

export const pressKey = async (cdp, { key, code, keyCode, text }) => {
  const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: text ? 'keyDown' : 'rawKeyDown', text })
  await sleep(30)
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
}

export { sleep }
