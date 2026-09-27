<script setup lang="ts">
// ─── RewardedAdIntroModal ───────────────────────────────────────────────────
//
// The intro screen every rewarded ad on the native build must pass through.
// See `useRewardedIntro.ts` for why it exists (AdMob rewarded-interstitial
// contract + Google Play Families "unclear ads/offers"). Mounted once in
// App.vue; visibility is purely reactive on `isRewardedIntroOpen`.
//
// Three things this markup has to get right, all of them policy rather than
// taste:
//
//   1. The word "Advertisement" is the heading. The Families policy rejects
//      ads that "aren't clearly distinguishable from your app's content", so
//      the label leads — it is not a footnote under the reward.
//   2. The decline button is a real, full-width, equally-tappable button.
//      "Sufficient time to opt out" and "must not be hidden, obstructed, or
//      non-functional" are the policy's words. Backdrop tap and Escape also
//      decline, so there is no way to get stuck here.
//   3. The body promises the ad is closeable. Rewarded interstitial units
//      serve skippable creatives only, so this is a claim we can actually
//      keep.
//
// Kid-safe wording throughout: chaos-arena declares a child-directed
// audience (ages 6+), so no urgency language, no dark patterns, no
// "LAST CHANCE" framing.
import { isSingleCurrency } from '@/use/useCurrency'
import { computed } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import {
  acceptRewardedIntro,
  declineRewardedIntro,
  isRewardedIntroOpen,
  rewardedIntroReward
} from '@/use/useRewardedIntro'

const { t } = useSfcI18n('RewardedAdIntroModal')

// The reward text is built by i18n, not by string concatenation: each kind
// has its own message with `{count}` inside it, so plural forms and word
// order stay in the translation files. Falls back to generic copy when the
// placement did not name a reward.
const rewardText = computed(() => {
  const reward = rewardedIntroReward.value
  if (!reward) return ''
  const count = reward.amount ?? 0
  switch (reward.kind) {
    case 'coins':
      return t('rewardedIntro.rewardCoins', { count })
    case 'diamonds':
      // On a single-currency build the payout is coins, so the intro has to
      // say coins — naming a currency the player cannot see would fail the
      // "clear reward messaging" requirement this modal exists to satisfy.
      // `displayDiamondReward` has already converted the amount upstream, so
      // this only picks the wording; no new translation keys are needed
      // because `rewardCoins` ships in every locale already.
      return isSingleCurrency
        ? t('rewardedIntro.rewardCoins', { count })
        : t('rewardedIntro.rewardDiamonds', { count })
    case 'speed':
      return t('rewardedIntro.rewardSpeed')
    case 'respin':
      return t('rewardedIntro.rewardRespin')
    default:
      return ''
  }
})
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(
      name="rewarded-intro-modal"
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    )
      div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4(
        v-if="isRewardedIntroOpen"
        role="dialog"
        aria-modal="true"
        :aria-label="t('rewardedIntro.title')"
        tabindex="-1"
        @click="declineRewardedIntro"
        @keydown.esc="declineRewardedIntro"
      )
        //- Backdrop
        div.absolute.inset-0(class="bg-black/70 backdrop-blur-sm")

        //- Card
        div.relative.w-full.max-w-md.rounded-2xl.text-white.shadow-2xl.text-center(
          class="bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-slate-500 p-6"
          @click.stop
        )
          //- Ad disclosure badge — leads the card so the player knows what is
          //- about to happen BEFORE the reward is dangled.
          div.inline-block.rounded.font-bold.tracking-widest.uppercase.mb-3(
            class="bg-slate-900/80 border border-slate-400 text-slate-200 text-[11px] px-2 py-0.5"
          ) {{ t('rewardedIntro.badge') }}

          div.mb-2.text-5xl 🎬
          h2.text-2xl.font-bold.mb-2 {{ t('rewardedIntro.title') }}

          //- Reward is interpolated INSIDE the i18n message, never concatenated
          //- around it — word order differs per language.
          p.text-base.mb-2(v-if="rewardText" class="text-slate-200")
            i18n-t(keypath="sfc.RewardedAdIntroModal.rewardedIntro.bodyReward" tag="span" scope="global")
              template(#reward)
                span.font-bold(class="text-amber-300") {{ rewardText }}
          p.text-base.mb-2(v-else class="text-slate-200") {{ t('rewardedIntro.body') }}

          p.text-sm.mb-5(class="text-slate-300") {{ t('rewardedIntro.closeable') }}

          button.w-full.rounded-lg.font-bold.text-lg.text-white.shadow-lg.mb-2(
            class="bg-amber-500 hover:bg-amber-400 active:translate-y-px py-3"
            @click="acceptRewardedIntro"
          ) {{ t('rewardedIntro.watch') }}

          //- Equal-weight decline. Same width, same hit area, no colour trick
          //- to make it look disabled.
          button.w-full.rounded-lg.font-bold.text-base.shadow(
            class="bg-slate-600 hover:bg-slate-500 active:translate-y-px py-3 text-slate-100"
            @click="declineRewardedIntro"
          ) {{ t('rewardedIntro.decline') }}
</template>
