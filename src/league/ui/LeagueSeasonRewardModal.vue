<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META } from '@/use/leagueTiers'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import type { LeagueSeasonRewardView } from '@/league/ui/leagueUi'

/**
 * ─── End-of-season reward (LG5b) ────────────────────────────────────────────
 *
 * A season ended with ranked fights played: the season's PEAK tier and what
 * it pays (coins as a multiple of the current stage reward, diamonds from
 * Gold up, the Champion frame). One action — Claim — which emits `claim`;
 * the owner (the hub, or LG6 at arena mount) calls `claimSeasonReward()` and
 * credits the wallet. Not closable: the reward is never lost to a stray tap.
 *
 * Diamonds on a single-currency build (Poki) are converted to coins by the
 * wallet itself (`addDiamonds`); the modal still shows the diamond amount
 * the season paid.
 */

const props = defineProps<{
  modelValue: boolean
  reward: LeagueSeasonRewardView | null
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean]; claim: [] }>()

const { t, n } = useI18n()

const tierName = computed(() => (props.reward ? t(LEAGUE_TIER_META[props.reward.peakTier].nameKey) : ''))
const accent = computed(() => (props.reward ? LEAGUE_TIER_META[props.reward.peakTier].accent : '#ffc93c'))
</script>

<template lang="pug">
  FModal(
    data-league="season-reward"
    :model-value="modelValue && !!reward"
    :title="reward ? t('league.season.complete', { n: reward.season + 1 }) : ''"
    :is-closable="false"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.lsr(v-if="reward" :class="{ 'lsr--static': isLowQuality }" :style="{ '--lsr-accent': accent }")
      div.lsr__hero
        div.lsr__rays(aria-hidden="true")
        LeagueTierIcon.lsr__icon(:tier="reward.peakTier" :size="116")
      div.lsr__peak {{ t('league.season.peak', { tier: tierName }) }}
      ul.lsr__rewards
        li.lsr__tile(:aria-label="t('league.season.coinsAria', { n: reward.coins }, reward.coins)")
          IconCoin.lsr__glyph(class="text-yellow-300" aria-hidden="true")
          span(aria-hidden="true") +{{ n(reward.coins) }}
        li.lsr__tile(v-if="reward.diamonds > 0" :aria-label="t('league.season.diamondsAria', { n: reward.diamonds }, reward.diamonds)")
          IconDiamond.lsr__glyph(aria-hidden="true" alt="")
          span(aria-hidden="true") +{{ n(reward.diamonds) }}
        li.lsr__tile.lsr__tile--frame(v-if="reward.championFrame")
          span.lsr__frame(aria-hidden="true")
          span {{ t('league.season.frame') }}
    template(#footer)
      FButton(size="md" @click="emit('claim')") {{ t('league.season.claim') }}
</template>

<style scoped lang="sass">
.lsr
  --lsr-accent: #ffc93c
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.6rem
  padding: 0.25rem 0.5rem 0.5rem

.lsr__hero
  position: relative
  width: 9rem
  height: 9rem
  display: flex
  align-items: center
  justify-content: center

.lsr__rays
  position: absolute
  inset: -1.25rem
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--lsr-accent) 40%, transparent) 0deg 9deg, transparent 9deg 24deg)
  mask-image: radial-gradient(circle, #000 20%, transparent 68%)
  -webkit-mask-image: radial-gradient(circle, #000 20%, transparent 68%)
  animation: lsr-spin 16s linear infinite

@keyframes lsr-spin
  to
    transform: rotate(360deg)

.lsr__icon
  position: relative
  filter: drop-shadow(0 4px 0 #0f1a30)

.lsr__peak
  font-size: 1.05rem
  font-weight: 900
  color: var(--lsr-accent)
  text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 #000

.lsr__rewards
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 0.5rem
  margin: 0
  padding: 0
  list-style: none

.lsr__tile
  display: inline-flex
  align-items: center
  gap: 0.35rem
  min-height: 2.6rem
  padding: 0.3rem 0.8rem
  border-radius: 0.8rem
  border: 2px solid #0f1a30
  background: #0f1d36
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.08), 0 3px 0 #0f1a30
  font-size: 1.15rem
  font-weight: 900
  color: #fff
  text-shadow: 0 2px 0 #000

.lsr__glyph
  width: 1.6rem
  height: 1.6rem

.lsr__tile--frame
  font-size: 0.9rem

.lsr__frame
  width: 1.6rem
  height: 1.6rem
  border-radius: 0.4rem
  border: 3px solid #ff4f7b
  box-shadow: 0 0 0 2px #ffc93c

.lsr--static .lsr__rays
  animation: none

@media (prefers-reduced-motion: reduce)
  .lsr__rays
    animation: none
</style>
