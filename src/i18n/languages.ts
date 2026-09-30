/**
 * The language registry — every language the game is ALLOWED to ship, with
 * everything the runtime needs to know about it.
 *
 * The set is the union of the two portal pick-lists we localise for:
 *
 *   • Playgama developer cabinet, `supportedLanguages` enum (23):
 *     EN TR RU DE FR ES HI JA IT PT_PT PT_BR AR ID UA TH PL UZ AZ NL KK VI KO ZH
 *   • Wavedash Developer Portal → Metadata → Languages (35):
 *     English, French, German, Spanish, Italian, Portuguese, Portuguese (Brazil),
 *     Russian, Japanese, Korean, Chinese (Simplified), Chinese (Traditional),
 *     Polish, Turkish, Arabic, Thai, Vietnamese, Indonesian, Dutch, Swedish,
 *     Norwegian, Danish, Finnish, Czech, Catalan, Croatian, Romanian, Hungarian,
 *     Ukrainian, Greek, Bulgarian, Esperanto, Galician, Latvian, Lithuanian
 *
 * Union = 39 languages. A language is only SHIPPED (selectable, detectable)
 * once `src/i18n/locales/<code>.ts` exists — see `SHIPPED_LOCALES` in
 * `./index.ts`. Adding a translation is therefore "drop in the file"; nothing
 * here has to change.
 *
 * Internal codes: the three legacy codes `jp`, `kr`, `zh` are kept because they
 * live in players' saves (`spinner_user_language`). Everything else uses the
 * BCP-47 language subtag, plus a region only where one file per variant is
 * needed (`pt-BR` / `pt-PT`, `zh-TW` = Traditional Chinese).
 *
 * This module is in the ENTRY chunk (detection runs before the first paint),
 * so it holds metadata only — never message text.
 */

/** Font / typography bucket. Drives `<html data-script>` → `fonts.sass`. */
export type ScriptBucket =
  | 'latin' // fully covered by the `Angry` display face (Latin-1)
  | 'latin-ext' // needs glyphs Angry lacks (ł ș ğ ő ə ơ…) → system sans
  | 'greek'
  | 'cyrillic'
  | 'arabic'
  | 'devanagari'
  | 'thai'
  | 'cjk-sc'
  | 'cjk-tc'
  | 'cjk-jp'
  | 'cjk-kr'

export type Portal = 'playgama' | 'wavedash'

export interface LanguageInfo {
  /** Internal code — the locale file name and the value stored in saves. */
  code: string
  /** Real BCP-47 tag for `<html lang>`, Intl APIs and screen readers. */
  bcp47: string
  /** English name (docs, QA, the translation guide). */
  english: string
  /** Autonym — what the language picker shows. */
  native: string
  script: ScriptBucket
  dir: 'ltr' | 'rtl'
  /** Which portal pick-lists name this language (for the store forms). */
  portals: readonly Portal[]
}

const PW: readonly Portal[] = ['playgama', 'wavedash']
const P: readonly Portal[] = ['playgama']
const W: readonly Portal[] = ['wavedash']

