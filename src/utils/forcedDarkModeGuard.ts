// ─── forcedDarkModeGuard ────────────────────────────────────────────────
//
// Framework-agnostic, zero-dependency detector for forced dark-mode /
// colour overriders that repaint a web game behind its back.
//
//   detectForcedDarkMode()      one synchronous pass → DetectionResult
//   watchForcedDarkMode(cb)     re-checks on DOM mutation, media-query change,
//                               window focus, the host's own pause/resume
//                               signal (`subscribeRecheck`) and a short retry
//                               ladder; returns a cleanup function. It never
//                               listens to Page Visibility (`visibilitychange`):
//                               YouTube Playables forbids those listeners.
//   applyPreventionOptOuts()    runtime half of the prevention checklist
//                               (the static half lives in index.html)
//
// Rules this file keeps (see SKILL.md for sources):
//   - `prefers-color-scheme: dark` on its own is NEVER an override.
//   - An overrider the page has already neutralised is reported with
//     `prevented: true` and does not count towards `detected`.
//   - Every probe is try/catch'd: a detector must never break boot.
//
// Copy into the host as e.g. src/utils/forcedDarkModeGuard.ts. No imports.

export type OverrideKind =
  | 'dark-reader'          // Dark Reader extension (any mode)
  | 'night-eye'            // Night Eye extension (marker UNVERIFIED → 'low', log only)
  | 'css-filter-invert'    // any extension/filter mode inverting <html>/<body>
  | 'chromium-auto-dark'   // Chrome/Edge/Opera/Brave/Samsung "force dark" (paint-level)
  | 'forced-colors'        // Windows contrast themes, Firefox "override colours"
  | 'unknown-css-override' // our sentinel's author colours were rewritten
  | 'os-inverted-colors'   // Safari `inverted-colors: inverted` (iOS/macOS invert) — log-only

export type Confidence = 'high' | 'medium' | 'low'

/** Chromium-family browser, used only to pick the "how to turn it off" hint. */
export type BrowserHint = 'chrome' | 'edge' | 'opera' | 'brave' | 'samsung' | 'firefox' | 'safari' | 'other'

export interface OverrideSignal {
  kind: OverrideKind
  confidence: Confidence
  /** Human-readable evidence for logs/analytics (never shown to players). */
  evidence: string
  /** True when the page's opt-outs already neutralise this overrider. */
  prevented: boolean
}

export interface DetectionResult {
  /** A non-prevented signal at or above `minConfidence` exists. */
  detected: boolean
  /** Strongest non-prevented signal's kind (null when not detected). */
  kind: OverrideKind | null
  confidence: Confidence | null
  browser: BrowserHint
  /** Every signal seen, including prevented and sub-threshold ones. */
  signals: OverrideSignal[]
}

export interface DetectOptions {
  /** Signals below this confidence never set `detected`. Default 'medium'. */
  minConfidence?: Confidence
  /**
   * Treat an un-neutralised `forced-colors: active` as an override.
   * Default true. Forced colours is an ACCESSIBILITY mode — prefer the
   * `forced-color-adjust: none` opt-out (then it is `prevented`) over
   * blocking a low-vision player. Set false to only log it.
   */
  forcedColorsBlocks?: boolean
  /** Run the injected-stylesheet sentinel probe. Default true. */
  sentinel?: boolean
  /** Document to probe (tests). Default: global document. */
  doc?: Document
}

