<script setup lang="ts">
// ─── AdsBlockedModal ────────────────────────────────────────────────────
//
// Shown when the player tapped a "watch ad" button and:
//   1. The active ad provider returned `false` (no reward granted), AND
//   2. That provider has detected an ad-blocker is interfering with its
//      ad-fetch chain.
//
// Same component services every ad backend the game ships with
// (CrazyGames, GameDistribution, LevelPlay-on-native, Noop) — each
// provider populates its own `isAdsBlocked` ref via SDK-specific
// detection (CG's `sdk.ad.hasAdblock()`, GD's SDK_ERROR `Blocked:`
// pattern, etc.) and `useAds.showRewardedAd()` is the single seam that
// flips the modal-visible flag. Mounted unconditionally in App.vue;
// visibility is purely reactive on the flag.
//
// Wording is kid-safe because chaos-arena targets ages 6+. No mention
// of "ad blocker brand X", no urging to disable site-wide — just a
// gentle "we couldn't show your ad, please allow ads here to earn the
// reward". Adult-audience games can swap copy via a simple text edit.

import { computed } from 'vue'
import { dismissAdsBlockedModal, isAdsBlockedModalShown } from '@/use/useAds'

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
        div.absolute.inset-0(class="bg-black/70 backdrop-blur-sm")

        //- Card
        div.relative.w-full.max-w-md.rounded-2xl.text-white.shadow-2xl.text-center(
          class="bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-slate-500 p-6"
          @click.stop
        )
          div.mb-2.text-5xl 🛡️
          h2.text-2xl.font-bold.mb-2 Couldn't show ad
          p.text-base.mb-4(class="text-slate-200")
            | We tried to show you a video so you could earn your reward, but
            | something on your browser is blocking ads.
          p.text-sm.mb-5(class="text-slate-300")
            | Please allow ads on
            |
            span.font-mono.font-bold(class="text-amber-300") {{ host }}
            |
            | (or pause your ad-blocker for this game) and try again.

          button.w-full.rounded-lg.font-bold.text-lg.text-white.shadow-lg(
            class="bg-amber-500 hover:bg-amber-400 active:translate-y-px py-3"
            @click="dismissAdsBlockedModal"
          ) Got it
</template>
