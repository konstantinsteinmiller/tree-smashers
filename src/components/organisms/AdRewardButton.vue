<script setup lang="ts">
import { movieIconSrc } from '@/use/badgeIconArt'
import { revealRewards } from '@/use/useRewardReveal'
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
  // Grant first (the wallet never waits on an animation), then show the
  // payout on the gift screen; the fly-to-badge VFX follows its dismissal.
  // `rootEl` is captured now — the button hides itself for the cooldown.
  const el = rootEl.value
  if (props.reward === 'diamond') {
    addDiamonds(props.diamonds)
    void revealRewards([{ kind: 'diamonds', amount: props.diamonds }]).then(() => {
      if (el) emit('diamonds-awarded', el)
    })
  } else {
    const amount = coinPayout.value
    addCoins(amount)
    void revealRewards([{ kind: 'coins', amount }]).then(() => {
      if (el) emit('coins-awarded', el)
    })
  }
}
</script>

<template lang="pug">
  button.adReward.group.cursor-pointer.z-10.transition-transform(
    ref="rootEl"
    v-if="isVisible"
    class="scale-80 sm:scale-110"
    @click="triggerAdReward"
  )
    //- The sky ui-btn recipe (sinks on press via the global handler) with
    //- the shine sweep: a free reward is waiting.
    div.relative
      div.ad-plate.ui-btn.ui-btn--ad.ui-btn--icon.ui-shine.relative.font-bold.flex.flex-col.items-center(class="!px-1.5 !py-1")
        div.flex.items-center.gap-1
          template(v-if="reward === 'diamond'")
            span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ diamondPayout.amount }}
            IconDiamond.inline(v-if="diamondPayout.currency === 'diamonds'" class="w-4 h-4")
            IconCoin.inline(v-else class="w-4 h-4")
          template(v-else)
            span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ coinPayout }}
            IconCoin.inline(class="w-4 h-4 text-sun-300")
        //- Ad disclosure. Google Play's Families policy rejects ads and ad
        //- offers that "aren't clearly distinguishable from your app's
        //- content", so the native build labels the button in words, not just
        //- with the film-reel glyph. Mirrors RewardedAdButton.
        div.flex.items-center.gap-1
          span.game-text.leading-tight(v-if="isNative" class="text-[10px] sm:text-xs") {{ t('spinner.ad') }}
          img.object-contain(
            :src="movieIconSrc()"
            class="h-5 w-5 sm:h-5 sm:w-5"
            :alt="t('spinner.ad')"
          )
</template>

<style scoped lang="sass">
// Sky plate: every rewarded-video CTA is sky (DESIGN.md), ink outline,
// hard 0-blur drop.
// (.ui-btn--ad supplies fill, lip, band and drop; this only tightens it.)
.ad-plate
  gap: 0.1rem
  text-shadow: var(--ui-stroke-sm)
</style>
