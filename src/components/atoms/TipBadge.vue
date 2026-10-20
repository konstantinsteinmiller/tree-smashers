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
    class="max-w-[90vw] sm:max-w-[26rem]"
  )
    //- Sun-gold star — same gold as the coin reward to read as a
    //- premium hint, not a generic toast.
    div.tip-star.shrink-0.flex.items-center.justify-center.rounded-full(
      class="w-8 h-8 sm:w-9 sm:h-9"
    )
      svg.w-5.h-5(
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      )
        path(d="M12 2l2.39 6.96H22l-5.81 4.22L18.18 22 12 17.77 5.82 22l1.99-8.82L2 8.96h7.61L12 2z")

    //- Tip body — ink on the cream card.
    span.tip-text.font-black.leading-snug(
      class="text-sm sm:text-base"
    ) {{ t(textKey) }}
</template>

<style scoped lang="sass">
// Ice card with a sun accent bar down the left edge (a flat inset band),
// a hard drop, and an entrance that lands late (after the reward) with a
// small tilt. The star then spins in on its own beat.
.tip-badge
  background-color: var(--color-ice-100)
  color: var(--ui-text)
  border: 3px solid var(--color-ink)
  box-shadow: inset 6px 0 0 var(--color-sun-400), inset 0 3px 0 var(--color-ice-50), inset 0 -4px 0 var(--color-ice-300), 0 4px 0 var(--color-ink)
  animation: tip-pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1) 0.6s both

.tip-star
  background-color: var(--color-sun-400)
  color: var(--color-ice-50)
  border: 2px solid var(--color-ink)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 2px 0 var(--color-ink)
  animation: tip-star 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) 0.85s both

  svg
    filter: drop-shadow(0 1.5px 0 var(--color-ink))

.tip-text
  color: var(--ui-text)

@keyframes tip-pop
  0%
    transform: scale(0.8) translateY(10px) rotate(-3deg)
    opacity: 0
  100%
    transform: none
    opacity: 1

@keyframes tip-star
  0%
    transform: scale(0.3) rotate(-120deg)
  100%
    transform: none

@media (prefers-reduced-motion: reduce)
  .tip-badge, .tip-star
    animation: none

// Short landscape: the reward overlay has to fit the ribbon, the result text,
// the reward row, this badge AND the tap-to-continue prompt into ~390px. The
// badge is the least important of them, so it gets wider and tighter here —
// a wider box means fewer wrapped lines, which is what actually costs height.
// (A three-line Chinese tip is the worst case; two lines fit comfortably.)
@media (orientation: landscape) and (max-height: 500px)
  .tip-badge
    max-width: min(90vw, 34rem)
    padding: 0.5rem 0.85rem
    gap: 0.5rem

  .tip-text
    font-size: 0.8rem

  .tip-star
    width: 1.6rem
    height: 1.6rem

    svg
      width: 1rem
      height: 1rem
</style>
