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

      //- Defensive scroll. The reward overlay is centred and unbounded, so
      //- anything taller than the viewport (the roulette wheel plus its
      //- buttons on a short landscape screen, a skin-reward column, or simply
      //- a locale whose result text wraps to more lines than English) used to
      //- be clipped with no way to reach it. `overscroll-contain` keeps a
      //- fling inside the overlay, and a scroll gesture does not synthesise
      //- the click that drives tap-to-continue.
      div.reward-body.relative.w-full.flex.flex-col.items-center.justify-center
        slot

      //- The tap-to-continue prompt is a normal flex child, NOT an absolutely
      //- positioned strip pinned to the bottom.
      //-
      //- As an absolute element it took no part in layout, so on a short
      //- landscape viewport it printed straight over the tip badge — two
      //- lines of Chinese stacked on top of each other. In flow, the body
      //- above it (`flex: 1`) simply gets less room and scrolls, and the two
      //- can never occupy the same pixels.
      Transition(name="fade")
        div.shrink-0.w-full.flex.justify-center.animate-pulse.pointer-events-none(
          v-if="showContinue"
          class="mt-3 pb-1 sm:mt-5"
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

// `flex: 1 1 auto` + `min-height: 0`, NOT `h-full`.
//
// `h-full` resolved against the OVERLAY's height, so the body claimed the
// full screen even though the ribbon above it had already taken ~180px of a
// 390px landscape viewport. Everything below was pushed off the bottom. As a
// flex item it takes exactly the space the ribbon and the continue prompt
// leave over, and scrolls anything that still doesn't fit (a roulette wheel
// plus its buttons, a skin-reward column, or a locale whose result text wraps
// to more lines than English).
.reward-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  overflow-x: hidden
  overscroll-behavior: contain
  // `safe center` instead of the plain `center` from the utility class.
  // A centred flex column that overflows its scroll container pushes content
  // past the START edge, where scrolling cannot reach it — the result text
  // ("YOU LOSE") disappeared behind the ribbon on a 390px-tall landscape
  // screen. `safe` degrades to flex-start exactly when overflow would occur
  // and behaves like `center` the rest of the time.
  justify-content: safe center
  // Hidden scrollbar: this is a celebration screen, and a scrollbar would
  // read as chrome. The content is short enough that a fling reveals it.
  scrollbar-width: none

  &::-webkit-scrollbar
    display: none

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

// Short landscape: the parchment is 553x188, so a 400px-wide ribbon is ~136px
// tall — over a third of a 390px viewport, before the result text, the reward
// row and the tip badge have had any. Capped tighter here so the actual
// reward has room; the ribbon is decoration and reads fine smaller.
@media (orientation: landscape) and (max-height: 500px)
  .ribbon-wrap
    width: 40vw
    max-width: 300px

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
