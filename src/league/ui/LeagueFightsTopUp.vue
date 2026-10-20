<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isNative } from '@/use/useUser'
import { useAdButtonCooldown } from '@/use/adButtonCooldown'
import { prependBaseUrl } from '@/utils/function'
import { AD_BONUS } from '@/league/leagueMath'
import type { LeagueUiSource } from '@/league/ui/leagueUi'

/**
 * ─── "[movie] +3 fights" league top-up (placement `league_fights`) ─────────
 *
 * AD BUILDS ONLY. Never render this from a template `v-if` on the build flag:
 * the hub picks it at module scope with
 * `HAS_REWARDED_ADS ? LeagueFightsTopUp : null`, so a no-ad build neither
 * renders nor bundles it (tests/rewardedPlacementsBuildGate.test.ts).
 *
 * Shows only when all of these hold:
 *   • a rewarded ad is loaded right now (`isRewardedReady` folds in the build
 *     gate — false on every no-ad build);
 *   • the shared 30 s rewarded-button cooldown has run out (one inventory
 *     with the HUD "+N coins" button and the skill top-up);
 *   • the league still offers a top-up today (`canAdTopUp`: ≤ AD_MAX a day).
 *
 * A completed ad credits +AD_BONUS fights through `grantAdFights()` and arms
 * the shared cooldown.
 */

const props = defineProps<{
  league: Pick<LeagueUiSource, 'canAdTopUp' | 'grantAdFights'>
}>()

const emit = defineEmits<{ granted: [] }>()

const { t } = useI18n()
const { cooldownActive, arm } = useAdButtonCooldown()
const pending = ref(false)

const isVisible = computed(() => isRewardedReady.value && !cooldownActive.value && props.league.canAdTopUp.value)

const watchAd = async () => {
  if (pending.value || !isVisible.value) return
  pending.value = true
  try {
    const ok = await showRewardedAd({ kind: 'fights', amount: AD_BONUS })
    if (ok && props.league.grantAdFights()) {
      arm()
      emit('granted')
    }
  } finally {
    pending.value = false
  }
}
</script>

<template lang="pug">
  button.league-topup(
    v-if="isVisible"
    type="button"
    data-league="fights-topup"
    data-placement="league_fights"
    :disabled="pending"
    :aria-label="t('league.topUpAria', { n: AD_BONUS }, AD_BONUS)"
    @click.stop="watchAd"
  )
    span.game-text(v-if="isNative" aria-hidden="true") {{ t('spinner.ad') }}
    img(
      :src="prependBaseUrl('images/icons/movie_128x96.webp')"
      alt=""
      aria-hidden="true"
      draggable="false"
    )
    span.game-text(aria-hidden="true") {{ t('league.topUp', { n: AD_BONUS }, AD_BONUS) }}
</template>

<style scoped lang="sass">
// Rewarded-video CTA: ad tone (sky), same look as .ui-btn--ad.
.league-topup
  position: relative
  display: inline-flex
  align-items: center
  gap: 0.3rem
  min-height: 2.75rem
  padding: 0.2rem 0.75rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-sky-500)
  box-shadow: inset 0 2px 0 var(--color-sky-300), inset 0 -3px 0 var(--color-sky-700), 0 3px 0 var(--color-ink)
  color: var(--color-cream-50)
  font-size: 0.9rem
  font-weight: 900
  white-space: nowrap
  cursor: pointer

  img
    width: 1.5rem
    height: 1.5rem
    object-fit: contain

  &:active:not(:disabled)
    transform: translateY(2px) scale(0.97)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
</style>
