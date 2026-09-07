<script setup lang="ts">
import type { LeaderboardEntry } from '@/use/useLeaderboard'

// ─── FakeLeaderBoard no-op stub (every build) ───────────────────────────────
//
// Aliased over `@/components/organisms/FakeLeaderBoard.vue` by `vite.config.ts`
// UNCONDITIONALLY, so the simulated-NPC board and its HUD button ship in no
// build package at all.
//
// WHY: the game now has a real global leaderboard (`useLiveLeaderboard` + the
// `leaderboard-chaos-arena` Worker), and two boards on one HUD is one board too
// many — the fake one would sit next to the real one showing invented players
// and a different rank for the same player.
//
// The real component is NOT deleted. It is still in the repo, still compiles,
// and restoring it is deleting one line from the alias map in `vite.config.ts`.
// The NPC-board state it reads (`useLeaderboard`) also stays, because that
// module owns `playerMaxStage` and the CrazyGames score ramp, which are both
// still live.
//
// A stub rather than removing the call site, so `onGhostFight` and the whole
// ghost-rematch path in `SpinnerArena` remain wired and type-checked instead of
// rotting as unreferenced code. The stub simply never emits `fight`, so ghost
// fights are unreachable while this is in place — that is the intended
// consequence of retiring the fake board, not an oversight.

defineEmits<{ (e: 'fight', entry: LeaderboardEntry): void }>()
</script>

<template lang="pug">
  //- Intentionally empty.
</template>
