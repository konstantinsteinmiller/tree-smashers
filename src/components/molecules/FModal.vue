<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'

interface Props {
  modelValue: boolean | any
  title?: string
  isClosable?: boolean
  tabs?: TabOption[]
  activeTab?: string | number
}

// NOTE for future work: there is deliberately NO "fill the body's height"
// mode here. Nothing in the chain above the body has a definite height —
// `.model-container` is content-sized up to a `max-height` — so a slotted
// panel cannot be told to fill it. `height: 100%` silently resolves to `auto`
// (percentages need a definite containing block), and flex sizing collapses
// the modal instead, because the panel's own height is what drives the
// modal's size in the first place. A panel that needs a control to stay
// visible should put it in the `footer` slot, which is already outside the
// scroll area — see FakeLeaderBoard's pagination.

const props = withDefaults(defineProps<Props>(), {
  isClosable: true,
  tabs: () => []
})

const emit = defineEmits(['update:modelValue', 'update:activeTab'])
const { t } = useI18n()

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

// ─── Scroll affordance ──────────────────────────────────────────────────────
//
// The content slot is height-capped and scrolls (see `.modal-content-slot`).
// A clipped panel with no visual cue reads as "the modal is cut off", which is
// exactly the kind of thing portal QA flags — so we fade the top/bottom edge
// whenever there is more content in that direction. Purely additive: when the
// content fits, both flags stay false and the modal looks untouched.
const contentRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

// ─── Header room ────────────────────────────────────────────────────────────
//
// How far the header (tab heads / title ribbon) sticks out ABOVE the modal
// container. The container's `max-height` subtracts it and its `margin-top`
// adds it back, so the header always lands inside the overlay's content box
// instead of off the top of the screen.
//
// Measured rather than hard-coded. The strip's height moves with the tab
// count, the breakpoint, the active locale's glyph height and the global UI
// scale, and every fixed guess eventually clipped the tabs on some viewport
// (844x390 landscape was the one that caught this).
//
// This is safe to measure once per open and does NOT feed back on itself: the
// header is positioned relative to the container, so shifting the container
// down by N shifts the header down by N too. The overhang is a property of the
// header's own box, not of the margin it controls.
const containerRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const headerRoomPx = ref<number | null>(null)

/** Small gap so the header never sits flush against the viewport edge. */
const HEADER_GAP_PX = 6

const measureHeaderRoom = (): void => {
  if (!containerRef.value) return
  const header = headerRef.value
  if (!header) {
    headerRoomPx.value = 0
    return
  }
  // `offsetTop`, NOT getBoundingClientRect().
  //
  // The open animation is a `Transition` whose enter-from state is
  // `scale-50`, and getBoundingClientRect reports the TRANSFORMED box. The
  // first measurement therefore landed mid-animation and reported half the
  // real header height (40px instead of 72px), which clipped the tab heads
  // off the top of an 844x390 viewport. `offsetTop` is a layout value and
  // ignores transforms entirely, so it reads the same before, during and
  // after the animation.
  //
  // The container is the header's offsetParent (`position: relative`), so:
  //   • tabs   (`bottom: 100%`) → offsetTop === -headerHeight
  //   • ribbon (`-top-10`)      → offsetTop === -2.5rem
  // Both are exactly the strip that has to stay on screen. In landscape the
  // tabs are additionally `scale-80`, so this over-reserves by ~20% of the
  // header height — deliberately, since erring large only costs a slightly
  // bigger gap while erring small clips the tabs.
  headerRoomPx.value = Math.max(0, -header.offsetTop) + HEADER_GAP_PX
}

