// Tree Smashers audio v2 — the catalogue of every sound the game uses.
//
// One entry per reviewable sound: where the OLD one comes from, where and
// when it plays, how loud the game plays it (the call-site ratio), and what
// the NEW one should feel like. build.mjs, the procedural renderer, the
// review pack and sounds-todo.md are all generated from this list.
//
// kinds:  file        → public/audio/<old>   (new: public/audio/v2/<new>)
//         procedural  → synthesised live in code (old: src/use/uiSfx.ts or
//                       src/use/introAudio.ts; new: src/audio/uiSfxV2.ts)
//         proposal    → no old sound: a new slot the game does not have yet

export const GROUPS = [
  { id: 'music', title: 'Music' },
  { id: 'stingers', title: 'Result stingers' },
  { id: 'battle', title: 'Battle SFX' },
  { id: 'trees', title: 'Tree-tower SFX (new slots)' },
  { id: 'rewards', title: 'Rewards and progression' },
  { id: 'skills', title: 'Skill SFX' },
  { id: 'bosses', title: 'Boss-trait SFX' },
  { id: 'ui', title: 'UI sounds (synthesised live)' },
  { id: 'intro', title: 'Intro cutscene cues (synthesised live)' }
]

export const CATALOG = [
  // ── Music ──
  {
    id: 'battle-1', group: 'music', kind: 'file', old: 'music/battle-1.ogg', new: 'v2/music/battle-1.ogg',
    plays: 'Battle music: one of battle-1/2/3 is picked at random when a match starts (useSound.startBattleMusic), looped, faded out at the result.',
    ratio: 'userMusicVolume x 0.025',
    intent: '"Bramble Brawl" - D-minor folk-rock reel, 144 BPM: stomp kick, frame drum, shaker and tambourine, strummed guitar, plucked bass, marimba ostinato, tin-whistle lead, mandolin breakdown that builds back into the loop. Energetic, cosy-forest, never dark.'
  },
  {
    id: 'battle-2', group: 'music', kind: 'file', old: 'music/battle-2.ogg', new: 'v2/music/battle-2.ogg',
    plays: 'Battle music (random pick of three).', ratio: 'userMusicVolume x 0.025',
    intent: '"Acorn Rumble" - E-minor four-on-the-floor stomp, 152 BPM: octave-bouncing bass, accordion off-beat stabs, xylophone ostinato and lead, half-time bridge with strummed guitar, mandolin reprise. The punchiest of the three.'
  },
  {
    id: 'battle-3', group: 'music', kind: 'file', old: 'music/battle-3.ogg', new: 'v2/music/battle-3.ogg',
    plays: 'Battle music (random pick of three).', ratio: 'userMusicVolume x 0.025',
    intent: '"Timber Stomp" - G-mixolydian bouncy oom-pah, 132 BPM with a light swing: bass on 1 and 3, accordion on 2 and 4, claps, woodblocks, whistle tune, glockenspiel countermelody, marimba reprise. The cheekiest, most cartoon-like of the three.'
  },
  {
    id: 'menu-1', group: 'music', kind: 'proposal', old: null, new: 'v2/music/menu-1.ogg',
    plays: 'NEW slot (proposal): the game currently has no menu music - the menu is silent. Would loop on the stage map / lobby.',
    ratio: 'userMusicVolume x 0.025 (suggested)',
    intent: '"Cosy Hollow" - F-major 92 BPM: finger-picked guitar, soft marimba tune, glockenspiel answer, shaker brush, upright bass, faint birdsong. Warm and relaxed, but with a pulse so it does not feel sleepy.'
  },
  {
    id: 'boss-1', group: 'music', kind: 'proposal', old: null, new: 'v2/music/boss-1.ogg',
    plays: 'NEW slot (proposal): boss matches currently use the normal battle tracks. Would replace the random battle pick when the stage is a boss stage.',
    ratio: 'userMusicVolume x 0.025 (suggested)',
    intent: '"Old Oak Rises" - C-minor 126 BPM: taiko drums, low drone, driving pizzicato ostinato, brassy horn melody, glockenspiel danger motif, cymbal swells. Tense and big, still family friendly.'
  },
  // ── Stingers ──
  {
    id: 'win', group: 'stingers', kind: 'file', old: 'sfx/win.ogg', new: 'v2/sfx/win.ogg',
    plays: 'Victory result screen (SpinnerArena, after the match ends with a win) and the quest reward pop-up (QuestReward, ratio 0.1).',
    ratio: '0.025 (result), 0.1 (quest reward)',
    intent: 'Short victory fanfare: drum roll and marimba run into a big G-major hit - strum, kick, taiko, crash - with the whistle on top and a glockenspiel sparkle. About 4 s.'
  },
  {
    id: 'lose', group: 'stingers', kind: 'file', old: 'sfx/lose.ogg', new: 'v2/sfx/lose.ogg',
    plays: 'Defeat result screen; also the loss beat in the intro cutscene (ratio 0.03).', ratio: '0.025',
    intent: 'Gentle, slightly comic descending marimba and pizzicato "aww", a soft plush flop and a ringing A-minor chord. Invites a retry and never mocks the player. About 3 s.'
  },
  // ── Battle ──
  ...[1, 2, 3, 4, 5].map((k) => ({
    id: `clash-${k}`, group: 'battle', kind: 'file', old: `sfx/clash-${k}.ogg`, new: `v2/sfx/clash-${k}.ogg`,
    plays: 'Two smashers collide (random variant of five, throttled per pair, capped overlap) - the most frequent sound in the game. The intro cutscene uses them for boss hits too.',
    ratio: '0.025 (intro: 0.022-0.034)',
    intent: [
      'Wooden disc clack plus a plush thump: the standard hit.',
      'Higher, brighter disc clack with a lighter thump.',
      'Heavier hit: deeper thump, darker wood.',
      'Double clack, two discs rattling against each other.',
      'Clack with a short ringing wooden "tonk" tail.'
    ][k - 1] + ' Short (about 0.3 s), rounded transient, no harsh highs - it plays dozens of times per match.'
  })),
  {
    id: 'explosion-1', group: 'battle', kind: 'file', old: 'sfx/explosion-1.ogg', new: 'v2/sfx/explosion-1.ogg',
    plays: 'A smasher is knocked out (spawnExplosion), meteor impacts at match start, and the slam / KO beats of the intro cutscene.',
    ratio: '0.025 (intro 0.03-0.04)',
    intent: 'Plush "poof!" knockout: a big soft low thump, a fluffy puff of air, small wood-splinter crackles and a scatter of leaves. Satisfying, not violent.'
  },
  {
    id: 'celebration-1', group: 'battle', kind: 'file', old: 'sfx/celebration-1.ogg', new: 'v2/sfx/celebration-1.ogg',
    plays: 'Match start (random with celebration-2) AND a tree tower destroyed (onTowerDestroyed); also the reward reveal (RewardRevealHost, ratio 0.06).',
    ratio: '0.025 (reveal 0.06)',
    intent: '"Let\'s go!" start cue: two tom hits, a bright guitar strum and a rising three-note whistle call. (Tower destruction gets its own proposed sound, tree-fall.)'
  },
  {
    id: 'celebration-2', group: 'battle', kind: 'file', old: 'sfx/celebration-2.ogg', new: 'v2/sfx/celebration-2.ogg',
    plays: 'Match start (random with celebration-1).', ratio: '0.025',
    intent: 'Second start variant: woodblock triple, marimba "ta-da-daa" and a clap - same energy as celebration-1, different colour.'
  },
  {
    id: 'balloon-pop', group: 'battle', kind: 'proposal', old: null, new: 'v2/sfx/balloon-pop.ogg',
    plays: 'NEW slot (#UX3, wired at the owner request): a smasher loses one of its HP balloons (balloon builds, VITE_APP_BALOON_HP_BAR=true) - one per lost share of max HP, all of the rest on a knockout. One sound per 90 ms however many pop at once, playback rate 0.94-1.06x.',
    ratio: '0.032 (about a clash: the file is -17.8 LUFS-M, a clash -14)',
    intent: 'Mario-Kart-style balloon burst: a sharp rubber BANG (crack, short low pop body, air snap) and a softer rubber-tear tail - flapping shreds and a fine crinkle thinning out. About 0.3 s audible, never harsh: it can land on top of a clash.'
  },
  // ── VS intro (new slots, wired at the owner request: the 3 s face-off) ──
  {
    id: 'vs-whoosh', group: 'battle', kind: 'proposal', old: null, new: 'v2/sfx/vs-whoosh.ogg',
    plays: 'NEW slot, wired: the VS screen before a new matchup - the two team halves slam in from opposite sides (t = 0), and again faster / softer (rate 1.25, ratio 0.016) for the exit wipe at 4.55 s.',
    ratio: '0.025 (exit 0.016)',
    intent: 'A wide air swoosh rising into the middle that peaks as the halves meet (~0.19 s), then a short plush-and-wood "fwump". About 0.5 s.'
  },
  {
    id: 'vs-thump', group: 'battle', kind: 'proposal', old: null, new: 'v2/sfx/vs-thump.ogg',
    plays: 'NEW slot, wired: the VS screen - each side's smasher cards land on their spots (player ~0.4 s, enemy ~0.5 s at rate 0.9).',
    ratio: '0.022',
    intent: 'A heavy toy thud - felt body and a low wooden knock, short and round so two in a row never clutter. About 0.3 s.'
  },
  {
    id: 'vs-slam', group: 'battle', kind: 'proposal', old: null, new: 'v2/sfx/vs-slam.ogg',
    plays: 'NEW slot, wired: the VS screen - the VS emblem lands (0.72 s) with its shockwave ring and screen shake.',
    ratio: '0.028 (the loudest beat of the screen, about a knockout)',
    intent: 'Big taiko + kick boom with a dropping sub, a bright wooden crack and splinters, a short crash and a two-note horn stab that says "fight!". Big, still a toy box. About 1.2 s.'
  },
  // ── Tree towers (new slots; silent / not wired until approved) ──
  {
    id: 'tree-hit', group: 'trees', kind: 'proposal', old: null,
    new: 'v2/sfx/tree-hit-1.ogg',
    files: ['v2/sfx/tree-hit-1.ogg', 'v2/sfx/tree-hit-2.ogg', 'v2/sfx/tree-hit-3.ogg', 'v2/sfx/tree-hit-heavy.ogg'],
    montage: { gapSec: 0.55, steps: [['tree-hit-1'], ['tree-hit-2'], ['tree-hit-3'], ['tree-hit-1'], ['tree-hit-2', 'tree-hit-heavy'], ['tree-hit-3', 'tree-hit-heavy']] },
    plays: 'NEW slot: every damaging hit of a smasher on a team tree (the plush oak tower), where the wood-splinter burst spawns (5-16 chips scaling with damage). Today tower hits are silent.',
    ratio: '0.025 (suggested, like a clash)',
    intent: 'A satisfying wooden thunk with a soft plush body, a small crack and a short splinter crackle. Three round-robin variants (tree-hit-1/2/3) so repeats never sound identical, plus a damage-scaled layer (tree-hit-heavy: deeper trunk boom, sharper crack, longer splinter spray) added on hard hits. The preview plays 1, 2, 3, 1, then 2 and 3 with the heavy layer.'
  },
  {
    id: 'tree-stage', group: 'trees', kind: 'proposal', old: null, new: 'v2/sfx/tree-stage.ogg',
    plays: 'NEW slot: the tree drops a damage state (healthy -> damaged at 60 %, -> nearly destroyed at 25 %), together with the leaf cascade.',
    ratio: '0.025 (suggested)',
    intent: 'A soft trunk creak and a rustle of leaves letting go - a gentle "it is weakening" cue that sits under the fight. About 1.1 s.'
  },
  {
    id: 'tree-fall', group: 'trees', kind: 'proposal', old: null, new: 'v2/sfx/tree-fall.ogg',
    plays: 'NEW slot: the tree is felled (onTowerDestroyed). Today that reuses celebration-1, the match-start cheer.',
    ratio: '0.025 (suggested)',
    intent: 'The plush oak going down: a big trunk crack, a creak that speeds up as it gives way, a falling swish, a heavy soft landing and leaves raining down. Refines the earlier tower-fall proposal. About 2 s.'
  },
  // ── Rewards ──
  {
    id: 'happy', group: 'rewards', kind: 'file', old: 'sfx/happy.ogg', new: 'v2/sfx/happy.ogg',
    plays: 'Claiming rewards: battle pass, daily rewards, treasure chest, skin chest timer, and two arena reward moments (SpinnerArena).',
    ratio: '0.025',
    intent: 'Bright "you got something" sparkle: a rising marimba arpeggio, a kalimba twinkle and a glockenspiel shimmer. Cheerful, about 1.2 s.'
  },
  {
    id: 'level-up', group: 'rewards', kind: 'file', old: 'sfx/level-up.ogg', new: 'v2/sfx/level-up.ogg',
    plays: 'Picking up a power-up box in battle, the Second Wind heal skill (ratio 0.025, some smashers replay it at 0.85x), and the ladder climb at the end of the intro cutscene.',
    ratio: '0.025',
    intent: 'Quick power-up: a rising four-note xylophone run with an upward air swish and a glockenspiel sparkle on top. About 0.7 s.'
  },
  {
    id: 'reward-continue', group: 'rewards', kind: 'file', old: 'sfx/reward-continue.ogg', new: 'v2/sfx/reward-continue.ogg',
    plays: 'Pressing Continue on the reward reveal (RewardRevealHost, ratio 0.05).', ratio: '0.05',
    intent: 'A soft wooden "tok" with a two-note kalimba chime: confirms and moves on. About 0.4 s.'
  },
  // ── Skills ──
  {
    id: 'skill-shield', group: 'skills', kind: 'file', old: 'sfx/skill-shield.ogg', new: 'v2/sfx/skill-shield.ogg',
    plays: 'Guard Shell absorb / break, Mirror Plate, Phase Step, Anchor (0.8x), Thorns (1.2x) and many smasher skills at 0.8x-1.05x playback rate.',
    ratio: '0.010-0.022',
    intent: 'Bark shield: a hollow wooden knock under a warm magical chime. Has to sound good from 0.8x to 1.2x playback rate.'
  },
  {
    id: 'skill-rocket', group: 'skills', kind: 'file', old: 'sfx/skill-rocket.ogg', new: 'v2/sfx/skill-rocket.ogg',
    plays: 'Homing Rockets volley launch; smasher skills at 1.05x / 1.1x.', ratio: '0.02',
    intent: 'Acorn volley: three quick cork-pop launches with a rising whistle-whoosh. About 0.5 s.'
  },
  {
    id: 'skill-zap', group: 'skills', kind: 'file', old: 'sfx/skill-zap.ogg', new: 'v2/sfx/skill-zap.ogg',
    plays: 'Static Charge shock / stun and the stunned turn-skip; a smasher skill at 0.85x.', ratio: '0.018',
    intent: 'Cute static fizz: a rounded electric buzz with crackles, softer than a sci-fi zap. About 0.35 s.'
  },
  {
    id: 'skill-crit', group: 'skills', kind: 'file', old: 'sfx/skill-crit.ogg', new: 'v2/sfx/skill-crit.ogg',
    plays: 'Lucky Edge crit, Opening Salvo, Bank Shot; smasher skills at 0.8x-1.15x.', ratio: '0.02',
    intent: 'A big wooden "thwack!" (bat on a log) with a bright two-note sparkle. About 0.35 s.'
  },
  {
    id: 'skill-whoosh', group: 'skills', kind: 'file', old: 'sfx/skill-whoosh.ogg', new: 'v2/sfx/skill-whoosh.ogg',
    plays: 'Phase Step dodge and smasher dodge skills (1.1x / 1.15x).', ratio: '0.016',
    intent: 'A soft airy swish with a little leaf rustle in its wake. About 0.3 s.'
  },
  {
    id: 'skill-boost', group: 'skills', kind: 'file', old: 'sfx/skill-boost.ogg', new: 'v2/sfx/skill-boost.ogg',
    plays: 'Momentum stack, Tower Breaker; smasher skills at 0.9x / 1.15x.', ratio: '0.009-0.018',
    intent: 'A short rising wooden "bloop" - quick and light, it can repeat often. About 0.2 s.'
  },
  // ── Bosses ──
  {
    id: 'boss-ember-pulse', group: 'bosses', kind: 'file', old: 'sfx/boss-ember-pulse.ogg', new: 'v2/sfx/boss-ember-pulse.ogg',
    plays: 'Boss trait Ember Nova release.', ratio: '0.022',
    intent: 'A campfire "whoomph": a low boom under a fiery whoosh and crackling embers. About 0.6 s.'
  },
  {
    id: 'boss-freeze', group: 'bosses', kind: 'file', old: 'sfx/boss-freeze.ogg', new: 'v2/sfx/boss-freeze.ogg',
    plays: 'Boss trait Frost Lock freezes a smasher.', ratio: '0.022',
    intent: 'Frost creeping shut: accelerating crystalline ticks, a glassy rising shimmer and a dull icy thud. About 0.5 s.'
  },
  {
    id: 'boss-crack', group: 'bosses', kind: 'file', old: 'sfx/boss-crack.ogg', new: 'v2/sfx/boss-crack.ogg',
    plays: 'A refused freeze (the ice cracks off) or a thaw.', ratio: '0.014-0.02',
    intent: 'One sharp ice crack and a few tinkling shards falling. About 0.4 s.'
  },
  {
    id: 'boss-chill', group: 'bosses', kind: 'file', old: 'sfx/boss-chill.ogg', new: 'v2/sfx/boss-chill.ogg',
    plays: 'One Frostbite stack lands.', ratio: '0.018',
    intent: 'A tiny frosty chime tick - small, it repeats. About 0.25 s.'
  },
  // ── UI (synthesised live) ──
  ...[
    ['press', 'A button goes down (every FButton / pressable).', 'Soft wooden "tock" - a small wood block with a felt tip.'],
    ['pressHero', 'The hero CTA (Play / Fight) goes down.', 'Deeper wooden "thunk" with a plush low body.'],
    ['release', 'A press completes (click).', 'Tiny rising wooden pip.'],
    ['toggleOn', 'A switch turns on.', 'Two rising wooden clicks, like a latch snapping open.'],
    ['toggleOff', 'A switch turns off.', 'Two falling wooden clicks.'],
    ['tab', 'Tab / segment / card select.', 'Light bamboo tick.'],
    ['open', 'A modal or panel opens.', 'Soft leafy "fwump" rising into a warm wooden note.'],
    ['close', 'A modal closes.', 'The open sound in reverse: falling note, leafy swish down.'],
    ['tick', 'Count-up step (pitch rises with progress).', 'Tiny bright seed-pod tick.'],
    ['reward', 'A reward lands (count-up end).', 'Two-note kalimba "ting-ting".'],
    ['deny', 'A refused tap (disabled / cannot afford).', 'Dull plush double "bonk" - clear but not scolding.'],
    ['slide', 'A slider step.', 'Very small bead click.']
  ].map(([id, plays, intent]) => ({
    id: `ui-${id}`, group: 'ui', kind: 'procedural', procedural: { set: 'ui', name: id }, old: null, new: null,
    plays, ratio: 'UI_GAIN 0.0062 x userSoundVolume (about 4 dB under a clash)',
    intent: intent + ' Synthesised live (no file), same gates, throttles and levels as today.'
  })),
  // ── Intro cues (synthesised live) ──
  ...[
    ['tick', 'Countdown ticks as the stage / level numbers fall, and the rising ladder run.', 'Wooden block tick (pitch follows the countdown).'],
    ['thud', 'The smasher lands after the fall; the first slam.', 'Plush landing thump with a woody knock.'],
    ['heart', 'Heartbeat while the smasher lies defeated.', 'Soft, round double heartbeat thump.'],
    ['whoosh', 'The thunder wind-up in the intro fight.', 'Airy rising wind swish (replaces a buzzy sawtooth sweep).']
  ].map(([id, plays, intent]) => ({
    id: `intro-${id}`, group: 'intro', kind: 'procedural', procedural: { set: 'intro', name: id }, old: null, new: null,
    plays, ratio: 'userSoundVolume x recipe gain (introAudio.ts)',
    intent: intent + ' Synthesised live in the first-launch cutscene.'
  }))
]

/** Files in public/audio that nothing plays any more (inventory only). */
export const UNUSED = [
  { file: 'public/audio/sfx/celebration-3.ogg', note: 'Not referenced by any code path (match start picks celebration-1 or -2 only).' },
  { file: 'public/audio/sfx/skill-drumroll.ogg', note: 'Belonged to the retired skills intro; armSkillSfxPreload never requests it.' },
  { file: 'src/assets/music/** (33 files), src/assets/sfx/** (13 files)', note: 'Leftovers from card-quest / chaos-quest; nothing imports them (not bundled).' },
  { file: 'src/assets/tree-smashers-anthemt.ogg, src/assets/tree-smashers-chant-2.ogg', note: 'Not imported anywhere.' }
]
