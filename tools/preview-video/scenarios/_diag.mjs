/** Diagnostic scenario (underscore = never auto-loaded as a deliverable).
 *  Fires one shot and logs the phase every 250 ms of VIRTUAL time, so a beat
 *  sheet's pacing can be written against what the clock actually does rather
 *  than against real-time probe numbers.
 *
 *      pnpm preview:video --formats 10s --scenarios _diag \
 *        --orientations portrait --quality balanced --url http://localhost:2087
 */
import * as g from './_drive.mjs'

export default {
  id: '_diag',
  label: 'phase timeline under the virtual clock',

  async setup(ctx) {
    await g.boot(ctx, { save: g.saveFixture(), seed: 1337, stage: 17 })
    await g.stageHp(ctx, { npc: [0.07, 1, 1] })
    await ctx.evaluate(() => window.__smashers.aimAtBlade(0, 'npc', 0, 1))
  },

  async record(ctx) {
    const t = g.budget(ctx)
    await g.unfreeze(ctx)
    await t.wait(800)
    await ctx.evaluate(() => window.__smashers.fire())
    let elapsed = 800
    let last = ''
    while (elapsed < ctx.durationMs - 250) {
      if (!(await t.wait(250))) break
      elapsed += 250
      const s = await ctx.evaluate(() => window.__smashers.snapshot())
      const tag = `${s.phase} P${s.alive.player} N${s.alive.npc} ${s.result ?? ''}`
      if (tag !== last) {
        ctx.log.info(`  t=${(elapsed / 1000).toFixed(2)}s  ${tag}`)
        last = tag
      }
    }
  }
}
