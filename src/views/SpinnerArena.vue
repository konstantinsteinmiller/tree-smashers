<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FModal from '@/components/molecules/FModal.vue'
import FReward from '@/components/atoms/FReward.vue'
import SpinnerConfigModal from '@/components/organisms/SpinnerConfigModal.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import useSounds, { useMusic } from '@/use/useSound'
import useSpinnerGame, { ARENA_RADIUS, BLADE_RADIUS, simSpeed, countdownText } from '@/use/useSpinnerGame'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { useHint } from '@/use/useHint'
import { useScreenshake } from '@/use/useScreenshake'
import type { SpinnerConfig } from '@/types/spinner'
import useUser, { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconAttack from '@/components/icons/IconAttack.vue'
import IconDefense from '@/components/icons/IconDefense.vue'
import IconSpeed from '@/components/icons/IconSpeed.vue'
import IconHp from '@/components/icons/IconHp.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import useBattlePass from '@/use/useBattlePass'
import TreasureChest from '@/components/organisms/TreasureChest.vue'
import SkinChestTimer from '@/components/organisms/SkinChestTimer.vue'
import type { GrantedSkin } from '@/use/useSkinChest'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import { prependBaseUrl } from '@/utils/function'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FButtonSwitch from '@/components/atoms/FButtonSwitch.vue'
import StageBadge from '@/components/StageBadge.vue'
import FakeLeaderBoard from '@/components/organisms/FakeLeaderBoard.vue'
import SurrenderIcon from '@/components/organisms/SurrenderIcon.vue'
import PvPButton from '@/components/organisms/PvPButton.vue'
import PvPLobbyModal from '@/components/organisms/PvPLobbyModal.vue'
import usePVP from '@/use/usePVP'
import usePvpStats, { calcHonorPoints } from '@/use/usePvpStats'
import useLeaderboard, { type LeaderboardEntry } from '@/use/useLeaderboard'
import {
  startGameplay,
  stopGameplay,
  triggerHappytime
} from '@/use/useCrazyGames'
import { isRewardedReady, isInterstitialReady, showRewardedAd, showMidgameAd } from '@/use/useAds'
import useBottomSafe from '@/use/useBottomSafe'
import { getSelectedSkin, modelImgPath } from '@/use/useModels'
import useAssets from '@/use/useAssets'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useCheats from '@/use/useCheats'
import { cheatRouletteSignal } from '@/use/useCheats'
import RouletteWheel from '@/components/organisms/RouletteWheel.vue'
import type { RouletteResult } from '@/components/organisms/RouletteWheel.vue'

useCheats()

// ─── Game & Config ─────────────────────────────────────────────────────────

const {
  phase,
  gameResult,
  turnAnnouncement,
  playerBlades,
  npcBlades,
  isDragging,
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
  stopPhysics,
  render,
  pixelToGame,
  spawnMeteorShower,
  pvpMode: gamePvpMode,
  ghostMode,
  launchRemoteBlade,
  setOnLocalLaunch,
  setOnStateHash,
  statsFor
} = useSpinnerGame()

const { playerTeam, hasFirstWin, saveTeam, addCoins, markFirstWin } = useSpinnerConfig()
const {
  currentStage,
  currentStageId,
  isLastStage,
  playerUpgrades,
  advanceStage,
  stageReinitSignal,
  cheatStage
} = useSpinnerCampaign()
const { recordPlayerStage, markGhostFought } = useLeaderboard()
const {
  canShowPvP,
  status: pvpStatus,
  role: pvpRole,
  gameConfig: pvpGameConfig,
  hostTeam: pvpHostTeam,
  guestTeam: pvpGuestTeam,
  registerCallbacks: pvpRegisterCallbacks,
  sendLaunch: pvpSendLaunch,
  sendSurrender: pvpSendSurrender,
  sendStateCheck: pvpSendStateCheck,
  joinLobby: pvpJoinLobby,
  checkInviteFromUrl,
  returnToLobby: pvpReturnToLobby,
  leavePvP
} = usePVP()

const pvpModalOpen: Ref<boolean> = ref(false)
const pvpMode: Ref<boolean> = ref(false)

const { showHint, startHintTimer, clearHint } = useHint(2500)
const { shakeStyle } = useScreenshake()
const { t } = useI18n()
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()

// Wraps startMatch so the battle music kicks in exactly when a fight begins,
// regardless of whether the player tapped the canvas or the start button.
const beginBattle = () => {
  startBattleMusic()
  startMatch()
}

const { setSettingValue } = useUser()

// Battle Pass — xp awards are fired from the game-over watcher below.
const {
  awardCampaignWin: bpAwardCampaignWin,
  awardLeaderboardWin: bpAwardLeaderboardWin,
  awardLoss: bpAwardLoss
} = useBattlePass()

const { recordPvpWin, recordPvpLoss } = usePvpStats()

const PVP_COIN_REWARD = 20
/** Honor points earned in the last PvP match — shown on the reward overlay. */
const lastHonorEarned: Ref<number> = ref(0)

// ─── Canvas Refs ───────────────────────────────────────────────────────────

const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
const joystickCanvasRef: Ref<HTMLCanvasElement | null> = ref(null)
const canvasSize: Ref<number> = ref(0)
const canvasWidth: Ref<number> = ref(0)
const canvasHeight: Ref<number> = ref(0)
const uiBtnScale = computed(() => Math.min(2, Math.max(1, canvasWidth.value / 1000)))
// Blade stat cards: same scaling curve as the buttons but capped so the
// visual size never exceeds 250×350px. Base card is ~85×85px → max ~2.94.
const uiStatScale = computed(() => Math.min(250 / 85, Math.max(1, canvasWidth.value / 1000)))
const configModalOpen: Ref<boolean> = ref(false)
const showOptions: Ref<boolean> = ref(false)
const coinsAwarded: Ref<boolean> = ref(false)

// ─── First-Config Spotlight ──────────────────────────────────────────────
// After the player's first campaign win (stage 2), we spotlight the team
// config button so they discover team building. Dismissed on first open.
const CONFIG_OPENED_KEY = 'spinner_config_opened'
const hasOpenedConfig: Ref<boolean> = ref(localStorage.getItem(CONFIG_OPENED_KEY) === '1')

// ─── Ghost Fight (Leaderboard 1v1) ────────────────────────────────────────
// While true, the current match is a ghost battle launched from the
// leaderboard: rewards are custom, campaign progress does not advance,
// the StageBadge is hidden, and the arena uses the default theme.
const ghostEnemy: Ref<LeaderboardEntry | null> = ref(null)

// ─── NPC Team from Campaign Stage ─────────────────────────────────────────

const stageNpcTeam = (): SpinnerConfig[] =>
  currentStage.value.enemyTeam.map(e => ({
    topPartId: e.topPartId,
    bottomPartId: e.bottomPartId,
    topLevel: e.topLevel,
    bottomLevel: e.bottomLevel,
    modelId: e.modelId,
    isBoss: e.isBoss,
    // Forward the special boss ability so ghost/split/partners/healers
    // actually activate when their stage loads.
    bossAbility: e.bossAbility
  }))

/** Player team with current upgrade levels applied.
 *  While a cheat boss stage is active the player's blades are temporarily
 *  boosted well above the enemy level so the demo fight is actually winnable.
 *  The enemies (built by buildCheatBossStage) scale to the player's peak
 *  upgrades AND carry the boss 2x HP + 1.6x radius multipliers, so simply
 *  matching levels leaves the player too weak. We add a flat +25 levels on
 *  top of the matched peak — localStorage upgrades are never touched.
 *  There is no upgrade max level, so this is safe to stack arbitrarily. */
const CHEAT_PLAYER_BONUS_LEVELS = 25
const playerTeamWithUpgrades = (): SpinnerConfig[] => {
  if (cheatStage.value) {
    const tops = playerUpgrades.value.tops
    const bots = playerUpgrades.value.bottoms
    const peakTop = Math.max(0, ...Object.values(tops))
    const peakBot = Math.max(0, ...Object.values(bots))
    return playerTeam.value.map((c, i) => ({
      ...c,
      topLevel: Math.max(tops[c.topPartId] ?? 0, peakTop) + CHEAT_PLAYER_BONUS_LEVELS,
      bottomLevel: Math.max(bots[c.bottomPartId] ?? 0, peakBot) + CHEAT_PLAYER_BONUS_LEVELS,
      modelId: getSelectedSkin(c.topPartId, i)
    }))
  }
  return playerTeam.value.map((c, i) => ({
    ...c,
    topLevel: playerUpgrades.value.tops[c.topPartId],
    bottomLevel: playerUpgrades.value.bottoms[c.bottomPartId],
    modelId: getSelectedSkin(c.topPartId, i)
  }))
}

// ─── Hint Timer ───────────────────────────────────────────────────────────

watch(phase, (p) => {
  if (p === 'player_turn') {
    startHintTimer()
  } else {
    clearHint()
  }
})

// PvP disconnect recovery — if opponent disconnects mid-match, stop the fight
// and return to normal campaign state so the player isn't stuck.
// Skip if already at game_over or showing rewards — the player needs to
// click through the PvP reward screen first; tearing down here would flash
// the campaign reward overlay instead.
watch(pvpStatus, (s) => {
  if ((s === 'disconnected' || s === 'error') && pvpMode.value) {
    if (phase.value === 'game_over' || showReward.value) return
    pvpMode.value = false
    stopPhysics()
    stopBattleMusic()
    gamePvpMode.value = false
    initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
  }
})

// Cheat-stage reinit: when a cheat loads a custom boss stage (or clears one),
// `stageReinitSignal` is bumped and we rebuild the match with whatever
// `currentStage` now resolves to. Kept out of useCheats.ts so that composable
// doesn't need to reach into the active game instance.
watch(stageReinitSignal, () => {
  coinsAwarded.value = false
  showReward.value = false
  ghostMode.value = false
  ghostEnemy.value = null
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
})

// ─── Computed ──────────────────────────────────────────────────────────────

const isGameOver = computed(() => phase.value === 'game_over')
const showReward: Ref<boolean> = ref(false)

// ─── Boss Roulette ──────────────────────────────────────────────────────────
const showRoulette = ref(false)
const rouletteMultiplier = ref(1)
const rouletteSkinResult = ref<RouletteResult | null>(null)
const pendingBossReward = ref(false)
const showRouletteReward = ref(false)
const rouletteRewardReady = ref(false) // tap-to-continue unlocked

// ─── Skin Chest (20h) ───────────────────────────────────────────────────────
const skinChestReward = ref<GrantedSkin | null>(null)
const showSkinChestReward = computed({
  get: () => skinChestReward.value !== null,
  set: (val: boolean) => {
    if (!val) skinChestReward.value = null
  }
})

const onSkinChestCollected = (granted: GrantedSkin) => {
  skinChestReward.value = granted
}

const onSkinChestRewardContinue = () => {
  skinChestReward.value = null
}

const resultText = computed(() => {
  if (gameResult.value === 'win') return t('spinner.youWin')
  if (gameResult.value === 'lose') return t('spinner.youLose')
  return ''
})

const rewardAmount = computed(() => {
  if (ghostMode.value) {
    if (gameResult.value !== 'win') return 0
    const enemyStage = ghostEnemy.value?.maxStage ?? 1
    const base = 50 + enemyStage * 2
    // Diminish to 60% if the opponent is significantly weaker than the player
    if (currentStageId.value - enemyStage >= 5) return Math.round(base * 0.6)
    return base
  }
  return gameResult.value === 'win' ? currentStage.value.rewardWin : currentStage.value.rewardLose
})

// Config button: only when game over and no new game started
const showConfigButton = computed(() =>
  phase.value === 'game_over' || phase.value === 'idle' || phase.value === 'tap_to_start'
)

const showConfigSpotlight = computed(() =>
  !hasOpenedConfig.value && currentStageId.value === 2 && showConfigButton.value && !showReward.value
)

// Surrender is available during active battle phases (not pre-game or post-game)
const isBattleActive = computed(() =>
  ['deciding_turn', 'player_turn', 'player_launched', 'npc_turn', 'npc_launched'].includes(phase.value)
)

// Open-state of the surrender confirmation dialog. Bubbles up from
// SurrenderIcon so the CrazyGames `gameplayStart`/`gameplayStop` watcher
// below can pause the SDK signal while the player is reading the prompt.
const surrenderModalOpen = ref(false)

// CrazyGames considers the player "in gameplay" only while the physics loop
// is actually advancing the match — i.e. one of the live battle phases AND
// no blocking modal (reward, roulette reward, skin chest, surrender prompt)
// is on top. The watcher below mirrors this into `startGameplay`/`stopGameplay`.
const isGameplayActive = computed(() =>
  [
    'meteor_intro',
    'deciding_turn',
    'player_turn',
    'player_launched',
    'npc_turn',
    'npc_launched'
  ].includes(phase.value)
  && !showReward.value
  && !showRoulette.value
  && !showRouletteReward.value
  && !showSkinChestReward.value
  && !surrenderModalOpen.value
)

watch(isGameplayActive, (active) => {
  if (active) startGameplay()
  else stopGameplay()
}, { immediate: true })

// Live stats for the blade HUD — always show all blades (even dead ones)
// so the cards stay pinned to their corners.
const bladeStats = computed(() =>
  playerBlades.value.map(b => {
    const s = statsFor(b)
    return {
      id: b.id,
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: Math.round(s.maxHp),
      atk: s.damageMultiplier,
      def: s.defenseMultiplier,
      spd: s.speedMultiplier,
      dead: b.hp <= 0
    }
  })
)

// Set when the player surrenders the current battle. The PvP surrender flow
// passes through the normal game_over → reward modal → onRewardContinue
// path; this flag tells onRewardContinue to skip the ad-counter increment so
// surrendered matches don't count toward the interstitial cadence. Cleared
// in onRewardContinue after it's read. Campaign/ghost surrenders bypass the
// reward flow entirely (direct initGame below) so the flag isn't needed
// there, but we still set it for symmetry / future-proofing.
let surrenderedThisBattle = false

const onSurrender = () => {
  stopPhysics()
  clearBattleVfx()
  stopBattleMusic()
  surrenderedThisBattle = true
  if (pvpMode.value) {
    // Notify opponent, then force a loss game-over
    pvpSendSurrender()
    gameResult.value = 'lose'
    phase.value = 'game_over'
    return
  }
  // Re-init the same stage with no rewards — player stays on current stage
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
}

// Handle incoming surrender from opponent — force a win and show notification
const showEnemySurrender = ref(false)

const onRemoteSurrender = () => {
  stopPhysics()
  clearBattleVfx()
  stopBattleMusic()
  gameResult.value = 'win'
  phase.value = 'game_over'
  showEnemySurrender.value = true
}

// ─── PvP State-Check (desync detection) ──────────────────────────────────
// Each client sends a hash of all blade positions + HP after every turn.
// If both hashes for the same turn are available and don't match, we log
// a warning so desync is easy to spot during testing.
const localHashes = new Map<number, string>()
const remoteHashes = new Map<number, string>()

const checkDesync = (turn: number) => {
  const local = localHashes.get(turn)
  const remote = remoteHashes.get(turn)
  if (!local || !remote) return
  if (local !== remote) {
    console.warn(`[PvP DESYNC] Turn ${turn}: local=${local} remote=${remote}`)
  } else {
    console.debug(`[PvP sync OK] Turn ${turn}: ${local}`)
  }
  // Prune old entries to avoid unbounded growth
  localHashes.delete(turn)
  remoteHashes.delete(turn)
}

// Called when the remote player's hash arrives
const onRemoteStateCheck = (hash: string, turn: number) => {
  remoteHashes.set(turn, hash)
  checkDesync(turn)
}

// ─── 2x Simulation Speed Boost ────────────────────────────────────────────

// Players can watch a rewarded video to unlock a temporary 2x speed-up.
// The boost is purely visual — physics integration runs twice per frame
// while active, so collisions and damage are unaffected.
const SPEED_BOOST_KEY = 'spinner_2x_expires_at'
const SPEED_BOOST_DURATION_MS = 3 * 60 * 1000

const speedBoostExpiresAt: Ref<number> = ref(parseInt(localStorage.getItem(SPEED_BOOST_KEY) || '0', 10))
const speedNow: Ref<number> = ref(Date.now())

const is2xAvailable = computed(() => speedNow.value < speedBoostExpiresAt.value)

const updateSpeedBoost = () => {
  speedNow.value = Date.now()
  // Auto-revert to 1x once the boost runs out
  if (simSpeed.value === 2 && speedNow.value >= speedBoostExpiresAt.value) {
    simSpeed.value = 1
  }
}

const onSpeedSwitchClick = (value: 1 | 2) => {
  // if (isDebug.value && value === 2) {
  //   speedBoostExpiresAt.value = Date.now() + SPEED_BOOST_DURATION_MS
  //   localStorage.setItem(SPEED_BOOST_KEY, String(speedBoostExpiresAt.value))
  //   simSpeed.value = 2
  //   return
  // }
  if (value === 1) {
    simSpeed.value = 1
    return
  }
  // Player tapped 2x. If a boost is already active (paid for in a
  // previous session and still inside its duration window), just flip
  // the sim — no ad. Otherwise charge an ad for a fresh boost.
  if (is2xAvailable.value) {
    simSpeed.value = 2
    return
  }
  triggerSpeedBoostAd()
}

// Shows a rewarded video via the CrazyGames SDK. On successful completion
// we unlock the 2x speed boost for SPEED_BOOST_DURATION_MS and flip the
// sim to 2x immediately so the reward is felt right away.
const triggerSpeedBoostAd = async () => {
  const ok = await showRewardedAd()
  if (!ok) return
  speedBoostExpiresAt.value = Date.now() + SPEED_BOOST_DURATION_MS
  localStorage.setItem(SPEED_BOOST_KEY, String(speedBoostExpiresAt.value))
  simSpeed.value = 2
}

// Reference to the CoinBadge component — TreasureChest reads its `rootEl`
// for the fly-to-badge VFX target.
const coinBadgeRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const coinBadgeEl = computed(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)
const rouletteRewardCoinRef = ref<HTMLElement | null>(null)

/** Fire coin explosion from any source element toward the HUD coin badge. */
const fireCoinExplosion = (sourceEl: HTMLElement | null) => {
  if (sourceEl && coinBadgeEl.value) {
    spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value })
  }
}

