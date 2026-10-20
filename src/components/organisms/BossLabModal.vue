<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import BossTraitGlyph from '@/components/atoms/BossTraitGlyph.vue'
import { modelImgPath } from '@/use/useModels'
import type { Stage } from '@/use/useSpinnerCampaign'
import {
  BOSS_LAB_ARENAS,
  BOSS_LAB_ENTRIES,
  bossLabArena,
  bossLabLastIndex,
  bossLabLevelMode,
  buildBossLabStage,
  nextBossLabIndex
} from '@/use/bosses/bossLab'
import { BOSS_TRAIT_TUNING, resetBossTraitTuning } from '@/use/bosses/bossTraits'

/**
 * ─── Boss Lab (bosses-100-feature.md §11, BW7) — DEV CHEAT ──────────────────
 *
 * Opened by ctrl+shift+9, `?bosslab` or 20 quick taps on the treasure chest,
 * on a dev build with cheats on; the arena references this component only
 * behind `import.meta.env.DEV`, so it never reaches a production bundle. One click per boss: the ten stage-101+
 * encounters in slot order plus three single-trait sandboxes. A click builds
 * the cheat stage (Lab rewards, never persisted, no trophy) and closes; the
 * arena re-opens the Lab after that battle's result screen with the NEXT
 * entry focused, so all thirteen play back to back.
 *
 * Dev-only copy (captions, knob labels) is exempt from i18n; boss names come
 * from `stages.*`, so the Lab also previews the current locale.
 */

const props = defineProps<{
  modelValue: boolean
  /** The player's peak top / bottom upgrade levels (matched levels). */
  peakTop: number
  peakBottom: number
}>()

const emit = defineEmits<{
  'update:modelValue': [open: boolean]
  /** Launch this stage; `boostPlayer` = give the player the cheat +25. */
  launch: [stage: Stage, index: number, boostPlayer: boolean]
}>()

const { t } = useI18n()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const nextIndex = computed(() => nextBossLabIndex(bossLabLastIndex.value))

const tileRefs = ref<HTMLElement[]>([])
const setTileRef = (el: unknown, i: number) => {
  if (el instanceof HTMLElement) tileRefs.value[i] = el
}
watch(open, (v) => {
  if (!v) return
  void nextTick(() => tileRefs.value[nextIndex.value]?.focus({ preventScroll: false }))
}, { immediate: true })

const bossName = (nameKey: string) => t(`stages.${nameKey}`, nameKey)

const launch = (index: number) => {
  const entry = BOSS_LAB_ENTRIES[index]
  if (!entry) return
  const stage = buildBossLabStage(entry.id, {
    levelMode: bossLabLevelMode.value,
    arena: bossLabArena.value,
    peakTop: props.peakTop,
    peakBottom: props.peakBottom
  })
  bossLabLastIndex.value = index
  emit('launch', stage, index, bossLabLevelMode.value === 'matched')
  open.value = false
}

// ── Knobs (dev only, not persisted): write the live BOSS_TRAIT_TUNING ──
type KnobKey = 'EMBER_PERIOD_MS' | 'EMBER_PCT' | 'CHILL_PER_STACK' | 'CHILL_TURNS' | 'FROST_KEEP'
const KNOBS: { key: KnobKey; label: string; step: number; min: number; max: number }[] = [
  { key: 'EMBER_PERIOD_MS', label: 'nova period ms', step: 100, min: 300, max: 10000 },
  { key: 'EMBER_PCT', label: 'nova % hp', step: 0.005, min: 0, max: 0.5 },
  { key: 'FROST_KEEP', label: 'frost keep', step: 0.05, min: 0, max: 1 },
  { key: 'CHILL_PER_STACK', label: 'chill / stack', step: 0.02, min: 0, max: 0.5 },
  { key: 'CHILL_TURNS', label: 'chill turns', step: 1, min: 1, max: 6 }
]
const knobs = reactive<Record<KnobKey, number>>({
  EMBER_PERIOD_MS: BOSS_TRAIT_TUNING.EMBER_PERIOD_MS,
  EMBER_PCT: BOSS_TRAIT_TUNING.EMBER_PCT,
  FROST_KEEP: BOSS_TRAIT_TUNING.FROST_KEEP,
  CHILL_PER_STACK: BOSS_TRAIT_TUNING.CHILL_PER_STACK,
  CHILL_TURNS: BOSS_TRAIT_TUNING.CHILL_TURNS
})
const setKnob = (key: KnobKey, raw: string) => {
  const v = Number(raw)
  if (!Number.isFinite(v)) return
  knobs[key] = v
  BOSS_TRAIT_TUNING[key] = v
}
const onKnobChange = (key: KnobKey, e: Event) => {
  const el = e.target
  if (el instanceof HTMLInputElement) setKnob(key, el.value)
}
const resetKnobs = () => {
  resetBossTraitTuning()
  for (const k of KNOBS) knobs[k.key] = BOSS_TRAIT_TUNING[k.key]
}
</script>

