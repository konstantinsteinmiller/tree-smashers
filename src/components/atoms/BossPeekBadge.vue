<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VsPortrait from '@/components/atoms/VsPortrait.vue'
import { smasherForSkin } from '@/smashers/smasherSkins'
import { isLowQuality } from '@/use/useQuality'
import type { BossPeek } from '@/use/bossPeek'
// Bosses 100+ (bosses gate): the trait glyph is a lazy handle, null on a
// bosses100-off build; the crest lookup is pure boundary data used only
// behind the literal.
import { BOSSES100_BUILD, BossTraitGlyphUi } from '@/bosses/bosses100Gate'
import { bossBadgeImgPathForSkin } from '@/data/bossArt'
import { bossFrameArt } from '@/use/bossFrameArt'

/**
 * ─── "Next boss · Stage 5" ──────────────────────────────────────────────────
 *
 * The retention teaser on the campaign win screen: the next boss's portrait
 * (its skin, or the strongest blade of a boss team) inside a round wood
 * frame (CSS) with a berry trim, beside a berry plaque carrying
 * its name and the stage it waits on. Pure presentation: whether it shows and
 * what it names is decided by `getBossPeek` in `@/use/bossPeek` (unit-tested).
 *
 * It must never cost the reward flow anything: no await, no click handler of
 * its own (a tap on it bubbles to the overlay's tap-to-continue like a tap
 * anywhere else), and every animation is transform/opacity only. Low render
 * quality (`FX.low`) and prefers-reduced-motion get a static badge.
 *
 * ── Frame registration ──
 *
 * The frame is a CSS ring today (cozy restyle). ART-DESK SEAM: if a painted
 * frame replaces it, place the skin by the opening the SHIPPED file actually
 * has, measured on its alpha:
 *
 *   --hole-x / --hole-y   opening centre, fraction of the frame box
 *   --hole-d              opening diameter, fraction of the frame box WIDTH
 *
 * Re-paint the frame → re-measure → update these three numbers.
 */

const props = defineProps<{
  peek: BossPeek
}>()

const { t } = useI18n()

// The painted portal frame (tools/boss-frame-art), null until it has loaded
// (and always under ?art=procedural): the CSS ring is the fallback.
const frameArt = computed(() => bossFrameArt())


/** Same construction as StageBadge: translated stage name + cycle numeral. */
const bossName = computed(() => {
  const translated = t(`stages.${props.peek.nameKey}`, props.peek.nameKey)
  return props.peek.cycleSuffix ? `${translated} ${props.peek.cycleSuffix}` : translated
})

const headline = computed(() => t('bossPeek.nextBoss', { n: props.peek.bossStageId }))

const distance = computed(() =>
  props.peek.stagesAway <= 1
    ? t('bossPeek.nextUp')
    : t('bossPeek.stagesAway', { n: props.peek.stagesAway })
)

// The skin is DRAWN (VsPortrait): the painted portrait / sheet frame when the
// look is painted (a smasher's signature skin; ?art=procedural turns it off),
// the rig otherwise — at css × dpr, redrawn when a painting decodes late. It
// is fitted into the round opening by its MEASURED alpha (portraitFit.ts),
// not by the FRAME_BOX, which left every smasher low with its base on the
// bottom rim. The canvas size is the opening's measured css size.
const smasherId = computed(() => (props.peek.modelId ? smasherForSkin(props.peek.modelId) : null))
const skinEl = ref<HTMLElement | null>(null)
const skinPx = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = skinEl.value
  if (!el) return
  const read = () => { skinPx.value = Math.round(el.clientWidth) }
  read()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(read)
    ro.observe(el)
  }
})
onBeforeUnmount(() => ro?.disconnect())
/** Rim of the portrait disc (the old DOM portrait's gold). */
const PORTRAIT_RIM = '#e0b04a'
const FIT = { fill: 0.93, lift: 0.06 }

const portraitAlt = computed(() => t('bossPeek.portraitAlt', { name: bossName.value }))

