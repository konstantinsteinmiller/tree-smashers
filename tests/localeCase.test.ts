import { describe, expect, it } from 'vitest'
import { upperForLocale } from '@/utils/localeCase'

// Canvas text cannot use CSS `text-transform`, so it is upper-cased through
// this helper for the GAME's locale — never the OS default.

describe('upperForLocale', () => {
  it('Turkish: dotted i → İ, dotless ı → I', () => {
    expect(upperForLocale('iİıI', 'tr')).toBe('İİII')
    expect(upperForLocale('Boss Bölümü', 'tr')).toBe('BOSS BÖLÜMÜ')
    expect(upperForLocale('istanbul', 'tr')).toBe('İSTANBUL')
  })

  it('Azerbaijani follows the same dotted-i rule', () => {
    expect(upperForLocale('Boss mərhələsi', 'az')).toBe('BOSS MƏRHƏLƏSİ')
    expect(upperForLocale('bir', 'az')).toBe('BİR')
  })

  it('English keeps the plain dotless mapping (not the OS locale)', () => {
    expect(upperForLocale('stage i', 'en')).toBe('STAGE I')
  })

  it('Greek drops the tonos (and dialytika) in all-caps', () => {
    expect(upperForLocale('Επίπεδο', 'el')).toBe('ΕΠΙΠΕΔΟ')
    expect(upperForLocale('Πίστα Boss', 'el')).toBe('ΠΙΣΤΑ BOSS')
    expect(upperForLocale('ά έ ή ί ό ύ ώ ΐ ΰ', 'el')).toBe('Α Ε Η Ι Ο Υ Ω Ι Υ')
    // Only accents on GREEK letters go: Latin accents in the same string stay.
    expect(upperForLocale('Επίπεδο é', 'el')).toBe('ΕΠΙΠΕΔΟ É')
    // …whatever the UI locale is.
    expect(upperForLocale('Επίπεδο', 'en')).toBe('ΕΠΙΠΕΔΟ')
    // Final sigma upper-cases to Σ.
    expect(upperForLocale('ς', 'el')).toBe('Σ')
  })

  it('German ß stays sane (SS), umlauts are kept', () => {
    expect(upperForLocale('Straße', 'de')).toBe('STRASSE')
    expect(upperForLocale('Boss-Etappe', 'de')).toBe('BOSS-ETAPPE')
    expect(upperForLocale('Größe', 'de')).toBe('GRÖSSE')
  })

  it('internal codes map to BCP-47, CJK passes through, bad tags do not throw', () => {
    expect(upperForLocale('ボスステージ', 'jp')).toBe('ボスステージ')
    expect(upperForLocale('Этап Босса', 'ru')).toBe('ЭТАП БОССА')
    expect(upperForLocale('stage', 'not a tag!!')).toBe('STAGE')
  })
})
