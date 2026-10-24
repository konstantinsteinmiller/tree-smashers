<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { prependBaseUrl } from '@/utils/function'
import { registerCoinBadge } from '@/use/useCoinExplosion'
import { currentReveal } from '@/use/useRewardReveal'

const { coins, diamonds } = useSpinnerConfig()

// Fancy, higher-fidelity diamond used specifically for the HUD badge (the
// plain diamond lives in the reusable IconDiamond component used elsewhere).
const diamondFancySrc = prependBaseUrl('images/icons/diamond-fancy_256x256.webp')

// Exposed so siblings can target the badge for fly-to VFX:
//   • rootEl            — coin-explosion target (whole badge / coin row), and
//                         the diamond target while the diamond row is hidden
//   • diamondRowEl      — diamond-explosion target (the diamond row)
//   • celebrateDiamonds — "+N" diamond pop + badge bump when diamonds land
const rootEl = ref<HTMLElement | null>(null)
const diamondRowEl = ref<HTMLElement | null>(null)

// Built once — a bump allocates nothing.
const BUMP_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.14)', offset: 0.35 },
  { transform: 'scale(1)' }
]
const BUMP_TIMING: KeyframeAnimationOptions = { duration: 360, easing: 'ease-out' }

// The pop is teleported to <body> and pinned beside the badge: every diamond
// reward lands while a reward overlay (z-100, blurred) covers the HUD, so a
// pop rendered inside the badge would sit under it. `id` re-keys the node so
// a second landing restarts the animation; amounts that land while a pop is
// still up are summed.
const diamondPop = ref<{ id: number, amount: number, left: string, top: string } | null>(null)
let popSeq = 0

const celebrateDiamonds = (amount: number) => {
  const el = rootEl.value
  if (!el || amount <= 0) return
  if (typeof el.animate === 'function') el.animate(BUMP_KEYFRAMES, BUMP_TIMING)
  const r = el.getBoundingClientRect()
  diamondPop.value = {
    id: ++popSeq,
    amount: (diamondPop.value?.amount ?? 0) + amount,
    left: `${r.left}px`,
    top: `${r.top + r.height / 2}px`
  }
}

// ─── Count-up ──────────────────────────────────────────────────────────────
// The balance COUNTS to its new value (ease-out) instead of jumping, then the
// badge bumps once. Gains count in sun yellow, spends in white. Shows the real
// value at once on mount and under reduced motion. Raw integers, as before
// (no locale grouping).
//
// #UX1b — a GAIN waits for its coins: when a coin burst is flying at this
// badge (useCoinExplosion → `coinsInbound`) the count starts with the first
// coin landing and runs across the shower, so every landing tick moves the
// number. While the gift reveal covers the screen the gain also waits (the
// caller flies its coins once the reveal is dismissed). With no burst coming
// the count starts after a short beat, so a plain grant still counts.
const shown = ref(coins.value)
const counting = ref<'up' | 'down' | null>(null)
let raf = 0
const stopCount = () => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}
const reducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

// #UX1c — a "+N" sun pop beside the badge as a GAIN starts counting, so a big
// grant reads even when the count itself is short. Teleported like the
// diamond pop (it may start while a reward overlay is still fading out);
// gains that start while a pop is up are summed into it.
const coinPop = ref<{ id: number, amount: number, left: string, top: string } | null>(null)
const popCoins = (amount: number) => {
  const el = rootEl.value
  if (!el || amount <= 0) return
  const r = el.getBoundingClientRect()
  coinPop.value = {
    id: ++popSeq,
    amount: (coinPop.value?.amount ?? 0) + amount,
    left: `${r.left}px`,
    top: `${r.top + r.height / 2}px`
  }
}

const countTo = (to: number, durMs?: number) => {
  stopCount()
  const from = shown.value
  if (from === to) return
  if (to > from) popCoins(to - from)
  if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
    shown.value = to
    return
  }
  counting.value = to > from ? 'up' : 'down'
  const dur = durMs ?? Math.min(900, 350 + Math.log10(Math.abs(to - from) + 1) * 180)
  const t0 = performance.now()
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / dur)
    shown.value = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))
    if (k < 1) {
      raf = requestAnimationFrame(frame)
      return
    }
    raf = 0
    shown.value = to
    const wasUp = counting.value === 'up'
    counting.value = null
    const el = rootEl.value
    if (wasUp && el && typeof el.animate === 'function') el.animate(BUMP_KEYFRAMES, BUMP_TIMING)
  }
  raf = requestAnimationFrame(frame)
}