// Stage-101+ encounters (bosses-100-feature.md §7.2): the boss's crest on the
// frame's upper-left shoulder and its mechanics as a glyph row under the name,
// so the player learns what is coming 1–2 stages ahead. Classic bosses: none.
const crestSrc = computed(() => (BOSSES100_BUILD && props.peek.encounterId ? bossBadgeImgPathForSkin(props.peek.modelId) : null))
const traits = computed(() => (BOSSES100_BUILD && props.peek.encounterId ? props.peek.traits ?? [] : []))
</script>

<template lang="pug">
  div.boss-peek.relative.flex.items-center(
    :class="{ 'is-static': isLowQuality, 'is-painted': !!frameArt }"
    :style="frameArt ? frameArt.vars : undefined"
  )
    //- Framed portrait. Layers, back to front: berry pulse, the boss skin in
    //- the opening, a round wood frame (CSS), a few rising sparks.
    //- ART-DESK SEAM: a painted cozy wood/berry frame can replace
    //- .boss-peek__frame (keep the box; --hole-* describe its opening).
    div.boss-peek__portrait.relative.shrink-0
      div.boss-peek__glow(aria-hidden="true")
      div.boss-peek__skin(ref="skinEl" :role="smasherId ? 'img' : undefined" :aria-label="smasherId ? portraitAlt : undefined")
        VsPortrait.boss-peek__skin-img(
          v-if="smasherId && peek.modelId && skinPx > 0"
          :smasher-id="smasherId"
          :model-id="peek.modelId"
          :frame="1"
          :width="skinPx"
          :height="skinPx"
          :rim="PORTRAIT_RIM"
          :fit-circle="FIT"
        )
        span.boss-peek__skull(v-else-if="!smasherId" role="img" :aria-label="portraitAlt") 💀
      img.boss-peek__frame-art.pointer-events-none(
        v-if="frameArt"
        :src="frameArt.src"
        alt=""
        aria-hidden="true"
        draggable="false"
        data-boss-frame="painted"
      )
      div.boss-peek__frame.pointer-events-none(v-else aria-hidden="true" data-boss-frame="css")
      span.boss-peek__ember(aria-hidden="true")
      span.boss-peek__ember(aria-hidden="true")
      span.boss-peek__ember(aria-hidden="true")
      //- New-encounter crest (the painted hex badge) on the upper-left shoulder.
      img.boss-peek__crest.pointer-events-none(
        v-if="crestSrc"
        :src="crestSrc"
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
      )

    //- Banner: tucked under the frame's right wing. The distance chip wraps
    //- under the headline when a long locale runs out of width.
    div.boss-peek__plate.flex.flex-col.min-w-0
      div.flex.flex-wrap.items-baseline(class="gap-x-2 gap-y-0.5")
        span.boss-peek__headline.font-black.uppercase.game-text {{ headline }}
        span.boss-peek__distance.font-bold.game-text {{ distance }}
      span.boss-peek__name.font-black.text-cream-50.game-text {{ bossName }}
      //- The encounter's mechanics (flame ring / ice block / snowflake).
      div.boss-peek__traits.flex.items-center(v-if="BossTraitGlyphUi && traits.length" data-boss-peek-traits)
        component(v-for="tr in traits" :key="tr" :is="BossTraitGlyphUi" :trait="tr" :size="20")
</template>

<style scoped lang="sass">
// ── Geometry ────────────────────────────────────────────────────────────────
// --frame-w is the CSS ring's box width (a painted frame's box is
// --frame-scale times that; see bossFrameArt.ts). The CSS ring is round: its opening is
// centred and --hole-d of the box wide (1 - 2 x the ring thickness).
.boss-peek
  --frame-w: clamp(6.5rem, 19vh, 8.5rem)
  --frame-aspect: 1
  --hole-x: 0.5
  --hole-y: 0.5
  --hole-d: 0.74
  max-width: min(94vw, 34rem)
  animation: boss-peek-in 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28) 0.3s both

@media (min-width: 640px)
  .boss-peek
    --frame-w: 12rem

