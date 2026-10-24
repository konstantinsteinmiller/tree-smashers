/**
 * DEV-ONLY entry for `dev/ui-kit.html` — mounts the UI kit sheet with a real
 * vue-i18n instance (English) so components that read copy render as in the
 * game. Never imported by the game: see the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import en from '@/i18n/locales/en'

const boot = async () => {
  try {
    localStorage.clear()
    // Silent sheet: no UI ticks while the harness forces states.
    localStorage.setItem('smashers_user_sound_volume', '0')
  } catch { /* private mode */ }
  // useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle).
  await import('@/use/useUser')
  const messages: Record<string, Record<string, unknown>> = { en: en as Record<string, unknown> }
  const locale: string = 'en'
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: messages as never
  })
  const { default: UiKitPage } = await import('./UiKitPage.vue')
  createApp(UiKitPage).use(i18n).mount('#app')
}

void boot()
