<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META } from '@/use/leagueTiers'
import { LP_PER_DIVISION, atPromotionGate, tierOf } from '@/league/leagueMath'
import { lpBarFill } from '@/league/ui/leagueUi'

/**
 * ─── League LP bar (LG5a) ───────────────────────────────────────────────────
 *
 * Progress through the CURRENT division: 0…99 of 100 LP, filled in the tier's
 * accent. At x99 of Division I the next fight is the promotion gate, so the
 * bar's end carries a gate marker. Champion has no divisions — the bar is
 * full and the label is the leaderboard position `#N` plus the LP.
 *
 * `from`: an LP to animate FROM (the result panel's lpBefore). Within one
 * division the fill slides; across a division line it restarts from the new
 * division's floor. Low render quality and prefers-reduced-motion jump
 * straight to the final fill.
 */

const props = withDefaults(defineProps<{
  lp: number
  /** Champion's leaderboard position (#N); ignored below Champion. */
  championPosition?: number | null
  /** Animate from this LP (result screen). */
  from?: number | null
  /** Slimmer bar for the HUD / result panel. */
  compact?: boolean
}>(), { championPosition: null, from: null, compact: false })

const { t, n } = useI18n()

const pos = computed(() => tierOf(props.lp))
const isChampion = computed(() => pos.value.tier === 'champion')
const atGate = computed(() => atPromotionGate(props.lp))
const accent = computed(() => LEAGUE_TIER_META[pos.value.tier].accent)
const target = computed(() => lpBarFill(props.lp))

const reduced = (): boolean =>
  isLowQuality.value
  || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

/** Start fill: `from` when it sits in the same division, else empty. */
const startFill = (): number => {
  if (props.from === null || reduced()) return target.value
  const a = tierOf(props.from)
  const same = a.tier === pos.value.tier && a.division === pos.value.division
  if (!same) return props.lp >= props.from ? 0 : 1
  return lpBarFill(props.from)
}

const fill = ref(startFill())
const animating = ref(false)

onMounted(() => {
  if (fill.value === target.value) return
  animating.value = true
  // Two frames: the start width must paint before the transition target.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.value = target.value
  }))
})
watch(target, v => {
  fill.value = v
})

const label = computed(() => {
  if (isChampion.value) {
    const lpText = t('league.lp', { n: n(props.lp) })
    return props.championPosition ? `#${props.championPosition} · ${lpText}` : lpText
  }
  return t('league.lpProgress', { n: pos.value.lpInDivision, max: LP_PER_DIVISION })
})

const ariaText = computed(() =>
  isChampion.value
    ? label.value
    : t('league.lpAria', { n: pos.value.lpInDivision, max: LP_PER_DIVISION }))
</script>

<template lang="pug">
  div.llb(
    data-league="lp-bar"
    :class="{ 'llb--compact': compact, 'llb--champion': isChampion, 'llb--gate': atGate, 'llb--static': isLowQuality }"
    :style="{ '--llb-accent': accent }"
  )
    div.llb__track(
      role="progressbar"
      aria-valuemin="0"
      :aria-valuemax="isChampion ? 1 : LP_PER_DIVISION"
      :aria-valuenow="isChampion ? 1 : pos.lpInDivision"
      :aria-valuetext="ariaText"
    )
      div.llb__fill(
        :class="{ 'llb__fill--anim': animating }"
        :style="{ width: `${Math.round(fill * 1000) / 10}%` }"
      )
        span.llb__shine
      //- Promotion gate: the division's last LP opens the gatekeeper fight.
      span.llb__gate(v-if="atGate" aria-hidden="true")
        svg(viewBox="0 0 24 24" width="100%" height="100%")
          path(d="M5 21V4h2v1.2l10.6.1-2.6 3.9 2.6 3.9H7V21z" fill="#eef5ff" stroke="#161a40" stroke-width="1.6" stroke-linejoin="round")
    div.llb__label(aria-hidden="true") {{ label }}
</template>

<style scoped lang="sass">
.llb
  --llb-accent: var(--color-sun-400)
  display: flex
  flex-direction: column
  gap: 0.2rem
  width: 100%
  min-width: 0

// Deep navy well with a hard inner lip.
.llb__track
  position: relative
  height: 1rem
  border-radius: 999px
  background: var(--color-royal-900)
  border: 2px solid var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-ink), 0 2px 0 var(--color-ink)
  overflow: visible

.llb--compact .llb__track
  height: 0.8rem

// Tier-coloured fill with a two-tone facet (#UX1c, was marching stripes), a
// hard dark base band. While it slides (result screen) the white gloss strip
// pulses twice — the bar visibly "charges".
.llb__fill
  position: absolute
  inset: 0 auto 0 0
  border-radius: 999px
  background-color: var(--llb-accent)
  background-image: var(--ui-facet)
  box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--llb-accent) 62%, var(--color-ink)), 1px 0 0 var(--color-ink)
  min-width: 0.6rem
  overflow: hidden

.llb__fill--anim
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1)

.llb__fill--anim + .llb__shine, .llb__fill--anim .llb__shine
  animation: llb-charge 0.5s ease-in-out 2

@keyframes llb-charge
  50%
    opacity: 0.25

// Hard white gloss strip along the top (flat, no ramp).
.llb__shine
  position: absolute
  inset: 2px 0.35rem auto
  height: 26%
  border-radius: 999px
  background: rgba(255, 255, 255, 0.5)

// Champion: flat four-colour patchwork stripes that slowly slide.
.llb--champion .llb__fill
  background: repeating-linear-gradient(90deg, var(--color-berry-400) 0 1rem, var(--color-sun-400) 1rem 2rem, var(--color-leaf-400) 2rem 3rem, var(--color-sky-400) 3rem 4rem)
  background-size: 4rem 100%
  animation: llb-champ 4s linear infinite

@keyframes llb-champ
  to
    background-position: 4rem 0

// The promotion gate flag: hops on a beat (a sharp hop, then rest).
.llb__gate
  position: absolute
  right: -0.5rem
  top: 50%
  width: 1.5rem
  height: 1.5rem
  transform: translateY(-50%)
  filter: drop-shadow(0 2px 0 var(--color-ink))
  animation: llb-gate 1.5s ease-in-out infinite

@keyframes llb-gate
  0%, 60%, 100%
    transform: translateY(-50%) rotate(0)
  72%
    transform: translateY(-80%) rotate(-10deg) scale(1.15)
  84%
    transform: translateY(-50%) rotate(4deg)

.llb__label
  font-size: 0.74rem
  font-weight: 900
  line-height: 1
  color: var(--color-ice-50)
  text-align: right
  font-variant-numeric: tabular-nums
  text-shadow: var(--ui-stroke-sm)
  white-space: nowrap

.llb--static .llb__fill,
.llb--static .llb__shine,
.llb--static .llb__gate
  animation: none
  transition: none

@media (prefers-reduced-motion: reduce)
  .llb__fill, .llb__shine, .llb__gate
    animation: none !important
    transition: none !important
</style>