const syncScrollState = (): void => {
  const el = contentRef.value
  if (!el) return
  // 1px slack absorbs sub-pixel rounding at fractional zoom / DPR levels,
  // which would otherwise leave the bottom fade stuck on at full scroll.
  canScrollUp.value = el.scrollTop > 1
  canScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

/** Everything that has to be recomputed when the modal's box changes. */
const remeasure = (): void => {
  measureHeaderRoom()
  syncScrollState()
}

let resizeObserver: ResizeObserver | null = null

const teardownObservers = (): void => {
  contentRef.value?.removeEventListener('scroll', syncScrollState)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', remeasure)
  window.removeEventListener('orientationchange', remeasure)
}

// Re-measure on open. The elements only exist while `modelValue` is true
// (v-if on the overlay), so binding has to be deferred to the next tick.
// A ResizeObserver on the scroller catches late content growth — images
// decoding, a tab swap, a locale switch reflowing longer CJK strings — and
// the window listeners catch rotation, which changes both the header scale
// (`isMobileLandscape`) and the available height.
watch(
  () => props.modelValue,
  async (open) => {
    teardownObservers()
    if (!open) {
      canScrollUp.value = false
      canScrollDown.value = false
      headerRoomPx.value = null
      return
    }
    await nextTick()
    const el = contentRef.value
    if (!el) return
    el.addEventListener('scroll', syncScrollState, { passive: true })
    window.addEventListener('resize', remeasure)
    window.addEventListener('orientationchange', remeasure)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(remeasure)
      resizeObserver.observe(el)
      // Observing the first child too — the scroller's own box stops changing
      // once it hits its max-height, but its content keeps growing.
      if (el.firstElementChild) resizeObserver.observe(el.firstElementChild)
      if (headerRef.value) resizeObserver.observe(headerRef.value)
    }
    remeasure()
  },
  { immediate: true }
)

// Tab swaps replace the entire slot content; re-measure so a short tab
// doesn't inherit the previous tab's fade state.
watch(() => props.activeTab, async () => {
  await nextTick()
  remeasure()
})

