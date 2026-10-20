<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
const { t } = useI18n()
</script>

<template lang="pug">
  div.flex.flex-col.items-end.gap-1
    //- Round HUD token, same 3D recipe as every button. Sound on: royal with
    //- a speaker + waves. Muted: berry with a slashed speaker, so the state
    //- reads by colour first. Drawn as SVG (not emoji) so it is crisp and
    //- identical on every platform.
    button.ui-btn.mute-btn.pointer-events-auto(
      type="button"
      :class="isMuted ? 'ui-btn--danger' : 'ui-btn--wood'"
      :aria-label="isMuted ? t('unmute') : t('mute')"
      :aria-pressed="isMuted"
      @click="toggleMute"
    )
      svg.mute-icon(viewBox="0 0 24 24" aria-hidden="true")
        path(d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5z" fill="currentColor" stroke="var(--color-ink)" stroke-width="1.6" stroke-linejoin="round")
        template(v-if="isMuted")
          path(d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round")
        template(v-else)
          path(d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round")
</template>

<style scoped lang="sass">
.mute-btn
  width: 2.75rem
  height: 2.75rem
  min-height: 0
  padding: 0
  border-radius: 999px

.mute-icon
  width: 1.5rem
  height: 1.5rem
  color: var(--color-ice-50)
</style>
