<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import {
  LEAGUE_TIER_META, championPosition, divisionNumeral, leagueBadgeLayout, plaqueLabel,
  type LeagueDivision, type LeagueTier
} from '@/use/leagueTiers'

/**
 * ─── League rank badge ──────────────────────────────────────────────────────
 *
 * The tier icon plus its division numeral (or Champion `#N`), laid out for the
 * size it is rendered at (`leagueBadgeLayout`):
 *
 *   ≥ 65px  the icon alone, label on its own plaque
 *   ≤ 64px  the icon WITHOUT plaque or pips, label as real text beside it —
 *           a plaque at HUD / list size is a few pixels of illegible strokes
 *
 * The badge is ONE image to assistive tech: the wrapper carries the localized
 * "Gold II" / "Champion #12" label, and the icon and the visible text inside
 * are hidden so it is not read twice.
 */

const props = withDefaults(defineProps<{
  tier: LeagueTier
  /** Icon size in CSS px (square). */
  size?: number
  /** Division I–III (1 = top). Ignored for Champion. */
  division?: LeagueDivision | null
  /** Champion only: leaderboard position (`12` or `'#12'`). */
  position?: number | string | null
  /** Allow the icon's idle animation (still subject to quality + reduced motion). */
  animated?: boolean
}>(), { size: 48, division: null, position: null, animated: true })

const { t } = useI18n()

const layout = computed(() => leagueBadgeLayout(props.size))
const inline = computed(() => layout.value.mode === 'inline')
const label = computed(() => plaqueLabel(props.tier, props.division, props.position))
const accent = computed(() => LEAGUE_TIER_META[props.tier].accent)

const ariaLabel = computed(() => {
  const tier = t(LEAGUE_TIER_META[props.tier].nameKey)
  const position = championPosition(props.tier, props.position)
  if (position) return t('league.tierPosition', { tier, position })
  const division = divisionNumeral(props.tier, props.division)
  if (division) return t('league.tierDivision', { tier, division })
  return tier
})
</script>

<template lang="pug">
  span.lrb(
    :class="inline ? 'lrb--inline' : 'lrb--plaque'"
    :style="{ gap: `${layout.gap}px` }"
    role="img"
    :aria-label="ariaLabel"
  )
    LeagueTierIcon(
      aria-hidden="true"
      :tier="tier"
      :size="layout.iconSize"
      :division="inline ? null : division"
      :position="inline ? null : position"
      :animated="animated"
    )
    span.lrb__label(
      v-if="inline && label"
      aria-hidden="true"
      :style="{ fontSize: `${layout.fontSize}px`, color: accent }"
    ) {{ label }}
</template>

<style scoped lang="sass">
.lrb
  display: inline-flex
  align-items: center
  flex-shrink: 0
  line-height: 1
  vertical-align: middle

.lrb__label
  font-weight: 900
  letter-spacing: 0.02em
  white-space: nowrap
  font-variant-numeric: tabular-nums
  // Hard ink outline (no blur — Firefox), the game's own hard-shadow look, so
  // the tier colour reads on a dark HUD and a light plate alike.
  text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 #000
</style>
