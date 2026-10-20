<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import { registerChordTap } from '@/use/useVConsole'

const { t } = useI18n()

interface Props {
  stageId: number
  name: string
  cycleSuffix?: string
  isBoss?: boolean
  arenaType?: ArenaType
  /** A cheat / Boss Lab test fight (G2): the chip reads "LAB" instead of the
   *  campaign stage number, which such a fight neither uses nor advances. */
  lab?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  cycleSuffix: '',
  isBoss: false,
  arenaType: 'default',
  lab: false
})

/** Number chip text: LAB for a test fight, else the (boss) stage number. */
const chipText = computed(() => {
  if (props.lab) return t('labBadge')
  return props.isBoss ? `💀${props.stageId}` : String(props.stageId)
})

const displayName = computed(() => {
  const translated = t(`stages.${props.name}`, props.name)
  return props.cycleSuffix ? `${translated} ${props.cycleSuffix}` : translated
})

// Per-arena tint for the number chip on the wood plank (design tokens only).
// Boss stages always use the berry chip regardless of arenaType.
const stageChip = computed<string>(() => {
  if (props.isBoss) return 'stage-chip--berry'
  switch (props.arenaType) {
    case 'lava': return 'stage-chip--sun-deep'
    case 'ice': return 'stage-chip--sky'
    case 'forest': return 'stage-chip--leaf'
    case 'thunder': return 'stage-chip--sun'
    case 'shock': return 'stage-chip--plum'
    default: return 'stage-chip--wood'
  }
})
</script>

<template lang="pug">
  //- Cross-WebView reliable chord detection: bind to pointerdown AND
  //- touchstart AND click, dedupe by timestamp inside `registerChordTap`
  //- (60ms window) so a single physical tap counts once. iPhone WKWebView
  //- has been observed to suppress one event family but not the others;
  //- listening to all three guarantees the chord fires regardless.
  //- `touch-action: manipulation` strips iOS's 300ms double-tap-zoom delay.
  //- `pointer-events-auto` is REQUIRED — the parent HUD container in
  //- SpinnerArena.vue is `pointer-events-none` so gameplay touches
  //- pass through to the canvas. Without re-enabling here, none of
  //- our `@pointerdown` / `@touchstart` / `@click` listeners fire
  //- (this was the actual reason the chord didn't trigger on iPhone).
  //- Every other interactive HUD element in this project follows the
  //- same opt-in pattern (FMuteButton, SurrenderIcon, etc.).
  div.stage-badge.relative.pointer-events-auto(
    @pointerdown="registerChordTap"
    @touchstart="registerChordTap"
    @click="registerChordTap"
    class="cursor-pointer"
    style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
  )
    //- Body: a wood plank (design.sass .ui-wood).
    div.stage-plank.ui-wood.relative.flex.items-center.gap-2(
      class="pl-1.5 pr-3 py-1"
    )
      //- Stage number chip, tinted to the arena
      div.stage-chip.relative.flex.items-center.justify-center(
        :class="stageChip"
        class="min-w-7 h-7 sm:min-w-8 sm:h-8 px-1"
      )
        span.font-black.game-text.leading-none(
          class="text-sm sm:text-base"
        ) {{ chipText }}
      //- Label + name stack
      div.flex.flex-col.leading-tight
        span.font-black.uppercase.game-text.text-cream-50(
          class="text-[0.7rem] sm:text-[0.85rem]"
        ) {{ isBoss ? t('bossStage') : t('stageN', { n: stageId }) }}
        span.stage-name.font-bold.game-text(
          class="text-[0.75rem] sm:text-xs"
        ) {{ displayName }}
</template>

<style scoped lang="sass">
.stage-plank
  border-radius: var(--radius-ui)

.stage-chip
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui-sm)
  color: var(--color-cream-50)
  box-shadow: inset 0 2px 0 rgba(255, 250, 240, 0.35), 0 2px 0 var(--color-ink)

.stage-chip--wood
  background-color: var(--color-wood-400)
.stage-chip--berry
  background-color: var(--color-berry-500)
.stage-chip--sun-deep
  background-color: var(--color-sun-600)
.stage-chip--sky
  background-color: var(--color-sky-500)
.stage-chip--leaf
  background-color: var(--color-leaf-500)
.stage-chip--sun
  background-color: var(--color-sun-500)
.stage-chip--plum
  background-color: var(--color-plum-500)

.stage-name
  color: var(--color-cream-200)
</style>
