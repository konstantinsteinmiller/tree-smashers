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
premium sun · plum · ad sky. **Hero CTA** (`variant="brawl"`): one per screen. A disabled premium button ("can't afford") stays sun yellow, sunk with the hatch, its price in berry pink.

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

* **Modal**: striped royal frame (4px navy, lip, lighter header band, dark slab,
  hard drop) around an **ice card**. Title = a skewed sun `.ui-tag` that drops in
  with a swing. X = berry icon button.
* **`.ui-card`** (collectible): ice face, ink outline, rarity edge (inner ring +
  thick base band), flat corner stripes, 4px drop; interactive cards lift/tilt on
  hover and sink on press.
* **`.ui-tag`**: skewed (−10°) striped plate behind upright text (titles, stage
  labels, turn banners, "NEW", difficulty tags).
* `.ui-panel` · `.ui-inset` · `.ui-plate` / `.ui-plate--dark` · `.ui-banner`
  (striped ribbon with swallow tails) · `.ui-chip` (+ `--angled`) · `.ui-notify`
  · `.ui-bar` (navy well, striped lime fill that springs) · `.ui-striped`.

### 1.5 Motion (juicy but cheap)

Transform and opacity only (the deny shake uses the `translate` property so it
composes with a press). Entrances use `backwards` fill so they never pin a
transform over hover / press.

* Press 70 ms down, spring up. Modal pop + frame swing (−3° → 0°).
* `.ui-drop-in` (ribbons, plates) · `.ui-slam` (titles / verdicts / big numbers
  crash in from 2× and settle) · `.ui-pop-in` stagger (`--i` × 45 ms) on grids,
  lists, rows · `.ui-bump` when a value lands · `.ui-deny` on a refused tap.
* Idle: shine, hero heartbeat, notify hop-and-tilt, `attention-bounce` "claim me".
* `FCountUp`: ease-out 0.35–1.1 s by size, pitched ticks, bump + ting on landing.
* `prefers-reduced-motion`: idle loops and entrances stop, presses stay short
  with no overshoot, count-ups jump. The low-quality tier drops stage punches.

### 1.6 Sound (`src/use/uiSfx.ts`)

