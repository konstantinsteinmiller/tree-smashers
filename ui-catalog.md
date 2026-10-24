# Tree Smashers — UI catalog and appearance reference

What this file is: every UI element in the game, what it does, a Brawl-Stars-pro
critique ("how do I make this cool and exciting to watch while it still does its
job?") and the **target spec** it is built to — look AND interaction (idle,
hover, pressed, disabled, focus). Tokens are in `src/assets/css/tailwind.css`,
shapes in `src/assets/css/design.sass`, rules in `src/assets/css/DESIGN.md`.

History:

1. **Pass 1 — "no more mud"**: *"the brown base colour of buttons and badges and
   everything looks so muddy."* The brown ink + wood planks + cream parchment
   became navy ink, royal frames, ice cards and seven bright tones.
2. **Pass 2 — "action UI"** (this spec): *"ok and way better, but doesn't scream
   cool and edgy, I want to click and watch it."* Everything got PHYSICAL: buttons
   that really sink into a thick lip and spring back, bold collectible cards with
   rarity edges and diagonal stripes, skewed title plates, slam / drop / count-up
   entrances, and soft synthesised UI ticks.
3. **Pass 3 — #UX1b, second action-UI pass**: one selection puck that SLIDES
   (speed switch, modal tabs); coins land with a tick each and the coin badge
   counts while they land; rarity NAMES on every card and a rarity-coloured
   burst in the gift reveal; skin cards flip over when bought; motion classes on
   the individual `translate` / `rotate` / `scale` properties; a long-press
   stats peek on roster cards; hold-to-confirm on Reset / Quit; battle-pass
   **Claim all** with one combined reveal; a screenshot-diff harness for the kit.
4. **Pass 4 — #UX1c, third action-UI pass**: *"I don't really like the striped
   background of badges and FModal content and Boss defeated background."*
   Diagonal stripes now mean ONE thing — **"off"** (disabled, locked). Every
   plate, badge, chip, tag, banner, modal frame and the boss slash got a
   cleaner premium finish: solid fills with a flat two-tone **facet**, hard
   bevel lines, solid dog-ear **corner notches**, flat four-point **sparkles**
   and **flat rays** as solid wedges. Plus: a "+N" coin pop, battle-pass
   Claim all for the honour track alone + a HUD toast, long-press **peeks** on
   skins, battle-pass skin tiers and league opponents, a **rarity filter** on
   the roster, localised rank numbers, a modal open / close choreography, a
   royal celebration stage, and composites in the kit diff (§9). Owner
   follow-ups in the same pass: *"the ribbon design looks weird"* → one
   straight ribbon with folded SVG tails (`FRibbon`) everywhere a title
   banner is used; *"a bad line when scrolling"* (team modal) → the modal
   body's sticky fade overlay is gone; *"deselect smasher 2 and 3"* → an ✕ /
   + on slot 2 / 3 cards.

---

## 1. Design language: "Toy-box arena", action pass

Brawl-Stars energy with plush-toy manners: bright, saturated, high-contrast,
chunky and **tactile**. Cute-but-angry, never scary: no skulls, no metal, no
neon glow, no blur.

### 1.1 Palette (tokens)

| Role | Token | Base hex | Use |
| --- | --- | --- | --- |
| **Ink** (outline, hard shadow, text on light) | `ink` | `#161a40` deep navy | every outline, lip and drop shadow |
| Muted text | `ink-soft` | `#3f4a85` | secondary copy on ice (7.4:1 on `ice-100`) |
| **Royal** (frames, HUD plates, neutral-on-dark buttons) | `royal-300…900` | `#2f4fd6` (600) | modal frame, HUD plates, tabs |
| **Ice** (readable surfaces) | `ice-50…400` | `#eef5ff` (100) | modal card, rows, wells, secondary button, card faces |
| **Leaf** (primary / go / positive / HP) | `leaf-300…800` | `#55c81e` (500) | confirm, fight, "your turn", claimed stamps |
| **Sun** (coins, claim, win, headline accent) | `sun-200…600` | `#ffd21a` (400) | coin UI, claim, title plates, selected cards, "today" |
| **Berry** (danger, close, lose, notify, boss) | `berry-300…700` | `#f2306b` (500) | X, surrender, reset, "!" dots, enemy side, boss plates |
| **Sky** (rewarded ads only, plus player side) | `sky-200…700` | `#13a3f2` (500) | every "watch an ad" CTA, own leaderboard row |
| **Plum** (diamonds, battle pass, rare) | `plum-300…700` | `#9c46f0` (500) | diamonds, honour track, skin days, epic edge |
| **Steel** (disabled / locked, the only grey) | `steel-300…600` | `#aab4cc` (400) | disabled buttons, locked cards, unaffordable |
| Forest (arena backdrop) | `forest-700…900` | `#173f20` (900) | page background under the canvas |

`wood-*` and `cream-*` survive only as **aliases** of `royal-*` / `ice-*`.
Currency colour code (never mixed): **coins = sun**, **diamonds = plum**,
**honour = plum light**, **ads = sky**, **free = leaf**, **danger = berry**,
**off = steel**.

**Rarity edges** (presentation only, derived from the smasher's unlock stage in
`src/data/smasherRarity.ts`; league cards use difficulty / tier colour instead):
common sky-300 (stages 1–5) · rare leaf (6–11) · super royal (12–20) · epic plum
(21–30) · legendary sun (31+); mythic berry is reserved.
**Skins** get a tier from how they are obtained (`skinRarity`): a top part's free
default common · regular 300-coin skin rare · 2026-09 ad-unlock expansion super ·
special-VFX skin epic · earn-only boss trophy legendary.
**Rarity names** (`.ui-rarity-name` + `--<tier>`, i18n `rarity.<tier>`): a small
skewed faceted plate in the tier colour with white stroked caps ("RARE",
"EPIC"…), on every roster / team card (hanging over the base band like a
trading-card banner), next to the level chip in the detail panel, on skin-picker
cards, in the long-press peek and under every skin in the gift reveal.

### 1.2 Buttons: chunky 3D toys that really press

One shape (`.ui-btn` + tone), one press (global handler `useUiPress.ts`):

* 3px navy outline (4px on the hero), flat fill, 3px bright top lip, white gloss
  band over the top ~1em (0-blur inset), a darker inner depth band, and a
  **thick hard navy lip** below: 6px (hero 8px, icon 5px).
* Text: white, 900, 8-direction hard navy stroke + drop. Secondary (ice) uses
  navy text without stroke. Hero: uppercase, heavier stroke.

| State | Look | Motion / sound |
| --- | --- | --- |
| idle | as above | hero only: heartbeat on the wrapper (2.6 s) + double-strip shine (2.8 s) |
| hover (pointer only) | face one step lighter, +2px lift, lip +2px | spring |
| **pressed** | sinks into the lip (depth − 2px), 5 % squash, bands shrink to 2px | **70 ms down** · `press` tick (hero: deeper `pressHero` thunk) · held ≥ 90 ms so a quick phone tap still shows |
| release (click) | springs back, overshooting ~1px above rest | back-out spring 260 ms · tiny rising `release` pip |
| focus-visible | 3px sun ring, 3px offset | keyboard Enter / Space give the same sink + ticks |
| disabled | flat steel, sunk 3px, faint diagonal hatch, light text | a tap shakes it sideways (`.ui-deny`) + dull `deny` bonk |

Tones, one meaning each: primary leaf · secondary ice · royal · danger berry ·
premium sun · plum · ad sky. **Hero CTA** (`variant="brawl"`): one per screen. A disabled premium button ("can't afford") stays sun yellow, sunk with the hatch, its price in berry pink — verified in #UX1b on the Team level-up hero, the skin-picker buy buttons and both Background-skin price buttons (coins and diamonds), and in the kit sheet. Daily rewards' Collect and the diamond shop packs never have a can't-afford state (Collect hides once claimed; packs are real money).

