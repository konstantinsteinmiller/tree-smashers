<script setup lang="ts">
import { computed } from 'vue'
import {
  openSkinChest,
  skinChestCooldownPct,
  skinChestHasRewards,
  skinChestIconSkin,
  skinChestReady,
  skinChestTimeDisplay,
  type GrantedSkin
} from '@/use/useSkinChest'
import { modelImgPath } from '@/use/useModels'
import useSounds from '@/use/useSound'

const emit = defineEmits<{
  /** A ripe chest was tapped: put `featured` on the skin roulette. */
  (e: 'opened', featured: GrantedSkin): void
}>()

const iconSrc = computed(() => modelImgPath(skinChestIconSkin.value))

// Inline mask-image style so the overlay clips to whichever skin is
// currently previewed. The CSS class supplies size/repeat/position; the
// URL has to be inline because it's data-driven. NB: this style is
// applied to the WRAPPER div (which never rotates), not the inner SVG —
// see the template comment for why.
const overlayMaskStyle = computed(() => ({
  '-webkit-mask-image': `url('${iconSrc.value}')`,
  maskImage: `url('${iconSrc.value}')`
}))

const onClick = () => {
  if (!skinChestReady.value) return
  const featured = openSkinChest()
  if (!featured) return
  const { playSound } = useSounds()
  playSound('happy')
  emit('opened', featured)
}
</script>

<template lang="pug">
  //- Skin chest pill — skin preview on the LEFT, countdown on the RIGHT.
  //- Lives above the 1x/2x speed switch (see SpinnerArena.vue) so the
  //- timer reads as a passive cooldown next to the active controls.
  div.flex.flex-row.items-center.gap-2.pointer-events-auto.skin-chest-row(
    v-if="skinChestHasRewards"
    @click="onClick"
    :class="skinChestReady ? 'cursor-pointer is-ready' : ''"
    :data-sfx="skinChestReady ? 'press' : 'off'"
  )
    div.skin-chest-icon.relative(class="w-6 h-6 sm:w-8 sm:h-8")
      img.object-contain.w-full.h-full.rounded-full(
        :src="iconSrc"
        alt="skin-chest-preview"
      )
      span.skin-chest-notify.ui-notify(v-if="skinChestReady" aria-hidden="true") !
      //- Circular cooldown overlay — opacity ~30% lower than the chest
      //- variant (stroke alpha 0.25 vs 0.35) so the muted skin preview
      //- stays readable under the darkening. Mask binds to the current
      //- `iconSrc` so the overlay clips to the skin's silhouette
      //- (without the mask the SVG is a square and shows ugly black
      //- corners around the round skin disc).
      //-
      //- The skin-shaped mask must live on the wrapper div, NOT on the
      //- SVG: the SVG carries a rotate(-90)/scaleX(-1) transform to make
      //- the conic stroke fill clockwise, and applying the mask to the
      //- same element rotates the silhouette upside-down relative to the
      //- skin image underneath.
      div.absolute.inset-0.w-full.h-full.cooldown-mask-skin(
        v-if="!skinChestReady"
        :style="overlayMaskStyle"
      )
        svg.w-full.h-full(
          viewBox="0 0 40 40"
          style="transform: rotate(-90deg) scaleX(-1)"
        )
          circle(
            cx="20" cy="20" r="19"
            fill="none"
            stroke="rgba(22, 26, 64,0.3)"
            stroke-width="40"
            :stroke-dasharray="119.38"
            :stroke-dashoffset="119.38 * (1 - skinChestCooldownPct)"
          )
    //- Timer label — warm sun gold, tuned to be readable
    //- without yelling for attention. Stays on the right of the skin.
    span.game-text.font-bold.skin-chest-timer-label(
      class="text-[0.75rem] sm:text-xs"
    ) {{ skinChestTimeDisplay }}
</template>

<style scoped lang="sass">
// Quiet while it cooks (no motion); ripe: the skin hops and spins a little
// every 2.2 s with a berry "!" on its shoulder, and the label turns into
// a sun chip. Transform only.
.skin-chest-row.is-ready .skin-chest-icon
  transform-origin: 50% 90%
  animation: skin-chest-hop 2.2s ease-in-out infinite

@keyframes skin-chest-hop
  0%, 45%, 100%
    transform: translateY(0) rotate(0) scale(1)
  12%
    transform: translateY(-6px) rotate(-12deg) scale(1.12)
  24%
    transform: translateY(0) rotate(6deg) scale(1.04, 0.92)
  34%
    transform: translateY(-1px) rotate(0)

.skin-chest-row.is-ready:active .skin-chest-icon
  animation: none
  transform: translateY(2px) scale(1.08, 0.9)

.skin-chest-notify
  position: absolute
  top: -0.35rem
  right: -0.5rem
  min-width: 1rem
  height: 1rem
  font-size: 0.65rem

.skin-chest-row.is-ready .skin-chest-timer-label
  color: var(--color-ink)
  background-color: var(--color-sun-400)
  text-shadow: none
  box-shadow: inset 0 -2px 0 var(--color-sun-600), 0 2px 0 var(--color-ink)

@media (prefers-reduced-motion: reduce)
  .skin-chest-row.is-ready .skin-chest-icon
    animation: none

// Warm muted orange — matches the warm wood palette and reads
// as "passive cooldown" rather than the urgent yellow/red used by the
// game-loop UI. Slight text-shadow keeps it legible against any
// arena background.
.skin-chest-timer-label
  color: var(--color-sun-300)
  text-shadow: var(--ui-stroke-sm)
  padding: 0.05rem 0.4rem 0.1rem
  border: 2px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-royal-900)
  box-shadow: 0 2px 0 var(--color-ink)
  // `tabular-nums` gives every digit the same advance width so a
  // ticking countdown ("12:34" → "12:33" → ...) doesn't reflow the
  // row by a couple of pixels each second. Combined with a fixed
  // `min-width` pinned to the widest possible label (8-character
  // "HH:MM:SS"), the row holds a stable bounding box for the entire
  // 20-hour cycle — so the skin preview to its left never jiggles
  // sideways as time advances.
  font-variant-numeric: tabular-nums
  font-feature-settings: 'tnum'
  // 8 chars * ~0.55em (tabular monospace digit + colon) ≈ 4.4em.
  // Slight rounding margin so a 1px sub-pixel difference never trips
  // the next reflow.
  min-width: 5.6em
  text-align: center
  display: inline-block

// Mask sizing/positioning lives in CSS; the actual mask-image URL is
// applied inline (it depends on the currently previewed skin).
// Rotation is set inline too so the inline `transform` doesn't trample
// these mask properties.
.cooldown-mask-skin
  -webkit-mask-size: contain
  -webkit-mask-repeat: no-repeat
  -webkit-mask-position: center
  mask-size: contain
  mask-repeat: no-repeat
  mask-position: center
</style>
