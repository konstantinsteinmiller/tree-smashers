<script setup lang="ts">
defineEmits<{
  (e: 'click'): void
}>()
</script>

<template lang="pug">
  button.pointer-events-auto.group.cursor-pointer.z-10(
    class="hover:scale-[103%] transition-transform active:scale-90 scale-80 sm:scale-100"
    @click="$emit('click')"
  )
    div.ui-btn.ui-btn--wood.ui-btn--icon.relative.flex.items-center.justify-center(class="!p-1.5")
      div.relative.flex.flex-col.items-center(class="w-7 h-7 sm:w-7 sm:h-7")
        |  ⚔️
        //- PvP label
        span.absolute.font-black.ui-outline-sm(
          class="text-[0.55rem] sm:text-[0.6rem] bottom-0"
        ) PvP
</template>
