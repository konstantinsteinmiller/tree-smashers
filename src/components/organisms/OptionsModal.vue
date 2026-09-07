<script setup lang="ts">
import { ref, computed, watch } from 'vue' // Added computed
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSwitch from '@/components/atoms/FSwitch.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { DIFFICULTY, LANGUAGES } from '@/utils/enums' // Import LANGUAGES
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
import resetAllProgress from '@/use/useResetProgress'
import { qualityPreference, qualityTier, setQualityPreference } from '@/use/useQuality'

const props = defineProps<{
  isOpen: boolean
}>()

// Explicit CrazyGames `gameplayStop` on every Settings open. Mirrors the
// arena's reactive watcher but makes the call-site visible per the CG QA
// request. `stopGameplay()` is idempotent (no-op when SDK inactive or
// already stopped).
watch(() => props.isOpen, (open) => {
  if (open) stopGameplay()
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const { locale }: any = useI18n({ useScope: 'global' })
// main.ts exposes the installed i18n instance on window so runtime
// locale switches (which need `i18n.global.setLocaleMessage`) can
// reach it without prop-drilling.
const appI18n: any = (window as any).__i18n


const {
  setSettingValue,
  userLanguage,
  userDifficulty,
  userSoundVolume,
  userMusicVolume
} = useUser()

const currentTab = ref('general')

// Full-progress reset (stages / coins / upgrades / etc.) — gated behind a
// safety-question modal because it is irreversible. Settings and purchased
// skins survive; see useResetProgress. `resetAllProgress()` wipes the keys,
// flushes to the cloud, then reloads the page — so `isResetting` stays true
// until navigation and keeps the button from being double-fired.
const showResetConfirm = ref(false)
const isResetting = ref(false)
const confirmReset = async () => {
  if (isResetting.value) return
  isResetting.value = true
  await resetAllProgress()
}

watch(userLanguage, async (newValue: string) => {
  // Lazy-load the locale's message chunk before swapping. If the chunk
  // is already cached this is effectively synchronous. setI18nLocale
  // also handles error fallback, so a missing/failed fetch leaves the
  // previous locale untouched rather than rendering raw keys.
  if (appI18n) {
    await setI18nLocale(appI18n, newValue)
  } else {
    // Fallback for the rare case getCurrentInstance returned null —
    // keep the previous behaviour so at minimum the display switches
    // for already-loaded locales.
    locale.value = newValue
  }
})

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const tabs = computed(() => {
    const list = [
      {
        value: 'general', label: t('general'),
        icon: prependBaseUrl('images/icons/settings-icon_128x128.webp')
      },
      {
        value: 'diff', label: t('difficulty'),
        icon: prependBaseUrl('images/icons/difficulty-icon_128x128.webp')
      }
    ]
    return !isMobile.value ? list.concat({
      label: t('audio'),
      value: 'audio',
      icon: prependBaseUrl('images/icons/sound-icon_128x128.webp')
    }) : list
  }
)

// Graphics quality. 'auto' lets the arena's frame-time detector pick the tier
// on this device; the explicit options are an escape hatch for a player who
// wants the cheap look on a device that technically passes, or the full look
// on one that technically fails.
const qualityOptions = computed(() => [
  {
    value: 'auto',
    label: `${t('qualityAuto')} (${t(qualityTier.value === 'low' ? 'qualityLow' : 'qualityHigh')})`
  },
  { value: 'high', label: t('qualityHigh') },
  { value: 'low', label: t('qualityLow') }
])

// Map the string array to the Option interface for FSelect
const languagesList = computed(() => {
  return LANGUAGES.map(locale => ({
    value: locale,
    label: `${t(locale)} (${locale})`,
    locale: userLanguage.value
  }))
})

// Removed: showAskResetModal / askReset / doResetProgress. They drove a
// "Reset" button that called the old `resetGameProgress` helper, which
// only touched CardQuest-relic fields (campaign / hand / quest-* /
// skipRulesModal). For chaos-arena it was a no-op — the visible button
// did nothing useful, so the whole flow has been removed alongside the
// useUserDb cleanup.
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t('options')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    //- General Tab
    div(v-if="currentTab === 'general'")
      div(class="flex flex-col gap-2 p-2")
        //- Language Selection
        div(class="z-[10] flex flex-col gap-2 scale-90 sm:scale-100")
          //- The old `!text-[10px] md:text-[12px]` here was dead weight: every
          //- element inside FSelect declares its own font-size, so the class
          //- only ever styled the (empty) root box. Dropped rather than
          //- resized — the sizes now live in FSelect itself.
          FSelect(
            :label="t('language')"
            :options="languagesList"
            :model-value="userLanguage"
            @update:model-value="setSettingValue('language', $event)"
          )

        //- Graphics quality. Device-local (never synced) — a phone's verdict
        //- must not follow the player onto their desktop.
        div(class="z-[9] flex flex-col gap-2 scale-90 sm:scale-100")
          FSelect(
            :label="t('graphicsQuality')"
            :options="qualityOptions"
            :model-value="qualityPreference"
            @update:model-value="setQualityPreference($event)"
          )
          span.game-text(class="text-[0.7rem] md:text-[0.85rem] text-slate-400 text-center px-2") {{ t('graphicsQualityNote') }}

        hr(class="border-slate-600 my-1 md:my-2 pt-0")

        //- Danger zone: wipe all progress (keeps settings + purchased skins).
        //- Guarded by the confirmation modal below.
        div(class="flex flex-col items-center gap-1 scale-90 sm:scale-100")
          FButton(
            color-from="#ff6b6b"
            color-to="#c62828"
            shadow-color="#6b1212"
            @click="showResetConfirm = true"
          ) {{ t('resetCampaign') }}
          span.game-text(class="text-[0.7rem] md:text-[0.85rem] text-slate-400 text-center px-2") {{ t('resetKeepsNote') }}


    //- Difficulty Tab
    div(v-else-if="currentTab === 'diff'")
      div(class="flex flex-col gap-1")
        FButton(
          v-for="difficulty in [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD]"
          :key="difficulty"
          :type="userDifficulty === difficulty ? 'primary' : 'secondary'"
          @click="setSettingValue('difficulty', difficulty)"
        ) {{ t(difficulty) }}
        hr(class="border-slate-600 my-1 md:my-2 pt-0")

    //- Audio Tab
    div(v-else-if="currentTab === 'audio'").flex.flex-col.justify-between.items-center
      FSlider.px-4(class="!py-1 !pb-3 !max-w-[300px]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('soundEffects')" :min="0" :max="1" :step="0.01")
      FSlider.px-4(class="!py-1 !pb-2 !max-w-[300px]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('music')" :min="0" :max="1" :step="0.01")
      hr(class="border-slate-600 my-1 md:my-2 pt-0")

    template(#footer)
      FButton.w-full(@click="emit('close')") {{ t('close') }}

  //- Safety-question modal — confirm before wiping progress. Not closable via
  //- the X so the choice is explicit (Cancel vs Reset).
  FModal(
    :model-value="showResetConfirm"
    :is-closable="false"
    :title="t('resetCampaign')"
    @update:model-value="showResetConfirm = false"
  )
    div(class="flex flex-col gap-2 p-2 max-w-sm mx-auto")
      p.game-text(class="text-sm md:text-base text-white") {{ t('sureResetCampaign') }}
      p.game-text(class="text-[0.85rem] md:text-xs text-slate-300") {{ t('resetKeepsNote') }}
    template(#footer)
      FButton(
        type="secondary"
        :is-disabled="isResetting"
        @click="showResetConfirm = false"
      ) {{ t('cancel') }}
      FButton(
        color-from="#ff6b6b"
        color-to="#c62828"
        shadow-color="#6b1212"
        :is-disabled="isResetting"
        @click="confirmReset"
      ) {{ t('reset') }}
</template>

<style lang="sass" scoped>
.diff-btn
  @apply py-3 px-6 rounded-lg uppercase font-bold transition-all hover:brightness-125

span
  text-shadow: 2px 2px 0 #000
</style>

<i18n lang="yaml">
en:
  options: "Options"
  general: "General"
  difficulty: "Difficulty"
  audio: "Audio"
  language: "Language"
  showRulesModal: "Show Match Rules before game"
  resetCampaign: "Reset Game Progress"
  reset: "Reset"
  sureResetCampaign: "This permanently deletes all your progress — every stage, all your coins and every upgrade. This can't be undone."
  resetKeepsNote: "Your music, language and difficulty settings and all purchased skins are kept."
  cancel: "Cancel"
  audioSettingsPlaceholder: "Audio Settings coming soon..."
  easy: "Novice"
  medium: "Squire"
  hard: "Master"
  close: "Save & Close"
  soundEffects: "Sound Effects"
  music: "Music"
  en: "English"
  de: "German"
  fr: "French"
  es: "Spanish"
  jp: "Japan"
  kr: "Korean"
  zh: "Chinese"
  ru: "Russian"
de:
  options: "Optionen"
  general: "Allgemein"
  difficulty: "Schwierigkeit"
  audio: "Audio"
  language: "Sprache"
  showRulesModal: "Kampfregeln vor dem Spiel anzeigen"
  resetCampaign: "Spielfortschritt zurücksetzen"
  reset: "zurücksetzen"
  sureResetCampaign: "Dies löscht dauerhaft deinen gesamten Fortschritt — jede Stufe, alle Münzen und alle Upgrades. Dies kann nicht rückgängig gemacht werden."
  resetKeepsNote: "Deine Einstellungen für Musik, Sprache und Schwierigkeit sowie alle gekauften Skins bleiben erhalten."
  cancel: "Abbrechen"
  audioSettingsPlaceholder: "Audio-Einstellungen folgen in Kürze..."
  easy: "Anfänger"
  medium: "Knappe"
  hard: "Meister"
  close: "Speichern & Schließen"
  soundEffects: "Soundeffekte"
  music: "Musik"
  en: "Englisch"
  de: "Deutsch"
  fr: "Französisch"
  es: "Spanisch"
  jp: "Japanisch"
  kr: "Koreanisch"
  zh: "Chinesisch"
  ru: "Russisch"
fr:
  options: "Options"
  general: "Général"
  difficulty: "Difficulté"
  audio: "Audio"
  language: "Langue"
  showRulesModal: "Afficher les règles avant le match"
  resetCampaign: "Réinitialiser la progression"
  reset: "Réinitialiser"
  sureResetCampaign: "Cela supprime définitivement toute ta progression — chaque niveau, toutes tes pièces et toutes les améliorations. Action irréversible."
  resetKeepsNote: "Tes réglages de musique, langue et difficulté ainsi que tes skins achetés sont conservés."
  cancel: "Annuler"
  audioSettingsPlaceholder: "Paramètres audio bientôt disponibles..."
  easy: "Novice"
  medium: "Écuyer"
  hard: "Maître"
  close: "Sauvegarder et Fermer"
  soundEffects: "Effets Sonores"
  music: "Musique"
  en: "Anglais"
  de: "Allemand"
  fr: "Français"
  es: "Espagnol"
  jp: "Japonais"
  kr: "Coréen"
  zh: "Chinois"
  ru: "Russe"
es:
  options: "Opciones"
  general: "General"
  difficulty: "Dificultad"
  audio: "Audio"
  language: "Idioma"
  showRulesModal: "Mostrar reglas antes del juego"
  resetCampaign: "Reiniciar progreso del juego"
  reset: "Reiniciar"
  sureResetCampaign: "Esto elimina permanentemente todo tu progreso: cada nivel, todas tus monedas y todas las mejoras. No se puede deshacer."
  resetKeepsNote: "Se conservan tus ajustes de música, idioma y dificultad, y todas las skins compradas."
  cancel: "Cancelar"
  audioSettingsPlaceholder: "Ajustes de audio próximamente..."
  easy: "Novicio"
  medium: "Escudero"
  hard: "Maestro"
  close: "Guardar y Cerrar"
  soundEffects: "Efectos de Sonido"
  music: "Música"
  en: "Inglés"
  de: "Alemán"
  fr: "Francés"
  es: "Español"
  jp: "Japonés"
  kr: "Coreano"
  zh: "Chino"
  ru: "Ruso"
jp:
  options: "オプション"
  general: "全般"
  difficulty: "難易度"
  audio: "オーディオ"
  language: "言語"
  showRulesModal: "対戦前にルールを表示する"
  resetCampaign: "ゲームの進行状況をリセット"
  reset: "リセット"
  sureResetCampaign: "すべての進行状況（全ステージ・すべてのコイン・すべてのアップグレード）が完全に削除されます。この操作は元に戻せません。"
  resetKeepsNote: "音楽・言語・難易度の設定と、購入したすべてのスキンは保持されます。"
  cancel: "キャンセル"
  audioSettingsPlaceholder: "オーディオ設定は近日公開予定..."
  easy: "初級"
  medium: "従騎士"
  hard: "マスター"
  close: "保存して閉じる"
  soundEffects: "効果音"
  music: "音楽"
  en: "英語"
  de: "ドイツ語"
  fr: "フランス語"
  es: "スペイン語"
  jp: "日本語"
  kr: "韓国語"
  zh: "中国語"
  ru: "ロシア語"
kr:
  options: "옵션"
  general: "일반"
  difficulty: "난이도"
  audio: "오디오"
  language: "언어"
  showRulesModal: "경기 전 규칙 표시"
  resetCampaign: "게임 진행 상황 초기화"
  reset: "초기화"
  sureResetCampaign: "모든 진행 상황(전체 스테이지, 모든 코인, 모든 업그레이드)이 영구적으로 삭제됩니다. 되돌릴 수 없습니다."
  resetKeepsNote: "음악, 언어, 난이도 설정과 구매한 모든 스킨은 유지됩니다."
  cancel: "취소"
  audioSettingsPlaceholder: "오디오 설정이 곧 추가될 예정입니다..."
  easy: "초보"
  medium: "종자"
  hard: "마스터"
  close: "저장 후 닫기"
  soundEffects: "음향 효과"
  music: "음악"
  en: "영어"
  de: "독일어"
  fr: "프랑스어"
  es: "스페인어"
  jp: "일본어"
  kr: "한국어"
  zh: "중국어"
  ru: "러시아어"
zh:
  options: "选项"
  general: "常规"
  difficulty: "难度"
  audio: "音频"
  language: "语言"
  showRulesModal: "游戏前显示比赛规则"
  resetCampaign: "重置游戏进度"
  reset: "重置"
  sureResetCampaign: "这将永久删除你的所有进度——每个关卡、所有金币和所有升级。此操作无法撤销。"
  resetKeepsNote: "你的音乐、语言和难度设置以及所有已购买的皮肤都会保留。"
  cancel: "取消"
  audioSettingsPlaceholder: "音频设置即将推出..."
  easy: "新手"
  medium: "侍从"
  hard: "大师"
  close: "保存并关闭"
  soundEffects: "音效"
  music: "音乐"
  en: "英语"
  de: "德语"
  fr: "法语"
  es: "西班牙语"
  jp: "日语"
  kr: "韩语"
  zh: "中文"
  ru: "俄语"
ru:
  options: "Опции"
  general: "Общие"
  difficulty: "Сложность"
  audio: "Аудио"
  language: "Язык"
  showRulesModal: "Показывать правила перед игрой"
  resetCampaign: "Сбросить игровой прогресс"
  reset: "Сброс"
  sureResetCampaign: "Это навсегда удалит весь ваш прогресс — все этапы, все монеты и все улучшения. Отменить нельзя."
  resetKeepsNote: "Ваши настройки музыки, языка и сложности, а также все купленные скины сохранятся."
  cancel: "Отмена"
  audioSettingsPlaceholder: "Настройки звука скоро появятся..."
  easy: "Новичок"
  medium: "Оруженосец"
  hard: "Мастер"
  close: "Сохранить и Закрыть"
  soundEffects: "Звуковые эффекты"
  music: "Музыка"
  en: "Английский"
  de: "Немецкий"
  fr: "Французский"
  es: "Испанский"
  jp: "Японский"
  kr: "Корейский"
  zh: "Китайский"
  ru: "Русский"
</i18n>