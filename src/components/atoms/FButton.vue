<script setup lang="ts">
import { computed } from 'vue'

/**
 * The game's one text button — see src/assets/css/DESIGN.md.
 *
 * `tone` picks one of the colours (each has ONE meaning):
 *   primary (leaf) · secondary (ice) · royal · danger (berry) · premium (sun)
 *   · plum · ad (sky, every rewarded-video CTA) · wood (legacy alias of royal).
 * `type` is the legacy alias: 'primary' → primary, 'secondary' → secondary.
 *
 * Press feel (sink into the lip, springy release, ticks) comes from the
 * `.ui-btn` recipe + the global press handler (useUiPress.ts) — nothing to
 * wire here. `variant="brawl"` is the ONE hero CTA per screen: uppercase,
 * thick lip, two speed slashes, shine sweep, and an idle heartbeat on the wrapper.
 */
interface Props {
  label?: string
  type?: 'primary' | 'secondary'
  tone?: 'primary' | 'secondary' | 'royal' | 'danger' | 'premium' | 'plum' | 'ad' | 'wood'
  /** The hero CTA (one per screen). */
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
    'f-attention': props.attention && !props.isDisabled,
    // Idle heartbeat for the hero — on the WRAPPER, so it never fights the
    // button's own press transform.
    'ui-breathe': isHero && !props.attention && !props.isDisabled,
    // No pointer-events-none here: a tap on a disabled button must still
    // reach the press handler, which answers it with the deny shake + bonk.
    'f-disabled': props.isDisabled
  }
})
</script>

<template lang="pug">
  div(:class="containerClasses")
    button.ui-btn.f-button(
      type="button"
      @click="!isDisabled && $emit('click')"
      :aria-disabled="isDisabled ? 'true' : undefined"
      :class="[toneClass, { 'is-disabled': isDisabled }, variant === 'brawl' ? 'is-hero ui-btn--hero ui-shine min-w-[7.5rem] md:min-w-[11.25rem] px-8 py-3 md:py-4' : 'w-full min-w-[5.5rem] md:min-w-[9rem] px-5 md:px-7']"
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

// "Claim me": a hop with a squash on landing, then a rest — a pulse that
// reads as eager, not as a vibrating error.
.f-attention
  animation: f-attention 1.5s ease-in-out infinite

@keyframes f-attention
  0%, 55%, 100%
    transform: translateY(0) scale(1)
  18%
    transform: translateY(-7px) scale(1.04, 0.98)
  32%
    transform: translateY(0) scale(1.05, 0.93)
  42%
    transform: translateY(-2px) scale(0.99, 1.02)

@media (prefers-reduced-motion: reduce)
  .f-attention
    animation: none
</style>
