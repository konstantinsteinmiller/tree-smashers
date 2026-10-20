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
//      build each entry with sfxPath(name) so the preload decodes the same
//      URL playSound asks for.
//   3. use/uiSfx.ts playUiSfx: call
//      (UI_SFX_VERSION[name] === 'v2' ? renderUiSfxV2 : renderUiSfx)(…same args)
//   4. use/introAudio.ts fire(): for 'tick' | 'thud' | 'heart' | 'whoosh',
//      INTRO_CUE_VERSION[c.kind] === 'v2'
//        ? renderIntroCueV2(ctx, ctx.destination, c.kind, volume, ctx.currentTime, { gain, pitchHz })
//        : the existing tone(...) call.
//   Proposals (no v1 exists) also need their own trigger — see PROPOSALS.

import type { UiSfxName } from '@/use/uiSfx'
import type { IntroCueKind } from '@/audio/uiSfxV2'

export type AudioVersion = 'v1' | 'v2'

/** File-based SFX and the two result stingers (played through playSound). */
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
  lose: 'v1',
  'skill-shield': 'v1',
  'skill-rocket': 'v1',
  'skill-zap': 'v1',
  'skill-crit': 'v1',
  'skill-whoosh': 'v1',
  'skill-boost': 'v1',
  'boss-ember-pulse': 'v1',
  'boss-freeze': 'v1',
  'boss-crack': 'v1',
  'boss-chill': 'v1'
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
 * New slots with no v1 sound. `true` = approved; each still needs its
 * trigger in game code:
 *   menu-1      loop on the menu / stage map (useMusic gains a menu track)
 *   boss-1      replaces the random battle pick on boss stages
 *   tower-fall  onTowerDestroyed (useSpinnerGame) instead of 'celebration-1'
 */
export const PROPOSALS = {
  'menu-1': false,
  'boss-1': false,
  'tower-fall': false
} as const satisfies Record<string, boolean>

export const PROPOSAL_PATHS = {
  'menu-1': 'audio/v2/music/menu-1.ogg',
  'boss-1': 'audio/v2/music/boss-1.ogg',
  'tower-fall': 'audio/v2/sfx/tower-fall.ogg'
} as const satisfies Record<keyof typeof PROPOSALS, string>

const isV2 = (table: Readonly<Record<string, AudioVersion>>, id: string): boolean => table[id] === 'v2'

/** Public path (no base URL) of an SFX file, honouring the switchboard. */
export const sfxPath = (name: string): string =>
  isV2(SFX_VERSION, name) ? `audio/v2/sfx/${name}.ogg` : `audio/sfx/${name}.ogg`

/** Public path (no base URL) of a music file, honouring the switchboard. */
export const musicPath = (name: string): string =>
  isV2(MUSIC_VERSION, name) ? `audio/v2/music/${name}.ogg` : `audio/music/${name}.ogg`
