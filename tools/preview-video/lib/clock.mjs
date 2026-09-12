// ─── The deterministic clock ────────────────────────────────────────────────
//
// The reason a scripted gameplay clip does not stutter.
//
// A naive recorder screenshots as fast as it can and hopes the page kept up.
// It never does: a 720p PNG round-trip costs 20–60 ms, so a "30 fps" capture is
// really the game running at 15 fps and the video playing it back at 30 — every
// dropped frame a visible hitch, and hitches are exactly what a preview video
// must not have.
//
// So the page stops keeping its own time. `__vclock.arm()` takes over
// `performance.now`, `Date`, `requestAnimationFrame`, the four timer functions
// and every running Web Animation; `__vclock.step(dt)` then advances all of
// them together by exactly one frame's worth. The recorder can take as long as
// it likes over each screenshot — the game only ever sees a perfect 33.3 ms
// frame. What comes out is a clip that is smoother than the machine that made
// it, and identical on every run.
//
// ── The handoff ──
//
// The hard part is not virtual time, it is the seam. A timer or a rAF callback
// registered while the game was booting is held by the REAL browser clock, and
// there is no API to enumerate those and take them back — so a naive shim
// leaves the game's own render loop on the real clock (the first virtual frame
// then arrives with a NEGATIVE delta, because a real rAF timestamp is the
// frame's display time and runs slightly ahead of `performance.now()`), and
// leaves every pre-existing `setInterval` ticking at wall-clock pace for the
// whole recording — twenty fires in a ten-second clip that should have seen ten.
//
// So the shim is installed at document start and SHADOWS every registration
// from the very first one: while unarmed it forwards to the native function and
// remembers what it forwarded. `arm()` then cancels each native registration
// and re-books it virtually with its remaining delay. The handoff is exact —
// whatever was pending for the next real frame becomes the next virtual frame —
// and nothing is left behind on the real clock.

/** @typedef {import('./types.js').Logger} Logger */

/**
 * Installed at document start. Runs in the PAGE, so it may not reference
 * anything from this module — it is stringified verbatim.
 */
