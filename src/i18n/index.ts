import type { I18n } from 'vue-i18n'
import { LANGUAGES } from '@/utils/enums'

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

/** In-memory cache so repeat `loadLocale` calls don't re-import. */
const localeCache = new Map<string, Record<string, unknown>>()
/** Shared in-flight promises so concurrent calls coalesce. */
const localeInFlight = new Map<string, Promise<Record<string, unknown>>>()

const pathFor = (code: string) => `./locales/${code}.ts`

export const isSupportedLocale = (code: string | null | undefined): code is string =>
  !!code && LANGUAGES.includes(code)

/**
 * Our internal locale codes are not all valid BCP-47 tags — the project uses
 * `jp` for Japanese and `kr` for Korean (the correct tags are `ja` / `ko`).
 * `<html lang>` is consumed by screen readers and by the browser's own font
 * fallback / line-breaking machinery, so it has to carry the real tag.
 */
const BCP47: Record<string, string> = {
  zh: 'zh-Hans',
  jp: 'ja',
  kr: 'ko'
}

/**
 * Mirror the active locale onto the document element.
 *
 *   • `lang`        — BCP-47, for a11y + the browser's CJK font/line-break
 *                     heuristics (Han glyph shaping differs between
 *                     zh-Hans / ja / ko and the browser needs the hint).
 *   • `data-locale` — our raw internal code, which the CJK typography
 *                     corrections in `assets/css/fonts.sass` key off.
 *
 * Called from `setI18nLocale` (every runtime switch) and once from `main.ts`
 * for the boot locale, so the very first paint is already correct.
 */
export const applyDocumentLocale = (code: string): void => {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.setAttribute('lang', BCP47[code] ?? code)
  el.setAttribute('data-locale', code)
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
 *   3. navigator.language short code — no portal, no stored choice.
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
  const nav = typeof navigator !== 'undefined'
    ? navigator.language?.split('-')[0]
    : undefined
  if (isSupportedLocale(nav)) return nav
  return 'en'
}
