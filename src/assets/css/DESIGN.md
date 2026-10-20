# Tree Smashers UI design system

Cozy, family-friendly forest look: warm wood, cream parchment, leaf green,
berry red, sunny gold, sky blue. Flat cartoon shapes, thick dark-brown (ink)
outlines, hard 0-blur drop shadows, stitched-fabric and wood-plank motifs.
No neon, no metal, no runes, no glow.

**Single source of truth**

| What | Where |
| --- | --- |
| Colour tokens, radii (Tailwind v4 `@theme`, also CSS vars on `:root`) | `src/assets/css/tailwind.css` |
| Recipes: buttons, panels, wood, banner, chips, bars, outline text | `src/assets/css/design.sass` |
| Fonts + per-script stacks | `src/assets/css/fonts.sass` |

Use tokens as utilities (`bg-leaf-500`, `text-ink`, `border-wood-700`) or as
vars in scoped sass (`var(--color-leaf-500)`). Never hard-code a hex in a
component; add a token instead.

## Palette

| Role | Token | Hex |
| --- | --- | --- |
| Ink: outlines, shadows, body text | `ink` / `wood-900` | `#3a2314` |
| Muted text | `ink-soft` | `#6b4a33` |
| Wood frame / planks | `wood-800…300` | `#52321d` → `#deb07a` |
| Parchment surfaces | `cream-50…400` | `#fffaf0` → `#dcb46e` |
| Primary / positive / HP | `leaf-300…800` | `#5aae2e` is the base |
| Danger / lose / attack | `berry-300…700` | `#dc4637` is the base |
| Premium / coins / win highlight | `sun-200…600` | `#ffc933` is the base |
| Ads / rewarded video, info | `sky-200…700` | `#2a9fdc` is the base |
| Diamonds / honour / rare (accent only) | `plum-300…700` | `#8e55cf` is the base |
| Arena backdrop | `forest-700…900` | `#1a351d` is the page background |

## Buttons: five colours, one shape

`.ui-btn` plus one tone class (or `FButton tone=…`, `FIconButton type=…`):

| Tone | Class | Use for |
| --- | --- | --- |
| primary | `ui-btn--primary` (leaf) | the main action: play, confirm, save, upgrade |
| secondary | `ui-btn--secondary` (cream, ink text) | neutral actions, back, selects |
| wood | `ui-btn--wood` | HUD icon buttons on the dark arena |
| danger | `ui-btn--danger` (berry) | close X, reset, surrender, delete |
| premium | `ui-btn--premium` (sun gold) | spend coins or diamonds, buy, claim a prize |
| ad | `ui-btn--ad` (sky) | **every** rewarded-video CTA, nothing else |

Shape: `--radius-ui` corners, 3px ink border, flat fill, a lighter inset top lip,
a darker inset bottom band, and a hard 4px ink drop shadow. Pressed state
sinks 3px into the shadow. Focus is a 3px sky outline. Disabled is a flat taupe.
Text is cream with an ink outline (secondary uses ink text).

## Surfaces

* **Modal** (`FModal`): a wooden frame (`wood-600`, 4px ink border, inset light
  and dark bands) around a **cream parchment card** (`.modal-content-slot`,
  `cream-100`, ink text). Content inside a modal is always dark ink on cream.
  Never use white text directly on the card.
* `.ui-panel`: a cream card with a wood border, for cards inside screens.
* `.ui-inset`: a recessed `cream-200` well for list rows, stat boxes and reward tiles.
* `.ui-wood`: a wood plank (cream text) for HUD plates, badges and dark headers.
* `.ui-stitch` / `.ui-stitch-dark`: a dashed "sewn" inner edge (plush motif).
* `.ui-banner` (+ `--berry/--sun/--wood/--sky`): a flat fabric ribbon with
  swallow tails, used for modal titles and the result-screen banner.
  **Art-desk seam**: a painted ribbon can replace its background.
* `.ui-chip` (+ tones): small pills for counters, tags and "FREE"/"AD" stickers.
* `.ui-bar` + `.ui-bar__fill`: a progress bar with a wood well and a leaf fill.

## Type

* Face: **Nunito 900** (self-hosted, OFL) for Latin, Latin-ext, Vietnamese and
  Cyrillic. **Playpen Sans 800** for Greek. CJK, Arabic, Devanagari and Thai use
  OS faces per script (`fonts.sass`). Everything reads `var(--font-game)`.
* No italics and no forced ALL-CAPS for long copy. Short titles may be
  uppercase. Keep `letter-spacing` at or below 0.04em.
* Scale: `.ui-title` (20–32px), `.ui-label` (14–18px), `.ui-body` (13–16px,
  muted). On colour or art use `.ui-outline` / `.ui-outline-sm` (cream text
  with an 8-direction hard ink outline). `.game-text` is the legacy alias.
* Text contrast ≥ 4.5:1: ink on cream is about 13:1, and cream with an ink
  outline holds on any fill.

## Perf rules (hard)

No `filter: blur`, no `backdrop-filter`, no `radial-gradient`, no canvas
`createRadialGradient` / `shadowBlur` / `ctx.filter`. Box and text shadows use
a 0 blur radius only. Prefer flat fills, and use linear gradients sparingly
(scroll-edge fades only).
