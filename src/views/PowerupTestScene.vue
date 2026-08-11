<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import useSpinnerGame, { ARENA_RADIUS } from '@/use/useSpinnerGame'
import type { SpinnerConfig } from '@/types/spinner'

// ─── Powerup Test Scene ────────────────────────────────────────────────────
// Stripped-down arena that drops a powerup crate every 5 seconds so the
// grow → overgrow → settle → vanish animation, the 3d-box render, the
// pickup buff, and the disintegrate VFX can be visually verified without
// having to grind through campaign matches. Two slow-moving NPC blades
// keep bouncing through the playfield so they collect crates on contact;
// the player can also drag-launch their own blade to grab one manually.

const {
  phase,
  playerBlades,
  npcBlades,
  powerups,
  initGame,
  startPhysics,
  stopPhysics,
  render,
  beginDrag,
  updateDrag,
  releaseDrag,
  pixelToGame
} = useSpinnerGame()

const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
const canvasWidth: Ref<number> = ref(0)
const canvasHeight: Ref<number> = ref(0)

const updateCanvasSize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvasWidth.value = window.innerWidth
  canvasHeight.value = window.innerHeight
  canvas.width = canvasWidth.value
  canvas.height = canvasHeight.value
}

const setupScene = () => {
  const playerCfg: SpinnerConfig = { topPartId: 'star', bottomPartId: 'balanced' }
  const npcCfgA: SpinnerConfig = { topPartId: 'round', bottomPartId: 'tanky' }
  const npcCfgB: SpinnerConfig = { topPartId: 'triangle', bottomPartId: 'speedy' }

  // 5-second spawn cadence (vs production 10–15s) so testers see crates fast.
  initGame([playerCfg], [npcCfgA, npcCfgB], false, 'default', 0, true, [5000, 5000])

  // Drop both NPCs into a slow drift so they wander through powerups
  // without needing the turn machinery.
  for (const npc of npcBlades.value) {
    npc.vx = (Math.random() - 0.5) * 6
    npc.vy = (Math.random() - 0.5) * 6
    npc.ax = 0
    npc.ay = 0
    npc.accelFramesLeft = 0
    npc.lastHitTime = performance.now()
  }

  // Park the player blade at the bottom; the player can drag to launch it.
  const player = playerBlades.value[0]
  if (player) {
    player.x = 0
    player.y = ARENA_RADIUS * 0.55
    player.vx = 0
    player.vy = 0
  }

  // Skip the meteor intro / turn-decision dance — drop straight into a
  // permanent player_turn so the spawn timer ticks immediately.
  phase.value = 'player_turn'
  startPhysics()
}

const restart = () => {
  stopPhysics()
  setupScene()
}

// ─── Drag-to-launch passthrough ────────────────────────────────────────────

const onPointerDown = (e: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const { x, y } = pixelToGame(e.clientX - rect.left, e.clientY - rect.top, canvasWidth.value, canvasHeight.value)
  beginDrag(x, y)
}

const onPointerMove = (e: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const { x, y } = pixelToGame(e.clientX - rect.left, e.clientY - rect.top, canvasWidth.value, canvasHeight.value)
  updateDrag(x, y)
}

const onPointerUp = () => {
  releaseDrag()
}

let renderRafId: number | null = null

const renderLoop = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  render(ctx, canvasWidth.value, canvasHeight.value, false)
  renderRafId = requestAnimationFrame(renderLoop)
}

onMounted(() => {
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  setupScene()
  renderRafId = requestAnimationFrame(renderLoop)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  stopPhysics()
  if (renderRafId !== null) cancelAnimationFrame(renderRafId)
})
</script>

<template lang="pug">
  div.relative.w-screen.h-screen.overflow-hidden.flex.items-center.justify-center(class="bg-[#0d1117]")
    canvas(
      ref="canvasRef"
      class="block touch-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    )

    div.absolute.top-2.left-2.flex.flex-col.gap-2.pointer-events-auto
      div.text-white.font-bold.game-text(class="text-xs sm:text-sm bg-black/60 px-2 py-1 rounded")
        | Powerup Test — crate every 5s
      div.text-white.game-text(class="text-[0.75rem] sm:text-xs bg-black/60 px-2 py-1 rounded")
        | Active crates: {{ powerups.length }}
      button(
        @click="restart"
        class="self-start bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-3 py-1 rounded cursor-pointer game-text text-xs sm:text-sm"
      ) Restart
</template>
