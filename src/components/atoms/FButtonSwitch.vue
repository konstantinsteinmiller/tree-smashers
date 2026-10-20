<script setup lang="ts" generic="T extends string | number">
// Fancy multi-option pill switch with the same gold gradient + 3D drop-shadow
// look as the rest of the arena UI. Renders one button per option; the active
// one is highlighted. Click events bubble up via `click` so the parent can
// decide whether to actually change the model value (e.g. gating a choice
// behind a rewarded video).

interface Option {
  value: T
}

interface Props {
  modelValue: T
  options: Option[]
  /** Options shown but not tappable (e.g. a price the player can't pay). */
  disabledValues?: T[]
}

withDefaults(defineProps<Props>(), { disabledValues: () => [] })
const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void
  (e: 'click', value: T): void
}>()

const onClick = (value: T) => {
  emit('click', value)
  emit('update:modelValue', value)
}
</script>

<template lang="pug">
  //- Wooden pill with a leaf-green active segment (see DESIGN.md).
  div.button-switch.relative.inline-block
    div.switch-pill.relative.flex.overflow-hidden(role="radiogroup")
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
.switch-pill
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-wood-700)
  box-shadow: inset 0 3px 0 var(--color-wood-800), 0 4px 0 var(--color-ink)

.switch-opt
  color: var(--color-cream-200)
  transition: background-color 0.1s ease
  &:hover:not(:disabled)
    color: var(--color-cream-50)
  &.is-active
    color: var(--color-cream-50)
    background-color: var(--color-leaf-500)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700)
    text-shadow: 0 2px 0 var(--color-ink), 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 -1px 0 var(--color-ink)
  &.is-disabled
    color: rgba(247, 227, 184, 0.4)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: -3px
</style>
