/**
 * ─── Chaos Arena preview-video configuration ────────────────────────────────
 *
 *   pnpm preview:video                          # all eight clips, both qualities
 *   pnpm preview:video --formats 30s            # just the 30 s 1080p pair
 *   pnpm preview:video --scenarios success      # one scenario, every format
 *   pnpm preview:video --no-clean               # with the HUD on
 *   pnpm preview:video --url-param rings=1      # clean, but keep the HP rings
 *   pnpm preview:video --only-setup             # stop on the opening frame
 *                                               #   (the scenario-authoring loop)
 *
 * Output, one folder per quality — each a complete, uniformly named set:
 *
 *   preview-videos/lossless/<scenario>-<format>-<orientation>-<W>x<H>.mp4 (+ .png poster)
 *   preview-videos/high/…     the same clips as upload-ready H.264 4:2:0
 */

export default {
  // `index.html`'s <title>. The port-ownership check refuses to record if
  // something else is already answering on the port — this repo has eleven
  // build targets and a habit of leaving dev servers running.
  title: 'Chaos Arena',

  // The DEV server, not a production build: `window.__chaos` and the
  // clean-feed flag are both `import.meta.env.DEV` only (see
  // `src/utils/previewSeam.ts` and `src/utils/cleanFeed.ts`), and the
  // scenarios are written against them.
  //
  // Port 2087 is this pipeline's own, and it is deliberately NOT the skill's
  // default 2063: on this machine 2063 and 2071 are both already answering
  // with OTHER games' dev servers. That is the exact failure `title` above
  // exists to catch — a stale server from another project serves a recording
  // request perfectly happily, and you find out by watching thirty seconds of
  // somebody else's game. `pnpm dev` takes Vite's default 5173.
  // `{port}` follows `--port`.
  server: {
    mode: 'dev',
    port: 2087,
    command: 'pnpm',
    args: ['exec', 'vite', '--port', '{port}', '--strictPort'],
    // The recording page never hears HMR. This project has art and locale
    // files written by other tooling; a hot update mid-take remounts
    // SpinnerArena, which drops `window.__chaos` and kills the run.
    hotReload: false
  },

  // ── The deliverables ──
  //
  //   10s — the portal preview pair (CrazyGames-style 720p).
  //   30s — the 1080p trailer pair, on its own beat sheets.
  //
  // ── WHY EVERY dpr HERE IS 1 ──
  //
  // This renderer does NOT scale its canvas by devicePixelRatio. SpinnerArena
  // sets `canvas.width = window.innerWidth` verbatim (1:1 CSS pixels, no
  // backing-store multiplier anywhere in src/ — `grep devicePixelRatio` finds
  // one hit, and it is RouletteWheel, a different canvas).
  //
  // So a dpr of 2 would give the game a 540x960 CSS viewport, a 540x960
  // canvas, and a screenshot that Chrome upscales 2x to 1080x1920 — a soft
  // 1080p, the DPR-cap trap arriving from the opposite direction. dpr 1 makes
  // the CSS viewport, the canvas and the output all the same size.
  //
  // The composition does not care: the arena is a fixed
  // -ARENA_RADIUS..+ARENA_RADIUS box scaled to `min(w, h)` every frame, so it
  // fills the short side at any viewport. The only size-dependent layout in
  // the game is the DOM HUD, which a clean feed hides anyway.
  formats: {
    '10s': {
      durationMs: 10_000,
      orientations: {
        portrait: { width: 720, height: 1280, dpr: 1, isMobile: true, hasTouch: true },
        landscape: { width: 1280, height: 720, dpr: 1, isMobile: false, hasTouch: false }
      }
    },
    // A 30 s clip is a different STORY, not a longer one — six exchanges with
    // an escalation, against the 10 s pair's single payoff.
    '30s': {
      durationMs: 30_000,
      orientations: {
        portrait: { width: 1080, height: 1920, dpr: 1, isMobile: true, hasTouch: true },
        landscape: { width: 1920, height: 1080, dpr: 1, isMobile: false, hasTouch: false }
      },
      scenarios: { success: 'success-30s', fail: 'fail-30s' }
    }
    // Portal shapes are formats too — see the skill's reference/portal-specs.md.
    // CrazyGames portrait is 2:3 (1080x1620), NOT 9:16:
    // crazygames: { durationMs: 16_000, quality: 'high', orientations: {
    //   landscape: { width: 1920, height: 1080, dpr: 1 },
    //   portrait:  { width: 1080, height: 1620, dpr: 1 } } },
  },

  scenarios: ['success', 'fail'],

  fps: 30,

  //   lossless — the master. 4:4:4, so Safari/QuickTime and many upload
  //              validators reject it. Archive only.
  //   high     — CRF 14, yuv420p: this is the "MP4 · H.264" you upload.
  quality: ['lossless', 'high'],
  outDir: 'preview-videos',

  capture: 'virtual',

  // Pins WHAT is drawn, where the virtual clock pins WHEN it is sampled.
  // Load-bearing here: the meteor-shower intro alone spawns 80 particles off
  // `Math.random`, and every impact throws sparks. Unseeded, two takes of the
  // same script look visibly different.
  //
  // NOTE this does NOT cover the gameplay RNG — `useDeterministicRng`'s
  // mulberry32 is separate and `initGame` re-seeds it randomly on every
  // non-PvP match. The scenarios pin that themselves via `__chaos.seed()`,
  // AFTER the match is built. Both are needed.
  seedRandom: 7,

  // ── Pure gameplay ──
  clean: {
    enabled: true,
    // NAME the arena canvas. `'canvas'` would also keep the joystick overlay,
    // which is a separate full-screen canvas holding a control.
    keep: ['canvas.game-canvas'],
    // Kills the damage numbers' digits, the HP digit inside each ring, the
    // ⚔ATK/🛡DEF boss label and the powerup names. The game has no font-glyph
    // pieces, so there is nothing legitimate to lose.
    suppressCanvasText: true,
    urlParams: {
      // src/utils/cleanFeed.ts — the interface the RENDERER paints and no
      // recorder-side lever can reach: HP ring arcs, the selection glow, the
      // hint pulse and the early-stage tutorial arrows.
      //
      // Add `rings: '1'` here (or pass `--url-param rings=1`) to put the HP
      // rings back for a portal whose spec is looser than "no counters".
      clean: '1'
    }
  },

  // The one adaptive thing in this game is the quality tier
  // (`useQuality.ts`), and it is pinned in the SAVE FIXTURE rather than here
  // — it reads `chaosarena_quality_pref` from localStorage, not the URL.
  // See `scenarios/_drive.mjs`. It matters: the detector measures a
  // WALL-CLOCK window, and the whole of `setup()` runs in real time on a
  // machine that is also launching Chrome and a Vite dev server. Left on
  // 'auto' it can latch `FX.low` before the first recorded frame and quietly
  // halve the particle density of one take out of five.
  urlParams: {},

  async onPageReady(_ctx) {
  }
}