export const LANGUAGE_REGISTRY: readonly LanguageInfo[] = [
  // ── Latin, covered by the display face ──────────────────────────────────
  { code: 'en', bcp47: 'en', english: 'English', native: 'English', script: 'latin', dir: 'ltr', portals: PW },
  { code: 'de', bcp47: 'de', english: 'German', native: 'Deutsch', script: 'latin', dir: 'ltr', portals: PW },
  { code: 'es', bcp47: 'es', english: 'Spanish', native: 'Español', script: 'latin', dir: 'ltr', portals: PW },
  { code: 'fr', bcp47: 'fr', english: 'French', native: 'Français', script: 'latin', dir: 'ltr', portals: PW },
  { code: 'it', bcp47: 'it', english: 'Italian', native: 'Italiano', script: 'latin', dir: 'ltr', portals: PW },
  {
    code: 'pt-BR',
    bcp47: 'pt-BR',
    english: 'Portuguese (Brazil)',
    native: 'Português (Brasil)',
    script: 'latin',
    dir: 'ltr',
    portals: PW
  },
  {
    code: 'pt-PT',
    bcp47: 'pt-PT',
    english: 'Portuguese (Portugal)',
    native: 'Português (Portugal)',
    script: 'latin',
    dir: 'ltr',
    portals: PW
  },
  { code: 'nl', bcp47: 'nl', english: 'Dutch', native: 'Nederlands', script: 'latin', dir: 'ltr', portals: PW },
  {
    code: 'id',
    bcp47: 'id',
    english: 'Indonesian',
    native: 'Bahasa Indonesia',
    script: 'latin',
    dir: 'ltr',
    portals: PW
  },
  { code: 'sv', bcp47: 'sv', english: 'Swedish', native: 'Svenska', script: 'latin', dir: 'ltr', portals: W },
  {
    code: 'nb',
    bcp47: 'nb',
    english: 'Norwegian (Bokmål)',
    native: 'Norsk bokmål',
    script: 'latin',
    dir: 'ltr',
    portals: W
  },
  { code: 'da', bcp47: 'da', english: 'Danish', native: 'Dansk', script: 'latin', dir: 'ltr', portals: W },
  { code: 'fi', bcp47: 'fi', english: 'Finnish', native: 'Suomi', script: 'latin', dir: 'ltr', portals: W },
  { code: 'ca', bcp47: 'ca', english: 'Catalan', native: 'Català', script: 'latin', dir: 'ltr', portals: W },
  { code: 'gl', bcp47: 'gl', english: 'Galician', native: 'Galego', script: 'latin', dir: 'ltr', portals: W },
  // ── Latin with letters the display face lacks ───────────────────────────
  { code: 'pl', bcp47: 'pl', english: 'Polish', native: 'Polski', script: 'latin-ext', dir: 'ltr', portals: PW },
  { code: 'tr', bcp47: 'tr', english: 'Turkish', native: 'Türkçe', script: 'latin-ext', dir: 'ltr', portals: PW },
  {
    code: 'vi',
    bcp47: 'vi',
    english: 'Vietnamese',
    native: 'Tiếng Việt',
    script: 'latin-ext',
    dir: 'ltr',
    portals: PW
  },
  {
    code: 'az',
    bcp47: 'az',
    english: 'Azerbaijani',
    native: 'Azərbaycanca',
    script: 'latin-ext',
    dir: 'ltr',
    portals: P
  },
  { code: 'uz', bcp47: 'uz', english: 'Uzbek', native: 'Oʻzbekcha', script: 'latin-ext', dir: 'ltr', portals: P },
  { code: 'cs', bcp47: 'cs', english: 'Czech', native: 'Čeština', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'hr', bcp47: 'hr', english: 'Croatian', native: 'Hrvatski', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'ro', bcp47: 'ro', english: 'Romanian', native: 'Română', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'hu', bcp47: 'hu', english: 'Hungarian', native: 'Magyar', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'lv', bcp47: 'lv', english: 'Latvian', native: 'Latviešu', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'lt', bcp47: 'lt', english: 'Lithuanian', native: 'Lietuvių', script: 'latin-ext', dir: 'ltr', portals: W },
  { code: 'eo', bcp47: 'eo', english: 'Esperanto', native: 'Esperanto', script: 'latin-ext', dir: 'ltr', portals: W },
  // ── Greek / Cyrillic ────────────────────────────────────────────────────
  { code: 'el', bcp47: 'el', english: 'Greek', native: 'Ελληνικά', script: 'greek', dir: 'ltr', portals: W },
  { code: 'ru', bcp47: 'ru', english: 'Russian', native: 'Русский', script: 'cyrillic', dir: 'ltr', portals: PW },
  { code: 'uk', bcp47: 'uk', english: 'Ukrainian', native: 'Українська', script: 'cyrillic', dir: 'ltr', portals: PW },
  { code: 'bg', bcp47: 'bg', english: 'Bulgarian', native: 'Български', script: 'cyrillic', dir: 'ltr', portals: W },
  { code: 'kk', bcp47: 'kk', english: 'Kazakh', native: 'Қазақ тілі', script: 'cyrillic', dir: 'ltr', portals: P },
  // ── Complex scripts ─────────────────────────────────────────────────────
  { code: 'ar', bcp47: 'ar', english: 'Arabic', native: 'العربية', script: 'arabic', dir: 'rtl', portals: PW },
  { code: 'hi', bcp47: 'hi', english: 'Hindi', native: 'हिन्दी', script: 'devanagari', dir: 'ltr', portals: P },
  { code: 'th', bcp47: 'th', english: 'Thai', native: 'ไทย', script: 'thai', dir: 'ltr', portals: PW },
  // ── CJK ─────────────────────────────────────────────────────────────────
  { code: 'jp', bcp47: 'ja', english: 'Japanese', native: '日本語', script: 'cjk-jp', dir: 'ltr', portals: PW },
  { code: 'kr', bcp47: 'ko', english: 'Korean', native: '한국어', script: 'cjk-kr', dir: 'ltr', portals: PW },
  {
    code: 'zh',
    bcp47: 'zh-Hans',
    english: 'Chinese (Simplified)',
    native: '简体中文',
    script: 'cjk-sc',
    dir: 'ltr',
    portals: PW
  },
  {
    code: 'zh-TW',
    bcp47: 'zh-Hant',
    english: 'Chinese (Traditional)',
    native: '繁體中文',
    script: 'cjk-tc',
    dir: 'ltr',
    portals: W
  }
]

