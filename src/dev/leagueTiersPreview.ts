/**
 * DEV-ONLY entry for `dev/league-tiers.html` — mounts the league tier icon
 * preview with a real vue-i18n instance, so the icons' aria-labels read the
 * shipped locale files. Never imported by the game: see the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import en from '@/i18n/locales/en'
import LeagueTiersPreview from './LeagueTiersPreview.vue'

const loaders = import.meta.glob<Record<string, unknown>>('../i18n/locales/*.ts', { import: 'default' })

const boot = async () => {
  const lang = new URLSearchParams(location.search).get('lang') ?? 'en'
  const messages: Record<string, Record<string, unknown>> = { en: en as Record<string, unknown> }
  const loader = loaders[`../i18n/locales/${lang}.ts`]
  if (lang !== 'en' && loader) messages[lang] = await loader()
  const i18n = createI18n({
    legacy: false,
    locale: messages[lang] ? lang : 'en',
    fallbackLocale: 'en',
    messages
  })
  createApp(LeagueTiersPreview).use(i18n).mount('#app')
}

void boot()
