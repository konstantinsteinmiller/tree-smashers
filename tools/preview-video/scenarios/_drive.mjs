/**
 * ─── Chaos Arena: everything the preview recorder knows about THIS game ─────
 *
 * The scenario modules are pure beat sheets. How to boot the game, how to
 * freeze it, how to stage a stage, how to aim a slingshot and how to author a
 * verdict all live here, so porting the pipeline to the next game is "rewrite
 * this one file plus the beat sheets".
 *
 * ── The seam ──
 *
 *   window.__chaos   src/utils/previewSeam.ts, installed by SpinnerArena.vue
 *
 * `import.meta.env.DEV` ONLY, and dynamically imported inside that guard, so
 * it is absent from every portal build. That is why the pipeline records
 * against the Vite dev server. The clean-feed flag
 * (`src/utils/cleanFeed.ts`, `?clean=1`) is dev-only for the same reason.
 *
 * ── The three things that took a probe to find ──
 *
 * 1. THE INTRO IS 2.1 SECONDS. `startMatch()` runs a meteor shower for
 *    1600 ms, then announces the turn for 500 ms, and only then is the first
 *    `player_turn` live. On a 10 s preview that is a fifth of the clip spent
 *    on a curtain. So `boot()` starts the match, waits the intro out in REAL
 *    time, and freezes; `record()` unfreezes and the clip opens mid-fight.
 *
 * 2. `initGame` RESEEDS THE GAMEPLAY RNG ITSELF. Every non-PvP match calls
 *    `seedMatchRngRandom()` (useSpinnerGame.ts), so a seed set before a stage
 *    change or a reinit is thrown away. `seed()` must be called AFTER the
 *    match exists. `preview.config.mjs`'s `seedRandom` is a different RNG
 *    (the page's `Math.random`, which drives particles and NPC spawn jitter);
 *    both are needed and neither substitutes for the other.
 *
 * 3. WHO MOVES FIRST IS A COIN FLIP, and it is weighted by the PREVIOUS
 *    match's result: `matchRng() < (lastResult === 'lose' ? 0.80 : 0.30)`.
 *    The fixture pins `spinner_last_result` to 'lose' so the odds are 80/20
 *    our way, and `boot()` then simply waits for `player_turn` however it
 *    arrives — if the NPC wins the flip, its opening shot resolves during
 *    setup and the clip opens on a board that is already scattered, which is
 *    no worse. Seeded, this resolves the same way on every run.
 *
 * ── Coordinates ──
 *
 * GAME UNITS throughout: the arena is a fixed -200..+200 box (ARENA_RADIUS)
 * that the renderer scales to `min(w, h)` every frame. One beat sheet
 * therefore plays identically at 720x1280 and 1920x1080. Angles are canvas
 * convention — +x is right, +y is DOWN, so the player's half is positive y
 * and the enemy's is negative y, and "shoot at the enemy" is roughly -PI/2.
 */

/** Where the two sides spawn, in game units — `initGame` puts the player at
 *  +0.4 * ARENA_RADIUS and the NPC at -0.4 * ARENA_RADIUS on y. */
export const ARENA_RADIUS = 200
export const PLAYER_Y = ARENA_RADIUS * 0.4
export const ENEMY_Y = -ARENA_RADIUS * 0.4

/** The game's own constants, mirrored so a beat sheet can reason about pacing
 *  without a round trip into the page. */
export const TIMING = {
  /** `startMatch` → `deciding_turn`. */
  introMs: 1600,
  /** `deciding_turn` → the first real turn. */
  announceMs: 500,
  /** A launched blade accelerates over 28 frames, then coasts and decays.
   *  A full-power shot crosses the arena and settles in roughly this long. */
  launchSettleMs: 2600,
  /** How long the NPC "thinks" before its own launch. */
  npcThinkMs: 900
}

// ─── The save fixture ───────────────────────────────────────────────────────
//
// chaos-arena keeps progress as many FLAT localStorage keys rather than one
// blob (see src/keys.ts), so the fixture is a key→value map and every value
// is a string, exactly as the game writes it.
//
// Pin everything that can put something on screen. The expensive failures
// here are not crashes, they are a chest button, a tip badge or a "3, 2, 1,
// GO" countdown appearing over the opening frame.