export const LANGUAGE_BY_CODE: Readonly<Record<string, LanguageInfo>> = Object.fromEntries(
  LANGUAGE_REGISTRY.map((l) => [l.code, l])
)

/**
 * Non-canonical base subtags portals and old runtimes hand us → the ISO 639-1
 * subtag. Covers ISO 639-2/3 three-letter codes (Trap A in the
 * portal-platform-signals skill), country codes used as language codes
 * (Playgama's own enum says `UA` for Ukrainian), Java/Android legacy codes
 * (`in` = Indonesian) and our own legacy internal codes (`jp`, `kr`).
 */
const BASE_ALIASES: Readonly<Record<string, string>> = {
  // our internal legacy codes
  jp: 'ja', kr: 'ko',
  // Country codes seen in the wild as language codes. Only ones that are NOT
  // themselves ISO 639-1 codes — `se` (Sami), `tw` (Twi) and `br` (Breton) are
  // real languages and must not be hijacked.
  ua: 'uk', kz: 'kk', gr: 'el', cz: 'cs', dk: 'da', vn: 'vi', cn: 'zh',
  // Norwegian: macro-language + Nynorsk → the one Norwegian file we ship
  no: 'nb', nn: 'nb', nob: 'nb', nor: 'nb', nno: 'nb',
  // Android / Java legacy
  in: 'id',
  // ISO 639-2 / 639-3
  eng: 'en', deu: 'de', ger: 'de', spa: 'es', fra: 'fr', fre: 'fr', ita: 'it', por: 'pt', nld: 'nl', dut: 'nl',
  ind: 'id', swe: 'sv', dan: 'da', fin: 'fi', cat: 'ca', glg: 'gl', pol: 'pl', tur: 'tr', vie: 'vi', aze: 'az',
  uzb: 'uz', ces: 'cs', cze: 'cs', hrv: 'hr', ron: 'ro', rum: 'ro', mol: 'ro', mo: 'ro', hun: 'hu', lav: 'lv',
  lit: 'lt', epo: 'eo', ell: 'el', gre: 'el', rus: 'ru', ukr: 'uk', bul: 'bg', kaz: 'kk', ara: 'ar', hin: 'hi',
  tha: 'th', jpn: 'ja', kor: 'ko', zho: 'zh', chi: 'zh', cmn: 'zh', yue: 'zh-tw'
}

/** Regions whose Portuguese follows the European norm. */
const PT_EUROPEAN_REGIONS = new Set(['pt', 'ao', 'mz', 'cv', 'gw', 'st', 'tl', 'mo', 'gq', 'lu', 'ch', 'ad', 'fr'])
/** Regions that write Traditional Chinese. */
const ZH_TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo'])

/**
 * Ordered candidate internal codes for a raw tag — best match first, then
 * the nearest sibling that still beats the English fallback (a Traditional
 * reader prefers Simplified to English; a European-Portuguese reader prefers
 * Brazilian to English).
 */
export const localeCandidates = (raw: string | null | undefined): string[] => {
  if (typeof raw !== 'string') return []
  const tag = raw.trim().replace(/_/g, '-').toLowerCase()
  if (!tag) return []
  const parts = tag.split('-').filter(Boolean)
  if (parts.length === 0) return []
  // An alias may itself carry a region (`br` → `pt-br`, `tw` → `zh-tw`).
  const aliased = (BASE_ALIASES[parts[0]!] ?? parts[0]!).split('-')
  const base = aliased[0]!
  const sub = [...aliased.slice(1), ...parts.slice(1)]

  if (base === 'zh') {
    // Script subtag wins over region: zh-Hans-HK is Simplified.
    const traditional = sub.includes('hant') || (!sub.includes('hans') && sub.some((s) => ZH_TRADITIONAL_REGIONS.has(s)))
    return traditional ? ['zh-TW', 'zh'] : ['zh', 'zh-TW']
  }
  if (base === 'pt') {
    const european = sub.some((s) => PT_EUROPEAN_REGIONS.has(s))
    return european ? ['pt-PT', 'pt-BR'] : ['pt-BR', 'pt-PT']
  }
  if (base === 'ja') return ['jp']
  if (base === 'ko') return ['kr']
  return LANGUAGE_BY_CODE[base] ? [base] : []
}

