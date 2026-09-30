<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import { displayDiamondReward } from '@/use/useCurrency'
import { rewardedAdCoins } from '@/use/useStageRewards'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isNative } from '@/use/useUser'
import { useAdButtonCooldown } from '@/use/adButtonCooldown'

interface Props {
  /**
   * How many coins the player gets after watching the ad (coins variant).
   *
   * Optional. Left unset — which is how the arena mounts it — the payout
   * scales with the campaign via `rewardedAdCoins` instead of sitting at a
   * flat amount that the stage curve outgrows. Pass a number only for a
   * placement whose value genuinely is fixed.
   */
  coins?: number
  /** Reward currency. 'coins' (default, arena) or 'diamond' (BG-skin/IAP shop). */
  reward?: 'coins' | 'diamond'
  /** How many diamonds the player gets after watching the ad (diamond variant). */
  diamonds?: number
}

const props = withDefaults(defineProps<Props>(), {
  coins: undefined,
  reward: 'coins',
  diamonds: 1
})

/**
 * What this button actually pays and prints.
 *
 * The flat 125 that used to live here was tuned against stage 3 (3.6x its
 * loss reward) and never scaled, so by stage ~50 the button offered LESS than
 * losing the fight the player was already in. `rewardedAdCoins` re-derives it
 * from the current stage; see `useStageRewards.ts`.
 */
const coinPayout = computed(() => props.coins ?? rewardedAdCoins.value)

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
  (e: 'diamonds-awarded', sourceEl: HTMLElement): void
}>()

const { t } = useI18n()
const { addCoins, addDiamonds } = useSpinnerConfig()

// What the diamond variant actually pays and shows. On a single-currency
// build (Poki) that is coins at the diamond rate — the grant itself is
// converted inside `addDiamonds`, so this only has to keep the LABEL
// honest. A button advertising a currency the player never sees is the
// exact mismatch Poki's monetization review looks for.
const diamondPayout = computed(() => displayDiamondReward(props.diamonds))
const rootEl = ref<HTMLElement | null>(null)

// ─── 30-second post-tap cooldown ────────────────────────────────────────────
//
// Anti-farm gate: even when the rewarded SDK is loaded AND the global
// `useRewardedThrottle` lets the show through, hide the button for 30s
// after every successful tap. Without this, players who rush each match
// can chain a rewarded ad → coins → next match → ad in <30s and burn
// through the rolling-window budget faster than intended.
//
// Persisted in localStorage so the cooldown survives page reloads (an
// obvious workaround would be to refresh — closing the loophole). A shared
// clock ticks every second so the gate re-evaluates on its own. The key, the ref and the ticking clock live in `@/use/adButtonCooldown`,
// shared with the skill picker's coin top-up (one inventory, one cooldown).
const { cooldownActive, arm: armCooldown } = useAdButtonCooldown()
const isVisible = computed(() => isRewardedReady.value && !cooldownActive.value)

// Coins are only granted once the rewarded video played all the way
// through — whichever ad provider the active build selected.
const triggerAdReward = async () => {
  if (cooldownActive.value) return
  // Naming the reward is what makes the native intro screen's "clear reward
  // messaging" requirement pass — see useRewardedIntro.ts.
  const ok = await showRewardedAd(
    props.reward === 'diamond'
      ? { kind: 'diamonds', amount: diamondPayout.value.amount }
      : { kind: 'coins', amount: coinPayout.value }
  )
  if (ok) {
    grantReward()
    // Arm the 30s cooldown ONLY on a successful watch — a no-fill or
    // user-skipped ad shouldn't punish the player by hiding the button.
    armCooldown()
  }
}

const grantReward = () => {
  if (props.reward === 'diamond') {
    addDiamonds(props.diamonds)
    if (rootEl.value) emit('diamonds-awarded', rootEl.value)
  } else {
    addCoins(coinPayout.value)
    if (rootEl.value) emit('coins-awarded', rootEl.value)
  }
}
</script>

<template lang="pug">
  button.adReward.group.cursor-pointer.z-10.transition-transform(
    ref="rootEl"
    v-if="isVisible"
    class="hover:scale-[103%] active:scale-90 scale-80 sm:scale-110"
    @click="triggerAdReward"
  )
    div.relative
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
      div.relative.rounded-lg.border-2.text-white.font-bold.flex.flex-col.items-center.px-1.py-1(
        class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      )
        div.flex.items-center.gap-1
          template(v-if="reward === 'diamond'")
            span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ diamondPayout.amount }}
            IconDiamond.inline(v-if="diamondPayout.currency === 'diamonds'" class="w-4 h-4")
            IconCoin.inline(v-else class="w-4 h-4")
          template(v-else)
            span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ coinPayout }}
            IconCoin.inline(class="w-4 h-4 text-yellow-300")
        //- Ad disclosure. Google Play's Families policy rejects ads and ad
        //- offers that "aren't clearly distinguishable from your app's
        //- content", so the native build labels the button in words, not just
        //- with the film-reel glyph. Mirrors RewardedAdButton.
        div.flex.items-center.gap-1
          span.game-text.leading-tight(v-if="isNative" class="text-[10px] sm:text-xs") {{ t('spinner.ad') }}
          img.object-contain(
            src="/images/icons/movie_128x96.webp"
            class="h-5 w-5 sm:h-5 sm:w-5"
            :alt="t('spinner.ad')"
          )
</template>
