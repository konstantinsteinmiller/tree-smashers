<script setup lang="ts">
// ─── InAppPurchaseShop no-op stub (EVERY build) ─────────────────────────────
//
// Aliased over `@/components/organisms/InAppPurchaseShop.vue` by
// `vite.config.ts`, unconditionally: the game sells nothing for real money
// right now. The real shop has no IAP backend and no reachable entry point,
// but it was still BUNDLED, and its price strings ($1.29 / $1.99 / $9.99) sat
// in the shipped `SpinnerArena` chunk. "Unreachable" is not an argument you get
// to make to a portal reviewer who grepped the bundle (Poki forbids in-app
// purchases outright, which is where this stub started).
//
// Renders nothing and swallows `v-model`, so `BGSkinModal`'s
// `InAppPurchaseShop(v-model="shopOpen")` stays valid without a `v-if`.

defineProps<{ modelValue?: boolean }>()
defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
