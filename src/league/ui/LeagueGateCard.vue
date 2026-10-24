<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { modelImgPath } from '@/use/useModels'
import { LEAGUE_TIER_META } from '@/use/leagueTiers'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import { gatekeeperCard, type GateTier } from '@/league/leagueGatekeepers'

/**
 * ─── League promotion-gate card (LG5b) ──────────────────────────────────────
 *
 * At x99 of Division I the three opponent cards give way to ONE gatekeeper
 * boss. LM4: the card shows the boss's NAME and its crest — never a level, a
 * power or any other number that would let a player farm the gate. Classic
 * gatekeepers (Bronze / Silver / Gold) have no crest, so the lead blade's
 * portrait stands in.
 */

const props = withDefaults(defineProps<{
  /** The tier the gate promotes INTO. */
  tier: GateTier
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{ fight: [] }>()

const { t } = useI18n()

const gate = computed(() => gatekeeperCard(props.tier))
const bossName = computed(() => t(gate.value.nameKey))
const tierName = computed(() => t(LEAGUE_TIER_META[props.tier].nameKey))
const rankText = computed(() =>
  props.tier === 'champion' ? tierName.value : t('league.tierDivision', { tier: tierName.value, division: 'III' }))
const portrait = computed(() => (gate.value.badgeSrc ? null : gate.value.modelId ? modelImgPath(gate.value.modelId) : null))
const accent = computed(() => LEAGUE_TIER_META[props.tier].accent)

const onFight = () => {
  if (!props.disabled) emit('fight')
}
</script>

<template lang="pug">
  div.lgc(
    data-league="gate-card"
    :class="{ 'lgc--static': isLowQuality, 'lgc--disabled': disabled }"
    :style="{ '--lgc-accent': accent }"
  )
    div.lgc__shadow(aria-hidden="true")
    div.lgc__body
      div.lgc__ribbon
        span.lgc__ribbonText {{ t('league.gate.title') }}
      div.lgc__stage
        div.lgc__rays(aria-hidden="true")
        div.lgc__crest(aria-hidden="true")
          img.lgc__badge(v-if="gate.badgeSrc" :src="gate.badgeSrc" alt="" draggable="false")
          img.lgc__portrait(v-else-if="portrait" :src="portrait" alt="" draggable="false")
        div.lgc__tier(aria-hidden="true")
          LeagueTierIcon(:tier="tier" :size="44" :division="tier === 'champion' ? null : 3" :animated="false")
      div.lgc__name.ui-slam(style="--slam-delay: 120ms") {{ bossName }}
      div.lgc__goal {{ t('league.gate.goal', { rank: rankText }) }}
      //- The ONE hero CTA of the hub while the gate is up: berry, uppercase,
      //- thick lip, shine sweep, and a heartbeat on the wrapper.
      div.lgc__ctaWrap(:class="{ 'ui-breathe': !disabled && !isLowQuality }")
        button.lgc__cta.ui-btn.ui-btn--danger.ui-btn--hero(
          type="button"
          :class="{ 'ui-shine': !disabled && !isLowQuality }"
          :disabled="disabled"
          :aria-label="t('league.gate.aria', { name: bossName, rank: rankText })"
          @click="onFight"
        )
          span(aria-hidden="true") {{ t('league.gate.challenge') }}
</template>

<style scoped lang="sass">
.lgc
  --lgc-accent: var(--color-sun-400)
  position: relative
  width: 100%
  max-width: 22rem
  margin: 0 auto
  color: var(--ui-text)
  text-align: center
  animation: lgc-in 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) both

// The boss card lands: drops in with a swing.
@keyframes lgc-in
  0%
    transform: translateY(-24px) rotate(-3deg) scale(0.92)
    opacity: 0
  60%
    opacity: 1
  100%
    transform: none
    opacity: 1

.lgc__shadow
  position: absolute
  inset: 0
  transform: translateY(6px)
  border-radius: var(--radius-ui-lg)
  background: var(--color-ink)

// Boss card: ice face, ink outline, a BERRY edge (danger) with corner notches.
.lgc__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  padding: 0 0.9rem 1rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-ice-50)
  box-shadow: inset 0 0 0 3px var(--color-berry-500), inset 0 -8px 0 var(--color-berry-600)
  overflow: hidden

  &::before, &::after
    content: ''
    position: absolute
    // Above the 8px base band so the bars never cross it.
    bottom: 8px
    width: 1.6rem
    height: 1.6rem
    // Corner notches (#UX1c): solid berry dog-ears, no stripes.
    background-color: var(--color-berry-500)
    pointer-events: none

  &::before
    right: 0
    clip-path: polygon(100% 0, 100% 100%, 0 100%)

  &::after
    left: 0
    clip-path: polygon(0 0, 100% 100%, 0 100%)