// Short landscape phones: the portrait sits beside the coins/rank stack (see
// SpinnerArena `.reward-meta.has-peek`), so its height is the row's height.
// 28vh = the row height the column can spare, measured at 568x320 and 740x360
// with the win tip up (skin ≈ 45-50px there, up from ~30px).
// The horn tips and fang points may hang ~5px into the column gaps above and
// below (negative block margin): that buys back the one line a German or
// Russian win tip wraps to at 740x360.
@media (orientation: landscape) and (max-height: 500px)
  .boss-peek
    --frame-w: min(28vh, 6.25rem)

  .boss-peek__portrait
    margin-block: -0.3rem

.boss-peek__portrait
  width: calc(var(--frame-w) * var(--frame-scale, 1))
  aspect-ratio: var(--frame-aspect)
  z-index: 1
  animation: boss-peek-slam 0.7s ease-out 0.3s both

// Slow berry pulse behind the frame: a flat disc whose opacity and scale
// breathe. Never an animated box-shadow or filter.
.boss-peek__glow
  position: absolute
  left: calc(var(--hole-x) * 100%)
  top: calc(var(--hole-y) * 100%)
  width: calc(var(--hole-d) * 150%)
  aspect-ratio: 1
  border-radius: 9999px
  // flat disc clipped round the hole (no gradient)
  background: color-mix(in srgb, var(--color-berry-400) 45%, transparent)
  clip-path: circle(34%)
  transform: translate(-50%, -50%)
  animation: boss-peek-glow 2.4s ease-in-out 1s infinite
  pointer-events: none

.boss-peek__skin
  position: absolute
  left: calc(var(--hole-x) * 100%)
  top: calc(var(--hole-y) * 100%)
  // 4% over the opening so the frame's inner lip always covers the skin's edge.
  width: calc(var(--hole-d) * 104%)
  aspect-ratio: 1
  border-radius: 9999px
  overflow: hidden
  transform: translate(-50%, -50%)
  background-color: var(--color-cream-200)
  display: flex
  align-items: center
  justify-content: center

.boss-peek__skin-img
  position: absolute
  inset: 0

.boss-peek__skull
  font-size: calc(var(--frame-w) * 0.2)
  line-height: 1

.boss-peek__frame
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  box-sizing: border-box
  border-radius: 9999px
  // Wood ring with ink edges and a berry inner trim; 0-blur shadows only.
  border: calc(var(--frame-w) * 0.13) solid var(--color-wood-600)
  box-shadow: 0 0 0 3px var(--color-ink), 0 5px 0 3px var(--color-ink), inset 0 0 0 3px var(--color-ink), inset 0 0 0 6px var(--color-berry-500)
  // A solid light keyline on the ring (#UX1c: no stitch dashes on hard UI).
  outline: 2px solid rgba(255, 255, 255, 0.35)
  outline-offset: calc(var(--frame-w) * -0.065 - 1px)

// The painted portal: the image IS the box (its aspect drives the box); the
// skin sits in its measured opening. Idle: the frame breathes a 2 % scale on
// its own layer (transform only, no filter) once the slam has landed.
.boss-peek__frame-art
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  object-fit: fill
  transform-origin: 50% 60%
  animation: boss-frame-idle 3.2s ease-in-out 1.1s infinite

.boss-peek.is-painted
  .boss-peek__skin
    width: calc(var(--hole-d) * 106%)
    background-color: var(--color-berry-300)
  .boss-peek__glow
    display: none
  .boss-peek__plate
    margin-left: calc(var(--frame-w) * -0.2)
    padding-left: calc(var(--frame-w) * 0.22)

// New-encounter crest on the upper-left shoulder (clear of the skull).
.boss-peek__crest
  position: absolute
  left: 0
  top: 4%
  width: 34%
  height: auto
  z-index: 2

.boss-peek__traits
  gap: 0.3rem
  margin-top: 0.15rem

// Sparks: three 3px sun sparks rising off the frame, staggered.
.boss-peek__ember
  position: absolute
  bottom: 18%
  width: 3px
  height: 3px
  border-radius: 9999px
  background: var(--color-sun-300)
  opacity: 0
  pointer-events: none
  animation: boss-peek-ember 2.6s ease-out infinite

  &:nth-of-type(1)
    left: 30%
    animation-delay: 1.2s

  &:nth-of-type(2)
    left: 64%
    animation-delay: 2.1s

  &:nth-of-type(3)
    left: 47%
    animation-delay: 2.9s

