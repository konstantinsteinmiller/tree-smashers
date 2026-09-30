<script lang="ts">
// ─── Build-only UI, picked at module scope ─────────────────────────────────
// A template `v-if` on the build flag does NOT drop the dead branch: an
// imported constant compiles to `unref(FLAG)`, and even a plain `const` is
// not folded by Rollup inside this render function, so both branches (and
// every component they render) shipped in every build. A module-scope ternary
// on the `import.meta.env`-derived flag does fold: the unused component is
// never referenced, so its module drops out of the bundle.
import { HAS_REWARDED_ADS as ADS_BUILD_FLAG } from '@/platforms/rewardedAdsBuild'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import RewardedAdButton from '@/components/organisms/RewardedAdButton.vue'
import SpeedCoinBadge from '@/components/atoms/SpeedCoinBadge.vue'

/** "[movie] +N [coin]" HUD button — ad builds only. */
const HudCoinsAdButton = ADS_BUILD_FLAG ? AdRewardButton : null
/** "[movie] 3x [coin]" win-screen button — ad builds only. */
const WinCoinsAdButton = ADS_BUILD_FLAG ? RewardedAdButton : null
/** 100-coin price sticker on the 2x switch — builds without rewarded ads only. */
const SpeedBoostCoinBadge = ADS_BUILD_FLAG ? null : SpeedCoinBadge
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick, defineAsyncComponent, h } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FModal from '@/components/molecules/FModal.vue'
import FReward from '@/components/atoms/FReward.vue'
import SpinnerConfigModal from '@/components/organisms/SpinnerConfigModal.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import CombatLog from '@/components/organisms/CombatLog.vue'
import useSounds, { useMusic } from '@/use/useSound'
import useSpinnerGame, {
  ARENA_RADIUS,
  BLADE_RADIUS,
  MAX_PULL_DISTANCE,
  simSpeed,
  countdownText
} from '@/use/useSpinnerGame'
import { seedMatchRng } from '@/use/useDeterministicRng'
import { STAGE_KEY } from '@/keys'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSpinnerCampaign, { noteCampaignBossLoss, noteCampaignBossWin, getStageById } from '@/use/useSpinnerCampaign'
import useTips from '@/use/useTips'
import type { TipId } from '@/use/useTips'
import TipBadge from '@/components/atoms/TipBadge.vue'
import { useHint } from '@/use/useHint'
import { useDragHintPlacement } from '@/use/useDragHintPlacement'
import { useFitText } from '@/use/useFitText'
import { useScreenshake } from '@/use/useScreenshake'
import { noteRenderFrame, setQualityMonitoring } from '@/use/useQuality'
import type { SpinnerConfig } from '@/types/spinner'
import useUser, { isMobileLandscape, isMobilePortrait, isDailyChallengeEnabled } from '@/use/useUser'
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
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import ChallengeIcon from '@/components/organisms/ChallengeIcon.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import useDailyChallenge from '@/use/useDailyChallenge'
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
import useLeaderboard, { playerMaxStage, type LeaderboardEntry } from '@/use/useLeaderboard'
import LeaderboardModal from '@/components/organisms/LeaderboardModal.vue'
import RankBadge from '@/components/atoms/RankBadge.vue'
import BossPeekBadge from '@/components/atoms/BossPeekBadge.vue'
import { getBossPeek, battleModeOf, type BossPeek } from '@/use/bossPeek'
import { shouldShowBossDefeated } from '@/use/bossDefeated'
import BossDefeatedBanner from '@/components/atoms/BossDefeatedBanner.vue'
import { leaderboardVisible, reportRun } from '@/use/useLiveLeaderboard'
import { triggerHappytime } from '@/use/useCrazyGames'
import { syncGameplayLifecycle, stopGameplayLifecycle } from '@/use/useGameplayLifecycle'
import { isSingleCurrency, displayDiamondReward } from '@/use/useCurrency'
import { isRewardedReady, isInterstitialReady, showRewardedAd, showMidgameAd } from '@/use/useAds'
import { hasAnyFreeSpeedGift, claimFreeSpeedBoost, refreshFreeSpeedGiftDay } from '@/use/useFreeSpeedGift'
import { DAILY_SPEED_GIFT_DURATION_MS } from '@/use/speedGiftGate'
import {
  IS_COIN_SPEED_BOOST_BUILD,
  handleSpeedSwitchTap,
  isSpeedBoostUnaffordable,
  isSpeedSwitchOffered
} from '@/use/speedBoostPurchase'
import useBottomSafe from '@/use/useBottomSafe'
import { getSelectedSkin, modelImgPath } from '@/use/useModels'
import useAssets from '@/use/useAssets'
import { spawnCoinExplosion, flyDiamondsToBadge, type CurrencyBadgeTargets } from '@/use/useCoinExplosion'
import useCheats from '@/use/useCheats'
import { cheatRouletteSignal } from '@/use/useCheats'
import RouletteWheel from '@/components/organisms/RouletteWheel.vue'
import type { RouletteResult } from '@/components/organisms/RouletteWheel.vue'
import { preloadRouletteArt } from '@/use/useRouletteArt'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import { showsWinCoinsAd } from '@/use/winCoinsAd'
import { rouletteGrantFor, type RouletteGrant } from '@/use/rouletteGrants'
import {
  introPlaying,
  introRevealArena,
  armIntro,
  noteIntroBattleStarted,
  finishIntro
} from '@/use/useIntroCutscene'
import { loadIntroCutscene } from '@/use/introCutsceneLoader'

useCheats()

// ─── First-launch intro cutscene ───────────────────────────────────────────
// Its own chunk, downloaded only when the gate says PLAY — a returning player
// never fetches it. See `useIntroCutscene.ts`; the import itself lives in
// `introCutsceneLoader.ts` (obfuscator-safe).
//
// Deliberately NOT prefetched during the loader: measured on the production
// build, fetching + evaluating the chunk while the splash was up made a
// first-timer's loader ~250 ms slower (blocking just that request brought it
// back to a returning player's time). Instead the chunk loads the moment the
// intro starts, behind a black cover — the cutscene opens with a fade from
// black anyway, so the hand-off is seamless.
//
// If the chunk cannot load (offline, blocked), the intro is skipped rather
// than left "playing" over an arena whose render loop is parked under it.
const IntroCutscene = defineAsyncComponent({
  loader: loadIntroCutscene,
  loadingComponent: { render: () => h('div', { class: 'fixed inset-0 bg-black z-[90]', 'aria-hidden': 'true' }) },
  delay: 0,
  timeout: 10_000,
  onError: (err, _retry, fail) => {
    console.warn('[intro] cutscene failed to load — skipping it', err)
    finishIntro()
    fail()
  }
})

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
  startPhysics,
  stopPhysics,
  disposePhysics,
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

const {
  playerTeam,
  coins: walletCoins,
  hasFirstWin,
  saveTeam,
  addCoins,
  addDiamonds,
  markFirstWin
} = useSpinnerConfig()
const {
  hasWonToday: dailyWonToday,
  canPlayToday: dailyCanPlay,
  generateChallenge,
  recordAttempt: recordDailyAttempt,
  markDailyChallengeWon
} = useDailyChallenge()
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

// ─── Global leaderboard ──────────────────────────────────────
//
// The board's SCORE is the deepest campaign stage ever reached — a lifetime
// best that only ever grows, which is what `useLiveLeaderboard`'s "post only on
// a personal record" write rule is built on. `playerMaxStage` is the persisted
// high-water mark; `currentStageId` can briefly be ahead of it in the frame
// between `advanceStage()` and `recordPlayerStage()`, so take the larger.
const leaderboardModalOpen: Ref<boolean> = ref(false)
const bestStage = computed(() => Math.max(currentStageId.value, playerMaxStage.value))

/** The board's tie-break column: summed upgrade levels across the whole
 *  roster. Monotonic (upgrades never refund) and it is what actually separates
 *  two players sitting on the same stage. */
