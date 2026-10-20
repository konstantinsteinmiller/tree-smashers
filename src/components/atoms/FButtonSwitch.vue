<script setup lang="ts" generic="T extends string | number">
// Multi-option segmented switch (the arena's 1x / 2x speed). One button per
// option inside a recessed navy well; the ACTIVE option is a raised lime 3D
// button (lip + gloss + hard drop) that pops in with an overshoot when it
// takes over. Click events bubble up via `click` so the parent can decide
// whether to actually change the model value (e.g. gating a choice behind a
// rewarded video). Press feel + the `tab` tick come from the global press
// handler (useUiPress.ts) via role="radio".

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
  div.button-switch.relative.inline-block
    div.switch-pill.relative.flex(role="radiogroup")
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
// Recessed navy well (the active segment stands up out of it).
.switch-pill
  gap: 2px
  padding: 2px
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-royal-900)
  box-shadow: inset 0 3px 0 var(--color-ink), 0 4px 0 var(--color-ink)

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

  // The raised lime button.
  &.is-active
    color: var(--color-ice-50)
    border-color: var(--color-ink)
    background-color: var(--color-leaf-500)
    box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 0.6em 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 var(--color-leaf-700), 0 3px 0 var(--color-ink)
    text-shadow: var(--ui-stroke-sm)
    transform: translateY(-2px)
    animation: seg-pop 0.32s var(--ui-spring)

  &.is-disabled
    color: rgba(219, 232, 255, 0.4)
    background-image: repeating-linear-gradient(300deg, rgba(255, 255, 255, 0.06) 0 4px, transparent 4px 8px)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 1px

@keyframes seg-pop
  0%
    transform: translateY(1px) scale(0.86)
  100%
    transform: translateY(-2px) scale(1)

@media (prefers-reduced-motion: reduce)
  .switch-opt.is-active
    animation: none
</style>
