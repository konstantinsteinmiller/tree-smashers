<template lang="pug">
  Transition(name="fade")
    //- Ensure classes with special characters are in parentheses
    div.fixed.inset-0.flex.flex-col.items-center.justify-center.backdrop-blur-md.p-4.touch-none.cursor-pointer(
      v-if="modelValue"
      class="z-[100] bg-black/60"
      :style="{\
        paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
        paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
      }"
      @click="handleOverlayClick"
    )
      //- Parchment ribbon header
      div.ribbon-wrap.relative.mb-10(
        v-if="$slots.ribbon"
        class=""
        :class="{ '!mb-2 -mt-2': isMobileLandscape, 'is-desktop': !isMobileLandscape && !isMobilePortrait }"
      )
        img.ribbon-img.-mb-6(
          src="/images/bg/parchment-ribbon_553x188.webp"
          alt="ribbon-image"
          draggable="false"
          :class="{ '-mt-1': isMobilePortrait }"
        )
        div.ribbon-content
          slot(name="ribbon")
            span.text-white.font-black.uppercase.italic.game-text {{ t('spinner.rewards') }}

      div.relative.w-full.h-full.flex.flex-col.items-center.justify-center
        slot

      Transition(name="fade")
        div.absolute.bottom-8.left-0.right-0.flex.justify-center.animate-pulse.pointer-events-none(
          v-if="showContinue"
          class="sm:bottom-12"
        )
          div.text-sm.text-center.text-white.font-black.uppercase.italic.tracking-widest.brawl-text(class="md:text-2xl")
            | {{ isMobile ? t('tapToContinue') : t('clickToContinue') }}
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'

const props = defineProps<{
  modelValue: boolean
  showContinue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'continue'): void
}>()

const { t } = useI18n()
const slots = useSlots()

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const handleOverlayClick = () => {
  if (props.showContinue) emit('continue')
}
</script>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

// ─── Parchment ribbon ────────────────────────────────────────────────────────

.ribbon-wrap
  position: relative
  width: 90vw
  max-width: 553px

  &.is-desktop
    @media (min-height: 501px)
      width: 70vw
      max-width: 400px

.ribbon-img
  display: block
  width: 100%
  height: auto
  pointer-events: none
  user-select: none

.ribbon-content
  position: absolute
  // Center text in the main body of the ribbon (the wide center block).
  // The ribbon tails extend ~12% on each side; the top/bottom ornamental
  // edges eat ~22% top and ~30% bottom, leaving the sweet spot around center.
  inset: 18% 15% 30% 15%
  display: flex
  align-items: center
  justify-content: center
  text-align: center

@media (orientation: landscape) and (max-height: 500px)
  .ribbon-wrap
    width: 50vw
    max-width: 400px

// Short but not landscape-mobile (e.g. CG iframe in landscape with the
// portal chrome bar visible — ~700–860 px viewport). The default desktop
// ribbon (max 400 px wide → ~136 px tall) eats too much vertical room
// here, leaving no space for the result text + wheel + spin-again
// buttons. Cap it tighter so the roulette overlay's chrome fits the
// viewport. CG QA caught the overflow 2026-05-05.
@media (orientation: landscape) and (min-height: 501px) and (max-height: 860px)
  .ribbon-wrap.is-desktop
    width: 50vw
    max-width: 320px

</style>
