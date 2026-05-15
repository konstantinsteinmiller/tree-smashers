<script setup lang="ts">
import { useI18n } from 'vue-i18n'

interface Props {
  textKey: string
}

defineProps<Props>()

const { t } = useI18n()
</script>

<template lang="pug">
  //- `pointer-events-auto` re-enables interaction inside the wrapper (which
  //- is set to `pointer-events-none` so taps on its dead space still bubble
  //- to the reward overlay's continue handler). The badge itself stays
  //- clickable so it can dismiss the overlay too.
  div.tip-badge.relative.flex.items-start.gap-3.rounded-2xl.px-4.py-3.pointer-events-auto(
    class="max-w-[90vw] sm:max-w-[420px]"
  )
    //- Glowing star icon — same yellow as the coin reward to read as
    //- a premium hint, not a generic toast.
    div.tip-star.shrink-0.flex.items-center.justify-center.rounded-full(
      class="w-8 h-8 sm:w-9 sm:h-9"
    )
      svg.w-5.h-5(
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      )
        path(d="M12 2l2.39 6.96H22l-5.81 4.22L18.18 22 12 17.77 5.82 22l1.99-8.82L2 8.96h7.61L12 2z")

    //- Tip body — game-text style matches the reward overlay copy.
    span.tip-text.text-white.font-bold.leading-snug.game-text(
      class="text-sm sm:text-base"
    ) {{ t(textKey) }}
</template>

<style scoped lang="sass">
.tip-badge
  background: linear-gradient(to bottom, #1f3b78, #112555)
  border: 2px solid #ffcd00
  box-shadow: 0 4px 0 #0a142e, 0 0 18px rgba(255, 205, 0, 0.35)
  animation: tip-pop 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28)

.tip-star
  background: linear-gradient(to bottom, #ffe066, #f7a000)
  color: #fff8d0
  border: 2px solid #0f1a30
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25)

.tip-text
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.game-text
  font-family: inherit

@keyframes tip-pop
  0%
    transform: scale(0.85) translateY(8px)
    opacity: 0
  100%
    transform: scale(1) translateY(0)
    opacity: 1
</style>