/** A gain waiting for its coins to land (null: nothing held). */
let heldTarget: number | null = null
let holdTimer = 0
/** A coin burst is flying here; its first landing releases the count. */
let inbound: { span: number, safety: number } | null = null
/** No count is ever held longer than this past the moment it could start. */
const MAX_HOLD_MS = 2600

const releaseHeld = (durMs?: number) => {
  window.clearTimeout(holdTimer)
  holdTimer = 0
  if (heldTarget === null) return
  const to = heldTarget
  heldTarget = null
  countTo(to, durMs)
}
const releaseAfter = (ms: number) => {
  window.clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => releaseHeld(), ms)
}

watch(coins, (to, from) => {
  if (to <= from || reducedMotion()) {
    heldTarget = null
    countTo(to)
    return
  }
  heldTarget = to
  if (inbound) return
  // The gift reveal is up: hold until it closes (watcher below). Otherwise
  // give a burst one beat to announce itself, then count anyway.
  if (currentReveal.value) releaseAfter(60_000)
  else releaseAfter(160)
})

watch(currentReveal, (r) => {
  if (!r && heldTarget !== null && !inbound) releaseAfter(450)
})

// Icon bump per landing, throttled so a shower reads as a drum roll.
const ICON_BUMP: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.22) rotate(-6deg)', offset: 0.4 },
  { transform: 'scale(1)' }
]
const iconRef = ref<HTMLElement | null>(null)
let lastIconBump = 0

let unregister: (() => void) | null = null
onMounted(() => {
  if (!rootEl.value) return
  unregister = registerCoinBadge({
    el: rootEl.value,
    coinsInbound: (firstMs, lastMs) => {
      window.clearTimeout(holdTimer)
      if (inbound) window.clearTimeout(inbound.safety)
      const span = Math.max(280, lastMs - firstMs + 160)
      inbound = {
        span,
        // Whatever happens to the particles, the number lands.
        safety: window.setTimeout(() => {
          inbound = null
          releaseHeld()
        }, Math.min(MAX_HOLD_MS, lastMs + 300))
      }
    },
    landed: (k, _n, variant) => {
      if (k === 1 && inbound && variant === 'coin') {
        const span = inbound.span
        window.clearTimeout(inbound.safety)
        inbound = null
        releaseHeld(span)
      }
      const icon = iconRef.value
      const now = performance.now()
      if (icon && typeof icon.animate === 'function' && now - lastIconBump > 70 && !reducedMotion()) {
        lastIconBump = now
        icon.animate(ICON_BUMP, { duration: 160, easing: 'ease-out' })
      }
    }
  })
})
onBeforeUnmount(() => {
  stopCount()
  window.clearTimeout(holdTimer)
  if (inbound) window.clearTimeout(inbound.safety)
  unregister?.()
})

defineExpose({ rootEl, diamondRowEl, celebrateDiamonds })
</script>