/**
 * Raw portal / browser tag → an internal code from `shipped`, or `null`.
 *
 * `null` (never a bare unshipped code) is load-bearing: every consumer treats
 * a non-null answer as "safe to apply", so a language we do not ship can never
 * knock the player out of their own choice.
 */
export const normalizeLocaleTag = (
  raw: string | null | undefined,
  shipped: readonly string[]
): string | null => {
  for (const code of localeCandidates(raw)) {
    if (shipped.includes(code)) return code
  }
  return null
}

// ─── Plural rules ─────────────────────────────────────────────────────────────

/** CLDR category order — plural branches in a message follow this order. */
export const CLDR_PLURAL_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'] as const

/**
 * The plural categories a language actually uses for WHOLE numbers, in CLDR
 * branch order — i.e. how many `a | b | c` branches a counted message needs.
 *
 * Sampled from `Intl.PluralRules` over 0‥200 rather than read from
 * `pluralCategories`, because that list also names categories that only
 * decimals or compact millions ever select: Spanish/French/Italian/Portuguese
 * list `many` (for 1 000 000), Russian/Polish/Czech list `other` (for 1.5).
 * Counting those would demand branches no game counter can ever reach. With
 * the sample: ru/uk/pl = one|few|many, cs = one|few|other, ar = all six,
 * lv = zero|one|other, en/de/es/fr… = one|other, ja/ko/zh/th/vi/id = other.
 */
export const pluralCategoriesFor = (bcp47: string): string[] => {
  try {
    const rules = new Intl.PluralRules(bcp47)
    const seen = new Set<string>()
    for (let n = 0; n <= 200; n++) seen.add(rules.select(n))
    return CLDR_PLURAL_ORDER.filter((c) => seen.has(c))
  } catch {
    return ['one', 'other']
  }
}

/**
 * vue-i18n `pluralRules` entry for one language.
 *
 * Most copy is written number-neutral; the coin-count aria labels
 * (skills.learnAria/upgradeAria/topUpAria, spinner.tripleCoinsAria) use
 * `a | b` branches and are called as `t(key, named, count)`. A
 * message may carry either one branch per category from `pluralCategoriesFor`
 * or that plus a leading explicit-zero branch. Anything else keeps vue-i18n's
 * English-style semantics so an un-adapted 2-branch message still picks a
 * sensible branch instead of an out-of-range one. Categories are computed on
 * first use, so registering 39 languages costs nothing at boot.
 */
export const pluralRuleFor = (bcp47: string) => {
  let rules: Intl.PluralRules | null | undefined
  let cats: string[] = []
  return (choice: number, choicesLength: number): number => {
    if (rules === undefined) {
      try {
        rules = new Intl.PluralRules(bcp47)
        cats = pluralCategoriesFor(bcp47)
      } catch {
        rules = null
      }
    }
    const n = Math.abs(choice)
    if (rules && cats.length > 1) {
      if (choicesLength === cats.length) return Math.max(0, cats.indexOf(rules.select(n)))
      if (choicesLength === cats.length + 1) return n === 0 ? 0 : 1 + Math.max(0, cats.indexOf(rules.select(n)))
    }
    if (choicesLength === 2) return n === 1 ? 0 : 1
    return Math.min(n === 0 ? 0 : n === 1 ? 1 : 2, choicesLength - 1)
  }
}

// ─── Picker order ─────────────────────────────────────────────────────────────

const SCRIPT_ORDER: readonly ScriptBucket[] = [
  'latin', 'latin-ext', 'greek', 'cyrillic', 'arabic', 'devanagari', 'thai', 'cjk-jp', 'cjk-kr', 'cjk-sc', 'cjk-tc'
]
const scriptRank = (s: ScriptBucket): number => (s === 'latin-ext' ? 0 : SCRIPT_ORDER.indexOf(s))

/**
 * Display order for the language picker: Latin-script autonyms alphabetically
 * (diacritics ignored, so Čeština sits with C), then Greek, Cyrillic, Arabic,
 * Devanagari, Thai, then CJK. Matches how players scan a long list — by the
 * name of their own language.
 */
export const pickerOrder = (codes: readonly string[]): LanguageInfo[] => {
  const collator = new Intl.Collator('en', { sensitivity: 'base' })
  return codes
    .map((c) => LANGUAGE_BY_CODE[c])
    .filter((l): l is LanguageInfo => !!l)
    .sort((a, b) => scriptRank(a.script) - scriptRank(b.script) || collator.compare(a.native, b.native))
}
