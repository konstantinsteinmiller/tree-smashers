import { useI18n } from 'vue-i18n'

/**
 * Component-scoped copy — one mechanism for every shipped locale.
 *
 * ── Where the copy lives ──
 *
 * Components used to carry their own SFC `<i18n>` block. Those blocks are
 * compiled INTO the component's chunk, so every language's copy shipped in
 * the first-load bundle whether the player read it or not. All of it now lives
 * in the lazy per-locale files instead, under `sfc.<ComponentName>`:
 *
 *     // src/i18n/locales/de.ts
 *     export default {
 *       …global keys…,
 *       sfc: {
 *         OptionsModal: { language: 'Sprache', … },
 *         BattlePass:   { … }
 *       }
 *     }
 *
 * `en.ts` is the source of truth for the key set; `tests/i18nParity.test.ts`
 * holds every other locale to it. Only the active locale and the `en`
 * fallback are ever fetched (`loadLocaleMessages` in `./index.ts`).
 *
 * ── How a component reads it ──
 *
 *     const { t } = useSfcI18n('OptionsModal')
 *     t('language')        // → sfc.OptionsModal.language
 *     t('skins.' + id)     // → global `skins.<id>` (not in the namespace)
 *
 * `t(key)` resolves `sfc.<ns>.<key>` when the English source defines it, and
 * the plain global `key` otherwise — the same "own copy first, then global"
 * order the old component-local composer had. The lookup goes through the
 * GLOBAL composer, so the usual `active locale → en` fallback applies.
 *
 * `<i18n-t>` does NOT go through this helper: give it the full path and the
 * global scope, e.g.
 *     i18n-t(keypath="sfc.AdsBlockedModal.adsBlocked.allowHost" scope="global")
 * (never `scope="local"` — see `tests/i18nSfcScope.test.ts`).
 */
export const useSfcI18n = (ns: string) => {
  const composer = useI18n({ useScope: 'global' })
  const prefix = `sfc.${ns}.`
  const t = (key: string, ...args: any[]): string => {
    const full = prefix + key
    return (composer.t as any)(composer.te(full, 'en') ? full : key, ...args)
  }
  // `locale`: the active global locale, for number formatting next to `t`.
  return { t, locale: composer.locale }
}
