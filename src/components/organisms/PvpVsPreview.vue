<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import { modelImgPath } from '@/use/useModels'
import { SKINS_PER_TOP } from '@/data/skinCatalog'
import { isLowQuality } from '@/use/useQuality'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

/**
 * ─── PvP VS card ───────────────────────────────────────────────────────────
 *
 * PvP-only pre-match card (skills-feature.md §9.1): both teams face each
 * other — the local side LEFT (blue), the opponent RIGHT (red) — each with
 * its spinners and its skill loadout (icon + "Lv.N"), a VS emblem between
 * them and, optionally, the turn announcement underneath.
 *
 * TIMING — it lives INSIDE the engine's existing PvP `deciding_turn` window
 * (1200 ms, a setTimeout in useSpinnerGame's PvP initGame branch) and never
 * changes it: every beat is a fraction of `durationMs`, and the card is fully
 * faded out when the window ends. The caller mounts it for that phase only
 * (v-if) — nothing here gates or delays the simulation.
 *
 *   0 – 18 %   both panels slide in from their side
 *  15 – 30 %   VS emblem slams in (lands at ~28 % ≈ 340 ms)
 *  25 – 55 %   skill chips pop, own side first (staggered)
 *  35 – 50 %   turn announcement fades in
 *  84 – 100 %  whole card fades out (done exactly at durationMs)
 *
 * Cost: transform / opacity keyframes only, a CSS text-shadow and one radial
 * gradient — no filter, no backdrop-filter, no box-shadow blur on moving
 * nodes. Low render quality (`FX.low`, or the `low` prop) drops the shock
 * ring, the glow and the slides (fades only); prefers-reduced-motion does the
 * same. Non-interactive (pointer-events: none) so it can never eat the
 * player's first drag.
 */

const props = withDefaults(defineProps<{
  hostTeam: SpinnerConfig[]
  guestTeam: SpinnerConfig[]
  hostSkills?: SkillLoadout
  guestSkills?: SkillLoadout
  /** This client's role — its side is drawn on the LEFT. */
  myRole: 'host' | 'guest'
  /** Opponent display name; falls back to the host / guest label. */
  opponentName?: string
  /** Optional line under the card ("Your turn!" / "Opponent's turn"). */
  announcement?: string
  /** Length of the window the card must fit (the engine's deciding_turn). */
  durationMs?: number
  /** Force the cheap variant (defaults to the render-quality tier). */
  low?: boolean
}>(), {
  hostSkills: () => [],
  guestSkills: () => [],
  opponentName: '',
  announcement: '',
  durationMs: 1200,
  low: undefined
})

const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

const cheap = computed(() => props.low ?? isLowQuality.value)

const myTeam = computed(() => (props.myRole === 'host' ? props.hostTeam : props.guestTeam))
const theirTeam = computed(() => (props.myRole === 'host' ? props.guestTeam : props.hostTeam))
const mySkills = computed(() => (props.myRole === 'host' ? props.hostSkills : props.guestSkills))
const theirSkills = computed(() => (props.myRole === 'host' ? props.guestSkills : props.hostSkills))

const opponentLabel = computed(() =>
  props.opponentName || t(props.myRole === 'host' ? 'pvp.guest' : 'pvp.host')
)

const imgFor = (c: SpinnerConfig): string =>
  modelImgPath(c.modelId ?? SKINS_PER_TOP[c.topPartId]?.[0] ?? 'blades')

interface Side {
  key: 'me' | 'them'
  label: string
  team: SpinnerConfig[]
  skills: SkillLoadout
  ariaSkills: string
}

const sides = computed<Side[]>(() => [
  { key: 'me', label: t('you'), team: myTeam.value, skills: mySkills.value, ariaSkills: t('skills.title') },
  {
    key: 'them',
    label: opponentLabel.value,
    team: theirTeam.value,
    skills: theirSkills.value,
    ariaSkills: t('skills.opponentSkills')
  }
])

/** Chip pop order: own chips first, then the opponent's, 6 % apart. */
const chipDelay = (sideKey: 'me' | 'them', i: number): string => {
  const n = sideKey === 'me' ? i : mySkills.value.length + i
  return `calc(var(--vs-dur) * ${(0.25 + n * 0.06).toFixed(2)})`
}

const onAnimEnd = (e: AnimationEvent) => {
  if (e.target === e.currentTarget && e.animationName.includes('vs-out')) emit('done')
}
</script>

<template lang="pug">
  div.pvp-vs.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none(
    :class="{ 'is-cheap': cheap }"
    :style="{ '--vs-dur': `${durationMs}ms` }"
    data-testid="pvp-vs-preview"
    @animationend="onAnimEnd"
  )
    div.vs-band.relative.w-full.grid.items-stretch.justify-center(
      class="gap-2 sm:gap-4 px-3 sm:px-6"
    )
      template(v-for="(side, si) in sides" :key="side.key")
        //- VS emblem between the two panels
        div.vs-emblem.relative.shrink-0.self-center.flex.items-center.justify-center(
          v-if="si === 1"
          aria-hidden="true"
        )
          div.vs-ring.absolute.rounded-full(v-if="!cheap")
          span.vs-text.font-black.game-text.italic {{ t('vs') }}

        div.vs-panel.relative.flex.flex-col.items-center.rounded-xl.border-2.min-w-0(
          :class="[side.key === 'me' ? 'is-me' : 'is-them', 'gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-3']"
          :data-side="side.key"
        )
          div.vs-name.font-black.uppercase.game-text.truncate.max-w-full(
            class="text-sm sm:text-lg"
          ) {{ side.label }}

          div.flex.items-center.justify-center(class="gap-1 sm:gap-2")
            img.vs-spinner.object-contain(
              v-for="(c, i) in side.team"
              :key="i"
              :src="imgFor(c)"
              alt=""
              draggable="false"
            )

          div.vs-skills.flex.items-start.justify-center(
            class="gap-2 min-h-[2.75rem] sm:min-h-[3.5rem]"
            role="group"
            :aria-label="side.ariaSkills"
          )
            div.vs-chip.flex.flex-col.items-center(
              v-for="(s, i) in side.skills"
              :key="s.id"
              :style="{ animationDelay: chipDelay(side.key, i) }"
              :data-skill="s.id"
            )
              SkillIcon.vs-chip-icon(:id="s.id" :size="30")
              span.vs-lv.font-black.game-text.leading-none(class="text-[0.65rem] sm:text-xs") {{ t('lv') }}{{ s.level }}

    div.vs-announce.mt-3.font-black.uppercase.tracking-wider.game-text.text-white.text-center(
      v-if="announcement"
      class="text-xl sm:text-3xl px-4"
    ) {{ announcement }}
