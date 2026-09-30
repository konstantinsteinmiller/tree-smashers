<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCoin from '@/components/icons/IconCoin.vue'
import { rewardedAdCoins } from '@/use/useStageRewards'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isNative } from '@/use/useUser'
import { useAdButtonCooldown } from '@/use/adButtonCooldown'
import { prependBaseUrl } from '@/utils/function'

/**
 * ─── "[movie] +N coins" top-up on an unaffordable skill (§6.5) ──────────────
 *
 * AD BUILDS ONLY. Never import this from a template `v-if`: pick it at module
 * scope with `HAS_REWARDED_ADS ? SkillTopUpButton : null` (see the header of
 * SkillPickerModal.vue / SpinnerArena.vue), so no-ad builds never bundle it.
 *
 * Shows only when all of these hold:
 *   • a rewarded ad is loaded right now (`isRewardedReady`, which already
 *     folds in the build gate — false on every no-ad build);
 *   • the shared 30 s cooldown of the HUD "+N coins" button has run out
 *     (one inventory, same `useRewardedThrottle` budget via useAds);
 *   • the skill is unaffordable, but ONE ad closes the gap
 *     (`cost − coins ≤ rewardedAdCoins`).
 *
 * The ad pays coins only; the upgrade stays a separate tap.
 */

const props = defineProps<{
  /** Coins the next learn / upgrade step costs. */
  cost: number
}>()

const emit = defineEmits<{ (e: 'coins-awarded', sourceEl: HTMLElement): void }>()

const { t } = useI18n()
const { coins, addCoins } = useSpinnerConfig()
const { cooldownActive, arm } = useAdButtonCooldown()
const pending = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const payout = computed(() => rewardedAdCoins.value)

const isVisible = computed(() =>
  isRewardedReady.value
  && !cooldownActive.value
  && coins.value < props.cost
  && props.cost - coins.value <= payout.value
)

const watchAd = async () => {
  if (pending.value || !isVisible.value) return
  pending.value = true
  try {
    const ok = await showRewardedAd({ kind: 'coins', amount: payout.value })
    if (ok) {
      addCoins(payout.value)
      arm()
      if (rootEl.value) emit('coins-awarded', rootEl.value)
    }
  } finally {
    pending.value = false
  }
}
</script>

<template lang="pug">
  button.skill-topup.relative.inline-flex.items-center.rounded-lg.border-2.font-black.text-white.cursor-pointer(
    v-if="isVisible"
    ref="rootEl"
    type="button"
    :disabled="pending"
    :aria-label="t('skills.topUpAria', { n: payout }, payout)"
    class="gap-1 px-2 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] active:scale-95"
    @click.stop="watchAd"
  )
    span.game-text(v-if="isNative") {{ t('spinner.ad') }}
    img.object-contain(
      :src="prependBaseUrl('images/icons/movie_128x96.webp')"
      class="w-5 h-5"
      alt=""
      aria-hidden="true"
    )
    span.game-text +{{ payout }}
    IconCoin(class="w-4 h-4 text-yellow-300")
</template>

<style scoped lang="sass">
.skill-topup
  min-height: 36px
  font-size: 0.85rem
  box-shadow: 0 3px 0 #1a2b4b
</style>
