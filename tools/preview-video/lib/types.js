// ─── Shared shapes ──────────────────────────────────────────────────────────
//
// JSDoc typedefs only — there is no runtime code in this file. It exists so
// that every module in the pipeline can say `@param {Variant}` instead of
// re-describing the same object five times, and so an editor can autocomplete
// a scenario's `ctx`.
//
// Import them with `/** @typedef {import('./types.js').Variant} Variant */`.

/**
 * @typedef {object} Logger
 * @property {(msg: string) => void} info   Ordinary progress.
 * @property {(msg: string) => void} step   A new phase — printed with a rule.
 * @property {(msg: string) => void} ok     Something finished correctly.
 * @property {(msg: string) => void} warn
 * @property {(msg: string) => void} error
 * @property {(prefix: string) => Logger} child  A nested logger, prefix appended.
 * @property {(label: string) => () => void} time  Start a stopwatch; call the
 *   returned function to print `label — 1.2 s`.
 */

/**
 * One clip to record: a scenario shot at one orientation.
 *
 * `width`/`height` are OUTPUT pixels — what lands in the mp4. The browser is
 * given `cssWidth`/`cssHeight` at `dpr`, whose product is the output size; a
 * 720x1280 clip at dpr 2 is a 360x640 phone viewport, which is what the game's
 * responsive layout is actually designed for.
 *
 * @typedef {object} Variant
 * @property {string} scenarioId      Names the file: `success`, `fail`.
 * @property {string} scenarioModule  The `scenarios/<module>.mjs` that plays it in this format.
 * @property {string|null} formatId   `null` for a config without `formats`.
 * @property {string} orientationId
 * @property {string} stem            `<scenario>-<format>-<orientation>-<W>x<H>`.
 * @property {number} fps
 * @property {number} durationMs
 * @property {Quality[]} qualities    One encode per entry, all from the same capture.
 * @property {Record<string, string>} urlParams  The format's own.
 * @property {number} width
 * @property {number} height
 * @property {number} dpr
 * @property {number} cssWidth
 * @property {number} cssHeight
 * @property {boolean} isMobile
 * @property {boolean} hasTouch
 */

/**
 * @typedef {object} ResolvedOptions
 * @property {string} repoRoot
 * @property {string|null} url        Explicit `--url`; null means "start our own server".
 * @property {number} port
 * @property {boolean} serve
 * @property {'virtual'|'realtime'} capture
 * @property {boolean} clean          Record a clean feed — see lib/clean.mjs.
 * @property {number|null} seed       Math.random seed; null = unseeded.
 * @property {Record<string, string>} urlParams  From `--url-param`.
 * @property {Format[]} formats       The selected formats.
 * @property {string[]} orientationKeys  Every orientation id any format declares.
 * @property {string} outDir          Absolute.
 * @property {boolean} keepFrames
 * @property {boolean} headed
 * @property {boolean} poster
 * @property {boolean} onlySetup
 * @property {Variant[]} variants
 * @property {string[]} warnings
 */

/** @typedef {'lossless-rgb'|'lossless'|'high'|'balanced'} Quality */

/**
 * A deliverable shape. Every field but `orientations` falls back to the
 * config's top level, then to the built-in default.
 *
 * @typedef {object} Format
 * @property {string|null} id                 The key in `config.formats`; part of every file name.
 * @property {Record<string, Orientation>} orientations
 * @property {number} [durationMs]
 * @property {number} [fps]
 * @property {Quality|Quality[]} [quality]   Several = several files from one capture.
 * @property {Record<string, string>} [scenarios]  scenario id → module, e.g. `{ success: 'success-30s' }`.
 * @property {Record<string, string>} [urlParams]
 */

/**
 * The clean feed: gameplay with no interface and no text on top. See lib/clean.mjs.
 *
 * @typedef {object} CleanConfig
 * @property {boolean} [enabled]              Default for `--clean` / `--no-clean`.
 * @property {string[]} [keep]                DOM that stays visible; everything else in <body> is hidden. Default `['canvas']`.
 * @property {string[]} [hide]                Extra selectors to hide.
 * @property {boolean} [suppressCanvasText]   No-op `fillText`/`strokeText`. Default true.
 * @property {Record<string, string>} [urlParams]  The game's own clean flag, for interface it paints.
 * @property {string} [css]                   Anything else.
 */

/**
 * @typedef {object} Orientation
 * @property {number} width
 * @property {number} height
 * @property {number} [dpr]
 * @property {boolean} [isMobile]
 * @property {boolean} [hasTouch]
 */

/**
 * The game-specific `preview.config.mjs`.
 *
 * @typedef {object} PreviewConfig
 * @property {string} title           `<title>` substring — the port-ownership check.
 * @property {object} [server]        `{ mode, port, command, args, dir, env, readyTimeoutMs }`
 * @property {Record<string, Format>} [formats]      Deliverable shapes; see Format.
 * @property {Record<string, Orientation>} [orientations]  Used when there are no `formats`, and as their fallback.
 * @property {string[]} scenarios
 * @property {number} [fps]
 * @property {number} [durationMs]
 * @property {Quality|Quality[]} [quality]
 * @property {CleanConfig} [clean]
 * @property {number} [seedRandom]
 * @property {string} [outDir]
 * @property {'virtual'|'realtime'} [capture]
 * @property {Record<string, string>} [urlParams]
 * @property {string} [route]         Path + hash appended to the origin, e.g. `/#/`.
 * @property {(ctx: ScenarioCtx) => Promise<void>} [onPageReady]
 */

/**
 * What a scenario module default-exports.
 *
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} [label]
 * @property {Record<string, Partial<Orientation>>} [orientationOverrides]
 * @property {Record<string, string>} [urlParams]
 * @property {(ctx: ScenarioCtx) => Promise<void>} [setup]
 * @property {(ctx: ScenarioCtx) => Promise<void>} [record]
 */

/**
 * The handle a scenario drives the game through. Every method that touches the
 * page is counted in-flight, so the capture loop can wait for the scenario to
 * go quiet before it steps the clock and takes the frame.
 *
 * @typedef {object} ScenarioCtx
 * @property {import('playwright').Page} page
 * @property {import('playwright').CDPSession} cdp
 * @property {Logger} log
 * @property {Variant} variant
 * @property {number} fps
 * @property {number} durationMs
 * @property {{ id: string|null, durationMs: number, fps: number }} format  The deliverable this clip is for.
 * @property {boolean} clean  Recording a clean feed: skip beats that need an interface.
 * @property {'setup'|'record'} phase
 * @property {(ms: number) => Promise<void>} wait   Real sleep in setup; virtual in record.
 * @property {(fn: Function, arg?: unknown, opts?: object) => Promise<unknown>} waitFor
 *   Playwright's `waitForFunction`. REAL time — setup only; throws in record().
 * @property {(fn: Function, opts?: { arg?: unknown, timeoutMs?: number, label?: string }) => Promise<boolean>} stepUntil
 *   Roll the clip forward until `fn` is true in the page, one probe per frame.
 *   The record()-phase replacement for `waitFor`.
 * @property {(fn: Function, arg?: unknown) => Promise<unknown>} evaluate
 * @property {(name: string) => void} beat          Mark this frame under `name`.
 *   `beat('poster')` also chooses the cover PNG (default: frame 0).
 * @property {() => number} frame                   Current frame index.
 * @property {() => Promise<void>} settle           Internal — the capture loop's barrier.
 * @property {PreviewConfig} config
 */

/**
 * @typedef {object} CaptureResult
 * @property {number} frames
 * @property {Record<string, number>} beats
 * @property {string[]} errors
 */

export {}
