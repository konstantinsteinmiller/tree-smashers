/**
 * DEV-ONLY entry for `dev/skills-ui.html` — seeds a save (stage, coins, skill
 * levels, loadout) into localStorage BEFORE the skill composables load, then
 * mounts the preview with a real vue-i18n instance. Never imported by the
 * game: see the page header.
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import en from '@/i18n/locales/en'

const loaders = import.meta.glob<Record<string, unknown>>('../i18n/locales/*.ts', { import: 'default' })

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'intro'

const seed = () => {
  localStorage.clear()
  const stage = Number(params.get('stage') ?? (scene === 'intro' ? 11 : 36))
  localStorage.setItem('spinner_campaign_stage', String(stage))
  localStorage.setItem('spinner_coins', String(Number(params.get('coins') ?? 240)))
  if (scene !== 'intro') {
    localStorage.setItem('spinner_skills', JSON.stringify({
      v: 1,
      lv: { mirror_plate: 3, phase_step: 10, guard_shell: 1, lucky_edge: 6 }
    }))
    localStorage.setItem('spinner_skill_loadout', JSON.stringify({ v: 1, slots: ['mirror_plate', 'guard_shell'] }))
    localStorage.setItem('spinner_skill_ui', JSON.stringify({
      v: 1,
      seen: [],
      intro: true,
      slot2Seen: true,
      filled: 2
    }))
  }
}

const boot = async () => {
  seed()
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
  const { default: SkillsUiPreview } = await import('./SkillsUiPreview.vue')
  createApp(SkillsUiPreview).use(i18n).mount('#app')
}

void boot()
