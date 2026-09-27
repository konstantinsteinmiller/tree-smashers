/**
 * ─── INTRO: the first-launch cutscene, recorded ─────────────────────────────
 *
 * A REVIEW recording of the in-game intro (src/components/organisms/
 * IntroCutscene.vue) — the cutscene itself is rendered and simulated live in
 * the game; nothing recorded here ships. Output goes wherever `--out` says.
 *
 *   pnpm preview:video --scenarios intro --formats 10s --duration 14.6 \
 *     --no-clean --quality high --out <dir>
 *
 * `--no-clean` is required: the clean feed hides every DOM node but the arena
 * canvas, and the cutscene is its own overlay canvas.
 *
 * SETUP (real time): the runner opened the game on a FRESH profile, so the
 * gate classifies it as a first-timer and the intro starts by itself. Wait for
 * its DEV seam (`window.__intro`), hold its clock and rewind to 0 — the fight
 * track is kept, so rewinding simply re-samples it.
 *
 * RECORD (virtual time): release and let it play. The recorder's virtual clock
 * drives rAF, so every frame advances the cutscene by exactly 1/fps.
 */

export default {
  id: 'intro',
  label: 'first-launch intro cutscene',

  async setup(ctx) {
    await ctx.page.waitForFunction(() => !!window.__intro, null, { timeout: 45_000 })
    await ctx.evaluate(() => {
      window.__intro.hold()
      window.__intro.seek(0)
    })
    // Let the held frame paint once.
    await ctx.wait(250)
  },

  async record(ctx) {
    await ctx.evaluate(() => window.__intro.release())
    ctx.beat('poster')
    await ctx.wait(ctx.durationMs)
  }
}
