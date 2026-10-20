<script setup lang="ts">
// ─── PvPLobbyModal no-op stub (PvP-disabled builds only) ────────────────────
//
// Aliased over `@/components/organisms/PvPLobbyModal.vue` by `vite.config.ts`
// when `VITE_APP_PVP_ENABLED` is not "true". See `src/use/usePVP.stub.ts` for
// the reasoning: the lobby could never open on those builds (its button is
// hidden), but `SpinnerArena` imports it statically, so the whole modal —
// invite link, WhatsApp share button and all — shipped in the arena chunk.
//
// Renders nothing and never emits, so `SpinnerArena`'s
// `PvPLobbyModal(:is-open="pvpModalOpen" @close=…)` stays valid and the PvP
// wiring around it stays type-checked against the real component.

defineProps<{ isOpen?: boolean }>()
defineEmits<{
  (e: 'close'): void
  (e: 'start-pvp'): void
}>()
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
