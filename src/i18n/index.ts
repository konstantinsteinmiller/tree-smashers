import type { I18n } from 'vue-i18n'
import { LANGUAGE_BY_CODE, LANGUAGE_REGISTRY, normalizeLocaleTag, pluralRuleFor } from './languages'

/**
 * Locale loader — lazy, code-split, cache-safe.
 *
 * Every file under `./locales/*.ts` is registered with Vite as a
 * dynamic import, which makes each locale its own chunk. The selected
 * locale is fetched on demand; the rest stay out of the critical path.
 *
 * The `{ import: 'default' }` option tells Vite to unwrap the module's
 * default export automatically so callers get the raw messages object.
 */
const localeLoaders = import.meta.glob<Record<string, unknown>>(
  './locales/*.ts',
  { import: 'default' }
)

/**
 * Every locale we actually ship: registry order, filtered to the codes that
 * have a `./locales/<code>.ts` file. The glob's KEYS are known at build time
 * and cost nothing to read — no locale chunk is fetched to compute this.
 *
 * This is the single source of truth behind `LANGUAGES` (`@/utils/enums`
 * re-exports it): adding a translation is "drop in the file", and a registry
 * entry without a file simply is not offered yet.
 */
export const SHIPPED_LOCALES: string[] = (() => {
  const files = new Set(
    Object.keys(localeLoaders).map((p) => p.replace(/^\.\/locales\//, '').replace(/\.ts$/, ''))
  )
  return LANGUAGE_REGISTRY.filter((l) => files.has(l.code)).map((l) => l.code)
})()

/**
 * Raw portal / browser language tag → a SHIPPED internal code, or null.
 * Wraps `normalizeLocaleTag` with the shipped set so no caller can forget it.
 * Handles region + script variants (`pt-BR` / `pt-PT`, `zh-Hant` / `zh-TW` /
 * `zh-HK`), ISO 639-2 three-letter codes and legacy aliases (`ja` → `jp`).
 */
export const toShippedLocale = (raw: string | null | undefined): string | null =>
  normalizeLocaleTag(raw, SHIPPED_LOCALES)

/**
 * vue-i18n `pluralRules` for every shipped locale (see `pluralRuleFor`).
 * Passed to `createI18n` in `main.ts`.
 */
export const buildPluralRules = (): Record<string, (choice: number, choicesLength: number) => number> =>
  Object.fromEntries(SHIPPED_LOCALES.map((code) => [code, pluralRuleFor(LANGUAGE_BY_CODE[code]!.bcp47)]))

/** In-memory cache so repeat `loadLocale` calls don't re-import. */
const localeCache = new Map<string, Record<string, unknown>>()
/** Shared in-flight promises so concurrent calls coalesce. */
const localeInFlight = new Map<string, Promise<Record<string, unknown>>>()

const pathFor = (code: string) => `./locales/${code}.ts`

export const isSupportedLocale = (code: string | null | undefined): code is string =>
  !!code && SHIPPED_LOCALES.includes(code)

/**
 * Mirror the active locale onto the document element.
 *
 *   • `lang`        — real BCP-47 (`ja` / `ko` / `zh-Hans` / `zh-Hant` for our
 *                     legacy `jp` / `kr` / `zh` / `zh-TW`). Screen readers use
 *                     it, and so does the browser: Han glyph variants
 *                     (zh-Hans / zh-Hant / ja differ), Thai line breaking, and
 *                     language-sensitive `text-transform: uppercase` (Turkish
 *                     and Azerbaijani dotted İ, Greek accent removal,
 *                     Lithuanian) all key off it.
 *   • `data-locale` — our raw internal code.
 *   • `data-script` — the font / typography bucket (`latin`, `latin-ext`,
 *                     `cyrillic`, `greek`, `arabic`, `devanagari`, `thai`,
 *                     `cjk-sc|tc|jp|kr`). `assets/css/fonts.sass` swaps the
 *                     `--font-game` stack and the Latin-display corrections
 *                     (italic, uppercase, tracking) off it.
 *   • `data-dir`    — `rtl` for Arabic. Deliberately NOT the `dir` attribute:
 *                     `dir="rtl"` on <html> mirrors every flex row, margin and
 *                     scrollbar of a layout that was built LTR. We keep the
 *                     layout and the HUD LTR and let each text box take its
 *                     own direction from its content instead (see the
 *                     `data-dir` block in `fonts.sass`).
 *
 * Called from `setI18nLocale` (every runtime switch) and once from `main.ts`
 * for the boot locale, so the very first paint is already correct.
 */
export const applyDocumentLocale = (code: string): void => {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const info = LANGUAGE_BY_CODE[code]
  el.setAttribute('lang', info?.bcp47 ?? code)
  el.setAttribute('data-locale', code)
  el.setAttribute('data-script', info?.script ?? 'latin')
  el.setAttribute('data-dir', info?.dir ?? 'ltr')
}

/**
 * Dynamically load a single locale's message bundle. Safe to call for
 * already-loaded locales (returns the cached object immediately).
 * Throws if the locale file is missing so callers can fall back to `en`.
 */
export const loadLocaleMessages = async (
  code: string
): Promise<Record<string, unknown>> => {
  const cached = localeCache.get(code)
  if (cached) return cached

  const inflight = localeInFlight.get(code)
  if (inflight) return inflight

  const loader = localeLoaders[pathFor(code)]
  if (!loader) throw new Error(`[i18n] no locale file for "${code}"`)

  const promise = loader().then((msgs) => {
    const resolved = (msgs ?? {}) as Record<string, unknown>
    localeCache.set(code, resolved)
    localeInFlight.delete(code)
    return resolved
  })
  localeInFlight.set(code, promise)
  return promise
}

/**
 * Ensure a locale is registered with the given i18n instance and switch to
 * it. Designed to be called from UI code (OptionsModal language dropdown,
 * CrazyGames locale sync, etc.) — it will no-op if the locale is already
 * the active one and messages are already present.
 *
 * On load failure, the promise resolves *without* switching so the UI
 * keeps rendering the previously active locale.
 */
export const setI18nLocale = async (
  i18n: I18n<any, any, any, string, false>,
  code: string
): Promise<void> => {
  const target = isSupportedLocale(code) ? code : 'en'
  const g: any = i18n.global
  // Already-loaded locales can switch synchronously.
  if (g.availableLocales.includes(target)) {
    g.locale.value = target
    applyDocumentLocale(target)
    return
  }
  try {
    const msgs = await loadLocaleMessages(target)
    g.setLocaleMessage(target, msgs)
    g.locale.value = target
    applyDocumentLocale(target)
  } catch (e) {
    console.error(`[i18n] failed to load locale "${target}"`, e)
  }
}

/** The one key that holds an EXPLICIT in-game language choice. */
export const LANGUAGE_KEY = 'spinner_user_language'

/**
 * Has the player ever picked a language in OptionsModal?
 *
 * `spinner_user_language` is written by exactly one code path —
 * `setSettingValue('language', …)` behind the OptionsModal dropdown. A
 * portal-reported language is deliberately NEVER persisted there (see the
 * portal-locale block in `main.ts`), so a non-null value here means "the
 * player chose this" and nothing else.
 *
 * That distinction is the fix for the bug Playgama QA hit twice: the old
 * code seeded the portal locale into this key, which made a portal answer
 * indistinguishable from a player choice. Once anything landed in the key,
 * every later load short-circuited on it and the portal language was
 * ignored for good.
 */
export const hasExplicitLanguageChoice = (): boolean => {
  try {
    return isSupportedLocale(localStorage.getItem(LANGUAGE_KEY))
  } catch {
    return false
  }
}

/**
 * Forget the player's stored language choice.
 *
 * Used only when the PLATFORM language actively changes underneath us — at
 * that point the stored choice is stale and the portal is the fresher signal.
 * The removal routes through the patched `localStorage.removeItem`, so the
 * cloud copy is dropped too and other devices don't resurrect it.
 */
export const clearExplicitLanguageChoice = (): void => {
  try {
    localStorage.removeItem(LANGUAGE_KEY)
  } catch { /* ignore */
  }
}

/**
 * Last portal-reported language we observed, so we can tell "the portal is
 * still reporting the same thing" from "the portal actively switched".
 *
 * NOT a `spinner_`/`ca_` key on purpose: those are payload keys that mirror to
 * the cloud, and syncing this marker would make a second device with a
 * different portal language look like a language switch. It is pure
 * device-local bookkeeping.
 */
const PORTAL_LANGUAGE_SEEN_KEY = 'pg_portal_language_seen'

/**
 * Record the portal's current language and report whether it CHANGED since the
 * last load.
 *
 * This is the fix for the case Playgama QA demonstrated: pick English in-game,
 * then flip the platform language to Chinese in the guided testing tools. The
 * stored English choice is legitimately authoritative on every ordinary load —
 * but not when the platform language itself just moved. Returns false on the
 * very first observation (no previous value ⇒ nothing changed), so a returning
 * player's choice is never dropped just because we had not been tracking yet.
 *
 * The marker is not persisted on CrazyGames builds: CG QA's standing rule is
 * "NO locally-saved data" beyond dev toggles. With no marker, CG simply keeps
 * its existing behaviour (stored choice always wins).
 */
export const notePortalLanguageChange = (code: string): boolean => {
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') return false
  try {
    const previous = localStorage.getItem(PORTAL_LANGUAGE_SEEN_KEY)
    if (previous !== code) localStorage.setItem(PORTAL_LANGUAGE_SEEN_KEY, code)
    return isSupportedLocale(previous) && previous !== code
  } catch {
    return false
  }
}

/**
 * Resolve the locale we should boot with, synchronously, before creating
 * the i18n instance so the first dynamic import targets only the right
 * locale file. Resolution order:
 *
 *   1. localStorage `spinner_user_language` — the player's explicit in-game
 *      choice, cloud-hydrated by `SaveManager.init()` before `main.ts`
 *      calls us. It outranks the portal: a player who deliberately picked
 *      Spanish must stay in Spanish on a Chinese-language portal.
 *   2. Caller-supplied `preferred` hint — the portal-reported language
 *      (Playgama Bridge `platform.language`, CrazyGames `systemInfo
 *      .locale`). This is the source language for a first-time player.
 *   3. navigator.languages, first tag we ship (region-aware: `pt-PT`,
 *      `zh-TW`, `nb-NO` all resolve) — no portal, no stored choice.
 *   4. 'en' fallback.
 *
 * Does not touch sessionStorage (CG QA: NO locally-saved data).
 */
export const resolveInitialLocale = (preferred?: string | null): string => {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY)
    if (isSupportedLocale(stored)) return stored
  } catch { /* ignore */
  }
  if (isSupportedLocale(preferred)) return preferred
  if (typeof navigator !== 'undefined') {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of tags) {
      const nav = toShippedLocale(tag)
      if (nav) return nav
    }
  }
  return 'en'
}
