<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import useSpinnerGame, { ARENA_RADIUS, countdownText, gameStartCount } from '@/use/useSpinnerGame'
import { useMusic } from '@/use/useSound'
import type { SpinnerConfig } from '@/types/spinner'

// ─── Trailer Scene ─────────────────────────────────────────────────────────
// 6 special-skin spinners (1 per top part), 2 player vs 4 NPC.
// Scene 1: "Cinematic" — all 6 launched outward, physics pauses before
//          any collision for a screenshot-ready freeze frame.
// Scene 2: "Battle"   — full gameplay loop with auto-controlled player.

type SceneMode = 'cinematic' | 'battle'

const {
  phase,
  allBlades,
  playerBlades,
  npcBlades,
  turnAnnouncement,
  initGame,
  startMatch,
  startPhysics,
  stopPhysics,
  beginDrag,
  updateDrag,
  releaseDrag,
  render,
  speed
} = useSpinnerGame()

const { initMusic, startBattleMusic, stopBattleMusic } = useMusic()

const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
const canvasWidth: Ref<number> = ref(0)
const canvasHeight: Ref<number> = ref(0)
const sceneMode: Ref<SceneMode> = ref('cinematic')
const isPaused = ref(false)
const statusText = ref('')

// ─── Team Config (1 special skin per top part) ─────────────────────────────

const PLAYER_TEAM: SpinnerConfig[] = [
  { topPartId: 'star', bottomPartId: 'speedy', topLevel: 20, bottomLevel: 20, modelId: 'tornado' },
  { topPartId: 'piercer', bottomPartId: 'speedy', topLevel: 20, bottomLevel: 20, modelId: 'teleporter' },
  { topPartId: 'cushioned', bottomPartId: 'speedy', topLevel: 20, bottomLevel: 20, modelId: 'diamond' }
]

const NPC_TEAM: SpinnerConfig[] = [
  { topPartId: 'triangle', bottomPartId: 'speedy', topLevel: 20, bottomLevel: 20, modelId: 'thunderstorm' },
  { topPartId: 'round', bottomPartId: 'tanky', topLevel: 20, bottomLevel: 20, modelId: 'dark' },
  { topPartId: 'quadratic', bottomPartId: 'balanced', topLevel: 20, bottomLevel: 20, modelId: 'rainbow' },
  { topPartId: 'cushioned', bottomPartId: 'tanky', topLevel: 20, bottomLevel: 20, modelId: 'sandstorm' }
]

// ─── Canvas ────────────────────────────────────────────────────────────────

const updateCanvasSize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvasWidth.value = window.innerWidth
  canvasHeight.value = window.innerHeight
  canvas.width = canvasWidth.value
  canvas.height = canvasHeight.value
}

// ─── Scene 1: Cinematic Freeze ─────────────────────────────────────────────

let collisionCheckRaf: number | null = null

const setupCinematic = () => {
  isPaused.value = false
  statusText.value = 'Cinematic — blades launching…'

  initGame(PLAYER_TEAM, NPC_TEAM, false, 'boss', 0, false)

  // Position blades in a radial pattern around center
  const all = [...playerBlades.value, ...npcBlades.value]
  const count = all.length
  for (let i = 0; i < count; i++) {
    const blade = all[i]!
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    const startR = ARENA_RADIUS * 0.15
    blade.x = Math.cos(angle) * startR
    blade.y = Math.sin(angle) * startR

    // Launch outward from center
    const launchSpeed = 6 + (i % 3) * 1.5
    blade.vx = Math.cos(angle) * launchSpeed
    blade.vy = Math.sin(angle) * launchSpeed
    blade.ax = 0
    blade.ay = 0
    blade.accelFramesLeft = 0
    blade.wallBounceCount = 0
  }

  phase.value = 'player_launched'
  startPhysics()

  // Monitor for imminent collision: pause when any two blades from
  // opposing teams get within 2× radius (trails + auras are visible)
  const checkProximity = () => {
    if (isPaused.value) return
    const players = playerBlades.value.filter(b => b.hp > 0)
    const npcs = npcBlades.value.filter(b => b.hp > 0)

    for (const p of players) {
      for (const n of npcs) {
        const dx = p.x - n.x
        const dy = p.y - n.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < (p.radius + n.radius) * 2.5) {
          // Freeze! All blades have trails & auras visible
          freezeScene()
          return
        }
      }
    }

    // Also freeze after ~2.5s if nothing collided yet (wall bounces look cool)
    if (performance.now() - cinematicStartTime > 2500) {
      freezeScene()
      return
    }

    collisionCheckRaf = requestAnimationFrame(checkProximity)
  }

  cinematicStartTime = performance.now()
  collisionCheckRaf = requestAnimationFrame(checkProximity)
}

