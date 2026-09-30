/**
 * DEV-ONLY entry for `dev/pvp-vs.html` — mounts PvpVsPreview with a real
 * vue-i18n instance. Never imported by the game: see the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import en from '@/i18n/locales/en'

const loaders = import.meta.glob<Record<string, unknown>>('../i18n/locales/*.ts', { import: 'default' })

const boot = async () => {
  await import('@/use/useUser')
  const params = new URLSearchParams(location.search)
  const lang = params.get('lang') ?? 'en'
  const messages: Record<string, Record<string, unknown>> = { en: en as Record<string, unknown> }
  const loader = loaders[`../i18n/locales/${lang}.ts`]
  if (lang !== 'en' && loader) messages[lang] = await loader()
  const i18n = createI18n({
    legacy: false,
    locale: messages[lang] ? lang : 'en',
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: messages as never
  })
  const { default: PvpVsDevPage } = await import('./PvpVsDevPage.vue')
  createApp(PvpVsDevPage).use(i18n).mount('#app')
}

void boot()
