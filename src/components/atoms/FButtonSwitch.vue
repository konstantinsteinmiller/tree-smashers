<script setup lang="ts" generic="T extends string | number">
// Multi-option segmented switch (the arena's 1x / 2x speed). One button per
// option inside a recessed navy well, and ONE raised lime puck (lip + gloss +
// hard drop) that SLIDES under the active option when the choice changes —
// the selection travels instead of popping per segment (#UX1b). The puck is
// measured from the active button (offsetLeft / offsetWidth, layout values
// that ignore the scale-90 wrapper), re-measured on resize / font load.
// Click events bubble up via `click` so the parent can decide whether to
// actually change the model value (e.g. gating a choice behind a rewarded
// video). Press feel + the `tab` tick come from the global press handler
// (useUiPress.ts) via role="radio".
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Option {
  value: T
}

interface Props {
  modelValue: T
  options: Option[]
  /** Options shown but not tappable (e.g. a price the player can't pay). */
  disabledValues?: T[]
}

const props = withDefaults(defineProps<Props>(), { disabledValues: () => [] })
const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void
  (e: 'click', value: T): void
}>()

const onClick = (value: T) => {
  emit('click', value)
  emit('update:modelValue', value)
}

// ─── The sliding puck ───────────────────────────────────────────────────────
const pillRef = ref<HTMLElement | null>(null)
const puck = ref<{ x: number, w: number } | null>(null)
/** False until the first measurement lands, so the puck appears in place
 *  instead of sliding in from the left edge. */
const ready = ref(false)

const measure = () => {
  const pill = pillRef.value
  if (!pill) return
  const idx = props.options.findIndex(o => o.value === props.modelValue)
  const btn = pill.querySelectorAll<HTMLElement>('.switch-opt')[idx]
  if (!btn) {
    puck.value = null
    return
  }
  // The button sits in a .button-wrap; both offsets are relative to the pill.
  const wrap = btn.parentElement as HTMLElement
  puck.value = { x: wrap.offsetLeft + btn.offsetLeft, w: btn.offsetWidth }
}

watch(() => [props.modelValue, props.options.length], () => nextTick(measure))

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  requestAnimationFrame(() => { ready.value = true })
  if (typeof ResizeObserver !== 'undefined' && pillRef.value) {
    ro = new ResizeObserver(measure)
    ro.observe(pillRef.value)
  }
  void document.fonts?.ready.then(measure).catch(() => {})
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template lang="pug">
  div.button-switch.relative.inline-block
    div.switch-pill.relative.flex(ref="pillRef" role="radiogroup")
      span.switch-puck(
        v-if="puck"
        aria-hidden="true"
        :class="{ 'is-ready': ready }"
        :style="{ transform: `translateX(${puck.x}px)`, width: `${puck.w}px` }"
      )
      div.relative.button-wrap(v-for="option in options" :key="option.value")
        button.switch-opt.relative.cursor-pointer.font-black.leading-none(
          type="button"
          role="radio"
          :aria-checked="modelValue === option.value"
          class="px-3 py-1.5 text-xs sm:text-sm disabled:cursor-not-allowed"
          :class="modelValue === option.value ? 'is-active' : disabledValues.includes(option.value) ? 'is-disabled' : ''"
          :disabled="disabledValues.includes(option.value)"
          @click="onClick(option.value)"
        )
          slot(name="default" :option="option" :is-active="modelValue === option.value") {{ option.value }}
        slot(name="hint" :option="option" :is-active="modelValue === option.value")
</template>

<style scoped lang="sass">
// Recessed navy well (the puck stands up out of it).
.switch-pill
  gap: 2px
  padding: 2px
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-royal-900)
  box-shadow: inset 0 3px 0 var(--color-ink), 0 4px 0 var(--color-ink)

// The raised lime button that slides between the options. Back-out spring on
// the travel (it overshoots a hair and settles), squash on arrival.
.switch-puck
  position: absolute
  top: 2px
  bottom: 2px
  left: 0
  z-index: 0
  border: 2px solid var(--color-ink)
  border-radius: calc(var(--radius-ui) - 4px)
  background-color: var(--color-leaf-500)
  box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 0.6em 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 var(--color-leaf-700), 0 3px 0 var(--color-ink)
  translate: 0 -2px
  pointer-events: none

  &.is-ready
    transition: transform 0.34s var(--ui-back-out), width 0.34s var(--ui-back-out)

.button-wrap
  z-index: 1

.switch-opt
  min-height: 2rem
  border: 2px solid transparent
  border-radius: calc(var(--radius-ui) - 4px)
  color: var(--color-royal-300)
  transition: transform 0.26s var(--ui-spring), color 0.1s ease
  -webkit-tap-highlight-color: transparent

  @media (hover: hover)
    &:hover:not(:disabled):not(.is-active)
      color: var(--color-ice-50)
      transform: translateY(-1px)

  &:active:not(:disabled):not(.is-active)
    transform: translateY(1px) scale(0.95)
    transition-duration: var(--ui-press-down)

  // The label riding on the puck.
  &.is-active
    color: var(--color-ice-50)
    text-shadow: var(--ui-stroke-sm)
    transform: translateY(-2px)
    transition-delay: 0s, 0.12s

  &.is-disabled
    color: rgba(219, 232, 255, 0.4)
    background-image: var(--ui-hatch-light)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 1px

@media (prefers-reduced-motion: reduce)
  .switch-puck.is-ready
    transition-duration: 0.08s
    transition-timing-function: ease-out
</style>
