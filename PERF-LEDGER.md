# Perf experiment ledger — Tree Smashers

Every performance hypothesis that has been *measured* in this project, kept or
rejected. **Null results are the most valuable rows here** — they are what stops
the same idea being re-tried next time the game feels slow.

Method: `perf/ab.mjs` — production build, own static server on a random port,
one throw-away Chrome per rep, 412×915 @ DPR 3 with touch emulation, CDP CPU
throttling, seeded `Math.random`, a fixed scripted drag sequence, and
**interleaved A/B/A/B** (never A-then-B). `perf/scenario.mjs` seeds a heavier
campaign stage than the stage-1 tutorial, which is the lightest thing the game
ever draws.

**Primary metric here is frame delta, not p95 work-per-frame.** The skill's
default primary is work-per-frame, and for a JS-bound game that is right — but
this game turned out to be *raster*-bound, and canvas 2D draw calls are recorded
cheaply inside the rAF callback and rasterised afterwards. Work-per-frame
literally cannot see the thing being optimized: the change below that doubled
the frame rate moved p95 work-per-frame by +0.5%. Work-per-frame is still
recorded, as a regression guard.

> Read `~/.claude/skills/web-game-performance-optimize/SKILL.md` before adding a
> row. An optimization with no row here has not been measured.

---

## 2026-09-07 — Where the frame actually goes

Trace attribution (`perf/trace.mjs`, 4× CPU throttle, 12 s of live battle),
main-thread self time:

|                                                 | before     | after     |
|-------------------------------------------------|------------|-----------|
| **Paint**                                       | **66.6 %** | **2.2 %** |
| FunctionCall (all JS)                           | 15.8 %     | 39.1 %    |
| Layerize / UpdateLayoutTree / Commit / PrePaint | 7.9 %      | 19.1 %    |
| GC (every V8 scavenge bucket combined)          | < 0.2 %    | < 0.2 %   |

Probe at the same time, before: work-per-frame mean 5.9 ms, p95 13.7 ms — but
frame delta p50 33.4 ms. **The JS game loop was never the bottleneck; canvas
rasterisation was.** Allocation was not the bottleneck either — heap slope
~160 KB/frame with essentially no GC time — so pooling and zero-alloc rewrites
(catalogue B1/B2) were aimed at the wrong column and were not attempted.

Confirming ablation — no-op every canvas draw call (`?abl=canvas`), physics
still running: 22.5 fps → 59.8 fps. Essentially the entire frame budget was
canvas raster.

### Ablation decomposition (stage 1, 4× throttle, 3 interleaved reps each)

Probe-side no-ops in `perf/probe-v2.js`. **Diagnostics, not fixes** — each one
changes what the game looks like.

| Ablation                                                          | fps A → B       | reading                                                          |
|-------------------------------------------------------------------|-----------------|------------------------------------------------------------------|
| every `createRadialGradient`/`createLinearGradient` → flat colour | 28.5 → **60.0** | gradient **fills** dominate                                      |
| `createPattern` → flat colour (the tiled background)              | 26.5 → **59.2** | full-canvas pattern fill dominates                               |
| `stroke()` → no-op (trails, HP rings, arena)                      | 31.7 → 37.5     | real but second-order                                            |
| `clip()` → no-op (per-blade circular clip)                        | 32.5 → 32.2     | **null** — leave it alone                                        |
| `shadowBlur` forced to 0                                          | 32.0 → 32.6     | **null at stage 1**, which has no bouncers; not a general result |

---

## Kept

Verified together, `opt=off` vs default, interleaved, 4 reps × 30 s, 4× CPU
throttle, **stage 48** (ice arena, 3 bouncers, 3 NPC blades):

```
                     A original     B optimized
  fps                     24.55           54.50    +122 %
  deltaP50 (ms)           33.50           16.70     -50 %
  deltaP95 (ms)           75.40           33.20     -56 %
  frames over 33ms        57.3 %           3.45 %   -94 %
  long tasks             128.5             6.0      -95 %
  workP95 (ms)            15.95           16.95      +6 % (guard; baseline spread 10.1)
  bundle (SpinnerArena)  352.8 kB        356.3 kB    +1 %
```

Same comparison at stage 1: 30.15 → 59.55 fps (+97.5 %), long tasks 44 → 0.

**VERDICT: KEEP.** Flags removed, pre-optimization branches deleted.

