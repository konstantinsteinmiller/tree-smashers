#!/usr/bin/env node
// ─── Gameplay preview video pipeline ────────────────────────────────────────
//
//   node tools/preview-video/record.mjs            # everything in the config
//   node tools/preview-video/record.mjs --help
//
// Records scripted gameplay out of the REAL game — the dev server, the real
// renderer, the real save state — into one mp4 per scenario, per orientation,
// per FORMAT (a deliverable shape: duration, sizes, fps). A config with a 10 s
// preview format and a 30 s trailer format, and a fail and a success scenario,
// yields eight clips from one command; ask for several qualities and each clip
// is encoded several times from the one capture.
//
// With `--clean` (or `clean.enabled` in the config) every clip is a CLEAN
// feed: no DOM interface, no canvas text, and the game's own clean flag for the
// interface it paints — see lib/clean.mjs.
//
// The pieces:
//   preview.config.mjs   what to shoot and how big              (game-specific)
//   scenarios/*.mjs      the beats of each clip                 (game-specific)
//   lib/clock.mjs        the virtual clock that makes it smooth (generic)
//   lib/capture.mjs      the frame loop                         (generic)
//   lib/encode.mjs       frames → mp4                           (generic)
//
// A game adopting this pipeline rewrites the first two and touches nothing else.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

import { parseArgs, printHelp, stemFor, wantsHelp, REPO_ROOT } from './lib/args.mjs'
import { bytes, createLogger } from './lib/log.mjs'
import { assertOwnServer, startServer } from './lib/server.mjs'
import { launchBrowser, openPage } from './lib/browser.mjs'
import { CLOCK_SOURCE, armPageClock, createNodeClock, pageClockState } from './lib/clock.mjs'
import { randomSeedSource } from './lib/determinism.mjs'
import { cleanFeedScripts } from './lib/clean.mjs'
import { captureScenario } from './lib/capture.mjs'
import { QUALITY_NOTES, createEncoder, probe } from './lib/encode.mjs'

const HERE = resolve(REPO_ROOT, 'tools', 'preview-video')

// ─── Loading the game-specific half ─────────────────────────────────────────

async function loadConfig(log) {
  const file = join(HERE, 'preview.config.mjs')
  if (!existsSync(file)) {
    throw new Error(
      `Missing ${relative(REPO_ROOT, file)}.\n` +
      'That file is the game-specific half of the pipeline: which orientations to\n' +
      'shoot, how long, and which scenarios exist. See CONTRACT.md for its shape.'
    )
  }
  const mod = await import(pathToFileURL(file).href)
  const config = mod.default ?? mod.config
  if (!config) throw new Error(`${relative(REPO_ROOT, file)} has no default export.`)
  log.ok(`config: ${config.title ?? '(untitled)'}`)
  return config
}

async function loadScenario(id) {
  const file = join(HERE, 'scenarios', `${id}.mjs`)
  if (!existsSync(file)) {
    throw new Error(
      `Missing scenario "${id}" (${relative(REPO_ROOT, file)}).\n` +
      'A scenario exports { id, label?, setup(ctx), record(ctx) } — see CONTRACT.md.'
    )
  }
  const mod = await import(pathToFileURL(file).href)
  const scenario = mod.default ?? mod.scenario
  if (!scenario) throw new Error(`${relative(REPO_ROOT, file)} has no default export.`)
  return { ...scenario, id: scenario.id ?? id }
}

// ─── The scenario handle ────────────────────────────────────────────────────
//
// Everything a scenario touches the page through is COUNTED, so the capture
// loop can wait for the scenario to go quiet before it steps the clock. Without
// that barrier a placement issued on frame 40 might land on frame 41 or 45
// depending on how busy the machine was — which is precisely the
// non-determinism the virtual clock exists to remove.

