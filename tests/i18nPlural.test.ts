// CLDR-aware plural branch selection (`pluralRuleFor` in src/i18n/languages.ts),
// wired into createI18n by main.ts via `buildPluralRules()`. No shipped message
// uses `a | b` branches yet; this pins what a translator gets when one does.

import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { pluralCategoriesFor, pluralRuleFor } from '@/i18n/languages'
import { buildPluralRules, SHIPPED_LOCALES } from '@/i18n'

const tc = (locale: string, bcp47: string, msg: string) => {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { [locale]: { k: msg } },
    pluralRules: { [locale]: pluralRuleFor(bcp47) }
  })
  return (n: number) => (i18n.global as any).t('k', n, { named: { n } })
}

describe('plural categories (whole numbers only)', () => {
  it('counts the branches a counted message needs per language', () => {
    expect(pluralCategoriesFor('en')).toEqual(['one', 'other'])
    expect(pluralCategoriesFor('es')).toEqual(['one', 'other']) // not `many` (only 1 000 000)
    expect(pluralCategoriesFor('ru')).toEqual(['one', 'few', 'many']) // not `other` (only decimals)
    expect(pluralCategoriesFor('cs')).toEqual(['one', 'few', 'other'])
    expect(pluralCategoriesFor('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other'])
    expect(pluralCategoriesFor('ja')).toEqual(['other'])
  })
})

describe('plural branch selection', () => {
  it('Russian: one | few | many', () => {
    const t = tc('ru', 'ru', '{n} монета | {n} монеты | {n} монет')
    expect([1, 2, 5, 11, 21, 22, 25].map(t)).toEqual([
      '1 монета', '2 монеты', '5 монет', '11 монет', '21 монета', '22 монеты', '25 монет'
    ])
  })

  it('Arabic: all six categories', () => {
    const t = tc('ar', 'ar', 'صفر | واحد | اثنان | قليل {n} | كثير {n} | {n} آخر')
    expect([0, 1, 2, 3, 11, 100].map(t)).toEqual(['صفر', 'واحد', 'اثنان', 'قليل 3', 'كثير 11', '100 آخر'])
  })

  it('an explicit leading zero branch is allowed on top of the categories', () => {
    const t = tc('ru', 'ru', 'нет монет | {n} монета | {n} монеты | {n} монет')
    expect([0, 1, 3, 7].map(t)).toEqual(['нет монет', '1 монета', '3 монеты', '7 монет'])
  })

  it('an un-adapted English-style 2-branch message keeps English semantics', () => {
    const t = tc('es', 'es', '{n} moneda | {n} monedas')
    expect([0, 1, 2].map(t)).toEqual(['0 monedas', '1 moneda', '2 monedas'])
  })

  it('every shipped locale gets a rule', () => {
    expect(Object.keys(buildPluralRules()).sort()).toEqual([...SHIPPED_LOCALES].sort())
  })
})
