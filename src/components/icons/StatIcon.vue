<script setup lang="ts">
import { computed } from 'vue'
import { markUiArtFailed, statIconPath, statIconSrc, type StatArtId } from '@/data/uiArt'
import IconAttack from '@/components/icons/IconAttack.vue'
import IconDefense from '@/components/icons/IconDefense.vue'
import IconHp from '@/components/icons/IconHp.vue'
import IconSpeed from '@/components/icons/IconSpeed.vue'
import IconWeight from '@/components/icons/IconWeight.vue'

// A stat icon from the painted set (art/ui — the same icons the power-up
// boxes carry), or the drawn SVG glyph when the painting is not shipped or
// fails to load. Decorative: the number beside it carries the meaning.
// Sizing / colour classes fall through to whichever root renders (the
// colour only tints the drawn fallback).

const props = defineProps<{ stat: StatArtId }>()

const src = computed(() => statIconSrc(props.stat))
const FALLBACK = { attack: IconAttack, defense: IconDefense, hp: IconHp, speed: IconSpeed, weight: IconWeight } as const
const onError = () => markUiArtFailed(statIconPath(props.stat))
// The level-up fallback: the icon set's up chevron (same path as the skill
// surfaces' UI_GLYPHS.up, copied — shared code may not import a skill module).
const UP_PATH = 'M5.4 14.9A2 2 0 0 1 5.49 12.07L11.08 6.82A1.35 1.35 0 0 1 12.92 6.82L18.51 12.07A2 2 0 0 1 18.6 14.9A2 2 0 0 1 15.77 14.99L12.92 12.31A1.35 1.35 0 0 0 11.08 12.31L8.23 14.99A2 2 0 0 1 5.4 14.9Z'
</script>

<template lang="pug">
  img.stat-art.object-contain.select-none(
    v-if="src"
    :src="src"
    alt=""
    aria-hidden="true"
    draggable="false"
    @error="onError"
  )
  svg(v-else-if="stat === 'level-up'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
    path(:d="UP_PATH")
  component(v-else :is="FALLBACK[stat]" aria-hidden="true")
</template>

<style scoped lang="sass">
// The painted icons carry a sticker margin: shown a touch larger than the
// slot (transform — the layout box stays the slot the glyph used).
.stat-art
  transform: scale(1.15)
</style>