export interface WatchOptions extends DetectOptions {
  /** Debounce for mutation/media bursts, ms. Default 150. */
  debounceMs?: number
  /**
   * Extra re-checks after start (ms from start). Extensions inject at
   * document_start, DOMContentLoaded or later, and not always where the
   * observer looks. Default [0, 400, 1200, 3000, 6000].
   */
  retryLadderMs?: number[]
  /** Fire the callback on every check, not only when the verdict changes. */
  emitUnchanged?: boolean
  /**
   * Extra re-check trigger owned by the host. Receives `recheck` and may
   * return an unsubscribe function. Wire it to the game's own pause/resume
   * signal (portal SDK pause/resume, the host's `useGamePause` resume, ...):
   * coming back from the extension popup or browser settings is when players
   * turn the overrider off.
   *
   * Default: none. The built-in triggers are window `focus`, the
   * MutationObserver and matchMedia `change`. Deliberately NO
   * `visibilitychange`: YouTube Playables (e.g. via a Playgama build)
   * rejects games that register Page Visibility listeners.
   */
  subscribeRecheck?: (recheck: () => void) => (() => void) | void
  /** Listen to window `focus`. Default true. */
  recheckOnFocus?: boolean
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }
const SENTINEL_ATTR = 'data-fdmg-sentinel'
const SENTINEL_STYLE_ATTR = 'data-fdmg-style'
// Deliberately odd author colours: nothing but an overrider produces them back changed.
const SENTINEL_BG = 'rgb(254, 253, 252)'
const SENTINEL_FG = 'rgb(1, 2, 3)'

// ─── helpers ───────────────────────────────────────────────────────────

function mq(win: Window, query: string): boolean {
  try { return !!win.matchMedia && win.matchMedia(query).matches } catch { return false }
}

