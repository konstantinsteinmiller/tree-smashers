// Injected via page.addInitScript — runs before any app code.
//
// Collects, per frame:
//   - work-per-frame  : summed duration of every rAF callback that ran in the
//                       frame (the game has TWO rAF chains — physics and
//                       render — so this is the honest "CPU we spend on the
//                       game", not a single loop's cost).
//   - frame delta     : now - previousNow, i.e. what the player feels.
//   - heap            : usedJSHeapSize, for the allocation-rate slope.
// Plus long tasks (PerformanceObserver) and, optionally, canvas draw calls.
//
// Deliberately free of any hook into game code so the identical probe runs
// against the baseline and every variant branch.
;(() => {
  const q = new URLSearchParams(location.search)

  // ── Deterministic RNG ────────────────────────────────────────────────────
  // Same seed => same spawn jitter, same AI aim, same VFX geometry. Not
  // perfect determinism (render-side Math.random consumers make the stream
  // depend on how many frames we drew) but it removes the largest source of
  // rep-to-rep variance. See MEASURING.md § Determinism.
  const seedParam = q.get('seed')
  if (seedParam) {
    let a = (Number(seedParam) >>> 0) || 1
    Math.random = () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const CAP = 30000
  const work = new Float64Array(CAP)
  const delta = new Float64Array(CAP)
  const heap = new Float64Array(CAP)
  let n = 0

  let curTs = -1
  let curWork = 0
  let prevTs = -1
  let longTasks = 0
  let longTaskMs = 0
  let drawCalls = 0
  let drawCallFrames = 0
  let drawCallTotal = 0

  const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0)

  const closeFrame = () => {
    if (curTs < 0 || n >= CAP) return
    work[n] = curWork
    delta[n] = prevTs < 0 ? 0 : curTs - prevTs
    heap[n] = mem()
    n++
    if (drawCallsOn) {
      drawCallTotal += drawCalls
      drawCallFrames++
      drawCalls = 0
    }
  }

  const rafNative = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) =>
    rafNative((now) => {
      if (now !== curTs) {
        closeFrame()
        prevTs = curTs
        curTs = now
        curWork = 0
      }
      const t0 = performance.now()
      try {
        cb(now)
      } finally {
        curWork += performance.now() - t0
      }
    })

  // ── Draw-call counting (diagnostic only — costs real time, keep it OFF
  //    for the numbers you compare) ────────────────────────────────────────
  const drawCallsOn = q.get('dc') === '1'
  if (drawCallsOn) {
    const P = CanvasRenderingContext2D.prototype
    for (const m of [
      'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
      'fillText', 'strokeText', 'drawImage', 'putImageData'
    ]) {
      const orig = P[m]
      if (typeof orig !== 'function') continue
      P[m] = function(...args) {
        drawCalls++
        return orig.apply(this, args)
      }
    }
  }

  // ── Ablation switches (?abl=…) ───────────────────────────────────────────
  // Pure probe-side no-ops used ONLY to attribute rasterization cost. Each one
  // changes what the game looks like, so these are DIAGNOSTIC VARIANTS, never
  // a shipped fix. Comma-separated: shadow,gradient,canvas,trails.
  const abl = new Set((q.get('abl') || '').split(',').filter(Boolean))
  if (abl.size) {
    const P = CanvasRenderingContext2D.prototype
    if (abl.has('shadow')) {
      const d = Object.getOwnPropertyDescriptor(P, 'shadowBlur')
      Object.defineProperty(P, 'shadowBlur', {
        ...d, set() {
          d.set.call(this, 0)
        }
      })
    }
    if (abl.has('gradient')) {
      P.createRadialGradient = function() {
        return '#203040'
      }
      P.createLinearGradient = function() {
        return '#203040'
      }
    }
    if (abl.has('canvas')) {
      for (const m of ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText',
        'strokeText', 'drawImage', 'putImageData', 'clip']) {
        P[m] = function() {
        }
      }
    }
    if (abl.has('clip')) P.clip = function() {
    }
    if (abl.has('stroke')) P.stroke = function() {
    }
    if (abl.has('fill')) P.fill = function() {
    }
    if (abl.has('drawimage')) P.drawImage = function() {
    }
    if (abl.has('text')) {
      P.fillText = function() {
      }
      P.strokeText = function() {
      }
    }
    if (abl.has('pattern')) P.createPattern = function() {
      return '#0d1117'
    }
    if (abl.has('globalalpha')) {
      const d = Object.getOwnPropertyDescriptor(P, 'globalAlpha')
      Object.defineProperty(P, 'globalAlpha', {
        ...d, set() {
          d.set.call(this, 1)
        }
      })
    }
  }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks++
        longTaskMs += e.duration
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch { /* not supported */
  }

  const pct = (arr, len, p) => {
    if (len === 0) return 0
    const s = Array.prototype.slice.call(arr, 0, len).sort((a, b) => a - b)
    return s[Math.min(len - 1, Math.floor(len * p))]
  }

  // Heap slope = median of the POSITIVE frame-to-frame deltas. Negative
  // deltas are collections; including them would net the allocation rate to
  // ~zero and hide exactly what we are trying to see.
  const heapSlopeKB = () => {
    const ups = []
    for (let i = 1; i < n; i++) {
      const d = heap[i] - heap[i - 1]
      if (d > 0) ups.push(d)
    }
    if (ups.length === 0) return 0
    ups.sort((a, b) => a - b)
    return +(ups[Math.floor(ups.length / 2)] / 1024).toFixed(2)
  }

  window.__perf = {
    reset() {
      n = 0
      curTs = -1
      prevTs = -1
      curWork = 0
      longTasks = 0
      longTaskMs = 0
      drawCalls = 0
      drawCallFrames = 0
      drawCallTotal = 0
    },
    report() {
      const over16 = []
      let o16 = 0
      let o33 = 0
      let o50 = 0
      for (let i = 1; i < n; i++) {
        if (delta[i] > 16.7) o16++
        if (delta[i] > 33.4) o33++
        if (delta[i] > 50) o50++
      }
      void over16
      let sum = 0
      for (let i = 1; i < n; i++) sum += delta[i]
      const secs = sum / 1000
      let wsum = 0
      for (let i = 0; i < n; i++) wsum += work[i]
      return {
        frames: n,
        seconds: +secs.toFixed(1),
        fps: +(n / (secs || 1)).toFixed(1),
        workP50: +pct(work, n, 0.5).toFixed(2),
        workP95: +pct(work, n, 0.95).toFixed(2),
        workP99: +pct(work, n, 0.99).toFixed(2),
        workMean: +(wsum / (n || 1)).toFixed(2),
        deltaP50: +pct(delta, n, 0.5).toFixed(2),
        deltaP95: +pct(delta, n, 0.95).toFixed(2),
        deltaMax: +Math.max.apply(null, Array.prototype.slice.call(delta, 1, n) || [0]).toFixed(2),
        over16Pct: +((o16 / (n || 1)) * 100).toFixed(1),
        over33Pct: +((o33 / (n || 1)) * 100).toFixed(1),
        over50Pct: +((o50 / (n || 1)) * 100).toFixed(1),
        heapSlopeKB: heapSlopeKB(),
        heapPeakMB: +(Math.max.apply(null, Array.prototype.slice.call(heap, 0, n) || [0]) / 1048576).toFixed(1),
        longTasks,
        longTaskMs: +longTaskMs.toFixed(0),
        drawCallsPerFrame: drawCallFrames ? +(drawCallTotal / drawCallFrames).toFixed(0) : null
      }
    }
  }
})()