function installVirtualClock() {
  if (window.__vclock) return
  const W = window

  const native = {
    now: performance.now.bind(performance),
    dateNow: Date.now.bind(Date),
    Date: W.Date,
    raf: W.requestAnimationFrame.bind(W),
    caf: W.cancelAnimationFrame.bind(W),
    setTimeout: W.setTimeout.bind(W),
    clearTimeout: W.clearTimeout.bind(W),
    setInterval: W.setInterval.bind(W),
    clearInterval: W.clearInterval.bind(W)
  }

  let armed = false
  let t = 0          // virtual performance.now()
  let dateSkew = 0   // virtual Date.now() === dateSkew + t
  const errors = []
  const note = (where, err) => {
    if (errors.length < 50) errors.push(where + ': ' + ((err && err.message) || String(err)))
  }

  // ── rAF queue, plus the shadow of what is still on the real clock ──
  let rafSeq = 1
  let rafQueue = new Map()
  const rafShadow = new Map()   // ourId -> { nativeId, cb }
  let lastRealFrame = 0

  // ── virtual timer heap (a Map is fast enough: a page rarely holds >50) ──
  let timerSeq = 1
  const timers = new Map()
  const timerShadow = new Map() // ourId -> { nativeId, call, args, delay, every, startedReal }

  // ── Web Animations: anim -> { base, offset } ──
  const anims = new WeakMap()
  let animCount = 0

  const vNow = () => t
  const vDateNow = () => dateSkew + t

  function VirtualDate(...args) {
    if (!new.target) return native.Date()
    return Reflect.construct(native.Date, args.length === 0 ? [vDateNow()] : args)
  }

  VirtualDate.prototype = native.Date.prototype
  VirtualDate.now = vDateNow
  VirtualDate.parse = native.Date.parse
  VirtualDate.UTC = native.Date.UTC

  const vRaf = (cb) => {
    const id = rafSeq++
    if (armed) {
      rafQueue.set(id, cb)
      return id
    }
    // Unarmed: run on the real clock, but remember it so `arm()` can take it
    // back instead of losing the game's render loop to the browser.
    const nativeId = native.raf((ts) => {
      lastRealFrame = ts
      rafShadow.delete(id)
      cb(ts)
    })
    rafShadow.set(id, { nativeId, cb })
    return id
  }
  const vCaf = (id) => {
    rafQueue.delete(id)
    const shadow = rafShadow.get(id)
    if (shadow) {
      native.caf(shadow.nativeId)
      rafShadow.delete(id)
    }
  }

  const schedule = (fn, delay, args, every) => {
    const id = timerSeq++
    const wait = Math.max(0, Number(delay) || 0)
    // A string body is the `setTimeout('code')` form; nobody in a game uses it,
    // but honouring it costs one line and an eval-shaped surprise costs hours.
    const call = typeof fn === 'function' ? fn : () => {
      W.eval(String(fn))
    }

    if (armed) {
      timers.set(id, { id, seq: id, fn: call, args, due: t + wait, every: every ? Math.max(1, wait) : null })
      return id
    }
    // Unarmed: native, shadowed. `setTimeout(f, 0)` must still mean "as soon as
    // possible" while the app is booting — deferring it to the next frame is
    // exactly the kind of change that breaks a splash screen.
    const nativeId = every
      ? native.setInterval(call, wait, ...args)
      : native.setTimeout((...a) => {
        timerShadow.delete(id)
        call(...a)
      }, wait, ...args)
    timerShadow.set(id, { nativeId, call, args, delay: wait, every: !!every, startedReal: native.now() })
    return id
  }
  const vSetTimeout = (fn, delay, ...args) => schedule(fn, delay, args, false)
  const vSetInterval = (fn, delay, ...args) => schedule(fn, delay, args, true)
  const vClear = (id) => {
    timers.delete(id)
    const shadow = timerShadow.get(id)
    if (!shadow) return
    if (shadow.every) native.clearInterval(shadow.nativeId)
    else native.clearTimeout(shadow.nativeId)
    timerShadow.delete(id)
  }

  const syncAnimations = () => {
    let list
    try {
      list = document.getAnimations()
    } catch (err) {
      note('getAnimations', err)
      return
    }
    animCount = list.length
    for (const a of list) {
      try {
        let rec = anims.get(a)
        if (!rec) {
          rec = { base: t, offset: typeof a.currentTime === 'number' ? a.currentTime : 0 }
          anims.set(a, rec)
          a.pause()
        }
        a.currentTime = rec.offset + (t - rec.base)
      } catch (err) {
        note('animation', err)
      }
    }
  }

  const state = () => ({
    armed, t, rafs: rafQueue.size, timers: timers.size, anims: animCount, errors: errors.length,
    shadowRafs: rafShadow.size, shadowTimers: timerShadow.size
  })

  const arm = () => {
    if (armed) return state()
    armed = true
    // Continue from the CURRENT real time rather than restarting at zero: a
    // game that keeps `lastNow` and computes `dt = now - lastNow` would see one
    // enormous negative delta and teleport its whole simulation. And never
    // start BEHIND the last real frame's timestamp — rAF stamps a frame with
    // its display time, which runs ahead of `performance.now()`, so the naive
    // `t = now()` hands the game a negative first delta.
    const realNow = native.now()
    // Continue from the LAST REAL FRAME, not from "now": the gap between the
    // page's last painted frame and this call is dead time the game never saw,
    // and charging it to the first virtual frame hands the render loop a 150 ms
    // delta that shows up as a jump in frame one of the clip. `armPageClock`
    // arms from inside a rAF callback so the two are a hair apart anyway; the
    // 100 ms guard is for a page that had stopped animating entirely.
    t = lastRealFrame > 0 && realNow - lastRealFrame < 100 ? lastRealFrame : Math.max(realNow, lastRealFrame)
    dateSkew = native.dateNow() - t

    // Take back everything still pending on the real clock.
    for (const [id, shadow] of rafShadow) {
      native.caf(shadow.nativeId)
      rafQueue.set(id, shadow.cb)
    }
    rafShadow.clear()
    for (const [id, shadow] of timerShadow) {
      const elapsed = realNow - shadow.startedReal
      if (shadow.every) {
        native.clearInterval(shadow.nativeId)
        const every = Math.max(1, shadow.delay)
        timers.set(id, { id, seq: id, fn: shadow.call, args: shadow.args, due: t + (every - (elapsed % every)), every })
      } else {
        native.clearTimeout(shadow.nativeId)
        timers.set(id, {
          id,
          seq: id,
          fn: shadow.call,
          args: shadow.args,
          due: t + Math.max(0, shadow.delay - elapsed),
          every: null
        })
      }
    }
    timerShadow.clear()

    performance.now = vNow
    W.Date = VirtualDate
    syncAnimations()
    return state()
  }

  const disarm = () => {
    if (!armed) return state()
    armed = false
    performance.now = native.now
    W.Date = native.Date
    W.requestAnimationFrame = native.raf
    W.cancelAnimationFrame = native.caf
    W.setTimeout = native.setTimeout
    W.clearTimeout = native.clearTimeout
    W.setInterval = native.setInterval
    W.clearInterval = native.clearInterval
    try {
      for (const a of document.getAnimations()) a.play()
    } catch { /* leaving anyway */
    }
    return state()
  }

  const step = (dtMs) => {
    if (!armed) return { t, rafs: 0, timers: 0, armed: false }
    t += Math.max(0, Number(dtMs) || 0)

    // 1. every timer due at or before the new time, in time order. Intervals
    //    re-arm from their own due time so a 10 ms interval still fires three
    //    times inside a 33 ms frame; the cap is the runaway guard for the
    //    `setTimeout(f, 0)` that re-schedules itself forever.
    // The epsilon is not decoration. `t` accumulates thirty additions of
    // 1000/30 while a 250 ms interval accumulates four additions of 250, and
    // the two land a picosecond apart — without it, the fire that should close
    // out the second is silently skipped.
    const EPS = 1e-6
    let fired = 0
    for (; ;) {
      let next = null
      for (const timer of timers.values()) {
        if (timer.due > t + EPS) continue
        if (next === null || timer.due < next.due || (timer.due === next.due && timer.seq < next.seq)) next = timer
      }
      if (!next || fired >= 5000) break
      if (next.every === null) timers.delete(next.id)
      else next.due = next.due + next.every
      fired++
      try {
        next.fn.apply(W, next.args)
      } catch (err) {
        note('timer', err)
      }
    }

    // 2. a SNAPSHOT of the rAF queue — callbacks that re-register (every game
    //    loop does) land in the next step's queue, not this one's.
    const queue = rafQueue
    rafQueue = new Map()
    let rafs = 0
    for (const cb of queue.values()) {
      rafs++
      try {
        cb(t)
      } catch (err) {
        note('raf', err)
      }
    }

    // 3. CSS animations and transitions, re-scanned so ones that started this
    //    frame are picked up and pinned from here.
    syncAnimations()

    return { t, rafs, timers: fired, armed: true }
  }

  // The registration shims go on IMMEDIATELY, at document start, so that every
  // timer and rAF the page ever books is shadowed and `arm()` can take it back.
  // `performance.now` and `Date` stay real until then — the page's own boot
  // timings should be honest, and a frozen clock during startup is the kind of
  // thing that makes a splash screen wait forever.
  W.requestAnimationFrame = vRaf
  W.cancelAnimationFrame = vCaf
  W.setTimeout = vSetTimeout
  W.clearTimeout = vClear
  W.setInterval = vSetInterval
  W.clearInterval = vClear

  W.__vclock = {
    native, arm, disarm, step, state, errors, get armed() {
      return armed
    }
  }
}

