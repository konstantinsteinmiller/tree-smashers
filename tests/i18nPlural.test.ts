// CLDR-aware plural branch selection (`pluralRuleFor` in src/i18n/languages.ts),
// wired into createI18n by main.ts via `buildPluralRules()`. The coin-count
// aria labels are the shipped messages with `a | b` branches (last describe);
// the rest of the copy stays number-neutral.

import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { LANGUAGE_BY_CODE, pluralCategoriesFor, pluralRuleFor } from '@/i18n/languages'
import { buildPluralRules, SHIPPED_LOCALES } from '@/i18n'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'
import uk from '@/i18n/locales/uk'
import pl from '@/i18n/locales/pl'
import cs from '@/i18n/locales/cs'
import hr from '@/i18n/locales/hr'
import lt from '@/i18n/locales/lt'
import ar from '@/i18n/locales/ar'

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

// T2: the coin-count aria labels (skills learn/upgrade/top-up, win-ad triple
// coins) carry real plural branches. Rendered from the SHIPPED messages with
// the runtime plural rules, exactly as `t(key, named, count)` in the components.
describe('coin-count aria labels (shipped messages)', () => {
  const MSGS: Record<string, any> = { en, ru, uk, pl, cs, hr, lt, ar }
  const rules = buildPluralRules()
  const render = (loc: string, key: string, count: number) => {
    const i18n = createI18n({
      legacy: false,
      locale: loc,
      messages: { [loc]: MSGS[loc] },
      pluralRules: { [loc]: rules[loc]! }
    })
    return (i18n.global as any).t(key, { name: 'X', cost: count, n: count, count }, count) as string
  }
  const at = (loc: string, key: string) => [1, 2, 5, 21].map(n => render(loc, key, n))

  it('English: one | other', () => {
    expect(at('en', 'skills.learnAria')).toEqual([
      'Learn X for 1 coin', 'Learn X for 2 coins', 'Learn X for 5 coins', 'Learn X for 21 coins'
    ])
    expect(render('en', 'spinner.tripleCoinsAria', 450)).toBe('Watch an ad to get 450 coins in total')
  })

  it('Russian / Ukrainian: 1 & 21 one, 2 few, 5 many', () => {
    expect(at('ru', 'skills.learnAria')).toEqual([
      'Изучить X за 1 монету', 'Изучить X за 2 монеты', 'Изучить X за 5 монет', 'Изучить X за 21 монету'
    ])
    expect(at('ru', 'skills.topUpAria')).toEqual([
      'Посмотреть рекламу за 1 монету', 'Посмотреть рекламу за 2 монеты',
      'Посмотреть рекламу за 5 монет', 'Посмотреть рекламу за 21 монету'
    ])
    expect(at('uk', 'skills.upgradeAria')).toEqual([
      'Покращити X за 1 монету', 'Покращити X за 2 монети', 'Покращити X за 5 монет', 'Покращити X за 21 монету'
    ])
    expect(render('ru', 'skills.learnAria', 11)).toBe('Изучить X за 11 монет')
    expect(render('ru', 'spinner.tripleCoinsAria', 22)).toBe('Посмотри рекламу и получи всего 22 монеты')
  })

  it('Polish: 1 one, 2 few, 5 & 21 many', () => {
    expect(at('pl', 'skills.learnAria')).toEqual([
      'Naucz się: X za 1 monetę', 'Naucz się: X za 2 monety', 'Naucz się: X za 5 monet', 'Naucz się: X za 21 monet'
    ])
    expect(render('pl', 'skills.learnAria', 22)).toBe('Naucz się: X za 22 monety')
  })

  it('Czech: 1 one, 2 few, 5 & 21 other', () => {
    expect(at('cs', 'skills.upgradeAria')).toEqual([
      'Vylepšit X za 1 minci', 'Vylepšit X za 2 mince', 'Vylepšit X za 5 mincí', 'Vylepšit X za 21 mincí'
    ])
  })

  it('Croatian: 1 & 21 one, 2 few, 5 other', () => {
    expect(at('hr', 'skills.learnAria')).toEqual([
      'Nauči X za 1 novčić', 'Nauči X za 2 novčića', 'Nauči X za 5 novčića', 'Nauči X za 21 novčić'
    ])
  })

  it('Lithuanian: 1 & 21 one, 2 & 5 few, 10 & 11 other', () => {
    expect(at('lt', 'skills.learnAria')).toEqual([
      'Išmokti X už 1 monetą', 'Išmokti X už 2 monetas', 'Išmokti X už 5 monetas', 'Išmokti X už 21 monetą'
    ])
    expect(render('lt', 'skills.learnAria', 10)).toBe('Išmokti X už 10 monetų')
    expect(render('lt', 'skills.learnAria', 11)).toBe('Išmokti X už 11 monetų')
  })

  it('Arabic: one and two drop the digit, few 3–10, other keeps it', () => {
    expect(render('ar', 'skills.topUpAria', 1)).toBe('شاهد إعلانًا مقابل عملة واحدة')
    expect(render('ar', 'skills.topUpAria', 2)).toBe('شاهد إعلانًا مقابل عملتين')
    expect(render('ar', 'skills.topUpAria', 5)).toBe('شاهد إعلانًا مقابل 5 عملات')
    expect(render('ar', 'skills.topUpAria', 150)).toBe('شاهد إعلانًا مقابل 150 عملة')
  })

  it('every shipped locale branches these keys by its own plural categories', () => {
    const dir = path.resolve(__dirname, '../src/i18n/locales')
    for (const code of SHIPPED_LOCALES) {
      const want = pluralCategoriesFor(LANGUAGE_BY_CODE[code]!.bcp47).length
      const src = readFileSync(path.join(dir, `${code}.ts`), 'utf8')
      for (const key of ['learnAria', 'upgradeAria', 'topUpAria', 'tripleCoinsAria']) {
        const msg = new RegExp(`'${key}': '([^']*)'`).exec(src)?.[1]
        expect(msg, `${code}.${key}`).toBeDefined()
        expect(msg!.split(' | ').length, `${code}.${key}`).toBe(want)
      }
    }
  })
})
