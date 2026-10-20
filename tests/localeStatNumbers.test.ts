// @vitest-environment node
// Batch 4 copy / layout polish:
//   T3 — the older stat multipliers (Team modal part cards "1.50x" + stats bar
//        "1.5x", the arena's fighter stat cards) print in the active
//        language's decimal notation through the shared formatter the skill
//        copy uses (utils/localeNumber.ts), never a bare `toFixed`;
//   T4 — Turkish says "altın" for coins everywhere (the win-ad label said "jeton");
//   V1 — on the roulette reward row every "+" shares a no-wrap slot with the
//        grant it precedes, so a wrap can never strand it at a line end.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fmtFixed, fmtNum, numberFormatFor } from '@/utils/localeNumber'
import * as skillText from '@/use/skillText'
import tr from '@/i18n/locales/tr'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')

describe('T3 — locale-aware stat multipliers', () => {
  it('fmtFixed keeps the digits of toFixed, in the locale\'s notation', () => {
    expect(fmtFixed(1.5, 2, 'en')).toBe('1.50')
    expect(fmtFixed(1.5, 2, 'de')).toBe('1,50')
    expect(fmtFixed(1.25, 1, 'ru')).toBe('1,3')
    expect(fmtFixed(1, 1, 'fr')).toBe('1,0')
    expect(fmtFixed(1.05, 2, 'tr')).toBe('1,05')
    expect(fmtFixed(2.5, 1, 'jp')).toBe('2.5')
    // Latin digits even where the locale's default numbering system is not.
    expect(fmtFixed(1.5, 2, 'ar')).toMatch(/^1[.,٫]50$/)
    expect(fmtFixed(1.5, 2, 'ar')).not.toMatch(/[٠-٩]/)
    // Unknown code → English, never a throw.
    expect(fmtFixed(1.5, 1, 'xx-nope')).toMatch(/^1[.,]5$/)
  })

  it('the skill copy uses the very same shared formatter', () => {
    expect(skillText.fmtNum).toBe(fmtNum)
    expect(skillText.numberFormatFor).toBe(numberFormatFor)
    expect(fmtNum(2.5, 'de')).toBe('2,5')
    expect(numberFormatFor('de')).toBe(numberFormatFor('de'))
    expect(numberFormatFor('de', 2)).toBe(numberFormatFor('de', 2))
  })

  it('the Team modal and the arena stat cards format through it, never toFixed', () => {
    const modal = read('src/components/organisms/SmasherTeamModal.vue')
    expect(modal).toContain('fmtFixed(v, 2, locale.value)')
    expect(modal).not.toMatch(/\.toFixed\(/)
    const arena = read('src/views/SpinnerArena.vue')
    expect(arena).toContain('const statNum = (n: number): string => fmtFixed(n, 1, locale.value)')
    for (const s of ['atk', 'def', 'spd']) expect(arena).toContain(`statNum(bs.${s})`)
    expect(arena).not.toMatch(/bs\.(atk|def|spd)\.toFixed/)
  })
})

describe('T4 — Turkish coin wording', () => {
  it('no Turkish string calls coins "jeton"; the win-ad label says "altın"', () => {
    expect(JSON.stringify(tr)).not.toMatch(/jeton/i)
    const spinner = (tr as unknown as { spinner: Record<string, string> }).spinner
    expect(spinner.tripleCoinsAria).toBe('Toplam {count} altın almak için reklam izle | Toplam {count} altın almak için reklam izle')
  })
})

describe('V1 — the roulette reward row never strands a "+"', () => {
  it('each "+" sits in the same no-wrap slot as the grant after it', () => {
    const arena = read('src/views/SpinnerArena.vue')
    const at = arena.indexOf('div.roulette-reward-enter.w-full.flex.flex-wrap')
    // The row takes the full width (so it wraps against the screen, not its content).
    expect(at).toBeGreaterThan(0)
    const row = arena.slice(at, arena.indexOf('//- Boss Lab', at))
    // Two slot kinds (roulette grants, trophy cards), both no-wrap flex rows.
    const slots = row.match(/div\.roulette-grant-slot\.shrink-0\.flex\.flex-nowrap\.items-center\(/g) ?? []
    expect(slots).toHaveLength(2)
    // Every "+" element's parent element (the nearest shallower opener, skipping
    // the closing ")" of that opener's attribute list) is a slot — never the
    // wrapping row itself.
    const lines = row.split('\n')
    const indent = (l: string) => l.search(/\S/)
    const plusAt = lines.flatMap((l, i) => (/^\s+\) \+$/.test(l) ? [i] : []))
    expect(plusAt).toHaveLength(2)
    for (const i of plusAt) {
      let j = i
      while (j > 0 && !/div(?:\.roulette-grant-plus)?\.font-black\.game-text\.text-white\(/.test(lines[j]!)) j--
      const own = indent(lines[j]!)
      const parent = lines.slice(0, j).reverse().find(l => /\S/.test(l) && indent(l) < own && l.trim() !== ')')
      expect(parent?.trim(), `"+" at line ${j}`).toMatch(/^div\.roulette-grant-slot\.shrink-0\.flex\.flex-nowrap/)
    }
  })
})
