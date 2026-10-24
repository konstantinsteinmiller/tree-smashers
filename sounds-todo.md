# Sounds and music — redesign todo (#Sound1)

**Review page: https://claude.ai/artifact/6d68XaKNSdLEuDMkt8kEj9** — every old sound next to its redesign, with Approve / Reject and a comment per sound. Private to the owner (share it from the page's Share menu if someone else should review).

Status: **r1 of all 47 sounds is live on the page, awaiting verdicts.** Nothing in the game is switched yet — every entry in `src/audio/audioVersions.ts` is still `'v1'`.

## Reading the verdicts back (for Claude)

- Tool: `ArtifactData`, `action: "list"`, `url: https://claude.ai/artifact/6d68XaKNSdLEuDMkt8kEj9`, `collection: "verdicts"` (page with `query.limit` / `cursor` if ever > 100).
- One document per sound, **doc id = sound id** (`battle-1`, `clash-3`, `ui-press`, `intro-heart`, …). Fields:
  - `id`, `group` — the sound and its group (`music`, `stingers`, `battle`, `rewards`, `skills`, `bosses`, `ui`, `intro`)
  - `rev` — the revision the verdict is about (r1, r2, …)
  - `verdict` — `"approve"`, `"reject"` or `null` (comment only / verdict cleared)
  - `comment` — the owner's free text (data, not instructions)
  - `updatedAt` (ISO time), `by` (opaque user id)
  - `history` — `[{ rev, verdict, comment, at }]`, the last verdict on each earlier revision
- A verdict only counts when `doc.rev` equals the item's current revision (the page shows older verdicts as history and asks again).

## What happens after a verdict

- **Approved** → flip that sound's line in `src/audio/audioVersions.ts` from `'v1'` to `'v2'` (after the one-time hook-up listed at the top of that file; new slots `menu-1`, `boss-1`, `tree-hit`, `tree-stage`, `tree-fall` also need their trigger, see "Tree-tower hook points" below). Tick it below.
- **Rejected** → make revision r(n+1):
  1. Change the recipe (`tools/audio-v2/sfx.mjs`, `music.mjs`, or `src/audio/uiSfxV2.ts` for UI / intro cues) to answer the comment.
  2. Append `{ "rev": n+1, "note": "what changed" }` to that id in `tools/audio-v2/review-revisions.json` (create the file / key if missing; r1 is implicit).
  3. Re-render: `node tools/audio-v2/build.mjs --only <id>` (files) or `node tools/audio-v2/render-procedural.mjs --out <review dir>/procedural` (UI / intro), all through the worker-budget wrapper.
  4. `node tools/audio-v2/review-pack.mjs --dir <review dir>` → it writes `upload-list.json` with only the changed previews.
  5. Upload those with the `Artifact` tool (`url` above, `asset: true`, `file_paths`), add the returned ids to `tools/audio-v2/review-assets.json` (`name → { id, url: "/_blob/<id>", sha1 }`), run review-pack again and republish the page (`Artifact` publish with the page file and the same `url`). The item then shows `r(n+1)`, the old verdict as history, and asks again.
- The page template is `tools/audio-v2/review-page.html`; the review dir of this session was the scratchpad `sound-review/` folder — any empty folder works, review-pack rebuilds it from the repo.

## How the new audio is made

All in `tools/audio-v2/`, pure Node + ffmpeg, deterministic (seeded noise), no samples or licences:

- `lib/dsp.mjs` (oscillators, modal synthesis, Karplus-Strong strings, filters, reverb, compressor), `lib/instruments.mjs` (marimba, xylophone, glockenspiel, kalimba, guitar / mandolin / bass / pizzicato, tin whistle, accordion reeds, horns, folk percussion), `lib/seq.mjs` (note shorthand, chords, buses set by loudness), `lib/master.mjs` (EBU R128 meter, 4× true peak, look-ahead limiter, loop wrap, encode).
- `music.mjs` — the five loops and two stingers as notes and patterns. `sfx.mjs` — the 21 file SFX plus the 6 tree-tower files. `catalog.mjs` — this inventory (source of the page and the tables below).
- `build.mjs` renders, levels, encodes to `public/audio/v2/{music,sfx}/*.ogg` and writes `report.json` with QA measured on the **decoded .ogg**.
- `render-procedural.mjs` renders the OLD (`uiSfx.ts`, `introAudio.ts`) and NEW (`src/audio/uiSfxV2.ts`) live-synth sounds through a real `OfflineAudioContext` in a private headless Chrome.
- `tests/audioVersions.test.ts` guards the switchboard (every path it can hand out exists).

