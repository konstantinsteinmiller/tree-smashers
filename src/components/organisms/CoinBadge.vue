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
//   • rootEl            — coin-explosion target (whole badge / coin row), and
//                         the diamond target while the diamond row is hidden
//   • diamondRowEl      — diamond-explosion target (the diamond row)
//   • celebrateDiamonds — "+N" diamond pop + badge bump when diamonds land
const rootEl = ref<HTMLElement | null>(null)
const diamondRowEl = ref<HTMLElement | null>(null)

// Built once — a bump allocates nothing.
const BUMP_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.14)', offset: 0.35 },
  { transform: 'scale(1)' }
]
const BUMP_TIMING: KeyframeAnimationOptions = { duration: 360, easing: 'ease-out' }

// The pop is teleported to <body> and pinned beside the badge: every diamond
// reward lands while a reward overlay (z-100, blurred) covers the HUD, so a
// pop rendered inside the badge would sit under it. `id` re-keys the node so
// a second landing restarts the animation; amounts that land while a pop is
// still up are summed.
const diamondPop = ref<{ id: number, amount: number, left: string, top: string } | null>(null)
let popSeq = 0

const celebrateDiamonds = (amount: number) => {
  const el = rootEl.value
  if (!el || amount <= 0) return
  if (typeof el.animate === 'function') el.animate(BUMP_KEYFRAMES, BUMP_TIMING)
  const r = el.getBoundingClientRect()
  diamondPop.value = {
    id: ++popSeq,
    amount: (diamondPop.value?.amount ?? 0) + amount,
    left: `${r.left}px`,
    top: `${r.top + r.height / 2}px`
  }
}

defineExpose({ rootEl, diamondRowEl, celebrateDiamonds })
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
        IconCoin(class="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-[0_1px_0_var(--color-ink)]")
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

    //- "+N" diamond pop, just left of the badge — same fancy diamond and
    //- diamond value styling as the (hidden) diamond row. Decorative: the
    //- reward screen that fired it already states the amount.
    Teleport(to="body")
      div.coin-badge-pop.flex.items-center.font-bold(
        v-if="diamondPop"
        :key="diamondPop.id"
        class="gap-0.5 pr-1.5 text-sm sm:text-base"
        :style="{ left: diamondPop.left, top: diamondPop.top }"
        aria-hidden="true"
        @animationend="diamondPop = null"
      )
        img.object-contain(
          :src="diamondFancySrc"
          alt=""
          draggable="false"
          class="w-6 h-6 sm:w-7 sm:h-7"
        )
        span.game-text.coin-badge__value.coin-badge__value--diamond +{{ diamondPop.amount }}
</template>

<style scoped lang="sass">
// Wood plank counter (design.sass .ui-wood look), coin value in cream with
// an ink outline. 0-blur shadows only.
.coin-badge
  background-color: var(--color-wood-600)
  border: var(--ui-border-w, 3px) solid var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-wood-400), inset 0 -4px 0 var(--color-wood-800), 0 3px 0 var(--color-ink)
  overflow: hidden

  &__value
    color: var(--color-cream-50)
    text-shadow: 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 1px 0 var(--color-ink), 0 -1px 0 var(--color-ink), 0 2px 0 var(--color-ink)
    letter-spacing: 0.02em
    position: relative

  &__value--diamond
    color: var(--color-plum-300)

// Pinned by its right-centre to the badge's left-centre (left/top come from
// the badge rect), above the reward overlays' z-100.
.coin-badge-pop
  position: fixed
  z-index: 110
  pointer-events: none
  white-space: nowrap
  animation: coin-badge-pop 1.2s ease-out forwards

@keyframes coin-badge-pop
  0%
    opacity: 0
    transform: translate(-80%, -50%) scale(0.5)
  18%
    opacity: 1
    transform: translate(-100%, -50%) scale(1.2)
  32%
    transform: translate(-100%, -50%) scale(1)
  75%
    opacity: 1
    transform: translate(-100%, -80%) scale(1)
  100%
    opacity: 0
    transform: translate(-100%, -110%) scale(1)

</style>