const teamPower = computed(() => {
  const { tops, bottoms } = playerUpgrades.value
  let sum = 0
  for (const level of Object.values(tops)) if (Number.isFinite(level)) sum += level
  for (const level of Object.values(bottoms)) if (Number.isFinite(level)) sum += level
  return sum
})

/**
 * Post the result, fire-and-forget.
 *
 * `void`, NEVER awaited: the board is a decoration on a game that works without
 * it, and awaiting would put a captive-portal wifi login page between the
 * player and their rewards for the full 6 s timeout. Called once the result
 * overlay is already on screen, from BOTH overlays a battle can end on — the
 * ordinary reward screen and the boss-roulette reward — because a boss win
 * never reaches the first one.
 *
 * WHY THESE ARE THROTTLED CALLS, NOT RUN-END ONES. In this game a battle result
 * is a "clear": a win advances the campaign by exactly one stage, so a player
 * on a good session sets a personal record on nearly every screen. Posting each
 * one would be a write per stage — the quota trap `reportRun`'s
 * `WRITE_MIN_GAP_MS` exists to close. It coalesces instead of dropping: every
 * post carries the CURRENT best, so a skipped one loses nothing and the next
 * carries the higher number. Nothing is lost across a quit either, because the
 * posted-score pointer is persisted and the next session picks it up.
 *
 * A LOSS is the closest thing here to the end of a run — the climb stalled — so
 * it flushes whatever the throttle is still holding. That costs nothing: a loss
 * can never raise the best, so `force` only lifts the gap on a write that an
 * earlier win had already made due.
 */
const reportLeaderboardRun = () => {
  void reportRun(bestStage.value, teamPower.value, { force: gameResult.value === 'lose' })
}

const pvpModalOpen: Ref<boolean> = ref(false)
const pvpMode: Ref<boolean> = ref(false)

const { noteCampaignResult, pickLoseScreenTip, pickWinScreenTip, markTipShown } = useTips()
// Tip shown on the current reward overlay. Picked when the overlay opens
// and (for lose screens with multiple qualifying tips) cycled by
// `tipCycleTimer` so a player lingering on the lose screen sees more than
// one nudge. Cleared in the `showReward` watcher when the overlay closes.
const currentTip: Ref<TipId | null> = ref(null)
// Active pool of qualifying tips for the current overlay (lose-screen
// only). Empty on win screens or when no tip qualifies. Used by the
// cycling timer to step through alternatives at a steady cadence.
let currentTipPool: TipId[] = []
let tipCycleTimer: number | null = null
const TIP_CYCLE_INTERVAL_MS = 6000

const clearTipCycle = () => {
  if (tipCycleTimer !== null) {
    clearInterval(tipCycleTimer)
    tipCycleTimer = null
  }
  currentTipPool = []
}

const { showHint, startHintTimer, clearHint } = useHint(2500)
const { shakeStyle } = useScreenshake()
const { t } = useI18n()
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()

