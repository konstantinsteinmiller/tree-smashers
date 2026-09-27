/**
 * ─── Driving gemini.google.com ──────────────────────────────────────────────
 *
 * A free Google account's only programmatic route to Nano Banana. The Gemini
 * API lists every image model with "Free Tier: Not available" for output, so
 * without billing the web app is the whole road. This drives it the way the
 * operator did by hand — a new chat, the references attached, the prompt
 * pasted, send, wait, download — one generation at a time. Serialisation and
 * the throttle live in lock.mjs; this file only drives the page.
 *
 * THE WINDOW. Real, headful Chrome on chaos-arena's OWN profile
 * (`~/.art-desk/profiles/chaos-arena`), launched normally and left running
 * between jobs. The DevTools port is read from the `DevToolsActivePort` file
 * Chrome writes into that profile, which is also how we know a window is OURS
 * and not some other Chrome answering on a guessed port.
 *
 * SIGNING IN happens in the same profile launched PLAIN — no DevTools port,
 * no switch but the profile — because Google refuses a sign-in in any Chrome
 * with a debugging port open ("This browser or app may not be secure").
 * `node tools/art-desk/paint.mjs --sign-in` opens that window.
 *
 * THE SELECTORS are structural — Gemini's Angular element names and classes —
 * never button text or aria-labels: the UI is localised to the account.
 * SEL below is the one place to update when Google reshapes the page.
 *
 * Template: art-generation-pipeline/templates/art-desk/gemini.mjs, plus the
 * fixes the sandbox-tower desk proved in production (multi-attach counted by
 * chips, per-file MIME, failed-upload retry, the Flash-Lite quota tell,
 * download fallbacks), plus TEXT_ONLY_AFTER_RETRY for the paint CLI.
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { imageSize } from './jobs.mjs'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
]

export const SEL = {
  editor: 'rich-textarea .ql-editor, rich-textarea [contenteditable="true"]',
  dropZone: 'input-area-v2, input-container',
  // One chip per attachment; it nests a gem-media-attachment, so count chips.
  attachment: 'uploader-file-preview',
  attachmentImg: 'uploader-file-preview img',
  // Turning while the file uploads. Gemini holds the send button until it
  // stops — and for a signed-out session it never does.
  attachmentBusy: 'uploader-file-preview mat-spinner, uploader-file-preview [role="progressbar"], .gem-attachment-loading-container',
  // A FAILED upload: a red error icon where the thumbnail was, and no spinner,
  // so the busy check passes — and the send button then never enables.
  attachmentError: '.gem-attachment-loading-error',
  attachmentClose: '.gem-attachment-close-button button',
  send: '.send-button button, button.send-button',
  userTurn: 'user-query',
  dialog: 'mat-dialog-container',
  dialogPrimary: 'button.mdc-button--unelevated, button.mat-mdc-unelevated-button, button.mat-primary',
  // Google's cookie consent, shown on a profile's first visit. Never answered
  // here: it is the account holder's choice, made once, by hand.
  consent: 'cookie-banner',
  response: 'model-response',
  responseDone: 'message-actions',
  image: 'generated-image img, single-image img, .generated-image img',
  download: 'download-generated-image-button button, button[data-test-id*="download"], button[aria-label*="ownload" i], button[aria-label*="erunterladen" i]',
  signIn: 'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"], a[href*="accounts.google.com/signin"]',
  account: 'a[href*="accounts.google.com/SignOutOptions"], a[aria-label*="Google Account" i], a[aria-label*="Google-Konto" i]',
  // The model picker's label ("Flash", "Pro", …). When the account's allowance
  // is spent the app falls back to "Flash-Lite", which takes no uploads.
  model: '.logo-pill-label-container .picker-secondary-text'
}

// What a refusal to generate looks like, in the two languages seen so far.
const QUOTA = /\b(limit|limits|quota|kontingent)\b|too many|zu viele|try again (later|tomorrow)|später (erneut|noch einmal)|morgen (wieder|erneut)|come back tomorrow/i
const SIGNED_OUT = /signed out|sign in to|are you signed in|melde dich an|abgemeldet|bist du angemeldet/i

const NUDGE = 'Generate the image now: one single image, exactly as described in my previous message, following the attached reference image(s) as described there. Do not answer in words.'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra })

const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

export const loadPlaywright = (root) => {
  const req = createRequire(join(root, 'package.json'))
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    try {
      return req(name)
    } catch { /* next */
    }
  }
  throw fail('BROWSER', 'Playwright is not installed in this project — pnpm add -D playwright-core')
}

