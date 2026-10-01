<script setup lang="ts">
import { coinArtFailed, coinArtSrc, markCoinArtFailed } from '@/use/coinArt'

// The currency coin everywhere (see `@/use/coinArt`): the painted coin, with
// the drawn SVG below as the silent fallback when the file fails to load.
// Sizing classes from the caller fall through to whichever root renders.
const src = coinArtSrc()
</script>

<template lang="pug">
  img.object-contain.select-none(
    v-if="!coinArtFailed"
    :src="src"
    alt=""
    aria-hidden="true"
    draggable="false"
    @error="markCoinArtFailed"
  )
  //- Fallback drawing. `$` centred optically via dominant-baseline with a
  //- pinned sans-serif stack (a default serif read as a drop shadow).
  svg(v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true")
    circle(cx="12" cy="12" r="11" fill="black")
    circle(cx="12" cy="12" r="10" fill="#fde047")
    text(
      x="12" y="12"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="Arial, Helvetica, sans-serif"
      font-size="14"
      font-weight="bold"
      fill="#2f920e"
    ) $
</template>