// Wraps startMatch so the battle music kicks in exactly when a fight begins,
// regardless of whether the player tapped the canvas or the start button.
// Also gates the midgame interstitial: when the cadence threshold is met
// the phase parks at 'ad_break' until the ad provider resolves (either the
// ad finished or no fill was returned). Only after that do we kick off
// `startMatch()` and the meteor-shower intro. When no ad is due the
// 'ad_break' phase is skipped entirely.
const beginBattle = async () => {
  // Guard against double-tap: a second tap during the ad_break window
  // should NOT spawn another beginBattle pass. The phase check covers
  // both 'ad_break' (ad in progress) and any later phase (already in
  // gameplay).
  if (phase.value !== 'tap_to_start') return

  if (shouldShowMidgameAdNow()) {
    phase.value = 'ad_break'
    await runMidgameAdBeforeBattle()
    // Restore the phase that startMatch's guard expects, then proceed.
    // The window between this assignment and startMatch's own phase
    // change is synchronous, so the player can't tap into a duplicate
    // beginBattle here.
    phase.value = 'tap_to_start'
  }

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

// ─── Intro cutscene arming ────────────────────────────────────────────────
// Once the player has started ANY fight the intro can only get in the way,
// so a still-undecided gate (cloud save not settled yet) resolves to 'done'.
watch(phase, (p) => {
  if (p !== 'idle' && p !== 'tap_to_start') noteIntroBattleStarted()
})
const { areAllAssetsLoaded: introAssetsReady } = useAssets()
const onIntroDone = () => finishIntro()

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

// Boss peek — "Next boss · Stage N" teaser on the campaign win screen. Set by
// the game-over watcher from the stage the battle was FOUGHT on (before
// `advanceStage()`), so a replayed stage peeks exactly like its first clear.
// null = no badge; the rule lives in `@/use/bossPeek` (unit-tested).
const bossPeek: Ref<BossPeek | null> = ref(null)

// ─── Boss Roulette ──────────────────────────────────────────────────────────
const showRoulette = ref(false)

// Presentation for the diamond payouts this view renders. They keep their
// diamond-denominated source values (the grant path converts); these only
// decide what the reward screen SAYS. The roulette jackpot is rendered per
// grant with `displayDiamondReward` in the template.
const dailyBonus = displayDiamondReward(1)
const pendingBossReward = ref(false)
// "BOSS DEFEATED" title card between the boss kill and the roulette.
const showBossDefeated = ref(false)
const onBossDefeatedDone = () => {
  if (!showBossDefeated.value) return
  showBossDefeated.value = false
  // A reset / mode switch while the card was up cleared the pending reward —
  // then there is no roulette to open.
  if (pendingBossReward.value) showRoulette.value = true
}
const showRouletteReward = ref(false)
const rouletteRewardReady = ref(false) // tap-to-continue unlocked
// Every roulette result granted this boss win, in spin order: the first spin,
// plus the "Spin Again" respin when the player watched the ad. The respin is
// an ADDITIONAL reward — both are granted and both are shown.
const rouletteGrants: Ref<RouletteGrant[]> = ref([])

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

// ─── Win-screen "3x coins" ad ───────────────────────────────────────────────
// Coins the ordinary result screen granted, snapshotted in the game-over
// watcher BEFORE `advanceStage()` — after it `rewardAmount` already reads the
// NEXT stage's reward, so binding the label to it showed a number the player
// was never paid. The label and the 3x ad both anchor to this.
const grantedCoins = ref(0)
// Coins the 3x ad added on the current result screen (0 until it pays).
const winAdExtra = ref(0)
// A 3x ad is in flight: hold tap-to-continue so a stray tap can neither
// close the screen under the ad nor start the next battle (and its
// interstitial) while the rewarded flow is still running.
const winAdBusy = ref(false)
// The last result was a campaign BOSS win (roulette path). Such a win never
// reaches the ordinary win screen; this keeps the 3x button off it even if a
// future flow sends one there — the roulette already carries its own ad.
const lastWinWasBoss = ref(false)
const winAdBaseCoins = computed(() => {
  if (pvpMode.value) return PVP_COIN_REWARD
  if (dailyChallengeMode.value) return dailyCoinReward.value
  return grantedCoins.value
})
const showWinCoinsAd = computed(() => showsWinCoinsAd({
  adsBuild: HAS_REWARDED_ADS,
  result: gameResult.value,
  bossWin: lastWinWasBoss.value,
  baseCoins: winAdBaseCoins.value
}))
const onWinAdCoins = (sourceEl: HTMLElement, extra: number) => {
  winAdExtra.value = extra
  fireCoinExplosion(sourceEl)
}
const onWinAdBusy = (busy: boolean) => {
  winAdBusy.value = busy
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

// "In gameplay" means the physics loop is actually advancing the match — one
// of the live battle phases AND no blocking modal (reward, roulette reward,
// skin chest, surrender prompt) on top. The watcher below publishes it to
// every portal through `syncGameplayLifecycle`.
//
// This used to call `startGameplay`/`stopGameplay` straight from
// `@/use/useCrazyGames`, so CrazyGames got the signal and nobody else did —
// including Playgama, whose wrappers were written and never called. Portals
// with per-platform rules about this edge (Poki forbids a `gameplayStart()`
// that no player asked for) enforce them inside their own plugin; this
// watcher's job is to report the honest state of the game.
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

// A build that deliberately paints below the auto-downgrade threshold (see
// FPS_CAP further down) would make every device read as "too slow" — detection
// measures the rate we CHOSE to draw at, so it only means anything above the
// threshold. Read here rather than from FPS_CAP because this watcher runs
// immediately, before that constant is initialised.
const qualityDetectionAllowed = (() => {
  const cap = Number(import.meta.env.VITE_APP_FPS_CAP) || 0
  return cap === 0 || cap > 30
})()

watch(isGameplayActive, (active) => {
  syncGameplayLifecycle(active)
  // Only frames drawn during an actual fight may decide the render-quality
  // tier. Menus, reward screens and the roulette have a completely different
  // (much cheaper) frame cost and would wash the measurement out.
  setQualityMonitoring(active && qualityDetectionAllowed)
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

const onSurrender = () => {
  stopPhysics()
  clearBattleVfx()
  stopBattleMusic()
  if (pvpMode.value) {
    // Notify opponent, then force a loss game-over
    pvpSendSurrender()
    gameResult.value = 'lose'
    phase.value = 'game_over'
    return
  }
  // Surrendering a special mode (ghost / daily challenge) returns to the
  // campaign — clear those mode flags FIRST so their HUD comes back (the
  // StageBadge and, for daily, the ChallengeIcon, whose v-if depends on
  // !dailyChallengeMode). Without this the icon stayed hidden until reload.
  ghostMode.value = false
  ghostEnemy.value = null
  dailyChallengeMode.value = false
  dailyDiamondEarned.value = false
  dailyCoinReward.value = 0
  // Campaign surrender re-inits the same stage directly (no reward modal →
  // no `onRewardContinue` → no automatic counter bump). Count the surrender
  // as a battle attempt for interstitial cadence — otherwise a player who
  // repeatedly surrenders never sees the midgame ad. The actual ad fires
  // before the next battle's meteor-shower intro (`shouldShowMidgameAdNow`
  // check in `beginBattle`).
  incrementAdCounter()
  // Re-init the (now campaign) stage with no rewards — player stays on current stage
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

// This view owns two persisted refs of its own — the first-config
// spotlight flag and the 2x boost expiry — so it needs the same
// save-data re-read every composable does: for a recovered cloud
// hydrate, and for the full-progress reset, which wipes both keys
// without reloading the page (see useResetProgress).
watch(saveDataVersion, () => {
  hasOpenedConfig.value = localStorage.getItem(CONFIG_OPENED_KEY) === '1'
  speedBoostExpiresAt.value = parseInt(localStorage.getItem(SPEED_BOOST_KEY) || '0', 10)
})

const speedNow: Ref<number> = ref(Date.now())

const is2xAvailable = computed(() => speedNow.value < speedBoostExpiresAt.value)

const updateSpeedBoost = () => {
  speedNow.value = Date.now()
  refreshFreeSpeedGiftDay()
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
  // Tap rules live in speedBoostPurchase.ts: a running boost just flips the
  // sim; else a free gift (first-time full length / daily 1 minute, every
  // build); else a coin buy on builds without rewarded ads; else the
  // rewarded ad.
  handleSpeedSwitchTap(value, {
    isBoostActive: () => is2xAvailable.value,
    setSpeed: (v) => {
      simSpeed.value = v
    },
    claimFree: claimFreeSpeedBoost,
    grant: (kind) => grantSpeedBoost(kind === 'daily' ? DAILY_SPEED_GIFT_DURATION_MS : SPEED_BOOST_DURATION_MS),
    showAd: () => {
      void triggerSpeedBoostAd()
    },
    coins: () => walletCoins.value,
    spendCoins: (amount) => addCoins(-amount)
  })
}

// Whether the 2x switch has anything to offer (see speedBoostPurchase.ts).
const speedSwitchOffered = computed(() => isSpeedSwitchOffered({
  rewardedReady: isRewardedReady.value,
  boostActive: is2xAvailable.value,
  freeGift: hasAnyFreeSpeedGift.value
}))

// Coin build only: the price can't be paid and no free gift is on offer —
// the 2x button shows disabled.
const speedBoostUnaffordable = computed(() => isSpeedBoostUnaffordable({
  coins: walletCoins.value,
  boostActive: is2xAvailable.value,
  freeGift: hasAnyFreeSpeedGift.value
}))

const grantSpeedBoost = (durationMs: number = SPEED_BOOST_DURATION_MS) => {
  speedBoostExpiresAt.value = Date.now() + durationMs
  localStorage.setItem(SPEED_BOOST_KEY, String(speedBoostExpiresAt.value))
  simSpeed.value = 2
}

// Shows a rewarded video via the active ad provider (ad builds only — a
// no-ad build buys the boost for coins instead). On successful completion
// we unlock the 2x speed boost for SPEED_BOOST_DURATION_MS and flip the
// sim to 2x immediately so the reward is felt right away.
const triggerSpeedBoostAd = async () => {
  const ok = await showRewardedAd({ kind: 'speed' })
  if (!ok) return
  grantSpeedBoost()
}

// Reference to the CoinBadge component — TreasureChest reads its `rootEl`
// for the fly-to-badge VFX target.
const coinBadgeRef = ref<CurrencyBadgeTargets | null>(null)
const coinBadgeEl = computed(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)
const rewardDiamondRef = ref<HTMLElement | null>(null)
const rewardDailyCoinRef = ref<HTMLElement | null>(null)
// One amount row per granted roulette spin (first spin, then the respin).
const rouletteRewardRowRefs = ref<HTMLElement[]>([])
const setRouletteRowRef = (el: unknown, i: number) => {
  if (el instanceof HTMLElement) rouletteRewardRowRefs.value[i] = el
}

/** Fire coin explosion from any source element toward the HUD coin badge. */
const fireCoinExplosion = (sourceEl: HTMLElement | null) => {
  if (sourceEl && coinBadgeEl.value) {
    spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value })
  }
}

/**
 * Fire a diamond explosion from any source element toward the HUD badge's
 * diamond row — or, while that row is hidden, the badge itself — and pop
 * "+amount" there on arrival (see `flyDiamondsToBadge`).
 *
 * On a single-currency build the payout IS coins, so the burst has to be coins
 * flying to the coin row — a diamond VFX landing on a row that does not exist
 * would be the one place the collapsed economy leaks visually.
 */
const fireDiamondExplosion = (sourceEl: HTMLElement | null, amount: number) => {
  if (!sourceEl) return
  if (isSingleCurrency) {
    fireCoinExplosion(sourceEl)
    return
  }
  flyDiamondsToBadge(sourceEl, coinBadgeRef.value, amount)
}

// ─── Daily Challenge mode ──────────────────────────────────────────────────
// A separate bonus fight (random shape + roster) launched from the menu via
// ChallengeIcon. Mirrors ghostMode: no coins / no stage advance — the reward
// is one diamond on the FIRST win each day.
const dailyChallengeMode = ref(false)
const dailyDiamondEarned = ref(false)
// Coins awarded for a daily-challenge WIN (75% of the current stage's win
// reward, non-boss baseline). 0 on a loss / surrender.
const dailyCoinReward = ref(0)

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

// The drag hint measures the stat cards / combat-log pill and lifts itself
// clear of them (they share its bottom strip; which one it hits depends on
// the spinner count, the HUD scale and the locale).
const dragHintRef = ref<HTMLElement | null>(null)
const { liftPx: dragHintLiftPx } = useDragHintPlacement(dragHintRef, computed(() => phase.value === 'player_turn'))

// The "tap to start" title stays on one line and shrinks to the room between
// the side HUD columns (ru/uk/ro overflow at 568×320 otherwise).
const tapStartTitleRef = ref<HTMLElement | null>(null)
useFitText(tapStartTitleRef, [() => t('spinner.tapToStart')])

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
  if (isJoystickVisible.value && beginJoystickDrag(coords.x, coords.y)) {
    canvasRef.value?.setPointerCapture?.(e.pointerId)
    return
  }
  beginDrag(coords.x, coords.y)
  // Capture the pointer so move/up keep firing on the canvas even when
  // the cursor leaves the game frame — lets players keep aiming smoothly
  // off-canvas and release naturally instead of auto-launching at max.
  if (isDragging.value) canvasRef.value?.setPointerCapture?.(e.pointerId)
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

// Fires on genuine browser-side cancellation (system gesture takeover, OS
// alert, touch interrupted by another finger, etc.). NOT fired when the
// cursor merely leaves the canvas — that case is handled by pointer
// capture set in `onPointerDown`, which keeps `pointermove` / `pointerup`
// streaming to the canvas so players can keep aiming off-frame.
const onPointerCancel = () => {
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
    // Decided FIRST, while `currentStageId` is still the stage just played —
    // every branch below may advance it. Non-campaign modes resolve to null.
    bossPeek.value = getBossPeek({
      wonStageId: currentStageId.value,
      result: gameResult.value,
      mode: battleModeOf({
        pvp: pvpMode.value,
        daily: dailyChallengeMode.value,
        ghost: ghostMode.value,
        cheat: !!cheatStage.value
      })
    })
    playSound(gameResult.value === 'win' ? 'win' : 'lose')
    if (gameResult.value === 'win') spawnMeteorShower(80, 50, 65)
    // A fresh result screen: nothing from the last one's 3x ad carries over.
    lastWinWasBoss.value = false
    winAdExtra.value = 0
    winAdBusy.value = false

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

    // Daily challenge — no stage advance. A win pays coins (75% of the current
    // stage's win reward) on EVERY win, plus 1 diamond on the FIRST win of the
    // day. The coin baseline uses a non-boss stage so a boss stage's reward
    // spike doesn't inflate the daily payout.
    if (dailyChallengeMode.value) {
      if (gameResult.value === 'win') {
        bpAwardLeaderboardWin()
        const baseStage = currentStage.value.isBoss
          ? getStageById(currentStageId.value - 1)
          : currentStage.value
        dailyCoinReward.value = Math.max(0, Math.round(baseStage.rewardWin * 0.75))
        if (dailyCoinReward.value > 0) addCoins(dailyCoinReward.value)
        if (markDailyChallengeWon()) {
          addDiamonds(1)
          dailyDiamondEarned.value = true
        }
      } else if (gameResult.value === 'lose') {
        dailyCoinReward.value = 0
        bpAwardLoss()
      }
      coinsAwarded.value = true
      showReward.value = true
      stopBattleMusic()
      return
    }

    // Boss rubber-banding: count consecutive campaign-boss losses so the
    // next attempt spawns the boss with reduced HP (see
    // bossHpRubberBandMul in useSpinnerCampaign). Win resets the streak.
    // Excludes PvP (already returned above), ghost replays, and cheat
    // stages — only the player's real campaign attempts move the dial.
    if (!ghostMode.value && !cheatStage.value && currentStage.value.isBoss) {
      if (gameResult.value === 'win') noteCampaignBossWin()
      else if (gameResult.value === 'lose') noteCampaignBossLoss()
    }

    // Player tip counters: same-stage loss streak + tanky-setup loss streak.
    // Scoped to real campaign battles (matches the boss rubber-band gating
    // above) so PvP / ghost / cheat runs don't pollute the tip triggers.
    if (!ghostMode.value && !cheatStage.value && gameResult.value) {
      noteCampaignResult(currentStage.value, gameResult.value)
    }

    // Boss win (campaign only) — show roulette before awarding coins
    const isBossWin = gameResult.value === 'win' && !ghostMode.value && currentStage.value.isBoss
    lastWinWasBoss.value = isBossWin === true
    if (isBossWin) {
      // Advance stage + BP immediately, but defer coin award until roulette resolves
      if (!hasFirstWin.value) markFirstWin()
      advanceStage()
      recordPlayerStage(currentStageId.value)
      bpAwardCampaignWin()
      pendingBossReward.value = true
      rouletteGrants.value = []
      // "BOSS DEFEATED" title card first, then the roulette (see
      // onBossDefeatedDone). Everything above is already granted, so the card
      // only delays when the roulette appears — never what the player owns.
      // The midgame interstitial fires before the NEXT battle, so no ad can
      // land between this card and the result screen.
      if (shouldShowBossDefeated({
        result: gameResult.value,
        isBossStage: true,
        mode: battleModeOf({ ghost: ghostMode.value, cheat: !!cheatStage.value })
      })) showBossDefeated.value = true
      else showRoulette.value = true
      stopBattleMusic()
      return
    }

    // Snapshot BEFORE advanceStage() — see `grantedCoins`.
    grantedCoins.value = rewardAmount.value
    addCoins(grantedCoins.value)
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

/**
 * One roulette spin landed: grant it NOW. The wheel emits this the moment a
 * spin stops — before it offers the "Spin Again" ad — so the first reward is
 * in the save before any ad plays, and a respin can only ever ADD a second
 * one. Each spin is emitted exactly once, so each is paid exactly once.
 * (A skin was already granted by the wheel itself through `buySkin`.)
 */
const onRouletteResult = (result: RouletteResult) => {
  // Boss win uses the multiplied reward; a skin pays the 1x coins beside it;
  // the ultra-rare jackpot pays diamonds INSTEAD of coins.
  const grant = rouletteGrantFor(result, rewardAmount.value)
  if (grant.diamonds > 0) addDiamonds(grant.diamonds)
  if (grant.coins > 0) addCoins(grant.coins)
  rouletteGrants.value = [...rouletteGrants.value, grant]
  coinsAwarded.value = true
  pendingBossReward.value = false
}

/** The wheel is finished (no respin, respin declined / unfilled, or the
 *  respin landed): close it and celebrate everything that was granted. */
const onRouletteDone = () => {
  if (!showRoulette.value) return
  showRoulette.value = false
  coinsAwarded.value = true
  pendingBossReward.value = false
  rouletteRewardReady.value = false
  showRouletteReward.value = true
  // A boss win NEVER reaches the ordinary reward overlay — it detours through
  // the roulette — so the board has to be posted from here too. Missing this
  // branch would under-report exactly the runs that advance a player furthest.
  reportLeaderboardRun()
  playSound('happy')
  spawnMeteorShower(60, 40, 50) // warm star burst
  // Signal a "happy moment" to the CrazyGames SDK alongside the reward VFX —
  // the platform uses these events to time featured-game highlights.
  // No-op outside a crazy-web build thanks to the isSdkActive guard inside.
  triggerHappytime()
  // Fire the matching explosion(s) once the overlay renders.
  nextTick(() => {
    rouletteGrants.value.forEach((g, i) => {
      const el = rouletteRewardRowRefs.value[i] ?? null
      if (g.diamonds > 0) fireDiamondExplosion(el, g.diamonds)
      else fireCoinExplosion(el)
    })
  })
  // Enable "tap to continue" after VFX settles
  setTimeout(() => {
    rouletteRewardReady.value = true
  }, 1500)
}

const onRouletteRewardContinue = async () => {
  if (!rouletteRewardReady.value) return
  showRouletteReward.value = false
  rouletteGrants.value = []

  // Boss-win path is campaign-only (never PvP/ghost) and never surrendered,
  // so the counter always ticks. The actual ad fires before the next
  // battle's meteor-shower intro (see `beginBattle`).
  incrementAdCounter()
  coinsAwarded.value = false
  initGame(playerTeamWithUpgrades(), stageNpcTeam(), !hasFirstWin.value, currentStage.value.arenaType, currentStage.value.bouncers ?? 0, currentStageId.value >= 2)
}

// The roulette only opens after a BOSS win, so its painted rim/pointer/hub are
// fetched once the player is on a boss stage — never at boot. Idempotent.
watch(() => currentStage.value.isBoss, (isBoss) => {
  if (isBoss) preloadRouletteArt()
}, { immediate: true })

// Cheat: trigger roulette on demand (same flow as boss win)
watch(cheatRouletteSignal, () => {
  preloadRouletteArt()
  rouletteGrants.value = []
  pendingBossReward.value = false // no coins in cheat mode
  showRoulette.value = true
})

// Coin explosion VFX when the reward overlay appears
watch(showReward, async (show) => {
  // Ad first, overlay up, THEN the board — see `reportLeaderboardRun`.
  if (show) reportLeaderboardRun()
  // Always tear down any prior cycle when the overlay state changes — both
  // closing the overlay and opening a new battle's overlay need to start
  // fresh.
  clearTipCycle()
  if (!show) {
    currentTip.value = null
    return
  }
  // Pick a tip for the campaign result. PvP/ghost/cheat runs don't qualify
  // since their loss counters never advance — keep the overlay clean.
  if (!pvpMode.value && !ghostMode.value && !cheatStage.value) {
    if (gameResult.value === 'lose') {
      const { tip, pool } = pickLoseScreenTip(currentStage.value)
      currentTip.value = tip
      if (tip) markTipShown(tip)
      // If multiple tips qualify, cycle through them every few seconds so
      // a player who lingers on the lose screen sees rotating advice rather
      // than the same nudge frozen on-screen. Single-tip pools stay static.
      if (pool.length > 1 && tip) {
        currentTipPool = pool
        let idx = pool.indexOf(tip)
        tipCycleTimer = window.setInterval(() => {
          idx = (idx + 1) % currentTipPool.length
          const next = currentTipPool[idx]
          if (!next) return
          currentTip.value = next
          markTipShown(next)
        }, TIP_CYCLE_INTERVAL_MS)
      }
    } else {
      currentTip.value = pickWinScreenTip()
    }
  } else {
    currentTip.value = null
  }
  await nextTick()
  // A daily-challenge win bursts coins (the 75% bonus) and, on the first win of
  // the day, also bursts a diamond toward the HUD badge. Everything else
  // bursts coins from the standard reward label.
  if (dailyChallengeMode.value) {
    if (dailyCoinReward.value > 0) fireCoinExplosion(rewardDailyCoinRef.value)
    if (dailyDiamondEarned.value) fireDiamondExplosion(rewardDiamondRef.value, dailyBonus.amount)
  } else {
    fireCoinExplosion(rewardCoinRef.value)
  }
})

// ─── Interstitial cadence ─────────────────────────────────────────────────
// Midgame interstitials fire BEFORE the next battle's meteor-shower intro
// (see `beginBattle` / `maybeShowMidgameAdBeforeBattle`), not after the
// previous battle's reward modal. `battlesSinceAd` tracks completed
// (non-surrendered) battles since the last ad and is incremented in the
// reward-continue handlers below.
//
// First-ad fast-path: a fresh user has counter = 1, so after their first
// battle the counter hits 2 and the first interstitial fires before
// battle 2. After that the threshold reverts to 3 (every 3 battles,
// ghost or campaign).
//
// PvP rematches don't route through `beginBattle` (they handshake straight
// into `initGame` from `pvpRegisterCallbacks`), so PvP players don't see
// pre-match ads — pre-match delays would desync the two clients. The
// counter still increments after a PvP battle, so any backlog is consumed
// on the player's next non-PvP battle.
const AD_BATTLES_KEY = 'ca_battles_since_ad'
const AD_FIRST_KEY = 'ca_first_midgame_ad_shown'

const loadCount = (key: string, defaultVal: number): number => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultVal
    return parseInt(raw, 10) || 0
  } catch {
    return defaultVal
  }
}

const battlesSinceAd: Ref<number> = ref(loadCount(AD_BATTLES_KEY, 1))
const firstMidgameAdShown: Ref<boolean> = ref(
  localStorage.getItem(AD_FIRST_KEY) === '1'
)

const resetAdCounter = () => {
  battlesSinceAd.value = 0
  localStorage.setItem(AD_BATTLES_KEY, '0')
}

const incrementAdCounter = () => {
  battlesSinceAd.value += 1
  localStorage.setItem(AD_BATTLES_KEY, String(battlesSinceAd.value))
}

const markFirstMidgameAdShown = () => {
  firstMidgameAdShown.value = true
  localStorage.setItem(AD_FIRST_KEY, '1')
}

/**
 * Pure predicate — does the current cadence + provider state warrant a
 * midgame ad before the next battle? Split out from `runMidgameAdBeforeBattle`
 * so `beginBattle` can decide whether to enter the 'ad_break' phase at all
 * (no point parking in ad_break if no ad will ever fire).
 *
 * Threshold:
 *   • first ad ever  → 2  (fresh user with counter starting at 1 fires
 *                          before battle 2)
 *   • subsequent ads → 3  (every 3 battles, ghost or campaign)
 */
const shouldShowMidgameAdNow = (): boolean => {
  if (!isInterstitialReady.value) return false
  const threshold = firstMidgameAdShown.value ? 3 : 2
  return battlesSinceAd.value >= threshold
}

/**
 * Resets the cadence counter (so a no-fill ad doesn't get retried on
 * the very next battle), marks the first-ad fast-path as consumed, then
 * delegates to the active ad provider's `showMidgameAd`. The provider's
 * promise resolves once the ad closed OR errored — either way we proceed
 * to the meteor-shower intro afterwards.
 */
const runMidgameAdBeforeBattle = async (): Promise<void> => {
  resetAdCounter()
  if (!firstMidgameAdShown.value) markFirstMidgameAdShown()
  await showMidgameAd()
}

const onRewardContinue = async () => {
  showReward.value = false

  // Snapshot mode flags before tearing down state
  const wasPvp = pvpMode.value
  const wasGhost = ghostMode.value
  const wasDaily = dailyChallengeMode.value

  // Every battle attempt counts toward the cadence — including
  // surrendered ones. A player who quits a tough match still committed
  // to a battle attempt, and excluding surrenders from the counter let
  // serial-surrenderers bypass interstitials indefinitely. The actual
  // ad fires before the next battle's meteor-shower intro (see
  // `beginBattle`).
  incrementAdCounter()

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
  } else if (wasDaily) {
    dailyChallengeMode.value = false
    dailyDiamondEarned.value = false
    dailyCoinReward.value = 0
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

// ─── Daily Challenge ────────────────────────────────────────────────────────

const startDailyChallenge = () => {
  if (!dailyCanPlay.value) return // out of attempts today (icon should be hidden)
  const myTeam = playerTeamWithUpgrades()
  if (!myTeam.length) return
  recordDailyAttempt() // win, lose, or surrender — each click is one of the 3 tries
  const { enemies, shape } = generateChallenge()
  ghostMode.value = false
  pvpMode.value = false
  dailyChallengeMode.value = true
  dailyDiamondEarned.value = false
  dailyCoinReward.value = 0
  coinsAwarded.value = false
  // No bouncers, no power-ups, never a boss arena — the variety comes from the
  // random shape + ability roster. The shape is the 9th initGame arg; the 10th
  // marks this as a daily match, which is what lets the virtual joystick tell
  // "against an inscribed wall with room to spare" from "against the screen
  // edge" (see `isJoystickVisible`).
  initGame(myTeam, enemies, false, 'default', 0, false, undefined, null, shape, true)
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
  // The intro cutscene covers the arena with an opaque canvas until its
  // handover beat; painting the board underneath would be pure cost.
  if (introPlaying.value && !introRevealArena.value) {
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

  render(ctx, canvasWidth.value, canvasHeight.value, showHint.value, currentStageId.value)

  // Feed the adaptive-quality detector. Placed after the draw and inside the
  // "we actually painted" branch, so hidden-tab and off-screen frames (which
  // return above) never look like a frame-rate collapse.
  noteRenderFrame(now)

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
/** Removes `window.__chaos` on unmount. Always null in a production build —
 *  the seam that sets it is dev-only (see onMounted). */
let disposePreviewSeam: (() => void) | null = null

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

  // The stage-1 board exists; the moment the loader is gone the intro gate
  // may decide (it waits on an unsettled cloud save — see introGate.ts).
  watch(introAssetsReady, (ready) => {
    if (ready) armIntro()
  }, { immediate: true })

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

  // ── Preview-recorder scripting seam (`window.__chaos`) ──────────────────
  //
  // DEV ONLY, and dynamically imported so it is not merely unreachable in a
  // portal build but absent from it: Vite replaces `import.meta.env.DEV`
  // with the literal `false`, Rollup drops the branch, and the dynamic
  // import inside it goes with it. A static import would ship the module to
  // every portal even though nothing there can call it.
  //
  // See `tools/preview-video/` — this is what the gameplay clips are driven
  // through.
  if (import.meta.env.DEV) {
    import('@/utils/previewSeam')
      .then(({ installPreviewSeam }) => {
        disposePreviewSeam = installPreviewSeam({
          phase,
          gameResult,
          playerBlades,
          npcBlades,
          currentStageId,
          stageReinitSignal,
          arenaRadius: ARENA_RADIUS,
          maxPullDistance: MAX_PULL_DISTANCE,
          beginDrag,
          updateDrag,
          releaseDrag,
          beginBattle,
          reinit: () => {
            initGame(
              playerTeamWithUpgrades(),
              stageNpcTeam(),
              !hasFirstWin.value,
              currentStage.value.arenaType,
              currentStage.value.bouncers ?? 0,
              currentStageId.value >= 2
            )
          },
          seedRng: seedMatchRng,
          startPhysics,
          stopPhysics,
          stageKey: STAGE_KEY
        })
      })
      .catch((e) => console.warn('[preview] seam install failed:', e))
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

  // The gameplay bracket is driven reactively by the `isGameplayActive`
  // watcher above (battle phase + no blocking modal) and fanned out to every
  // portal by `syncGameplayLifecycle`. `stopGameplayLifecycle()` in
  // onUnmounted below remains as a defensive close for the case the player
  // navigates away mid-match.
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
  // Also drops this instance's syncer from the platform pause registry.
  disposePhysics()
  if (renderRafId !== null) cancelAnimationFrame(renderRafId)
  if (canvasObserver) {
    canvasObserver.disconnect()
    canvasObserver = null
  }
  // Drop `window.__chaos` so a hot-reload remount never leaves the recorder
  // holding a seam bound to a torn-down instance's refs.
  if (disposePreviewSeam) {
    disposePreviewSeam()
    disposePreviewSeam = null
  }
  if (speedBoostIntervalId !== null) clearInterval(speedBoostIntervalId)
  clearTipCycle()
  // Always leave the arena at normal speed so other views aren't affected
  simSpeed.value = 1

  stopGameplayLifecycle()

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
      @pointercancel="onPointerCancel"
      class="game-canvas block touch-none"
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
        //- Stage indicator (fancy themed badge) — hidden during ghost fights, PvP, and daily challenge
        StageBadge(
          v-if="!ghostMode && !pvpMode && !dailyChallengeMode"
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

      //- Daily Challenge launcher — menu screen only (campaign, not in a
      //- PvP/ghost/daily fight). Fixed below the FLogoProgress logo so it
      //- never overlaps the stage badge, coin badge, or bottom HUD row.
      ChallengeIcon(
        v-if="isDailyChallengeEnabled && dailyCanPlay && !pvpMode && !ghostMode && !dailyChallengeMode"
        :reward-available="!dailyWonToday"
        @start="startDailyChallenge"
      )

      //- Center overlay messages
      div.absolute.flex.items-center.justify-center(class="inset-0 z-[10]")

        //- Tap to Start
        div.tap-start(
          v-if="phase === 'tap_to_start'"
          class="text-center pointer-events-auto cursor-pointer"
          @click="beginBattle"
        )
          div.tap-start-title.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text.whitespace-nowrap(
            ref="tapStartTitleRef"
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
        //- Capped to the width between the safe areas and allowed to wrap
        //- (balanced); `dragHintLiftPx` lifts it clear of the stat cards and
        //- the combat-log pill it would otherwise sit on — measured, see
        //- useDragHintPlacement.
        div.drag-hint(
          v-else-if="phase === 'player_turn'"
          ref="dragHintRef"
          class="absolute text-center pointer-events-none"
          :style="{\
            bottom: `calc(4rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx + dragHintLiftPx}px)`,\
            maxWidth: 'min(28rem, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 1.5rem))'\
          }"
        )
          div.drag-hint-text.text-white.italic.game-text.leading-tight(class="text-xs sm:text-sm opacity-50")
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
          class="blade-stat-card relative"
          :class="{ 'blade-stat-dead': bs.dead }"
          :style="{\
            transform: `scale(${uiStatScale})`,\
            transformOrigin: idx === 0 ? 'bottom left' : 'bottom right'\
          }"
        )
          //- Combat log — minimised, pinned directly above the Spinner 2
          //- (bottom-right) stat box. Right-aligned and on the RIGHT card so
          //- the virtual joystick (which spawns on the left where the player
          //- drags) can't cover it. `bottom-full` anchors it to the card's top
          //- edge regardless of card height/scale.
          div.absolute.right-0(v-if="idx === 1" class="bottom-full mb-1")
            CombatLog
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
      //-
      //- `bottom: 1rem` (was 0.5rem). The stack is scaled by `uiBtnScale`
      //- about its BOTTOM-left corner, so anything the buttons paint below
      //- their own layout box — the `translate-y-1` 3D shadow, and the extra
      //- half of an `sm:scale-115` button — is multiplied by that same factor
      //- on the way down. At 1280px wide (scale 1.28) the shadows were
      //- clipping ~3px off the bottom edge of the screen; at 1920 it would
      //- have been ~8px. 1rem clears it at the scale ceiling of 2.
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
          component(
            v-if="HudCoinsAdButton && currentStageId >= 3"
            :is="HudCoinsAdButton"
            @coins-awarded="fireCoinExplosion"
          )
          BattlePass(v-if="currentStageId >= 6" @coins-awarded="fireCoinExplosion" @diamonds-awarded="fireDiamondExplosion")

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
        div.relative(
          v-if="currentStageId >= 2 && speedSwitchOffered && !showConfigSpotlight"
        )
          FButtonSwitch.speedup-switch.scale-90(
            class="sm:scale-100"
            :model-value="simSpeed"
            :options="[{ value: 1 }, { value: 2 }]"
            :disabled-values="speedBoostUnaffordable ? [2] : []"
            @click="onSpeedSwitchClick"
          )
            template(#default="{ option }") {{ option.value }}x
            template(#hint="{ option }")
              //- Movie hint icon — only under the 2x button when boost not yet
              //- earned AND the first-time gift is spent (else: FREE badge)
              img.absolute.object-contain.pointer-events-none(
                v-if="!IS_COIN_SPEED_BOOST_BUILD && option.value === 2 && simSpeed === 1 && !is2xAvailable && !hasAnyFreeSpeedGift"
                src="/images/icons/movie_128x96.webp"
                class="right-0 top-1/2 -translate-y-[50%] h-3 w-3 mr-1.5"
              )
          //- Free boost (useFreeSpeedGift — first-time gift or today's daily
          //- one): a shiny FREE sticker on the 2x corner instead of the movie
          //- icon while an ad-free boost is unspent. Hidden while a boost runs. Outside the switch — its pill clips overflow — and
          //- right-anchored so long locales grow left across the switch.
          span.speed-free-badge.absolute.pointer-events-none.whitespace-nowrap.font-black.game-text.leading-none.rounded-full.border.text-white(
            v-if="simSpeed === 1 && !is2xAvailable && hasAnyFreeSpeedGift"
            class="right-0 -top-2 px-1.5 py-0.5 text-[8px] sm:text-[9px] border-[#0f1a30] bg-gradient-to-b from-[#6dff8a] to-[#16b84a]"
          ) {{ t('spinner.free') }}
          //- Builds without rewarded ads (CG basic launch, itch, GamePix, …):
          //- once no free gift is left the boost costs coins — SpeedCoinBadge in
          //- the FREE badge's slot. Hidden while a boost runs; `null` (and not
          //- in the bundle) on ad builds, see the module script above.
          component(
            v-if="SpeedBoostCoinBadge && simSpeed === 1 && !is2xAvailable && !hasAnyFreeSpeedGift"
            :is="SpeedBoostCoinBadge"
            :unaffordable="speedBoostUnaffordable"
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
          //- Global leaderboard. Gated on `leaderboardVisible`, NOT on whether
          //- this build talks to the Worker — a Poki/YouTube build has no
          //- endpoint but still ships a real baked board, and a build with
          //- neither must lose the button entirely rather than open an empty
          //- modal. On CrazyGames the same flag also hides the button from a
          //- signed-out guest, per QA: guests get no board at all.
          FIconButton(
            v-if="leaderboardVisible && !ghostMode && !pvpMode && !showConfigSpotlight"
            type="secondary"
            size="md"
            :img-src="prependBaseUrl('images/icons/trophy_128x128.webp')"
            @click="leaderboardModalOpen = true"
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
      :show-continue="!winAdBusy"
      @continue="onRewardContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl" :class="{ 'sm:text-2xl': !isMobileLandscape && !isMobilePortrait }") {{ pvpMode ? t('pvp.title') : (dailyChallengeMode ? t('challenge.title') : t('spinner.rewards')) }}
      //- The click-to-continue prompt used to be absolutely positioned at the
      //- overlay's bottom edge, so this column reserved a `mb-20 sm:mb-24`
      //- safety strip to stay out from under it. The prompt is a normal flex
      //- child now (see FReward), so the strip is no longer needed — and on a
      //- short landscape viewport those 96px were pushing the result text off
      //- the top of the scroll area. A small gap is all that's left.
      div.reward-column.flex.flex-col.items-center.gap-4(class="mb-2 sm:mb-3")
        div.reward-result-text.font-black.uppercase.tracking-wider.game-text(
          class="text-3xl sm:text-5xl"
          :class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'"
        ) {{ resultText }}
        //- PvP rewards: coins + honor points
        template(v-if="pvpMode")
          div.flex.items-center.gap-3(ref="rewardCoinRef")
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ PVP_COIN_REWARD + winAdExtra }}
          div.honor-reward.flex.items-center.gap-2(v-if="lastHonorEarned > 0")
            span.text-purple-300.font-black.game-text(class="text-xl sm:text-2xl") +{{ lastHonorEarned }}
            span.text-purple-400.font-bold.game-text.uppercase(class="text-sm sm:text-lg") {{ t('pvp.honor') }}
        //- Daily challenge reward: 1 diamond on the first win each day
        template(v-else-if="dailyChallengeMode")
          template(v-if="gameResult === 'win'")
            //- Coin bonus (every win)
            div.flex.items-center.gap-3(v-if="dailyCoinReward > 0" ref="rewardDailyCoinRef")
              IconCoin(class="w-8 h-8 text-yellow-300")
              span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ dailyCoinReward + winAdExtra }}
            //- Daily bonus, first win of the day only. Diamonds normally;
            //- coins at the diamond rate on a single-currency build (Poki
            //- allows exactly one currency) — see useCurrency.
            div.flex.items-center.gap-3(v-if="dailyDiamondEarned" ref="rewardDiamondRef")
              IconDiamond(v-if="dailyBonus.currency === 'diamonds'" class="w-8 h-8")
              IconCoin(v-else class="w-8 h-8 text-yellow-300")
              span.font-black.game-text(
                :class="[dailyBonus.currency === 'diamonds' ? 'text-cyan-300' : 'text-yellow-400', 'text-2xl sm:text-4xl']"
              ) +{{ dailyBonus.amount }}
            div.font-bold.game-text.text-cyan-200(
              v-else
              class="text-xs sm:text-sm opacity-80"
            ) {{ t('challenge.alreadyClaimed') }}
        //- Campaign / leaderboard rewards
        template(v-else)
          //- `.reward-meta` and `.reward-meta__stack` are `display: contents`
          //- (no box: coins, rank and boss peek sit in the column exactly as
          //- before) EXCEPT on short screens, where they rebalance so the big
          //- boss portrait fits without scrolling — see the style block.
          div.reward-meta(:class="{ 'has-peek': bossPeek && gameResult === 'win' }")
            div.reward-meta__stack
              div.flex.items-center.gap-3(ref="rewardCoinRef")
                IconCoin(class="w-8 h-8 text-yellow-300")
                span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ grantedCoins + winAdExtra }}
              //- "#1130 of 2345" — where this player stands globally. Shown on the
              //- win AND the lose screen: it is the one number on the overlay that
              //- is not about this battle, and after a loss it is the reason to
              //- try the stage again. Renders NOTHING when there is no honest
              //- answer, so no empty plaque and no permanent spinner.
              RankBadge(:score="bestStage")
            //- "Next boss · Stage N" — campaign win screens of the first two
            //- stages after each boss (and stages 1-2). `bossPeek` is null for
            //- every other result, so this never shows on a lose screen, a
            //- ghost fight or a boss's own win (that one is the roulette).
            BossPeekBadge(v-if="bossPeek && gameResult === 'win'" :peek="bossPeek")
        //- "[movie] 3x [coin]" — non-boss win screens, ad builds only. Pays
        //- the base twice more so the label above ends on 3x of it.
        component(
          v-if="WinCoinsAdButton && showWinCoinsAd"
          :is="WinCoinsAdButton"
          :base-coins="winAdBaseCoins"
          @coins-awarded="onWinAdCoins"
          @busy="onWinAdBusy"
        )
        //- Player tip — kept in the flex column so it always renders
        //- BELOW the reward (no chance of covering it) and ABOVE the
        //- tap-to-continue prompt (which is absolutely docked to the
        //- overlay's bottom edge). On very short viewports the badge
        //- shrinks via its own responsive padding/text classes; the
        //- centered column never sits flush against the bottom because
        //- the click-to-continue strip reserves its own band.
        TipBadge(
          v-if="currentTip"
          :text-key="`tips.${currentTip}`"
        )

    //- "BOSS DEFEATED" title card — boss win only, before the roulette.
    Transition(name="fade")
      BossDefeatedBanner(v-if="showBossDefeated" @done="onBossDefeatedDone")

    //- Boss Roulette Overlay (wheel spinning)
    FReward(
      v-model="showRoulette"
      :show-continue="false"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('spinner.rewards') }}
      //- Tighter `gap-2` on short viewports so the wheel + spin-again
      //- buttons fit alongside the result text and the ribbon. The
      //- result text caps at text-4xl now (was text-5xl) — prior version
      //- pushed the buttons below the fold on the CG iframe in
      //- landscape. CG QA caught it 2026-05-05.
      div.flex.flex-col.items-center.roulette-overlay-content(class="gap-2 sm:gap-3")
        div.font-black.uppercase.tracking-wider.game-text.text-green-400.roulette-result-text(
          class="text-2xl sm:text-4xl"
        ) {{ resultText }}
        RouletteWheel(@result="onRouletteResult" @done="onRouletteDone")

    //- Roulette Reward Celebration
    FReward(
      v-model="showRouletteReward"
      :show-continue="rouletteRewardReady"
      @continue="onRouletteRewardContinue"
    )
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('spinner.rewards') }}
      //- One reward per granted spin. With the "Spin Again" respin there are
      //- TWO — the respin ADDS to the first, it never replaces it — shown side
      //- by side with a "+" between them and the second tagged "Spin Again".
      div.roulette-reward-enter.flex.flex-wrap.items-center.justify-center(
        class="gap-x-3 gap-y-4 sm:gap-x-6"
        :class="{ 'is-double': rouletteGrants.length > 1 }"
      )
        template(v-for="(g, i) in rouletteGrants" :key="i")
          div.font-black.game-text.text-white(
            v-if="i > 0"
            class="text-4xl sm:text-6xl"
            aria-hidden="true"
          ) +
          div.roulette-grant.flex.flex-col.items-center(
            class="gap-3 sm:gap-4"
            :data-roulette-grant="g.type"
          )
            div.roulette-grant-tag.font-black.uppercase.game-text.text-yellow-200(
              v-if="i > 0"
              class="text-xs sm:text-sm tracking-[0.15em]"
            ) {{ t('spinner.spinAgain') }}
            //- Jackpot (ultra-rare). Denominated in whichever currency the build
            //- actually pays — `addDiamonds` did the conversion already.
            template(v-if="g.type === 'diamonds'")
              div.roulette-reward-glow.flex.flex-col.items-center.gap-2
                IconDiamond.roulette-grant-icon(v-if="displayDiamondReward(g.diamonds).currency === 'diamonds'")
                IconCoin.roulette-grant-icon.text-yellow-300(v-else)
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconDiamond(v-if="displayDiamondReward(g.diamonds).currency === 'diamonds'" class="w-8 h-8")
                IconCoin(v-else class="w-8 h-8 text-yellow-300")
                span.roulette-grant-amount.font-black.game-text(
                  :class="displayDiamondReward(g.diamonds).currency === 'diamonds' ? 'text-cyan-300' : 'text-yellow-400'"
                ) +{{ displayDiamondReward(g.diamonds).amount }}
            //- Skin reward (plus the 1x coins that come with it)
            template(v-else-if="g.skin")
              div.roulette-reward-glow.flex.flex-col.items-center.gap-3
                img.roulette-grant-icon.object-contain.drop-shadow-lg(
                  :src="modelImgPath(g.skin.modelId)"
                  :alt="t(`skins.${g.skin.modelId}`)"
                )
                span.roulette-grant-skin.text-purple-300.font-black.game-text.uppercase {{ t(`skins.${g.skin.modelId}`) }}
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconCoin(class="w-6 h-6 text-yellow-300")
                span.text-yellow-400.font-black.game-text(class="text-xl sm:text-2xl") +{{ g.coins }}
            //- Coin multiplier reward
            template(v-else)
              div.roulette-reward-glow.flex.flex-col.items-center.gap-2
                span.roulette-grant-mult.text-yellow-300.font-black.game-text {{ g.multiplier }}x
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconCoin(class="w-8 h-8 text-yellow-300")
                span.roulette-grant-amount.text-yellow-400.font-black.game-text +{{ g.coins }}

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
    //- Fetches on OPEN, not on mount — most sessions never open it, and
    //- reopening after a failure IS the retry button.
    LeaderboardModal(
      v-if="leaderboardVisible"
      v-model="leaderboardModalOpen"
      :score="bestStage"
    )

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

    //- First-launch intro cutscene — above every HUD element, lazily loaded.
    IntroCutscene(v-if="introPlaying" @done="onIntroDone")

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

// Per-grant sizes. One grant keeps the original large celebration; two
// (first spin + "Spin Again") sit side by side, so each is scaled down to fit
// a portrait phone and a short landscape viewport without scrolling.
.roulette-grant-icon
  width: 5rem
  height: 5rem
  @media (min-width: 640px)
    width: 7rem
    height: 7rem

.roulette-grant-skin
  font-size: 1.25rem
  @media (min-width: 640px)
    font-size: 1.875rem

.roulette-grant-mult
  font-size: 3rem
  line-height: 1
  @media (min-width: 640px)
    font-size: 4.5rem

.roulette-grant-amount
  font-size: 1.875rem
  @media (min-width: 640px)
    font-size: 3rem

.is-double
  .roulette-grant-icon
    width: 3.5rem
    height: 3.5rem
    @media (min-width: 640px)
      width: 5rem
      height: 5rem

  .roulette-grant-skin
    font-size: 1rem
    @media (min-width: 640px)
      font-size: 1.5rem

  .roulette-grant-mult
    font-size: 2.25rem
    @media (min-width: 640px)
      font-size: 3.75rem

  .roulette-grant-amount
    font-size: 1.5rem
    @media (min-width: 640px)
      font-size: 2.25rem

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

// FREE gift sticker on the speed switch: gentle pulse + a light sheen
// sweeping across. Scales from its right edge, where it is anchored.
.speed-free-badge
  z-index: 1
  overflow: hidden
  transform-origin: right center
  box-shadow: 0 0 6px rgba(109, 255, 138, 0.8)
  animation: speed-free-pulse 1.4s ease-in-out infinite

  &::after
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.75) 50%, transparent 70%)
    transform: translateX(-120%)
    animation: speed-free-sheen 2.4s ease-in-out infinite

