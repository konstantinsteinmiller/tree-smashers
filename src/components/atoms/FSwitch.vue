<template lang="pug">
  div(
    class="f-switch flex items-center gap-3 cursor-pointer select-none group"
    role="switch"
    tabindex="0"
    data-sfx="self"
    :aria-checked="modelValue"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  )
    span(class="ui-label switch-label")
      slot
    //- Track: lime with a two-tone facet when on, deep navy when off. The knob is
    //- a little 3D button (lip + drop) that springs across with an overshoot
    //- and shows a check / cross glyph, so the state reads without colour.
    div(
      class="switch-track relative w-[4.25rem] h-10 rounded-full"
      :class="{ 'is-on': modelValue }"
    )
      div(class="switch-knob absolute rounded-full flex items-center justify-center")
        svg(viewBox="0 0 24 24" class="w-4 h-4" aria-hidden="true")
          path(
            v-if="modelValue"
            d="M5 12.5l4.2 4.2L19 7"
            fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"
          )
          path(
            v-else
            d="M7 7l10 10M17 7L7 17"
            fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"
          )
</template>

<script setup lang="ts">
import { playUiSfx } from '@/use/uiSfx'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const toggle = () => {
  playUiSfx(props.modelValue ? 'toggleOff' : 'toggleOn')
  emit('update:modelValue', !props.modelValue)
}
</script>

<style lang="sass" scoped>
.switch-label
  color: var(--ui-text)

// 44 px+ tall hit area (the whole row is the switch).
.f-switch
  min-height: 2.75rem
  -webkit-tap-highlight-color: transparent

.switch-track
  border: 3px solid var(--color-ink)
  background-color: var(--color-royal-900)
  box-shadow: inset 0 4px 0 var(--color-ink), 0 3px 0 var(--color-ink)
  transition: background-color 0.15s ease
  &.is-on
    background-color: var(--color-leaf-500)
    background-image: var(--ui-facet)
    box-shadow: inset 0 4px 0 var(--color-leaf-700), 0 3px 0 var(--color-ink)

.switch-knob
  top: 0.15rem
  left: 0.2rem
  width: 1.75rem
  height: 1.75rem
  color: var(--color-steel-600)
  background-color: var(--color-ice-50)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -4px 0 var(--color-ice-300), 0 3px 0 var(--color-ink)
  // Springy slide: a back-out curve overshoots the end stop a hair.
  transition: transform 0.3s var(--ui-spring), color 0.15s ease, box-shadow 0.07s ease

.is-on .switch-knob
  transform: translateX(1.7rem)
  color: var(--color-leaf-600)

// The knob presses like a button while the switch is held.
.f-switch:active .switch-knob
  box-shadow: inset 0 -2px 0 var(--color-ice-300), 0 1px 0 var(--color-ink)
  translate: 0 2px

@media (hover: hover)
  .f-switch:hover .switch-knob
    translate: 0 -1px

[role='switch']:focus-visible .switch-track
  outline: 3px solid var(--ui-focus)
  outline-offset: 3px

@media (prefers-reduced-motion: reduce)
  .switch-knob
    transition-duration: 0.08s
    transition-timing-function: ease-out
</style>