/** The page-side source, installed with `context.addInitScript`. */
export const CLOCK_SOURCE = `;(${installVirtualClock.toString()})();`

/**
 * Take the page's clock. The handoff is exact — every pending rAF and timer is
 * already shadowed, so there is nothing to wait for and no frame to lose.
 *
 * @param {import('playwright').Page} page
 */
export async function armPageClock(page) {
  // Arm from inside a real animation frame, so the clock takes over a hair
  // after the page's last painted frame rather than a page-evaluate round trip
  // later.
  const state = await page.evaluate(() => (window.__vclock
    ? new Promise((done) => {
      window.__vclock.native.raf(() => done(window.__vclock.arm()))
    })
    : null))
  if (!state) {
    throw new Error(
      'window.__vclock is missing — the clock init script never ran.\n' +
      'It is installed with context.addInitScript BEFORE the first navigation; a page ' +
      'opened outside openPage() will not have it.'
    )
  }
  return state
}

/**
 * @param {import('playwright').Page} page
 * @param {number} dtMs
 */
export function stepPageClock(page, dtMs) {
  return page.evaluate((dt) => window.__vclock.step(dt), dtMs)
}

/** @param {import('playwright').Page} page */
export function disarmPageClock(page) {
  return page.evaluate(() => window.__vclock?.disarm() ?? null)
}

/** @param {import('playwright').Page} page */
export function pageClockState(page) {
  return page.evaluate(() => ({
    ...(window.__vclock?.state() ?? {}),
    messages: (window.__vclock?.errors ?? []).slice(0, 10)
  }))
}

// ─── The node-side mirror ───────────────────────────────────────────────────
//
// The scenario's `await ctx.wait(500)` has to mean "half a second of VIDEO",
// not half a second of the recorder's wall time. So node keeps its own copy of
// the same virtual clock, the capture loop advances both together, and a
// waiter resolves the moment the video reaches that timestamp.

/**
 * @typedef {object} NodeClock
 * @property {() => number} now
 * @property {(ms: number) => void} advance
 * @property {(ms: number) => Promise<void>} wait
 * @property {(at: number) => Promise<void>} waitUntil
 * @property {() => number} pending
 * @property {() => Promise<void>} idle
 */

/** @returns {NodeClock} */
export function createNodeClock() {
  let t = 0
  /** @type {{ at: number, resolve: () => void }[]} */
  let waiters = []

  // Same epsilon, same reason as the page-side heap: a waiter parked exactly on
  // a frame boundary must resolve on that frame, not the next one.
  const EPS = 1e-6

  const waitUntil = (at) => {
    if (at <= t + EPS) return Promise.resolve()
    return new Promise((resolve) => {
      waiters.push({ at, resolve })
    })
  }

  return {
    now: () => t,
    advance(ms) {
      t += Math.max(0, ms)
      if (waiters.length === 0) return
      const due = []
      const rest = []
      for (const w of waiters) (w.at <= t + EPS ? due : rest).push(w)
      waiters = rest
      due.sort((a, b) => a.at - b.at)
      for (const w of due) w.resolve()
    },
    wait: (ms) => waitUntil(t + Math.max(0, ms)),
    waitUntil,
    pending: () => waiters.length,
    /** Drain the microtask queue so a just-resolved waiter has actually run. */
    async idle() {
      for (let i = 0; i < 12; i++) await Promise.resolve()
    }
  }
}