Synthesised on the shared AudioContext (no files): `press` woody tock ·
`pressHero` deeper thunk · `release` pip · `toggleOn`/`toggleOff` two-note blips ·
`tab` light tick · `open`/`close` airy pop · `tick` count-up / roulette peg ·
`reward` two-note ting · `deny` double bonk · `slide` slider notch.
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
| **Stage badge** (`StageBadge.vue`) | current stage, top-left | progress brag read as furniture | striped royal plate (boss: berry plate); the number on an **angled shield** in the arena colour (upright digits, lip, base band, drop); "STAGE n" white stroke, name ice-200 | shield pops in tilted (0.6 → 1.2 → 1) on every stage change; not interactive (debug tap chord only) |
| **Coin badge** (`CoinBadge.vue`) | coin balance | numbers jumped | striped royal plate, coin overlapping the left edge, white tabular number | **counts** to the new value (0.35–0.9 s); gains count in sun then the badge bumps; spends count in white; instant on mount / reduced motion |
| **Treasure chest** (`TreasureChest.vue`) | timed free chest | "ready" didn't scream | cooldown: still chest, darkening ring, time on a navy chip; amount on a navy chip (small) or angled striped sun chip (big) | ready: berry "!", hop-and-rattle every 2.4 s (twice as eager for the big payout); one ting when it ripens during play; press squash + tick; cooldown taps silent |
| **Skin chest timer** (`SkinChestTimer.vue`) | 20 h skin cycle | should stay quiet | cooking: no motion, tabular time on a navy chip | ripe: berry "!", skin hops and spins every 2.2 s, time chip turns sun; press squash + tick |
| **Surrender flag** (`SurrenderIcon.vue`) | give up | danger must look dangerous, not inviting | berry icon button, no idle motion, aria-label | hover: flag flutters · press sinks · confirm dialog: ice card swings in, question on a berry angled tag, Cancel secondary, Quit danger, open/close sounds |
| **Ad coin button** (`AdRewardButton`) | rewarded coins | correct colour, flat | sky icon button, shine while available | press sinks; unavailable steel |
| **1x / 2x speed switch** (`FButtonSwitch`) | sim speed | selected state weak | recessed navy well; the active option is a **raised lime 3D button** (lip, gloss, drop) | active segment pops in (0.86 → 1, spring); idle segments lift on hover, squash on press; `tab` tick; disabled faded hatch |
| **FREE sticker / coin-price sticker** (speed switch) | free boost / coin price | soft sheen broke the no-ramp rule | FREE: leaf chip with a pulse + **hard double-strip** sheen; price: steel token | none (labels) |
| **Settings / mute** (`FIconButton`, `FMuteButton`) | options / sound | emoji speaker looked different per OS | royal icon squares; mute = round token with an **SVG** speaker: royal + waves when on, **berry + slash** when muted | painted icon tilts −8° and grows 10 % on hover; sinks on press |
| **Team / leaderboard / league HUD buttons** | open screens | all equal weight | royal icon squares; league = striped royal token with the tier colour as its top lip; berry `.ui-notify` for anything new | lift / sink; league hops + gift bubble bobs while a season reward waits; no fights left → steel |
| **PvP HUD button** (`PvPButton`) | open PvP | label was hardcoded | royal square with a berry inner "fight" ring, ⚔️ + "PvP" (`pvp.short`), aria-label `pvp.title` | sinks on press |
| **Daily rewards HUD button** | open daily rewards | claimable must pop | leaf 3D button (gift glyph, +N) with a berry "!" sticker | bounce lives on the wrapper so the press still sinks |
| **Battle pass HUD button** | open battle pass | — | royal 3D button with a berry count sticker | bounce on the wrapper; press sinks |
| **Background-skin button** (`BGSkinButton`) | arena backgrounds | — | royal frame | sinks into its drop on press; hover scale |
| **Combat log button + feed** (`CombatLog`) | open the log | fine | royal chip; feed rows ice with a 5px sky / berry side bar | +1px hover, −2px press, spring release |
| **Blade stat cards** | fighter stats | see-through mix, numbers lost | solid navy plate, striped royal header strip with stroked "SMASHER n", 900-weight tabular stroked numbers, 3px drop | frozen / chilled / dead states kept |
| **Skill HUD chips** (`SkillHudIcon`) | proc feedback | proc flash good, base ring muddy | medallion on a royal rim with a darker lower band | proc: punch to 1.35 at −10° + a thick sun ring burst with ink keyline |
| **Skill medallion** (`SkillIcon`) | skill art everywhere | — | royal rim, darker lower band, white lip, ice stitch | — |
| **Skill callout pills** (canvas) | which skill did what | — | navy edge, team fill, white name, sun value (unchanged this pass) | wait for the turn banner to clear |
| **Tap to start** | start a battle | opacity pulse felt sleepy | XL hard stroke; the hint on a navy angled plate | a double "thump" every 2.2 s |
| **Countdown numbers** | 3-2-1 | — | sun XL stroke | punch in tilted −12°, land straight, blow past the camera |
| **Turn banner** | "Your turn!" / "Opponent's turn" | weak | angled plate: leaf for you, berry for the opponent | slams in |
| **PvP "Opponent's turn"** | PvP turn | — | berry angled tag, sun text | drops in |
| **Drag hint** | onboarding | — | white text on a navy plate with a hard drop; frozen hint keeps ice | — |
| **Tip badge** (`TipBadge`) | tips | sticky note | ice card with a sun bar on the left edge | lands tilted at 0.6 s (after the reward), the star spins in |
| **Speech bubble** (`FSpeechBubble`) | onboarding speaker | backdrop never rendered (bad class) | ice bubble with a bottom band; speaker name on a royal angled tag | pops from its tail corner with a tilt; tag drops in |
| **Save status banner** | save state | — | striped plate (leaf bonus, royal offline) | slides up with overshoot |
| **HP rings / damage numbers / power-up badges** (canvas) | combat readouts | — | unchanged this pass (navy outlines, Nunito 900, team colours) | — |

## 3. F-components (the kit)

