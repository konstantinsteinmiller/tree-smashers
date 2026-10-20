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
      div.lgc__ribbon {{ t('league.gate.title') }}
      div.lgc__stage
        div.lgc__rays(aria-hidden="true")
        div.lgc__crest(aria-hidden="true")
          img.lgc__badge(v-if="gate.badgeSrc" :src="gate.badgeSrc" alt="" draggable="false")
          img.lgc__portrait(v-else-if="portrait" :src="portrait" alt="" draggable="false")
        div.lgc__tier(aria-hidden="true")
          LeagueTierIcon(:tier="tier" :size="44" :division="tier === 'champion' ? null : 3" :animated="false")
      div.lgc__name {{ bossName }}
      div.lgc__goal {{ t('league.gate.goal', { rank: rankText }) }}
      button.lgc__cta(
        type="button"
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

.lgc__shadow
  position: absolute
  inset: 0
  transform: translateY(5px)
  border-radius: var(--radius-ui-lg)
  background: var(--color-ink)

// Cream card with a stitched edge; the boss sits on a berry patch.
.lgc__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  padding: 0 0.9rem 0.8rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-cream-100)
  box-shadow: inset 0 -4px 0 var(--color-cream-300)
  outline: 2px dashed rgba(110, 69, 39, 0.35)
  outline-offset: -7px
  overflow: hidden

.lgc__ribbon
  align-self: stretch
  margin: 0 -0.9rem
  padding: 0.3rem 0.5rem
  font-size: 0.85rem
  font-weight: 900
  letter-spacing: 0.04em
  text-transform: uppercase
  color: var(--color-ink)
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600)
  border-bottom: 3px solid var(--color-ink)

.lgc__stage
  position: relative
  width: 7.5rem
  height: 7.5rem
  margin-top: 0.3rem
  display: flex
  align-items: center
  justify-content: center

// Flat sunburst petals behind the crest.
.lgc__rays
  position: absolute
  inset: -1.5rem
  background: repeating-conic-gradient(from 0deg, var(--color-sun-200) 0deg 10deg, transparent 10deg 30deg)
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
  border: 3px solid var(--color-ink)
  background-color: var(--color-berry-400)
  box-shadow: inset 0 -6px 0 var(--color-berry-600), 0 4px 0 var(--color-ink)
  display: flex
  align-items: center
  justify-content: center
  overflow: hidden

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
  font-size: 1.2rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-berry-700)
  overflow-wrap: anywhere

.lgc__goal
  font-size: 0.85rem
  font-weight: 800
  color: var(--ui-text-muted)
  line-height: 1.2

// Boss challenge CTA in the danger (berry) tone, same look as .ui-btn--danger.
.lgc__cta
  margin-top: 0.3rem
  min-height: 2.75rem
  min-width: 10rem
  max-width: 100%
  padding: 0.35rem 1.2rem
  border-radius: var(--radius-ui)
  border: 3px solid var(--color-ink)
  background-color: var(--color-berry-500)
  box-shadow: inset 0 3px 0 var(--color-berry-300), inset 0 -4px 0 var(--color-berry-700), 0 4px 0 var(--color-ink)
  color: var(--color-cream-50)
  font-size: 1.05rem
  font-weight: 900
  letter-spacing: 0.03em
  text-transform: uppercase
  text-shadow: -1.5px -1.5px 0 var(--color-ink), 1.5px -1.5px 0 var(--color-ink), -1.5px 1.5px 0 var(--color-ink), 1.5px 1.5px 0 var(--color-ink), 0 2px 0 var(--color-ink)
  cursor: pointer
  animation: lgc-pulse 1.6s ease-in-out infinite

  &:active:not(:disabled)
    transform: translateY(2px) scale(0.97)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
  &:disabled
    cursor: default
    animation: none

@keyframes lgc-pulse
  50%
    transform: scale(1.04)

.lgc--disabled .lgc__cta
  filter: grayscale(0.85) brightness(0.9)

.lgc--static
  .lgc__rays, .lgc__cta
    animation: none

@media (prefers-reduced-motion: reduce)
  .lgc__rays, .lgc__cta
    animation: none !important
</style>