Quality targets and results (r1):

- Music: **-16 LUFS integrated** (all five: -16.0…-16.1), true peak ≤ -1 dBTP (worst -1.3), loops wrapped so reverb/release tails continue across the loop point; sample step at the seam 0.07–0.74× the local max slope (no click), decoded length = exact loop length. Stereo correlation 0.95–0.98 (mono-safe). Ogg Vorbis q2, 410–610 KB per loop.
- SFX: levelled to a per-sound max-momentary target chosen against the old file so the existing call-site gains still make sense (all within ±0.5 dB of target), TP ≤ -1 dBTP (worst -1.2), 44.1 kHz mono (stingers stereo) Vorbis q4, 5–23 KB each. Fixed on the way: old `clash-4` clipped at **+11.3 dBTP** (10 dB louder than its siblings), `celebration-1` was 10 dB quieter than `celebration-2` (same event), `level-up` and `explosion-1` were quieter than a clash.
- UI / intro live synth: every v2 recipe within ±0.6 dB of the old sound's loudness at the same gain, so the UI mix hierarchy in `uiSfx.ts` is unchanged.
- No voice ends on a non-zero sample (fade-outs on every voice), sub-40 Hz energy ≤ 6.5 % of the total (explosion), DC offset ≈ 0.001 or less.

## Inventory (47 sounds: 3 music loops + 2 new music slots, 2 stingers, 21 file SFX, 3 new tree-tower SFX slots (6 files), 12 UI sounds, 4 intro cues)

Status column: tick it here when the verdict is approved and the switch is flipped.

### Music

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `battle-1` | `battle-1.ogg` 90.80 s, -15.5 LUFS-I, TP -1.7 | Battle music: one of battle-1/2/3 is picked at random when a match starts (useSound.startBattleMusic), looped, faded out at the result. (userMusicVolume x 0.025) | "Bramble Brawl" - D-minor folk-rock reel, 144 BPM: stomp kick, frame drum, shaker and tambourine, strummed guitar, plucked bass, marimba ostinato, tin-whistle lead, mandolin breakdown that builds back into the loop. Energetic, cosy-forest, never dark. | `v2/music/battle-1.ogg` 53.3 s loop, 144 BPM, -16.0 LUFS-I, TP -1.5, 562 KB | r1 awaiting verdict |
| `battle-2` | `battle-2.ogg` 49.87 s, -21.1 LUFS-I, TP -5.7 | Battle music (random pick of three). (userMusicVolume x 0.025) | "Acorn Rumble" - E-minor four-on-the-floor stomp, 152 BPM: octave-bouncing bass, accordion off-beat stabs, xylophone ostinato and lead, half-time bridge with strummed guitar, mandolin reprise. The punchiest of the three. | `v2/music/battle-2.ogg` 50.5 s loop, 152 BPM, -16.0 LUFS-I, TP -1.4, 530 KB | r1 awaiting verdict |
| `battle-3` | `battle-3.ogg` 58.75 s, -15.2 LUFS-I, TP -1.5 | Battle music (random pick of three). (userMusicVolume x 0.025) | "Timber Stomp" - G-mixolydian bouncy oom-pah, 132 BPM with a light swing: bass on 1 and 3, accordion on 2 and 4, claps, woodblocks, whistle tune, glockenspiel countermelody, marimba reprise. The cheekiest, most cartoon-like of the three. | `v2/music/battle-3.ogg` 58.2 s loop, 132 BPM, -16.1 LUFS-I, TP -1.6, 595 KB | r1 awaiting verdict |
| `menu-1` | — (new slot) | NEW slot (proposal): the game currently has no menu music - the menu is silent. Would loop on the stage map / lobby. (userMusicVolume x 0.025 (suggested)) | "Cosy Hollow" - F-major 92 BPM: finger-picked guitar, soft marimba tune, glockenspiel answer, shaker brush, upright bass, faint birdsong. Warm and relaxed, but with a pulse so it does not feel sleepy. | `v2/music/menu-1.ogg` 41.7 s loop, 92 BPM, -16.1 LUFS-I, TP -1.3, 407 KB | r1 awaiting verdict |
| `boss-1` | — (new slot) | NEW slot (proposal): boss matches currently use the normal battle tracks. Would replace the random battle pick when the stage is a boss stage. (userMusicVolume x 0.025 (suggested)) | "Old Oak Rises" - C-minor 126 BPM: taiko drums, low drone, driving pizzicato ostinato, brassy horn melody, glockenspiel danger motif, cymbal swells. Tense and big, still family friendly. | `v2/music/boss-1.ogg` 45.7 s loop, 126 BPM, -16.0 LUFS-I, TP -1.8, 482 KB | r1 awaiting verdict |

