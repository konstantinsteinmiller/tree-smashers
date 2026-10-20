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

    //- Trigger: a cream secondary button (DESIGN.md) with a wood chevron.
    button.ui-btn.ui-btn--secondary(
      type="button"
      @click="toggle"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      class="w-full !justify-between min-w-[140px] px-4 py-3"
    )
      span(class="relative block text-sm md:text-lg truncate mr-2") {{ selectedLabel }}
      span(
        class="relative transition-transform duration-200 text-[var(--color-wood-700)]"
        :class="{ 'rotate-180': isOpen }"
      )
        svg(width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true")
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
          div.select-option(
            v-for="option in options"
            :key="option.value"
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
.select-menu
  background-color: var(--color-cream-100)
  color: var(--ui-text)
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui-lg)
  box-shadow: 0 5px 0 var(--color-ink)

.select-option
  transition: background-color 0.08s ease
  &:hover
    background-color: var(--color-cream-200)
  &.is-selected
    background-color: var(--color-leaf-500)
    color: var(--color-cream-50)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700)

/* Transition Animations */
.pop-enter-active, .pop-leave-active
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.1s

.pop-enter-from, .pop-leave-to
  opacity: 0
  transform: translateY(-10px) scale(0.95)
</style>