<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { playUiSfx } from '@/use/uiSfx'
import FHoldButton from '@/components/atoms/FHoldButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'

const emit = defineEmits<{
  (e: 'surrender'): void
  (e: 'open-change', open: boolean): void
}>()

const { t } = useI18n()
const showConfirm = ref(false)

watch(showConfirm, (open) => {
  playUiSfx(open ? 'open' : 'close')
  emit('open-change', open)
})

const onIconClick = () => {
  showConfirm.value = true
}

const onConfirm = () => {
  showConfirm.value = false
  emit('surrender')
}

const onCancel = () => {
  showConfirm.value = false
}
</script>

<template lang="pug">
  //- Surrender button — white flag icon
  //- Danger tone, deliberately calm: no idle motion (it must not invite taps).
  //- The inner ui-btn sinks on press (global press handler); the flag only
  //- flutters on hover.
  button.surrender-btn.pointer-events-auto.group.cursor-pointer.z-10(
    class="scale-80 sm:scale-100"
    :aria-label="t('spinner.surrender')"
    @click="onIconClick"
  )
    div.relative
      div.ui-btn.ui-btn--danger.ui-btn--icon(class="!p-1.5")
        //- White flag SVG — a pole with a triangular pennant
        svg(
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          class="surrender-flag h-5 w-5 sm:h-6 sm:w-6 text-cream-50 ml-2"
        )
          //- Pole
          line(x1="5" y1="2" x2="5" y2="22" stroke-width="2" stroke-linecap="round")
          //- Flag waving
          path(
            d="M5 3 C8 2 10 5 14 4 L14 4 C14 4 14 12 14 12 C10 13 8 10 5 11"
            stroke-width="1.5"
            fill="currentColor"
            stroke-linejoin="round"
          )

  //- Confirmation modal
  Teleport(to="body")
    Transition(
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 scale-90"
      leave-to-class="opacity-0 scale-90"
    )
      div(
        v-if="showConfirm"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Backdrop
        div(class="absolute inset-0 bg-[var(--ui-backdrop)]" @click="onCancel")

        //- Dialog
        //- Dialog: an ice card that swings in, the question on a berry
        //- skewed tag. Quit = danger, stay = secondary (the calm default).
        div(class="relative ui-panel surrender-dialog px-5 pb-5 pt-12 max-w-sm w-full text-center" role="alertdialog" aria-modal="true")
          //- The white flag sits on the card's top edge in a berry medallion.
          div.surrender-medal(aria-hidden="true")
            svg.surrender-flag(
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              class="h-9 w-9 text-cream-50"
            )
              line(x1="5" y1="2" x2="5" y2="22" stroke-width="2" stroke-linecap="round")
              path(
                d="M5 3 C8 2 10 5 14 4 L14 4 C14 4 14 12 14 12 C10 13 8 10 5 11"
                stroke-width="1.5"
                fill="currentColor"
                stroke-linejoin="round"
              )

          //- Title
          div.ui-tag.ui-tag--berry(class="mb-3")
            span.ui-outline.font-black.uppercase.ui-title
              | {{ t('spinner.surrender') }}

          //- What it costs: an inset well with a struck-out coin.
          div.surrender-cost
            span.surrender-coin(aria-hidden="true")
              IconCoin(class="h-6 w-6")
            span.ui-body.font-bold {{ t('spinner.surrenderConfirm') }}

          //- Buttons: two equal halves. Quit is a short hold-to-confirm (a stray
          //- tap in the heat of a fight never throws it); keyboard / AT confirm at once.
          div.surrender-actions
            button(
              class="ui-btn ui-btn--secondary surrender-btn-cancel"
              @click="onCancel"
            ) {{ t('spinner.surrenderCancel') }}
            FHoldButton.surrender-btn-quit(
              :hold-ms="700"
              data-testid="surrender-quit"
              @confirm="onConfirm"
            ) {{ t('spinner.surrenderQuit') }}
</template>

<style scoped lang="sass">
.surrender-dialog
  // The medallion hangs off the top edge; the card must not clip it.
  overflow: visible
  animation: surrender-swing 0.42s cubic-bezier(0.2, 1.5, 0.4, 1) both

@keyframes surrender-swing
  0%
    transform: rotate(-4deg) scale(0.9)
  60%
    transform: rotate(1deg) scale(1.02)
  100%
    transform: none

// The flag flutters on hover (pointer devices) and in the dialog.
.surrender-flag
  transform-origin: 20% 50%

@media (hover: hover)
  .surrender-btn:hover .surrender-flag
    animation: surrender-flutter 0.5s ease-in-out infinite

.surrender-dialog .surrender-flag
  animation: surrender-flutter 0.9s ease-in-out 3

@keyframes surrender-flutter
  0%, 100%
    transform: skewY(0)
  50%
    transform: skewY(-8deg)

@media (prefers-reduced-motion: reduce)
  .surrender-dialog, .surrender-flag, .surrender-btn:hover .surrender-flag
    animation: none !important

.surrender-medal
  position: absolute
  top: 0
  left: 50%
  transform: translate(-50%, -42%)
  width: 4.5rem
  height: 4.5rem
  display: grid
  place-items: center
  border-radius: 50%
  background: var(--color-berry-500)
  border: 4px solid var(--ui-ink, #161a40)
  box-shadow: 0 4px 0 var(--ui-ink, #161a40)

.surrender-cost
  display: flex
  align-items: center
  justify-content: center
  gap: 0.6rem
  margin: 0 0 1.1rem
  padding: 0.7rem 0.8rem
  border-radius: 0.9rem
  background: rgba(22, 26, 64, 0.08)
  border: 2px solid rgba(22, 26, 64, 0.18)
  line-height: 1.2

// The coin is struck through: no rewards.
.surrender-coin
  position: relative
  flex: none
  display: grid
  place-items: center
  &::after
    content: ''
    position: absolute
    left: -2px
    right: -2px
    top: 50%
    height: 3px
    border-radius: 2px
    background: var(--color-berry-500)
    transform: rotate(-35deg)

.surrender-actions
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0.75rem
  align-items: start

.surrender-btn-cancel, .surrender-actions :deep(.f-hold-btn)
  width: 100%
  min-height: 3rem

.surrender-actions :deep(.f-hold)
  display: flex
  width: 100%
</style>
