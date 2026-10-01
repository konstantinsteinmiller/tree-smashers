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
          path(d="M5 21V4h2v1.2l10.6.1-2.6 3.9 2.6 3.9H7V21z" fill="#fff" stroke="#0f1a30" stroke-width="1.6" stroke-linejoin="round")
    div.llb__label(aria-hidden="true") {{ label }}
</template>

<style scoped lang="sass">
.llb
  --llb-accent: #ffc93c
  display: flex
  flex-direction: column
  gap: 0.2rem
  width: 100%
  min-width: 0

.llb__track
  position: relative
  height: 0.95rem
  border-radius: 999px
  background: #0a1425
  border: 2px solid #0f1a30
  box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.45)
  overflow: visible

.llb--compact .llb__track
  height: 0.7rem

.llb__fill
  position: absolute
  inset: 0 auto 0 0
  border-radius: 999px
  background: linear-gradient(to bottom, color-mix(in srgb, var(--llb-accent) 70%, #fff), var(--llb-accent) 55%, color-mix(in srgb, var(--llb-accent) 70%, #000))
  min-width: 0.6rem
  overflow: hidden

.llb__fill--anim
  transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1)

.llb__shine
  position: absolute
  inset: 1px 0.3rem auto
  height: 35%
  border-radius: 999px
  background: rgba(255, 255, 255, 0.45)

.llb--champion .llb__fill
  background: linear-gradient(90deg, #ff4f7b, #ffc93c, #9fe6ff, #ff4f7b)
  background-size: 200% 100%
  animation: llb-champ 4s linear infinite

@keyframes llb-champ
  to
    background-position: -200% 0

.llb__gate
  position: absolute
  right: -0.45rem
  top: 50%
  width: 1.35rem
  height: 1.35rem
  transform: translateY(-50%)
  filter: drop-shadow(0 2px 0 #0f1a30)
  animation: llb-gate 1.4s ease-in-out infinite

@keyframes llb-gate
  50%
    transform: translateY(-50%) scale(1.15)

.llb__label
  font-size: 0.72rem
  font-weight: 900
  line-height: 1
  color: #dce6f5
  text-align: right
  font-variant-numeric: tabular-nums
  text-shadow: 0 1px 0 #000
  white-space: nowrap

.llb--static .llb__fill,
.llb--static .llb__gate
  animation: none
  transition: none

@media (prefers-reduced-motion: reduce)
  .llb__fill, .llb__gate
    animation: none !important
    transition: none !important
</style>