export const findChrome = (configured) => {
  const exe = configured ?? CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw fail('BROWSER', 'No Chrome found — set "gemini": { "chrome": "<path>" } in art-desk.config.json')
  return exe
}

export class Gemini {
  constructor({
                root, profileDir, url, chrome, chromeArgs = [], log = () => {
    }
              }) {
    this.root = root
    this.profileDir = profileDir
    this.url = url
    this.origin = new URL(url).origin
    this.chrome = chrome
    this.chromeArgs = chromeArgs
    this.log = log
    this.browser = null
  }

  /** The DevTools port of a live Chrome on OUR profile, or null. */
  async livePort() {
    const f = join(this.profileDir, 'DevToolsActivePort')
    if (!existsSync(f)) return null
    const port = Number(readFileSync(f, 'utf-8').split(/\r?\n/)[0])
    if (!port) return null
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
      return r.ok ? port : null
    } catch {
      return null
    }
  }

  /** Is ANY Chrome running on this profile — with our port or without it? */
  profileInUse() {
    if (process.platform === 'win32') {
      // Chrome holds `lockfile` open exclusively for as long as it runs.
      const f = join(this.profileDir, 'lockfile')
      if (!existsSync(f)) return false
      try {
        closeSync(openSync(f, 'r+'))
        return false
      } catch (e) {
        return e.code === 'EBUSY' || e.code === 'EPERM'
      }
    }
    try {
      // Elsewhere `SingletonLock` is a symlink to "<host>-<pid>".
      process.kill(Number(readlinkSync(join(this.profileDir, 'SingletonLock')).split('-').pop()), 0)
      return true
    } catch {
      return false
    }
  }

  chromePath() {
    return findChrome(this.chrome)
  }

  async launch() {
    let port = await this.livePort()
    if (port) return port
    if (this.profileInUse()) {
      throw fail('BROWSER', `a Chrome window without the automation port is open on ${this.profileDir} (the sign-in window?) — close it once you are signed in, then run again`)
    }
    const exe = this.chromePath()
    mkdirSync(this.profileDir, { recursive: true })
    rmSync(join(this.profileDir, 'DevToolsActivePort'), { force: true })
    this.log(`launching the Gemini Chrome on ${this.profileDir}`)
    spawn(exe, [
      `--user-data-dir=${this.profileDir}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      // A window in the background must keep its timers and painting, or a
      // generation sits waiting on a throttled tab.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      ...this.chromeArgs,
      this.url
    ], { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 80; i++) {
      await sleep(250)
      port = await this.livePort()
      if (port) return port
    }
    throw fail('BROWSER', `Chrome started but opened no DevTools port. If a Chrome window on ${this.profileDir} was already open, close it and try again.`)
  }

  async connect() {
    if (this.browser?.isConnected()) return
    const port = await this.launch()
    const { chromium } = loadPlaywright(this.root)
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    this.browser.on('disconnected', () => {
      this.browser = null
    })
    this.context = this.browser.contexts()[0] ?? await this.browser.newContext()
  }

  /** Let go of the window without closing it. */
  async detach() {
    const b = this.browser
    this.browser = null
    // For a browser reached over CDP, close() disconnects; Chrome keeps running.
    await b?.close().catch(() => {
    })
  }

  async page() {
    await this.connect()
    const pages = this.context.pages()
    return pages.find((p) => p.url().startsWith(this.origin))
      ?? pages.find((p) => /^(about:blank|chrome:\/\/new-tab-page)/.test(p.url()))
      ?? this.context.newPage()
  }

  async signedIn(page) {
    return page.evaluate((s) => {
      if (document.querySelector(s.account)) return true
      if (document.querySelector(s.signIn)) return false
      return null
    }, SEL).catch(() => null)
  }

  /** The desk's window, to watch it work. Launches it; does NOT attach. */
  async open() {
    const running = !!(await this.livePort())
    await this.launch()
    return { running: true, launched: !running }
  }

  /** Close OUR automation window (found by our profile's port — never any other Chrome). */
  async closeWindow() {
    const port = await this.livePort()
    if (!port) return false
    await this.detach()
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    await new Promise((res) => {
      const ws = new WebSocket(webSocketDebuggerUrl)
      ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
      ws.addEventListener('close', res)
      ws.addEventListener('error', res)
      setTimeout(res, 3000)
    })
    for (let i = 0; i < 40 && this.profileInUse(); i++) await sleep(250)
    return true
  }

  /** The same profile, launched plain for a Google sign-in (see SIGNING IN). */
  async signInWindow() {
    if (await this.livePort()) await this.closeWindow()
    else if (this.profileInUse()) return { opened: false, alreadyOpen: true }
    mkdirSync(this.profileDir, { recursive: true })
    spawn(this.chromePath(), [
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      this.url
    ], { detached: true, stdio: 'ignore' }).unref()
    return { opened: true }
  }

  async status() {
    const port = await this.livePort()
    return { running: !!port, signInWindow: !port && this.profileInUse(), attached: !!this.browser?.isConnected() }
  }

  /**
   * One generation: new chat, references, prompt, send, wait, download.
   *
   * `files` are attached in the order given. (The desk's queue passes
   * `refFile` + `styleFiles` instead and gets finish refs first, layout LAST.)
   *
   * Resolves `{ bytes, chatUrl, fullRes, nudged }`; rejects with `err.code` one of
   * BROWSER · SIGNED_OUT · CONSENT · QUOTA · NO_IMAGE · TEXT_ONLY_AFTER_RETRY · TIMEOUT,
   * and `err.counted` when the attempt used up a generation. `onSent` fires
   * once the prompt has gone to Gemini.
   */
  async paint({
                files, refFile, styleFiles = [], prompt, timeoutMs = 300_000, onPhase = () => {
    }, onSent = () => {
    }
              }) {
    const list = (files ?? [...styleFiles, refFile]).filter(Boolean)
    try {
      const page = await this.page()
      onPhase('opening a new chat')
      await page.goto(this.url, { waitUntil: 'domcontentloaded' })
      const editor = page.locator(SEL.editor).first()
      await editor.waitFor({ state: 'visible', timeout: 45_000 })
        .catch(() => {
          throw fail('BROWSER', 'Gemini never showed its prompt box — is the page loading, or asking for something?')
        })
      await sleep(1200)
      if (await page.locator(SEL.consent).count()) {
        throw fail('CONSENT', 'Gemini is asking about cookies — answer it once by hand in the Gemini window (paint.mjs --sign-in), then run again')
      }
      // ART_DESK_ALLOW_SIGNED_OUT=1: driver development on a throwaway profile
      // (DESK.md: box, paste, notice, typing and sending behave the same signed out).
      if ((await this.signedIn(page)) === false && !process.env.ART_DESK_ALLOW_SIGNED_OUT) {
        throw fail('SIGNED_OUT', 'the Gemini window is signed out — run `node tools/art-desk/paint.mjs --sign-in`, sign in, close that window, then run again')
      }
      this.model = await this.modelLabel(page)
      if (this.model) this.log(`model: ${this.model}`)

      if (list.length) {
        onPhase(list.length > 1 ? `attaching ${list.length} images` : 'attaching the reference')
        for (const f of list) await this.attach(page, f)
      }

      onPhase('pasting the prompt')
      await this.type(page, prompt)

      let before = await page.locator(SEL.response).count()
      onPhase('sending')
      await this.send(page)
      onSent()

      let res
      let nudged = false
      try {
        res = await this.waitForImage(page, before, timeoutMs, onPhase)
      } catch (e) {
        if (e.code !== 'NO_IMAGE') throw e
        // It answered in words — usually a description of what it WOULD
        // paint. Asking once more in the same chat, with the references still
        // in context, is cheaper than a new chat.
        this.log(`Gemini replied in words: "${e.text.replace(/\s+/g, ' ').slice(0, 160)}" — asking once more for the image`)
        onPhase('asking again for the image')
        nudged = true
        before = await page.locator(SEL.response).count()
        await this.type(page, NUDGE)
        await this.send(page)
        res = await this.waitForImage(page, before, timeoutMs, onPhase).catch((e2) => {
          if (e2.code === 'NO_IMAGE') e2.code = 'TEXT_ONLY_AFTER_RETRY'
          throw e2
        })
      }

      onPhase('downloading the full-size image')
      const { bytes, fullRes } = await this.download(page, res)
      const size = imageSize(bytes)
      this.log(`got ${size?.w}x${size?.h} ${size?.type}, ${(bytes.length / 1024).toFixed(0)} kB${fullRes ? '' : ' (NOT the full-size original — the download button failed)'}`)
      return { bytes, chatUrl: page.url(), fullRes, nudged }
    } catch (e) {
      if (!e.code) e.code = 'BROWSER'
      throw e
    } finally {
      await this.detach()
    }
  }

  /**
   * The model picker's label, once it has rendered (it is empty for a moment
   * after the page loads — reading it straight away sees nothing).
   *
   * sandbox-tower's tell: a SPENT allowance drops the picker to Flash-Lite,
   * which then refuses uploads. But on chaos-arena's profile (Sept 2026) the
   * picker simply STARTS on "3.5 Flash-Lite", and that model painted and took
   * two uploads fine. So Lite alone is not a quota verdict; a Lite label plus
   * an upload Gemini will not take is.
   */
  async modelLabel(page) {
    const loc = page.locator(SEL.model).first()
    for (let i = 0; i < 10; i++) {
      const t = ((await loc.textContent({ timeout: 1000 }).catch(() => '')) ?? '').trim()
      if (t) return t
      await sleep(300)
    }
    return ''
  }

  /**
   * Attach, and re-attach when Gemini's upload fails. A failed upload leaves a
   * chip with an error icon that nothing else notices: the send button stays
   * disabled (seen on sandbox-tower; the same file uploaded fine on the retry).
   */
  async attach(page, file, tries = 3) {
    const failed = page.locator(SEL.attachment, { has: page.locator(SEL.attachmentError) })
    for (let t = 1; t <= tries; t++) {
      await this.attachOnce(page, file)
      await sleep(600)
      if (!(await failed.count())) return
      this.log(`Gemini failed to upload ${basename(file)} (try ${t} of ${tries}) — removing it and attaching again`)
      while (await failed.count()) {
        const n = await page.locator(SEL.attachment).count()
        await failed.first().locator(SEL.attachmentClose).click()
        await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length < n, [SEL.attachment, n], { timeout: 5000 })
      }
      await sleep(1500 * t)
    }
    throw fail('BROWSER', `Gemini failed to upload ${basename(file)} ${tries} times in a row — its attachment chip shows an error`)
  }

  async attachOnce(page, file) {
    const b64 = readFileSync(file).toString('base64')
    const name = basename(file)
    const mime = MIME[extname(file).toLowerCase()] ?? 'image/png'
    const count = () => page.locator(SEL.attachment).count()
    // Count, not presence: with several images the first chip is already
    // there, so "a chip exists" would call every later attach landed.
    const before = await count()
    for (const how of ['paste', 'drop']) {
      await page.evaluate(({ b64, name, mime, how, s }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], name, { type: mime }))
        const ed = document.querySelector(s.editor)
        ed.focus()
        if (how === 'paste') {
          ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        } else {
          const zone = document.querySelector(s.dropZone) ?? ed
          for (const type of ['dragenter', 'dragover', 'drop']) {
            zone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
          }
        }
      }, { b64, name, mime, how, s: SEL })
      await this.acceptNotice(page)
      const landed = await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length > n, [SEL.attachment, before], { timeout: 10_000 })
        .then(() => true, () => false)
      if (!landed) continue
      await page.waitForFunction((s) => [...document.querySelectorAll(s.attachmentImg)].every((i) => i.complete), SEL, { timeout: 30_000 })
        .catch(() => this.log('the attachment shows no thumbnail — carrying on'))
      const uploaded = await page.waitForFunction((s) => ![...document.querySelectorAll(s.attachmentBusy)]
        .some((e) => (e.checkVisibility ? e.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true
        }) : e.offsetParent !== null)), SEL, { timeout: 90_000 })
        .then(() => true, () => false)
      if (!uploaded) {
        throw fail('SIGNED_OUT', `${name} never finished uploading — the spinner kept turning for 90 s, which is what a signed-out session does`)
      }
      if ((await count()) > before + 1) this.log(`${(await count()) - before} copies of ${name} landed — attached more than once, which is harmless`)
      return
    }
    if (/lite/i.test(await this.modelLabel(page))) {
      throw fail('QUOTA', `Gemini is on ${this.model} and refuses uploads — the account's image limit is probably spent until it resets`)
    }
    throw fail('BROWSER', `could not attach ${name} — Gemini accepted neither a paste nor a drop`)
  }

  /**
   * Gemini's one-time "you must have the rights to what you upload" notice:
   * two buttons, cancel and agree — accepted by its primary button. Any OTHER
   * dialog (consent, an upsell, a survey) stops the job with its text.
   */
  async acceptNotice(page) {
    const dlg = page.locator(SEL.dialog).last()
    const shown = await dlg.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)
    if (!shown) return
    const text = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const buttons = await dlg.locator('button').count()
    if (await dlg.locator(SEL.consent).count()) {
      throw fail('CONSENT', 'Gemini is asking about cookies — answer it once by hand in the Gemini window, then run again')
    }
    if (buttons !== 2) {
      throw fail('BROWSER', `Gemini opened a dialog this driver does not answer: "${text.slice(0, 200)}" — deal with it in the Gemini window, then run again`)
    }
    const primary = dlg.locator(SEL.dialogPrimary).last()
    const button = (await primary.count()) ? primary : dlg.locator('button').last()
    this.log(`Gemini showed its upload notice: "${text.slice(0, 200)}" — accepting it`)
    await button.click()
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
    })
  }

  async type(page, text) {
    const editor = page.locator(SEL.editor).first()
    await editor.click()
    await page.keyboard.insertText(text)
    const squash = (s) => s.replace(/\s+/g, '')
    const got = squash(await editor.innerText())
    if (got.length < squash(text).length * 0.98) {
      throw fail('BROWSER', `the prompt did not land in the box (${got.length} of ${squash(text).length} characters)`)
    }
  }

  async send(page) {
    const enabled = await page.waitForFunction((s) => {
      const b = document.querySelector(s.send)
      return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    }, SEL, { timeout: 60_000 }).then(() => true, () => false)
    if (!enabled) this.log('the send button never enabled — trying anyway')
    const btn = page.locator(SEL.send).first()
    if (await btn.count()) await btn.click({ timeout: 10_000 }).catch(() => page.keyboard.press('Enter'))
    else await page.keyboard.press('Enter')
    const started = () => page.waitForFunction((s) => (document.querySelector(s.editor)?.innerText.trim().length ?? 0) < 3, SEL, { timeout: 15_000 })
      .then(() => true, () => false)
    if (await started()) return
    await page.keyboard.press('Enter')
    if (!(await started())) throw fail('BROWSER', 'Gemini did not take the message — the prompt is still in the box')
  }

  async waitForImage(page, before, timeoutMs, onPhase) {
    const t0 = Date.now()
    let doneAt = null
    let imageAt = null
    let lastTick = 0
    while (Date.now() - t0 < timeoutMs) {
      const s = await page.evaluate(({ s, before }) => {
        const all = document.querySelectorAll(s.response)
        if (all.length <= before) return { started: false }
        const r = all[all.length - 1]
        let imgs = [...r.querySelectorAll(s.image)]
        if (!imgs.length) imgs = [...r.querySelectorAll('img')].filter((i) => /googleusercontent|^blob:/.test(i.src))
        const ready = imgs.filter((i) => i.complete && i.naturalWidth >= 256)
        return {
          started: true,
          done: !!r.querySelector(s.responseDone),
          text: r.innerText.trim(),
          images: ready.map((i) => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight })),
          loading: imgs.length - ready.length
        }
      }, { s: SEL, before }).catch(() => ({ started: false }))

      if (s.images?.length) {
        imageAt ??= Date.now()
        // Done, or a loaded image and the turn quiet for a while.
        if (s.done || Date.now() - imageAt > 30_000) return { image: s.images[0], text: s.text }
      } else if (s.done && !s.loading) {
        doneAt ??= Date.now()
        // The image can render a beat after the actions bar.
        if (Date.now() - doneAt > 8000) {
          if (QUOTA.test(s.text)) throw fail('QUOTA', `Gemini says: ${s.text.replace(/\s+/g, ' ').slice(0, 300)}`, { counted: true })
          if (SIGNED_OUT.test(s.text)) throw fail('SIGNED_OUT', `Gemini says: ${s.text.replace(/\s+/g, ' ').slice(0, 300)}`)
          throw fail('NO_IMAGE', `Gemini answered without an image: ${s.text.replace(/\s+/g, ' ').slice(0, 300)}`, {
            counted: true,
            text: s.text
          })
        }
      }
      if (Date.now() - lastTick > 10_000) {
        lastTick = Date.now()
        onPhase(s.started ? `Gemini is painting — ${Math.round((Date.now() - t0) / 1000)} s` : 'waiting for Gemini to start', true)
      }
      await sleep(2000)
    }
    throw fail('TIMEOUT', `no image after ${Math.round(timeoutMs / 1000)} s`, { counted: true })
  }

  /** The full-size original via Gemini's own download button; the on-screen image only as a last resort. */
  async download(page, res) {
    const turn = page.locator(SEL.response).last()
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const img = turn.locator(SEL.image).first()
        await ((await img.count()) ? img : turn.locator('img').last()).hover()
        const btn = turn.locator(SEL.download).first()
        await btn.waitFor({ state: 'visible', timeout: 8000 })
        // A working button answers in a few seconds; one that has not in 60 never will.
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), btn.click()])
        const dir = mkdtempSync(join(tmpdir(), 'art-desk-'))
        try {
          const f = join(dir, dl.suggestedFilename() || 'gemini.png')
          await dl.saveAs(f)
          const bytes = readFileSync(f)
          if (imageSize(bytes)) return { bytes, fullRes: true }
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      } catch (e) {
        this.log(`the download button did not work (try ${attempt}: ${String(e.message).split('\n')[0]})`)
        await page.mouse.move(5, 5).catch(() => {
        })
        await sleep(1500)
      }
    }
    // The src recorded when the image first appeared may be a blob: Gemini
    // swaps and revokes — so read the one on screen NOW first.
    const img = turn.locator(SEL.image).first()
    const srcNow = await img.getAttribute('src').catch(() => null)
    for (const src of [...new Set([srcNow, res.image.src].filter(Boolean))]) {
      const viaContext = src.startsWith('blob:') ? null
        : await this.context.request.get(src).then((r) => (r.ok() ? r.body() : null), () => null)
      if (viaContext && imageSize(viaContext)) return { bytes: viaContext, fullRes: false }
      const b64 = await page.evaluate(async (src) => {
        const r = await fetch(src, { credentials: 'include' })
        const b = new Uint8Array(await r.arrayBuffer())
        let s = ''
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
        return btoa(s)
      }, src).catch(() => null)
      const viaPage = b64 ? Buffer.from(b64, 'base64') : null
      if (viaPage && imageSize(viaPage)) return { bytes: viaPage, fullRes: false }
    }
    throw fail('BROWSER', 'the image is on screen but could not be downloaded', { counted: true })
  }
}
