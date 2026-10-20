<script setup lang="ts">
import IconCoin from '@/components/icons/IconCoin.vue'
import { SPEED_BOOST_COIN_PRICE } from '@/use/speedBoostPurchase'

/**
 * Coin-price sticker on the 2x speed switch — builds WITHOUT rewarded ads
 * only (the boost is bought for SPEED_BOOST_COIN_PRICE coins there, see
 * speedBoostPurchase.ts). Sits in the FREE badge's slot with the shop's price
 * colours: sun gold when affordable, taupe (the disabled-button colour) when not (the 2x button is disabled
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
  span.speed-coin-badge.absolute.pointer-events-none.whitespace-nowrap.font-black.game-text.leading-none.rounded-full.flex.items-center(
    class="right-0 -top-2 gap-0.5 pl-0.5 pr-1.5 py-0.5 text-[9px] sm:text-[10px] border-2 border-ink shadow-[0_2px_0_var(--color-ink)]"
    :class="unaffordable ? 'bg-[#b9ab95] text-ink-soft' : 'bg-sun-400 text-cream-50'"
  )
    IconCoin(class="w-3 h-3" :class="{ 'grayscale opacity-70': unaffordable }")
    span {{ SPEED_BOOST_COIN_PRICE }}
</template>
