# Art Desk — ready (verified 2026-09-27 with two real Gemini jobs)

Gemini painting for chaos-arena runs through **its own Chrome profile**,
`C:\Users\konst\.art-desk\profiles\chaos-arena` (signed in as Konstantin). It
never touches the shared `~/.art-desk/gemini-chrome` profile or any other project's profile.
Run everything from the repo root, `C:\Users\konst\chaos-arena`.

## 1. Paint: `paint.mjs` (blocking, one job at a time machine-wide for this profile)

```
node tools/art-desk/paint.mjs --prompt-file <ABS .txt> --out <ABS .png> [--ref <ABS layout.png>] [--ref <ABS style.png|.webp>]...
node tools/art-desk/paint.mjs --status      # lock holder, queue length, throttle, window, usage today
```

- **All paths must be absolute.** The prompt file is UTF-8 plain text, sent verbatim.
- **`--ref` order is by role:** the first `--ref` is the LAYOUT/reference sheet, and
  the rest are STYLE/finish refs. **Internally the layout sheet is attached LAST**
  (style refs first, then the layout sheet). Gemini takes the output's shape
  from the last attached image (PROMPT-ANATOMY §12). This was verified: a 4:3 layout
  sent with a square style ref came back 4:3 (1200x896).
  **Word your prompt to match what Gemini sees:** "The first N attached images are
  FINISH references only … The LAST attached image is the LAYOUT reference." With
  one `--ref`, just say "the attached image".
- **stdout is always exactly one line.** On success it is the `--out` path. On failure it is `CODE: detail`.
  Progress goes to stderr (`[paint 12s] …`).

| exit | code                    | what it means / what to do                                                                                                                                                        |
|------|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0    | (the out path)          | done                                                                                                                                                                              |
| 2    | `BAD_ARGS`              | fix the call: missing flag, relative path, missing file                                                                                                                           |
| 10   | `SIGNED_OUT`            | the profile is signed out, or a cookie dialog is up. **Stop and tell the coordinator.** The user runs `node tools/art-desk/paint.mjs --sign-in`, signs in, and closes that window |
| 11   | `QUOTA`                 | Gemini refused ("limit", "try again later"), or it is on Flash-Lite AND refusing uploads. **Stop; don't retry-loop**                                                              |
| 12   | `TEXT_ONLY_AFTER_RETRY` | it answered in words twice, even after the one "generate the image now" nudge. Fix the prompt, then retry at most once                                                            |
| 13   | `TIMEOUT`               | no image within 300 s for one attempt, or the whole call (lock wait excluded) went past 780 s. One retry is fine                                                                  |
| 14   | `BROWSER`               | anything else about the window or page. One retry is fine; if it repeats, report the detail line                                                                                  |

**Every call does this:** opens a NEW chat, attaches the refs, types the prompt, sends, and waits
for the image. The one text-only nudge happens in the same chat. It then downloads the **full-size
original** with Gemini's own download button, converts it JPEG→PNG losslessly (same pixels),
writes `--out` (creating parent dirs), and counts one generation in `~/.art-desk/usage.json`.

### Lock and throttle (cross-process)

- **Callers never fail for "busy".** They queue first-come-first-served (ticket files) and poll every 2 s.
  The lock lives in `<profile>\art-desk-paint\`. A holder whose PID is dead, or
  that has had no heartbeat for 3 min, is broken automatically.
- **Throttle:** after every job that actually sent a prompt, the NEXT job waits **90 s + 0–60 s
  random**. That is DESK.md's default, set in `art-desk.config.json` → `gemini.gapSeconds` / `jitterSeconds`,
  and shared by all callers and the desk.
- **Typical timing:** the job itself takes **~30 s** from start to saved PNG. Measured: 31 s for 1:1 and 28 s for 4:3;
  Gemini
  answered about 6 s after sending. **Effective throughput is about one job every 2–3 min.** With three
  agents queueing, expect waits of several minutes. Run `paint.mjs` in the background and
  do other work, rather than parallelising (it's serialised anyway).
- **The Gemini Chrome stays open between jobs.** It's a headful window, reused through its
  `DevToolsActivePort`. Don't close or kill it; if it's gone, the next job relaunches it.

## 2. Slice: `slice.mjs` (magenta key, grid cut, fit, WebP)

```
node tools/art-desk/slice.mjs --in <painting> --out-dir <dir> [--grid 4x3] [--size 256x256] [--names a,b,…]
                              [--fit trim|cell] [--pad 0.02] [--strip <name>] [--png] [--quality 0.82] [--no-key] [--halo]