<template lang="pug">
  //- Two-row currency badge: coins on top, diamonds below. Icons share the
  //- first column; values are right-aligned in the second column.
  div.coin-badge.relative.font-bold(
    ref="rootEl"
    class="rounded-2xl pl-1 pr-3 py-1 text-sm sm:text-base"
  )
    div.relative.grid.items-center(class="grid-cols-[auto_1fr] gap-x-2 gap-y-1")
      //- Coin row
      div.coin-badge__icon.flex.items-center.justify-center.rounded-full(
        ref="iconRef"
        class="w-7 h-7 sm:w-8 sm:h-8"
      )
        IconCoin(class="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-[0_1px_0_var(--color-ink)]")
      span.game-text.coin-badge__value.justify-self-end(:class="{ 'is-gaining': counting === 'up' }") {{ shown }}

      ////- Diamond row
      //div.flex.items-center.justify-center.rounded-full(
      //  ref="diamondRowEl"
      //  class="w-7 h-7 sm:w-8 sm:h-8"
      //)
      //  img.object-contain(
      //    :src="diamondFancySrc"
      //    alt="diamonds"
      //    draggable="false"
      //    class="w-7 h-7 sm:w-8 sm:h-8"
      //  )
      //span.game-text.coin-badge__value.coin-badge__value--diamond.justify-self-end {{ diamonds }}

    //- "+N" diamond pop, just left of the badge — same fancy diamond and
    //- diamond value styling as the (hidden) diamond row. Decorative: the
    //- reward screen that fired it already states the amount.
    Teleport(to="body")
      div.coin-badge-pop.flex.items-center.font-bold(
        v-if="diamondPop"
        :key="diamondPop.id"
        class="gap-0.5 pr-1.5 text-sm sm:text-base"
        :style="{ left: diamondPop.left, top: diamondPop.top }"
        aria-hidden="true"
        @animationend="diamondPop = null"
      )
        img.object-contain(
          :src="diamondFancySrc"
          alt=""
          draggable="false"
          class="w-6 h-6 sm:w-7 sm:h-7"
        )
        span.game-text.coin-badge__value.coin-badge__value--diamond +{{ diamondPop.amount }}
    //- "+N" coin pop (#UX1c): a skewed sun chip with the coin, beside the
    //- badge while the gain counts. Decorative (the count is the value).
    Teleport(to="body")
      div.coin-badge-pop.coin-badge-pop--coin.flex.items-center(
        v-if="coinPop"
        :key="coinPop.id"
        :style="{ left: coinPop.left, top: coinPop.top }"
        aria-hidden="true"
        data-coin-pop
        @animationend.self="coinPop = null"
      )
        span.coin-pop__plate.flex.items-center
          IconCoin.coin-pop__icon
          span.coin-pop__num +{{ coinPop.amount }}
</template>

<style scoped lang="sass">
// Royal faceted counter plate, coin value in white with an ink outline (sun
// while a gain counts up). 0-blur shadows only.
.coin-badge
  background-color: var(--color-royal-600)
  background-image: var(--ui-facet)
  border: var(--ui-border-w, 3px) solid var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-royal-400), inset 0 -4px 0 var(--color-royal-800), 0 4px 0 var(--color-ink)
  overflow: hidden

  &__value
    color: var(--color-cream-50)
    text-shadow: 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 1px 0 var(--color-ink), 0 -1px 0 var(--color-ink), 0 2px 0 var(--color-ink)
    letter-spacing: 0.02em
    position: relative
    font-weight: 900
    font-variant-numeric: tabular-nums
    transition: color 0.15s ease

    &.is-gaining
      color: var(--color-sun-300)

  &__value--diamond
    color: var(--color-plum-300)

// Pinned by its right-centre to the badge's left-centre (left/top come from
// the badge rect), above the reward overlays' z-100.
.coin-badge-pop
  position: fixed
  z-index: 110
  pointer-events: none
  white-space: nowrap
  animation: coin-badge-pop 1.2s ease-out forwards

@keyframes coin-badge-pop
  0%
    opacity: 0
    transform: translate(-80%, -50%) scale(0.5)
  18%
    opacity: 1
    transform: translate(-100%, -50%) scale(1.2)
  32%
    transform: translate(-100%, -50%) scale(1)
  75%
    opacity: 1
    transform: translate(-100%, -80%) scale(1)
  100%
    opacity: 0
    transform: translate(-100%, -110%) scale(1)

// The coin pop: a small skewed sun plate (navy outline, lip, drop), the coin
// overlapping its left end, the amount in navy 900 tabular digits.
.coin-badge-pop--coin
  margin-left: -0.5rem

.coin-pop__plate
  gap: 0.15rem
  padding: 0.05rem 0.55rem 0.1rem 0.15rem
  border: 2px solid var(--color-ink)
  border-radius: 0.45rem
  background-color: var(--color-sun-400)
  background-image: var(--ui-facet)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 3px 0 var(--color-ink)
  transform: skewX(-10deg)

.coin-pop__icon
  width: 1.35rem
  height: 1.35rem
  transform: skewX(10deg)
  filter: drop-shadow(0 1px 0 var(--color-ink))

.coin-pop__num
  transform: skewX(10deg)
  color: var(--color-ink)
  font-weight: 900
  font-size: 0.9rem
  font-variant-numeric: tabular-nums
  line-height: 1.2

@media (prefers-reduced-motion: reduce)
  .coin-badge-pop
    animation-name: coin-badge-pop-fade

@keyframes coin-badge-pop-fade
  0%
    opacity: 0
    transform: translate(-100%, -50%)
  15%, 75%
    opacity: 1
    transform: translate(-100%, -50%)
  100%
    opacity: 0
    transform: translate(-100%, -50%)
</style>
