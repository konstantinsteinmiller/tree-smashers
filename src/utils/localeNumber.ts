// ─── Locale-aware numbers (shared) ──────────────────────────────────────────
//
// One Intl.NumberFormat per (shipped locale code, digits) pair, built on first
// use and kept — no allocation per call after that: "2.5" in en, "2,5" in
// de/ru/fr/tr. Latin digits everywhere, like every other number the game
// prints; no grouping (the values stay small).
//
// Two shapes:
//   • fmtNum   — at most one decimal, no trailing ",0" (skill copy: "2,5 s").
//   • fmtFixed — exactly `digits` decimals (stat multipliers: "1,50x", "1,0").
//
// Shared by the skill copy (use/skillText.ts re-exports it) and the always-on
// stat lines (Team modal, arena stat cards), so it must stay free of any
// feature module.

import { LANGUAGE_BY_CODE } from '@/i18n/languages'

const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>()

/**
 * The cached decimal formatter for a shipped locale code ('de', 'jp',
 * 'pt-BR'…). `fixedDigits` undefined → at most one decimal; a number → exactly
 * that many decimals.
 */
export function numberFormatFor(locale: string, fixedDigits?: number): Intl.NumberFormat {
  const key = fixedDigits === undefined ? locale : `${locale}|${fixedDigits}`
  let nf = NUMBER_FORMATS.get(key)
  if (!nf) {
    const opts: Intl.NumberFormatOptions = fixedDigits === undefined
      ? { maximumFractionDigits: 1, useGrouping: false, numberingSystem: 'latn' }
      : {
        minimumFractionDigits: fixedDigits,
        maximumFractionDigits: fixedDigits,
        useGrouping: false,
        numberingSystem: 'latn'
      }
    try {
      nf = new Intl.NumberFormat(LANGUAGE_BY_CODE[locale]?.bcp47 ?? locale, opts)
    } catch {
      nf = new Intl.NumberFormat('en', opts)
    }
    NUMBER_FORMATS.set(key, nf)
  }
  return nf
}

/** 0.035 → "3.5" (en) / "3,5" (de), 0.1 → "10", 1.5 → "1.5" — at most one decimal, no trailing ".0". */
export const fmtNum = (n: number, locale = 'en'): string =>
  numberFormatFor(locale).format(Math.round(n * 10) / 10)

/** 1.5 → "1.50" (en, digits 2) / "1,50" (de) — exactly `digits` decimals, like `toFixed`. */
export const fmtFixed = (n: number, digits: number, locale = 'en'): string =>
  numberFormatFor(locale, digits).format(n)
