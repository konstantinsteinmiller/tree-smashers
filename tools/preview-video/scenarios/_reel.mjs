/**
 * ─── Showreel scene helpers ─────────────────────────────────────────────────
 *
 * The 12 s showreel (`pnpm preview:reel`, tools/preview-video/showreel.mjs) is
 * five ~2.4 s scenes cut together with ~0.27 s transitions. Each scene is its
 * own recorded clip (format `reel`, 2.8 s) with one job: put ONE signature
 * moment on screen — a lava burn and a kill, a forest heal, an ice glide, a
 * boss splitting — inside its window, every run.
 *
 * A scene is therefore not a match story like the 10 s / 30 s clips. It is a
 * single staged shot:
 *
 *   setup   (real time, unrecorded)  boot on the stage, author HP, PLACE the
 *           blades where the camera needs them, pre-aim the slingshot, freeze
 *   record  (virtual time)           hold the drawn slingshot for `holdMs`,
 *           fire, and let the real physics play the moment out
 *
 * Placement and HP are the staging levers; every collision, burn, heal and
 * split in the clip is the game's own simulation. What the scene expects to
 * happen is asserted in the log (`expect`), because a scene that silently
 * missed its moment looks exactly like one that hit it until someone watches
 * the reel — the log line is the cheap check.
 */

import * as g from './_drive.mjs'

/** Fixture overrides every scene shares. */
const reelSave = (over = {}) =>
  g.saveFixture({
    // The first-launch cutscene gate (src/use/introGate.ts) must never pick a
    // recording profile as a first-timer.
    spinner_intro_seen: '1',
    ...over
  })

/**
 * @param {object} ctx
 * @param {object} o
 * @param {number} o.stage                 campaign stage (decides the arena + roster)
 * @param {number} [o.seed]                gameplay RNG seed
 * @param {{player?: number[], npc?: number[]}} [o.hp]   fractions of max HP
 * @param {{side: 'player'|'npc', index: number, x: number, y: number}[]} [o.place]
 *        blade positions in GAME units (arena is -200..200, +y is down).
 *        Indexes are over the LIVING blades AFTER `hp` is applied.
 * @param {{blade?: number, target?: number, angle?: number, power?: number}} [o.aim]
 *        the pre-drawn slingshot; `target` aims at a living enemy
 * @param {Record<string,string>} [o.save] extra fixture keys
 */
export const stageScene = async (ctx, o) => {
  const { stage, seed = 1337, hp = null, place = [], aim = null, save = {} } = o
  await g.boot(ctx, {
    save: reelSave({
      spinner_campaign_stage: String(stage),
      spinner_player_max_stage: String(stage), ...save
    }), seed, stage
  })
  if (hp) await g.stageHp(ctx, hp)
  for (const p of place) {
    const ok = await ctx.evaluate((a) => window.__smashers.place(a.side, a.index, a.x, a.y), p)
    if (!ok) throw new Error(`reel: could not place ${p.side} ${p.index} — no such living blade`)
  }
  if (aim) {
    const ok = await ctx.evaluate(
      (a) =>
        a.target === undefined || a.target === null
          ? window.__smashers.aim(a.blade ?? 0, a.angle ?? -Math.PI / 2, a.power ?? 1)
          : window.__smashers.aimAtBlade(a.blade ?? 0, 'npc', a.target, a.power ?? 1),
      aim
    )
    if (!ok) throw new Error('reel: could not pre-aim the opening shot')
  }
  // Let the placed board paint once while frozen, so frame 0 shows it.
  await ctx.wait(120)
  const s = await g.snapshot(ctx)
  ctx.log.info(`staged stage ${s.stage}: ${s.alive.player} blue vs ${s.alive.npc} red${ctx.clean ? ' (clean feed)' : ''}`)
  return s
}

