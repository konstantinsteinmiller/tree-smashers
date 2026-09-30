/**
 * ─── PvP league tiers ───────────────────────────────────────────────────────
 *
 * The seven ranks of the planned PvP league (new-features.md, "league with pvp
 * league ranks"), lowest first. Pure data: no Vue, no i18n instance, no DOM —
 * so the league logic, its tests and the icon (`LeagueTierIcon.vue`) all read
 * the same ordering from one place.
 *
 * DIVISIONS: every tier below Champion is split into three divisions, III (the
 * entry) → I (the top), the way ranked ladders players already know read.
 * Champion is the summit and has none — a "Champion III" is a rank a player
 * cannot be told apart from "Champion", so the icon ignores a division there.
 *
 * The tier NAME is user-facing and lives in the locale files under
 * `league.tiers.<id>`; nothing here is copy.
 */

export const LEAGUE_TIERS = ['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'] as const

export type LeagueTier = typeof LEAGUE_TIERS[number]

/** 1 = the top division of a tier, 3 = the entry division. */
export type LeagueDivision = 1 | 2 | 3

export const LEAGUE_DIVISIONS: readonly LeagueDivision[] = [3, 2, 1]

export interface LeagueTierMeta {
  id: LeagueTier
  /** 0 (wood) … 6 (champion). */
  rank: number
  /** vue-i18n key of the tier's display name. */
  nameKey: `league.tiers.${LeagueTier}`
  /** Whether the tier is split into divisions I–III. */
  hasDivisions: boolean
  /** Whether the icon carries an idle animation (and so needs the quality /
   *  reduced-motion gate). The lower tiers are deliberately still: motion is
   *  part of what a higher rank earns. */
  animated: boolean
  /** One flat colour that stands for the tier in UI chrome around the icon
   *  (a progress bar, a name label) — the icon's own mid-tone. */
  accent: string
}

const ACCENTS: Record<LeagueTier, string> = {
  wood: '#b07a44',
  bronze: '#d98a4a',
  silver: '#c9d3df',
  gold: '#ffc93c',
  platinum: '#9fe6ff',
  diamond: '#4cc9f0',
  champion: '#ff4f7b'
}

export const LEAGUE_TIER_META: Readonly<Record<LeagueTier, LeagueTierMeta>> = Object.freeze(
  Object.fromEntries(LEAGUE_TIERS.map((id, rank) => [id, Object.freeze({
    id,
    rank,
    nameKey: `league.tiers.${id}` as const,
    hasDivisions: id !== 'champion',
    animated: rank >= LEAGUE_TIERS.indexOf('gold'),
    accent: ACCENTS[id]
  })])) as Record<LeagueTier, LeagueTierMeta>
)

export const isLeagueTier = (value: unknown): value is LeagueTier =>
  typeof value === 'string' && (LEAGUE_TIERS as readonly string[]).includes(value)

export const tierRank = (tier: LeagueTier): number => LEAGUE_TIER_META[tier].rank

/** Negative when `a` is below `b` — sorts lowest first. */
export const compareTiers = (a: LeagueTier, b: LeagueTier): number => tierRank(a) - tierRank(b)

const ROMAN: Record<LeagueDivision, string> = { 1: 'I', 2: 'II', 3: 'III' }

/**
 * The division numeral to show for a tier, or '' when there is none (Champion,
 * or no division given). Roman numerals are universal notation, not copy.
 */
export const divisionNumeral = (tier: LeagueTier, division?: LeagueDivision | null): string =>
  division && LEAGUE_TIER_META[tier].hasDivisions ? (ROMAN[division] ?? '') : ''

/**
 * CHAMPION POSITION: Champion has no divisions — it is ranked by leaderboard
 * position instead. Accepts `12` or `'#12'`; returns the position as a positive
 * integer, or null when the tier is not Champion or the value is not a valid
 * position (0, negative, fractional, garbage).
 */
export const championPosition = (tier: LeagueTier, position?: number | string | null): number | null => {
  if (tier !== 'champion' || position == null) return null
  const raw = typeof position === 'string' ? position.trim().replace(/^#/, '') : position
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * The text on the icon's plaque: the division numeral, or `#<position>` for
 * Champion. `#` + digits is universal leaderboard notation (the leaderboard
 * shows it the same way in every locale), not copy — the spoken form is the
 * localized `league.tierPosition` aria-label.
 */
export const plaqueLabel = (
  tier: LeagueTier, division?: LeagueDivision | null, position?: number | string | null
): string => {
  const pos = championPosition(tier, position)
  return pos ? `#${pos}` : divisionNumeral(tier, division)
}
