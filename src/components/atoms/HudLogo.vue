<template lang="pug">
  //- The game's emblem in the battle HUD (under the stage badge). The boot
  //- loader flies its emblem onto this box (FLogoProgress.vue → `[data-hud-logo]`)
  //- and the box shows the same SVG once it has landed (`logoDocked`).
  div.hud-logo(
    data-hud-logo
    role="img"
    :aria-label="t('gameName')"
    :class="{ 'is-docked': logoDocked }"
    :style="{ aspectRatio: String(LOGO_EMBLEM_ASPECT) }"
  )
    img(:src="src" alt="" draggable="false")
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LOGO_EMBLEM_ASPECT, LOGO_EMBLEM_SVG } from '@/data/logoArt'
import { logoDocked } from '@/use/useLogoDock'
import { prependBaseUrl } from '@/utils/function'

// only the global `gameName` — no component copy of its own
const { t } = useI18n()
const src = prependBaseUrl(LOGO_EMBLEM_SVG)
</script>

<style scoped lang="sass">
.hud-logo
  width: 52px
  visibility: hidden
  pointer-events: none
  user-select: none
  -webkit-user-select: none
  &.is-docked
    visibility: visible
    animation: hud-logo-land 0.42s ease-out
  img
    display: block
    width: 100%
    height: 100%
    object-fit: contain
    -webkit-user-drag: none

@media (min-width: 640px) and (min-height: 500px)
  .hud-logo
    width: 64px

// squash-and-settle, never above 1× (an upscale would stretch the raster)
@keyframes hud-logo-land
  0%
    scale: 0.86
  55%
    scale: 1
  75%
    scale: 0.95 1
  100%
    scale: 1

@media (prefers-reduced-motion: reduce)
  .hud-logo.is-docked
    animation: none
</style>