```

- **`--grid CxR`** (default `1x1`) cuts equal cells. In `trim` mode each cut line snaps to the nearest clean
  background gap within 12% of a cell.
- **`--names`** gives one name per cell, row by row, with no extension; `-` skips a cell. **The project convention is
  `<id>_256x256`**, e.g. `public/images/models/phoenix_256x256.webp`. The default is `<in-stem>-<n>`.
- **`--fit trim`** (default) crops each cell to its own content and centres it at `--size` with a `--pad`
  margin. Use it for icons, skins and single objects. **`--fit cell`** scales the whole cell uniformly with no
  re-centring. Use it for **animation frames**, so registration holds.
- **`--strip <name>`** also writes all cells left→right as one strip. That's the vfx convention, e.g.
  `--strip big-spark_1280x256` with `--grid 5x1 --size 256x256 --fit cell`.
- **`--png`** also writes a PNG. **`--no-key`** is for opaque art such as backdrops.
- **`--halo`** unmixes magenta from EVERY pixel, not just the 2 px fringe. It's for glowy VFX painted as
  soft light over the ground. **It turns pink/violet paint pale**, so never use it for skins or icons with pinks.
  Without it, pinks and violets survive (verified on rose quartz and amethyst).
- **Output:** stdout lists the files written; the report (ground colour, % keyed, per-cell content box,
  scale, warnings) goes to stderr. Exit 0 = ok, 1 = a cell came out empty or it failed, 2 = bad args.
- **WebP at q 0.82** gives **6–11 kB per 256x256 sprite** (coin 10.7 kB, gems 6–8 kB), in line with the shipped
  models at 4–18 kB.
- **It starts one headless Chrome** on a temp profile, about 3 s per run. For batches of
  several slices, run them **sequentially** or through
  `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- …` (the user's CPU rule).

**Verified:** `coin-raw.png` 1024x1024 → `coin_256x256.webp` 10.7 kB. The edges are clean on both a dark and a
white ground, with no pink fringe. The 4x3 gem sheet at 1200x896 gave 12/12 sprites with correct names, plus a 3072x256
strip.

## 3. Gemini quirks observed (this account, Sept 2026)

- **Output resolution:** 1:1 → **1024x1024**, 4:3 → **1200x896**. DESK.md also lists 2:1 → 1456x720 and
  16:9 → 1376x768 (not re-measured). The download is always **JPEG**; `paint.mjs` stores it as PNG.
  Words don't set the aspect: the last attachment (your layout sheet) does, so draw the layout sheet at the
  aspect you want back. A free-app grid cell at 4:3 is about 300x300 px.
- **Size vs 256 targets:** an object Gemini paints at about 70% of a 300 px cell (about 220 px) gets upscaled 1.1x to
    256. For crisper sprites, ask for objects filling **~85% of their cell**, or use ≤3x3 grids or 1x1
         for hero assets. The slicer warns above 1.15x upscaling.
- **The background is not pure magenta.** Measured #f709f2 and #fb09f6 (G≈9, R/B≈245), with faint JPEG noise.
  The slicer measures the ground from the frame edge, so this is handled.
- **Watermark:** the downloaded full-size originals carry **no visible sparkle**; all corners
  measured flat ground. The sparkle only appears on the app's on-screen preview. `slice.mjs` still
  paints out any isolated mark in the bottom-right 10% box, as a safety net. Keeping the
  bottom-right corner empty costs nothing.
- **Model:** the picker on this profile shows **"3.5 Flash-Lite"**, and it painted fine with 2 uploads.
  Don't change it. (sandbox-tower saw Lite as a quota fallback; here it's only a QUOTA signal when
  uploads fail too.)
- **Signed-out sessions can't upload or paint.** The page asks "Are you signed in?", which gives `SIGNED_OUT`.

## 4. Prompt tips (read `~/.claude/skills/art-generation-pipeline/PROMPT-ANATOMY.md`)

- **§ "The order is load-bearing" and §1:** state the deliverable's SHAPE first: canvas aspect, "N
  separate icons, C across and R down", "Exactly 12. Not 1, not 9, not 16", and "a square canvas is wrong".
  Repeat the shape in §12 OUTPUT at the end.
- **§9:** give size as measured fractions ("about 85% of its cell, centred"), not adjectives. Include
  "Do NOT draw the cells: no boxes, borders, gutters, grid lines, labels or numbers."
- **§10 BACKGROUND, the magenta contract:** copy its bullets (exactly #FF00FF, not pink, not
  transparent/checkerboard, no card or shadow, no magenta in the object, and the palette is for the object, not
  the ground). **For lava/heal FX, read "Glows" and "NOTHING IS EVER SEE-THROUGH"**: soft light
  over magenta can't be keyed cleanly. Keep glows inside the shape, or slice with `--halo`.
- **§8 finish references:** style refs teach finish, never subject. Say "never a subject: do not copy
  its shape/emblem". Use refs of the SAME element or single sprites; shipped `public/images/models/*.webp` work well.
  §8 "Effects: the placeholder is NOTATION" is required reading for VFX sheets.
- **§11:** end with a "BEFORE YOU CALL IT FINISHED" count-and-check list.
- **The failure catalogue** at the end of PROMPT-ANATOMY maps each bad return to the clause that fixes it.
- **Pilot one job per new kind** (one skin, one FX loop) and look at it keyed on the dark arena ground
  before queueing the rest (DESK.md).

## 5. Other entry points

- `node tools/art-desk/paint.mjs --sign-in` opens this profile PLAIN (no automation port) for a Google sign-in.
  Use it only after a `SIGNED_OUT`.
- `pnpm art:paint`, `pnpm art:slice` and `pnpm art:desk` are the npm aliases (`--` before flags under pnpm/npm).
- `pnpm art:desk` serves the Art Desk UI on **http://127.0.0.1:5183/**; 5178 and 5179 are other projects' desks.
  Its queue uses the same lock and throttle as `paint.mjs`. The project has no `art-sheets/` yet, so it lists no jobs.
- Config: `art-desk.config.json` at the repo root (optional; defaults are in `tools/art-desk/config.mjs`).
