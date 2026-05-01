import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type {
  SpinnerState,
  SpinnerConfig,
  SpinnerStats,
  GamePhase,
  GameResult,
  MeteorParticle,
  SpritesheetAnimation,
  Powerup,
  PowerupStat
} from '@/types/spinner'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import { computeStats } from '@/use/useSpinnerConfig'
import { spinnerModelImgPath } from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import { isDebug } from '@/use/useMatch.ts'
import { isMobileLandscape, isMobilePortrait, userDifficulty } from '@/use/useUser.ts'
import { DIFFICULTY } from '@/utils/enums'
import { useScreenshake } from '@/use/useScreenshake'
import useSounds from '@/use/useSound'
import { prependBaseUrl } from '@/utils/function.ts'
import { getCachedImage, resourceCache } from '@/use/useAssets'
import { drawLightningBolt } from '@/utils/lightning'
import { matchRng, seedMatchRngRandom } from '@/use/useDeterministicRng'
import { saveDataVersion } from '@/use/useSaveStatus'

const { triggerShake } = useScreenshake()
const { playSound } = useSounds()

const isFirefox = /firefox/i.test(navigator.userAgent)

// ─── Physics Constants ───────────────────────────────────────────────────────

export const ARENA_RADIUS = 200
const isDesktop = window.innerWidth > 600 && window.innerHeight > 600 && !isMobilePortrait.value && !isMobileLandscape.value
const DEFAULT_BLADE_RADIUS = isDesktop ? 26 : 28
// PvP uses a fixed radius so both clients agree regardless of viewport size.
const PVP_BLADE_RADIUS = 27
export let BLADE_RADIUS = DEFAULT_BLADE_RADIUS
const BASE_MAX_FORCE = 14
const STOP_THRESHOLD = 0.25
// Global multiplier on every speed-based damage roll. Production value
// was bumped from 1.0 → 1.4 when the damage formula switched from gross
// `aSpeed` to *closing* normal-velocity (Option A) and started gating
// damage to one roll per contact entry (Option C). Clean head-on slams
// read very close to the old numbers; sliding/chase "grind" that used
// to rack up damage now deals near-zero, which is the intended fix.
const DAMAGE_SCALE = isDebug.value ? 1.4 : 1.4
const HIT_FLASH_FRAMES = 50
const NPC_THINK_MS = 500
const BOUNCE_DAMPENING = 0.75
// Wall bounces BOOST speed instead of dampening — ricochet strategy
const WALL_BOOST_FACTOR = 1.08
// Bounce decay: reduce wall boost by 12% per bounce after the first, min 30% effectiveness
const WALL_BOUNCE_DECAY_PER_HIT = 0.12
const WALL_BOUNCE_MIN_EFFECTIVENESS = 0.30
// Extra padding around the arena so drags near the edge have room
const ARENA_PADDING = 5
// Pinball-style bouncer obstacles placed on the arena floor on certain stages.
// They behave like the arena wall — blades ricochet off them with the same
// speed-based boost — but each hit is independent of the wall-bounce decay.
const BOUNCER_RADIUS = 6
// Band of the arena the bouncer centers can spawn in. Kept away from the
// very center (where NPCs spawn) and the spawn-row at the bottom.
const BOUNCER_MIN_R = ARENA_RADIUS * 0.25
const BOUNCER_MAX_R = ARENA_RADIUS * 0.70
// Blade needs time to reach full speed after launch
const ACCEL_FRAMES = 28
// Pull distance — tuned for mobile screens where screen real estate is
// limited. Previously 0.85 of the arena radius (wild mega-pulls), now ~40%
// shorter so a full-force shot fits within thumb reach on a phone.
const MAX_PULL_RATIO = 0.51

export const MAX_PULL_DISTANCE = ARENA_RADIUS * MAX_PULL_RATIO

// ─── Arena Powerups ─────────────────────────────────────────────────────────
// Stat-boost crates that pop out of the arena floor mid-match. Spawning is
// driven by the physics loop (so the timer counts "simulated arena time" —
// it freezes whenever the loop is paused). The first blade to touch a fully
// grown crate gets the buff applied for the rest of the match and the crate
// disintegrates with a small VFX. See `updatePowerups` for the lifecycle and
// `renderPowerups` for the 3d-box visual.
const POWERUP_DEFAULT_INTERVAL_MIN_MS = 10000
const POWERUP_DEFAULT_INTERVAL_MAX_MS = 15000
// How long an un-collected powerup stays on the floor before it begins to
// disintegrate. Long enough that the player has time to redirect a launch
// toward it but short enough that stale crates don't pile up.
const POWERUP_LIFETIME_MS = 10000
const POWERUP_GROW_MS = 350
const POWERUP_OVERGROW_MS = 250
const POWERUP_SETTLE_MS = 200
const POWERUP_VANISH_MS = 280
const POWERUP_FINAL_SCALE = 0.85
const POWERUP_OVERGROW_SCALE = 1.15
// Collision radius at full visual size, expressed as a fraction of the blade
// radius so it scales with the screen-size override at module init.
const POWERUP_RADIUS_FRACTION = 0.42
// Per-pickup buff multiplier applied to the touched stat.
const POWERUP_BUFF_MULTIPLIER = 1.25
// Possible stat targets — kept here so the spawner can roll one at random.
const POWERUP_STATS: readonly PowerupStat[] = ['attack', 'defense', 'speed']

// Spark VFX
const SPARK_FRAME_DURATION = 40 // ms per frame
const SPARK_TOTAL_FRAMES = 5
const SPARK_COOLDOWN_MS = 200
const CLASH_SOUND_COOLDOWN_MS = 300
const SPARK_SCALE = 0.28 // scale in game-space units relative to frameWidth

// ─── Spritesheet Helpers ────────────────────────────────────────────────────

// Thin alias over the module-level image cache. Every useSpinnerGame()
// instantiation used to `new Image()` these every time, which triggered a
// fresh fetch + decode per match. Routing through `getCachedImage`
// means the browser decodes each VFX spritesheet exactly once for the
// lifetime of the tab and every subsequent match reuses the same
// HTMLImageElement — zero stutter even when many VFX fire at once.
const preloadImage = getCachedImage

function createSpritesheetAnim(
  image: HTMLImageElement,
  x: number, y: number,
  totalFrames: number,
  frameDuration: number,
  frameWidth: number,
  frameHeight: number,
  scale: number,
  vertical: boolean
): SpritesheetAnimation {
  return { x, y, frame: 0, timer: 0, frameDuration, totalFrames, frameWidth, frameHeight, scale, vertical, image }
}

function updateSpritesheetAnim(anim: SpritesheetAnimation, dt: number): boolean {
  anim.timer += dt
  if (anim.timer >= anim.frameDuration) {
    anim.timer -= anim.frameDuration
    anim.frame++
  }
  return anim.frame >= anim.totalFrames
}

function renderSpritesheetAnim(ctx: CanvasRenderingContext2D, anim: SpritesheetAnimation) {
  if (anim.frame >= anim.totalFrames || !anim.image.complete || anim.image.naturalWidth === 0) return
  const { frameWidth, frameHeight, vertical, frame, scale, x, y, image } = anim
  const sx = vertical ? 0 : frame * frameWidth
  const sy = vertical ? frame * frameHeight : 0
  const drawW = frameWidth * scale
  const drawH = frameHeight * scale
  ctx.drawImage(image, sx, sy, frameWidth, frameHeight, x - drawW / 2, y - drawH / 2, drawW, drawH)
}

// ─── Shared Arena State (singleton so cheats can access it) ─────────────────

const arenaType: Ref<ArenaType> = ref('default')
export { arenaType }

// ─── Simulation Speed (visual travel speed only) ────────────────────────────

// Module-level so the speed setting persists across composable instances and
// can be controlled from anywhere in the UI. At 2x we substep ALL physics
// (accel ramp, position, velocity decay, wall/bouncer/blade collision) — so
// blades launch, travel, AND brake twice as fast in real time. What stays
// 1x: VFX timers (hit flash, sparks, damage-number floats), powerup spawn
// cadence, and the `contactArmed` real-time damage gate — both substeps see
// the same `gameTime()` value so a colliding pair still gets exactly one
// damage roll per tick. Net effect: matches finish in roughly half the
// wall-clock time without inflating per-swing damage.
export const simSpeed: Ref<1 | 2> = ref(1)

// ─── Game-Start Countdown ────────────────────────────────────────────────────

// Counts how many matches the player has started. Every Nth start triggers a
// "3, 2, 1, GO" countdown rendered inside the meteor shower ring.
const GAME_START_COUNT_KEY = 'spinner_game_start_count'
const COUNTDOWN_EVERY_N_GAMES = 3
const COUNTDOWN_STEP_MS = 375
const COUNTDOWN_SEQUENCE = ['3', '2', '1', 'GO'] as const

export const gameStartCount: Ref<number> = ref(
  parseInt(localStorage.getItem(GAME_START_COUNT_KEY) || '0', 10)
)
export const countdownText: Ref<string | null> = ref(null)

// Re-read on hydrate-success bump. The counter is persisted via
// `setRemoteOnly` (bypasses localStorage) so the initial module-load
// `getItem` returns null in cloud-only mode; this watcher catches the
// value when the strategy hydrates the blob.
watch(saveDataVersion, () => {
  gameStartCount.value = parseInt(localStorage.getItem(GAME_START_COUNT_KEY) || '0', 10)
})

const countdownTimers: number[] = []
const clearCountdown = () => {
  while (countdownTimers.length) {
    const id = countdownTimers.pop()
    if (id !== undefined) clearTimeout(id)
  }
  countdownText.value = null
}

const triggerCountdown = () => {
  clearCountdown()
  COUNTDOWN_SEQUENCE.forEach((text, i) => {
    countdownTimers.push(window.setTimeout(() => {
      countdownText.value = text
    }, i * COUNTDOWN_STEP_MS))
  })
  countdownTimers.push(window.setTimeout(() => {
    countdownText.value = null
  }, COUNTDOWN_SEQUENCE.length * COUNTDOWN_STEP_MS))
}

/** Persist the game-start counter via the SaveManager's outbound-only
 *  channel so it never appears in localStorage (CG QA flagged this key).
 *  Falls back to localStorage during the brief boot window before
 *  main.ts publishes the SaveManager singleton. */
const persistGameStartCount = (n: number) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sm: any = (typeof window !== 'undefined' ? (window as any).__saveManager : null)
  if (sm?.setRemoteOnly) sm.setRemoteOnly(GAME_START_COUNT_KEY, String(n))
  else localStorage.setItem(GAME_START_COUNT_KEY, String(n))
}

/** Cheat helper: arm the next match start to fire the countdown. We set the
 *  counter so the next `startMatch()` increment lands on a multiple of
 *  COUNTDOWN_EVERY_N_GAMES and triggers the countdown immediately. */
export const resetGameStartCount = () => {
  const armed = COUNTDOWN_EVERY_N_GAMES - 1
  gameStartCount.value = armed
  persistGameStartCount(armed)
}

// ─── Persistent Cross-Match State ────────────────────────────────────────────

// Tracks the result of the last finished match so we can bias the next match's
// turn order toward whichever side gives the player a better experience.
const LAST_RESULT_KEY = 'spinner_last_result'
const loadLastResult = (): GameResult => {
  const raw = localStorage.getItem(LAST_RESULT_KEY)
  return raw === 'win' || raw === 'lose' ? raw : null
}
const lastGameResult: Ref<GameResult> = ref(loadLastResult())
const saveLastGameResult = (result: GameResult) => {
  lastGameResult.value = result
  if (result) localStorage.setItem(LAST_RESULT_KEY, result)
  else localStorage.removeItem(LAST_RESULT_KEY)
}

// ─── Skin auras ──────────────────────────────────────────────────────────
//
// Each renderer draws a specific skin's aura at the origin as a pure
// function of `(R, now)`. Extracted from the inline `renderAura` switch
// for readability; dispatch happens in `renderAura` further down.
//
// An earlier iteration baked these into an offscreen spritesheet and
// replayed with `drawImage`. That cut primitive count but was a net
// slowdown on Brave/Chromium: replacing 20 adjacent stroke/fill ops
// with a single `drawImage` broke the batch kind and the backing
// texture kept pathing through CPU memory. Kept the extracted
// functions — they're the same work, just nicer to read.

type AuraCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const renderTornadoAura = (ctx: AuraCtx, R: number, now: number): void => {
  // 1. Outer radial glow — swirling color gradient
  const glowAngle = now * 0.002
  ctx.save()
  ctx.globalAlpha = 0.12 + 0.04 * Math.sin(now * 0.003)
  const grd = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 2.2)
  grd.addColorStop(0, 'rgba(180,220,255,0.5)')
  grd.addColorStop(0.5, 'rgba(120,180,240,0.2)')
  grd.addColorStop(1, 'rgba(80,140,220,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. Spiral wind trails — 3 interleaved arms rotating at different speeds
  for (let arm = 0; arm < 3; arm++) {
    const armPhase = glowAngle * (1.8 + arm * 0.3) + arm * (Math.PI * 2 / 3)
    ctx.save()
    ctx.globalAlpha = 0.18 - arm * 0.03
    ctx.strokeStyle = arm === 0 ? '#cceeff' : arm === 1 ? '#99ccee' : '#77aadd'
    ctx.lineWidth = 2 - arm * 0.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    const steps = 28
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const angle = armPhase + t * Math.PI * 2.5
      const dist = R * (0.4 + t * 1.4)
      const px = Math.cos(angle) * dist
      const py = Math.sin(angle) * dist * 0.45  // flatten to elliptical
      if (s === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.restore()
  }

  // 3. Concentric vortex rings — tilted ellipses narrowing toward center
  const rings = 6
  for (let r = 0; r < rings; r++) {
    const phase = now * 0.005 + r * Math.PI * 0.33
    const layerT = r / (rings - 1)
    const ringR = R * (0.6 + layerT * 1.3)
    const flatten = 0.2 + layerT * 0.15
    const wobX = Math.sin(phase * 1.3) * 2
    const wobY = Math.cos(phase * 0.7) * 1.5
    ctx.save()
    ctx.globalAlpha = 0.13 - layerT * 0.04
    ctx.strokeStyle = `hsl(${200 + layerT * 20}, 70%, ${75 + layerT * 10}%)`
    ctx.lineWidth = 1.8 - layerT * 0.5
    ctx.beginPath()
    ctx.ellipse(wobX, wobY, ringR, ringR * flatten, phase * 0.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // 4. Debris particles — small dots orbiting at various speeds/radii
  const debrisCount = 10
  for (let d = 0; d < debrisCount; d++) {
    const seed = d * 137.508 // golden angle
    const orbitSpeed = 0.003 + (d % 3) * 0.0015
    const orbitR = R * (0.7 + (d % 5) * 0.3)
    const angle = now * orbitSpeed + seed
    const px = Math.cos(angle) * orbitR
    const py = Math.sin(angle) * orbitR * (0.3 + (d % 4) * 0.1)
    const size = 1 + (d % 3) * 0.7
    ctx.save()
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(now * 0.01 + d)
    ctx.fillStyle = d % 2 === 0 ? '#ddeeff' : '#aaccee'
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

const renderSandstormAura = (ctx: AuraCtx, R: number, now: number): void => {
  // 1. Warm radial haze — dusty golden glow
  const hazeAngle = now * 0.0015
  ctx.save()
  ctx.globalAlpha = 0.10 + 0.04 * Math.sin(now * 0.004)
  const haze = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 2.0)
  haze.addColorStop(0, 'rgba(220,180,100,0.45)')
  haze.addColorStop(0.5, 'rgba(190,150,80,0.18)')
  haze.addColorStop(1, 'rgba(160,120,60,0)')
  ctx.fillStyle = haze
  ctx.beginPath()
  ctx.arc(0, 0, R * 2.0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. Spiral sand streams — 4 arms rotating with slight wobble
  for (let arm = 0; arm < 4; arm++) {
    const armPhase = hazeAngle * (1.5 + arm * 0.25) + arm * (Math.PI / 2)
    ctx.save()
    ctx.globalAlpha = 0.14 - arm * 0.02
    ctx.strokeStyle = arm % 2 === 0 ? '#d4a855' : '#c49040'
    ctx.lineWidth = 1.8 - arm * 0.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    const steps = 24
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const angle = armPhase + t * Math.PI * 2.2
      const dist = R * (0.35 + t * 1.3)
      const wobble = Math.sin(now * 0.005 + arm + t * 4) * 2
      const px = Math.cos(angle) * dist + wobble
      const py = Math.sin(angle) * dist * 0.5 + wobble * 0.5
      if (s === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.restore()
  }

  // 3. Orbiting sand grains — 16 small particles at varying speeds/radii
  const grainCount = 16
  for (let g = 0; g < grainCount; g++) {
    const seed = g * 137.508
    const orbitSpeed = 0.0025 + (g % 4) * 0.0012
    const orbitR = R * (0.5 + (g % 6) * 0.25)
    const angle = now * orbitSpeed + seed
    const flatten = 0.35 + (g % 3) * 0.12
    const px = Math.cos(angle) * orbitR
    const py = Math.sin(angle) * orbitR * flatten
    const size = 0.8 + (g % 3) * 0.6
    ctx.save()
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now * 0.008 + g * 0.7)
    ctx.fillStyle = g % 3 === 0 ? '#e8c870' : g % 3 === 1 ? '#d4a855' : '#bf8f3a'
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 4. Dust puffs — 5 larger translucent circles drifting outward
  for (let p = 0; p < 5; p++) {
    const phase = now * 0.002 + p * 1.2566 // golden ratio spacing
    const drift = R * (0.8 + 0.6 * Math.sin(phase * 0.7 + p))
    const px = Math.cos(phase) * drift
    const py = Math.sin(phase) * drift * 0.4
    const puffSize = R * (0.15 + 0.08 * Math.sin(now * 0.003 + p))
    ctx.save()
    ctx.globalAlpha = 0.06 + 0.03 * Math.sin(now * 0.005 + p * 2)
    ctx.fillStyle = '#d4a855'
    ctx.beginPath()
    ctx.arc(px, py, puffSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export const useSpinnerGame = () => {
  // ── Game Phase ───────────────────────────────────────────────────────────
  const phase: Ref<GamePhase> = ref('idle')
  const gameResult: Ref<GameResult> = ref(null)
  const turnAnnouncement: Ref<string> = ref('')
  const isBossStage: Ref<boolean> = ref(false)

  // ── Blade Arrays (2 per side) ────────────────────────────────────────────
  const playerBlades: Ref<SpinnerState[]> = ref([])
  const npcBlades: Ref<SpinnerState[]> = ref([])

  // All models in one flat array for physics iteration
  const allBlades = computed<SpinnerState[]>(() =>
    [...playerBlades.value, ...npcBlades.value]
  )

  // ── Selected Blade (player picks which to launch) ────────────────────────
  const selectedBladeId: Ref<number | null> = ref(null)
  // The blade the NPC chose this turn
  const npcActiveBladeId: Ref<number | null> = ref(null)
  // ID of the blade currently in motion (tracks whose turn just ended)
  const launchedBladeId: Ref<number | null> = ref(null)

  const selectedBlade = computed<SpinnerState | null>(() =>
    playerBlades.value.find(b => b.id === selectedBladeId.value && b.hp > 0) ?? null
  )

  // ── PvP Mode ──────────────────────────────────────────────────────────────
  const pvpMode: Ref<boolean> = ref(false)
  // Ghost-fight mode (leaderboard rematch). Owned here so difficulty
  // logic and other game-side flags can branch on campaign vs ghost.
  const ghostMode: Ref<boolean> = ref(false)

  // ── Difficulty HP Multiplier ──────────────────────────────────────────────
  // Mirrors createBladeState so both the spawn-time and live-adjustment
  // paths stay in sync.
  const getDifficultyHpMult = (): number => {
    if (userDifficulty.value === DIFFICULTY.HARD) return 1.3
    if (userDifficulty.value === DIFFICULTY.EASY) return 0.9
    return 1
  }
  // Tracks the multiplier currently baked into every live NPC blade. When
  // the player changes difficulty mid-game we rescale existing blades
  // instead of waiting for the next spawn.
  let appliedDifficultyHpMult = getDifficultyHpMult()
  watch(userDifficulty, () => {
    if (pvpMode.value || ghostMode.value) {
      appliedDifficultyHpMult = 1
      return
    }
    const next = getDifficultyHpMult()
    const ratio = next / appliedDifficultyHpMult
    if (ratio === 1) return
    for (const blade of npcBlades.value) {
      blade.maxHp *= ratio
      blade.hp *= ratio
    }
    appliedDifficultyHpMult = next
  })
  // Callback fired when the local player launches a blade — SpinnerArena
  // wires this to send the launch over PeerJS.
  // bladeIndex is the index within playerBlades (not the blade.id).
  let onLocalLaunch: ((bladeIndex: number, ax: number, ay: number) => void) | null = null
  // Buffer for a remote launch that arrived before the local client entered
  // npc_turn (race condition over the network). Replayed as soon as
  // npc_turn is reached.
  let pendingRemoteLaunch: { bladeIndex: number; ax: number; ay: number } | null = null

  // PvP state-check: turn counter and callback for sending state hashes
  let pvpTurnCounter = 0
  let onStateHash: ((hash: string, turn: number) => void) | null = null

  // ── Deterministic PvP Clock ────────────────────────────────────────────
  // In PvP mode every timing-dependent calculation must use the same clock
  // on both clients. `pvpTickCount` increments exactly once per fixed-step
  // physics tick (60 Hz). `gameTime()` returns a virtual wall-clock that
  // is fully deterministic in PvP, and falls back to `performance.now()`
  // in single-player so existing behaviour is unchanged.
  let pvpTickCount = 0
  const gameTime = (): number =>
    pvpMode.value ? pvpTickCount * FIXED_STEP_MS : performance.now()

  /** Compute a lightweight hash of all gameplay-relevant blade state.
   *  Both clients see the arena mirrored (player↔npc swapped, coordinates
   *  negated). We normalize by using absolute positions and sorting, so
   *  both sides produce the same hash for the same physical state. */
  const computeStateHash = (): string => {
    const entries: string[] = []
    for (const b of [...playerBlades.value, ...npcBlades.value]) {
      // Use absolute coords so mirrored views match
      const ax = Math.abs(b.x)
      const ay = Math.abs(b.y)
      entries.push(
        `${ax.toFixed(2)},${ay.toFixed(2)},${b.hp.toFixed(2)}`
      )
    }
    entries.sort()
    const str = entries.join('|')
    let h = 5381
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(36)
  }

  // ── Drag State ───────────────────────────────────────────────────────────
  const isDragging: Ref<boolean> = ref(false)
  const dragStart: Ref<{ x: number; y: number }> = ref({ x: 0, y: 0 })
  const dragCurrent: Ref<{ x: number; y: number }> = ref({ x: 0, y: 0 })
  // Last valid drag direction (normalized) — used when pointer leaves viewport
  let lastDragNx = 0
  let lastDragNy = 0

  // ── Wall-Proximity Boost ─────────────────────────────────────────────────
  // When a blade sits near the arena wall, the player has less screen space
  // to drag. We shorten the pull distance required for full force so a
  // shorter physical swipe still reaches 100%.
  const WALL_BOOST_START = 0.55  // start boosting when blade is >55% from center
  const WALL_BOOST_MAX = 2.0   // at the very edge, pull distance halved (×2 multiplier)
  /** Returns a >=1 multiplier on effective drag magnitude for the selected blade. */
  const wallProximityMultiplier = (): number => {
    const blade = selectedBlade.value
    if (!blade) return 1
    const dist = Math.sqrt(blade.x * blade.x + blade.y * blade.y)
    const t = (dist / ARENA_RADIUS - WALL_BOOST_START) / (1 - WALL_BOOST_START)
    if (t <= 0) return 1
    return 1 + (WALL_BOOST_MAX - 1) * Math.min(t, 1)
  }

  const dragVector = computed(() => ({
    dx: dragCurrent.value.x - dragStart.value.x,
    dy: dragCurrent.value.y - dragStart.value.y
  }))

  const dragMagnitude = computed(() => {
    const { dx, dy } = dragVector.value
    return Math.sqrt(dx * dx + dy * dy)
  })

  const dragForceRatio = computed(() =>
    Math.min(dragMagnitude.value * wallProximityMultiplier() / MAX_PULL_DISTANCE, 1)
  )

  // ── Virtual Joystick ─────────────────────────────────────────────────────
  // Shown as a helper when the selected blade is near any arena edge so the
  // player can aim + launch without fighting the screen boundary.
  const JOYSTICK_EDGE_THRESHOLD = 0.55 // blade dist from center / ARENA_RADIUS
  const JOYSTICK_RADIUS = 32           // base circle radius in game-space
  const JOYSTICK_KNOB_RADIUS = 10
  const JOYSTICK_CANCEL_RADIUS = 8     // smaller cancel zone than blade drag
  const JOYSTICK_MAX_PULL = 28         // max knob displacement = full force

  const isJoystickVisible = computed(() => {
    if (phase.value !== 'player_turn') return false
    const blade = selectedBlade.value
    if (!blade) return false
    const dist = Math.sqrt(blade.x * blade.x + blade.y * blade.y)
    return dist / ARENA_RADIUS >= JOYSTICK_EDGE_THRESHOLD
  })

  // Joystick center position (game-space) — placed below-left of the arena
  // so it never overlaps the playing field. Recomputed per-frame in render
  // but we store a stable ref so drag logic can use it.
  const joystickCenter: Ref<{ x: number; y: number }> = ref({ x: 0, y: 0 })

  const isJoystickDragging: Ref<boolean> = ref(false)
  const joystickKnob: Ref<{ x: number; y: number }> = ref({ x: 0, y: 0 })

  const joystickVector = computed(() => {
    const dx = joystickKnob.value.x - joystickCenter.value.x
    const dy = joystickKnob.value.y - joystickCenter.value.y
    return { dx, dy }
  })
  const joystickMagnitude = computed(() => {
    const { dx, dy } = joystickVector.value
    return Math.sqrt(dx * dx + dy * dy)
  })
  const joystickForceRatio = computed(() =>
    Math.min(joystickMagnitude.value / JOYSTICK_MAX_PULL, 1)
  )

  // ── NPC Timer ────────────────────────────────────────────────────────────
  let npcThinkingElapsed = 0

  // ── Meteor Shower Particles ──────────────────────────────────────────────
  const meteorParticles: Ref<MeteorParticle[]> = ref([])
  let meteorIntroTimer = 0

  // ── Arena Powerups ───────────────────────────────────────────────────────
  // Reactive so a test scene UI can show debug info if it wants. The list is
  // mutated in place by `updatePowerups`; the physics loop is the only writer.
  const powerups: Ref<Powerup[]> = ref([])
  // Spawn cadence for the current match. `enabled` flips on per-game when the
  // stage gate is satisfied (or the test scene forces it on); the interval
  // bounds default to the production 10–15s window but can be overridden via
  // `initGame` for the dev test scene at /power-up.
  let powerupsEnabled = false
  let powerupIntervalMinMs = POWERUP_DEFAULT_INTERVAL_MIN_MS
  let powerupIntervalMaxMs = POWERUP_DEFAULT_INTERVAL_MAX_MS
  // Countdown to next spawn (ms). Resets to a random value in
  // [min..max] each time it reaches zero.
  let powerupSpawnTimer = 0
  let nextPowerupId = 0

  const rollPowerupSpawnDelay = (): number => {
    const span = Math.max(0, powerupIntervalMaxMs - powerupIntervalMinMs)
    return powerupIntervalMinMs + matchRng() * span
  }

  // ── Animation Frame ──────────────────────────────────────────────────────
  let physicsRafId: number | null = null
  // Set once when game-over is first detected so the next physics tick can
  // tear down VFX and transition into the reward phase exactly once.
  let gameOverAt: number | null = null

  // ── Background tile pattern ─────────────────────────────────────────────
  const bgTileImage = preloadImage(prependBaseUrl('images/bg/bg-tile_400x400.webp'))
  let bgTilePattern: CanvasPattern | null = null

  // ── Spark VFX ───────────────────────────────────────────────────────────
  const sparkImage = preloadImage(prependBaseUrl('images/vfx/big-spark_1280x256.webp'))
  const activeSparks: SpritesheetAnimation[] = []

  // ── Death explosion VFX ────────────────────────────────────────────────
  const explosionImage = preloadImage(prependBaseUrl('images/vfx/explosion_2080x160.webp'))
  const EXPLOSION_FRAMES = 13
  const EXPLOSION_FW = 160
  const EXPLOSION_FH = 160
  const EXPLOSION_FRAME_DURATION = 50 // ms per frame
  const activeExplosions: SpritesheetAnimation[] = []

  const spawnExplosion = (x: number, y: number, radius: number) => {
    const scale = (radius * 2.5) / EXPLOSION_FW
    const explosionSoundName = 'explosion-1'
    playSound(explosionSoundName)
    activeExplosions.push(createSpritesheetAnim(
      explosionImage, x, y,
      EXPLOSION_FRAMES, EXPLOSION_FRAME_DURATION, EXPLOSION_FW, EXPLOSION_FH, scale, false
    ))
  }

  // ── Shock-wall lightning bolt VFX ──────────────────────────────────────
  interface ShockBolt {
    x0: number;
    y0: number
    x1: number;
    y1: number
    life: number
    maxLife: number
  }

  const SHOCK_BOLT_LIFE = 675
  const activeShockBolts: ShockBolt[] = []
  let activeClashSounds = 0

  // Drops every live battle VFX layer. Used on surrender / forced
  // game-over so stale shock bolts and sparks don't linger into the
  // reward screen after physics stops ticking.
  const clearBattleVfx = () => {
    activeShockBolts.length = 0
    activeSparks.length = 0
    activeExplosions.length = 0
  }

  const MAX_ACTIVE_VFX = isFirefox ? 2 : 10
  const spawnShockBolt = (wallX: number, wallY: number, bladeX: number, bladeY: number) => {
    if (activeShockBolts.length >= MAX_ACTIVE_VFX) return
    // Extend endpoint slightly past the blade center along the incoming
    // direction so the bolt visually pierces into the core rather than
    // clipping at the rim.
    const dx = bladeX - wallX
    const dy = bladeY - wallY
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const overshoot = 14
    activeShockBolts.push({
      x0: wallX, y0: wallY,
      x1: bladeX + (dx / len) * overshoot,
      y1: bladeY + (dy / len) * overshoot,
      life: SHOCK_BOLT_LIFE, maxLife: SHOCK_BOLT_LIFE
    })
  }

  // Pinball-style bouncers placed on the arena floor for certain stages.
  // Populated by initGame from the stage's `bouncers` count and consumed
  // by the physics loop (ricochet) + renderArena (visual disc).
  interface Bouncer {
    x: number
    y: number
    radius: number
    /** Flash intensity 0..1 — pops to 1 on contact, decays each frame. */
    flash: number
  }

  const arenaBouncers: Bouncer[] = []
  const sparkCooldowns = new Map<string, number>() // "a_b" -> last spawn timestamp
  const clashSoundCooldowns = new Map<string, number>()

  // Per-pair "last contact" timestamp used to implement the one-hit-per-
  // contact-period rule (Option C). Every physics tick where a pair is
  // overlapping refreshes its timestamp. A pair is "re-armed" for damage
  // only when at least CONTACT_REARM_MS have passed WITHOUT any refresh —
  // i.e. the pair has actually separated for a few frames. This prevents
  // "hug and grind" from ticking damage every frame while still allowing
  // legitimate bounce-and-re-impact trades to score multiple hits.
  const CONTACT_REARM_MS = 50
  const contactTimes = new Map<string, number>()

  // Per-pair hug timer: records when an uninterrupted contact period began.
  // If a pair stays overlapping for longer than HUG_BREAK_MS the collision
  // resolver applies a one-off strong counter-impulse to forcibly separate
  // them — stops two blades from grinding against each other (or a blade
  // from grinding against a wall/bouncer) and piling up clash SFX, spark
  // VFX and damage rolls at a rate that tanks the frame time.
  const HUG_BREAK_MS = 1000
  const HUG_SEPARATION_IMPULSE = 3.5
  const hugStartTimes = new Map<string, number>()

  // Per-defender crit cooldown — prevents the "rapid bounce-off + chase" loop
  // from triggering crits on every contact while the opponent is still being
  // pushed and has its rear constantly exposed.
  const CRIT_COOLDOWN_MS = 1500
  const lastCritAt = new Map<number, number>()

  // Spiky top — chip damage applied on every collision pair, independent of
  // closing speed. Lets a "hugging" spiky blade keep pressuring a faster
  // opponent at low speeds. Scales with the victim's max HP so the spiky
  // top reads as a soft "tank shred": always at least 1, up to 2.5% of the
  // target's max HP. Throttled per pair so DPS stays in check.
  const SPIKY_CHIP_HP_FRACTION = 0.025
  const SPIKY_CHIP_MIN_DAMAGE = 1
  const SPIKY_CHIP_COOLDOWN_MS = 150
  const spikyChipCooldowns = new Map<string, number>() // "a_b" -> last chip timestamp

  // ── Blade Model Images ──────────────────────────────────────────────────
  const bladeModelImages = new Map<string, HTMLImageElement>()

  const getBladeModelImage = (topPartId: TopPartId, owner: 'player' | 'npc', modelOverride?: string): HTMLImageElement | null => {
    const key = modelOverride ?? `${topPartId}_${owner}`
    let img = bladeModelImages.get(key)
    if (!img) {
      img = preloadImage(spinnerModelImgPath(topPartId, owner, modelOverride))
      bladeModelImages.set(key, img)
    }
    return (img.complete && img.naturalWidth > 0) ? img : null
  }

  // ─── Trail System ────────────────────────────────────────────────────────

  interface TrailPoint {
    x: number;
    y: number;
    speed: number;
    time: number
  }

  interface TrailData {
    pts: TrailPoint[];
    owner: 'player' | 'npc'
    modelId?: string
  }

  const TRAIL_DURATION = 700
  const trails = new Map<number, TrailData>()

  const updateTrails = (blades: SpinnerState[], now: number) => {
    for (const blade of blades) {
      if (blade.hp <= 0) {
        trails.delete(blade.id)
        continue
      }
      const spd = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)

      let data = trails.get(blade.id)
      if (!data) {
        data = { pts: [], owner: blade.owner, modelId: blade.config.modelId }
        trails.set(blade.id, data)
      }
      const pts = data.pts

      // Always record position to keep path continuous
      pts.push({ x: blade.x, y: blade.y, speed: spd, time: now })

      // Prune expired points (batch splice instead of repeated shift)
      let pruneCount = 0
      while (pruneCount < pts.length && now - pts[pruneCount]!.time > TRAIL_DURATION) {
        pruneCount++
      }
      if (pruneCount > 0) pts.splice(0, pruneCount)
    }
  }

  // ─── Special Skin VFX ─────────────────────────────────────────────────────

  // Dark smoke spritesheet (for 'dark' skin). Reused directly from the
  // shared resourceCache — no cloneNode: `ctx.drawImage` is read-only
  // and many concurrent animations can sample different `sx/sy` offsets
  // from the same HTMLImageElement without contention.
  const SMOKE_FRAMES = 10
  const SMOKE_FW = 128   // frame width
  const SMOKE_FH = 128   // frame height
  const darkSmokeImg = resourceCache.images.get(prependBaseUrl('images/vfx/dark-smoke_1280x128.webp'))

  interface CloudParticle {
    x: number;
    y: number
    vx: number;
    vy: number
    life: number;
    maxLife: number
    size: number;
    alpha: number
    frame: number         // current spritesheet frame (0-8)
    frameTick: number     // time accumulator for frame advance
  }

  const cloudParticles: CloudParticle[] = []
  const SMOKE_FRAME_MS = 70 // ms per frame

  // Boulder ground destruction decals (for 'boulder' skin). Same cache-
  // reuse pattern as dark smoke above — no cloneNode needed.
  const earthRipImg = resourceCache.images.get(prependBaseUrl('images/vfx/earth-rip-decal_138x138.webp'))

  interface GroundDecal {
    x: number;
    y: number
    size: number
    time: number // creation timestamp
    rotation: number // random rotation per decal
  }

  const groundDecals: GroundDecal[] = []
  const GROUND_DECAL_DURATION = 800 // follows trail duration loosely

  // Sandstorm sand trail particles
  interface SandGrain {
    x: number;
    y: number
    vx: number;
    vy: number
    life: number;
    maxLife: number
    size: number
    color: string
  }

  const sandGrains: SandGrain[] = []

  // Stat-switch phase indicator particles (floating icon over boss)
  // Rendered in renderAura so it layers correctly.

  const updateSpecialSkinVFX = (blades: SpinnerState[], now: number) => {
    // Dark cloud emission
    for (const blade of blades) {
      if (blade.hp <= 0) continue
      const spd = speed(blade)
      if (blade.config.modelId !== 'dark' || spd < 0.5) continue
      // Emit 1-2 cloud particles per frame when moving
      const count = spd > 3 ? 2 : 1
      for (let i = 0; i < count; i++) {
        if (cloudParticles.length >= 120) break
        const angle = Math.random() * Math.PI * 2
        const drift = 0.2 + Math.random() * 0.3
        const maxLife = 400 + Math.random() * 300
        cloudParticles.push({
          x: blade.x + (Math.random() - 0.5) * blade.radius,
          y: blade.y + (Math.random() - 0.5) * blade.radius,
          vx: Math.cos(angle) * drift,
          vy: Math.sin(angle) * drift,
          life: maxLife,
          maxLife,
          size: 8 + Math.random() * 6,
          alpha: 0.7 + Math.random() * 0.3,
          frame: 0,
          frameTick: 0
        })
      }
    }
    // Update cloud particles (compact dead entries in-place)
    let cloudWrite = 0
    for (let i = 0; i < cloudParticles.length; i++) {
      const p = cloudParticles[i]!
      p.x += p.vx
      p.y += p.vy
      p.life -= 16
      p.size += 0.08
      // Advance spritesheet frame
      p.frameTick += 16
      if (p.frameTick >= SMOKE_FRAME_MS) {
        p.frameTick -= SMOKE_FRAME_MS
        if (p.frame < SMOKE_FRAMES - 1) p.frame++
      }
      if (p.life > 0) cloudParticles[cloudWrite++] = p
    }
    cloudParticles.length = cloudWrite

    // Boulder ground decals
    for (const blade of blades) {
      if (blade.hp <= 0) continue
      const spd = speed(blade)
      if ((blade.config.modelId !== 'boulder' && blade.config.modelId !== 'diamond') || spd < 1.0) continue
      if (groundDecals.length >= 80) break
      groundDecals.push({
        x: blade.x, y: blade.y,
        size: blade.radius * (0.6 + spd * 0.04),
        time: now,
        rotation: Math.random() * Math.PI * 2
      })
    }
    // Prune old decals (batch splice instead of repeated shift)
    let decalPrune = 0
    while (decalPrune < groundDecals.length && now - groundDecals[decalPrune]!.time > GROUND_DECAL_DURATION) {
      decalPrune++
    }
    if (decalPrune > 0) groundDecals.splice(0, decalPrune)

    // Sandstorm trail particles — small grains scattered behind the blade
    for (const blade of blades) {
      if (blade.hp <= 0 || blade.config.modelId !== 'sandstorm') continue
      const spd = speed(blade)
      if (spd < 0.5) continue
      const count = spd > 3 ? 3 : spd > 1.5 ? 2 : 1
      for (let i = 0; i < count; i++) {
        if (sandGrains.length >= 150) break
        const angle = Math.random() * Math.PI * 2
        const drift = 0.15 + Math.random() * 0.25
        const maxLife = 350 + Math.random() * 250
        const colors = ['#e8c870', '#d4a855', '#c49040', '#bf8f3a', '#a87530']
        sandGrains.push({
          x: blade.x + (Math.random() - 0.5) * blade.radius * 1.2,
          y: blade.y + (Math.random() - 0.5) * blade.radius * 1.2,
          vx: Math.cos(angle) * drift,
          vy: Math.sin(angle) * drift,
          life: maxLife,
          maxLife,
          size: 1 + Math.random() * 2,
          color: colors[Math.floor(Math.random() * colors.length)]!
        })
      }
    }
    // Update sand grains (compact dead entries in-place)
    let sandWrite = 0
    for (let i = 0; i < sandGrains.length; i++) {
      const g = sandGrains[i]!
      g.x += g.vx
      g.y += g.vy
      g.vy += 0.003 // slight downward gravity
      g.life -= 16
      g.size *= 0.998 // shrink slowly
      if (g.life > 0) sandGrains[sandWrite++] = g
    }
    sandGrains.length = sandWrite
  }

  const renderCloudParticles = (ctx: CanvasRenderingContext2D) => {
    if (!darkSmokeImg) return
    for (const p of cloudParticles) {
      const fade = Math.max(0, p.life / p.maxLife)
      ctx.globalAlpha = p.alpha * fade
      const drawSize = p.size * 2
      ctx.drawImage(
        darkSmokeImg,
        p.frame * SMOKE_FW, 0, SMOKE_FW, SMOKE_FH, // source rect
        p.x - drawSize / 2, p.y - (drawSize * SMOKE_FH / SMOKE_FW) / 2,
        drawSize, drawSize * SMOKE_FH / SMOKE_FW   // dest rect (preserve aspect)
      )
    }
    ctx.globalAlpha = 1
  }

  const renderSandGrains = (ctx: CanvasRenderingContext2D) => {
    for (const g of sandGrains) {
      const fade = Math.max(0, g.life / g.maxLife)
      ctx.globalAlpha = 0.6 * fade
      ctx.fillStyle = g.color
      ctx.beginPath()
      ctx.arc(g.x, g.y, g.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const renderGroundDecals = (ctx: CanvasRenderingContext2D, now: number) => {
    if (!earthRipImg) return
    for (const d of groundDecals) {
      const age = now - d.time
      const fade = Math.max(0, 1 - age / GROUND_DECAL_DURATION)
      ctx.globalAlpha = 0.6 * fade
      const drawSize = d.size * 2
      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.rotation)
      ctx.drawImage(earthRipImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  // ─── Floating Damage Numbers ──────────────────────────────────────────────

  interface DamageNumber {
    x: number;
    y: number
    vx: number;
    vy: number
    value: number
    color: string   // '#66aaff' player, '#ff6666' npc
    life: number     // remaining ms
    maxLife: number
    isCrit: boolean
    comboText?: string  // thunder arena combo label
  }

  const DAMAGE_NUMBER_LIFE = 900
  const damageNumbers: DamageNumber[] = []

  // ── Floating Powerup Pickup Indicators ──────────────────────────────────
  // Similar to damage numbers but show "+ATK" / "+DEF" / "+SPD" with the
  // stat icon color, floating upward from the pickup position.
  interface PowerupFloat {
    x: number
    y: number
    vy: number
    stat: PowerupStat
    life: number
    maxLife: number
  }

  const POWERUP_FLOAT_LIFE = 1100
  const powerupFloats: PowerupFloat[] = []
  const POWERUP_STAT_LABEL: Record<PowerupStat, string> = {
    attack: 'ATK',
    defense: 'DEF',
    speed: 'SPD'
  }
  const POWERUP_FLOAT_COLOR: Record<PowerupStat, string> = {
    attack: '#ef4444',
    defense: '#a78bfa',
    speed: '#22d3ee'
  }

  const spawnPowerupFloat = (x: number, y: number, stat: PowerupStat) => {
    if (powerupFloats.length >= 25) return
    powerupFloats.push({
      x,
      y,
      vy: -0.06,
      stat,
      life: POWERUP_FLOAT_LIFE,
      maxLife: POWERUP_FLOAT_LIFE
    })
  }

  const updatePowerupFloats = (dt: number) => {
    let w = 0
    for (let i = 0; i < powerupFloats.length; i++) {
      const pf = powerupFloats[i]!
      pf.y += pf.vy * dt
      pf.life -= dt
      if (pf.life > 0) powerupFloats[w++] = pf
    }
    powerupFloats.length = w
  }

  const renderPowerupFloats = (ctx: CanvasRenderingContext2D) => {
    for (const pf of powerupFloats) {
      const alpha = Math.max(0, pf.life / pf.maxLife)
      const scale = 0.9 + 0.3 * (1 - alpha)
      const color = POWERUP_FLOAT_COLOR[pf.stat]
      const label = '+' + POWERUP_STAT_LABEL[pf.stat]

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `bold ${18 * scale}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Draw the stat icon to the left of the text
      const textWidth = ctx.measureText(label).width
      const iconSize = 14 * scale
      const totalWidth = iconSize + 3 + textWidth
      const startX = pf.x - totalWidth / 2

      // Icon
      const iconPath = getPowerupIconPath(pf.stat)
      ctx.save()
      ctx.translate(startX + iconSize / 2, pf.y)
      const s = iconSize / 24
      ctx.scale(s, s)
      ctx.translate(-12, -12)
      ctx.fillStyle = color
      ctx.fill(iconPath)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#000'
      ctx.stroke(iconPath)
      ctx.restore()

      // Text with outline
      const textX = startX + iconSize + 3 + textWidth / 2
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(label, textX, pf.y)
      ctx.fillStyle = color
      ctx.fillText(label, textX, pf.y)

      ctx.restore()
    }
  }

  // Thunder arena combo tracking: per-blade last hit target + timestamp + stacks
  const COMBO_WINDOW_MS = 3000
  const COMBO_GRACE_MS = 100
  const comboState = new Map<number, { targetId: number; lastTime: number; stacks: number }>()

  const spawnDamageNumber = (x: number, y: number, value: number, dealerOwner: 'player' | 'npc', isCrit = false) => {
    if (Math.round(value) <= 0) return
    // Random angle in a 60° cone pointing upward (centered at -90°)
    const baseAngle = -Math.PI / 2
    const spread = (Math.PI / 3) // 60°
    const angle = baseAngle + (Math.random() - 0.5) * spread
    const speed = 0.06 + Math.random() * 0.03

    if (damageNumbers.length >= 60) return
    damageNumbers.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      value: Math.round(value),
      color: dealerOwner === 'player' ? '#66aaff' : '#ff6666',
      life: DAMAGE_NUMBER_LIFE,
      maxLife: DAMAGE_NUMBER_LIFE,
      isCrit
    })
  }

  const updateDamageNumbers = (dt: number) => {
    let w = 0
    for (let i = 0; i < damageNumbers.length; i++) {
      const dn = damageNumbers[i]!
      dn.x += dn.vx * dt
      dn.y += dn.vy * dt
      dn.life -= dt
      if (dn.life > 0) damageNumbers[w++] = dn
    }
    damageNumbers.length = w
  }

  const renderDamageNumbers = (ctx: CanvasRenderingContext2D) => {
    const now = performance.now()
    const critPulse = 0.5 + 0.5 * Math.sin(now * 0.01)
    for (const dn of damageNumbers) {
      const alpha = Math.max(0, dn.life / dn.maxLife)
      const baseScale = 0.8 + 0.4 * (1 - alpha) // slightly grow as they fade
      const scale = dn.isCrit ? baseScale * 1.5 : baseScale
      const text = dn.comboText ?? dn.value.toString()

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `bold ${Math.round(20 * scale)}px Arial`
      ctx.textAlign = dn.comboText ? 'left' : 'center'
      ctx.textBaseline = 'middle'

      // Crit: dark orange pulsating aura
      if (dn.isCrit) {
        if (!isFirefox) {
          const auraRadius = 8 + critPulse * 6
          ctx.shadowColor = '#cc6600'
          ctx.shadowBlur = auraRadius
        }
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeText(text, dn.x, dn.y)
        ctx.fillStyle = '#ff8800'
        ctx.fillText(text, dn.x, dn.y)
        ctx.shadowBlur = 0
      } else {
        // Text shadow (game-text style: black border)
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.strokeText(text, dn.x, dn.y)
        ctx.fillStyle = dn.color
        ctx.fillText(text, dn.x, dn.y)
      }

      ctx.restore()
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  let nextBladeId = 0
  let nextGroupId = 1

  // ── Boss ability tuning ────────────────────────────────────────────────
  // Split-boss: children stats (fractions of the parent).
  const SPLIT_CHILD_COUNT = 5
  // Nerf pass: children now get 66% of the old post-split HP (0.22 → 0.1452),
  // 25% of the parent's defense multiplier, and 33% of the parent's weight,
  // so a split swarm can no longer out-tank the boss it came from.
  const SPLIT_CHILD_HP_PCT = 0.22 * 0.66
  const SPLIT_CHILD_DAMAGE_PCT = 0.35
  const SPLIT_CHILD_DEFENSE_PCT = 0.25
  const SPLIT_CHILD_WEIGHT_PCT = 0.33
  const SPLIT_CHILD_RADIUS_PCT = 0.62
  const SPLIT_CHILD_INVULN_MS = 1100
  // Ghost-boss: lateral offset of the twin at spawn, relative to blade radius.
  const GHOST_SPLIT_OFFSET = 2.1
  // Healer-boss: oversize vs normal blade (1.2x as requested).
  const HEALER_RADIUS_MULT = 1.2
  // Healer-boss: HP restored per ally-contact, capped so it's chip-heal only.
  const HEALER_CONTACT_HEAL = 2
  const HEALER_HEAL_COOLDOWN_MS = 250
  const healerHealCooldowns = new Map<string, number>()

  const speed = (blade: SpinnerState): number =>
    Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)

  const livingBlades = (blades: SpinnerState[]): SpinnerState[] =>
    blades.filter(b => b.hp > 0)

  const isInvulnerable = (blade: SpinnerState): boolean =>
    blade.invulnerableUntil !== undefined && gameTime() < blade.invulnerableUntil

  let firstGameBoost = false

  // Per-frame stats cache — cleared once per physics tick so statsFor()
  // never recomputes the same blade twice in one frame.
  const _statsCache = new Map<number, SpinnerStats>()

  const statsFor = (blade: SpinnerState): SpinnerStats => {
    const cached = _statsCache.get(blade.id)
    if (cached) return cached
    const stats = computeStats(blade.config, blade.config.topLevel ?? 0, blade.config.bottomLevel ?? 0)
    let dmg = stats.damageMultiplier
    let def = stats.defenseMultiplier
    let spd = stats.speedMultiplier
    if (firstGameBoost && blade.owner === 'player') dmg *= 2
    // Split-boss children hit for a fraction of the parent's damage so a
    // swarm can't simply out-DPS a focused target. Defense and weight are
    // also nerfed so each child reads as a fragile minion, not a clone of
    // the boss — this is the knob the physics + damage formulas both read.
    let weightMul = 1
    if (blade.isSplitChild) {
      dmg *= SPLIT_CHILD_DAMAGE_PCT
      def *= SPLIT_CHILD_DEFENSE_PCT
      weightMul = SPLIT_CHILD_WEIGHT_PCT
    }
    // Stat-switch boss: in attack phase pick max(ATK, DEF) as ATK;
    // in defense phase pick max(ATK, DEF) as DEF.
    if (blade.statSwitchPhase === 'attack') {
      dmg = Math.max(dmg, def)
    } else if (blade.statSwitchPhase === 'defense') {
      def = Math.max(dmg, def)
    }
    // Diamond skin: hidden 1.2x defense bonus
    if (blade.config.modelId === 'diamond') def *= 1.2
    // Powerup buffs collected during this match. Each pickup multiplies the
    // matching axis (e.g. two attack pickups stack to 1.25 * 1.25).
    const buffs = blade.buffs
    if (buffs) {
      if (buffs.attack) dmg *= buffs.attack
      if (buffs.defense) def *= buffs.defense
      if (buffs.speed) spd *= buffs.speed
    }
    let result: SpinnerStats
    if (
      dmg === stats.damageMultiplier
      && def === stats.defenseMultiplier
      && spd === stats.speedMultiplier
      && weightMul === 1
    ) {
      result = stats
    } else {
      result = {
        ...stats,
        damageMultiplier: dmg,
        defenseMultiplier: def,
        speedMultiplier: spd,
        totalWeight: stats.totalWeight * weightMul
      }
    }
    _statsCache.set(blade.id, result)
    return result
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  function createBladeState(
    owner: 'player' | 'npc',
    x: number, y: number,
    config: SpinnerConfig,
    isBoss = false
  ): SpinnerState {
    const stats = computeStats(config, config.topLevel ?? 0, config.bottomLevel ?? 0)
    const bossHpMultiplier = isBoss ? 2 : 1
    const boostHpMultiplier = (firstGameBoost && owner === 'player') ? 2 : 1
    // Campaign-only NPC HP scaling by difficulty: EASY -10%, HARD +30%.
    // PvP and ghost fights are excluded so both modes stay authoritative.
    const difficultyHpMultiplier =
      owner === 'npc' && !pvpMode.value && !ghostMode.value
        ? getDifficultyHpMult()
        : 1
    // Keep the live-rescale watcher's baseline in sync with what we
    // actually baked into this spawn so a later difficulty change scales
    // from the correct starting point.
    if (owner === 'npc') appliedDifficultyHpMult = difficultyHpMultiplier
    // Healer partners are only 20% oversize — per design they're "barely
    // bigger than normal blades". Every other boss keeps the 1.6x hulk
    // radius so the classic solo-boss silhouette still reads as huge.
    let radiusMult = 1
    if (isBoss) {
      radiusMult = config.bossAbility === 'healers' ? HEALER_RADIUS_MULT : 1.6
    }
    const bossRadius = BLADE_RADIUS * radiusMult
    const finalHp = stats.maxHp * bossHpMultiplier * boostHpMultiplier * difficultyHpMultiplier
    return {
      id: nextBladeId++,
      x, y,
      vx: 0, vy: 0,
      ax: 0, ay: 0,
      accelFramesLeft: 0,
      radius: bossRadius,
      hp: finalHp,
      maxHp: finalHp,
      rotation: 0,
      rotationSpeed: isBoss ? 0.03 : 0.05,
      hitFlash: 0,
      wallBounceCount: 0,
      lastHitTime: 0,
      config,
      owner,
      isBoss
    }
  }

  // ─── Boss Ability Helpers ────────────────────────────────────────────────

  /**
   * Spawn the twin half of a ghost-boss blade. Called once on the parent's
   * first launch. The twin mirrors the launch vector (perpendicular offset),
   * shares the parent's group so there is no friendly fire, and is linked
   * both ways for damage mirroring.
   */
  const spawnGhostTwin = (parent: SpinnerState) => {
    // Derive the launch direction from the parent's acceleration vector
    // (we run this on the same frame as the launch, so velocity is still 0).
    const mag = Math.hypot(parent.ax, parent.ay) || 1
    const ndx = parent.ax / mag
    const ndy = parent.ay / mag
    // Perpendicular offset so the twin spawns *beside* the parent, not
    // inside it — prevents the first physics step from overlap-pushing.
    const perpX = -ndy
    const perpY = ndx
    const offset = parent.radius * GHOST_SPLIT_OFFSET

    const twin = createBladeState(
      parent.owner,
      parent.x + perpX * offset,
      parent.y + perpY * offset,
      { ...parent.config },
      parent.isBoss
    )
    // Twin inherits parent's current HP (parent may already have taken a
    // pre-launch hit) so the "shared damage" contract holds retroactively.
    twin.hp = parent.hp
    twin.maxHp = parent.maxHp
    twin.groupId = parent.groupId
    twin.ax = parent.ax
    twin.ay = parent.ay
    twin.accelFramesLeft = parent.accelFramesLeft
    twin.ghostPending = false
    // Cross-link: each half mirrors damage to the other.
    parent.linkedIds = [...(parent.linkedIds ?? []), twin.id]
    twin.linkedIds = [parent.id]
    parent.ghostPending = false

    // Ensure twin is clamped inside the arena.
    const d = Math.hypot(twin.x, twin.y)
    const maxR = ARENA_RADIUS - twin.radius
    if (d > maxR) {
      twin.x *= maxR / d
      twin.y *= maxR / d
    }

    if (parent.owner === 'npc') npcBlades.value = [...npcBlades.value, twin]
    else playerBlades.value = [...playerBlades.value, twin]
  }

  /**
   * Shatter a split-boss blade into mini children. Called the instant the
   * parent's HP reaches zero. Children spread radially with short-lived
   * invincibility frames so they don't immediately slam into each other,
   * and they inherit the parent's group so their swarm never self-damages.
   */
  const spawnSplitChildren = (parent: SpinnerState) => {
    const now = gameTime()
    const children: SpinnerState[] = []
    for (let i = 0; i < SPLIT_CHILD_COUNT; i++) {
      // In PvP use a fixed offset so both clients agree on child positions
      const jitter = pvpMode.value ? 0.125 : Math.random() * 0.25
      const angle = (i / SPLIT_CHILD_COUNT) * Math.PI * 2 + jitter
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      // Place outside parent's body so they don't trivially collide on frame 1.
      const childRadius = BLADE_RADIUS * SPLIT_CHILD_RADIUS_PCT
      const spawnDist = parent.radius + childRadius * 1.1
      const child = createBladeState(
        parent.owner,
        parent.x + dx * spawnDist,
        parent.y + dy * spawnDist,
        { ...parent.config, bossAbility: undefined, isBoss: false },
        false
      )
      child.radius = childRadius
      child.maxHp = Math.max(1, Math.round(parent.maxHp * SPLIT_CHILD_HP_PCT))
      child.hp = child.maxHp
      child.groupId = parent.groupId ?? (nextGroupId++)
      child.isSplitChild = true
      child.invulnerableUntil = now + SPLIT_CHILD_INVULN_MS
      // Drift outward so the swarm spreads and settles into free space.
      const drift = 1.2
      child.vx = dx * drift
      child.vy = dy * drift

      // Clamp inside the arena so newborns don't instantly wall-bounce.
      const d = Math.hypot(child.x, child.y)
      const maxR = ARENA_RADIUS - child.radius - 4
      if (d > maxR) {
        child.x *= maxR / d
        child.y *= maxR / d
      }
      children.push(child)
    }
    if (parent.owner === 'npc') npcBlades.value = [...npcBlades.value, ...children]
    else playerBlades.value = [...playerBlades.value, ...children]
  }

  /**
   * Apply damage to a blade with ghost-link mirroring. Returns true if the
   * blade (or any linked half) was killed by this hit, so callers can run
   * the split-on-death handler.
   */
  const applyBladeDamage = (
    target: SpinnerState,
    dmg: number,
    cx: number, cy: number,
    sourceOwner: 'player' | 'npc',
    isCrit: boolean
  ): boolean => {
    let killed = false
    target.hp = Math.max(0, target.hp - dmg)
    target.hitFlash = HIT_FLASH_FRAMES
    spawnDamageNumber(cx, cy, dmg, sourceOwner, isCrit)
    if (target.hp <= 0) {
      killed = true
      spawnExplosion(target.x, target.y, target.radius)
    }

    // Ghost link: any damage taken is mirrored 1:1 to the linked halves.
    // Mirror is non-recursive (we don't re-mirror back to the source) to
    // avoid an infinite ping-pong.
    if (target.linkedIds && target.linkedIds.length > 0) {
      const all = allBlades.value
      for (const lid of target.linkedIds) {
        const linked = all.find(b => b.id === lid)
        if (!linked || linked.hp <= 0) continue
        linked.hp = Math.max(0, linked.hp - dmg)
        linked.hitFlash = HIT_FLASH_FRAMES
        // Mirrored numbers render at the linked blade's location so the
        // player sees the ghost-link is real.
        spawnDamageNumber(linked.x, linked.y, dmg, sourceOwner, false)
        if (linked.hp <= 0) {
          killed = true
          spawnExplosion(linked.x, linked.y, linked.radius)
        }
      }
    }
    return killed
  }

  // ─── Game Lifecycle ──────────────────────────────────────────────────────

  const initGame = (
    pTeam: SpinnerConfig[],
    nTeam: SpinnerConfig[],
    boost = false,
    arena: ArenaType = 'default',
    bouncerCount = 0,
    enablePowerups = false,
    powerupIntervalMs: [number, number] = [POWERUP_DEFAULT_INTERVAL_MIN_MS, POWERUP_DEFAULT_INTERVAL_MAX_MS],
    pvp: { enabled: boolean; myTurnFirst: boolean } | null = null
  ) => {
    pvpMode.value = !!pvp?.enabled
    BLADE_RADIUS = pvpMode.value ? PVP_BLADE_RADIUS : DEFAULT_BLADE_RADIUS
    pvpTickCount = 0
    firstGameBoost = boost
    // In PvP the host already seeded + broadcast a shared seed via the
    // game-start message; single-player reseeds locally per match.
    if (!pvpMode.value) seedMatchRngRandom()
    stopPhysics()
    nextBladeId = 0
    // Clear cached player model images so skin changes take effect
    for (const key of [...bladeModelImages.keys()]) {
      if (key.endsWith('_player')) bladeModelImages.delete(key)
    }

    // Player blades: bottom half, spread evenly
    const pCount = pTeam.length
    playerBlades.value = pTeam.map((cfg, i) => {
      const spreadX = pCount === 1 ? 0 : (i / (pCount - 1) - 0.5) * ARENA_RADIUS * 0.7
      return createBladeState('player', spreadX, ARENA_RADIUS * 0.4, cfg)
    })

    // NPC blades positioning
    const nCount = nTeam.length
    const npcPositions: { x: number; y: number }[] = []

    if (pvpMode.value) {
      // PvP: use same X spread as the opponent's player layout but flip Y
      // only, so left-right order (and skins) stay consistent across both
      // screens. The acceleration mirror (executeRemoteLaunch) must match:
      // only ay is negated, ax stays the same.
      for (let i = 0; i < nCount; i++) {
        const spreadX = nCount === 1 ? 0 : (i / (nCount - 1) - 0.5) * ARENA_RADIUS * 0.7
        npcPositions.push({ x: spreadX, y: -ARENA_RADIUS * 0.4 })
      }
    } else {
      // Campaign / ghost: deterministic grid in top half, with small jitter
      const maxJitter = BLADE_RADIUS * 0.8

      if (nCount === 1) {
        const jx = (Math.random() - 0.5) * maxJitter
        const jy = (Math.random() - 0.5) * maxJitter
        npcPositions.push({ x: jx, y: -ARENA_RADIUS * 0.4 + jy })
      } else if (nCount === 2) {
        for (let i = 0; i < 2; i++) {
          const x = (i === 0 ? -1 : 1) * ARENA_RADIUS * 0.4 + (Math.random() - 0.5) * maxJitter
          const y = -ARENA_RADIUS * 0.4 + (Math.random() - 0.5) * maxJitter
          npcPositions.push({ x, y })
        }
      } else if (nCount === 3) {
        // Triangle: 2 on top row, 1 centered below
        const topY = -ARENA_RADIUS * 0.55
        const botY = -ARENA_RADIUS * 0.2
        const halfW = ARENA_RADIUS * 0.4
        npcPositions.push({
          x: -halfW + (Math.random() - 0.5) * maxJitter,
          y: topY + (Math.random() - 0.5) * maxJitter
        })
        npcPositions.push({ x: halfW + (Math.random() - 0.5) * maxJitter, y: topY + (Math.random() - 0.5) * maxJitter })
        npcPositions.push({ x: (Math.random() - 0.5) * maxJitter, y: botY + (Math.random() - 0.5) * maxJitter })
      } else {
        // 4: 2x2 grid
        const halfW = ARENA_RADIUS * 0.4
        const topY = -ARENA_RADIUS * 0.65
        const botY = -ARENA_RADIUS * 0.15
        const slots = [
          { x: -halfW, y: topY },
          { x: halfW, y: topY },
          { x: -halfW, y: botY },
          { x: halfW, y: botY }
        ]
        for (let i = 0; i < nCount; i++) {
          const s = slots[i]!
          npcPositions.push({
            x: s.x + (Math.random() - 0.5) * maxJitter,
            y: s.y + (Math.random() - 0.5) * maxJitter
          })
        }
      }

      // Clamp all NPC positions inside the arena
      for (const pos of npcPositions) {
        const d = Math.hypot(pos.x, pos.y)
        const maxR = ARENA_RADIUS - BLADE_RADIUS * 2
        if (d > maxR) {
          pos.x *= maxR / d
          pos.y *= maxR / d
        }
      }
    }

    npcBlades.value = nTeam.map((cfg, i) =>
      createBladeState('npc', npcPositions[i]!.x, npcPositions[i]!.y, cfg, cfg.isBoss)
    )

    // ── Boss ability wiring ───────────────────────────────────────────────
    // Decide the enemy team's "ability theme" from its leading boss entry.
    // A single ability applies to the whole enemy roster so the player
    // reads the fight as one coherent encounter (e.g. "all these blades
    // are a partner group").
    const leadAbility = nTeam.find(c => c.bossAbility)?.bossAbility
    if (leadAbility === 'partners' || leadAbility === 'healers') {
      // All enemy blades share the same group — no friendly fire between
      // them, and healer groups also tick a chip-heal on ally contact.
      const gid = nextGroupId++
      for (const blade of npcBlades.value) {
        blade.groupId = gid
        blade.bouncesAllies = true
        if (leadAbility === 'healers') blade.healsAllies = true
      }
    } else if (leadAbility === 'ghost') {
      // Each ghost boss gets its own group and is flagged to spawn its
      // twin on the first launch. The split is deferred to launch time so
      // the dramatic "one blade becomes two" beat is preserved.
      for (const blade of npcBlades.value) {
        if (blade.config.bossAbility === 'ghost') {
          blade.groupId = nextGroupId++
          blade.ghostPending = true
        }
      }
    } else if (leadAbility === 'split') {
      // The split boss keeps its own group so its children never hurt
      // each other when they swarm. Flagged here — spawning happens on
      // death inside resolveCollision.
      for (const blade of npcBlades.value) {
        if (blade.config.bossAbility === 'split') {
          blade.groupId = nextGroupId++
          blade.splitsOnDeath = true
        }
      }
    } else if (leadAbility === 'child-emitter') {
      // Child-emitter: marks boss blades so they spawn a mini distraction
      // spinner on each collision (handled in resolveCollision).
      for (const blade of npcBlades.value) {
        if (blade.config.bossAbility === 'child-emitter') {
          blade.isChildEmitter = true
          blade.groupId = nextGroupId++
        }
      }
    } else if (leadAbility === 'stat-switch') {
      // Stat-switch boss: starts in defense phase. Phase toggled each turn.
      for (const blade of npcBlades.value) {
        if (blade.config.bossAbility === 'stat-switch') {
          blade.statSwitchPhase = 'defense'
        }
      }
    } else if (leadAbility === 'life-leech') {
      // Life-leech boss: heals 30% of damage dealt on collision.
      for (const blade of npcBlades.value) {
        if (blade.config.bossAbility === 'life-leech') {
          blade.isLifeLeech = true
        }
      }
    }

    // Thunder ability: set on any blade with bossAbility 'thunder' (works standalone or mixed with partners)
    for (const blade of npcBlades.value) {
      if (blade.config.bossAbility === 'thunder') {
        blade.isThunder = true
        blade.thunderLastHit = new Map()
      }
    }

    // Teleporter skin: set on any blade using the 'teleporter' model (boss only)
    for (const blade of [...npcBlades.value, ...playerBlades.value]) {
      if (blade.config.modelId === 'teleporter') {
        blade.isTeleporter = true
      }
    }

    isBossStage.value = nTeam.some(cfg => cfg.isBoss)
    arenaType.value = isBossStage.value ? 'boss' : arena

    isDragging.value = false
    selectedBladeId.value = null
    npcActiveBladeId.value = null
    launchedBladeId.value = null
    npcThinkingElapsed = 0
    pendingRemoteLaunch = null
    pvpTurnCounter = 0
    gameResult.value = null
    turnAnnouncement.value = ''
    meteorParticles.value = []
    meteorIntroTimer = 0
    trails.clear()
    cloudParticles.length = 0
    groundDecals.length = 0
    sandGrains.length = 0
    comboState.clear()
    lastCritAt.clear()
    spikyChipCooldowns.clear()
    healerHealCooldowns.clear()
    sparkCooldowns.clear()
    clashSoundCooldowns.clear()
    contactTimes.clear()
    hugStartTimes.clear()
    damageNumbers.length = 0
    activeSparks.length = 0
    activeExplosions.length = 0
    activeShockBolts.length = 0
    gameOverAt = null

    // ── Powerups ──────────────────────────────────────────────────────────
    // Configure spawn cadence and clear any leftover crates/particles from
    // a previous match. The actual spawning is driven by the physics loop.
    powerupsEnabled = enablePowerups
    powerupIntervalMinMs = powerupIntervalMs[0]
    powerupIntervalMaxMs = powerupIntervalMs[1]
    resetPowerups()

    // ── Bouncers: pinball-style obstacles on the arena floor ───────────────
    // Regenerate positions every match. We place them inside an annulus
    // (BOUNCER_MIN_R..BOUNCER_MAX_R), enforce a minimum separation from
    // each other AND from every player + NPC spawn, and never overlap the
    // arena border. A capped retry count keeps this bounded even if the
    // annulus is very crowded.
    arenaBouncers.length = 0
    const clampedBouncerCount = Math.max(0, Math.min(3, bouncerCount | 0))
    if (clampedBouncerCount > 0) {
      const minSepBouncer = BOUNCER_RADIUS * 2 + 12
      const minSepBlade = BLADE_RADIUS + BOUNCER_RADIUS + 8
      const spawns: { x: number; y: number }[] = [
        ...playerBlades.value.map(b => ({ x: b.x, y: b.y })),
        ...npcBlades.value.map(b => ({ x: b.x, y: b.y }))
      ]
      for (let i = 0; i < clampedBouncerCount; i++) {
        let placed: Bouncer | null = null
        for (let attempt = 0; attempt < 40 && !placed; attempt++) {
          const angle = Math.random() * Math.PI * 2
          const r = BOUNCER_MIN_R + Math.random() * (BOUNCER_MAX_R - BOUNCER_MIN_R)
          const x = Math.cos(angle) * r
          const y = Math.sin(angle) * r
          let ok = true
          for (const b of arenaBouncers) {
            if (Math.hypot(b.x - x, b.y - y) < minSepBouncer) {
              ok = false
              break
            }
          }
          if (ok) {
            for (const sp of spawns) {
              if (Math.hypot(sp.x - x, sp.y - y) < minSepBlade) {
                ok = false
                break
              }
            }
          }
          if (ok) placed = { x, y, radius: BOUNCER_RADIUS, flash: 0 }
        }
        // Fall back to a deterministic ring slot if 40 random tries all
        // collided — better to have a slightly clumped bouncer than to
        // silently skip the obstacle the stage author asked for.
        if (!placed) {
          const slotAngle = (i / clampedBouncerCount) * Math.PI * 2
          const r = (BOUNCER_MIN_R + BOUNCER_MAX_R) / 2
          placed = {
            x: Math.cos(slotAngle) * r,
            y: Math.sin(slotAngle) * r,
            radius: BOUNCER_RADIUS,
            flash: 0
          }
        }
        arenaBouncers.push(placed)
      }
    }

    clearCountdown()

    // In PvP mode, skip tap_to_start and go straight into the match
    if (pvp?.enabled) {
      phase.value = 'deciding_turn'
      const startsWithPlayer = pvp.myTurnFirst
      turnAnnouncement.value = startsWithPlayer ? 'YOUR TURN' : 'OPPONENT\'S TURN'
      startPhysics()
      spawnMeteorShower(80, 50, 65)
      setTimeout(() => {
        phase.value = startsWithPlayer ? 'player_turn' : 'npc_turn'
        turnAnnouncement.value = ''
        npcThinkingElapsed = 0
        const first = livingBlades(playerBlades.value)[0]
        if (first) selectedBladeId.value = first.id
      }, 1200)
      return
    }

    phase.value = 'tap_to_start'
  }

  const startMatch = () => {
    if (phase.value !== 'tap_to_start') return

    // Trigger meteor shower intro
    spawnMeteorShower(80, 50, 65)

    try {
      const randomInt = Math.min(Math.floor(Math.random() * 2) + 1, 2)
      const audioName = `celebration-${randomInt}`
      playSound(audioName)
    } catch (e: any) {
    }

    // Track game starts; every Nth launches the countdown overlay.
    // Persisted via setRemoteOnly so the counter syncs to sdk.data
    // without leaving a `spinner_game_start_count` entry in localStorage.
    gameStartCount.value++
    persistGameStartCount(gameStartCount.value)
    if (gameStartCount.value % COUNTDOWN_EVERY_N_GAMES === 0) {
      triggerCountdown()
    }

    phase.value = 'meteor_intro'
    meteorIntroTimer = 0
    startPhysics()
  }

  // ─── Meteor Shower (reusable) ────────────────────────────────────────────

  const spawnMeteorShower = (
    count: number,
    spawnRadius: number,
    maxLife: number
  ) => {
    // Spawn in staggered waves — delay spread across ~60% of maxLife
    // so particles keep appearing throughout most of the animation
    const maxDelay = Math.floor(maxLife * 0.6)
    const particles: MeteorParticle[] = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const spawnDist = spawnRadius + (Math.random() - 0.5) * 6
      const spd = 1.5 + Math.random() * 2.5
      const lifeVar = maxLife + Math.floor(Math.random() * 20)
      // Stagger: life starts above maxLife; particle waits until life <= maxLife
      const delay = Math.floor(Math.random() * maxDelay)
      particles.push({
        x: Math.cos(angle) * spawnDist,
        y: Math.sin(angle) * spawnDist,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: lifeVar + delay,
        maxLife: lifeVar,
        hue: Math.random() < 0.25 ? 20 + Math.floor(Math.random() * 25) : 190 + Math.floor(Math.random() * 40)
      })
    }
    meteorParticles.value = particles
  }

  const updateMeteorParticles = () => {
    const particles = meteorParticles.value
    let w = 0
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!
      p.life--
      if (p.life <= 0) continue
      // Only move once the delay has elapsed (life <= maxLife)
      if (p.life <= p.maxLife) {
        p.x += p.vx
        p.y += p.vy
        const dist = Math.sqrt(p.x * p.x + p.y * p.y)
        if (dist > 0.1) {
          p.vx += (p.x / dist) * 0.02
          p.vy += (p.y / dist) * 0.02
        }
      }
      particles[w++] = p
    }
    // Reassign .value to trigger Vue reactivity (in-place .length mutation
    // on a ref'd array may not notify watchers)
    meteorParticles.value = particles.slice(0, w)
  }

  // ─── Player Interaction ──────────────────────────────────────────────────

  const beginDrag = (gameX: number, gameY: number) => {
    if (phase.value !== 'player_turn') return

    // Find nearest living player blade to the tap
    let closest: SpinnerState | null = null
    let closestDist = Infinity

    for (const blade of livingBlades(playerBlades.value)) {
      const dx = gameX - blade.x
      const dy = gameY - blade.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < blade.radius * 3 && dist < closestDist) {
        closest = blade
        closestDist = dist
      }
    }

    if (!closest) return

    selectedBladeId.value = closest.id
    isDragging.value = true
    dragStart.value = { x: gameX, y: gameY }
    dragCurrent.value = { x: gameX, y: gameY }
  }

  const updateDrag = (gameX: number, gameY: number) => {
    if (!isDragging.value) return
    dragCurrent.value = { x: gameX, y: gameY }

    // Track last valid drag direction for out-of-viewport release
    const dx = dragCurrent.value.x - dragStart.value.x
    const dy = dragCurrent.value.y - dragStart.value.y
    const mag = Math.sqrt(dx * dx + dy * dy)
    if (mag > 3) {
      lastDragNx = -dx / mag
      lastDragNy = -dy / mag
    }
  }

  const cancelDrag = () => {
    isDragging.value = false
    lastDragNx = 0
    lastDragNy = 0
  }

  const releaseDrag = () => {
    if (!isDragging.value || !selectedBlade.value) return

    // Cancel zone: if pointer is back within the blade's radius, cancel the pull
    const blade = selectedBlade.value
    const pointerDx = dragCurrent.value.x - blade.x
    const pointerDy = dragCurrent.value.y - blade.y
    const pointerDist = Math.sqrt(pointerDx * pointerDx + pointerDy * pointerDy)
    if (pointerDist < blade.radius) {
      cancelDrag()
      return
    }

    const { dx, dy } = dragVector.value
    const mag = Math.sqrt(dx * dx + dy * dy)

    if (mag < 5) {
      cancelDrag()
      return
    }

    const stats = statsFor(blade)

    // Compute target velocity (blade will accelerate toward this).
    // Wall-proximity boost: shorter pull achieves full force near edges.
    const ratio = Math.min(mag * wallProximityMultiplier() / MAX_PULL_DISTANCE, 1)
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
    const targetForce = ratio * maxForce

    const nx = -dx / mag
    const ny = -dy / mag

    // Acceleration ramp: blade starts at 0 velocity, gains speed over ACCEL_FRAMES
    blade.vx = 0
    blade.vy = 0
    blade.ax = (nx * targetForce) / ACCEL_FRAMES
    blade.ay = (ny * targetForce) / ACCEL_FRAMES
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0

    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    isDragging.value = false
    phase.value = 'player_launched'
    if (pvpMode.value) onLocalLaunch?.(playerBlades.value.indexOf(blade), blade.ax, blade.ay)
  }

  /** Pointer left the viewport while dragging — launch at max force in last direction */
  const forceReleaseDragAtMax = () => {
    if (!isDragging.value || !selectedBlade.value) return

    // Need a valid direction from prior drag movement
    if (lastDragNx === 0 && lastDragNy === 0) {
      isDragging.value = false
      return
    }

    const blade = selectedBlade.value
    const stats = statsFor(blade)
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier

    blade.vx = 0
    blade.vy = 0
    blade.ax = (lastDragNx * maxForce) / ACCEL_FRAMES
    blade.ay = (lastDragNy * maxForce) / ACCEL_FRAMES
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0

    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    isDragging.value = false
    phase.value = 'player_launched'
    if (pvpMode.value) onLocalLaunch?.(playerBlades.value.indexOf(blade), blade.ax, blade.ay)
  }

  // ── Virtual Joystick Interaction ─────────────────────────────────────────

  const beginJoystickDrag = (gameX: number, gameY: number) => {
    if (!isJoystickVisible.value || phase.value !== 'player_turn') return false
    const jc = joystickCenter.value
    const dx = gameX - jc.x
    const dy = gameY - jc.y
    if (Math.sqrt(dx * dx + dy * dy) > JOYSTICK_RADIUS + 4) return false
    isJoystickDragging.value = true
    joystickKnob.value = { x: gameX, y: gameY }
    return true
  }

  const updateJoystickDrag = (gameX: number, gameY: number) => {
    if (!isJoystickDragging.value) return
    const jc = joystickCenter.value
    const dx = gameX - jc.x
    const dy = gameY - jc.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Clamp knob to joystick radius
    if (dist <= JOYSTICK_RADIUS) {
      joystickKnob.value = { x: gameX, y: gameY }
    } else {
      joystickKnob.value = {
        x: jc.x + (dx / dist) * JOYSTICK_RADIUS,
        y: jc.y + (dy / dist) * JOYSTICK_RADIUS
      }
    }
  }

  const releaseJoystickDrag = () => {
    if (!isJoystickDragging.value || !selectedBlade.value) {
      isJoystickDragging.value = false
      return
    }
    const { dx, dy } = joystickVector.value
    const mag = Math.sqrt(dx * dx + dy * dy)
    // Cancel zone: knob returned near center
    if (mag < JOYSTICK_CANCEL_RADIUS) {
      isJoystickDragging.value = false
      return
    }

    const blade = selectedBlade.value
    const stats = statsFor(blade)
    const ratio = Math.min(mag / JOYSTICK_MAX_PULL, 1)
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
    const targetForce = ratio * maxForce

    // Slingshot: launch opposite to pull direction (same as blade drag)
    const nx = -dx / mag
    const ny = -dy / mag

    blade.vx = 0
    blade.vy = 0
    blade.ax = (nx * targetForce) / ACCEL_FRAMES
    blade.ay = (ny * targetForce) / ACCEL_FRAMES
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0

    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    isJoystickDragging.value = false
    phase.value = 'player_launched'
    if (pvpMode.value) onLocalLaunch?.(playerBlades.value.indexOf(blade), blade.ax, blade.ay)
  }

  // ─── PvP Remote Launch ────────────────────────────────────────────────────

  /** Execute a launch received from the remote PvP opponent.
   *  The remote player's blades are in npcBlades on this client.
   *  `bladeIndex` is the index within the remote player's team.
   *  `ax`/`ay` are the per-frame acceleration values. */
  const executeRemoteLaunch = (bladeIndex: number, ax: number, ay: number) => {
    const blade = npcBlades.value[bladeIndex]
    if (!blade || blade.hp <= 0) return

    // Mirror the acceleration: the remote player's blades sit at the
    // bottom on their screen but at the top on ours. Only the Y axis is
    // flipped; X stays the same so left/right is consistent.
    blade.vx = 0
    blade.vy = 0
    blade.ax = ax
    blade.ay = -ay
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0

    npcActiveBladeId.value = blade.id
    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    phase.value = 'npc_launched'
  }

  const launchRemoteBlade = (bladeIndex: number, ax: number, ay: number) => {
    if (phase.value === 'npc_turn') {
      executeRemoteLaunch(bladeIndex, ax, ay)
    } else {
      // Buffer the launch — it arrived before we transitioned to npc_turn
      // (e.g. our blade is still rolling). It will be replayed as soon as
      // npc_turn is entered.
      pendingRemoteLaunch = { bladeIndex, ax, ay }
    }
  }

  // ─── NPC AI ──────────────────────────────────────────────────────────────

  const passToPlayer = () => {
    phase.value = 'player_turn'
    launchedBladeId.value = null
    npcActiveBladeId.value = null
    const first = livingBlades(playerBlades.value)[0]
    if (first) selectedBladeId.value = first.id
  }

  const launchNpc = () => {
    const living = livingBlades(npcBlades.value)
    if (living.length === 0) {
      passToPlayer()
      return
    }

    // Pick a random living NPC blade
    const blade = living[Math.floor(Math.random() * living.length)]!
    npcActiveBladeId.value = blade.id

    // Pick a random living player target
    const targets = livingBlades(playerBlades.value)
    if (targets.length === 0) return
    const target = targets[Math.floor(Math.random() * targets.length)]!

    const dx = target.x - blade.x
    const dy = target.y - blade.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 0.01) {
      // Overlapping — aim in a random direction instead
      const randAngle = Math.random() * Math.PI * 2
      const stats = statsFor(blade)
      const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
      blade.vx = 0
      blade.vy = 0
      blade.ax = (Math.cos(randAngle) * maxForce * 0.5) / ACCEL_FRAMES
      blade.ay = (Math.sin(randAngle) * maxForce * 0.5) / ACCEL_FRAMES
      blade.accelFramesLeft = ACCEL_FRAMES
      blade.wallBounceCount = 0
      launchedBladeId.value = blade.id
      if (blade.ghostPending) spawnGhostTwin(blade)
      phase.value = 'npc_launched'
      return
    }

    // Aim toward target, avoiding friendly blades in the path
    let angle = Math.atan2(dy, dx)

    // Check if any living teammate (other than the launcher) is in the firing lane
    const allies = livingBlades(npcBlades.value).filter(b => b.id !== blade.id)
    const isPathBlocked = (a: number) => {
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      for (const ally of allies) {
        const ax = ally.x - blade.x
        const ay = ally.y - blade.y
        // Project ally position onto the launch direction
        const proj = ax * cos + ay * sin
        if (proj < 0) continue // ally is behind the launcher
        // Perpendicular distance from ally to the launch line
        const perp = Math.abs(-ax * sin + ay * cos)
        if (perp < BLADE_RADIUS * 3) return true
      }
      return false
    }

    // If the direct path is blocked, try offset angles to find a clear shot
    if (isPathBlocked(angle)) {
      let found = false
      for (let offset = 0.15; offset <= Math.PI * 0.6; offset += 0.15) {
        if (!isPathBlocked(angle + offset)) {
          angle += offset
          found = true
          break
        }
        if (!isPathBlocked(angle - offset)) {
          angle -= offset
          found = true
          break
        }
      }
      // If no clear path, just add the normal spread and hope for the best
      if (!found) angle += (Math.random() - 0.5) * (Math.PI / 6)
    } else {
      // Normal ±15° spread when path is clear
      angle += (Math.random() - 0.5) * (Math.PI / 6)
    }

    // Random force 65-100% of max
    const stats = statsFor(blade)
    const forcePct = 0.65 + Math.random() * 0.35
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
    const targetForce = forcePct * maxForce

    // Acceleration ramp (same as player)
    blade.vx = 0
    blade.vy = 0
    blade.ax = (Math.cos(angle) * targetForce) / ACCEL_FRAMES
    blade.ay = (Math.sin(angle) * targetForce) / ACCEL_FRAMES
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0

    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    phase.value = 'npc_launched'
  }

  // ─── Physics ─────────────────────────────────────────────────────────────

  const updatePhysics = () => {
    // Flush per-frame statsFor cache
    _statsCache.clear()

    if (pvpMode.value) pvpTickCount++
    // Meteor shower phase
    if (phase.value === 'meteor_intro') {
      updateMeteorParticles()
      meteorIntroTimer += 16
      if (meteorIntroTimer >= 1600) {
        phase.value = 'deciding_turn'
        // Bias the starting turn based on the previous match outcome:
        // - After a loss (or losing streak), give the player an 80% chance to start
        //   so they have a better shot at recovering.
        // - After a win or before any match has been played, the enemy starts 70% of
        //   the time so wins feel earned rather than handed out.
        const playerStartChance = lastGameResult.value === 'lose' ? 0.80 : 0.30
        const startsWithPlayer = matchRng() < playerStartChance
        turnAnnouncement.value = startsWithPlayer ? 'YOUR TURN' : 'NPC TURN'
        setTimeout(() => {
          phase.value = startsWithPlayer ? 'player_turn' : 'npc_turn'
          turnAnnouncement.value = ''
          // Auto-select first living player blade
          const first = livingBlades(playerBlades.value)[0]
          if (first) selectedBladeId.value = first.id
        }, 500)
      }
      return
    }

    // Update meteor particles even during gameplay (they fade out)
    if (meteorParticles.value.length > 0) {
      updateMeteorParticles()
    }

    const all = allBlades.value

    // ─── Physics substeps (accel + move + decay + collision) ───────────────
    // At simSpeed=2 we run the full physics block twice per tick: blades
    // launch, travel, AND brake twice as fast in real time. Per-collision
    // damage stays 1x per pair per tick because `resolveCollision` checks
    // the `contactArmed` real-time gate (CONTACT_REARM_MS) — both substeps
    // happen within the same `gameTime()` reading, so substep 2 sees the
    // pair as "still in contact" and skips the damage roll. VFX timers
    // (hitFlash, sparks, damage numbers) and updatePowerups stay 1x
    // (handled outside this loop).
    const subSteps = simSpeed.value
    for (let s = 0; s < subSteps; s++) {
      for (const blade of all) {
        if (blade.hp <= 0) continue

        // Apply acceleration ramp
        if (blade.accelFramesLeft > 0) {
          blade.vx += blade.ax
          blade.vy += blade.ay
          blade.accelFramesLeft--
          if (blade.accelFramesLeft === 0) {
            blade.ax = 0
            blade.ay = 0
            blade.lastHitTime = gameTime()
          }
        }

        // Move
        blade.x += blade.vx
        blade.y += blade.vy

        // Decelerate (only after ramp is done)
        if (blade.accelFramesLeft === 0) {
          const stats = statsFor(blade)
          let decay = stats.forceDecay
          // Ice arena: significantly reduced friction (blades slide more)
          if (arenaType.value === 'ice') {
            decay = 1 - (1 - decay) * 0.35
          }
          // Below 25% max speed, gradually increase deceleration to reduce idle time
          const maxSpd = BASE_MAX_FORCE * stats.speedMultiplier
          const spdRatio = speed(blade) / maxSpd
          if (spdRatio < 0.25) {
            // Lerp decay toward a much stronger brake as speed approaches 0
            const t = 1 - spdRatio / 0.25 // 0 at 25%, 1 at 0%
            decay = decay * (1 - t) + 0.95 * t
          }

          // Exponential slowdown the longer a blade travels without hitting another blade
          if (blade.lastHitTime > 0) {
            const elapsed = gameTime() - blade.lastHitTime
            // After ~1s no-hit, start applying extra drag that ramps up exponentially
            const NO_HIT_GRACE_MS = 1000
            if (elapsed > NO_HIT_GRACE_MS) {
              const overTime = (elapsed - NO_HIT_GRACE_MS) / 1000 // seconds past grace
              // Extra decay: 0.99^(overTime^1.5) — ramps gently then aggressively
              const extraDecay = Math.pow(0.99, Math.pow(overTime, 1.5))
              decay *= extraDecay
            }
          }

          blade.vx *= decay
          blade.vy *= decay
        }

        // Clamp to stop
        const spd = speed(blade)
        if (spd < STOP_THRESHOLD && blade.accelFramesLeft === 0) {
          blade.vx = 0
          blade.vy = 0
        }

        // Spin proportional to speed, scaled by HP (100% at full → 40% at 5% HP)
        const hpPct = Math.max(0.05, blade.hp / blade.maxHp)
        const hpSpinScale = 0.4 + 0.6 * hpPct
        const comboRotMul = arenaType.value === 'thunder'
          ? 1 + (comboState.get(blade.id)?.stacks ?? 0) * 0.2
          : 1
        blade.rotation += (blade.rotationSpeed + spd * 0.02) * hpSpinScale * comboRotMul

        // Wall collision with BOOST
        bounceOffWalls(blade)
        // Pinball-bouncer ricochet (no-op on stages without bouncers)
        bounceOffBouncers(blade)
      }

      // All-pairs collision (including friendly fire!)
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (all[i]!.hp <= 0 || all[j]!.hp <= 0) continue
          resolveCollision(all[i]!, all[j]!)
        }
      }
    }

    // Hit flash decay — VFX timer, ticks once per real frame regardless of
    // simSpeed so flashes don't double-blink at 2x.
    for (const blade of all) {
      if (blade.hp <= 0) continue
      if (blade.hitFlash > 0) blade.hitFlash--
    }

    // Decay bouncer flash intensity back toward 0 so the hit glow fades
    // out over ~10 frames.
    if (arenaBouncers.length > 0) {
      for (const b of arenaBouncers) {
        if (b.flash > 0) b.flash = Math.max(0, b.flash - 0.1)
      }
    }

    // Record trail points
    const trailNow = performance.now()
    updateTrails(all, trailNow)
    updateSpecialSkinVFX(all, trailNow)

    // Thunder boss aura: 1 damage/sec to nearby enemy blades within bolt radius
    const THUNDER_RADIUS_MUL = 1.8 // matches visual bolt reach
    const THUNDER_COOLDOWN_MS = 1000
    const THUNDER_DAMAGE = 1
    const nowThunder = gameTime()
    for (const src of all) {
      if (!src.isThunder || src.hp <= 0) continue
      if (!src.thunderLastHit) src.thunderLastHit = new Map()
      const hitRadius = src.radius * THUNDER_RADIUS_MUL
      for (const target of all) {
        if (target === src || target.hp <= 0) continue
        const dx = target.x - src.x
        const dy = target.y - src.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > hitRadius + target.radius) continue
        const lastHit = src.thunderLastHit.get(target.id) ?? -Infinity
        if (nowThunder - lastHit < THUNDER_COOLDOWN_MS) continue
        src.thunderLastHit.set(target.id, nowThunder)
        target.hp = Math.max(0, target.hp - THUNDER_DAMAGE)
        // Yellow floating damage number
        const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
        const hs = 0.06 + Math.random() * 0.03
        damageNumbers.push({
          x: target.x, y: target.y, value: THUNDER_DAMAGE,
          vx: Math.cos(ha) * hs, vy: Math.sin(ha) * hs,
          color: '#ffee44', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
        })
      }
    }

    // Powerup spawn timer + lifecycle + collision (no-op when the stage
    // gate or test scene hasn't enabled the system).
    updatePowerups(16)

    // Update spark animations (remove finished ones)
    for (let i = activeSparks.length - 1; i >= 0; i--) {
      if (updateSpritesheetAnim(activeSparks[i]!, 16)) {
        activeSparks.splice(i, 1)
      }
    }

    // Update death explosions (remove finished ones)
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
      if (updateSpritesheetAnim(activeExplosions[i]!, 16)) {
        activeExplosions.splice(i, 1)
      }
    }

    // Update shock-wall lightning bolts
    for (let i = activeShockBolts.length - 1; i >= 0; i--) {
      activeShockBolts[i]!.life -= 16
      if (activeShockBolts[i]!.life <= 0) activeShockBolts.splice(i, 1)
    }

    // Update floating damage numbers + powerup pickup indicators
    updateDamageNumbers(16)
    updatePowerupFloats(16)

    // Game over: all models of one side dead
    const playerAlive = livingBlades(playerBlades.value).length
    const npcAlive = livingBlades(npcBlades.value).length

    if ((playerAlive === 0 || npcAlive === 0) && !gameResult.value) {
      gameResult.value = npcAlive === 0 ? 'win' : 'lose'
      saveLastGameResult(gameResult.value)
      gameOverAt = performance.now()
    }

    // Game-over: kill any in-flight VFX (shock bolts especially loop long
    // enough to bleed into the reward screen and the next match) and
    // transition immediately rather than waiting for animations to drain.
    if (gameResult.value) {
      if (gameOverAt !== null) {
        clearBattleVfx()
        damageNumbers.length = 0
        phase.value = 'game_over'
        stopPhysics()
        gameOverAt = null
      }
      return
    }

    // Turn transitions — launched blade must come to rest (or be dead)
    const launched = all.find(b => b.id === launchedBladeId.value)
    const launchedStopped = !launched
      || launched.hp <= 0
      || (speed(launched) < STOP_THRESHOLD && launched.accelFramesLeft === 0)

    if (phase.value === 'player_launched' && launchedStopped) {
      phase.value = 'npc_turn'
      npcThinkingElapsed = 0
      launchedBladeId.value = null
      comboState.clear()
      // Stat-switch boss: switch to attack phase on NPC turn
      for (const b of npcBlades.value) {
        if (b.statSwitchPhase) b.statSwitchPhase = 'attack'
      }
      // PvP state-check: send hash after our launch resolved
      if (pvpMode.value) {
        pvpTurnCounter++
        const hash = computeStateHash()
        onStateHash?.(hash, pvpTurnCounter)
      }
      // Replay buffered remote launch that arrived while our blade was still rolling
      if (pvpMode.value && pendingRemoteLaunch) {
        const p = pendingRemoteLaunch
        pendingRemoteLaunch = null
        executeRemoteLaunch(p.bladeIndex, p.ax, p.ay)
      }
    }

    if (phase.value === 'npc_launched' && launchedStopped) {
      phase.value = 'player_turn'
      launchedBladeId.value = null
      comboState.clear()
      npcActiveBladeId.value = null
      // Stat-switch boss: switch to defense phase on player turn
      for (const b of npcBlades.value) {
        if (b.statSwitchPhase) b.statSwitchPhase = 'defense'
      }
      // PvP state-check: send hash after opponent's launch resolved
      if (pvpMode.value) {
        pvpTurnCounter++
        const hash = computeStateHash()
        onStateHash?.(hash, pvpTurnCounter)
      }
      // Auto-select first living player blade
      const first = livingBlades(playerBlades.value)[0]
      if (first) selectedBladeId.value = first.id
    }

    // NPC thinking — in PvP mode the remote player controls the NPC blades,
    // so we skip the AI entirely and wait for launchRemoteBlade() calls.
    if (phase.value === 'npc_turn' && !pvpMode.value) {
      npcThinkingElapsed += 16
      if (npcThinkingElapsed >= NPC_THINK_MS) {
        launchNpc()
      }
    }
  }

  const bounceOffWalls = (blade: SpinnerState) => {
    const dist = Math.sqrt(blade.x * blade.x + blade.y * blade.y)
    const maxDist = ARENA_RADIUS - blade.radius

    if (dist <= maxDist) return
    if (dist < 0.01) return // avoid division by zero at exact center

    // Teleporter: pass through wall → emerge on opposite side
    if (blade.isTeleporter) {
      blade.x = -blade.x * (maxDist - 2) / dist
      blade.y = -blade.y * (maxDist - 2) / dist
      // Keep velocity — blade continues in the same direction
      return
    }

    // Outward normal at contact point
    const nx = blade.x / dist
    const ny = blade.y / dist

    // Push blade inside the arena by a small margin so it doesn't
    // re-trigger the wall bounce on the very next frame ("wall hug").
    const pushInside = 0.5
    const clampDist = maxDist - pushInside
    blade.x = nx * clampDist
    blade.y = ny * clampDist

    // Only reflect if the blade is moving INTO the wall (dot > 0,
    // since the normal points outward). Blades already heading inward
    // (e.g. after a previous reflection) should not get re-reflected.
    const dot = blade.vx * nx + blade.vy * ny
    if (dot <= 0) return

    // Speed-based boost: faster models bounce harder
    const currentSpeed = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
    const stats = statsFor(blade)
    const maxSpeed = BASE_MAX_FORCE * stats.speedMultiplier
    const speedRatio = Math.min(currentSpeed / maxSpeed, 1)

    // Decay: reduce wall boost by 12% per bounce after the first, min 30% effectiveness
    const decayBounces = Math.max(0, blade.wallBounceCount)
    const effectiveness = Math.max(
      WALL_BOUNCE_MIN_EFFECTIVENESS,
      1 - decayBounces * WALL_BOUNCE_DECAY_PER_HIT
    )
    const effectiveBoost = 1 + (WALL_BOOST_FACTOR - 1) * effectiveness * speedRatio

    blade.vx = (blade.vx - 2 * dot * nx) * effectiveBoost
    blade.vy = (blade.vy - 2 * dot * ny) * effectiveBoost
    blade.wallBounceCount++

    // Reflect the remaining acceleration so the launch ramp doesn't
    // push the blade back into the wall it just bounced off of.
    if (blade.accelFramesLeft > 0) {
      const aDot = blade.ax * nx + blade.ay * ny
      if (aDot > 0) {
        blade.ax -= 2 * aDot * nx
        blade.ay -= 2 * aDot * ny
      }
    }

    // Arena-specific wall effects
    if (arenaType.value === 'lava') {
      const lavaDmg = Math.ceil(blade.maxHp * 0.025)
      blade.hp = Math.max(0, blade.hp - lavaDmg)
      blade.hitFlash = HIT_FLASH_FRAMES
      const lavaAngle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
      const lavaSpd = 0.06 + Math.random() * 0.03
      damageNumbers.push({
        x: blade.x, y: blade.y,
        value: lavaDmg, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
        vx: Math.cos(lavaAngle) * lavaSpd, vy: Math.sin(lavaAngle) * lavaSpd,
        color: blade.owner === 'player' ? '#ff6666' : '#66aaff',
        isCrit: false
      })
    } else if (arenaType.value === 'forest') {
      const healed = Math.round(Math.min(1, blade.maxHp - blade.hp))
      blade.hp = Math.min(blade.maxHp, blade.hp + 1)
      if (healed > 0) {
        const healAngle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
        const healSpd = 0.06 + Math.random() * 0.03
        damageNumbers.push({
          x: blade.x, y: blade.y,
          value: healed, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
          vx: Math.cos(healAngle) * healSpd, vy: Math.sin(healAngle) * healSpd,
          color: '#44cc66', isCrit: false
        })
      }
    } else if (arenaType.value === 'shock') {
      // Shock arena: remove 90% of blade speed on wall contact.
      // 250ms per-blade cooldown prevents zap spam (and the lag it caused)
      // when a blade grinds along the wall over multiple frames.
      const now = performance.now()
      if (now - (blade.lastShockMs ?? 0) >= 250) {
        blade.lastShockMs = now
        blade.vx *= 0.1
        blade.vy *= 0.1
        blade.hitFlash = HIT_FLASH_FRAMES
        spawnShockBolt(nx * ARENA_RADIUS, ny * ARENA_RADIUS, blade.x, blade.y)
      }
    }
  }

  /**
   * Pinball-style obstacles. Each bouncer is a static disc: if a blade
   * overlaps it, push the blade out along the contact normal and reflect
   * its velocity the same way the arena wall does (with the same
   * speed-based boost) so ramming one feels like ricocheting off the rim.
   * Unlike the wall, bouncer hits do NOT count toward `wallBounceCount`,
   * so they don't erode the wall-boost decay budget.
   */
  const bounceOffBouncers = (blade: SpinnerState) => {
    if (arenaBouncers.length === 0) return
    if (blade.isTeleporter) return // teleporters pass through bouncers
    for (const bouncer of arenaBouncers) {
      const dx = blade.x - bouncer.x
      const dy = blade.y - bouncer.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = blade.radius + bouncer.radius
      if (dist >= minDist || dist < 0.01) continue

      // Push the blade out along the contact normal so it no longer overlaps.
      const nx = dx / dist
      const ny = dy / dist
      const overlap = minDist - dist
      blade.x += nx * overlap
      blade.y += ny * overlap

      const dot = blade.vx * nx + blade.vy * ny
      // Only reflect if the blade is moving INTO the bouncer (dot < 0).
      // Blades already moving away (e.g. just nudged out by the separation
      // step) shouldn't get an extra kick.
      if (dot >= 0) continue

      const stats = statsFor(blade)
      const currentSpeed = Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)
      const maxSpeed = BASE_MAX_FORCE * stats.speedMultiplier
      const speedRatio = Math.min(currentSpeed / maxSpeed, 1)
      const effectiveBoost = 1 + (WALL_BOOST_FACTOR - 1) * speedRatio

      blade.vx = (blade.vx - 2 * dot * nx) * effectiveBoost
      blade.vy = (blade.vy - 2 * dot * ny) * effectiveBoost

      bouncer.flash = 1
      triggerShake('small')

      // Shock arena bouncers also drain 90% speed on impact (same 250ms
      // per-blade cooldown as the wall to avoid zap spam during overlap).
      if (arenaType.value === 'shock') {
        const now = performance.now()
        if (now - (blade.lastShockMs ?? 0) >= 250) {
          blade.lastShockMs = now
          blade.vx *= 0.1
          blade.vy *= 0.1
          blade.hitFlash = HIT_FLASH_FRAMES
          spawnShockBolt(bouncer.x + nx * bouncer.radius, bouncer.y + ny * bouncer.radius, blade.x, blade.y)
        }
      }
    }
  }

  const resolveCollision = (a: SpinnerState, b: SpinnerState) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = a.radius + b.radius

    if (dist >= minDist || dist < 0.01) return

    // Invulnerable split-children phase through everything — no physics,
    // no damage — until they settle. Their blinking renders elsewhere.
    if (isInvulnerable(a) || isInvulnerable(b)) return

    // Split siblings collide with each other physically and deal a reduced
    // 25% friendly-fire damage — they share a groupId but should still
    // bounce + chip each other when they swarm. Detect that case here so
    // the normal collision/damage path runs (with the multiplier applied
    // further down) instead of the ally early-return below.
    const friendlyFire = !!(
      a.groupId !== undefined && a.groupId === b.groupId
      && a.isSplitChild && b.isSplitChild
    )
    const FRIENDLY_FIRE_MUL = 0.25

    // Same-group (partner / healer / ghost-twin / split-sibling) contact —
    // no damage. Partner/healer allies still physically bounce + separate
    // so they don't stack on top of each other, while ghost twins keep
    // phasing through one another. Split siblings are handled via the
    // friendlyFire path above and skip this early-return entirely.
    if (!friendlyFire && a.groupId !== undefined && a.groupId === b.groupId) {
      const now_ally = gameTime()
      const bounceAllies = !!(a.bouncesAllies && b.bouncesAllies)
      if (a.healsAllies || b.healsAllies) {
        const key = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`
        const last = healerHealCooldowns.get(key) ?? 0
        if (now_ally - last >= HEALER_HEAL_COOLDOWN_MS) {
          const healA = Math.round(Math.min(HEALER_CONTACT_HEAL, a.maxHp - a.hp))
          const healB = Math.round(Math.min(HEALER_CONTACT_HEAL, b.maxHp - b.hp))
          if (healA > 0) {
            a.hp += healA
            damageNumbers.push({
              x: a.x, y: a.y,
              value: healA, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
              vx: 0, vy: -0.08,
              color: '#44ff88', isCrit: false
            })
          }
          if (healB > 0) {
            b.hp += healB
            damageNumbers.push({
              x: b.x, y: b.y,
              value: healB, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
              vx: 0, vy: -0.08,
              color: '#44ff88', isCrit: false
            })
          }
          healerHealCooldowns.set(key, now_ally)
        }
      }
      if (bounceAllies) {
        // Elastic bounce + positional separation, no damage applied.
        const nx = dx / dist
        const ny = dy / dist
        const aDot = a.vx * nx + a.vy * ny
        const bDot = b.vx * nx + b.vy * ny
        a.vx = (a.vx - aDot * nx + bDot * nx) * BOUNCE_DAMPENING
        a.vy = (a.vy - aDot * ny + bDot * ny) * BOUNCE_DAMPENING
        b.vx = (b.vx - bDot * nx + aDot * nx) * BOUNCE_DAMPENING
        b.vy = (b.vy - bDot * ny + aDot * ny) * BOUNCE_DAMPENING
        const overlap = minDist - dist
        a.x -= (overlap / 2) * nx
        a.y -= (overlap / 2) * ny
        b.x += (overlap / 2) * nx
        b.y += (overlap / 2) * ny
      }
      // Skip all further resolution — no damage between allies. Ghost twins
      // and split siblings (bouncesAllies=false) continue to phase through.
      return
    }

    // Reset no-hit timer on collision
    const now_hit = gameTime()
    a.lastHitTime = now_hit
    b.lastHitTime = now_hit

    // ── One-hit-per-contact-period gate (Option C) ───────────────────────
    // If this pair was already in contact on a recent tick, skip the damage
    // branch entirely — they have to actually separate for CONTACT_REARM_MS
    // before the next impact can deal damage again. Bounce + separation
    // still runs unconditionally so the physics keeps looking right.
    const contactKey = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`
    const lastContactTs = contactTimes.get(contactKey) ?? 0
    const contactArmed = now_hit - lastContactTs > CONTACT_REARM_MS
    contactTimes.set(contactKey, now_hit)

    // ── Hug-break: force-separate pairs that can't break apart on their own.
    // When a fresh contact begins, start the hug timer. While the pair stays
    // in contact the timer keeps running; once they've been hugging longer
    // than HUG_BREAK_MS, slam a strong counter-impulse along the contact
    // normal so they actually fly apart, then reset the timer. Without this
    // a pair that settles into low-speed grinding keeps re-triggering clash
    // SFX + spark VFX + damage ticks every few frames and tanks the FPS.
    if (contactArmed) {
      hugStartTimes.set(contactKey, now_hit)
    } else {
      const hugStart = hugStartTimes.get(contactKey) ?? now_hit
      if (now_hit - hugStart >= HUG_BREAK_MS) {
        const hnx = dx / dist
        const hny = dy / dist
        a.vx -= hnx * HUG_SEPARATION_IMPULSE
        a.vy -= hny * HUG_SEPARATION_IMPULSE
        b.vx += hnx * HUG_SEPARATION_IMPULSE
        b.vy += hny * HUG_SEPARATION_IMPULSE
        hugStartTimes.set(contactKey, now_hit)
      }
    }

    // Camera shake only on the first frame of a contact period — otherwise
    // hugging an opponent produces continuous screen jitter.
    if (contactArmed) triggerShake('small')

    const nx = dx / dist
    const ny = dy / dist

    const aSpeed = speed(a)
    const bSpeed = speed(b)

    // Elastic bounce FIRST — must happen before damage so killing blows still bounce
    const aDot = a.vx * nx + a.vy * ny
    const bDot = b.vx * nx + b.vy * ny

    // ── Closing speed along the contact normal (Option A) ────────────────
    // `aDot` is A's velocity projected along +n (n points A→B, so positive
    // = toward B). `bDot` is B's velocity along the same axis. The pair is
    // *closing* when aDot > bDot: A is moving toward B faster than B is
    // getting out of the way. A blade chasing another at the same heading
    // has aDot ≈ bDot → closingSpeed ≈ 0 → near-zero damage, which is the
    // intended fix for the "hug and grind" exploit. Head-on impacts stay
    // at full value because the two velocities add along the normal.
    const closingSpeed = Math.max(0, aDot - bDot)

    a.vx = (a.vx - aDot * nx + bDot * nx) * BOUNCE_DAMPENING
    a.vy = (a.vy - aDot * ny + bDot * ny) * BOUNCE_DAMPENING
    b.vx = (b.vx - bDot * nx + aDot * nx) * BOUNCE_DAMPENING
    b.vy = (b.vy - bDot * ny + aDot * ny) * BOUNCE_DAMPENING

    // Separate overlapping models
    const overlap = minDist - dist
    a.x -= (overlap / 2) * nx
    a.y -= (overlap / 2) * ny
    b.x += (overlap / 2) * nx
    b.y += (overlap / 2) * ny

    // Damage based on the pre-bounce closing speed along the contact normal.
    const aStats = statsFor(a)
    const bStats = statsFor(b)

    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2

    // Back-side crit detection: 90° cone behind travel direction when moving >= 25% max speed
    const CRIT_CONE_HALF = Math.PI / 4 // 45° half-angle = 90° cone
    const aMaxSpd = BASE_MAX_FORCE * aStats.speedMultiplier
    const bMaxSpd = BASE_MAX_FORCE * bStats.speedMultiplier

    // Check if attacker a hits b in b's back.
    // n points a→b, so on b's surface the contact point is at b.center + bRadius·(-n).
    // A "rear hit" means that contact lies on b's REAR half (opposite b's forward).
    // Geometrically: (-n) · (-bForward) >= cos(45°)  ⇔  bForward · n >= cos(45°).
    // Intuitively: b is moving AWAY from a along n, so a is catching b from behind.
    const bMovingFast = bSpeed >= bMaxSpd * 0.25
    let bHitInBack = false
    if (bMovingFast) {
      const bDirX = b.vx / bSpeed
      const bDirY = b.vy / bSpeed
      const cosAngle = bDirX * nx + bDirY * ny
      bHitInBack = cosAngle >= Math.cos(CRIT_CONE_HALF)
    }

    // Check if attacker b hits a in a's back.
    // Contact on a is at a.center + aRadius·n. For it to be on a's rear:
    //  n · (-aForward) >= cos(45°)  ⇔  aForward · n <= -cos(45°).
    // Intuitively: a is moving AWAY from b along -n, so b is catching a from behind.
    const aMovingFast = aSpeed >= aMaxSpd * 0.25
    let aHitInBack = false
    if (aMovingFast) {
      const aDirX = a.vx / aSpeed
      const aDirY = a.vy / aSpeed
      const cosAngle = aDirX * nx + aDirY * ny
      aHitInBack = cosAngle <= -Math.cos(CRIT_CONE_HALF)
    }

    let hadCrit = false
    let hadKill = false

    // Speed advantage: reduce counter damage by 25% if attacker is 2x+ faster
    const aSpeedAdv = (bSpeed > 0 && aSpeed >= bSpeed * 2) ? 0.75 : 1
    const bSpeedAdv = (aSpeed > 0 && bSpeed >= aSpeed * 2) ? 0.75 : 1

    // Thunder arena combo tracking
    let aComboMul = 1
    let bComboMul = 1
    if (arenaType.value === 'thunder') {
      const comboAngle = (Math.random() - 0.5) * (Math.PI / 3) // 60° cone pointing right (VFX only)
      const comboSpd = 0.06 + Math.random() * 0.03
      const now = gameTime()
      // Update combo for a hitting b (only if a is moving fast enough to attack)
      if (aSpeed > STOP_THRESHOLD) {
        const aCombo = comboState.get(a.id)
        if (aCombo && aCombo.targetId === b.id && now - aCombo.lastTime <= COMBO_WINDOW_MS) {
          if (now - aCombo.lastTime >= COMBO_GRACE_MS) {
            aCombo.stacks++
            aCombo.lastTime = now
            aComboMul = 1 + aCombo.stacks * 0.1
            damageNumbers.push({
              x: cx, y: cy,
              value: 0, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
              vx: Math.cos(comboAngle) * comboSpd, vy: Math.sin(comboAngle) * comboSpd,
              color: '#ffcc22', isCrit: false,
              comboText: `${aCombo.stacks}x COMBO`
            })
          } else {
            aComboMul = 1 + aCombo.stacks * 0.1
          }
        } else {
          comboState.set(a.id, { targetId: b.id, lastTime: now, stacks: 0 })
        }
      }
      // Update combo for b hitting a (only if b is moving fast enough to attack)
      if (bSpeed > STOP_THRESHOLD) {
        const bCombo = comboState.get(b.id)
        if (bCombo && bCombo.targetId === a.id && now - bCombo.lastTime <= COMBO_WINDOW_MS) {
          if (now - bCombo.lastTime >= COMBO_GRACE_MS) {
            bCombo.stacks++
            bCombo.lastTime = now
            bComboMul = 1 + bCombo.stacks * 0.1
            damageNumbers.push({
              x: cx, y: cy,
              value: 0, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
              vx: Math.cos(comboAngle) * comboSpd, vy: Math.sin(comboAngle) * comboSpd,
              color: '#ffcc22', isCrit: false,
              comboText: `${bCombo.stacks}x COMBO`
            })
          } else {
            bComboMul = 1 + bCombo.stacks * 0.1
          }
        } else {
          comboState.set(b.id, { targetId: a.id, lastTime: now, stacks: 0 })
        }
      }
    }

    const nowCrit = gameTime()

    // Gate the entire speed-based damage block on the contact-armed check:
    // a pair that stays in contact over multiple physics ticks only gets
    // ONE damage roll per side per entry. Spiky chip damage below is
    // deliberately OUTSIDE this gate — its design intent is constant chip
    // pressure on every contact, throttled by its own per-pair cooldown.
    if (contactArmed) {
      // ── Compute both sides' damage upfront ────────────────────────
      let dmgAtoB = 0
      let dmgBtoA = 0
      let aCrit = false
      let bCrit = false

      // a attacks b
      if (aSpeed > STOP_THRESHOLD && !aHitInBack) {
        const bLastCrit = lastCritAt.get(b.id) ?? -Infinity
        const bCritReady = nowCrit - bLastCrit >= CRIT_COOLDOWN_MS
        aCrit = bHitInBack
          && aSpeed >= bSpeed * 2
          && bCritReady
        // Hidden star-top lucky crit: 8% chance when a is the faster attacker.
        if (!aCrit && a.config.topPartId === 'star' && aSpeed > bSpeed && bCritReady && Math.random() < 0.08) {
          aCrit = true
        }
        let defMul = aCrit ? 1 : bStats.defenseMultiplier
        if (a.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (a.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        const atkMul = aCrit ? 1.25 : 1
        dmgAtoB = (closingSpeed * aStats.damageMultiplier * atkMul * aStats.totalWeight)
          / (bStats.totalWeight * defMul)
          * DAMAGE_SCALE * bSpeedAdv * aComboMul
          * (friendlyFire ? FRIENDLY_FIRE_MUL : 1)
      }
      // b attacks a
      if (bSpeed > STOP_THRESHOLD && !bHitInBack) {
        const aLastCrit = lastCritAt.get(a.id) ?? -Infinity
        const aCritReady = nowCrit - aLastCrit >= CRIT_COOLDOWN_MS
        bCrit = aHitInBack
          && bSpeed >= aSpeed * 2
          && aCritReady
        // Hidden star-top lucky crit: 8% chance when b is the faster attacker.
        if (!bCrit && b.config.topPartId === 'star' && bSpeed > aSpeed && aCritReady && Math.random() < 0.08) {
          bCrit = true
        }
        let defMul = bCrit ? 1 : aStats.defenseMultiplier
        if (b.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (b.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        const atkMul = bCrit ? 1.25 : 1
        dmgBtoA = (closingSpeed * bStats.damageMultiplier * atkMul * bStats.totalWeight)
          / (aStats.totalWeight * defMul)
          * DAMAGE_SCALE * aSpeedAdv * bComboMul
          * (friendlyFire ? FRIENDLY_FIRE_MUL : 1)
      }

      // ── Anti-draw: if both would die, the stronger attacker survives ──
      const aWouldDie = dmgBtoA > 0 && a.hp - dmgBtoA <= 0
      const bWouldDie = dmgAtoB > 0 && b.hp - dmgAtoB <= 0
      if (aWouldDie && bWouldDie) {
        // Determine winner: higher damage wins; ties broken by speed, then attack
        let aWins: boolean
        if (dmgAtoB !== dmgBtoA) {
          aWins = dmgAtoB > dmgBtoA
        } else if (aSpeed !== bSpeed) {
          aWins = aSpeed > bSpeed
        } else {
          aWins = aStats.damageMultiplier >= bStats.damageMultiplier
        }
        if (aWins) {
          dmgBtoA = Math.max(0, a.hp - 1)
        } else {
          dmgAtoB = Math.max(0, b.hp - 1)
        }
      }

      // ── Apply damage a→b ──────────────────────────────────────────
      if (dmgAtoB > 0) {
        if (aCrit) {
          hadCrit = true
          lastCritAt.set(b.id, nowCrit)
        }
        if (applyBladeDamage(b, dmgAtoB, cx, cy, a.owner, aCrit)) hadKill = true
        // Life-leech: attacker heals 30% of damage dealt
        if (a.isLifeLeech) {
          const heal = dmgAtoB * 0.3
          a.hp = Math.min(a.maxHp, a.hp + heal)
          if (Math.round(heal) > 0) {
            const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
            const hs = 0.06 + Math.random() * 0.03
            damageNumbers.push({
              x: a.x, y: a.y, value: Math.round(heal),
              vx: Math.cos(ha) * hs, vy: Math.sin(ha) * hs,
              color: '#44cc66', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
            })
          }
        }
      }
      // ── Apply damage b→a ──────────────────────────────────────────
      if (dmgBtoA > 0) {
        if (bCrit) {
          hadCrit = true
          lastCritAt.set(a.id, nowCrit)
        }
        if (applyBladeDamage(a, dmgBtoA, cx, cy, b.owner, bCrit)) hadKill = true
        // Life-leech: attacker heals 30% of damage dealt
        if (b.isLifeLeech) {
          const heal = dmgBtoA * 0.3
          b.hp = Math.min(b.maxHp, b.hp + heal)
          if (Math.round(heal) > 0) {
            const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
            const hs = 0.06 + Math.random() * 0.03
            damageNumbers.push({
              x: b.x, y: b.y, value: Math.round(heal),
              vx: Math.cos(ha) * hs, vy: Math.sin(ha) * hs,
              color: '#44cc66', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
            })
          }
        }
      }
    }

    // Child-emitter: spawn a mini distraction spinner on collision
    if (contactArmed) {
      for (const emitter of [a, b]) {
        if (!emitter.isChildEmitter || emitter.hp <= 0) continue
        // Don't spawn if emitted children already exist and are still alive
        const emittedCount = allBlades.value.filter(
          bl => bl.isEmittedChild && bl.owner === emitter.owner && bl.hp > 0
        ).length
        if (emittedCount >= 3) continue // max 3 active emitted children
        const angle = Math.random() * Math.PI * 2
        const spawnDist = emitter.radius + BLADE_RADIUS * 0.5 + 2
        const child = createBladeState(
          emitter.owner,
          emitter.x + Math.cos(angle) * spawnDist,
          emitter.y + Math.sin(angle) * spawnDist,
          { ...emitter.config, bossAbility: undefined, isBoss: false },
          false
        )
        child.radius = BLADE_RADIUS * 0.45
        // Every 2nd child adds +1 HP: 1→1, 2→2, 3→2, 4→3, 5→3, 6→4 …
        emitter.emittedChildCount = (emitter.emittedChildCount ?? 0) + 1
        const bonusHp = Math.floor((emitter.emittedChildCount) / 2)
        child.maxHp = 1 + bonusHp
        child.hp = child.maxHp
        child.isEmittedChild = true
        // Own groupId so emitted children collide with the boss blade
        child.groupId = nextGroupId++
        // Small drift so it spreads out
        child.vx = Math.cos(angle) * 1.5
        child.vy = Math.sin(angle) * 1.5
        if (emitter.owner === 'npc') {
          npcBlades.value = [...npcBlades.value, child]
        } else {
          playerBlades.value = [...playerBlades.value, child]
        }
      }
    }

    // Spiky top — flat "barbs" damage on every collision pair, independent
    // of closing speed. Rewards hugging / low-speed chasing with constant
    // chip damage. Throttled per pair so the DPS stays in check. Still
    // respects back-hit direction so you can't chip someone by getting
    // rear-ended.
    {
      const spikyKey = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`
      const nowChip = gameTime()
      const lastChip = spikyChipCooldowns.get(spikyKey) ?? 0
      if (nowChip - lastChip >= SPIKY_CHIP_COOLDOWN_MS) {
        let chipped = false
        // Tank-shred chip: at least 1, up to 2.5% of the victim's max HP.
        // Scaled down to 25% on friendly-fire (split sibling) hits so the
        // swarm doesn't shred itself.
        const ffMul = friendlyFire ? FRIENDLY_FIRE_MUL : 1
        const chipFor = (victim: SpinnerState) =>
          Math.max(SPIKY_CHIP_MIN_DAMAGE, victim.maxHp * SPIKY_CHIP_HP_FRACTION) * ffMul
        if (a.config.topPartId === 'triangle' && !aHitInBack && b.hp > 0) {
          if (applyBladeDamage(b, chipFor(b), cx, cy, a.owner, false)) hadKill = true
          chipped = true
        }
        if (b.config.topPartId === 'triangle' && !bHitInBack && a.hp > 0) {
          if (applyBladeDamage(a, chipFor(a), cx, cy, b.owner, false)) hadKill = true
          chipped = true
        }
        if (chipped) spikyChipCooldowns.set(spikyKey, nowChip)
      }
    }

    // Split-boss shatter — if the hit killed a blade flagged to split,
    // spawn its mini children right where it died. Done here (not at the
    // damage site) so only a single death pass runs per collision.
    if (hadKill) {
      if (a.hp <= 0 && a.splitsOnDeath && !a.isSplitChild) {
        a.splitsOnDeath = false
        spawnSplitChildren(a)
      }
      if (b.hp <= 0 && b.splitsOnDeath && !b.isSplitChild) {
        b.splitsOnDeath = false
        spawnSplitChildren(b)
      }
    }

    if (hadKill || hadCrit) triggerShake('big')

    // Spark VFX at collision point (with cooldown per pair)
    const pairKey = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`
    const now = performance.now()
    const lastSpark = sparkCooldowns.get(pairKey) ?? 0
    if (
      now - lastSpark >= SPARK_COOLDOWN_MS
      && sparkImage.complete
      && activeSparks.length < MAX_ACTIVE_VFX
    ) {
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      activeSparks.push(createSpritesheetAnim(
        sparkImage, cx, cy,
        SPARK_TOTAL_FRAMES, SPARK_FRAME_DURATION, 256, 256, SPARK_SCALE, false
      ))
      sparkCooldowns.set(pairKey, now)
    }

    // Clash SFX (throttled per pair, capped to MAX_ACTIVE_VFX concurrent)
    const lastClash = clashSoundCooldowns.get(pairKey) ?? 0
    if (now - lastClash >= CLASH_SOUND_COOLDOWN_MS && activeClashSounds < MAX_ACTIVE_VFX) {
      const idx = Math.floor(Math.random() * 5) + 1
      try {
        const audio = playSound(`clash-${idx}`)
        if (audio) {
          activeClashSounds++
          const release = () => {
            activeClashSounds = Math.max(0, activeClashSounds - 1)
          }
          audio.addEventListener('ended', release, { once: true })
          audio.addEventListener('error', release, { once: true })
        }
      } catch { /* sound is best-effort */
      }
      clashSoundCooldowns.set(pairKey, now)
    }
  }

  // ─── Physics Loop ────────────────────────────────────────────────────────

  // Fixed-step accumulator. The simulation always advances in discrete
  // 60 Hz chunks (≈16.67 ms/tick) regardless of display refresh rate —
  // that's the only way a 144 Hz desktop and a 60 Hz phone reach the
  // same state after the same wall-clock, which is mandatory for PvP
  // and makes single-player feel identical across devices. If real time
  // per rAF exceeds one tick we consume several ticks to catch up; if
  // it falls short we skip the update and render interpolates on top.
  const FIXED_STEP_MS = 1000 / 60
  // Cap catch-up to avoid spiral-of-death when the tab was backgrounded
  // for many seconds — we'd otherwise try to simulate minutes of physics
  // in a single frame and hang the page.
  const MAX_CATCHUP_TICKS = 10
  let physicsAccumulator = 0
  let lastPhysicsTime = 0

  const startPhysics = () => {
    physicsAccumulator = 0
    lastPhysicsTime = performance.now()

    const loop = (now: number) => {
      try {
        physicsAccumulator += now - lastPhysicsTime
        lastPhysicsTime = now
        if (physicsAccumulator > FIXED_STEP_MS * MAX_CATCHUP_TICKS) {
          physicsAccumulator = FIXED_STEP_MS * MAX_CATCHUP_TICKS
        }
        while (physicsAccumulator >= FIXED_STEP_MS) {
          updatePhysics()
          physicsAccumulator -= FIXED_STEP_MS
        }
      } catch (e) {
        console.error('[physics loop]', e)
      }

      if (physicsRafId !== null) {
        physicsRafId = requestAnimationFrame(loop)
      }
    }
    physicsRafId = requestAnimationFrame(loop)
  }

  const stopPhysics = () => {
    if (physicsRafId !== null) {
      cancelAnimationFrame(physicsRafId)
      physicsRafId = null
    }
  }

  // ─── Canvas Rendering ────────────────────────────────────────────────────

  const render = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, showHintAnim = false) => {
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const fitSize = Math.min(canvasWidth, canvasHeight)
    const scale = fitSize / (ARENA_RADIUS * 2 + ARENA_PADDING)

    // Tiled background — create pattern lazily once the image is loaded
    if (!bgTilePattern && bgTileImage.complete && bgTileImage.naturalWidth > 0) {
      bgTilePattern = ctx.createPattern(bgTileImage, 'repeat')
    }
    ctx.fillStyle = bgTilePattern ?? '#0d1117'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)

    drawArenaStaticCached(ctx)
    renderArenaDynamic(ctx)
    renderBouncers(ctx)
    renderPowerups(ctx)
    renderMeteorShower(ctx)
    renderGroundDecals(ctx, performance.now())
    renderTrails(ctx)
    renderCloudParticles(ctx)
    renderSandGrains(ctx)

    // Auras (rendered under blades)
    for (const blade of allBlades.value) {
      if (blade.hp <= 0) continue
      renderAura(ctx, blade)
    }

    // Render all models
    for (const blade of allBlades.value) {
      if (blade.hp <= 0) continue
      renderBlade(ctx, blade)
    }

    // Spark VFX
    for (const spark of activeSparks) {
      renderSpritesheetAnim(ctx, spark)
    }

    // Death explosions
    for (const explosion of activeExplosions) {
      renderSpritesheetAnim(ctx, explosion)
    }

    // Shock-wall lightning bolts
    for (const bolt of activeShockBolts) {
      const t = bolt.life / bolt.maxLife
      drawLightningBolt(ctx, bolt.x0, bolt.y0, bolt.x1, bolt.y1, isFirefox ? {
        jitter: 8,
        segments: 4,
        branchChance: 0.2,
        branchLength: 0.3,
        maxDepth: 1,
        color: '#ffaaff',
        glowColor: '#cc44ff',
        lineWidth: 2.6,
        glowWidth: 9,
        alpha: t * 0.95
      } : {
        jitter: 11,
        segments: 8,
        branchChance: 0.55,
        branchLength: 0.5,
        maxDepth: 3,
        color: '#ffaaff',
        glowColor: '#cc44ff',
        lineWidth: 2.6,
        glowWidth: 9,
        alpha: t * 0.95
      })
    }

    // Floating damage numbers
    renderDamageNumbers(ctx)
    renderPowerupFloats(ctx)

    // Selection highlight
    if (phase.value === 'player_turn' && selectedBlade.value && !isDragging.value) {
      renderSelectionGlow(ctx, selectedBlade.value)
    }

    // Drag indicator
    if (isDragging.value && selectedBlade.value && phase.value === 'player_turn') {
      renderDragIndicator(ctx, selectedBlade.value)
    }

    // Joystick drag: show launch arrow on the blade so the player sees
    // where it will go, same as the normal slingshot indicator.
    if (isJoystickDragging.value && selectedBlade.value && phase.value === 'player_turn') {
      const blade = selectedBlade.value
      const { dx, dy } = joystickVector.value
      const mag = Math.sqrt(dx * dx + dy * dy)
      if (mag >= JOYSTICK_CANCEL_RADIUS) {
        const ratio = joystickForceRatio.value
        const nx = -dx / mag
        const ny = -dy / mag
        const arrowLen = 30 + 50 * ratio
        const endX = blade.x + nx * arrowLen
        const endY = blade.y + ny * arrowLen

        const r = Math.floor(255 * ratio)
        const g = Math.floor(255 * (1 - ratio * 0.6))

        ctx.save()
        ctx.strokeStyle = `rgb(${r}, ${g}, 0)`
        ctx.fillStyle = `rgb(${r}, ${g}, 0)`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(blade.x, blade.y)
        ctx.lineTo(endX, endY)
        ctx.stroke()

        const headSize = 8
        const angle = Math.atan2(ny, nx)
        const tipX = endX + nx * headSize
        const tipY = endY + ny * headSize
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - Math.cos(angle - 0.4) * headSize, tipY - Math.sin(angle - 0.4) * headSize)
        ctx.lineTo(tipX - Math.cos(angle + 0.4) * headSize, tipY - Math.sin(angle + 0.4) * headSize)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // Hint animation
    renderHintAnimation(ctx, showHintAnim)

    // Joystick position is updated here so drag hit-testing stays in sync
    // with the visible knob, but the actual drawing happens on a separate
    // overlay canvas (see renderJoystickOverlay) so it can render ABOVE the
    // HTML stat-card HUD instead of being covered by it.
    if (isJoystickVisible.value && phase.value === 'player_turn') {
      updateJoystickCenter(canvasWidth, canvasHeight, scale)
    }

    ctx.restore()
  }

  // Bottom-left corner of the visible canvas, clamped outside the arena.
  // Pulled out so both the main render (for hit testing) and the overlay
  // canvas (for drawing) reach the same coordinates.
  const updateJoystickCenter = (canvasWidth: number, canvasHeight: number, scale: number) => {
    const halfVisibleX = canvasWidth / (2 * scale)
    const halfVisibleY = canvasHeight / (2 * scale)
    const margin = 4
    let jcX: number
    let jcY: number
    // 40px pixel-space margin off the nearest viewport edge on mobile, so
    // the joystick doesn't hug the phone's bezel.
    const mobileEdgeMargin = 40 / scale
    if (isMobilePortrait.value) {
      // Below the arena — portrait viewports have vertical slack below
      // the arena circle.
      jcX = 0
      jcY = halfVisibleY - JOYSTICK_RADIUS - mobileEdgeMargin
    } else if (isMobileLandscape.value) {
      // Left of the arena — landscape viewports have horizontal slack.
      jcX = -halfVisibleX + JOYSTICK_RADIUS + mobileEdgeMargin
      jcY = 0
    } else {
      // Desktop / tablet: bottom-left corner of the visible canvas,
      // clamped outside the arena.
      jcX = -halfVisibleX + JOYSTICK_RADIUS + margin
      jcY = halfVisibleY - JOYSTICK_RADIUS - margin
    }
    const dist = Math.sqrt(jcX * jcX + jcY * jcY)
    const minDist = ARENA_RADIUS + JOYSTICK_RADIUS + 2
    if (dist < minDist && dist > 0.01) {
      const k = minDist / dist
      jcX *= k
      jcY *= k
    }
    joystickCenter.value = { x: jcX, y: jcY }
  }

  // Renders the joystick into a dedicated overlay canvas that sits above
  // the HUD in DOM order, so the bottom-left stat card no longer covers it.
  const renderJoystickOverlay = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    if (!isJoystickVisible.value || phase.value !== 'player_turn') return
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const fitSize = Math.min(canvasWidth, canvasHeight)
    const scale = fitSize / (ARENA_RADIUS * 2 + ARENA_PADDING)
    updateJoystickCenter(canvasWidth, canvasHeight, scale)
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    renderJoystick(ctx)
    ctx.restore()
  }

  // Trail layers: outer glow, mid body, inner core
  const TRAIL_LAYERS = [
    { widthBase: 6, widthSpeed: 4, alphaScale: 0.15 }, // outer glow
    { widthBase: 3, widthSpeed: 3, alphaScale: 0.35 }, // mid body
    { widthBase: 1, widthSpeed: 1.5, alphaScale: 0.7 }  // inner core
  ]

  const renderTrails = (ctx: CanvasRenderingContext2D) => {
    const now = performance.now()

    // Team colors: player = blue, npc = red
    const TEAM_COLOR = { player: [80, 160, 255], npc: [255, 80, 80] } as const

    for (const [, data] of trails) {
      const { pts, owner, modelId } = data
      if (pts.length < 2) continue

      const isRainbow = modelId === 'rainbow'
      const isForestDragon = modelId === 'forest-dragon'
      const oldestTime = pts[0]!.time
      const newestTime = pts[pts.length - 1]!.time
      const timeSpan = newestTime - oldestTime
      const [tr, tg, tb] = TEAM_COLOR[owner]

      // Forest-dragon: 4 parallel colored trails (red, green, blue, brown) → white
      if (isForestDragon) {
        const FD_COLORS: [number, number, number][] = [
          [220, 40, 40],    // red
          [40, 180, 60],    // green
          [50, 100, 220],   // blue
          [140, 90, 40]     // brown
        ]
        const stripWidth = 1.8
        const totalWidth = FD_COLORS.length * stripWidth
        for (let c = 0; c < FD_COLORS.length; c++) {
          const [cr, cg, cb] = FD_COLORS[c]!
          const laneOffset = (c - (FD_COLORS.length - 1) / 2) * stripWidth

          for (const layer of TRAIL_LAYERS) {
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.lineWidth = layer.widthBase * 0.6 + layer.widthSpeed * 0.4

            // Batch segments to reduce stroke() calls
            const BATCH = 4
            for (let i = 1; i < pts.length; i += BATCH) {
              const end = Math.min(i + BATCH, pts.length)
              const mid = Math.min(i + (BATCH >> 1), pts.length - 1)
              const pMid = pts[mid]!
              const tMid = timeSpan > 0 ? (pMid.time - oldestTime) / timeSpan : 1
              const ageMid = now - pMid.time
              const ageFadeMid = Math.max(0, 1 - ageMid / TRAIL_DURATION)
              const alphaMid = ageFadeMid * layer.alphaScale
              if (alphaMid <= 0.01) continue

              const r = Math.round(255 + (cr - 255) * tMid)
              const g = Math.round(255 + (cg - 255) * tMid)
              const b = Math.round(255 + (cb - 255) * tMid)
              ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alphaMid})`

              ctx.beginPath()
              for (let j = i; j < end; j++) {
                const p0 = pts[j - 1]!
                const p1 = pts[j]!
                const dx = p1.x - p0.x
                const dy = p1.y - p0.y
                const len = Math.sqrt(dx * dx + dy * dy) || 1
                const nx = -dy / len * laneOffset
                const ny = dx / len * laneOffset
                if (j === i) ctx.moveTo(p0.x + nx, p0.y + ny)
                ctx.lineTo(p1.x + nx, p1.y + ny)
              }
              ctx.stroke()
            }
          }
        }
      } else {
        for (const layer of TRAIL_LAYERS) {
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.lineWidth = isRainbow
            ? (layer.widthBase + layer.widthSpeed) * 1.3
            : layer.widthBase + layer.widthSpeed

          // Batch segments into groups of similar alpha to reduce stroke() calls.
          // Each group shares a single strokeStyle (using the group midpoint's values).
          const BATCH = 4
          for (let i = 1; i < pts.length; i += BATCH) {
            const end = Math.min(i + BATCH, pts.length)
            // Use midpoint of batch for color/alpha
            const mid = Math.min(i + (BATCH >> 1), pts.length - 1)
            const pMid = pts[mid]!
            const tMid = timeSpan > 0 ? (pMid.time - oldestTime) / timeSpan : 1
            const ageMid = now - pMid.time
            const ageFadeMid = Math.max(0, 1 - ageMid / TRAIL_DURATION)
            const alphaMid = ageFadeMid * layer.alphaScale
            if (alphaMid <= 0.01) continue

            if (isRainbow) {
              const hue = ((1 - tMid) * 360 + now * 0.15) % 360
              ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alphaMid * 1.2})`
            } else {
              const r = Math.round(255 + (tr - 255) * tMid)
              const g = Math.round(255 + (tg - 255) * tMid)
              const b = Math.round(255 + (tb - 255) * tMid)
              ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alphaMid})`
            }
            ctx.beginPath()
            ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y)
            for (let j = i; j < end; j++) {
              ctx.lineTo(pts[j]!.x, pts[j]!.y)
            }
            ctx.stroke()
          }
        }
      }
    }
  }

  // Arena theme lookup by type
  const ARENA_THEMES: Record<ArenaType, {
    neonColor: string
    neonRgba: string
    floorGrad?: [string, string]
    innerGlowRgba?: string
    ringColor: string
    borderWidth: number
    shadowBlur: number
  }> = {
    default: {
      neonColor: '#4fdfff', neonRgba: 'rgba(79, 223, 255,',
      ringColor: '#1c2a3d', borderWidth: 4, shadowBlur: 20
    },
    boss: {
      neonColor: '#ff4444', neonRgba: 'rgba(255, 60, 40,',
      floorGrad: ['#2a1010', '#1a0808'],
      innerGlowRgba: 'rgba(255, 40, 20,',
      ringColor: '#3a1515', borderWidth: 5, shadowBlur: 30
    },
    lava: {
      neonColor: '#ff6622', neonRgba: 'rgba(255, 102, 34,',
      floorGrad: ['#2a1508', '#1a0c04'],
      innerGlowRgba: 'rgba(255, 80, 20,',
      ringColor: '#3a2010', borderWidth: 5, shadowBlur: 25
    },
    ice: {
      neonColor: '#88ccff', neonRgba: 'rgba(136, 204, 255,',
      floorGrad: ['#0e2238', '#081828'],
      innerGlowRgba: 'rgba(100, 180, 255,',
      ringColor: '#1e3348', borderWidth: 4, shadowBlur: 28
    },
    forest: {
      neonColor: '#44cc66', neonRgba: 'rgba(68, 204, 102,',
      floorGrad: ['#0a1a0c', '#061208'],
      innerGlowRgba: 'rgba(40, 180, 60,',
      ringColor: '#1a2d1a', borderWidth: 4, shadowBlur: 22
    },
    thunder: {
      neonColor: '#ffcc22', neonRgba: 'rgba(255, 204, 34,',
      floorGrad: ['#1a1a08', '#12120a'],
      innerGlowRgba: 'rgba(255, 220, 60,',
      ringColor: '#2d2a1a', borderWidth: 4, shadowBlur: 25
    },
    shock: {
      neonColor: '#ff66cc', neonRgba: 'rgba(255, 102, 204,',
      floorGrad: ['#2a0a2a', '#150518'],
      innerGlowRgba: 'rgba(200, 60, 180,',
      ringColor: '#3a1a3a', borderWidth: 5, shadowBlur: 28
    }
  }

  // Static-layer renderer: everything in the arena that doesn't change
  // within a match (floor gradient, outer halo, neon border + shadowBlur,
  // inner rings, theme frost/shock bands). Called into a cached buffer
  // (see arenaStaticBuffer below), not directly from the per-frame path.
  // Caller must have already translated to the arena origin.
  const renderArenaStatic = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    const theme = ARENA_THEMES[arenaType.value]

    // Arena floor
    if (theme.floorGrad) {
      const floorGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, ARENA_RADIUS)
      floorGrad.addColorStop(0, theme.floorGrad[0])
      floorGrad.addColorStop(1, theme.floorGrad[1])
      ctx.fillStyle = floorGrad
    } else {
      ctx.fillStyle = '#161b22'
    }
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Outer glow halo
    const glowGrad = ctx.createRadialGradient(0, 0, ARENA_RADIUS - 2, 0, 0, ARENA_RADIUS + 40)
    glowGrad.addColorStop(0, `${theme.neonRgba} 0.15)`)
    glowGrad.addColorStop(0.4, `${theme.neonRgba} 0.05)`)
    glowGrad.addColorStop(1, `${theme.neonRgba} 0)`)
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS + 40, 0, Math.PI * 2)
    ctx.fill()

    // Neon border — skip shadowBlur on Firefox (very expensive for canvas shadows)
    ctx.strokeStyle = theme.neonColor
    ctx.lineWidth = theme.borderWidth
    if (!isFirefox) {
      ctx.shadowColor = theme.neonColor
      ctx.shadowBlur = theme.shadowBlur
    }
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Inner rings
    ctx.strokeStyle = theme.ringColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS * 0.6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS * 0.3, 0, Math.PI * 2)
    ctx.stroke()

    // Ice arena: frost rings for distinct visual
    if (arenaType.value === 'ice') {
      // Outer frost ring — beyond the border
      const outerFrost = ctx.createRadialGradient(0, 0, ARENA_RADIUS + 2, 0, 0, ARENA_RADIUS + 18)
      outerFrost.addColorStop(0, 'rgba(160, 220, 255, 0.25)')
      outerFrost.addColorStop(0.5, 'rgba(100, 180, 240, 0.1)')
      outerFrost.addColorStop(1, 'rgba(80, 160, 220, 0)')
      ctx.fillStyle = outerFrost
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS + 18, 0, Math.PI * 2)
      ctx.fill()

      // Inner frost band — darker icy rim inside the border
      const innerFrost = ctx.createRadialGradient(0, 0, ARENA_RADIUS * 0.82, 0, 0, ARENA_RADIUS - 2)
      innerFrost.addColorStop(0, 'rgba(60, 130, 180, 0)')
      innerFrost.addColorStop(0.6, 'rgba(80, 160, 220, 0.08)')
      innerFrost.addColorStop(1, 'rgba(120, 200, 255, 0.18)')
      ctx.fillStyle = innerFrost
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS - 2, 0, Math.PI * 2)
      ctx.fill()

      // Secondary inner border ring
      ctx.strokeStyle = 'rgba(140, 210, 255, 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS - 8, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Shock arena: pulsing electric band along the boundary
    if (arenaType.value === 'shock') {
      // Outer shock haze — beyond the border
      const outerShock = ctx.createRadialGradient(0, 0, ARENA_RADIUS + 2, 0, 0, ARENA_RADIUS + 18)
      outerShock.addColorStop(0, 'rgba(255, 100, 200, 0.25)')
      outerShock.addColorStop(0.5, 'rgba(180, 50, 160, 0.1)')
      outerShock.addColorStop(1, 'rgba(120, 30, 120, 0)')
      ctx.fillStyle = outerShock
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS + 18, 0, Math.PI * 2)
      ctx.fill()

      // Inner shock band — darker violet rim inside the border
      const innerShock = ctx.createRadialGradient(0, 0, ARENA_RADIUS * 0.82, 0, 0, ARENA_RADIUS - 2)
      innerShock.addColorStop(0, 'rgba(120, 30, 120, 0)')
      innerShock.addColorStop(0.6, 'rgba(180, 50, 160, 0.08)')
      innerShock.addColorStop(1, 'rgba(255, 100, 200, 0.18)')
      ctx.fillStyle = innerShock
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS - 2, 0, Math.PI * 2)
      ctx.fill()

      // Secondary inner border ring
      ctx.strokeStyle = 'rgba(255, 120, 220, 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, ARENA_RADIUS - 8, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Time-varying overlay drawn each frame on top of the cached static
  // arena. Only the pulsating inner glow qualifies — everything else in
  // the arena is frozen within a match and lives in the cache.
  const renderArenaDynamic = (ctx: CanvasRenderingContext2D) => {
    const theme = ARENA_THEMES[arenaType.value]
    if (!theme.innerGlowRgba) return
    const pulse = 0.3 + 0.2 * Math.sin(performance.now() * 0.002)
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, ARENA_RADIUS * 0.7)
    innerGlow.addColorStop(0, `${theme.innerGlowRgba} ${pulse * 0.15})`)
    innerGlow.addColorStop(1, `${theme.innerGlowRgba} 0)`)
    ctx.fillStyle = innerGlow
    ctx.beginPath()
    ctx.arc(0, 0, ARENA_RADIUS * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }

  // ── Arena static-layer cache ──────────────────────────────────────────
  // The static arena art (floor, halo, neon border with shadowBlur, inner
  // rings, ice/shock frost bands) doesn't change within a match, yet its
  // per-frame cost on Firefox — dominated by shadowBlur on the neon border
  // — is one of the biggest items in the render budget. We pre-composite
  // it into a buffer sized in arena-local coordinates so the cache is
  // independent of viewport and canvas scale. Invalidated when arenaType
  // changes; lazily rebuilt on the next render.
  //
  // Buffer radius of 280 covers ARENA_RADIUS (200) + outer halo (40) + a
  // safety margin for shadowBlur bleed that's larger than any theme's
  // shadowBlur setting. 560×560 RGBA = ~1.2 MB — fine.
  const ARENA_STATIC_BUFFER_RADIUS = 280
  const ARENA_STATIC_BUFFER_SIZE = ARENA_STATIC_BUFFER_RADIUS * 2
  let arenaStaticBuffer: OffscreenCanvas | HTMLCanvasElement | null = null
  let arenaStaticCacheKey: ArenaType | null = null

  const createArenaStaticBuffer = (): OffscreenCanvas | HTMLCanvasElement => {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(ARENA_STATIC_BUFFER_SIZE, ARENA_STATIC_BUFFER_SIZE)
    }
    const c = document.createElement('canvas')
    c.width = ARENA_STATIC_BUFFER_SIZE
    c.height = ARENA_STATIC_BUFFER_SIZE
    return c
  }

  const rebuildArenaStaticBuffer = () => {
    if (!arenaStaticBuffer) arenaStaticBuffer = createArenaStaticBuffer()
    const bctx = arenaStaticBuffer.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!bctx) return
    bctx.clearRect(0, 0, ARENA_STATIC_BUFFER_SIZE, ARENA_STATIC_BUFFER_SIZE)
    bctx.save()
    bctx.translate(ARENA_STATIC_BUFFER_RADIUS, ARENA_STATIC_BUFFER_RADIUS)
    renderArenaStatic(bctx)
    bctx.restore()
    arenaStaticCacheKey = arenaType.value
  }

  // Blit the cached static arena at the arena origin. Caller has already
  // translated+scaled into arena-local space, so we draw the buffer
  // centred at (0,0).
  const drawArenaStaticCached = (ctx: CanvasRenderingContext2D) => {
    if (arenaStaticCacheKey !== arenaType.value) rebuildArenaStaticBuffer()
    if (!arenaStaticBuffer) return
    ctx.drawImage(
      arenaStaticBuffer as CanvasImageSource,
      -ARENA_STATIC_BUFFER_RADIUS,
      -ARENA_STATIC_BUFFER_RADIUS
    )
  }

  /**
   * Draw pinball-style bouncers. Each bouncer is a stacked disc: a soft
   * drop-shadow base, a bright cyan rim that pulses on contact, and a
   * radial highlight to sell the "polished bumper" look.
   */
  const renderBouncers = (ctx: CanvasRenderingContext2D) => {
    if (arenaBouncers.length === 0) return
    const now = performance.now()
    const idlePulse = 0.6 + 0.4 * Math.sin(now * 0.005)
    for (const b of arenaBouncers) {
      const hit = b.flash
      const rimAlpha = Math.min(1, 0.55 + hit * 0.45)
      const glowR = b.radius * (1.8 + hit * 0.8)

      const isShock = arenaType.value === 'shock'

      // Outer glow
      const glow = ctx.createRadialGradient(b.x, b.y, b.radius * 0.8, b.x, b.y, glowR)
      glow.addColorStop(0, isShock
        ? `rgba(220, 80, 200, ${0.35 + hit * 0.4})`
        : `rgba(120, 220, 255, ${0.35 + hit * 0.4})`)
      glow.addColorStop(1, isShock ? 'rgba(220, 80, 200, 0)' : 'rgba(120, 220, 255, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Drop-shadow base
      ctx.fillStyle = isShock ? '#1a0a1a' : '#0f1a30'
      ctx.beginPath()
      ctx.arc(b.x, b.y + 1.2, b.radius, 0, Math.PI * 2)
      ctx.fill()

      // Main bumper body — gradient from bright center to darker edge
      const body = ctx.createRadialGradient(
        b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.1,
        b.x, b.y, b.radius
      )
      if (isShock) {
        body.addColorStop(0, hit > 0.01 ? '#ffffff' : '#ffaaee')
        body.addColorStop(0.55, '#cc44aa')
        body.addColorStop(1, '#5a1a4a')
      } else {
        body.addColorStop(0, hit > 0.01 ? '#ffffff' : '#b8e8ff')
        body.addColorStop(0.55, '#5bb8e8')
        body.addColorStop(1, '#1a4d7a')
      }
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
      ctx.fill()

      // Rim
      ctx.strokeStyle = isShock
        ? `rgba(255, 140, 220, ${rimAlpha * idlePulse})`
        : `rgba(180, 240, 255, ${rimAlpha * idlePulse})`
      ctx.lineWidth = 1.5
      if (!isFirefox) {
        ctx.shadowColor = isShock ? '#ff66cc' : '#8fdfff'
        ctx.shadowBlur = 6 + hit * 10
      }
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0

      // Tiny white highlight for polish
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.beginPath()
      ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ─── Powerup lifecycle ───────────────────────────────────────────────────

  /**
   * Disintegrate puffs spawned when a powerup is collected or expires. Each
   * particle is a tiny coloured square drifting outward and fading; the array
   * is updated in place by `updatePowerups`.
   */
  interface PowerupParticle {
    x: number
    y: number
    vx: number
    vy: number
    color: string
    life: number
    maxLife: number
    size: number
  }

  const powerupParticles: PowerupParticle[] = []

  // Match the stat-icon palette used in SpinnerConfigModal: red-400 attack,
  // blue-400 defense, cyan-400 speed. Used for both the disintegrate puff
  // particles and (via the lighter/darker derivations below) the 3d crate.
  // Particle color (kept for the disintegrate puff) — uses the mid tone
  // from the palette below so all of the powerup VFX share one identity.
  const POWERUP_STAT_COLOR: Record<PowerupStat, string> = {
    attack: '#ef4444',  // red-500
    defense: '#3b82f6', // blue-500
    speed: '#06b6d4'    // cyan-500
  }
  // Cohesive 3d-box palette per stat. Each entry packs the four shades
  // the renderer needs: a bright top-edge ridge, a mid-tone wall body, a
  // darker outline, and a semi-transparent front-face fill so the stat
  // glyph reads as if it were embedded inside the colored crate.
  interface PowerupPalette {
    light: string
    wall: string
    outline: string
    front: string
  }

  const POWERUP_PALETTE: Record<PowerupStat, PowerupPalette> = {
    attack: {
      light: '#fda4af',
      wall: '#dc2626',
      outline: '#7f1d1d',
      front: 'rgba(248, 113, 113, 0.55)' // red-400 @ 55%
    },
    defense: {
      light: '#93c5fd',
      wall: '#2563eb',
      outline: '#1e3a8a',
      front: 'rgba(96, 165, 250, 0.55)' // blue-400 @ 55%
    },
    speed: {
      light: '#67e8f9',
      wall: '#0891b2',
      outline: '#155e75',
      front: 'rgba(34, 211, 238, 0.55)' // cyan-400 @ 55%
    }
  }

  // SVG path data lifted verbatim from src/components/icons/Icon{Attack,
  // Defense,Speed}.vue. The icons share a 24×24 viewBox, so the renderer
  // translates by (-12, -12) before stroking/filling them and scales them to
  // the requested glyph size.
  const POWERUP_ICON_PATH: Record<PowerupStat, string> = {
    attack: 'M21.5 2.5L8 13L5 10L3.5 11.5L6.5 14.5L4 17L7 20L9.5 17.5L12.5 20.5L14 19L11 16Z',
    defense: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
    speed: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z'
  }
  // Lazily compiled Path2Ds — one per stat — keyed off the same record.
  const powerupIconPath2D = new Map<PowerupStat, Path2D>()
  const getPowerupIconPath = (stat: PowerupStat): Path2D => {
    let p = powerupIconPath2D.get(stat)
    if (!p) {
      p = new Path2D(POWERUP_ICON_PATH[stat])
      powerupIconPath2D.set(stat, p)
    }
    return p
  }

  /**
   * Try to spawn a powerup at a free location inside the arena. Bails out
   * silently if 12 placement attempts all collide with a blade or another
   * powerup — the next physics tick will roll a new attempt anyway.
   */
  const spawnPowerup = (): void => {
    const fullRadius = BLADE_RADIUS * POWERUP_RADIUS_FRACTION
    const minSepBlade = BLADE_RADIUS + fullRadius + 6
    const minSepPowerup = fullRadius * 2 + 8
    const placementR = ARENA_RADIUS - fullRadius - 12
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = matchRng() * Math.PI * 2
      // Bias slightly toward the inner arena so spawned crates aren't
      // pinned against the wall where blades have less room to redirect.
      const r = placementR * (0.25 + matchRng() * 0.7)
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r

      let ok = true
      for (const blade of allBlades.value) {
        if (blade.hp <= 0) continue
        if (Math.hypot(blade.x - x, blade.y - y) < minSepBlade) {
          ok = false
          break
        }
      }
      if (ok) {
        for (const p of powerups.value) {
          if (Math.hypot(p.x - x, p.y - y) < minSepPowerup) {
            ok = false
            break
          }
        }
      }
      if (!ok) continue

      const stat = POWERUP_STATS[Math.floor(matchRng() * POWERUP_STATS.length)]!
      powerups.value.push({
        id: nextPowerupId++,
        x, y,
        stat,
        phase: 'growing',
        age: 0,
        lifetime: POWERUP_LIFETIME_MS,
        scale: 0,
        radius: fullRadius
      })
      return
    }
  }

  /**
   * Spawn a small disintegrate burst at the given location. Used by both the
   * "picked up" and "expired" paths so they share a single visual recipe.
   */
  const spawnPowerupParticles = (x: number, y: number, stat: PowerupStat) => {
    if (powerupParticles.length >= 60) return
    const color = POWERUP_STAT_COLOR[stat]
    const COUNT = 10
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.4
      const speed = 0.05 + Math.random() * 0.06
      powerupParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.02,
        color,
        life: 380,
        maxLife: 380,
        size: 2 + Math.random() * 2
      })
    }
  }

  /**
   * Apply a powerup's stat boost to the receiving blade. Buffs are stored
   * multiplicatively so several pickups of the same kind stack.
   */
  const applyPowerupToBlade = (blade: SpinnerState, stat: PowerupStat) => {
    if (!blade.buffs) blade.buffs = {}
    blade.buffs[stat] = (blade.buffs[stat] ?? 1) * POWERUP_BUFF_MULTIPLIER
  }

  /**
   * Per-physics-tick driver for the spawn timer, lifecycle animation, blade
   * collision check, and disintegrate particles. Always called from
   * `updatePhysics` once per fixed 16ms step. NOT scaled by `simSpeed` —
   * 2x only affects position integration, so powerup spawn cadence stays
   * identical at 1x and 2x.
   */
  const updatePowerups = (dt: number): void => {
    if (!powerupsEnabled) return

    // Spawn cadence — only ticks during interactive gameplay phases so the
    // timer freezes during the meteor intro / turn announcement / game over.
    const ph = phase.value
    const isLive =
      ph === 'player_turn'
      || ph === 'player_launched'
      || ph === 'npc_turn'
      || ph === 'npc_launched'
    if (isLive) {
      powerupSpawnTimer -= dt
      if (powerupSpawnTimer <= 0) {
        // Hard cap: never let more than 2 crates exist on the arena at once,
        // including ones that are mid-vanish (still visually present).
        if (powerups.value.length < 2) spawnPowerup()
        powerupSpawnTimer = rollPowerupSpawnDelay()
      }
    }

    // Lifecycle + collision
    for (let i = powerups.value.length - 1; i >= 0; i--) {
      const p = powerups.value[i]!
      p.age += dt

      // Phase machine. Each phase eases the scale toward its target so the
      // crate visibly grows, overshoots, settles, and finally vanishes.
      if (p.phase === 'growing') {
        const t = Math.min(1, p.age / POWERUP_GROW_MS)
        p.scale = POWERUP_OVERGROW_SCALE * t
        if (t >= 1) p.phase = 'overgrow'
      } else if (p.phase === 'overgrow') {
        const t = Math.min(1, (p.age - POWERUP_GROW_MS) / POWERUP_OVERGROW_MS)
        p.scale = POWERUP_OVERGROW_SCALE
        if (t >= 1) p.phase = 'final'
      } else if (p.phase === 'final') {
        const t = Math.min(1, (p.age - POWERUP_GROW_MS - POWERUP_OVERGROW_MS) / POWERUP_SETTLE_MS)
        p.scale = POWERUP_OVERGROW_SCALE + (POWERUP_FINAL_SCALE - POWERUP_OVERGROW_SCALE) * t
        // Auto-expire after the lifetime so stale crates clear the floor.
        if (p.age >= p.lifetime) {
          p.phase = 'vanishing'
          p.age = 0
          spawnPowerupParticles(p.x, p.y, p.stat)
        }
      } else {
        // 'vanishing' — shrink down then drop from the array.
        const t = Math.min(1, p.age / POWERUP_VANISH_MS)
        p.scale = POWERUP_FINAL_SCALE * (1 - t)
        if (t >= 1) {
          powerups.value.splice(i, 1)
          continue
        }
      }

      // Pickup detection — only "real" crates (not the vanishing remains)
      // can be collected. Use the current scaled radius so half-grown crates
      // can still be grabbed but with a smaller hitbox, matching the visual.
      if (p.phase !== 'vanishing') {
        const hitR = p.radius * Math.max(0.4, p.scale)
        for (const blade of allBlades.value) {
          if (blade.hp <= 0) continue
          if (Math.hypot(blade.x - p.x, blade.y - p.y) <= blade.radius + hitR) {
            applyPowerupToBlade(blade, p.stat)
            spawnPowerupFloat(p.x, p.y - blade.radius, p.stat)
            try {
              playSound('level-up')
            } catch { /* sound is best-effort */
            }
            p.phase = 'vanishing'
            p.age = 0
            spawnPowerupParticles(p.x, p.y, p.stat)
            break
          }
        }
      }
    }

    // Particle update — drift outward, fade (compact dead entries in-place)
    let ppWrite = 0
    for (let i = 0; i < powerupParticles.length; i++) {
      const part = powerupParticles[i]!
      part.x += part.vx * dt
      part.y += part.vy * dt
      part.vx *= 0.94
      part.vy *= 0.94
      part.life -= dt
      if (part.life > 0) powerupParticles[ppWrite++] = part
    }
    powerupParticles.length = ppWrite
  }

  /**
   * Reset all powerup state for a fresh match. Called by `initGame` (which
   * also wires the enabled flag and the spawn interval bounds).
   */
  const resetPowerups = (): void => {
    powerups.value = []
    powerupParticles.length = 0
    powerupFloats.length = 0
    powerupSpawnTimer = rollPowerupSpawnDelay()
    nextPowerupId = 0
  }

  /**
   * Draw a powerup as a small rounded 3d box with the stat icon glyph on
   * the front face. Uses the same per-stat color as the team-composition
   * modal (red-400 attack, blue-400 defense, cyan-400 speed) shaded into a
   * lighter "top" face and a darker "side" face to sell the depth. The
   * whole sprite is scaled by `p.scale` so the lifecycle animation reads as
   * one continuous grow → settle → vanish.
   */
  const renderPowerup = (ctx: CanvasRenderingContext2D, p: Powerup): void => {
    if (p.scale <= 0.001) return
    const baseSize = p.radius * 1.6
    const size = baseSize * p.scale
    const half = size / 2
    // Iso-ish offset for the top + side faces. Kept small so the sprite
    // reads as a 3d crate without taking up much arena footprint.
    const dx = size * 0.30
    const dy = size * 0.20
    // Rounded-corner radius. Kept proportional to the box size so it scales
    // with the grow/vanish animation.
    const r = Math.min(size * 0.22, half * 0.8)

    const stat = p.stat
    const palette = POWERUP_PALETTE[stat]

    ctx.save()
    ctx.translate(p.x, p.y)

    // ── Extruded depth ────────────────────────────────────────────────
    // Sweep N rounded-rect "slices" from the back layer toward the front
    // so the depth wall inherits the rounded silhouette of the front face.
    // The back-most slice uses the bright `light` shade to read as the
    // top-edge ridge of an iso box; every interior slice uses `wall` so
    // the visible depth reads as a single solid colored side.
    ctx.strokeStyle = palette.outline
    ctx.lineWidth = 1.2
    const layers = 10
    for (let i = layers; i >= 1; i--) {
      const t = i / layers
      ctx.fillStyle = i === layers ? palette.light : palette.wall
      ctx.beginPath()
      ctx.roundRect(-half + dx * t, -half - dy * t, size, size, r)
      ctx.fill()
    }
    // Outline the back-most silhouette so the crate has a clean edge.
    ctx.beginPath()
    ctx.roundRect(-half + dx, -half - dy, size, size, r)
    ctx.stroke()

    // ── Front face (rounded square) ───────────────────────────────────
    // Semi-transparent so the icon drawn on top reads as if it's sitting
    // *inside* the colored box rather than pasted on its surface.
    ctx.fillStyle = palette.front
    ctx.beginPath()
    ctx.roundRect(-half, -half, size, size, r)
    ctx.fill()
    ctx.stroke()

    // ── Stat glyph ────────────────────────────────────────────────────
    // Drawn from the same SVG path as the team-composition modal icon.
    // White fill + thin dark outline so it pops against the colored crate.
    drawPowerupGlyph(ctx, stat, size * 0.7)

    // Idle pulse — soft white sheen on the front face once the crate has
    // settled, clipped to the rounded silhouette so it stays inside the box.
    if (p.phase === 'final') {
      const pulse = 0.35 + 0.35 * Math.sin(performance.now() * 0.006)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(-half, -half, size, size, r)
      ctx.clip()
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.25})`
      ctx.fillRect(-half, -half, size, half * 0.6)
      ctx.restore()
    }

    ctx.restore()
  }

  /**
   * Stamp the stat icon on the front face of a powerup crate. Uses the
   * same Path2D-compiled SVG path as the team-composition modal, scaled
   * from its native 24×24 viewBox down to `size` arena units.
   */
  const drawPowerupGlyph = (
    ctx: CanvasRenderingContext2D,
    stat: PowerupStat,
    size: number
  ) => {
    const path = getPowerupIconPath(stat)
    ctx.save()
    // Center the 24×24 viewBox on (0,0) and scale to the requested glyph
    // size. The icon already fills most of its viewBox, so we don't need
    // additional padding.
    const s = size / 24
    ctx.scale(s, s)
    ctx.translate(-12, -12)
    ctx.fillStyle = '#ffffff'
    ctx.fill(path)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.stroke(path)
    ctx.restore()
  }

  const renderPowerups = (ctx: CanvasRenderingContext2D): void => {
    if (powerups.value.length === 0 && powerupParticles.length === 0) return
    for (const p of powerups.value) renderPowerup(ctx, p)

    // Disintegrate particles — small fading squares.
    for (const part of powerupParticles) {
      const alpha = Math.max(0, part.life / part.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = part.color
      ctx.fillRect(part.x - part.size / 2, part.y - part.size / 2, part.size, part.size)
      ctx.restore()
    }
  }

  const renderMeteorShower = (ctx: CanvasRenderingContext2D) => {
    // Batched draw: every particle's streak and head go into ONE path per
    // hue bucket, and we replace the per-particle fade with the bucket's
    // mean alpha applied via `globalAlpha`. Net cost collapses from
    // 2·N draw calls (stroke+fill per particle) to ≤4 — two strokes and
    // two fills — regardless of particle count. The mean-alpha simplification
    // is invisible in practice because every particle shares the same
    // life/maxLife curve within a shower; they only differ in start delay,
    // and that delay is already handled by the `p.life > p.maxLife` skip.
    const particles = meteorParticles.value
    if (particles.length === 0) return

    // Single pass to accumulate each bucket's members + mean alpha. Hue
    // split matches `spawnMeteorShower`: warm (~20–45°) vs cool (~190–230°).
    let warmCount = 0
    let warmAlphaSum = 0
    let coolCount = 0
    let coolAlphaSum = 0
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!
      if (p.life > p.maxLife) continue
      const alpha = (p.life / p.maxLife) * 0.8
      if (p.hue < 100) {
        warmCount++
        warmAlphaSum += alpha
      } else {
        coolCount++
        coolAlphaSum += alpha
      }
    }

    if (warmCount === 0 && coolCount === 0) return

    ctx.lineWidth = 2
    ctx.lineCap = 'round'

    const drawBucket = (
      isWarm: boolean,
      count: number,
      alpha: number
    ): void => {
      if (count === 0) return
      ctx.globalAlpha = alpha
      // Streaks — one stroke pass for all particles in the bucket.
      ctx.strokeStyle = isWarm ? 'hsl(32, 90%, 70%)' : 'hsl(210, 90%, 70%)'
      ctx.beginPath()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        if (p.life > p.maxLife) continue
        if ((p.hue < 100) !== isWarm) continue
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        const tailLen = spd * 4
        const nx = spd > 0.01 ? p.vx / spd : 0
        const ny = spd > 0.01 ? p.vy / spd : 0
        ctx.moveTo(p.x - nx * tailLen, p.y - ny * tailLen)
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()

      // Heads — one fill pass. Using `moveTo` before each arc breaks the
      // subpath so the filled shapes don't connect.
      ctx.fillStyle = isWarm ? 'hsl(32, 90%, 90%)' : 'hsl(210, 90%, 90%)'
      ctx.beginPath()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        if (p.life > p.maxLife) continue
        if ((p.hue < 100) !== isWarm) continue
        ctx.moveTo(p.x + 1.5, p.y)
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
      }
      ctx.fill()
    }

    drawBucket(true, warmCount, warmCount > 0 ? warmAlphaSum / warmCount : 0)
    drawBucket(false, coolCount, coolCount > 0 ? coolAlphaSum / coolCount : 0)

    ctx.globalAlpha = 1
    ctx.lineCap = 'butt'
  }

  const renderAura = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    const isPlayer = blade.owner === 'player'
    const mid = blade.config.modelId

    // Direct render — an offscreen spritesheet cache was tried and
    // rolled back; see the note on the extracted `renderTornadoAura` /
    // `renderSandstormAura` at the top of the file.
    if (mid === 'tornado') {
      ctx.save()
      ctx.translate(blade.x, blade.y)
      renderTornadoAura(ctx, blade.radius, performance.now())
      ctx.restore()
    } else if (mid === 'sandstorm') {
      ctx.save()
      ctx.translate(blade.x, blade.y)
      renderSandstormAura(ctx, blade.radius, performance.now())
      ctx.restore()
    }

    // ── Thunderstorm skin aura ─────────────────────────────────────────
    // Direct path: bolt jitter uses `boltSeed = Math.floor(now/100)`
    // and randomised branch geometry per frame.
    if (mid === 'thunderstorm') {
      const now = performance.now()
      // Refresh bolt geometry every 100ms for crackling effect
      const boltSeed = Math.floor(now / 100)
      const boltCount = isFirefox ? 1 : 5
      // Ambient electric glow
      ctx.save()
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(now * 0.008)
      const glow = ctx.createRadialGradient(blade.x, blade.y, blade.radius * 0.3, blade.x, blade.y, blade.radius * 2)
      glow.addColorStop(0, 'rgba(150,200,255,0.4)')
      glow.addColorStop(1, 'rgba(100,150,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(blade.x, blade.y, blade.radius * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // 5 big branching lightning bolts, ~72° apart with slight jitter
      for (let i = 0; i < boltCount; i++) {
        const baseAngle = (i / boltCount) * Math.PI * 2
        const jitterAngle = ((boltSeed * 7 + i * 41) % 30 - 15) * Math.PI / 180
        const angle = baseAngle + jitterAngle
        const len = blade.radius * (1.4 + ((boltSeed * 3 + i * 41) % 100) * 0.012)
        const ex = blade.x + Math.cos(angle) * len
        const ey = blade.y + Math.sin(angle) * len
        drawLightningBolt(ctx, blade.x, blade.y, ex, ey, isFirefox ? {
          jitter: 6,
          segments: 4,
          branchChance: 0.2,
          branchLength: 0.3,
          maxDepth: 1,
          color: '#ffee66',
          glowColor: '#88bbff',
          lineWidth: 1.5,
          glowWidth: 4,
          alpha: 0.85
        } : {
          jitter: 8,
          segments: 7,
          branchChance: 0.55,
          branchLength: 0.55,
          maxDepth: 3,
          color: '#ffee66',
          glowColor: '#88bbff',
          lineWidth: 1.5,
          glowWidth: 4,
          alpha: 0.85
        })
      }
      // Smaller arcs filling the gaps between big bolts
      const smallBoltCount = isFirefox ? 1 : 5
      const smallSeed = Math.floor(now / 130)
      for (let i = 0; i < smallBoltCount; i++) {
        const angle = ((smallSeed * 11 + i * 73 + 34) % 360) * Math.PI / 180
        const len = blade.radius * (0.85 + ((smallSeed * 5 + i * 29) % 100) * 0.005)
        const ex = blade.x + Math.cos(angle) * len
        const ey = blade.y + Math.sin(angle) * len
        drawLightningBolt(ctx, blade.x, blade.y, ex, ey, isFirefox ? {
          jitter: 4,
          segments: 3,
          branchChance: 0,
          branchLength: 0,
          maxDepth: 0,
          color: '#ffee66',
          glowColor: '#88bbff',
          lineWidth: 0.8,
          glowWidth: 2.5,
          alpha: 0.55
        } : {
          jitter: 5,
          segments: 5,
          branchChance: 0.35,
          branchLength: 0.4,
          maxDepth: 2,
          color: '#ffee66',
          glowColor: '#88bbff',
          lineWidth: 0.8,
          glowWidth: 2.5,
          alpha: 0.55
        })
      }
    }

    // ── Stat-switch boss phase indicator ───────────────────────────────
    if (blade.statSwitchPhase) {
      const now = performance.now()
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.005)
      const isAtk = blade.statSwitchPhase === 'attack'
      ctx.save()
      ctx.translate(blade.x, blade.y - blade.radius - 10)
      ctx.globalAlpha = pulse
      ctx.fillStyle = isAtk ? '#ff4444' : '#4488ff'
      ctx.font = 'bold 8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(isAtk ? '⚔ ATK' : '🛡 DEF', 0, 0)
      ctx.globalAlpha = 1
      ctx.restore()
    }

    // ── Life-leech boss indicator ──────────────────────────────────────
    if (blade.isLifeLeech) {
      const now = performance.now()
      const pulse = 0.4 + 0.3 * Math.sin(now * 0.004)
      const auraR = blade.radius * 1.6
      const grad = ctx.createRadialGradient(
        blade.x, blade.y, blade.radius * 0.3,
        blade.x, blade.y, auraR
      )
      grad.addColorStop(0, `rgba(100, 255, 100, ${0.4 * pulse})`)
      grad.addColorStop(0.5, `rgba(0, 180, 0, ${0.2 * pulse})`)
      grad.addColorStop(1, 'rgba(0, 100, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(blade.x, blade.y, auraR, 0, Math.PI * 2)
      ctx.fill()
    }

    if (blade.isBoss) {
      // Boss: large fiery pulsating aura
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003)
      const auraRadius = blade.radius * 2.2
      const grad = ctx.createRadialGradient(
        blade.x, blade.y, blade.radius * 0.4,
        blade.x, blade.y, auraRadius
      )
      grad.addColorStop(0, `rgba(255, 80, 20, ${0.8 * pulse})`)
      grad.addColorStop(0.3, `rgba(255, 40, 10, ${0.5 * pulse})`)
      grad.addColorStop(0.6, `rgba(180, 20, 5, ${0.3 * pulse})`)
      grad.addColorStop(1, 'rgba(120, 10, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(blade.x, blade.y, auraRadius, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    // Player aura pulsates, NPC aura is steady
    const pulse = isPlayer
      ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.004))
      : 0.5
    const auraRadius = blade.radius * 1.8 + 4
    const grad = ctx.createRadialGradient(
      blade.x, blade.y, blade.radius * 0.3,
      blade.x, blade.y, auraRadius
    )

    // Adjust aura brightness per arena so ownership stays readable on
    // floors whose hue overlaps the aura colour.
    const at = arenaType.value
    if (isPlayer) {
      // Blue aura — brighten on blue-tinted floors (ice, default)
      const bright = (at === 'ice' || at === 'default') ? 1 : 0
      grad.addColorStop(0, `rgba(${80 + bright * 40}, ${170 + bright * 40}, 255, ${0.55 * pulse})`)
      grad.addColorStop(0.5, `rgba(${50 + bright * 30}, ${120 + bright * 30}, 240, ${0.3 * pulse})`)
      grad.addColorStop(1, `rgba(${40 + bright * 20}, ${100 + bright * 20}, 220, 0)`)
    } else {
      // Red aura — brighten on red/warm-tinted floors (boss, lava, shock)
      const bright = (at === 'boss' || at === 'lava' || at === 'shock') ? 1 : 0
      grad.addColorStop(0, `rgba(255, ${80 + bright * 50}, ${80 + bright * 50}, ${0.75 * pulse})`)
      grad.addColorStop(0.5, `rgba(240, ${55 + bright * 40}, ${55 + bright * 40}, ${0.45 * pulse})`)
      grad.addColorStop(1, `rgba(220, ${40 + bright * 30}, ${40 + bright * 30}, 0)`)
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(blade.x, blade.y, auraRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  const renderBlade = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    const { x, y, rotation, owner, hitFlash, hp, maxHp, radius } = blade
    const isPlayer = owner === 'player'

    // Invulnerability blink — split-boss children phase in as ghostly
    // flickers before they can be hit. We wrap the whole blade render in
    // a save/restore so the alpha only affects this blade.
    let invulnAlpha = 1
    if (isInvulnerable(blade)) {
      // 10Hz square-wave flicker: 60% / 15% alpha swap ~6 times a second.
      invulnAlpha = (Math.floor(performance.now() / 90) % 2 === 0) ? 0.6 : 0.2
    }
    // Ghost bosses render at 80% opacity so they read as spectral — both
    // the parent and its mid-launch twin (twin inherits config.bossAbility).
    const ghostAlpha = blade.config.bossAbility === 'ghost' ? 0.5 : 1
    const bladeAlpha = invulnAlpha * ghostAlpha
    const needsAlpha = bladeAlpha < 1
    if (needsAlpha) {
      ctx.save()
      ctx.globalAlpha = bladeAlpha
    }

    // Circular clip for the model image
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.clip()


    // Model image (rotates with blade)
    const modelImg = getBladeModelImage(blade.config.topPartId, owner, blade.config.modelId)
    if (modelImg) {
      ctx.translate(x, y)
      ctx.rotate(rotation)
      const imgSize = radius * 2
      ctx.drawImage(modelImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize)
      ctx.rotate(-rotation)
      ctx.translate(-x, -y)
    }

    ctx.restore()

    // Hit flash overlay (white -> red -> orange -> white)
    if (hitFlash > 0) {
      ctx.globalAlpha = (hitFlash / HIT_FLASH_FRAMES) * 0.7
      const progress = 1 - hitFlash / HIT_FLASH_FRAMES
      if (progress < 0.2) ctx.fillStyle = '#ffffff'
      else if (progress < 0.5) ctx.fillStyle = '#ff3333'
      else if (progress < 0.8) ctx.fillStyle = '#ff8800'
      else ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    renderHealthRing(ctx, x, y, hp, maxHp, radius, isPlayer)

    if (needsAlpha) ctx.restore()
  }

  const _hpFontCache = new Map<string, number>()
  // Cached optical-center y-offset per (text, fontSize) pair. Canvas's
  // `textBaseline = 'middle'` centers on the font's em-middle, which for
  // Arial Bold sits a few pixels above the visual center of digit-only
  // strings (digits have no descender so the perceived center is lower).
  // We measure once with `actualBoundingBoxAscent / Descent` and cache
  // the nudge — keyed identically to the font cache so a single lookup
  // serves both. Caching matters because measureText is called every
  // frame for every blade.
  const _hpYOffsetCache = new Map<string, number>()

  // Inline the ring every frame. An earlier attempt cached the whole
  // ring (bg stroke + HP arc + strokeText + fillText) into a per-blade
  // OffscreenCanvas and replaced it with a single drawImage. On paper
  // that cut draw calls; in practice it slowed down Chromium / Brave
  // because `drawImage` is a different batch kind than `stroke`/`fill`,
  // so each blade forced an extra GPU batch flush. The four-primitive
  // inline path is faster because it groups naturally with the team-
  // aura `fill` that follows.
  const renderHealthRing = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    hp: number, maxHp: number,
    bladeRadius: number,
    isPlayer: boolean
  ) => {
    const hpPct = Math.max(0, Math.min(1, hp / maxHp))
    const ringR = bladeRadius * 0.45
    const ringWidth = 2.5

    // Background ring
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.lineWidth = ringWidth
    ctx.beginPath()
    ctx.arc(x, y, ringR, 0, Math.PI * 2)
    ctx.stroke()

    // HP arc
    const hue = hpPct * 120
    ctx.strokeStyle = `hsl(${hue}, 90%, 50%)`
    ctx.lineWidth = ringWidth
    ctx.lineCap = 'round'
    const start = -Math.PI / 2
    const end = start + hpPct * Math.PI * 2
    ctx.beginPath()
    ctx.arc(x, y, ringR, start, end)
    ctx.stroke()
    ctx.lineCap = 'butt'

    // HP number (dynamically sized to fit inside the ring)
    const hpText = Math.ceil(hp).toString()
    const innerDiameter = (ringR - ringWidth) * 2
    const cacheKey = `${hpText.length}_${Math.round(innerDiameter)}`
    let fontSize = _hpFontCache.get(cacheKey)
    if (fontSize === undefined) {
      fontSize = innerDiameter
      ctx.font = `bold ${fontSize}px Arial`
      let measured = ctx.measureText(hpText).width
      while (measured > innerDiameter * 0.85 && fontSize > 4) {
        fontSize -= 1
        ctx.font = `bold ${fontSize}px Arial`
        measured = ctx.measureText(hpText).width
      }
      _hpFontCache.set(cacheKey, fontSize)
    }
    ctx.font = `bold ${fontSize}px Arial`

    // Compute the optical-center offset once per (text, fontSize) and
    // cache it. With `textBaseline = 'alphabetic'`, drawing at
    // `y + (ascent - descent) / 2` puts the visual middle of the glyph
    // exactly on `y` — the previous `'middle'` baseline was off by a
    // few pixels (digits have no descender so font-middle sits above
    // visual-middle), which is what made the HP number feel slightly
    // high inside the ring.
    let yOffset = _hpYOffsetCache.get(cacheKey)
    if (yOffset === undefined) {
      const m = ctx.measureText(hpText)
      // actualBoundingBox{Ascent,Descent} is supported on every browser
      // we ship to (Chrome 77+, Safari 11.1+, Firefox 74+). Fall back
      // to a sensible empirical fudge if the metrics are missing.
      const a = typeof m.actualBoundingBoxAscent === 'number' ? m.actualBoundingBoxAscent : fontSize * 0.7
      const d = typeof m.actualBoundingBoxDescent === 'number' ? m.actualBoundingBoxDescent : fontSize * 0.05
      yOffset = (a - d) / 2
      _hpYOffsetCache.set(cacheKey, yOffset)
    }
    const drawY = y + yOffset

    ctx.fillStyle = isPlayer ? '#66aaff' : '#ff6666'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.strokeText(hpText, x, drawY)
    ctx.fillText(hpText, x, drawY)
  }

  const renderSelectionGlow = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    ctx.strokeStyle = '#ffdd00'
    ctx.lineWidth = 2
    if (!isFirefox) {
      ctx.shadowColor = '#ffdd00'
      ctx.shadowBlur = 12
    }
    ctx.beginPath()
    ctx.arc(blade.x, blade.y, blade.radius + 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  const renderDragIndicator = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    // Compute pull vector from blade center to pointer
    const pullDx = dragCurrent.value.x - blade.x
    const pullDy = dragCurrent.value.y - blade.y
    const pullMag = Math.sqrt(pullDx * pullDx + pullDy * pullDy)
    const inCancelZone = pullMag < blade.radius

    ctx.save()
    // Cancel zone circle
    const cancelAlpha = inCancelZone ? 0.6 : 0.2
    ctx.strokeStyle = `rgba(255, 80, 80, ${cancelAlpha})`
    ctx.lineWidth = inCancelZone ? 2.5 : 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.arc(blade.x, blade.y, blade.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    if (inCancelZone) {
      // X icon
      const s = blade.radius * 0.35
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(blade.x - s, blade.y - s)
      ctx.lineTo(blade.x + s, blade.y + s)
      ctx.moveTo(blade.x + s, blade.y - s)
      ctx.lineTo(blade.x - s, blade.y + s)
      ctx.stroke()
    }
    ctx.restore()

    if (pullMag < 3) return

    const ratio = dragForceRatio.value

    ctx.save()
    // Pull line (dashed) — blade center to pointer
    ctx.strokeStyle = 'rgba(255,170,0,0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(blade.x, blade.y)
    ctx.lineTo(dragCurrent.value.x, dragCurrent.value.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Launch arrow (opposite of pull direction, using same vector)
    const nx = -pullDx / pullMag
    const ny = -pullDy / pullMag
    const arrowLen = 30 + 50 * ratio
    const endX = blade.x + nx * arrowLen
    const endY = blade.y + ny * arrowLen

    const r = Math.floor(255 * ratio)
    const g = Math.floor(255 * (1 - ratio * 0.6))
    ctx.strokeStyle = `rgb(${r}, ${g}, 0)`
    ctx.fillStyle = `rgb(${r}, ${g}, 0)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(blade.x, blade.y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // Arrowhead (tip extends past line end)
    const headSize = 8
    const angle = Math.atan2(ny, nx)
    const tipX = endX + nx * headSize
    const tipY = endY + ny * headSize
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - Math.cos(angle - 0.4) * headSize, tipY - Math.sin(angle - 0.4) * headSize)
    ctx.lineTo(tipX - Math.cos(angle + 0.4) * headSize, tipY - Math.sin(angle + 0.4) * headSize)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // ─── Virtual Joystick Rendering ──────────────────────────────────────────

  const renderJoystick = (ctx: CanvasRenderingContext2D) => {
    const jc = joystickCenter.value
    const dragging = isJoystickDragging.value

    ctx.save()

    // Base circle (dark translucent disc)
    const baseGrad = ctx.createRadialGradient(jc.x, jc.y, 0, jc.x, jc.y, JOYSTICK_RADIUS)
    baseGrad.addColorStop(0, 'rgba(30, 40, 60, 0.5)')
    baseGrad.addColorStop(1, 'rgba(20, 25, 40, 0.35)')
    ctx.fillStyle = baseGrad
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Base ring
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_RADIUS, 0, Math.PI * 2)
    ctx.stroke()

    // Cancel zone indicator (dashed inner circle)
    ctx.strokeStyle = dragging ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 80, 80, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_CANCEL_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Knob position
    const kx = dragging ? joystickKnob.value.x : jc.x
    const ky = dragging ? joystickKnob.value.y : jc.y

    // Slingshot visual: dashed pull line to knob + launch arrow opposite
    if (dragging) {
      const { dx, dy } = joystickVector.value
      const mag = Math.sqrt(dx * dx + dy * dy)
      if (mag >= JOYSTICK_CANCEL_RADIUS) {
        const ratio = joystickForceRatio.value
        const r = Math.floor(255 * ratio)
        const g = Math.floor(255 * (1 - ratio * 0.6))

        // Pull line (dashed) — center to knob
        ctx.strokeStyle = 'rgba(255,170,0,0.5)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(jc.x, jc.y)
        ctx.lineTo(kx, ky)
        ctx.stroke()
        ctx.setLineDash([])

        // Launch arrow (opposite of pull direction)
        const nx = -dx / mag
        const ny = -dy / mag
        const arrowLen = 12 + 20 * ratio
        const endX = jc.x + nx * arrowLen
        const endY = jc.y + ny * arrowLen

        ctx.strokeStyle = `rgb(${r}, ${g}, 0)`
        ctx.fillStyle = `rgb(${r}, ${g}, 0)`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(jc.x, jc.y)
        ctx.lineTo(endX, endY)
        ctx.stroke()

        // Arrowhead
        const headSize = 5
        const angle = Math.atan2(ny, nx)
        const tipX = endX + nx * headSize
        const tipY = endY + ny * headSize
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - Math.cos(angle - 0.4) * headSize, tipY - Math.sin(angle - 0.4) * headSize)
        ctx.lineTo(tipX - Math.cos(angle + 0.4) * headSize, tipY - Math.sin(angle + 0.4) * headSize)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Knob
    const knobGrad = ctx.createRadialGradient(kx, ky, 0, kx, ky, JOYSTICK_KNOB_RADIUS)
    knobGrad.addColorStop(0, dragging ? 'rgba(140, 200, 255, 0.9)' : 'rgba(100, 160, 255, 0.7)')
    knobGrad.addColorStop(1, dragging ? 'rgba(80, 140, 220, 0.5)' : 'rgba(60, 100, 180, 0.35)')
    ctx.fillStyle = knobGrad
    ctx.beginPath()
    ctx.arc(kx, ky, JOYSTICK_KNOB_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Knob rim
    ctx.strokeStyle = dragging ? 'rgba(160, 210, 255, 0.7)' : 'rgba(100, 160, 255, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(kx, ky, JOYSTICK_KNOB_RADIUS, 0, Math.PI * 2)
    ctx.stroke()

    ctx.restore()
  }

  // ─── Coordinate Conversion ───────────────────────────────────────────────

  const pixelToGame = (
    px: number, py: number, canvasWidth: number, canvasHeight: number
  ): { x: number; y: number } => {
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const fitSize = Math.min(canvasWidth, canvasHeight)
    const scale = fitSize / (ARENA_RADIUS * 2 + ARENA_PADDING)
    return {
      x: (px - centerX) / scale,
      y: (py - centerY) / scale
    }
  }

  // ─── Hint Animation ─────────────────────────────────────────────────────

  const renderHintAnimation = (ctx: CanvasRenderingContext2D, showHint: boolean) => {
    if (!showHint || phase.value !== 'player_turn' || isDragging.value) return

    const blade = livingBlades(playerBlades.value)[0]
    if (!blade) return

    // Looping animation: 0→1 pull back, then hold, then release flash
    const cycleDuration = 2000 // ms
    const t = (Date.now() % cycleDuration) / cycleDuration

    // Phase 0–0.5: pull back, 0.5–0.8: hold, 0.8–1.0: release fade
    const pullDir = Math.PI * 0.75 // pull down-left
    let pullDist: number
    let alpha: number
    let showArrow = true

    if (t < 0.5) {
      // Pull back phase
      pullDist = (t / 0.5) * 60
      alpha = 0.5
    } else if (t < 0.8) {
      // Hold phase
      pullDist = 60
      alpha = 0.5 + 0.2 * Math.sin((t - 0.5) / 0.3 * Math.PI)
    } else {
      // Release fade
      pullDist = 60 * (1 - (t - 0.8) / 0.2)
      alpha = 0.5 * (1 - (t - 0.8) / 0.2)
      if (alpha < 0.05) showArrow = false
    }

    if (!showArrow) return

    const pullX = blade.x + Math.cos(pullDir) * pullDist
    const pullY = blade.y + Math.sin(pullDir) * pullDist

    // Launch direction (opposite of pull)
    const launchNx = -Math.cos(pullDir)
    const launchNy = -Math.sin(pullDir)
    const ratio = pullDist / 60
    const arrowLen = 30 + 50 * ratio

    ctx.save()
    ctx.globalAlpha = alpha

    // Pull line (dashed)
    ctx.strokeStyle = 'rgba(255,170,0,0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(blade.x, blade.y)
    ctx.lineTo(pullX, pullY)
    ctx.stroke()
    ctx.setLineDash([])

    // Phantom finger circle at pull point
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.arc(pullX, pullY, 8, 0, Math.PI * 2)
    ctx.fill()

    // Launch arrow
    const endX = blade.x + launchNx * arrowLen
    const endY = blade.y + launchNy * arrowLen

    const r = Math.floor(255 * ratio)
    const g = Math.floor(255 * (1 - ratio * 0.6))
    ctx.strokeStyle = `rgb(${r}, ${g}, 0)`
    ctx.fillStyle = `rgb(${r}, ${g}, 0)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(blade.x, blade.y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    // Arrowhead (tip extends past line end)
    const headSize = 8
    const angle = Math.atan2(launchNy, launchNx)
    const tipX = endX + launchNx * headSize
    const tipY = endY + launchNy * headSize
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - Math.cos(angle - 0.4) * headSize, tipY - Math.sin(angle - 0.4) * headSize)
    ctx.lineTo(tipX - Math.cos(angle + 0.4) * headSize, tipY - Math.sin(angle + 0.4) * headSize)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    phase,
    gameResult,
    turnAnnouncement,
    playerBlades,
    npcBlades,
    allBlades,
    selectedBladeId,
    selectedBlade,
    isDragging,
    dragStart,
    dragCurrent,
    dragForceRatio,
    meteorParticles,
    isBossStage,
    arenaType,
    powerups,

    initGame,
    startMatch,
    clearBattleVfx,
    beginDrag,
    updateDrag,
    releaseDrag,
    forceReleaseDragAtMax,
    beginJoystickDrag,
    updateJoystickDrag,
    releaseJoystickDrag,
    isJoystickVisible,
    isJoystickDragging,
    renderJoystickOverlay,
    startPhysics,
    stopPhysics,
    spawnMeteorShower,

    // PvP
    pvpMode,
    ghostMode,
    launchRemoteBlade,
    setOnLocalLaunch: (cb: ((bladeIndex: number, ax: number, ay: number) => void) | null) => {
      onLocalLaunch = cb
    },
    setOnStateHash: (cb: ((hash: string, turn: number) => void) | null) => {
      onStateHash = cb
    },

    render,
    pixelToGame,
    speed,
    statsFor
  }
}

export default useSpinnerGame
