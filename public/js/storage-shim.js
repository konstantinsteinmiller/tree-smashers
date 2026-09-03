/**
 * ─── Web Storage shim ──────────────────────────────────────────────────────
 *
 * MUST be the first script on the page. Classic (non-module) on purpose:
 * `<script type="module">` is deferred, so anything installed from inside the
 * module graph runs AFTER the entry chunk's static imports have already
 * evaluated — and those imports contain module-scope `localStorage.getItem`
 * calls. Only a parser-blocking classic script is guaranteed to win that race.
 *
 * Why it exists — YouTube Playables, 2026-09-02 QA rejection:
 *
 *     Uncaught TypeError: Cannot read properties of null (reading 'getItem')
 *
 * Inside the YouTube Playables runtime `window.localStorage` is **null**, not
 * merely unavailable. Playables forbids every client-side persistence
 * mechanism ("Game MUST NOT use any other mechanism to save user progress"
 * besides `ytgame.game.saveData`) and enforces it by nulling the accessor. A
 * `typeof localStorage === 'undefined'` guard does not help (`typeof null` is
 * `'object'`), and the ~150 call sites across the codebase all assume the
 * real thing exists — including a dozen that fire at module-evaluation time,
 * before any of our own code can defend itself.
 *
 * The same failure shape shows up elsewhere, which is why this ships on EVERY
 * build and not just the YouTube one:
 *   • `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) — an opaque
 *     origin makes any storage access throw `SecurityError`.
 *   • Chrome/Firefox with third-party cookies+storage blocked in an embed.
 *   • Some in-app WebViews (older Android WebView, embedded browsers).
 *
 * Behaviour: if the native storage is missing or throws on access, install a
 * spec-shaped in-memory `Storage` in its place. Nothing persists across a
 * reload — which is exactly right for Playables (the real persistence layer
 * is `YouTubeStrategy` → `ytgame.game.saveData`) and strictly better than a
 * hard crash everywhere else.
 *
 * A working native storage is left completely untouched, including the
 * quota-exceeded case: reads still work there, and swapping in a volatile
 * store would throw away a real save. We only replace what is unusable.
 */
;(function() {
  'use strict'

  var PROBE_KEY = '__storage_shim_probe__'

  /**
   * Spec-shaped in-memory Storage. Backed by a plain object rather than a Map
   * so `key(i)` / `length` follow the same string-key insertion order the real
   * thing does, and so `JSON.stringify` of it stays sane in a debugger.
   */
  function MemoryStorage() {
    Object.defineProperty(this, '_keys', { value: [], writable: true })
    Object.defineProperty(this, '_map', { value: Object.create(null), writable: true })
  }

  MemoryStorage.prototype.getItem = function(key) {
    var k = String(key)
    return Object.prototype.hasOwnProperty.call(this._map, k) ? this._map[k] : null
  }

  MemoryStorage.prototype.setItem = function(key, value) {
    var k = String(key)
    if (!Object.prototype.hasOwnProperty.call(this._map, k)) this._keys.push(k)
    this._map[k] = String(value)
  }

  MemoryStorage.prototype.removeItem = function(key) {
    var k = String(key)
    if (!Object.prototype.hasOwnProperty.call(this._map, k)) return
    delete this._map[k]
    var i = this._keys.indexOf(k)
    if (i !== -1) this._keys.splice(i, 1)
  }

  MemoryStorage.prototype.clear = function() {
    this._keys = []
    this._map = Object.create(null)
  }

  MemoryStorage.prototype.key = function(index) {
    var i = Number(index)
    return i >= 0 && i < this._keys.length ? this._keys[i] : null
  }

  Object.defineProperty(MemoryStorage.prototype, 'length', {
    get: function() {
      return this._keys.length
    }
  })

  /**
   * Is the native storage usable?
   *
   * Deliberately READ-only. A write probe would also fail when the quota is
   * full, and replacing a real, populated storage in that situation would
   * silently drop the player's save — far worse than the quota error itself.
   * The failure this shim exists for (null accessor / opaque-origin
   * SecurityError) always trips on the read path too.
   */
  function isUsable(name) {
    try {
      var store = window[name]
      if (!store) return false
      store.getItem(PROBE_KEY)
      // Touch `length` as well — some embedders hand back a stub whose
      // methods exist but whose property accessors throw.
      void store.length
      return true
    } catch (e) {
      return false
    }
  }

  function install(name) {
    if (isUsable(name)) return null
    var reason = window[name] === null || window[name] === undefined
      ? 'accessor is ' + String(window[name])
      : 'access threw'
    try {
      Object.defineProperty(window, name, {
        value: new MemoryStorage(),
        configurable: true,
        writable: true
      })
      return reason
    } catch (e) {
      // Extremely defensive: a host that makes the property non-configurable
      // leaves us no way in. Report it rather than pretending we patched.
      return 'FAILED: ' + (e && e.message ? e.message : String(e))
    }
  }

  var localReason = install('localStorage')
  var sessionReason = install('sessionStorage')

  // Diagnostic handle. Portal QA reads the console, and "did the shim engage?"
  // is the first question worth answering when a save-related bug is reported.
  window.__storageShim = {
    localStorage: localReason,
    sessionStorage: sessionReason
  }

  if (localReason || sessionReason) {
    console.info(
      '[storage-shim] native Web Storage unavailable — in-memory fallback installed',
      window.__storageShim
    )
  }
})()
