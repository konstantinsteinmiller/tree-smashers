<script setup lang="ts">
import { computed } from 'vue'

/**
 * Square icon button (HUD corners, close X, arrows) — same shape and colour
 * set as FButton, see src/assets/css/DESIGN.md.
 *   danger → berry (close) · primary → leaf · secondary → wood plank (HUD)
 *   · premium → sun · ad → sky
 */
interface Props {
  icon?: 'close' | 'left' | 'right'
  imgSrc?: string
  type?: 'danger' | 'primary' | 'secondary' | 'premium' | 'ad'
  size?: 'sm' | 'md' | 'lg'
  /** Accessible name when the button shows only an image. */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'close',
  type: 'danger',
  size: 'md'
})

const emit = defineEmits(['click'])

const selectedIcon = computed(() => {
  switch (props.icon) {
    case 'left':
      return { viewBox: '0 0 24 24', path: 'M15 19l-7-7 7-7' }
    case 'right':
      return { viewBox: '0 0 24 24', path: 'M9 5l7 7-7 7' }
    case 'close':
    default:
      return { viewBox: '0 0 24 24', path: 'M6 18L18 6M6 6l12 12' }
  }
})

// HUD secondary buttons are wooden planks (the cream secondary would glare
// over the dark forest arena); everything else maps 1:1 onto FButton tones.
const toneClass = computed(() => (props.type === 'secondary' ? 'ui-btn--wood' : `ui-btn--${props.type}`))

// These multipliers are shared by the ARENA HUD and by in-modal controls; the
// HUD sizing is tuned for touch — size in-modal controls at their call site.
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { btn: 'p-1.5', icon: 'h-4 w-4', img: 'h-5 w-5', scale: 'scale-70 sm:scale-80' }
    case 'lg':
      return { btn: 'p-3', icon: 'h-6 w-6', img: 'h-9 w-9', scale: 'scale-80 sm:scale-110' }
    case 'md':
    default:
      return { btn: 'p-2', icon: 'h-4 w-4', img: 'h-7 w-7', scale: 'scale-80 sm:scale-100' }
  }
})
</script>

<template lang="pug">
  button.ui-btn.ui-btn--icon.f-icon-button(
    type="button"
    @click="emit('click')"
    :aria-label="ariaLabel"
    :class="[toneClass, sizeClasses.btn, sizeClasses.scale, 'z-10']"
  )
    img(
      v-if="imgSrc"
      :src="imgSrc"
      alt=""
      :class="sizeClasses.img"
      class="object-contain"
    )
    svg(
      v-else
      xmlns="http://www.w3.org/2000/svg"
      :class="sizeClasses.icon"
      fill="none"
      :viewBox="selectedIcon.viewBox"
      stroke="currentColor"
      aria-hidden="true"
    )
      path(
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="4"
        :d="selectedIcon.path"
      )
</template>