**Hold to confirm** (`FHoldButton`, the LAST step of a destructive action —
Reset progress 1.2 s, Surrender → Quit 0.7 s): a danger button you hold while a
sun ring draws itself around it; it fires when the ring closes. Letting go
fades the ring out; a plain tap shakes the button (`deny` bonk) and the navy
"Hold to confirm" pill under it hops berry. Keyboard / switch / screen-reader
activation (a click with `detail === 0`) confirms at once — the dialog already
is the confirmation. The pill is the button's `aria-describedby`. A rising
`tick` per quarter of the ring; reduced motion keeps the (linear) ring, drops
the hop.

### 1.3 Type

**Decision: keep Nunito 900.** Alternatives checked: *Lilita One* and
*Luckiest Guy* (the obvious Brawl-Stars-alikes) have no Cyrillic, Greek or
Vietnamese, so ru/uk/bg/kk/uz/vi and eight more locales would fall back
to a system face mid-UI (the "ransom note" this project already fought).
*Fredoka* has no Cyrillic or Vietnamese. *Baloo 2* is heavy enough but has no
Cyrillic either and adds about 40 KB. Nunito 900 already covers Latin, Latin-ext,
Vietnamese and Cyrillic, it is self-hosted and subset (latin is about 14 KB),
and its rounded terminals are the "cute" half of the brief. The "edgy" half
comes from treatment, not the face: thick hard navy strokes (`--ui-stroke-sm`
→ `-xl`), uppercase on heroes and titles, tabular numbers (`.ui-num`) that
**count** instead of jumping, sun yellow for headline numbers, and **skewed
plates behind upright letters** (never italic glyphs). The canvas uses Nunito 900 too.

Scale: `.ui-title` (21–34 px) · `.ui-label` (14–18) · `.ui-body` (13–16, muted)
· `.ui-num`. Display treatments: `.ui-outline-sm/‑/‑lg/‑xl`, `.ui-outline-sun`.

### 1.4 Surfaces and shapes

* **Modal**: solid royal frame (4px navy, lip, a lighter header band ended by
  one hard dark bevel line, a thin light inner keyline, dark slab, hard drop,
  two sparkles in the band) around an **ice card**. Title = the sun
  **`FRibbon`** (straight face, folded tails) that drops in with a swing and
  twinkles on two corners. X = berry icon button (sun focus ring on its 3D
  body). The scrolling body has no overlay (no fade band → no seam).
* **`.ui-card`** (collectible): ice face, ink outline, rarity edge (inner ring +
  thick base band), a solid dog-ear corner notch, a faint facet, 4px drop; interactive cards lift/tilt on
  hover and sink on press.
* **`.ui-tag`**: skewed (−10°) faceted plate (bevel lip + light inner keyline) behind upright text (titles, stage
  labels, turn banners, "NEW", difficulty tags).
* `.ui-panel` · `.ui-inset` · `.ui-plate` / `.ui-plate--dark` · `.ui-banner`
  → replaced by **`FRibbon`** (§9) · `.ui-chip` (+ `--angled`) · `.ui-notify`
  · `.ui-bar` (navy well, solid lime fill that springs, five segment notches) · `.ui-faceted`
  · `.ui-sparkle` (+ `--sun`) · `FlatRays` (solid-wedge sunburst).

### 1.5 Motion (juicy but cheap)

Transform and opacity only. The one-shots (`.ui-pop-in`, `.ui-slam`,
`.ui-drop-in`, `.ui-bump`, `.ui-bump--punch`, `.ui-deny`) animate the
INDIVIDUAL `translate` / `rotate` / `scale` properties, never `transform`, so
they compose with whatever the element already wears — a skewed plate keeps its
lean while it bumps (the level chip's level-up punch is plain `.ui-bump--punch`
now), a centred badge stays centred while it slams, a hover lift survives a pop.
Entrances still use `backwards` fill.

* Press 70 ms down, spring up. Modal pop + frame swing (−3° → 0°).
* `.ui-drop-in` (ribbons, plates) · `.ui-slam` (titles / verdicts / big numbers
  crash in from 2× and settle) · `.ui-pop-in` stagger (`--i` × 45 ms) on grids,
  lists, rows · `.ui-bump` when a value lands · `.ui-bump--punch` (1.5× with a
  twist: level-up) · `.ui-deny` on a refused tap.
* Selection pucks: the speed switch and the modal tabs have ONE raised indicator
  that slides (back-out spring, ~0.35 s) to the picked option, measured from the
  option's layout box.
* Idle: shine, hero heartbeat, notify hop-and-tilt, `attention-bounce` "claim me".
* `FCountUp`: ease-out 0.35–1.1 s by size, pitched ticks, bump + ting on landing.
* `prefers-reduced-motion`: idle loops and entrances stop, presses stay short
  with no overshoot, count-ups jump. The low-quality tier drops stage punches.

### 1.6 Sound (`src/use/uiSfx.ts`)

