# Tree Smashers UI design system: "Toy-box arena", action pass

Bright, saturated, family-friendly, and **physical**. Think Brawl-Stars energy
with plush-toy manners: chunky 3D buttons that really sink when pressed and
spring back, bold collectible cards with rarity edges and flat diagonal
stripes, skewed title plates, thick deep-NAVY outlines, hard 0-blur drop
shadows, royal-blue frames, ice-white cards, punchy yellow, lime CTAs, hot-pink
danger, cyan ads, purple premium. **No brown, no muddy mid-tones**, no neon
glow, no metal, no blur. The forest arena is the stage; the UI is the toy box
on top of it.

Per-element appearance reference: `ui-catalog.md` (repo root).

**Single source of truth**

| What | Where |
| --- | --- |
| Colour tokens and radii (Tailwind v4 `@theme`, also CSS vars on `:root`) | `src/assets/css/tailwind.css` |
| Recipes: buttons, cards, tags, panels, plates, banner, chips, notify, bars, strokes, motion | `src/assets/css/design.sass` |
| Press feel (sink + ticks on every button) | `src/use/useUiPress.ts` (installed once in `App.vue`) |
| UI sounds (synthesised) | `src/use/uiSfx.ts` |
| Count-up numbers | `src/components/atoms/FCountUp.vue` |
| Fonts + per-script stacks | `src/assets/css/fonts.sass` |

Use tokens as utilities (`bg-leaf-500`, `text-ink`, `border-royal-700`) or as
vars in scoped sass (`var(--color-leaf-500)`). Never hard-code a hex in a
component; add a token instead. `wood-*` / `cream-*` are legacy ALIASES of
`royal-*` / `ice-*`. Prefer the new names in new code.

## Palette

| Role | Token | Base |
| --- | --- | --- |
| Ink: outlines, shadows, text on light | `ink` | `#161a40` navy |
| Muted text | `ink-soft` | `#3f4a85` |
| Frames, HUD plates, neutral-on-dark | `royal-300…900` | `#2f4fd6` |
| Readable surfaces | `ice-50…400` | `#eef5ff` |
| Primary / go / positive / HP | `leaf-300…800` | `#55c81e` |
| Coins / claim / win / title plate | `sun-200…600` | `#ffd21a` |
| Danger / close / lose / notify | `berry-300…700` | `#f2306b` |
| Rewarded ads (only) / player side | `sky-200…700` | `#13a3f2` |
| Diamonds / battle pass / rare | `plum-300…700` | `#9c46f0` |
| Disabled / locked (the only grey) | `steel-300…600` | `#aab4cc` |
| Arena backdrop | `forest-700…900` | `#173f20` |

Colour code: coins sun · diamonds plum · ads sky · free leaf · danger berry ·
off steel. Player side sky, enemy side berry (canvas too).

**Rarity edges** (cards, presentation only — never a gameplay stat):
`--rarity-common` sky-300 · `--rarity-rare` leaf · `--rarity-super` royal ·
`--rarity-epic` plum · `--rarity-mythic` berry · `--rarity-legendary` sun.
Apply with `.ui-rarity--<name>` on a `.ui-card`.

## Buttons: seven tones, one shape, one press

`.ui-btn` + tone (`FButton tone=…`, `FIconButton type=…`): `primary` leaf ·
`secondary` ice (navy text) · `royal` (alias `wood`) · `danger` berry ·
`premium` sun · `plum` · `ad` sky (every rewarded-video CTA, nothing else).

Shape: 3px navy outline, `--radius-ui`, flat fill, a 3px bright top lip, a white
gloss band over the top ~1em (a 0-blur inset shadow), a darker inner depth band,
and a **thick hard navy lip** under it (`--btn-depth`, 6px; 8px on the hero,
5px on icon buttons).

| State | Look | Motion |
| --- | --- | --- |
| idle | as above | hero only: heartbeat on the wrapper (`.ui-breathe`) + shine sweep |
| hover (pointer devices) | face one step lighter (`--btn-hi`), lifts 2px, lip grows 2px | spring |
| **pressed** (`:active` / `.is-pressed`) | sinks into its lip (`translateY(depth − 2px)`), 5 % squash, inner band and lip shrink to 2px | **70 ms down**, then a back-out spring release that overshoots ~1px above rest |
| focus-visible | 3px sun ring, 3px offset | — |
| disabled / `.is-disabled` | flat steel, sunk 3px, a faint diagonal hatch, light text | a tap answers with a sideways shake (`.ui-deny`) + the `deny` bonk |

`.is-pressed` is set by the global press handler on pointerdown and held for at
least 90 ms, so even a 30 ms phone tap visibly sinks. A disabled FButton keeps
pointer events (it is `aria-disabled`), so the refusal can play.

**One hero CTA per screen**: `FButton variant="brawl"` → `.ui-btn--hero
.ui-shine` inside a `.ui-breathe` wrapper (4px outline, 8px lip, uppercase, heavy
stroke, two flat diagonal stripes at the right end, a double-strip shine sweep).

