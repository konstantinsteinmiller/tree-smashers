<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiIcon from '@/components/icons/UiIcon.vue'
import type { UiIconName } from '@/use/paintedUiIcons'

export interface TabOption {
  label: string
  value: string | number
  /** Image URL shown instead of the label. */
  icon?: string
  /** Drawn/painted UI icon (UiIcon) shown instead of the label. */
  uiIcon?: UiIconName
}

interface Props {
  modelValue: string | number
  options: TabOption[]
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const selectTab = (value: string | number) => {
  emit('update:modelValue', value)
}

// ─── The sliding puck (#UX1b) ───────────────────────────────────────────────
// One ice folder tab slides along the royal rail to the active tab instead of
// each tab popping on its own. Layout offsets (offsetLeft / offsetWidth) so
// the modal's open scale and the landscape `scale-80` never skew the
// measurement.
const listRef = ref<HTMLElement | null>(null)
const puck = ref<{ x: number, w: number } | null>(null)
const rail = ref<{ x: number, w: number } | null>(null)
const ready = ref(false)

const measure = () => {
  const list = listRef.value
  if (!list) return
  const idx = props.options.findIndex(o => o.value === props.modelValue)
  const tabs = list.querySelectorAll<HTMLElement>('.f-tab')
  const btn = tabs[idx]
  puck.value = btn ? { x: btn.offsetLeft, w: btn.offsetWidth } : null
  const first = tabs[0]
  const last = tabs[tabs.length - 1]
  rail.value = first && last ? { x: first.offsetLeft, w: last.offsetLeft + last.offsetWidth - first.offsetLeft } : null
}

watch(() => [props.modelValue, props.options.length], () => nextTick(measure))

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  requestAnimationFrame(() => { ready.value = true })
  if (typeof ResizeObserver !== 'undefined' && listRef.value) {
    ro = new ResizeObserver(measure)
    ro.observe(listRef.value)
  }
  void document.fonts?.ready.then(measure).catch(() => {})
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template lang="pug">
  //- Folder tabs on the royal modal frame: a darker faceted royal RAIL holds
  //- every tab, and ONE ice puck (the same ice as the card: "this page") with
  //- a sun accent bar slides under the active tab. See src/assets/css/DESIGN.md.
  div.f-tabs(ref="listRef" class="relative flex items-end justify-center px-4" role="tablist")
    span.f-tabs-rail(
      v-if="rail"
      aria-hidden="true"
      :style="{ transform: `translateX(${rail.x}px)`, width: `${rail.w}px` }"
    )
    span.f-tabs-puck(
      v-if="puck"
      aria-hidden="true"
      :class="{ 'is-ready': ready }"
      :style="{ transform: `translateX(${puck.x}px)`, width: `${puck.w}px` }"
    )
    button.f-tab.cursor-pointer(
      v-for="tab in options"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :aria-label="tab.icon || tab.uiIcon ? tab.label : undefined"
      @click="selectTab(tab.value)"
      :class="['relative group', modelValue === tab.value ? 'is-active' : '']"
    )
      div.f-tab-body(class="relative px-4 py-1.5 sm:px-6 sm:py-2 font-black")
        div(v-if="tab.uiIcon" class="w-8 h-8 sm:w-9 sm:h-9")
          UiIcon(:name="tab.uiIcon")
        div.object-fill(v-else-if="tab.icon" class="w-8 h-8 sm:w-9 sm:h-9")
          img.object-fill(:src="tab.icon" alt="")
        span.tab-text(v-else class="text-sm sm:text-lg") {{ tab.label }}
</template>

<style lang="sass" scoped>
// Rail: one darker faceted royal folder strip behind every tab (4px ink, no
// bottom edge — it sits on the frame). Puck: the ice folder tab with a sun
// accent bar, raised 4px above the rail, sliding on a back-out spring.
// Labels ride above both; inactive labels lift on hover and squash on press.
// Ticks: the global press handler plays `tab` for role="tab".
.f-tabs
  isolation: isolate
  padding-top: 4px

.f-tabs-rail
  position: absolute
  left: 0
  top: 4px
  bottom: 0
  z-index: 0
  border: 4px solid var(--color-ink)
  border-bottom: 0
  border-radius: 0.75rem 0.75rem 0 0
  background-color: var(--color-royal-700)
  background-image: var(--ui-facet)
  box-shadow: inset 0 3px 0 var(--color-royal-500)
  pointer-events: none
  @media (min-width: 640px)
    border-radius: 1rem 1rem 0 0

.f-tabs-puck
  position: absolute
  left: 0
  top: 0
  bottom: 0
  z-index: 1
  border: 4px solid var(--color-ink)
  border-bottom: 0
  border-radius: 0.75rem 0.75rem 0 0
  background-color: var(--color-ice-100)
  box-shadow: inset 0 5px 0 var(--color-sun-400), inset 0 7px 0 var(--color-ink)
  pointer-events: none
  @media (min-width: 640px)
    border-radius: 1rem 1rem 0 0

  &.is-ready
    transition: transform 0.36s var(--ui-back-out), width 0.36s var(--ui-back-out)

.f-tab
  z-index: 2
  -webkit-tap-highlight-color: transparent
  transition: transform 0.26s var(--ui-spring)

  @media (hover: hover)
    &:hover:not(.is-active)
      transform: translateY(-3px)

  &:active:not(.is-active)
    transform: translateY(2px) scale(0.95)
    transition-duration: var(--ui-press-down)

.f-tab-body
  color: var(--color-ice-100)
  transition: color 0.12s ease 0.1s
  // Room for the puck's 4px outline and its accent bar.
  border: 4px solid transparent
  border-bottom: 0

.f-tab:not(.is-active) img
  opacity: 0.82
  transition: opacity 0.12s ease

.f-tab.is-active .f-tab-body
  color: var(--color-ink)

.f-tab:focus-visible
  outline: 3px solid var(--ui-focus)
  outline-offset: 2px
  border-radius: 0.75rem

@media (prefers-reduced-motion: reduce)
  .f-tabs-puck.is-ready
    transition-duration: 0.08s
    transition-timing-function: ease-out

@media (orientation: landscape) and (max-height: 500px)
  // A step down from portrait to protect the scarce vertical space.
  .tab-text
    font-size: 0.85rem
</style>
