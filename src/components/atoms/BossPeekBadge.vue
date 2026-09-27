<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { modelImgPath } from '@/use/useModels'
import { isLowQuality } from '@/use/useQuality'
import { prependBaseUrl } from '@/utils/function'
import type { BossPeek } from '@/use/bossPeek'

/**
 * ─── "Next boss · Stage 5" ──────────────────────────────────────────────────
 *
 * The retention teaser on the campaign win screen: the next boss's portrait
 * (its skin, or the strongest blade of a boss team) inside a painted elite
 * frame — iron band, horned skull, bat wings, fangs — with a banner carrying
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
 * The frame is a painting (art/boss-frame/), and a painter never returns the
 * geometry it was asked for exactly. So the skin is placed by the opening the
 * SHIPPED file actually has — measured on its alpha (inspect the keyed sprite:
 * the transparent region connected to the centre) — not by the reference:
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

const FRAME_SRC = prependBaseUrl('images/boss-frame/boss-frame_384x369.webp')

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

const portraitAlt = computed(() => t('bossPeek.portraitAlt', { name: bossName.value }))
</script>

<template lang="pug">
  div.boss-peek.relative.flex.items-center(:class="{ 'is-static': isLowQuality }")
    //- Framed portrait. Layers, back to front: red glow pulse, the boss skin
    //- in the opening, the painted frame, a few rising embers.
    div.boss-peek__portrait.relative.shrink-0
      div.boss-peek__glow(aria-hidden="true")
      div.boss-peek__skin
        img.boss-peek__skin-img.pointer-events-none(
          v-if="peek.modelId"
          :src="modelImgPath(peek.modelId)"
          :alt="portraitAlt"
          draggable="false"
          decoding="async"
        )
        span.boss-peek__skull(v-else role="img" :aria-label="portraitAlt") 💀
      img.boss-peek__frame.pointer-events-none(
        :src="FRAME_SRC"
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
      )
      span.boss-peek__ember(aria-hidden="true")
      span.boss-peek__ember(aria-hidden="true")
      span.boss-peek__ember(aria-hidden="true")

    //- Banner: tucked under the frame's right wing. The distance chip wraps
    //- under the headline when a long locale runs out of width.
    div.boss-peek__plate.flex.flex-col.min-w-0
      div.flex.flex-wrap.items-baseline(class="gap-x-2 gap-y-0.5")
        span.boss-peek__headline.font-black.uppercase.game-text {{ headline }}
        span.boss-peek__distance.font-bold.game-text {{ distance }}
      span.boss-peek__name.font-black.italic.text-white.game-text {{ bossName }}
</template>

<style scoped lang="sass">
// ── Geometry ────────────────────────────────────────────────────────────────
// --frame-w is the frame box width; the box keeps the painting's aspect.
// Measured on public/images/boss-frame/boss-frame_384x369.webp (see header):
// the opening's centre and its equal-area diameter on the encoded alpha.
.boss-peek
  --frame-w: clamp(6.5rem, 19vh, 8.5rem)
  --frame-aspect: 384 / 369
  --hole-x: 0.5
  --hole-y: 0.519
  --hole-d: 0.5035
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
  width: var(--frame-w)
  aspect-ratio: var(--frame-aspect)
  z-index: 1
  animation: boss-peek-slam 0.7s ease-out 0.3s both

// Slow red pulse behind the frame: a static radial gradient whose opacity and
// scale breathe. Never an animated box-shadow or filter.
.boss-peek__glow
  position: absolute
  left: calc(var(--hole-x) * 100%)
  top: calc(var(--hole-y) * 100%)
  width: calc(var(--hole-d) * 150%)
  aspect-ratio: 1
  border-radius: 9999px
  background: radial-gradient(circle, rgba(255, 60, 20, 0.75) 0%, rgba(200, 10, 10, 0.4) 42%, rgba(120, 0, 0, 0) 70%)
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
  background: radial-gradient(circle at 50% 45%, #6b1016 0%, #240306 72%)
  display: flex
  align-items: center
  justify-content: center

.boss-peek__skin-img
  width: 90%
  height: 90%
  object-fit: contain

.boss-peek__skull
  font-size: calc(var(--frame-w) * 0.2)
  line-height: 1

.boss-peek__frame
  position: absolute
  inset: 0
  width: 100%
  height: 100%

// Embers: three 3px sparks rising off the frame, staggered.
.boss-peek__ember
  position: absolute
  bottom: 18%
  width: 3px
  height: 3px
  border-radius: 9999px
  background: #ffb347
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
  padding: 0.4rem 0.9rem 0.45rem calc(var(--frame-w) * 0.19)
  border-radius: 0 0.9rem 0.9rem 0
  background: linear-gradient(to bottom, #4a0a0f 0%, #230306 60%, #150204 100%)
  border: 2px solid #b91c1c
  border-left: none
  box-shadow: 0 4px 0 #0c0102, inset 0 1px 0 rgba(255, 140, 110, 0.25)

.boss-peek__headline
  color: #fecaca
  font-size: 0.68rem
  letter-spacing: 0.06em
  line-height: 1.1

.boss-peek__distance
  color: #fca5a5
  opacity: 0.9
  font-size: 0.62rem
  line-height: 1.1

.boss-peek__name
  font-size: 1rem
  line-height: 1.2
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

@media (min-width: 640px)
  .boss-peek__headline
    font-size: 0.85rem

  .boss-peek__distance
    font-size: 0.75rem

  .boss-peek__name
    font-size: 1.5rem

@media (orientation: landscape) and (max-height: 500px)
  .boss-peek__plate
    padding: 0.25rem 0.7rem 0.3rem calc(var(--frame-w) * 0.19)

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

@media (prefers-reduced-motion: reduce)
  .boss-peek,
  .boss-peek__portrait
    animation: none

  .boss-peek__glow
    animation: none
    opacity: 0.7

  .boss-peek__ember
    display: none
</style>