## Cards, tags, surfaces

* **`.ui-card`**: ice face, 3px ink outline, a rarity edge (3px inner ring + a
  7px base band), a triangle of flat diagonal stripes in the top-right corner,
  4px hard drop. `.ui-card--interactive`: hover lifts 3px and tilts −1°, press
  sinks 3px with a 2 % squash.
* **`.ui-tag`**: a skewed (−10°) display plate behind upright text — modal
  titles, stage labels, turn banners, "NEW!". Tones `--leaf/--berry/--royal/--sky/--plum/--ink`, default sun. Its plate is striped.
* **Modal** (`FModal`): a striped royal frame (4px navy, light lip, a lighter
  header band, a dark bottom slab) around an **ice card**; the title is a sun
  `.ui-tag` that drops in with a swing; the frame swings into place (−3° → 0°)
  inside the pop; the close X is a danger icon button whose glyph turns 90° on
  hover.
* `.ui-panel` ice card · `.ui-inset` recessed well · `.ui-plate` / `.ui-wood`
  royal plate · `.ui-plate--dark` navy counter plate · `.ui-striped` stripe
  texture.
* `.ui-banner` (+ tones): a striped ribbon with swallow tails (result banners).
  **Art-desk seam**: a painted ribbon can replace its background.
* `.ui-chip` (+ tones, `.ui-chip--angled` parallelogram) · `.ui-notify` (a
  berry "!" dot that hops and tilts) · `.ui-bar` (navy well, striped lime fill
  that springs to its width).

## Type

* Face: **Nunito 900** (self-hosted, OFL) for Latin, Latin-ext, Vietnamese and
  Cyrillic; **Playpen Sans 800** for Greek; OS faces per script for CJK, Arabic,
  Devanagari and Thai. Why it was kept over a "Brawl" display face: `ui-catalog.md` §1.3.
  Canvas text uses `900 …px Nunito, Arial, sans-serif`.
* The punch comes from treatment: `.ui-outline` / `-sm` / `-lg` / `-xl` / `-sun`
  (white or sun text, an 8-direction hard navy stroke + drop), `.ui-num`
  (tabular numbers). Hero CTAs and modal titles are uppercase.
* No italics (skew the PLATE, never the letters). `letter-spacing` ≤ 0.04em.
* Contrast ≥ 4.5:1: navy on ice is about 15:1, `ink-soft` on ice about 7:1, and white
  with a navy stroke holds on any fill.

## Motion

Transform and opacity only (plus the individual `translate` property for the
deny shake, so it composes with a press).

* Press: 70 ms down, back-out spring up (`--ui-spring`).
* Entrances: modal pop + swing, `.ui-drop-in` (titles, ribbons), `.ui-slam`
  (big titles and numbers crash in from 2× and settle), `.ui-pop-in` stagger
  (`--i` × 45 ms) for grids and lists.
* Feedback: `.ui-bump` when a value lands, `.ui-deny` on a refused tap.
* Idle: `.ui-shine` (2.8 s), `.ui-breathe` heartbeat on the hero (2.6 s),
  `.ui-notify` hop (1.6 s), `attention-bounce` for "claim me".
* Numbers count, they don't jump: `FCountUp` (ease-out, 0.35–1.1 s by size,
  pitched ticks, a bump + ting on landing, `n()`-formatted per locale).
* `prefers-reduced-motion`: every idle loop and entrance stops; presses stay
  (short, ease-out, no overshoot); count-ups jump to the value.

## Sound

UI sounds are **synthesised** on the shared AudioContext (no files, nothing to
preload): `press` (woody tock), `pressHero` (deeper thunk), `release` (small
rising pip on a completed click), `toggleOn` / `toggleOff`, `tab`, `open` /
`close` (modal), `tick` (count-up, pitch rises), `reward` (two-note ting),
`deny` (dull double bonk), `slide` (slider notch).

* Levels: a press sits ~4 dB RMS under a battle clash at the same SFX-slider
  position; release, ticks and slider notches 8–13 dB under that.
* Gates: SFX slider at 0 (also the platform-mute path), platform pause
  (`isGamePaused`), any ad in flight (`adsInFlight` → `setUiSfxSuppressed`),
  a not-yet-running AudioContext (the tap wakes it and stays silent).
* Spam: one voice per sound per 40–160 ms, at most 4 UI voices at once; a
  touch inside a scroller defers its tick to the click, so flicking a list is
  silent.
* Opt-outs on any ancestor: `data-sfx="off"`, `data-sfx="self"` (component plays
  its own), `data-sfx="<name>"` (override).

## Hard rules

No `filter: blur`, `backdrop-filter` or `radial-gradient`, and no canvas
`createRadialGradient` / `shadowBlur` / `ctx.filter`. Box and text shadows use
a 0 blur radius only (`tests/uiStyleRules.test.ts` enforces both). Highlight
bands are inset shadows. Linear gradients only with **hard stops** (stripes,
shine strips) or for scroll-edge fades and the loader bar — never a soft colour
ramp as a fill.
