<script setup lang="ts">
// ─── PvPButton no-op stub (PvP-disabled builds only) ────────────────────────
//
// Aliased over `@/components/organisms/PvPButton.vue` by `vite.config.ts` when
// `VITE_APP_PVP_ENABLED` is not "true". The button is already behind
// `v-if="canShowPvP"`, which is permanently false there; the stub just keeps
// its markup out of the bundle. See `src/use/usePVP.stub.ts`.

defineEmits<{ (e: 'click'): void }>()
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
