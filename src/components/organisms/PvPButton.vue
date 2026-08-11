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
    div.relative
      //- Shadow
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
      //- Body
      div.relative.rounded-lg.border-2.p-2.flex.items-center.justify-center(
        class="bg-gradient-to-b from-[#ff8800] to-[#dd5500] border-[#0f1a30]"
      )
        //- Two crossed swords with PvP label
        div.relative.flex.flex-col.items-center(class="w-7 h-7 sm:w-7 sm:h-7")
          svg.absolute.inset-0(
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            fill="none"
            class="w-full h-full"
          )
          |  ⚔️
          //- PvP label
          span.absolute.font-black.text-white.game-text.uppercase(
            class="text-[0.55rem] sm:text-[0.6rem] bottom-0 tracking-wide"
            style="text-shadow: 0 1px 2px rgba(0,0,0,0.6)"
          ) PvP
</template>
