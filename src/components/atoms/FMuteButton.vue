<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
const { t } = useI18n()
</script>

<template lang="pug">
  div.flex.flex-col.items-end.gap-1
    //- Round wooden token (HUD), same outline + hard shadow as every button.
    button.ui-btn.ui-btn--wood.mute-btn.pointer-events-auto(
      type="button"
      :aria-label="isMuted ? t('unmute') : t('mute')"
      :aria-pressed="isMuted"
      @click="toggleMute"
    )
      span.text-xl(aria-hidden="true") {{ isMuted ? '🔇': '🔊' }}
</template>

<style scoped lang="sass">
.mute-btn
  width: 2.75rem
  height: 2.75rem
  min-height: 0
  padding: 0
  border-radius: 999px
</style>