Synthesised on the shared AudioContext (no files): `press` woody tock ·
`pressHero` deeper thunk · `release` pip · `toggleOn`/`toggleOff` two-note blips ·
`tab` light tick · `open`/`close` airy pop · `tick` count-up / roulette peg ·
`reward` two-note ting · `deny` double bonk · `slide` slider notch.
**Coin landings** (#UX1b): every coin / diamond particle that reaches its target
plays a `tick` whose pitch rises across the shower (1 → 1.5, diamonds a quarter
higher); the per-sound throttle turns a 20-coin burst into ~7 ticks.
A press is ~4 dB RMS under a battle clash at the same slider; release / ticks
8–13 dB lower. Silent at SFX 0 (= platform mute), during platform pause, while
any ad is in flight, before the AudioContext runs. One voice per sound per
40–160 ms, max 4 UI voices; touch inside a scroller ticks on the click, not on
touch-down, so flicking lists is silent. Existing file SFX (`happy`,
`celebration-1`, `reward-continue`) stay where they were; UI sounds never double them.

### 1.7 Hierarchy rule

**One hero CTA per screen** (heartbeat + shine). Everything else is quieter and
tone-coded. Ads are always sky, money sun, danger berry, off steel — the screen
reads by colour before it is read.

### 1.8 Perf / owner rules (hard)

No `filter: blur`, `backdrop-filter` or `radial-gradient`, no canvas
`createRadialGradient` / `shadowBlur` / `ctx.filter`, no blurred box/text-shadow
(`tests/uiStyleRules.test.ts`). Linear gradients only with **hard stops**
(stripes, shine strips) or for scroll-edge fades and the loader bar.

---

## 2. HUD (in the arena)

| Element | What it does | Pro critique | Target look | Interaction |
| --- | --- | --- | --- | --- |
| **Stage badge** (`StageBadge.vue`) | current stage, top-left | progress brag read as furniture | faceted royal plate (boss: berry plate); the number on an **angled shield** in the arena colour (upright digits, lip, base band, drop); "STAGE n" white stroke, name ice-200 | shield pops in tilted (0.6 → 1.2 → 1) on every stage change; not interactive (debug tap chord only) |
| **Coin badge** (`CoinBadge.vue`) | coin balance | numbers jumped; a gain counted before its coins had even flown | faceted royal plate, coin overlapping the left edge, white tabular number | **"+N" sun pop** (#UX1c): a skewed sun chip with the coin pops out left of the badge as a gain starts counting (summed while up, teleported above overlays; reduced motion: fade only) · a GAIN waits for its coins: the count starts on the first coin landing and runs across the shower (each landing ticks and nudges the coin icon); while the gift reveal covers the screen the gain holds, then counts once it closes; with no burst coming it counts after a 160 ms beat; never held > 2.6 s once it could start; spends count at once in white; instant on mount / reduced motion |
| **Treasure chest** (`TreasureChest.vue`) | timed free chest | "ready" didn't scream; the old chest was dark brown wood + metal | a bright toy chest from the HUD icon family (`UiIcon chest`: honey-orange planks, sky bands, sun lock plate, no stitches / metal) · cooldown: still chest, darkening ring, time on a navy chip; amount on a navy chip (small) or angled faceted sun chip (big) | ready: berry "!", hop-and-rattle every 2.4 s (twice as eager for the big payout); one ting when it ripens during play; press squash + tick; cooldown taps silent |
| **Skin chest timer** (`SkinChestTimer.vue`) | 20 h skin cycle | should stay quiet | cooking: no motion, tabular time on a navy chip | ripe: berry "!", skin hops and spins every 2.2 s, time chip turns sun; press squash + tick |
| **Surrender flag** (`SurrenderIcon.vue`) | give up | danger must look dangerous, not inviting | berry icon button, no idle motion, aria-label | hover: flag flutters · press sinks · confirm dialog: ice card swings in, question on a berry angled tag, Cancel secondary, **Quit = hold-to-confirm** (0.7 s ring; keyboard confirms at once), open/close sounds |
| **Ad coin button** (`AdRewardButton`) | rewarded coins | correct colour, flat | sky icon button, shine while available | press sinks; unavailable steel |
| **1x / 2x speed switch** (`FButtonSwitch`) | sim speed | selected state weak; per-segment pop | recessed navy well; ONE **raised lime puck** (lip, gloss, drop) under the active option | the puck **slides** to the new option (back-out spring 0.34 s), the label turns white as it arrives; idle labels lift on hover, squash on press; `tab` tick; disabled faded hatch |
| **FREE sticker / coin-price sticker** (speed switch) | free boost / coin price | soft sheen broke the no-ramp rule | FREE: leaf chip with a pulse + **hard double-strip** sheen; price: steel token | none (labels) |
| **Settings / mute** (`FIconButton`, `FMuteButton`) | options / sound | emoji speaker looked different per OS | royal icon squares; mute = round token with an **SVG** speaker: royal + waves when on, **berry + slash** when muted | painted icon tilts −8° and grows 10 % on hover; sinks on press |
| **Team / leaderboard / league HUD buttons** | open screens | all equal weight; the team button's grey multi-gear "upgrade" badge did not say "smashers" | royal icon squares with the **HUD icon family** (below): team = **upgrade** (a smasher's disc with a white paw + a leaf up-arrow), leaderboard = **trophy** (sun toy-plastic cup, white star, royal base); league = faceted royal token with the **league shield** (sky rim, royal face, sun star, white wings, crown) and the player's tier as the top lip + a tier-coloured chip with the division / #N; berry `.ui-notify` for anything new; aria-labels "Team" / "Leaderboard" / the league rank line | lift / sink; painted icon tilts −8° and grows 10 % on hover; league hops + gift bubble bobs while a season reward waits; no fights left → steel lip + chip |
| **PvP HUD button** (`PvPButton`) | open PvP | label was hardcoded | royal square with a berry inner "fight" ring, ⚔️ + "PvP" (`pvp.short`), aria-label `pvp.title` | sinks on press |
| **Daily rewards HUD button** | open daily rewards | claimable must pop | leaf 3D button (HUD-family **gift**: berry box, sun ribbon + bow, no green — `UiIcon daily`; +N) with a berry "!" sticker | bounce lives on the wrapper so the press still sinks |
| **Battle pass HUD button** | open battle pass | — | royal 3D button (HUD-family **ticket**: sun ticket, white star with a berry dot, solid tear rule — `UiIcon battlepass`; n/total) with a berry count sticker | bounce on the wrapper; press sinks |
| **Background-skin button** (`BGSkinButton`) | arena backgrounds | — | royal frame | sinks into its drop on press; hover scale |
| **Combat log button + feed** (`CombatLog`) | open the log | fine | royal chip; feed rows ice with a 5px sky / berry side bar | +1px hover, −2px press, spring release |
| **Blade stat cards** | fighter stats | see-through mix, numbers lost | solid navy plate, faceted royal header strip with stroked "SMASHER n", 900-weight tabular stroked numbers, 3px drop | frozen / chilled / dead states kept |
| **Skill HUD chips** (`SkillHudIcon`) | proc feedback | proc flash good, base ring muddy | medallion on a royal rim with a darker lower band | proc: punch to 1.35 at −10° + a thick sun ring burst with ink keyline |
| **Skill medallion** (`SkillIcon`) | skill art everywhere | — | royal rim, darker lower band, white lip, a solid light bevel ring (#UX1c: no stitch) | — |
| **Skill callout pills** (canvas) | which skill did what | — | navy edge, team fill, white name, sun value (unchanged this pass) | wait for the turn banner to clear |
| **Tap to start** | start a battle | opacity pulse felt sleepy | XL hard stroke; the hint on a navy angled plate | a double "thump" every 2.2 s |
| **Countdown numbers** | 3-2-1 | — | sun XL stroke | punch in tilted −12°, land straight, blow past the camera |
| **Turn banner** | "Your turn!" / "Opponent's turn" | weak | `FRibbon` (#UX1c): leaf for you, berry for the opponent | slams in |
| **PvP "Opponent's turn"** | PvP turn | — | berry `FRibbon` (#UX1c) | drops in |
| **Drag hint** | onboarding | — | white text on a navy plate with a hard drop; frozen hint keeps ice | — |
| **Tip badge** (`TipBadge`) | tips | sticky note | ice card with a sun bar on the left edge | lands tilted at 0.6 s (after the reward), the star spins in |
| **Speech bubble** (`FSpeechBubble`) | onboarding speaker | backdrop never rendered (bad class) | ice bubble with a bottom band; speaker name on a royal angled tag | pops from its tail corner with a tilt; tag drops in |
| **Save status banner** | save state | — | faceted plate (leaf bonus, royal offline) | slides up with overshoot |
| **HUD toast** (`HudToast`, `useHudToast`) — #UX1c | one-line confirmations ("Rewards claimed: 7" after a Claim all) | — | navy faceted pill with a tone-coloured ✓ sticker under the top HUD row, `role="status"` | drops in (back-out), holds 2.4 s, slides back up; one at a time; reduced motion: fade |
| **HP rings / damage numbers / power-up badges** (canvas) | combat readouts | — | unchanged this pass (navy outlines, Nunito 900, team colours) | — |

## 3. F-components (the kit)

| Component | Target look | Interaction |
| --- | --- | --- |
| **FButton** | §1.2; `variant="brawl"` = hero (wrapper `.ui-breathe`, shine, two speed slashes at the right end — kept in #UX1c, uppercase) | disabled = `aria-disabled` + steel, still tappable for the deny shake; `attention` = hop with a squash on landing |
| **FIconButton** | royal / berry / leaf / sun / sky / plum squares, same recipe | painted icon tilts on hover; sinks on press |
| **FModal** | solid royal frame (two-tone header band + bevel line, inner keyline, header sparkles) + ice card + the sun **`FRibbon`** title (straight face, folded tails) with two twinkles; no overlay on the scrolling body, berry X | #UX1c choreography: the dim FADES (never scales), the modal pops up from 60 % with a back-out overshoot and drops away on close; frame swings −3° → 0°, title drops in; X glyph turns 90° on hover, sinks on press; `open` / `close` sounds |
| **FTabs** | one darker faceted royal **rail** under all tabs; ONE ice **puck** (the page) with a sun accent bar | the puck **slides** to the picked tab (back-out spring 0.36 s); inactive labels lift 3px on hover, squash on press; `tab` tick |
| **FSlider** | navy well, faceted lime fill, ice 3D knob with grip bars | knob lifts on hover, sinks + squashes while held; a `slide` notch every 10 %, pitched by position (live volume preview on the SFX slider) |
| **FSwitch** | off: navy track, ice knob with a ✕; on: faceted lime track, knob with a ✓ | knob springs across with overshoot, sinks while held; `toggleOn` / `toggleOff`; 44px row |
| **FButtonSwitch** | §2 speed switch (sliding puck) | §2 |
| **FHoldButton** (new) | danger `.ui-btn` + a sun ring (SVG stroke) around it + a navy "Hold to confirm" pill | §1.2 hold to confirm |
| **FSelect** | ice field, royal chevron chip | chevron rotates 180° with a spring; options pop in staggered; selected = lime with stroke |
| **FMuteButton** | §2 | §2 |
| **FCountUp** (new) | tabular `n()`-formatted number | counts with ticks, bumps + optional ting on landing |
| **FLanguagePicker** | small ice 3D tiles, royal globe | lift 2px / sink 3px; current = faceted lime with a sun ✓ sticker; tiles pop in staggered |
| **FReward** (result shell) | navy backdrop (celebration: deep ROYAL navy — #UX1c, was a dark olive that went muddy under the rays); faceted ribbon (leaf win / berry lose) with three twinkles on a celebration; continue = faceted royal pill with a sun » | ribbon drops in (celebration: slams from 1.9× −7°); continue pops in then squashes + chevrons kick every 1.4 s; Space / Enter continue |
| **FLogoProgress** (loader) | unchanged in #UX1c (it must match the static splash in index.html pixel for pixel; no stripes on it) | — |
| **FSkinPeek** (#UX1c) | ice card with the rarity edge, the skin BIG on a turning flat 8-point star in its rarity colour, name on a navy plate, rarity name, a sparkle | long press (420 ms, `useLongPressPeek`) on a skin-picker card or a battle-pass skin tier; the release never buys / claims (capture-phase click guard); ContextMenu / Shift+F10 toggles, Esc closes; `open` / `close` sounds |
| **FlatRays** (#UX1c) | sunburst as SOLID SVG wedges: wide white wedges at low opacity + thin near-opaque streaks in the accent tone (a thin translucent sun over navy / green mixes to mud) | bursts in (0.4 → 1.06 → 1), turns slowly; `still` on low quality; reduced motion: still |
| **FPerfMeter** (dev) | exempt | exempt |
| **UI kit sheet** (dev, `dev/ui-kit.html`) | every tone × idle / hover / pressed / disabled / focus, hero, icon buttons, pucks, switches, slider, rarity cards + names, plates, hold button — frozen | `pnpm ui:diff` (`tools/ui-kit-diff/run.mjs`): its own headless Chrome and Vite on random ports, hover / focus forced over CDP, each block compared with `tools/ui-kit-diff/baseline/*.png` (2× DPR; a pixel counts when a channel moves > 40/255; a shot fails above 0.15 %), diff images in `out/`; `--update` rewrites the baselines, `--probe` runs blur-probe on the sheet |

## 4. Modals and screens

| Screen | Pro critique | Target look | Interaction |
| --- | --- | --- | --- |
| **Options** (`OptionsModal`) | flat list | ice rows; hatched divider band; FSelect / FSlider per §3; reset berry; Save & Close primary (not hero: a close must not pulse); tabs on a rail with a sliding ice puck | difficulty buttons pop in staggered, chosen one lime · the reset confirmation's **Reset is hold-to-confirm** (1.2 s ring) |
| **Team: slots + roster** (`SmasherTeamModal`, `CardRuneFrame`) | cards were pastel patches; slot 3 sat alone on a half row; names broke mid-word in narrow columns ("Bram / ble"); "TEAM" twice | **collectible cards**: ice face with faint hatch, ink frame, **rarity edge**, corner stripes, 4px drop; the **rarity name** on a skewed plate hanging over the base band; name on a **skewed ink plate** (one line, sized to the card with container units); level on an angled royal chip; slot number a leaf sticker; the whole team in ONE row (2 or 3 slots) | hover lift 3px + tilt −1.2° · press sink 3px, squash 0.97 · selected: striped sun face, sun ring, portrait 1.08, spring pop · locked: steel hatch, grey portrait, berry lock note · focus sun ring · grid pops in staggered · **long press (420 ms) → stats peek**: a small card above the held one (rarity edge, portrait, name, rarity + level, HP / ATK / DEF / SPD bars); closes on release without selecting; a move > 10 px (a scroll) cancels; keyboard: ContextMenu / Shift+F10 toggles it, Esc closes; `open` / `close` sounds; reduced motion: no pop · **filter chips** above the roster (#UX1c, 48 smashers ≫ two phone screens): All · Owned · one per rarity, each with its count, one sideways-scrolling row; the grid re-pops on a swap · **✕ / + on slot 2 / 3** (#UX1c, owner): take a smasher out of the fight / field a resting one again (team size follows; slot 1 never empties) |
| **Team: detail panel** | — | portrait in a rarity-edged frame with a corner notch; "+" skin = small sun 3D button; the rarity name beside the level chip; stat bars navy wells with solid fills; skill rows ice cards with a plum band | portrait swings in on each pick; bars grow from 0 and ease to new widths; next-level preview blinks; **Level Up = the hero** (sun), unaffordable → stays sun, sunk + hatch, price berry, deny; level-up plays `reward` and the level chip punches (`.ui-bump--punch`, keeps its skew) |
| **Team: premium smasher unlock** (Tuskar onwards, `src/data/premiumSmashers.ts`) | a legendary joined the roster just by reaching its stage — no moment, no reason to watch an ad | stage reached, not yet unlocked: NOT steel (it is available) — its rarity frame on a pale ice-200 face, the portrait slightly muted, and where the level chip sits an angled price chip spanning the card (container units): **sky + MovieIcon + "Unlock"** on a session with rewarded ads, **sun + coin + price** without; before its stage the usual steel lock + "Reach stage N"; the detail panel's hero becomes the unlock (`FButton` `tone="ad"` brawl with MovieIcon + "UNLOCK", or `tone="premium"` "UNLOCK ◎ 6000") | ad not ready / throttled → the hero is sunk steel and a quiet ink line says "Ad not ready yet…" (it turns live by itself); in a PvP match "You can watch the ad after the match"; a skipped / failed ad → "The ad didn't finish…" · unlock (completed ad, or coins) → the roster card FLIPS (the skin-card turn + sun ring) and the gift reveal opens with the smasher: "NEW SMASHER!" ribbon, rarity slam, name, rarity-tone burst · can't afford → sun, sunk + hatch, deny |
| **Skin picker** | a purchase only swapped a button | locked steel hatch; owned ice with a rarity-coloured base edge; equipped faceted sun with ring and lift; every card wears its rarity name; **long press → skin peek** (#UX1c, `FSkinPeek`): the skin big with its rarity; cards are focusable (sun ring), ContextMenu / Shift+F10 opens the peek | press sink on Select / Buy / Ad buttons · **every shop skin is ONE rewarded ad** on a session with rewarded ads (sky button: MovieIcon + "Unlock"; earn-only trophies keep their "Beat stage N" plate), the old coin prices without; an ad button that cannot start (not ready / PvP) is disabled with one hint line under the grid, a skipped ad says "try again" there · **a skin that becomes owned while the picker is open (coins or its ad) FLIPS**: face down (striped royal back, sun star) → a lifted beat → turns over to the owned face → sun ring + `reward` ting; reduced motion: no flip |
| **Leaderboard (global)** (`LeaderboardModal`) | own row must pop | ink header rule; top 3 angled rank plates sun / ice / berry, #1 row faceted sun; **own row** faceted sky, sky edge + lip, 1.015 scale, "YOU" chip; striped royal footer | rows pop in staggered |
| **Leaderboard (stage board)** (`FakeLeaderBoard`) | — | ice wells; #1 faceted sun; player row sky edge + lip; podium chips sun / ice / berry; **Fight = lime 3D** (was berry), 44px | locked fight = steel |
| **Battle pass** (`BattlePass`) | premium must feel premium; 20 waiting tiers meant 20 taps and 20 reveals | tiers: locked steel hatch · in progress sun edge + "nn %" · claimable faceted sun with a twinkle, ring, lift + tilt, shine · claimed slanted lime stamp; honour track = plum striped panel with a skewed ink title (sun text); **Claim all** = the screen's hero (sun, the count on a berry chip) whenever ≥ 2 tiers wait (pass + honour) | claim arrow hops (via `translate`, press intact); stamp slams in · Claim all runs every single-tier claim in order (`src/use/claimAll.ts`: same rules and saves, no skin twice in one batch) and opens ONE reveal — coins summed into one count-up, every skin side by side — then the coins fly to the badge · no diamond anywhere on the pass since 2026-10-21: tiers 15/35/55 are coin jackpots (+3000, coin icon) · #UX1c: Claim all also shows for the honour track ALONE (one waiting honour tier while the pass has none, `claimAllVisible`); after the reveal a HUD toast says "Rewards claimed: N"; claimable tiers twinkle; long press on a skin tier → `FSkinPeek` (the release never claims) |
| **Daily rewards** (`DailyRewards`) | today must jump | day tiles as mini cards; skin days plum; **today** faceted sun with a twinkle, ring, lifted 4px tilted −2°, shine, bouncing ▾; claimed = slanted lime ✓ stamp | Collect = hero; tiles pop in staggered; stamp slams (2.2 → 1); claim sound stays `happy` · coins + skin days only, no diamond reward |
| **Shop** (`InAppPurchaseShop`) | price must read | packs as premium buttons, angled berry "best value" tag | packs pop in staggered |
| **Background skins** (`BGSkinModal`) | — | ink-framed cards; owned leaf base band; equipped faceted sun, ring, lift, angled "Equipped" chip | pop in staggered |
| **Roulette wheel** (`RouletteWheel`) | spin had no sound, landing no punch | royal rim + navy outline + royal pointer (kept); solid cream bevel lines on the rim, hub and pointer cap — no stitch dashes (#UX1c: a wheel is a hard object); segment colours bright; spin = hero | **peg tick** per segment past the pointer (pitched by speed; throttle turns the fast start into a rattle, the last clicks land one by one); wheel kicks on spin start, thumps on landing + `reward` ting; respin (sky, ad icon) pops in with shine; Skip = quiet 44px link; low quality / reduced motion drop the punches · the gold jackpot wedge is a coin prize (15000, coin icon) — it paid 5 diamonds until 2026-10-21 |
| **Roulette results** (arena) | — | big "3x" XL stroke, amounts large stroke; "Spin again" sun chip | prize bobs (transform, no brightness filter) |
| **Win / lose result** (arena + `FReward`) | win needed fireworks | verdict "YOU WIN!" / "YOU LOSE" in XL stroke; coins count from 0; honour on a faceted plum plate with a double-strip shine; 3x coins = **sky hero** | verdict slams (win keeps a slow wobble); coin icon pops then counts with rising ticks, ting + bump on landing; 3x extra counts on from there; 3x unavailable → steel + deny |
| **Enemy surrendered** (arena) | — | ice card; OK = hero | — |
| **Leaderboard rank badge** (win screen) | — | angled faceted royal tag, sun trophy, stroked "#N of M" — **grouped per locale** (#UX1c, `fmtGrouped`: "#33,883 of 257,114" / "#33.883 von 257.114", Latin digits) | slams in 0.35 s after the verdict |
| **Ad / consent / dark-mode / ads-blocked modals** | must be calm and honest | standard FModal; primary lime, alternative ice; rewarded watch = sky with an equal-weight decline | only a gentle card pop-in; the forced-dark modal stays deliberately plain |
| **Quest reward** (`QuestReward`) | — | — | title slams; trophy and message pop in staggered |
| **Intro cutscene** | — | Skip = ice secondary 3D pill (was a translucent black capsule) | sinks + ticks |
| **Boss lab** (dev) | wood/cream leftovers | royal tiles with lip and drop, sun focus | lift / sink |

## 5. League and PvP

| Element | Target look | Interaction |
| --- | --- | --- |
| **League hub** (`LeagueHub`) | faceted royal standing plate with the tier colour as a thick top edge; uppercase stroked rank; shield / streak / gate as angled tags; "fights today" big stroked number (lime, berry at 0); "Choose your opponent" on a tilted navy tag | badge crashes in; tags slam one by one; fights number bumps on change |
| **Opponent team peek** (#UX1c) | ice card with the difficulty edge, the name on a skewed ink plate, one row per blade: portrait, name + level, HP / ATK / DEF / SPD (icon + tabular value) | long press (420 ms) on an opponent card; the release does NOT start the fight; ContextMenu / Shift+F10 toggles, Esc closes; not on a disabled card |
| **Opponent card** (`LeagueOpponentCard`) | collectible card: ice face, ink outline, **difficulty colour as the edge** (ring, base band, solid corner notch), tilted faceted difficulty tag, team on a striped royal plate, lime uppercase FIGHT | pop in staggered · hover lift 3px tilt 1°, the two smashers turn to face each other · press: card sinks 3px + FIGHT sinks into its lip · disabled: hatched steel FIGHT, desaturated, deny · focus sun ring |
| **Gate card** (promotion fight) | boss card: berry edge, solid corner notches, tilted navy header with sun text, faceted berry crest, flat sun rays, uppercase berry boss name; CHALLENGE = hub hero | crest spins in, name slams; compact crest on short landscape |
| **LP bar** (`LeagueLpBar`) | navy well with a hard inner lip, tier-coloured faceted fill + white gloss strip; champion keeps its four-colour patchwork (colour blocks, not diagonal stripes) | the patchwork marches while the fill slides; the promotion flag hops |
| **LP delta chip** (`LeagueDeltaChip`) | angled faceted plate: lime up, berry down, steel no change | slams in while the number counts with pitched ticks |
| **Result panel** (`LeagueResultPanel`) | ice card with the tier edge; promotion = faceted sun card with two twinkles | sequence: rank slams → delta slams + counts → bar charges → status tag slams → coins count and ting; promotion / division-up plays `reward` |
| **Season top list** | ice wells; ranks 1–3 raised faceted cards sun / ice / berry; angled rank tags | rows pop in staggered |
| **Fights top-up (ad)** | sky ad button with shine | disabled while loading |
| **Unlock popup** | seven tiers rise on a faceted royal stage; lime diamond bullets; "Enter league" hero; "Later" white with stroke (was barely readable) | tiers rise one by one |
| **Season reward** | tier icon slams, prize tiles raised faceted cards, Claim = sun hero | tiles pop in; coins / diamonds count, coins land with a ting |
| **Rank badges / tier icons** | division plaque navy with ink outline, Nunito numeral; tier metals kept (bronze / wood are tier identity, not a base colour) | — |
| **PvP VS card** (`PvpVsPreview`) | face-off: two tilted faceted plates leaning in (you sky, opponent berry), ink outline and drop; sun "VS" on a spiky two-tone starburst with a heavy stroke (no glow) | plates crash in from the sides with overshoot; VS crashes in with a thump; 1200 ms timing unchanged |
| **PvP lobby** (`PvPLobbyModal`) | arena tiles as real buttons, picked one stands up (tint, facet, sun corner flag); team size = pair of 3D buttons, picked raised lime; "Level 1" chunky checkbox; win / loss / honour big stroked numbers; a ready side pops into a striped lime card; Create / Start / Ready = hero | toggle sound on the checkbox; guest-only controls dimmed, tapping one → deny |
| **Ready skills** (`PvpReadySkills`) | each level a small navy chip | — |

## 6. Reward spectacle and bosses

| Element | Target look | Interaction |
| --- | --- | --- |
| **Gift reveal** (`RewardRevealHost`) | gift box with band and bow; prizes climb out on a turning flat 14-point star in the reward tone; amounts in XL stroke; "NEW SMASHER" / "SPEED BOOST" on berry `FRibbon`s (#UX1c) | **anticipation** (drop in, lid rattles at ~0.4 s) → **press** squash 1.08 × 0.86 → **burst** (jolt, lid flies, flash + ring) → **count-up** from 0 staggered 110 ms, rising ticks, bump + ting per amount; sun focus ring; digits aria-hidden, final "+N" sr-only; sounds: existing celebration-1 / reward-continue only · **rarity** (#UX1b): every skin in its rarity colour (plate ring, star) with its rarity name slamming in; a skin reveal's tone (rays, confetti) is its rarest skin; with a skin inside, the burst adds a striped rarity-coloured star blast and a second, late ring · coins summed into ONE prize, diamonds likewise · **claim-all (≥ 2 skins)**: the gift steps aside, the summed currency row turns compact, "NEW SMASHERS!" and every skin side by side, sized by `fitPrizeGrid` (`src/use/revealFit.ts`): one row while plates stay comfortable (ten skins fit one row on a landscape phone), else balanced rows (7 → 4 + 3), plates 40–128 px, re-fit on resize · on continue the coin plate's rect is kept so a late caller (league season reward) flies the coins from where they were shown |
| **Reward stage / confetti** | flat rays + stacked discs; confetti from tokens (sky, berry, leaf, plum, sun, ice + tone) with a 1.5px navy edge, some flat stars | lit on a schedule (rays 90 ms, paper 170 ms) |
| **Boss intro card** | deep-navy plate skewed −12°, berry trim, a berry-tinted two-tone facet, berry base band, 5px drop; berry slash bars fly in at both ends; name berry-300 with heavy stroke | slams in within 1.5 s; pauses with the game; static on low quality / reduced motion |
| **Boss defeated band** | #UX1c: a berry slash across the screen at −3° (wider than the viewport) with a flat TWO-TONE split (deeper berry lower half), hard bevel lines inside both edges (solid, no stitching), sun edge, navy drop; white flat rays with sun streaks burst out behind it; six sparkles twinkle round the title; navy dim | title tilted to match, slams 1.6 → 0.94 → 1; tap-to-skip timing unchanged |
| **Boss trophy card** | plum `FRibbon` label (#UX1c); a turning faceted sun star behind the trophy skin | tag slams; skin bobs (no brightness pulse) |
| **Boss peek badge** | skewed berry warning tag with a two-tone facet (#UX1c: a badge, so no stripes); sun headline, stroked name | portrait slam / shudder and embers unchanged; **painted portal frame seam** (`bossFrameArt.ts` / `paintedBossFrame.ts`, tools/boss-frame-art): when packed and loaded the painting replaces the CSS ring at `--frame-scale` 1.15, the skin sits in the measured `--hole-*` opening, the frame breathes a 2 % idle scale (off on low quality / reduced motion); CSS ring = fallback and `?art=procedural` |
| **Boss trait glyphs** | flat SVG with navy outlines (unchanged) | — |

## 7. Canvas-drawn UI (`useSpinnerGame.ts` + `skills/*`)

Colour and typography only, no gameplay changes (unchanged this pass): navy
(`#161a40`) outlines instead of black or brown, Nunito 900 instead of Arial,
team colours sky (player) and berry (enemy), sun for money and highlights.

### 7.1 Aim preview (slingshot pull-back) — `renderAimPreview` / `renderDragIndicator`

Pro critique (before): a thin dashed orange line to the finger, a 3px stroke
arrow whose colour slid yellow → red through muddy mid-tones (an rgb string
built every frame), a faint dashed red circle for the cancel zone; nothing
said "full power", the arrow's direction came from the disc centre instead of
the actual launch vector, and the arrow covered the plush.

| Part | Target look | Interaction |
| --- | --- | --- |
| **Pull band** | a tapered rubber band from the disc rim to the finger: sky-300 fill, 2.6-unit navy outline, a sky-600 core line, an ice grip with a sky dot at the finger | thins as it stretches (half-width 7 → 4.5 units at full pull) |
| **Power arrow** | thick arrow on the LAUNCH side (never under the thumb), drawn UNDER the models so it comes out from behind the plush: navy outline, royal-800 well, hard 0-blur navy drop; 5 **notched segments** fill in turn with a hard light band; head in team sky with a light upper half | segments fill continuously with the pull and step **sun → orange → pink** (< 40 %, < 75 %, < 100 %); at full power the segments and head turn **berry**, one navy + sun ring **snaps** off the head (260 ms) and the arrow **pulses** (±6 %) while held |
| **Guide dots** | bold ice dots with a navy outline past the head, shrinking (4.6 → 2 units) and fading with distance | as many as the power is long (2 → 10); they **stop at the first wall, terrain solid (island / mushroom / log) or tower** with a navy + ice stop bar across the path; an obstacle right in front of the disc shows only the stop bar |
| **Cancel zone** | near the disc: a dashed navy ring at the disc radius fades in; on the disc: a navy + berry ring round the disc and a berry ✕ badge with a hard drop **above** it (a thumb comes from below) | releasing on the disc cancels (same rule as `releaseDrag`); no arrow while cancelling |
| **Joystick** (edge helper) | navy well with a hard drop and royal inner ring, dashed ice cancel ring (berry while inside), ice 3D knob with a sky core; the band and a small arrow from the same kit | the blade shows the same arrow + dots as a pull |
| **Idle hint** (`renderHintAnimation`, owner 2026-10-22: "should match the drag previewer") | the SAME kit at hint opacity (0.72, composed in a reused layer and blitted once — true group opacity, the outline never shows through the fills): pull band + ice grip (the ghost finger), notched power arrow, guide dots; drawn under the models like the real preview; replaces the thin olive line + ghost circle | a looping 2.4 s DEMO PULL on every living player smasher, aimed at its nearest enemy: fade in → pull back (ease-out, segments fill sun → orange → pink to 85 %) → hold → the band snaps back and the arrow shoots forward as the release cue → rest; reduced motion: a still arrow at 60 %; FX.low: drawn straight on the canvas |

Rules: game units only (it scales with the arena; the canvas is css × dpr, so
it is crisp — blur-probe SHARP on phone 3× portrait / landscape and desktop
1×); flat fills, no glow / gradient / blur; no per-frame allocation (constant
colour strings and dash arrays, the obstacle circles cached per layout).

### 7.2 Meteor shower (pre-battle intro beat)

**Default: the RING burst — `src/use/ringShower.ts`.** Owner (2026-10-22): *"a
redesign of the chaos arena meteor shower that emits from a ring in the center
of the screen and flies outwards … in the painted themed art of tree-smashers."*
Reference studied: chaos-arena `spawnMeteorShower(80, 50, 65)` — 80 streaks on a
radius-50 ring at even angles (± 0.15 rad), start delays over 60 % of a 65-frame
life, radial launch 1.5–4 px/frame accelerating outward, tail = 4 × speed, two
hue buckets, one path per bucket; no impacts, no scaling.

| Part | Target look | Timing (shower clock, 16 ms ticks) |
| --- | --- | --- |
| **Emitter ring** | at the arena centre, radius 0.2 R: navy + theme-accent double ring on the floor with 16 flickering outward flame teeth (navy rim, theme mid tone) | ignites 0–150 ms (pops 35 % → 100 %), holds, flares out + thins 0.62–0.82 × span |
| **Ignition** | flat 8-point starburst on the centre (navy, core tone, cream), a 32 % flat screen flash, a 3 px kick | burst 0–180 ms, flash 30–150 ms, kick 40–300 ms |
| **Meteors** | 24 chunky meteors (12 on FX.low) at even angles round the ring in two interleaved waves: a flat cel-shaded flame teardrop (out / mid / core tones, two tongues a side) and a rock head with one light facet, ONE bold navy outline; they grow out of the ring (45 % → 100 %), accelerate outward, the trail stretches with speed (1.6 → 7.6 r) | waves at 40 / 300 ms + up to 380 ms, 430–600 ms flights, all done by span − 150 |
| **Landings** | side-bound meteors (|y| ≤ 0.4 R, 0.5–0.82 R out) land: flat starburst, navy + accent shock ring, 4 spark shards kicked back toward the ring (high only), a 1 px tap; top / bottom-bound ones fly on over the trees and shrink away — no impact on a tree or its gauge | burst 110 ms, ring 300 ms, sparks 420 ms |
| **Palette** | per arena theme (`RING_PALETTES`): fire on meadow / woodland / rocky / volcanic / ruins (rock + accent from the theme: plum rock + flower-yellow ring on meadow, plum-black rock on volcanic, brick on ruins), ICE comets on snowy (royal / sky / ice-white), CANDY on bedroom (raspberry / bubblegum, periwinkle rock). Navy outline everywhere so it reads on snow and ash alike; no stitches, no glow / gradient / blur | — |

Rules: engine hand-off unchanged (1600 ms `meteor_intro`; PvP inside its 1200 ms
banner; win / boss reward use `celebrate`: 16 meteors, no flash / shake). No
global random source and no match RNG (local hash PRNG at spawn). Fixed pool, analytic in time,
one path per colour layer across all meteors (≤ 25 paint ops at the peak, any
theme / tier), whole-device-pixel shake (≤ 5 px). FX.low: 12 meteors, no teeth,
no sparks, no landing taps. Reduced motion: no shake, no flash. Painted meteors
(optional, PRIORITY batch): `tools/ring-meteor-art` (prompts fire / ice / candy →
`paint-queue.mjs` → `pack.mjs` → `public/images/vfx/ring-meteor-<family>_282x94.webp`
+ `src/use/paintedRingMeteors.ts`); a sprite is drawn only when it is not
upscaled (≤ 1.02 device px per sprite px), the procedural meteor is the fallback
and `?art=procedural` keeps it. Tests: `tests/ringShower.test.ts`.

**Kept for reuse: the STRIKE variant — `src/use/meteorShower.ts`** (`?meteor=strike`,
frozen at boot as `METEOR_VARIANT`). Owner: *"keep the meteor shower vfx image and
dont delete it, we might reuse it for another project."* Code, prompt
(`art-sheets/meteor-art/meteor.prompt.txt`), paint pipeline (`tools/meteor-art`)
and any painting (`art-sheets/painted/meteor-meteor.png`,
`public/images/vfx/meteor_595x198.webp`) are retained and still tested
(`tests/meteorShower.test.ts`); the ring tools use their own file names.

#### Strike variant (kept for reuse)

Pro critique (before): 80 two-unit streaks in pale sky / peach bursting out of
the arena centre with a 1.5-unit head — invisible on snow, lost on volcanic ash
and ruins sand once the arena palette changed; nothing actually fell or landed.

| Part | Target look | Timing (shower clock = physics ticks, 16 ms each) |
| --- | --- | --- |
| **Meteors** | nine chunky meteors from the upper right: a SOLID layered flame trail (red-orange / orange / sun, three tongues a side) with one navy outline round the whole silhouette, a plum rock head with a light facet and a white-hot leading cap; flat fills only | staggered pairs 40–970 ms, 270–330 ms flights, accelerating |
| **Telegraph** | a navy + sun ring closing in on the impact point and a flat navy ground shadow (30 %) growing under it | while the meteor is in the air |
| **Impact** | white-hot 8-point starburst (navy outline, sun, cream core) over the models; navy + sun shock ring racing out over the floor; chunky sun / orange spark shards (navy outline) arcing out and shrinking; a navy-rimmed cream dust cloud; a crater (navy rim, burnt-orange lip, dark pit, molten core that cools) | burst 110 ms, ring 340 ms, sparks 480 ms, dust 700 ms; craters cool by ~900 ms and shrink away after the hand-off |
| **Hero** | 2× meteor on the arena centre: bigger burst, double ring, 14 sparks, a flat full-screen flash (45 % → 0), a 6 px camera shake | launches 1000 ms, lands 1380 ms; flash 170 ms, shake 320 ms |
| **Frame** | two nested flat navy frame bands (fillRect strips, 16 % each) at the screen edges — no radial gradient | in over 200 ms, lifts across the 1600 ms hand-off |

Rules: presentation only — the engine's `meteor_intro` hand-off is unchanged
(1600 ms; PvP lands inside its 1200 ms turn banner), no match RNG (Math.random
at spawn only, `// vfx-rng`); impacts stay off the trees and their HP gauges (|y| ≤ 0.4 R) because
the trees are baked into the static layer under the craters. Camera shake in
WHOLE device pixels (the static blit shifts pixel-exact and the uncovered strip
is refilled from the unshifted layer). Fixed pool (12 meteors, 14 sparks / 6
puffs each, Float32Array tables), analytic in time, one path per colour layer
across all meteors (≈ 25 paint ops at the peak). FX.low: 5 meteors + hero,
sparks only on the hero, no dust / crater rim / frame bands. Reduced motion: no
shake, no flash. Celebrations (win, boss reward) use a lighter 7-meteor shower
without hero, frame, flash or shake. Painted meteor (optional): `tools/meteor-art`
(prompt → `paint-queue.mjs` → `pack.mjs` → `public/images/vfx/meteor_*.webp` +
`src/use/paintedMeteors.ts`); the procedural meteor stays the fallback and never
stretches a sprite past its painted resolution. Tests: `tests/meteorShower.test.ts`.

## 8. Art-desk follow-ups (painted art that should follow this language)

* **HUD icon family** (done 2026-10-22, owner: *"the smasher upgrade button
  is not fitting"*): upgrade (team), trophy (leaderboard), league shield,
  daily gift, battle-pass ticket, treasure chest — one set: front 3/4 view,
  light from the top-left (darker tone on the lower-right faces / a darker
  extrusion), 2–3 flat tones per colour, bold navy outline, no stitches /
  felt / metal / brown; read at 28–48 px on their plates (royal: upgrade,
  trophy, league, pass; leaf: daily, so the gift is berry + sun with no
  green; the chest sits plate-less over the arena in honey-orange wood with
  sky bands). Drawn SVGs in `src/components/icons/Icon{Upgrade,Trophy,League,
  Gift,BattlePass,Chest}.vue` (palette tokens only) are the fallback;
  painted sprites from `tools/ui-icons` (prompts → paint-queue → pack,
  `public/images/ui-icons/<name>_{128,256}.webp`) replace them through
  `UiIcon` (`src/use/uiIconArt.ts` builds the URLs for the <img>, the chest's
  cooldown mask and the splash preload). Tests: `tests/uiIcons.test.ts`.
* Old HUD icon webps (`public/images/icons/*_128x128.webp`: gears, team,
  trophy, chest) are no longer shown or preloaded (files kept: test mocks
  still name them); the movie icon still carries the old outline (repaint job:
  navy `#161a40` outline, brighter fills).
* **Stat icon family** (2026-10-22, owner: *"repaint the stat icons in the
  game's theme (no stitches)"*): `stat-hp` leaf heart, `stat-atk` berry toy
  sword, `stat-def` royal/sky shield with white cross, `stat-spd` cyan bolt,
  `stat-weight` slate dumbbell — HUD-family rules (front 3/4, light top-left,
  2–3 flat tones, navy outline, no stitches/felt/metal) but extra bold for
  14–24 px. `StatIcon` shows the painted sprite (`ui-icons/stat-*_{64,128,256}`,
  srcset 1×/2×/4×) else `IconStat*.vue` (palette tokens); canvas stamps
  (power-up box plate, pick-up float, boss ATK/DEF tag) use `statIconImage`
  (256 px). Old `images/stats/<stat>` files are no longer requested; only
  `level-up` still uses the art/ui sheet. Tests: `tests/uiArt.test.ts`,
  `tests/uiIcons.test.ts`.
* Painted power-up boxes: royal / ice frames with navy outline.
* Painted coin: keep it gold, but use a navy outline instead of brown.
* Optional painted plates for the `.ui-tag` / `.ui-banner` seams (sun, leaf,
  berry) with the same skew and facet.
* Tree towers and the arena keep their natural palette (the forest is the stage,
  and the UI is the toy box on top of it).

## 9. Pass 4 (#UX1c) — stripe decisions and the new pieces

**Rule: diagonal stripes mean "off".** `--ui-stripes` is gone; the hatch tokens
(`--ui-hatch` on light, `--ui-hatch-light` on a dark well) may only sit on a
disabled / locked state, and no diagonal `repeating-linear-gradient` may appear
outside the tokens (`tests/uiStyleRules.test.ts`).

| Where stripes were | Decision |
| --- | --- |
| `.ui-tag`, `.ui-rarity-name`, ribbons (now `FRibbon`), `.ui-chip` tones, stage / coin badges, chest chips, rank / delta / league plates, toast-like pills, save banner, PvP plates, league hub / top list / unlock / season prize cards, continue pill, tabs rail, slider / switch fills | **removed** → solid fill + two-tone facet (`--ui-facet`) + hard bevels (banners keep a small glint dash) |
| FModal frame | **removed** → two-tone header band + one hard bevel line + inner keyline + sparkles |
| Boss defeated band | **removed** → two-tone berry split, solid bevel lines, flat rays (white wedges + sun streaks), sparkles |
| Boss intro plate, boss peek badge, VS starburst, league promotion card, team-slot / detail portrait washes, ice cards | **removed** → facet (berry-tinted on the boss plate; dark facet on ice) |
| Card corner stripe triangles (`.ui-card`, `CardRuneFrame`, BP / daily tiles, opponent / gate cards, detail portrait) | **removed** → solid dog-ear corner notch (clip-path, anti-aliased) |
| `.ui-bar` / BP / honour fills | **removed** → solid fill with bevels; the TRACK carries five segment notches (vertical ticks, `--ui-segments`) |
| Options section divider | **removed** → a hard bevelled groove (dark line over light) |
| Loader bar (`index.html` static splash + `FLogoProgress`) | **kept** — the barber-pole fill is the "working" signal of a progress bar, and the loader must match the static splash pixel for pixel (redesigned just before this pass) |
| Disabled `.ui-btn` (incl. can't-afford premium), disabled switch option, locked roster / slot / team-size / skill / skin cards, locked BP tiers, disabled league FIGHT | **kept** (hatch = "off") |
| Hero CTA's two slashes at the right end | **kept** — two speed marks on the one hero, not a texture |
| Champion LP bar patchwork, roulette rays | **kept** — colour blocks / wedges, not diagonal stripes |

**Ribbon** (`FRibbon`, owner: *"the ribbon design looks weird"*): the old
CSS banner had pseudo-element tails with no outline on the notch, hanging at a
different depth on every size, and the modal title was a SKEWED tag. Now one
component: a straight faceted face 1.9 em high (navy outline, light top
bevel, dark bottom band, inner keyline, 4 px drop), the text one centred
nowrap line with side padding wider than the tails' tuck, and two SVG caps
(1.8 × 2.6 em) — a tail in the tone's dark shade starting 0.6 em down with a
swallow notch outside, plus a darker fold triangle under the face corner —
both navy-stroked (3 px, non-scaling) so the outline is crisp at any DPR.
All geometry is in em of the ribbon's font size: the same tails at every
size. Used by: FModal titles, FReward ribbons (result, roulette, gift
reveal), the reveal's "NEW SMASHER(S)!" / "SPEED BOOST" kickers, the turn
banners ("YOUR TURN", PvP "Opponent's turn"), the boss-trophy label.
Entrances unchanged (drop-in with swing, slam). `.ui-tag` remains for small
labels only.

**Team modal follow-ups**: *"a bad line when scrolling"* — FModal's sticky
1.25 rem fade (z 2 inside the scroller) washed plain content while positioned
children above z 2 punched through, so its edge read as a seam across the
team-size picker and the slot cards; the overlay is removed (state classes
kept, no paint). *"deselect smasher 2 and 3"* — a fielded slot 2 / 3 card
carries a berry ✕ sticker (30 px, 44 px tap area) that takes the smasher out
of the fight; a resting slot carries a leaf + that fields it again. Slot 1
can never be emptied. Removing the last fielded slot lowers the team size;
removing slot 2 while slot 3 fights moves slot 3's smasher into slot 2 (the
removed one rests in slot 3) — the fielded slots are always 1 … size, the
1 / 2 / 3 picker and `smashers_team_size` follow (`benchTeamSlot` /
`fieldTeamSlot` in `src/data/teamSize.ts`, `tests/teamSlotDeselect.test.ts`);
`toggleOff` / `toggleOn` sounds; aria-labels `slotRemoveAria` /
`slotFieldAria` in all 39 locales; sun focus ring. The roster filter chips
are ONE sideways-scrolling row (never several rows above the grid).

**Stitches are for fabric only** (owner rule, #UX1c): dashed seams stay on
the plush smashers, plush trees / props and felt rims (their art / rig) and
nowhere else. Removed from hard UI: the roulette wheel's rim band, hub ring,
pointer cap and win burst ring (solid cream bevel lines now), the skill
medallion ring (solid royal-light bevel), the boss-peek portrait ring (solid
light keyline), the PvP VS shock ring, the league hub's loading skeleton and
"opponents on the way" well (solid bevelled wells), the ad-intro / ads-blocked
panels (`.ui-stitch-dark`, class deleted). Guarded in
`tests/uiStyleRules.test.ts`. Progress rings that animate a single
`stroke-dasharray` + `stroke-dashoffset` (hold ring, chest / skin-chest timers,
skill cooldown) are not stitches and stay.

**Modal title ribbon (owner follow-up)**: the first FRibbon still had a navy
drop band under the face that cut across the fold triangles, and near-black
folds — they read as a detached navy stub under each corner. Now the face has
no outer drop (the tails + folds are the depth), the fold is the same fabric
one shade down (the tone's band colour) with its top edge ON the face's
bottom outline, 0.7 × 0.6 em with a 2 px outline so its FILL reads (at
0.5 em with a 3 px outline it was mostly navy stroke), and the left / right
caps are one path (the right mirrored), 3 px navy outline on the tails.

**Close X hit target (owner bug)**: the modal's header box (title ribbon or
tab heads) spans the frame's full width over the X's corner and sits above the
frame's stacking context (the frame swings in with a transform), so it caught
the X's hover — no pointer cursor, no hover state. The header is now
`pointer-events: none` with only the ribbon / tabs taking the pointer;
verified with `elementFromPoint` at the X's centre (phone 3× portrait /
landscape, desktop 1×; team, daily, battle pass, league, leaderboard) and
guarded by `tests/fmodalHitTarget.test.ts`.

**New pieces**: `.ui-sparkle` (+ `--sun`; `--sp-size`, `--sp-delay`; still at
its peak under reduced motion) · `FlatRays` · `FSkinPeek` · `useLongPressPeek`
(hold 420 ms, move > 10 px cancels, release never clicks, keyboard toggle) ·
`HudToast` / `useHudToast` · the roster **filter chips** (All · Owned · one per
rarity with members, each with its count; 32 px pills with a 44 px tap area;
picked = raised sun puck; `tab` tick) · `claimAllVisible` (Claim all from two
waiting tiers, or for the honour track alone while the pass has none) ·
`fmtGrouped` (localised grouping, Latin digits).

**Reward stage** (`RewardStage`): the wide rays are the stage's royal blue and
the pool discs royal-light; the reward tone rides on thin near-opaque streaks
(a translucent sun / gold over navy mixed to grey-olive mud).

**Kit diff**: `dev/ui-kit.html` has a `composites` block (team cards with
`CardRuneFrame` + rarity names, a reward plate with still flat rays + sparkles,
the HUD toast). `dev/ui-screens.html?screen=` mounts the deep-run moments from
the real components for screenshots: `bossDefeated` · `bossIntro` · `win` ·
`lose` · `reveal` · `modal` · `coinpop`.
