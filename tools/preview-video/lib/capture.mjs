// ─── The frame loop ─────────────────────────────────────────────────────────
//
// Two ways to get frames out of a page, and they are not equal.
//
// VIRTUAL (the default) owns time: advance the node clock so the scenario's
// pending `wait` resolves and it acts, let it go quiet, step the page clock by
// exactly one frame, screenshot. The output is frame-exact and identical run to
// run, and the recorder's own slowness is invisible. Use this unless something
// in the page refuses to be shimmed.
//
// REALTIME is the fallback for a page the clock shim breaks: a CDP screencast
// running at whatever rate the page manages, resampled onto a constant grid
// afterwards. It is honest about what the machine produced, which means a slow
// machine produces a stuttery clip.

import { stepPageClock } from './clock.mjs'

/** @typedef {import('./types.js').CaptureResult} CaptureResult */

/**
 * @param {object} o
 * @param {import('playwright').Page} o.page
 * @param {import('playwright').CDPSession} o.cdp
 * @param {'virtual'|'realtime'} o.mode
 * @param {import('./types.js').Variant} o.variant  realtime mode sizes the screencast from this
 * @param {number} o.fps
 * @param {number} o.durationMs
 * @param {import('./types.js').Scenario} o.scenario
 * @param {import('./types.js').ScenarioCtx} o.ctx
 * @param {import('./clock.mjs').NodeClock} o.clock
 * @param {(png: Buffer, index: number) => void|Promise<void>} o.onFrame
 * @param {import('./types.js').Logger} [o.log]
 * @returns {Promise<CaptureResult>}
 */
export async function captureScenario(o) {
  return o.mode === 'realtime' ? captureRealtime(o) : captureVirtual(o)
}

/**
 * Start `scenario.record` as a floating promise and never let it take the run
 * down with it: a scenario that throws halfway still leaves us the frames it
 * did script, which beats no clip at all when you are iterating on beats.
 */
function startRecordScript(scenario, ctx, errors) {
  let done = false
  const promise = Promise.resolve()
    .then(() => (scenario.record ? scenario.record(ctx) : undefined))
    .catch((err) => {
      errors.push(`record(): ${err?.stack ?? err}`)
    })
    .finally(() => {
      done = true
    })
  return { promise, isDone: () => done }
}

/**
 * One frame as a PNG at the variant's OUTPUT size.
 *
 * Raw CDP with `optimizeForSpeed`, not Playwright's `page.screenshot`:
 * measured at 1080x1920 on the real game, 158 ms a frame against 754 ms — for a
 * 900-frame clip, 2½ minutes of screenshots instead of 11. The pixels are the
 * same: PNG is lossless at any zlib effort, the file is just bigger on the pipe.
 * The clip is given in CSS px with `scale: dpr`; without it CDP hands back the
 * CSS-pixel size, a quarter of the frame at dpr 2. If the protocol ever refuses
 * the options, fall back to Playwright for the rest of the clip.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').CDPSession} cdp
 * @param {import('./types.js').Variant} variant
 * @param {import('./types.js').Logger} [log]
 * @returns {() => Promise<Buffer>}
 */
export function frameGrabber(page, cdp, variant, log) {
  let fast = !!cdp && !!variant?.cssWidth
  const clip = fast ? { x: 0, y: 0, width: variant.cssWidth, height: variant.cssHeight, scale: variant.dpr } : null
  return async () => {
    if (fast) {
      try {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip })
        return Buffer.from(data, 'base64')
      } catch (err) {
        fast = false
        log?.warn(`fast screenshot path refused (${err?.message ?? err}) — falling back to page.screenshot`)
      }
    }
    return page.screenshot({ type: 'png', animations: 'allow', caret: 'hide' })
  }
}