</template>

<style scoped lang="sass">
// All beats are fractions of --vs-dur (the engine's deciding_turn window).
.pvp-vs
  z-index: 30
  animation: vs-out var(--vs-dur) linear both

// Symmetric around the emblem: both panels get the same column width,
// capped so a wide screen does not stretch them into empty boxes.
.vs-band
  grid-template-columns: minmax(0, 14rem) auto minmax(0, 14rem)
  @media (min-width: 640px) and (min-height: 480px)
    grid-template-columns: minmax(0, 17rem) auto minmax(0, 17rem)

.vs-panel
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.78))

  &.is-me
    border-color: #50aaff
    animation: vs-in-left var(--vs-dur) cubic-bezier(0.2, 0.9, 0.3, 1.15) both

    .vs-name
      color: #9fd0ff

  &.is-them
    border-color: #ff5a6e
    animation: vs-in-right var(--vs-dur) cubic-bezier(0.2, 0.9, 0.3, 1.15) both

    .vs-name
      color: #ffadb8

.vs-spinner
  width: 3rem
  height: 3rem
  @media (min-width: 640px)
    width: 4rem
    height: 4rem
  @media (min-width: 640px) and (min-height: 480px)
    width: 5rem
    height: 5rem

.vs-chip
  gap: 0.15rem
  animation: vs-pop var(--vs-dur) cubic-bezier(0.3, 1.6, 0.5, 1) both

  :deep(.vs-chip-icon)
    width: 30px
    height: 30px
    @media (min-width: 640px) and (min-height: 480px)
      width: 38px
      height: 38px

.vs-lv
  color: #fde68a

.vs-emblem
  width: 3rem
  height: 3rem
  @media (min-width: 640px)
    width: 4.5rem
    height: 4.5rem
  animation: vs-slam var(--vs-dur) cubic-bezier(0.5, 0, 0.6, 1.4) both

.vs-text
  font-size: 1.9rem
  line-height: 1
  color: #ffe066
  text-shadow: 0 0 10px rgba(255, 170, 40, 0.85), 2px 2px 0 #7a2500, -1px -1px 0 #000
  @media (min-width: 640px)
    font-size: 2.8rem

.vs-ring
  inset: -30%
  background: radial-gradient(circle, rgba(255, 224, 102, 0.55) 0%, rgba(255, 150, 40, 0.25) 45%, transparent 70%)
  animation: vs-ring var(--vs-dur) ease-out both

.vs-announce
  animation: vs-fade-in var(--vs-dur) ease-out both

// ── Keyframes: percentages ARE fractions of the window ────────────────────
@keyframes vs-out
  0%, 84%
    opacity: 1
  100%
    opacity: 0

@keyframes vs-in-left
  0%
    opacity: 0
    transform: translateX(-60%)
  18%, 100%
    opacity: 1
    transform: translateX(0)

@keyframes vs-in-right
  0%
    opacity: 0
    transform: translateX(60%)
  18%, 100%
    opacity: 1
    transform: translateX(0)

@keyframes vs-slam
  0%, 15%
    opacity: 0
    transform: scale(2.4) rotate(-12deg)
  28%
    opacity: 1
    transform: scale(0.9) rotate(0deg)
  34%, 100%
    opacity: 1
    transform: scale(1) rotate(0deg)

@keyframes vs-ring
  0%, 26%
    opacity: 0
    transform: scale(0.4)
  32%
    opacity: 1
  60%, 100%
    opacity: 0
    transform: scale(1.8)

// Chips: the delay (0.25–0.43 × window) comes from the template; the pop
// itself takes 10 % of the window.
@keyframes vs-pop
  0%
    opacity: 0
    transform: scale(0.3)
  10%
    opacity: 1
    transform: scale(1)
  100%
    opacity: 1
    transform: scale(1)

@keyframes vs-fade-in
  0%, 35%
    opacity: 0
  50%, 100%
    opacity: 1

// ── Cheap path (FX.low) and reduced motion: fades only ─────────────────────
@keyframes vs-fade
  0%
    opacity: 0
  12%, 100%
    opacity: 1

@mixin vs-static
  .vs-panel.is-me, .vs-panel.is-them, .vs-emblem, .vs-chip, .vs-announce
    animation: vs-fade var(--vs-dur) linear both
  .vs-chip
    animation-delay: 0s !important
  .vs-text
    text-shadow: 2px 2px 0 #7a2500, -1px -1px 0 #000

.pvp-vs.is-cheap
  +vs-static

@media (prefers-reduced-motion: reduce)
  .pvp-vs
    +vs-static

    .vs-ring
      display: none
</style>
