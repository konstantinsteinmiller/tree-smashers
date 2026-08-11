<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  label?: string
  type?: 'primary' | 'secondary'
  variant?: 'default' | 'brawl'
  isDisabled?: boolean
  colorFrom?: string
  colorTo?: string
  shadowColor?: string
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

// Map the theme colors based on the type prop
const theme = computed(() => {
  if (props.type === 'secondary') {
    return {
      from: props.colorFrom ?? '#50aaff', // Light Blue
      to: props.colorTo ?? '#2266ff',     // Darker Blue
      shadow: props.shadowColor ?? '#102e7a'
    }
  }
  // Default Primary (Brawl Stars Yellow)
  return {
    from: props.colorFrom ?? '#ffcd00',
    to: props.colorTo ?? '#f7a000',
    shadow: props.shadowColor ?? '#1a2b4b'
  }
})

// Compute container scaling and layout
const containerClasses = computed(() => {
  const isBrawl = props.variant === 'brawl'
  return {
    'w-full': true,
    'flex justify-center': isBrawl,
    // Both variants used to shrink hard at `sm` / `md` (`scale-60` / `scale-80`
    // for the default variant), which stacked with the already-small mobile
    // text to produce the sub-40px CTAs Playgama QA called out. Raised so the
    // smallest variant still clears the 44pt / 48dp tap-target floor.
    //
    // NOTE: one key per class string. Two entries that resolve to the SAME
    // Tailwind class silently collapse in an object literal — the second wins
    // and the first condition is dead. That is why `md` is expressed as a
    // single predicate covering both variants rather than one line each.
    'scale-85': isBrawl && props.size === 'sm',
    'scale-80': !isBrawl && props.size === 'sm',
    'scale-95': props.size === 'md',
    'scale-125': isBrawl && props.size === 'xl',
    'scale-110': props.size === 'lg',
    'scale-120': !isBrawl && props.size === 'xl',
    'attention-bounce': props.attention,
    'opacity-50 grayscale pointer-events-none': props.isDisabled
  }
})
</script>

<template lang="pug">
  div(:class="containerClasses")
    button(
      type="button"
      @click="$emit('click')"
      :class="[\
        variant === 'brawl' \
          ? 'inline-block skew-x-[-12deg] active:scale-95' \
          : 'w-full inline-block active:scale-x-[95%] active:scale-y-[90%] hover:scale-[103%]',\
        'group relative cursor-pointer select-none transition-all duration-75 hover:brightness-110 touch-manipulation'\
      ]"
    )
      //- The "Bottom Shadow" / 3D Depth
      span.f-button-shadow(
        :style="{ backgroundColor: theme.shadow }"
        :class="[\
          variant === 'brawl' \
            ? 'translate-y-[3px] w-full h-full rounded-xl' \
            : 'absolute inset-0 translate-y-[3px] md:translate-y-[3px] rounded-2xl'\
        ]"
        class="absolute inset-0"
      )

      //- The Main Button Body
      span.f-button-body(
        :style="{ backgroundImage: `linear-gradient(to bottom, ${theme.from}, ${theme.to})` }"
        :class="[\
          variant === 'brawl' \
            ? 'min-w-[7.5rem] md:min-w-[11.25rem] border-b-[3px] border-black/20 px-8 py-3.5 md:py-4 rounded-lg' \
            : 'min-w-[5.5rem] md:min-w-[9rem] rounded-xl md:rounded-2xl border-[2px] border-[#0f1a30] px-5 md:px-7 py-2.5 md:py-3.5'\
        ]"
        class="relative block"
      )
        //- Inner Top Shine (The classic game shine)
        span(
          :class="[\
            variant === 'brawl' \
              ? 'h-[50%] bg-white/30 rounded-t-lg' \
              : 'h-1/2 rounded-t-xl bg-white/25'\
          ]"
          class="absolute inset-x-0 top-0"
        )

        //- Button Text / Content
        span(:class="{ 'skew-x-[12deg]': variant === 'brawl' }" class="relative block")
          span.text(
            :class="[\
              variant === 'brawl' \
                ? 'text-xl md:text-3xl tracking-tighter italic' \
                : 'text-base md:text-2xl tracking-wide'\
            ]"
            class="relative block text-white uppercase font-black"
          )
            slot Button
</template>

<style scoped lang="sass">
button
  -webkit-tap-highlight-color: transparent

.text
  // Thick gaming-style text outline
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.attention-bounce
  animation: bounce 0.6s infinite alternate

@keyframes bounce
  from
    transform: translateY(0)
  to
    transform: translateY(-5px)
</style>