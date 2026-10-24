# Tree Smashers UI design system: "Toy-box arena", action pass

Bright, saturated, family-friendly, and **physical**. Think Brawl-Stars energy
with plush-toy manners: chunky 3D buttons that really sink when pressed and
spring back, bold collectible cards with rarity edges and solid corner
notches, skewed title plates with a two-tone facet, thick deep-NAVY outlines, hard 0-blur drop
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
Apply with `.ui-rarity--<name>` on a `.ui-card`. Name the tier with
`.ui-rarity-name .ui-rarity-name--<name>` + `t('rarity.<name>')` (a small skewed
faceted plate in the tier colour). Smashers: `smasherRarity(unlockStage)`;
skins: `skinRarity(modelId)` (default common · regular rare · ad-unlock super ·
special epic · trophy legendary) — `src/data/smasherRarity.ts`.

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

**Hold to confirm** (`FHoldButton`): the last step of a destructive action
(Reset progress, Surrender → Quit) is held while a sun ring draws around the
button; a tap shakes it and flashes the "Hold to confirm" pill; keyboard / AT
activation (`click` with `detail === 0`) confirms at once.

**One hero CTA per screen**: `FButton variant="brawl"` → `.ui-btn--hero
.ui-shine` inside a `.ui-breathe` wrapper (4px outline, 8px lip, uppercase, heavy
stroke, two flat speed slashes at the right end, a double-strip shine sweep).

## Cards, tags, surfaces

* **`.ui-card`**: ice face, 3px ink outline, a rarity edge (3px inner ring + a
  7px base band), a solid dog-ear notch in the rarity colour in the top-right
  corner, a faint two-tone facet on the face,
  4px hard drop. `.ui-card--interactive`: hover lifts 3px and tilts −1°, press
  sinks 3px with a 2 % squash.
* **`.ui-tag`**: a skewed (−10°) display plate behind upright text — modal
  titles, stage labels, turn banners, "NEW!". Tones `--leaf/--berry/--royal/--sky/--plum/--ink`, default sun. Its plate is
  solid with a two-tone facet, a bevel lip and a light inner keyline.
* **Modal** (`FModal`): a solid royal frame (4px navy, light lip, a lighter
  header band ended by one hard dark bevel line, a light inner keyline, two
  sparkles, a dark bottom slab) around an **ice card**; the title is the sun
  `FRibbon` (straight face, folded tails) that drops in with a swing; the frame swings into place (−3° → 0°)
  inside the pop; the close X is a danger icon button whose glyph turns 90° on
  hover.
* `.ui-panel` ice card · `.ui-inset` recessed well · `.ui-plate` / `.ui-wood`
  royal plate · `.ui-plate--dark` navy counter plate · `.ui-faceted` facet
  finish · `.ui-sparkle` (+ `--sun`) twinkle · `FlatRays` solid-wedge sunburst.
* **Ribbon** (`FRibbon`, tones sun / leaf / berry / royal / sky / plum / ink):
  THE title banner — modal titles, result / reward ribbons, the gift reveal's
  kicker, the turn banners, the boss-trophy label. A STRAIGHT faceted face
  (1.9 em high, 3 px navy outline, light top bevel, dark bottom band, inner
  keyline, 4 px drop) with crisp FOLDED TAILS drawn as navy-stroked SVG (a
  swallow notch outside, a darker fold triangle under each corner), all in em
  of the ribbon's font size, so the tails are identical at every size; one
  line, centred, padding wider than the tails' tuck. The old `.ui-banner` CSS
  recipe is gone. `.ui-tag` stays for small labels (stage hint, speaker
  name, surrender question).
  **Art-desk seam**: a painted ribbon can replace its background.
* `.ui-chip` (+ tones, `.ui-chip--angled` parallelogram) · `.ui-notify` (a
  berry "!" dot that hops and tilts) · `.ui-bar` (navy well with five segment notches, solid lime fill
  that springs to its width).

## Surface finishes (#UX1c): stripes mean "off"

| Token | Look | Use |
| --- | --- | --- |
| `--ui-facet` | a flat two-tone split, the upper-left facet one step lighter (hard edge) | every coloured plate, badge, tag, chip, banner, pill |
| `--ui-facet-ink` | the lower-right facet a hair darker | ice / sun-light surfaces (cards, tiles, peeks) |
| `--ui-hatch` / `--ui-hatch-light` | diagonal hatch (dark on light / light on a dark well) | **only** disabled / locked states |
| `--ui-segments` | vertical notch ticks in fifths | progress tracks |
| `--ui-sparkle-svg` / `--ui-sparkle-sun-svg` | flat four-point twinkle, navy keyline | `.ui-sparkle` |

