import type { ENUM } from '@/types'

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
} as const

export type Difficulties = (typeof DIFFICULTY)[keyof typeof DIFFICULTY]

export const ELEMENTS = {
  NATURE: 'nature',
  AIR: 'air',
  WATER: 'water',
  LIGHT: 'light',
  ENERGY: 'energy',
  PSI: 'psi',
  EARTH: 'earth',
  ICE: 'ice',
  FIRE: 'fire',
  DARK: 'dark',
  METAL: 'metal',
  NEUTRAL: 'neutral'
} as const

export type Element = (typeof ELEMENTS)[keyof typeof ELEMENTS]

/**
 * Every locale the game ships — derived, not listed: the language registry
 * (`src/i18n/languages.ts`) filtered to the codes that have a
 * `src/i18n/locales/<code>.ts` file. Adding a translation file is all it takes
 * to make a language selectable and detectable.
 */
export { SHIPPED_LOCALES as LANGUAGES } from '@/i18n'
