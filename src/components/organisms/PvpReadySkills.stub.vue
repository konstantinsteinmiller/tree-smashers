<script setup lang="ts">
// ─── PvpReadySkills no-op stub (PvP-disabled builds only) ───────────────────
//
// Aliased over `@/components/organisms/PvpReadySkills.vue` by `vite.config.ts`
// when `VITE_APP_PVP_ENABLED` is not "true". The row is rendered only by the
// PvP lobby, which is itself a stub there — but the skills gate holds a lazy
// `import()` of it, so without the swap its chunk would still be emitted.
// See `src/use/usePVP.stub.ts`.

defineOptions({ inheritAttrs: false })
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
