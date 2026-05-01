<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useSpinnerConfig from '@/use/useSpinnerConfig'

interface Props {
  /** How many coins the player gets after watching the ad. */
  coins?: number
}

const props = withDefaults(defineProps<Props>(), {
  coins: 125
})

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { addCoins } = useSpinnerConfig()
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
// obvious workaround would be to refresh — closing the loophole). The
// reactive `tickNow` is bumped every second so the computed gates
// re-evaluate without the parent having to manage a timer.
const COOLDOWN_MS = 30_000
const COOLDOWN_KEY = 'spinner_ad_button_ready_at'

const adReadyAt = ref(parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10))
const tickNow = ref(Date.now())
let tickIntervalId: number | null = null

const cooldownActive = computed(() => tickNow.value < adReadyAt.value)
const isVisible = computed(() => isRewardedReady.value && !cooldownActive.value)

onMounted(() => {
  tickIntervalId = window.setInterval(() => {
    tickNow.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tickIntervalId !== null) clearInterval(tickIntervalId)
})

// Coins are only granted once the rewarded video played all the way
// through — whichever ad provider the active build selected.
const triggerAdReward = async () => {
  if (cooldownActive.value) return
  const ok = await showRewardedAd()
  if (ok) {
    grantReward()
    // Arm the 30s cooldown ONLY on a successful watch — a no-fill or
    // user-skipped ad shouldn't punish the player by hiding the button.
    adReadyAt.value = Date.now() + COOLDOWN_MS
    localStorage.setItem(COOLDOWN_KEY, adReadyAt.value.toString())
  }
}

const grantReward = () => {
  addCoins(props.coins)
  if (rootEl.value) emit('coins-awarded', rootEl.value)
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
          span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ coins }}
          IconCoin.inline(class="w-4 h-4 text-yellow-300")
        img.object-contain(
          src="/images/icons/movie_128x96.webp"
          class="h-5 w-5 sm:h-5 sm:w-5"
        )
</template>
