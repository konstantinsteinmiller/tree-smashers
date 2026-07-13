<script setup lang="ts">
import { ref } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { prependBaseUrl } from '@/utils/function'

const { coins, diamonds } = useSpinnerConfig()

// Fancy, higher-fidelity diamond used specifically for the HUD badge (the
// plain diamond lives in the reusable IconDiamond component used elsewhere).
const diamondFancySrc = prependBaseUrl('images/icons/diamond-fancy_256x256.webp')

// Exposed so siblings can target the badge for fly-to VFX:
//   • rootEl       — coin-explosion target (whole badge / coin row)
//   • diamondRowEl — diamond-explosion target (the diamond row)
const rootEl = ref<HTMLElement | null>(null)
const diamondRowEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl, diamondRowEl })
</script>

<template lang="pug">
  //- Two-row currency badge: coins on top, diamonds below. Icons share the
  //- first column; values are right-aligned in the second column.
  div.coin-badge.relative.font-bold(
    ref="rootEl"
    class="rounded-2xl pl-1 pr-3 py-1 text-sm sm:text-base"
  )
    div.relative.grid.items-center(class="grid-cols-[auto_1fr] gap-x-2 gap-y-1")
      //- Coin row
      div.coin-badge__icon.flex.items-center.justify-center.rounded-full(
        class="w-7 h-7 sm:w-8 sm:h-8"
      )
        IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-100 drop-shadow")
      span.game-text.coin-badge__value.justify-self-end {{ coins }}

      ////- Diamond row
      //div.flex.items-center.justify-center.rounded-full(
      //  ref="diamondRowEl"
      //  class="w-7 h-7 sm:w-8 sm:h-8"
      //)
      //  img.object-contain(
      //    :src="diamondFancySrc"
      //    alt="diamonds"
      //    draggable="false"
      //    class="w-7 h-7 sm:w-8 sm:h-8"
      //  )
      //span.game-text.coin-badge__value.coin-badge__value--diamond.justify-self-end {{ diamonds }}
</template>

<style scoped lang="sass">
.coin-badge
  background: linear-gradient(135deg, #50aaff 0%, #2266ff 50%, #1b3e95 100%)
  border: 2px solid #fcd34d
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 4px 10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.4)
  overflow: hidden

  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.35) 50%, transparent 65%)
    background-size: 250% 100%
    animation: coin-shine 3.5s linear infinite
    pointer-events: none

  &__icon
    background: radial-gradient(circle at 30% 30%, #fff7b0 0%, #fcd34d 35%, #b8860b 100%)
    box-shadow: 0 0 8px rgba(252, 211, 77, 0.7), inset 0 -2px 3px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.6)
    border: 1px solid #78350f

  // Diamond cell gets a cool cyan well so the gem pops against the warm coin row.
  &__icon--diamond
    background: none
    box-shadow: 0 0 0px rgba(120, 220, 255, 0.7), inset 0 -2px 3px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.6)
    border: 0px solid #1e4a78

  &__value
    color: #fff7d6
    text-shadow: 0 1px 0 #000, 0 0 6px rgba(252, 211, 77, 0.7)
    letter-spacing: 0.5px
    position: relative


  &__value--diamond
    color: #e6f7ff
    text-shadow: 0 1px 0 #000, 0 0 6px rgba(120, 220, 255, 0.75)

@keyframes coin-shine
  0%
    background-position: 200% 0
  100%
    background-position: -100% 0
</style>
