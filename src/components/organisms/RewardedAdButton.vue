<script setup lang="ts">
import { movieIconSrc } from '@/use/badgeIconArt'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isNative } from '@/use/useUser'
import { WIN_AD_MULTIPLIER, winAdExtraCoins, winAdTotalCoins } from '@/use/winCoinsAd'
import { prependBaseUrl } from '@/utils/function'

// "[movie] 3x [coin]" on the (non-boss) win screen: watch a rewarded ad and
// the coins this win paid become 3x in TOTAL — the base was granted when the
// screen opened, so a completed ad adds the base twice more (see
// `@/use/winCoinsAd`). One use per win screen: FReward unmounts its slot, so a
// fresh instance (and a fresh `claimed`) comes with every result screen.
//
// Gating, in order:
//   • build  — never rendered on a build without rewarded ads;
//   • ready  — rendered but DISABLED until a rewarded ad is loaded (and while
//              the throttle holds), so a tap can never hit an empty slot;
//   • busy   — disabled from the tap until the ad settles, so a double tap
//              cannot start a second ad or pay twice;
//   • result — a skipped / unfilled / declined ad pays nothing and leaves the
//              button available for another try.

interface Props {
  /** Coins this win screen already granted — the 1x of the 3x. */
  baseCoins: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** Paid: `extra` coins were just added (total is now 3x base). */
  (e: 'coins-awarded', sourceEl: HTMLElement, extra: number): void
  /** An ad is in flight — the parent must hold its tap-to-continue. */
  (e: 'busy', busy: boolean): void
}>()

const { t } = useI18n()
const { addCoins } = useSpinnerConfig()
const rootEl = ref<HTMLElement | null>(null)
const claimed = ref(false)
const busy = ref(false)

const extra = computed(() => winAdExtraCoins(props.baseCoins))
const total = computed(() => winAdTotalCoins(props.baseCoins))

const isVisible = computed(() => HAS_REWARDED_ADS && extra.value > 0 && !claimed.value)
const isDisabled = computed(() => busy.value || !isRewardedReady.value)

const setBusy = (value: boolean) => {
  busy.value = value
  emit('busy', value)
}

const claim = async () => {
  // Synchronous guard: the second tap of a double tap lands here before the
  // first tap's `await` has returned, and must find the flag already set.
  if (claimed.value || busy.value || !isRewardedReady.value) return
  const amount = extra.value
  if (amount <= 0) return
  setBusy(true)
  try {
    const ok = await showRewardedAd({ kind: 'coins', amount })
    if (!ok || claimed.value) return
    claimed.value = true
    addCoins(amount)
    if (rootEl.value) emit('coins-awarded', rootEl.value, amount)
  } finally {
    setBusy(false)
  }
}
</script>

<template lang="pug">
  button.reward-3x.group.z-10.transition-transform(
    ref="rootEl"
    v-if="isVisible"
    type="button"
    :disabled="isDisabled"
    :aria-label="t('spinner.tripleCoinsAria', { count: total }, total)"
    :class="isDisabled ? 'cursor-default' : 'cursor-pointer'"
    @click.stop="claim"
  )
    //- The win screen's hero CTA: the sky hero recipe (thick lip, stripes,
    //- shine) on a heartbeat wrapper. Not ready / ad playing: flat steel with
    //- the hazard hatch, no motion.
    div.relative(:class="{ 'ui-breathe': !isDisabled }")
      div.ad-plate.ui-btn.ui-btn--ad.ui-btn--hero.relative.font-bold.flex.items-center.gap-1(
        class="!px-4 !py-1.5"
        :class="isDisabled ? 'is-disabled' : 'ui-shine'"
      )
        //- Ad disclosure (native builds only — Families policy)
        span.game-text.leading-tight(v-if="isNative" class="text-[10px] sm:text-xs") {{ t('spinner.ad') }}
        img.object-contain(
          :src="movieIconSrc()"
          alt=""
          class="h-[1.5625rem] w-[1.5625rem] sm:h-[1.875rem] sm:w-[1.875rem] -my-1 shrink-0"
        )
        span.font-black.game-text.leading-tight(class="text-lg sm:text-xl") {{ WIN_AD_MULTIPLIER }}x
        IconCoin.inline(class="w-5 h-5 sm:w-6 sm:h-6 text-sun-300")
</template>

<style scoped lang="sass">
// Sky plate: every rewarded-video CTA is sky (DESIGN.md), ink outline,
// hard 0-blur drop.
// (.ui-btn--ad / --hero supply fill, lip, band, stripes and drop.)
.ad-plate
  text-shadow: var(--ui-stroke)
</style>
