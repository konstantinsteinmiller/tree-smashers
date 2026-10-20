<template lang="pug">
  div(
    class="flex items-center gap-3 cursor-pointer select-none group"
    role="switch"
    tabindex="0"
    :aria-checked="modelValue"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  )
    span(class="ui-label switch-label")
      slot
    //- Track: leaf when on, wood when off; knob: cream button.
    div(
      class="switch-track relative w-16 h-9 rounded-full transition-colors duration-200"
      :class="{ 'is-on': modelValue }"
    )
      div(
        class="switch-knob absolute top-0.5 left-0.5 w-6 h-6 rounded-full transition-transform duration-200"
        :class="modelValue ? 'translate-x-7' : 'translate-x-0'"
      )
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style lang="sass" scoped>
.switch-label
  color: var(--ui-text)

.switch-track
  border: 3px solid var(--color-ink)
  background-color: var(--color-wood-500)
  box-shadow: inset 0 3px 0 var(--color-wood-700)
  &.is-on
    background-color: var(--color-leaf-500)
    box-shadow: inset 0 3px 0 var(--color-leaf-700)

.switch-knob
  top: 0.25rem
  background-color: var(--color-cream-50)
  border: 2px solid var(--color-ink)
  box-shadow: inset 0 -3px 0 var(--color-cream-300)

[role='switch']:focus-visible .switch-track
  outline: 3px solid var(--ui-focus)
  outline-offset: 2px
</style>