let speedBoostIntervalId: number | null = null

// ─── Canvas Sizing ─────────────────────────────────────────────────────────

const updateCanvasSize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  // visualViewport reflects the *currently visible* area on mobile (i.e. it
  // shrinks while the URL bar is showing) — fall back to innerHeight where
  // it isn't supported. This keeps the canvas/physics bounds aligned with
  // what the user actually sees and prevents bottom-row buttons from being
  // hidden behind the browser chrome.
  const vv = window.visualViewport
  canvasWidth.value = vv?.width ?? window.innerWidth
  canvasHeight.value = vv?.height ?? window.innerHeight
  canvasSize.value = Math.min(canvasWidth.value, canvasHeight.value)
  canvas.width = canvasWidth.value
  canvas.height = canvasHeight.value
  const jc = joystickCanvasRef.value
  if (jc) {
    jc.width = canvasWidth.value
    jc.height = canvasHeight.value
  }
}

// ─── Bottom-Row Visibility Guard ──────────────────────────────────────────
//
// `useBottomSafe` computes the gap between the layout viewport and the
// actually-visible visual viewport (i.e. the strip hidden behind URL bar /
// browser chrome on Android Chrome and Safari). The shared `bottomGapPx`
// pixel value is consumed by every bottom-anchored element so they all stay
// in sync. We deliberately do NOT re-measure on phase change — the value
// only depends on viewport metrics, not on which buttons are mounted.

