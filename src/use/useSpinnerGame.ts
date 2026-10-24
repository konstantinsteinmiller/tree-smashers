import { spawnStuffing, updateStuffing, drawStuffing, type StuffingBurst } from '@/use/stuffingFx'
import { smasherLoadout } from '@/data/smasherCatalog'
import { ref, computed, watch, shallowRef, type Ref, type ComputedRef, type ShallowRef } from 'vue'
import { isGamePaused, registerPauseSyncer } from '@/use/useGamePause'
import type {
  SpinnerState,
  SpinnerConfig,
  SpinnerStats,
  GamePhase,
  GameResult,
  SpritesheetAnimation,
  Powerup,
  PowerupStat,
  BossTrait
} from '@/types/spinner'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import { bossHpRubberBandMul, CAMPAIGN_NPC_TUNING, campaignNpcCountHpMul, campaignNpcHpMul, sanitizeArenaType } from '@/use/useSpinnerCampaign'
import {
  allTreesDown, applyGround, buildTerrainLayout, collideSolids, createTowers, decideResult, pickTargetTree, inDeepCore, newGroundState, newSolidEffect,
  terrainCircles, terrainSolidCircles, towerHitDamage, towerSpecFor, towerSpikeRecoil, towerFrontAngle, TOWER_FRONT_HALF_ARC,
  type GroundEffect, type GroundState, type TeamTower, type TerrainLayout
} from '@/use/arenaTerrain'
import { DECOR_DRAW, renderTerrainFeatures } from '@/use/arenaTerrainDraw'
import { armorTilesImage, bulwarkTilesImage, drawArmorTiles } from '@/use/armorArt'
import { PAINTED_BULWARK } from '@/use/paintedBulwark'
import { PAINTED_ARMOR } from '@/use/paintedArmor'
import { terrainArtRevision } from '@/use/arenaTerrainArt'
import { drawPaintedFloor, floorArtRevision, preloadFloorArt } from '@/use/arenaFloorArt'
import { borderArtRevision, borderKeyFor, drawPaintedBorder, preloadBorderArt } from '@/use/arenaBorderArt'
import { backdropArtRevision, paintArenaBackdrop, preloadBackdropArt } from '@/use/arenaBackdrop'
import { warmNextStageArt } from '@/use/nextStageArt'
import { drawPullArrow } from '@/use/pullArrowArt'
import { arenaFitPoints, FIT_HUD_OUTLINE_MARGIN, fillRatio, fitArenaView, fitPointsBounds, legacyArenaView, type ArenaView, type FitInsets, type FitRect } from '@/use/arenaFit'
import { floorKeyFor, THEME_LOOK, themeFor, type ArenaTheme } from '@/use/arenaThemes'
import {
  resolveWall as shapeResolveWall,
  clampInside as shapeClampInside,
  isInside as shapeIsInside,
  sdf as shapeSdf,
  traceArenaPath,
  type ArenaShape,
  TERRAIN_SHAPES
} from '@/use/arenaShapes'
import { selectedBgSkin, DEFAULT_BG_SKIN_ID } from '@/use/useBgSkins'
import { computeStats } from '@/use/useSpinnerConfig'
import { getSelectedSkin } from '@/use/useModels'
import { isSmasherId, smasherForParts, type SmasherId } from '@/data/smasherCatalog'
import { drawSmasherDisc, drawSmasherFrame } from '@/smashers/smasherAtlas'
import { DISC_SQUASH as DISC_SQUASH_RENDER, YAW_FRAMES, YAW_STEP } from '@/smashers/smasherRig'
import { isDebug } from '@/use/useMatch.ts'
import { isMobileLandscape, isMobilePortrait, userDifficulty } from '@/use/useUser.ts'
import { DIFFICULTY } from '@/utils/enums'
import { CLEAN_FEED, CLEAN_HP_RINGS } from '@/utils/cleanFeed'
import { useScreenshake } from '@/use/useScreenshake'
import useSounds from '@/use/useSound'
import { prependBaseUrl } from '@/utils/function.ts'
import { getCachedImage, resourceCache } from '@/use/useAssets'
import { drawLightningBolt } from '@/utils/lightning'
import { discGaugeFrame, drawHpGauge, newHpGaugeState, type HpGaugeState } from '@/use/hpGauge'
import { BALLOON_HP_BUILD } from '@/use/balloonHpFlag'
import { BALLOON_HP, balloonCount, drawBalloonHp, drawBalloonHpNumber, newBalloonState, updateBalloonHp, type BalloonState } from '@/use/balloonHp'
import { preloadBalloonArt } from '@/use/balloonArt'
import { BALLOON_FX_CAP, createBalloonPopFx, drawBalloonPopFx, resetBalloonPopFx, tickBalloonPopFx, type BalloonPopFx } from '@/use/balloonPopFx'
import { newSlotOn, BALLOON_POP_SFX } from '@/audio/audioVersions'
import { setTowerTheme, drawPaintedTower, towerArtMaxScale, preloadTowerArt, towerArtRevision, towerDamageStage } from '@/use/towerArt'
import { matchRng, seedMatchRng, seedMatchRngRandom, currentMatchSeed, createRng, GAMEPLAY_RNG_SALT } from '@/use/useDeterministicRng'
import { currentPvpRole } from '@/use/usePVP'
import { saveDataVersion } from '@/use/useSaveStatus'
import { pushCombatEntry, clearCombatLog } from '@/use/useCombatLog'
import { FX } from '@/use/useQuality'
import {
  createMeteorShower, spawnMeteorShowerFx, tickMeteorShower, meteorClock, meteorShake,
  drawMeteorGround, drawMeteorSky, drawMeteorScreen, preloadMeteorArt, prefersStill,
  installMeteorDevHook, METEOR_INTRO_MS, type MeteorShowerKind
} from '@/use/meteorShower'
import {
  createRingShower, spawnRingShowerFx, tickRingShower, ringClock, ringShake,
  drawRingGround, drawRingSky, drawRingScreen, preloadRingMeteorArt, installRingDevHook,
  METEOR_VARIANT
} from '@/use/ringShower'

/**
 * Owner 2026-10-23: the meteor shower is out of the game. The modules, painted
 * art and tests stay for other projects; the `meteor_intro` phase itself (the
 * 3-2-1, the boss intro card, the 1,600 ms timing) is unchanged. Flip to bring
 * the shower back.
 */
const METEOR_SHOWER_ENABLED = false
import { createTowerFx, resetTowerFx, spawnSplinters, spawnLeaves, spawnThornShards, noteTowerStage, tickTowerFx, drawTowerFx } from '@/use/towerHitFx'
import { drawTowerThorns, preloadThornArt, thornArtRevision } from '@/use/towerThorns'
import { POWERUP_PLATE, powerupBoxPath, preloadPowerupArt, statIconImage, uiArtImage, uiArtReady } from '@/data/uiArt'
import { fmtNum } from '@/utils/localeNumber'
import {
  createBorderFx, resetBorderFx, tickBorderFx, triggerBurn, triggerHeal,
  renderBurns, renderHeals, FLAME_BURN_SRC, BORDER_FX_POOL_SIZE
} from '@/use/borderFx'
import type { SkillId, SkillLoadout } from '@/types/skills'
// Skills (skills-feature.md §5/§8/§10.3) reach the engine in two parts:
//   • the string-free core (HP loss, stun / phase / bounce bookkeeping, result
//     objects) — static, it runs on every build and reduces to plain HP maths
//     for a blade without `skills`;
//   • everything that creates or rolls a skill, and the skill VFX — the skill
//     port (`skills/skillEngine.ts`), loaded only through the skills gate and
//     handed in with `installSkillEngine`. Until then (and forever on a
//     skills-off build) no blade ever gets `skills`.
// Every skill-only path is additionally behind the `SKILLS_BUILD` literal, so
// a skills-off build folds the engine's skill glue away entirely.
import {
  applyHpLoss, beginLaunchSkills, blocksEnemyChip, countPickable,
  createContactResult, createHpLossResult, createIncomingResult, createOutgoingResult,
  effectiveHp, isStunnedFor, onOwnBounce,
  anchorKeep, onBankRebound, thornsRecoil, towerDamageMul,
  type HpLossKind, type SkillBlade, type SkillRefStats
} from '@/use/skills/skillCore'
import {
  armorMul, armorOf, armorZone, defaultHeadingY, discOf, followHeading,
  ZONE_BACK, ZONE_FRONT, type ArmorZone
} from '@/use/smasherMechanics'
import { clampTeamSize, sideSizeMul, sideStatMul } from '@/data/teamSize'
import type {
  SkillEvent, SkillEventKind, SkillRocketView, SkillVfx, SkillVfxBlade
} from '@/use/skills/skillVfx'
import type { CalloutInput, SkillCallouts } from '@/use/skills/skillCallouts'
import { SKILLS_BUILD, type SkillEnginePort } from '@/skills/skillsGate'
// Boss traits (bosses-100-feature.md §4, §12.2) reach the engine the same way
// as skills: the rules, VFX and SFX are ONE port (`bosses/bossTraitEngine.ts`)
// loaded through the bosses gate and handed in with `installBossTraitEngine`;
// every trait path is additionally behind the `BOSSES100_BUILD` literal, so a
// bosses100-off build folds the engine's trait glue away entirely.
import type { BossClock, TraitContactResult, TraitHudRow } from '@/use/bosses/bossTraits'
import type {
  BossTraitEvent, BossTraitEventKind, BossTraitGlyph, BossTraitVfx
} from '@/use/bosses/bossTraitVfx'
import { BOSSES100_BUILD, type BossTraitEnginePort } from '@/bosses/bosses100Gate'
import type { NpcPlayStyle } from '@/use/pvpBots'

const { triggerShake } = useScreenshake()
const { playSound } = useSounds()

// Translate a global i18n key from inside this (non-component) composable.
// It reads the app-wide vue-i18n instance main.ts parks on `window.__i18n`
// (same window-singleton pattern as `window.__saveManager`). Used for the
// transient turn-announcement text, so not reacting to a mid-string locale
// change is fine; falls back to the raw key if i18n isn't ready.
type GlobalI18n = {
  t?: (k: string, named?: Record<string, unknown>) => string
  locale?: string | { value: string }
}
const globalI18n = (): GlobalI18n | undefined =>
  (window as unknown as { __i18n?: { global?: GlobalI18n } }).__i18n?.global

const translate = (key: string, named?: Record<string, unknown>): string => {
  try {
    const g = globalI18n()
    return g?.t ? g.t(key, named) : key
  } catch {
    return key
  }
}

/** The active locale code ('en', 'de', 'jp'…), 'en' when i18n isn't ready. */
const activeLocale = (): string => {
  try {
    const l = globalI18n()?.locale
    return (typeof l === 'string' ? l : l?.value) || 'en'
  } catch {
    return 'en'
  }
}

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
// Camera fit: @/use/arenaFit (the layout's real outline + towers, clear of
// the HUD) — it replaced the fixed 2R + 76 padding fit.
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

// Arena boundary shape. 'circle' is the classic arena; other shapes
// (oval / hexagon / diamond / rounded-rect) change how blades ricochet.
// Set per match in initGame. Geometry lives in `@/use/arenaShapes`.
const arenaShape: Ref<ArenaShape> = ref('circle')
export { arenaShape }

// Thin, shape-aware wrappers so call sites don't repeat `arenaShape.value` /
// `ARENA_RADIUS`. resolveArenaWall returns null when a blade is clear of the
// wall; clampInArena pulls a point inside so a circle of `radius` (+ optional
// clearance) fits.
const resolveArenaWall = (x: number, y: number, radius: number) =>
  shapeResolveWall(arenaShape.value, x, y, radius, ARENA_RADIUS)
const clampInArena = (x: number, y: number, radius: number, extra = 0) =>
  shapeClampInside(arenaShape.value, x, y, radius, ARENA_RADIUS, extra)

// ─── Simulation Speed (visual travel speed only) ────────────────────────────

// Module-level so the speed setting persists across composable instances and
// can be controlled from anywhere in the UI. At 2x we substep ALL physics
// (accel ramp, position, velocity decay, wall/island/blade collision) — so
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
const GAME_START_COUNT_KEY = 'smashers_game_start_count'
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
const LAST_RESULT_KEY = 'smashers_last_result'
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

// ─── Skills: public contracts (skills-feature.md §8.1, §9.1, §10.3) ─────────

/**
 * Trailing options object of `initGame` (after the positional params, which
 * stay for the existing call sites).
 *
 *  • `seed` — start the match RNG from this value (reproducible battles).
 *  • `skillLoadout` — the LOCAL side's fallback loadout (`playerBlades`).
 *    A smasher blade always brings its OWN unlocked skills (`smasherLoadout`);
 *    this side loadout only reaches part-only blades (the player sends [] now).
 *  • `enemySkillLoadout` — the OTHER side (`npcBlades`): the PvP opponent's
 *    loadout from `player-ready`, or a ghost's recorded loadout. Campaign and
 *    AI enemies pass nothing (§9 — enemies carry no skills in v1).
 *
 * Omitted / empty / fully invalid loadouts leave `blade.skills` unset — the
 * engine then runs exactly the pre-skills code path (same state hashes).
 * Loadouts are sanitised by `createBladeSkills` (unknown ids, duplicates,
 * > 2 entries dropped; levels clamped 1–10).
 */
export interface InitGameOptions {
  seed?: number
  skillLoadout?: SkillLoadout | null
  enemySkillLoadout?: SkillLoadout | null
  /** League fights (DT1): who moves first, decided by the battle seed and
   *  handed in by the arena. Overrides the last-result first-turn bias of a
   *  single-player match; the matchRng draw still happens, so the stream
   *  order is the same as without it. Ignored in PvP. */
  firstTurn?: 'player' | 'opponent'
  /** Tree Smashers terrain: `layout` = arena layout index (islands, speed
   *  boosters, pot holes; null = the plain arena) and `towers` = each team
   *  defends a Team Tower (destroying the enemy's wins). Omitted: the plain
   *  legacy arena with no towers. Both PvP peers must pass the same value
   *  (derived from the shared seed). `trees` = trees per side (1–3, default
   *  1; campaign: arenaTerrain treeCountForStage) — a side wins by trees only
   *  when ALL the other side's trees have fallen. */
  terrain?: { layout: number | null; towers: boolean; trees?: number } | null
  /** Random-search bot (src/use/pvpBots.ts): how the NPC AI plays this
   *  match — reaction delay per turn, aim spread, the odd bad shot, force
   *  range, "Opponent's turn" banners. Single-player only (ignored in PvP).
   *  Its extra draws come from the style's own `rand`; the gameplay stream
   *  draws exactly what it draws without it. Omitted: the campaign NPC. */
  npcPlay?: NpcPlayStyle | null
}

/** Live state of one HUD skill chip — structurally the `SkillHudState` prop
 *  of `SkillHudIcon.vue` (a fresh object per publish, so props update). */
export interface SkillHudChipState {
  /** Guard Shell: shield / shieldMax (0…1). */
  ring?: number
  /** Phase Step: cooldown length; restart the sweep when `cooldownKey` changes. */
  cooldownMs?: number
  cooldownKey?: number
  /** Momentum stacks (current launch) / Homing Rockets contacts toward the volley. */
  pips?: number
  pipsMax?: number
  /** Second Wind used / Opening Salvo fired. */
  spent?: boolean
  /** Increments on every proc of this skill on this blade (flash). */
  flashKey?: number
}

/** One equipped skill of one local blade. */
export interface SkillHudSlot {
  id: SkillId
  /** Smasher skill id (its name + drawn icon); '' = generic effect chip. */
  key: string
  level: number
  state: SkillHudChipState
}

/**
 * `skillHud.value[i]` = the chips of `playerBlades[i]` (index at initGame,
 * i.e. the stat-card order); `[]` when the local side has no skills. A NEW
 * array is assigned (≤ 10 Hz, only when a chip changed), so plain props update.
 */
export type SkillHudRows = SkillHudSlot[][]

/** Size of the skill-event ring buffer (`skillEvents`). */
export const SKILL_EVENT_BUFFER = 32

export type { SkillEvent, SkillEventKind }
export type { BossTraitEvent, BossTraitEventKind, TraitHudRow }

/**
 * `bossTraitHud.value[i]` = boss-trait state of `playerBlades[i]` (stat-card
 * order): `frozen` = frost-locked for its team's next turn (ice card, not
 * pickable), `chill` = live Frostbite stacks 0…5 (SPD shows statsFor's value,
 * which already includes the slow). `[]` in matches without traits. A NEW
 * array of new row objects is assigned only when a row changed (trait events
 * / turn changes, never per frame), so plain props update.
 */
export type BossTraitHudRows = TraitHudRow[]

// ─── Skill port (installed by the skills gate; null = no skills) ─────────────
// Module-level so every engine instance sees it. `installSkillEngine` is called
// by the arena once `loadSkillEngine()` resolved; before that a battle is set
// up without skills (the arena re-inits the waiting board once the port and
// the loadout are in). A skills-off build never installs one.
//
// Port members are named in BRACKET form (`skillPort['createBladeSkills']`),
// for the reason spelled out at the boss port below: a dotted access becomes
// an obfuscator-made literal that `reservedStrings` cannot protect, so the
// names outlived the folded calls in a skills-off build's string array.
let skillPort: SkillEnginePort | null = null
/** Hand the engine its skill port (or null to take it away, tests). */
export const installSkillEngine = (port: SkillEnginePort | null): void => {
  skillPort = SKILLS_BUILD ? port : null
}
/** Is a skill port installed (the arena waits for it before a battle)? */
export const hasSkillEngine = (): boolean => skillPort !== null

// ─── Boss-trait port (installed via the bosses gate; null = no traits) ──────
// Same contract as the skill port: until `installBossTraitEngine` ran (and
// forever on a bosses100-off build) a trait carrier fights without its trait —
// the arena waits for the port before a battle and rebuilds a waiting board.
//
// The engine names port members in BRACKET form (`bossPort['renderIceShell']`)
// on purpose: the obfuscator rewrites a dotted member access into a new string
// literal that `reservedStrings` cannot protect, so the member names would
// stay in the string array of a bosses100-off build after the calls folded
// away; an original literal is reserved (vite.config.ts) and folds with them.
let bossPort: BossTraitEnginePort | null = null
/** Hand the engine its boss-trait port (or null to take it away, tests). */
export const installBossTraitEngine = (port: BossTraitEnginePort | null): void => {
  bossPort = BOSSES100_BUILD ? port : null
}
/** Is a boss-trait port installed? */
export const hasBossTraitEngine = (): boolean => bossPort !== null

