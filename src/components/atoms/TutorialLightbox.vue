<script setup lang="ts">
// Guided-tutorial lightbox: dims the whole screen except a hole around the
// element matching `target`. Four blocker panels surround the hole, so only the
// highlighted element can be clicked; the hole itself passes clicks through.
// The target is measured every frame (modals animate in, layouts reflow).
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  /** CSS selector of the element to leave lit and clickable. */
  target: string
  /** Caption shown next to the hole. */
  text: string
}>()

const PAD = 6
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const vw = ref(window.innerWidth)
const vh = ref(window.innerHeight)
let raf = 0

const measure = () => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
  const el = document.querySelector(props.target)
  if (el) {
    const r = el.getBoundingClientRect()
    const next = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
    const cur = rect.value
    if (!cur || cur.x !== next.x || cur.y !== next.y || cur.w !== next.w || cur.h !== next.h) rect.value = next
  } else if (rect.value) rect.value = null
  raf = requestAnimationFrame(measure)
}

onMounted(() => { raf = requestAnimationFrame(measure) })
onBeforeUnmount(() => cancelAnimationFrame(raf))

/** Caption below the hole when there is room, above it otherwise. */
const captionStyle = () => {
  const r = rect.value
  if (!r) return {}
  const below = r.y + r.h + 90 < vh.value
  return {
    left: Math.max(12, Math.min(vw.value - 292, r.x + r.w / 2 - 140)) + 'px',
    top: below ? r.y + r.h + 12 + 'px' : Math.max(12, r.y - 84) + 'px'
  }
}
</script>

<template lang="pug">
  div.tut-lightbox(data-testid="tutorial-lightbox")
    template(v-if="rect")
      div.tut-block(:style="{ left: 0, top: 0, width: '100%', height: Math.max(0, rect.y) + 'px' }")
      div.tut-block(:style="{ left: 0, top: rect.y + rect.h + 'px', width: '100%', height: Math.max(0, vh - rect.y - rect.h) + 'px' }")
      div.tut-block(:style="{ left: 0, top: rect.y + 'px', width: Math.max(0, rect.x) + 'px', height: rect.h + 'px' }")
      div.tut-block(:style="{ left: rect.x + rect.w + 'px', top: rect.y + 'px', width: Math.max(0, vw - rect.x - rect.w) + 'px', height: rect.h + 'px' }")
      div.tut-ring(:style="{ left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' }")
      p.tut-caption.game-text(:style="captionStyle()") {{ text }}
    //- Target not on screen yet: block everything meanwhile.
    div.tut-block.tut-block--all(v-else)
</template>

<style scoped lang="sass">
.tut-lightbox
  position: fixed
  inset: 0
  z-index: 80
  pointer-events: none

.tut-block
  position: fixed
  background: color-mix(in srgb, var(--color-wood-900) 72%, transparent)
  pointer-events: auto

.tut-block--all
  inset: 0

.tut-ring
  position: fixed
  border-radius: 14px
  border: 3px solid #ffe27a
  box-shadow: 0 0 0 3px rgba(255, 226, 122, 0.35), 0 0 0 9px rgba(255, 226, 122, 0.18)
  pointer-events: none
  animation: tut-pulse 1.1s ease-in-out infinite

.tut-caption
  position: fixed
  width: 280px
  margin: 0
  padding: 8px 12px
  border-radius: 12px
  background: var(--color-wood-900)
  color: #fff6d8
  border: 2px solid #ffe27a
  text-align: center
  font-size: 1rem
  pointer-events: none

@keyframes tut-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.04)

@media (prefers-reduced-motion: reduce)
  .tut-ring
    animation: none
</style>
