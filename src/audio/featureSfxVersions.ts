// ─── Audio v2 switchboard: feature-gated SFX ──────────────────────────────
//
// The skill and boss-trait half of audio/audioVersions.ts SFX_VERSION. Kept
// apart because audioVersions.ts is imported by the hot path (useSound,
// useAssets, useSpinnerGame) and these names are the purity markers of the
// lazy skill / bosses100 chunks (tests/platforms/skillsFlagPurity.test.ts,
// bosses100FlagPurity.test.ts). Import this module ONLY from the lazy
// feature modules (use/skills/skillSfx.ts, use/bosses/bossTraitSfx.ts) and
// tests — never from a hot-path module.
//
// Flip a sound by changing its 'v1' to 'v2', exactly like SFX_VERSION.

import type { AudioVersion } from '@/audio/audioVersions'

export const SKILL_SFX_VERSION = {
  'skill-shield': 'v1',
  'skill-rocket': 'v1',
  'skill-zap': 'v1',
  'skill-crit': 'v1',
  'skill-whoosh': 'v1',
  'skill-boost': 'v1'
} as const satisfies Record<string, AudioVersion>

export const BOSS_TRAIT_SFX_VERSION = {
  'boss-ember-pulse': 'v1',
  'boss-freeze': 'v1',
  'boss-crack': 'v1',
  'boss-chill': 'v1'
} as const satisfies Record<string, AudioVersion>

const FEATURE_SFX_VERSION: Readonly<Record<string, AudioVersion>> = { ...SKILL_SFX_VERSION, ...BOSS_TRAIT_SFX_VERSION }

/** Public path (no base URL) of a skill / boss-trait SFX, honouring the switchboard. */
export const featureSfxPath = (name: string): string =>
  FEATURE_SFX_VERSION[name] === 'v2' ? `audio/v2/sfx/${name}.ogg` : `audio/sfx/${name}.ogg`
