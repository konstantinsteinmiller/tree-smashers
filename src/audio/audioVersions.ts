// ─── Audio v2 switchboard ──────────────────────────────────────────────────
//
// Every sound the game plays has an OLD (v1) and a redesigned NEW (v2)
// version. The owner approves them one by one on the review page linked at
// the top of sounds-todo.md; an approved sound is switched here by changing
// its 'v1' to 'v2' — one line, nothing else.
//
//   files       v1: public/audio/sfx/<id>.ogg      v2: public/audio/v2/sfx/<id>.ogg
//               v1: public/audio/music/<id>.ogg    v2: public/audio/v2/music/<id>.ogg
//   UI sounds   v1: use/uiSfx.ts renderUiSfx       v2: audio/uiSfxV2.ts renderUiSfxV2
//   intro cues  v1: use/introAudio.ts tone()       v2: audio/uiSfxV2.ts renderIntroCueV2
//
// The v2 files are produced by tools/audio-v2 (build.mjs) — see
// sounds-todo.md for how they are made, levelled and checked.
//
// HOOK-UP (one time, before the first flip takes effect — the call sites
// still build their own v1 paths today, deliberately untouched):
//   1. use/useSound.ts  playSound:        prependBaseUrl(sfxPath(effect))
//                       startBattleMusic: prependBaseUrl(musicPath(`battle-${idx}`))
//   2. use/useAssets.ts SOUND_ASSETS, skills/skillSfx.ts SKILL_*_SFX_ASSETS,
//      bosses/bossTraitSfx.ts BOSS_TRAIT_SFX_ASSETS, introAudio.ts sfxUrl:
//      (skill / boss-trait entries via audio/featureSfxVersions.ts
//      featureSfxPath — keep that import inside the lazy feature modules)
//      build each entry with sfxPath(name) so the preload decodes the same
//      URL playSound asks for.
//   3. use/uiSfx.ts playUiSfx: call
//      (UI_SFX_VERSION[name] === 'v2' ? renderUiSfxV2 : renderUiSfx)(…same args)
//   4. use/introAudio.ts fire(): for 'tick' | 'thud' | 'heart' | 'whoosh',
//      INTRO_CUE_VERSION[c.kind] === 'v2'
//        ? renderIntroCueV2(ctx, ctx.destination, c.kind, volume, ctx.currentTime, { gain, pitchHz })
//        : the existing tone(...) call.
//   New slots (no v1 sound) also need their own trigger — see NEW_SLOT_VERSION.

import type { UiSfxName } from '@/use/uiSfx'
import type { IntroCueKind } from '@/audio/uiSfxV2'

export type AudioVersion = 'v1' | 'v2'

/** File-based SFX and the two result stingers (played through playSound).
 *  Skill and boss-trait SFX are NOT here: this module sits in the hot path
 *  (useSound/useAssets/useSpinnerGame), and their names must stay in the
 *  lazy feature chunks (skillsFlagPurity / bosses100FlagPurity). Their
 *  switches live in audio/featureSfxVersions.ts. */
export const SFX_VERSION = {
  'clash-1': 'v1',
  'clash-2': 'v1',
  'clash-3': 'v1',
  'clash-4': 'v1',
  'clash-5': 'v1',
  'explosion-1': 'v1',
  'celebration-1': 'v1',
  'celebration-2': 'v1',
  happy: 'v1',
  'level-up': 'v1',
  'reward-continue': 'v1',
  win: 'v1',
  lose: 'v1'
} as const satisfies Record<string, AudioVersion>

/** Battle music loops (useSound.startBattleMusic picks one at random). */
export const MUSIC_VERSION = {
  'battle-1': 'v1',
  'battle-2': 'v1',
  'battle-3': 'v1'
} as const satisfies Record<string, AudioVersion>

/** Live-synthesised UI sounds (uiSfx.ts). */
export const UI_SFX_VERSION: Record<UiSfxName, AudioVersion> = {
  press: 'v1',
  pressHero: 'v1',
  release: 'v1',
  toggleOn: 'v1',
  toggleOff: 'v1',
  tab: 'v1',
  open: 'v1',
  close: 'v1',
  tick: 'v1',
  reward: 'v1',
  deny: 'v1',
  slide: 'v1'
}

/** Live-synthesised intro cutscene cues (introAudio.ts). */
export const INTRO_CUE_VERSION: Record<IntroCueKind, AudioVersion> = {
  tick: 'v1',
  thud: 'v1',
  heart: 'v1',
  whoosh: 'v1'
}