const { bottomGapPx, scheduleBottomMeasure } = useBottomSafe()

// ─── Pointer Event Handlers ────────────────────────────────────────────────

const getGameCoords = (e: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return pixelToGame(
    e.clientX - rect.left,
    e.clientY - rect.top,
    canvasWidth.value,
    canvasHeight.value
  )
}

const onPointerDown = (e: PointerEvent) => {
  clearHint()
  if (phase.value === 'tap_to_start') {
    // Ignore taps outside the arena circle
    const c = getGameCoords(e)
    if (Math.sqrt(c.x * c.x + c.y * c.y) > ARENA_RADIUS) return
    beginBattle()
    return
  }
  const coords = getGameCoords(e)
  // Joystick takes priority when visible — check it first
  if (isJoystickVisible.value && beginJoystickDrag(coords.x, coords.y)) return
  beginDrag(coords.x, coords.y)
}

const isHoveringBlade = (gameX: number, gameY: number): boolean => {
  if (phase.value !== 'player_turn') return false
  for (const blade of playerBlades.value) {
    if (blade.hp <= 0) continue
    const dx = gameX - blade.x
    const dy = gameY - blade.y
    if (Math.sqrt(dx * dx + dy * dy) < BLADE_RADIUS * 3) return true
  }
  return false
}

