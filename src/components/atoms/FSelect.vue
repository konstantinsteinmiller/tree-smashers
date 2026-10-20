<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Option {
  value: string | number
  label: string
}

interface Props {
  modelValue: string | number
  options: Option[]
  placeholder?: string
  label?: string
  maxHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'SELECT...',
  // rem, not px, so the dropdown's scroll window grows with the global UI
  // scale instead of showing fewer and fewer rows as the type gets bigger.
  maxHeight: '15rem'
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const option = props.options.find(opt => opt.value === props.modelValue)
  return option ? option.label : props.placeholder
})

const toggle = () => (isOpen.value = !isOpen.value)

const selectOption = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

// Close when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template lang="pug">
  div(class="relative w-full font-black" ref="dropdownRef")
    div(v-if="label" class="ui-label mb-1 ml-1") {{ label }}

    //- Trigger: an ice secondary button (DESIGN.md) with a royal chevron chip.
    button.ui-btn.ui-btn--secondary(
      type="button"
      @click="toggle"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      class="w-full !justify-between min-w-[140px] px-4 py-3"
    )
      span(class="relative block text-sm md:text-lg truncate mr-2") {{ selectedLabel }}
      span.select-chevron(
        class="relative flex items-center justify-center"
        :class="{ 'is-open': isOpen }"
      )
        svg(width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true")
          path(d="m6 9 6 6 6-6")

    transition(name="pop")
      div.select-menu(
        v-if="isOpen"
        role="listbox"
        class="absolute z-1 left-0 right-0 mt-3 overflow-hidden"
      )
        div(
          class="ui-scroll overflow-y-auto p-2"
          :style="{ maxHeight: maxHeight }"
        )
          div.select-option.ui-pop-in(
            v-for="(option, i) in options"
            :key="option.value"
            :style="{ '--i': Math.min(i, 8) }"
            role="option"
            :aria-selected="modelValue === option.value"
            @click="selectOption(option.value)"
            class="relative mb-1 last:mb-0 cursor-pointer p-3.5 rounded-xl active:scale-[0.97]"
            :class="{ 'is-selected': modelValue === option.value }"
          )
            //- `text-base sm:text-lg` keeps the language list legible.
            span(class="relative block text-base sm:text-lg") {{ option.label }}
</template>

<style scoped lang="sass">
.select-chevron
  width: 1.9rem
  height: 1.9rem
  flex: 0 0 auto
  color: var(--color-ice-50)
  background-color: var(--color-royal-500)
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui-sm)
  box-shadow: inset 0 2px 0 var(--color-royal-300), inset 0 -3px 0 var(--color-royal-700)
  transition: transform 0.3s var(--ui-spring)
  &.is-open
    transform: rotate(180deg)

.select-menu
  background-color: var(--color-ice-100)
  color: var(--ui-text)
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 3px 0 var(--color-ice-50), 0 5px 0 var(--color-ink)

.select-option
  border: 2px solid transparent
  transition: background-color 0.08s ease, transform 0.2s var(--ui-spring)
  &:hover
    background-color: var(--color-ice-200)
    border-color: var(--color-ice-400)
  &.is-selected
    background-color: var(--color-leaf-500)
    border-color: var(--color-ink)
    color: var(--color-ice-50)
    text-shadow: var(--ui-stroke-sm)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700), 0 2px 0 var(--color-ink)

/* Transition Animations */
.pop-enter-active, .pop-leave-active
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.1s

.pop-enter-from, .pop-leave-to
  opacity: 0
  transform: translateY(-10px) scale(0.95)
</style>