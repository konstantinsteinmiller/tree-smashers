<script setup lang="ts">
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
</script>

<template lang="pug">
  div.flex.flex-col.items-end.gap-1
    button.p-2.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer(
      class="bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMute"
    )
      span.text-2xl {{ isMuted ? '🔇': '🔊' }}
</template>

<style scoped lang="sass">

</style>