export function createCtx({ page, cdp, log, variant, fps, durationMs, clock, config, mode, clean = false }) {
  let inflight = 0
  /** @type {(() => void)[]} */
  let idleWaiters = []
  let frame = 0
  let phase = /** @type {'setup'|'record'} */ ('setup')
  /** @type {Record<string, number>} */
  const beats = {}

  const track = async (work) => {
    inflight++
    try {
      return await work()
    } finally {
      inflight--
      if (inflight === 0) {
        const waiting = idleWaiters
        idleWaiters = []
        for (const r of waiting) r()
      }
    }
  }

  const ctx = {
    page,
    cdp,
    log,
    variant,
    fps,
    durationMs,
    config,
    /**
     * The deliverable this clip belongs to. A scenario that plays differently
     * at 30 s than at 10 s branches on this (or a format maps the scenario to
     * a different module altogether — `formats[id].scenarios`).
     */
    format: { id: variant.formatId ?? null, durationMs, fps },
    /**
     * True when recording a CLEAN feed: no interface, no text. The recorder
     * has already hidden the DOM and the canvas text; a scenario reads this to
     * skip beats that only work with an interface — a result screen it would
     * wait on, a banner it would time a cut to.
     */
    clean,
    get phase() {
      return phase
    },

    /** Real seconds in setup; seconds of VIDEO once recording. */
    wait: (ms) => (phase === 'record' && mode === 'virtual' ? clock.wait(ms) : sleep(ms)),

    evaluate: (fn, arg) => track(() => page.evaluate(fn, arg)),

    /**
     * Playwright's own `waitForFunction` — REAL time, setup only.
     *
     * It cannot be used once recording starts. Playwright polls the predicate
     * with the page's own rAF or setTimeout, and the virtual clock has taken
     * both over: the poll waits for a clock that is waiting for the scenario to
     * go quiet, and the clip freezes on one frame. `stepUntil` is the version
     * that works there.
     */
    waitFor: (fn, arg, opts = {}) => track(async () => {
      if (phase === 'record' && mode === 'virtual') {
        throw new Error('waitFor is real-time only — use ctx.stepUntil(fn, opts) inside record().')
      }
      return page.waitForFunction(fn, arg, { timeout: 20_000, ...opts })
    }),

    /**
     * Roll the clip forward until `fn` is true in the page, sampling once per
     * recorded frame — the only rate that means anything in a video anyway.
     * Gives up after `timeoutMs` of VIDEO with a warning rather than throwing:
     * a clip that ran past its cue is still a clip.
     */
    // NOT wrapped in `track`: only the individual probes are in flight. Holding
    // the in-flight count across the `wait` between them would park the capture
    // loop's barrier on a clock that only the capture loop can advance.
    async stepUntil(fn, opts = {}) {
      const budgetMs = opts.timeoutMs ?? 3000
      // The deadline is on the clock that is actually moving: VIDEO time while
      // recording on the virtual clock, wall time otherwise — the node clock
      // only advances inside the capture loop, so in setup (or realtime
      // capture) a deadline on it would never arrive.
      const virtual = () => phase === 'record' && mode === 'virtual'
      const now = () => (virtual() ? clock.now() : Date.now())
      const deadline = now() + budgetMs
      const tick = () => (virtual() ? clock.wait(1000 / fps) : sleep(1000 / fps))
      while (now() < deadline) {
        if (await track(() => page.evaluate(fn, opts.arg))) return true
        await tick()
      }
      log.warn(`stepUntil gave up after ${budgetMs} ms of video${opts.label ? ` (${opts.label})` : ''}`)
      return false
    },

    /** Mark this frame. `beat('poster')` also chooses the cover image. */
    beat: (name) => {
      beats[name] = frame
    },
    frame: () => frame,

    /** The capture loop's barrier: no page work in flight, microtasks drained. */
    async settle() {
      for (let guard = 0; guard < 200; guard++) {
        for (let i = 0; i < 12; i++) await Promise.resolve()
        if (inflight === 0) return
        await new Promise((r) => idleWaiters.push(r))
      }
      log.warn('settle() gave up waiting for the scenario to go quiet')
    },

    // Internal surface for the capture loop.
    __beats: beats,
    __setFrame: (i) => {
      frame = i
    },
    __setPhase: (p) => {
      phase = p
    }
  }
  return ctx
}

// ─── One clip ───────────────────────────────────────────────────────────────

