<script setup lang="ts">
import { computed } from 'vue'

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
  // Leaf-green fill in a wood well — see DESIGN.md.
  colorFrom: 'var(--color-leaf-400)',
  colorTo: 'var(--color-leaf-500)',
  trackColor: 'var(--color-wood-800)'
})

const emit = defineEmits(['update:modelValue'])

const progress = computed(() => {
  return ((props.modelValue - props.min) / (props.max - props.min)) * 100
})

const updateValue = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', Number(target.value))
}
</script>

<template lang="pug">
  div(class="f-slider-container w-full py-4")
    div(v-if="label" class="slider-label ui-label mb-2") {{ label }}

    div(class="relative flex items-center h-8")
      //- Wood well
      div(
        class="absolute inset-0 h-6 my-auto rounded-full border-[3px] border-[var(--color-ink)] overflow-hidden"
        :style="{ backgroundColor: trackColor }"
      )
        //- Leaf fill (flat, with a hard light lip)
        div(
          class="slider-fill h-full transition-all duration-75 relative rounded-full"
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
        class="absolute inset-0 w-full h-8 opacity-0 cursor-pointer z-10 touch-manipulation"
      )

      //- Thumb: a round cream button with an ink outline (visual only)
      div(
        class="thumb-visual pointer-events-none absolute h-10 w-10 flex items-center justify-center"
        :style="{ left: `calc(${progress}% - 20px)` }"
      )
        span(class="thumb-body relative block w-full h-full rounded-full")
          span(class="absolute inset-0 flex items-center justify-center")
            span(class="w-1.5 h-4 rounded-full bg-[var(--color-wood-400)]")
</template>

<style scoped lang="sass">
.slider-label
  color: var(--ui-text)

.slider-fill
  box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-600)

.thumb-body
  background-color: var(--color-cream-100)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -4px 0 var(--color-cream-400), 0 3px 0 var(--color-ink)

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