### `auraCache` — bake blade auras to sprites

Every aura in the game (team, boss, life-leech, tornado glow, sandstorm haze,
thunderstorm glow) is a radial gradient whose colour stops **all scale by one
`pulse` factor** and whose outer stop is fully transparent. Drawing a pulse-1
sprite at `globalAlpha = pulse` is therefore the same composite, so a per-blade
per-frame `createRadialGradient` + large translucent gradient fill becomes one
`drawImage`.

*Fidelity: verified, not assumed.* `perf/aura-equivalence.mjs` draws both paths
over the same background in a real rasteriser across 3 aura types × 3 blade
radii × 4 pulse values: **worst single-channel difference 2/255**, mean 1.0 —
8-bit rounding in the premultiply round-trip. The team aura's inner-stop ratio
is not perfectly constant across blade sizes (0.149–0.157) so it is quantised
into 0.005 buckets; worst case a 0.15 px stop shift at a 60 px aura.

*Cost: ~256 KB per distinct sprite, ~6 sprites in practice.*

### `bgCache` — pre-tile the background into a buffer

The background is a full-viewport fill that does not change within a match, but
the default skin fills it from a **repeating pattern** — modulo-addressed
sampling over ~380k pixels, every frame. Pre-tiled once into a buffer keyed on
`skin id + canvas size + tile-image load state`, then blitted.

*Fidelity: verified — a background-only patch of the before/after screenshots
differs by at most 1/255. Deliberately kept inside the canvas rather than moved
to a CSS background on the element, so it keeps moving with the screen-shake
transform as it does today.*

*Cost: one canvas-sized RGBA buffer (~1.5 MB at 412×915).*

### `joystickClear` — stop clearing the empty joystick overlay

The virtual joystick draws to its own `fixed inset-0` canvas so it can paint
above the HTML stat cards. `renderJoystickOverlay` ran `clearRect(0, 0, w, h)`
on it **before** the "is the joystick even visible" early-return — dirtying and
recompositing a full-viewport layer once per frame to produce nothing, on every
frame of every match played with the default drag-to-aim scheme.

*Fidelity: identical.*

---

## 2026-09-30 — Skills on vs off (WP11 release gate)

`perf/ab.mjs --stage 91 --init <seed> --a perfskills=0 --b perfskills=1` on a
production build with `VITE_APP_FEATURE_SKILLS=true`. B equips Homing Rockets
L10 + Static Charge L10 (rockets, zap, stun glyphs — the heaviest skill VFX);
A has the same build and save with an empty loadout. The `--init` flag was
added to the runner for exactly this: a save-shape A/B that stays interleaved.

| throttle | reps | deltaP50 A → B         | fps A → B   | baseline spread | reading                   |
|----------|------|------------------------|-------------|-----------------|---------------------------|
| 4×       | 4    | 16.70 → 16.80 (+0.6 %) | 41.0 → 39.4 | 33.4 ms         | within the ≤ 3 % budget   |
| 8×       | 4    | 50.15 → 74.90 (+49 %)  | 16.4 → 13.5 | 50.0 ms         | noise — inside the spread |
| 8×       | 6    | 50.10 → 41.75 (−17 %)  | 15.1 → 15.1 | 66.6 ms         | noise — inside the spread |

Measured while another project's perf harness was loading the machine, so the
8× runs swing both ways by more than the effect: **no verdict at 8×**; re-run
on an idle machine before quoting it. 4× shows no measurable regression.

---

## 2026-09-30 — Boss-trait VFX on vs off (bosses BW4 gate)

The real engine (`useSpinnerGame` + `render()`) auto-playing the **Elemental
Court** (Cinder + Warden + Yeti — the worst trait frame: 3 aura sprites, charge
arc + reach ring, frost rims, nova rings, shards, embers) in the dev scene
`dev/boss-vfx.html?engine=1&quality=high&bench=20000`, A = `traits=0` (same
roster with `bossTrait` stripped), B = `traits=1`. Interleaved A B A B, one
fresh headless Chrome per run, 412×915 dpr 1, **4× CPU throttle**, 6 s warm-up
then 20 s of frame deltas. Served by the Vite dev server (unminified), so the
absolute numbers sit below a production build; the A/B difference is what
counts. Runner: the session's `boss-vfx-shots.mjs ab 4` (CDP
`Emulation.setCPUThrottlingRate`).