onBeforeUnmount(teardownObservers)
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
      //- The overlay's safe-area padding lives in <style>, NOT in an inline
      //- :style. Inline styles beat stylesheet rules, so while it was inline
      //- the landscape media query's tighter `padding: 0.25rem` silently
      //- never applied and short landscape viewports lost 2rem of height for
      //- nothing.
      div(
        v-if="modelValue"
        v-bind="$attrs"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center"
      )
        //- Backdrop
        div(class="modal-backdrop absolute inset-0" @click="close")

        //- Modal Container
        //- `--modal-header-room` reserves the vertical strip the header
        //- (tab heads or title ribbon) occupies ABOVE the frame. Both are
        //- absolutely positioned outside the container, so without this the
        //- container could claim the full overlay height and push its own
        //- header off the top of the viewport. See the `.model-container`
        //- rule in <style> for how it feeds the max-height clamp.
        //-
        //- The value is MEASURED (see `measureHeaderRoom`) rather than
        //- hard-coded: the strip's height depends on the tab count, the
        //- locale's glyph height, the breakpoint and the global UI scale, and
        //- every hard-coded guess we tried eventually clipped the tab heads on
        //- some viewport. `headerRoomPx` is null until the first measurement,
        //- which falls back to the CSS default in the stylesheet.
        div(
          ref="containerRef"
          class="model-container relative w-full max-w-2xl"
          :style="headerRoomPx == null ? undefined : { '--modal-header-room': headerRoomPx + 'px' }"
        )

          //- Header Area (Tabs or Ribbon)
          //- Tabs case uses `bottom: 100%` so the tab bottoms always sit
          //- exactly above the modal frame top — they never overlay the
          //- modal content. The ribbon case keeps its decorative overlap.
          div(
            v-if="tabs && tabs.length > 0"
            ref="headerRef"
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

          //- `pr-*` when the modal is closable: the ribbon is centred across
          //- the container's full width, while the X sits at the container's
          //- top-right in the same vertical band. On a phone a long title
          //- ("LEADERBOARD", "DAILY REWARDS") is wide enough that its right
          //- edge reaches the X — and because this header carries `z-10` it
          //- painted straight over the button. Reserving the button's width
          //- here re-centres the ribbon in the space that is actually free,
          //- so the two can never occupy the same pixels.
          div(
            v-else-if="title"
            ref="headerRef"
            class="modal-header modal-header-title absolute -top-10 left-0 translate-y-2 right-0 z-10"
            :class="[isMobileLandscape ? 'scale-80' : '', isClosable ? 'pr-14 sm:pr-16' : '']"
            @click="close"
          )
            div(class="flex justify-center scale-85 sm:scale-100")
              //- Fabric banner (flat CSS, see design.sass `.ui-banner`).
              //- ART-DESK SEAM: a painted fabric ribbon can replace it.
              div(class="ribbon-header ui-banner relative" @click.stop)
                span(class="ui-outline text-2xl md:text-3xl whitespace-nowrap")
                  | {{ title }}

          //- The Main Frame
          div(class="modal-frame-wrap relative")
            //- Hard drop shadow under the wooden frame (0 blur).
            div(class="absolute inset-0 translate-y-2 rounded-[1.5rem] sm:rounded-[2.25rem] bg-[var(--color-ink)]")

            //- Top padding is NOT a Tailwind `pt-*` here — it is set in
            //- <style> as `--modal-close-band`, because it has to stay in
            //- lockstep with the height of the absolutely-positioned X. See
            //- the `.modal-frame` rule for why.
            //- Wooden frame (planks + stitched edge) around a cream
            //- parchment card: the content is ALWAYS dark ink on cream, the
            //- strongest-contrast surface in the game.
            div(class="modal-frame relative pb-2 px-2 sm:px-3 md:px-4")

              //- Close Button (X) — wrapper is purely a layout spacer for
              //- the absolutely-positioned X button; it must NOT also close
              //- the modal, otherwise the empty padded strip at the top of
              //- every modal's content becomes an invisible "close" hitbox.
              //- The X deliberately overhangs the frame's top-right corner
              //- (sticker look). That overhang must stay SMALLER than the
              //- overlay's own 1rem side padding — otherwise, on every
              //- viewport narrower than the modal's 42rem max-width (i.e.
              //- every phone), the button hangs off the right edge of the
              //- screen. It measured 2px past the edge at 360px before this
              //- pass. `-mr-2.5` / `-mr-3` keeps a few px of gutter at the
              //- larger button size.
              //- `z-20` puts the X above the header's `z-10`. The padding
              //- above already keeps them apart geometrically; this is the
              //- belt-and-braces half — if a future title ever does reach
              //- across, the interactive control wins over the decoration
              //- instead of being buried under it.
              div.close-button.z-20(v-if="isClosable")
                button(
                  v-if="isClosable"
                  type="button"
                  :aria-label="t('close')"
                  @click="close"
                  class="hover:scale-[103%] -mt-3 -mr-2.5 absolute top-0 right-0 group cursor-pointer transition-transform \
                         active:scale-40 sm:active:scale-90 scale-90 sm:scale-110 sm:top-2 sm:right-2 md:top-3 md:right-3"
                  :class="{ 'scale-100 -mt-4': isMobilePortrait, '-mt-8 -mr-3': !isMobilePortrait }"
                )
                  div(class="relative")
                    //- p-2.5 + h-5 icon keeps the close hit box at ~47 CSS px
                    //- on a 390px phone, above the 44pt / 48dp minimums. It is
                    //- the one control every QA pass reaches for first.
                    div(class="ui-btn ui-btn--danger ui-btn--icon relative p-2.5")
                      svg(xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true")
                        path(stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M6 18L18 6M6 6l12 12")

              //- Content Slot — the only scrolling region in the modal.
              //- The header (tabs / ribbon / X) and the footer stay put so
              //- the primary action is always reachable without scrolling;
              //- only the body moves. `game-scroll` styles the scrollbar to
              //- match the arena chrome, and the `scroll-fade-*` classes are
              //- toggled by the observer below to hint that there is more
              //- content above / below the fold.
              div.mt-1.modal-content-slot.game-scroll(
                ref="contentRef"
                class="text-center"
                :class="{ 'scroll-fade-top': canScrollUp, 'scroll-fade-bottom': canScrollDown }"
              )
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

.modal-backdrop
  background-color: var(--ui-backdrop)

// ─── Wooden frame + cream parchment card ────────────────────────────────────
// The frame is a flat wood plank with a stitched (dashed) inner edge; the
// content slot is the parchment card. Flat fills + hard inset bands only.
.modal-frame
  background-color: var(--color-wood-600)
  border: 4px solid var(--color-ink)
  border-radius: 1.25rem
  box-shadow: inset 0 4px 0 var(--color-wood-400), inset 0 -5px 0 var(--color-wood-800)
  @media (min-width: 640px)
    border-radius: 2rem

.modal-content-slot
  color: var(--ui-text)
  background-color: var(--ui-surface)
  border: 3px solid var(--color-wood-800)
  border-radius: 0.9rem
  box-shadow: inset 0 3px 0 var(--color-cream-50)
  padding: 0.5rem 0.25rem
  @media (min-width: 640px)
    border-radius: 1.4rem
    padding: 0.75rem 0.5rem

// The footer sits on the wood, so loose footer text reads cream.
.modal-footer-slot
  color: var(--color-cream-50)

// ─── Height cap + scrollable body ───────────────────────────────────────────
//
// The overlay is `flex items-center justify-center` with safe-area padding, so
// its content box is exactly the space a modal may occupy. Before this, the
// frame simply grew past that box and long panels (the config modal, the
// battle pass, any modal rendering Chinese — which wraps taller than Latin)
// ran off the top and bottom of the screen with no way to reach the clipped
// rows. Playgama QA reported it as "text overflows UI bounds".
//
// The fix is a three-link chain of `min-height: 0`, because a flex item's
// default `min-height: auto` refuses to shrink below its content and would
// silently defeat the cap:
//
//   .model-container  (max-height: overlay box − header strip)
//     └ .modal-frame-wrap   min-height: 0
//       └ .modal-frame      min-height: 0, flex column
//         └ .modal-content-slot   flex: 1, min-height: 0, overflow-y: auto
//
// The X button, the tab heads / title ribbon and the footer all sit OUTSIDE
// the scroller, so the close affordance and the primary action never scroll
// out of reach.
// Overlay padding lives here (not inline) so the landscape media query can
// actually override it. The safe-area insets keep the modal clear of the
// notch / home indicator on iOS and of the rounded corners on Android.
.modal-overlay
  padding-top: calc(1rem + env(safe-area-inset-top, 0px))
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px))
  padding-left: calc(1rem + env(safe-area-inset-left, 0px))
  padding-right: calc(1rem + env(safe-area-inset-right, 0px))

.model-container
  display: flex
  flex-direction: column
  min-height: 0
  // `--modal-header-room` is MEASURED at runtime and written to this element
  // as an inline custom property (see `measureHeaderRoom` in <script>). The
  // 2.75rem here is only the pre-measurement fallback for the very first
  // frame — it is never the value that ends up on screen.
  //
  // The extra 0.5rem matches the frame's drop-shadow layer, which is a
  // sibling div offset by `translate-y-2`. Without it the shadow pokes ~8px
  // past the bottom of the overlay's content box on short viewports.
  max-height: calc(100% - var(--modal-header-room, 2.75rem) - 0.5rem)
  margin-top: var(--modal-header-room, 2.75rem)

.modal-frame-wrap
  display: flex
  flex-direction: column
  min-height: 0
  flex: 1 1 auto

.modal-frame
  display: flex
  flex-direction: column
  min-height: 0
  flex: 1 1 auto
  // The X is `position: absolute` in the frame's top-right corner, so it
  // paints OVER whatever the content slot puts there — in the config modal
  // that was the top-right upgrade card, whose corner became untappable.
  // Reserving a band as tall as the button (its ~47px box, minus the ~5px it
  // overhangs above the frame) is the only thing that makes the collision
  // structurally impossible rather than a per-modal tuning exercise.
  //
  // Nothing is lost by spending the space: the content slot scrolls.
  padding-top: var(--modal-close-band, 2.4rem)

.modal-content-slot
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  overflow-x: hidden
  // Reserve the scrollbar's gutter on BOTH sides. `stable` alone would inset
  // only the right edge, which visibly de-centres every modal whose content
  // is centred (most of them). `both-edges` keeps the content symmetric and,
  // because the gutter is reserved whether or not the content currently
  // overflows, switching tabs between a short and a tall panel no longer
  // shifts the layout sideways.
  scrollbar-gutter: stable both-edges
  // Keep a wheel/touch fling inside the modal instead of chaining to the
  // page behind it (the arena would scroll-jack on iOS otherwise).
  overscroll-behavior: contain
  -webkit-overflow-scrolling: touch
  // Breathing room so the last row never sits flush against the footer.
  padding-bottom: 0.125rem

// Opt-in (`fill-content` prop): hand the body's height down to the slotted
// panel so it can pin its own chrome and scroll only the part it wants to.
// Flex, not `height: 100%` — a percentage height would have to resolve
// through the `max-height` clamp on `.model-container`, which is not a
// definite height, so it silently falls back to `auto` and the panel grows to
// its content instead (the leaderboard's pagination row ended up ~700px below
// the bottom of the modal that way).
// ─── Scroll edge fades ──────────────────────────────────────────────────────
// A soft gradient of the frame's own background colour, pinned to whichever
// edge has more content behind it. `sticky` keeps them glued to the viewport
// of the scroller while the content moves underneath, and negative margins
// stop them from occupying layout space.
.modal-content-slot
  &::before, &::after
    content: ''
    display: block
    position: sticky
    left: 0
    right: 0
    height: 1.25rem
    pointer-events: none
    opacity: 0
    transition: opacity 0.18s ease
    z-index: 2

  &::before
    top: 0
    margin-bottom: -1.25rem
    background: linear-gradient(to bottom, var(--ui-surface) 15%, rgba(253, 242, 216, 0))

  &::after
    bottom: 0
    margin-top: -1.25rem
    background: linear-gradient(to top, var(--ui-surface) 15%, rgba(253, 242, 216, 0))

  &.scroll-fade-top::before
    opacity: 1

  &.scroll-fade-bottom::after
    opacity: 1

// ─── Game-styled scrollbar ──────────────────────────────────────────────────
// Matches the FSelect dropdown so every scrollable surface in the game reads
// as the same control. Firefox gets the standard two-value `scrollbar-color`.
.game-scroll
  scrollbar-width: thin
  scrollbar-color: var(--color-wood-500) var(--color-cream-200)

  &::-webkit-scrollbar
    width: 0.5rem

  &::-webkit-scrollbar-track
    background: var(--color-cream-200)
    border-radius: 999px

  &::-webkit-scrollbar-thumb
    background: var(--color-wood-500)
    border: 2px solid var(--color-cream-200)
    border-radius: 999px

    &:hover
      background: var(--color-wood-600)

// ─── Landscape mobile: tighter chrome ────────────────────────────────────────
@media (orientation: landscape) and (max-height: 500px)
  // Anchor to the top. The body scrolls inside the frame now, so the modal
  // no longer needs to spill past the bottom edge to show its content —
  // it fills the available strip exactly and the overflow scrolls.
  .modal-overlay
    align-items: flex-start
    padding-top: calc(0.25rem + env(safe-area-inset-top, 0px))
    padding-bottom: calc(0.25rem + env(safe-area-inset-bottom, 0px))
    padding-left: calc(0.25rem + env(safe-area-inset-left, 0px))
    padding-right: calc(0.25rem + env(safe-area-inset-right, 0px))
  // No `margin-top` override here any more. Reserving room for the tab heads
  // used to be a hand-tuned 1.5rem, which stopped being enough the moment the
  // tabs grew in the 2026-08 UI-scale pass and clipped them off the top of an
  // 844x390 viewport. `--modal-header-room` is measured from the real header
  // box instead, and works out to whatever this breakpoint actually needs.
  .model-container
    max-width: 42rem
  .modal-header-title
    transform: translateY(0.25rem)
    top: -1.75rem
  // Strip the modal chrome to the minimum so the content gets as much
  // vertical real-estate as possible — EXCEPT the top band, which still has
  // to clear the absolutely-positioned X. It used to be 0.5rem here, and the
  // X consequently sat on top of the config modal's top-right upgrade card.
  // The band is a touch tighter than the portrait default because the X
  // overhangs a little further above the frame at this breakpoint.
  .modal-frame
    --modal-close-band: 2.1rem
    padding-bottom: 0.25rem
    padding-left: 0.375rem
    padding-right: 0.375rem
    border-width: 3px
    border-radius: 1rem
  .modal-content-slot
    padding: 0.25rem 0.125rem
    border-radius: 0.75rem
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