// ── Banner ──────────────────────────────────────────────────────────────────
.boss-peek__plate
  position: relative
  z-index: 0
  // Tuck under the frame's right wing; pad the text clear of it.
  margin-left: calc(var(--frame-w) * -0.16)
  padding: 0.4rem 1.3rem 0.45rem calc(var(--frame-w) * 0.19)
  // A berry WARNING TAG: the plate is the ::before, skewed so its right end
  // is cut on the diagonal, with a two-tone facet; the text stays
  // upright on top. Its left end hides under the frame's wing.
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border-radius: 0 var(--radius-ui-sm) var(--radius-ui-sm) 0
    background-color: var(--color-berry-600)
    background-image: var(--ui-facet)
    border: 3px solid var(--color-ink)
    border-left: none
    box-shadow: inset 0 3px 0 var(--color-berry-400), inset 0 -4px 0 var(--color-berry-700), 0 4px 0 var(--color-ink)
    transform: skewX(-12deg)
    transform-origin: 0 100%

.boss-peek__headline
  color: var(--color-sun-300)
  font-size: 0.68rem
  letter-spacing: 0.04em
  line-height: 1.1

.boss-peek__distance
  color: var(--color-cream-100)
  font-size: 0.62rem
  line-height: 1.1

.boss-peek__name
  font-size: 1rem
  line-height: 1.2
  text-shadow: var(--ui-stroke)

@media (min-width: 640px)
  .boss-peek__headline
    font-size: 0.85rem

  .boss-peek__distance
    font-size: 0.75rem

  .boss-peek__name
    font-size: 1.5rem

@media (orientation: landscape) and (max-height: 500px)
  .boss-peek__plate
    padding: 0.25rem 1.05rem 0.3rem calc(var(--frame-w) * 0.19)

  .boss-peek__headline
    font-size: 0.65rem

  .boss-peek__distance
    font-size: 0.6rem

  .boss-peek__name
    font-size: 0.9rem

// ── Motion ──────────────────────────────────────────────────────────────────
@keyframes boss-peek-in
  0%
    opacity: 0
  100%
    opacity: 1

// Slams in oversized, then a short shudder.
@keyframes boss-peek-slam
  0%
    transform: scale(1.5)
    opacity: 0
  35%
    transform: scale(0.94)
    opacity: 1
  50%
    transform: scale(1.02) translateX(-3px) rotate(-2deg)
  62%
    transform: translateX(3px) rotate(1.5deg)
  74%
    transform: translateX(-2px) rotate(-1deg)
  86%
    transform: translateX(1px)
  100%
    transform: none

@keyframes boss-frame-idle
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.02) translateY(-1%)

@keyframes boss-peek-glow
  0%, 100%
    opacity: 0.45
    transform: translate(-50%, -50%) scale(0.92)
  50%
    opacity: 0.95
    transform: translate(-50%, -50%) scale(1.06)

@keyframes boss-peek-ember
  0%
    opacity: 0
    transform: translateY(0) scale(1)
  15%
    opacity: 1
  100%
    opacity: 0
    transform: translateY(calc(var(--frame-w) * -0.6)) scale(0.4)

// Low render quality and reduced motion: the same badge, standing still.
.boss-peek.is-static,
.boss-peek.is-static .boss-peek__portrait
  animation: none

.boss-peek.is-static .boss-peek__glow
  animation: none
  opacity: 0.7

.boss-peek.is-static .boss-peek__ember
  display: none

.boss-peek.is-static .boss-peek__frame-art
  animation: none

@media (prefers-reduced-motion: reduce)
  .boss-peek,
  .boss-peek__portrait
    animation: none

  .boss-peek__glow
    animation: none
    opacity: 0.7

  .boss-peek__ember
    display: none

  .boss-peek__frame-art
    animation: none
</style>
