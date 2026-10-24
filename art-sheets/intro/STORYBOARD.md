# Tree Smashers — first-launch intro, storyboard (#Intro1)

AAA cinematic / UX pass, written before any painting. Owner brief: replace the
Chaos Arena leftover (old round arena with a red outline, no trees, a cheap
"ladder", too hectic) with an intro that puts the **tree towers** at the centre,
plays **calmer**, and shows the **smasher skills** — so a stranger wants to tap
"Tap to Start".

Runs once, before the first fight (stage 1). Skip from 1.0 s. ~16 s.

## 1. What looked cheap, and why

| Old | Why it read cheap | New |
| --- | --- | --- |
| Its own flat dark circle with a thin red/neon ring, a tiled dark background, no trees | Not the game. A stranger saw an arena that never appears again; the trees, the one thing that makes this game *Tree Smashers*, were missing | The real stage-1 clearing: the meadow's painted backdrop tile + props, the painted floor, the wooden log rim, the stump island and leaf boosters — the same modules the match bakes. Two painted team trees are the anchor of every shot |
| Chaos Arena "skins" (thunderstorm boss, tornado, diamond tops) | Wrong cast; the plush smashers were never introduced | Five painted smashers on their real discs: Bramble, Grizzle, Chomper (blue) vs Thumper, Vixie (red) |
| **The ladder**: Lv. 30 and Stage 50 badges counting down to 1 on an accelerating u² curve, 78 synth ticks into a blur, a 1.5 s hold, then "Win it all back!" | A countdown that blurs reads as a slot-machine glitch, not a story. Flat number plates, no art. And the meaning — *you had progress and lost it* — is false and negative for a stranger who never had any | Kept the **intent** (the climb: start at stage 1, the boss waits at the top) and redid it forward-looking and calm: a **stage trail** of five painted stepping stones (1 → 2 → 3 → 4 → boss stump crown) lights up stone by stone under the logo, then stone 1 flies into the live HUD stage badge |
| 9 launches, 2 chain-thunders, 2 KOs, hit-stop on almost every contact, slow motion, screen shake in 4.7 s of fight | Nothing was readable; every beat shouted | One idea per beat, one action at a time, 0.5–1.3 s holds between actions, two hit-stops in the whole film, one shake |
| Glow sprites from concentric rings (banding), DPR cap 1.5 | Soft / banded on phones | No glows at all (flat cel FX from the game's own pools), canvas at css × dpr, the static layer drawn 1 : 1 on whole device pixels on every hold |

## 2. Emotional arc

cosy → curious → "oh, the trees!" → anticipation → wow (skills) → payoff (the smash) → pride / promise (logo + the climb) → hand-off (Tap to Start).

## 3. Beats (director time T, seconds)

| # | T | Beat | What happens | Camera |
| --- | --- | --- | --- | --- |
| 1 | 0.0 – 2.6 | **Cosy forest** | The empty clearing at rest. Leaves drift down; a leafy canopy frame (painted canopy corners, vector leaves until painted) parts outward as the camera sinks into the clearing from above the enemy side. Skip appears at 1.0 | WIDE, centre y −120 → 0, ease in-out |
| 2 | 2.6 – 5.4 | **Two trees face off** | 2.6 the RED tree pops up out of the ground at the top wall (squash 0 → 1.08 → 1, leaf puff, thud). 3.25 the BLUE tree at the bottom. 3.9 the red tree's thorn garland snaps on along its front. 4.0 caption **"Smash their tree!"** (sun ribbon). 4.2 both tree HP gauges fade in | WIDE hold (small nudge to each tree as it pops) |
| 3 | 5.4 – 7.6 | **Smashers spin up** | 5.6 / 5.85 / 6.1 Bramble, Grizzle, Chomper drop onto their discs in front of the blue tree (fall + squash + dust), discs spin up; 6.3 / 6.5 Thumper and Vixie drop at the red tree | CLOSE on the blue side (5.4 → 6.1), back to WIDE-centre by 7.4 |
| 4a | 7.6 – 9.0 | **Skill 1 — Grizzle · Bear Hug** (Guard Shell) | Thumper winds up and rams Grizzle; the shield arc is up; contact at 8.05 → hit-stop 0.08, shield absorbs, callout pill "Bear Hug · 14 blocked", Thumper bounces off. Lower-third skill card | CLOSE on the clash |
| 4b | 9.0 – 10.5 | **Skill 2 — Bramble · Thorn Volley** (Homing Rockets) | Volley of 3 thorn rockets: two hit Vixie, the third hits the red tree → tree flash, splinters, leaves, damage state *healthy → damaged*, gauge 100 → 55 %. Callout "Thorn Volley · 3 rockets". Card | CLOSE, drifting from Bramble toward the red tree |
| 4c + 5 | 10.5 – 13.0 | **Skill 3 — Chomper · Log Slam** (Tower Breaker) = **the decisive smash** | 10.5 pull-back with the game's aim dots (anticipation 0.6 s), 11.1 launch, camera tracks; 11.45 – 11.85 slow-mo 0.35× into the tree; 11.85 IMPACT: hit-stop 0.14, white flash, one whole-pixel shake, thorn shards, 16 splinters, callout "Log Slam · +38 tree", gauge → 0, tree **felled** (stump + debris) with the full 26-leaf yellowing cascade. 12.0 – 13.0 leaves settle, the blue team hops | CLOSE on the red tree, slow push-in on the hold |
| 6 | 13.0 – 16.1 | **Title + the climb + hand-off** | 13.0 – 13.45 cartoon iris closes on the felled stump. 13.45 the key-art title card (the loader's sky, painted forest band and bushes; the two team trees flank the logo) with the logo slam (emblem → TREE → SMASHERS). 14.5 the **stage trail** lights up stone by stone (rising ticks), "Stage 1" tag. 15.3 hand-off: the card lifts away, the emblem flies into the HUD logo, stone 1 flies into the HUD stage badge, the live stage-1 arena with its own **Tap to Start** is revealed. 16.1 done | — (DOM title card) |

A tap anywhere on the title card jumps straight to the hand-off; Skip (or Esc)
fades out at any time after 1.0 s. Both end in the same state: stage 1 at
`tap_to_start`, nothing written but `smashers_intro_seen`.

## 4. Framing per device

Camera unit: the game's own fit (arena diameter + 76 padding across the short
side). Two zooms only, so every hold draws a baked layer 1 : 1:

* **WIDE** = 1.0 × fit — the whole clearing, both trees.
* **CLOSE** = min(1.35, the largest zoom at which the painted trees and floor
  still draw at ≤ 1.02 / 1.5 × their pixels). A 3× phone lands at 1.35.

| | Phone portrait (390 × 844 @3) | Phone landscape (844 × 390 @3) | Desktop (1280 × 720 @1) |
| --- | --- | --- | --- |
| WIDE | clearing fills the width; the backdrop props above and below frame it like a forest | clearing fills the height; wide forest on both sides (the cosy beat lives here) | as landscape |
| CLOSE | whole arena height still visible; the action fills the middle third | one third of the clearing's height either side of the action | as landscape |
| Caption | top third, under the safe area | top centre | top centre |
| Skill card | bottom centre, above the Skip button | bottom left | bottom left |
| Title card | logo 84 vw, trail under it | logo ≤ 44 vh tall, trail under it | same |

Safe areas: captions, card, Skip and the title card all sit inside
`env(safe-area-inset-*)`.

## 5. Typography and copy (39 locales)

UI-kit only: captions are the sun **FRibbon**, the skill card is an ice
`.ui-card` with a royal edge, the skill medallion (`SkillIcon`) and the
`ui-outline` text strokes; the title is the real logo lockup (SVG, painted when
the logo is). Copy is minimal — two new keys, everything else reused:

| Key | en | Used |
| --- | --- | --- |
| `intro.smashTree` | Smash their tree! | beat 2 caption |
| `intro.skills` | Every smasher has skills! | beat 4 caption (small, above the first card) |
| `smasher_<id>` / `smasher_skill_<id>` | (existing) | skill card name lines + callout pills |
| `skills.callout.*` | (existing) | callout values |
| `stageN` | Stage {n} | the trail tag |
| `spinner.skip`, `intro.skipAria` | (existing) | Skip |
| `spinner.tapToStart` | (existing, the arena's own) | after the hand-off |

`intro.reclaim` ("Win it all back!") is retired with the ladder.

## 6. Sound (reuse first; new ones = #Sound1 review slots)

| T | Cue | Source |
| --- | --- | --- |
| 0.6 | canopy rustle | synth `whoosh` (soft) |
| 2.6 / 3.25 | tree pops up | synth `thud` + `clash-1` at low ratio |
| 3.9 | thorns snap on | synth `tick` |
| 5.6 – 6.5 | five disc landings | synth `tick` (rising) |
| 8.05 | Bear Hug absorb | skill SFX (`skill-shield`, Grizzle's own pitch) + `clash-2` |
| 9.0 | Thorn Volley | skill SFX (`skill-rocket`) |
| 9.5 – 9.66 | rocket hits / tree hit | `clash-4`; tree: **tree-hit** slot (v2 file when approved, else `clash-3`) |
| 11.1 | launch | synth `whoosh` |
| 11.85 | Log Slam on the tree | skill SFX (`skill-boost`) + `explosion-1` low + **tree-fall** slot (v2 when approved, else `celebration-1`, as in a match) |
| 13.45 + 0.6 | logo slam | `level-up` |
| 14.5 – 15.0 | trail stones | synth `tick` rising run |
| 15.3 | hand-off | `happy` (quiet) |

New slots noted for #Sound1 (not wired, silent until made and approved):
**intro-ambience** (a 3 s forest bed under beat 1), **intro-logo** (a plush
"whomp + sparkle" logo sting to replace `level-up`), **intro-trail** (wooden
stepping-stone knocks to replace the synth ticks).

Rules kept from the old intro: built to work silent (autoplay before a
gesture); a cue whose moment passed on a suspended AudioContext is dropped,
never queued; everything obeys the SFX volume, platform mute and the
mobile-mute rule.

## 7. Reduced motion (`prefers-reduced-motion: reduce`)

Same beats and copy, same length. No camera moves (WIDE throughout), no
shake, no slow-mo push, no drop / squash (smashers and trees fade in), no iris
(a crossfade), callout pills without the pop, particles at the low-tier
counts, the title card still (the loader scene's own reduced-motion rules),
the emblem and stone fade at their HUD targets instead of flying.

## 8. Low tier (FX.low)

WIDE only (no CLOSE bake), tower / skill particles off (the game's low-tier
rules), callouts and rockets kept.

## 9. Assets

Already painted and reused: meadow backdrop tile + props atlas, meadow floor
0, terrain atlas, team-tree atlas (3 damage states + felled), tree-hit FX atlas
(splinters, leaves), smasher sheets + hi-res portraits, loader key-art layers
(tree, forest, front), logo SVGs. To paint (priority order, procedural/vector
fallback until then) — see `art-sheets/intro/*.prompt.txt` and
`tools/intro-art/paint-queue.mjs`:

1. **trail** — the five stepping stones of the stage trail (cut-outs).
2. **hero-trees** — the blue-bow and red-bow team trees as big side-view
   heroes flanking the logo on the title card (until painted: the loader's
   giant painted tree, mirrored).
3. **canopy** — the leafy canopy corner the camera sinks through in beat 1.
4. **skill-plate** — the lower-third plate behind the skill card.