export const useSpinnerGame = () => {
  // ── Game Phase ───────────────────────────────────────────────────────────
  const phase: Ref<GamePhase> = ref('idle')
  const gameResult: Ref<GameResult> = ref(null)
  const turnAnnouncement: Ref<string> = ref('')
  /** performance.now() until which the centre turn banner is on screen. */
  let turnBannerUntil = 0

  // Wall-clock timestamp when the current `player_turn` began. Drives the
  // early-game tutorial arrows that orbit the player's spinners (CG QA
  // requested a clearer "this is yours" cue for new players). Cleared
  // whenever the phase is anything other than `player_turn`, so the
  // 1-second grace + 5s/2s on/off cycle restart cleanly on each turn.
  let playerTurnStartedAt: number | null = null
  watch(phase, (p) => {
    playerTurnStartedAt = p === 'player_turn' ? Date.now() : null
  })
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
  // Seeded single-player battle (initGame got `opts.seed` outside PvP, e.g.
  // league fights): every gameplay timer reads the SIM clock (`simTickCount`,
  // below) instead of the wall clock, so a replay of the same seed + launches
  // lands every cooldown on the same tick. Unseeded campaign: wall clock, as
  // before.
  let seededSim = false
  const gameTime = (): number =>
    pvpMode.value
      ? pvpTickCount * FIXED_STEP_MS
      : seededSim ? simTickCount * FIXED_STEP_MS : performance.now()
  // Simulation clock for skill objects that must freeze with the physics
  // loop (Homing Rockets). Outside PvP `gameTime()` is the wall clock, so a
  // rocket in flight during a platform pause / hidden tab kept flying on
  // screen and landed on the first tick after resume. This advances once per
  // physics tick (so it also honours 2x sim speed); PvP keeps `gameTime()`,
  // which is already tick-based and part of the lockstep contract.
  // The per-blade contact GATES run on it too (bosses BW4): the shared 250 ms
  // `lastShockMs` gate (Static Charge, Frost Lock's cold
  // touch), Frostbite's `lastChillAt`, Phase Step's `phasedUntil` and a split
  // child's `invulnerableUntil` are compared against each other's `now`, so
  // they move together — on the wall clock a platform pause (or a hidden tab)
  // opened every gate on resume. PvP: identical to gameTime(), no change.
  let simTickCount = 0
  const skillClock = (): number =>
    pvpMode.value ? gameTime() : simTickCount * FIXED_STEP_MS
  // A seeded battle restarts the sim clock a minute "in" (like the PvP clock:
  // cooldown maps default a never-seen pair to 0).
  const SEEDED_CLOCK_START_TICKS = 3600

  // ── Gameplay RNG outside the match stream (league, LG-DET) ────────────
  // NPC spawn jitter, the NPC AI's blade/target/angle/
  // force picks and split-child jitter. With `opts.seed` they draw from an
  // AUX stream derived from the seed — never from `matchRng()`, so the match
  // stream's draw order (star crit, power-ups, first turn, emitters) is
  // exactly what it was. Without a seed they keep drawing Math.random, in
  // the same call order (campaign unchanged). Presentation-only rolls stay
  // on Math.random too and carry a `// vfx-rng` marker
  // (tests/leagueDeterminism scans the file).
  let gameplayStream: (() => number) | null = null
  /** League first turn (InitGameOptions.firstTurn, DT1); null = the usual bias. */
  let forcedFirstTurn: 'player' | 'opponent' | null = null
  const gameplayRand = (): number =>
    gameplayStream !== null ? gameplayStream() : Math.random() // gameplay-rng fallback (unseeded)

  // ── Peer-independent blade identity (PvP determinism) ──────────────────
  // The two PvP clients hold the teams in swapped playerBlades/npcBlades
  // arrays and see the arena y-mirrored. `syncKey` (host team 0..n-1, guest
  // team 100+i, children derived from their parent) is identical on both,
  // and everything order-sensitive — collision pair order, the anti-draw
  // tie-break, RNG draw order, the state hash — runs in syncKey order.
  const SYNC_KEY_GUEST_BASE = 100
  // True when this client is the PvP GUEST: its own team gets the guest
  // keys and the state hash flips y back into the host's frame.
  let pvpLocalIsGuest = false
  // The seed this match's RNG started from (PvP: the host's broadcast seed).
  let matchSeed = 1
  // Per-parent spawn ordinal → child syncKey = (parent + 1) * 1000 + ordinal.
  const childSpawnSeq = new Map<number, number>()
  const childSyncKey = (parent: SpinnerState): number => {
    const n = childSpawnSeq.get(parent.syncKey) ?? 0
    childSpawnSeq.set(parent.syncKey, n + 1)
    return (parent.syncKey + 1) * 1000 + n
  }
  // Rebuilt only when a blade array is reassigned (spawns), not per tick.
  const bladesBySyncKey = computed<SpinnerState[]>(() =>
    [...allBlades.value].sort((p, q) => p.syncKey - q.syncKey)
  )

  /** Hash of all gameplay-relevant blade state, identical on both PvP
   *  clients for the same physical state: blades in syncKey order, position
   *  AND velocity in the host's frame (the guest un-mirrors y). */
  const computeStateHash = (): string => {
    const flip = pvpLocalIsGuest ? -1 : 1
    const entries: string[] = []
    for (const b of bladesBySyncKey.value) {
      let e = `${b.syncKey}:${b.x.toFixed(3)},${(b.y * flip).toFixed(3)},`
        + `${b.vx.toFixed(3)},${(b.vy * flip).toFixed(3)},${b.hp.toFixed(3)}`
      // Skill state (§9.1 / WP3 item 9) — appended only for blades that carry
      // skills or were stunned, so a match without skills hashes exactly as
      // before. `stunnedForTurn` is a per-side turn index that both peers
      // count identically; `rngState` catches a proc-stream desync.
      if (b.skills !== undefined || b.stunnedForTurn !== undefined) {
        e += `;${b.skills !== undefined ? b.skills.shield.toFixed(3) : '-'},`
          + `${b.stunnedForTurn ?? '-'},${b.skills !== undefined ? b.skills.rngState : '-'}`
      }
      // Boss traits (bosses-100 §9) — only in matches with a trait carrier,
      // so trait-free hashes stay byte-identical.
      if (BOSSES100_BUILD && traitsActive) e += `#${bossPort!['traitHashPart'](b)}`
      // Directional armour: the gameplay heading decides the damage, so it is
      // hashed — only in matches with an armoured blade (armour-free hashes
      // stay byte-identical). Host frame: the guest un-mirrors y.
      if (armorActive) e += `^${headingX(b).toFixed(4)},${(headingY(b) * flip).toFixed(4)}`
      // Terrain (booster budget/cooldown, deep-hole exemption) — only in
      // matches with a layout, so plain-arena hashes stay byte-identical.
      if (terrain !== null) {
        const gs = groundStates.get(b.id)
        e += gs ? `~${gs.boosts},${gs.boostReadyAt},${gs.holeExempt ? 1 : 0}` : '~-'
      }
      entries.push(e)
    }
    // Team towers in the host's frame order (host tower first).
    if (towers.length > 0) {
      const hostSide = pvpLocalIsGuest ? 'npc' : 'player'
      const hostTower = towers.find(t => t.side === hostSide)
      const guestTower = towers.find(t => t.side !== hostSide)
      entries.push(`tw:${hostTower?.hp.toFixed(3) ?? '-'},${guestTower?.hp.toFixed(3) ?? '-'}`)
    }
    if (BOSSES100_BUILD && traitsActive) entries.push(`clk:${bossPort!['bossClockHashPart'](bossClock!)}`)
    // Team sizes (host first): they set every blade's radius and the solo boost.
    entries.push(teamSizeHash)
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

  // ── Viewport metrics ─────────────────────────────────────────────────────
  //
  // The canvas size the renderer last drew with. `render` is the only writer,
  // and it only assigns when the dimensions actually CHANGE — the joystick
  // rule below is a computed that reads this, and a fresh object per frame
  // would invalidate it sixty times a second to produce the same answer.
  const canvasMetrics = ref<{ w: number; h: number }>({ w: 0, h: 0 })

  const noteCanvasMetrics = (w: number, h: number): void => {
    const cur = canvasMetrics.value
    if (cur.w !== w || cur.h !== h) canvasMetrics.value = { w, h }
  }

  // ── Arena fit (presentation only — @/use/arenaFit) ──────────────────────
  // One transform (css px per arena unit + screen centre) shared by the
  // render, the static bake, the joystick overlay and pixelToGame, so input
  // maps exactly onto what is drawn. Fitted to the current layout's outline
  // + towers, clear of the HUD rects the view reports (setArenaFitHud).
  // Never feeds the simulation: PvP peers stay bit-identical.
  let fitHud: FitRect[] = []
  let fitInsets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  let fitHudRev = 0
  let fitCacheKey = ''
  let fitTarget: ArenaView = { scale: 1, cx: 0, cy: 0 }
  // Short ease when the target changes at a constant viewport size (a HUD
  // element appearing, the next stage's layout) instead of a snap.
  let fitShown: ArenaView | null = null
  let fitFrom: ArenaView | null = null
  let fitTweenStart = 0
  let fitTweenSize = ''
  const FIT_TWEEN_MS = 260
  // `?fit=legacy` — the old 2R + 76 circle fit, for before/after A/B.
  const LEGACY_FIT = typeof location !== 'undefined' && /[?&]fit=legacy(?:&|$)/.test(location.search)
  /** The view reports the opaque HUD rects over the canvas (css px) and the
   *  device safe-area insets. */
  const setArenaFitHud = (rects: readonly FitRect[], insets: FitInsets): void => {
    const next = JSON.stringify([rects.map(r => [Math.round(r.x0), Math.round(r.y0), Math.round(r.x1), Math.round(r.y1)]), insets])
    if (next === JSON.stringify([fitHud.map(r => [Math.round(r.x0), Math.round(r.y0), Math.round(r.x1), Math.round(r.y1)]), fitInsets])) return
    fitHud = rects.map(r => ({ ...r }))
    fitInsets = { ...insets }
    fitHudRev++
  }
  const arenaFitTarget = (w: number, h: number): ArenaView => {
    const key = `${w}x${h}:${typeof window !== 'undefined' ? window.devicePixelRatio : 1}:${arenaShape.value}:${towers.map(t => `${t.x.toFixed(1)},${t.y.toFixed(1)},${t.radius}`).join(';')}:${fitHudRev}`
    if (key !== fitCacheKey) {
      fitCacheKey = key
      // Never past the painted trees' own resolution on this display.
      const dpr = typeof window !== 'undefined' ? Math.min(3, Math.max(1, window.devicePixelRatio || 1)) : 1
      const cap = towers.reduce((m, t) => Math.min(m, towerArtMaxScale(t.radius, dpr)), Infinity)
      const pts = arenaFitPoints(arenaShape.value, ARENA_RADIUS, towers)
      const hudPts = arenaFitPoints(arenaShape.value, ARENA_RADIUS, towers, 'tucked', FIT_HUD_OUTLINE_MARGIN)
      fitTarget = LEGACY_FIT ? legacyArenaView(w, h) : fitArenaView(w, h, pts, fitInsets, fitHud, cap, hudPts)
      if (import.meta.env.DEV) {
        // Fit decision for the harness / console: which rule held the zoom.
        const free = fitArenaView(w, h, pts, fitInsets, [])
        const fill = fillRatio(fitTarget, pts, w, h, fitInsets)
        ;(window as unknown as { __arenaFitDebug?: unknown }).__arenaFitDebug = {
          w, h, dpr, shape: arenaShape.value, scale: +fitTarget.scale.toFixed(4), artCap: +cap.toFixed(4),
          edgeOnly: +free.scale.toFixed(4), fillX: +fill.x.toFixed(3), fillY: +fill.y.toFixed(3),
          bound: fitTarget.scale >= cap * 0.999 ? 'art' : fitTarget.scale >= free.scale * 0.999 ? 'edge' : 'hud'
        }
      }
    }
    return fitTarget
  }
  const arenaViewFor = (w: number, h: number): ArenaView => {
    const target = arenaFitTarget(w, h)
    const size = `${w}x${h}`
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    if (fitShown === null || size !== fitTweenSize) {
      // First frame or a resize: snap (the whole screen changes anyway).
      fitShown = target
      fitFrom = null
      fitTweenSize = size
      return target
    }
    if (fitFrom === null && fitShown !== target &&
      (fitShown.scale !== target.scale || fitShown.cx !== target.cx || fitShown.cy !== target.cy)) {
      fitFrom = fitShown
      fitTweenStart = now
    }
    if (fitFrom !== null) {
      const u = Math.min(1, (now - fitTweenStart) / FIT_TWEEN_MS)
      if (u >= 1) {
        fitFrom = null
        fitShown = target
        return target
      }
      const e = u * u * (3 - 2 * u)
      // Re-aim mid-tween if the target moved again.
      const v: ArenaView = {
        scale: fitFrom.scale + (target.scale - fitFrom.scale) * e,
        cx: fitFrom.cx + (target.cx - fitFrom.cx) * e,
        cy: fitFrom.cy + (target.cy - fitFrom.cy) * e
      }
      fitShown = v
      if (u >= 1) fitFrom = null
      return v
    }
    fitShown = target
    return target
  }
  /** Screen layout of the fitted board (css px, the settled target view):
   *  the board's important extent and the player's tree (sprite + gauge) —
   *  the view keeps DOM hints (the drag hint) off them. */
  const arenaScreenLayout = (w: number, h: number): { board: FitRect; playerTree: FitRect | null } => {
    const v = arenaFitTarget(w, h)
    const b = fitPointsBounds(arenaFitPoints(arenaShape.value, ARENA_RADIUS, towers))
    const px = (r: FitRect): FitRect => ({ x0: v.cx + r.x0 * v.scale, y0: v.cy + r.y0 * v.scale, x1: v.cx + r.x1 * v.scale, y1: v.cy + r.y1 * v.scale })
    // Union of the player's standing trees (1–3).
    let tree: FitRect | null = null
    for (const t of towers) {
      if (t.side !== 'player' || t.hp <= 0) continue
      const r = px({ x0: t.x - t.radius * 1.45, y0: t.y - t.radius * 1.5, x1: t.x + t.radius * 1.45, y1: t.y + t.radius * 1.3 })
      tree = tree === null ? r : { x0: Math.min(tree.x0, r.x0), y0: Math.min(tree.y0, r.y0), x1: Math.max(tree.x1, r.x1), y1: Math.max(tree.y1, r.y1) }
    }
    return { board: px(b), playerTree: tree }
  }
  const viewKeyOf = (v: ArenaView): string => `${v.scale.toFixed(5)},${v.cx.toFixed(2)},${v.cy.toFixed(2)}`

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
    if (dist / ARENA_RADIUS < JOYSTICK_EDGE_THRESHOLD) return false

    return true
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
  /** Random-search bot style for this match (null: the campaign NPC). */
  let npcPlay: NpcPlayStyle | null = null
  /** This NPC turn's think time (a bot draws a human-like one per turn). */
  let npcThinkTarget = NPC_THINK_MS

  // ── Meteor shower (pre-battle intro beat — src/use/meteorShower.ts) ─────
  // One pooled, allocation-free shower per arena instance; presentation only.
  const meteorFx = createMeteorShower()
  if (import.meta.env.DEV) installMeteorDevHook(meteorFx)
  // Default: the ring burst (src/use/ringShower.ts, chaos-arena style);
  // `?meteor=strike` = the kept strike variant above (ui-catalog §7.2).
  const ringFx = createRingShower()
  if (import.meta.env.DEV) installRingDevHook(ringFx)
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

  // ── Background SKIN rendering ───────────────────────────────────────────
  // The arena background is the currently-equipped bg skin (see useBgSkins).
  // The default skin is the arena theme's backdrop (arenaBackdrop.ts, baked
  // into the static layer below). Premium skins tile a real
  // image when one is present + loaded, otherwise fall back to a cached
  // gradient placeholder. Read fresh each frame so a selection change applies
  // immediately.
  const bgSkinImages = new Map<string, HTMLImageElement>()
  const bgSkinPatterns = new Map<string, CanvasPattern | null>()

  const FOREST_BACKDROP = '#24452a'
  const resolveBgFill = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): string | CanvasPattern | CanvasGradient => {
    const skin = selectedBgSkin.value
    // Default backdrop: flat deep forest green until the art desk paints a
    // Tree Smashers backdrop (the old tile still shows Chaos Arena sigils).
    if (skin.id === DEFAULT_BG_SKIN_ID) return FOREST_BACKDROP
    // Real artwork (dropped in later) tiles when available …
    if (skin.img) {
      let img = bgSkinImages.get(skin.id)
      if (!img) {
        img = new Image()
        img.src = prependBaseUrl(skin.img)
        bgSkinImages.set(skin.id, img)
      }
      if (img.complete && img.naturalWidth > 0) {
        let pat = bgSkinPatterns.get(skin.id)
        if (pat === undefined) {
          pat = ctx.createPattern(img, 'repeat')
          bgSkinPatterns.set(skin.id, pat)
        }
        if (pat) return pat
      }
    }
    // … otherwise the skin's middle colour, flat (no gradients around the arena).
    return skin.colors[1]
  }

  /** Load state of a premium skin's tile (in the static layer's key: the
   *  first frames bake before it decodes, and that fallback must not stick). */
  const bgImageReady = (): boolean => {
    const skin = selectedBgSkin.value
    if (skin.id === DEFAULT_BG_SKIN_ID) return true
    if (skin.img) {
      const img = bgSkinImages.get(skin.id)
      return !!img && img.complete && img.naturalWidth > 0
    }
    return true
  }

  // ─── ONE static layer ──────────────────────────────────────────────
  //
  // Everything that does not move within a match is baked ONCE into a single
  // device-resolution buffer (the canvas's own backing size — render-sharpness
  // rule: never below css × dpr): the background (the arena theme's painted
  // backdrop + props on the default skin, the skin's fill otherwise), the
  // clearing floor, the wooden rim, the terrain features and the standing
  // tower bodies. A frame is ONE 1:1 drawImage of it plus the dynamic layers.
  // Re-baked only when the canvas size / dpr, the skin, the arena type /
  // shape / layout / theme, a tower's alive state or the load state of any
  // baked art changes. One buffer, reused across re-bakes (re-allocated only on
  // a size change, the old one dropped first) — no second full-screen canvas.
  // Purely visual: reads match state, never writes it.
  let staticLayer: HTMLCanvasElement | OffscreenCanvas | null = null
  let staticLayerKey = ''

  /** The theme dressing the current arena (arenaThemes.ts — decorative only). */
  const arenaTheme = (): ArenaTheme => themeFor(arenaType.value, terrain?.id ?? null)

  const drawStaticLayer = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    shakeX = 0,
    shakeY = 0
  ) => {
    const cw = ctx.canvas?.width ?? Math.round(w)
    const ch = ctx.canvas?.height ?? Math.round(h)
    const bw = Math.max(1, cw)
    const bh = Math.max(1, ch)
    const dpr = bw / Math.max(1, w)
    const skin = selectedBgSkin.value
    const theme = arenaTheme()
    const backdrop = skin.id === DEFAULT_BG_SKIN_ID
    const key = `${bw}x${bh}:${w}x${h}:${skin.id}:${bgImageReady() ? 'r' : 'p'}:${theme}:` +
      `${backdrop ? `${backdropArtRevision()}:${terrain?.id ?? '-'}:${arenaShape.value}` : '-'}:` +
      `${arenaStaticKey()}:${towerBakeKey()}:${viewKeyOf(arenaViewFor(w, h))}`
    if (key !== staticLayerKey || !staticLayer) {
      if (!staticLayer || staticLayer.width !== bw || staticLayer.height !== bh) {
        staticLayer = null
        if (typeof OffscreenCanvas !== 'undefined') {
          staticLayer = new OffscreenCanvas(bw, bh)
        } else {
          const el = document.createElement('canvas')
          el.width = bw
          el.height = bh
          staticLayer = el
        }
      }
      const b = staticLayer.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null
      if (!b) {
        // No buffer context (memory pressure, exotic browser) — fall back to
        // the direct fill rather than leaving the frame unpainted.
        ctx.fillStyle = resolveBgFill(ctx, w, h)
        ctx.fillRect(0, 0, w, h)
        return
      }
      const view = arenaViewFor(w, h)
      const cx = view.cx * dpr
      const cy = view.cy * dpr
      const unit = dpr * view.scale
      b.setTransform(1, 0, 0, 1, 0, 0)
      if (backdrop) {
        paintArenaBackdrop(b, bw, bh, cx, cy, unit, theme, terrain?.id ?? null, arenaShape.value)
      } else {
        b.setTransform(dpr, 0, 0, dpr, 0, 0)
        b.fillStyle = resolveBgFill(b as CanvasRenderingContext2D, w, h)
        b.fillRect(0, 0, w, h)
      }
      b.setTransform(unit, 0, 0, unit, cx, cy)
      renderArenaStatic(b)
      bakeTowerBodies(b)
      b.setTransform(1, 0, 0, 1, 0, 0)
      staticLayerKey = key
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(staticLayer as CanvasImageSource, shakeX, shakeY)
    // Camera shake (whole device px): the strip the shifted blit uncovers is
    // filled from the unshifted layer, pixel for pixel (no resampling).
    if (shakeX !== 0 || shakeY !== 0) {
      const src = staticLayer as CanvasImageSource
      if (shakeX > 0) ctx.drawImage(src, 0, 0, shakeX, bh, 0, 0, shakeX, bh)
      else if (shakeX < 0) ctx.drawImage(src, bw + shakeX, 0, -shakeX, bh, bw + shakeX, 0, -shakeX, bh)
      if (shakeY > 0) ctx.drawImage(src, 0, 0, bw, shakeY, 0, 0, bw, shakeY)
      else if (shakeY < 0) ctx.drawImage(src, 0, bh + shakeY, bw, -shakeY, 0, bh + shakeY, bw, -shakeY)
    }
    ctx.restore()
  }

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

  // Plush smashers don't blow up: their cotton stuffing billows out (stuffingFx.ts).
  const activeStuffing: StuffingBurst[] = []
  const spawnExplosion = (x: number, y: number, radius: number) => {
    playSound('explosion-1')
    spawnStuffing(activeStuffing, x, y, radius, FX.low)
  }

  // ── Static Charge lightning bolt VFX ──────────────────────────────────────
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

  // ── Contact VFX (lava flame-burn, heal pulse) ──────────────────────────
  // Pooled state + draw code live in `@/use/borderFx` (unit-tested there).
  // Burn caps: low tier / Firefox get fewer concurrent instances, and on low
  // a burn plays one pass per contact instead of being held alight. Heals are
  // never capped — every heal of ≥1 HP reads; low tier draws the cheap pulse instead.
  const borderFx = createBorderFx()
  // Dev-only read handle for QA scripts (capture a screenshot while a burn /
  // heal is actually live). Never runs in a production build — DEV is false
  // there (verified: `window.__borderFx` is undefined on the built game),
  // though the obfuscator can leave the dead branch's string in the bundle.
  if (import.meta.env.DEV) (window as unknown as { __borderFx?: unknown }).__borderFx = borderFx
  const burnCap = (): number => (FX.low ? 2 : isFirefox ? 3 : BORDER_FX_POOL_SIZE)
  /**
   * The ONE hook every HP-raising code path calls after it changed (and
   * clamped at maxHp) `hp`. A heal only READS when the HP actually applied is
   * at least 1: then the heal pulse plays on the blade (if alive; no stacking
   * — a pulse already running keeps playing untouched, see `triggerHeal`) and
   * the returned value is the rounded amount the call site shows as the heal
   * number. Below 1 HP applied it returns 0 — no pulse, no number (the HP
   * still went up). VFX only: reads hp, never writes physics state and never
   * draws from matchRng. The epsilon absorbs float loss in `(x + 1) - x`.
   */
  const healFx = (blade: SpinnerState, hpBefore: number): number => {
    const applied = blade.hp - hpBefore
    if (applied < 1 - 1e-9 || blade.hp <= 0) return 0
    triggerHeal(borderFx, blade)
    return Math.round(applied)
  }
  // The flame strip is only fetched where it can be drawn: warmed by
  // initGame for a lava arena (and by the deferred preload tier when the
  // current stage is lava), or on the first burn if the arena was switched
  // some other way. Same shared HTMLImageElement either way.
  let flameImg: HTMLImageElement | null = null
  const flameImage = (): HTMLImageElement =>
    flameImg ?? (flameImg = getCachedImage(prependBaseUrl(FLAME_BURN_SRC)))

  // Drops every live battle VFX layer. Used on surrender / forced
  // game-over so stale shock bolts and sparks don't linger into the
  // reward screen after physics stops ticking.
  const clearBattleVfx = () => {
    activeShockBolts.length = 0
    activeSparks.length = 0
    activeExplosions.length = 0
    activeStuffing.length = 0
    resetBorderFx(borderFx)
    // Skill layer: rockets still in flight are dropped with the battle.
    if (SKILLS_BUILD) {
      clearRockets()
      if (skillVfx !== null) skillPort?.['resetSkillVfx'](skillVfx)
      if (skillCallouts !== null) skillPort?.['resetSkillCallouts'](skillCallouts)
    }
    if (BOSSES100_BUILD && bossTraitFx !== null) bossPort?.['resetBossTraitVfx'](bossTraitFx)
  }

  const MAX_ACTIVE_VFX = isFirefox ? 2 : 10
  const maxActiveVfx = (): number => (FX.low ? 2 : MAX_ACTIVE_VFX)
  const spawnShockBolt = (wallX: number, wallY: number, bladeX: number, bladeY: number) => {
    if (activeShockBolts.length >= maxActiveVfx()) return
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

  // ── Tree Smashers terrain + team towers (see @/use/arenaTerrain) ─────────
  /** This match's layout (null = plain arena). Its islands are the static
   *  ricochet discs (`bounceOffIslands`); the old pinball bumpers are gone —
   *  the terrain solids are the arena's only floor obstacles. */
  let terrain: TerrainLayout | null = null
  /** Team towers ([] = towers off). Host-frame-independent: index by side. */
  const towers: TeamTower[] = []
  // DEV-only handle for screenshot / VFX harnesses (stage a damaged tower).
  if (import.meta.env.DEV) (window as unknown as { __smashersTowers?: TeamTower[] }).__smashersTowers = towers
  /** Per-blade ground state (booster cooldown, deep-hole exemption), by id. */
  const groundStates = new Map<number, GroundState>()
  const groundOut: GroundEffect = { boosted: false, stopped: false, inMud: false }
  const solidOut = newSolidEffect()
  /** Per blade→tower last contact (gameTime) for the one-hit-per-contact gate. */
  const towerContactTimes = new Map<string, number>()
  /** Destruction debris of a fallen tower (VFX only). */
  interface TowerDebris { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number }
  const towerDebris: TowerDebris[] = []
  /** Splinter bursts + leaf cascades (pooled, VFX only — @/use/towerHitFx).
   *  Capped off the shared VFX budget; off entirely on the low tier. */
  const towerFx = createTowerFx(MAX_ACTIVE_VFX * 12)
  /** #UX3 balloon bursts (pooled, VFX only — @/use/balloonPopFx). Only on a
   *  balloon build (VITE_APP_BALOON_HP_BAR); Firefox gets a smaller pool, the
   *  low tier draws the bang star only. */
  const balloonFx: BalloonPopFx | null = BALLOON_HP_BUILD ? createBalloonPopFx(isFirefox ? 40 : BALLOON_FX_CAP) : null
  // Painted balloons + pop debris (@/use/balloonArt): start the atlas early;
  // until it lands (or with ?art=procedural) the procedural shapes draw.
  if (BALLOON_HP_BUILD) preloadBalloonArt()
  if (import.meta.env.DEV) {
    (window as unknown as { __smashersTowerFx?: unknown }).__smashersTowerFx = {
      fx: towerFx,
      hit: (i: number, dmg = 20) => {
        const t = towers[i]
        if (!t) return
        const ny = t.y > 0 ? -1 : 1
        spawnSplinters(towerFx, t.x, t.y + ny * t.radius, 0, ny, t.radius, dmg)
        t.flash = 1
      }
    }
  }
  const groundStateOf = (blade: SpinnerState): GroundState => {
    let gs = groundStates.get(blade.id)
    if (!gs) {
      gs = newGroundState()
      groundStates.set(blade.id, gs)
    }
    return gs
  }
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
  // from grinding against a wall/island) and piling up clash SFX, spark
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

  // ── Blade looks (smasher on a turning disc) ────────────────────────────
  // Which smasher + skin a blade wears, cached per blade id. NPC blades
  // without a smasherId look like the smasher of their parts.
  /** Render-only facing of a smasher (never gameplay state). Yaw convention:
   *  0 faces the camera (+y, screen-down); the rig turns clockwise on
   *  screen, so the character looks along (−sin yaw, cos yaw). */
  interface BladeLook {
    smasherId: SmasherId; modelId?: string; rim: string
    yaw: number
    /** Yaw the character turns toward (launch / aim direction); null = hold. */
    target: number | null
    /** Spin from the last impact, rad per frame, decays to 0. */
    spin: number
    moving: boolean
    lastHit: number
    lastWalls: number
    lastVx: number
    lastVy: number
    /** An impact spin is running: when it settles, ease to the gameplay heading. */
    faceHeading: boolean
  }
  const bladeYawState = new Map<number, BladeLook>()
  // DEV-only handle for the store-screenshot harness: drop cached looks after
  // re-dressing a blade's config.smasherId so the next frame redraws it.
  if (import.meta.env.DEV) (window as unknown as { __smashersLooks?: { clear: () => void } }).__smashersLooks = { clear: () => bladeYawState.clear() }

  const getBladeLook = (blade: SpinnerState): BladeLook => {
    let look = bladeYawState.get(blade.id)
    if (!look) {
      if (bladeYawState.size > 256) bladeYawState.clear()
      const cfg = blade.config
      const modelId = cfg.modelId ?? (blade.owner === 'player' ? getSelectedSkin(cfg.topPartId) : undefined)
      const smasherId = isSmasherId(cfg.smasherId)
        ? cfg.smasherId
        : smasherForParts(cfg.topPartId, cfg.bottomPartId, modelId ?? `${cfg.topPartId}_${blade.owner}`)
      look = {
        smasherId,
        modelId,
        rim: blade.owner === 'player' ? '#3f7fd8' : '#d8433f',
        // Start facing the opponents' side: player row looks up, NPCs down.
        yaw: blade.owner === 'player' ? Math.PI : 0,
        target: null,
        spin: 0,
        moving: false,
        lastHit: blade.lastHitTime,
        lastWalls: blade.wallBounceCount,
        lastVx: blade.vx,
        lastVy: blade.vy,
        faceHeading: false
      }
      bladeYawState.set(blade.id, look)
    }
    return look
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
  // Low tier keeps a visibly shorter tail: fewer retained points means fewer
  // stroked segments AND less translucent fill area, which is what the
  // rasteriser actually charges for.
  const TRAIL_DURATION_LOW = 420
  const trailDuration = (): number => (FX.low ? TRAIL_DURATION_LOW : TRAIL_DURATION)
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
      const maxAge = trailDuration()
      let pruneCount = 0
      while (pruneCount < pts.length && now - pts[pruneCount]!.time > maxAge) {
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
  // Rendered in renderBladeMarkers so it layers correctly.

  const updateSpecialSkinVFX = (blades: SpinnerState[], now: number) => {
    // Dark cloud emission
    for (const blade of blades) {
      if (blade.hp <= 0) continue
      const spd = speed(blade)
      if (blade.config.modelId !== 'dark' || spd < 0.5) continue
      // Emit 1-2 cloud particles per frame when moving
      const count = spd > 3 ? 2 : 1
      for (let i = 0; i < count; i++) {
        if (cloudParticles.length >= (FX.low ? 40 : 120)) break
        const angle = Math.random() * Math.PI * 2 // vfx-rng
        const drift = 0.2 + Math.random() * 0.3 // vfx-rng
        const maxLife = 400 + Math.random() * 300 // vfx-rng
        cloudParticles.push({
          x: blade.x + (Math.random() - 0.5) * blade.radius, // vfx-rng
          y: blade.y + (Math.random() - 0.5) * blade.radius, // vfx-rng
          vx: Math.cos(angle) * drift,
          vy: Math.sin(angle) * drift,
          life: maxLife,
          maxLife,
          size: 8 + Math.random() * 6, // vfx-rng
          alpha: 0.7 + Math.random() * 0.3, // vfx-rng
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
      if (groundDecals.length >= (FX.low ? 25 : 80)) break
      groundDecals.push({
        x: blade.x, y: blade.y,
        size: blade.radius * (0.6 + spd * 0.04),
        time: now,
        rotation: Math.random() * Math.PI * 2 // vfx-rng
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
        if (sandGrains.length >= (FX.low ? 50 : 150)) break
        const angle = Math.random() * Math.PI * 2 // vfx-rng
        const drift = 0.15 + Math.random() * 0.25 // vfx-rng
        const maxLife = 350 + Math.random() * 250 // vfx-rng
        const colors = ['#e8c870', '#d4a855', '#c49040', '#bf8f3a', '#a87530']
        sandGrains.push({
          x: blade.x + (Math.random() - 0.5) * blade.radius * 1.2, // vfx-rng
          y: blade.y + (Math.random() - 0.5) * blade.radius * 1.2, // vfx-rng
          vx: Math.cos(angle) * drift,
          vy: Math.sin(angle) * drift,
          life: maxLife,
          maxLife,
          size: 1 + Math.random() * 2, // vfx-rng
          color: colors[Math.floor(Math.random() * colors.length)]! // vfx-rng
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
    comboText?: string  // text popup (momentum stacks, armour, tower destroyed)
    /** Banner text: centred on x instead of left-aligned (tower smashed). */
    centered?: boolean
    /** Skill popup: 12 px skill icon left of the number (§8.2). With
     *  `value === 0` and no comboText the popup is the glyph alone. Boss
     *  traits add their own glyphs (Frostbite's snowflake, bosses §7.3). */
    glyph?: SkillId | BossTraitGlyph
    /** Lucky Edge: crit-style orange ×1.5 number WITHOUT the crit shadowBlur. */
    isLucky?: boolean
  }

  const DAMAGE_NUMBER_LIFE = 900
  const damageNumbers: DamageNumber[] = []

  // ── Floating Powerup Pickup Indicators ──────────────────────────────────
  // What the box granted, spelled out: the stat icon + "+25% Attack" (i18n,
  // `powerups.*`), with a gold outline so it reads on any arena floor. It
  // pops in, HOLDS readable for most of its life, drifts up a little and only
  // fades at the end — ~2 s, a second longer than the old "+ATK" tag.
  interface PowerupFloat {
    x: number
    y: number
    stat: PowerupStat
    label: string
    life: number
    maxLife: number
  }

  const POWERUP_FLOAT_LIFE = 2100
  /** Upward drift over the whole life, arena units (eased out). */
  const POWERUP_FLOAT_RISE = 34
  const POWERUP_FLOAT_POP_MS = 220
  const POWERUP_FLOAT_FADE_MS = 500
  const powerupFloats: PowerupFloat[] = []
  // The stat colours the Team modal and stat cards use (defense = blue).
  const POWERUP_FLOAT_COLOR: Record<PowerupStat, string> = {
    attack: '#f87171',
    defense: '#60a5fa',
    speed: '#22d3ee'
  }

  /** The boost as a localized number (1.25 → "25"); where the sign and the
   *  percent go is each locale's `powerups.*` copy. */
  const powerupPct = (): string => fmtNum(Math.round((POWERUP_BUFF_MULTIPLIER - 1) * 100), activeLocale())

  const spawnPowerupFloat = (x: number, y: number, stat: PowerupStat) => {
    if (powerupFloats.length >= 25) return
    powerupFloats.push({
      x,
      y,
      stat,
      label: translate(`powerups.${stat}`, { pct: powerupPct() }),
      life: POWERUP_FLOAT_LIFE,
      maxLife: POWERUP_FLOAT_LIFE
    })
  }

  const updatePowerupFloats = (dt: number) => {
    let w = 0
    for (let i = 0; i < powerupFloats.length; i++) {
      const pf = powerupFloats[i]!
      pf.life -= dt
      if (pf.life > 0) powerupFloats[w++] = pf
    }
    powerupFloats.length = w
  }

  const renderPowerupFloats = (ctx: CanvasRenderingContext2D) => {
    for (const pf of powerupFloats) {
      const age = pf.maxLife - pf.life
      const t = age / pf.maxLife
      // pop 0.6 → ~1.05 → 1.0 over the first POP ms, then steady
      const pop = Math.min(1, age / POWERUP_FLOAT_POP_MS)
      const scale = 0.6 + 0.4 * pop + 0.25 * Math.sin(pop * Math.PI)
      const alpha = Math.min(1, pf.life / POWERUP_FLOAT_FADE_MS)
      const y = pf.y - 44 - POWERUP_FLOAT_RISE * (1 - (1 - t) * (1 - t))
      const color = POWERUP_FLOAT_COLOR[pf.stat]

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `900 ${Math.round(20 * scale)}px Nunito, Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const textWidth = ctx.measureText(pf.label).width
      const iconSize = 30 * scale
      const gap = 4 * scale
      const startX = pf.x - (iconSize + gap + textWidth) / 2

      // Icon — the painted stat icon, else the drawn glyph with a gold rim.
      const icon = statIconImage(pf.stat)
      if (uiArtReady(icon)) {
        ctx.drawImage(icon, startX, y - iconSize / 2, iconSize, iconSize)
      } else {
        const iconPath = getPowerupIconPath(pf.stat)
        ctx.save()
        ctx.translate(startX + iconSize / 2, y)
        const k = (iconSize * 0.8) / 24
        ctx.scale(k, k)
        ctx.translate(-12, -12)
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4
        ctx.strokeStyle = '#facc15'
        ctx.stroke(iconPath)
        ctx.fillStyle = color
        ctx.fill(iconPath)
        ctx.lineWidth = 1.5
        ctx.strokeStyle = '#0f1a30'
        ctx.stroke(iconPath)
        ctx.restore()
      }

      // Text: gold outer ring, dark outline, stat-coloured fill.
      const textX = startX + iconSize + gap + textWidth / 2
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)'
      ctx.lineWidth = 8 * scale
      ctx.strokeText(pf.label, textX, y)
      ctx.strokeStyle = '#0f1a30'
      ctx.lineWidth = 4 * scale
      ctx.strokeText(pf.label, textX, y)
      ctx.fillStyle = color
      ctx.fillText(pf.label, textX, y)

      ctx.restore()
    }
  }


  const spawnDamageNumber = (
    x: number, y: number, value: number, dealerOwner: 'player' | 'npc', isCrit = false,
    glyph?: SkillId, isLucky = false, colorOverride?: string
  ) => {
    if (Math.round(value) <= 0) return
    // Random angle in a 60° cone pointing upward (centered at -90°)
    const baseAngle = -Math.PI / 2
    const spread = (Math.PI / 3) // 60°
    const angle = baseAngle + (Math.random() - 0.5) * spread // vfx-rng
    const speed = 0.06 + Math.random() * 0.03 // vfx-rng

    if (damageNumbers.length >= 60) return
    const dn: DamageNumber = {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      value: Math.round(value),
      color: colorOverride ?? (dealerOwner === 'player' ? '#66aaff' : '#ff6666'),
      life: DAMAGE_NUMBER_LIFE,
      maxLife: DAMAGE_NUMBER_LIFE,
      isCrit
    }
    if (glyph !== undefined) dn.glyph = glyph
    if (isLucky) dn.isLucky = true
    damageNumbers.push(dn)
  }

  // Skill popup colours (§8.4): the player's skills read blue/cyan/green, the
  // opponent's (PvP / ghost) red; hazards keep their own colours.
  const SKILL_COLOR_SHIELD = '#67e8f9'
  const SKILL_COLOR_HEAL = '#44cc66'
  const SKILL_COLOR_MIRROR = '#60a5fa'
  const SKILL_COLOR_ENEMY = '#ff6666'
  const SKILL_POPUP_THROTTLE_MS = 250
  // Glyph-only popups (Phase, Static, stun-skip): one per blade per 250 ms.
  const skillPopupAt = new Map<number, number>()

  /** A glyph-only skill popup over a blade (throttled per blade, VFX only). */
  const spawnSkillGlyph = (blade: SpinnerState, glyph: SkillId | BossTraitGlyph, color: string) => {
    const now = performance.now()
    const last = skillPopupAt.get(blade.id)
    if (last !== undefined && now - last < SKILL_POPUP_THROTTLE_MS) return
    if (damageNumbers.length >= 60) return
    skillPopupAt.set(blade.id, now)
    damageNumbers.push({
      x: blade.x, y: blade.y - blade.radius * 0.6,
      vx: 0, vy: -0.05,
      value: 0, color,
      life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
      isCrit: false, glyph
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
      const scale = (dn.isCrit || dn.isLucky) ? baseScale * 1.5 : baseScale
      const glyphOnly = dn.glyph !== undefined && dn.value === 0 && !dn.comboText
      const text = dn.comboText ?? (glyphOnly ? '' : dn.value.toString())

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `900 ${Math.round(20 * scale)}px Nunito, Arial, sans-serif`
      ctx.textAlign = dn.comboText && !dn.centered ? 'left' : 'center'
      ctx.textBaseline = 'middle'

      // Skill glyph (§8.2): 12 px icon left of the number, or alone.
      if (dn.glyph !== undefined) {
        const gs = 12 * scale
        // Width estimate (digits ≈ 0.56 em in bold Arial) — no measureText per frame.
        const gx = glyphOnly ? dn.x : dn.x - text.length * 20 * scale * 0.28 - gs * 0.6
        if (BOSSES100_BUILD && bossPort !== null && bossPort['isBossTraitGlyph'](dn.glyph)) {
          bossPort['drawBossTraitGlyph'](ctx, dn.glyph, gx, dn.y, glyphOnly ? gs * 1.4 : gs, dn.color)
        } else if (SKILLS_BUILD) {
          // Not a boss glyph (or no boss port): a skill id.
          skillPort?.['drawSkillGlyph'](ctx, dn.glyph as SkillId, gx, dn.y, glyphOnly ? gs * 1.4 : gs, dn.color)
        }
      }

      if (glyphOnly) {
        // nothing else to draw
      } else if (dn.isLucky && !dn.isCrit) {
        // Lucky Edge: crit colours and size, never the crit shadowBlur.
        ctx.strokeStyle = '#161a40'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeText(text, dn.x, dn.y)
        ctx.fillStyle = '#ff8800'
        ctx.fillText(text, dn.x, dn.y)
      } else if (dn.isCrit) {
        // Crit: dark orange pulsating aura
        // (flat translucent outer stroke instead of shadowBlur — perf rule)
        if (!FX.low) {
          ctx.strokeStyle = `rgba(204, 102, 0, ${(0.35 + critPulse * 0.25).toFixed(3)})`
          ctx.lineWidth = 9 + critPulse * 4
          ctx.lineJoin = 'round'
          ctx.strokeText(text, dn.x, dn.y)
        }
        ctx.strokeStyle = '#161a40'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeText(text, dn.x, dn.y)
        ctx.fillStyle = '#ff8800'
        ctx.fillText(text, dn.x, dn.y)
      } else {
        // Text shadow (game-text style: black border)
        ctx.strokeStyle = '#161a40'
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
  // Boss sizes: −25 % from the old 1.6× / 1.2× (owner, 2026-10-21).
  const BOSS_RADIUS_MULT = 1.2
  const HEALER_RADIUS_MULT = 0.9
  // Healer-boss: HP restored per ally-contact, capped so it's chip-heal only.
  const HEALER_CONTACT_HEAL = 2
  const HEALER_HEAL_COOLDOWN_MS = 250
  const healerHealCooldowns = new Map<string, number>()

  const speed = (blade: SpinnerState): number =>
    Math.sqrt(blade.vx * blade.vx + blade.vy * blade.vy)

  // ── Smasher mechanics: heading + directional armour (smasherMechanics.ts)
  /** Any blade of this match carries directional armour (hash + hit path). */
  let armorActive = false
  const headingX = (b: SpinnerState): number => b.hx ?? 0
  const headingY = (b: SpinnerState): number => b.hy ?? defaultHeadingY(b.owner)
  /** Hit zone on `def` for a contact whose unit direction from def's centre
   *  is (ux, uy). */
  const zoneOf = (def: SpinnerState, ux: number, uy: number): ArmorZone =>
    armorZone(headingX(def), headingY(def), ux, uy)
  /** The side Thorns covers: the reinforced cone (back when the armour is
   *  stronger behind, else the front — also for unarmoured bearers). */
  const spikedZone = (b: SpinnerState): ArmorZone =>
    b.armor !== undefined && b.armor.back < b.armor.front ? ZONE_BACK : ZONE_FRONT

  /**
   * Spawn settle for non-default disc sizes: push blades out of team towers
   * and islands, apart from each other, and back inside the arena, a few
   * deterministic passes in syncKey order. Runs only when a blade's disc is
   * not 1× — `disc` carries the team-size multiplier too (×0.9 base), so in
   * practice every match; a spawn already clear of everything never moves.
   */
  const settleSpawnOverlaps = (): void => {
    const blades = [...allBlades.value].sort((p, q) => p.syncKey - q.syncKey)
    const GAP = 3
    // Also with 1× discs when a spawn lands on a tree (2–3 trees per side
    // reach the deep NPC formation rows). Deterministic, no RNG.
    const onTree = blades.some(b => towers.some(t => Math.hypot(b.x - t.x, b.y - t.y) < b.radius + t.radius + GAP))
    if (!onTree && !blades.some(b => (b.disc ?? 1) !== 1)) return
    for (let pass = 0; pass < 8; pass++) {
      let moved = false
      for (const b of blades) {
        for (const t of towers) {
          const dx = b.x - t.x
          const dy = b.y - t.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const min = b.radius + t.radius + GAP
          if (d < min) {
            const ux = d > 0.01 ? dx / d : 0
            const uy = d > 0.01 ? dy / d : (b.owner === 'player' ? -1 : 1)
            b.x = t.x + ux * min
            b.y = t.y + uy * min
            moved = true
          }
        }
        for (const isl of terrain?.islands ?? []) {
          const dx = b.x - isl.x
          const dy = b.y - isl.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const min = b.radius + isl.radius + GAP
          if (d < min) {
            const ux = d > 0.01 ? dx / d : 1
            const uy = d > 0.01 ? dy / d : 0
            b.x = isl.x + ux * min
            b.y = isl.y + uy * min
            moved = true
          }
        }
      }
      for (let i = 0; i < blades.length; i++) {
        for (let j = i + 1; j < blades.length; j++) {
          const a = blades[i]!
          const c = blades[j]!
          const dx = c.x - a.x
          const dy = c.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const min = a.radius + c.radius + GAP
          if (d >= min) continue
          const ux = d > 0.01 ? dx / d : 1
          const uy = d > 0.01 ? dy / d : 0
          const push = (min - d) / 2
          a.x -= ux * push
          a.y -= uy * push
          c.x += ux * push
          c.y += uy * push
          moved = true
        }
      }
      for (const b of blades) {
        const cl = clampInArena(b.x, b.y, b.radius, 2)
        if (cl.x !== b.x || cl.y !== b.y) {
          b.x = cl.x
          b.y = cl.y
          moved = true
        }
      }
      if (!moved) break
    }
  }

  const livingBlades = (blades: SpinnerState[]): SpinnerState[] =>
    blades.filter(b => b.hp > 0)

  const isInvulnerable = (blade: SpinnerState): boolean =>
    blade.invulnerableUntil !== undefined && skillClock() < blade.invulnerableUntil

  let firstGameBoost = false

  // ── Team size (src/data/teamSize.ts) ──────────────────────────────────────
  // Set by initGame from each side's team length, BEFORE any blade is built:
  // the radius multiplier every blade of a side gets (base size × team size)
  // and its damage / max-HP multiplier (×1.2 for a side of one). Derived from
  // the team arrays alone, so both PvP peers compute the same numbers.
  const teamSizeMul = { player: 1, npc: 1 }
  const teamStatMul = { player: 1, npc: 1 }
  /** Both team sizes in the host's frame order — hashed (computeStateHash)
   *  so two peers that disagree on the match's team sizes desync at once. */
  let teamSizeHash = 'ts:1,1'
  /** The NPC team's length at initGame (campaign count compensation). */
  let npcTeamCount = 1
  /** #UX3: each side's team size (balloon count per smasher). Visual only. */
  const balloonTeamSize = { player: 1, npc: 1 }

  // Per-frame stats cache — cleared once per physics tick so statsFor()
  // never recomputes the same blade twice in one frame.
  const _statsCache = new Map<number, SpinnerStats>()

  /** A part-only (no smasher) NPC blade outside PvP: campaign enemies, boss
   *  encounters, league gatekeepers, ghosts — CAMPAIGN_NPC_TUNING applies. */
  const isLegacyNpc = (owner: string, config: SpinnerConfig): boolean =>
    owner === 'npc' && !pvpMode.value && !isSmasherId(config.smasherId)

  const statsFor = (blade: SpinnerState): SpinnerStats => {
    const cached = _statsCache.get(blade.id)
    if (cached) return cached
    const stats = computeStats(blade.config, blade.config.topLevel ?? 0, blade.config.bottomLevel ?? 0)
    let dmg = stats.damageMultiplier
    let def = stats.defenseMultiplier
    let spd = stats.speedMultiplier
    if (firstGameBoost && blade.owner === 'player') dmg *= 2
    if (isLegacyNpc(blade.owner, blade.config)) dmg *= CAMPAIGN_NPC_TUNING.dmgMul
    // A side of one fights boosted (team size 1: ×1.2 damage) — a lone
    // part-only campaign NPC has it offset (CAMPAIGN_NPC_TUNING.soloDmgMul).
    dmg *= teamStatMul[blade.owner]
    if (teamStatMul[blade.owner] !== 1 && isLegacyNpc(blade.owner, blade.config)) dmg *= CAMPAIGN_NPC_TUNING.soloDmgMul
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
    // Frostbite (bosses-100 §4.3): −10 % speed per chill stack, AFTER powerups.
    if (BOSSES100_BUILD && blade.chillN && bossPort !== null) spd *= bossPort['chillSpeedMul'](blade)
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

  // ─── Skills: engine state (skills-feature.md §5, §8, §9.1, §10.3) ───────
  // Rules and numbers live in `skills/skillRuntime.ts` (pure, per-blade RNG
  // streams); this block only wires them into the loop. `blade.skills` is set
  // only for blades whose side has a loadout, and every hook below is behind
  // a `skills !== undefined` / `skillsActive` check, so a match without skills
  // runs the pre-skills code path bit for bit (same state hashes).

  /** Any blade of this match carries skills (fast path for per-tick work). */
  let skillsActive = false
  // Per-SIDE turn counters (Static Charge stuns, §4.10). Incremented when a
  // side launches (beginLaunch) or has its turn skipped. In PvP the host's
  // `playerTurnIndex` equals the guest's `npcTurnIndex` and vice versa, so a
  // `stunnedForTurn` value means the same turn on both peers.
  let playerTurnIndex = 0
  let npcTurnIndex = 0
  // Reusable result objects — the runtime writes into these, never allocates.
  const skillOut = createOutgoingResult()
  const skillIn = createIncomingResult()
  const hpLossOut = createHpLossResult()
  const contactOut = createContactResult<SpinnerState>()
  /** `statsFor` typed for the runtime (one closure for the whole match). */
  const statsForSkill = (b: SkillBlade): SkillRefStats => statsFor(b as SpinnerState)
  /** Skill VFX pools — created from the port on the first skilled match. */
  let skillVfx: SkillVfx | null = null
  /** Proc callouts (skill icon + name + what it did) — VFX only. */
  let skillCallouts: SkillCallouts | null = null

  const turnIndexOf = (owner: 'player' | 'npc'): number =>
    owner === 'player' ? playerTurnIndex : npcTurnIndex
  /** May `blade` move on its team's NEXT turn (alive and not stunned for it)? */
  const isPickable = (blade: SpinnerState): boolean =>
    blade.hp > 0
    && (blade.stunnedForTurn === undefined || !isStunnedFor(blade, turnIndexOf(blade.owner) + 1))
  /** First living, non-stunned blade of a team (auto-select), else null. */
  const firstPickable = (team: SpinnerState[]): SpinnerState | null => {
    for (const b of team) if (isPickable(b)) return b
    return null
  }
  /** VFX predicate: the blade sits out its team's next turn (stun glyph). */
  const isStunnedForVfx = (b: SkillVfxBlade): boolean => {
    const s = b as SpinnerState
    return s.stunnedForTurn !== undefined && s.hp > 0 && isStunnedFor(s, turnIndexOf(s.owner) + 1)
  }
  /** Every living blade of `team` is stunned for team turn `turnIdx`. */
  const teamAllStunned = (team: SpinnerState[], turnIdx: number): boolean => {
    let living = 0
    for (const b of team) if (b.hp > 0) living++
    return living > 0 && countPickable(team, turnIdx) === 0
  }

  // ─── Boss traits: engine state (bosses-100-feature.md §4, §12.2) ────────
  // Rules live in `bosses/bossTraits.ts` (pure, no RNG), reached through the
  // installed port. Every hook below is behind `BOSSES100_BUILD && traitsActive`,
  // so a match without a trait carrier runs the pre-traits code path bit for
  // bit (same state hashes) and a bosses100-off build has none of it. The
  // state objects are allocated by the port on the first trait match.

  /** Any blade of this match carries a boss trait AND the port is in (fast path). */
  let traitsActive = false
  /** Combat clock: advances FIXED_STEP_MS per launched-phase substep. */
  let bossClock: BossClock | null = null
  let traitOut: TraitContactResult | null = null
  let bossTraitFx: BossTraitVfx | null = null
  /** Launch locks of either kind are in play (skills' stuns or Frost Lock). */
  const locksActive = (): boolean => skillsActive || traitsActive
  const teamOf = (owner: 'player' | 'npc'): SpinnerState[] =>
    owner === 'player' ? playerBlades.value : npcBlades.value

  // ── Trait event ring (VFX/SFX feed, HUD, QA) — fixed, overwritten in place;
  // allocated by the port (BOSS_TRAIT_EVENT_BUFFER slots) on the first trait match.
  let bossTraitEvents: BossTraitEvent[] = []
  let bossTraitEventSeq = 0
  const forEachBossTraitEvent = (sinceSeq: number, visit: (ev: Readonly<BossTraitEvent>) => void): number => {
    const size = bossTraitEvents.length
    if (size === 0) return bossTraitEventSeq
    const from = Math.max(sinceSeq, bossTraitEventSeq - size)
    for (let q = from; q < bossTraitEventSeq; q++) visit(bossTraitEvents[q % size]!)
    return bossTraitEventSeq
  }
  const pushTraitEvent = (kind: BossTraitEventKind, trait: BossTrait, blade: SpinnerState, value: number): void => {
    if (!BOSSES100_BUILD || bossPort === null || bossTraitFx === null) return
    const ev = bossTraitEvents[bossTraitEventSeq % bossTraitEvents.length]!
    bossTraitEventSeq++
    ev.seq = bossTraitEventSeq
    ev.t = skillClock()
    ev.kind = kind
    ev.trait = trait
    ev.bladeId = blade.id
    ev.syncKey = blade.syncKey
    ev.owner = blade.owner
    ev.x = blade.x
    ev.y = blade.y
    ev.radius = blade.radius
    ev.value = value
    bossPort['bossTraitVfxEvent'](bossTraitFx, ev, FX.low)
    traitHudDirty = true
  }

  // ── Refused tap on a frozen spinner (§7.3 HUD, BW6): the arena calls
  // `refuseFrozenTap` instead of a silent no-op — a 150 ms render-only shake
  // of the blade plus the refused-freeze crack (shards + boss-crack SFX,
  // throttled 400 ms by bossTraitSfx). Never written to the event ring and
  // never touches physics or the state hash.
  const TAP_SHAKE_MS = 150
  let tapShakeId = -1
  let tapShakeUntil = 0
  let tapCrackEv: BossTraitEvent | null = null
  const refuseFrozenTap = (blade: SpinnerState): void => {
    if (!BOSSES100_BUILD || !traitsActive || bossPort === null || bossTraitFx === null || blade.hp <= 0) return
    tapCrackEv ??= bossPort['createTapCrackEvent']()
    tapShakeId = blade.id
    tapShakeUntil = performance.now() + TAP_SHAKE_MS
    tapCrackEv.t = skillClock()
    tapCrackEv.bladeId = blade.id
    tapCrackEv.syncKey = blade.syncKey
    tapCrackEv.owner = blade.owner
    tapCrackEv.x = blade.x
    tapCrackEv.y = blade.y
    tapCrackEv.radius = blade.radius
    bossPort['bossTraitVfxEvent'](bossTraitFx, tapCrackEv, FX.low)
  }

  // ── HUD (§7.3): one row per LOCAL blade, published only on change.
  const bossTraitHud: ShallowRef<BossTraitHudRows> = shallowRef<BossTraitHudRows>([])
  let traitHudRows: TraitHudRow[] = []
  let traitHudDirty = false
  const publishTraitHud = (force = false): void => {
    if (!BOSSES100_BUILD || bossPort === null) return
    if (!traitHudDirty && !force) return
    traitHudDirty = false
    const team = playerBlades.value
    let changed = force
    while (traitHudRows.length < team.length) {
      traitHudRows.push(bossPort['createTraitHudRow']())
      changed = true
    }
    const next = playerTurnIndex + 1
    for (let i = 0; i < team.length; i++) {
      if (bossPort['writeTraitHud'](team[i]!, next, traitHudRows[i]!)) changed = true
    }
    if (!changed) return
    const rows: TraitHudRow[] = []
    for (let i = 0; i < team.length; i++) rows.push({ ...traitHudRows[i]! })
    bossTraitHud.value = rows
  }

  /** A chill count changed: statsFor must see it at once (sim parity). */
  const dropStats = (blade: SpinnerState): void => {
    _statsCache.delete(blade.id)
  }

  /** Team turn START (before auto-select / the skip check): expire chill,
   *  thaw an all-frozen team (never a lost turn, §4.2 rule 2). */
  const traitTurnStart = (owner: 'player' | 'npc'): void => {
    if (!BOSSES100_BUILD || !traitsActive || bossPort === null) return
    const team = teamOf(owner)
    const turn = turnIndexOf(owner) + 1
    // Blades frozen for this turn (≤ 31, bitmask — no allocation).
    let frozen = 0
    for (let i = 0; i < team.length && i < 31; i++) {
      if (bossPort['isFrostLockedFor'](team[i]!, turn)) frozen |= 1 << i
    }
    const thawed = bossPort['beginTeamTurnTraits'](team, turn)
    for (const b of team) dropStats(b)
    if (thawed > 0) {
      for (let i = 0; i < team.length && i < 31; i++) {
        const b = team[i]!
        if ((frozen & (1 << i)) !== 0 && b.lockKind === undefined) pushTraitEvent('thaw', 'frost', b, 1)
      }
    }
    traitHudDirty = true
  }
  const CHILL_SNAP_SIZE = 31
  const chillSnap = new Int32Array(CHILL_SNAP_SIZE)
  /** Team turn END (launched blade stopped, or the turn was skipped). */
  const traitTurnEnd = (owner: 'player' | 'npc'): void => {
    if (!BOSSES100_BUILD || !traitsActive || bossPort === null) return
    const team = teamOf(owner)
    const ended = turnIndexOf(owner)
    let frozen = 0
    for (let i = 0; i < team.length && i < 31; i++) {
      const b = team[i]!
      if (b.lockKind === 'frost' && b.hp > 0 && (b.stunnedForTurn ?? -Infinity) <= ended) frozen |= 1 << i
    }
    const n = team.length < CHILL_SNAP_SIZE ? team.length : CHILL_SNAP_SIZE
    for (let i = 0; i < n; i++) chillSnap[i] = team[i]!.chillN ?? 0
    bossPort['endTeamTurnTraits'](team, ended)
    for (let i = 0; i < n; i++) {
      const b = team[i]!
      const left = b.chillN ?? 0
      if (left !== chillSnap[i]) {
        dropStats(b)
        if (b.hp > 0) pushTraitEvent('chill_fade', 'chill', b, left)
      }
      if (i < 31 && (frozen & (1 << i)) !== 0 && b.lockKind === undefined) pushTraitEvent('thaw', 'frost', b, 0)
    }
    traitHudDirty = true
  }

  // ── Skill event ring buffer (HUD flashes, VFX feed, QA) ────────────────
  // Fixed SKILL_EVENT_BUFFER preallocated entries, overwritten in place;
  // `skillEventSeq` counts every event ever written (monotonic across
  // matches). Read with `forEachSkillEvent(sinceSeq, visit)`.
  const skillEvents: SkillEvent[] = SKILLS_BUILD
    ? Array.from({ length: SKILL_EVENT_BUFFER }, () => ({
      seq: 0, t: 0, kind: 'salvo' as SkillEventKind, skill: 'opening_salvo' as SkillId,
      bladeId: -1, syncKey: -1, owner: 'player' as 'player' | 'npc', x: 0, y: 0, value: 0, key: ''
    }))
    : []
  let skillEventSeq = 0
  const forEachSkillEvent = (sinceSeq: number, visit: (ev: Readonly<SkillEvent>) => void): number => {
    const from = Math.max(sinceSeq, skillEventSeq - SKILL_EVENT_BUFFER)
    for (let q = from; q < skillEventSeq; q++) visit(skillEvents[q % SKILL_EVENT_BUFFER]!)
    return skillEventSeq
  }

  // ── HUD (§8.1): chips of the LOCAL side only ────────────────────────────
  // Runtime state is copied into fresh plain objects at publish time (≤ 10 Hz,
  // only when something changed) — never per frame, never reactive in the
  // physics hot path.
  interface HudTrack {
    blade: SpinnerState
    flash: number[]
    cooldownKey: number
  }

  const skillHud: ShallowRef<SkillHudRows> = shallowRef<SkillHudRows>([])
  let hudTracks: HudTrack[] = []
  let hudDirty = false
  let hudPublishedAt = -Infinity
  let localSalvoSpent = false
  const HUD_PUBLISH_MS = 100
  const hudTrackOf = (blade: SpinnerState): HudTrack | null => {
    for (const t of hudTracks) if (t.blade === blade) return t
    return null
  }
  const hudTouch = (blade: SpinnerState): void => {
    if (blade.owner === 'player' && blade.skills !== undefined) hudDirty = true
  }
  const hudProc = (blade: SpinnerState, skill: SkillId): void => {
    if (blade.owner !== 'player' || blade.skills === undefined) return
    const t = hudTrackOf(blade)
    if (t === null) return
    const i = blade.skills.ids.indexOf(skill)
    if (i >= 0) t.flash[i] = (t.flash[i] ?? 0) + 1
    if (skill === 'phase_step') t.cooldownKey++
    hudDirty = true
  }
  const hudChipState = (t: HudTrack, id: SkillId, i: number): SkillHudChipState => {
    const s = t.blade.skills!
    const st: SkillHudChipState = { flashKey: t.flash[i] ?? 0 }
    switch (id) {
      case 'guard_shell':
        st.ring = s.shieldMax > 0 ? s.shield / s.shieldMax : 0
        break
      case 'phase_step':
        if (t.cooldownKey > 0) {
          st.cooldownMs = s.phaseCooldownMs
          st.cooldownKey = t.cooldownKey
        }
        break
      case 'second_wind':
        st.spent = s.secondWindUsed
        break
      case 'opening_salvo':
        st.spent = localSalvoSpent
        break
      case 'momentum':
        st.pips = s.stacks
        st.pipsMax = s.momentumMaxStacks
        break
      case 'homing_rockets':
        st.pips = s.rocketCount
        st.pipsMax = s.rocketEveryN
        break
    }
    return st
  }
  const publishSkillHud = (force = false): void => {
    if (!hudDirty && !force) return
    const now = performance.now()
    if (!force && now - hudPublishedAt < HUD_PUBLISH_MS) return
    hudPublishedAt = now
    hudDirty = false
    skillHud.value = hudTracks.map(t => {
      const s = t.blade.skills
      if (s === undefined) return []
      return s.ids.map((id, i) => ({ id, key: skillKeyOf(t.blade, id), level: s.lv[id] ?? 1, state: hudChipState(t, id, i) }))
    })
  }

  /** The smasher skill id `blade` runs on `effect` ('' = generic). */
  const skillKeyOf = (blade: SpinnerState, effect: SkillId): string =>
    skillPort !== null && blade.config.smasherId ? skillPort['smasherSkillKey'](blade.config.smasherId, effect) : ''
  /** First living blade of `team` that carries `bit` (the skill's bearer). */
  const skillBearerIn = (team: SpinnerState[], effect: SkillId): SpinnerState | null => {
    for (const b of team) if (b.skills !== undefined && b.skills.ids.includes(effect)) return b
    return null
  }
  // Reused callout input (no allocation per proc).
  const calloutIn: CalloutInput = { kind: 'momentum', effect: 'momentum', key: '', value: 0, side: 'player' }

  /**
   * Write one skill event into the ring, feed the VFX layer, the HUD and the
   * proc callout. `blade` = what the event is ABOUT (target for hits / stuns);
   * `bearer` = whose skill it is (callout anchor + skill name), default the
   * same blade; `mult` = the hit multiplier for Lucky Edge / Momentum.
   */
  const pushSkillEvent = (
    kind: SkillEventKind, skill: SkillId, blade: SpinnerState, value: number,
    bearer: SpinnerState = blade, mult?: number
  ): void => {
    const ev = skillEvents[skillEventSeq % SKILL_EVENT_BUFFER]!
    skillEventSeq++
    ev.seq = skillEventSeq
    ev.t = gameTime()
    ev.kind = kind
    ev.skill = skill
    ev.bladeId = blade.id
    ev.syncKey = blade.syncKey
    ev.owner = blade.owner
    ev.x = blade.x
    ev.y = blade.y
    ev.value = value
    ev.key = skillKeyOf(bearer, skill)
    if (skillVfx !== null) skillPort?.['skillVfxEvent'](skillVfx, ev, FX.low)
    hudProc(bearer, skill)
    if (skillCallouts !== null && !CLEAN_FEED) {
      const skip = kind === 'stun_skip'
      calloutIn.kind = kind
      calloutIn.effect = skill
      calloutIn.key = ev.key
      calloutIn.value = value
      calloutIn.mult = mult
      calloutIn.stunned = kind === 'static' && value === 1
      calloutIn.side = skip ? (blade.owner === 'player' ? 'npc' : 'player') : bearer.owner
      // A proc while the centre turn banner is up (Opening Salvo) waits until
      // the banner clears, so the pill is never hidden behind it.
      const calloutAt = Math.max(performance.now(), turnBannerUntil)
      skillPort?.['pushSkillCallout'](skillCallouts, calloutIn, skip ? blade : bearer, calloutAt, translate, activeLocale())
    }
  }
  /** Glyph / popup colour of a skill effect that belongs to `owner`'s side. */
  const skillColor = (owner: 'player' | 'npc', own: string): string =>
    owner === 'player' ? own : SKILL_COLOR_ENEMY

  /** Popups + events for the HP loss `hpLossOut` just described (skilled target). */
  const noteSkilledHpLoss = (target: SpinnerState): void => {
    const o = hpLossOut
    if (o.absorbed > 0) {
      spawnDamageNumber(target.x, target.y - target.radius * 0.5, o.absorbed, target.owner, false,
        'guard_shell', false, skillColor(target.owner, SKILL_COLOR_SHIELD))
      pushSkillEvent('shield_absorb', 'guard_shell', target, o.absorbed)
      if (o.shieldBroken) pushSkillEvent('shield_break', 'guard_shell', target, 0)
    }
    if (o.warded > 0) pushSkillEvent('ward', 'hazard_ward', target, o.warded)
    if (o.healed > 0) {
      // Same heal rule as every other heal: pulse + number only when ≥ 1 HP
      // actually landed (the runtime already clamped the heal at maxHp).
      const shown = healFx(target, target.hp - o.healed)
      if (shown > 0) {
        spawnDamageNumber(target.x, target.y + target.radius * 0.4, shown, target.owner, false,
          'second_wind', false, SKILL_COLOR_HEAL)
      }
      pushSkillEvent('heal', 'second_wind', target, o.healed)
    }
    hudTouch(target)
  }

  // ── Homing Rockets: fixed 6-slot pool (§8.3) ───────────────────────────
  // Gameplay objects (they deal damage on arrival and BLOCK the turn change
  // while in flight), so they live here, not in the VFX pools. Slots are
  // taken in index order and resolved in index order → identical on both
  // PvP peers. A volley that finds the pool full drops its extra rockets.
  interface SkillRocket extends SkillRocketView {
    target: SpinnerState | null
    damage: number
  }

  const ROCKET_POOL_SIZE = 6
  const rocketPool: SkillRocket[] = SKILLS_BUILD
    ? Array.from({ length: ROCKET_POOL_SIZE }, () => ({
      active: false, owner: 'player' as 'player' | 'npc', x0: 0, y0: 0,
      target: null, startAt: 0, arriveAt: 0, damage: 0
    }))
    : []
  let rocketsInFlight = 0
  const clearRockets = (): void => {
    for (const r of rocketPool) {
      r.active = false
      r.target = null
    }
    rocketsInFlight = 0
  }
  /** Queue the volley `contactOut` describes (after onEnemyContact). */
  const launchVolley = (bearer: SpinnerState, now: number): void => {
    let launched = 0
    for (let i = 0; i < contactOut.volleyCount; i++) {
      const target = contactOut.volleyTargets[i]
      if (!target) continue
      let slot: SkillRocket | null = null
      for (const r of rocketPool) {
        if (!r.active) {
          slot = r
          break
        }
      }
      if (slot === null) break
      slot.active = true
      slot.owner = bearer.owner
      slot.x0 = bearer.x
      slot.y0 = bearer.y
      slot.target = target
      slot.damage = contactOut.volleyDamage[i]!
      // Runtime computes arrival on gameTime(); rebase the flight onto the
      // simulation clock so a paused physics loop freezes the rocket too.
      slot.startAt = skillClock()
      slot.arriveAt = slot.startAt + (contactOut.volleyArriveAt - now)
      rocketsInFlight++
      launched++
    }
    pushSkillEvent('rocket_volley', 'homing_rockets', bearer, launched)
  }
  /** Land rockets whose flight time is over (game time; physics tick). */
  const tickRockets = (): void => {
    if (rocketsInFlight === 0) return
    const now = skillClock()
    for (const r of rocketPool) {
      if (!r.active || now < r.arriveAt) continue
      const t = r.target
      r.active = false
      r.target = null
      rocketsInFlight--
      // Dead or invulnerable on arrival → the rocket fizzles.
      if (t === null || t.hp <= 0 || isInvulnerable(t)) continue
      const hpBefore = t.hp
      const killed = applyBladeDamage(t, r.damage, t.x, t.y, r.owner, false, 'rocket', false, 'homing_rockets')
      pushSkillEvent('rocket_hit', 'homing_rockets', t, hpBefore - t.hp)
      if (killed) {
        handleSplitDeath(t)
        triggerShake('big')
      }
    }
  }

  // ── Opening Salvo (§4.7) — once per team, host team first (G1) ─────────
  const fireTeamSalvo = (team: SpinnerState[], foes: SpinnerState[]): void => {
    const pct = skillPort!['teamSalvoPct'](team)
    if (!(pct > 0) || team.length === 0) return
    const src = team[0]!.owner
    const bearer = skillBearerIn(team, 'opening_salvo') ?? team[0]!
    let sprites = 0
    for (const e of foes) {
      if (e.hp <= 0) continue
      const d = skillPort!['salvoDamage'](e, pct)
      if (!(d > 0)) continue
      const hpBefore = e.hp
      applyBladeDamage(e, d, e.x, e.y, src, false, 'salvo', false, 'opening_salvo')
      pushSkillEvent('salvo', 'opening_salvo', e, hpBefore - e.hp, bearer)
      // Existing explosion sheet at half scale, ≤ 5; FX.low: numbers + flash.
      if (!FX.low && sprites < 5) {
        activeExplosions.push(createSpritesheetAnim(
          explosionImage, e.x, e.y,
          EXPLOSION_FRAMES, EXPLOSION_FRAME_DURATION, EXPLOSION_FW, EXPLOSION_FH,
          ((e.radius * 2.5) / EXPLOSION_FW) * 0.5, false
        ))
        sprites++
      }
    }
    if (sprites > 0) {
      try {
        playSound('explosion-1')
      } catch { /* sound is best-effort */
      }
    }
    if (src === 'player') {
      localSalvoSpent = true
      for (const b of team) hudTouch(b)
    }
  }
  const fireOpeningSalvo = (): void => {
    if (!skillsActive) return
    const hostTeam = pvpLocalIsGuest ? npcBlades.value : playerBlades.value
    const guestTeam = pvpLocalIsGuest ? playerBlades.value : npcBlades.value
    fireTeamSalvo(hostTeam, guestTeam)
    fireTeamSalvo(guestTeam, hostTeam)
  }

  // ── Collision hooks (§5 steps 2, 3, 6) ─────────────────────────────────
  /** Events / popups for the attacker step `skillOut` just described. */
  const noteOutgoing = (att: SpinnerState, cx: number, cy: number): void => {
    if (skillOut.lucky) {
      pushSkillEvent('lucky', 'lucky_edge', att, 0, att, (att.skills as { luckyMult?: number } | undefined)?.luckyMult)
    }
    if (skillOut.momentumStacks > 0 && att.skills !== undefined) {
      pushSkillEvent('momentum', 'momentum', att, skillOut.momentumStacks, att,
        1 + att.skills.momentumPerStack * skillOut.momentumStacks)
      if (damageNumbers.length < 60) {
        damageNumbers.push({
          x: cx, y: cy - 10, value: 0,
          vx: 0.05, vy: -0.05,
          color: skillColor(att.owner, '#66aaff'), life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
          isCrit: false,
          comboText: `×${(1 + att.skills.momentumPerStack * skillOut.momentumStacks).toFixed(2)}`
        })
      }
      hudTouch(att)
    }
    if (skillOut.bank && att.skills !== undefined) {
      pushSkillEvent('bank', 'bank_shot', att, 0, att, 1 + att.skills.bankPct)
      hudTouch(att)
    }
  }
  /** Directional-armour feedback: "Blocked!" (reinforced plate) or "Weak
   *  spot!" floating up from the contact. VFX only (every build). */
  let armorTagAt = -Infinity
  const spawnArmorTag = (x: number, y: number, blocked: boolean): void => {
    if (CLEAN_FEED || damageNumbers.length >= 60) return
    const now = performance.now()
    if (now - armorTagAt < 120) return
    armorTagAt = now
    damageNumbers.push({
      x, y: y - 14, value: 0,
      vx: 0, vy: -0.06,
      color: blocked ? '#dbe4ee' : '#ffb347', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
      isCrit: !blocked,
      comboText: translate(blocked ? 'skills.callout.armorBlocked' : 'skills.callout.armorWeak'),
      centered: true
    })
  }
  /** Events / popups for the defender step `skillIn` just described. */
  const noteIncoming = (def: SpinnerState): void => {
    if (skillIn.dodged) {
      spawnSkillGlyph(def, 'phase_step', skillColor(def.owner, SKILL_COLOR_SHIELD))
      pushSkillEvent('phase', 'phase_step', def, 0)
    } else if (skillIn.mirrored) {
      pushSkillEvent('mirror', 'mirror_plate', def, skillIn.reflect)
    }
  }
  /** §5 step 6 for one skilled blade of an armed enemy contact. */
  const runContactSkills = (bearer: SpinnerState, enemy: SpinnerState, now: number, lid: number | null): void => {
    skillPort!['onEnemyContact'](
      bearer, enemy, now, lid, turnIndexOf(enemy.owner),
      bearer.owner === 'player' ? npcBlades.value : playerBlades.value,
      statsForSkill, contactOut
    )
    if (contactOut.volley) launchVolley(bearer, now)
    if (contactOut.shocked) {
      enemy.hitFlash = HIT_FLASH_FRAMES
      spawnShockBolt(bearer.x, bearer.y, enemy.x, enemy.y)
      pushSkillEvent('static', 'static_charge', enemy, contactOut.stunned ? 1 : 0, bearer)
      if (contactOut.stunned) {
        // The launch lock is shared with Frost Lock; the kind tells the
        // never-lose-a-turn thaw to leave Static Charge stuns alone.
        enemy.lockKind = 'stun'
        spawnSkillGlyph(enemy, 'static_charge', skillColor(bearer.owner, SKILL_COLOR_SHIELD))
      }
    }
    hudTouch(bearer)
  }

  /** Frostbite stack popup colour (the frost rim's ice blue). */
  const CHILL_POPUP_COLOR = '#aee6ff'
  /** §12.2 item 3 for one trait carrier of an armed enemy contact. */
  const runTraitContact = (carrier: SpinnerState, victim: SpinnerState, now: number, lid: number | null): void => {
    if (!BOSSES100_BUILD || bossPort === null || traitOut === null) return
    const changed = bossPort['onTraitContact'](carrier, victim, now, lid, teamOf(victim.owner), turnIndexOf(victim.owner), traitOut)
    const trait = traitOut.trait
    if (trait === 'frost') {
      if (traitOut.keep > 0) {
        victim.hitFlash = HIT_FLASH_FRAMES
        pushTraitEvent('frost_touch', 'frost', victim, traitOut.keep)
      }
      if (traitOut.lock === 'locked') pushTraitEvent('freeze', 'frost', victim, turnIndexOf(victim.owner) + 1)
      else if (traitOut.lock === 'cracked') pushTraitEvent('freeze_crack', 'frost', victim, 0)
    } else if (trait === 'chill' && changed) {
      dropStats(victim)
      pushTraitEvent('chill', 'chill', victim, traitOut.stacks)
      // §7.3 chill popup: a snowflake from the damage-number pool (VFX only).
      spawnSkillGlyph(victim, 'snowflake', CHILL_POPUP_COLOR)
    }
  }

  /** Burn popup colour: orange, cyan when Hazard Ward cut it. */
  const BURN_COLOR = '#ff9a3c'
  /** §12.2 item 2: one Ember Nova tick — every living ember carrier pulses,
   *  each victim burns at most once, in syncKey order; kills end like lava. */
  const fireEmberNova = (): void => {
    if (!BOSSES100_BUILD || bossPort === null) return
    const bp = bossPort
    const ordered = bladesBySyncKey.value
    if (!bp['hasLivingEmberCarrier'](ordered)) return
    const mask = bp['emberVictimMask'](ordered)
    let victims = 0
    for (let i = 0; i < ordered.length && i < 31; i++) if ((mask & (1 << i)) !== 0) victims++
    for (const c of ordered) {
      if (c.hp > 0 && c.config.bossTrait === 'ember') pushTraitEvent('nova', 'ember', c, victims)
    }
    let killed = false
    for (let i = 0; i < ordered.length && i < 31; i++) {
      if ((mask & (1 << i)) === 0) continue
      const v = ordered[i]!
      const lost = bp['applyEmberBurn'](v, hpLossOut)
      let color = BURN_COLOR
      if (SKILLS_BUILD && v.skills !== undefined) {
        if (hpLossOut.warded > 0) color = SKILL_COLOR_SHIELD
        noteSkilledHpLoss(v)
      }
      v.hitFlash = HIT_FLASH_FRAMES
      spawnDamageNumber(v.x, v.y, lost, v.owner === 'player' ? 'npc' : 'player', false, undefined, false, color)
      pushTraitEvent('burn', 'ember', v, lost)
      if (v.hp > 0) {
        triggerBurn(borderFx, v, burnCap(), !FX.low)
      } else {
        killed = true
        spawnExplosion(v.x, v.y, v.radius)
        handleSplitDeath(v)
      }
    }
    if (killed) triggerShake('big')
  }

  /** Split-boss shatter for a blade that just died (any damage source). */
  const handleSplitDeath = (blade: SpinnerState): void => {
    if (blade.hp <= 0 && blade.splitsOnDeath && !blade.isSplitChild) {
      blade.splitsOnDeath = false
      spawnSplitChildren(blade)
    }
  }

  // ── Launch bookkeeping shared by every launch site ─────────────────────
  /** Called after `ax`/`ay` are set: zero velocity, start the ramp, count
   *  the side's turn, reset per-launch skill state (Momentum). */
  const beginLaunch = (blade: SpinnerState): void => {
    blade.vx = 0
    blade.vy = 0
    // Gameplay heading = the launch direction (armour faces where it flies).
    followHeading(blade.ax, blade.ay, 0, blade)
    blade.accelFramesLeft = ACCEL_FRAMES
    blade.wallBounceCount = 0
    if (terrain !== null) {
      // A new launch: every blade's booster budget refills, and a blade
      // launched from inside a deep hole can always roll out of it.
      for (const gs of groundStates.values()) gs.boosts = 0
      groundStateOf(blade).holeExempt = inDeepCore(terrain, blade.x, blade.y)
    }
    if (blade.owner === 'player') playerTurnIndex++
    else npcTurnIndex++
    if (SKILLS_BUILD && blade.skills !== undefined) {
      beginLaunchSkills(blade)
      hudTouch(blade)
    }
  }

  /**
   * Static Charge turn skip (§4.10, G2): the team whose turn is starting has
   * every living blade stunned for it → the turn is consumed without a
   * launch and play passes on. Runs at the turn transition, i.e. at the same
   * logical point on both PvP peers. A blade stunned for turn T is immune on
   * T + 1, so at most two skips can chain.
   */
  const resolveStunSkips = (): void => {
    for (let guard = 0; guard < 3; guard++) {
      if (phase.value === 'player_turn') {
        const team = playerBlades.value
        if (!teamAllStunned(team, playerTurnIndex + 1)) return
        playerTurnIndex++
        for (const b of team) {
          if (b.hp > 0) {
            spawnSkillGlyph(b, 'static_charge', SKILL_COLOR_ENEMY)
            pushSkillEvent('stun_skip', 'static_charge', b, playerTurnIndex, skillBearerIn(npcBlades.value, 'static_charge') ?? b)
          }
        }
        traitTurnEnd('player')
        phase.value = 'npc_turn'
        npcThinkingElapsed = 0
        launchedBladeId.value = null
        for (const b of npcBlades.value) {
          if (b.statSwitchPhase) b.statSwitchPhase = 'attack'
        }
        traitTurnStart('npc')
      } else if (phase.value === 'npc_turn') {
        const team = npcBlades.value
        if (!teamAllStunned(team, npcTurnIndex + 1)) return
        npcTurnIndex++
        for (const b of team) {
          if (b.hp > 0) {
            spawnSkillGlyph(b, 'static_charge', SKILL_COLOR_SHIELD)
            pushSkillEvent('stun_skip', 'static_charge', b, npcTurnIndex, skillBearerIn(playerBlades.value, 'static_charge') ?? b)
          }
        }
        traitTurnEnd('npc')
        for (const b of npcBlades.value) {
          if (b.statSwitchPhase) b.statSwitchPhase = 'defense'
        }
        passToPlayer()
      } else {
        return
      }
    }
  }

  /** Build `blade.skills` for a side (initGame). Returns true if any got skills. */
  const equipSide = (team: SpinnerState[], loadout: SkillLoadout | null | undefined): boolean => {
    if (skillPort === null) return false
    let any = false
    for (const b of team) {
      // A smasher brings its own unlocked skills; a part-only blade (campaign
      // NPCs, legacy league ghosts) carries the side's loadout, if any.
      const own = b.config.smasherId ? smasherLoadout(b.config) : null
      const lo = own && own.length > 0 ? own : loadout
      if (!lo || lo.length === 0) continue
      const s = skillPort['createBladeSkills'](lo, b.maxHp, b.syncKey, matchSeed)
      if (s !== undefined) {
        b.skills = s
        any = true
      }
    }
    return any
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  function createBladeState(
    owner: 'player' | 'npc',
    x: number, y: number,
    config: SpinnerConfig,
    isBoss = false,
    // Grant boss-tier HP (2×) WITHOUT the boss size bump, slower spin, boss
    // rubber-banding or boss render treatment. For a
    // lone enemy: "treated like a boss regarding stats" only.
    bossStats = false
  ): SpinnerState {
    const stats = computeStats(config, config.topLevel ?? 0, config.bottomLevel ?? 0)
    // Bosses: CAMPAIGN_NPC_TUNING.bossHpMul; a lone "boss stats" enemy keeps 2×.
    const bossHpMultiplier = isBoss ? CAMPAIGN_NPC_TUNING.bossHpMul : bossStats ? 2 : 1
    const boostHpMultiplier = (firstGameBoost && owner === 'player') ? 2 : 1
    // Campaign-only NPC HP scaling by difficulty: EASY -10%, HARD +30%.
    // PvP and ghost fights are excluded so both modes stay authoritative.
    const difficultyHpMultiplier =
      owner === 'npc' && !pvpMode.value && !ghostMode.value
        ? getDifficultyHpMult()
        : 1
    // Boss rubber-banding: chips up to 50% off an NPC boss's HP after
    // back-to-back campaign losses. Only campaign play qualifies — PvP
    // and ghost matches are out of scope (see useSpinnerCampaign.ts for
    // the formula and SpinnerArena.vue for where the streak is updated).
    const rubberBandHpMultiplier =
      isBoss && owner === 'npc' && !pvpMode.value && !ghostMode.value
        ? bossHpRubberBandMul()
        : 1
    // Keep the live-rescale watcher's baseline in sync with what we
    // actually baked into this spawn so a later difficulty change scales
    // from the correct starting point.
    if (owner === 'npc') appliedDifficultyHpMult = difficultyHpMultiplier
    // Healer partners are a touch smaller than other bosses; every other
    // boss uses BOSS_RADIUS_MULT so the solo-boss silhouette still reads big.
    let radiusMult = 1
    if (isBoss) {
      radiusMult = config.bossAbility === 'healers' ? HEALER_RADIUS_MULT : BOSS_RADIUS_MULT
    }
    // Smasher disc size (catalog `disc`, 0.75 … 1.35) × the side's team-size
    // multiplier (base 0.9 × 1 / 0.87 / 0.75); boss sizes stack on top.
    const disc = discOf(config) * teamSizeMul[owner]
    const bossRadius = BLADE_RADIUS * radiusMult * disc
    const armor = armorOf(config)
    const legacyNpcHpMul = isLegacyNpc(owner, config) ? campaignNpcHpMul(((config.topLevel ?? 0) + (config.bottomLevel ?? 0)) / 2) : 1
    // A side of one fights boosted (team size 1: ×1.2 max HP) — a lone
    // part-only campaign NPC has it offset (CAMPAIGN_NPC_TUNING.soloHpMul), and
    // part-only campaign NPCs get the team-size refit of their count (countHpMul).
    const teamHpMultiplier = teamStatMul[owner] * (teamStatMul[owner] !== 1 && isLegacyNpc(owner, config) ? CAMPAIGN_NPC_TUNING.soloHpMul : 1)
      * (isLegacyNpc(owner, config) ? campaignNpcCountHpMul(npcTeamCount) : 1)
    const finalHp = stats.maxHp * legacyNpcHpMul * bossHpMultiplier * boostHpMultiplier * difficultyHpMultiplier * rubberBandHpMultiplier * teamHpMultiplier
    return {
      id: nextBladeId++,
      // Placeholder — every spawn site assigns the real peer-independent key.
      syncKey: -1,
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
      isBoss,
      hx: 0,
      hy: defaultHeadingY(owner),
      ...(disc !== 1 ? { disc } : {}),
      ...(armor !== null ? { armor } : {})
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
    twin.hx = parent.hx
    twin.hy = parent.hy
    twin.syncKey = childSyncKey(parent)
    // Cross-link: each half mirrors damage to the other.
    parent.linkedIds = [...(parent.linkedIds ?? []), twin.id]
    twin.linkedIds = [parent.id]
    parent.ghostPending = false

    // Ensure twin is clamped inside the arena (shape-aware).
    const tc = clampInArena(twin.x, twin.y, twin.radius)
    twin.x = tc.x
    twin.y = tc.y

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
    const now = skillClock()
    const children: SpinnerState[] = []
    for (let i = 0; i < SPLIT_CHILD_COUNT; i++) {
      // In PvP use a fixed offset so both clients agree on child positions
      const jitter = pvpMode.value ? 0.125 : gameplayRand() * 0.25
      const angle = (i / SPLIT_CHILD_COUNT) * Math.PI * 2 + jitter
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      // Place outside parent's body so they don't trivially collide on frame 1.
      // Shards are sized off their side's smasher size (team size), not the raw unit.
      const childRadius = BLADE_RADIUS * teamSizeMul[parent.owner] * SPLIT_CHILD_RADIUS_PCT
      const spawnDist = parent.radius + childRadius * 1.1
      const child = createBladeState(
        parent.owner,
        parent.x + dx * spawnDist,
        parent.y + dy * spawnDist,
        // Children drop the parent's boss trait; the Shattering Glacier's
        // shards take its `shardTrait` instead (bosses-100 §6.3).
        {
          ...parent.config,
          bossAbility: undefined,
          isBoss: false,
          bossTrait: parent.config.shardTrait,
          shardTrait: undefined
        },
        false
      )
      child.radius = childRadius
      child.maxHp = Math.max(1, Math.round(parent.maxHp * SPLIT_CHILD_HP_PCT))
      child.hp = child.maxHp
      child.groupId = parent.groupId ?? (nextGroupId++)
      child.isSplitChild = true
      child.syncKey = childSyncKey(parent)
      child.invulnerableUntil = now + SPLIT_CHILD_INVULN_MS
      // Drift outward so the swarm spreads and settles into free space.
      const drift = 1.2
      child.vx = dx * drift
      child.vy = dy * drift

      // Clamp inside the arena so newborns don't instantly wall-bounce
      // (shape-aware).
      const cc = clampInArena(child.x, child.y, child.radius, 4)
      child.x = cc.x
      child.y = cc.y
      children.push(child)
    }
    if (parent.owner === 'npc') npcBlades.value = [...npcBlades.value, ...children]
    else playerBlades.value = [...playerBlades.value, ...children]
  }

  /**
   * Apply damage to a blade with ghost-link mirroring. Returns true if the
   * blade (or any linked half) was killed by this hit, so callers can run
   * the split-on-death handler.
   *
   * Every HP decrement of a skilled blade goes through the runtime's
   * `applyHpLoss` (§5 step 5: Hazard Ward → Guard Shell → HP → Second Wind);
   * `kind` says what the damage is ('hit' by default). A blade without
   * skills keeps the plain `hp - dmg` path. The number shown (and mirrored
   * over a ghost link) is the post-ward, post-shield amount.
   */
  const applyBladeDamage = (
    target: SpinnerState,
    dmg: number,
    cx: number, cy: number,
    sourceOwner: 'player' | 'npc',
    isCrit: boolean,
    kind: HpLossKind = 'hit',
    isLucky = false,
    glyph?: SkillId
  ): boolean => {
    let killed = false
    let shown = dmg
    let color: string | undefined
    if (!SKILLS_BUILD || target.skills === undefined) {
      target.hp = Math.max(0, target.hp - dmg)
    } else {
      applyHpLoss(target, dmg, kind, hpLossOut)
      shown = dmg - hpLossOut.absorbed - hpLossOut.warded
      if (hpLossOut.warded > 0) color = SKILL_COLOR_SHIELD
      noteSkilledHpLoss(target)
    }
    target.hitFlash = HIT_FLASH_FRAMES
    spawnDamageNumber(cx, cy, shown, sourceOwner, isCrit, glyph, isLucky, color)
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
        let linkShown = shown
        if (!SKILLS_BUILD || linked.skills === undefined) {
          linked.hp = Math.max(0, linked.hp - shown)
        } else {
          applyHpLoss(linked, shown, 'link', hpLossOut)
          linkShown = shown - hpLossOut.absorbed - hpLossOut.warded
          noteSkilledHpLoss(linked)
        }
        linked.hitFlash = HIT_FLASH_FRAMES
        // Mirrored numbers render at the linked blade's location so the
        // player sees the ghost-link is real.
        spawnDamageNumber(linked.x, linked.y, linkShown, sourceOwner, false)
        if (linked.hp <= 0) {
          killed = true
          spawnExplosion(linked.x, linked.y, linked.radius)
        }
      }
    }
    return killed
  }

  // ─── Combat log ──────────────────────────────────────────────────────────
  // Map a player blade to its HUD "Spinner N" number (index in playerBlades,
  // matching the stat-card order); null for enemy blades.
  const spinnerNumberOf = (blade: SpinnerState): number | null => {
    if (blade.owner !== 'player') return null
    const idx = playerBlades.value.indexOf(blade)
    return idx >= 0 ? idx + 1 : null
  }

  // Record one collision hit for the (minimised-by-default) combat log. Cheap:
  // structured params only, no i18n here — CombatLog.vue renders the sentence.
  const logCombatHit = (
    attacker: SpinnerState,
    target: SpinnerState,
    dmg: number,
    crit: boolean,
    attackerSpeed: number,
    targetSpeed: number
  ): void => {
    const rounded = Math.round(dmg)
    if (rounded <= 0) return
    // Only log hits the player is part of — enemy-vs-enemy friendly fire would
    // read as "Enemy … deals to Enemy …" (two indistinguishable sides) and
    // just clutters a strategist's feed.
    if (attacker.owner === 'npc' && target.owner === 'npc') return
    let speedFavors: 'attacker' | 'target' | null = null
    if (attackerSpeed >= targetSpeed * 2) speedFavors = 'attacker'
    else if (targetSpeed >= attackerSpeed * 2) speedFavors = 'target'
    pushCombatEntry({
      attackerOwner: attacker.owner,
      attackerSpinner: spinnerNumberOf(attacker),
      attackerPart: attacker.config.topPartId,
      targetOwner: target.owner,
      targetSpinner: spinnerNumberOf(target),
      targetPart: target.config.topPartId,
      dmg: rounded,
      crit,
      speedFavors
    })
  }

  // ─── Game Lifecycle ──────────────────────────────────────────────────────

  const initGame = (
    pTeam: SpinnerConfig[],
    nTeam: SpinnerConfig[],
    boost = false,
    arena: ArenaType = 'default',
    enablePowerups = false,
    powerupIntervalMs: [number, number] = [POWERUP_DEFAULT_INTERVAL_MIN_MS, POWERUP_DEFAULT_INTERVAL_MAX_MS],
    /** `role` = this client's lobby role; defaults to usePVP's live role. */
    pvp: { enabled: boolean; myTurnFirst: boolean; role?: 'host' | 'guest' } | null = null,
    shape: ArenaShape = 'circle',
    /** `seed`: start the match RNG from this value (reproducible battles,
     *  e.g. league replays). Omitted: PvP keeps the host's broadcast seed,
     *  every other mode reseeds randomly. */
    opts: InitGameOptions = {}
  ) => {
    pvpMode.value = !!pvp?.enabled
    pvpLocalIsGuest = pvpMode.value && (pvp?.role ?? currentPvpRole()) === 'guest'
    // Set the arena shape BEFORE spawns so spawn/terrain/power-up placement can
    // clamp to the active boundary geometry.
    // Tree Smashers: no round arenas. A terrain match gets its layout's
    // clearing shape, any other "circle" request the clover clearing.
    const requestedCircle = shape === 'circle'
    if (requestedCircle) {
      const lay = opts.terrain?.layout ?? null
      shape = lay !== null ? TERRAIN_SHAPES[((lay % TERRAIN_SHAPES.length) + TERRAIN_SHAPES.length) % TERRAIN_SHAPES.length]! : 'clover'
    }
    arenaShape.value = shape
    BLADE_RADIUS = pvpMode.value ? PVP_BLADE_RADIUS : DEFAULT_BLADE_RADIUS
    // The PvP clock only runs during launches, so it starts a minute "in" —
    // cooldown maps default a never-seen pair to 0, and at t≈0 the first
    // contact of the match would otherwise read as "still in contact".
    pvpTickCount = 3600
    firstGameBoost = boost
    // In PvP the host already seeded + broadcast a shared seed via the
    // game-start message; single-player reseeds locally per match.
    if (opts.seed !== undefined) seedMatchRng(opts.seed)
    else if (!pvpMode.value) seedMatchRngRandom()
    matchSeed = currentMatchSeed()
    forcedFirstTurn = !pvpMode.value && (opts.firstTurn === 'player' || opts.firstTurn === 'opponent') ? opts.firstTurn : null
    npcPlay = !pvpMode.value ? (opts.npcPlay ?? null) : null
    // Seeded battle: aux gameplay stream + sim-clock timers (see gameplayRand).
    gameplayStream = opts.seed !== undefined ? createRng((opts.seed ^ GAMEPLAY_RNG_SALT) >>> 0) : null
    seededSim = opts.seed !== undefined && !pvpMode.value
    if (seededSim) simTickCount = SEEDED_CLOCK_START_TICKS
    stopPhysics()
    clearCombatLog()
    nextBladeId = 0
    childSpawnSeq.clear()
    // Forget blade looks so skin / smasher changes take effect
    bladeYawState.clear()

    // Team size (src/data/teamSize.ts): each side's blade size and solo boost
    // come from its own team length — before the first createBladeState.
    teamSizeMul.player = sideSizeMul(pTeam.length)
    teamSizeMul.npc = sideSizeMul(nTeam.length)
    teamStatMul.player = sideStatMul(pTeam.length)
    teamStatMul.npc = sideStatMul(nTeam.length)
    npcTeamCount = nTeam.length
    balloonTeamSize.player = clampTeamSize(pTeam.length)
    balloonTeamSize.npc = clampTeamSize(nTeam.length)
    teamSizeHash = `ts:${clampTeamSize(pvpLocalIsGuest ? nTeam.length : pTeam.length)},${clampTeamSize(pvpLocalIsGuest ? pTeam.length : nTeam.length)}`

    // Player blades: bottom half, spread evenly
    const pCount = pTeam.length
    playerBlades.value = pTeam.map((cfg, i) => {
      const spreadX = pCount === 1 ? 0 : (i / (pCount - 1) - 0.5) * ARENA_RADIUS * 0.7
      return createBladeState('player', spreadX, ARENA_RADIUS * 0.4, cfg)
    })

    // NPC blades positioning
    const nCount = nTeam.length
    const terrainArena = (opts.terrain?.layout ?? null) !== null && requestedCircle
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
        const jx = (gameplayRand() - 0.5) * maxJitter
        const jy = (gameplayRand() - 0.5) * maxJitter
        npcPositions.push({ x: jx, y: -ARENA_RADIUS * 0.4 + jy })
      } else if (nCount === 2) {
        for (let i = 0; i < 2; i++) {
          const x = (i === 0 ? -1 : 1) * ARENA_RADIUS * 0.4 + (gameplayRand() - 0.5) * maxJitter
          const y = -ARENA_RADIUS * 0.4 + (gameplayRand() - 0.5) * maxJitter
          npcPositions.push({ x, y })
        }
      } else if (nCount === 3) {
        // Triangle: 2 on top row, 1 centered below
        const topY = -ARENA_RADIUS * 0.55
        // Terrain arenas pull the front row back so the mid-field features
        // (islands / holes / pads) never sit under a spawn.
        const botY = -ARENA_RADIUS * (terrainArena ? 0.3 : 0.2)
        const halfW = ARENA_RADIUS * 0.4
        npcPositions.push({
          x: -halfW + (gameplayRand() - 0.5) * maxJitter,
          y: topY + (gameplayRand() - 0.5) * maxJitter
        })
        npcPositions.push({ x: halfW + (gameplayRand() - 0.5) * maxJitter, y: topY + (gameplayRand() - 0.5) * maxJitter })
        npcPositions.push({ x: (gameplayRand() - 0.5) * maxJitter, y: botY + (gameplayRand() - 0.5) * maxJitter })
      } else {
        // 4: 2x2 grid
        const halfW = ARENA_RADIUS * 0.4
        const topY = -ARENA_RADIUS * 0.65
        const botY = -ARENA_RADIUS * (terrainArena ? 0.3 : 0.15)
        const slots = [
          { x: -halfW, y: topY },
          { x: halfW, y: topY },
          { x: -halfW, y: botY },
          { x: halfW, y: botY }
        ]
        for (let i = 0; i < nCount; i++) {
          const s = slots[i]!
          npcPositions.push({
            x: s.x + (gameplayRand() - 0.5) * maxJitter,
            y: s.y + (gameplayRand() - 0.5) * maxJitter
          })
        }
      }

      // Clamp all NPC positions inside the arena (shape-aware so non-circular
      // floors don't spawn a blade beyond an edge/corner).
      for (const pos of npcPositions) {
        const c = clampInArena(pos.x, pos.y, BLADE_RADIUS, BLADE_RADIUS)
        pos.x = c.x
        pos.y = c.y
      }
    }

    npcBlades.value = nTeam.map((cfg, i) =>
      createBladeState('npc', npcPositions[i]!.x, npcPositions[i]!.y, cfg, cfg.isBoss, cfg.bossStats)
    )
    // Peer-independent keys: the host's team is 0..n-1, the guest's 100+i.
    // Outside PvP the local player plays the host's part.
    const ownBase = pvpLocalIsGuest ? SYNC_KEY_GUEST_BASE : 0
    const otherBase = pvpLocalIsGuest ? 0 : SYNC_KEY_GUEST_BASE
    playerBlades.value.forEach((b, i) => {
      b.syncKey = ownBase + i
    })
    npcBlades.value.forEach((b, i) => {
      b.syncKey = otherBase + i
    })
    armorActive = allBlades.value.some(b => b.armor !== undefined)

    // ── Skills (§10.3 item 1/2): both sides, owner-agnostic (G3). Empty /
    // missing loadout → `skills` stays unset (fast path, baseline hashes).
    // Per-blade streams are seeded from (matchSeed, syncKey) — identical on
    // both PvP peers. Spawned children (ghost twin, split, emitted) never
    // carry skills.
    // Skills-off build: folds to `skillsActive = false` (no port, no glue).
    const ownSkills = SKILLS_BUILD && equipSide(playerBlades.value, opts.skillLoadout)
    const otherSkills = SKILLS_BUILD && equipSide(npcBlades.value, opts.enemySkillLoadout)
    skillsActive = ownSkills || otherSkills
    playerTurnIndex = 0
    npcTurnIndex = 0
    skillPopupAt.clear()
    if (SKILLS_BUILD) {
      clearRockets()
      if (skillsActive && skillVfx === null && skillPort !== null) skillVfx = skillPort['createSkillVfx']()
      if (skillVfx !== null) skillPort?.['resetSkillVfx'](skillVfx)
      if (skillsActive && skillCallouts === null && skillPort !== null) skillCallouts = skillPort['createSkillCallouts']()
      if (skillCallouts !== null) skillPort?.['resetSkillCallouts'](skillCallouts)
      localSalvoSpent = false
      hudTracks = ownSkills
        ? playerBlades.value.map(blade => ({
          blade,
          flash: blade.skills ? blade.skills.ids.map(() => 0) : [],
          cooldownKey: 0
        }))
        : []
      publishSkillHud(true)
    }

    // ── Boss traits (bosses-100 §12.2 item 1): carriers need only their
    // config; the clock restarts per match. Chill buffers and VFX pools are
    // allocated here, and only when the roster carries a trait.
    traitsActive = false
    traitHudRows = []
    traitHudDirty = false
    if (BOSSES100_BUILD && bossPort !== null) {
      const bp = bossPort
      if (bossClock !== null) bp['resetBossClock'](bossClock)
      if (bossTraitFx !== null) bp['resetBossTraitVfx'](bossTraitFx)
      traitsActive = bp['hasBossTraits'](allBlades.value)
      if (traitsActive) {
        bossClock ??= bp['createBossClock']()
        traitOut ??= bp['createTraitContactResult']()
        bossTraitFx ??= bp['createBossTraitVfx']()
        if (bossTraitEvents.length === 0) bossTraitEvents = bp['createBossTraitEventRing']()
        for (const b of allBlades.value) bp['initTraitVictim'](b)
        bp['prepareBossTraitVfx'](bossTraitFx, allBlades.value, FX.low)
        // Ember burns reuse the lava flame strip: fetch it during the intro.
        for (const b of npcBlades.value) if (b.config.bossTrait === 'ember') flameImage()
      }
    }
    if (BOSSES100_BUILD && traitsActive) publishTraitHud(true)
    else if (bossTraitHud.value.length > 0) bossTraitHud.value = []

    // ── Boss ability wiring ───────────────────────────────────────────────
    // partners/healers are TEAM-WIDE coordination abilities: the whole roster
    // shares one group (no friendly fire; healers also chip-heal allies). The
    // remaining abilities are INDEPENDENT and wired PER BLADE from each blade's
    // own `bossAbility`, so a mixed roster can mix them (e.g. one
    // ghost + one split + one life-leech). Campaign stages use a single ability
    // type per stage, so this produces identical behaviour there.
    const leadAbility = nTeam.find(c => c.bossAbility)?.bossAbility
    if (leadAbility === 'partners' || leadAbility === 'healers') {
      const gid = nextGroupId++
      for (const blade of npcBlades.value) {
        blade.groupId = gid
        blade.bouncesAllies = true
        if (leadAbility === 'healers') blade.healsAllies = true
      }
    } else {
      for (const blade of npcBlades.value) {
        switch (blade.config.bossAbility) {
          case 'ghost':
            // Own group + deferred twin split on first launch (the dramatic
            // "one blade becomes two" beat).
            blade.groupId = nextGroupId++
            blade.ghostPending = true
            break
          case 'split':
            // Own group so its death-spawned children never self-damage.
            blade.groupId = nextGroupId++
            blade.splitsOnDeath = true
            break
          case 'child-emitter':
            blade.isChildEmitter = true
            blade.groupId = nextGroupId++
            break
          case 'stat-switch':
            blade.statSwitchPhase = 'defense'
            break
          case 'life-leech':
            blade.isLifeLeech = true
            break
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
    // Respect the stage's declared arena. Boss stages carry an explicit
    // arenaType of 'boss' from the campaign table (see useSpinnerCampaign.s),
    // so boss visuals still apply — but a boss can now be staged in 'lava',
    // 'ice', etc. by naming that arena, and non-boss modes
    // are never forced into the boss arena. `isBossStage` (above) still drives
    // boss STATS independently of the arena visuals. Sanitized: a retired
    // arena name from an old save / ghost / peer maps to a live one.
    arenaType.value = sanitizeArenaType(arena)

    isDragging.value = false
    selectedBladeId.value = null
    npcActiveBladeId.value = null
    launchedBladeId.value = null
    npcThinkingElapsed = 0
    pendingRemoteLaunch = null
    pvpTurnCounter = 0
    gameResult.value = null
    turnAnnouncement.value = ''
    meteorFx.active = false
    meteorFx.count = 0
    ringFx.active = false
    ringFx.count = 0
    if (METEOR_SHOWER_ENABLED) {
      if (METEOR_VARIANT === 'strike') preloadMeteorArt()
      else preloadRingMeteorArt()
    }
    meteorIntroTimer = 0
    trails.clear()
    cloudParticles.length = 0
    groundDecals.length = 0
    sandGrains.length = 0
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
    activeStuffing.length = 0
    activeShockBolts.length = 0
    resetBorderFx(borderFx)
    // Lava is the only arena that draws the flame strip — fetch it now, while
    // the meteor intro plays, rather than on the first burn.
    if (arena === 'lava') flameImage()
    gameOverAt = null

    // ── Powerups ──────────────────────────────────────────────────────────
    // Configure spawn cadence and clear any leftover crates/particles from
    // a previous match. The actual spawning is driven by the physics loop.
    powerupsEnabled = enablePowerups
    if (enablePowerups) preloadPowerupArt()
    powerupIntervalMinMs = powerupIntervalMs[0]
    powerupIntervalMaxMs = powerupIntervalMs[1]
    resetPowerups()

    // ── Terrain layout + team towers (Tree Smashers) ──────────────────────
    // Fixed tables (no RNG): a PvP guest mirrors y so the host-frame geometry
    // is identical on both peers. Islands ricochet (bounceOffIslands);
    // boosters / holes act in the physics loop (applyGround). The terrain
    // solids are the arena's only floor obstacles (MAX_SOLID_OBSTACLES).
    groundStates.clear()
    towerContactTimes.clear()
    spikeCalloutShown = false
    towerDebris.length = 0
    resetTowerFx(towerFx)
    if (balloonFx !== null) {
      resetBalloonPopFx(balloonFx)
      balloonStates.clear()
    }
    towers.length = 0
    const terrainOpt = opts.terrain ?? null
    terrain = terrainOpt !== null && terrainOpt.layout !== null && requestedCircle
      ? buildTerrainLayout(terrainOpt.layout, pvpLocalIsGuest)
      : null
    // Decorative only: start fetching this arena theme's art (backdrop tile,
    // prop atlas, floor variant) so the static layer bakes dressed early.
    preloadBackdropArt(arenaTheme())
    preloadFloorArt(floorKeyFor(arenaTheme(), terrain?.id ?? null))
    preloadBorderArt(borderKeyFor(arenaType.value, arenaTheme()))
    // Campaign only: quietly warm the NEXT stage's arena art once the network is idle.
    if (!pvpMode.value && !ghostMode.value) warmNextStageArt()
    if (terrainOpt?.towers && requestedCircle) {
      const teamHp = (bs: SpinnerState[]) => bs.reduce((s, b) => s + b.maxHp, 0)
      // Tree spec (arenaTerrain TOWER_TUNING): the boss's tree on a boss stage
      // gets extra HP and the spiked front cover. Bosses only ever sit on the
      // NPC side (campaign / cheat), so both PvP peers derive bare trees.
      const bossStage = isBossStage.value && !pvpMode.value
      // 1–3 trees per side (both sides the same count; PvP / league pass 1).
      const trees = terrainOpt.trees ?? 1
      towers.push(...createTowers('player', ARENA_RADIUS, BLADE_RADIUS, teamHp(playerBlades.value), arenaShape.value, towerSpecFor(bossStage ? 'bossFoe' : 'plain'), trees))
      towers.push(...createTowers('npc', ARENA_RADIUS, BLADE_RADIUS, teamHp(npcBlades.value), arenaShape.value, towerSpecFor(bossStage ? 'boss' : 'plain'), trees))
      preloadTowerArt()
      if (towers.some(t => t.spiked)) preloadThornArt()
    }
    towerFallResult = null
    towerFallFrames = 0
    publishTowerHud()
    // Big / small smasher discs: no spawn inside a tower, an island or a
    // neighbour (no-op when every disc is 1×).
    settleSpawnOverlaps()

    clearCountdown()

    // In PvP mode, skip tap_to_start and go straight into the match
    if (pvp?.enabled) {
      phase.value = 'deciding_turn'
      const startsWithPlayer = pvp.myTurnFirst
      turnAnnouncement.value = startsWithPlayer ? translate('spinner.yourTurn') : translate('spinner.opponentTurn')
      turnBannerUntil = performance.now() + 1200
      startPhysics()
      // Lands inside the 1200 ms turn banner (PvP has no meteor_intro phase).
      spawnMeteorShower('intro', 1200)
      // PvP has no meteor intro: Opening Salvo fires here, host team then
      // guest team (G1) — before any tick, so both peers start equal.
      if (SKILLS_BUILD) fireOpeningSalvo()
      setTimeout(() => {
        phase.value = startsWithPlayer ? 'player_turn' : 'npc_turn'
        turnAnnouncement.value = ''
        npcThinkingElapsed = 0
        traitTurnStart(startsWithPlayer ? 'player' : 'npc')
        const first = firstPickable(playerBlades.value)
        if (first) selectedBladeId.value = first.id
      }, 1200)
      return
    }

    phase.value = 'tap_to_start'
  }

  const startMatch = () => {
    if (phase.value !== 'tap_to_start') return

    // Truncate the combat log to THIS battle: wipe it the moment the player
    // leaves the menu (tap-to-start) and combat actually begins, so the feed
    // never mixes in hits from a previous match.
    clearCombatLog()

    // Trigger meteor shower intro (lands within the 1600 ms meteor_intro)
    spawnMeteorShower('intro', METEOR_INTRO_MS)

    try {
      const randomInt = Math.min(Math.floor(Math.random() * 2) + 1, 2) // vfx-rng
      const audioName = `celebration-${randomInt}`
      playSound(audioName)
    } catch (e: any) {
    }

    // Track game starts; every Nth launches the countdown overlay.
    // Persisted via setRemoteOnly so the counter syncs to sdk.data
    // without leaving a `smashers_game_start_count` entry in localStorage.
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

  /**
   * Start the meteor shower (presentation only — no gameplay state, no match
   * RNG). 'intro' = the pre-battle strike that lands within `span` ms (the
   * 1600 ms meteor_intro; PvP's 1200 ms banner); 'celebrate' = a lighter
   * shower for the win / boss reward moments (no hero, flash or shake).
   */
  const spawnMeteorShower = (kind: MeteorShowerKind = 'intro', span = METEOR_INTRO_MS) => {
    if (!METEOR_SHOWER_ENABLED) return
    if (METEOR_VARIANT === 'strike') {
      spawnMeteorShowerFx(meteorFx, kind, span, ARENA_RADIUS, FX.low, prefersStill(), performance.now())
    } else {
      spawnRingShowerFx(ringFx, kind, span, ARENA_RADIUS, arenaTheme(), FX.low, prefersStill(), performance.now())
    }
  }

  /** One physics tick of the shower clock (16 ms, like meteorIntroTimer). */
  const updateMeteorParticles = () => {
    tickMeteorShower(meteorFx, performance.now())
    tickRingShower(ringFx, performance.now())
  }

  // ─── Player Interaction ──────────────────────────────────────────────────

  const beginDrag = (gameX: number, gameY: number) => {
    if (phase.value !== 'player_turn') return

    // Find nearest living player blade to the tap
    let closest: SpinnerState | null = null
    let closestDist = Infinity

    for (const blade of livingBlades(playerBlades.value)) {
      // Stunned for this turn (Static Charge) → cannot be picked.
      if (!isPickable(blade)) continue
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
    if (!isPickable(blade)) {
      cancelDrag()
      return
    }
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
    blade.ax = (nx * targetForce) / ACCEL_FRAMES
    blade.ay = (ny * targetForce) / ACCEL_FRAMES
    beginLaunch(blade)

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
    if (!isPickable(blade)) {
      isDragging.value = false
      return
    }
    const stats = statsFor(blade)
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier

    blade.ax = (lastDragNx * maxForce) / ACCEL_FRAMES
    blade.ay = (lastDragNy * maxForce) / ACCEL_FRAMES
    beginLaunch(blade)

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
    if (!isPickable(blade)) {
      isJoystickDragging.value = false
      return
    }
    const stats = statsFor(blade)
    const ratio = Math.min(mag / JOYSTICK_MAX_PULL, 1)
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
    const targetForce = ratio * maxForce

    // Slingshot: launch opposite to pull direction (same as blade drag)
    const nx = -dx / mag
    const ny = -dy / mag

    blade.ax = (nx * targetForce) / ACCEL_FRAMES
    blade.ay = (ny * targetForce) / ACCEL_FRAMES
    beginLaunch(blade)

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
    // A blade stunned for this turn cannot move (G2). The sender's engine
    // never launches one, so this only guards a malformed message.
    if (!isPickable(blade)) return

    // Mirror the acceleration: the remote player's blades sit at the
    // bottom on their screen but at the top on ours. Only the Y axis is
    // flipped; X stays the same so left/right is consistent.
    blade.ax = ax
    blade.ay = -ay
    beginLaunch(blade)

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
    traitTurnStart('player')
    const first = firstPickable(playerBlades.value)
    if (first) selectedBladeId.value = first.id
  }

  const launchNpc = () => {
    let living = livingBlades(npcBlades.value)
    if (living.length === 0) {
      passToPlayer()
      return
    }
    // Static Charge: blades stunned for this turn sit it out. (An all-stunned
    // team never gets here — resolveStunSkips skipped the turn.)
    if (locksActive()) {
      const pickable = living.filter(isPickable)
      if (pickable.length === 0) {
        passToPlayer()
        return
      }
      living = pickable
    }

    // Pick a random living NPC blade
    const blade = living[Math.floor(gameplayRand() * living.length)]!
    npcActiveBladeId.value = blade.id

    // Pick a random living player target
    const targets = livingBlades(playerBlades.value)
    if (targets.length === 0) return
    let target: { x: number; y: number } = targets[Math.floor(gameplayRand() * targets.length)]!

    // Tree Smashers terrain AI (cheap): go for the player's tower when it is
    // low or on a 20% whim, and don't fire straight into an island when
    // another target has a clear line. No extra draws without towers. With
    // several trees: the weakest STANDING one (ties → nearest), never a stump.
    const enemyTower = pickTargetTree(towers, 'player', blade.x, blade.y)
    if (enemyTower && (enemyTower.hp / enemyTower.maxHp < 0.35 || gameplayRand() < 0.2)) target = enemyTower
    const islands: { x: number; y: number; radius: number }[] = terrain !== null ? terrainSolidCircles(terrain) : []
    if (islands.length > 0) {
      const blockedTo = (p: { x: number; y: number }): boolean => {
        const lx = p.x - blade.x
        const ly = p.y - blade.y
        const len = Math.sqrt(lx * lx + ly * ly) || 1
        for (const isl of islands) {
          const ix = isl.x - blade.x
          const iy = isl.y - blade.y
          const proj = (ix * lx + iy * ly) / len
          if (proj <= 0 || proj >= len) continue
          const perp = Math.abs(-ix * ly + iy * lx) / len
          if (perp < isl.radius + blade.radius * 0.8) return true
        }
        return false
      }
      if (blockedTo(target)) {
        const alt = [...targets, ...(enemyTower ? [enemyTower] : [])].find(p => p !== target && !blockedTo(p))
        if (alt) target = alt
      }
    }

    const dx = target.x - blade.x
    const dy = target.y - blade.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 0.01) {
      // Overlapping — aim in a random direction instead
      const randAngle = gameplayRand() * Math.PI * 2
      const stats = statsFor(blade)
      const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
      blade.ax = (Math.cos(randAngle) * maxForce * 0.5) / ACCEL_FRAMES
      blade.ay = (Math.sin(randAngle) * maxForce * 0.5) / ACCEL_FRAMES
      beginLaunch(blade)
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
        if (perp < BLADE_RADIUS * ((blade.disc ?? 1) + (ally.disc ?? 1) + 1)) return true
      }
      return false
    }

    // A random-search bot aims looser and now and then fluffs a shot
    // (pvpBots `botPlayStyle`); the campaign NPC keeps its ±15°.
    const spread = npcPlay ? npcPlay.aimSpread : Math.PI / 6
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
      if (!found) angle += (gameplayRand() - 0.5) * spread
    } else {
      // Normal ±15° spread when path is clear
      angle += (gameplayRand() - 0.5) * spread
    }
    if (npcPlay && npcPlay.rand() < npcPlay.whiffChance) {
      angle += (npcPlay.rand() < 0.5 ? -1 : 1) * npcPlay.whiffRad * (0.6 + 0.4 * npcPlay.rand())
    }

    // Random force 65-100% of max (a bot: its own range, same single draw)
    const stats = statsFor(blade)
    const forcePct = npcPlay
      ? npcPlay.forceMin + gameplayRand() * (npcPlay.forceMax - npcPlay.forceMin)
      : 0.65 + gameplayRand() * 0.35
    const maxForce = BASE_MAX_FORCE * stats.speedMultiplier
    const targetForce = forcePct * maxForce

    // Acceleration ramp (same as player)
    blade.ax = (Math.cos(angle) * targetForce) / ACCEL_FRAMES
    blade.ay = (Math.sin(angle) * targetForce) / ACCEL_FRAMES
    beginLaunch(blade)

    launchedBladeId.value = blade.id
    if (blade.ghostPending) spawnGhostTwin(blade)
    phase.value = 'npc_launched'
  }

  // ─── Physics ─────────────────────────────────────────────────────────────

  const updatePhysics = () => {
    // Flush per-frame statsFor cache
    _statsCache.clear()

    // PvP lockstep: the gameplay simulation (and its clock) advances ONLY
    // while a launch is resolving. A launch reaches the remote peer a network
    // round-trip later than it happens locally, so the idle turn phases last a
    // different number of ticks on each client; letting those ticks move
    // blades or age cooldowns (crit, spiky chip, contact re-arm, shock) was a
    // desync. Turns also end only once EVERY blade rests (see below), so an
    // idle tick has nothing to simulate. Single-player is always active.
    const simActive = !pvpMode.value
      || phase.value === 'player_launched'
      || phase.value === 'npc_launched'
    if (pvpMode.value && simActive) pvpTickCount++
    if (simActive) simTickCount++
    // Meteor shower phase
    if (phase.value === 'meteor_intro') {
      updateMeteorParticles()
      meteorIntroTimer += 16
      if (meteorIntroTimer >= 1600) {
        // Opening Salvo lands as the meteors do (§10.3 item 3), before the
        // first turn is decided. Draws nothing from matchRng.
        // The turn banner shows next; salvo callouts wait for it to clear.
        turnBannerUntil = performance.now() + 500
        if (SKILLS_BUILD) fireOpeningSalvo()
        phase.value = 'deciding_turn'
        // Bias the starting turn based on the previous match outcome:
        // - After a loss (or losing streak), give the player an 80% chance to start
        //   so they have a better shot at recovering.
        // - After a win or before any match has been played, the enemy starts 70% of
        //   the time so wins feel earned rather than handed out.
        const playerStartChance = lastGameResult.value === 'lose' ? 0.80 : 0.30
        // A league fight's first turn is neutral and fixed by its seed (DT1):
        // the draw is still taken so the match stream stays aligned.
        const turnRoll = matchRng()
        const startsWithPlayer = forcedFirstTurn !== null ? forcedFirstTurn === 'player' : turnRoll < playerStartChance
        turnAnnouncement.value = startsWithPlayer
          ? translate('spinner.yourTurn')
          : translate(npcPlay?.opponentLabel ? 'spinner.opponentTurn' : 'spinner.npcTurn')
        turnBannerUntil = performance.now() + 500
        setTimeout(() => {
          phase.value = startsWithPlayer ? 'player_turn' : 'npc_turn'
          turnAnnouncement.value = ''
          traitTurnStart(startsWithPlayer ? 'player' : 'npc')
          // Auto-select first living player blade
          const first = firstPickable(playerBlades.value)
          if (first) selectedBladeId.value = first.id
        }, 500)
      }
      return
    }

    // The shower keeps ticking into the first turn (craters cool and shrink).
    if (meteorFx.active || ringFx.active) {
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
    // PvP always runs 1x — the 2x switch must never change lockstep physics
    // (the peer may be at 1x) — and not at all between launches.
    // PvP — and a random-search bot match, which plays like one — runs at 1×.
    const subSteps = !simActive ? 0 : pvpMode.value || npcPlay ? 1 : simSpeed.value
    // Collision pairs in syncKey order, lower key always `a`: the pair order
    // and resolveCollision's a/b asymmetries (anti-draw tie-break, crit draw
    // order) are then the same on both PvP clients.
    const ordered = bladesBySyncKey.value
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
        } else {
          // Gameplay heading follows the travel direction; kept when stopped.
          followHeading(blade.vx, blade.vy, STOP_THRESHOLD, blade)
        }

        // Spin proportional to speed, scaled by HP (100% at full → 40% at 5% HP)
        const hpPct = Math.max(0.05, blade.hp / blade.maxHp)
        const hpSpinScale = 0.4 + 0.6 * hpPct
        blade.rotation += (blade.rotationSpeed + spd * 0.02) * hpSpinScale

        // Wall collision with BOOST
        bounceOffWalls(blade)
        // Terrain: island ricochet, solids, speed boosters, mud, deep holes;
        // then team towers.
        if (terrain !== null) {
          bounceOffIslands(blade)
          applyTerrainGround(blade)
        }
        if (towers.length > 0) bounceOffTowers(blade)
      }

      // All-pairs collision (including friendly fire!), canonical order.
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          if (ordered[i]!.hp <= 0 || ordered[j]!.hp <= 0) continue
          resolveCollision(ordered[i]!, ordered[j]!)
        }
      }
      // Boss traits (§12.2 item 2): the combat clock advances per SUBSTEP of
      // a launched phase (identical novas at 1x / 2x), after the collisions.
      if (BOSSES100_BUILD && traitsActive && bossPort!['tickBossClock'](bossClock!, FIXED_STEP_MS,
        phase.value === 'player_launched' || phase.value === 'npc_launched')) fireEmberNova()
    }

    // Hit flash decay — VFX timer, ticks once per real frame regardless of
    // simSpeed so flashes don't double-blink at 2x.
    for (const blade of all) {
      if (blade.hp <= 0) continue
      if (blade.hitFlash > 0) blade.hitFlash--
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
      if (!simActive || !src.isThunder || src.hp <= 0) continue
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
        let thunderShown = THUNDER_DAMAGE
        let thunderColor = '#ffee44'
        if (!SKILLS_BUILD || target.skills === undefined) {
          target.hp = Math.max(0, target.hp - THUNDER_DAMAGE)
        } else {
          applyHpLoss(target, THUNDER_DAMAGE, 'thunder', hpLossOut)
          thunderShown = Math.round(THUNDER_DAMAGE - hpLossOut.absorbed - hpLossOut.warded)
          if (hpLossOut.warded > 0) thunderColor = SKILL_COLOR_SHIELD
          noteSkilledHpLoss(target)
        }
        // Yellow floating damage number
        const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
        const hs = 0.06 + Math.random() * 0.03 // vfx-rng
        if (thunderShown > 0) {
          damageNumbers.push({
            x: target.x, y: target.y, value: thunderShown,
            vx: Math.cos(ha) * hs, vy: Math.sin(ha) * hs,
            color: thunderColor, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
          })
        }
      }
    }

    // Homing Rockets land on game time (§10.3 item 11); only while the
    // simulation runs, so PvP peers resolve them on the same tick.
    if (SKILLS_BUILD && simActive && rocketsInFlight > 0) tickRockets()
    if (SKILLS_BUILD && skillsActive && skillVfx !== null) skillPort?.['tickSkillVfx'](skillVfx, 16)
    if (BOSSES100_BUILD && traitsActive) bossPort!['tickBossTraitVfx'](bossTraitFx!, 16)

    // Powerup spawn timer + lifecycle + collision (no-op when the stage
    // gate or test scene hasn't enabled the system).
    updatePowerups(16)

    // Update spark animations (remove finished ones)
    for (let i = activeSparks.length - 1; i >= 0; i--) {
      if (updateSpritesheetAnim(activeSparks[i]!, 16)) {
        activeSparks.splice(i, 1)
      }
    }

    updateStuffing(activeStuffing, 16)
    // Update death explosions (remove finished ones)
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
      if (updateSpritesheetAnim(activeExplosions[i]!, 16)) {
        activeExplosions.splice(i, 1)
      }
    }

    // Update Static Charge lightning bolts
    for (let i = activeShockBolts.length - 1; i >= 0; i--) {
      activeShockBolts[i]!.life -= 16
      if (activeShockBolts[i]!.life <= 0) activeShockBolts.splice(i, 1)
    }

    // Lava flame-burns + forest heal pulses (pooled, VFX-rate like sparks)
    tickBorderFx(borderFx, 16)

    // Update floating damage numbers + powerup pickup indicators
    updateDamageNumbers(16)
    updatePowerupFloats(16)

    // Tower debris + flash (VFX rate).
    if (towers.length > 0) tickTowerVfx()

    // Game over: all models of one side dead — or (Tree Smashers) a team's
    // tower destroyed. A fallen tower latches the result at once; the result
    // screen follows after a short destruction beat (TOWER_FALL_FRAMES), with
    // turn hand-off frozen meanwhile so nothing else can change the outcome.
    const playerAlive = livingBlades(playerBlades.value).length
    const npcAlive = livingBlades(npcBlades.value).length
    // Simultaneous loss (mutual wipe-out, both towers down): the side whose
    // launch is resolving takes it. That side is the same TEAM on both PvP
    // clients (host's 'player_launched' is the guest's 'npc_launched'), so the
    // two results stay complementary; outside a launch the host side wins.
    const tieWinner: 'player' | 'npc' = !pvpMode.value ? 'player'
      : phase.value.startsWith('npc_') ? 'npc'
        : phase.value.startsWith('player_') ? 'player'
          : (pvpLocalIsGuest ? 'npc' : 'player')
    if (towers.length > 0 && towerFallResult === null && !gameResult.value) {
      // A side loses by trees only when ALL its trees are down.
      const pDown = allTreesDown(towers, 'player')
      const nDown = allTreesDown(towers, 'npc')
      if (pDown || nDown) {
        towerFallResult = decideResult(playerAlive, npcAlive, pDown, nDown, tieWinner)
        towerFallFrames = 0
      }
    }
    if (towerFallResult !== null && !gameResult.value) {
      if (++towerFallFrames < TOWER_FALL_FRAMES) return
    }

    if ((playerAlive === 0 || npcAlive === 0 || towerFallResult !== null) && !gameResult.value) {
      gameResult.value = towerFallResult ?? decideResult(playerAlive, npcAlive, false, false, tieWinner)
      // A league fight (seeded first turn, DT1) never feeds the campaign's
      // last-result first-turn bias: its outcome must not tilt the next
      // campaign fight's odds.
      if (forcedFirstTurn === null) saveLastGameResult(gameResult.value)
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

    // Turn transitions — launched blade must come to rest (or be dead).
    // PvP: EVERY living blade must rest. The next launch starts a network
    // round-trip later on the receiving peer; a blade still sliding at that
    // point would have moved a different number of ticks on each client.
    const launched = all.find(b => b.id === launchedBladeId.value)
    const isResting = (b: SpinnerState) =>
      b.hp <= 0 || (speed(b) < STOP_THRESHOLD && b.accelFramesLeft === 0)
    // Rockets in flight hold the turn open (G7): they still deal damage.
    const launchedStopped = (!launched || isResting(launched))
      && (!pvpMode.value || all.every(isResting))
      && rocketsInFlight === 0

    if (phase.value === 'player_launched' && launchedStopped) {
      traitTurnEnd('player')
      phase.value = 'npc_turn'
      npcThinkingElapsed = 0
      launchedBladeId.value = null
      // Stat-switch boss: switch to attack phase on NPC turn
      for (const b of npcBlades.value) {
        if (b.statSwitchPhase) b.statSwitchPhase = 'attack'
      }
      traitTurnStart('npc')
      // PvP state-check: send hash after our launch resolved
      if (pvpMode.value) {
        pvpTurnCounter++
        const hash = computeStateHash()
        onStateHash?.(hash, pvpTurnCounter)
      }
      // Static Charge: the enemy team may be fully stunned for this turn.
      if (SKILLS_BUILD && skillsActive) resolveStunSkips()
      // Replay buffered remote launch that arrived while our blade was still rolling
      if (pvpMode.value && pendingRemoteLaunch && phase.value === 'npc_turn') {
        const p = pendingRemoteLaunch
        pendingRemoteLaunch = null
        executeRemoteLaunch(p.bladeIndex, p.ax, p.ay)
      }
    }

    if (phase.value === 'npc_launched' && launchedStopped) {
      traitTurnEnd('npc')
      phase.value = 'player_turn'
      launchedBladeId.value = null
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
      traitTurnStart('player')
      // Auto-select first living player blade
      const first = firstPickable(playerBlades.value)
      if (first) selectedBladeId.value = first.id
      // Static Charge: our whole team may be stunned for this turn → skip
      // it (the peer skips the same turn at its matching transition).
      if (SKILLS_BUILD && skillsActive) {
        resolveStunSkips()
        // (cast: TS narrowed `phase` to 'player_turn' above; the skip moved it)
        if (pvpMode.value && pendingRemoteLaunch && (phase.value as GamePhase) === 'npc_turn') {
          const p = pendingRemoteLaunch
          pendingRemoteLaunch = null
          executeRemoteLaunch(p.bladeIndex, p.ax, p.ay)
        }
      }
    }

    if (SKILLS_BUILD && skillsActive) publishSkillHud()
    if (BOSSES100_BUILD && traitsActive) publishTraitHud()

    // NPC thinking — in PvP mode the remote player controls the NPC blades,
    // so we skip the AI entirely and wait for launchRemoteBlade() calls.
    if (phase.value === 'npc_turn' && !pvpMode.value) {
      // A bot draws a fresh, human-like think time at the start of each turn.
      if (npcThinkingElapsed === 0) npcThinkTarget = npcPlay ? npcPlay.thinkMs() : NPC_THINK_MS
      npcThinkingElapsed += 16
      if (npcThinkingElapsed >= npcThinkTarget) {
        launchNpc()
      }
    }
  }

  const bounceOffWalls = (blade: SpinnerState) => {
    // Shape-aware wall query: null when the blade is clear of the boundary,
    // otherwise the outward normal + a clamped centre just inside the wall.
    const hit = resolveArenaWall(blade.x, blade.y, blade.radius)
    if (!hit) return
    const { nx, ny } = hit

    // Teleporter: pass through wall → emerge on the opposite side. Mirror the
    // position through the centre and clamp it just inside whatever shape.
    if (blade.isTeleporter) {
      const tp = clampInArena(-blade.x, -blade.y, blade.radius, 2)
      blade.x = tp.x
      blade.y = tp.y
      // Keep velocity — blade continues in the same direction
      return
    }

    // Push blade inside the arena by a small margin so it doesn't
    // re-trigger the wall bounce on the very next frame ("wall hug").
    blade.x = hit.clampX
    blade.y = hit.clampY

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
    // Momentum: +1 stack per rebound during the blade's own launch.
    if (SKILLS_BUILD && blade.skills !== undefined) {
      onOwnBounce(blade, launchedBladeId.value)
      onBankRebound(blade, launchedBladeId.value)
      hudTouch(blade)
    }

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
      // Skilled blades lose HP through the runtime (Hazard Ward → Guard
      // Shell → HP → Second Wind); the number is the post-ward, post-shield
      // amount, tinted cyan when the ward reduced it.
      let lavaShown = lavaDmg
      let lavaColor = blade.owner === 'player' ? '#ff6666' : '#66aaff'
      if (!SKILLS_BUILD || blade.skills === undefined) {
        blade.hp = Math.max(0, blade.hp - lavaDmg)
      } else {
        applyHpLoss(blade, lavaDmg, 'lava', hpLossOut)
        lavaShown = Math.round(lavaDmg - hpLossOut.absorbed - hpLossOut.warded)
        if (hpLossOut.warded > 0) lavaColor = SKILL_COLOR_SHIELD
        noteSkilledHpLoss(blade)
      }
      blade.hitFlash = HIT_FLASH_FRAMES
      const lavaAngle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
      const lavaSpd = 0.06 + Math.random() * 0.03 // vfx-rng
      if (lavaShown > 0) {
        damageNumbers.push({
          x: blade.x, y: blade.y,
          value: lavaShown, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
          vx: Math.cos(lavaAngle) * lavaSpd, vy: Math.sin(lavaAngle) * lavaSpd,
          color: lavaColor,
          isCrit: false
        })
      }
      // Flame-burn follows the spinner for ~1 s. Never restarts while it
      // plays: a re-contact holds it on the flicker frames (high tier) or
      // is ignored until the pass ends (low tier). A lethal touch skips it —
      // the death explosion owns that moment.
      if (blade.hp > 0) {
        flameImage()
        triggerBurn(borderFx, blade, burnCap(), !FX.low)
      }
    } else if (arenaType.value === 'forest') {
      const hpBeforeForest = blade.hp
      blade.hp = Math.min(blade.maxHp, blade.hp + 1)
      // Pulse + number only when a full 1 HP landed (a sub-1 top-up to max
      // still heals, silently) — see healFx.
      const healed = healFx(blade, hpBeforeForest)
      if (healed > 0) {
        const healAngle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
        const healSpd = 0.06 + Math.random() * 0.03 // vfx-rng
        damageNumbers.push({
          x: blade.x, y: blade.y,
          value: healed, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
          vx: Math.cos(healAngle) * healSpd, vy: Math.sin(healAngle) * healSpd,
          color: '#44cc66', isCrit: false
        })
      }
    }
  }

  /**
   * Terrain islands (stump / rock / pond). Each is a static disc: if a blade
   * overlaps it, push the blade out along the contact normal and reflect
   * its velocity the same way the arena wall does (with the same
   * speed-based boost) so ramming one feels like ricocheting off the rim.
   * Unlike the wall, island hits do NOT count toward `wallBounceCount`,
   * so they don't erode the wall-boost decay budget.
   */
  const bounceOffIslands = (blade: SpinnerState) => {
    if (terrain === null || terrain.islands.length === 0) return
    if (blade.isTeleporter) return // teleporters pass through islands
    for (const isl of terrain.islands) {
      const dx = blade.x - isl.x
      const dy = blade.y - isl.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = blade.radius + isl.radius
      if (dist >= minDist || dist < 0.01) continue

      // Push the blade out along the contact normal so it no longer overlaps.
      const nx = dx / dist
      const ny = dy / dist
      const overlap = minDist - dist
      blade.x += nx * overlap
      blade.y += ny * overlap

      const dot = blade.vx * nx + blade.vy * ny
      // Only reflect if the blade is moving INTO the island (dot < 0).
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
      if (SKILLS_BUILD && blade.skills !== undefined) {
        onOwnBounce(blade, launchedBladeId.value)
        onBankRebound(blade, launchedBladeId.value)
        hudTouch(blade)
      }

      triggerShake('small')

    }
  }

  // ── Terrain ground effects (boosters / mud / deep holes) ────────────────
  const applyTerrainGround = (blade: SpinnerState) => {
    if (terrain === null) return
    const gs = groundStateOf(blade)
    const maxSpd = BASE_MAX_FORCE * statsFor(blade).speedMultiplier
    // Mushroom caps + logs (solids; teleporters pass through like islands).
    if (!blade.isTeleporter && (terrain.mushrooms.length > 0 || terrain.logs.length > 0)) {
      collideSolids(terrain, blade, gs, maxSpd, skillClock(), solidOut)
      if (solidOut.bounced) {
        if (SKILLS_BUILD && blade.skills !== undefined) {
          onOwnBounce(blade, launchedBladeId.value)
          hudTouch(blade)
        }
        triggerShake('small')
      }
    }
    applyGround(terrain, blade, gs, maxSpd, skillClock(), groundOut)
    if (groundOut.boosted) {
      // A boost restarts the no-hit drag clock so the extra speed is felt.
      blade.lastHitTime = gameTime()
    }
  }

  // ── Team towers ───────────────────────────────────────────────────────────
  /** Frames between a tower falling and the result screen (destruction beat). */
  const TOWER_FALL_FRAMES = 55
  let towerFallResult: 'win' | 'lose' | null = null
  let towerFallFrames = 0
  /** HUD mirror of the towers (UI may show bars; canvas draws its own ring). */
  const towerHud = shallowRef<{ side: 'player' | 'npc'; hp: number; maxHp: number }[]>([])
  const publishTowerHud = () => {
    towerHud.value = towers.map(t => ({ side: t.side, hp: t.hp, maxHp: t.maxHp }))
  }

  /**
   * Team tower: a static disc blades ricochet off like an island. An ENEMY
   * blade's contact damages it (closing speed × damage multiplier × the
   * DAMAGE_SCALE family, defense 1, one roll per contact period); own-team
   * blades just bounce. Invulnerable split children deal nothing. Towers are
   * immune to every skill / boss trait / hazard — only body contact hurts.
   * A SPIKED tree (boss trees — arenaTerrain TOWER_TUNING.spikes) pricks the
   * attacker back for TOWER_TUNING.spikeRecoil × the plain impact
   * (towerSpikeRecoil; Tower Breaker's bonus is not spiked): a 'reflect' HP
   * loss, deterministic, inside the PvP state hash (blade hp).
   */
  const bounceOffTowers = (blade: SpinnerState) => {
    for (const tower of towers) {
      const dx = blade.x - tower.x
      const dy = blade.y - tower.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = blade.radius + tower.radius
      if (dist >= minDist || dist < 0.01) continue
      const nx = dx / dist
      const ny = dy / dist
      const overlap = minDist - dist
      blade.x += nx * overlap
      blade.y += ny * overlap
      const dot = blade.vx * nx + blade.vy * ny
      if (dot >= 0) continue
      const closing = -dot
      blade.vx = (blade.vx - 2 * dot * nx) * BOUNCE_DAMPENING
      blade.vy = (blade.vy - 2 * dot * ny) * BOUNCE_DAMPENING
      tower.flash = Math.max(tower.flash, 0.6)
      if (SKILLS_BUILD && blade.skills !== undefined) onBankRebound(blade, launchedBladeId.value)

      if (blade.owner === tower.side || tower.hp <= 0 || isInvulnerable(blade)) continue
      if (closing <= STOP_THRESHOLD) continue
      const now = gameTime()
      const key = `${blade.id}_${tower.side}`
      const last = towerContactTimes.get(key) ?? 0
      towerContactTimes.set(key, now)
      if (now - last <= CONTACT_REARM_MS) continue
      blade.lastHitTime = now
      let dmg = towerHitDamage(closing, statsFor(blade).damageMultiplier, DAMAGE_SCALE)
      if (dmg <= 0) continue
      const recoil = towerSpikeRecoil(tower, nx, ny, dmg)
      // Tower Breaker (smasher skill): bonus damage against team towers.
      if (SKILLS_BUILD && blade.skills !== undefined) {
        const tm = towerDamageMul(blade)
        if (tm !== 1) {
          pushSkillEvent('tower', 'tower_breaker', blade, dmg * (tm - 1))
          dmg *= tm
        }
      }
      tower.hp = Math.max(0, tower.hp - dmg)
      tower.flash = 1
      if (!FX.low) {
        spawnSplinters(towerFx, tower.x + nx * tower.radius, tower.y + ny * tower.radius, nx, ny, tower.radius, dmg)
        // Hard hit: now and then a few leaves shake loose too.
        if (dmg >= tower.maxHp * 0.06 && Math.random() < 0.35) spawnLeaves(towerFx, tower.x, tower.y, tower.radius, 3, 0.15) // vfx-rng
      }
      triggerShake('small')
      const shown = Math.round(dmg)
      if (shown > 0) {
        const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
        damageNumbers.push({
          x: tower.x + nx * tower.radius, y: tower.y + ny * tower.radius, value: shown,
          vx: Math.cos(ha) * 0.07, vy: Math.sin(ha) * 0.07,
          color: '#ffd166', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
        })
      }
      if (recoil > 0) pricklyRecoil(blade, tower, nx, ny, recoil)
      if (tower.hp <= 0) onTowerDestroyed(tower)
      publishTowerHud()
    }
  }

  /** The spiked tree's thorns prick `blade` for `recoil` HP (gameplay), with
   *  the attacker's hit flash + a 'thorns' damage number (applyBladeDamage),
   *  a few thorn shards off the garland and — once per match, the first time
   *  the player's smasher gets pricked — a "Spiked tree!" callout (VFX). */
  let spikeCalloutShown = false
  const pricklyRecoil = (blade: SpinnerState, tower: TeamTower, nx: number, ny: number, recoil: number) => {
    if (blade.hp <= 0) return
    const killed = applyBladeDamage(blade, recoil, blade.x, blade.y, tower.side, false, 'reflect', false, 'thorns')
    if (!FX.low) spawnThornShards(towerFx, tower.x + nx * tower.radius, tower.y + ny * tower.radius, nx, ny, tower.radius, recoil)
    if (killed) {
      handleSplitDeath(blade)
      triggerShake('big')
    }
    if (!spikeCalloutShown && blade.owner === 'player') {
      spikeCalloutShown = true
      // On the far side of the attacker (into the clearing), clear of its
      // own thorn-damage number.
      const d = tower.radius + blade.radius * 3.2
      damageNumbers.push({
        x: tower.x + nx * d, y: tower.y + ny * d, value: 0,
        vx: 0, vy: -0.05, color: '#f2e6c8', life: DAMAGE_NUMBER_LIFE * 1.4, maxLife: DAMAGE_NUMBER_LIFE * 1.4,
        isCrit: false, comboText: translate('terrain.spikedTree'), centered: true
      })
    }
  }

  const TOWER_TEAM_COLORS: Record<'player' | 'npc', { leaf: string; leafDark: string }> = {
    player: { leaf: '#5fc36a', leafDark: '#2f7d43' },
    npc: { leaf: '#e3664f', leafDark: '#9c3328' }
  }

  const onTowerDestroyed = (tower: TeamTower) => {
    triggerShake('big')
    try { playSound('celebration-1') } catch { /* audio optional */ }
    const c = TOWER_TEAM_COLORS[tower.side]
    // Several trees per side: how many of this side's are still standing.
    let left = 0
    for (const t of towers) if (t.side === tower.side && t.hp > 0) left++
    const palette = [c.leaf, c.leafDark, '#8a5a35', '#5e3b22', '#f4e3b0']
    const n = FX.low ? 14 : 28
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4 // vfx-rng
      const s = 1.6 + Math.random() * 3.2 // vfx-rng
      towerDebris.push({
        x: tower.x, y: tower.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, // vfx-rng
        size: 4 + Math.random() * 7, color: palette[i % palette.length]!, life: 1 // vfx-rng
      })
    }
    damageNumbers.push({
      x: 0, y: tower.y - tower.radius, value: 0,
      vx: 0, vy: -0.05, color: '#fff1c1', life: DAMAGE_NUMBER_LIFE * 1.6, maxLife: DAMAGE_NUMBER_LIFE * 1.6,
      isCrit: true, comboText: left > 0 ? translate('terrain.treesLeft', { n: left }) : translate('terrain.towerDestroyed'), centered: true
    })
  }

  const tickTowerVfx = () => {
    for (const t of towers) if (t.flash > 0) t.flash = Math.max(0, t.flash - 0.06)
    // Leaf cascade once per damage-state drop (healthy → damaged → nearly
    // down → felled); the first look only records the baseline.
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!
      const st = towerDamageStage(t.hp, t.maxHp)
      const n = noteTowerStage(towerFx, i, st)
      if (n > 0 && !FX.low) spawnLeaves(towerFx, t.x, t.y, t.radius, n, st === 1 ? 0.1 : st === 2 ? 0.35 : 0.5)
    }
    tickTowerFx(towerFx, 16)
    for (let i = towerDebris.length - 1; i >= 0; i--) {
      const d = towerDebris[i]!
      d.x += d.vx
      d.y += d.vy
      d.vx *= 0.93
      d.vy *= 0.93
      d.rot += d.vr
      d.life -= 0.012
      if (d.life <= 0) towerDebris.splice(i, 1)
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
          // The full HEALER_CONTACT_HEAL applies unrounded, clamped at maxHp
          // (0.3 missing → +0.3, 1.6 missing → +1.6). Pulse + number follow
          // the HP actually applied (healFx: only ≥1, shown rounded).
          if (a.hp < a.maxHp) {
            const hpBeforeA = a.hp
            a.hp = Math.min(a.maxHp, a.hp + HEALER_CONTACT_HEAL)
            const shownA = healFx(a, hpBeforeA)
            if (shownA > 0) damageNumbers.push({
              x: a.x, y: a.y,
              value: shownA, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
              vx: 0, vy: -0.08,
              color: '#44ff88', isCrit: false
            })
          }
          if (b.hp < b.maxHp) {
            const hpBeforeB = b.hp
            b.hp = Math.min(b.maxHp, b.hp + HEALER_CONTACT_HEAL)
            const shownB = healFx(b, hpBeforeB)
            if (shownB > 0) damageNumbers.push({
              x: b.x, y: b.y,
              value: shownB, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE,
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

    // Anchor (smasher skill): a blade pushed while it is NOT the launched one
    // keeps only part of the knockback. Enemy pairs only; no RNG.
    if (SKILLS_BUILD && a.owner !== b.owner && (a.skills !== undefined || b.skills !== undefined)) {
      const lidAnchor = launchedBladeId.value
      const ka = anchorKeep(a, lidAnchor)
      if (ka !== 1) {
        a.vx *= ka
        a.vy *= ka
        if (contactArmed) pushSkillEvent('anchor', 'anchor', a, 1 - ka)
      }
      const kb = anchorKeep(b, lidAnchor)
      if (kb !== 1) {
        b.vx *= kb
        b.vy *= kb
        if (contactArmed) pushSkillEvent('anchor', 'anchor', b, 1 - kb)
      }
    }

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
        // Match RNG (both PvP peers draw it, `a` first — pairs run in syncKey order).
        if (!aCrit && a.config.topPartId === 'star' && aSpeed > bSpeed && bCritReady && matchRng() < 0.08) {
          aCrit = true
        }
        let defMul = aCrit ? 1 : bStats.defenseMultiplier
        if (a.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (a.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        const atkMul = aCrit ? 1.25 : 1
        dmgAtoB = (closingSpeed * aStats.damageMultiplier * atkMul * aStats.totalWeight)
          / (bStats.totalWeight * defMul)
          * DAMAGE_SCALE * bSpeedAdv
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
        if (!bCrit && b.config.topPartId === 'star' && bSpeed > aSpeed && aCritReady && matchRng() < 0.08) {
          bCrit = true
        }
        let defMul = bCrit ? 1 : aStats.defenseMultiplier
        if (b.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (b.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        const atkMul = bCrit ? 1.25 : 1
        dmgBtoA = (closingSpeed * bStats.damageMultiplier * atkMul * bStats.totalWeight)
          / (aStats.totalWeight * defMul)
          * DAMAGE_SCALE * aSpeedAdv
          * (friendlyFire ? FRIENDLY_FIRE_MUL : 1)
      }

      // ── Directional armour (smasher `armor`): damage TAKEN by where the
      // hit lands on the defender's gameplay heading. The contact point sits
      // at −n on b and +n on a. Thorns reads the zone and the unarmoured hit.
      const zoneB = zoneOf(b, -nx, -ny)
      const zoneA = zoneOf(a, nx, ny)
      const thornsBaseAtoB = dmgAtoB
      const thornsBaseBtoA = dmgBtoA
      let armorTagB = 1
      let armorTagA = 1
      if (armorActive) {
        if (dmgAtoB > 0 && b.armor !== undefined) {
          armorTagB = armorMul(b.armor, zoneB)
          dmgAtoB *= armorTagB
        }
        if (dmgBtoA > 0 && a.armor !== undefined) {
          armorTagA = armorMul(a.armor, zoneA)
          dmgBtoA *= armorTagA
        }
      }

      // ── Skills (§5 steps 2–3), per direction: attacker multiplier
      // (Lucky Edge → Momentum, clamped) then defender (Phase Step negates;
      // else Mirror Plate splits). Each blade rolls only its own stream, and
      // pairs run in syncKey order → identical on both PvP peers.
      let aLucky = false
      let bLucky = false
      let reflectOntoA = 0
      let reflectOntoB = 0
      const skilledPair = SKILLS_BUILD && (a.skills !== undefined || b.skills !== undefined)
      if (skilledPair) {
        const nowSkill = skillClock()
        const lid = launchedBladeId.value
        if (dmgAtoB > 0) {
          dmgAtoB *= skillPort!['outgoingSkillMul'](a, b, dmgAtoB, 'hit', aCrit, lid, skillOut)
          aLucky = skillOut.lucky
          noteOutgoing(a, cx, cy)
          skillPort!['incomingSkill'](b, a, dmgAtoB, 'hit', nowSkill, aStats.defenseMultiplier, skillIn)
          dmgAtoB = skillIn.taken
          reflectOntoA = skillIn.reflect
          noteIncoming(b)
        }
        if (dmgBtoA > 0) {
          dmgBtoA *= skillPort!['outgoingSkillMul'](b, a, dmgBtoA, 'hit', bCrit, lid, skillOut)
          bLucky = skillOut.lucky
          noteOutgoing(b, cx, cy)
          skillPort!['incomingSkill'](a, b, dmgBtoA, 'hit', nowSkill, bStats.defenseMultiplier, skillIn)
          dmgBtoA = skillIn.taken
          reflectOntoB = skillIn.reflect
          noteIncoming(a)
        }
      }

      // ── Anti-draw: if both would die, the stronger attacker survives ──
      // Survivability counts a Guard Shell (`effectiveHp` = hp + shield).
      const aEffHp = effectiveHp(a)
      const bEffHp = effectiveHp(b)
      const aWouldDie = dmgBtoA > 0 && aEffHp - dmgBtoA <= 0
      const bWouldDie = dmgAtoB > 0 && bEffHp - dmgAtoB <= 0
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
          dmgBtoA = Math.max(0, aEffHp - 1)
        } else {
          dmgAtoB = Math.max(0, bEffHp - 1)
        }
      }

      // ── Apply damage a→b ──────────────────────────────────────────
      if (dmgAtoB > 0) {
        if (aCrit) {
          hadCrit = true
          lastCritAt.set(b.id, nowCrit)
        }
        if (applyBladeDamage(b, dmgAtoB, cx, cy, a.owner, aCrit, 'hit', aLucky && !aCrit)) hadKill = true
        logCombatHit(a, b, dmgAtoB, aCrit, aSpeed, bSpeed)
        // Life-leech: attacker heals 30% of damage dealt
        if (a.isLifeLeech) {
          const heal = dmgAtoB * 0.3
          const hpBefore = a.hp
          a.hp = Math.min(a.maxHp, a.hp + heal)
          // Same pulse + number rule as every other heal: only when ≥1 HP
          // actually landed after the clamp (see healFx).
          const shownA = healFx(a, hpBefore)
          if (shownA > 0) {
            const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
            const hs = 0.06 + Math.random() * 0.03 // vfx-rng
            damageNumbers.push({
              x: a.x, y: a.y, value: shownA,
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
        if (applyBladeDamage(a, dmgBtoA, cx, cy, b.owner, bCrit, 'hit', bLucky && !bCrit)) hadKill = true
        logCombatHit(b, a, dmgBtoA, bCrit, bSpeed, aSpeed)
        // Life-leech: attacker heals 30% of damage dealt
        if (b.isLifeLeech) {
          const heal = dmgBtoA * 0.3
          const hpBefore = b.hp
          b.hp = Math.min(b.maxHp, b.hp + heal)
          // Same pulse + number rule as every other heal: only when ≥1 HP
          // actually landed after the clamp (see healFx).
          const shownB = healFx(b, hpBefore)
          if (shownB > 0) {
            const ha = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3) // vfx-rng
            const hs = 0.06 + Math.random() * 0.03 // vfx-rng
            damageNumbers.push({
              x: b.x, y: b.y, value: shownB,
              vx: Math.cos(ha) * hs, vy: Math.sin(ha) * hs,
              color: '#44cc66', life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE, isCrit: false
            })
          }
        }
      }

      if (skilledPair) {
        // §5 step 6: Mirror Plate reflections onto a still-living attacker
        // (kind 'reflect' never procs anything), then the contact skills of
        // each skilled blade of an enemy pair (rocket counter, Static Charge).
        if (reflectOntoA > 0 && a.hp > 0) {
          if (applyBladeDamage(a, reflectOntoA, a.x, a.y, b.owner, false, 'reflect', false, 'mirror_plate')) hadKill = true
        }
        if (reflectOntoB > 0 && b.hp > 0) {
          if (applyBladeDamage(b, reflectOntoB, b.x, b.y, a.owner, false, 'reflect', false, 'mirror_plate')) hadKill = true
        }
        // Thorns: a hit that landed on the bearer's spiked side recoils onto the
        // attacker (kind 'reflect' — never procs, never reflected again).
        if (dmgAtoB > 0 && a.hp > 0) {
          const th = thornsRecoil(b, a, thornsBaseAtoB, zoneB === spikedZone(b), aStats.defenseMultiplier)
          if (th > 0) {
            const hpBefore = a.hp
            if (applyBladeDamage(a, th, a.x, a.y, b.owner, false, 'reflect', false, 'thorns')) hadKill = true
            pushSkillEvent('thorns', 'thorns', a, hpBefore - a.hp, b)
          }
        }
        if (dmgBtoA > 0 && b.hp > 0) {
          const th = thornsRecoil(a, b, thornsBaseBtoA, zoneA === spikedZone(a), bStats.defenseMultiplier)
          if (th > 0) {
            const hpBefore = b.hp
            if (applyBladeDamage(b, th, b.x, b.y, a.owner, false, 'reflect', false, 'thorns')) hadKill = true
            pushSkillEvent('thorns', 'thorns', b, hpBefore - b.hp, a)
          }
        }
      }
      // Armour feedback: a short tag where a reinforced plate blocked part
      // of the hit or a weak spot took extra (VFX only).
      if (armorTagB !== 1 && dmgAtoB > 0) spawnArmorTag(cx, cy, armorTagB < 1)
      if (armorTagA !== 1 && dmgBtoA > 0) spawnArmorTag(cx, cy, armorTagA < 1)
      // Boss traits (§12.2 item 3): cold touch / freeze / chill, both ways,
      // after the hits and reflections, before the contact skills.
      if (BOSSES100_BUILD && traitsActive && a.owner !== b.owner
        && (a.config.bossTrait !== undefined || b.config.bossTrait !== undefined)) {
        const nowTrait = skillClock()
        const lid = launchedBladeId.value
        if (a.config.bossTrait !== undefined) runTraitContact(a, b, nowTrait, lid)
        if (b.config.bossTrait !== undefined) runTraitContact(b, a, nowTrait, lid)
      }
      if (skilledPair && a.owner !== b.owner) {
        const nowContact = skillClock()
        const lid = launchedBladeId.value
        if (a.skills !== undefined) runContactSkills(a, b, nowContact, lid)
        if (b.skills !== undefined) runContactSkills(b, a, nowContact, lid)
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
        // Gameplay roll (spawn position + drift) — on the match RNG.
        const angle = matchRng() * Math.PI * 2
        const sideUnit = BLADE_RADIUS * teamSizeMul[emitter.owner]
        const spawnDist = emitter.radius + sideUnit * 0.5 + 2
        const child = createBladeState(
          emitter.owner,
          emitter.x + Math.cos(angle) * spawnDist,
          emitter.y + Math.sin(angle) * spawnDist,
          { ...emitter.config, bossAbility: undefined, isBoss: false, bossTrait: undefined, shardTrait: undefined },
          false
        )
        child.radius = sideUnit * 0.45
        // Every 2nd child adds +1 HP: 1→1, 2→2, 3→2, 4→3, 5→3, 6→4 …
        emitter.emittedChildCount = (emitter.emittedChildCount ?? 0) + 1
        const bonusHp = Math.floor((emitter.emittedChildCount) / 2)
        child.maxHp = 1 + bonusHp
        child.hp = child.maxHp
        child.isEmittedChild = true
        child.syncKey = childSyncKey(emitter)
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
        // A blade inside a Phase Step window takes no chip from an enemy.
        if (a.config.topPartId === 'triangle' && !aHitInBack && b.hp > 0
          && !(b.skills !== undefined && blocksEnemyChip(b, a, skillClock()))) {
          if (applyBladeDamage(b, chipFor(b), cx, cy, a.owner, false, 'chip')) hadKill = true
          chipped = true
        }
        if (b.config.topPartId === 'triangle' && !bHitInBack && a.hp > 0
          && !(a.skills !== undefined && blocksEnemyChip(a, b, skillClock()))) {
          if (applyBladeDamage(a, chipFor(a), cx, cy, b.owner, false, 'chip')) hadKill = true
          chipped = true
        }
        if (chipped) spikyChipCooldowns.set(spikyKey, nowChip)
      }
    }

    // Split-boss shatter — if the hit killed a blade flagged to split,
    // spawn its mini children right where it died. Done here (not at the
    // damage site) so only a single death pass runs per collision.
    if (hadKill) {
      handleSplitDeath(a)
      handleSplitDeath(b)
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
      const idx = Math.floor(Math.random() * 5) + 1 // vfx-rng (SFX variant)
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

  // Whether GAMEPLAY wants the simulation running. The loop actually runs only
  // when this is true AND the platform hasn't suspended us — see the pause-gate
  // block above the composable.
  let physicsWanted = false

  const runPhysicsLoop = () => {
    // Guard against a second RAF chain: two concurrent chains both reassign
    // `physicsRafId`, so neither ever sees null and the simulation silently
    // runs at double speed.
    if (physicsRafId !== null) return
    // Fresh delta baseline. On resume the wall-clock gap since the last tick
    // can be minutes; feeding that straight into the accumulator would burn
    // the entire catch-up budget simulating a frame nobody saw.
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

  const haltPhysicsLoop = () => {
    if (physicsRafId !== null) {
      cancelAnimationFrame(physicsRafId)
      physicsRafId = null
    }
  }

  // The loop runs only when GAMEPLAY wants it AND the platform hasn't
  // suspended us. Keeping the two inputs separate is what stops a platform
  // resume from restarting a simulation gameplay had legitimately ended —
  // battle over, modal open, reward screen up.
  const syncPhysicsLoop = () => {
    if (physicsWanted && !isGamePaused.value) runPhysicsLoop()
    else haltPhysicsLoop()
  }
  const unregisterPauseSyncer = registerPauseSyncer(syncPhysicsLoop)

  const startPhysics = () => {
    physicsWanted = true
    physicsAccumulator = 0
    syncPhysicsLoop()
  }

  const stopPhysics = () => {
    physicsWanted = false
    syncPhysicsLoop()
  }

  /**
   * Drop this instance's syncer from the pause registry. `useSpinnerGame` is a
   * factory (fresh state per call), so a torn-down arena would otherwise stay
   * reachable from the gate. Call from the owning view's `onUnmounted`.
   */
  const disposePhysics = () => {
    unregisterPauseSyncer()
    stopPhysics()
  }

  // ─── Canvas Rendering ────────────────────────────────────────────────────

  const renderTraitLayer = (ctx: CanvasRenderingContext2D): void => {
    if (!BOSSES100_BUILD || bossPort === null || bossTraitFx === null || bossClock === null) return
    const bp = bossPort
    const fx = bossTraitFx
    const now = skillClock()
    const low = FX.low
    const charge = bp['novaCharge'](bossClock)
    const period = bp['BOSS_TRAIT_TUNING']['EMBER_PERIOD_MS']
    const mul = bp['BOSS_TRAIT_TUNING']['EMBER_RADIUS_MUL']
    // Once the fight is decided (win OR lose) the frost status is moot: the ice shell / chill veil
    // are "for the next turn", so they must not stay on the winner as a white bubble through the
    // result screen (owner report 2026-10-24).
    const over = gameResult.value !== null
    for (const b of allBlades.value) {
      if (b.hp <= 0) continue
      if (b.config.bossTrait === 'ember') bp['renderEmberCharge'](ctx, fx, b, charge, period, mul * b.radius, now, low)
      if (over) continue
      if (b.lockKind === 'frost' && bp['isFrostLockedFor'](b, turnIndexOf(b.owner) + 1)) bp['renderIceShell'](ctx, fx, b, now, low)
      const n = b.chillN ?? 0
      if (n > 0) bp['renderChillOverlay'](ctx, fx, b, n, now, low)
    }
    bp['renderBossTraitLayer'](ctx, fx, now, low)
  }

  const render = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    showHintAnim = false,
    currentStageId = 1
  ) => {
    noteCanvasMetrics(canvasWidth, canvasHeight)
    const view = arenaViewFor(canvasWidth, canvasHeight)
    const scale = view.scale
    // Meteor shower: its render clock and the camera shake, in WHOLE device
    // pixels so the static blit stays pixel-aligned (render-sharpness rule).
    const meteorOn = meteorFx.count > 0 && meteorFx.clock < meteorFx.end
    const meteorT = meteorOn ? meteorClock(meteorFx, performance.now()) : 0
    const devPx = (ctx.canvas?.width ?? canvasWidth) / Math.max(1, canvasWidth)
    const ringOn = ringFx.count > 0 && ringFx.clock < ringFx.end
    const ringT = ringOn ? ringClock(ringFx, performance.now()) : 0
    const shake = meteorOn ? meteorShake(meteorFx, meteorT) : ringOn ? ringShake(ringFx, ringT) : null
    const shakeX = shake !== null ? shake.x : 0
    const shakeY = shake !== null ? shake.y : 0
    const centerX = view.cx + shakeX / devPx
    const centerY = view.cy + shakeY / devPx

    // ONE blit of everything static: background (theme backdrop + props or
    // the equipped skin — keyed on the skin id, so equipping a new skin in the
    // modal still applies immediately), floor, rim, terrain, tower bodies.
    drawStaticLayer(ctx, canvasWidth, canvasHeight, shakeX, shakeY)

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)

    renderArenaDynamic(ctx)
    if (towers.length > 0 || towerDebris.length > 0) renderTowers(ctx)
    if (towerFx.active > 0) drawTowerFx(ctx, towerFx)
    renderPowerups(ctx)
    // Meteor craters, dust, shock rings, target rings: on the floor.
    if (meteorOn) drawMeteorGround(ctx, meteorFx, meteorT)
    if (ringOn) drawRingGround(ctx, ringFx, ringT)
    renderGroundDecals(ctx, performance.now())
    renderTrails(ctx)
    renderCloudParticles(ctx)
    renderSandGrains(ctx)

    // Mechanic markers under the blades (flat rings — no glow, so every
    // arena shape gets them; the old soft team / skin auras are removed, see
    // renderBladeMarkers). Boss-trait carriers keep their flat trait ring.
    // Selection highlight — a control affordance ("this blade is armed"),
    // not gameplay, so it goes in a clean feed. Drawn UNDER the blade so the
    // plush and its HP gauge stay on top of it.
    if (!CLEAN_FEED && phase.value === 'player_turn' && selectedBlade.value && !isDragging.value) {
      renderSelectionGlow(ctx, selectedBlade.value)
    }
    for (const blade of allBlades.value) {
      if (blade.hp <= 0) continue
      renderBladeMarkers(ctx, blade)
      if (BOSSES100_BUILD && traitsActive && blade.config.bossTrait !== undefined) {
        bossPort!['renderBossAura'](ctx, bossTraitFx!, blade, skillClock(), FX.low)
      }
    }

    // Aim preview (pull band, power arrow, guide dots) UNDER the models, so
    // the arrow comes out from behind the plush instead of covering it.
    // Kept in a clean feed: it is the shot being aimed, not interface.
    if (phase.value === 'player_turn' && selectedBlade.value) {
      if (isDragging.value) renderAimPreview(ctx, selectedBlade.value)
      else if (isJoystickDragging.value) renderJoystickAimPreview(ctx, selectedBlade.value)
    }
    // Idle "demo pull" hint: the same kit as the real aim preview, also
    // under the models. A teaching aid (interface), so not in a clean feed.
    if (!CLEAN_FEED) renderHintAnimation(ctx, showHintAnim, centerX, centerY, scale, devPx)

    // Render all models
    const shakeLeft = tapShakeId >= 0 ? tapShakeUntil - performance.now() : 0
    for (const blade of allBlades.value) {
      if (blade.hp <= 0) continue
      if (shakeLeft > 0 && blade.id === tapShakeId) {
        // Refused tap on a frozen blade: a short damped side-to-side shake.
        ctx.save()
        ctx.translate(Math.sin(shakeLeft * 0.13) * 4 * (shakeLeft / TAP_SHAKE_MS), 0)
        renderBlade(ctx, blade)
        ctx.restore()
      } else {
        renderBlade(ctx, blade)
      }
    }
    if (tapShakeId >= 0 && shakeLeft <= 0) tapShakeId = -1
    // #UX3 balloon bursts over the models (a no-op on gauge builds).
    if (BALLOON_HP_BUILD) renderBalloonLayer(ctx)

    // Arena-border contact VFX, over the spinner they follow: the flame ring
    // licks over the rim (the art keeps the HP digit clear), the heal pulse
    // rings out from it.
    renderBurns(ctx, borderFx, flameImg)
    renderHeals(ctx, borderFx, FX.low)

    // Boss-trait layer (§7.3): ember charge arcs, ice shells on frozen
    // blades, frost rims on chilled ones, then pooled transient effects.
    if (BOSSES100_BUILD && traitsActive) renderTraitLayer(ctx)

    // Skill layer (§8.2/§8.3): rockets, Second Wind rings, stun glyphs.
    if (SKILLS_BUILD && skillsActive && skillVfx !== null) {
      skillPort?.['renderSkillLayer'](ctx, skillVfx, rocketPool, allBlades.value, isStunnedForVfx, skillClock(), FX.low)
      skillPort?.['renderSkillFlavour'](ctx, skillVfx)
    }

    // Spark VFX
    for (const spark of activeSparks) {
      renderSpritesheetAnim(ctx, spark)
    }

    // Death explosions
    for (const explosion of activeExplosions) {
      renderSpritesheetAnim(ctx, explosion)
    }
    drawStuffing(ctx, activeStuffing)

    // Meteors in flight, landing starbursts, spark shards: over the models.
    if (meteorOn) drawMeteorSky(ctx, meteorFx, meteorT, scale * devPx)
    if (ringOn) drawRingSky(ctx, ringFx, ringT, scale * devPx)

    // Static Charge lightning bolts
    for (const bolt of activeShockBolts) {
      const t = bolt.life / bolt.maxLife
      drawLightningBolt(ctx, bolt.x0, bolt.y0, bolt.x1, bolt.y1, (isFirefox || FX.low) ? {
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

    // #Consistency-7: tree HP gauges ride ABOVE the smashers and their balloons (a spawn row sits
    // right at each tree, and the plate used to vanish under the balloons / overlap the disc).
    // The SAME gauge a smasher shows, on the side of the tree that bulges into the arena.
    if (!CLEAN_FEED || CLEAN_HP_RINGS) for (const t of towers) if (t.hp > 0) renderTowerGauge(ctx, t)

    // Floating damage numbers.
    //
    // The digits themselves are already gone in a clean feed (the recorder
    // no-ops fillText), but the crit burst behind them is drawn with fills
    // and would survive as a naked flourish with no number in it. Skip the
    // whole layer instead — the hit reads from the blade's own flash.
    if (!CLEAN_FEED) {
      renderDamageNumbers(ctx)
      renderPowerupFloats(ctx)
      // Skill proc callouts (icon + skill name + what it did), css-px sized.
      if (SKILLS_BUILD && skillCallouts !== null) {
        skillPort?.['renderSkillCallouts'](ctx, skillCallouts, performance.now(), 1 / scale,
          centerX / scale, centerY / scale, FX.low)
      }
    }

    // Drag indicator, top layer: the cancel-zone ring / ✕ badge (the arrow,
    // band and dots are drawn under the models — renderAimPreview).
    //
    // DELIBERATELY KEPT in a clean feed. This is not interface reporting on
    // the game, it is the player's shot being aimed: it shows intent, it is
    // the only thing on screen between two collisions, and a preview clip
    // without it is a video of blades moving for no visible reason.
    if (isDragging.value && selectedBlade.value && phase.value === 'player_turn') {
      renderDragIndicator(ctx, selectedBlade.value)
    }

    // The early-game tutorial arrows (the idle hint is drawn under the
    // models, above). A teaching aid aimed at the player holding the device —
    // pure interface, and the arrows read as a watermark on a silent clip.
    if (!CLEAN_FEED) {
      // Early-game tutorial arrows orbiting the player's spinners — gated
      // on `currentStageId <= 11` and a 1s grace from the start of player_turn.
      renderTutorialArrows(ctx, currentStageId)
    }

    // Joystick position is updated here so drag hit-testing stays in sync
    // with the visible knob, but the actual drawing happens on a separate
    // overlay canvas (see renderJoystickOverlay) so it can render ABOVE the
    // HTML stat-card HUD instead of being covered by it.
    if (isJoystickVisible.value && phase.value === 'player_turn') {
      updateJoystickCenter(canvasWidth, canvasHeight, view)
    }

    ctx.restore()

    // Meteor shower screen layer (css px): flat vignette bands + hero flash.
    if (meteorOn) drawMeteorScreen(ctx, meteorFx, meteorT, canvasWidth, canvasHeight)
    if (ringOn) drawRingScreen(ctx, ringFx, ringT, canvasWidth, canvasHeight)
  }

  // Bottom-left corner of the visible canvas, clamped outside the arena.
  // Pulled out so both the main render (for hit testing) and the overlay
  // canvas (for drawing) reach the same coordinates.
  const updateJoystickCenter = (canvasWidth: number, canvasHeight: number, view: ArenaView) => {
    const scale = view.scale
    // Visible span from the arena origin to the LEFT and to the BOTTOM edge
    // (the fit may slide the board off the screen centre — arenaFit).
    const halfVisibleX = view.cx / scale
    const halfVisibleY = (canvasHeight - view.cy) / scale
    void canvasWidth
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

  // Whether the overlay canvas currently holds any pixels.
  //
  // The joystick renders into a dedicated full-screen canvas that sits above
  // the HUD in DOM order, so the bottom-left stat card no longer covers it.
  // That layer is empty for every frame the joystick is not up — which, on the
  // default drag-to-aim control scheme, is every frame of the match. Clearing
  // it unconditionally dirtied and recomposited a full-viewport layer once per
  // frame to produce nothing.
  let joystickOverlayPainted = false

  const renderJoystickOverlay = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    // Noted here as well as in `render` so this layer is self-sufficient: it is
    // the one that both measures the viewport and decides whether the joystick
    // is needed, and reading `isJoystickVisible` against the PREVIOUS frame's
    // dimensions would show a stale answer for a frame after every resize.
    noteCanvasMetrics(canvasWidth, canvasHeight)
    const wantsJoystick = isJoystickVisible.value && phase.value === 'player_turn'
    // Nothing on screen and nothing to draw — leave the layer untouched so the
    // compositor can keep reusing last frame's (empty) tile.
    if (!wantsJoystick && !joystickOverlayPainted) return
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    joystickOverlayPainted = wantsJoystick
    if (!wantsJoystick) return
    const view = arenaViewFor(canvasWidth, canvasHeight)
    const centerX = view.cx
    const centerY = view.cy
    const scale = view.scale
    updateJoystickCenter(canvasWidth, canvasHeight, view)
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
  // One pass instead of three. The two wide layers are pure fill area — a
  // 6px and a 3px translucent stroke retraced over the whole tail, every
  // blade, every frame — so collapsing them into a single mid-width stroke
  // removes two thirds of the trail's cost and most of its overdraw.
  const TRAIL_LAYERS_LOW = [
    { widthBase: 2.5, widthSpeed: 2, alphaScale: 0.6 }
  ]

  const renderTrails = (ctx: CanvasRenderingContext2D) => {
    const now = performance.now()
    const layers = FX.low ? TRAIL_LAYERS_LOW : TRAIL_LAYERS
    const maxAge = trailDuration()

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

          for (const layer of layers) {
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
              const ageFadeMid = Math.max(0, 1 - ageMid / maxAge)
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
        for (const layer of layers) {
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
            const ageFadeMid = Math.max(0, 1 - ageMid / maxAge)
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
  }> = {
    default: {
      neonColor: '#4fdfff', neonRgba: 'rgba(79, 223, 255,',
      ringColor: '#1c2a3d', borderWidth: 4
    },
    boss: {
      neonColor: '#ff4444', neonRgba: 'rgba(255, 60, 40,',
      floorGrad: ['#2a1010', '#1a0808'],
      innerGlowRgba: 'rgba(255, 40, 20,',
      ringColor: '#3a1515', borderWidth: 5
    },
    lava: {
      neonColor: '#ff6622', neonRgba: 'rgba(255, 102, 34,',
      floorGrad: ['#2a1508', '#1a0c04'],
      innerGlowRgba: 'rgba(255, 80, 20,',
      ringColor: '#3a2010', borderWidth: 5
    },
    ice: {
      neonColor: '#88ccff', neonRgba: 'rgba(136, 204, 255,',
      floorGrad: ['#0e2238', '#081828'],
      innerGlowRgba: 'rgba(100, 180, 255,',
      ringColor: '#1e3348', borderWidth: 4
    },
    forest: {
      neonColor: '#44cc66', neonRgba: 'rgba(68, 204, 102,',
      floorGrad: ['#0a1a0c', '#061208'],
      innerGlowRgba: 'rgba(40, 180, 60,',
      ringColor: '#1a2d1a', borderWidth: 4
    }
  }

  // Static-layer renderer: everything in the arena that doesn't change
  // within a match (floor, rim, terrain features). Baked into the ONE static
  // layer (drawStaticLayer), never called from the per-frame path.
  // Caller must have already translated to the arena origin.
  const renderArenaStatic = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    const theme = ARENA_THEMES[arenaType.value]
    // All boundary geometry traces the active arena shape (circle/oval/
    // hexagon/diamond/roundedRect). The radial gradients stay centred and
    // ARENA_RADIUS-based — clipped to whatever path we fill.
    const traceArena = (scale = 1) => traceArenaPath(ctx, arenaShape.value, ARENA_RADIUS, scale)

    // Arena floor — the arena THEME's ground (arenaThemes.ts: meadow,
    // woodland, rocky steppe, snowfield, cooled volcanic plain, dusk ruins,
    // bedroom play rug): its painted floor variant when there is one, else
    // flat cartoon fills tinted to the theme, a darker rim band, lighter
    // patches and the theme's floor decor. No radial gradients or blur (perf
    // rule): flat fills + alpha shapes only.
    const artTheme = arenaTheme()
    setTowerTheme(artTheme)
    const look = THEME_LOOK[artTheme]
    const pal = look.floor
    // A layout may retint the plain meadow clearing (snow, autumn, marsh …);
    // every other theme keeps its own identity.
    const themeFloor = artTheme === 'meadow' ? terrain?.theme.floor : undefined
    ctx.fillStyle = themeFloor?.[0] ?? pal.base
    traceArena()
    ctx.fill()
    // Painted floor variant (arenaFloorArt — clipped to the outline; false =
    // not painted / not loaded yet / would upscale): it replaces the
    // procedural patches + decor below.
    const paintedFloor = drawPaintedFloor(ctx, floorKeyFor(artTheme, terrain?.id ?? null), arenaShape.value, ARENA_RADIUS, `${pal.rim}29`)
    // Irregular lighter grass patches (deterministic blobs, clipped to the
    // clearing) instead of concentric rings — nothing on the floor should
    // read as round / target-like.
    ctx.save()
    traceArena()
    ctx.clip()
    ctx.fillStyle = themeFloor?.[1] ?? pal.light
    for (let i = 0; i < 7 && !paintedFloor; i++) {
      const a = i * 2.39996 + 0.7
      const r = ARENA_RADIUS * (0.15 + 0.6 * ((i * 0.6180339 + 0.31) % 1))
      const cx = Math.cos(a) * r
      const cy = Math.sin(a) * r
      const size = ARENA_RADIUS * (0.12 + 0.07 * ((i * 0.381966) % 1))
      ctx.beginPath()
      for (let k = 0; k <= 10; k++) {
        const t = (k / 10) * Math.PI * 2
        const rr = size * (0.75 + 0.25 * Math.sin(t * 3 + i) + 0.12 * Math.cos(t * 5 + i * 2))
        const px = cx + Math.cos(t) * rr * 1.3
        const py = cy + Math.sin(t) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    const decor = look.decor === 'layout' ? (terrain?.theme.decor ?? 'tufts') : look.decor
    if (!paintedFloor && decor !== null) {
      // Deterministic decor (golden-angle scatter): tufts + tiny flowers,
      // only where they sit fully inside the clearing.
      for (let i = 0; i < 40; i++) {
        const a = i * 2.39996
        const r = ARENA_RADIUS * (0.2 + 0.78 * ((i * 0.6180339) % 1))
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (!shapeIsInside(arenaShape.value, x, y, ARENA_RADIUS, 12)) continue
        if (terrainBlocksDecor(x, y)) continue
        DECOR_DRAW[decor](ctx, x, y, i, pal)
      }
    }

    // Border: the PAINTED edge (arenaBorderArt — tileable strips laid along
    // the outline, baseline on the wall, a gap at each tree): the lava wall
    // (hurts) / heal wall (heals) on those arena types, else the theme's; else a
    // solid wooden log rim — dark outline, bark band, a thin lighter top line
    // in the arena type's accent. No halo, no glow, no gradient around the
    // arena (perf + art direction).
    if (!drawPaintedBorder(ctx, borderKeyFor(arenaType.value, artTheme), arenaShape.value, ARENA_RADIUS, towers, `${artTheme}:${terrain?.id ?? '-'}`)) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#2c1d12'
      ctx.lineWidth = theme.borderWidth + 7
      traceArena()
      ctx.stroke()
      ctx.strokeStyle = '#7a5130'
      ctx.lineWidth = theme.borderWidth + 3
      traceArena()
      ctx.stroke()
      ctx.strokeStyle = theme.neonColor
      ctx.lineWidth = 1.5
      traceArena((ARENA_RADIUS - theme.borderWidth * 0.5 - 2) / ARENA_RADIUS)
      ctx.stroke()
    }

    // Terrain layout features (static): holes, boosters, islands.
    if (terrain !== null) renderTerrainStatic(ctx, terrain)
  }

  /** Decor scatter keeps clear of terrain features and towers. */
  const terrainBlocksDecor = (x: number, y: number): boolean => {
    for (const t of towers) if (Math.hypot(t.x - x, t.y - y) < t.radius + 8) return true
    if (terrain === null) return false
    for (const c of terrainCircles(terrain)) {
      if (Math.hypot(c.x - x, c.y - y) < c.radius + 6) return true
    }
    return false
  }

  const TERRAIN_OUTLINE = '#2c2116'

  /** Terrain features: one draw function per kind in arenaTerrainDraw
   *  (TERRAIN_FEATURE_DRAW) — the sprite seam for painted art. */
  const renderTerrainStatic = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TerrainLayout) => {
    renderTerrainFeatures(ctx, t, arenaTheme())
  }

  /** Team towers: a sturdy little tree in the team colour, HP ring around
   *  it (like a blade's), flash on hit; a stump + debris after it falls. */
  /** Tower bodies baked into the static layer: per tower its damage state
   *  (healthy / damaged / nearly down / felled — the painted tree changes
   *  with it) + whether the painted tower atlas has landed. */
  const towerBakeKey = (): string =>
    towers.map(t => `${towerDamageStage(t.hp, t.maxHp)}${t.spiked ? 's' : ''}`).join('') + towerArtRevision() + (towers.some(t => t.spiked) ? `t${thornArtRevision()}` : '')

  /** THE tower-body seam — drawn into the static layer (bakeTowerBodies) and,
   *  only during a hit flash, redrawn per frame on top (renderTowers): a sturdy
   *  little tree in the team colour, or the stump of a felled one. A painted
   *  tower sprite drops in here. Caller has translated to the tower centre. */
  /** Stable 0..7 per tree (position hash) — drives the mirror / size variation in towerArt. */
  const treeVariant = (t: TeamTower): number => Math.abs(Math.round(t.x * 7 + t.y * 13 + t.radius * 3)) % 8
  const drawTowerBody = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TeamTower, flash = 0): boolean => {
    const painted = drawTowerTree(ctx, t, flash)
    // Spiked front cover (boss trees): the thorny garland on the arc that
    // faces the clearing — @/use/towerThorns (painted segments or vector).
    if (t.spiked && t.hp > 0) drawTowerThorns(ctx, t.radius, towerFrontAngle(t), TOWER_FRONT_HALF_ARC)
    return painted
  }
  const drawTowerTree = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TeamTower, flash = 0): boolean => {
    // Painted team tree (blue / red bow + pennant, damage state by HP —
    // @/use/towerArt); the vector tree below is its fallback.
    if (drawPaintedTower(ctx, t.side, 0, 0, t.radius, t.hp, t.maxHp, flash, treeVariant(t))) return true
    const c = TOWER_TEAM_COLORS[t.side]
    const r = t.radius
    ctx.strokeStyle = TERRAIN_OUTLINE
    if (t.hp <= 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.beginPath()
      ctx.arc(3, 4, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#8a5a35'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#e8c48a'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2)
      ctx.fill()
      return false
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.beginPath()
    ctx.arc(3, 5, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.fillStyle = '#7a4f2c'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // leafy crown: 6 puffs + centre
    ctx.fillStyle = c.leafDark
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, r * 0.42, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillStyle = c.leaf
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.beginPath()
    ctx.arc(-r * 0.22, -r * 0.24, r * 0.2, 0, Math.PI * 2)
    ctx.fill()
    return false
  }

  /** Static layer: every tower body at rest (caller in arena units). */
  const bakeTowerBodies = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    for (const t of towers) {
      ctx.save()
      ctx.translate(t.x, t.y)
      drawTowerBody(ctx, t)
      ctx.restore()
    }
  }

  /** Per frame: only what moves — a flashing tower's wobbling body + flash,
   *  the HP badges and the debris (bodies at rest are in the static layer). */
  const renderTowers = (ctx: CanvasRenderingContext2D) => {
    for (const t of towers) {
      const r = t.radius
      if (t.hp <= 0) continue
      if (t.flash > 0.05) {
        const wob = t.flash > 0 ? Math.sin(performance.now() * 0.08) * t.flash * 2 : 0
        ctx.save()
        ctx.translate(t.x + wob, t.y)
        const painted = drawTowerBody(ctx, t, t.flash)
        if (t.flash > 0.05 && !painted) {
          ctx.fillStyle = `rgba(255, 255, 255, ${(t.flash * 0.45).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    }
    for (const d of towerDebris) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, d.life)
      ctx.translate(d.x, d.y)
      ctx.rotate(d.rot)
      ctx.fillStyle = d.color
      ctx.strokeStyle = TERRAIN_OUTLINE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-d.size / 2, -d.size / 3)
      ctx.lineTo(d.size / 2, -d.size / 2)
      ctx.lineTo(d.size / 3, d.size / 2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  // Time-varying overlay drawn each frame on top of the cached static
  // arena. Only the pulsating inner glow qualifies — everything else in
  // the arena is frozen within a match and lives in the cache. Flat alpha
  // fill (no radial gradient — perf rule).
  const renderArenaDynamic = (ctx: CanvasRenderingContext2D) => {
    const theme = ARENA_THEMES[arenaType.value]
    if (!theme.innerGlowRgba) return
    const pulse = 0.3 + 0.2 * Math.sin(performance.now() * 0.002)
    ctx.fillStyle = `${theme.innerGlowRgba} ${(pulse * 0.06).toFixed(3)})`
    traceArenaPath(ctx, arenaShape.value, ARENA_RADIUS, 0.7)
    ctx.fill()
  }

  // Key of everything renderArenaStatic draws (part of the static layer's
  // key — drawStaticLayer): arena type, shape, layout, theme, PvP flip,
  // towers on/off and the load state of the terrain / floor art.
  const arenaStaticKey = (): string =>
    `${arenaType.value}:${arenaShape.value}:${terrain?.id ?? '-'}:${arenaTheme()}:${pvpLocalIsGuest ? 'g' : 'h'}:${towers.length}:${terrainArtRevision()}:${floorArtRevision()}:${borderArtRevision()}`

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
      // Clamp into the active shape so crates never spawn beyond a
      // non-circular wall (no-op on the circle arena).
      const { x, y } = clampInArena(Math.cos(angle) * r, Math.sin(angle) * r, fullRadius, 12)

      let ok = true
      for (const blade of allBlades.value) {
        if (blade.hp <= 0) continue
        if (Math.hypot(blade.x - x, blade.y - y) < minSepBlade + BLADE_RADIUS * ((blade.disc ?? 1) - 1)) {
          ok = false
          break
        }
      }
      if (ok) {
        // Terrain: never on a feature (islands included) or a team tower.
        if (terrain !== null) {
          for (const c of terrainCircles(terrain)) {
            if (Math.hypot(c.x - x, c.y - y) < c.radius + fullRadius + 6) ok = false
          }
        }
        for (const t of towers) {
          if (Math.hypot(t.x - x, t.y - y) < t.radius + fullRadius + 6) ok = false
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
      const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.4 // vfx-rng
      const speed = 0.05 + Math.random() * 0.06 // vfx-rng
      powerupParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.02,
        color,
        life: 380,
        maxLife: 380,
        size: 2 + Math.random() * 2 // vfx-rng
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
  // The "+25%" tag on every box (i18n `powerups.badge`), cached per locale.
  let powerupBadge = { locale: '', text: '' }
  const powerupBadgeText = (): string => {
    const locale = activeLocale()
    if (powerupBadge.locale !== locale) {
      powerupBadge = { locale, text: translate('powerups.badge', { pct: powerupPct() }) }
    }
    return powerupBadge.text
  }

  /** Gold pill with "+25%" over the box's top-right corner. `extent` is the
   *  box's drawn width; (0,0) is the box centre. */
  const drawPowerupBadge = (ctx: CanvasRenderingContext2D, extent: number) => {
    const text = powerupBadgeText()
    const fs = Math.max(7, extent * 0.27)
    ctx.font = `900 ${fs}px Nunito, Arial, sans-serif`
    const w = ctx.measureText(text).width + fs * 0.7
    const h = fs * 1.25
    const cx = extent * 0.36
    const cy = -extent * 0.42
    ctx.beginPath()
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2)
    ctx.fillStyle = '#ffd21a'
    ctx.fill()
    ctx.lineWidth = Math.max(1, fs * 0.14)
    ctx.strokeStyle = '#161a40'
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#161a40'
    ctx.fillText(text, cx, cy + fs * 0.04)
  }

  /**
   * The painted box (art/ui: the box + the painted stat icon stamped on its
   * face plate) inside a pulsing gold halo. False when the painting isn't
   * there (not shipped, failed, still loading) — the caller draws the crate.
   */
  const renderPaintedPowerup = (ctx: CanvasRenderingContext2D, p: Powerup): boolean => {
    const box = uiArtImage(powerupBoxPath(p.stat))
    if (!uiArtReady(box)) return false
    // Drawn larger than the pickup radius so the painting reads at a glance;
    // the hitbox (p.radius) is unchanged.
    const size = p.radius * 3 * p.scale
    ctx.save()
    ctx.translate(p.x, p.y)
    // Gold halo — a gradient disc, not shadowBlur (Firefox pays per frame).
    const pulse = p.phase === 'final' ? 0.5 + 0.5 * Math.sin(performance.now() * 0.005) : 0.5
    // (two flat alpha discs — no radial gradient, perf rule)
    ctx.fillStyle = `rgba(250, 204, 21, ${(0.1 + 0.08 * pulse).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.78, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.58, 0, Math.PI * 2)
    ctx.fill()
    ctx.drawImage(box, -size / 2, -size / 2, size, size)
    const pr = size * POWERUP_PLATE.r
    const px = (POWERUP_PLATE.cx - 0.5) * size
    const py = (POWERUP_PLATE.cy - 0.5) * size
    const icon = statIconImage(p.stat)
    if (uiArtReady(icon)) {
      ctx.drawImage(icon, px - pr * 1.05, py - pr * 1.05, pr * 2.1, pr * 2.1)
    } else {
      ctx.save()
      ctx.translate(px, py)
      drawPowerupGlyph(ctx, p.stat, pr * 1.5)
      ctx.restore()
    }
    drawPowerupBadge(ctx, size)
    ctx.restore()
    return true
  }

  const renderPowerup = (ctx: CanvasRenderingContext2D, p: Powerup): void => {
    if (p.scale <= 0.001) return
    if (renderPaintedPowerup(ctx, p)) return
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

    // The drawn crate states its boost too (its visual extent incl. depth).
    ctx.save()
    ctx.translate(dx / 2, -dy / 2)
    drawPowerupBadge(ctx, size * 1.15)
    ctx.restore()

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

  // Under-blade markers. The Chaos Arena team aura (a soft blue / red glow
  // under every smasher) and the tornado / sandstorm / thunderstorm skin
  // auras (radial haze + translucent swirls) are gone: ownership reads from
  // the team-coloured disc rim and HP gauge. What signals a MECHANIC stays,
  // as a flat, non-glowing ring around the disc (drawn under the blade):
  //  · boss — a chunky ember-orange dashed ring (it was a fiery radial glow);
  //  · life-leech boss — a green dotted ring outside it (was a green glow);
  //  · stat-switch boss — the ATK / DEF phase label above it (unchanged).
  const MARKER_BOSS_DASH = [7, 4]
  const MARKER_LEECH_DASH = [2.5, 3.5]
  const markerRing = (
    ctx: CanvasRenderingContext2D, blade: SpinnerState, pad: number, color: string, dash: number[], speed: number
  ) => {
    const side = blade.radius * 0.2
    const rx = blade.radius + pad
    const ry = blade.radius * DISC_SQUASH_RENDER + pad
    const cy = blade.y + side * 0.5
    ctx.lineWidth = 4.6
    ctx.strokeStyle = '#1b1530'
    ctx.beginPath()
    ctx.ellipse(blade.x, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash(dash)
    ctx.lineDashOffset = -performance.now() * speed
    ctx.lineWidth = 2.6
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.ellipse(blade.x, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash(NO_DASH)
    ctx.lineDashOffset = 0
  }
  const NO_DASH: number[] = []

  const renderBladeMarkers = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    // ── Stat-switch boss phase indicator ───────────────────────────────
    // The recorder's fillText gate already erases this label, but gating it
    // here too keeps `?clean=1` self-sufficient: the flag means "no
    // interface" on its own, not "no interface as long as the recorder is
    // also suppressing canvas text".
    if (blade.statSwitchPhase && !CLEAN_FEED) {
      const now = performance.now()
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.005)
      const isAtk = blade.statSwitchPhase === 'attack'
      ctx.save()
      ctx.translate(blade.x, blade.y - blade.radius - 10)
      ctx.globalAlpha = pulse
      ctx.fillStyle = isAtk ? '#ff4444' : '#4488ff'
      ctx.font = 'bold 8px sans-serif'
      // The stat family's icon in front of the tag (emoji only until it loads).
      const icon = statIconImage(isAtk ? 'attack' : 'defense')
      if (uiArtReady(icon)) {
        const tag = isAtk ? 'ATK' : 'DEF'
        const iw = 10
        const w = iw + 1.5 + ctx.measureText(tag).width
        ctx.drawImage(icon, -w / 2, -iw + 1.5, iw, iw)
        ctx.textAlign = 'left'
        ctx.fillText(tag, -w / 2 + iw + 1.5, 0)
      } else {
        ctx.textAlign = 'center'
        ctx.fillText(isAtk ? '⚔ ATK' : '🛡 DEF', 0, 0)
      }
      ctx.globalAlpha = 1
      ctx.restore()
    }
    if (blade.isBoss) markerRing(ctx, blade, 3.5, '#ff8a2a', MARKER_BOSS_DASH, 0.012)
    if (blade.isLifeLeech) markerRing(ctx, blade, blade.isBoss ? 8.5 : 3.5, '#6fd65a', MARKER_LEECH_DASH, -0.01)
  }

  /**
   * Directional armour on the disc rim, around the gameplay heading: a
   * reinforced zone (multiplier < 1) is a riveted steel plate arc, a weak
   * zone (> 1) a stitched, torn cloth patch. Front and back cones are ±60°.
   * Flat fills and strokes only (no blur, gradients or filters).
   */
  const ARMOR_HALF = Math.PI / 3
  const drawArmorArcs = (ctx: CanvasRenderingContext2D, blade: SpinnerState, x: number, y: number, r: number): void => {
    const armor = blade.armor!
    const th = Math.atan2(headingY(blade), headingX(blade))
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, DISC_SQUASH_RENDER)
    ctx.lineCap = 'round'
    // ONE continuous rim around the whole disc (owner 2026-10-23): the reinforced / weak
    // zones are thicker stretches of this same band, not three separate stuck-on pieces.
    // The neutral band shows between them (the sides) and runs under every zone, so a
    // zone's ends melt into it. Flat fills, one ink outline, no seam anywhere.
    {
      const rw = r * 0.1
      ctx.strokeStyle = '#161a40'
      ctx.lineWidth = rw + r * 0.06
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 0.98, r * 0.98, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#d9cdb4'
      ctx.lineWidth = rw
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 0.98, r * 0.98, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#f4ecd8'
      ctx.lineWidth = Math.max(1, rw * 0.28)
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 0.98 + rw * 0.26, r * 0.98 + rw * 0.26, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    // Painted tiles (tools/armor-art, armorArt.ts) when they ship + load;
    // the vector arcs below stay the fallback per arc.
    const tiles = PAINTED_ARMOR ? armorTilesImage() : null
    // The tank bulwark (armor.look === 'bulwark'): its own painted tile, else
    // the vector shield wall below.
    const bulwark = PAINTED_BULWARK ? bulwarkTilesImage() : null
    const bulwarkLook = armor.look === 'bulwark'
    for (let k = 0; k < 2; k++) {
      const mul = k === 0 ? armor.front : armor.back
      if (mul === 1) continue
      const mid = k === 0 ? th : th + Math.PI
      const a0 = mid - ARMOR_HALF
      const a1 = mid + ARMOR_HALF
      if (mul < 1 && bulwarkLook && bulwark && PAINTED_BULWARK) {
        const bw = r * (0.2 + (1 - mul) * 0.3 + 0.08)
        const meta = { file: PAINTED_BULWARK.file, v: PAINTED_BULWARK.v, plate: PAINTED_BULWARK.tile, patch: PAINTED_BULWARK.tile }
        if (drawArmorTiles(ctx, bulwark, meta, 'plate', r * 0.98, bw * 1.15, a0, a1)) continue
      }
      if (tiles && PAINTED_ARMOR && !(mul < 1 && bulwarkLook)) {
        const band = mul < 1 ? r * (0.16 + (1 - mul) * 0.25 + 0.07) : r * (0.14 + Math.min(0.6, mul - 1) * 0.2 + 0.06)
        if (drawArmorTiles(ctx, tiles, PAINTED_ARMOR, mul < 1 ? 'plate' : 'patch', r * (mul < 1 ? 0.98 : 0.97), band * 1.15, a0, a1)) continue
      }
      if (mul < 1 && bulwarkLook) {
        // Bulwark: a thick rounded shield wall — deep navy outline, warm
        // oak-and-stone band, pale top edge, big domed studs, round end caps.
        const w = r * (0.2 + (1 - mul) * 0.3)
        ctx.lineCap = 'butt'
        ctx.strokeStyle = '#161a40'
        ctx.lineWidth = w + r * 0.09
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#b98a52'
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#7d5a35'
        ctx.lineWidth = w * 0.3
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98 - w * 0.34, a0 + 0.03, a1 - 0.03)
        ctx.stroke()
        ctx.strokeStyle = '#e8c88e'
        ctx.lineWidth = Math.max(1, w * 0.2)
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98 + w * 0.3, a0 + 0.05, a1 - 0.05)
        ctx.stroke()
        for (let e = 0; e < 2; e++) {
          const a = e === 0 ? a0 : a1
          ctx.fillStyle = '#161a40'
          ctx.beginPath()
          ctx.arc(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, w * 0.64, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#b98a52'
          ctx.beginPath()
          ctx.arc(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, w * 0.5, 0, Math.PI * 2)
          ctx.fill()
        }
        for (let i = 0; i < 3; i++) {
          const a = a0 + (a1 - a0) * (i + 0.5) / 3
          const sx = Math.cos(a) * r * 0.98
          const sy = Math.sin(a) * r * 0.98
          ctx.fillStyle = '#161a40'
          ctx.beginPath()
          ctx.arc(sx, sy, w * 0.36, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#d6dde6'
          ctx.beginPath()
          ctx.arc(sx, sy, w * 0.29, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(sx - w * 0.07, sy - w * 0.07, w * 0.1, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.lineCap = 'round'
      } else if (mul < 1) {
        // Plate: dark outline, steel band, light top edge, rivets.
        const w = r * (0.16 + (1 - mul) * 0.25)
        ctx.strokeStyle = '#2b333d'
        ctx.lineWidth = w + r * 0.07
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#9fb0c2'
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#e6eef6'
        ctx.lineWidth = Math.max(1, w * 0.22)
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.98 + w * 0.28, a0 + 0.06, a1 - 0.06)
        ctx.stroke()
        ctx.fillStyle = '#4a5562'
        for (let i = 0; i < 4; i++) {
          const a = a0 + (a1 - a0) * (i + 0.5) / 4
          ctx.beginPath()
          ctx.arc(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, Math.max(0.8, w * 0.17), 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        // Weak spot: frayed cloth patch with a dashed seam and cross stitches.
        const w = r * (0.14 + Math.min(0.6, mul - 1) * 0.2)
        ctx.strokeStyle = '#5a2a14'
        ctx.lineWidth = w + r * 0.06
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.97, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#f0a35e'
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.97, a0, a1)
        ctx.stroke()
        ctx.strokeStyle = '#3d1c0c'
        ctx.lineWidth = Math.max(1, r * 0.035)
        ctx.setLineDash([r * 0.09, r * 0.07])
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.97, a0 + 0.05, a1 - 0.05)
        ctx.stroke()
        ctx.setLineDash([])
        for (let i = 0; i < 3; i++) {
          const a = a0 + (a1 - a0) * (i + 0.5) / 3
          const cx = Math.cos(a) * r * 0.97
          const cy = Math.sin(a) * r * 0.97
          const s = w * 0.45
          ctx.beginPath()
          ctx.moveTo(cx - s, cy - s)
          ctx.lineTo(cx + s, cy + s)
          ctx.moveTo(cx + s, cy - s)
          ctx.lineTo(cx - s, cy + s)
          ctx.stroke()
        }
      }
    }
    ctx.restore()
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
    // Phase Step (§8.2): the bearer flickers at ~45 % for its 300 ms window.
    const phaseAlpha = SKILLS_BUILD && blade.skills !== undefined && skillPort !== null
      ? skillPort['skillBladeAlpha'](blade, skillClock(), FX.low)
      : 1
    const bladeAlpha = invulnAlpha * ghostAlpha * phaseAlpha
    const needsAlpha = bladeAlpha < 1
    if (needsAlpha) {
      ctx.save()
      ctx.globalAlpha = bladeAlpha
    }

    // Smasher on its turning disc: flat shadow → disc (spin marks turn with
    // `rotation`) → the character frame (32 × 11.25° yaw frames).
    //
    // Facing rules (render-only, never gameplay state):
    //  · aiming: the selected smasher turns to the launch direction;
    //  · launch: it turns to face where it is flying;
    //  · impact (smasher hit, wall, island, solid, tower — any contact that
    //    marks a hit or bends its path): it gets a spin that decays, and it
    //    KEEPS whatever facing it ends on. It never drifts back to the camera.
    const look = getBladeLook(blade)
    const v2 = blade.vx * blade.vx + blade.vy * blade.vy
    const moving = v2 > 0.5
    const wrapPi = (d: number): number => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2
    // Impact detection: a hit timestamp, a wall bounce, or a sharp bend of the
    // velocity between two frames (islands, solids, towers, other blades).
    let impact = 0
    if (blade.lastHitTime !== look.lastHit) impact = 1
    if (blade.wallBounceCount !== look.lastWalls) impact = Math.max(impact, 0.8)
    if (moving && look.moving) {
      const pv = look.lastVx * look.lastVx + look.lastVy * look.lastVy
      if (pv > 0.5) {
        const cos = (blade.vx * look.lastVx + blade.vy * look.lastVy) / Math.sqrt(v2 * pv)
        if (cos < 0.85) impact = Math.max(impact, 0.7)
      }
    }
    if (impact > 0) {
      const dir = (blade.vx * look.lastVy - blade.vy * look.lastVx) >= 0 ? 1 : -1
      const speedNow = Math.sqrt(v2)
      look.spin = Math.max(-0.9, Math.min(0.9, look.spin + dir * impact * (0.22 + 0.05 * speedNow)))
      look.target = null
      look.faceHeading = true
    } else if (moving && !look.moving) {
      // Launch: face the flight direction.
      look.target = Math.atan2(-blade.vx, blade.vy)
    }
    // Aiming: face the launch direction (opposite of the pull).
    if (!moving && isDragging.value && selectedBlade.value === blade) {
      const px = dragCurrent.value.x - blade.x
      const py = dragCurrent.value.y - blade.y
      if (px * px + py * py > blade.radius * blade.radius) look.target = Math.atan2(px, -py)
    }
    if (look.spin !== 0) {
      look.yaw += look.spin
      look.spin *= 0.9
      if (Math.abs(look.spin) < 0.004) look.spin = 0
    } else if (look.faceHeading) {
      // The impact spin settled: turn to the gameplay heading, so the face
      // (and the armoured front) points where the armour really is.
      look.faceHeading = false
      if (look.target === null) look.target = Math.atan2(-headingX(blade), headingY(blade))
    } else if (look.target !== null) {
      const d = wrapPi(look.target - look.yaw)
      look.yaw += d * 0.25
      if (Math.abs(d) < 0.01) look.target = null
    }
    look.moving = moving
    look.lastHit = blade.lastHitTime
    look.lastWalls = blade.wallBounceCount
    look.lastVx = blade.vx
    look.lastVy = blade.vy
    if (Math.abs(look.yaw) > 1e4) look.yaw %= Math.PI * 2
    const frame = ((Math.round(look.yaw / YAW_STEP) % YAW_FRAMES) + YAW_FRAMES) % YAW_FRAMES
    const tf = ctx.getTransform()
    const deviceScale = Math.hypot(tf.a, tf.b) || 1
    drawSmasherDisc(ctx, x, y, radius, rotation, look.rim, deviceScale)
    // Part of the disc, under the character: the plush is never covered (the
    // far-rim plate hides behind its body like any other part of the disc).
    if (blade.armor !== undefined) drawArmorArcs(ctx, blade, x, y, radius)
    // #UX3 balloon HP: the balloons hang BEHIND the plush (tied to the far
    // rim), so they never cover its face. Gauge builds skip this.
    const balloons = BALLOON_HP_BUILD && (!CLEAN_FEED || CLEAN_HP_RINGS) ? balloonStateOf(blade) : null
    if (balloons !== null) {
      balloonPops += drawBalloonHp(ctx, balloonFx, balloons, x, y, radius, hp, maxHp, blade.vx, performance.now(), FX.low, deviceScale)
      balloonDeviceScale = deviceScale
      balloons.seen = balloonFrame
    }
    drawSmasherFrame(ctx, look.smasherId, look.modelId, !!blade.config.isBoss, frame, x, y, radius, deviceScale)

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

    // The HP ring is a health BAR plus a digit — the clearest "counter" on
    // screen, and the one thing a "no UI, no counters" spec is certain to
    // mean. `?clean=1&rings=1` puts it back for a looser spec without
    // touching the code or re-cutting a scenario (see `utils/cleanFeed.ts`).
    if (balloons !== null) {
      drawBalloonHpNumber(ctx, balloons, x, y, radius, hp, performance.now())
    } else if (!BALLOON_HP_BUILD && (!CLEAN_FEED || CLEAN_HP_RINGS)) {
      renderHealthRing(ctx, blade.id, x, y, hp, maxHp, radius, isPlayer)
    }

    // Per-blade skill effects (Guard Shell arc, phase hint).
    if (SKILLS_BUILD && blade.skills !== undefined && skillVfx !== null) {
      skillPort?.['renderBladeSkillFx'](ctx, skillVfx, blade, skillClock(), FX.low)
    }

    if (needsAlpha) ctx.restore()
  }

  // ── HP gauge (smashers AND team towers — see @/use/hpGauge) ─────────────
  // A notched team-coloured arc on the FRONT rim of the disc (never over the
  // plush), damage chip, hit flash + shake, low-HP pulse, HP badge. One state
  // object per blade id / tower side, created once.
  const gaugeStates = new Map<number | string, HpGaugeState>()
  const gaugeFrame = { cx: 0, cy: 0, rx: 0, ry: 0 }
  const towerGauges = new WeakMap<TeamTower, HpGaugeState>()
  const gaugeState = (key: number | string, hp: number): HpGaugeState => {
    let st = gaugeStates.get(key)
    if (!st) {
      if (gaugeStates.size > 256) gaugeStates.clear()
      st = newHpGaugeState(hp)
      gaugeStates.set(key, st)
    }
    return st
  }
  // ── #UX3 balloon HP (smashers only, VITE_APP_BALOON_HP_BAR) ──────────────
  // One state per blade id (cleared at initGame — ids restart every match).
  // Pops are counted while drawing; renderBalloonLayer bursts knocked-out /
  // removed blades, plays ONE pop sound per cooldown and draws the bursts.
  const balloonStates = new Map<number, BalloonState>()
  let balloonFrame = 0
  let balloonPops = 0
  let lastBalloonSfxAt = -1e9
  let lastBalloonTickAt = -1
  /** Device px per arena unit from the last balloon draw (no getTransform
   *  per frame): picks painted pop sprites vs procedural, never upscaled. */
  let balloonDeviceScale = 1
  let sweepNow = 0
  const sweepBalloon = (st: BalloonState, id: number): void => {
    if (st.seen === balloonFrame) return
    if (st.alive > 0 && balloonFx !== null) balloonPops += updateBalloonHp(balloonFx, st, st.x, st.y, st.r, 0, 1, sweepNow, FX.low)
    balloonStates.delete(id)
  }
  const balloonStateOf = (blade: SpinnerState): BalloonState => {
    let st = balloonStates.get(blade.id)
    if (!st) {
      if (balloonStates.size > 256) balloonStates.clear()
      const minor = !!blade.isEmittedChild || !!blade.isSplitChild
      const n = balloonCount(balloonTeamSize[blade.owner], !!blade.config.isBoss, minor)
      st = newBalloonState(n, blade.hp, blade.maxHp, blade.owner === 'player')
      balloonStates.set(blade.id, st)
    }
    return st
  }
  /** After the models: knockouts pop their last balloons, removed blades pop
   *  theirs where they were last drawn, the pool ticks and draws, and one
   *  balloon-pop sound plays per cooldown however many burst at once. */
  const renderBalloonLayer = (ctx: CanvasRenderingContext2D) => {
    if (balloonFx === null) return
    const now = performance.now()
    const low = FX.low
    for (const blade of allBlades.value) {
      if (blade.hp > 0) continue
      const st = balloonStates.get(blade.id)
      if (st === undefined) continue
      st.seen = balloonFrame
      if (st.alive > 0) balloonPops += updateBalloonHp(balloonFx, st, blade.x, blade.y, blade.radius, 0, blade.maxHp, now, low)
    }
    // Every blade still in the match was stamped this frame (drawn alive or
    // seen knocked out above): an unstamped state belongs to a removed blade.
    sweepNow = now
    balloonStates.forEach(sweepBalloon)
    if (balloonPops > 0 && newSlotOn('balloon-pop') && now - lastBalloonSfxAt >= BALLOON_HP.POP_SFX_COOLDOWN_MS) {
      lastBalloonSfxAt = now
      try { playSound(BALLOON_POP_SFX, BALLOON_HP.POP_SFX_GAIN, 0, 0.94 + Math.random() * 0.12) } catch { /* audio optional */ } // vfx-rng
    }
    balloonPops = 0
    balloonFrame++
    const dt = lastBalloonTickAt < 0 ? 16 : Math.min(50, Math.max(0, now - lastBalloonTickAt))
    lastBalloonTickAt = now
    tickBalloonPopFx(balloonFx, dt)
    drawBalloonPopFx(ctx, balloonFx, balloonDeviceScale)
  }

  const renderHealthRing = (
    ctx: CanvasRenderingContext2D,
    id: number,
    x: number, y: number,
    hp: number, maxHp: number,
    bladeRadius: number,
    isPlayer: boolean
  ) => {
    discGaugeFrame(x, y, bladeRadius, gaugeFrame)
    drawHpGauge(ctx, gaugeState(id, hp), gaugeFrame.cx, gaugeFrame.cy, gaugeFrame.rx, gaugeFrame.ry,
      hp, maxHp, isPlayer, 1, performance.now())
  }
  /** Tower HP: the same gauge, on the arena side of the tree (npc tower at the
   *  top → arc below it; player tower at the bottom → arc above it). */
  const renderTowerGauge = (ctx: CanvasRenderingContext2D, t: TeamTower) => {
    const r = t.radius * TOWER_GAUGE_R
    // ONE gauge state PER TREE: a side has 2-3 trees, and a state shared by all of them
    // saw a different tree's HP every frame, read each switch as a fresh hit and sat in
    // the white hit-flash for good (white bars, dark digits on a dark badge).
    let st = towerGauges.get(t)
    if (!st) {
      st = newHpGaugeState(t.hp)
      towerGauges.set(t, st)
    }
    drawHpGauge(ctx, st, t.x, t.y, r, r,
      t.hp, t.maxHp, t.side === 'player', t.y > 0 ? -1 : 1, performance.now(), TOWER_GAUGE_LOOK)
  }
  /** Tower gauge radius over the collision radius: tight around the painted
   *  tree's base (TOWER_ART_HALF_W 1.2). Owner 2026-10-23: the old wide arcs
   *  of neighbouring trees overlapped, so it is shorter, slimmer and hugs the
   *  trunk bottom. */
  const TOWER_GAUGE_R = 1.22
  const TOWER_GAUGE_LOOK = { halfSpan: 0.72, bar: 3.8 } as const

  /** Selection highlight: a flat yellow ring with a dark outline (no glow
   *  halo) hugging the disc's own ellipse, so it frames the disc without
   *  crossing the plush or the HP badge below it. */
  const renderSelectionGlow = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    const side = blade.radius * 0.2
    const rx = blade.radius + 2.5
    const ry = blade.radius * DISC_SQUASH_RENDER + 2.5 + side * 0.5
    const cy = blade.y + side * 0.5
    ctx.strokeStyle = '#1b1530'
    ctx.lineWidth = 4.2
    ctx.beginPath()
    ctx.ellipse(blade.x, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#ffdd00'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(blade.x, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // ── Aim preview (slingshot pull-back) — ui-catalog.md §7 "Aim preview" ───
  // Toy-box style (DESIGN.md): chunky shapes, a bold navy outline, flat fills
  // with a hard light band, team colour, a 0-blur drop. No glow, no gradient,
  // no blur. Everything is sized in game units (it scales with the arena and
  // the renderer draws at css × dpr, so it stays crisp) and allocation-free:
  // constant colour strings and dash arrays, no per-frame objects.
  //  · pull band   — a tapered rubber band from the disc to the finger;
  //  · power arrow — a thick outlined arrow on the LAUNCH side (never under
  //                  the finger) whose 5 notched segments fill with the pull
  //                  and step sun → orange → pink; at full power the head
  //                  turns berry, the arrow snaps (one ring burst) and pulses;
  //  · guide dots  — bold dots past the arrow head in the launch direction,
  //                  shrinking with distance, as many as the power is long;
  //                  they stop at the arena wall with a hit marker;
  //  · cancel      — near the disc a dashed ring marks the cancel zone; inside
  //                  it the disc gets a berry ring and an ✕ badge ABOVE it
  //                  (a thumb comes from below), and no arrow is drawn.
  const AIM_INK = '#161a40'
  const AIM_WELL = '#1b2a7a'
  const AIM_ICE = '#eef5ff'
  const AIM_TEAM = '#13a3f2'
  const AIM_TEAM_HI = '#7fdcff'
  const AIM_TEAM_LO = '#0b80d0'
  const AIM_BERRY = '#f2306b'
  const AIM_BERRY_HI = '#ff5c8f'
  const AIM_SUN = '#ffd21a'
  /** Notch fill per power tier (< 40 %, < 75 %, < max, max) and its light band. */
  const AIM_FILL = ['#ffd21a', '#ffae00', '#ff5c8f', '#f2306b'] as const
  const AIM_FILL_HI = ['#fff7a3', '#ffd21a', '#ffa3c4', '#ff5c8f'] as const
  const AIM_SEGMENTS = 5
  const AIM_OUTLINE = 2.6
  const AIM_NO_DASH: number[] = []
  const AIM_CANCEL_DASH: number[] = [5, 4]
  /** performance.now() when the pull reached full power (-1 = below max). */
  let aimMaxSince = -1

  const aimTier = (ratio: number): 0 | 1 | 2 | 3 =>
    ratio >= 0.999 ? 3 : ratio >= 0.75 ? 2 : ratio >= 0.4 ? 1 : 0

  /** Track the full-power moment (snap burst + pulse clock). */
  const noteAimPower = (ratio: number, now: number) => {
    if (ratio >= 0.999) {
      if (aimMaxSince < 0) aimMaxSince = now
    } else aimMaxSince = -1
  }

  /** Arrow silhouette along +x: flat tail at s0, shaft to s1, head to tip. */
  const aimArrowPath = (ctx: CanvasRenderingContext2D, s0: number, s1: number, tip: number, hw: number, hh: number) => {
    ctx.beginPath()
    ctx.moveTo(s0, -hw)
    ctx.lineTo(s1, -hw)
    ctx.lineTo(s1, -hh)
    ctx.lineTo(tip, 0)
    ctx.lineTo(s1, hh)
    ctx.lineTo(s1, hw)
    ctx.lineTo(s0, hw)
    ctx.closePath()
  }

  /**
   * The power arrow from (ox, oy), starting `startR` out in the launch
   * direction (nx, ny). `size` scales it (1 on a smasher, smaller on the
   * joystick). Returns the tip's distance from (ox, oy) for the guide dots.
   */
  const drawAimArrow = (
    ctx: CanvasRenderingContext2D, ox: number, oy: number, startR: number,
    nx: number, ny: number, ratio: number, size: number, now: number
  ): number => {
    const tier = aimTier(ratio)
    const maxed = tier === 3
    const pulse = maxed && aimMaxSince >= 0 ? 1 + 0.06 * Math.sin((now - aimMaxSince) * 0.018) : 1
    const k = size * pulse
    const hw = 6.5 * k
    const hh = 14.5 * k
    const s0 = startR + 4 * size
    const s1 = s0 + 56 * k
    const tip = s1 + 20 * k
    const ang = Math.atan2(ny, nx)
    const ow = AIM_OUTLINE * size

    // Hard 0-blur drop, straight down on screen.
    ctx.save()
    ctx.translate(ox, oy + 3 * size)
    ctx.rotate(ang)
    aimArrowPath(ctx, s0, s1, tip, hw, hh)
    ctx.globalAlpha = 0.32
    ctx.fillStyle = AIM_INK
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(ox, oy)
    ctx.rotate(ang)
    aimArrowPath(ctx, s0, s1, tip, hw, hh)
    ctx.lineJoin = 'round'
    ctx.lineWidth = ow * 2
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.fillStyle = AIM_WELL
    ctx.fill()

    // Notched power segments: each fills in turn, all in the tier colour,
    // with a hard light band on the top third.
    const pad = 1.8 * k
    const gap = 2.4 * k
    const segW = (s1 - s0 - pad * 2 - gap * (AIM_SEGMENTS - 1)) / AIM_SEGMENTS
    const segH = (hw - pad) * 2
    for (let i = 0; i < AIM_SEGMENTS; i++) {
      const f = Math.min(1, ratio * AIM_SEGMENTS - i)
      if (f <= 0) break
      const x = s0 + pad + i * (segW + gap)
      ctx.fillStyle = AIM_FILL[tier]
      ctx.fillRect(x, -hw + pad, segW * f, segH)
      ctx.fillStyle = AIM_FILL_HI[tier]
      ctx.fillRect(x, -hw + pad, segW * f, segH * 0.36)
    }

    // Head: team colour while aiming, berry at full power; light upper half.
    const hp = 2.2 * k
    ctx.fillStyle = maxed ? AIM_BERRY : AIM_TEAM
    ctx.beginPath()
    ctx.moveTo(s1 + hp, -(hh - hp * 1.7))
    ctx.lineTo(tip - hp * 2, 0)
    ctx.lineTo(s1 + hp, hh - hp * 1.7)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = maxed ? AIM_BERRY_HI : AIM_TEAM_HI
    ctx.beginPath()
    ctx.moveTo(s1 + hp, -(hh - hp * 1.7))
    ctx.lineTo(tip - hp * 2, 0)
    ctx.lineTo(s1 + hp, 0)
    ctx.closePath()
    ctx.fill()

    // Max-power snap: one ring burst off the head as the pull hits full.
    if (maxed && aimMaxSince >= 0) {
      const age = now - aimMaxSince
      if (age < 260) {
        const u = age / 260
        ctx.globalAlpha = 1 - u
        ctx.beginPath()
        ctx.arc(tip - 6 * k, 0, (8 + 20 * u) * size, 0, Math.PI * 2)
        ctx.lineWidth = (5 * (1 - u) + 1.5) * size
        ctx.strokeStyle = AIM_INK
        ctx.stroke()
        ctx.lineWidth = (2.6 * (1 - u) + 0.8) * size
        ctx.strokeStyle = AIM_SUN
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
    return tip
  }

  /** Solid obstacles the guide dots stop at (terrain solids + towers),
   *  rebuilt only when the match's layout / tower count changes. */
  let aimSolids: { x: number; y: number; radius: number }[] = []
  let aimSolidsKey: TerrainLayout | null | undefined
  let aimSolidsTowers = -1
  let aimSolidsShape: ArenaShape | null = null
  /** Inside the arena wall, a solid or a tower? (> 0 = blocked). */
  const aimBlocked = (x: number, y: number, r: number): number => {
    if (aimSolidsKey !== terrain || aimSolidsTowers !== towers.length || aimSolidsShape !== arenaShape.value) {
      aimSolidsKey = terrain
      aimSolidsShape = arenaShape.value
      aimSolidsTowers = towers.length
      aimSolids = terrain !== null ? terrainSolidCircles(terrain) : []
      for (const t of towers) aimSolids.push({ x: t.x, y: t.y, radius: t.radius })
    }
    let worst = shapeSdf(arenaShape.value, x, y, ARENA_RADIUS) + r
    for (let i = 0; i < aimSolids.length; i++) {
      const c = aimSolids[i]!
      const dx = x - c.x
      const dy = y - c.y
      const pen = c.radius + r - Math.sqrt(dx * dx + dy * dy)
      if (pen > worst) worst = pen
    }
    return worst
  }

  /** Guide dots past the arrow head; they stop (with a hit marker) at the
   *  arena wall, a terrain solid (island / mushroom / log) or a tower. */
  const drawAimDots = (
    ctx: CanvasRenderingContext2D, ox: number, oy: number, startR: number, from: number,
    nx: number, ny: number, ratio: number, fade = 1
  ) => {
    const count = 2 + Math.round(8 * ratio)
    const step = 13
    let wallAt = -1
    let freeAt = startR
    // Under the arrow first: an obstacle right in front of the disc gets the
    // marker and no dots (the shot meets it before the arrow head).
    for (let d = startR; d < from; d += 6) {
      if (aimBlocked(ox + nx * d, oy + ny * d, 0) > 0) {
        wallAt = d
        break
      }
      freeAt = d
    }
    if (wallAt < 0) {
      let d = from + 11
      freeAt = from
      ctx.lineWidth = 2.2
      ctx.strokeStyle = AIM_INK
      ctx.fillStyle = AIM_ICE
      for (let i = 0; i < count; i++) {
        const r = 4.6 - 2.6 * (i / 9)
        const x = ox + nx * d
        const y = oy + ny * d
        if (aimBlocked(x, y, r) > 0) {
          wallAt = d
          break
        }
        ctx.globalAlpha = fade * (1 - 0.35 * (i / 9))
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        freeAt = d
        d += step
      }
      ctx.globalAlpha = fade
    }
    if (wallAt < 0) return
    // The first contact between the last free sample and this one (bisection).
    let lo = freeAt
    let hi = wallAt
    for (let it = 0; it < 7; it++) {
      const mid = (lo + hi) / 2
      if (aimBlocked(ox + nx * mid, oy + ny * mid, 0) > 0) hi = mid
      else lo = mid
    }
    const wx = ox + nx * lo
    const wy = oy + ny * lo
    // Hit marker: a stop bar across the path, wider than the arrow, navy
    // outline + ice face (reads on the sun / pink notches and on the floor).
    const px = -ny * 10.5
    const py = nx * 10.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(wx - px, wy - py)
    ctx.lineTo(wx + px, wy + py)
    ctx.lineWidth = 7.5
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.lineWidth = 3.4
    ctx.strokeStyle = AIM_ICE
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** Rubber band from the disc rim to the finger, thinner as it stretches. */
  const drawPullBand = (
    ctx: CanvasRenderingContext2D, bx: number, by: number, rimR: number,
    fx: number, fy: number, ratio: number, size: number
  ) => {
    const dx = fx - bx
    const dy = fy - by
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d <= rimR + 2 * size) return
    const ux = dx / d
    const uy = dy / d
    const sx = bx + ux * rimR * 0.85
    const sy = by + uy * rimR * 0.85
    const w0 = (7 - 2.5 * ratio) * size
    const w1 = 3.2 * size
    ctx.beginPath()
    ctx.moveTo(sx - uy * w0, sy + ux * w0)
    ctx.lineTo(fx - uy * w1, fy + ux * w1)
    ctx.lineTo(fx + uy * w1, fy - ux * w1)
    ctx.lineTo(sx + uy * w0, sy - ux * w0)
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.lineWidth = AIM_OUTLINE * 2 * size
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.fillStyle = AIM_TEAM_HI
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(fx, fy)
    ctx.lineWidth = 1.6 * size
    ctx.strokeStyle = AIM_TEAM_LO
    ctx.stroke()
    // Grip at the finger end.
    ctx.beginPath()
    ctx.arc(fx, fy, 6.5 * size, 0, Math.PI * 2)
    ctx.fillStyle = AIM_ICE
    ctx.fill()
    ctx.lineWidth = AIM_OUTLINE * size
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(fx, fy, 3 * size, 0, Math.PI * 2)
    ctx.fillStyle = AIM_TEAM
    ctx.fill()
  }

  /** Inside the cancel zone: berry ring on the disc + an ✕ badge above it. */
  const drawAimCancel = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    const side = blade.radius * 0.2
    const rx = blade.radius + 2.5
    const ry = blade.radius * DISC_SQUASH_RENDER + 2.5 + side * 0.5
    const cy = blade.y + side * 0.5
    ctx.beginPath()
    ctx.ellipse(blade.x, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.lineWidth = 6.4
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.lineWidth = 3.2
    ctx.strokeStyle = AIM_BERRY
    ctx.stroke()
    const bx = blade.x
    const by = cy - ry - 15
    const r = 9.5
    // Hard drop, then the berry badge with its navy outline.
    ctx.beginPath()
    ctx.arc(bx, by + 2.5, r + AIM_OUTLINE, 0, Math.PI * 2)
    ctx.fillStyle = AIM_INK
    ctx.fill()
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.lineWidth = AIM_OUTLINE * 2
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.fillStyle = AIM_BERRY
    ctx.fill()
    const s = r * 0.42
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(bx - s, by - s)
    ctx.lineTo(bx + s, by + s)
    ctx.moveTo(bx + s, by - s)
    ctx.lineTo(bx - s, by + s)
    ctx.lineWidth = 5
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.lineWidth = 2.6
    ctx.strokeStyle = AIM_ICE
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** The pointer is back on the disc: releasing there cancels (releaseDrag). */
  const inAimCancelZone = (blade: SpinnerState): boolean => {
    const dx = dragCurrent.value.x - blade.x
    const dy = dragCurrent.value.y - blade.y
    return dx * dx + dy * dy < blade.radius * blade.radius
  }

  /** Under the models: pull band, power arrow and guide dots of a drag. */
  const renderAimPreview = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    if (inAimCancelZone(blade)) {
      aimMaxSince = -1
      return
    }
    const fx = dragCurrent.value.x
    const fy = dragCurrent.value.y
    const now = performance.now()
    // The preview shows what releaseDrag fires: the drag vector (press →
    // finger) and its force ratio (wall-proximity boost included).
    const ratio = dragForceRatio.value
    ctx.save()
    drawPullBand(ctx, blade.x, blade.y, blade.radius, fx, fy, ratio, 1)
    const ldx = dragStart.value.x - fx
    const ldy = dragStart.value.y - fy
    const lmag = Math.sqrt(ldx * ldx + ldy * ldy)
    if (lmag >= 5) {
      noteAimPower(ratio, now)
      const nx = ldx / lmag
      const ny = ldy / lmag
      const tip = drawAimArrow(ctx, blade.x, blade.y, blade.radius, nx, ny, ratio, 1, now)
      drawAimDots(ctx, blade.x, blade.y, blade.radius, tip, nx, ny, ratio)
    } else aimMaxSince = -1
    ctx.restore()
  }

  /** Under the models: the same arrow + dots for a joystick aim. */
  const renderJoystickAimPreview = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    const { dx, dy } = joystickVector.value
    const mag = Math.sqrt(dx * dx + dy * dy)
    if (mag < JOYSTICK_CANCEL_RADIUS) {
      aimMaxSince = -1
      return
    }
    const ratio = joystickForceRatio.value
    const now = performance.now()
    noteAimPower(ratio, now)
    const nx = -dx / mag
    const ny = -dy / mag
    ctx.save()
    const tip = drawAimArrow(ctx, blade.x, blade.y, blade.radius, nx, ny, ratio, 1, now)
    drawAimDots(ctx, blade.x, blade.y, blade.radius, tip, nx, ny, ratio)
    ctx.restore()
  }

  /** Over the models: the cancel zone (dashed ring near it, ✕ badge in it). */
  const renderDragIndicator = (ctx: CanvasRenderingContext2D, blade: SpinnerState) => {
    ctx.save()
    if (inAimCancelZone(blade)) {
      drawAimCancel(ctx, blade)
      ctx.restore()
      return
    }
    const dx = dragCurrent.value.x - blade.x
    const dy = dragCurrent.value.y - blade.y
    const pullMag = Math.sqrt(dx * dx + dy * dy)
    // Near the zone: its border fades in as a dashed ring.
    const near = 1 - (pullMag - blade.radius) / (blade.radius * 0.9)
    if (near > 0) {
      ctx.globalAlpha = Math.min(1, near) * 0.85
      ctx.setLineDash(AIM_CANCEL_DASH)
      ctx.beginPath()
      ctx.arc(blade.x, blade.y, blade.radius, 0, Math.PI * 2)
      ctx.lineWidth = 2.2
      ctx.strokeStyle = AIM_INK
      ctx.stroke()
      ctx.setLineDash(AIM_NO_DASH)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // ─── Virtual Joystick Rendering ──────────────────────────────────────────

  const renderJoystick = (ctx: CanvasRenderingContext2D) => {
    const jc = joystickCenter.value
    const dragging = isJoystickDragging.value

    ctx.save()

    // Base: a navy well with a hard drop and a royal inner ring (toy-box
    // style, same language as the aim preview — no translucent glass).
    ctx.beginPath()
    ctx.arc(jc.x, jc.y + 2.5, JOYSTICK_RADIUS, 0, Math.PI * 2)
    ctx.globalAlpha = 0.35
    ctx.fillStyle = AIM_INK
    ctx.fill()
    ctx.globalAlpha = 0.82
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = AIM_WELL
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = AIM_OUTLINE
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_RADIUS - 4, 0, Math.PI * 2)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#4570f0'
    ctx.stroke()

    // Cancel zone (dashed ring): berry while dragging inside it.
    const { dx, dy } = joystickVector.value
    const mag = Math.sqrt(dx * dx + dy * dy)
    const inCancel = dragging && mag < JOYSTICK_CANCEL_RADIUS
    ctx.setLineDash(AIM_CANCEL_DASH)
    ctx.beginPath()
    ctx.arc(jc.x, jc.y, JOYSTICK_CANCEL_RADIUS, 0, Math.PI * 2)
    ctx.lineWidth = inCancel ? 2.4 : 1.4
    ctx.strokeStyle = inCancel ? AIM_BERRY : AIM_ICE
    ctx.globalAlpha = inCancel ? 1 : 0.45
    ctx.stroke()
    ctx.setLineDash(AIM_NO_DASH)
    ctx.globalAlpha = 1

    // Knob position
    const kx = dragging ? joystickKnob.value.x : jc.x
    const ky = dragging ? joystickKnob.value.y : jc.y

    // Slingshot visual: the rubber band to the knob + a small power arrow on
    // the opposite (launch) side.
    if (dragging && mag >= JOYSTICK_CANCEL_RADIUS) {
      const ratio = joystickForceRatio.value
      drawPullBand(ctx, jc.x, jc.y, 0, kx, ky, ratio, 0.55)
      drawAimArrow(ctx, jc.x, jc.y, 2, -dx / mag, -dy / mag, ratio, 0.34, performance.now())
    }

    // Knob: an ice 3D token with a sky core and a hard drop.
    ctx.beginPath()
    ctx.arc(kx, ky + 2, JOYSTICK_KNOB_RADIUS, 0, Math.PI * 2)
    ctx.globalAlpha = 0.4
    ctx.fillStyle = AIM_INK
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(kx, ky, JOYSTICK_KNOB_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = AIM_ICE
    ctx.fill()
    ctx.lineWidth = AIM_OUTLINE
    ctx.strokeStyle = AIM_INK
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(kx, ky + 1, JOYSTICK_KNOB_RADIUS * 0.55, 0, Math.PI * 2)
    ctx.fillStyle = dragging ? AIM_TEAM : AIM_TEAM_HI
    ctx.fill()

    ctx.restore()
  }

  // ─── Coordinate Conversion ───────────────────────────────────────────────

  const pixelToGame = (
    px: number, py: number, canvasWidth: number, canvasHeight: number
  ): { x: number; y: number } => {
    const view = arenaViewFor(canvasWidth, canvasHeight)
    const centerX = view.cx
    const centerY = view.cy
    const scale = view.scale
    return {
      x: (px - centerX) / scale,
      y: (py - centerY) / scale
    }
  }

  // ─── Hint Animation ─────────────────────────────────────────────────────

  // The idle hint is a looping DEMO PULL drawn with the real aim kit
  // (ui-catalog.md §7.1 "Idle hint"): the rubber band stretches back from the
  // disc to a ghost grip, the notched power arrow fills sun → orange → pink on
  // the launch side, the guide dots run ahead (stopping at walls like a real
  // aim), then the band snaps back and the arrow shoots forward as the
  // release cue, and it rests. It aims at the nearest enemy (teaches "pull
  // AWAY from the target"), on every living player smasher (CG QA), at hint
  // opacity. Band + arrow are composed at full opacity in a small reused
  // layer and blitted once at the hint alpha (real GROUP opacity, so the navy
  // outline never shows through the fills) at whole device pixels — pixel-
  // exact, no resampling. FX.low draws straight onto the canvas.
  // Reduced motion: a still arrow at 60 % power. No per-frame allocation.
  const HINT_CYCLE_MS = 2400
  const HINT_ALPHA = 0.72
  const HINT_RATIO = 0.85
  let hintLayer: OffscreenCanvas | HTMLCanvasElement | null = null
  let hintLayerCtx: CanvasRenderingContext2D | null = null
  let hintStill: boolean | null = null

  /** The hint's compose layer, grown (never shrunk) to at least w × h. */
  const hintLayerFor = (w: number, h: number): CanvasRenderingContext2D | null => {
    if (hintLayer !== null && hintLayer.width >= w && hintLayer.height >= h) return hintLayerCtx
    const W = Math.max(w, hintLayer?.width ?? 0)
    const H = Math.max(h, hintLayer?.height ?? 0)
    if (typeof OffscreenCanvas !== 'undefined') hintLayer = new OffscreenCanvas(W, H)
    else if (typeof document !== 'undefined') {
      const el = document.createElement('canvas')
      el.width = W
      el.height = H
      hintLayer = el
    } else return null
    hintLayerCtx = hintLayer.getContext('2d') as CanvasRenderingContext2D | null
    return hintLayerCtx
  }

  const renderHintAnimation = (
    ctx: CanvasRenderingContext2D, showHint: boolean,
    cx: number, cy: number, scale: number, devPx: number
  ) => {
    if (!showHint || phase.value !== 'player_turn' || isDragging.value || isJoystickDragging.value) return
    const blades = playerBlades.value
    if (hintStill === null) hintStill = prefersStill()

    // Pose of the loop: appear, pull back (ease-out), hold, snap + shoot, rest.
    const t = hintStill ? 600 : performance.now() % HINT_CYCLE_MS
    let ratio: number
    let alpha: number
    let slide = 0
    let dots = 1
    if (hintStill) {
      ratio = 0.6
      alpha = HINT_ALPHA
    } else if (t < 180) {
      ratio = 0
      alpha = HINT_ALPHA * (t / 180)
    } else if (t < 1080) {
      const u = (t - 180) / 900
      ratio = HINT_RATIO * (1 - (1 - u) * (1 - u) * (1 - u))
      alpha = HINT_ALPHA
    } else if (t < 1480) {
      ratio = HINT_RATIO + 0.015 * Math.sin((t - 1080) * 0.03)
      alpha = HINT_ALPHA
    } else if (t < 1700) {
      const u = (t - 1480) / 220
      ratio = HINT_RATIO * (1 - u) * (1 - u)
      slide = 34 * u
      dots = 0
      alpha = HINT_ALPHA * (1 - u)
    } else return
    if (alpha < 0.03) return
    const arrowRatio = slide > 0 ? HINT_RATIO : ratio
    const k = devPx * scale

    for (let bi = 0; bi < blades.length; bi++) {
      const blade = blades[bi]!
      if (blade.hp <= 0) continue
      // Launch toward the nearest living enemy (fallback: up the arena).
      let nx = 0
      let ny = -1
      let best = Infinity
      const foes = npcBlades.value
      for (let j = 0; j < foes.length; j++) {
        const f = foes[j]!
        if (f.hp <= 0) continue
        const dx = f.x - blade.x
        const dy = f.y - blade.y
        const d2 = dx * dx + dy * dy
        if (d2 < best && d2 > 1) {
          best = d2
          const d = Math.sqrt(d2)
          nx = dx / d
          ny = dy / d
        }
      }
      const pull = ratio * MAX_PULL_DISTANCE
      const gx = blade.x - nx * pull
      const gy = blade.y - ny * pull
      const ox = blade.x + nx * slide
      const oy = blade.y + ny * slide
      const tipR = blade.radius + 84

      // Band + arrow bounding box (arena units) → device px rect.
      const ex = ox + nx * tipR
      const ey = oy + ny * tipR
      const minX = Math.min(gx, blade.x, ex) - blade.radius * 0.6 - 18
      const maxX = Math.max(gx, blade.x, ex) + blade.radius * 0.6 + 18
      const minY = Math.min(gy, blade.y, ey) - blade.radius * 0.6 - 18
      const maxY = Math.max(gy, blade.y, ey) + blade.radius * 0.6 + 21
      const dx0 = Math.floor(devPx * (cx + scale * minX))
      const dy0 = Math.floor(devPx * (cy + scale * minY))
      const w = Math.ceil(devPx * (cx + scale * maxX)) - dx0
      const h = Math.ceil(devPx * (cy + scale * maxY)) - dy0
      const lc = FX.low ? null : hintLayerFor(w, h)

      if (lc !== null && hintLayer !== null) {
        lc.setTransform(1, 0, 0, 1, 0, 0)
        lc.clearRect(0, 0, w, h)
        lc.setTransform(k, 0, 0, k, devPx * cx - dx0, devPx * cy - dy0)
        drawPullBand(lc, blade.x, blade.y, blade.radius, gx, gy, ratio, 1)
        if (arrowRatio > 0.02) drawAimArrow(lc, ox, oy, blade.radius, nx, ny, arrowRatio, 1, 0)
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = alpha
        ctx.drawImage(hintLayer as CanvasImageSource, 0, 0, w, h, dx0, dy0, w, h)
        ctx.restore()
      } else {
        ctx.save()
        ctx.globalAlpha = alpha
        drawPullBand(ctx, blade.x, blade.y, blade.radius, gx, gy, ratio, 1)
        if (arrowRatio > 0.02) drawAimArrow(ctx, ox, oy, blade.radius, nx, ny, arrowRatio, 1, 0)
        ctx.restore()
      }
      if (dots > 0 && ratio > 0.15) {
        ctx.save()
        // drawAimArrow's tip distance at size 1 (not maxed): startR + 4 + 56 + 20
        const tip = blade.radius + 80
        drawAimDots(ctx, blade.x, blade.y, blade.radius, tip, nx, ny, ratio, alpha)
        ctx.restore()
      }
    }
  }

  // ── Tutorial: orbiting yellow arrows around player spinners ──────────────
  //
  // CG QA requested a clearer "this spinner is yours" cue during early
  // levels. Three small yellow arrowheads orbit each living player blade,
  // pointing inward, on a 1s grace + 5s show / 2s hide cycle. Fades AND
  // grows in (scale 0.5 → 1, alpha 0 → 1 over `FADE_MS`); fades out on
  // disappear (alpha only). Disabled past stage 11 — by then the player
  // has unambiguously learned which side is theirs.
  const renderTutorialArrows = (ctx: CanvasRenderingContext2D, stageId: number) => {
    if (stageId > 11) return
    if (phase.value !== 'player_turn') return
    if (isDragging.value || isJoystickDragging.value) return
    if (playerTurnStartedAt === null) return

    const GRACE_MS = 1000
    const SHOW_MS = 5000
    const HIDE_MS = 2000
    const FADE_MS = 300

    const elapsed = Date.now() - playerTurnStartedAt
    if (elapsed < GRACE_MS) return

    const cyclePos = (elapsed - GRACE_MS) % (SHOW_MS + HIDE_MS)
    if (cyclePos >= SHOW_MS) return // hidden segment of the cycle

    let alpha: number
    let scale: number
    if (cyclePos < FADE_MS) {
      const k = cyclePos / FADE_MS
      alpha = k
      scale = 0.5 + 0.5 * k
    } else if (cyclePos > SHOW_MS - FADE_MS) {
      alpha = (SHOW_MS - cyclePos) / FADE_MS
      scale = 1
    } else {
      alpha = 1
      scale = 1
    }

    const blades = livingBlades(playerBlades.value)
    if (blades.length === 0) return

    // ~12 deg/sec — slow enough to read "selection ring", fast enough to
    // catch peripheral attention.
    const baseAngle = Date.now() * 0.0008

    ctx.save()
    ctx.globalAlpha = alpha
    for (const blade of blades) {
      const orbitR = (blade.radius + 16) * scale
      const arrowSize = 7.5 * scale
      for (let i = 0; i < 3; i++) {
        const angle = baseAngle + (i * Math.PI * 2) / 3
        // ornamented arrow (pullArrowArt.ts), tip pointing inward at the disc
        drawPullArrow(ctx, blade.x + Math.cos(angle) * orbitR, blade.y + Math.sin(angle) * orbitR, angle + Math.PI, arrowSize)
      }
    }

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
    setArenaFitHud,
    arenaViewFor,
    arenaScreenLayout,
    startPhysics,
    stopPhysics,
    disposePhysics,
    spawnMeteorShower,

    // PvP
    pvpMode,
    ghostMode,
    /** Seed the running match's RNG started from (PvP: the host's broadcast). */
    getMatchSeed: (): number => matchSeed,
    /** Tree Smashers terrain layout of this match (null = plain arena); tests / QA. */
    terrainLayout: (): Readonly<TerrainLayout> | null => terrain,
    /** Team towers of this match ([] = towers off); tests / QA / cheats. */
    towers: (): readonly TeamTower[] => towers,
    /** HUD mirror of the towers (republished on every tower hit). */
    towerHud,

    // Skills (skills-feature.md §8.1 / §10.3)
    /** Local side's HUD chips, `[playerBlades index][slot]`; ≤ 10 Hz. */
    skillHud,
    /** Visit skill events with seq > `sinceSeq` (oldest first, at most the
     *  last SKILL_EVENT_BUFFER); returns the newest seq to pass next time. */
    forEachSkillEvent,
    /** Newest skill event seq (0 = none yet). */
    skillEventSeq: (): number => skillEventSeq,
    /** Rockets in flight (they hold the turn change). */
    rocketsInFlight: (): number => rocketsInFlight,
    /** Per-side turn counters (Static Charge); tests / QA. */
    turnIndices: (): { player: number; npc: number } => ({ player: playerTurnIndex, npc: npcTurnIndex }),
    /** Can this blade move on its team's next turn (alive, not stunned /
     *  frozen)? Selection, drag, joystick and every auto-select use it. */
    isBladePickable: isPickable,

    // Boss traits (bosses-100-feature.md §7.3, §12.2)
    /** Local blades' trait HUD rows ({ frozen, chill } per playerBlades
     *  index); a new array only when a row changed. */
    bossTraitHud,
    /** Visit trait events with seq > `sinceSeq` (oldest first, at most the
     *  last BOSS_TRAIT_EVENT_BUFFER); returns the newest seq. */
    forEachBossTraitEvent,
    /** Newest trait event seq (0 = none yet). */
    bossTraitEventSeq: (): number => bossTraitEventSeq,
    /** This match has a trait carrier. */
    traitsActive: (): boolean => BOSSES100_BUILD && traitsActive,
    /** A tap aimed at a frozen spinner: shake it + ice crack (render/SFX only). */
    refuseFrozenTap,
    /** Combat clock (ms) and the next nova's charge 0…1; tests / QA / HUD. */
    bossClockMs: (): number => (BOSSES100_BUILD && bossClock !== null ? bossClock.clockMs : 0),
    novaCharge: (): number => (BOSSES100_BUILD && bossPort !== null && bossClock !== null ? bossPort['novaCharge'](bossClock) : 0),
    /** Peer-independent state hash (also sent as the PvP turn state-check). */
    computeStateHash,
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
