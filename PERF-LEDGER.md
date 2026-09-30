# Perf experiment ledger — Chaos Arena

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

## Rejected / not attempted, with reasons

| Idea                                                                              | Why not                                                                                                                                                                                 |
|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Object pools for particles / damage numbers (catalogue B1)                        | GC is < 0.2 % of main-thread time. Wrong column.                                                                                                                                        |
| Zero-allocation hot loops (B2)                                                    | Same — heap slope is high but costs nothing here; the readability tax buys nothing.                                                                                                     |
| Remove the per-blade `ctx.clip()`                                                 | Measured null (32.5 → 32.2 fps).                                                                                                                                                        |
| Cap DPR (A8)                                                                      | Already effectively capped: the canvas backing store is sized in **CSS** pixels (`canvas.width = visualViewport.width`), so it never rasterises at DPR 2 or 3 to begin with.            |
| Move blade state off deep-reactive `ref([])` (framework in the hot path)          | Looked like the obvious structural win. The trace said otherwise while raster dominated. **Now worth revisiting** — the post-fix trace is 39 % FunctionCall, so JS is the new top cost. |
| Cache bouncer sprites (2 gradients + a `shadowBlur` stroke per bouncer per frame) | Not measured yet. Bouncers were absent from the stage-1 ablation set, and stage 48 already clears 54 fps at 4×. Next candidate if a later trace asks for it.                            |

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
