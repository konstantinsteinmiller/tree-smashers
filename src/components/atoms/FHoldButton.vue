<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { playUiSfx } from '@/use/uiSfx'

/**
 * ─── Hold-to-confirm (#UX1b) ────────────────────────────────────────────────
 *
 * The LAST step of a destructive action (Reset progress, Surrender → Quit):
 * a danger `.ui-btn` the player has to HOLD while a sun ring draws itself
 * around the button; it fires the moment the ring closes. Letting go early
 * rewinds the ring fast, and a plain tap nudges the button sideways and
 * flashes the "Hold to confirm" hint under it — a mis-tap can never wipe a
 * save or throw a fight.
 *
 * Accessibility: keyboard and assistive-tech activation (a click with
 * `detail === 0`: Enter / Space, switch access, screen-reader double-tap)
 * confirms at once — the dialog around this button already is the
 * confirmation, and a timed hold is not a fair ask there. The hint is the
 * button's aria-description. Reduced motion: the ring still fills (it is
 * the progress, not decoration) but linearly, with no shake.
 *
 * Feel: the global press handler sinks the button while it is held; a
 * rising `tick` marks each quarter of the ring, the release pip plays on
 * success.
 */
interface Props {
  /** How long the hold takes (ms). */
  holdMs?: number
  tone?: 'danger' | 'primary' | 'premium'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { holdMs: 900, tone: 'danger', disabled: false })
const emit = defineEmits<{ (e: 'confirm'): void }>()
const { t } = useI18n()
const hintId = `hold-hint-${useId()}`

const btnRef = ref<HTMLElement | null>(null)
const holding = ref(false)
const nudge = ref(0)
let timer = 0
let ticks: number[] = []
let fired = false

const clearTimers = () => {
  window.clearTimeout(timer)
  timer = 0
  for (const id of ticks) window.clearTimeout(id)
  ticks = []
}

const start = (e: PointerEvent) => {
  if (props.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
  clearTimers()
  fired = false
  holding.value = true
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch { /* not capturable */ }
  for (let q = 1; q <= 3; q++) {
    ticks.push(window.setTimeout(() => playUiSfx('tick', { pitch: 1 + q * 0.18 }), (props.holdMs * q) / 4))
  }
  timer = window.setTimeout(() => {
    timer = 0
    fired = true
    holding.value = false
    playUiSfx('release')
    emit('confirm')
  }, props.holdMs)
}

const cancel = () => {
  if (!holding.value) return
  clearTimers()
  holding.value = false
}

const onClick = (e: MouseEvent) => {
  if (props.disabled) return
  if (e.detail === 0) {
    // Keyboard / assistive tech: no hold asked.
    emit('confirm')
    return
  }
  if (fired) {
    fired = false
    return
  }
  // A tap that let go early: show how it works (shake + hint hop + bonk).
  nudge.value++
  const el = btnRef.value
  if (el) {
    el.classList.remove('ui-deny')
    void el.offsetWidth
    el.classList.add('ui-deny')
    window.setTimeout(() => el.classList.remove('ui-deny'), 360)
  }
  playUiSfx('deny')
}

onBeforeUnmount(clearTimers)

const style = computed(() => ({ '--hold-ms': `${props.holdMs}ms` }))
</script>

<template lang="pug">
  div.f-hold
    button.f-hold-btn.ui-btn(
      ref="btnRef"
      type="button"
      :class="[`ui-btn--${tone}`, { 'is-holding': holding, 'is-disabled': disabled }]"
      :style="style"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-describedby="hintId"
      data-sfx="press"
      @pointerdown="start"
      @pointerup="cancel"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @click="onClick"
      @contextmenu.prevent
    )
      //- The ring: an SVG rounded rect whose stroke draws itself around the
      //- button while it is held (pathLength 100 → dashoffset 100 → 0).
      svg.f-hold-ring(aria-hidden="true" preserveAspectRatio="none")
        rect(pathLength="100")
      span.f-hold-label
        slot
    span.f-hold-hint(:id="hintId" :key="nudge" :class="{ 'is-nudged': nudge > 0 }") {{ t('holdToConfirm') }}
</template>

<style scoped lang="sass">
.f-hold
  display: inline-flex
  flex-direction: column
  align-items: center
  gap: 0.3rem

.f-hold-btn
  -webkit-touch-callout: none
  touch-action: none
  overflow: visible

.f-hold-label
  position: relative
  z-index: 2

// The ring sits on the button's outline. Flat stroke, no glow.
.f-hold-ring
  position: absolute
  inset: -6px
  width: calc(100% + 12px)
  height: calc(100% + 12px)
  overflow: visible
  pointer-events: none
  z-index: 3

  // Geometry as CSS so the ring follows the button's size.
  rect
    x: 3px
    y: 3px
    width: calc(100% - 6px)
    height: calc(100% - 6px)
    rx: 19px
    ry: 19px
    fill: none
    stroke: var(--color-sun-300)
    stroke-width: 5
    stroke-linecap: round
    stroke-dasharray: 100
    stroke-dashoffset: 100
    // Letting go rewinds fast.
    transition: stroke-dashoffset 0.18s ease-out

.f-hold-btn.is-holding .f-hold-ring rect
  stroke-dashoffset: 0

// An empty dash still paints a sliver (a round cap even a dot): the ring is
// only shown while it fills, and fades out as it rewinds.
.f-hold-ring
  opacity: 0
  transition: opacity 0.18s ease-out

.f-hold-btn.is-holding .f-hold-ring
  opacity: 1
  transition-duration: 0s
  transition: stroke-dashoffset var(--hold-ms) linear

// The hint under the button; a tap that let go early makes it
// hop and turn berry, and the button shakes (the shared deny shake).
// A small navy pill with white caps: readable on the ice card (surrender)
// and on the royal modal frame (the reset footer) alike.
.f-hold-hint
  display: inline-block
  padding: 0.18em 0.65em 0.22em
  border-radius: 999px
  background-color: var(--color-royal-900)
  color: var(--color-ice-50)
  font-weight: 900
  font-size: 0.7rem
  line-height: 1.1
  text-align: center
  white-space: nowrap

  &.is-nudged
    background-color: var(--color-berry-600)
    animation: hold-hint-hop 0.42s var(--ui-back-out)

@keyframes hold-hint-hop
  0%
    scale: 1
  35%
    scale: 1.18
  100%
    scale: 1

@media (prefers-reduced-motion: reduce)
  .f-hold-hint.is-nudged
    animation: none
</style>
