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
import { useI18n } from 'vue-i18n'
import {
  acknowledgeBonus,
  bonusCoinsAwarded,
  hasBonusToShow,
  isOfflineMode,
  retryInFlight,
  retrySync
} from '@/use/useSaveStatus'

const { t } = useI18n()

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
    //- Bonus banner — green / celebratory
    div.pointer-events-auto.rounded-lg.shadow-lg.text-white.text-sm.flex.items-center.gap-3.cursor-pointer(
      v-if="showBonus"
      class="bg-emerald-700/95 px-3 py-2 mb-2"
      @click="onDismissBonus"
    )
      span.text-xl 🎉
      div.flex-1
        div.font-bold {{ t('save.restoredTitle') }}
        div.text-xs(class="text-emerald-100") {{ t('save.restoredBonus', { n: bonusCoinsAwarded }) }}
      span.text-xs(class="text-emerald-100/80") {{ t('save.tap') }}

    //- Offline banner — amber / informational
    div.pointer-events-auto.rounded-lg.shadow-lg.text-white.text-sm.flex.items-center.gap-3(
      v-else-if="showOffline"
      class="bg-amber-700/95 px-3 py-2"
    )
      span.text-xl ☁️
      div.flex-1
        div.font-bold {{ t('save.offlineTitle') }}
        div.text-xs(class="text-amber-100") {{ t('save.offlineBody') }}
      button.text-xs.font-bold.rounded.bg-white.text-amber-800(
        class="px-2 py-1 disabled:opacity-50"
        :disabled="retryInFlight"
        @click="onRetry"
      ) {{ retryInFlight ? '…' : t('save.retry') }}
      button.text-lg.font-bold.px-1(
        class="text-amber-100/80"
        @click="onDismissOffline"
        :aria-label="t('save.dismiss')"
      ) ×
</template>

<i18n lang="yaml">
en:
  save:
    restoredTitle: "Cloud save restored"
    restoredBonus: "+{n} bonus coins for the recovery"
    tap: "tap"
    offlineTitle: "Cloud sync paused"
    offlineBody: "Playing offline. Your progress is saved here."
    retry: "Retry"
    dismiss: "Dismiss"
de:
  save:
    restoredTitle: "Cloud-Speicherstand wiederhergestellt"
    restoredBonus: "+{n} Bonusmünzen für die Wiederherstellung"
    tap: "tippen"
    offlineTitle: "Cloud-Sync pausiert"
    offlineBody: "Du spielst offline. Dein Fortschritt wird hier gespeichert."
    retry: "Erneut"
    dismiss: "Schließen"
fr:
  save:
    restoredTitle: "Sauvegarde cloud restaurée"
    restoredBonus: "+{n} pièces bonus pour la récupération"
    tap: "toucher"
    offlineTitle: "Synchronisation cloud en pause"
    offlineBody: "Tu joues hors ligne. Ta progression est enregistrée ici."
    retry: "Réessayer"
    dismiss: "Fermer"
es:
  save:
    restoredTitle: "Partida en la nube restaurada"
    restoredBonus: "+{n} monedas de bonificación por la recuperación"
    tap: "toca"
    offlineTitle: "Sincronización en la nube en pausa"
    offlineBody: "Estás jugando sin conexión. Tu progreso se guarda aquí."
    retry: "Reintentar"
    dismiss: "Cerrar"
jp:
  save:
    restoredTitle: "クラウドセーブを復元しました"
    restoredBonus: "復元ボーナスとして +{n} コイン"
    tap: "タップ"
    offlineTitle: "クラウド同期を一時停止中"
    offlineBody: "オフラインでプレイ中です。進行状況はこの端末に保存されます。"
    retry: "再試行"
    dismiss: "閉じる"
kr:
  save:
    restoredTitle: "클라우드 저장을 복원했습니다"
    restoredBonus: "복구 보너스로 +{n} 코인"
    tap: "탭"
    offlineTitle: "클라우드 동기화 일시 중지"
    offlineBody: "오프라인으로 플레이 중입니다. 진행 상황은 여기에 저장됩니다."
    retry: "다시 시도"
    dismiss: "닫기"
zh:
  save:
    restoredTitle: "已恢复云端存档"
    restoredBonus: "恢复奖励 +{n} 金币"
    tap: "点击"
    offlineTitle: "云同步已暂停"
    offlineBody: "当前为离线游玩，你的进度会保存在本机。"
    retry: "重试"
    dismiss: "关闭"
ru:
  save:
    restoredTitle: "Облачное сохранение восстановлено"
    restoredBonus: "+{n} бонусных монет за восстановление"
    tap: "нажми"
    offlineTitle: "Облачная синхронизация приостановлена"
    offlineBody: "Вы играете офлайн. Прогресс сохраняется на этом устройстве."
    retry: "Повторить"
    dismiss: "Закрыть"
</i18n>
