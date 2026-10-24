/**
 * DEV-ONLY entry for `dev/ui-screens.html` (#UX1c) — mounts one composite
 * screen (`?screen=`) from the real components with a real vue-i18n instance.
 * Never imported by the game: see the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import en from '@/i18n/locales/en'

const loaders = import.meta.glob<Record<string, unknown>>('../i18n/locales/*.ts', { import: 'default' })

const boot = async () => {
  const params = new URLSearchParams(location.search)
  try {
    localStorage.clear()
    localStorage.setItem('smashers_user_sound_volume', '0')
    localStorage.setItem('smashers_coins', '1200')
  } catch { /* private mode */ }
  // useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle).
  await import('@/use/useUser')
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
  const { default: UiScreensPage } = await import('./UiScreensPage.vue')
  createApp(UiScreensPage).use(i18n).mount('#app')
}

void boot()
