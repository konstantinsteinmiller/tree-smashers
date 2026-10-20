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
  button.league-topup.ui-btn.ui-btn--ad(
    v-if="isVisible"
    type="button"
    data-league="fights-topup"
    data-placement="league_fights"
    :class="{ 'ui-shine': !pending }"
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
// Rewarded-video CTA: the .ui-btn--ad recipe (sky, thick lip, press sink,
// springy release) plus the shine sweep — an ad offer that is available
// RIGHT NOW should look alive. Disabled while the ad is pending.
.league-topup
  padding: 0.25rem 0.85rem 0.35rem
  font-size: 0.92rem
  white-space: nowrap

  img
    width: 1.5rem
    height: 1.5rem
    object-fit: contain
    filter: drop-shadow(0 1.5px 0 var(--color-ink))
</style>