| throttle | reps | deltaP50 A → B | fps A → B     | frames > 33 ms A → B | trait events / run (B)           | reading                                                   |
|----------|------|----------------|---------------|----------------------|----------------------------------|-----------------------------------------------------------|
| 4×       | 4    | 16.7 → 16.7    | 53.90 → 53.87 | 4.0 % → 3.2 %        | ~40 (novas, burns, chill, frost) | no measurable cost (−0.05 % fps, within ±1 pp run spread) |

The layer is ≤ 20 primitives on the worst frame (unit-tested,
`tests/bossTraitVfx.test.ts`) against hundreds for the arena itself; FX.low
drops the aura blits and every transient except the nova stroke. Not re-run at
8× (the WP11 note above: 8× on this machine is noise-dominated).

---

## 2026-09-30 — Stage 200 (Elemental Court) vs a classic boss (bosses BW9 gate)

`perf/ab.mjs --stage 195 --init <seed> --a st=195 --b st=200` on the shipped
(obfuscated) production build, both arms at part level 40, interleaved A B A B,
4 reps × 30 s. A = stage 195 (Final Guard II, classic cycle copy), B = stage 200
(Elemental Court, all three boss traits).

| throttle | reps        | deltaP50 A → B          | fps A → B   | baseline spread | reading                                           |
|----------|-------------|-------------------------|-------------|-----------------|---------------------------------------------------|
| 4×       | 4           | 41.75 → 25.15 (−39.8 %) | 18.9 → 30.0 | 83.6 ms         | noise — spread is 2–3× the medians                |
| 8×       | 2 (aborted) | —                       | 1.4–4.3     | —               | run aborted: a rep never reached a canvas in 30 s |

**No verdict.** Both runs overlapped other sessions' jobs (a full vitest run and
screenshot harnesses held 18–20 of 20 budget workers), and one 4× A rep collapsed
to 7.9 fps. The direction is B no slower than A, which agrees with the BW4
trait-on/off A/B above (no measurable cost at 4×). Re-run on an idle machine
before quoting a number.

---

## 2026-10-01 — Idle-machine re-runs (WP11 skills 8×, BW9 bosses 4× / 8×)

Fresh production build of HEAD `d4dbcab` (`vite build`, mode production,
obfuscated as shipped; skills, bosses-100 and league flags on via `.env`), same
runner, scenarios, stages, reps × 30 s, seed 7 and 412×915 dpr 3 touch
emulation as the 2026-09-30 rows. Three harness-only differences, none in game
code:

- served and loaded on **`localhost`** (the game only renders on localhost or a
  portal hostname; the committed runner uses `127.0.0.1`);
- the init seeds also mark the **league unlock popup** seen (`smashers_league`
  `unlockSeen: true`) — since the league landed, stage ≥ the unlock stage opens
  that modal over the arena and every rep measured a static dialog at 60 fps;
- the bosses seed also marks the skill-UI intros seen, as the skills seed does.

**Machine load:** worker budget 2/20 for the whole session (this run's own
lease); other sessions held 10 extra workers for two short windows (~11:14 and
11:21–11:22, a vitest run and a vue-tsc build). Total CPU 2–44 % outside those
windows, 68–71 % peak.

| check                          | throttle | reps | deltaP50 A → B        | deltaP95 A → B          | fps A → B   | noise (A spread, P50) | verdict   |
|--------------------------------|----------|------|-----------------------|-------------------------|-------------|-----------------------|-----------|
| skills off → on, quality auto  | 8×       | 6    | 49.80 → 49.95 (+0.3 %) | 133.5 → 175.0 (+31 %)  | 16.1 → 14.2 | 183.9 ms              | no verdict — bimodal, see below |
| skills off → on, quality high  | 8×       | 8    | 33.30 → 33.30 (0.0 %) | 66.70 → 66.75 (+0.1 %)  | 30.6 → 29.9 | 0.1 ms (fps 4.9)      | **PASS**  |
| classic 195 → Court 200        | 4×       | 4    | 16.70 → 16.70 (0.0 %) | 41.35 → 33.45 (−19 %)   | 45.1 → 48.8 | 33.4 ms               | **PASS**  |
| classic 195 → Court 200        | 8×       | 4    | 49.95 → 33.40 (−33 %) | 116.95 → 100.00 (−15 %) | 17.6 → 23.2 | 16.6 ms               | **PASS** (B faster, outside the band) |