let cinematicStartTime = 0

const freezeScene = () => {
  stopPhysics()
  isPaused.value = true
  statusText.value = 'PAUSED — Screenshot ready! Press [Space] or click Resume.'
  if (collisionCheckRaf !== null) {
    cancelAnimationFrame(collisionCheckRaf)
    collisionCheckRaf = null
  }
}

const resumeCinematic = () => {
  if (!isPaused.value) return
  isPaused.value = false
  statusText.value = 'Cinematic — resumed'
  startPhysics()

  // Re-freeze after 1.5s for next screenshot opportunity
  setTimeout(() => {
    if (sceneMode.value === 'cinematic' && !isPaused.value) {
      freezeScene()
    }
  }, 1500)
}

// ─── Scene 2: Auto-Battle ──────────────────────────────────────────────────

let autoBattleTimer: ReturnType<typeof setTimeout> | null = null
let battlePhaseUnwatch: (() => void) | null = null

const setupBattle = () => {
  isPaused.value = false
  statusText.value = 'Battle — starting…'

  initGame(PLAYER_TEAM, NPC_TEAM, false, 'boss', 2, false)

  // Arm counter so the 3-2-1-GO countdown always fires (triggers every 3rd game)
  gameStartCount.value = 2

  // Start battle music then kick off the proper game flow:
  // tap_to_start → meteor_intro (with 3-2-1-GO) → deciding_turn → turns
  startBattleMusic()
  startMatch()

  // Watch phase to auto-control the player side
  scheduleAutoLaunch()
}

const scheduleAutoLaunch = () => {
  if (autoBattleTimer !== null) clearTimeout(autoBattleTimer)
  autoBattleTimer = null
  if (battlePhaseUnwatch) {
    battlePhaseUnwatch()
    battlePhaseUnwatch = null
  }

  const unwatch = watch(phase, (p) => {
    if (p === 'player_turn') {
      statusText.value = 'Battle — player turn'
      // Auto-launch after a short delay for dramatic effect
      autoBattleTimer = setTimeout(() => autoLaunchPlayer(), 400 + Math.random() * 300)
    } else if (p === 'npc_turn') {
      statusText.value = 'Battle — NPC turn'
    } else if (p === 'player_launched' || p === 'npc_launched') {
      statusText.value = 'Battle — collision!'
    } else if (p === 'game_over') {
      unwatch()
      battlePhaseUnwatch = null
      statusText.value = 'Battle over! Restarting in 3s…'
      autoBattleTimer = setTimeout(() => {
        if (sceneMode.value === 'battle') setupBattle()
      }, 3000)
    }
  }, { immediate: true })

  battlePhaseUnwatch = unwatch
}

const autoLaunchPlayer = () => {
  if (phase.value !== 'player_turn') return
  const alive = playerBlades.value.filter(b => b.hp > 0)
  if (alive.length === 0) return

  // Pick the blade with most HP
  const blade = alive.reduce((a, b) => a.hp >= b.hp ? a : b)

  // Find best NPC target (lowest HP)
  const targets = npcBlades.value.filter(b => b.hp > 0)
  if (targets.length === 0) return
  const target = targets.reduce((a, b) => a.hp <= b.hp ? a : b)

  // Aim at target with some randomness for variety
  const dx = target.x - blade.x
  const dy = target.y - blade.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const nx = dx / (dist || 1)
  const ny = dy / (dist || 1)

  // Add slight angle randomness so battles look organic
  const angleJitter = (Math.random() - 0.5) * 0.3
  const cosJ = Math.cos(angleJitter)
  const sinJ = Math.sin(angleJitter)
  const jnx = nx * cosJ - ny * sinJ
  const jny = nx * sinJ + ny * cosJ

  // Pull in opposite direction (slingshot mechanic)
  const pullDist = ARENA_RADIUS * (0.3 + Math.random() * 0.15)
  const pullX = blade.x - jnx * pullDist
  const pullY = blade.y - jny * pullDist

  // Simulate drag sequence: begin at blade position, pull back, release
  beginDrag(blade.x, blade.y)
  updateDrag(pullX, pullY)

  setTimeout(() => {
    releaseDrag()
  }, 150 + Math.random() * 150)
}

// ─── Scene Switching ───────────────────────────────────────────────────────

const switchScene = (mode: SceneMode) => {
  cleanup()
  sceneMode.value = mode
  if (mode === 'cinematic') setupCinematic()
  else setupBattle()
}