async function captureVirtual({ page, cdp, variant, fps, durationMs, scenario, ctx, clock, onFrame, log }) {
  const total = Math.max(1, Math.round((durationMs / 1000) * fps))
  const dt = 1000 / fps
  const grab = frameGrabber(page, cdp, variant, log)
  /** @type {string[]} */
  const errors = []

  ctx.__setPhase('record')
  ctx.__setFrame(0)
  const script = startRecordScript(scenario, ctx, errors)
  // Let the scenario run its first synchronous burst before time starts moving,
  // so a beat marked at the top of `record()` lands on frame 0.
  await ctx.settle()

  let slowFrames = 0
  for (let i = 0; i < total; i++) {
    ctx.__setFrame(i)
    const frameStart = Date.now()

    // Frame i shows video time i x dt — so frame 0 is the state the setup left
    // behind, and the clock only moves BETWEEN frames. Stepping before the
    // first shot instead would put every frame one tick ahead of its own
    // timestamp, and `ctx.wait(500)` would land on frame 14 of a 30 fps clip.
    if (i > 0) {
      clock.advance(dt)
      await clock.idle()
      await ctx.settle()
      await stepPageClock(page, dt)
    } else {
      await ctx.settle()
    }

    const png = await grab()
    await onFrame(png, i)

    if (Date.now() - frameStart > 500) slowFrames++
    if (log && i > 0 && i % Math.max(1, Math.floor(total / 5)) === 0) {
      log.info(`  ${i}/${total} frames`)
    }
  }

  // The scenario may still be parked on a `wait` past the end of the clip;
  // shove the clock forward so it unwinds instead of hanging the run.
  if (!script.isDone()) {
    clock.advance(durationMs * 2)
    await Promise.race([script.promise, new Promise((r) => setTimeout(r, 5000))])
  }
  if (slowFrames) log?.warn(`${slowFrames} frames took over 500 ms to capture (the clip is unaffected — only the wait was)`)

  return { frames: total, beats: { ...ctx.__beats }, errors }
}

// ─── Realtime ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function captureRealtime({ page, cdp, fps, durationMs, variant, scenario, ctx, onFrame, log }) {
  const total = Math.max(1, Math.round((durationMs / 1000) * fps))
  /** @type {string[]} */
  const errors = []
  /** @type {{ buf: Buffer, t: number }[]} */
  const raw = []

  cdp.on('Page.screencastFrame', async (frame) => {
    raw.push({
      buf: Buffer.from(frame.data, 'base64'),
      t: frame.metadata?.timestamp ?? Date.now() / 1000
    })
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
    } catch { /* stopped */
    }
  })

  await cdp.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    maxWidth: variant?.width ?? 1920,
    maxHeight: variant?.height ?? 1920
  })

  ctx.__setPhase('record')
  const script = startRecordScript(scenario, ctx, errors)
  const started = Date.now()
  await Promise.race([script.promise, sleep(durationMs)])
  const remaining = durationMs - (Date.now() - started)
  if (remaining > 0) await sleep(remaining)

  try {
    await cdp.send('Page.stopScreencast')
  } catch { /* already stopped */
  }
  await sleep(150) // let the last acked frames land

  if (raw.length === 0) {
    errors.push('the screencast produced no frames')
    return { frames: 0, beats: { ...ctx.__beats }, errors }
  }
  log?.info(`screencast produced ${raw.length} frames for ${total} slots (${(raw.length / (durationMs / 1000)).toFixed(1)} fps)`)

  // Resample onto a constant grid: the frame the page was showing AT each grid
  // time. Fewer page frames than slots means duplicates, which is a held frame
  // rather than a skipped one — the lesser of the two evils on playback.
  const t0 = raw[0].t
  let cursor = 0
  for (let i = 0; i < total; i++) {
    const want = t0 + i / fps
    while (cursor + 1 < raw.length && raw[cursor + 1].t <= want) cursor++
    await onFrame(await normalize(raw[cursor].buf, variant), i)
  }

  return { frames: total, beats: { ...ctx.__beats }, errors }
}

/**
 * A screencast frame is not guaranteed to come back at the size you asked for,
 * and ffmpeg's image2pipe demuxer refuses a stream whose frames change size.
 * Only pay for sharp when a frame actually disagrees.
 */
let sharpMod

async function normalize(buf, variant) {
  if (!variant) return buf
  const size = pngSize(buf)
  if (!size || (size.width === variant.width && size.height === variant.height)) return buf
  sharpMod ??= (await import('sharp')).default
  return sharpMod(buf).resize(variant.width, variant.height, { fit: 'fill' }).png().toBuffer()
}

/** Width/height straight out of the PNG IHDR chunk — cheaper than decoding. */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
