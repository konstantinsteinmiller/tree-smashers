// Ensures the ad-disclosure + RouletteWheel labels are translated in EVERY
// locale (the "every language showing it correctly" requirement). Guards
// against a half-translated key sneaking in.

import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
import fr from '@/i18n/locales/fr'
import es from '@/i18n/locales/es'
import jp from '@/i18n/locales/jp'
import kr from '@/i18n/locales/kr'
import zh from '@/i18n/locales/zh'
import ru from '@/i18n/locales/ru'

const locales: Record<string, any> = { en, de, fr, es, jp, kr, zh, ru }
const KEYS = ['ad', 'spinning', 'spinAgain', 'skip'] as const

describe('spinner ad / roulette labels — translated in every locale', () => {
  for (const [name, loc] of Object.entries(locales)) {
    it(`${name} defines all keys as non-empty strings`, () => {
      const spinner = loc?.spinner
      expect(spinner, `${name}.spinner missing`).toBeTruthy()
      for (const key of KEYS) {
        const val = spinner[key]
        expect(typeof val, `${name}.spinner.${key} not a string`).toBe('string')
        expect(val.trim().length, `${name}.spinner.${key} empty`).toBeGreaterThan(0)
      }
    })
  }

  it('English values are the expected literals', () => {
    expect(en.spinner.ad).toBe('Ad')
    expect(en.spinner.spinning).toBe('Spinning...')
    expect(en.spinner.spinAgain).toBe('Spin Again')
    expect(en.spinner.skip).toBe('Skip')
  })
})