const cleanup = () => {
  stopPhysics()
  stopBattleMusic()
  isPaused.value = false
  if (collisionCheckRaf !== null) {
    cancelAnimationFrame(collisionCheckRaf)
    collisionCheckRaf = null
  }
  if (autoBattleTimer !== null) {
    clearTimeout(autoBattleTimer)
    autoBattleTimer = null
  }
  if (battlePhaseUnwatch) {
    battlePhaseUnwatch()
    battlePhaseUnwatch = null
  }
}

// ─── Keyboard Controls ─────────────────────────────────────────────────────

const onKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault()
    if (isPaused.value) resumeCinematic()
    else if (sceneMode.value === 'cinematic') freezeScene()
  }
  if (e.key === '1') switchScene('cinematic')
  if (e.key === '2') switchScene('battle')
  if (e.key === 'r' || e.key === 'R') {
    switchScene(sceneMode.value)
  }
}

// ─── Render Loop ───────────────────────────────────────────────────────────

let renderRafId: number | null = null

const renderLoop = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  render(ctx, canvasWidth.value, canvasHeight.value, false)
  renderRafId = requestAnimationFrame(renderLoop)
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

initMusic()

onMounted(() => {
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('keydown', onKeyDown)
  setupCinematic()
  renderRafId = requestAnimationFrame(renderLoop)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('keydown', onKeyDown)
  cleanup()
  if (renderRafId !== null) cancelAnimationFrame(renderRafId)
})
</script>

<template lang="pug">
  div.relative.w-screen.h-screen.overflow-hidden.flex.items-center.justify-center(class="bg-[#0d1117]")
    canvas(ref="canvasRef" class="block touch-none")

    //- HUD overlay
    div.absolute.top-2.left-2.flex.flex-col.gap-2.pointer-events-auto(class="z-10")
      div.text-white.font-bold.game-text.rounded(class="text-xs sm:text-sm bg-black/70 px-3 py-1.5")
        | {{ statusText }}

      div.flex.gap-2
        button(
          @click="switchScene('cinematic')"
          class="px-3 py-1 rounded font-bold cursor-pointer game-text text-xs sm:text-sm"
          :class="sceneMode === 'cinematic' ? 'bg-yellow-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'"
        ) 1: Cinematic
        button(
          @click="switchScene('battle')"
          class="px-3 py-1 rounded font-bold cursor-pointer game-text text-xs sm:text-sm"
          :class="sceneMode === 'battle' ? 'bg-yellow-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'"
        ) 2: Battle

      div.flex.gap-2
        button(
          v-if="sceneMode === 'cinematic'"
          @click="isPaused ? resumeCinematic() : freezeScene()"
          class="px-3 py-1 rounded font-bold cursor-pointer game-text text-xs sm:text-sm bg-blue-600 hover:bg-blue-500 text-white"
        ) {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
        button(
          @click="switchScene(sceneMode)"
          class="px-3 py-1 rounded font-bold cursor-pointer game-text text-xs sm:text-sm bg-slate-700 hover:bg-slate-600 text-slate-300"
        ) ↻ Restart

    //- Countdown & turn announcement (centered overlay)
    div.absolute.inset-0.flex.items-center.justify-center.pointer-events-none(class="z-20")
      //- 3, 2, 1, GO countdown during meteor intro
      div(v-if="phase === 'meteor_intro' && countdownText" class="text-center")
        div.countdown-number.font-black.game-text.text-white(
          :key="countdownText"
          class="text-7xl sm:text-9xl"
        ) {{ countdownText }}

      //- Turn announcement
      div(v-else-if="phase === 'deciding_turn' && turnAnnouncement" class="text-center")
        div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(
          class="text-2xl sm:text-4xl"
        ) {{ turnAnnouncement }}

    //- Keyboard hints (bottom)
    div.absolute.bottom-3.left-1.right-1.text-center.pointer-events-none(class="z-10")
      div.text-slate-500.game-text(class="text-[0.75rem] sm:text-xs")
        | [1] Cinematic &nbsp; [2] Battle &nbsp; [Space] Pause/Resume &nbsp; [R] Restart
</template>

<style scoped>
.countdown-number {
  display: inline-block;
  text-shadow: 0 0 24px rgba(255, 200, 0, 0.85), 0 0 6px rgba(255, 255, 255, 0.6), 0 4px 0 #000;
  animation: countdown-pop 375ms ease-out forwards;
  will-change: transform, opacity;
}

@keyframes countdown-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  20% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}
</style>