| Component | Target look | Interaction |
| --- | --- | --- |
| **FButton** | §1.2; `variant="brawl"` = hero (wrapper `.ui-breathe`, shine, stripes, uppercase) | disabled = `aria-disabled` + steel, still tappable for the deny shake; `attention` = hop with a squash on landing |
| **FIconButton** | royal / berry / leaf / sun / sky / plum squares, same recipe | painted icon tilts on hover; sinks on press |
| **FModal** | striped royal frame + ice card + **skewed sun title tag**, berry X | overlay pops, frame swings −3° → 0°, title drops in; X glyph turns 90° on hover, sinks on press; `open` / `close` sounds |
| **FTabs** | inactive: darker striped royal plates; active: ice (the page) with a sun accent bar | inactive lift 3px on hover, squash on press; active pops up; `tab` tick |
| **FSlider** | navy well, striped lime fill, ice 3D knob with grip bars | knob lifts on hover, sinks + squashes while held; a `slide` notch every 10 %, pitched by position (live volume preview on the SFX slider) |
| **FSwitch** | off: navy track, ice knob with a ✕; on: striped lime track, knob with a ✓ | knob springs across with overshoot, sinks while held; `toggleOn` / `toggleOff`; 44px row |
| **FButtonSwitch** | §2 speed switch | §2 |
| **FSelect** | ice field, royal chevron chip | chevron rotates 180° with a spring; options pop in staggered; selected = lime with stroke |
| **FMuteButton** | §2 | §2 |
| **FCountUp** (new) | tabular `n()`-formatted number | counts with ticks, bumps + optional ting on landing |
| **FLanguagePicker** | small ice 3D tiles, royal globe | lift 2px / sink 3px; current = striped lime with a sun ✓ sticker; tiles pop in staggered |
| **FReward** (result shell) | navy backdrop; striped ribbon (leaf win / berry lose); continue = striped royal pill with a sun » | ribbon drops in (celebration: slams from 1.9× −7°); continue pops in then squashes + chevrons kick every 1.4 s; Space / Enter continue |
| **FLogoProgress** (loader) | unchanged (navy outlines, sun logo, navy well, sun bar) | — |
| **FPerfMeter** (dev) | exempt | exempt |

## 4. Modals and screens