**Why 8× was noise on 2026-09-30, and still is with `quality=auto`:** at 8× the
stage-91 fight sits right on the adaptive tier's 25 fps threshold, so each fresh
Chrome independently lands on `high` or `low` mid-rep — reps cluster at ~12 fps
and ~27 fps in *both* arms on an otherwise idle machine. Pinning
`quality=high` in both arms (query param, no save change) collapses the A
spread from 183.9 ms to 0.1 ms and the result is a clean null: skills cost
nothing measurable at 8×. Other-session load was not the cause. Quote the
pinned row; any future 8× A/B near the tier threshold should pin the tier.

The one slow bosses-4× rep (A rep 4, 12.1 fps) coincided with the other
session's 10-worker vitest window; dropping it leaves the verdict unchanged.
The BW4 dev-scene result (traits cost nothing at 4×) now holds on the
production build at 4× and 8× too; the Court is cheaper than the classic
stage-195 fight, not dearer.

---

## 2026-10-20 — ONE static layer (background + props + floor + rim + terrain + tower bodies)

Hypothesis: the frame drew two cached buffers (a full-screen background +
props layer, an arena-local floor/rim/terrain buffer blitted with a scale)
plus every tower body each frame; baking all of it into ONE buffer at the
canvas's own backing size and blitting it 1:1 saves a full-screen-ish blit,
a resampled blit and ~16 tower draw calls per frame. Build-time A/B switch
`?bake=split` (the previous two-buffer path), removed after this run.

Stage 48 (ice arena → snowy theme, 3 bouncers, towers), 412×915 @ DPR 3,
4× CPU, quality pinned high, 4 interleaved reps × 30 s each arm.
**Machine load: heavy** — two other Claude sessions were running vitest /
vite builds / Gemini automation on this machine during the run, so the
rep-to-rep spread is larger than the measured difference.

| metric (median of reps) | one layer (A) | split (B, before) | B vs A |
|---|---|---|---|
| workP50 | 12.95 ms | 15.45 ms | +19 % |
| workP95 | 30.35 ms | 37.05 ms | +22 % |
| deltaP95 | 41.7 ms | 50.05 ms | +20 % |
| fps | 44.9 | 39.4 | −12 % |
| long tasks / 30 s | 24 | 41.5 | +73 % |
| draw calls / frame (1 rep, `--dc`) | 150 | 167 | +11 % |
| A spread (P50 work) | 16.4 ms | | |

Verdict: **KEPT** — every median and the draw-call count favour the one
layer, and it needs less memory (one css×dpr canvas instead of a css×dpr
background canvas plus a (560 × device px/unit)² arena canvas). The timing
gain is NOT proven at this noise level (spread > delta); re-run on an idle
machine before quoting it as a number. Re-bake cost: one full layer per
art arrival / tower felled / resize, never per frame.

---

## Adaptive quality tier (`src/use/useQuality.ts`)

A per-device tier, not an experiment flag — it stays. `high` is the full look;
`low` cuts fidelity, and is entered automatically when measured frame rate sits
under 25 fps. Player-overridable in Options (Auto / High / Low), stored under a
**non-payload** key (`ca_device_quality_pref`) so a phone's verdict never syncs
onto the same player's desktop.

What `low` drops: tornado/sandstorm auras keep their glow but lose the spiral
arms, vortex rings, orbiting debris and dust puffs; thunderstorm drops to 1+1
bolts on the already-tuned reduced geometry; trails go from 3 stacked strokes to
1 and from 700 ms to 420 ms; per-frame `shadowBlur` off (the arena's neon border
keeps its shadow — it is baked into the static buffer and costs nothing per
frame); particle caps 120/150/80 → 40/50/25.

Measured, `quality=high` vs `quality=low`, interleaved, 4 reps × 30 s, **8×**
CPU throttle, stage 48 (4× has headroom after the fixes above, so the tier's
benefit is invisible there — it exists for devices weaker than that proxy):

```
                      A high          B low
  fps                  30.30          41.40    +36.6 %
  deltaP50 (ms)        33.30          16.80    -49.5 %
  frames over 33ms     38.8 %         17.25 %  -55 %
  workP95 (ms)         41.70          28.35    -32.0 %
  heap slope         167.6 KB/f     107.8 KB/f -35.7 %
```

**VERDICT: KEEP.**

### Detector bug found and fixed by measuring it

