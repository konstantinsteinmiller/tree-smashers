<script setup lang="ts">
import { computed } from 'vue'

/**
 * The game's one text button — see src/assets/css/DESIGN.md.
 *
 * `tone` picks one of the five streamlined colours (each has ONE meaning):
 *   primary (leaf) · secondary (cream) · danger (berry) · premium (sun gold)
 *   · ad (sky, every rewarded-video CTA) · wood (neutral dark).
 * `type` is the legacy alias: 'primary' → primary, 'secondary' → secondary.
 */
interface Props {
  label?: string
  type?: 'primary' | 'secondary'
  tone?: 'primary' | 'secondary' | 'danger' | 'premium' | 'ad' | 'wood'
  /** Legacy: a bigger hero CTA. No longer skewed / italic. */
  variant?: 'default' | 'brawl'
  isDisabled?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  attention?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: 'NO LABEL DEFINED!',
  type: 'primary',
  variant: 'default',
  attention: false
})

defineEmits(['click'])

const toneClass = computed(() => `ui-btn--${props.tone ?? props.type}`)

const containerClasses = computed(() => {
  const isHero = props.variant === 'brawl'
  return {
    'w-full': true,
    'flex justify-center': isHero,
    // Sizes scale the whole button; the smallest still clears the
    // 44pt / 48dp tap-target floor (Playgama QA).
    'scale-85': isHero && props.size === 'sm',
    'scale-90': !isHero && props.size === 'sm',
    'scale-95': props.size === 'md',
    'scale-125': isHero && props.size === 'xl',
    'scale-110': props.size === 'lg',
    'scale-120': !isHero && props.size === 'xl',
    'attention-bounce': props.attention,
    'opacity-60 pointer-events-none': props.isDisabled
  }
})
</script>

<template lang="pug">
  div(:class="containerClasses")
    button.ui-btn.f-button(
      type="button"
      @click="$emit('click')"
      :disabled="isDisabled"
      :class="[toneClass, variant === 'brawl' ? 'is-hero min-w-[7.5rem] md:min-w-[11.25rem] px-8 py-3 md:py-4' : 'w-full min-w-[5.5rem] md:min-w-[9rem] px-5 md:px-7']"
    )
      span.f-button-text.relative.block(
        :class="variant === 'brawl' ? 'text-xl md:text-3xl' : 'text-base md:text-2xl'"
      )
        slot Button
</template>

<style scoped lang="sass">
.f-button
  border-radius: var(--radius-ui-lg)

.f-button-text
  letter-spacing: 0.01em

.attention-bounce
  animation: bounce 0.6s infinite alternate

@keyframes bounce
  from
    transform: translateY(0)
  to
    transform: translateY(-5px)
</style>