const onPointerMove = (e: PointerEvent) => {
  const coords = getGameCoords(e)
  if (isJoystickDragging.value) {
    updateJoystickDrag(coords.x, coords.y)
    return
  }
  if (isDragging.value) {
    updateDrag(coords.x, coords.y)
    canvasRef.value!.style.cursor = 'grabbing'
    return
  }
  canvasRef.value!.style.cursor = isHoveringBlade(coords.x, coords.y) ? 'grab' : ''
}

const onPointerUp = () => {
  if (isJoystickDragging.value) {
    releaseJoystickDrag()
    return
  }
  if (!isDragging.value) return
  releaseDrag()
  if (canvasRef.value) canvasRef.value.style.cursor = ''
}

const onPointerLeave = () => {
  if (isJoystickDragging.value) {
    releaseJoystickDrag()
    return
  }
  if (!isDragging.value) return
  forceReleaseDragAtMax()
  if (canvasRef.value) canvasRef.value.style.cursor = ''
}

// ─── Game Over ─────────────────────────────────────────────────────────────

watch(isGameOver, (over) => {
  if (over && !coinsAwarded.value) {
    playSound(gameResult.value === 'win' ? 'win' : 'lose')
    if (gameResult.value === 'win') spawnMeteorShower(80, 50, 65)

    // PvP matches — small coin reward + honor points tracking
    if (pvpMode.value) {
      try {
        const myTeam = pvpRole.value === 'host' ? pvpHostTeam.value : pvpGuestTeam.value
        const enemyTeam = pvpRole.value === 'host' ? pvpGuestTeam.value : pvpHostTeam.value
        const sumLevels = (team: SpinnerConfig[]) =>
          team.reduce((s, c) => s + (c.topLevel ?? 1) + (c.bottomLevel ?? 1), 0)
        if (gameResult.value === 'win') {
          const hp = calcHonorPoints(sumLevels(myTeam), sumLevels(enemyTeam))
          recordPvpWin(hp)
          lastHonorEarned.value = hp
        } else {
          recordPvpLoss()
          lastHonorEarned.value = 0
        }
      } catch (e) {
        console.warn('[PvP] Stats recording failed:', e)
        lastHonorEarned.value = 0
      }
      addCoins(PVP_COIN_REWARD)
      coinsAwarded.value = true
      showReward.value = true
      stopBattleMusic()
      return
    }

    // Boss win (campaign only) — show roulette before awarding coins
    const isBossWin = gameResult.value === 'win' && !ghostMode.value && currentStage.value.isBoss
    if (isBossWin) {
      // Advance stage + BP immediately, but defer coin award until roulette resolves
      if (!hasFirstWin.value) markFirstWin()
      advanceStage()
      recordPlayerStage(currentStageId.value)
      bpAwardCampaignWin()
      pendingBossReward.value = true
      rouletteMultiplier.value = 1
      rouletteSkinResult.value = null
      showRoulette.value = true
      stopBattleMusic()
      return
    }

    addCoins(rewardAmount.value)
    if (gameResult.value === 'win' && !ghostMode.value) {
      if (!hasFirstWin.value) markFirstWin()
      advanceStage()
      recordPlayerStage(currentStageId.value)
    }
    // Battle Pass xp — campaign/leaderboard wins and losses feed the BP.
    if (gameResult.value === 'win') {
      if (ghostMode.value) bpAwardLeaderboardWin()
      else bpAwardCampaignWin()
    } else if (gameResult.value === 'lose') {
      bpAwardLoss()
    }
    coinsAwarded.value = true
    showReward.value = true
    stopBattleMusic()
  }
})

const onRouletteResult = (result: RouletteResult) => {
  if (result.type === 'multiplier') {
    rouletteMultiplier.value = result.multiplier ?? 1
    rouletteSkinResult.value = null
  } else {
    rouletteSkinResult.value = result
    rouletteMultiplier.value = 1
  }
  showRoulette.value = false
  // Award coins — boss win uses multiplied reward, cheat uses base reward
  const coins = Math.round(rewardAmount.value * rouletteMultiplier.value)
  addCoins(coins)
  coinsAwarded.value = true
  pendingBossReward.value = false
  // Show celebration overlay with VFX
  rouletteRewardReady.value = false
  showRouletteReward.value = true
  playSound('happy')
  spawnMeteorShower(60, 40, 50) // warm star burst
  // Signal a "happy moment" to the CrazyGames SDK alongside the reward VFX —
  // the platform uses these events to time featured-game highlights.
  // No-op outside a crazy-web build thanks to the isSdkActive guard inside.
  triggerHappytime()
  // Fire coin explosion from the reward label once the overlay renders
  nextTick(() => {
    fireCoinExplosion(rouletteRewardCoinRef.value)
  })
  // Enable "tap to continue" after VFX settles
  setTimeout(() => {
    rouletteRewardReady.value = true
  }, 1500)
}

const onRouletteRewardContinue = async () => {
  if (!rouletteRewardReady.value) return
  showRouletteReward.value = false

  // Same reset flow as onRewardContinue — ad cadence, teardown, reinit.
  // Boss-win path is campaign-only (never PvP/ghost), so threshold is 4.
  // No surrender check needed: you can't surrender after winning the boss.
  incrementAdCounter()
  if (isInterstitialReady.value && battlesSinceAd.value >= 4) {
    resetAdCounter()
    await showMidgameAd()
  }
  coinsAwarded.value = false
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
}

// Cheat: trigger roulette on demand (same flow as boss win)
watch(cheatRouletteSignal, () => {
  rouletteMultiplier.value = 1
  rouletteSkinResult.value = null
  pendingBossReward.value = false // no coins in cheat mode
  showRoulette.value = true
})

// Coin explosion VFX when the reward overlay appears
watch(showReward, async (show) => {
  if (!show) return
  await nextTick()
  fireCoinExplosion(rewardCoinRef.value)
})

// ─── Interstitial cadence ─────────────────────────────────────────────────
// A single counter tracks battles since the last ad across all modes:
//   - ghost / PvP battles trigger an ad after 3 battles without one
//   - campaign battles trigger an ad after 4 battles without one
// Surrendered battles do NOT increment the counter (see surrenderedThisBattle).
// This avoids edge cases where mixing modes causes back-to-back ads.
const AD_BATTLES_KEY = 'ca_battles_since_ad'

const loadCount = (key: string): number => {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0
  } catch {
    return 0
  }
}

const battlesSinceAd: Ref<number> = ref(loadCount(AD_BATTLES_KEY))

const resetAdCounter = () => {
  battlesSinceAd.value = 0
  localStorage.setItem(AD_BATTLES_KEY, '0')
}

const incrementAdCounter = () => {
  battlesSinceAd.value += 1
  localStorage.setItem(AD_BATTLES_KEY, String(battlesSinceAd.value))
}

