<script setup lang="ts">
import { computed, ref } from 'vue'
import FModal from '@/components/molecules/FModal.vue'
import { LANGUAGE_BY_CODE, pickerOrder } from '@/i18n/languages'

/**
 * Language picker for 25+ languages.
 *
 * A dropdown stops working somewhere past a dozen entries: on a landscape
 * phone (~740x360) the Options modal leaves room for three or four rows, so
 * the player scrolls a keyhole looking for their language. This opens the list
 * as its own modal instead — a grid of autonyms that fills whatever the screen
 * has (2 columns on a narrow phone, 3 in phone landscape, 4 on desktop) and
 * scrolls inside FModal's content slot.
 *
 * Each entry is the language's OWN name (autonym), in its own script's font
 * stack (`data-font-script`) and with its own `lang` — a reader finds their
 * language whatever the UI is currently set to, and 日本語 is drawn with
 * Japanese glyph shapes even from a Chinese UI. No per-locale copy is needed.
 */
const props = defineProps<{
  modelValue: string
  /** Internal locale codes to offer (normally `LANGUAGES`). */
  codes: readonly string[]
  label?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const isOpen = ref(false)
const options = computed(() => pickerOrder(props.codes))
const current = computed(() => LANGUAGE_BY_CODE[props.modelValue])

const pick = (code: string) => {
  isOpen.value = false
  if (code !== props.modelValue) emit('update:modelValue', code)
}
</script>

<template lang="pug">
  div(class="relative w-full font-black")
    div(v-if="label" class="ui-label mb-1 ml-1") {{ label }}

    //- Trigger — the same cream secondary button as FSelect, so the Options tab reads the same.
    button.ui-btn.ui-btn--secondary(
      type="button"
      data-testid="language-picker"
      aria-haspopup="dialog"
      :aria-label="label"
      @click.stop="isOpen = true"
      class="w-full !justify-between min-w-[140px] px-4 py-3"
    )
      span(
        class="relative block text-sm md:text-lg truncate mr-2"
        :lang="current?.bcp47"
        :data-font-script="current?.script"
      ) {{ current?.native ?? modelValue }}
      //- Globe — says "languages" without a word, whatever the UI language.
      svg(width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="relative shrink-0 text-wood-700" aria-hidden="true")
        circle(cx="12" cy="12" r="10")
        path(d="M2 12h20")
        path(d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z")

    FModal(
      :model-value="isOpen"
      :title="label"
      @update:model-value="isOpen = false"
    )
      div(
        role="listbox"
        :aria-label="label"
        class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 gap-2 p-1 sm:p-2"
      )
        button.lang-option(
          v-for="lang in options"
          :key="lang.code"
          type="button"
          role="option"
          :data-locale-option="lang.code"
          :aria-selected="lang.code === modelValue"
          :lang="lang.bcp47"
          :data-font-script="lang.script"
          dir="auto"
          @click="pick(lang.code)"
          class="relative min-h-[44px] px-2 py-2 active:scale-[0.97] cursor-pointer"
          :class="{ 'is-selected': lang.code === modelValue }"
        )
          span(class="relative block text-center text-sm sm:text-base leading-tight break-words") {{ lang.native }}
</template>

<style scoped lang="sass">
.lang-option
  background-color: var(--color-cream-200)
  color: var(--ui-text)
  border: 3px solid var(--color-cream-400)
  border-radius: var(--radius-ui)
  box-shadow: inset 0 2px 0 var(--color-cream-50)
  transition: background-color 0.08s ease, transform 0.07s ease
  &:hover
    background-color: var(--color-cream-300)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  &.is-selected
    background-color: var(--color-leaf-500)
    border-color: var(--color-ink)
    color: var(--color-cream-50)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700)
    text-shadow: 0 1px 0 var(--color-ink), 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 -1px 0 var(--color-ink)
</style>
