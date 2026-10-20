/**
 * DEV-ONLY entry for `dev/league.html` — seeds a campaign stage (the season
 * reward scales with it), then mounts the league UI preview with a real
 * vue-i18n instance on MOCKED league state. Never imported by the game: see
 * the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import en from '@/i18n/locales/en'

const loaders = import.meta.glob<Record<string, unknown>>('../i18n/locales/*.ts', { import: 'default' })

const params = new URLSearchParams(location.search)

const boot = async () => {
  localStorage.clear()
  localStorage.setItem('smashers_campaign_stage', String(Number(params.get('stage') ?? 24)))
  localStorage.setItem('smashers_coins', '1200')
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
    messages
  })
  const { default: LeagueUiPreview } = await import('./LeagueUiPreview.vue')
  createApp(LeagueUiPreview).use(i18n).mount('#app')
}

void boot()
