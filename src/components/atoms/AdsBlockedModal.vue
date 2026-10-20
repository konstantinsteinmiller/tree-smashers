<script setup lang="ts">
// ─── AdsBlockedModal ────────────────────────────────────────────────────
//
// Shown when the player tapped a "watch ad" button and:
//   1. The active ad provider returned `false` (no reward granted), AND
//   2. That provider has detected an ad-blocker is interfering with its
//      ad-fetch chain.
//
// Same component services every ad backend the game ships with
// (CrazyGames, GameDistribution, AdMob-on-native, Noop) — each
// provider populates its own `isAdsBlocked` ref via SDK-specific
// detection (CG's `sdk.ad.hasAdblock()`, GD's SDK_ERROR `Blocked:`
// pattern, etc.) and `useAds.showRewardedAd()` is the single seam that
// flips the modal-visible flag. Mounted unconditionally in App.vue;
// visibility is purely reactive on the flag.
//
// Wording is kid-safe because tree-smashers targets ages 6+. No mention
// of "ad blocker brand X", no urging to disable site-wide — just a
// gentle "we couldn't show your ad, please allow ads here to earn the
// reward". Adult-audience games can swap copy via a simple text edit.

import { computed } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import { dismissAdsBlockedModal, isAdsBlockedModalShown } from '@/use/useAds'

const { t } = useSfcI18n('AdsBlockedModal')

// Hostname surfaced to the player so they know which site to allowlist.
// Falls back gracefully when running in a non-browser context (SSR,
// Node tests, Workers) where `window.location` is not a string.
const host = computed(() => {
  try {
    return window.location.host || 'this game'
  } catch {
    return 'this game'
  }
})
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(
      name="ads-blocked-modal"
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    )
      div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4(
        v-if="isAdsBlockedModalShown"
        @click="dismissAdsBlockedModal"
      )
        //- Backdrop
        div.absolute.inset-0(class="bg-[var(--ui-backdrop)]")

        //- Card
        div.ui-panel.ui-stitch-dark.ui-pop-in.relative.w-full.max-w-md.text-center(
          class="p-6 !border-4 !border-ink shadow-[0_6px_0_var(--color-ink)]"
          @click.stop
        )
          div.mb-2.text-5xl 🛡️
          h2.ui-title.text-ink.mb-2 {{ t('adsBlocked.title') }}
          p.text-base.font-extrabold.mb-4(class="text-ink") {{ t('adsBlocked.body') }}
          //- The hostname is interpolated INSIDE the i18n message rather than
          //- concatenated around it — word order around "allow ads on <host>"
          //- differs per language (in ja/ko/zh the host comes first).
          p.text-sm.font-extrabold.mb-5(class="text-ink-soft")
            i18n-t(keypath="sfc.AdsBlockedModal.adsBlocked.allowHost" tag="span" scope="global")
              template(#host)
                span.font-mono.font-black(class="text-sky-700") {{ host }}

          button.ui-btn.ui-btn--primary.w-full.text-lg(
            type="button"
            class="py-3"
            @click="dismissAdsBlockedModal"
          ) {{ t('adsBlocked.gotIt') }}
</template>