The first implementation used a **frame-counted** sampling window (60 frames).
That reacts slowest on exactly the devices that need it fastest — 60 frames is
1 s at 60 fps but 8 s at 7 fps. Measured with `perf/quality-check.mjs`: a 7 fps
device needed ~30 s of play to reach a verdict and a 3 fps device never reached
one at all, so the tier never engaged. Switched to a **wall-clock** window
(1500 ms, min 6 frames); verdict now lands in ~4.5 s at any speed.

`perf/quality-check.mjs` on the shipped build, stage 48, `?quality=auto`:

```
  throttle    fps   deltaP50    tier settled on
        1x     60      16.7     high
        4x   56.3      16.7     high
        8x   35.1      33.1     high
       16x    9.2      99.4     low
```

---

## 2026-10-23 — Ring meteor shower (default intro variant, `src/use/ringShower.ts`)

Not an optimization: the chaos-arena-style ring burst replaced the strike as
the default (strike kept behind `?meteor=strike`); the budget was "no more than
the strike". Same isolated render bench as the strike entry: only the shower on
a 1170×2532 canvas (390×844 @3 touch), 4× CPU throttle, a 1-px `getImageData`
forcing a synchronous raster each frame, the full 2.56 s shower, own headless
Chrome + own dev server (`dev/meteor-shower.html?bench=1&bare=1`), arms
interleaved per round, median ms/frame. The machine was loaded (20/20 worker
budget in use), so the arms' spread is noisy; the ranking held every round.

| arm | none | strike high | ring high (painted) | ring high (procedural) | strike low | ring low |
|-----|------|-------------|---------------------|------------------------|-----------|----------|
| ms (7 rounds) | 22.1 | 42.0 (+19.9) | 32.4 (+10.3) | — | 29.2 (+7.1) | 27.9 (+5.8) |
| ms (5 rounds) | 33.0 | 58.6 (+25.6) | — | 45.5 (+12.5) | — | — |

Ring ≈ half the strike's cost on high and below it on low, painted or not:
no persistent craters, no dust, no frame bands; one path per colour layer
(≤ 25 paint ops, unit-tested); the painted sprites are one `drawImage` each
and cheaper than the 6 procedural passes. Zero per-frame allocation (fixed
pool, Float32Array sparks, save/translate/rotate for sprites, no getTransform).
An earlier run WITH the arena blit under it (100 ms frames) was pure noise —
the 3× arena blit + readback dominates; use `bare=1` to rank shower cost.

## 2026-10-22 — Meteor shower redesign (pre-battle intro, `src/use/meteorShower.ts`)

Not an optimization: a visibility redesign whose cost had to stay bounded. The
old shower (80 two-unit streaks) was nearly free because it was nearly
invisible. Measured with a scratch harness (own no-HMR dev server, own
headless Chrome per rep, 412×915 @3 touch, 4× CPU throttle, stage 12 volcanic,
the shower measured on a WARMED second intro — the first one is dominated by
first-battle decode / bake: 250 ms frames either way).

**In-game, interleaved ON / OFF** (OFF = the same build with the shower killed
through the dev hook as `meteor_intro` starts; 10 reps high, 8 low). The machine
was loaded by other agents' jobs (idle frames 66 ms vs 16.7 ms unloaded), so
magnitudes are noisy; the delta is what counts:

| tier | shower mean | p50 | p95 | vs OFF |
|------|-------------|-----|-----|--------|
| high | 83.3 ms | 66.7 | 100.1 | +8.6 ms mean (+12 %), p95 +16 |
| low  | 94.7 ms | 67.4 | 116.6 | +7.0 ms mean, p50 unchanged |

**Isolated render bench** (only the shower on a 1170×2532 canvas, a 1-px
`getImageData` forcing a synchronous software raster every frame — this
inflates per-pixel cost and is a worst-case ranking tool, not a frame-time
prediction). ms per frame over the 2.56 s shower, median of 5–7 interleaved reps:

| arm | none | old shower | new, high | new, low |
|-----|------|------------|-----------|----------|
| ms  | ~20  | +10.5      | +55 → +62 (noisy) | +17 |

What the bench found and what changed because of it:
- the screen-edge vignette as three even-odd "rect minus ellipse" fills cost
  +17 ms (three full-screen path rasters) → two thin nested frames of
  `fillRect` strips (rect fast path, edge area only), off on FX.low;