/** @param {Record<string, string>} [over] */
export const saveFixture = (over = {}) => {
  const now = Date.now()
  const HOUR = 60 * 60 * 1000

  return {
    // ── Progress ──
    // Stage 17: three enemies in a LAVA arena. Picked for the clip, not for
    // the difficulty — three enemies fill the frame, and the lava floor is
    // the best-looking of the seven arena types at video size. Stage 12 (lava
    // + 2 bouncers) and 22 (shock, four enemies) are the other candidates.
    spinner_campaign_stage: '17',
    spinner_player_max_stage: '17',
    spinner_coins: '8400',
    spinner_diamonds: '25',
    spinner_first_win: '1',

    // A 3-blade player team. The default save has 2; three reads as a squad
    // and gives a beat sheet a spare blade to lose in the fail clip.
    spinner_player_team: JSON.stringify([
      { topPartId: 'star', bottomPartId: 'speedy' },
      { topPartId: 'triangle', bottomPartId: 'balanced' },
      { topPartId: 'round', bottomPartId: 'tanky' }
    ]),
    // Upgrade levels are applied over the team by `playerTeamWithUpgrades`.
    // Levels in the 6-8 band put the player at parity with stage 17's
    // enemies — a real fight, which is the only kind worth filming.
    spinner_upgrades: JSON.stringify({
      tops: { star: 7, triangle: 7, round: 6, quadratic: 5, cushioned: 5, piercer: 5 },
      bottoms: { speedy: 7, balanced: 7, tanky: 6 }
    }),

    // ── Who moves first ──
    // 'lose' weights the opening coin flip 80/20 toward the player (see the
    // header). Harmless otherwise: nothing else reads it at boot.
    spinner_last_result: 'lose',

    // ── Every overlay that can cover the arena ──
    // The countdown fires on every 3rd match START. At 0 the next two matches
    // are 1 and 2 — enough for a 30 s clip that plays a second match.
    spinner_game_start_count: '0',
    // Treasure chests unlock on elapsed time since the stored timestamp; a
    // timestamp in the FUTURE reads as "just collected", so no chest is ever
    // ready during a take.
    spinner_chest_ready_at: String(now + 12 * HOUR),
    spinner_mini_chest_ready_at: String(now + 12 * HOUR),
    spinner_skin_chest_ready_at: String(now + 12 * HOUR),
    spinner_skin_chest_first_collected: '1',
    // Skin picker + tip badges: mark them seen so neither opens on its own.
    spinner_skin_picker_opened: '1',
    spinner_tip_last_shown: String(now),
    spinner_tip_losses_on_stage: '0',
    spinner_tip_tank_loss_streak: '0',
    spinner_boss_loss_streak: '0',
    // Interstitial cadence. `isInterstitialReady` is false with no ad
    // provider in a dev build, so this is belt and braces — but an ad break
    // parks the phase at 'ad_break' and would swallow the clip whole.
    ca_battles_since_ad: '0',
    ca_first_midgame_ad_shown: '1',

    // ── Silence ──
    // Chrome is launched with --mute-audio too; this stops the game building
    // its audio graph at all.
    spinner_user_sound_volume: '0',
    spinner_user_music_volume: '0',
    spinner_user_language: 'en',
    spinner_user_difficulty: 'medium',

    // ── Pin the render quality ──
    // useQuality.ts measures a WALL-CLOCK window and can latch FX.low. The
    // whole of setup() runs in real time while this machine is also starting
    // Chrome and a Vite dev server, so on 'auto' one take in five records at
    // half the particle density. 'high' removes the question.
    chaosarena_quality_pref: 'high',
    chaosarena_quality_verdict: 'high',

    // Never let a stray cheat binding fire from a synthesised key event.
    cheat: 'false',

    ...over
  }
}

