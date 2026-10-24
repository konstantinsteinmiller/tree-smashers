<script setup lang="ts">
import { movieIconSrc } from '@/use/badgeIconArt'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isNative } from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'
import useBattlePass from '@/use/useBattlePass'

/**
 * ─── "[movie] Reset Battle Pass" (placement `bp_reset`) ────────────────────
 *
 * AD BUILDS ONLY. BattlePass.vue picks this at module scope with
 * `HAS_REWARDED_ADS ? BattlePassResetAdButton : null`, so a no-ad build
 * neither renders nor bundles it (tests/battlePassAdReset.test.ts).
 *
 * Gating, in order:
 *   • offer  — rendered only when every tier is reached AND claimed
 *              (`canAdReset`); while tiers wait, "Claim all" is the CTA;
 *   • ready  — rendered but DISABLED (hatched, with the "ad not ready" line)
 *              until a rewarded ad is loaded, so a tap never hits an empty slot;
 *   • busy   — disabled from the tap until the ad settles (no double ad);
 *   • result — only a watched-to-the-end ad (`showRewardedAd` → true) resets
 *              the pass; skipped / unfilled / declined / errored resets nothing.
 *
 * Audio mute, gameplayStop/Start and the throttle all live in `useAds`
 * (trackAd), like every rewarded placement — no SDK is touched here.
 */

const emit = defineEmits<{ (e: 'reset'): void }>()

// Copy lives in BattlePass's namespace (sfc.BattlePass.*), read by full path.
const { t } = useI18n({ useScope: 'global' })
const { canAdReset, resetPassByAd } = useBattlePass()
const busy = ref(false)

const isDisabled = computed(() => busy.value || !isRewardedReady.value)

const watchAd = async () => {
  // Synchronous guard: a double tap's second tap must find `busy` set.
  if (busy.value || !isRewardedReady.value || !canAdReset.value) return
  busy.value = true
  try {
    const ok = await showRewardedAd(null)
    if (ok === true && resetPassByAd()) emit('reset')
  } finally {
    busy.value = false
  }
}
</script>

<template lang="pug">
  div.bp-reset(v-if="canAdReset")
    button.bp-reset-btn.ui-btn.ui-btn--ad(
      type="button"
      data-testid="bp-ad-reset"
      data-placement="bp_reset"
      :disabled="isDisabled"
      :class="isDisabled ? 'is-disabled' : 'ui-shine'"
      :aria-label="t('sfc.BattlePass.resetPassAria')"
      @click.stop="watchAd"
    )
      span.game-text(v-if="isNative" aria-hidden="true") {{ t('spinner.ad') }}
      img(
        :src="movieIconSrc()"
        alt=""
        aria-hidden="true"
        draggable="false"
      )
      span.game-text(aria-hidden="true") {{ t('sfc.BattlePass.resetPass') }}
    span.bp-reset-note.ui-body(v-if="!isRewardedReady && !busy") {{ t('adNotReady') }}
</template>

<style scoped lang="sass">
// Rewarded-video CTA recipe (movie icon + label, thick lip, press sink, shine
// sweep) on the sky ad plate. NOT green: Play Store forbids green rewarded-ad buttons.
.bp-reset
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.3rem
  padding-top: 0.25rem

.bp-reset-btn
  padding: 0.3rem 1rem 0.4rem
  font-size: 0.95rem
  white-space: nowrap
  text-shadow: var(--ui-stroke)

  img
    width: 1.5rem
    height: 1.5rem
    object-fit: contain
    filter: drop-shadow(0 1.5px 0 var(--color-ink))

.bp-reset-note
  font-size: 0.7rem
</style>