const onRewardContinue = async () => {
  showReward.value = false

  // Snapshot mode flags before tearing down state
  const wasPvp = pvpMode.value
  const wasGhost = ghostMode.value
  const wasSurrender = surrenderedThisBattle
  surrenderedThisBattle = false

  // ghost/pvp → ad threshold 3, campaign → ad threshold 4
  const adThreshold = (wasPvp || wasGhost) ? 3 : 4
  // Surrendered battles don't count toward the cadence — the player chose
  // to bail, not to "finish" the match, so we don't penalise them with an
  // ad on top of the abandoned reward.
  if (!wasSurrender) incrementAdCounter()

  // Show interstitial when the counter reaches the threshold
  if (isInterstitialReady.value && battlesSinceAd.value >= adThreshold) {
    resetAdCounter()
    await showMidgameAd()
  }

  // Tear down mode state
  if (wasPvp) {
    pvpMode.value = false
    gamePvpMode.value = false
    // Return to PvP lobby (keep connection alive) instead of destroying it
    pvpReturnToLobby()
    pvpModalOpen.value = true
  } else if (wasGhost) {
    ghostMode.value = false
    ghostEnemy.value = null
  }

  // Reset the award guard RIGHT BEFORE initGame so the game-over watcher
  // cannot re-fire while phase is still 'game_over' (which would cause a
  // phantom second reward screen).
  coinsAwarded.value = false
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
}

// ─── Leaderboard / Ghost Fight ────────────────────────────────────────────

const onGhostFight = (entry: LeaderboardEntry) => {
  ghostEnemy.value = entry
  ghostMode.value = true
  markGhostFought(entry.id)
  const myTeam = playerTeamWithUpgrades()
  if (!myTeam.length) return
  const toConfig = (b: SpinnerConfig): SpinnerConfig => ({
    topPartId: b.topPartId,
    bottomPartId: b.bottomPartId,
    topLevel: b.topLevel ?? 0,
    bottomLevel: b.bottomLevel ?? 0,
    modelId: b.modelId
  })
  initGame(myTeam, [toConfig(entry.blade), toConfig(entry.blade2)], false, 'default')
}

const onOpenConfig = () => {
  if (!hasOpenedConfig.value) {
    hasOpenedConfig.value = true
    localStorage.setItem(CONFIG_OPENED_KEY, '1')
  }
  configModalOpen.value = true
}

const onConfigSave = (team: SpinnerConfig[]) => {
  saveTeam(team)
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

let renderRafId: number | null = null

// FPS cap for render pacing on 120Hz panels where we don't want to burn
// GPU redrawing the same state twice. The physics loop now owns the
// simulation rate independently via a fixed-step accumulator — this cap
// only gates how often we paint.
const FPS_CAP = Number(import.meta.env.VITE_APP_FPS_CAP) || 0
const FRAME_MS = FPS_CAP > 0 ? 1000 / FPS_CAP : 0
let lastFrameTime = 0

// Canvas visibility gate. IntersectionObserver flips this false when the
// arena is fully covered by another surface (modal, scrolled away, etc).
// Draws are skipped while it's false; physics keeps ticking. Starts true
// because IO fires its first callback asynchronously — rendering one
// extra frame while we wait is harmless.
let canvasVisible = true

const renderLoop = (now = 0) => {
  // Tab is hidden / minimized / OS-obstructed — the browser already
  // throttles rAF heavily here, but skipping the draw entirely saves
  // the occasional wake-up from spending CPU on a pixel nobody sees.
  if (document.hidden || !canvasVisible) {
    renderRafId = requestAnimationFrame(renderLoop)
    return
  }
  if (FRAME_MS > 0 && now - lastFrameTime < FRAME_MS - 0.5) {
    renderRafId = requestAnimationFrame(renderLoop)
    return
  }
  lastFrameTime = now

  const canvas = canvasRef.value
  if (!canvas) {
    renderRafId = requestAnimationFrame(renderLoop)
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    renderRafId = requestAnimationFrame(renderLoop)
    return
  }

  render(ctx, canvasWidth.value, canvasHeight.value, showHint.value)

  // Joystick draws to a separate overlay canvas that sits above the HUD,
  // so the bottom-left stat card no longer covers it.
  const jc = joystickCanvasRef.value
  if (jc) {
    const jctx = jc.getContext('2d')
    if (jctx) renderJoystickOverlay(jctx, canvasWidth.value, canvasHeight.value)
  }
  renderRafId = requestAnimationFrame(renderLoop)
}

let canvasObserver: IntersectionObserver | null = null

const onViewportChange = () => {
  updateCanvasSize()
  scheduleBottomMeasure()
}

onMounted(() => {
  updateCanvasSize()
  scheduleBottomMeasure()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)

  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
  renderRafId = requestAnimationFrame(renderLoop)

  // Watch the canvas for being fully off-screen or covered. Once visibility
  // drops to 0 (scrolled out, browser minimized on some platforms, another
  // element painted fully on top via a full-screen overlay) the render loop
  // skips draws. Any non-zero intersection re-enables painting.
  if (typeof IntersectionObserver !== 'undefined' && canvasRef.value) {
    canvasObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          canvasVisible = entry.intersectionRatio > 0
        }
      },
      { threshold: [0, 0.01] }
    )
    canvasObserver.observe(canvasRef.value)
  }

  recordPlayerStage(currentStageId.value)

  // Background-load every remaining skin (the ~40 not needed for current
  // stage + player team) once the arena is rendered. Defers bandwidth /
  // decode cost out of the initial FLogoProgress critical path so the
  // game boots faster, while still having everything ready by the time
  // the config modal is opened.
  const { preloadRemainingSkins, preloadSkinsByIds } = useAssets()
  const kick = () => {
    preloadRemainingSkins()
  }
  // Warm the next stage's enemy skins while the reward overlay is up.
  // `advanceStage()` already fired inside the game-over watcher above, so
  // `currentStage.value.enemyTeam` now points at the NEXT stage's
  // enemies. The player typically spends ~3 s on the reward screen —
  // more than enough for 2-4 skins to fetch + decode, so the first frame
  // of the next match already has them cached instead of decoding
  // mid-render and stalling the canvas.
  watch(
    () => showReward.value || showRoulette.value,
    (open) => {
      if (!open || gameResult.value !== 'win') return
      const ids = currentStage.value.enemyTeam
        .map(e => e.modelId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
      if (ids.length > 0) preloadSkinsByIds(ids)
    }
  )
  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(kick, { timeout: 2000 })
  } else {
    setTimeout(kick, 500)
  }

  // Check URL for incoming PvP invite — open modal and auto-join
  const pendingPvpHost = checkInviteFromUrl()
  if (pendingPvpHost) {
    pvpModalOpen.value = true
    // Small delay so the modal renders before we trigger join
    setTimeout(() => pvpJoinLobby(pendingPvpHost), 100)
  }

  // Register PvP game event callbacks
  pvpRegisterCallbacks(
    (firstTurn) => {
      try {
        pvpMode.value = true
        const isMyTurn = (pvpRole.value === 'host' && firstTurn === 'host')
          || (pvpRole.value === 'guest' && firstTurn === 'guest')
        const myTeam = pvpRole.value === 'host' ? pvpHostTeam.value : pvpGuestTeam.value
        const enemyTeam = pvpRole.value === 'host' ? pvpGuestTeam.value : pvpHostTeam.value
        if (!myTeam.length || !enemyTeam.length) {
          console.error('[PvP] Cannot start: empty team')
          leavePvP()
          pvpMode.value = false
          return
        }
        pvpModalOpen.value = false
        startBattleMusic()
        initGame(myTeam, enemyTeam, false, pvpGameConfig.value.arenaType, 0, false, undefined, {
          enabled: true,
          myTurnFirst: isMyTurn
        })
      } catch (e) {
        console.error('[PvP] Game start failed:', e)
        leavePvP()
        pvpMode.value = false
        pvpModalOpen.value = false
        initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
      }
    },
    (bladeIndex, ax, ay) => {
      try {
        launchRemoteBlade(bladeIndex, ax, ay)
      } catch (e) {
        console.error('[PvP] Remote launch failed:', e)
      }
    },
    onRemoteSurrender,
    onRemoteStateCheck,
    // Remote player returned to lobby — open the lobby modal locally too
    () => {
      pvpMode.value = false
      gamePvpMode.value = false
      pvpModalOpen.value = true
      coinsAwarded.value = false
      initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
    }
  )

  // Wire local launch events → PvP network
  setOnLocalLaunch((bladeIndex, ax, ay) => {
    pvpSendLaunch(bladeIndex, ax, ay)
  })

  // Wire state-hash callback → PvP network + local desync detection
  setOnStateHash((hash, turn) => {
    localHashes.set(turn, hash)
    pvpSendStateCheck(hash, turn)
    checkDesync(turn)
  })

  updateSpeedBoost()
  speedBoostIntervalId = window.setInterval(updateSpeedBoost, 1000)

  // CrazyGames `gameplayStart` / `gameplayStop` are driven reactively by
  // the `isGameplayActive` watcher above (battle phase + no blocking modal).
  // `stopGameplay()` in onUnmounted below remains as a defensive cleanup
  // for the case the player navigates away mid-match.
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
  stopPhysics()
  if (renderRafId !== null) cancelAnimationFrame(renderRafId)
  if (canvasObserver) {
    canvasObserver.disconnect()
    canvasObserver = null
  }
  if (speedBoostIntervalId !== null) clearInterval(speedBoostIntervalId)
  // Always leave the arena at normal speed so other views aren't affected
  simSpeed.value = 1

  stopGameplay()

  setOnLocalLaunch(null)
  // Clean up PvP if active
  if (pvpMode.value || pvpStatus.value !== 'idle') {
    leavePvP()
    pvpMode.value = false
  }
})
</script>