async function recordVariant({ browser, variant, scenario, config, opts, baseUrl, log }) {
  const stem = variant.stem
  const clipLog = log.child(stem)
  const { fps, durationMs, qualities } = variant

  // URL params, weakest first: the config, the format, the clean feed's own
  // flag, the scenario, then `--url-param` over all of it.
  const target = new URL(config.route ?? '/', baseUrl)
  const params = {
    ...(config.urlParams ?? {}),
    ...(variant.urlParams ?? {}),
    ...(opts.clean ? (config.clean?.urlParams ?? {}) : {}),
    ...(scenario.urlParams ?? {}),
    ...(opts.urlParams ?? {})
  }
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, String(v))

  /** @type {string[]} */
  const consoleErrors = []
  const { page, cdp, close } = await openPage(browser, {
    variant,
    url: target.href,
    // The clock pins WHEN each frame is sampled; the seed pins WHAT is drawn in
    // it. A game with particle work needs both to record the same clip twice.
    // The clean feed goes in at document start too, so no word is ever baked
    // into a sprite cache and no HUD is ever on screen for a single frame.
    initScripts: [
      ...(opts.seed === null ? [] : [randomSeedSource(opts.seed)]),
      ...(opts.clean ? cleanFeedScripts(config.clean) : []),
      ...(opts.capture === 'virtual' ? [CLOCK_SOURCE] : [])
    ],
    onConsole: (msg) => consoleErrors.push(msg),
    log: clipLog,
    // Hot reload off for the recording page (see openPage) unless the config
    // explicitly wants the page to follow edits — useful while authoring with
    // `--only-setup --headed`, never during a take.
    muteSocketsTo: config.server?.hotReload === true ? null : baseUrl
  })

  const clock = createNodeClock()
  const ctx = createCtx({
    page, cdp, log: clipLog, variant, fps, durationMs,
    clock, config, mode: opts.capture, clean: opts.clean
  })

  try {
    if (config.onPageReady) await config.onPageReady(ctx)
    if (scenario.setup) {
      const done = clipLog.time('setup')
      await scenario.setup(ctx)
      done()
    }

    if (opts.onlySetup) {
      mkdirSync(opts.outDir, { recursive: true })
      const shot = join(opts.outDir, `${stem}-setup.png`)
      writeFileSync(shot, await page.screenshot({ type: 'png' }))
      clipLog.ok(`setup frame → ${relative(REPO_ROOT, shot)}`)
      return { stem, skipped: true, consoleErrors }
    }

    if (opts.capture === 'virtual') await armPageClock(page)

    // One capture, as many encodes as qualities were asked for. Capturing is
    // the expensive half (a second of wall time per frame is normal), so a
    // lossless master and an upload copy come out of the SAME frames rather
    // than two runs — which also makes them the same clip to the pixel. With
    // more than one quality each gets its own folder, so every folder is a
    // complete, uniformly named delivery set.
    const outputs = []
    for (const quality of qualities) {
      const dir = qualities.length > 1 ? join(opts.outDir, quality) : opts.outDir
      mkdirSync(dir, { recursive: true })
      const outFile = join(dir, `${stem}.mp4`)
      outputs.push({ quality, dir, outFile, encoder: await createEncoder({ outFile, fps, quality, log: clipLog }) })
    }

    const framesDir = opts.keepFrames ? join(opts.outDir, 'frames', stem) : null
    if (framesDir) mkdirSync(framesDir, { recursive: true })

    // The poster is FRAME 0 unless the scenario says otherwise: CrazyGames
    // requires the static cover to be the clip's opening frame, so a scenario
    // that opens on its money shot gets the right cover for free. A
    // `ctx.beat('poster')` anywhere overrides it (`hero` is accepted as an
    // older alias).
    let posterBuf = null
    let posterFrame = 0

    const done = clipLog.time(`capture ${durationMs / 1000} s @ ${fps} fps`)
    const result = await captureScenario({
      page, cdp, variant, mode: opts.capture, fps, durationMs,
      scenario, ctx, clock, log: clipLog,
      onFrame: async (png, i) => {
        const marked = ctx.__beats.poster ?? ctx.__beats.hero
        if (marked !== undefined && marked === i) {
          posterBuf = png
          posterFrame = i
        } else if (i === 0 && !posterBuf) posterBuf = png
        if (framesDir) writeFileSync(join(framesDir, `frame-${String(i).padStart(5, '0')}.png`), png)
        await Promise.all(outputs.map((o) => o.encoder.write(png)))
      }
    })
    done()

    for (const o of outputs) {
      o.size = (await o.encoder.finish()).bytes
      o.info = await probe(o.outFile)
      if (opts.poster && posterBuf) writeFileSync(join(o.dir, `${stem}.png`), posterBuf)
    }
    if (opts.poster && posterBuf) clipLog.info(`poster: frame ${posterFrame}`)

    if (opts.capture === 'virtual') {
      const state = await pageClockState(page)
      if (state.errors) clipLog.warn(`page clock caught ${state.errors} error(s): ${state.messages.join(' | ')}`)
      if (state.rafs === 0) clipLog.warn('the page had no rAF callback queued at the end — was anything animating?')
    }
    for (const err of result.errors) clipLog.error(err)

    return {
      stem, variant, consoleErrors,
      outputs: outputs.map(({ quality, outFile, size, info }) => ({ quality, outFile, size, info })),
      frames: result.frames, beats: result.beats, errors: result.errors
    }
  } finally {
    await close()
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  if (wantsHelp(argv)) {
    printHelp()
    return 0
  }

  const log = createLogger('preview')
  const config = await loadConfig(log)
  const opts = parseArgs(argv, config)
  for (const w of opts.warnings ?? []) log.warn(w)

  // Keyed by MODULE, not scenario id: a format may play "success" with a
  // longer beat sheet (`formats['30s'].scenarios.success = 'success-30s'`).
  const scenarios = new Map()
  for (const mod of new Set(opts.variants.map((v) => v.scenarioModule))) {
    scenarios.set(mod, await loadScenario(mod))
  }

  // A scenario may want a different frame for itself — a fail clip shot taller,
  // say. A shallow merge of TWEAKS over an orientation the config already
  // declares; it cannot introduce a new orientation, because nothing downstream
  // would know to shoot it. Applied here rather than in args.mjs because the
  // scenario modules are only loaded once the variants are known.
  const declaredOrientations = new Set(opts.orientationKeys)
  for (const [id, scenario] of scenarios) {
    for (const key of Object.keys(scenario.orientationOverrides ?? {})) {
      if (!declaredOrientations.has(key)) {
        log.warn(`scenario "${id}" overrides unknown orientation "${key}" — ignored`)
      }
    }
  }
  for (const variant of opts.variants) {
    const over = scenarios.get(variant.scenarioModule).orientationOverrides?.[variant.orientationId]
    if (!over) continue
    for (const [k, v] of Object.entries(over)) {
      if (v !== undefined) variant[k] = v
    }
    variant.cssWidth = Math.round(variant.width / variant.dpr)
    variant.cssHeight = Math.round(variant.height / variant.dpr)
    // The stem carries WxH — an override that resizes must rename the file too.
    variant.stem = stemFor(variant)
  }

  log.step('plan')
  log.info(`${opts.variants.length} clip(s), capture=${opts.capture}, ${opts.clean ? 'CLEAN feed (no interface, no text)' : 'with interface'}`)
  for (const v of opts.variants) {
    log.info(
      `  ${v.stem} — ${v.durationMs / 1000} s @ ${v.fps} fps, ${v.qualities.join(' + ')}, ` +
      `viewport ${v.cssWidth}x${v.cssHeight} @ ${v.dpr}x${v.scenarioModule !== v.scenarioId ? `, plays ${v.scenarioModule}` : ''}`
    )
  }
  for (const q of new Set(opts.variants.flatMap((v) => v.qualities))) {
    if (QUALITY_NOTES[q]) log.warn(QUALITY_NOTES[q])
  }

  let server = {
    url: opts.url, stop: async () => {
    }, kind: 'external'
  }
  if (opts.serve) {
    log.step('server')
    server = await startServer({
      repoRoot: REPO_ROOT,
      port: opts.port,
      mode: config.server?.mode ?? 'dev',
      command: config.server?.command,
      args: config.server?.args,
      dir: config.server?.dir,
      env: config.server?.env,
      readyTimeoutMs: config.server?.readyTimeoutMs,
      log
    })
  }
  await assertOwnServer({ url: server.url, expectTitle: config.title, log })

  mkdirSync(opts.outDir, { recursive: true })
  const { browser, close: closeBrowser } = await launchBrowser({ headed: opts.headed, log })

  const results = []
  let failures = 0
  try {
    for (const variant of opts.variants) {
      log.step(variant.stem)
      try {
        results.push(await recordVariant({
          browser, variant, scenario: scenarios.get(variant.scenarioModule),
          config, opts, baseUrl: server.url, log
        }))
      } catch (err) {
        failures++
        log.error(`${variant.stem} failed: ${err.stack ?? err.message}`)
      }
    }
  } finally {
    await closeBrowser()
    await server.stop()
  }

  log.step('results')
  for (const r of results) {
    if (r.skipped) {
      log.info(`${r.stem}: setup frame only`)
      continue
    }
    for (const o of r.outputs) {
      const i = o.info
      log.ok(
        `${relative(opts.outDir, o.outFile).replace(/\\/g, '/')} — ${i.width}x${i.height} ${i.pixFmt ?? '?'} ` +
        `${i.durationSec?.toFixed(1) ?? '?'} s, ${r.frames} frames, ${bytes(o.size)}`
      )
    }
    const beatList = Object.entries(r.beats)
    if (beatList.length) log.info(`   beats: ${beatList.map(([k, v]) => `${k}@${(v / r.variant.fps).toFixed(1)}s`).join(', ')}`)
    const real = r.consoleErrors.filter((e) => !/favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_|CORS policy/.test(e))
    if (real.length) log.warn(`   ${real.length} console error(s): ${real.slice(0, 3).join(' | ')}`)
  }
  log.info(`\noutput: ${relative(REPO_ROOT, opts.outDir)}`)
  return failures === 0 && results.length > 0 ? 0 : 1
}

// Only when run as the CLI — `createCtx` is importable for tests and for a game
// that wants to drive the capture loop from its own script.
const runDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (runDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      console.error(`\n✗ ${err.stack ?? err.message}\n`)
      process.exitCode = 1
    })
}