@keyframes speed-free-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.12)

@keyframes speed-free-sheen
  0%, 55%
    transform: translateX(-120%)
  100%
    transform: translateX(120%)

@media (prefers-reduced-motion: reduce)
  .speed-free-badge, .speed-free-badge::after
    animation: none

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

// ── Tap to start ─────────────────────────────────────────────────────────
// Capped to the room between the side HUD columns (logo / boss badge left,
// chest / timer right); useFitText shrinks the one-line title into it and
// the hint below wraps.
.tap-start
  max-width: calc(100vw - 10rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))
  text-wrap: balance

// ── Drag hint ────────────────────────────────────────────────────────────
// Long de/fi/lt hints wrap into two even lines instead of one long line and
// a stranded last word.
.drag-hint-text
  text-wrap: balance
  overflow-wrap: anywhere

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

// ─── Reward overlay — short-landscape fit ───────────────────────────────────
// A 390px-tall landscape viewport has to hold the parchment ribbon, the result
// text, the reward row and the player tip. At the portrait sizes (`sm:text-5xl`
// applies from 640px WIDE, which every landscape phone is) the result text
// alone is ~58px and the tip badge ended up half below the fold. The reward
// body scrolls, so nothing was unreachable — but a clipped tip badge reads as
// a broken layout. Trimming the type and the gaps lets the whole column fit.
//
// `.reward-meta` (coins + rank stack, then the boss peek) has no box of its
// own unless the boss peek is up on a short screen: `display: contents` keeps
// coins, rank pill and boss peek as direct flex items of the column, exactly
// as before. Declared BEFORE the queries so the layouts below override it.
.reward-meta,
.reward-meta__stack
  display: contents

