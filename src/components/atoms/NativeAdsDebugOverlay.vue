<script setup lang="ts">
// Tiny on-device debug HUD for the native AdMob state. Mobile builds have no
// JS console the developer can reach (no Mac → no Console.app, no Safari Web
// Inspector without a paired Mac), so this overlay is the only diagnostic
// surface for a sideloaded APK or a TestFlight build.
//
// Mounted from App.vue when `isNative && isDebug`. Tap anywhere on the overlay
// to collapse it to a single status pill so it stops covering gameplay; tap
// again to expand.
//
// Replaces LevelPlayDebugOverlay: there is no LevelPlay Test Suite button here
// because AdMob has no equivalent overlay. The "TEST ADS" badge takes its
// place — it tells a tester at a glance whether the build is pulling Google's
// always-filling test creatives or live inventory.
import { computed, ref } from 'vue'
import { adMobDebug } from '@/use/ads/AdMobProvider'
import { isAdsReady, isRewardedReady } from '@/use/useAds'

const collapsed = ref(false)

const initBadgeColor = computed(() => {
  switch (adMobDebug.value.initState) {
    case 'ready':
      return 'bg-green-600'
    case 'failed':
      return 'bg-red-600'
    case 'no-ad-unit':
      return 'bg-orange-600'
    case 'starting':
      return 'bg-amber-500'
    default:
      return 'bg-zinc-600'
  }
})

const dot = (b: boolean): string => (b ? '●' : '○')
const dotColor = (b: boolean): string => (b ? 'text-green-400' : 'text-red-400')
</script>

<template lang="pug">
  div.fixed.top-2.right-2.z-50.text-xs.font-mono.select-none.pointer-events-auto(
    @click="collapsed = !collapsed"
    style="text-shadow: 0 1px 2px rgba(0,0,0,0.9)"
  )
    //- Collapsed: single pill with init state + readiness
    div.px-2.py-1.rounded.text-white(
      v-if="collapsed"
      :class="initBadgeColor"
    )
      | AdMob {{ adMobDebug.initState }} · sdk={{ isAdsReady ? '1' : '0' }}/r={{ isRewardedReady ? '1' : '0' }}

    //- Expanded: full table
    div(v-else class="bg-black/85 text-white rounded p-2 max-w-[80vw] w-[260px] space-y-1")
      div.flex.items-center.justify-between
        span.font-bold AdMob debug
        span.px-2.rounded.text-xs(class="py-0.5" :class="initBadgeColor") {{ adMobDebug.initState }}

      div.text-zinc-300
        | platform: {{ adMobDebug.platform }}
      div(:class="dotColor(adMobDebug.adUnitConfigured)")
        | {{ dot(adMobDebug.adUnitConfigured) }} {{ adMobDebug.adFormat }} unit
      div.font-bold(v-if="adMobDebug.usingTestAds" class="text-amber-400")
        | ⚠ TEST ADS — not live inventory

      div.border-t.border-zinc-700.pt-1.mt-1
        div(:class="dotColor(isAdsReady)") {{ dot(isAdsReady) }} sdk ready
        div(:class="dotColor(isRewardedReady)") {{ dot(isRewardedReady) }} rewarded loaded

      div.text-red-300.break-all(v-if="adMobDebug.initError")
        | init err: {{ adMobDebug.initError }}
      div.text-red-300.break-all(v-if="adMobDebug.lastRewardedShowError")
        | rew err: {{ adMobDebug.lastRewardedShowError }}

      div.border-t.border-zinc-700.pt-1.mt-1(class="space-y-0.5")
        div.text-zinc-400(class="text-[0.75rem]") events (newest last)
        div.text-zinc-100.leading-tight.break-words(
          v-for="(e, i) in adMobDebug.events"
          :key="i"
          class="text-[0.75rem]"
        ) {{ e }}
        div.text-zinc-500(v-if="!adMobDebug.events.length" class="text-[0.75rem]") (none yet)

      div.text-zinc-500.pt-1(class="text-[0.75rem]") tap to collapse
</template>