| Screen | Pro critique | Target look | Interaction |
| --- | --- | --- | --- |
| **Options** (`OptionsModal`) | flat list | ice rows; hatched divider band; FSelect / FSlider per §3; reset berry; Save & Close primary (not hero: a close must not pulse) | difficulty buttons pop in staggered, chosen one lime |
| **Team: slots + roster** (`SmasherTeamModal`, `CardRuneFrame`) | cards were pastel patches | **collectible cards**: ice face with faint hatch, ink frame, **rarity edge**, corner stripes, 4px drop; name on a **skewed ink plate**; level on an angled royal chip; slot number a leaf sticker | hover lift 3px + tilt −1.2° · press sink 3px, squash 0.97 · selected: striped sun face, sun ring, portrait 1.08, spring pop · locked: steel hatch, grey portrait, berry lock note · focus sun ring · grid pops in staggered |
| **Team: detail panel** | — | portrait in a rarity-edged frame with stripes; "+" skin = small sun 3D button; stat bars navy wells with striped fills; skill rows ice cards with a plum band | portrait swings in on each pick; bars grow from 0 and ease to new widths; next-level preview blinks; **Level Up = the hero** (sun), unaffordable → steel + deny; level-up plays `reward` |
| **Skin picker** | — | locked steel hatch; owned ice; equipped striped sun with ring and lift | press sink on Select / Buy / Ad buttons |
| **Leaderboard (global)** (`LeaderboardModal`) | own row must pop | ink header rule; top 3 angled rank plates sun / ice / berry, #1 row striped sun; **own row** striped sky, sky edge + lip, 1.015 scale, "YOU" chip; striped royal footer | rows pop in staggered |
| **Leaderboard (stage board)** (`FakeLeaderBoard`) | — | ice wells; #1 striped sun; player row sky edge + lip; podium chips sun / ice / berry; **Fight = lime 3D** (was berry), 44px | locked fight = steel |
| **Battle pass** (`BattlePass`) | premium must feel premium | tiers: locked steel hatch · in progress sun edge + "nn %" · claimable striped sun, ring, lift + tilt, shine · claimed slanted lime stamp; honour track = plum striped panel with a skewed ink title (sun text) | claim arrow hops (via `translate`, press intact); stamp slams in |
| **Daily rewards** (`DailyRewards`) | today must jump | day tiles as mini cards; skin days plum; **today** striped sun, ring, lifted 4px tilted −2°, shine, bouncing ▾; claimed = slanted lime ✓ stamp | Collect = hero; tiles pop in staggered; stamp slams (2.2 → 1); claim sound stays `happy` |
| **Shop** (`InAppPurchaseShop`) | price must read | packs as premium buttons, angled berry "best value" tag | packs pop in staggered |
| **Background skins** (`BGSkinModal`) | — | ink-framed cards; owned leaf base band; equipped striped sun, ring, lift, angled "Equipped" chip | pop in staggered |
| **Roulette wheel** (`RouletteWheel`) | spin had no sound, landing no punch | royal rim + navy outline + royal pointer (kept); segment colours bright; spin = hero | **peg tick** per segment past the pointer (pitched by speed; throttle turns the fast start into a rattle, the last clicks land one by one); wheel kicks on spin start, thumps on landing + `reward` ting; respin (sky, ad icon) pops in with shine; Skip = quiet 44px link; low quality / reduced motion drop the punches |
| **Roulette results** (arena) | — | big "3x" XL stroke, amounts large stroke; "Spin again" sun chip | prize bobs (transform, no brightness filter) |
| **Win / lose result** (arena + `FReward`) | win needed fireworks | verdict "YOU WIN!" / "YOU LOSE" in XL stroke; coins count from 0; honour on a striped plum plate with a double-strip shine; 3x coins = **sky hero** | verdict slams (win keeps a slow wobble); coin icon pops then counts with rising ticks, ting + bump on landing; 3x extra counts on from there; 3x unavailable → steel + deny |
| **Enemy surrendered** (arena) | — | ice card; OK = hero | — |
| **Leaderboard rank badge** (win screen) | — | angled striped royal tag, sun trophy, stroked "#N of M" | slams in 0.35 s after the verdict |
| **Ad / consent / dark-mode / ads-blocked modals** | must be calm and honest | standard FModal; primary lime, alternative ice; rewarded watch = sky with an equal-weight decline | only a gentle card pop-in; the forced-dark modal stays deliberately plain |
| **Quest reward** (`QuestReward`) | — | — | title slams; trophy and message pop in staggered |
| **Intro cutscene** | — | Skip = ice secondary 3D pill (was a translucent black capsule) | sinks + ticks |
| **Boss lab** (dev) | wood/cream leftovers | royal tiles with lip and drop, sun focus | lift / sink |

## 5. League and PvP

| Element | Target look | Interaction |
| --- | --- | --- |
| **League hub** (`LeagueHub`) | striped royal standing plate with the tier colour as a thick top edge; uppercase stroked rank; shield / streak / gate as angled tags; "fights today" big stroked number (lime, berry at 0); "Choose your opponent" on a tilted navy tag | badge crashes in; tags slam one by one; fights number bumps on change |
| **Opponent card** (`LeagueOpponentCard`) | collectible card: ice face, ink outline, **difficulty colour as the edge** (ring, base band, striped corner), tilted striped difficulty tag, team on a striped royal plate, lime uppercase FIGHT | pop in staggered · hover lift 3px tilt 1°, the two smashers turn to face each other · press: card sinks 3px + FIGHT sinks into its lip · disabled: hatched steel FIGHT, desaturated, deny · focus sun ring |
| **Gate card** (promotion fight) | boss card: berry edge, striped corners, tilted navy header with sun text, striped berry crest, flat sun rays, uppercase berry boss name; CHALLENGE = hub hero | crest spins in, name slams; compact crest on short landscape |
| **LP bar** (`LeagueLpBar`) | navy well with a hard inner lip, tier-coloured striped fill + white gloss strip; champion keeps four-colour moving stripes | stripes march while the fill slides; the promotion flag hops |
| **LP delta chip** (`LeagueDeltaChip`) | angled striped plate: lime up, berry down, steel no change | slams in while the number counts with pitched ticks |
| **Result panel** (`LeagueResultPanel`) | ice card with the tier edge; promotion = striped sun card | sequence: rank slams → delta slams + counts → bar charges → status tag slams → coins count and ting; promotion / division-up plays `reward` |
| **Season top list** | ice wells; ranks 1–3 raised striped cards sun / ice / berry; angled rank tags | rows pop in staggered |
| **Fights top-up (ad)** | sky ad button with shine | disabled while loading |
| **Unlock popup** | seven tiers rise on a striped royal stage; lime diamond bullets; "Enter league" hero; "Later" white with stroke (was barely readable) | tiers rise one by one |
| **Season reward** | tier icon slams, prize tiles raised striped cards, Claim = sun hero | tiles pop in; coins / diamonds count, coins land with a ting |
| **Rank badges / tier icons** | division plaque navy with ink outline, Nunito numeral; tier metals kept (bronze / wood are tier identity, not a base colour) | — |
| **PvP VS card** (`PvpVsPreview`) | face-off: two tilted striped plates leaning in (you sky, opponent berry), ink outline and drop; sun "VS" on a spiky starburst with a heavy stroke (no glow) | plates crash in from the sides with overshoot; VS crashes in with a thump; 1200 ms timing unchanged |
| **PvP lobby** (`PvPLobbyModal`) | arena tiles as real buttons, picked one stands up (tint, stripes, sun corner flag); team size = pair of 3D buttons, picked raised lime; "Level 1" chunky checkbox; win / loss / honour big stroked numbers; a ready side pops into a striped lime card; Create / Start / Ready = hero | toggle sound on the checkbox; guest-only controls dimmed, tapping one → deny |
| **Ready skills** (`PvpReadySkills`) | each level a small navy chip | — |