/** Written into the page BEFORE any script runs, so the game boots into it. */
export const seedSaveScript = (save) => {
  try {
    localStorage.clear()
    for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v)
  } catch { /* private mode */
  }
}

// ─── Talking to the page ────────────────────────────────────────────────────

/**
 * Wait until the seam exists and a match has been built.
 *
 * REAL TIME ONLY. Under the recorder's virtual clock nothing in the page
 * advances unless the capture loop steps it, and the capture loop is waiting
 * for the scenario to go idle — so a `waitForFunction` inside `record()` is a
 * deadlock. Everything that waits on the game happens in `setup()`; `record()`
 * paces itself with `ctx.wait(ms)` and `ctx.stepUntil(fn)`.
 */
export const waitForSeam = (ctx) =>
  ctx.page.waitForFunction(
    () => {
      const c = window.__chaos
      return !!c && c.snapshot().player.length > 0
    },
    null,
    { timeout: 30_000 }
  )

/** Read the game state. Safe in either phase. */
export const snapshot = (ctx) => ctx.evaluate(() => window.__chaos.snapshot())

// ─── Boot ───────────────────────────────────────────────────────────────────

/**
 * Navigate with the fixture seeded, start the fight, run the intro out, and
 * FREEZE on the first playable frame.
 *
 * @param {object} ctx
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.save]   fixture overrides
 * @param {number} [opts.seed]                  gameplay RNG seed
 * @param {number} [opts.stage]                 campaign stage to fight on
 */
export const boot = async (ctx, { save = saveFixture(), seed = 1337, stage = null } = {}) => {
  // The runner has ALREADY opened the page at the full recording URL — the
  // resolved port and every URL param: the config's, the format's, the clean
  // feed's `clean=1`, the scenario's, and every `--url-param`. Reuse it.
  // Rebuilding it from the config silently drops all of those, and the clip
  // records with the HUD on while every log line looks correct.
  const current = typeof ctx.page.url === 'function' ? ctx.page.url() : ''
  if (!/^https?:/.test(current)) {
    throw new Error(
      `preview-video: boot() expected the runner to have opened the recording URL, but the page is at "${current}". ` +
      'Refusing to rebuild it from the config — that would drop the clean-feed and --url-param params.'
    )
  }
  const url = current.split('#')[0]

  await ctx.page.addInitScript(seedSaveScript, save)
  // Bounce through about:blank first. This app uses a HASH history off-portal,
  // so vue-router leaves `#/` on the address and a `goto` back to the same URL
  // is a SAME-DOCUMENT navigation: the document is never rebuilt, the init
  // scripts never run, and the game keeps whatever save it booted with. The
  // symptom is a clip recorded on stage 1 while the log says stage 17.
  await ctx.page.goto('about:blank')
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded' })

  await waitForSeam(ctx)

  // Both splashes: the static one in index.html (removed from the DOM) and
  // the Vue one behind it. A clean feed HIDES them, which is not the same as
  // gone — they still eat pointer events while up.
  await ctx.page.waitForFunction(() => !document.getElementById('static-splash'), null, { timeout: 30_000 })

  if (stage !== null) {
    await ctx.evaluate((s) => window.__chaos.setStage(s), stage)
    // The stage change rebuilds the match through SpinnerArena's watcher on
    // the next tick; wait for the roster it implies rather than a fixed sleep.
    await ctx.page.waitForFunction((s) => window.__chaos.snapshot().stage === s, stage, { timeout: 10_000 })
  }

  // Seed AFTER the match exists — `initGame` reseeds randomly, so a seed set
  // any earlier is discarded (see the header).
  await ctx.evaluate((s) => window.__chaos.seed(s), seed)

  // Start the fight and wait out the 2.1 s curtain in real, unrecorded time.
  await ctx.evaluate(() => window.__chaos.begin())
  await ctx.page.waitForFunction(
    () => window.__chaos.snapshot().phase === 'player_turn',
    null,
    { timeout: 20_000 }
  )

  await freeze(ctx)

  // Prove the fixture actually landed. Every way this can go wrong — a
  // same-document navigation, a stage that never applied, a save the game
  // rejected — produces a perfectly plausible clip of the WRONG match, and
  // the only cheap moment to catch it is here.
  const s = await snapshot(ctx)
  const wantStage = stage ?? Number(save.spinner_campaign_stage)
  if (s.stage !== wantStage) {
    throw new Error(`preview-video: expected stage ${wantStage}, the page is on ${s.stage}. The fixture did not land.`)
  }
  if (s.alive.player < 1 || s.alive.npc < 1) {
    throw new Error(`preview-video: match is not fightable — ${s.alive.player} player / ${s.alive.npc} enemy blades alive.`)
  }
  return s
}