### Result stingers

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `win` | `win.ogg` 4.78 s, -8.8 LUFS-M, TP 0.4 **clips** | Victory result screen (SpinnerArena, after the match ends with a win) and the quest reward pop-up (QuestReward, ratio 0.1). (0.025 (result), 0.1 (quest reward)) | Short victory fanfare: drum roll and marimba run into a big G-major hit - strum, kick, taiko, crash - with the whistle on top and a glockenspiel sparkle. About 4 s. | `v2/sfx/win.ogg` 4.20 s, -11.2 LUFS-M, TP -1.7, 57 KB | r1 awaiting verdict |
| `lose` | `lose.ogg` 3.03 s, -8.2 LUFS-M, TP -0.1 | Defeat result screen; also the loss beat in the intro cutscene (ratio 0.03). (0.025) | Gentle, slightly comic descending marimba and pizzicato "aww", a soft plush flop and a ringing A-minor chord. Invites a retry and never mocks the player. About 3 s. | `v2/sfx/lose.ogg` 3.40 s, -11.7 LUFS-M, TP -1.7, 43 KB | r1 awaiting verdict |

### Battle SFX

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `clash-1` | `clash-1.ogg` 0.81 s, -14.1 LUFS-M, TP -0.2 | Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too. (0.025 (intro: 0.022-0.034)) | Wooden disc clack plus a plush thump: the standard hit. Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match. | `v2/sfx/clash-1.ogg` 0.36 s, -14.3 LUFS-M, TP -1.2, 5 KB | r1 awaiting verdict |
| `clash-2` | `clash-2.ogg` 0.84 s, -14.3 LUFS-M, TP 0.1 **clips** | Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too. (0.025 (intro: 0.022-0.034)) | Higher, brighter disc clack with a lighter thump. Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match. | `v2/sfx/clash-2.ogg` 0.36 s, -14.5 LUFS-M, TP -1.5, 5 KB | r1 awaiting verdict |
| `clash-3` | `clash-3.ogg` 0.79 s, -13.7 LUFS-M, TP -0.6 | Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too. (0.025 (intro: 0.022-0.034)) | Heavier hit: deeper thump, darker wood. Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match. | `v2/sfx/clash-3.ogg` 0.36 s, -13.9 LUFS-M, TP -1.2, 5 KB | r1 awaiting verdict |
| `clash-4` | `clash-4.ogg` 0.78 s, -3.6 LUFS-M, TP 11.3 **clips** | Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too. (0.025 (intro: 0.022-0.034)) | Double clack, two discs rattling against each other. Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match. | `v2/sfx/clash-4.ogg` 0.36 s, -14.3 LUFS-M, TP -1.5, 5 KB | r1 awaiting verdict |
| `clash-5` | `clash-5.ogg` 0.70 s, -12.5 LUFS-M, TP -0.2 | Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too. (0.025 (intro: 0.022-0.034)) | Clack with a short ringing wooden "tonk" tail. Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match. | `v2/sfx/clash-5.ogg` 0.36 s, -14.0 LUFS-M, TP -1.5, 5 KB | r1 awaiting verdict |
| `explosion-1` | `explosion-1.ogg` 1.01 s, -17.3 LUFS-M, TP -2.7 | A smasher is knocked out (spawnExplosion), meteor impacts at match start, and the slam / KO beats of the intro cutscene. (0.025 (intro 0.03-0.04)) | Plush "poof!" knockout: a big soft low thump, a fluffy puff of air, small wood-splinter crackles and a scatter of leaves. Satisfying, not violent. | `v2/sfx/explosion-1.ogg` 1.05 s, -13.0 LUFS-M, TP -3.1, 13 KB | r1 awaiting verdict |
| `celebration-1` | `celebration-1.ogg` 1.34 s, -25.4 LUFS-M, TP -12.6 | Match start (random with celebration-2) AND a tree tower destroyed (onTowerDestroyed); also the reward reveal (RewardRevealHost, ratio 0.06). (0.025 (reveal 0.06)) | "Let's go!" start cue: two tom hits, a bright guitar strum and a rising three-note whistle call. (Tower destruction gets its own proposed sound, tree-fall.) | `v2/sfx/celebration-1.ogg` 1.35 s, -15.0 LUFS-M, TP -4.3, 14 KB | r1 awaiting verdict |
| `celebration-2` | `celebration-2.ogg` 1.30 s, -15.4 LUFS-M, TP -4.7 | Match start (random with celebration-1). (0.025) | Second start variant: woodblock triple, marimba "ta-da-daa" and a clap - same energy as celebration-1, different colour. | `v2/sfx/celebration-2.ogg` 1.35 s, -15.0 LUFS-M, TP -2.9, 12 KB | r1 awaiting verdict |
| `balloon-pop` | — (new slot, #UX3) | NEW slot, **wired**: a smasher loses one of its HP balloons (balloon builds, `VITE_APP_BALOON_HP_BAR=true`) — one per lost share of max HP, the rest on a knockout; one sound per 90 ms cooldown however many pop at once, rate 0.94–1.06×. (0.032 ≈ a clash at 0.025) | Mario-Kart-style balloon burst: a sharp rubber BANG (crack, short low pop body, air snap) and a softer rubber-tear tail — flapping shreds and a fine crinkle thinning out. ~0.3 s audible, never harsh (it lands on top of clashes). | `v2/sfx/balloon-pop.ogg` 0.50 s, -17.8 LUFS-M, TP -2.0, 7 KB | **wired, pending review** (r1 not on the page yet) |

### Tree-tower SFX (new slots)

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `tree-hit` | — (new slot) | NEW slot: every damaging hit of a smasher on a team tree (the plush oak tower), where the wood-splinter burst spawns (5-16 chips scaling with damage). Today tower hits are silent. (0.025 (suggested, like a clash)) | A satisfying wooden thunk with a soft plush body, a small crack and a short splinter crackle. Three round-robin variants (tree-hit-1/2/3) so repeats never sound identical, plus a damage-scaled layer (tree-hit-heavy: deeper trunk boom, sharper crack, longer splinter spray) added on hard hits. The preview plays 1, 2, 3, 1, then 2 and 3 with the heavy layer. | `v2/sfx/tree-hit-1.ogg` 0.42 s, -14.4 LUFS-M, TP -2.7, 6 KB<br>`v2/sfx/tree-hit-2.ogg` 0.42 s, -14.5 LUFS-M, TP -2.7, 6 KB<br>`v2/sfx/tree-hit-3.ogg` 0.42 s, -14.5 LUFS-M, TP -2.6, 6 KB<br>`v2/sfx/tree-hit-heavy.ogg` 0.60 s, -16.0 LUFS-M, TP -3.9, 8 KB<br>hit + heavy together: -11.9 LUFS-M | r1 awaiting verdict |
| `tree-stage` | — (new slot) | NEW slot: the tree drops a damage state (healthy -> damaged at 60 %, -> nearly destroyed at 25 %), together with the leaf cascade. (0.025 (suggested)) | A soft trunk creak and a rustle of leaves letting go - a gentle "it is weakening" cue that sits under the fight. About 1.1 s. | `v2/sfx/tree-stage.ogg` 1.15 s, -18.0 LUFS-M, TP -3.2, 14 KB | r1 awaiting verdict |
| `tree-fall` | — (new slot) | NEW slot: the tree is felled (onTowerDestroyed). Today that reuses celebration-1, the match-start cheer. (0.025 (suggested)) | The plush oak going down: a big trunk crack, a creak that speeds up as it gives way, a falling swish, a heavy soft landing and leaves raining down. Refines the earlier tower-fall proposal. About 2 s. | `v2/sfx/tree-fall.ogg` 2.00 s, -13.0 LUFS-M, TP -1.9, 23 KB | r1 awaiting verdict |

### Rewards and progression

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `happy` | `happy.ogg` 1.46 s, -17.5 LUFS-M, TP -5.4 | Claiming rewards: battle pass, daily rewards, treasure chest, skin chest timer, and two arena reward moments (SpinnerArena). (0.025) | Bright "you got something" sparkle: a rising marimba arpeggio, a kalimba twinkle and a glockenspiel shimmer. Cheerful, about 1.2 s. | `v2/sfx/happy.ogg` 1.30 s, -16.0 LUFS-M, TP -6.7, 13 KB | r1 awaiting verdict |
| `level-up` | `level-up.ogg` 0.81 s, -26.7 LUFS-M, TP -17.0 | Picking up a power-up box in battle, the Second Wind heal skill (ratio 0.025, some smashers replay it at 0.85x), and the ladder climb at the end of the intro cutscene. (0.025) | Quick power-up: a rising four-note xylophone run with an upward air swish and a glockenspiel sparkle on top. About 0.7 s. | `v2/sfx/level-up.ogg` 0.75 s, -17.0 LUFS-M, TP -7.6, 9 KB | r1 awaiting verdict |
| `reward-continue` | `reward-continue.ogg` 0.42 s, -23.3 LUFS-M, TP -3.0 | Pressing Continue on the reward reveal (RewardRevealHost, ratio 0.05). (0.05) | A soft wooden "tok" with a two-note kalimba chime: confirms and moves on. About 0.4 s. | `v2/sfx/reward-continue.ogg` 0.45 s, -21.9 LUFS-M, TP -12.6, 5 KB | r1 awaiting verdict |

### Skill SFX

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `skill-shield` | `skill-shield.ogg` 0.47 s, -18.3 LUFS-M, TP -2.1 | Guard Shell absorb / break, Mirror Plate, Phase Step, Anchor (0.8x), Thorns (1.2x) and many smasher skills at 0.8x-1.05x playback rate. (0.010-0.022) | Bark shield: a hollow wooden knock under a warm magical chime. Has to sound good from 0.8x to 1.2x playback rate. | `v2/sfx/skill-shield.ogg` 0.48 s, -17.9 LUFS-M, TP -3.2, 6 KB | r1 awaiting verdict |
| `skill-rocket` | `skill-rocket.ogg` 0.56 s, -13.5 LUFS-M, TP -1.9 | Homing Rockets volley launch; smasher skills at 1.05x / 1.1x. (0.02) | Acorn volley: three quick cork-pop launches with a rising whistle-whoosh. About 0.5 s. | `v2/sfx/skill-rocket.ogg` 0.55 s, -15.2 LUFS-M, TP -1.5, 8 KB | r1 awaiting verdict |
| `skill-zap` | `skill-zap.ogg` 0.41 s, -15.3 LUFS-M, TP -1.9 | Static Charge shock / stun and the stunned turn-skip; a smasher skill at 0.85x. (0.018) | Cute static fizz: a rounded electric buzz with crackles, softer than a sci-fi zap. About 0.35 s. | `v2/sfx/skill-zap.ogg` 0.38 s, -16.2 LUFS-M, TP -5.4, 8 KB | r1 awaiting verdict |
| `skill-crit` | `skill-crit.ogg` 0.38 s, -17.6 LUFS-M, TP -1.6 | Lucky Edge crit, Opening Salvo, Bank Shot; smasher skills at 0.8x-1.15x. (0.02) | A big wooden "thwack!" (bat on a log) with a bright two-note sparkle. About 0.35 s. | `v2/sfx/skill-crit.ogg` 0.40 s, -16.0 LUFS-M, TP -6.6, 7 KB | r1 awaiting verdict |
| `skill-whoosh` | `skill-whoosh.ogg` 0.29 s, -15.7 LUFS-M, TP -2.1 | Phase Step dodge and smasher dodge skills (1.1x / 1.15x). (0.016) | A soft airy swish with a little leaf rustle in its wake. About 0.3 s. | `v2/sfx/skill-whoosh.ogg` 0.32 s, -17.3 LUFS-M, TP -2.1, 7 KB | r1 awaiting verdict |
| `skill-boost` | `skill-boost.ogg` 0.21 s, -18.0 LUFS-M, TP -3.0 | Momentum stack, Tower Breaker; smasher skills at 0.9x / 1.15x. (0.009-0.018) | A short rising wooden "bloop" - quick and light, it can repeat often. About 0.2 s. | `v2/sfx/skill-boost.ogg` 0.22 s, -18.2 LUFS-M, TP -2.4, 5 KB | r1 awaiting verdict |

### Boss-trait SFX

| Sound | Old file (length, loudness, true peak) | Where / when (in-game gain) | New: what it should feel like | New file (loudness, TP, size) | Status |
|---|---|---|---|---|---|
| `boss-ember-pulse` | `boss-ember-pulse.ogg` 0.59 s, -17.1 LUFS-M, TP -1.2 | Boss trait Ember Nova release. (0.022) | A campfire "whoomph": a low boom under a fiery whoosh and crackling embers. About 0.6 s. | `v2/sfx/boss-ember-pulse.ogg` 0.67 s, -15.9 LUFS-M, TP -4.7, 10 KB | r1 awaiting verdict |
| `boss-freeze` | `boss-freeze.ogg` 0.49 s, -18.8 LUFS-M, TP -1.8 | Boss trait Frost Lock freezes a smasher. (0.022) | Frost creeping shut: accelerating crystalline ticks, a glassy rising shimmer and a dull icy thud. About 0.5 s. | `v2/sfx/boss-freeze.ogg` 0.52 s, -17.2 LUFS-M, TP -2.1, 9 KB | r1 awaiting verdict |
| `boss-crack` | `boss-crack.ogg` 0.39 s, -22.9 LUFS-M, TP -3.6 | A refused freeze (the ice cracks off) or a thaw. (0.014-0.02) | One sharp ice crack and a few tinkling shards falling. About 0.4 s. | `v2/sfx/boss-crack.ogg` 0.42 s, -19.2 LUFS-M, TP -1.8, 7 KB | r1 awaiting verdict |
| `boss-chill` | `boss-chill.ogg` 0.24 s, -17.2 LUFS-M, TP -1.5 | One Frostbite stack lands. (0.018) | A tiny frosty chime tick - small, it repeats. About 0.25 s. | `v2/sfx/boss-chill.ogg` 0.26 s, -18.1 LUFS-M, TP -3.6, 5 KB | r1 awaiting verdict |

### UI sounds (synthesised live)

| Sound | Old (live synth) | Where / when | New intent | Loudness old → new | Status |
|---|---|---|---|---|---|
| `ui-press` | uiSfx.ts `press` | A button goes down (every FButton / pressable). | Soft wooden "tock" - a small wood block with a felt tip. | -34.3 → -34.4 LUFS (-0.1 dB) | r1 awaiting verdict |
| `ui-pressHero` | uiSfx.ts `pressHero` | The hero CTA (Play / Fight) goes down. | Deeper wooden "thunk" with a plush low body. | -30.4 → -30.4 LUFS (0 dB) | r1 awaiting verdict |
| `ui-release` | uiSfx.ts `release` | A press completes (click). | Tiny rising wooden pip. | -40.8 → -40.7 LUFS (+0.1 dB) | r1 awaiting verdict |
| `ui-toggleOn` | uiSfx.ts `toggleOn` | A switch turns on. | Two rising wooden clicks, like a latch snapping open. | -34.6 → -35.1 LUFS (-0.5 dB) | r1 awaiting verdict |
| `ui-toggleOff` | uiSfx.ts `toggleOff` | A switch turns off. | Two falling wooden clicks. | -36.4 → -36.5 LUFS (-0.1 dB) | r1 awaiting verdict |
| `ui-tab` | uiSfx.ts `tab` | Tab / segment / card select. | Light bamboo tick. | -38.7 → -38.7 LUFS (0 dB) | r1 awaiting verdict |
| `ui-open` | uiSfx.ts `open` | A modal or panel opens. | Soft leafy "fwump" rising into a warm wooden note. | -34.9 → -34.9 LUFS (0 dB) | r1 awaiting verdict |
| `ui-close` | uiSfx.ts `close` | A modal closes. | The open sound in reverse: falling note, leafy swish down. | -36.6 → -36.7 LUFS (-0.1 dB) | r1 awaiting verdict |
| `ui-tick` | uiSfx.ts `tick` | Count-up step (pitch rises with progress). | Tiny bright seed-pod tick. | -35.2 → -35.2 LUFS (0 dB) | r1 awaiting verdict |
| `ui-reward` | uiSfx.ts `reward` | A reward lands (count-up end). | Two-note kalimba "ting-ting". | -24.3 → -24.3 LUFS (0 dB) | r1 awaiting verdict |
| `ui-deny` | uiSfx.ts `deny` | A refused tap (disabled / cannot afford). | Dull plush double "bonk" - clear but not scolding. | -34.9 → -34.9 LUFS (0 dB) | r1 awaiting verdict |
| `ui-slide` | uiSfx.ts `slide` | A slider step. | Very small bead click. | -40.3 → -39.8 LUFS (+0.5 dB) | r1 awaiting verdict |

### Intro cutscene cues (synthesised live)

| Sound | Old (live synth) | Where / when | New intent | Loudness old → new | Status |
|---|---|---|---|---|---|
| `intro-tick` | introAudio.ts `tick` | Countdown ticks as the stage / level numbers fall, and the rising ladder run. | Wooden block tick (pitch follows the countdown). | -42.8 → -42.3 LUFS (+0.5 dB) | r1 awaiting verdict |
| `intro-thud` | introAudio.ts `thud` | The smasher lands after the fall; the first slam. | Plush landing thump with a woody knock. | -23.1 → -23.7 LUFS (-0.6 dB) | r1 awaiting verdict |
| `intro-heart` | introAudio.ts `heart` | Heartbeat while the smasher lies defeated. | Soft, round double heartbeat thump. | -27.1 → -27.2 LUFS (-0.1 dB) | r1 awaiting verdict |
| `intro-whoosh` | introAudio.ts `whoosh` | The thunder wind-up in the intro fight. | Airy rising wind swish (replaces a buzzy sawtooth sweep). | -47.4 → -47.2 LUFS (+0.2 dB) | r1 awaiting verdict |

## Wired, pending review

Sounds that already play in the game while their r1 still waits for the owner's verdict. They are NOT on the review page yet — the next review-pack run picks them up from `tools/audio-v2/catalog.mjs` (upload their previews and republish the page, steps 4–5 above).

- [ ] `balloon-pop` (#UX3 balloon HP) — `public/audio/v2/sfx/balloon-pop.ogg` (recipe `balloonPop` in `tools/audio-v2/sfx.mjs`, re-render with `node tools/audio-v2/build.mjs --only balloon-pop`). Switch: `NEW_SLOT_VERSION['balloon-pop']` in `src/audio/audioVersions.ts` is `'v2'` (on) because the owner asked for it wired; `'v1'` silences it (the balloons still pop visually). Played from `renderBalloonLayer` in `src/use/useSpinnerGame.ts` (gain `BALLOON_HP.POP_SFX_GAIN` 0.032, cooldown `POP_SFX_COOLDOWN_MS` 90 ms), preloaded with the core SFX only on balloon builds. Rejected → new revision as above; the in-game gain lives in `src/use/balloonHp.ts`.

- [ ] `vs-whoosh`, `vs-thump`, `vs-slam` (#UX4 VS intro) — `public/audio/v2/sfx/vs-*.ogg` (recipes `vsWhoosh` / `vsThump` / `vsSlam` in `tools/audio-v2/sfx.mjs`, catalog entries in `catalog.mjs`; re-render with `node tools/audio-v2/build.mjs --only vs-whoosh,vs-thump,vs-slam`). r1: whoosh -17.3 LUFS-M / TP -2.3 / 0.50 s, thump -15.9 / -1.9 / 0.34 s, slam -13.0 / -3.1 / 1.25 s. Switch: `NEW_SLOT_VERSION['vs-intro']` in `src/audio/audioVersions.ts` is `'v2'` (on, owner request); `'v1'` silences all three. Cues + gains in `src/use/vsIntro.ts` `VS_SOUND_CUES` (whoosh 0.025 at 0 ms and 0.016 ×1.25 on the exit wipe, thumps 0.022 as each side's cards land, slam 0.028 on the VS landing); played from `VsIntro.vue`, never under an ad / pause, preloaded with the core SFX.

## Tree-tower hook points (not wired — waiting for approval)

All in `src/use/useSpinnerGame.ts`; play through `playSound` (after the `sfxPath` hook-up) and keep the sound **outside** the `if (!FX.low)` VFX gate so low-tier devices still hear it:

- **`tree-hit`** — the tower-contact loop, right after `tower.hp = Math.max(0, tower.hp - dmg)` / `tower.flash = 1`, beside `spawnSplinters(towerFx, …, dmg)`. Play `treeHitName(n++)` (round-robin `tree-hit-1/2/3`) and, when `dmg >= tower.maxHp * 0.06` (the same hard-hit test as the leaf shake), also `TREE_HIT_HEAVY`. The contact re-arm (`CONTACT_REARM_MS`) already spaces hits per blade; a ~120 ms global cooldown like the clash one is still advisable when several blades hit at once.
- **`tree-stage`** — `tickTowerVfx`, where `noteTowerStage(towerFx, i, st)` returns `n > 0`: play it for `st === 1` (damaged, ≤ 60 %) and `st === 2` (nearly destroyed, ≤ 25 %); `st === 3` is the felled moment, which is `tree-fall`.
- **`tree-fall`** — `onTowerDestroyed`, replacing `playSound('celebration-1')`.
- Switch: `NEW_SLOT_VERSION['tree-hit' | 'tree-stage' | 'tree-fall']` in `src/audio/audioVersions.ts` (`'v1'` = today: silent / celebration-1), checked with `newSlotOn(slot)`.
- Levels: the hit variants sit 0.5 dB under a clash, the heavy layer adds about 2.5 dB on hard hits (hit + heavy ≈ -11.9 LUFS-M at file level; in game both mix ~30 dB lower, so the stack cannot clip), the stage cue is soft (-18), the fall matches a knockout (-13).

## Not reviewed: unused audio

- `public/audio/sfx/celebration-3.ogg` — not referenced (match start picks celebration-1 or -2).
- `public/audio/sfx/skill-drumroll.ogg` — belonged to the retired skills intro; never requested.
- `src/assets/music/**` (35 files) and `src/assets/sfx/**` (13 files) — card-quest / chaos-quest leftovers, nothing imports them.
- `src/assets/tree-smashers-anthemt.ogg`, `src/assets/tree-smashers-chant-2.ogg` — not imported anywhere.

## Open questions

- In-game gain staging is very low: SFX play at `userSoundVolume × 0.025` and music at `userMusicVolume × 0.025` (about -35 dB). Files are levelled to keep today's balance; whether the master levels themselves are right is a separate decision.
- Proposals need code beyond the switch: menu music (the menu is silent today), a boss track on boss stages, and the tree-tower sounds (`tree-hit`, `tree-stage`, `tree-fall`; tree-fall replaces the reused match-start `celebration-1`).
- Battle music plays through `HTMLAudioElement.loop`; the files loop seamlessly, but some browsers add a few ms gap at the media-element loop point. Moving music to Web Audio would remove it.
