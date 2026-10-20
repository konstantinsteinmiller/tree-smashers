<script setup lang="ts">

export interface TabOption {
  label: string
  value: string | number
  icon?: string
}

interface Props {
  modelValue: string | number
  options: TabOption[]
}

defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const selectTab = (value: string | number) => {
  emit('update:modelValue', value)
}
</script>

<template lang="pug">
  //- Folder tabs on the wooden modal frame: the ACTIVE tab is the same cream
  //- as the parchment card (it reads as "this page"), inactive tabs are
  //- darker wood planks. See src/assets/css/DESIGN.md.
  div(class="flex items-end justify-center gap-1 px-4" role="tablist")
    button.f-tab.cursor-pointer(
      v-for="tab in options"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :aria-label="tab.icon ? tab.label : undefined"
      @click="selectTab(tab.value)"
      :class="['relative group transition-transform duration-150 active:scale-95', modelValue === tab.value ? 'is-active z-10 -translate-y-1' : 'z-0']"
    )
      div.f-tab-body(class="relative px-4 py-1.5 sm:px-6 sm:py-2 rounded-t-xl sm:rounded-t-2xl font-black")
        div.object-fill(v-if="tab.icon" class="w-8 h-8 sm:w-9 sm:h-9")
          img.object-fill(:src="tab.icon" alt="")
        span.tab-text(v-else class="text-sm sm:text-lg") {{ tab.label }}
</template>

<style lang="sass" scoped>
.f-tab-body
  border: 4px solid var(--color-ink)
  border-bottom: 0
  background-color: var(--color-wood-700)
  color: var(--color-cream-100)
  box-shadow: inset 0 3px 0 var(--color-wood-500)
  transition: background-color 0.12s ease

.f-tab:hover .f-tab-body
  background-color: var(--color-wood-600)

.f-tab.is-active .f-tab-body
  background-color: var(--color-cream-100)
  color: var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-cream-50)

.f-tab:focus-visible
  outline: 3px solid var(--ui-focus)
  outline-offset: 2px
  border-radius: 0.75rem

@media (orientation: landscape) and (max-height: 500px)
  // A step down from portrait to protect the scarce vertical space.
  .tab-text
    font-size: 0.85rem
</style>
