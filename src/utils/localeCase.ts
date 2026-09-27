// ─── Locale-correct upper-casing for text the DOM cannot style ──────────────
//
// DOM text should be upper-cased with CSS `text-transform: uppercase`: it keys
// off `<html lang>` (set by `applyDocumentLocale`), so the browser gets
// Turkish/Azerbaijani dotted İ and Greek accent removal right by itself.
//
// Canvas text has no CSS. `String#toLocaleUpperCase()` with NO argument uses
// the runtime's default locale — not the game's — so a Turkish player on an
// English-configured OS gets "I" for "i", and Greek keeps its tonos in
// all-caps, which Greek typography does not do ("Επίπεδο" → "ΕΠΙΠΕΔΟ").
// This helper is the canvas equivalent of the CSS rule.

import { LANGUAGE_BY_CODE } from '@/i18n/languages'

/** Greek and Coptic + Greek Extended. */
const isGreekLetter = (cp: number): boolean =>
  (cp >= 0x0370 && cp <= 0x03ff) || (cp >= 0x1f00 && cp <= 0x1fff)

const COMBINING_ACUTE = 0x0301 // tonos after NFD
const COMBINING_DIAERESIS = 0x0308 // dialytika after NFD

/**
 * Upper-case `text` for the game's locale `code` (an internal code such as
 * `tr`, `el`, `jp`, `pt-BR` — mapped to its BCP-47 tag), then strip the Greek
 * accents all-caps Greek does not carry.
 */
export const upperForLocale = (text: string, code: string): string => {
  const tag = LANGUAGE_BY_CODE[code]?.bcp47 ?? code
  let up: string
  try {
    up = text.toLocaleUpperCase(tag)
  } catch {
    // An unknown tag throws a RangeError — fall back to the root rules.
    up = text.toUpperCase()
  }
  // Fast path: nothing Greek in it.
  let hasGreek = false
  for (const ch of up) {
    if (isGreekLetter(ch.codePointAt(0)!)) {
      hasGreek = true
      break
    }
  }
  if (!hasGreek) return up
  // Decompose, drop tonos / dialytika that sit on a Greek letter, recompose.
  let out = ''
  let lastBaseGreek = false
  for (const ch of up.normalize('NFD')) {
    const cp = ch.codePointAt(0)!
    if ((cp === COMBINING_ACUTE || cp === COMBINING_DIAERESIS) && lastBaseGreek) continue
    // Combining marks (U+0300–U+036F) keep the base they attach to.
    if (cp < 0x0300 || cp > 0x036f) lastBaseGreek = isGreekLetter(cp)
    out += ch
  }
  return out.normalize('NFC')
}