/**
 * New slots — sounds the game does not have yet. 'v1' = today's behaviour
 * (silent; for tree-fall the reused 'celebration-1'), 'v2' = play the new
 * file. Flipping one needs its trigger in game code once (not wired yet):
 *   menu-1      loop on the menu / stage map (useMusic gains a menu track)
 *   boss-1      replaces the random battle pick on boss stages
 *   tree-hit    useSpinnerGame.ts tower contact, right after
 *               `tower.hp = …; tower.flash = 1` where spawnSplinters is called
 *               (OUTSIDE the `if (!FX.low)` VFX gate): play treeHitName(n++)
 *               and add TREE_HIT_HEAVY when dmg >= tower.maxHp * 0.06 (the
 *               same "hard hit" test the leaf shake uses)
 *   tree-stage  useSpinnerGame.ts tickTowerVfx, where noteTowerStage(...)
 *               returns n > 0 for stage 1 or 2 (not 3: that is tree-fall)
 *   tree-fall   useSpinnerGame.ts onTowerDestroyed, instead of
 *               playSound('celebration-1')
 *   balloon-pop #UX3 — WIRED (owner request) and ON while its r1 waits for
 *               review: useSpinnerGame.ts renderBalloonLayer plays it when a
 *               smasher's HP balloon bursts (balloon builds only,
 *               VITE_APP_BALOON_HP_BAR), one per 90 ms cooldown however many
 *               pop at once. 'v1' here silences it (the balloons still pop).
 *   vs-intro    WIRED (owner request) and ON while its r1 waits for review:
 *               the 5 s VS screen before a new matchup (components/organisms/
 *               VsIntro.vue, cues in use/vsIntro.ts VS_SOUND_CUES) plays
 *               vs-whoosh (halves in + exit wipe), vs-thump (cards land) and
 *               vs-slam (the VS emblem lands). 'v1' here silences them.
 */
export type NewSlot = 'menu-1' | 'boss-1' | 'tree-hit' | 'tree-stage' | 'tree-fall' | 'balloon-pop' | 'vs-intro'

export const NEW_SLOT_VERSION: Record<NewSlot, AudioVersion> = {
  'menu-1': 'v1',
  'boss-1': 'v1',
  'tree-hit': 'v1',
  'tree-stage': 'v1',
  'tree-fall': 'v1',
  'balloon-pop': 'v2',
  'vs-intro': 'v2'
}

/** Files each new slot plays (public paths, no base URL). */
export const NEW_SLOT_FILES = {
  'menu-1': ['audio/v2/music/menu-1.ogg'],
  'boss-1': ['audio/v2/music/boss-1.ogg'],
  'tree-hit': [
    'audio/v2/sfx/tree-hit-1.ogg',
    'audio/v2/sfx/tree-hit-2.ogg',
    'audio/v2/sfx/tree-hit-3.ogg',
    'audio/v2/sfx/tree-hit-heavy.ogg'
  ],
  'tree-stage': ['audio/v2/sfx/tree-stage.ogg'],
  'tree-fall': ['audio/v2/sfx/tree-fall.ogg'],
  'balloon-pop': ['audio/v2/sfx/balloon-pop.ogg'],
  'vs-intro': ['audio/v2/sfx/vs-whoosh.ogg', 'audio/v2/sfx/vs-thump.ogg', 'audio/v2/sfx/vs-slam.ogg']
} as const satisfies Record<NewSlot, readonly string[]>

/** Whether a new slot is switched on. */
export const newSlotOn = (slot: NewSlot): boolean => NEW_SLOT_VERSION[slot] === 'v2'

/** Round-robin tree-hit variants (names for playSound once sfxPath is hooked up). */
export const TREE_HIT_VARIANTS = ['tree-hit-1', 'tree-hit-2', 'tree-hit-3'] as const
/** Damage-scaled layer played together with a variant on hard hits. */
export const TREE_HIT_HEAVY = 'tree-hit-heavy'
/** n-th tree-hit variant (caller keeps the counter). */
export const treeHitName = (n: number): (typeof TREE_HIT_VARIANTS)[number] =>
  TREE_HIT_VARIANTS[((Math.floor(n) % 3) + 3) % 3]!

/** #UX3: a smasher's HP balloon bursting (playSound name). */
export const BALLOON_POP_SFX = 'balloon-pop'

/** The VS intro's three sounds (playSound names). */
export const VS_INTRO_SFX = ['vs-whoosh', 'vs-thump', 'vs-slam'] as const

/** New-slot SFX live only under audio/v2/sfx (no v1 file exists). */
const NEW_SLOT_SFX = new Set<string>([...TREE_HIT_VARIANTS, TREE_HIT_HEAVY, 'tree-stage', 'tree-fall', BALLOON_POP_SFX, ...VS_INTRO_SFX])

/** Whether `name` is a new-slot SFX (only a v2 file exists — playSound must
 *  resolve it through sfxPath; every other name keeps its v1 path until the
 *  one-time hook-up above). */
export const isNewSlotSfx = (name: string): boolean => NEW_SLOT_SFX.has(name)

const isV2 = (table: Readonly<Record<string, AudioVersion>>, id: string): boolean => table[id] === 'v2'

/** Public path (no base URL) of an SFX file, honouring the switchboard. */
export const sfxPath = (name: string): string =>
  isV2(SFX_VERSION, name) || NEW_SLOT_SFX.has(name) ? `audio/v2/sfx/${name}.ogg` : `audio/sfx/${name}.ogg`

/** Public path (no base URL) of a music file, honouring the switchboard. */
export const musicPath = (name: string): string =>
  isV2(MUSIC_VERSION, name) ? `audio/v2/music/${name}.ogg` : `audio/music/${name}.ogg`
