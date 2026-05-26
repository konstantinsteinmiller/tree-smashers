<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isNative } from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'

// "Double your reward" button shown on the (non-boss) win screen: watch a
// rewarded ad to add the base win reward AGAIN, for a 2× total. Mirrors
// AdRewardButton's look, but contextual to the just-won reward and one-shot
// per reward screen (FReward unmounts its slot, so `claimed` resets each win).

interface Props {
  /** Coins to ADD on a successful watch — i.e. the base win reward, granted a
   *  second time so the player ends up with 2× of it. */
  coins: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t } = useI18n()
const { addCoins } = useSpinnerConfig()
const rootEl = ref<HTMLElement | null>(null)
const claimed = ref(false)

// Visible only while a rewarded ad is loaded, there's a reward to double, and
// the player hasn't already doubled on this screen.
const isVisible = computed(() => isRewardedReady.value && props.coins > 0 && !claimed.value)

const triggerDouble = async () => {
  if (claimed.value) return
  const ok = await showRewardedAd()
  if (ok) {
    claimed.value = true
    addCoins(props.coins)
    if (rootEl.value) emit('coins-awarded', rootEl.value)
  }
}
</script>

<template lang="pug">
  button.reward-2x.group.cursor-pointer.z-10.transition-transform(
    ref="rootEl"
    v-if="isVisible"
    class="hover:scale-[103%] active:scale-90 scale-90 sm:scale-100"
    @click="triggerDouble"
  )
    div.relative
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
      div.relative.rounded-lg.border-2.text-white.font-bold.flex.flex-col.items-center.px-2.py-1(
        class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      )
        //- Row 1: 2× coin
        div.flex.items-center.gap-1
          span.font-black.game-text.leading-tight(class="text-sm sm:text-base") 2x
          IconCoin.inline(class="w-5 h-5 text-yellow-300")
        //- Row 2: ad disclosure (native builds only) + movie icon
        div.flex.items-center.gap-1
          span.game-text.leading-tight(v-if="isNative" class="text-[10px] sm:text-xs") {{ t('spinner.ad') }}
          img.object-contain(
            :src="prependBaseUrl('images/icons/movie_128x96.webp')"
            class="h-5 w-5"
          )
</template>
