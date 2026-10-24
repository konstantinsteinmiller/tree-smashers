// ─── Smasher / skin card rarity — PRESENTATION ONLY ─────────────────────────
//
// The team / roster cards wear a Brawl-style rarity edge (design.sass
// `.ui-rarity--*`) and print the rarity NAME on a strip ("RARE", "EPIC"…,
// i18n `rarity.<tier>`). There is no rarity in the game rules: a smasher's
// tier is derived from how deep into the campaign it unlocks, a skin's from
// how it is obtained, so later / harder-won things read as rarer at a glance.
// Nothing in combat, prices or drops reads this.

import { isSmasherSkin } from '@/data/smasherSkinCatalog'
import {
  AD_UNLOCK_SKINS,
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  isEarnOnlySkin,
  type SpinnerModelId
} from '@/data/skinCatalog'

export type SmasherRarity = 'common' | 'rare' | 'super' | 'epic' | 'legendary'
/** Every tier the UI can name (mythic is reserved: no smasher or skin uses it yet). */
export type RarityTier = SmasherRarity | 'mythic'

/** Low → high, for "best rarity of a batch". */
export const RARITY_ORDER: readonly RarityTier[] = ['common', 'rare', 'super', 'epic', 'legendary', 'mythic']

/** Unlock stage → card edge tier. */
export const smasherRarity = (unlockStage: number): SmasherRarity => {
  if (unlockStage <= 5) return 'common'
  if (unlockStage <= 11) return 'rare'
  if (unlockStage <= 20) return 'super'
  if (unlockStage <= 30) return 'epic'
  return 'legendary'
}

/**
 * Skin (colourway) → tier, from how it is obtained:
 *   the free default of its top part   common
 *   a regular 300-coin skin            rare
 *   the 2026-09 ad-unlock expansion    super
 *   a special skin with its own VFX    epic
 *   an earn-only boss trophy skin      legendary
 */
export const skinRarity = (modelId: SpinnerModelId): SmasherRarity => {
  if (isEarnOnlySkin(modelId)) return 'legendary'
  if (isSmasherSkin(modelId)) return 'epic'
  if (SPECIAL_SKINS.has(modelId)) return 'epic'
  if (AD_UNLOCK_SKINS.has(modelId)) return 'super'
  for (const list of Object.values(SKINS_PER_TOP)) {
    if (list[0] === modelId) return 'common'
  }
  return 'rare'
}

/** The highest tier of a batch (null for an empty one). */
export const bestRarity = (tiers: readonly RarityTier[]): RarityTier | null => {
  let best: RarityTier | null = null
  for (const t of tiers) {
    if (best === null || RARITY_ORDER.indexOf(t) > RARITY_ORDER.indexOf(best)) best = t
  }
  return best
}

/** The CSS colour token of a tier (matches design.sass `--rarity-*`). */
export const RARITY_EDGE: Record<RarityTier, string> = {
  common: 'var(--rarity-common)',
  rare: 'var(--rarity-rare)',
  super: 'var(--rarity-super)',
  epic: 'var(--rarity-epic)',
  legendary: 'var(--rarity-legendary)',
  mythic: 'var(--rarity-mythic)'
}

/**
 * The same colours as plain hex, for the few consumers that need a literal
 * (the reward stage's confetti / ray tone is a hex string). Mirrors the
 * tailwind.css tokens behind `--rarity-*`; tests/rarity.test.ts keeps the two
 * in step.
 */
export const RARITY_HEX: Record<RarityTier, string> = {
  common: '#7fdcff', // sky-300
  rare: '#55c81e', // leaf-500
  super: '#4570f0', // royal-500
  epic: '#9c46f0', // plum-500
  legendary: '#ffd21a', // sun-400
  mythic: '#f2306b' // berry-500
}
