<script setup lang="ts">
import IconCoin from '@/components/icons/IconCoin.vue'
import { SPEED_BOOST_COIN_PRICE } from '@/use/speedBoostPurchase'

/**
 * Coin-price sticker on the 2x speed switch — builds WITHOUT rewarded ads
 * only (the boost is bought for SPEED_BOOST_COIN_PRICE coins there, see
 * speedBoostPurchase.ts). Sits in the FREE badge's slot with the shop's price
 * colours: gold when affordable, slate when not (the 2x button is disabled
 * then).
 *
 * Its own component so SpinnerArena can pick it at MODULE scope from the
 * build flag: on ad builds the pick folds to `null` and this module never
 * reaches the bundle.
 */

interface Props {
  /** The wallet cannot pay the price right now. */
  unaffordable: boolean
}

defineProps<Props>()
</script>

<template lang="pug">
  span.speed-coin-badge.absolute.pointer-events-none.whitespace-nowrap.font-black.game-text.leading-none.rounded-full.border.flex.items-center(
    class="right-0 -top-2 gap-0.5 pl-0.5 pr-1.5 py-0.5 text-[9px] sm:text-[10px] border-[#0f1a30]"
    :class="unaffordable ? 'bg-slate-600 text-slate-400' : 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] text-white'"
  )
    IconCoin(class="w-3 h-3" :class="unaffordable ? 'text-slate-400' : 'text-yellow-200'")
    span {{ SPEED_BOOST_COIN_PRICE }}
</template>
