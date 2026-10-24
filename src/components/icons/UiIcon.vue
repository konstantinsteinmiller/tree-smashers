<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import IconSettings from './IconSettings.vue'
import IconDifficulty from './IconDifficulty.vue'
import IconSound from './IconSound.vue'
import IconUpgrade from './IconUpgrade.vue'
import IconTrophy from './IconTrophy.vue'
import IconLeague from './IconLeague.vue'
import IconGift from './IconGift.vue'
import IconBattlePass from './IconBattlePass.vue'
import IconChest from './IconChest.vue'
import IconPvp from './IconPvp.vue'
import IconFight from './IconFight.vue'
import IconStatHp from './IconStatHp.vue'
import IconStatAtk from './IconStatAtk.vue'
import IconStatDef from './IconStatDef.vue'
import IconStatSpd from './IconStatSpd.vue'
import IconStatWeight from './IconStatWeight.vue'
import type { UiIconName } from '@/use/paintedUiIcons'
import { paintedUiIconSrc } from '@/use/uiIconArt'

/**
 * A UI icon (Options tabs, HUD settings button, the HUD core buttons): the
 * PAINTED sprite when tools/ui-icons/pack.mjs has generated one
 * (src/use/paintedUiIcons.ts), else — and whenever the sprite fails to load —
 * the drawn SVG. Decorative: the owning control carries the accessible name.
 */
const props = defineProps<{ name: UiIconName }>()

/** The drawn fallback for every name — the Record type makes a new name in the
 *  registry without a drawing a type error. */
const DRAWN: Record<UiIconName, Component> = {
  settings: IconSettings,
  difficulty: IconDifficulty,
  sound: IconSound,
  upgrade: IconUpgrade,
  leaderboard: IconTrophy,
  league: IconLeague,
  daily: IconGift,
  battlepass: IconBattlePass,
  chest: IconChest,
  pvp: IconPvp,
  fight: IconFight,
  'stat-hp': IconStatHp,
  'stat-atk': IconStatAtk,
  'stat-def': IconStatDef,
  'stat-spd': IconStatSpd,
  'stat-weight': IconStatWeight
}

const failed = ref(false)
watch(() => props.name, () => { failed.value = false })

const painted = computed(() => (failed.value ? null : paintedUiIconSrc(props.name)))
</script>

<template lang="pug">
  img.ui-icon(
    v-if="painted"
    :src="painted.src"
    :srcset="painted.srcset"
    alt=""
    draggable="false"
    :data-ui-icon="name"
    @error="failed = true"
  )
  component.ui-icon(v-else :is="DRAWN[name]" :data-ui-icon="name")
</template>

<style scoped lang="sass">
.ui-icon
  display: block
  width: 100%
  height: 100%
  object-fit: contain
  -webkit-user-drag: none
</style>