Corners of collectible cards / tiles: a solid dog-ear notch (clip-path) in the
edge colour, never a stripe triangle. Glows are FLAT RAYS (`FlatRays`, or
`RewardStage` behind rewards): wide white wedges at low opacity plus thin
near-opaque streaks in the accent — never a thin translucent warm colour over
navy or green (it mixes to mud). A guard in `tests/uiStyleRules.test.ts` fails
on `--ui-stripes`, on any diagonal `repeating-linear-gradient` outside the
tokens, and on a hatch outside a disabled / locked rule.

**Stitches are for fabric only** (#UX1c owner rule): a dashed seam belongs to
things that ARE fabric — the plush smashers, plush trees / props, felt disc
rims (their own art / canvas rig). Hard UI objects — buttons, cards, badges,
panels, gauges, bars, chests, the roulette wheel (rim, hub, pointer), medallions
— get solid hard bevels and outlines. `.ui-stitch` / `.ui-stitch-dark` are
gone; the style guard fails on a dashed border / outline or a two-value SVG
dash pattern in UI files (a one-value `stroke-dasharray` driving a progress
ring with `stroke-dashoffset` is fine).

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

Transform and opacity only. The one-shot classes animate the INDIVIDUAL
`translate` / `rotate` / `scale` properties (never `transform`), so they
compose with an element's own transform: a skewed plate keeps its lean while it
bumps, a press keeps its sink while it shakes.

* Selection: the segmented switch and the tabs have one puck that SLIDES to
  the picked option (back-out spring) instead of a per-option pop.
* Coin landings: each particle that reaches the HUD badge plays a rising
  `tick`, and the badge's count runs while they land.

* Press: 70 ms down, back-out spring up (`--ui-spring`).
* Entrances: modal pop + swing, `.ui-drop-in` (titles, ribbons), `.ui-slam`
  (big titles and numbers crash in from 2× and settle), `.ui-pop-in` stagger
  (`--i` × 45 ms) for grids and lists.
* Feedback: `.ui-bump` when a value lands (`.ui-bump--punch` for a level-up),
  `.ui-deny` on a refused tap.
* Idle: `.ui-shine` (2.8 s), `.ui-breathe` heartbeat on the hero (2.6 s),
  `.ui-notify` hop (1.6 s), `attention-bounce` for "claim me", `.ui-sparkle`
  twinkle (2.6 s, offset with `--sp-delay`) on titles and claimable rewards.
* Modals: the dim fades (never scales); the modal pops up from 60 % with a
  back-out overshoot and drops away on close.
* Long press = peek (`useLongPressPeek`, 420 ms): roster cards, skin cards,
  battle-pass skin tiers, league opponents. A move > 10 px cancels, the release
  never clicks, ContextMenu / Shift+F10 toggles, Esc closes.
* Confirmations: `showHudToast(text)` — one line under the HUD, 2.4 s.
* Scroll bodies (FModal): NO overlay on the scrolling content — the old
  sticky fade band drew a seam across positioned children; content passes
  cleanly under the card's clipped edge, the game scrollbar is the cue.
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

## Regression check

`dev/ui-kit.html` renders every tone × state (idle / hover / pressed /
disabled / focus), the hero, icon buttons, pucks, switches, slider, rarity
cards, plates, composites (team card, reward plate, HUD toast) and the hold
button, frozen. `dev/ui-screens.html?screen=` mounts the deep-run moments
(boss defeated / intro, win / lose, gift reveal, a sample modal, coin pop) for
screenshots. `pnpm ui:diff` screenshots each
block and compares it with `tools/ui-kit-diff/baseline/` (`--update` after an
intended change, `--probe` for the sharpness check). Run it after touching this
file, `design.sass` or an F-component.

## Hard rules

No `filter: blur`, `backdrop-filter` or `radial-gradient`, and no canvas
`createRadialGradient` / `shadowBlur` / `ctx.filter`. Box and text shadows use
a 0 blur radius only (`tests/uiStyleRules.test.ts` enforces both). Highlight
bands are inset shadows. Linear gradients only with **hard stops** (facets,
the "off" hatch, segment ticks, shine strips) or for scroll-edge fades and the loader bar — never a soft colour
ramp as a fill.