## 6. Reward spectacle and bosses

| Element | Target look | Interaction |
| --- | --- | --- |
| **Gift reveal** (`RewardRevealHost`) | gift box with band and bow; prizes climb out on a turning flat 14-point star in the reward tone; amounts in XL stroke; "NEW SMASHER" / "SPEED BOOST" on skewed berry tags | **anticipation** (drop in, lid rattles at ~0.4 s) → **press** squash 1.08 × 0.86 → **burst** (jolt, lid flies, flash + ring) → **count-up** from 0 staggered 110 ms, rising ticks, bump + ting per amount; sun focus ring; digits aria-hidden, final "+N" sr-only; sounds: existing celebration-1 / reward-continue only |
| **Reward stage / confetti** | flat rays + stacked discs; confetti from tokens (sky, berry, leaf, plum, sun, ice + tone) with a 1.5px navy edge, some flat stars | lit on a schedule (rays 90 ms, paper 170 ms) |
| **Boss intro card** | deep-navy plate skewed −12°, berry trim, berry stripes, berry base band, 5px drop; berry slash bars fly in at both ends; name berry-300 with heavy stroke | slams in within 1.5 s; pauses with the game; static on low quality / reduced motion |
| **Boss defeated band** | a berry slash across the screen at −3° (wider than the viewport), hard stripes, sun edge, navy drop; navy dim | title tilted to match, slams 1.6 → 0.94 → 1; tap-to-skip timing unchanged |
| **Boss trophy card** | skewed plum tag; a turning striped sun star behind the trophy skin | tag slams; skin bobs (no brightness pulse) |
| **Boss peek badge** | skewed berry warning tag with hard stripes; sun headline, stroked name | portrait slam / shudder and embers unchanged |
| **Boss trait glyphs** | flat SVG with navy outlines (unchanged) | — |

## 7. Canvas-drawn UI (`useSpinnerGame.ts` + `skills/*`)

Colour and typography only, no gameplay changes (unchanged this pass): navy
(`#161a40`) outlines instead of black or brown, Nunito 900 instead of Arial,
team colours sky (player) and berry (enemy), sun for money and highlights.

## 8. Art-desk follow-ups (painted art that should follow this language)

* HUD icon set (`public/images/icons/*_128x128.webp`: gears, team, trophy,
  chest, movie, gift) still carries the old warm-brown outlines. Repaint with
  navy `#161a40` outlines and brighter fills.
* Painted stat icons and power-up boxes: royal / ice frames with navy outline.
* Painted coin: keep it gold, but use a navy outline instead of brown.
* Optional painted plates for the `.ui-tag` / `.ui-banner` seams (sun, leaf,
  berry) with the same skew and stripes.
* Tree towers and the arena keep their natural palette (the forest is the stage,
  and the UI is the toy box on top of it).
