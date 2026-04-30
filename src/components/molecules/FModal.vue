<script setup lang="ts">
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'

interface Props {
  modelValue: boolean | any
  title?: string
  isClosable?: boolean
  tabs?: TabOption[]
  activeTab?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  isClosable: true,
  tabs: () => []
})

const emit = defineEmits(['update:modelValue', 'update:activeTab'])

// Root is a <Teleport>, so class/style passed by parents can't auto-inherit
// and Vue warns about extraneous attrs. Opt out of auto-inherit and forward
// $attrs explicitly onto the actual modal container below.
defineOptions({ inheritAttrs: false })

const close = () => {
  emit('update:modelValue', false)
}

const handleTabChange = (val: string | number) => {
  emit('update:activeTab', val)
}
</script>

<template lang="pug">
  //- Teleport to body so the modal's `position: fixed` isn't trapped by
  //- any ancestor `transform` (e.g. the scaled bottom-row button stacks),
  //- which would otherwise promote the stack to a containing block and
  //- pin the modal inside it.
  Teleport(to="body")
    Transition(
      name="pop"
      appear
      enter-active-class="transition-all duration-[400ms] ease-[cubic-bezier(0.18,0.89,0.32,1.28)]"
      leave-active-class="transition-all duration-[200ms] ease-[cubic-bezier(0.6,-0.28,0.735,0.045)]"
      enter-from-class="opacity-0 scale-50 translate-y-12"
      leave-to-class="opacity-0 scale-50 translate-y-12"
    )
      div(
        v-if="modelValue"
        v-bind="$attrs"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Backdrop
        div(class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close")

        //- Modal Container
        div(class="model-container relative w-full max-w-2xl")

          //- Header Area (Tabs or Ribbon)
          //- Tabs case uses `bottom: 100%` so the tab bottoms always sit
          //- exactly above the modal frame top — they never overlay the
          //- modal content. The ribbon case keeps its decorative overlap.
          div(
            v-if="tabs && tabs.length > 0"
            class="modal-header modal-header-tabs absolute bottom-full left-0 right-0 z-10 pb-0"
            :class="{ 'scale-80 origin-bottom': isMobileLandscape }"
            @click="close"
          )
            FTabs(
              :model-value="activeTab"
              @update:model-value="handleTabChange"
              @click.stop
              :options="tabs"
              class="mx-auto w-max !px-0"
            )

          div(
            v-else-if="title"
            class="modal-header modal-header-title absolute -top-10 left-0 translate-y-2 right-0 z-10"
            :class="{ 'scale-80': isMobileLandscape }"
            @click="close"
          )
            div(class="flex justify-center scale-70 sm:scale-100")
              div(class="ribbon-header relative" @click.stop)
                div(class="absolute inset-0 translate-y-1 rounded-lg bg-[#1a2b4b]")
                div(class="relative flex items-center justify-center bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-4 border-[#0f1a30] px-10 py-2 rounded-xl")
                  span(class="brawl-text text-2xl md:text-3xl text-white uppercase tracking-wider whitespace-nowrap")
                    | {{ title }}

          //- The Main Frame
          div(class="relative")
            div(class="absolute inset-0 translate-y-2 rounded-[1.5rem] sm:rounded-[2.5rem] bg-[#0c1626]")

            div(class="modal-frame relative bg-[#1a2b4b] border-[5px] border-[#0f1a30] rounded-[1.25rem] sm:rounded-[2rem] pt-7 pb-0 px-2 sm:px-4 sm:pt-6 md:p-8 md:pb-2 md:pt-10")

              //- Close Button (X) — wrapper is purely a layout spacer for
              //- the absolutely-positioned X button; it must NOT also close
              //- the modal, otherwise the empty padded strip at the top of
              //- every modal's content becomes an invisible "close" hitbox.
              div.close-button(v-if="isClosable")
                button(
                  v-if="isClosable"
                  @click="close"
                  class="hover:scale-[103%] -mt-4 -mr-4 absolute top-0 right-0 group cursor-pointer transition-transform \
                         active:scale-40 sm:active:scale-90 scale-70 sm:scale-100 sm:top-2 sm:right-2 md:top-3 md:right-3"
                  :class="{ 'scale-100': isMobilePortrait,  '-mt-6 -mr-5': isMobileLandscape,  '-mt-6 -mr-6': !isMobileLandscape && !isMobilePortrait }"
                )
                  div(class="relative")
                    div(class="absolute inset-0 translate-y-1 rounded-lg bg-[#6b1212]")
                    div(class="relative custom-red-bg border-2 border-[#0f1a30] rounded-lg p-2 text-white font-bold")
                      svg(xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor")
                        path(stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M6 18L18 6M6 6l12 12")

              //- Content Slot
              div.mt-1.modal-content-slot(class="text-white text-center")
                slot

              //- Footer Area for Actions
              div.modal-footer-slot(class="mt-2 flex justify-center gap-4 mb-2")
                slot(name="footer")
</template>

<style scoped lang="sass">
.pop-enter-active
  animation: bounce-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)

.pop-leave-active
  animation: bounce-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) reverse

@keyframes bounce-in
  0%
    transform: scale(0.5)
    opacity: 0
  100%
    transform: scale(1)
    opacity: 1

.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

// ─── Landscape mobile: tighter chrome ────────────────────────────────────────
@media (orientation: landscape) and (max-height: 500px)
  // Anchor near the top so the modal can extend a bit past the bottom
  // edge of the viewport without losing its header (tabs / title) at the
  // top. The X close button is positioned with negative top, so it stays
  // visible regardless.
  .modal-overlay
    padding: 0.25rem
    align-items: flex-start
  // Reserve enough room above the modal frame for the tab heads (which
  // sit at `bottom: 100%` of the container, scaled to 80%). Without this
  // margin the tabs get clipped at the very top of the viewport.
  .model-container
    max-width: 42rem
    margin-top: 1.5rem
  .modal-header-title
    transform: translateY(0.25rem)
    top: -1.75rem
  // Strip the modal chrome to the minimum so the content gets as much
  // vertical real-estate as possible. Top padding only accommodates the
  // (negatively-positioned) X button — bumped down so labels don't sit
  // directly under the rounded corner.
  .modal-frame
    padding-top: 0.5rem
    padding-bottom: 0
    padding-left: 0.375rem
    padding-right: 0.375rem
    border-width: 3px
    border-radius: 1rem
  // The wrapper divs around <slot/> have default Tailwind margins; in
  // landscape every pixel matters so we collapse them.
  .modal-content-slot
    margin-top: 0
  .modal-footer-slot
    margin-top: 0
    margin-bottom: 0
    gap: 0.25rem
  // Hide the empty footer wrapper entirely so it doesn't reserve a row.
  .modal-footer-slot:empty
    display: none
</style>