<template lang="pug">
  FModal(v-model="open" title="Boss Lab")
    div.boss-lab.flex.flex-col.gap-3(data-boss-lab)
      //- Level + arena switches
      div.flex.flex-wrap.items-center.gap-3.text-ink.text-xs
        label.flex.items-center.gap-1
          span.opacity-70 level
          select.boss-lab__select(v-model="bossLabLevelMode")
            option(value="campaign") as in campaign
            option(value="matched") matched to my team (+25 me)
        label.flex.items-center.gap-1
          span.opacity-70 arena
          select.boss-lab__select(v-model="bossLabArena")
            option(v-for="a in BOSS_LAB_ARENAS" :key="a" :value="a") {{ a }}

      //- 10 encounters + 3 sandboxes
      div.boss-lab__grid
        button.boss-lab__tile(
          v-for="(entry, i) in BOSS_LAB_ENTRIES"
          :key="entry.id"
          :ref="(el) => setTileRef(el, i)"
          type="button"
          :class="{ 'is-last': i === bossLabLastIndex, 'is-next': i === nextIndex, 'is-sandbox': entry.kind === 'sandbox' }"
          :data-boss-lab-entry="entry.id"
          @click="launch(i)"
        )
          img.boss-lab__skin(:src="modelImgPath(entry.modelId)" alt="" draggable="false")
          span.boss-lab__slot {{ entry.slot ?? 'sandbox' }}
          span.boss-lab__name {{ bossName(entry.nameKey) }}
          span.flex.items-center.justify-center.gap-1
            BossTraitGlyph(v-for="tr in entry.traits" :key="tr" :trait="tr" :size="16")

      //- Knobs → live BOSS_TRAIT_TUNING (dev only, not persisted)
      div.flex.flex-wrap.items-center.gap-2.text-ink.text-xs
        label.flex.items-center.gap-1(v-for="k in KNOBS" :key="k.key")
          span.opacity-70 {{ k.label }}
          input.boss-lab__num(
            type="number"
            :step="k.step"
            :min="k.min"
            :max="k.max"
            :value="knobs[k.key]"
            @change="onKnobChange(k.key, $event)"
          )
        button.boss-lab__reset(type="button" @click="resetKnobs") reset
</template>

<style scoped lang="sass">
.boss-lab__grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr))
  gap: 0.5rem

.boss-lab__tile
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15rem
  padding: 0.4rem 0.3rem
  border-radius: 0.6rem
  border: 2px solid var(--color-ink)
  background: var(--color-royal-600)
  color: var(--color-ice-50)
  box-shadow: inset 0 2px 0 var(--color-royal-400), 0 3px 0 var(--color-ink)
  cursor: pointer
  text-align: center
  transition: transform 0.24s var(--ui-spring), box-shadow 0.24s var(--ui-spring)

  @media (hover: hover)
    &:hover
      transform: translateY(-2px)
      box-shadow: inset 0 2px 0 var(--color-royal-400), 0 5px 0 var(--color-ink)

  &:active
    transform: translateY(2px)
    box-shadow: inset 0 2px 0 var(--color-royal-400), 0 1px 0 var(--color-ink)
    transition-duration: var(--ui-press-down)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

  &.is-sandbox
    background: var(--color-sky-600)

  &.is-last
    border-color: var(--color-sun-400)

  &.is-next
    box-shadow: 0 0 0 2px var(--color-sky-400)

.boss-lab__skin
  width: 3rem
  height: 3rem
  object-fit: contain

.boss-lab__slot
  font-size: 0.65rem
  font-weight: 800
  opacity: 0.7

.boss-lab__name
  font-size: 0.75rem
  font-weight: 900
  line-height: 1.1

.boss-lab__select, .boss-lab__num
  background: var(--color-ice-50)
  color: var(--color-ink)
  border: 1px solid var(--color-ink)
  border-radius: 0.3rem
  padding: 0.1rem 0.3rem

.boss-lab__num
  width: 4.5rem

.boss-lab__reset
  border: 1px solid var(--color-ink)
  border-radius: 0.3rem
  padding: 0.1rem 0.5rem
  background: var(--color-ice-200)
  color: var(--color-ink)
  cursor: pointer
</style>