@media (orientation: landscape) and (max-height: 500px)
  .reward-column
    gap: 0.5rem

  .reward-result-text
    font-size: 1.875rem
    line-height: 2.125rem

  // Boss peek up: [coins over rank] beside the big framed portrait. The width
  // is there, the height is not — stacked, a readable portrait pushed the win
  // tip below the fold at 568x320 and 740x360.
  .reward-meta.has-peek
    display: flex
    flex-direction: row
    align-items: center
    justify-content: center
    gap: 0.5rem 1rem

    .reward-meta__stack
      display: flex
      flex-direction: column
      align-items: center
      gap: 0.35rem

// Short portrait phones (≤ 700px tall) with the boss peek up: coins and rank
// share one line, which pays for most of the big portrait's extra height.
@media (orientation: portrait) and (max-height: 700px)
  .reward-meta.has-peek .reward-meta__stack
    display: flex
    flex-wrap: wrap
    align-items: center
    justify-content: center
    gap: 0.35rem 0.75rem

// ─── Roulette overlay — viewport-fit ────────────────────────────────────────
// Shrink the result text and the slot's vertical gap on short-but-not-mobile
// landscape viewports (CG iframe in landscape with the portal chrome bar
// visible — ~700–860 px tall). At the default sm:text-4xl + sm:gap-3, the
// wheel + spin-again/skip row was pushed below the fold. CG QA caught it
// 2026-05-05. Pairs with the matching ribbon-shrink rule in FReward.vue
// and the responsive canvas size in RouletteWheel.vue.
@media (orientation: landscape) and (min-height: 501px) and (max-height: 860px)
  .roulette-overlay-content
    gap: 0.5rem

  .roulette-result-text
    font-size: 1.875rem
    line-height: 2.25rem

</style>
