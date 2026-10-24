<script setup lang="ts">
import { isSmasherId } from '@/data/smasherCatalog'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { playUiSfx } from '@/use/uiSfx'
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
 * Look: a face-off — the panels are SKEWED plates leaning in toward the
 * centre (own side sky, opponent berry, two-tone facet, ink outline + hard
 * drop) that slam in from their edges; the sun "VS" sits on a spiky starburst
 * and crashes in with a deep thunk.
 *
 * Cost: transform / opacity keyframes only, a hard 0-blur text outline and
 * one flat ring — no filter, no backdrop-filter, no box-shadow blur on moving
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
  modelImgPath(c.modelId ?? SKINS_PER_TOP[c.topPartId]?.[0] ?? 'blades', isSmasherId(c.smasherId) ? c.smasherId : undefined)

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

// The VS slam lands at ~28 % of the window: one deep "thunk" on that beat
// (uiSfx gates it under ads / pause / mute).
let slamTimer = 0
onMounted(() => {
  slamTimer = window.setTimeout(() => playUiSfx('pressHero'), props.durationMs * 0.27)
})
onBeforeUnmount(() => clearTimeout(slamTimer))

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
          //- Spiky sun starburst behind the letters: an ink star a size up,
          //- the sun star on top (clip-path polygons, flat fills).
          span.vs-star.vs-star--ink.absolute
          span.vs-star.vs-star--sun.absolute
          span.vs-text.relative.font-black {{ t('vs') }}

        div.vs-panel.relative.flex.flex-col.items-center.min-w-0(
          :class="[side.key === 'me' ? 'is-me' : 'is-them', 'gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-3']"
          :data-side="side.key"
        )
          div.vs-name.font-black.uppercase.ui-outline-sm.truncate.max-w-full(
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
              span.vs-lv.font-black.ui-outline-sm.leading-none(class="text-[0.65rem] sm:text-xs") {{ t('lv') }}{{ s.level }}

    div.vs-announce.mt-3.font-black.uppercase.ui-outline.text-center(
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

// ── Panels: skewed team plates leaning in toward the VS ──────────────────
// The PLATE is the ::before (skewed), the content stays upright on top.
.vs-panel
  isolation: isolate

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 3px solid var(--color-ink)
    border-radius: var(--radius-ui)
    background-color: var(--vs-fill)
    background-image: var(--ui-facet)
    box-shadow: inset 0 4px 0 var(--vs-lip), inset 0 -6px 0 var(--vs-band), 0 5px 0 var(--color-ink)
    transform: skewX(var(--vs-skew))

  &.is-me
    --vs-fill: var(--color-sky-600)
    --vs-lip: var(--color-sky-400)
    --vs-band: var(--color-sky-700)
    --vs-skew: -8deg
    animation: vs-in-left var(--vs-dur) cubic-bezier(0.2, 0.9, 0.3, 1.15) both

    .vs-name
      color: var(--color-sky-200)

  &.is-them
    --vs-fill: var(--color-berry-600)
    --vs-lip: var(--color-berry-400)
    --vs-band: var(--color-berry-700)
    --vs-skew: 8deg
    animation: vs-in-right var(--vs-dur) cubic-bezier(0.2, 0.9, 0.3, 1.15) both

    .vs-name
      color: var(--color-berry-300)

.vs-name
  text-shadow: var(--ui-stroke)
  letter-spacing: 0.03em

.vs-spinner
  width: 3rem
  height: 3rem
  filter: drop-shadow(0 3px 0 var(--color-ink))
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
  color: var(--color-sun-300)

// ── VS emblem: sun letters on a spiky starburst ───────────────────────────
.vs-emblem
  width: 3.4rem
  height: 3.4rem
  @media (min-width: 640px)
    width: 4.8rem
    height: 4.8rem
  animation: vs-slam var(--vs-dur) cubic-bezier(0.5, 0, 0.6, 1.4) both

$star: polygon(50% 0%, 61% 30%, 93% 18%, 72% 45%, 100% 62%, 67% 66%, 72% 100%, 50% 77%, 28% 100%, 33% 66%, 0% 62%, 28% 45%, 7% 18%, 39% 30%)

.vs-star
  clip-path: $star

.vs-star--ink
  inset: -26%
  background-color: var(--color-ink)

.vs-star--sun
  inset: -16%
  background-color: var(--color-sun-400)
  // #UX1c: a flat two-tone split (sun over a deeper sun half) instead of stripes.
  background-image: linear-gradient(160deg, var(--color-sun-300) 0 48%, var(--color-sun-500) 48%)

.vs-text
  font-size: 2rem
  line-height: 1
  font-style: normal
  letter-spacing: -0.02em
  color: var(--color-sun-300)
  text-shadow: var(--ui-stroke-xl), 0 7px 0 var(--color-berry-600)
  transform: rotate(-6deg)
  @media (min-width: 640px)
    font-size: 3rem

// Flat shock ring (no blur): a solid light ring that bursts outward.
.vs-ring
  inset: -40%
  border-radius: 9999px
  background: rgba(255, 210, 26, 0.3)
  border: 4px solid rgba(255, 255, 255, 0.7)
  clip-path: circle(36%)
  animation: vs-ring var(--vs-dur) ease-out both

.vs-announce
  text-shadow: var(--ui-stroke-lg)
  letter-spacing: 0.03em
  animation: vs-fade-in var(--vs-dur) ease-out both

// ── Keyframes: percentages ARE fractions of the window ────────────────────
@keyframes vs-out
  0%, 84%
    opacity: 1
  100%
    opacity: 0

// Panels crash in from their edge and overshoot a hair toward the centre.
@keyframes vs-in-left
  0%
    opacity: 0
    transform: translateX(-70%)
  14%
    opacity: 1
    transform: translateX(4%)
  20%, 100%
    opacity: 1
    transform: translateX(0)

@keyframes vs-in-right
  0%
    opacity: 0
    transform: translateX(70%)
  14%
    opacity: 1
    transform: translateX(-4%)
  20%, 100%
    opacity: 1
    transform: translateX(0)

@keyframes vs-slam
  0%, 15%
    opacity: 0
    transform: scale(2.6) rotate(-18deg)
  28%
    opacity: 1
    transform: scale(0.86) rotate(4deg)
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
    transform: scale(1.9)

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

.pvp-vs.is-cheap
  +vs-static

@media (prefers-reduced-motion: reduce)
  .pvp-vs
    +vs-static

    .vs-ring
      display: none
</style>
