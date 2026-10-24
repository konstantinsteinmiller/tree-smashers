<script setup lang="ts">
import { hudToast } from '@/use/useHudToast'

/**
 * ─── HUD toast (#UX1c) ──────────────────────────────────────────────────────
 *
 * A navy pill with a tone-coloured check sticker that drops in under the top
 * HUD row, holds and slides back up (`useHudToast`). Not interactive
 * (pointer-events none), `role="status"` so screen readers hear it once.
 * Transform / opacity only; reduced motion: a plain fade.
 */
</script>

<template lang="pug">
  div.hud-toast-host(role="status" aria-live="polite")
    Transition(name="hud-toast")
      div.hud-toast(v-if="hudToast" :key="hudToast.id" :class="'hud-toast--' + hudToast.tone" data-testid="hud-toast")
        span.hud-toast__check(aria-hidden="true")
          svg(viewBox="0 0 24 24")
            path(d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round")
        span.hud-toast__text {{ hudToast.text }}
</template>

<style scoped lang="sass">
.hud-toast-host
  position: fixed
  left: 0
  right: 0
  top: calc(4.6rem + env(safe-area-inset-top, 0px))
  display: flex
  justify-content: center
  pointer-events: none
  z-index: 115

.hud-toast
  --tone: var(--color-leaf-500)
  --tone-dark: var(--color-leaf-700)
  display: inline-flex
  align-items: center
  gap: 0.5rem
  max-width: calc(100vw - 2rem)
  padding: 0.35rem 1rem 0.4rem 0.4rem
  border: 3px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-royal-900)
  background-image: var(--ui-facet)
  box-shadow: inset 0 3px 0 var(--color-royal-700), 0 5px 0 var(--color-ink)
  color: var(--color-ice-50)
  font-weight: 900
  font-size: clamp(0.85rem, 3.4vmin, 1.1rem)
  line-height: 1.15
  text-shadow: var(--ui-stroke-sm)

.hud-toast--sun
  --tone: var(--color-sun-400)
  --tone-dark: var(--color-sun-600)
.hud-toast--royal
  --tone: var(--color-royal-500)
  --tone-dark: var(--color-royal-700)

.hud-toast__check
  flex: 0 0 auto
  display: grid
  place-items: center
  width: 1.9rem
  height: 1.9rem
  border: 2px solid var(--color-ink)
  border-radius: 50%
  background-color: var(--tone)
  box-shadow: inset 0 -3px 0 var(--tone-dark)
  color: var(--color-ice-50)
  svg
    width: 1.15rem
    height: 1.15rem
    filter: drop-shadow(0 1px 0 var(--color-ink))

.hud-toast__text
  overflow-wrap: anywhere

.hud-toast-enter-active
  animation: hud-toast-in 0.42s var(--ui-back-out)
.hud-toast-leave-active
  animation: hud-toast-in 0.24s ease-in reverse

@keyframes hud-toast-in
  0%
    translate: 0 -140%
    scale: 0.8
    opacity: 0
  100%
    translate: 0 0
    scale: 1
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .hud-toast-enter-active, .hud-toast-leave-active
    animation: hud-toast-fade 0.2s linear
  .hud-toast-leave-active
    animation-direction: reverse

@keyframes hud-toast-fade
  from
    opacity: 0
  to
    opacity: 1
</style>
