<script setup lang="ts">
// Two-purpose corner banner:
//   1. Offline mode — when the strategy is in failed-retrying / failed-final,
//      tell the player their progress is saved locally but cloud is paused,
//      and offer a "Retry" button.
//   2. Conflict-merge bonus — when a hydrate detected a higher cloud save
//      and we restored it, show the bonus coins so the loss-of-local feels
//      like a gain instead of a punishment. Auto-dismisses after a few sec.
//
// Tap-to-dismiss for both states. Mounted from App.vue.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import {
  acknowledgeBonus,
  bonusCoinsAwarded,
  hasBonusToShow,
  isOfflineMode,
  retryInFlight,
  retrySync
} from '@/use/useSaveStatus'

const { t } = useSfcI18n('SaveStatusBanner')

const dismissed = ref(false)

const offlineDismissed = ref(false)
watch(isOfflineMode, (on) => {
  if (!on) offlineDismissed.value = false
})

// Auto-dismiss the bonus after 6 seconds so it doesn't linger forever.
let bonusTimer: ReturnType<typeof setTimeout> | null = null
watch(bonusCoinsAwarded, (n) => {
  if (n > 0) {
    if (bonusTimer) clearTimeout(bonusTimer)
    bonusTimer = setTimeout(() => acknowledgeBonus(), 6_000)
  }
})
onUnmounted(() => {
  if (bonusTimer) clearTimeout(bonusTimer)
})

const showOffline = computed(() => isOfflineMode.value && !offlineDismissed.value)
const showBonus = computed(() => hasBonusToShow.value && !dismissed.value)

const onRetry = async (e: Event) => {
  e.stopPropagation()
  await retrySync()
}

const onDismissOffline = () => {
  offlineDismissed.value = true
}
const onDismissBonus = () => {
  acknowledgeBonus()
  dismissed.value = true
}

// Reset per-show dismiss flag so a future bonus can show again.
watch(hasBonusToShow, (on) => {
  if (on) dismissed.value = false
})
</script>

<template lang="pug">
  div.fixed.left-2.right-2.z-40.pointer-events-none(class="bottom-2 sm:left-auto sm:right-4 sm:max-w-sm")
    //- Bonus banner — leaf / celebratory
    div.save-banner.is-bonus.pointer-events-auto.text-sm.flex.items-center.gap-3.cursor-pointer(
      v-if="showBonus"
      class="px-3 py-2 mb-2"
      @click="onDismissBonus"
    )
      span.text-xl 🎉
      div.flex-1
        div.font-black.ui-outline-sm {{ t('save.restoredTitle') }}
        div.text-xs.font-extrabold.ui-outline-sm {{ t('save.restoredBonus', { n: bonusCoinsAwarded }) }}
      span.text-xs.font-extrabold.ui-outline-sm {{ t('save.tap') }}

    //- Offline banner — wood / informational
    div.save-banner.is-offline.pointer-events-auto.text-sm.flex.items-center.gap-3(
      v-else-if="showOffline"
      class="px-3 py-2"
    )
      span.text-xl ☁️
      div.flex-1
        div.font-black.ui-outline-sm {{ t('save.offlineTitle') }}
        div.text-xs.font-extrabold.ui-outline-sm {{ t('save.offlineBody') }}
      button.ui-btn.ui-btn--secondary.text-xs(
        type="button"
        class="!px-3 !py-1"
        :disabled="retryInFlight"
        @click="onRetry"
      ) {{ retryInFlight ? '…' : t('save.retry') }}
      button.ui-btn.ui-btn--danger.ui-btn--icon.text-lg(
        type="button"
        class="!min-h-[2.75rem] !min-w-[2.75rem] leading-none"
        @click="onDismissOffline"
        :aria-label="t('save.dismiss')"
      ) ×
</template>

<style scoped lang="sass">
// Banners sit on the arena: a flat plate with a two-tone facet, an ink outline
// and a hard 0-blur drop, sliding up with a little overshoot. Bonus = leaf
// (celebratory), offline = royal (informational).
.save-banner
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  color: var(--color-ice-50)
  background-image: var(--ui-facet)
  animation: save-banner-in 0.4s cubic-bezier(0.2, 1.5, 0.4, 1) both
  &.is-bonus
    background-color: var(--color-leaf-500)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -4px 0 var(--color-leaf-700), 0 4px 0 var(--color-ink)
  &.is-offline
    background-color: var(--color-royal-600)
    box-shadow: inset 0 3px 0 var(--color-royal-400), inset 0 -4px 0 var(--color-royal-800), 0 4px 0 var(--color-ink)

@keyframes save-banner-in
  0%
    transform: translateY(120%) rotate(-2deg)
    opacity: 0
  100%
    transform: none
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .save-banner
    animation: none
</style>
