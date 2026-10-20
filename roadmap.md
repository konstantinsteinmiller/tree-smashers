# Tree Smashers — Roadmap

Outstanding work after the Chaos Arena → Tree Smashers rename & reskin.

- [x] #1 Please restyle/redesign all UI elements (All F-Component, but also the Font to family-friendly version and also the win/lose screen ribbon and the roulette wheel, basically all UI related elements, so it is a very consistent UI. Streamline also the button colors), all ornaments, add strong contrast backgrounds into FModal content background that makes this a lovely cozy, yet appealing family-friendly game.
- [x] #2 Redesign the FLogoProgress to work more like in zora-arena C:\Users\konst\Documents\__p\zora-arena with the very slowly moving bg.
- [x] #3 use the FReward reveal component from glyphix to have very astetically pleasing gift rewards screens, see  C:\Users\konst\Documents\__p\glyphyx
- [x] #4 the skills each smasher has must give player feedback during the fight somehow, be it a vfx + sound or some other way that is good UX for gamers. Do it for all skills with drawn art if you create vfx or image and later we will paint it(add the bulletpoint in this file)

## Leaderboard / backend
- [ ] Create the D1 database: the Cloudflare account is at its 10-database limit — free a slot (or use another account), then `cd worker && npx wrangler d1 create leaderboard-tree-smashers`, paste the id into `worker/wrangler.toml` (`database_id` is a TODO placeholder)
- [ ] Apply `worker/schema.sql` + `worker/migrations/*` to the new DB (`--remote`)
- [ ] `npx wrangler deploy`, then `wrangler secret put SCORE_SECRET` and `wrangler secret put LEAGUE_SECRET`; set the matching `VITE_LEADERBOARD_SECRET` in `.env`
- [ ] Deploy the new Worker together with (or before) the new client — the build digest now includes smasher id + level, so an old Worker rejects build-carrying score posts
- [ ] `pnpm leaderboard:snapshot` once the Worker is live (the committed snapshot is a synthetic placeholder; Chaos Arena's real players were removed)
- [ ] Regenerate `data/league-pool.json` from real Tree Smashers builds once there are players (current pool = old part-only builds, mapped to smashers by parts)

## Art desk (paint pass)
- [x] Painted FLogoProgress / static-splash forest tile (`public/images/bg/forest-tile_512x512.webp`, 15.6 kB, seamless via `tools/bg-tile/make-tile.mjs`; the SVG stays as fallback layer)
- [x] Smasher painting pipeline: bare references (`node tools/smasher-sheets/export.mjs --bare`, no disc — the disc stays live), 3 × 3 parts a/b (frames 0–8, 8–16; 17–31 mirrored — `parts.mjs`), prompts (`prompts.mjs`), slicer with registration + facing/likeness refusal + part-a colour match (`slice-painted.mjs`), unattended queue (`paint-queue.mjs`, log `art-sheets/smashers-bare/queue.log`); painted-art override in `smasherAtlas.ts` (signature look only, `?art=procedural` A/B, falls back to the rig above 64 px/unit)
- [ ] Paint the 12 base smasher sheets — queue running (done: bramble, chomper, grizzle; check `queue.log`, re-run `node tools/smasher-sheets/paint-queue.mjs` after a QUOTA stop)
- [ ] Paint the 36 batch A/B/C smashers (queued after the base 12 by the same queue; prompts auto-built from the batch comment blocks)
- [ ] Painted boss dress + skin colourways (painted sheets cover the signature look only; bosses/skins keep the rig)
- [x] Painted terrain feature atlas (`public/images/terrain/features_960x960.webp`, 65 kB: stump, rock, pond, mushroom, mud, deep hole, honey, booster, leaf arrow — `tools/terrain-sheets/*`, override in `src/use/arenaTerrainArt.ts`; applies to every arena layout incl. the new designs)
- [ ] Paint the log capsule (variable length — needs a 3-slice: two cut ends + a tiling bark strip) and a painted floor per arena type (lava / ice / boss / forest — the painted layout floors cover 'default' only)
- [ ] Fix rig depth-sort glitches: hedgehog head vs. quills from behind, squirrel tail behind head from the back, turtle head over shell; give the beaver its buck teeth
- [x] Paint the 3 arena designs (Mossy Glade, Mud Hollow, Twin Islands: islands, booster pads, mud, deep hole) — via the feature atlas above
- [ ] Paint the two Team Towers (team-coloured trees) + destroyed stump
- [ ] Paint the 50 arenas: check every layout on `dev/arenas.html` (contact sheet: shape, theme floor, decor, features, towers, spawn discs) with painted art on; per-theme floor tints (`TerrainLayout.theme.floor`) may want a painted floor tile each
- [ ] Paint the new feature kinds where the atlas still falls back to vector: leaf arrow, honey, mushroom cap, log (one draw fn each in `src/use/arenaTerrainDraw.ts` → `TERRAIN_FEATURE_DRAW`)
- [ ] Paint the 10 floor-decor kinds (`DECOR_DRAW`: tufts, ferns, flowers, pebbles, leaves, snow, reeds, acorns, cones, toadstools) as a small decor atlas
- [ ] Paint the 36 smasher skill icons (now procedural drawings in `src/use/skills/smasherSkillArt.ts` — the one registry; drop `public/images/skills/<skillId>.webp`, square, transparent, art only, and set `painted: true` on that skill; the medallion rim + effect-colour disc stay procedural). Shown in battle callouts, HUD skill chips, the Team modal and the PvP ready card
- [ ] Paint the 15 skill VFX flavour sprites (quill, chip, star, puff, carrot, drop, heart, wool, leaf, flame, hex, feather, zed, acorn, spark — `FLAVOUR_SHAPES` in the same registry; `public/images/skills/fx/<shape>.webp` + `painted: true`)
- [ ] Boss trophy badges / boss look as smashers
- [x] Paint a Tree Smashers battle backdrop — painted highland-plain tile (`public/images/bg/highland-tile_768x768.webp`, 12 kB, seamless via `make-tile.mjs --hard`, never upscaled) + decorative props around the clearing, both baked once into a device-resolution layer (`src/use/arenaBackdrop.ts`); default bg skin only. The old `public/images/bg/bg-tile*` Chaos Arena sigil tiles incl. `bg-tile-beyblade` are still unused and can be replaced or deleted
- [x] Painted arena floors for layouts 0–2 (Mossy Glade, Mud Hollow, Twin Islands) — `public/images/arena-floors/floor-<id>_1024x1024.webp` (18–29 kB), clipped to the layout's SDF outline, procedural fallback (`src/use/arenaFloorArt.ts`, `tools/arena-floors/make-floors.mjs`)
- [x] Arena props, first batch (27 sprites, one 113 kB atlas — `tools/arena-props/pack.mjs`): forest A (oak, fir, blossom tree, boulder, boulder pair, stones, berry bush, wild flowers, fern), forest B (log, log pile, beehive, lily pond, reed pond, heart + paw gravestones, sunflowers, honey pot), bedroom A (play blocks, toy bricks, teddy, bunny, ball, train, stacking rings, rubber duck, crayons). Deterministic scatter per layout outside the wall (`src/use/arenaProps.ts`, guarded by `tests/arenaProps.test.ts`)
- **Gemini account limitation:** since the Oct 2026 account switch Gemini refuses reference-based edits ("Sorry, I can't edit images for you yet") — every job above was painted from a TEXT-ONLY prompt (`paint.mjs` without `--ref`). Reference-driven work (smasher turnarounds, terrain atlas repaints, anything registered against a layout sheet) needs a text-only fallback prompt or the old account
- [ ] Paint the remaining 47 arena floors (layouts 3–49): one text-only prompt per layout in `art-sheets/arena-floors/` from its theme (`TerrainLayout.theme` decor + floor tint), then `node tools/arena-floors/make-floors.mjs`; consider per-arena-type floors (forest / lava / ice / boss) — painted floors only replace the 'default' arena type today
- [ ] Higher-resolution floors for big screens: at 1024 px the floor falls back to procedural above 1.5× upscaling (≈3.8 device px/unit — e.g. 4K desktops at 2×); paint or upscale-repaint at 2048 if those players matter
- [ ] More prop sheets: forest C (birch, willow, mushroom ring, flower meadow patch, mossy stump, picnic blanket, wooden fence piece, signpost without text, bird house), autumn/snow variants for the themed layouts (snowyClearing, autumnLeaves, mistyGlen …), water edge set (reeds, stepping stones, small bridge)
- [ ] Bedroom theme set per arena group: today the toy-box group (layouts 6, 13, 20, 27, 34, 41, 48 — `propThemeFor`) mixes the bedroom-A toys into the meadow; give it its own backdrop (rug / wooden floorboards tile), a bedroom B sheet (toy car, xylophone, spinning top, picture book, building-block tower, toy drum, slipper, pillow, night-light star) and painted floors that read as a play mat
- [ ] Backdrop variants per biome: snowy plain, autumn heath, marsh, rocky mountain steppe, dusk (boss) — one tile each, picked per layout theme / arena type (`PAINTED_BACKDROP` → a per-theme map)
- [ ] Props for the premium bg skins (today props only draw on the default skin) — decide whether props should stay with every skin
- [ ] Prop polish: a few props are 1.1–1.3× upscaled above 3.2 device px/unit (4K at 2×); repack at a higher `--ppu` if needed (atlas grows ~2×)

- [ ] Repaint the roulette rim, pointer, hub and bulbs in the cozy style (`public/images/roulette/*` — currently not loaded, the wheel draws flat wood; re-enable in `useRouletteArt.ts` and re-measure the rim opening)
- [ ] Optional painted fabric banner for modal titles / result screen (CSS banner is the seam; the parchment ribbon image was removed)
- [ ] Repaint stat icons (`images/stats/*`), power-up boxes (`images/powerups/*-box`), boss badges (`images/boss-badges/*`), boss "next boss" frame (now a CSS wood ring) and the movie icon — still metal/dark

- [ ] Repaint art to the new "toy-box arena" language (see `ui-catalog.md`): HUD icon set (gears, team, trophy, chest, movie, gift) with navy outlines + brighter fills; stat icons, power-up boxes and card frames in royal/ice instead of wood/gold; navy-outlined coin; optional yellow/lime/pink fabric ribbons for the banner slot

## Branding & promotion assets
- [ ] New logo (`public/images/logo/*` — still shows "chaos arena" on the loading screen and in the battle HUD)
- [ ] Favicon (`public/favicon.ico`) and Apple touch icon (`index.html` points to a missing `/images/icons/icon_192x192.png`)
- [ ] App icons: `src-tauri/icons/*` (all sizes, ico/icns, iOS set), Android launcher icons in `src-tauri/gen/android/.../res`, `electron/resources/icon.*`
- [ ] Promotion images: portal covers (all aspect ratios), store screenshots, 1200×630 og/twitter share image
- [ ] Gameplay trailer / portal preview videos, README gameplay GIF (`src/assets/documentation/gameplay.webp`)
- [ ] Portal listings (CrazyGames, Poki, Playgama, GamePix, Y8, itch, Glitch, GameDistribution, GameMonetize, Wavedash): title, description, art

## External registrations still pointing at Chaos Arena
- [ ] CrazyGames game (leaderboard key, game-files origin) — re-register or rename
- [ ] GameMonetize, Glitch, Wavedash game ids
- [ ] AdMob app + ad unit ids, LevelPlay app keys / unit ids, Unity keys (`.env.tauri`)
- [ ] New bundle id `com.hyperg8.tree-smashers`: App Store Connect app, Apple App ID, Play Console app, Fastlane match repo `tree-smashers-signing`; Android signing still uses the chaos-arena keystore (`gen/android/key.properties`) — decide on a new upload key
- [ ] Rebuild Android native libs (`gen/android/app/src/main/jniLibs` were stale and removed) — `tauri android build` regenerates them
- [ ] Privacy policy page at `konstantinsteinmiller.github.io/privacy/tree-smashers/`; review the "18+" age statement for a cute plush game
- [ ] GitHub repo rename (Pages base `/tree-smashers/`), surge domains `tree-smashers(.|-demo.)surge.sh`

## Gameplay & balance
- [ ] Balance smasher level costs (~190 → ~2,500 coins), stat profiles, skill mods, unlock stages
- [ ] Give every skill an explicit numeric drawback where it only has an implicit one
- [ ] Tune Team Tower HP ratio / damage (`TOWER_HP_RATIO`, `TOWER_DAMAGE_MUL`), AI tower-rush chance (20 %), deep hole placement on Mud Hollow
- [ ] PvP honour still counts side-loadout skill levels (now always 0) — count smasher skill levels
- [ ] Optional: one-time coin refund for coins spent in the old skill system
- [ ] Skill HUD chips show the effect name, not the smasher skill name
- [ ] Show arena layout names somewhere (already translated); optional DOM tower HP bars (`towerHud`)
- [ ] HP ring sits over the character's belly — restyle/move
- [ ] Skin shop / roulette / battle pass now show colourways — name & description copy pass
- [ ] Decide on `VITE_APP_FEATURE_SKILLS` (now effectively mandatory) and the bosses100 / league flag defaults in `.env`

## Smasher mechanics (disc size, directional armour, smasher-only skills)
- [x] Part-level balance pass: smashers read their own part tables (`SMASHER_*` in useSpinnerConfig.ts — Speedy/Tanky weight 100/115 instead of 80/150, HP and per-level speed reshaped, Star/Piercer/Soft Shell tops, profile weight^0.5), 38 profiles recalibrated; all 48 smashers 40–60 % in the 1v1 round robin. Part-only campaign enemies keep the legacy tables + a level-keyed NPC HP curve (`campaignNpcHpMul`) so the default team's campaign curve stays within a few points per 10-stage band. Sim: `scripts/balance-sim.mjs` → `balance-report.md`
- [ ] Balance follow-ups: re-run `scripts/balance-sim.mjs` after any skill / profile / physics change (report lists per-level outliers — e.g. Horace weak at L5, Curly weak at L30); `tests/smasherBalance.sim.test.ts` is superseded by it (delete or keep as the archetype-matched view)
- [ ] Campaign: the default team's curve is back within ±5 pts per band except 31–40 (−7); a player fielding the newest unlocks early (Grizzle at stage 3) now finds stages 1–20 much harder (72 → 39 % at 1–10) because bulky early smashers were overpowered — watch first-session retention, maybe soften the curve below enemy level 8
- [ ] 2v2 still favours bulky smashers / defensive tops by ~5–10 pts (1v1 the reverse): Curly, Gastro, Shellby, Grizzle sit at 60–68 % in 2v2 mixes — look at their team-shaped skills
- [ ] Legacy force decay passes 1.0 per level (Speedy ≈ L10, Balanced ≈ L23): a fast launch never slows by decay alone late game — cap it (needs a re-balance + campaign re-fit)
- [ ] Profile speed is a net negative in the sim (faster profiles win less: walls, holes, hazards) — check with real player aim before trusting it; the scripted player is a random aimer
- [ ] League gatekeeper levels (`GATEKEEPER_LEVEL`) were sim-fitted with tools/skills-sim on the old smasher stats — re-check with the new tables
- [ ] NPC AI ignores armour: aim at weak backs / avoid armoured fronts, and prefer Tower Breaker carriers for tower rushes
- [ ] Paint armour art: the riveted plate / stitched patch rim arcs are procedural (`drawArmorArcs` in useSpinnerGame.ts); also show disc size + armour in the Team modal / smasher card
- [ ] Skill art for the 12 switched skills still shows the old effect's icon motif (ids kept: quill_burst, log_slam, plate_bounce, claw_drill, chitin_plate, spine_wall, horn_ram, belly_slide, river_roll, tail_anchor, blubber_wall, spike_puff) — redraw/paint icons that read as thorns / anchor / bank shot / tower breaker
- [ ] Native-speaker review of the new effect descriptions + callouts (39 locales, machine-quality)
- [ ] Bumpers can still fall back onto a big disc's spawn (ring-slot fallback ignores blades — pre-existing)

## UI / UX
- [x] #UX1 Brawl-Stars-grade action UI pass (pro UI/UX artist brief): every element in `ui-catalog.md` made punchy and edgy — press-down buttons, bold cards, reward moments, soft fitting UI SFX — while staying functional
- [ ] Optional: a second action-UI pass after playtesting the first. Ideas:
  - Sliding selection puck for FButtonSwitch / FTabs (one indicator that travels between options instead of a per-segment pop)
  - Coin / diamond "fly to badge" trail for every grant, not only the battle win, with a tick per coin landing
  - Visible rarity names ("RARE", "EPIC") on smasher cards and a rarity-coloured reveal burst in the gift reveal (needs i18n keys)
  - A "can't afford" state that keeps the price colour (berry price text on the sun button) instead of full steel, so the player still sees what it costs
  - Card flip on the skin picker when a skin is bought (back of card → front)
  - `.ui-bump` / `.ui-slam` variants built on the individual `scale` / `rotate` properties, so they compose with skewed plates
  - Long-press preview on roster cards (stats peek) and a hold-to-confirm ring on destructive buttons (reset, surrender)
  - Repaint the HUD icon set with navy outlines (ui-catalog §8) so painted icons match the new plates
  - Playtest the UI tick levels on real phones at full device volume; adjust `UI_GAIN` if taps feel too present
  - A screenshot-diff harness for the UI kit (pressed / disabled / focus states per tone) to catch regressions

## Sounds and Music
- [ ] #Sound1 Redesign all sounds and music, create a structured feedback returning web report page, so I can compare old versus new sounds and music and choose if I want to approve the new music or reject it for a new revision of the new music/sounds.
  Put the link to the structured website in the sounds-todo.md at the top of the page.
  - review page live, awaiting verdicts (r1 of all 45 sounds; link + workflow in sounds-todo.md)

## Polish / tech
- [ ] Intro cutscene glows show slight ring banding (blur/radial removal); rotating rays lost their soft fade
- [x] Remaining text-shadow / box-shadow blurs (e.g. PvP "VS" glow) — gone, and `tests/uiStyleRules.test.ts` now fails on any blurred shadow, blur(), backdrop-filter or radial-gradient
- [ ] Intro cutscene canvas caps DPR at 1.5 (render-sharpness rule)
- [ ] Warm smasher portraits during idle (first draw costs a few ms each)
- [ ] Dead leftovers: helpers in `skillText.ts`, drum-roll SFX, old references in `TRANSLATION-GUIDE.md`
- [ ] Unused `src/assets/music/chaos-quest/` and anthem/chant oggs — rename or delete