/** Stop / restart the physics tick. Rendering continues either way. */
export const freeze = (ctx) => ctx.evaluate(() => window.__chaos.freeze())
export const unfreeze = (ctx) => ctx.evaluate(() => window.__chaos.unfreeze())

// ─── Staging a verdict ──────────────────────────────────────────────────────

/**
 * Author the HP the fight starts from.
 *
 * The exchanges in every beat sheet are REAL physics — real collisions, real
 * damage, a real verdict. What is authored is the HP they start from, so the
 * last exchange lands where the story needs it. A scenario that instead forced
 * `gameResult` would be a video of a fake fight, and it shows.
 *
 * @param {object} ctx
 * @param {{player?: number[], npc?: number[]}} hp  fraction of max per blade,
 *        indexed over that side's LIVING blades. Shorter arrays leave the rest
 *        untouched.
 *
 *        VALUES ABOVE 1 ARE ALLOWED AND ARE THE MAIN LEVER FOR A LONG CLIP.
 *        `hp = maxHp * n`, so 2.5 makes a blade survive several exchanges that
 *        would otherwise kill it. This matters because a levelled player team
 *        one-shots a FULL-HP enemy at stage 17: pinning the enemy line to 1
 *        does not keep it alive, it just kills one red per exchange and ends
 *        a six-exchange match in three. Overcharging the blades that must
 *        still be standing at the payoff is what buys the 30 s arc its middle.
 *
 *        Invisible for the usual reason — the HP rings are off in a clean
 *        feed — and harmless: `maxHp` is untouched, so nothing that reads a
 *        ratio sees a changed denominator.
 */
export const stageHp = async (ctx, hp) => {
  return ctx.evaluate((h) => {
    const c = window.__chaos
    for (const side of ['player', 'npc']) {
      const list = h[side]
      if (!list) continue
      list.forEach((frac, i) => {
        if (typeof frac === 'number') c.setHp(side, i, frac, true)
      })
    }
    return c.snapshot()
  }, hp)
}

// ─── Driving a shot ─────────────────────────────────────────────────────────

/**
 * One launch, as the viewer sees it: the blade is pulled back, the slingshot
 * line hangs there long enough to read as INTENT, and then it fires.
 *
 * The pull-back is the only thing on screen between two collisions, which is
 * why the aim and the release are separate calls and why `aimMs` defaults to
 * something visible. Dropping it to 0 gives a clip where blades move for no
 * apparent reason.
 *
 * @param {object} ctx
 * @param {object} t      the budget from `budget(ctx)`
 * @param {object} shot
 * @param {number} [shot.blade]    index among LIVING player blades  (0)
 * @param {number} [shot.target]   index among LIVING enemy blades — aim at it
 * @param {number} [shot.angle]    radians, used when `target` is absent
 * @param {number} [shot.power]    0..1 of the maximum pull            (1)
 * @param {number} [shot.aimMs]    how long the pull-back is held    (620)
 * @param {number} [shot.settleMs] time given to the resolution      (TIMING.launchSettleMs)
 * @param {string} [shot.beat]     mark this moment in the log
 * @param {number} [shot.hero]     ms after the launch to mark the poster frame
 * @param {number} [shot.waitMs]  how long to wait for `player_turn`   (6000)
 * @param {boolean} [shot.preAimed] the shot was already aimed in `setup()` —
 *        hold and fire it, do not re-aim. This is how a clip OPENS on a drawn
 *        slingshot instead of on a static board: `aim()` only needs
 *        `player_turn`, not a running physics tick, so setup can aim and then
 *        freeze, and frame 0 already has the pull-back in it.
 * @param {{player?: number[], npc?: number[]}} [shot.author] HP to author for
 *        THIS exchange, applied after `player_turn` is confirmed and before
 *        the aim.
 *
 *        THE ORDERING IS THE WHOLE POINT, and it cost a take to learn. Author
 *        the HP from the beat sheet directly — between two `shoot` calls —
 *        and it lands while the PREVIOUS exchange is still resolving: blades
 *        are mid-flight, the enemy has just launched, and dropping the whole
 *        enemy line to 8% lets the blades already in motion wipe it in a
 *        frame. The clip then reaches its payoff beat with the match already
 *        won and nothing left to shoot, and the only symptom is a warning
 *        about a missing `player_turn`. Passing it here guarantees the board
 *        is at rest and it is genuinely the player's turn first.
 */
