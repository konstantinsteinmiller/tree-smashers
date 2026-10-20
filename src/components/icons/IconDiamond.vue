<script setup lang="ts">
// Reusable diamond (premium currency) icon. Renders the shared
// `diamond_256x256.webp` so every diamond reference in the UI — CoinBadge,
// Battle Pass cards, reward popups — stays visually consistent. Size/extra
// styling come from the class passed by the caller (mirrors how IconCoin is
// sized at each call site).
import { prependBaseUrl } from '@/utils/function'

const src = prependBaseUrl('images/icons/diamond_256x256.webp')
</script>

<template lang="pug">
  img.icon-diamond.object-contain(
    :src="src"
    alt="diamond"
    draggable="false"
  )
</template>

<style scoped lang="sass">
.icon-diamond
  -webkit-user-drag: none
</style>