// Skewed sun-on-ink header plate.
.lgc__ribbon
  align-self: stretch
  margin: -1px -1.2rem 0
  padding: 0.35rem 0.5rem 0.45rem
  background-color: var(--color-royal-900)
  background-image: var(--ui-facet)
  box-shadow: inset 0 -3px 0 var(--color-ink)
  border-bottom: 3px solid var(--color-ink)
  transform: skewY(-3deg)
  transform-origin: 0 0

.lgc__ribbonText
  display: block
  font-size: 0.95rem
  font-weight: 900
  letter-spacing: 0.05em
  text-transform: uppercase
  color: var(--color-sun-300)
  text-shadow: var(--ui-stroke-sm)
  transform: skewY(3deg)

.lgc__stage
  position: relative
  width: 7.5rem
  height: 7.5rem
  margin-top: 0.45rem
  display: flex
  align-items: center
  justify-content: center

// Flat sunburst petals behind the crest (hard-stop conic, no ramp).
.lgc__rays
  position: absolute
  inset: -1.5rem
  background: repeating-conic-gradient(from 0deg, var(--color-sun-300) 0deg 10deg, transparent 10deg 30deg)
  clip-path: circle(40%)
  animation: lgc-spin 18s linear infinite

@keyframes lgc-spin
  to
    transform: rotate(360deg)

.lgc__crest
  position: relative
  width: 6.4rem
  height: 6.4rem
  border-radius: 999px
  border: 4px solid var(--color-ink)
  background-color: var(--color-berry-400)
  background-image: var(--ui-facet)
  box-shadow: inset 0 -7px 0 var(--color-berry-600), 0 5px 0 var(--color-ink)
  display: flex
  align-items: center
  justify-content: center
  overflow: hidden
  animation: lgc-crest 0.55s 0.15s cubic-bezier(0.2, 1.6, 0.4, 1) both

@keyframes lgc-crest
  0%
    transform: scale(0.3) rotate(-25deg)
    opacity: 0
  100%
    transform: none
    opacity: 1

.lgc__badge
  width: 92%
  height: 92%
  object-fit: contain

.lgc__portrait
  width: 120%
  height: 120%
  object-fit: contain

.lgc__tier
  position: absolute
  right: -0.4rem
  bottom: -0.4rem
  filter: drop-shadow(0 2px 0 var(--color-ink))

.lgc__name
  max-width: 100%
  font-size: 1.35rem
  font-weight: 900
  line-height: 1.1
  text-transform: uppercase
  letter-spacing: 0.02em
  color: var(--color-berry-500)
  text-shadow: var(--ui-stroke-sm)
  overflow-wrap: anywhere

.lgc__goal
  font-size: 0.85rem
  font-weight: 800
  color: var(--ui-text-muted)
  line-height: 1.2

.lgc__ctaWrap
  position: relative
  z-index: 1
  margin-top: 0.45rem
  max-width: 100%

.lgc__cta
  min-width: 10rem
  max-width: 100%
  padding: 0.45rem 1.4rem 0.6rem
  font-size: 1.15rem

.lgc--static
  animation: none
  .lgc__rays, .lgc__crest
    animation: none

@media (prefers-reduced-motion: reduce)
  .lgc, .lgc__rays, .lgc__crest
    animation: none !important

// Short landscape phones: a smaller crest and name so the CHALLENGE hero
// stays above the fold of the hub's scroll area.
@media (orientation: landscape) and (max-height: 500px)
  .lgc__body
    gap: 0.2rem
    padding-bottom: 0.75rem
  .lgc__stage
    width: 4.8rem
    height: 4.8rem
    margin-top: 0.25rem
  .lgc__crest
    width: 4.2rem
    height: 4.2rem
  .lgc__rays
    inset: -0.9rem
  .lgc__name
    font-size: 1.05rem
  .lgc__goal
    font-size: 0.78rem
  .lgc__ctaWrap
    margin-top: 0.2rem

</style>
