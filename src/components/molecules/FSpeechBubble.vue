//- @/components/molecules/FSpeechBubble.vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  modelValue: boolean
  text: string
  speakerName?: string
}

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  text: { type: String, required: false },
  speakerName: { type: String, required: false }
})
const emit = defineEmits(['update:modelValue', 'complete'])

const close = () => {
  emit('update:modelValue', false)
  emit('complete')
}
</script>

<template lang="pug">
  Transition(name="pop")
    div(v-if="modelValue" class="fixed left-0 right-0 inset-0 z-[100] flex items-center justify-center p-6")
      //- Backdrop (Lightly darkens board to focus on text)
      div(class="absolute inset-0 bg-[rgba(26,18,10,0.5)]" @click="close")

      div(class="relative max-w-sm w-full cursor-pointer" @click="close")
        //- The Bubble Container
        div.bubble(class="relative p-5")

          //- Speaker name tag — a small wood plank.
          div.ui-wood(v-if="speakerName" class="absolute -top-5 left-6 px-3 py-0.5")
            span(class="ui-outline-sm text-sm font-black") {{ speakerName }}

          //- Dialogue Text
          div(class="text-ink text-lg font-extrabold leading-tight pt-1")
            | {{ text }}

          //- Tap to Continue indicator
          div(class="mt-3 flex justify-end items-center gap-2")
            span(class="text-[0.8rem] font-black text-ink-soft") {{ t('spinner.tapToStart') }}
            div(class="w-2 h-2 bg-leaf-500 rounded-full animate-ping")

          //- The Bubble Tail
          div(class="absolute -bottom-3 left-10 w-6 h-6 bg-cream-100 border-r-[4px] border-b-[4px] border-ink rotate-45")

</template>

<style scoped lang="sass">
.bubble
  background-color: var(--color-cream-100)
  color: var(--ui-text)
  border: 4px solid var(--color-ink)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 3px 0 var(--color-cream-50), 0 5px 0 var(--color-ink)

.pop-enter-active
  animation: bounce-in 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)

.pop-leave-active
  animation: bounce-in 0.2s ease-in reverse

@keyframes bounce-in
  0%
    transform: scale(0.3) translateY(20px)
    opacity: 0
  100%
    transform: scale(1) translateY(0)
    opacity: 1
</style>