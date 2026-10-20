<script setup lang="ts">
import { computed } from 'vue'

/**
 * ─── The plane the prize stands on ──────────────────────────────────────────
 *
 * Ported from glyphyx's `RewardStage` (two counter-swaying sunbursts, a pool
 * of light, a flare when the lid comes off) but built for this project's
 * perf rule: NO radial gradients, masks, filters or blurs. The sunburst is
 * flat SVG wedges, the "pool of light" is three solid discs at falling
 * opacity, and every animation is a transform or an opacity — composited,
 * never re-rasterised.
 *
 * `pointer-events: none` is load-bearing: a tap anywhere on the reward
 * overlay continues, so this layer must never swallow it.
 */
const props = withDefaults(defineProps<{
  /** Rays up and swaying. */
  active?: boolean
  /** Flare once (false → true). */
  burst?: boolean
  tone?: string
  /** Low-quality tier: static rays, no sway. */
  still?: boolean
}>(), { active: false, burst: false, tone: '#ffd21a', still: false })

const WEDGES = 14
const wedge = (i: number, inner: number, outer: number, halfDeg: number): string => {
  const a = (i / WEDGES) * Math.PI * 2
  const h = (halfDeg * Math.PI) / 180
  const p = (r: number, ang: number) => `${(Math.cos(ang) * r).toFixed(2)},${(Math.sin(ang) * r).toFixed(2)}`
  return `M${p(inner, a - h * 0.35)} L${p(outer, a - h)} L${p(outer, a + h)} L${p(inner, a + h * 0.35)} Z`
}
const backRays = Array.from({ length: WEDGES }, (_, i) => wedge(i, 16, 100, 7.5)).join(' ')
const frontRays = Array.from({ length: WEDGES }, (_, i) => wedge(i + 0.5, 20, 92, 3.2)).join(' ')

const style = computed(() => ({ '--tone': props.tone }))
</script>

<template lang="pug">
  div.reward-stage(
    v-if="active"
    :class="{ 'is-burst': burst, 'is-still': still }"
    :style="style"
    aria-hidden="true"
  )
    svg.reward-stage__rays.is-back(viewBox="-100 -100 200 200")
      path(:d="backRays" :fill="tone" fill-opacity="0.22")
    svg.reward-stage__rays.is-front(viewBox="-100 -100 200 200")
      path(:d="frontRays" fill="#ffffff" fill-opacity="0.16")
    div.reward-stage__pool
      span.reward-stage__disc.is-1
      span.reward-stage__disc.is-2
      span.reward-stage__disc.is-3
</template>

<style scoped lang="sass">
.reward-stage
  position: fixed
  inset: 0
  z-index: 0
  pointer-events: none
  overflow: hidden

.reward-stage__rays
  position: absolute
  left: 50%
  top: 46%
  width: 170vmax
  height: 170vmax
  margin-left: -85vmax
  margin-top: -85vmax
  will-change: transform

  &.is-back
    animation: stage-turn 60s linear infinite
  &.is-front
    animation: stage-turn-back 44s linear infinite

.reward-stage__pool
  position: absolute
  left: 50%
  top: 46%
  width: 0
  height: 0

// A glow as stacked SOLID discs — the flat stand-in for a radial bloom.
.reward-stage__disc
  position: absolute
  border-radius: 50%
  background-color: var(--tone)
  transform: translate(-50%, -50%)

  &.is-1
    width: 82vmin
    height: 82vmin
    opacity: 0.1
  &.is-2
    width: 58vmin
    height: 58vmin
    opacity: 0.14
  &.is-3
    width: 36vmin
    height: 36vmin
    opacity: 0.2
    animation: pool-breathe 3.2s ease-in-out infinite

.reward-stage.is-burst
  .reward-stage__pool
    animation: pool-flash 0.7s cubic-bezier(0.16, 1, 0.3, 1)
  .reward-stage__rays
    animation-name: stage-kick, stage-turn
    animation-duration: 0.7s, 60s
    animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1), linear
    animation-iteration-count: 1, infinite
    animation-delay: 0s, 0.7s
  .reward-stage__rays.is-front
    animation-name: stage-kick, stage-turn-back
    animation-duration: 0.7s, 44s

@keyframes stage-turn
  to
    transform: rotate(360deg)

@keyframes stage-turn-back
  to
    transform: rotate(-360deg)

@keyframes stage-kick
  0%
    transform: scale(0.55)
    opacity: 0
  45%
    transform: scale(1.06)
    opacity: 1
  100%
    transform: scale(1)
    opacity: 1

@keyframes pool-flash
  0%
    transform: scale(0.4)
  35%
    transform: scale(1.25)
  100%
    transform: scale(1)

@keyframes pool-breathe
  0%, 100%
    transform: translate(-50%, -50%) scale(1)
  50%
    transform: translate(-50%, -50%) scale(1.08)

.reward-stage.is-still
  .reward-stage__rays, .reward-stage__pool, .reward-stage__disc
    animation: none !important

@media (prefers-reduced-motion: reduce)
  .reward-stage__rays, .reward-stage__pool, .reward-stage__disc
    animation: none !important
</style>
