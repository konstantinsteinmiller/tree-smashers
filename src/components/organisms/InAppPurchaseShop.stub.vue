<script setup lang="ts">
// ─── InAppPurchaseShop no-op stub (single-currency builds only) ─────────────
//
// Aliased over `@/components/organisms/InAppPurchaseShop.vue` by
// `vite.config.ts` when `VITE_APP_POKI === 'true'`.
//
// WHY: Poki forbids in-app purchases outright. `.env.poki.local` already sets
// `VITE_APP_FEATURE_BG_SKINS=false`, so the real shop is unreachable at runtime
// — but it was still BUNDLED, and its real-money price strings ($1.29 / $1.99 /
// $9.99) sat in the shipped `SpinnerArena` chunk. "Unreachable" is not an
// argument you get to make to a reviewer who grepped the bundle; the same logic
// as the `game-cdn.poki.com` stub swap applies, and this is the surface with
// the sharpest policy attached to it.
//
// Renders nothing and swallows `v-model`, so `BGSkinModal`'s
// `InAppPurchaseShop(v-model="shopOpen")` stays valid without a `v-if` in a
// component that has no idea Poki exists.

defineProps<{ modelValue?: boolean }>()
defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