export const shoot = async (ctx, t, shot = {}) => {
  const {
    blade = 0,
    target = null,
    angle = null,
    power = 1,
    aimMs = 620,
    settleMs = TIMING.launchSettleMs,
    beat = null,
    hero = null,
    preAimed = false,
    author = null,
    waitMs = 6000
  } = shot

  if (!preAimed) {
    // Nothing can be launched outside `player_turn`; a beat sheet that drifts
    // out of sync would otherwise fire into a void and lose the exchange
    // silently. Give the previous resolution a moment to finish arriving.
    // 6 s, not 3: the enemy takes one turn PER LIVING BLADE, so a 1-v-2 board
    // runs roughly twice the cycle of a 1-v-1 and a 4 s wait gave up on it.
    const ready = await ctx.stepUntil(() => window.__chaos.snapshot().phase === 'player_turn', {
      timeoutMs: waitMs,
      label: 'player_turn'
    })
    if (!ready) {
      // Say WHAT the game was doing instead. "No player_turn" alone cannot
      // distinguish the three things that cause it — the match already ended,
      // the previous exchange is still resolving, or the beat sheet is simply
      // ahead of the clock — and they want different fixes.
      const s = await snapshot(ctx)
      ctx.log.warn(
        `shoot: no player_turn for beat "${beat ?? blade}" — stuck in "${s.phase}"` +
        ` (${s.alive.player} blue / ${s.alive.npc} red, result=${s.result})` +
        ' — skipping this exchange'
      )
      return false
    }

    // The board is at rest and it is the player's turn: the only safe moment
    // to author HP (see `author` in the doc comment above).
    if (author) await stageHp(ctx, author)

    const aimed = await ctx.evaluate(
      (a) =>
        a.target === null
          ? window.__chaos.aim(a.blade, a.angle, a.power)
          : window.__chaos.aimAtBlade(a.blade, 'npc', a.target, a.power),
      { blade, target, angle: angle ?? -Math.PI / 2, power }
    )
    if (!aimed) {
      ctx.log.warn(`shoot: could not aim blade ${blade} (dead, or no such blade)`)
      return false
    }
  }

  if (beat) ctx.beat(`${beat}-aim`)
  if (!(await t.wait(aimMs))) return false

  await ctx.evaluate(() => window.__chaos.fire())
  if (beat) ctx.beat(beat)

  // Say what the exchange actually did. A beat sheet's authored HP is a
  // PREDICTION about how much damage lands, and collateral routinely kills a
  // blade the beat meant to keep — logging the survivors after every shot is
  // what turns "the clip came out wrong" into "exchange 3 killed two".
  const report = async (label) => {
    const s = await snapshot(ctx)
    ctx.log.info(`  ${label}: ${s.alive.player} blue / ${s.alive.npc} red${s.result ? ` → ${s.result}` : ''}`)
  }

  if (hero !== null) {
    if (!(await t.wait(hero))) return false
    // The peak of an impact is the best BEAT and the worst POSTER — it is a
    // white flash. Mark a few hundred ms later, where the wreckage reads.
    ctx.beat('poster')
    if (!(await t.wait(Math.max(0, settleMs - hero)))) return false
    if (beat) await report(beat)
    return true
  } else if (!(await t.wait(settleMs))) {
    return false
  }
  if (beat) await report(beat)
  return true
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

/**
 * A spend-down budget for the clip.
 *
 * Every `wait` returns false once the clip is full, and every beat sheet
 * checks it, so a scenario that runs long stops cleanly at the last frame
 * instead of the capture loop cutting it mid-exchange. `record()` should
 * consume approximately `ctx.durationMs`; the capture loop keeps rolling to
 * fill the duration either way, so overshooting costs the END of the story.
 */
export const budget = (ctx) => {
  let spent = 0
  return {
    get spent() {
      return spent
    },
    get left() {
      return ctx.durationMs - spent
    },
    /** Advance the clip by `ms`. Returns false when the budget is gone. */
    async wait(ms) {
      if (spent >= ctx.durationMs) return false
      const slice = Math.min(ms, ctx.durationMs - spent)
      spent += slice
      await ctx.wait(slice)
      return spent < ctx.durationMs
    }
  }
}

/**
 * Roll the clip forward until the match has a verdict, or `maxMs` is spent.
 *
 * Written against the BUDGET rather than `ctx.stepUntil` on purpose: stepUntil
 * advances the clip directly and the budget never sees it, so a beat sheet
 * that used it would quietly overspend and lose its ending. This spends
 * through `t.wait`, so `t.left` stays honest and the restart beat still gets
 * the time the sheet reserved for it.
 *
 * Why a wait at all rather than a fixed `settleMs`: how long a cascade takes
 * to finish killing is the one thing in the clip that genuinely varies with
 * the physics. A measured constant got the payoff shot fired on exactly the
 * right frame and then cut away 600 ms before the last enemy died — a clip
 * whose story is "and then the arena is still half full".
 *
 * @returns the final snapshot (`.result` is null if the wait timed out)
 */
export const awaitVerdict = async (ctx, t, { maxMs = 3000, stepMs = 100 } = {}) => {
  let spent = 0
  while (spent < maxMs) {
    const s = await snapshot(ctx)
    if (s.result !== null) return s
    if (!(await t.wait(stepMs))) break
    spent += stepMs
  }
  const s = await snapshot(ctx)
  if (s.result === null) {
    ctx.log.warn(
      `awaitVerdict: no verdict after ${spent} ms — ${s.alive.player} blue / ${s.alive.npc} red still alive` +
      ' (author the HP lower, or give the payoff shot more room)'
    )
  }
  return s
}

/**
 * Restart the same stage — the "and straight back in" beat that keeps the last
 * second of a clip in motion instead of holding on a freeze.
 *
 * This is not optional garnish in a clean feed, it is how the clip ENDS. There
 * is no result screen (DOM, hidden) and no canvas text, so a win is read from
 * the victory meteor shower the renderer paints, and a LOSS has no ceremony at
 * all — the last enemy simply stops being hit. Restarting gives both endings
 * ~1.7 s of fresh meteor shower and a new board, which is motion, and on the
 * fail clip it is also the retry the viewer is being invited to want.
 */
export const playAgain = async (ctx, { seed = 1337 } = {}) => {
  await ctx.evaluate(() => window.__chaos.reinit())
  await ctx.evaluate((s) => window.__chaos.seed(s), seed)
  await ctx.evaluate(() => window.__chaos.begin())
}

// DELIBERATELY NOT EXPORTED: an `authorNextExchange` alias for `stageHp` used
// to live here, for authoring HP between two `shoot` calls. It is a trap and
// it cost a take. Called from a beat sheet it lands while the PREVIOUS
// exchange is still resolving — blades mid-flight, the enemy mid-launch — and
// the board it authors is immediately consumed by the motion already on
// screen. Pass `author` to `shoot` instead: it applies the same staging, but
// only once `player_turn` is confirmed and the arena is at rest.