- a dashed reticle stroke (`setLineDash` path effect) → solid double ring;
- dust 3 → 2 layers and 4 puffs (−5 ms), crater 5 → 4 layers; FX.low drops dust,
  the crater rim and the frame bands (low: +38 → +17 ms in the bench).
- Remaining cost is the ten persistent craters (≈ 40 ellipse subpaths a frame)
  and the hero flash (10 frames of one full-screen `fillRect`).
JS side: zero per-frame allocation (fixed pool + Float32Array tables, analytic
in time); the old shower re-assigned a Vue ref with `slice()` every tick.

---

## Rejected / not attempted, with reasons

| Idea                                                                              | Why not                                                                                                                                                                                 |
|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Object pools for particles / damage numbers (catalogue B1)                        | GC is < 0.2 % of main-thread time. Wrong column.                                                                                                                                        |
| Zero-allocation hot loops (B2)                                                    | Same — heap slope is high but costs nothing here; the readability tax buys nothing.                                                                                                     |
| Remove the per-blade `ctx.clip()`                                                 | Measured null (32.5 → 32.2 fps).                                                                                                                                                        |
| Cap DPR (A8)                                                                      | Already effectively capped: the canvas backing store is sized in **CSS** pixels (`canvas.width = visualViewport.width`), so it never rasterises at DPR 2 or 3 to begin with.            |
| Move blade state off deep-reactive `ref([])` (framework in the hot path)          | Looked like the obvious structural win. The trace said otherwise while raster dominated. **Now worth revisiting** — the post-fix trace is 39 % FunctionCall, so JS is the new top cost. |
| Cache bouncer sprites (2 gradients + a `shadowBlur` stroke per bouncer per frame) | **Obsolete (2026-10-20)**: the pinball bumpers were removed from the game (terrain obstacles replace them). Rows above that name bouncers (stage 48 etc.) were measured with them.   |

---

## Caveats on every number above

- **Headless Chrome rasterises in software.** That inflates raster cost relative
  to a phone with a working GPU, so the *magnitudes* here are a proxy, not a
  prediction. The *ranking* (gradients and pattern fills first) and the
  direction of every verdict held across throttle levels. Confirm on a real
  Android device before quoting these figures externally.
- CPU throttle is a blunt stand-in for a slow device: it does not model memory
  bandwidth, thermal throttling or a weak GPU independently.
- No 3-minute thermal soak has been run yet.

## 2026-10-26 — #Perf-1: the stage-start stall and the HP badges

Method: production build, headless system Chrome, 412×915 @ DPR 2.75 with touch,
CDP CPU throttle 4×, skip the intro, 15 s sampling (long tasks, rAF gaps, CPU
profile; a dev-server rerun for function names). Micro A/Bs in a plain page.

**Found:** an 8.1 s main-thread task right after the intro — arena prop layout →
`towerKeepOut` → 18 tree layouts per shape → 2 × 36-step bisections × 48/96
outline SDF samples per ray, up to ~100 rays per layout. 1116 ms per arena shape
on this desktop, unthrottled (55 shapes measured).

| change | result | kept |
|---|---|---|
| outline tests stop sampling once decided (`outlineWithin`, `insideShareAbove`) + memoised `treeOnRay` | 1116 → 570 ms/shape, output **bit-identical** (1980 discs, 55 shapes) | yes |
| bisection 36 → 24 steps | 570 → 418 ms/shape, max tree shift 1.8e-5 units | yes |
| spread search: bisection over the same coarse/fine grids | 418 → 249 ms/shape, **bit-identical** to the linear scan | yes |
| next stage's prop layout computed in idle time during the current stage (`warmNextStageArt`) | moves the remaining ~250 ms (≈1 s on a weak phone) off the next stage start | yes |
| HP badge baked per (number, team, flash, device scale) and blitted 1:1 on whole device pixels | 70 → 20 µs per badge; blur probe SHARP on both (0.230 sprite / 0.213 vector) | yes |
| `ctx.font` re-assignment as the badge cost | 0.6 µs of the 70 — **null**, left alone | no |

In game (4× throttle, after the intro skip): worst long task 8.1 s → 1.8–2.3 s,
worst rAF gap 8.1 s → 1.9–2.4 s; the HP badge share of CPU 10 % → ~6 %. Not
measured: a real Mali device (none here) — the steady-state fill cost at
css × DPR is unchanged (no DPR cap, by the sharpness rule).