<template lang="pug">
  div.arena.relative.w-screen.overflow-hidden.flex.items-center.justify-center(
    class="bg-[#0d1117] h-screen h-dvh"
  )
    //- Game Canvas
    //- Screen-shake transform lives ONLY on the canvas, not on .arena, so
    //- the HUD's `position: fixed` buttons stay anchored to the real viewport.
    //- Putting a `transform` on .arena would promote it to a containing block
    //- for fixed descendants, and `overflow-hidden` would then clip them.
    canvas(
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerLeave"
      @pointerleave="onPointerLeave"
      class="block touch-none"
      :style="shakeStyle"
    )
    //- Joystick overlay — sits above the HUD so the stat card never covers
    //- it. Pointer-events stay on the main canvas; this layer is purely
    //- visual.
    canvas(
      ref="joystickCanvasRef"
      class="fixed inset-0 pointer-events-none z-[20]"
    )

    //- HUD Overlay
    div.absolute.inset-0.pointer-events-none

      //- Top bar: stage + coins
      //- safe-area-inset-* keeps the row clear of the iPhone notch /
      //- Dynamic Island and (in landscape) the side cutouts when running as
      //- a standalone PWA with viewport-fit=cover.
      div.flex.justify-between.items-start(
        class="p-2 sm:p-2"
        :style="{\
          paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Stage indicator (fancy themed badge) — hidden during ghost fights and PvP
        StageBadge(
          v-if="!ghostMode && !pvpMode"
          :stage-id="currentStageId"
          :name="currentStage.name"
          :cycle-suffix="currentStage.cycleSuffix"
          :is-boss="currentStage.isBoss"
          :arena-type="currentStage.arenaType"
        )
        //- Spacer to keep coins right-aligned when StageBadge is hidden
        div(v-else)
        //- Coin counter + Chest + Surrender
        div.flex.items-start.gap-2
          //- Surrender icon — visible only during active battle
          SurrenderIcon(
            v-if="isBattleActive"
            @surrender="onSurrender"
            @open-change="surrenderModalOpen = $event"
          )
          div.flex.flex-col.items-end.gap-2
            CoinBadge(ref="coinBadgeRef")
            //- Single chest with a dual reward window (25c after 3 min,
            //- 100c after 10 min). Replaces the previous mini+big chest
            //- pair. Hidden during PvP.
            TreasureChest(v-if="!pvpMode" :target-el="coinBadgeEl")

      //- Center overlay messages
      div.absolute.flex.items-center.justify-center(class="inset-0 z-[10]")

        //- Tap to Start
        div(
          v-if="phase === 'tap_to_start'"
          class="text-center pointer-events-auto cursor-pointer"
          @click="beginBattle"
        )
          div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(
            class="text-3xl sm:text-5xl mb-2"
          ) {{ t('spinner.tapToStart') }}
          div.text-white.italic.game-text(class="text-sm sm:text-lg opacity-60")
            | {{ t('spinner.startHint') }}

        //- Every-10th-game countdown — rendered inside the meteor shower ring
        div(
          v-else-if="phase === 'meteor_intro' && countdownText"
          class="text-center"
        )
          div.countdown-number.font-black.game-text.text-white(
            :key="countdownText"
            class="text-7xl sm:text-9xl"
          ) {{ countdownText }}

        //- Turn Announcement
        div(
          v-else-if="phase === 'deciding_turn' && turnAnnouncement"
          class="text-center"
        )
          div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(
            class="text-2xl sm:text-4xl"
          ) {{ turnAnnouncement }}

        //- Opponent's turn label (PvP only — shown at top so player knows to wait)
        div(
          v-else-if="pvpMode && (phase === 'npc_turn' || phase === 'npc_launched')"
          class="absolute text-center top-4 left-0 right-0"
          :style="{ top: `calc(1rem + env(safe-area-inset-top, 0px))` }"
        )
          span.font-black.uppercase.tracking-wider.animate-pulse.game-text(
            class="text-lg sm:text-2xl text-yellow-300"
            style="text-shadow: 2px 2px 0 #000, -1px -1px 0 #000"
          ) {{ t('pvp.opponentTurn') }}

        //- Player turn hint
        div(
          v-else-if="phase === 'player_turn'"
          class="absolute text-center"
          :style="{ bottom: `calc(4rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)` }"
        )
          div.text-white.italic.game-text(class="text-xs sm:text-sm opacity-50")
            | {{ t('spinner.dragHint') }}

      //- Blade Stats HUD — bottom corners during active battle
      div(
        v-if="isBattleActive && bladeStats.length > 0"
        class="fixed bottom-0 left-0 right-0 flex justify-between pointer-events-none z-[5]"
        :style="{\
          paddingBottom: `calc(0.375rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          paddingLeft: 'calc(0.375rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.375rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        div(
          v-for="(bs, idx) in bladeStats"
          :key="bs.id"
          class="blade-stat-card"
          :class="{ 'blade-stat-dead': bs.dead }"
          :style="{\
            transform: `scale(${uiStatScale})`,\
            transformOrigin: idx === 0 ? 'bottom left' : 'bottom right'\
          }"
        )
          div.blade-stat-label.game-text {{ t('spinner.spinnerLabel', { n: idx + 1 }) }}
          div.blade-stat-grid
            div.blade-stat-row
              IconHp.blade-stat-icon.text-green-400
              span.text-green-400 {{ bs.hp }}
            div.blade-stat-row
              IconAttack.blade-stat-icon.text-red-400
              span.text-red-400 {{ bs.atk.toFixed(1) }}
            div.blade-stat-row
              IconDefense.blade-stat-icon.text-purple-400
              span.text-purple-400 {{ bs.def.toFixed(1) }}
            div.blade-stat-row
              IconSpeed.blade-stat-icon.text-cyan-400
              span.text-cyan-400 {{ bs.spd.toFixed(1) }}

      //- Bottom-left column: mute → settings → daily/ad/battlepass row
      div(
        v-if="showConfigButton && !showReward && !showConfigSpotlight"
        class="ui-stack-bl fixed pointer-events-auto z-50 flex flex-col items-start gap-1"
        :style="{\
          bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          left: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          transform: `scale(${uiBtnScale})`,\
          transformOrigin: 'bottom left'\
        }"
      )
        FMuteButton
        FIconButton(
          class="sm:mb-4"
          type="secondary"
          size="md"
          :img-src="prependBaseUrl('images/icons/gears_128x128.webp')"
          @click="showOptions = true"
        )
        div.flex.items-end(class="gap-0 sm:gap-2")
          DailyRewards(v-if="currentStageId >= 3" @coins-awarded="fireCoinExplosion")
          AdRewardButton(
            v-if="currentStageId >= 3"
            @coins-awarded="fireCoinExplosion"
          )
          BattlePass(v-if="currentStageId >= 6" @coins-awarded="fireCoinExplosion")

      //- Bottom-right buttons — two stacked rows:
      //-   row 1: 1x/2x speed switch
      //-   row 2: pvp → leaderboard → team config
      div(
        v-if="showConfigButton && !showReward"
        class="ui-stack-br fixed pointer-events-auto flex flex-col items-end gap-2"
        :class="showConfigSpotlight ? 'z-[60]' : 'z-50'"
        :style="{\
          bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          right: 'calc(0.5rem + env(safe-area-inset-right, 0px))',\
          transform: `scale(${uiBtnScale})`,\
          transformOrigin: 'bottom right'\
        }"
      )
        //- Skin chest timer (20h cycle) sits ABOVE the speed switch so
        //- the timer doesn't compete for attention with the top-bar
        //- treasure chest. Skin preview on the LEFT, countdown on the
        //- RIGHT, timer text in a soft warm-orange so it reads as
        //- "passive cooldown" rather than urgent.
        //- Gated to stage ≥ 3 — same onboarding-pace rationale as the
        //- 1x/2x switch above. Brand-new players (stage 1-2) shouldn't
        //- see a passive 20-hour skin-chest timer before they've even
        //- internalised the basic loop and the daily-rewards cycle.
        SkinChestTimer(
          v-if="!pvpMode && !showConfigSpotlight && currentStageId >= 3"
          @collected="onSkinChestCollected"
        )

        //- Row 1: speed switch (hidden during spotlight)
        //- Hidden until stage ≥ 2 — the speed-up is a stretch reward,
        //- not part of the brand-new-player onboarding (it would crowd
        //- the bottom-right HUD before the player has even completed
        //- their first match).
        FButtonSwitch.speedup-switch.scale-90(
          v-if="currentStageId >= 2 && (isRewardedReady || is2xAvailable) && !showConfigSpotlight"
          class="sm:scale-100"
          :model-value="simSpeed"
          :options="[{ value: 1 }, { value: 2 }]"
          @click="onSpeedSwitchClick"
        )
          template(#default="{ option }") {{ option.value }}x
          template(#hint="{ option }")
            //- Movie hint icon — only under the 2x button when boost not yet earned
            img.absolute.object-contain.pointer-events-none(
              v-if="option.value === 2 && simSpeed === 1 && !is2xAvailable"
              src="/images/icons/movie_128x96.webp"
              class="right-0 top-1/2 -translate-y-[50%] h-3 w-3 mr-1.5"
            )

        //- Row 2: pvp → leaderboard → team
        div.flex.items-end(class="gap-0 sm:gap-1")
          PvPButton(
            v-if="canShowPvP && !ghostMode && !pvpMode && currentStageId >= 2 && !showConfigSpotlight"
            @click="pvpModalOpen = true"
          )
          FakeLeaderBoard(
            v-if="currentStageId >= 5 && !ghostMode && !showConfigSpotlight"
            @fight="onGhostFight"
          )
          FIconButton(
            v-if="hasFirstWin || currentStageId >= 2"
            type="secondary"
            :class="{ 'instant-bounce': showConfigSpotlight }"
            size="md"
            :img-src="prependBaseUrl('images/icons/team_128x128.webp')"
            @click="onOpenConfig"
          )

    //- First-config spotlight — darkens everything except the team button
    Transition(name="fade")
      div.config-spotlight(
        v-if="showConfigSpotlight"
        @click.self=""
      )

    //- Reward Overlay
    FReward(
      v-model="showReward"
      :show-continue="true"
      @continue="onRewardContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl" :class="{ 'sm:text-2xl': !isMobileLandscape && !isMobilePortrait }") {{ pvpMode ? t('pvp.title') : t('spinner.rewards') }}
      div.flex.flex-col.items-center.gap-4
        div.font-black.uppercase.tracking-wider.game-text(
          class="text-3xl sm:text-5xl"
          :class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'"
        ) {{ resultText }}
        //- PvP rewards: coins + honor points
        template(v-if="pvpMode")
          div.flex.items-center.gap-3(ref="rewardCoinRef")
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ PVP_COIN_REWARD }}
          div.honor-reward.flex.items-center.gap-2(v-if="lastHonorEarned > 0")
            span.text-purple-300.font-black.game-text(class="text-xl sm:text-2xl") +{{ lastHonorEarned }}
            span.text-purple-400.font-bold.game-text.uppercase(class="text-sm sm:text-lg") {{ t('pvp.honor') }}
        //- Campaign / leaderboard rewards
        template(v-else)
          div.flex.items-center.gap-3(ref="rewardCoinRef")
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ rewardAmount }}

    //- Boss Roulette Overlay (wheel spinning)
    FReward(
      v-model="showRoulette"
      :show-continue="false"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('spinner.rewards') }}
      div.flex.flex-col.items-center.gap-4
        div.font-black.uppercase.tracking-wider.game-text.text-green-400(
          class="text-3xl sm:text-5xl"
        ) {{ resultText }}
        RouletteWheel(@result="onRouletteResult")

    //- Roulette Reward Celebration
    FReward(
      v-model="showRouletteReward"
      :show-continue="rouletteRewardReady"
      @continue="onRouletteRewardContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('spinner.rewards') }}
      div.flex.flex-col.items-center.gap-6.roulette-reward-enter
        //- Skin reward
        template(v-if="rouletteSkinResult?.skin")
          div.roulette-reward-glow.flex.flex-col.items-center.gap-3
            img.object-contain.drop-shadow-lg(
              :src="modelImgPath(rouletteSkinResult.skin.modelId)"
              class="w-24 h-24 sm:w-32 sm:h-32"
            )
            span.text-purple-300.font-black.game-text.uppercase(class="text-xl sm:text-3xl") {{ t(`skins.${rouletteSkinResult.skin.modelId}`) }}
          div.flex.items-center.gap-3(ref="rouletteRewardCoinRef")
            IconCoin(class="w-6 h-6 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-xl sm:text-2xl") +{{ rewardAmount }}
        //- Coin multiplier reward
        template(v-else)
          div.roulette-reward-glow.flex.flex-col.items-center.gap-2
            span.text-yellow-300.font-black.game-text(class="text-5xl sm:text-7xl") {{ rouletteMultiplier }}x
          div.flex.items-center.gap-3(ref="rouletteRewardCoinRef")
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-3xl sm:text-5xl") +{{ Math.round(rewardAmount * rouletteMultiplier) }}

    //- 20h Skin Chest reward
    FReward(
      v-model="showSkinChestReward"
      :show-continue="true"
      @continue="onSkinChestRewardContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('spinner.rewards') }}
      div.flex.flex-col.items-center.gap-6.roulette-reward-enter(v-if="skinChestReward")
        div.roulette-reward-glow.flex.flex-col.items-center.gap-3
          img.object-contain.drop-shadow-lg(
            :src="modelImgPath(skinChestReward.modelId)"
            :class="skinChestReward.isSpecial ? 'w-32 h-32 sm:w-40 sm:h-40' : 'w-24 h-24 sm:w-32 sm:h-32'"
          )
          span.font-black.game-text.uppercase(
            :class="skinChestReward.isSpecial ? 'text-yellow-300 text-2xl sm:text-4xl' : 'text-purple-300 text-xl sm:text-3xl'"
          ) {{ t('skinChest.acquired', { name: t(`skins.${skinChestReward.modelId}`) }) }}

    //- Options Modal
    OptionsModal(
      :is-open="showOptions"
      @close="showOptions = false"
    )

    //- Config Modal
    SpinnerConfigModal(
      v-model="configModalOpen"
      :initial-team="playerTeam"
      @save="onConfigSave"
    )

    //- PvP Lobby Modal
    PvPLobbyModal(
      :is-open="pvpModalOpen"
      @close="pvpModalOpen = false"
    )

    //- Enemy Surrender Notification
    FModal(
      :model-value="showEnemySurrender"
      @update:model-value="showEnemySurrender = $event"
      :is-closable="false"
      :title="t('pvp.title')"
    )
      div.flex.flex-col.items-center.gap-4.py-4
        div.text-white.font-black.uppercase.tracking-wider.game-text(class="text-xl sm:text-3xl") {{ t('pvp.enemySurrendered') }}
        button.rounded-xl.font-black.uppercase.tracking-wider.game-text.cursor-pointer.transition-all(
          class="px-8 py-3 text-lg sm:text-xl bg-gradient-to-b from-green-500 to-green-700 border-2 border-green-300 text-white hover:from-green-400 hover:to-green-600 active:scale-95"
          @click="showEnemySurrender = false"
        ) {{ t('pvp.okay') }}

</template>

<style scoped lang="sass">
// ── First-Config Spotlight ──────────────────────────────────────────────
.config-spotlight
  position: fixed
  inset: 0
  z-index: 55
  background: rgba(0, 0, 0, 0.65)
  pointer-events: auto

.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

// ── Roulette Reward Celebration ─────────────────────────────────────────
.roulette-reward-enter
  animation: roulette-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)

.roulette-reward-glow
  animation: roulette-glow 2s ease-in-out infinite
  filter: drop-shadow(0 0 16px rgba(255, 200, 50, 0.6))

@keyframes roulette-pop
  0%
    opacity: 0
    transform: scale(0.3)
  100%
    opacity: 1
    transform: scale(1)

@keyframes roulette-glow
  0%, 100%
    filter: drop-shadow(0 0 16px rgba(255, 200, 50, 0.6))
  50%
    filter: drop-shadow(0 0 32px rgba(255, 180, 50, 0.9))

.speedup-switch
  :deep(.button-wrap:last-of-type button)
    margin-right: 0.5rem

.animate-pulse
  animation: pulse 2s ease-in-out infinite

@keyframes pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.5


.countdown-number
  display: inline-block
  text-shadow: 0 0 24px rgba(255, 200, 0, 0.85), 0 0 6px rgba(255, 255, 255, 0.6), 0 4px 0 #000
  animation: countdown-pop 375ms ease-out forwards
  will-change: transform, opacity

@keyframes countdown-pop
  0%
    transform: scale(0.4)
    opacity: 0
  20%
    transform: scale(1)
    opacity: 1
  100%
    transform: scale(2.6)
    opacity: 0

// ── Honor Reward Shine ───────────────────────────────────────────────────
.honor-reward
  position: relative
  overflow: hidden
  padding: 0.25rem 0.75rem
  border-radius: 8px
  background: rgba(168, 85, 247, 0.12)

  &::after
    content: ''
    position: absolute
    top: 0
    left: -100%
    width: 60%
    height: 100%
    background: linear-gradient(105deg, transparent 30%, rgba(216, 180, 254, 0.35) 50%, transparent 70%)
    animation: honor-shine 2.4s ease-in-out infinite

@keyframes honor-shine
  0%
    left: -100%
  60%
    left: 160%
  100%
    left: 160%

// ── Blade Stats HUD ──────────────────────────────────────────────────────
.blade-stat-card
  background: rgba(0, 0, 0, 0.55)
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 6px
  padding: 0.2rem 0.4rem
  backdrop-filter: blur(4px)
  transition: opacity 0.3s ease

.blade-stat-dead
  opacity: 0.35

.blade-stat-label
  font-size: 0.6rem
  font-weight: 800
  text-transform: uppercase
  letter-spacing: 0.04em
  color: rgba(255, 255, 255, 0.7)
  text-align: center
  line-height: 1
  margin-bottom: 0.15rem
  text-shadow: 1px 1px 0 #000

.blade-stat-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0 0.35rem

.blade-stat-row
  display: flex
  align-items: center
  gap: 0.15rem
  font-size: 0.65rem
  font-weight: 700
  line-height: 1.3

.blade-stat-icon
  width: 0.65rem
  height: 0.65rem
  flex-shrink: 0

@media (min-width: 640px)
  .blade-stat-card
    padding: 0.25rem 0.5rem
  .blade-stat-label
    font-size: 0.7rem
  .blade-stat-grid
    gap: 0 0.4rem
  .blade-stat-row
    font-size: 0.75rem
    gap: 0.2rem
  .blade-stat-icon
    width: 0.75rem
    height: 0.75rem

</style>
