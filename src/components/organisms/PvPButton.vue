<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineEmits<{
  (e: 'click'): void
}>()
</script>

<template lang="pug">
  //- Royal HUD square with a berry "fight" ring (inset), so the one
  //- player-vs-player door reads as a challenge among the neutral buttons.
  //- The inner ui-btn sinks on press (global press handler).
  button.pointer-events-auto.group.cursor-pointer.z-10(
    class="scale-80 sm:scale-100"
    :aria-label="t('pvp.title')"
    @click="$emit('click')"
  )
    div.ui-btn.ui-btn--wood.ui-btn--icon.pvp-btn.relative.flex.items-center.justify-center(class="!p-1.5")
      div.relative.flex.flex-col.items-center(class="w-7 h-7 sm:w-7 sm:h-7" aria-hidden="true")
        |  ⚔️
        //- PvP label
        span.absolute.font-black.ui-outline-sm.whitespace-nowrap(
          class="text-[0.55rem] sm:text-[0.6rem] bottom-0"
        ) {{ t('pvp.short') }}
</template>

<style scoped lang="sass">
// Berry fight ring inside the royal recipe (keeps the lip, band and drop).
.pvp-btn
  box-shadow: inset 0 0 0 2px var(--color-berry-500), inset 0 3px 0 var(--btn-lip), inset 0 calc(-1 * var(--btn-band-h)) 0 var(--btn-band), 0 var(--btn-depth) 0 var(--ui-outline)
</style>
