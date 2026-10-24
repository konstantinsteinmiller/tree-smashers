<script setup lang="ts">
import { computed } from 'vue'
import { levelUpIconSrc, markStatIconFailed, markUiArtFailed, statIconPath, statIconSrc, type StatArtId } from '@/data/uiArt'
import IconStatAtk from '@/components/icons/IconStatAtk.vue'
import IconStatDef from '@/components/icons/IconStatDef.vue'
import IconStatHp from '@/components/icons/IconStatHp.vue'
import IconStatSpd from '@/components/icons/IconStatSpd.vue'
import IconStatWeight from '@/components/icons/IconStatWeight.vue'

// A stat icon from the toy-style UI icon family (tools/ui-icons `stat-*` — the
// same icons the power-up boxes carry): the painted sprite (64/128/256 px
// srcset) when packed, else — and after a load error — the drawn SVG
// (IconStat*.vue, the same toy look). `level-up` keeps the art/ui arrow.
// Decorative: the number / label beside it carries the meaning.
// Sizing classes fall through to whichever root renders.

const props = defineProps<{ stat: StatArtId }>()

const painted = computed(() => (props.stat === 'level-up' ? null : statIconSrc(props.stat)))
const levelUpSrc = computed(() => (props.stat === 'level-up' ? levelUpIconSrc() : null))
const FALLBACK = { attack: IconStatAtk, defense: IconStatDef, hp: IconStatHp, speed: IconStatSpd, weight: IconStatWeight } as const
const onError = () => {
  if (props.stat === 'level-up') markUiArtFailed(statIconPath('level-up'))
  else markStatIconFailed(props.stat)
}
// The level-up fallback: the icon set's up chevron (same path as the skill
// surfaces' UI_GLYPHS.up, copied — shared code may not import a skill module).
const UP_PATH = 'M5.4 14.9A2 2 0 0 1 5.49 12.07L11.08 6.82A1.35 1.35 0 0 1 12.92 6.82L18.51 12.07A2 2 0 0 1 18.6 14.9A2 2 0 0 1 15.77 14.99L12.92 12.31A1.35 1.35 0 0 0 11.08 12.31L8.23 14.99A2 2 0 0 1 5.4 14.9Z'
</script>

<template lang="pug">
  img.stat-art.object-contain.select-none(
    v-if="painted"
    :src="painted.src"
    :srcset="painted.srcset"
    :data-stat-icon="stat"
    alt=""
    aria-hidden="true"
    draggable="false"
    @error="onError"
  )
  img.stat-art.stat-art--sheet.object-contain.select-none(
    v-else-if="levelUpSrc"
    :src="levelUpSrc"
    data-stat-icon="level-up"
    alt=""
    aria-hidden="true"
    draggable="false"
    @error="onError"
  )
  svg(v-else-if="stat === 'level-up'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
    path(:d="UP_PATH")
  component(v-else :is="FALLBACK[stat]" :data-stat-icon="stat" aria-hidden="true")
</template>

<style scoped lang="sass">
// The old art/ui sheet (level-up) carries a sticker margin: shown a touch
// larger than the slot (transform — the layout box stays the slot). The
// stat family is trimmed to a 4% margin and fills the slot as is.
.stat-art--sheet
  transform: scale(1.15)
</style>