function detectBrowser(nav: Navigator | undefined): BrowserHint {
  const ua = nav?.userAgent ?? ''
  if (/SamsungBrowser\//.test(ua)) return 'samsung'
  if (/Edg(A|iOS)?\//.test(ua)) return 'edge'
  if (/OPR\/|Opera/.test(ua)) return 'opera'
  if ((nav as unknown as { brave?: unknown })?.brave) return 'brave'
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox'
  if (/CriOS\//.test(ua)) return 'safari' // iOS Chrome is WebKit: no force-dark engine
  if (/Chrome\/|Chromium\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}

/** Blink is the only engine with the paint-level force-dark algorithm. */
function isBlink(b: BrowserHint): boolean {
  return b === 'chrome' || b === 'edge' || b === 'opera' || b === 'brave' || b === 'samsung'
}

/** Page-declared colour schemes: <meta name=color-scheme> + computed :root. */
function declaredColorScheme(doc: Document, win: Window): string {
  let out = ''
  try {
    doc.querySelectorAll('meta[name="color-scheme"]').forEach(m => { out += ' ' + (m.getAttribute('content') ?? '') })
  } catch { /* noop */ }
  try { out += ' ' + (win.getComputedStyle(doc.documentElement).colorScheme ?? '') } catch { /* noop */ }
  return out.toLowerCase()
}

function isWhite(rgb: string): boolean {
  return /^rgba?\(\s*255,\s*255,\s*255(,\s*1)?\s*\)$/.test(rgb.trim())
}

function withProbe<T>(doc: Document, css: string, attr: string, read: (el: HTMLElement, win: Window) => T): T | null {
  const win = doc.defaultView
  const host = doc.body ?? doc.documentElement
  if (!win || !host) return null
  const el = doc.createElement('div')
  el.setAttribute(attr, '')
  el.setAttribute('aria-hidden', 'true')
  // Inline !important: an overrider's `* { background: … !important }` would
  // otherwise rewrite the probe itself and get mis-attributed (e.g. to auto-dark).
  el.style.cssText = css.split(';').filter(Boolean).map(d => `${d} !important`).join(';')
  try {
    host.appendChild(el)
    return read(el, win)
  } catch {
    return null
  } finally {
    el.remove()
  }
}

// ─── individual probes ─────────────────────────────────────────────────

function probeDarkReader(doc: Document, out: OverrideSignal[]): void {
  const html = doc.documentElement
  const locked = !!doc.querySelector('meta[name="darkreader-lock"]')
  const evidence: string[] = []
  if (doc.querySelector('meta[name="darkreader"]')) evidence.push('meta[name=darkreader]')
  const mode = html.getAttribute('data-darkreader-mode')
  if (mode) evidence.push(`html[data-darkreader-mode=${mode}]`)
  const scheme = html.getAttribute('data-darkreader-scheme')
  if (scheme) evidence.push(`html[data-darkreader-scheme=${scheme}]`)
  // Filter / Filter+ / Static modes (these ignore darkreader-lock):
  if (doc.getElementById('dark-reader-style')) evidence.push('style#dark-reader-style')
  if (doc.getElementById('dark-reader-svg')) evidence.push('svg#dark-reader-svg')
  // Dynamic-mode sheets (exclude the transient fallback, handled below).
  const sheets = doc.querySelectorAll('style.darkreader:not(.darkreader--fallback), .darkreader-style-container')
  if (sheets.length) evidence.push(`${sheets.length}x .darkreader style`)
  if (evidence.length) {
    out.push({ kind: 'dark-reader', confidence: 'high', evidence: evidence.join(', '), prevented: false })
    return
  }
  // Only the document_start fallback sheet: Dark Reader is about to decide.
  // With darkreader-lock present it removes it again; without, markers follow.
  if (doc.querySelector('style.darkreader--fallback')) {
    out.push({
      kind: 'dark-reader',
      confidence: 'low',
      evidence: 'only style.darkreader--fallback (transient)',
      prevented: locked,
    })
  }
}

function probeNightEye(doc: Document, out: OverrideSignal[]): void {
  // UNVERIFIED marker: Night Eye is closed source; community reports say it
  // tags <html nighteye="active">. An unverified marker is LOG ONLY ('low'):
  // it must not open a blocking modal until it is verified on the real
  // extension. The generic sentinel and filter probes are the real net for it.
  const v = doc.documentElement.getAttribute('nighteye')
  if (v && v !== 'disabled') {
    out.push({ kind: 'night-eye', confidence: 'low', evidence: `html[nighteye=${v}] (unverified marker, log only)`, prevented: false })
  }
}

function probeInvertFilter(doc: Document, win: Window, out: OverrideSignal[]): void {
  for (const el of [doc.documentElement, doc.body]) {
    if (!el) continue
    let f = ''
    try { f = win.getComputedStyle(el).filter || '' } catch { continue }
    if (/invert\(\s*(0?\.[5-9]\d*|1(\.0*)?|[5-9]\d(\.\d+)?%|100%)\s*\)/.test(f)) {
      out.push({ kind: 'css-filter-invert', confidence: 'high', evidence: `${el.tagName.toLowerCase()} filter: ${f}`, prevented: false })
      return
    }
  }
}

function probeForcedColors(doc: Document, win: Window, blocks: boolean, out: OverrideSignal[]): boolean {
  if (!mq(win, '(forced-colors: active)')) return false
  // forced-color-adjust is inherited, so a probe in <body> sees the page's opt-out.
  const fca = withProbe(doc, 'position:absolute;width:0;height:0;overflow:hidden', 'data-fdmg-fca',
    (el, w) => w.getComputedStyle(el).getPropertyValue('forced-color-adjust')) ?? ''
  const prevented = fca.trim() === 'none'
  out.push({
    kind: 'forced-colors',
    confidence: blocks ? 'high' : 'low',
    evidence: `(forced-colors: active), forced-color-adjust=${fca || 'unsupported'}`,
    prevented,
  })
  return true
}

function probeChromiumAutoDark(doc: Document, win: Window, browser: BrowserHint, out: OverrideSignal[]): void {
  if (!isBlink(browser)) return
  // Chrome's documented detector (developer.chrome.com/blog/auto-dark-theme):
  // `canvas` resolved under an explicit light scheme is white unless the
  // force-dark algorithm is on. Verified Chrome 154: rgb(18,18,18) under the
  // flag / CDP override; white under plain prefers-color-scheme: dark.
  const bg = withProbe(doc, 'display:none;background-color:canvas;color-scheme:light', 'data-fdmg-autodark',
    (el, w) => w.getComputedStyle(el).backgroundColor)
  if (bg == null || isWhite(bg)) return
  // The probe reports the ENGINE state, not whether this page got darkened.
  // Verified (Chrome 154): with the OS/browser in dark, a page declaring
  // `color-scheme` with `only` or `dark` is left alone; with a light OS and
  // the desktop flag forced on, nothing opts out.
  // Inside a portal iframe `prefers-color-scheme` comes from the parent page,
  // but force-dark follows that same preference, so this rule still matches
  // what is painted (30/30 parent-declaration × flag × OS combos measured).
  const prefersDark = mq(win, '(prefers-color-scheme: dark)')
  const scheme = declaredColorScheme(doc, win)
  const prevented = prefersDark && /\b(only|dark)\b/.test(scheme)
  out.push({
    kind: 'chromium-auto-dark',
    confidence: 'high',
    evidence: `canvas probe=${bg}, prefers-dark=${prefersDark}, declared color-scheme="${scheme.trim()}"`,
    prevented,
  })
}

function ensureSentinelStyle(doc: Document): void {
  if (doc.querySelector(`style[${SENTINEL_STYLE_ATTR}]`)) return
  const s = doc.createElement('style')
  s.setAttribute(SENTINEL_STYLE_ATTR, '')
  // Single-attribute selector (0,1,0) and no !important: beats plain element
  // rules in the game's own CSS, loses to any overrider's `* !important`.
  s.textContent = `[${SENTINEL_ATTR}]{background-color:${SENTINEL_BG};color:${SENTINEL_FG};border:0 solid ${SENTINEL_FG}}`
  ;(doc.head ?? doc.documentElement).appendChild(s)
}

function probeSentinel(doc: Document, out: OverrideSignal[]): void {
  try { ensureSentinelStyle(doc) } catch { return }
  const res = withProbe(doc,
    'position:fixed;left:-9999px;top:0;width:4px;height:4px;pointer-events:none;visibility:hidden',
    SENTINEL_ATTR,
    (el, w) => { const cs = w.getComputedStyle(el); return { bg: cs.backgroundColor, fg: cs.color } })
  if (!res) return
  if (res.bg !== SENTINEL_BG || res.fg !== SENTINEL_FG) {
    out.push({
      kind: 'unknown-css-override',
      confidence: 'medium',
      evidence: `sentinel bg=${res.bg} fg=${res.fg} (expected ${SENTINEL_BG} / ${SENTINEL_FG})`,
      prevented: false,
    })
  }
}

function probeInvertedColors(win: Window, out: OverrideSignal[]): void {
  // OS-level inversion (iOS/macOS Classic/Smart Invert) is an accessibility
  // setting, not a web overrider, and only WebKit exposes it. Reported 'low'
  // so it never blocks by default — it is there for analytics.
  if (mq(win, '(inverted-colors: inverted)')) {
    out.push({ kind: 'os-inverted-colors', confidence: 'low', evidence: '(inverted-colors: inverted)', prevented: false })
  }
}

// ─── public API ────────────────────────────────────────────────────────

const KIND_PRIORITY: OverrideKind[] = [
  'dark-reader', 'night-eye', 'chromium-auto-dark', 'forced-colors', 'css-filter-invert', 'unknown-css-override',
  'os-inverted-colors',
]

export function detectForcedDarkMode(opts: DetectOptions = {}): DetectionResult {
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined)
  const empty: DetectionResult = { detected: false, kind: null, confidence: null, browser: 'other', signals: [] }
  if (!doc || !doc.defaultView || !doc.documentElement) return empty
  const win = doc.defaultView
  const browser = detectBrowser(win.navigator)
  const signals: OverrideSignal[] = []
  const minRank = RANK[opts.minConfidence ?? 'medium']

  try { probeDarkReader(doc, signals) } catch { /* noop */ }
  try { probeNightEye(doc, signals) } catch { /* noop */ }
  try { probeInvertFilter(doc, win, signals) } catch { /* noop */ }
  try { probeInvertedColors(win, signals) } catch { /* noop */ }
  let forced = false
  try { forced = probeForcedColors(doc, win, opts.forcedColorsBlocks ?? true, signals) } catch { /* noop */ }
  // Under forced colours `canvas` and every author colour are rewritten by
  // design; attributing that to auto-dark or "unknown" would double-report.
  if (!forced) {
    try { probeChromiumAutoDark(doc, win, browser, signals) } catch { /* noop */ }
    if (opts.sentinel ?? true) { try { probeSentinel(doc, signals) } catch { /* noop */ } }
  }

  const live = signals
    .filter(s => !s.prevented && RANK[s.confidence] >= minRank)
    .sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind))
  const top = live[0]
  return { detected: !!top, kind: top?.kind ?? null, confidence: top?.confidence ?? null, browser, signals }
}

/**
 * Runtime opt-outs. Call as early as possible (top of main.ts). The static
 * <meta> tags in index.html are still required: they act before any JS.
 */
export function applyPreventionOptOuts(doc: Document = document): void {
  try {
    if (!doc.querySelector('meta[name="darkreader-lock"]')) {
      const m = doc.createElement('meta')
      m.name = 'darkreader-lock'
      ;(doc.head ?? doc.documentElement).appendChild(m)
    }
  } catch { /* noop */ }
}

function verdictKey(r: DetectionResult): string {
  return `${r.detected}|${r.kind}|${r.confidence}`
}

/**
 * Watch for overriders appearing/disappearing. `onChange` fires with the
 * first verdict and then whenever `detected/kind/confidence` changes.
 * Returns a cleanup function (idempotent).
 */
export function watchForcedDarkMode(onChange: (r: DetectionResult) => void, opts: WatchOptions = {}): () => void {
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined)
  if (!doc || !doc.defaultView) return () => {}
  const win = doc.defaultView
  const debounceMs = opts.debounceMs ?? 150
  let last = ''
  let stopped = false
  let debounce: ReturnType<typeof setTimeout> | null = null
  const timers: ReturnType<typeof setTimeout>[] = []
  const cleanups: (() => void)[] = []

  const check = (): void => {
    if (stopped) return
    const r = detectForcedDarkMode(opts)
    const key = verdictKey(r)
    if (opts.emitUnchanged || key !== last) {
      last = key
      try { onChange(r) } catch (e) { console.warn('[forced-dark-guard] onChange threw', e) }
    }
  }
  const schedule = (): void => {
    if (stopped) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(check, debounceMs)
  }
  const isOwnNode = (n: Node): boolean =>
    n instanceof Element && (n.hasAttribute(SENTINEL_ATTR) || n.hasAttribute(SENTINEL_STYLE_ATTR) ||
      n.hasAttribute('data-fdmg-autodark') || n.hasAttribute('data-fdmg-fca'))

  // 1) DOM: <html> attributes + direct children, <head> subtree. Not the whole
  //    body subtree — a game mutates that every frame.
  try {
    const mo = new MutationObserver(records => {
      if (records.every(r => r.type === 'childList' &&
        [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].every(isOwnNode))) return
      schedule()
    })
    mo.observe(doc.documentElement, { attributes: true, childList: true })
    if (doc.head) mo.observe(doc.head, { childList: true, subtree: true, attributes: true, characterData: true })
    if (doc.body) mo.observe(doc.body, { attributes: true, attributeFilter: ['style', 'class'] })
    cleanups.push(() => mo.disconnect())
  } catch { /* noop */ }

  // 2) Media queries that flip forced colours / force dark at runtime.
  for (const q of ['(forced-colors: active)', '(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(inverted-colors: inverted)']) {
    try {
      const m = win.matchMedia(q)
      m.addEventListener('change', schedule)
      cleanups.push(() => m.removeEventListener('change', schedule))
    } catch { /* noop */ }
  }

  // 3) Coming back to the game is when players flip the extension off.
  //    Window focus + the host's own resume signal. NOT `visibilitychange`
  //    (YouTube Playables bans Page Visibility listeners; see WatchOptions).
  if (opts.recheckOnFocus ?? true) {
    win.addEventListener('focus', schedule)
    cleanups.push(() => win.removeEventListener('focus', schedule))
  }
  if (opts.subscribeRecheck) {
    try {
      const unsub = opts.subscribeRecheck(schedule)
      if (typeof unsub === 'function') cleanups.push(unsub)
    } catch (e) { console.warn('[forced-dark-guard] subscribeRecheck threw', e) }
  }

  // 4) Retry ladder for late injectors that land outside the observed nodes.
  for (const ms of opts.retryLadderMs ?? [0, 400, 1200, 3000, 6000]) timers.push(setTimeout(check, ms))

  return () => {
    if (stopped) return
    stopped = true
    if (debounce) clearTimeout(debounce)
    timers.forEach(clearTimeout)
    cleanups.forEach(fn => { try { fn() } catch { /* noop */ } })
  }
}
