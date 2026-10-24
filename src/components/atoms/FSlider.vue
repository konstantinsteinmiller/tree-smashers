<script setup lang="ts">
import { computed } from 'vue'
import { playUiSfx } from '@/use/uiSfx'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
  colorFrom?: string
  colorTo?: string
  trackColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 50,
  min: 0,
  max: 100,
  step: 1,
  // Lime fill with a two-tone facet in a deep navy well — see DESIGN.md.
  colorFrom: 'var(--color-leaf-400)',
  colorTo: 'var(--color-leaf-500)',
  trackColor: 'var(--color-royal-900)'
})

const emit = defineEmits(['update:modelValue'])

const progress = computed(() => {
  return ((props.modelValue - props.min) / (props.max - props.min)) * 100
})

// A tiny click every 10 % of travel, pitched by position. On the SFX
// slider this doubles as a live preview of the new volume (and at 0 the
// sound gate keeps it silent). The uiSfx throttle stops a fast drag from
// rattling.
let lastNotch = -1
const updateValue = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  const frac = (value - props.min) / (props.max - props.min || 1)
  const notch = Math.round(frac * 10)
  emit('update:modelValue', value)
  if (notch !== lastNotch) {
    lastNotch = notch
    playUiSfx('slide', { pitch: 0.8 + frac * 0.6 })
  }
}
</script>

<template lang="pug">
  div(class="f-slider-container w-full py-4" data-sfx="self")
    div(v-if="label" class="slider-label ui-label mb-2") {{ label }}

    div(class="relative flex items-center h-10")
      //- Navy well
      div(
        class="slider-well absolute inset-x-0 h-6 my-auto rounded-full border-[3px] border-[var(--color-ink)] overflow-hidden"
        :style="{ backgroundColor: trackColor }"
      )
        //- Lime fill (flat, a hard light lip, a two-tone facet)
        div(
          class="slider-fill h-full relative rounded-full"
          :style="{ width: `${progress}%`, backgroundColor: colorFrom }"
        )

      input(
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :aria-label="label"
        @input="updateValue"
        class="absolute inset-0 w-full h-10 opacity-0 cursor-pointer z-10 touch-manipulation"
      )

      //- Thumb: a round ice 3D button with an ink outline (visual only). It
      //- sinks into its drop while held, like every other button.
      div(
        class="thumb-visual pointer-events-none absolute h-10 w-10 flex items-center justify-center"
        :style="{ left: `calc(${progress}% - 20px)` }"
      )
        span(class="thumb-body relative block w-full h-full rounded-full")
          span(class="absolute inset-0 flex items-center justify-center gap-[3px]")
            span(class="thumb-grip")
            span(class="thumb-grip")
</template>

<style scoped lang="sass">
.slider-label
  color: var(--ui-text)

.slider-well
  box-shadow: inset 0 3px 0 var(--color-ink), 0 2px 0 var(--color-ink)

.slider-fill
  background-image: var(--ui-facet)
  box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-600)

.thumb-body
  background-color: var(--color-ice-50)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -5px 0 var(--color-ice-300), 0 4px 0 var(--color-ink)
  transition: transform 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring)

.thumb-grip
  width: 4px
  height: 0.9rem
  border-radius: 999px
  background-color: var(--color-royal-500)

// Held: the knob sinks into its drop and squashes a hair.
.f-slider-container:active .thumb-body
  transform: translateY(3px) scale(1.05, 0.94)
  box-shadow: inset 0 -3px 0 var(--color-ice-300), 0 1px 0 var(--color-ink)
  transition-duration: var(--ui-press-down)

@media (hover: hover)
  .f-slider-container:hover .thumb-body
    transform: translateY(-1px)

input[type="range"]:focus-visible ~ .thumb-visual .thumb-body
  outline: 3px solid var(--ui-focus)
  outline-offset: 2px

.f-slider-container
  -webkit-tap-highlight-color: transparent

/* Ensure the native range covers the whole area for better hitboxes */
input[type="range"]
  -webkit-appearance: none
  background: transparent

  &::-webkit-slider-thumb
    -webkit-appearance: none
    width: 40px
    height: 40px
    cursor: pointer

  &::-moz-range-thumb
    width: 40px
    height: 40px
    cursor: pointer
    border: none
    background: transparent
</style>
