# Tree Smashers — Roadmap

Outstanding work after the Chaos Arena → Tree Smashers rename & reskin.

- [x] #1 Please restyle/redesign all UI elements (All F-Component, but also the Font to family-friendly version and also the win/lose screen ribbon and the roulette wheel, basically all UI related elements, so it is a very consistent UI. Streamline also the button colors), all ornaments, add strong contrast backgrounds into FModal content background that makes this a lovely cozy, yet appealing family-friendly game.
- [x] #2 Redesign the FLogoProgress to work more like in zora-arena C:\Users\konst\Documents\__p\zora-arena with the very slowly moving bg.
- [x] #3 use the FReward reveal component from glyphix to have very astetically pleasing gift rewards screens, see  C:\Users\konst\Documents\__p\glyphyx
- [ ] #4 the skills each smasher has must give player feedback during the fight somehow, be it a vfx + sound or some other way that is good UX for gamers. Do it for all skills with drawn art if you create vfx or image and later we will paint it(add the bulletpoint in this file)

## Leaderboard / backend
- [ ] Create the D1 database: the Cloudflare account is at its 10-database limit — free a slot (or use another account), then `cd worker && npx wrangler d1 create leaderboard-tree-smashers`, paste the id into `worker/wrangler.toml` (`database_id` is a TODO placeholder)
- [ ] Apply `worker/schema.sql` + `worker/migrations/*` to the new DB (`--remote`)
- [ ] `npx wrangler deploy`, then `wrangler secret put SCORE_SECRET` and `wrangler secret put LEAGUE_SECRET`; set the matching `VITE_LEADERBOARD_SECRET` in `.env`
- [ ] Deploy the new Worker together with (or before) the new client — the build digest now includes smasher id + level, so an old Worker rejects build-carrying score posts
- [ ] `pnpm leaderboard:snapshot` once the Worker is live (the committed snapshot is a synthetic placeholder; Chaos Arena's real players were removed)
- [ ] Regenerate `data/league-pool.json` from real Tree Smashers builds once there are players (current pool = old part-only builds, mapped to smashers by parts)

## Art desk (paint pass)
- [ ] Paint the 12 smasher sheets (32 angles each, `art-sheets/smashers/<id>.png`, prompt in `art-sheets/PROMPTS-smashers.md`, regenerate with `pnpm art:smashers`); add slicer + painted-art override so painted frames replace the procedural ones
- [ ] Fix rig depth-sort glitches: hedgehog head vs. quills from behind, squirrel tail behind head from the back, turtle head over shell; give the beaver its buck teeth
- [ ] Paint the 3 arena designs (Mossy Glade, Mud Hollow, Twin Islands: islands, booster pads, mud, deep hole)
- [ ] Paint the two Team Towers (team-coloured trees) + destroyed stump
- [ ] Per-skill icons for the 36 smasher skills (currently the 10 generic effect icons)
- [ ] Boss trophy badges / boss look as smashers
- [ ] Paint a Tree Smashers battle backdrop (the default backdrop is a flat forest green for now; the old `public/images/bg/bg-tile*` Chaos Arena sigil tiles incl. `bg-tile-beyblade` are no longer shown by default and can be replaced or deleted)

- [ ] Repaint the roulette rim, pointer, hub and bulbs in the cozy style (`public/images/roulette/*` — currently not loaded, the wheel draws flat wood; re-enable in `useRouletteArt.ts` and re-measure the rim opening)
- [ ] Optional painted fabric banner for modal titles / result screen (CSS banner is the seam; the parchment ribbon image was removed)
- [ ] Repaint stat icons (`images/stats/*`), power-up boxes (`images/powerups/*-box`), boss badges (`images/boss-badges/*`), boss "next boss" frame (now a CSS wood ring) and the movie icon — still metal/dark

## Branding & promotion assets
- [ ] New logo (`public/images/logo/*` — still shows "chaos arena" on the loading screen and in the battle HUD)
- [ ] Favicon (`public/favicon.ico`) and Apple touch icon (`index.html` points to a missing `/images/icons/icon_192x192.png`)
- [ ] App icons: `src-tauri/icons/*` (all sizes, ico/icns, iOS set), Android launcher icons in `src-tauri/gen/android/.../res`, `electron/resources/icon.*`
- [ ] Promotion images: portal covers (all aspect ratios), store screenshots, 1200×630 og/twitter share image
- [ ] Gameplay trailer / portal preview videos, README gameplay GIF (`src/assets/documentation/gameplay.webp`)
- [ ] Portal listings (CrazyGames, Poki, Playgama, GamePix, Y8, itch, Glitch, GameDistribution, GameMonetize, Wavedash): title, description, art

## External registrations still pointing at Chaos Arena
- [ ] CrazyGames game (leaderboard key, game-files origin) — re-register or rename
- [ ] GameDistribution, GameMonetize, Glitch, Wavedash game ids
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

## Polish / tech
- [ ] Intro cutscene glows show slight ring banding (blur/radial removal); rotating rays lost their soft fade
- [ ] Remaining text-shadow / box-shadow blurs (e.g. PvP "VS" glow)
- [ ] Intro cutscene canvas caps DPR at 1.5 (render-sharpness rule)
- [ ] Warm smasher portraits during idle (first draw costs a few ms each)
- [ ] Dead leftovers: helpers in `skillText.ts`, drum-roll SFX, old references in `TRANSLATION-GUIDE.md`
- [ ] Unused `src/assets/music/chaos-quest/` and anthem/chant oggs — rename or delete
