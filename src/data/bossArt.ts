// Boss art of the bosses 100+ encounters (bosses-100-feature.md §7.1) — pure
// data, no Vue. The three new bosses each have a TROPHY SKIN (their look in
// the arena, `@/data/skinCatalog` TROPHY_SKINS) and a BOSS BADGE (their crest:
// a hex shield with the boss's emblem — flame in a ring / snowflake padlock /
// tusked yeti face) for the teaser, the intro card and the trophy screen.
//
// Both ship as drop-in WebP at the paths below. Until they are painted, those
// files are the PROCEDURAL drawing baked by `node art/bosses/build.mjs`
// (art/bosses/painters.mjs), so every consumer works before the paint pass;
// a painting replaces the file in place (art/bosses/slice-return.mjs) with no
// code change. Registry of the drawables: art/bosses/manifest.mjs.

import type { BossEncounterId, BossTrophySkinId } from '@/data/bossEncounters'
import { prependBaseUrl } from '@/utils/function'

/** The three bosses that have a badge of their own. */
export type BadgedBossId = Extract<BossEncounterId, 'cinder_tyrant' | 'glacier_warden' | 'frostbite_yeti'>

export interface BossArt {
  /** Trophy skin the boss wears (and grants). */
  skin: BossTrophySkinId
  /** File stem under `public/images/boss-badges/` (`<file>_256x256.webp`). */
  badgeFile: string
}

export const BOSS_ART: Readonly<Record<BadgedBossId, BossArt>> = {
  cinder_tyrant: { skin: 'cinder', badgeFile: 'cinder-tyrant' },
  glacier_warden: { skin: 'frost-vault', badgeFile: 'glacier-warden' },
  frostbite_yeti: { skin: 'yeti', badgeFile: 'frostbite-yeti' }
}

/** Path (under `public/`) of a boss badge file. */
export const bossBadgeFile = (boss: BadgedBossId): string =>
  `images/boss-badges/${BOSS_ART[boss].badgeFile}_256x256.webp`

/** Badge URL of one of the three new bosses. */
export const bossBadgeImgPath = (boss: BadgedBossId): string => prependBaseUrl(bossBadgeFile(boss))

/**
 * Badge URL for a boss identified by the skin it wears — works for the combo
 * encounters too (140–200), whose lead blade wears one of the three trophy
 * skins (`bossPreviewModelId` in `@/use/bossPeek`). Null for any other skin.
 */
export const bossBadgeImgPathForSkin = (modelId: string | null | undefined): string | null => {
  for (const boss of Object.keys(BOSS_ART) as BadgedBossId[]) {
    if (BOSS_ART[boss].skin === modelId) return bossBadgeImgPath(boss)
  }
  return null
}
