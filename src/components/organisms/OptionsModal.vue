<script setup lang="ts">
import { ref, computed, watch } from 'vue' // Added computed
import { useI18n } from 'vue-i18n'
import { useSfcI18n } from '@/i18n/sfc'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSwitch from '@/components/atoms/FSwitch.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import FLanguagePicker from '@/components/molecules/FLanguagePicker.vue'
import { DIFFICULTY, LANGUAGES } from '@/utils/enums'
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
import resetAllProgress from '@/use/useResetProgress'
import { qualityPreference, qualityTier, setQualityPreference } from '@/use/useQuality'
import { isNative } from '@/use/useUser'
import { privacyOptionsRequired, showPrivacyOptions } from '@/use/useAds'
import { openExternal } from '@/utils/openExternal'

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

const { t } = useSfcI18n('OptionsModal')
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
// skins survive; see useResetProgress.
//
// `resetAllProgress()` wipes the keys and refreshes every save-backed ref
// in place, so the menu behind this modal is already showing stage 1 by
// the time the await resolves — no reload. The await itself is the cloud
// flush, which is why we close only afterwards: on a portal build that is
// the round-trip that makes the reset stick on the remote, and the player
// should not be able to start a battle on top of an in-flight delete.
// `isResetting` gates re-entry for that window.
const showResetConfirm = ref(false)
const isResetting = ref(false)
const confirmReset = async () => {
  if (isResetting.value) return
  isResetting.value = true
  try {
    await resetAllProgress()
  } finally {
    isResetting.value = false
    showResetConfirm.value = false
    emit('close')
  }
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


// ─── Privacy (native builds) ──────────────────────────────────────────────
// Google Play wants the privacy policy reachable from inside the app, not only
// from the store listing. "Privacy settings" reopens the ad-consent form; it
// appears only where the consent platform asked for it (GDPR regions).
const privacyPolicyUrl: string = import.meta.env.VITE_APP_PRIVACY_POLICY_URL ?? ''
const showPrivacyLinks = computed(() => isNative && (!!privacyPolicyUrl || privacyOptionsRequired.value))
const openPrivacyPolicy = () => {
  if (privacyPolicyUrl) void openExternal(privacyPolicyUrl)
}

// Removed: showAskResetModal / askReset / doResetProgress. They drove a
// "Reset" button that called the old `resetGameProgress` helper, which
// only touched CardQuest-relic fields (campaign / hand / quest-* /
// skipRulesModal). For tree-smashers it was a no-op — the visible button
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
          //- A grid-in-a-modal rather than FSelect's dropdown: 25+ languages
          //- do not fit a dropdown on a landscape phone. Entries are autonyms,
          //- so the list itself needs no translation.
          FLanguagePicker(
            :label="t('language')"
            :codes="LANGUAGES"
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
          span(class="ui-body text-[0.7rem] md:text-[0.85rem] text-center px-2") {{ t('graphicsQualityNote') }}

        hr(class="border-t-2 border-dashed border-wood-300 my-1 md:my-2 pt-0")

        //- Privacy policy + ad-consent choice (native builds only).
        div(v-if="showPrivacyLinks" class="flex flex-wrap justify-center gap-2 scale-90 sm:scale-100")
          FButton(
            v-if="privacyPolicyUrl"
            type="secondary"
            @click="openPrivacyPolicy"
          ) {{ t('privacyPolicy') }}
          FButton(
            v-if="privacyOptionsRequired"
            type="secondary"
            @click="showPrivacyOptions"
          ) {{ t('privacySettings') }}

        hr(v-if="showPrivacyLinks" class="border-t-2 border-dashed border-wood-300 my-1 md:my-2 pt-0")

        //- Danger zone: wipe all progress (keeps settings + purchased skins).
        //- Guarded by the confirmation modal below.
        div(class="flex flex-col items-center gap-1 scale-90 sm:scale-100")
          FButton(
            tone="danger"
            @click="showResetConfirm = true"
          ) {{ t('resetCampaign') }}
          span(class="ui-body text-[0.7rem] md:text-[0.85rem] text-center px-2") {{ t('resetKeepsNote') }}


    //- Difficulty Tab
    div(v-else-if="currentTab === 'diff'")
      div(class="flex flex-col gap-1")
        FButton(
          v-for="difficulty in [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD]"
          :key="difficulty"
          :type="userDifficulty === difficulty ? 'primary' : 'secondary'"
          @click="setSettingValue('difficulty', difficulty)"
        ) {{ t(difficulty) }}
        hr(class="border-t-2 border-dashed border-wood-300 my-1 md:my-2 pt-0")

    //- Audio Tab
    div(v-else-if="currentTab === 'audio'").flex.flex-col.justify-between.items-center
      FSlider.px-4(class="!py-1 !pb-3 !max-w-[300px]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('soundEffects')" :min="0" :max="1" :step="0.01")
      FSlider.px-4(class="!py-1 !pb-2 !max-w-[300px]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('music')" :min="0" :max="1" :step="0.01")
      hr(class="border-t-2 border-dashed border-wood-300 my-1 md:my-2 pt-0")

    template(#footer)
      FButton.w-full(tone="primary" @click="emit('close')") {{ t('close') }}

  //- Safety-question modal — confirm before wiping progress. Not closable via
  //- the X so the choice is explicit (Cancel vs Reset).
  FModal(
    :model-value="showResetConfirm"
    :is-closable="false"
    :title="t('resetCampaign')"
    @update:model-value="showResetConfirm = false"
  )
    div(class="flex flex-col gap-2 p-2 max-w-sm mx-auto")
      p(class="ui-label text-sm md:text-base text-ink") {{ t('sureResetCampaign') }}
      p(class="ui-body text-[0.85rem] md:text-xs") {{ t('resetKeepsNote') }}
    template(#footer)
      FButton(
        type="secondary"
        :is-disabled="isResetting"
        @click="showResetConfirm = false"
      ) {{ t('cancel') }}
      FButton(
        tone="danger"
        :is-disabled="isResetting"
        @click="confirmReset"
      ) {{ t('reset') }}
</template>

