# Gameplay video pipeline — Chaos Arena

Portal preview clips and trailers, **generated from the real game** rather than
screen-recorded. Scripted, deterministic, and cheap to re-run after an art or
balance change.

```bash
pnpm preview:video                     # all 8 clips, lossless + high
pnpm preview:video --formats 30s       # just the 1080p trailer pair
pnpm preview:video --scenarios success # one story, every format
pnpm preview:video --no-clean          # with the HUD on, for debugging
pnpm preview:video --help
```

Output (gitignored — a lossless 30 s 1080p master is >100 MB):

```
preview-videos/high/<scenario>-<format>-<orientation>-<W>x<H>.mp4   ← UPLOAD THIS
preview-videos/lossless/…                                          ← archive only
```

**"MP4 · H.264" means the `high` file.** The lossless master is H.264 too, but
4:4:4 — Safari and QuickTime will not play it and many upload validators reject
it on pixel format.

## What gets produced

| format | orientation | pixels    | what it is     |
|--------|-------------|-----------|----------------|
| `10s`  | portrait    | 720x1280  | portal preview |
| `10s`  | landscape   | 1280x720  | portal preview |
| `30s`  | portrait    | 1080x1920 | trailer        |
| `30s`  | landscape   | 1920x1080 | trailer        |

Two scenarios per format — a **success** clip and a **fail** clip. Ship both
and let the portal's A/B decide: a near-miss loss converts differently from a
clean win, and which one wins is not predictable from the armchair.

## The game-side seams

Both are `import.meta.env.DEV` only and absent from every portal build
(verified: `installPreviewSeam` and `aimAtBlade` appear 0 times in a
`build:crazy-web` bundle). That is why this records against the **dev server**.

| seam               | where                                                                                                                  | what                                                                                                                       |
|--------------------|------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `window.__chaos`   | `src/utils/previewSeam.ts`, installed by `SpinnerArena.vue` via a dynamic import inside an `import.meta.env.DEV` guard | snapshot / setStage / seed / begin / freeze / unfreeze / setHp / aim / fire                                                |
| `?clean=1`         | `src/utils/cleanFeed.ts` → `CLEAN_FEED`                                                                                | renderer skips HP rings, selection glow, damage numbers, powerup floats, hint pulse, tutorial arrows, the ⚔ATK/🛡DEF label |
| `?clean=1&rings=1` | same file → `CLEAN_HP_RINGS`                                                                                           | keeps the HP rings in an otherwise clean feed, for a portal whose spec is looser than "no counters"                        |

## Things that will bite you

**The port is 2087, not the skill's 2063.** On this machine 2063 and 2071 are
both already answering with *other games'* dev servers. The `title` check in
`preview.config.mjs` is what catches that — it refuses to record if the page
served is not Chaos Arena. Do not remove it.

**dpr is 1 everywhere, and must stay 1.** `SpinnerArena` sets
`canvas.width = window.innerWidth` verbatim — there is no devicePixelRatio
multiplier in the renderer. A dpr of 2 would hand the game a half-size canvas
and let Chrome upscale the screenshot: a soft 1080p.

**Two separate RNGs, and both need seeding.** `preview.config.mjs`'s
`seedRandom` pins the page's `Math.random` (particles, spawn jitter).
`useDeterministicRng`'s mulberry32 is separate, and `initGame` re-seeds it
*randomly* on every non-PvP match — so `__chaos.seed()` must be called AFTER
the match is built. `boot()` does this in the right order.

**The match intro is 2.1 s** (1600 ms of meteor shower + a 500 ms turn
announcement). `boot()` runs it out in unrecorded real time and freezes on the
first playable frame, so the clip opens mid-fight instead of on a curtain.

**Author HP through `shoot`'s `author` option, never between `shoot` calls.**
Authoring from a beat sheet lands while the previous exchange is still
resolving — blades mid-flight — and the motion already on screen consumes the
board you just staged. This is why an early cut won a match ten seconds into a
clip whose job was to lose.

**Author the WHOLE board every exchange, with exactly one fragile blade.**
Collateral damage routinely kills a blade the beat meant to keep.

**`setHp` accepts fractions above 1, and that is the main lever for a 30 s
clip.** A levelled player team one-shots a *full-HP* stage-17 enemy, so pinning
the enemy line to `1` does not keep it alive — it kills one red per exchange
and ends a six-exchange match in three. Overcharge anything that must still be
standing at the payoff to `2.5`. Invisible: the rings are off.

**Count the cycles before adding an exchange.** The enemy takes one turn *per
living blade*, so the cycle back to the player runs ~4.5 s at 3 v 3, ~6.7 s at
1 v 2 and ~4.7 s at 1 v 1. Six exchanges measured at ~33 s of clip and cost the
30 s success sheet its entire ending; five fits.

**Budget the SLOWER orientation.** The two orientations do not run at the same
pace even though the arena scales to `min(w, h)` in both — the visible extents
either side of it do not, and they feed wall-proximity and the NPC's aim, so
blades bounce and settle differently. Measured on the 30 s fail sheet:
landscape ran ~2.7 s behind portrait by exchange 6, which was enough for the
landscape clip to end at `ex6-mistake@29.3s` with no verdict and no retry — a
fail clip that never shows the fail, while the portrait cut of the same sheet
was fine. Always check the beat list of BOTH orientations, not just the one you
drafted against; a sheet is only correct if its last beat lands in both.

## Authoring loop

```bash
# opening frame only — seconds per cycle
pnpm preview:video --formats 10s --scenarios success --orientations portrait --only-setup

# a fast draft: half the frames, a quarter of the pixels, SAME layout
pnpm preview:video --formats 30s --scenarios success --orientations portrait \
                   --fps 15 --portrait 540x960 --quality balanced

# watch it happen when a beat lands wrong
pnpm preview:video --formats 10s --scenarios success --orientations portrait --headed

# re-derive the phase timings after a balance change
pnpm preview:video --formats 10s --scenarios _diag --orientations portrait --quality balanced
```

Every `shoot` logs the survivors at its beat, so a run that came out wrong says
which exchange killed what.

## Before shipping a clip

Watch it. Nothing here can tell you the clip is boring. Then zoom-check a
handful of frames at full size for any letter, digit, logo, bar or cursor — a
"no text, no UI" spec is checked on pixels, not on intent, and painted art can
carry text baked into the bitmap that no canvas-text gate can reach.

```bash
ffmpeg -i clip.mp4 -vf "select='not(mod(n\,90))'" -vsync 0 f%03d.png
```

Full guidance: the `gameplay-video-pipeline` skill, Phase 4.
