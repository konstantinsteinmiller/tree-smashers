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
    div(v-if="label" class="label-text mb-1 ml-1 text-white uppercase italic text-lg tracking-wider") {{ label }}

    //- Trigger — same 3D yellow body as FSelect, so the Options tab reads the same.
    button(
      type="button"
      data-testid="language-picker"
      aria-haspopup="dialog"
      :aria-label="label"
      @click.stop="isOpen = true"
      class="group relative w-full inline-block cursor-pointer select-none transition-all duration-75 active:scale-[0.98] hover:scale-[1.02] touch-manipulation focus:outline-none"
    )
      span(class="absolute inset-0 translate-y-[4px] rounded-2xl bg-[#1a2b4b]")
      span(class="relative flex items-center justify-between min-w-[140px] rounded-2xl border-[3px] border-[#0f1a30] px-4 py-3 bg-gradient-to-b from-[#ffcd00] to-[#f7a000]")
        span(class="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-white/25")
        span(
          class="text relative block text-sm md:text-lg tracking-wide text-white truncate mr-2"
          :lang="current?.bcp47"
          :data-font-script="current?.script"
        ) {{ current?.native ?? modelValue }}
        //- Globe — says "languages" without a word, whatever the UI language.
        svg(width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="relative shrink-0 text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]" aria-hidden="true")
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
        button(
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
          class="relative min-h-[44px] rounded-xl border-[3px] px-2 py-2 transition-all duration-75 active:scale-[0.97] cursor-pointer"
          :class="lang.code === modelValue ? 'bg-[#50aaff] border-white' : 'bg-[#0f1a30] border-[#0f1a30] hover:bg-[#2266ff]'"
        )
          span(class="option-text relative block text-center text-white text-sm sm:text-base leading-tight break-words") {{ lang.native }}
</template>

<style scoped lang="sass">
.text, .label-text, .option-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000
</style>
