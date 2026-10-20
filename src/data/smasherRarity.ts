// ─── Smasher card rarity — PRESENTATION ONLY ────────────────────────────────
//
// The team / roster cards wear a Brawl-style rarity edge (design.sass
// `.ui-rarity--*`). There is no rarity in the game rules: it is derived from
// how deep into the campaign a smasher unlocks, so later recruits read as
// rarer at a glance. Nothing in combat, prices or drops reads this.

export type SmasherRarity = 'common' | 'rare' | 'super' | 'epic' | 'legendary'

/** Unlock stage → card edge tier. */
export const smasherRarity = (unlockStage: number): SmasherRarity => {
  if (unlockStage <= 5) return 'common'
  if (unlockStage <= 11) return 'rare'
  if (unlockStage <= 20) return 'super'
  if (unlockStage <= 30) return 'epic'
  return 'legendary'
}

/** The CSS colour token of a tier (matches design.sass `--rarity-*`). */
export const RARITY_EDGE: Record<SmasherRarity, string> = {
  common: 'var(--rarity-common)',
  rare: 'var(--rarity-rare)',
  super: 'var(--rarity-super)',
  epic: 'var(--rarity-epic)',
  legendary: 'var(--rarity-legendary)'
}