/** Count what the border-VFX pool is drawing right now (DEV handle). */
const fxProbe = () => {
  const fx = window.__borderFx
  const c = window.__smashers.snapshot()
  return {
    burns: fx ? fx.burns.filter((b) => b.active).length : -1,
    heals: fx ? fx.heals.filter((h) => h.active).length : -1,
    player: c.alive.player,
    npc: c.alive.npc,
    npcTotal: c.npc.length,
    phase: c.phase
  }
}

/**
 * Play a staged scene: hold the drawn slingshot, fire, roll to the end.
 *
 * While rolling it samples the game every `sampleMs` and keeps the peaks —
 * burns and heals live at once, kills, blades spawned (a split) — and logs one
 * summary line that `expect` checks, warning loudly when the scene's moment
 * did not happen.
 *
 * @param {object} ctx
 * @param {object} [o]
 * @param {number} [o.holdMs]        slingshot hold before the release   (350)
 * @param {boolean} [o.fire]         false = no player shot (the enemy acts)
 * @param {number} [o.sampleMs]      probe cadence, rounded to whole frames (100)
 * @param {{burns?: number, heals?: number, kills?: number, spawned?: number}} [o.expect]
 *        minimum peaks the scene must reach — a miss is a warning in the log
 * @param {number} [o.posterMs]      ms after the release to mark the poster
 */
export const playScene = async (ctx, o = {}) => {
  const { holdMs = 350, fire = true, expect = {}, posterMs = null } = o
  // Sample on whole frames: a wait that is not a frame multiple resolves on
  // the NEXT frame boundary, and at 15 fps (the draft setting) 100 ms waits
  // drifted ~0.8 s over a scene — the loop outlived the capture and the
  // summary line never printed.
  const frameMs = 1000 / ctx.fps
  const sampleMs = Math.max(1, Math.round((o.sampleMs ?? 100) / frameMs)) * frameMs
  const t = g.budget(ctx)
  const first = await ctx.evaluate(fxProbe)
  await g.unfreeze(ctx)
  ctx.beat('open')

  if (fire) {
    if (!(await t.wait(holdMs))) return
    await ctx.evaluate(() => window.__smashers.fire())
    ctx.beat('fire')
  }

  const peak = { burns: 0, heals: 0, kills: 0, spawned: 0 }
  const firstAt = {}
  let elapsed = fire ? holdMs : 0
  let posterMarked = posterMs === null
  // Stop sampling one probe short of the end: the capture loop ends the clip
  // on its last frame and a probe still in flight then would never log.
  while (t.left > 3 * sampleMs) {
    if (!(await t.wait(sampleMs))) break
    elapsed += sampleMs
    const p = await ctx.evaluate(fxProbe)
    const now = {
      burns: p.burns,
      heals: p.heals,
      kills: Math.max(0, first.npc - p.npc) + Math.max(0, first.player - p.player),
      spawned: Math.max(0, p.npcTotal - first.npcTotal)
    }
    for (const k of Object.keys(peak)) {
      if (now[k] > peak[k]) peak[k] = now[k]
      if (now[k] > 0 && firstAt[k] === undefined) {
        firstAt[k] = elapsed
        ctx.beat(k)
      }
    }
    if (!posterMarked && elapsed >= holdMs + posterMs) {
      ctx.beat('poster')
      posterMarked = true
    }
  }

  const at = (k) => (firstAt[k] === undefined ? '-' : `${(firstAt[k] / 1000).toFixed(2)}s`)
  ctx.log.info(
    `  scene peaks: burns ${peak.burns} (first ${at('burns')}), heals ${peak.heals} (first ${at('heals')}), ` +
    `kills ${peak.kills} (first ${at('kills')}), spawned ${peak.spawned} (first ${at('spawned')})`
  )
  for (const [k, min] of Object.entries(expect)) {
    if (peak[k] < min) ctx.log.warn(`  scene MISSED its moment: wanted ${k} >= ${min}, got ${peak[k]}`)
  }
}
