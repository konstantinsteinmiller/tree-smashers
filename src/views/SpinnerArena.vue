<script lang="ts">
// ─── Build-only UI, picked at module scope ─────────────────────────────────
// A template `v-if` on the build flag does NOT drop the dead branch: an
// imported constant compiles to `unref(FLAG)`, and even a plain `const` is
// not folded by Rollup inside this render function, so both branches (and
// every component they render) shipped in every build. A module-scope ternary
// on the `import.meta.env`-derived flag does fold: the unused component is
// never referenced, so its module drops out of the bundle.
import { fieldTeam, rosterPower, teamConfigs } from '@/use/useSmashers'
import { settlePremiumSmashers } from '@/use/premiumSmashers'
import { hasUnseenTeamSlot, markTeamSlotsSeen, secondSlotJustOpened, syncTeamSlots, teamSizeAt } from '@/use/useTeamSize'
import { HUD_TOAST_MS, showHudToast } from '@/use/useHudToast'
import { PVP_DEFAULT_TEAM_SIZE, RANKED_TEAM_SIZE } from '@/data/teamSize'
import { hashString, layoutForSeed, layoutForStage, TOWERS_FROM_STAGE, treeCountForStage } from '@/use/arenaTerrain'
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

// Skills surfaces (skills-feature.md §7–§9, WP7): lazy handles from the skills
// flag boundary (src/skills/skillsGate.ts) — each is null on a skills-off
// build, so none can render and no skill component is even bundled; the arena
// shows exactly what it showed before skills (tests/skillsFlagBoundary.test.ts).
import { SkillHudChipUi as SkillHudChip } from '@/skills/skillsGate'

// Bosses 100+ surfaces (bosses-100-feature.md §3.5, §7.2, §7.3, §11): lazy
// handles from the bosses flag boundary (src/bosses/bosses100Gate.ts) — each
// is null on a bosses100-off build, so no intro card, trait chip, trophy card
// or Boss Lab can render and none is bundled (tests/bosses100FlagBoundary).
// The Boss Lab is additionally DEV-only (the cheat gate sits on top).
import {
  BossIntroCardUi,
  BossTraitGlyphUi,
  BossTrophyCardUi,
  BossLabUi
} from '@/bosses/bosses100Gate'

// League surfaces (league plan LG6): lazy handles from the league flag
// boundary (src/league/leagueGate.ts) — each is null on a league-off build,
// so no HUD button, hub, result panel, unlock popup or season modal can
// render and none is bundled (tests/leagueFlagBoundary, leagueFlagOffRuntime).
import {
  LeagueHudButtonUi,
  LeagueHubUi,
  LeagueResultPanelUi,
  LeagueUnlockPopupUi,
  LeagueSeasonRewardModalUi
} from '@/league/leagueGate'
</script>

<script setup lang="ts">
import { movieIconSrc } from '@/use/badgeIconArt'
import { mobileCheck } from '@/utils/function'
import {
  ref,
  onMounted,
  onUnmounted,
  computed,
  watch,
  nextTick,
  defineAsyncComponent,
  h,
  toRaw,
  effectScope,
  reactive,
  shallowRef
} from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FCountUp from '@/components/atoms/FCountUp.vue'
import FModal from '@/components/molecules/FModal.vue'
import FReward from '@/components/atoms/FReward.vue'
import SmasherTeamModal from '@/components/organisms/SmasherTeamModal.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import CombatLog from '@/components/organisms/CombatLog.vue'
import useSounds, { useMusic } from '@/use/useSound'
import useSpinnerGame, {
  ARENA_RADIUS,
  BLADE_RADIUS,
  MAX_PULL_DISTANCE,
  simSpeed,
  countdownText,
  installSkillEngine,
  installBossTraitEngine,
  type InitGameOptions
} from '@/use/useSpinnerGame'
import { currentMatchSeed, seedMatchRng } from '@/use/useDeterministicRng'
import { STAGE_KEY } from '@/keys'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSpinnerCampaign, {
  noteCampaignBossLoss,
  noteCampaignBossWin,
  getStageById,
  loadCheatStage,
  type Stage
} from '@/use/useSpinnerCampaign'
import useTips from '@/use/useTips'
import type { TipId } from '@/use/useTips'
import TipBadge from '@/components/atoms/TipBadge.vue'
import { useHint } from '@/use/useHint'
import { warmMenusWhenIdle } from '@/use/menuWarm'
import { useDragHintPlacement } from '@/use/useDragHintPlacement'
import { useFitText } from '@/use/useFitText'
import { useScreenshake } from '@/use/useScreenshake'
import { noteRenderFrame, setQualityMonitoring } from '@/use/useQuality'
import type { SpinnerConfig } from '@/types/spinner'
import useUser, { isMobileLandscape, isMobilePortrait, isNative } from '@/use/useUser'
import IconCoin from '@/components/icons/IconCoin.vue'
import StatIcon from '@/components/icons/StatIcon.vue'
import UiIcon from '@/components/icons/UiIcon.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import useBattlePass from '@/use/useBattlePass'
import TreasureChest from '@/components/organisms/TreasureChest.vue'
import SkinChestTimer from '@/components/organisms/SkinChestTimer.vue'
import type { GrantedSkin } from '@/use/useSkinChest'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FButtonSwitch from '@/components/atoms/FButtonSwitch.vue'
import StageBadge from '@/components/StageBadge.vue'
import FakeLeaderBoard from '@/components/organisms/FakeLeaderBoard.vue'
import SurrenderIcon from '@/components/organisms/SurrenderIcon.vue'
import PvPButton from '@/components/organisms/PvPButton.vue'
import PvPLobbyModal from '@/components/organisms/PvPLobbyModal.vue'
import usePVP, { pendingInviteCode, startCrazyMultiplayer } from '@/use/usePVP'
import { botPlayStyle, type BotOpponent } from '@/use/pvpBots'
import usePvpStats, { calcHonorPoints } from '@/use/usePvpStats'
import useLeaderboard, { playerMaxStage, type LeaderboardEntry } from '@/use/useLeaderboard'
import LeaderboardModal from '@/components/organisms/LeaderboardModal.vue'
import RankBadge from '@/components/atoms/RankBadge.vue'
import BossPeekBadge from '@/components/atoms/BossPeekBadge.vue'
import { getBossPeek, battleModeOf, type BattleMode, type BossPeek } from '@/use/bossPeek'
import { shouldShowBossDefeated } from '@/use/bossDefeated'
import BossDefeatedBanner from '@/components/atoms/BossDefeatedBanner.vue'
import HudToast from '@/components/atoms/HudToast.vue'
import FRibbon from '@/components/atoms/FRibbon.vue'
import { stageEnemyConfigs } from '@/use/stageBladeConfig'
import { fmtFixed } from '@/utils/localeNumber'
import type { BossTrophyInput, TraitCardView } from '@/use/bosses/bossArenaUi'
import type { TraitHudRow } from '@/use/bosses/bossTraits'
import { BOSSES100_BUILD, loadBossArenaUi, loadBossTraitEngine, type BossArenaUiModule } from '@/bosses/bosses100Gate'
// Pure boundary data (bosses gate header): used only behind BOSSES100_BUILD.
import { bossTraitsOf, type BossTrophySkinId } from '@/data/bossEncounters'
import { bossPreviewModelId } from '@/use/bossPeek'
import { leaderboardVisible, reportRun, setPlayerBuildSource } from '@/use/useLiveLeaderboard'
import { triggerHappytime } from '@/use/useCrazyGames'
import { syncGameplayLifecycle, stopGameplayLifecycle } from '@/use/useGameplayLifecycle'
import { isSingleCurrency } from '@/use/useCurrency'
import {
  adsInFlight,
  isAdsBlockedModalShown,
  isRewardedReady,
  showRewardedAd
} from '@/use/useAds'
import { incrementAdCounter } from '@/use/midgameCadence'
import { useArenaAdBreaks } from '@/use/arenaAdBreaks'
import { hasAnyFreeSpeedGift, claimFreeSpeedBoost, refreshFreeSpeedGiftDay } from '@/use/useFreeSpeedGift'
import { DAILY_SPEED_GIFT_DURATION_MS } from '@/use/speedGiftGate'
import {
  IS_COIN_SPEED_BOOST_BUILD,
  handleSpeedSwitchTap,
  isSpeedBoostUnaffordable,
  isSpeedSwitchOffered
} from '@/use/speedBoostPurchase'
import useBottomSafe from '@/use/useBottomSafe'
import { useArenaHudFit } from '@/use/useArenaHudFit'
import { getSelectedSkin, grantTrophySkins, modelImgPath, type SpinnerModelId } from '@/use/useModels'
import useAssets from '@/use/useAssets'
import { spawnCoinExplosion, type CurrencyBadgeTargets } from '@/use/useCoinExplosion'
import { revealRewards, whenRevealIdle, lastRevealOrigin } from '@/use/useRewardReveal'
import useCheats from '@/use/useCheats'
import { cheatRouletteSignal, bossLabSignal, cheatsEnabled } from '@/use/useCheats'
import RouletteWheel from '@/components/organisms/RouletteWheel.vue'
import type { RouletteResult } from '@/components/organisms/RouletteWheel.vue'
import { preloadRouletteArt } from '@/use/useRouletteArt'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import { showsWinCoinsAd } from '@/use/winCoinsAd'
import { settleLabBattle } from '@/use/labBattle'
import { rouletteGrantFor, type RouletteGrant } from '@/use/rouletteGrants'
import {
  introPlaying,
  introRevealArena,
  armIntro,
  noteIntroBattleStarted,
  finishIntro
} from '@/use/useIntroCutscene'
import { loadIntroCutscene } from '@/use/introCutsceneLoader'
// Skills: everything goes through the skills gate — the arena glue, the
// engine's skill port and the useSkills API are lazy chunks of a skills build
// and do not exist on a skills-off build.
import { SKILLS_BUILD, loadArenaSkills, loadSkillEngine } from '@/skills/skillsGate'
import type { ArenaSkills } from '@/use/skills/arenaSkills'
import { isGamePaused } from '@/use/useGamePause'
import { computeStats } from '@/use/useSpinnerConfig'
import {
  VS_HANDOFF_MS, VS_TOTAL_MS, buildVsSide, emptyVsSeen, parseVsSeen, recordVsSeen, shouldShowVsIntro, vsUsesWallClock,
  type VsIntroData, type VsMatchup, type VsMode, type VsSeen, type VsUnitInput
} from '@/use/vsIntro'
import { VS_SEEN_KEY } from '@/keys'
import type { SpinnerState } from '@/types/spinner'
import { isForcedDarkBlocking, whenForcedDarkGuardClear } from '@/use/useForcedDarkModeGuard'
import { isRewardedIntroOpen } from '@/use/useRewardedIntro'
// Stub-swapped on every non-Poki build (vite.config alias), so this never
// pulls the SDK into another portal's bundle; a no-op until the SDK is live.
import { pokiMeasure } from '@/utils/pokiPlugin'
// League (LG6): only through the gate — the build literal, the mount rule and
// the two lazy loaders. Everything else is a type, or a bridge member called
// in bracket form (tests/leagueFlagBoundary rule 5).
import { LEAGUE_BUILD, loadLeague, loadLeagueBridge, leagueMountAllowed, type LeagueApi, type LeagueBridge } from '@/league/leagueGate'
import type { LeagueBattleFinish, LeagueBattleStart, LeaguePlayerSide } from '@/league/leagueArenaBridge'
import type { LeagueFightTarget } from '@/league/useLeague'
import type { OpponentCard } from '@/league/leagueOpponents'
import type { LeagueSeasonRewardView } from '@/league/ui/leagueUi'

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
  setArenaFitHud,
  arenaScreenLayout,
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
  statsFor,
  skillHud,
  bossTraitHud,
  refuseFrozenTap
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
  hostSkills: pvpHostSkills,
  guestSkills: pvpGuestSkills,
  registerCallbacks: pvpRegisterCallbacks,
  sendLaunch: pvpSendLaunch,
  sendSurrender: pvpSendSurrender,
  sendStateCheck: pvpSendStateCheck,
  joinLobby: pvpJoinLobby,
  createLobby: pvpCreateLobby,
  checkInviteFromUrl,
  returnToLobby: pvpReturnToLobby,
  leavePvP,
  pendingInviteHost: pvpPendingInviteHost,
  matchKind: pvpMatchKind,
  opponentProfile: pvpOpponent,
  registerBotMatchStart: pvpRegisterBotMatchStart
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
/** The HUD leaderboard button appears once stage 6 is won (the stage to play is 7). */
const LEADERBOARD_MIN_STAGE = 7

// ─── Team size (src/data/teamSize.ts, use/useTeamSize.ts) ──────────────────
// Slot 2 opens after winning stage 3, slot 3 after winning stage 10; the
// player picks 1, 2 or 3 in the team modal. Persist newly opened slots (and
// the slots an older save already earned) as the best stage grows.
// #G1: the moment slot 2 opens a 2nd smasher joins automatically
// (useTeamSize.syncTeamSlots); announce it with a HUD toast once the result
// screen is out of the way (the Team button's "!" badge stays until the modal
// shows the new slot).
const secondSmasherJoined: Ref<boolean> = ref(false)
watch(bestStage, (s) => {
  if (secondSlotJustOpened(syncTeamSlots(s))) secondSmasherJoined.value = true
  // Premium smashers (Tuskar onwards): the ownership record follows the best
  // stage, and a save from before the rule keeps what it had (premiumSmashers.ts).
  settlePremiumSmashers(s)
}, { immediate: true })
/** Smashers per side in a campaign / cheat-stage battle (the player's pick). */
const battleTeamSize = computed(() => teamSizeAt(bestStage.value))
/** A team slot opened that the team modal has not shown yet → Team button badge. */
const teamSlotBadge = computed(() => hasUnseenTeamSlot(bestStage.value))

/** The board's tie-break column: summed smasher levels across the whole
 *  roster. Monotonic (upgrades never refund) and it is what actually separates
 *  two players sitting on the same stage. */
const teamPower = computed(() => rosterPower.value)

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
// The posted build is the RANKED team (always two smashers — the build
// format, league ghosts and gatekeepers are two-smasher teams), not the
// campaign team size the player picked.
setPlayerBuildSource(() => ({ team: rankedTeamWithUpgrades(), skills: sk.value?.battleSkillOptions('campaign').skillLoadout ?? [] }))

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
// Mouse players are told to click, touch players (phones AND tablets) to tap.
const isTouchUi = mobileCheck() || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
const { shakeStyle } = useScreenshake()
const { t, locale } = useI18n()
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
  // Skills build: the skill glue + engine port load right after mount; a tap
  // that beats them waits (the board is rebuilt with the loadout on arrival).
  if (SKILLS_BUILD && !skillsLoaded) {
    await skillsReady
    if (phase.value !== 'tap_to_start') return
  }
  // Bosses 100+ build: same for the boss glue + the engine's trait port.
  if (BOSSES100_BUILD && !bossesLoaded) {
    await bossesReady
    if (phase.value !== 'tap_to_start') return
  }

  await playDueInterstitial()
  // The window between the restored 'tap_to_start' and startMatch's own
  // phase change is synchronous, so the player can't tap into a duplicate
  // beginBattle here. (Anything that re-initialised the board during the ad
  // left it at 'tap_to_start' too.)
  if (phase.value !== 'tap_to_start') return

  startBattleMusic()
  // The VS screen (src/use/vsIntro.ts) plays right before the meteor shower
  // and the 3-2-1 — once per new matchup; the match starts on its hand-off,
  // never on its own. A retry goes straight to the meteors.
  const vsMode = singlePlayerVsMode()
  const matchup = vsMatchupFor(vsMode)
  if (shouldShowVsIntro(matchup, readVsSeen(), vsBotSeen)) {
    noteVsShown(matchup)
    const ok = await playVsIntro(singlePlayerVsData(vsMode))
    if (!ok || phaseNow() !== 'vs_intro') return
    phase.value = 'tap_to_start'
  }
  startMatch()
}

const { setSettingValue } = useUser()

// Battle Pass — xp awards are fired from the game-over watcher below.
const {
  awardCampaignWin: bpAwardCampaignWin,
  awardLeaderboardWin: bpAwardLeaderboardWin,
  awardLoss: bpAwardLoss
} = useBattlePass()

const { recordPvpWin, recordPvpLoss, awardHonor, recordBotResult } = usePvpStats()

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
const CONFIG_OPENED_KEY = 'smashers_config_opened'
const hasOpenedConfig: Ref<boolean> = ref(localStorage.getItem(CONFIG_OPENED_KEY) === '1')

// ─── Ghost Fight (Leaderboard 1v1) ────────────────────────────────────────
// While true, the current match is a ghost battle launched from the
// leaderboard: rewards are custom, campaign progress does not advance,
// the StageBadge is hidden, and the arena uses the default theme.
const ghostEnemy: Ref<LeaderboardEntry | null> = ref(null)

// ─── NPC Team from Campaign Stage ─────────────────────────────────────────

// Forwards every boss mechanic field — the special ability (ghost / split /
// partners / healers …) AND the stage-101+ traits (bossTrait / shardTrait,
// bosses-100-feature.md §4); see `stageBladeToConfig` (unit-tested).
const stageNpcTeam = (): SpinnerConfig[] => stageEnemyConfigs(currentStage.value)

/** Player team with current upgrade levels applied.
 *  While a cheat boss stage is active the player's blades are temporarily
 *  boosted well above the enemy level so the demo fight is actually winnable.
 *  The enemies (built by buildCheatBossStage) scale to the player's peak
 *  upgrades AND carry the boss 2x HP + 1.6x radius multipliers, so simply
 *  matching levels leaves the player too weak. We add a flat +25 levels on
 *  top of the matched peak — localStorage upgrades are never touched.
 *  There is no upgrade max level, so this is safe to stack arbitrarily. */
const CHEAT_PLAYER_BONUS_LEVELS = 25
/** The cheat stage the Boss Lab launched last (raw object) and whether that
 *  fight gives the player the cheat bonus above (level mode "matched"). */
let bossLabStage: Stage | null = null
let bossLabBoost = true
/** The first `size` team picks (padded when fewer are stored) at their roster
 *  levels, each with its slot's colourway. */
const teamWithUpgrades = (size: number): SpinnerConfig[] =>
  teamConfigs(fieldTeam(playerTeam.value, size, bestStage.value), (c, i) => getSelectedSkin(c.topPartId, i))
const playerTeamWithUpgrades = (): SpinnerConfig[] => {
  // A Boss Lab fight at campaign levels fights with the real team (no boost).
  const labUnboosted = bossLabStage !== null && !bossLabBoost && toRaw(cheatStage.value) === bossLabStage
  const configs = teamWithUpgrades(battleTeamSize.value)
  if (cheatStage.value && !labUnboosted) {
    const peak = Math.max(0, ...configs.map(c => c.topLevel ?? 0))
    return configs.map(c => ({
      ...c,
      topLevel: peak + CHEAT_PLAYER_BONUS_LEVELS,
      bottomLevel: peak + CHEAT_PLAYER_BONUS_LEVELS
    }))
  }
  return configs
}
/** League ranked fights, leaderboard ghosts and the posted build: always the
 *  first two picks (RANKED_TEAM_SIZE), whatever the campaign team size is. */
const rankedTeamWithUpgrades = (): SpinnerConfig[] => teamWithUpgrades(RANKED_TEAM_SIZE)

// ─── Hint Timer ───────────────────────────────────────────────────────────

// Stage 1 teaches the pull-back: the demo-pull hint shows from the first moment and survives
// stray taps / wrong-way drags (some players drag from their own smasher TO the enemy) until a
// shot has actually been fired from it.
const stage1PullLearned = ref(false)
const stage1Guide = (): boolean => currentStageId.value === 1 && !stage1PullLearned.value
// Team / upgrade modal art: warmed in quiet-network batches from the moment the arena is up.
warmMenusWhenIdle()
watch(phase, (p, prev) => {
  if (prev === 'player_turn' && p !== 'player_turn' && currentStageId.value === 1) stage1PullLearned.value = true
  if (p === 'player_turn') {
    if (stage1Guide()) {
      clearHint()
      showHint.value = true
    } else startHintTimer()
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
    initCampaignGame()
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
  leagueSession.value = null
  leagueResult.value = null
  initCampaignGame()
})

// ─── Computed ──────────────────────────────────────────────────────────────

const isGameOver = computed(() => phase.value === 'game_over')
const showReward: Ref<boolean> = ref(false)
// #G1 "2nd smasher joined!" toast, held until the result screen closes.
watch([secondSmasherJoined, showReward], ([joined, reward]) => {
  if (!joined || reward) return
  secondSmasherJoined.value = false
  showHudToast(t('sfc.SmasherTeamModal.secondSmasherJoined'), 'sun', HUD_TOAST_MS * 1.5)
})

// Boss peek — "Next boss · Stage N" teaser on the campaign win screen. Set by
// the game-over watcher from the stage the battle was FOUGHT on (before
// `advanceStage()`), so a replayed stage peeks exactly like its first clear.
// null = no badge; the rule lives in `@/use/bossPeek` (unit-tested).
const bossPeek: Ref<BossPeek | null> = ref(null)

// ─── Boss Roulette ──────────────────────────────────────────────────────────
const showRoulette = ref(false)

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
// The coin base BOTH roulette spins multiply: the defeated BOSS stage's
// `rewardWin`, snapshotted before `advanceStage()` — after it `rewardAmount`
// already reads the NEXT (non-boss) stage, which paid e.g. 140 x mult for
// boss 5 instead of its 200. The respin lands after the advance too, so it
// must read this snapshot, never the live `rewardAmount`.
const rouletteBaseCoins = ref(0)

// ─── Skin Chest (20h) → Skin roulette ───────────────────────────────────────
// Tapping a ripe chest opens a skins-only wheel with the chest's previewed
// skin at 3x the chance of every other skin, plus the boss wheel's
// rewarded-ad "Spin Again". The wheel grants each landed skin itself
// (`buySkin`); this view only collects them for the celebration.
const skinChestFeatured = ref<GrantedSkin | null>(null)
const showSkinRoulette = computed({
  get: () => skinChestFeatured.value !== null,
  set: (val: boolean) => {
    if (!val) skinChestFeatured.value = null
  }
})
const skinChestWins: Ref<{ modelId: SpinnerModelId; isSpecial: boolean }[]> = ref([])
const showSkinChestReward = computed({
  get: () => skinChestWins.value.length > 0,
  set: (val: boolean) => {
    if (!val) skinChestWins.value = []
  }
})

const onSkinChestOpened = (featured: GrantedSkin) => {
  preloadRouletteArt()
  skinChestWinsPending = []
  skinChestFeatured.value = featured
}

let skinChestWinsPending: { modelId: SpinnerModelId; isSpecial: boolean }[] = []
const onSkinRouletteResult = (result: RouletteResult) => {
  if (result.type === 'skin' && result.skin) {
    skinChestWinsPending.push({ modelId: result.skin.modelId, isSpecial: !!result.skin.isSpecial })
  }
}

const onSkinRouletteDone = () => {
  if (!showSkinRoulette.value) return
  skinChestFeatured.value = null
  skinChestWins.value = skinChestWinsPending
  skinChestWinsPending = []
  if (skinChestWins.value.length > 0) {
    playSound('happy')
    triggerHappytime()
  }
}

const onSkinChestRewardContinue = () => {
  skinChestWins.value = []
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
/** This result screen settles a cheat-stage / Boss Lab fight (G1): no 3x (G5). */
const lastResultWasLab = ref(false)
const winAdBaseCoins = computed(() => {
  if (pvpMode.value) return PVP_COIN_REWARD
  return grantedCoins.value
})
const showWinCoinsAd = computed(() => !leagueSession.value && showsWinCoinsAd({
  adsBuild: HAS_REWARDED_ADS,
  result: gameResult.value,
  bossWin: lastWinWasBoss.value,
  pvp: pvpMode.value,
  labWin: lastResultWasLab.value,
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
  && !showSkinChestReward.value && !showSkinRoulette.value
  && !surrenderModalOpen.value
  // The forced-dark-mode notice is a blocking menu like the ones above: no
  // `gameplayStart` may fire under it on the boot path, and one that appears
  // mid-battle closes the bracket until the player clears it.
  && !isForcedDarkBlocking.value
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
const bladeStats = computed(() => {
  // Boss-trait rows (frozen / chill per playerBlades index, §7.3) — a new
  // array only on trait events, so this recomputes then too.
  const traitRows = bossTraitHud.value
  return playerBlades.value.map((b, i) => {
    const s = statsFor(b)
    return {
      id: b.id,
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: Math.round(s.maxHp),
      atk: s.damageMultiplier,
      def: s.defenseMultiplier,
      spd: s.speedMultiplier,
      dead: b.hp <= 0,
      trait: traitCardView(traitRows[i], b.hp <= 0)
    }
  })
})

/** Team size 3 outside phone portrait: two card columns at the corners (the
 *  third card above the first) instead of a middle card over the player's tree. */
const bladeStatsStacked = computed(() => bladeStats.value.length > 2 && !isMobilePortrait.value)

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
  // A league fight surrendered is a ranked LOSS (O10): settled right away
  // through the league game-over branch (LP delta, loss coins, result panel).
  if (LEAGUE_BUILD && leagueSession.value) {
    gameResult.value = 'lose'
    phase.value = 'game_over'
    return
  }
  // Surrendering a ghost fight returns to the campaign — clear the mode
  // flags FIRST so its HUD (the StageBadge) comes back.
  ghostMode.value = false
  ghostEnemy.value = null
  // Campaign surrender re-inits the same stage directly (no reward modal →
  // no `onRewardContinue` → no automatic counter bump). Count the surrender
  // as a battle attempt for interstitial cadence — otherwise a player who
  // repeatedly surrenders never sees the midgame ad. The actual ad fires
  // before the next battle's meteor-shower intro (`shouldShowMidgameAdNow`
  // check in `beginBattle`).
  incrementAdCounter()
  // Re-init the (now campaign) stage with no rewards — player stays on current stage
  initCampaignGame()
  maybeReopenBossLab()
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
const SPEED_BOOST_KEY = 'smashers_2x_expires_at'
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
  // Show the payout on the gift screen — but never over a running fight,
  // where the 2x itself is the feedback and an overlay would cover play.
  if (phase.value === 'idle' || phase.value === 'tap_to_start') {
    void revealRewards([{ kind: 'speed', minutes: Math.round(SPEED_BOOST_DURATION_MS / 60000) }])
  }
}

// Reference to the CoinBadge component — TreasureChest reads its `rootEl`
// for the fly-to-badge VFX target.
const coinBadgeRef = ref<CurrencyBadgeTargets | null>(null)
const coinBadgeEl = computed(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)
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
  // Backing store at css × dpr (render-sharpness rule: never draw below the
  // display's own pixel ratio; capped at 3). The renderer keeps drawing in
  // CSS px — renderLoop applies the dpr transform.
  canvasDpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.round(canvasWidth.value * canvasDpr)
  canvas.height = Math.round(canvasHeight.value * canvasDpr)
  canvas.style.width = `${canvasWidth.value}px`
  canvas.style.height = `${canvasHeight.value}px`
  const jc = joystickCanvasRef.value
  if (jc) {
    jc.width = Math.round(canvasWidth.value * canvasDpr)
    jc.height = Math.round(canvasHeight.value * canvasDpr)
    jc.style.width = `${canvasWidth.value}px`
    jc.style.height = `${canvasHeight.value}px`
  }
}
let canvasDpr = 1

// ─── Bottom-Row Visibility Guard ──────────────────────────────────────────
//
// `useBottomSafe` computes the gap between the layout viewport and the
// actually-visible visual viewport (i.e. the strip hidden behind URL bar /
// browser chrome on Android Chrome and Safari). The shared `bottomGapPx`
// pixel value is consumed by every bottom-anchored element so they all stay
// in sync. We deliberately do NOT re-measure on phase change — the value
// only depends on viewport metrics, not on which buttons are mounted.

const { bottomGapPx, scheduleBottomMeasure } = useBottomSafe()

// Arena fit (presentation only): the opaque HUD over the canvas — every
// `data-arena-hud` element — is measured and the board is fitted around it
// (@/use/arenaFit, @/use/useArenaHudFit).
useArenaHudFit(canvasRef, setArenaFitHud, [
  phase, isBattleActive, showConfigButton, showReward, currentStageId,
  () => bladeStats.value.length, () => bladeStatsStacked.value, bottomGapPx
])

// The drag hint measures the stat cards / combat-log pill and lifts itself
// clear of them (they share its bottom strip; which one it hits depends on
// the spinner count, the HUD scale and the locale).
const dragHintRef = ref<HTMLElement | null>(null)
// Never over the player's tree / gauge: off portrait the hint moves into the
// free strip RIGHT of the board when it is wide enough (the joystick and the
// stacked stat cards live on the left), else it sits just above the tree.
// Re-placed when the turn starts (the fit has settled by then) and on resize.
const DRAG_HINT_SIDE_MIN = 104
const dragHintSide = ref<{ left: number; width: number } | null>(null)
const dragHintAboveTree = ref<number | null>(null)
const placeDragHint = () => {
  const w = canvasWidth.value
  const h = canvasHeight.value
  if (!w || !h) return
  const { board, playerTree } = arenaScreenLayout(w, h)
  dragHintSide.value = null
  dragHintAboveTree.value = null
  if (w <= h || playerTree === null) return
  const gap = w - board.x1 - 16
  if (gap >= DRAG_HINT_SIDE_MIN) dragHintSide.value = { left: Math.round(board.x1 + 8), width: Math.round(Math.min(gap, 320)) }
  // + the gauge's HP label riding on top of the arc
  else dragHintAboveTree.value = Math.round(h - playerTree.y0 + 22)
}
watch([phase, canvasWidth, canvasHeight], () => {
  if (phase.value !== 'player_turn') return
  placeDragHint()
  // again once the HUD re-measure (useArenaHudFit: 120 / 700 ms) settled the fit
  for (const ms of [350, 900]) setTimeout(placeDragHint, ms)
}, { flush: 'post' })
const dragHintStyle = computed(() => {
  const side = dragHintSide.value
  if (side) {
    return {
      left: `${side.left}px`,
      top: '50%',
      transform: 'translateY(-50%)',
      maxWidth: `min(${side.width}px, calc(100vw - ${side.left}px - env(safe-area-inset-right, 0px) - 0.5rem))`
    }
  }
  const above = dragHintAboveTree.value
  return {
    bottom: above !== null
      ? `${above}px`
      : `calc(4rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx.value + dragHintLiftPx.value}px)`,
    maxWidth: 'min(28rem, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 1.5rem))'
  }
})
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
  if (!stage1Guide()) clearHint()
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
  // Frost Lock: a tap aimed at a frozen spinner is answered (shake + crack +
  // hint) instead of silently ignored; the other spinner stays selected.
  if (phase.value === 'player_turn' && bossTraitHud.value.length > 0) {
    const frozenIdx = frozenBladeAtTap(playerBlades.value, bossTraitHud.value, coords.x, coords.y)
    if (frozenIdx >= 0) {
      onFrozenTap(frozenIdx)
      return
    }
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

// ─── Boss traits: refused tap on a frozen spinner (§7.3) ───────────────────
// The blade shakes 150 ms on the canvas with the ice-crack SFX (engine,
// throttled 400 ms), its stat card shakes too and a short hint says why —
// the freeze must never read as a bug.
const FROZEN_SHAKE_MS = 150
const FROZEN_HINT_MS = 1800
const frozenShakeIdx = ref(-1)
const frozenHintIdx = ref(-1)
let frozenShakeTimer: number | null = null
let frozenHintTimer: number | null = null
const onFrozenTap = (idx: number) => {
  const blade = playerBlades.value[idx]
  if (!blade) return
  refuseFrozenTap(blade)
  // Restart the card shake even on a quick second tap.
  frozenShakeIdx.value = -1
  if (frozenShakeTimer !== null) clearTimeout(frozenShakeTimer)
  void nextTick(() => {
    frozenShakeIdx.value = idx
    frozenShakeTimer = window.setTimeout(() => {
      frozenShakeIdx.value = -1
      frozenShakeTimer = null
    }, FROZEN_SHAKE_MS)
  })
  frozenHintIdx.value = idx
  if (frozenHintTimer !== null) clearTimeout(frozenHintTimer)
  frozenHintTimer = window.setTimeout(() => {
    frozenHintIdx.value = -1
    frozenHintTimer = null
  }, FROZEN_HINT_MS)
}
watch(phase, (p) => {
  if (p !== 'player_turn') frozenHintIdx.value = -1
})

// ─── Boss intro card (§7.2) ────────────────────────────────────────────────
// A stage-101+ encounter introduces itself inside the 1,600 ms meteor intro
// (crest, name, trait glyphs). Campaign and cheat / Boss Lab stages only.
const bossIntro = computed(() => {
  const stage = currentStage.value
  if (!BOSSES100_BUILD || !stage.bossEncounterId) return null
  return {
    nameKey: stage.name,
    cycleSuffix: stage.cycleSuffix ?? '',
    modelId: bossPreviewModelId(stage.enemyTeam),
    traits: bossTraitsOf(stage.enemyTeam)
  }
})
const bossIntroShown = ref(false)
watch(phase, (p) => {
  bossIntroShown.value = p === 'meteor_intro'
    && bossIntro.value !== null
    && !pvpMode.value && !ghostMode.value
    // The VS screen already showed the boss (crown, name, trait glyphs).
    && !vsPlayedThisBattle.value
})

// ─── Boss trophies (§3.5) ──────────────────────────────────────────────────
// Granted on the boss win itself (persisted at once, like the roulette's
// skin), shown as an extra card on the roulette reward screen. Only a real
// campaign win of an encounter stage grants (never cheat / Boss Lab, ghost,
// PvP, league); the grant is idempotent, so a replay shows nothing.
const trophyGrants: Ref<BossTrophySkinId[]> = ref([])

// ─── Boss Lab (§11, BW7) — dev cheat ───────────────────────────────────────
const cheatsOn = cheatsEnabled()
const bossLabOpen = ref(false)
/** A Lab fight is running: re-open the Lab after its result screen. */
const bossLabReopen = ref(false)
const bossLabPeak = computed(() => ({
  top: Math.max(0, ...Object.values(playerUpgrades.value.tops)),
  bottom: Math.max(0, ...Object.values(playerUpgrades.value.bottoms))
}))
const openBossLab = () => {
  if (!BossLabUi || !cheatsOn) return
  bossLabOpen.value = true
}
watch(bossLabSignal, openBossLab)
// Touch route (no keyboard): 20 quick consecutive taps on the treasure chest
// open the Lab on a dev build with cheats on. Silent — no counter is shown.
const BOSS_LAB_CHEST_TAPS = 20
/** A longer pause than this between taps starts the count again. */
const BOSS_LAB_TAP_GAP_MS = 700
let bossLabChestTaps = 0
let bossLabChestTapAt = -Infinity
const onChestDebugTap = () => {
  if (!BossLabUi || !cheatsOn) return
  const now = performance.now()
  bossLabChestTaps = now - bossLabChestTapAt <= BOSS_LAB_TAP_GAP_MS ? bossLabChestTaps + 1 : 1
  bossLabChestTapAt = now
  if (bossLabChestTaps >= BOSS_LAB_CHEST_TAPS) {
    bossLabChestTaps = 0
    openBossLab()
  }
}
const onBossLabLaunch = (stage: Stage, _index: number, boostPlayer: boolean) => {
  bossLabStage = stage
  bossLabBoost = boostPlayer
  bossLabReopen.value = true
  loadCheatStage(stage)
}
/** After a Lab fight's result screen (or a surrender): the Lab again, with
 *  the next entry focused. */
const maybeReopenBossLab = () => {
  if (!bossLabReopen.value || bossLabStage === null) return
  if (toRaw(cheatStage.value) !== bossLabStage) {
    bossLabReopen.value = false
    return
  }
  openBossLab()
}
watch(cheatStage, (stage) => {
  if (bossLabStage !== null && toRaw(stage) !== bossLabStage) {
    bossLabReopen.value = false
    bossLabStage = null
    bossLabBoost = true
  }
})

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
        league: !!leagueSession.value,
        ghost: ghostMode.value,
        cheat: !!cheatStage.value
      })
    })
    playSound(gameResult.value === 'win' ? 'win' : 'lose')
    if (gameResult.value === 'win') spawnMeteorShower('celebrate')
    // A fresh result screen: nothing from the last one's 3x ad carries over.
    lastWinWasBoss.value = false
    lastResultWasLab.value = false
    winAdExtra.value = 0
    winAdBusy.value = false

    // PvP matches — small coin reward + honor points tracking
    if (pvpMode.value) {
      try {
        const myTeam = pvpRole.value === 'host' ? pvpHostTeam.value : pvpGuestTeam.value
        const enemyTeam = pvpRole.value === 'host' ? pvpGuestTeam.value : pvpHostTeam.value
        const sumLevels = (team: SpinnerConfig[]) =>
          team.reduce((s, c) => s + (c.topLevel ?? 1) + (c.bottomLevel ?? 1), 0)
        // Skill levels count toward honour (§9.1): 0.8 part level per skill
        // level — both 0 on a skills-off build.
        const honorSkills = sk.value?.pvpHonorSkillLevels() ?? { mine: 0, theirs: 0 }
        if (gameResult.value === 'win') {
          const hp = calcHonorPoints(
            sumLevels(myTeam),
            sumLevels(enemyTeam),
            honorSkills.mine,
            honorSkills.theirs
          )
          recordPvpWin(hp)
          lastHonorEarned.value = hp
        } else {
          recordPvpLoss()
          lastHonorEarned.value = 0
        }
        // A random-search bot: casual local result (above) + the bot tally and
        // the skill staircase toward 50 % (pvpBots.ts "RATING").
        if (pvpMatchKind.value === 'bot') recordBotResult(gameResult.value === 'win' ? 'win' : 'lose')
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

    // League fight (LG6): ranked, on the ghost path. No stage advance, no
    // first-win flag, no trophy, no roulette / boss card, no rubber band, no
    // tip counters, no 3x button. The bridge applies the result (local first,
    // then the server post) and returns what to credit: coins (and diamonds)
    // at once, half the PvP honour on a win, +25 battle-pass XP on a win (O4).
    if (LEAGUE_BUILD && leagueSession.value) {
      const fin = leagueBridge.value?.['finishLeagueBattle'](gameResult.value) ?? null
      leagueResult.value = fin
      grantedCoins.value = fin?.coins ?? 0
      lastHonorEarned.value = fin?.honor ?? 0
      if (fin) {
        if (fin.coins > 0) addCoins(fin.coins)
        if (fin.diamonds > 0) addDiamonds(fin.diamonds)
        if (fin.honor > 0) awardHonor(fin.honor)
        if (fin.bpXp > 0) bpAwardLeaderboardWin()
      }
      coinsAwarded.value = true
      showReward.value = true
      stopBattleMusic()
      return
    }

    // Cheat / Boss Lab fight (G1): a test fight, never a campaign battle. It
    // pays the stage's own fixed coins (Lab 500/100, cheat bosses 500/100)
    // and returns BEFORE every campaign branch below — no stage advance, no
    // first-win flag, no battle-pass xp, no roulette, no trophy, no rubber
    // band, no tip counters. Win and loss alike.
    if (cheatStage.value && !ghostMode.value) {
      grantedCoins.value = settleLabBattle(cheatStage.value, gameResult.value, addCoins)
      lastResultWasLab.value = true
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
      // Advance stage + BP immediately, but defer coin award until roulette resolves.
      // Snapshot the boss stage's reward BEFORE advancing — see `rouletteBaseCoins`.
      rouletteBaseCoins.value = rewardAmount.value
      // Trophy skins — decided on the stage just FOUGHT (before the advance).
      trophyGrants.value = grantBossTrophies({
        stage: currentStage.value,
        result: gameResult.value,
        mode: battleModeOf({ ghost: ghostMode.value, cheat: !!cheatStage.value })
      }, grantTrophySkins)
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
  // the ultra-rare jackpot pays its fixed coins.
  const grant = rouletteGrantFor(result, rouletteBaseCoins.value)
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
  spawnMeteorShower('celebrate') // celebratory meteor shower
  // Signal a "happy moment" to the CrazyGames SDK alongside the reward VFX —
  // the platform uses these events to time featured-game highlights.
  // No-op outside a crazy-web build thanks to the isSdkActive guard inside.
  triggerHappytime()
  // Fire the matching explosion(s) once the overlay renders.
  nextTick(() => {
    rouletteGrants.value.forEach((g, i) => {
      const el = rouletteRewardRowRefs.value[i] ?? null
      fireCoinExplosion(el)
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
  trophyGrants.value = []

  // Boss-win path is campaign-only (never PvP/ghost) and never surrendered,
  // so the counter always ticks. The actual ad fires before the next
  // battle's meteor-shower intro (see `beginBattle`).
  incrementAdCounter()
  coinsAwarded.value = false
  initCampaignGame()
  maybeReopenBossLab()
  void armLeagueUnlockAfterWin('win', battleModeOf({ cheat: !!cheatStage.value }))
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
  trophyGrants.value = []
  rouletteBaseCoins.value = rewardAmount.value
  pendingBossReward.value = false // no coins in cheat mode
  showRoulette.value = true
})

// Coin explosion VFX when the reward overlay appears
watch(showReward, async (show) => {
  // Ad first, overlay up, THEN the board — see `reportLeaderboardRun`.
  // A cheat / Lab fight is not a campaign run: nothing to post (G1).
  if (show && !cheatStage.value) reportLeaderboardRun()
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
  fireCoinExplosion(rewardCoinRef.value)
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
// State + persistence live in `@/use/midgameCadence` (shared with the
// rewarded-ad seam in `useAds`: a completed rewarded ad resets the counter).

// #UX100 — the pre-battle interstitial is paced by ACTIVE PLAYTIME (first
// after 240 s, then at most one per 121 s; none in the tutorial or around
// PvP), and 20 quick taps on the coin badge trigger one (at once on this
// screen, else at the next pre-battle break). Rules: interstitialPacing.ts;
// knobs + per-build flags: ads/interstitialConfig.ts; arena glue:
// arenaAdBreaks.ts. With the playtime pacing switched off for a build, the
// battle-count cadence above decides instead.
const PVP_LIVE_STATES: readonly string[] = ['searching', 'found', 'creating', 'waiting', 'connecting', 'lobby', 'ready', 'playing']
const arenaAds = useArenaAdBreaks({
  phase,
  pvpActive: () => pvpMode.value || pvpModalOpen.value || PVP_LIVE_STATES.includes(pvpStatus.value),
  tutorial: () => !hasFirstWin.value,
  arenaClear: () => {
    const b = skillGateBlockers()
    return !b.pvp && !b.adActive && !b.cutscene && !b.modalOpen && !isForcedDarkBlocking.value
  },
  getBadge: () => coinBadgeEl.value
})

/**
 * The one interstitial placement: at the pre-battle break ('tap_to_start'),
 * if the pacing says one is due. The board parks at 'ad_break' while the ad
 * runs (no tap can start a battle under it) and comes back to
 * 'tap_to_start' whether the ad played, did not fill or failed.
 */
const playDueInterstitial = async (): Promise<void> => {
  const reason = arenaAds.preBattleAd()
  if (!reason) return
  phase.value = 'ad_break'
  await arenaAds.runAdBreak(reason)
  if (phase.value === 'ad_break') phase.value = 'tap_to_start'
}

const onRewardContinue = async () => {
  showReward.value = false

  // Snapshot mode flags before tearing down state
  const wasPvp = pvpMode.value
  const wasGhost = ghostMode.value
  const wasLeague = LEAGUE_BUILD && leagueSession.value !== null
  const closedResult = gameResult.value
  const closedMode = battleModeOf({ pvp: wasPvp, league: wasLeague, ghost: wasGhost, cheat: !!cheatStage.value })

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
    // A bot match ran on the ghost path: clear it like one.
    ghostMode.value = false
    ghostEnemy.value = null
    // Return to PvP lobby (keep connection alive) instead of destroying it;
    // after a bot match, to the PvP start screen.
    pvpReturnToLobby()
    pvpModalOpen.value = true
  } else if (wasGhost) {
    ghostMode.value = false
    ghostEnemy.value = null
    leagueSession.value = null
    leagueResult.value = null
  }

  // Reset the award guard RIGHT BEFORE initGame so the game-over watcher
  // cannot re-fire while phase is still 'game_over' (which would cause a
  // phantom second reward screen).
  coinsAwarded.value = false
  initCampaignGame()
  // A league result never queues the skills intro (LG6) — back to the hub
  // instead, for the next ranked fight.
  if (wasLeague) {
    openLeagueHub()
    return
  }
  maybeReopenBossLab()
  void armLeagueUnlockAfterWin(closedResult, closedMode)
}

// ─── Invites (link, CrazyGames launch params, CrazyGames join listener) ──────

let stopCrazyMultiplayer: () => void = () => {}

/** Join a queued invite once the arena is on its menu. A friend's invite skips
 *  the first-launch cutscene (CG: no onboarding scene for joining players). */
function joinPendingInvite () {
  if (!pendingInviteCode.value || pvpMode.value) return
  if (phase.value !== 'tap_to_start' && phase.value !== 'idle') return
  const friendName = pvpPendingInviteHost.value ?? ''
  const code = checkInviteFromUrl()
  if (!code) return
  noteIntroBattleStarted()
  pvpModalOpen.value = true
  // Small delay so the modal renders before we trigger join
  setTimeout(() => pvpJoinLobby(code, { friendName }), 100)
}

// ─── Leaderboard / Ghost Fight ────────────────────────────────────────────

const onGhostFight = (entry: LeaderboardEntry) => {
  ghostEnemy.value = entry
  ghostMode.value = true
  markGhostFought(entry.id)
  // A ghost is a two-smasher team (blade + blade2; rows from before team
  // sizes are 2 by construction): the fight is 2v2 with the ranked team.
  const myTeam = rankedTeamWithUpgrades()
  if (!myTeam.length) return
  const toConfig = (b: SpinnerConfig): SpinnerConfig => ({
    topPartId: b.topPartId,
    bottomPartId: b.bottomPartId,
    topLevel: b.topLevel ?? 0,
    bottomLevel: b.bottomLevel ?? 0,
    modelId: b.modelId
  })
  const enemies = [toConfig(entry.blade), toConfig(entry.blade2)]
  // The ghost fights with its derived loadout (§9.1) — none on a skills-off build.
  lastBattleInit = () => {
    initGame(rankedTeamWithUpgrades(), enemies, false, 'default', false, undefined, null, 'circle',
      { ...battleSkillOptions('ghost', entry), terrain: { layout: layoutForSeed(hashString(String(entry.id))), towers: true } })
  }
  initGame(myTeam, enemies, false, 'default', false, undefined, null, 'circle',
    { ...battleSkillOptions('ghost', entry), terrain: { layout: layoutForSeed(hashString(String(entry.id))), towers: true } })
}

const onOpenConfig = () => {
  if (!hasOpenedConfig.value) {
    hasOpenedConfig.value = true
    localStorage.setItem(CONFIG_OPENED_KEY, '1')
  }
  configModalOpen.value = true
  // The modal shows the team-size picker with every open slot: seen.
  markTeamSlotsSeen(bestStage.value)
}

const onConfigSave = (team: SpinnerConfig[]) => {
  saveTeam(team)
  initCampaignGame()
}

// ─── Bosses 100+ (bosses-100-feature.md §3.5, §7.3) ─────────────────────────
//
// The arena's boss glue (`use/bosses/bossArenaUi.ts`: trophies, the frozen-tap
// test, the stat-card view) and the engine's trait port load through the
// bosses gate right after mount. `bossUi` stays null until then — and forever
// on a bosses100-off build, where no stage carries a trait, nothing is granted
// and every wrapper below answers "none". A tap that beats the load waits
// (beginBattle), and a board already waiting is rebuilt with its traits.
const bossUi = shallowRef<BossArenaUiModule | null>(null)
let bossesLoaded = false
let bossesUnmounted = false
const bossesReady: Promise<void> = BOSSES100_BUILD
  ? Promise.all([loadBossArenaUi(), loadBossTraitEngine()])
    .then(([ui, port]) => {
      if (bossesUnmounted || !ui) return
      bossUi.value = ui
      installBossTraitEngine(port)
      const traitBoard = currentStage.value.enemyTeam.some(c => c.bossTrait !== undefined || c.shardTrait !== undefined)
      if (phase.value === 'tap_to_start' && !pvpMode.value && traitBoard) lastBattleInit?.()
    })
    .catch((e) => {
      console.error('[bosses] failed to load:', e)
    })
    .finally(() => {
      bossesLoaded = true
    })
  : Promise.resolve()

/** Stat-card multiplier in the active language's decimals ("1.5" / "1,5", T3). */
const statNum = (n: number): string => fmtFixed(n, 1, locale.value)

const NO_TRAIT_CARD: TraitCardView = Object.freeze({ frozen: false, chill: 0, chillPct: 0 })
/** Stat-card frozen / chill view of one blade (none until the glue loaded). */
const traitCardView = (row: TraitHudRow | undefined, dead: boolean): TraitCardView =>
  (BOSSES100_BUILD && bossUi.value ? bossUi.value.traitCardView(row, dead) : NO_TRAIT_CARD)
/** Index of the frozen spinner a tap aimed at, or −1. */
const frozenBladeAtTap = (
  blades: Parameters<BossArenaUiModule['frozenBladeAtTap']>[0],
  hud: readonly Pick<TraitHudRow, 'frozen'>[],
  x: number,
  y: number
): number => (BOSSES100_BUILD && bossUi.value ? bossUi.value.frozenBladeAtTap(blades, hud, x, y) : -1)
/** Trophy skins this finished battle newly unlocked ([] on an off build). */
const grantBossTrophies = (
  input: BossTrophyInput,
  grant: (ids: readonly BossTrophySkinId[]) => readonly string[]
): BossTrophySkinId[] => (BOSSES100_BUILD && bossUi.value ? bossUi.value.grantBossTrophies(input, grant) : [])

// ─── Skills (skills-feature.md §7–§10, WP7) ───────────────────────────────
//
// The arena's skill glue lives in `use/skills/arenaSkills.ts`, loaded through
// the skills gate together with the engine's skill port and the useSkills API
// and run inside this component's own effect scope. `sk` stays null until
// then — and forever on a skills-off build, where every call below is a no-op,
// every loadout is empty (the engine runs its pre-skills code path) and every
// surface handle is null.
const sk = shallowRef<ArenaSkills | null>(null)
const skillsScope = effectScope()
let skillsLoaded = false
let skillsUnmounted = false
const skillsReady: Promise<void> = SKILLS_BUILD
  ? Promise.all([loadArenaSkills(), loadSkillEngine()])
    .then(([mod, port]) => {
      if (skillsUnmounted || !mod) return
      installSkillEngine(port)
      const glue = skillsScope.run(() => mod.useArenaSkills({
        pvpRole,
        pvpHostSkills,
        pvpGuestSkills,
        skillHud,
        isBattleActive
      }))
      if (!glue) return
      sk.value = reactive(glue) as unknown as ArenaSkills
      // The board waiting on tap_to_start was built before the engine's skill
      // port had loaded — rebuild it so every smasher carries its skills.
      if (phase.value === 'tap_to_start' && !pvpMode.value) lastBattleInit?.()
    })
    .catch((e) => {
      console.error('[skills] failed to load:', e)
    })
    .finally(() => {
      skillsLoaded = true
    })
  : Promise.resolve()

/** The trailing initGame options for a non-PvP battle: the team's loadout for
 *  `mode` and, in a ghost fight, the ghost's derived loadout. Empty until the
 *  skill glue loaded (the board is rebuilt when it does) and on a skills-off
 *  build. */
const battleSkillOptions = (mode: BattleMode, ghost?: LeaderboardEntry): InitGameOptions => {
  const glue = sk.value
  if (!glue) return {}
  return glue.battleSkillOptions(mode, ghost ? glue.ghostLoadout(ghost) : [])
}

/** Re-runs the current tap_to_start board with a fresh loadout (set by every
 *  non-PvP init; the skill glue calls it when the loadout changes). */
let lastBattleInit: (() => void) | null = null

/** Every campaign (and cheat-stage) init goes through here. */
function initCampaignGame() {
  lastBattleInit = initCampaignGame
  initGame(
    playerTeamWithUpgrades(),
    stageNpcTeam(),
    !hasFirstWin.value,
    currentStage.value.arenaType,
    currentStageId.value >= 2,
    undefined,
    null,
    'circle',
    {
      ...battleSkillOptions(battleModeOf({ cheat: !!cheatStage.value })),
      // Tree Smashers: layouts cycle by stage; towers from stage 2 on
      // (stages 1–2 are the tutorial and stay pure). 1–3 trees per side,
      // seeded by the stage id (treeCountForStage: one through the tutorial
      // arc; PvP / league / ghosts keep one).
      terrain: { layout: layoutForStage(currentStageId.value), towers: currentStageId.value >= TOWERS_FROM_STAGE, trees: treeCountForStage(currentStageId.value) }
    }
  )
}

/** The opponent's name on the VS screen (hello / bot profile). */
const pvpOpponentName = computed(() => pvpOpponent.value?.name ?? '')

// ─── VS intro (src/use/vsIntro.ts, components/organisms/VsIntro.vue) ───────
//
// A 5-second face-off in front of every NEW matchup, right before the meteor
// shower and the 3-2-1: campaign, boss, leaderboard ghost and league fights
// (from the tap-to-start, after any due interstitial), the random-search bot
// match and the human PvP match. Retries go straight to the meteors (the
// once-per-matchup rules: vsIntro.ts header; the save key `smashers_vs_seen`). While it plays the board sits in the
// view-managed 'vs_intro' phase (like 'ad_break'): no menu surface, ad gate or
// board rebuild keyed on 'tap_to_start' can fire under it.
//
//   - Single-player: its own clock (pauses with the game), skippable from
//     0.8 s; `startMatch()` runs on its hand-off at 4.8 s.
//   - Human PvP: a fixed wall-clock timeout, no pause, no skip: both peers
//     build the board exactly VS_HANDOFF_MS after receiving the match start,
//     the same relative timing as before (the lock-step sim only advances on
//     launches). The bot match poses as PvP: no skip either.
//   - Campaign stage 1 (the tutorial after the intro cutscene): no VS.
//
// It replaces the old PvP VS card (deciding_turn) and the bot / league cards
// inside the meteor intro, and a stage-101+ boss no longer re-introduces
// itself with the intro card during the meteors when the VS just did.
const VsIntroUi = defineAsyncComponent(() => import('@/components/organisms/VsIntro.vue'))
const vsIntro = shallowRef<VsIntroData | null>(null)
/** The battle being started played a VS screen (suppresses the boss card). */
const vsPlayedThisBattle = ref(false)
let vsGen = 0
let vsResolve: ((ok: boolean) => void) | null = null
let vsTimers: number[] = []
let vsMounted = false

const clearVsTimers = () => {
  for (const id of vsTimers) clearTimeout(id)
  vsTimers = []
}

/** Close the VS screen; a pending start resolves false (the board is gone). */
const cancelVsIntro = () => {
  clearVsTimers()
  const r = vsResolve
  vsResolve = null
  vsIntro.value = null
  r?.(false)
}

/**
 * Put the VS screen up and resolve once the battle should start (true), or
 * false when something took the board away meanwhile (a reinit, a PvP
 * disconnect, leaving the arena). Parks the board at 'vs_intro'.
 */
const playVsIntro = (data: VsIntroData): Promise<boolean> => {
  cancelVsIntro()
  const gen = ++vsGen
  vsMounted = false
  vsPlayedThisBattle.value = true
  phase.value = 'vs_intro'
  vsIntro.value = data
  return new Promise<boolean>((resolve) => {
    vsResolve = (ok) => {
      if (gen !== vsGen) return
      vsResolve = null
      resolve(ok)
    }
    if (vsUsesWallClock(data.mode)) {
      // PvP: time-boxed on the wall clock (see above).
      vsTimers.push(window.setTimeout(() => vsResolve?.(true), VS_HANDOFF_MS))
      vsTimers.push(window.setTimeout(() => {
        if (gen === vsGen) vsIntro.value = null
      }, VS_TOTAL_MS))
    } else {
      // Fail-safe: the screen's chunk never arrived (offline): start anyway.
      vsTimers.push(window.setTimeout(() => {
        if (gen === vsGen && !vsMounted) {
          vsIntro.value = null
          vsResolve?.(true)
        }
      }, 2000))
    }
  })
}
const onVsStart = () => {
  vsMounted = true
}
const onVsHandoff = () => {
  if (vsIntro.value && !vsUsesWallClock(vsIntro.value.mode)) vsResolve?.(true)
}
const onVsDone = () => {
  if (vsIntro.value && !vsUsesWallClock(vsIntro.value.mode)) {
    clearVsTimers()
    vsIntro.value = null
  }
}
// Whatever takes the board out of 'vs_intro' before the hand-off cancels it.
watch(phase, (p) => {
  if (p !== 'vs_intro' && vsResolve) cancelVsIntro()
  if (p === 'tap_to_start' || p === 'idle') vsPlayedThisBattle.value = false
})

/** The phase right now (a plain read: no narrowing across an await). */
const phaseNow = (): string => phase.value

// ── Once per matchup (vsIntro.ts header) ──
/** Bot opponents met in this session. */
const vsBotSeen = new Set<string>()
/** Human PvP matches started in the current pairing (both peers count the
 *  same sequence, so both decide the same). */
let pvpPairingMatches = 0
watch(pvpStatus, (st) => {
  if (!['lobby', 'waiting', 'found', 'playing'].includes(st)) pvpPairingMatches = 0
})
const readVsSeen = (): VsSeen => {
  try {
    return parseVsSeen(localStorage.getItem(VS_SEEN_KEY))
  } catch {
    return emptyVsSeen()
  }
}
/** Remember that this matchup had its VS screen (the save / the session). */
const noteVsShown = (m: VsMatchup) => {
  if (m.mode === 'bot' && m.opponent) vsBotSeen.add(m.opponent)
  const prev = readVsSeen()
  const next = recordVsSeen(m, prev)
  if (next === prev) return
  try {
    localStorage.setItem(VS_SEEN_KEY, JSON.stringify(next))
  } catch { /* storage full / blocked: the VS just shows again next time */
  }
}
const vsMatchupFor = (mode: VsMode): VsMatchup => {
  let opponent: string | undefined
  if (mode === 'ghost' && ghostEnemy.value) opponent = `ghost:${ghostEnemy.value.id}`
  else if (mode === 'league' && leagueSession.value) {
    const vs = leagueSession.value.vs
    opponent = `league:${vs.opponentNameKey ?? vs.opponentName}`
  } else if (mode === 'bot') opponent = `bot:${pvpOpponentName.value}`
  return { mode, stageId: currentStageId.value, lab: !!cheatStage.value, opponent, pairingMatches: pvpPairingMatches }
}

/** Which single-player battle this is (the tap-to-start paths). */
const singlePlayerVsMode = (): VsMode => {
  if (leagueSession.value !== null) return 'league'
  if (ghostMode.value) return 'ghost'
  return npcBlades.value.some(b => b.isBoss) ? 'boss' : 'campaign'
}

/** VS cards per side: the field's starting blades (at most four). */
const VS_MAX_UNITS = 4
const bladeUnits = (blades: readonly SpinnerState[]): VsUnitInput[] =>
  blades.slice(0, VS_MAX_UNITS).map((b) => {
    const s = statsFor(b)
    return { config: b.config, maxHp: b.maxHp, damageMul: s.damageMultiplier, defenseMul: s.defenseMultiplier }
  })
const configUnits = (team: readonly SpinnerConfig[]): VsUnitInput[] =>
  team.slice(0, VS_MAX_UNITS).map((c) => {
    const s = computeStats(c, c.topLevel ?? 0, c.bottomLevel ?? 0)
    return { config: c, maxHp: s.maxHp, damageMul: s.damageMultiplier, defenseMul: s.defenseMultiplier }
  })
const playerModel = (c: SpinnerConfig) => getSelectedSkin(c.topPartId)

/** The VS screen of the battle on the board (tap-to-start paths + the bot). */
const singlePlayerVsData = (mode: VsMode): VsIntroData => {
  const mine = playerBlades.value
  const theirs = npcBlades.value
  // Skills exactly as the engine equipped them: a side whose blades carry no
  // skills (campaign NPCs, skills-off builds) shows no skill row.
  const mySkills = SKILLS_BUILD && mine.some(b => b.skills !== undefined)
  const theirSkills = SKILLS_BUILD && theirs.some(b => b.skills !== undefined)
  let label = ''
  let kicker: string | undefined
  if (mode === 'bot') label = pvpOpponentName.value || t('pvp.guest')
  else if (mode === 'league' && leagueSession.value) {
    const vs = leagueSession.value.vs
    label = vs.opponentNameKey ? t(vs.opponentNameKey) : vs.opponentName
  } else if (mode === 'ghost') {
    label = ghostEnemy.value?.name ?? ''
    if (ghostEnemy.value) kicker = t('stageN', { n: ghostEnemy.value.maxStage })
  } else {
    const st = currentStage.value
    const name = t(`stages.${st.name}`, st.name)
    label = st.cycleSuffix ? `${name} ${st.cycleSuffix}` : name
    kicker = cheatStage.value ? t('labBadge') : mode === 'boss' ? t('bossStage') : t('stageN', { n: currentStageId.value })
  }
  const enemyLoadout = mode === 'league' ? leagueSession.value?.vs.skills.opponent ?? null : null
  return {
    mode,
    me: buildVsSide(t('you'), 'player', bladeUnits(mine), { skillsOn: mySkills, modelFallback: playerModel }),
    them: buildVsSide(label, 'npc', bladeUnits(theirs), { skillsOn: theirSkills, sideLoadout: enemyLoadout }),
    kicker
  }
}

/** The human PvP match's VS screen (the board is built at its hand-off). */
const pvpVsData = (myTeam: SpinnerConfig[], enemyTeam: SpinnerConfig[]): VsIntroData => {
  const guest = pvpRole.value === 'guest'
  return {
    mode: 'pvp',
    me: buildVsSide(t('you'), 'player', configUnits(myTeam), {
      skillsOn: SKILLS_BUILD, sideLoadout: guest ? pvpGuestSkills.value : pvpHostSkills.value, modelFallback: playerModel
    }),
    them: buildVsSide(pvpOpponentName.value || t(guest ? 'pvp.host' : 'pvp.guest'), 'npc', configUnits(enemyTeam), {
      skillsOn: SKILLS_BUILD, sideLoadout: guest ? pvpHostSkills.value : pvpGuestSkills.value
    })
  }
}

// ── Random-search bot match (src/use/pvpBots.ts) ─────────────────────────────
// Presented exactly like a human match — PvP HUD, "Opponent's turn", the VS
// card with its name, 1× speed, the PvP result screen — but it runs locally on
// the single-player path: the campaign NPC AI with the bot's human-like style
// (`npcPlay`), no network, the ghost-path flags so no campaign rule (difficulty
// HP, stage advance, boss peek, tips) applies. usePVP holds the teams (host =
// this player, guest = the bot), so the PvP game-over branch credits it as a
// casual PvP result; `recordBotResult` adds the bot tally + skill staircase.
const startBotMatch = (bot: BotOpponent) => {
  try {
    const myTeam = pvpHostTeam.value.map(c => ({ ...c }))
    if (!myTeam.length || !bot.team.length) {
      leavePvP()
      return
    }
    pvpModalOpen.value = false
    pvpMode.value = true
    ghostEnemy.value = null
    ghostMode.value = true
    coinsAwarded.value = false
    lastBattleInit = null
    startBattleMusic()
    initGame(myTeam, bot.team.map(c => ({ ...c })), false, pvpGameConfig.value.arenaType, false, undefined, null, 'circle', {
      ...(sk.value?.battleSkillOptions('pvp') ?? {}),
      seed: bot.seed,
      firstTurn: bot.firstTurn,
      terrain: { layout: layoutForSeed(bot.seed), towers: true },
      npcPlay: botPlayStyle(bot.skill, bot.seed)
    })
    // Presented like a human match: the VS screen (no skip), then the meteors.
    const matchup = vsMatchupFor('bot')
    if (!shouldShowVsIntro(matchup, readVsSeen(), vsBotSeen)) {
      startMatch()
      return
    }
    noteVsShown(matchup)
    void playVsIntro(singlePlayerVsData('bot')).then((ok) => {
      if (!ok || phaseNow() !== 'vs_intro') return
      phase.value = 'tap_to_start'
      startMatch()
    })
  } catch (e) {
    console.error('[PvP] Bot match start failed:', e)
    leavePvP()
    pvpMode.value = false
    ghostMode.value = false
    pvpModalOpen.value = false
    initCampaignGame()
  }
}

/** Any FModal on screen (Daily Rewards, Battle Pass, the rewarded-ad intro,
 *  the fake leaderboard, …) — those own their open state internally, but
 *  every one of them renders `.modal-overlay` into <body>. */
const anyModalOverlayOpen = (): boolean =>
  typeof document !== 'undefined' && document.querySelector('.modal-overlay') !== null

/** The arena-side blockers of the league surface gate. */
const skillGateBlockers = () => ({
  pvp: pvpMode.value || pvpModalOpen.value,
  adActive: phase.value === 'ad_break' || adsInFlight.value > 0 || isGamePaused.value
    || isRewardedIntroOpen.value || isAdsBlockedModalShown.value,
  // The first-launch cutscene, or the boot loader still up.
  cutscene: introPlaying.value || !introAssetsReady.value,
  modalOpen: showReward.value || showRoulette.value || showRouletteReward.value
    || showBossDefeated.value || showSkinChestReward.value || showSkinRoulette.value || showEnemySurrender.value
    || configModalOpen.value || showOptions.value || leaderboardModalOpen.value
    || surrenderModalOpen.value || anyModalOverlayOpen()
    || leagueSurfaceBlocks()
})


// ─── League (league plan LG6) ─────────────────────────────────────────────
//
// Everything league-side is reached through the gate: `loadLeague()` (the
// LG2 state singleton — loading it at mount also stores the unlock once the
// campaign stage reaches it) and `loadLeagueBridge()` (leagueArenaBridge.ts:
// deck, battle start / finish, season preview, measure), whose members are
// called in bracket form. Both stay null on a league-off build, where every
// branch below sits behind the folded `LEAGUE_BUILD` literal and nothing
// runs, is stored, fetched or rendered.
//
// A ranked fight runs on the ghost path (`ghostMode` + `leagueSession`): the
// engine's campaign-only scaling (difficulty HP, boss rubber band) is off,
// the stage badge / PvP / leaderboard buttons hide, and the game-over watcher
// takes the league branch.
const league = shallowRef<LeagueApi | null>(null)
const leagueBridge = shallowRef<LeagueBridge | null>(null)
type LeagueSessionView = Extract<LeagueBattleStart, { ok: true }>
/** The ranked fight on the board (null: none). */
const leagueSession = shallowRef<LeagueSessionView | null>(null)
/** What the last ranked fight did (the result screen's league panel). */
const leagueResult = shallowRef<LeagueBattleFinish | null>(null)
const leagueHubOpen = ref(false)
const leagueUnlockOpen = ref(false)
const leagueSeasonOpen = ref(false)
const leagueSeasonReward = shallowRef<LeagueSeasonRewardView | null>(null)
/** A fight is being started (the hub disables its cards). */
const leagueBusy = ref(false)
/** Why the last start failed — a `league.notice.*` key for the hub. */
const leagueNotice = ref<string | null>(null)
let leagueUnmounted = false

/** HUD button / hub / popups allowed right now (CrazyGames guests: never). */
const leagueMounted = computed(() => LEAGUE_BUILD && league.value !== null && leagueMountAllowed(currentStageId.value))
/** Champion frame (a Champion season reward) around the HUD button. */
const leagueChampionFrame = computed(() => LEAGUE_BUILD && league.value?.championFrame.value === true)

const measureLeague = (what: string, action: string) => {
  if (LEAGUE_BUILD) leagueBridge.value?.['measureLeague'](what, action)
}

/** The player's side as the league sees it: the ranked two-smasher team
 *  (league fights are always 2v2, whatever the campaign team size) and the
 *  loadout this fight would use ([] on a skills-off build / before the glue loads). */
const leagueSide = (): LeaguePlayerSide => ({
  team: rankedTeamWithUpgrades(),
  skills: sk.value?.battleSkillOptions('league').skillLoadout ?? []
})

/** The hub's `loadDeck` (null until the bridge is in). */
const loadLeagueDeckForHub = () =>
  leagueBridge.value?.['loadLeagueDeck'](leagueSide()) ?? Promise.resolve(null)
/** The hub's `fetchTop` (online, non-kids builds; null elsewhere). */
const fetchLeagueTopForHub = () =>
  leagueBridge.value?.['fetchLeagueTop']() ?? Promise.resolve(null)

/** The menu (not a battle, not a result screen) — where league surfaces may open. */
const leagueMenuPhase = (): boolean => phase.value === 'tap_to_start' || phase.value === 'idle'

function openLeagueHub() {
  if (!LEAGUE_BUILD || !leagueMounted.value || !leagueMenuPhase()) return
  leagueNotice.value = null
  leagueHubOpen.value = true
  measureLeague('hub', 'open')
}

/** Fight-start refusals the hub names (the rest: the quiet state or a retry). */
const LEAGUE_NOTICE: Partial<Record<string, string>> = {
  daily_cap: 'league.notice.dailyCap',
  no_fights: 'league.notice.noFights'
}

/** Build the ranked fight's board (also the rebuild when the loadout / the
 *  skill glue changes on tap_to_start — same seed, same opponent). */
const initLeagueBoard = () => {
  const s = leagueSession.value
  if (!s) return
  const o = s.initOptions
  initGame(
    rankedTeamWithUpgrades(),
    o.enemyTeam.map(c => ({ ...c })),
    false,
    o.arenaType,
    false,
    undefined,
    null,
    'circle',
    {
      ...(sk.value?.battleSkillOptions('league', o.enemySkillLoadout) ?? {}),
      seed: o.seed,
      firstTurn: o.firstTurn,
      terrain: { layout: layoutForSeed(o.seed), towers: true }
    }
  )
}

/** Hub → Fight: start the ranked battle (server token first on an online
 *  build) and put its board up on the ghost path. A refusal stays in the hub
 *  (the O3 quiet state, or a notice). */
const onLeagueFight = async (payload: { target: LeagueFightTarget; card: OpponentCard | null }) => {
  if (!LEAGUE_BUILD || !leagueBridge.value || leagueBusy.value || !leagueMenuPhase()) return
  leagueBusy.value = true
  leagueNotice.value = null
  try {
    // The loadout and the boss-trait port must be in before the board is
    // built (a gatekeeper encounter carries boss traits on a bosses100 build).
    if (SKILLS_BUILD && !skillsLoaded) await skillsReady
    if (BOSSES100_BUILD && !bossesLoaded) await bossesReady
    const res = await leagueBridge.value?.['createLeagueBattle']({ ...leagueSide(), target: payload.target, card: payload.card })
    if (leagueUnmounted || !res) return
    if (!res.ok) {
      leagueNotice.value = LEAGUE_NOTICE[res.error]
        ?? (res.error === 'offline' || res.error === 'unrankable' ? null : 'league.notice.retry')
      return
    }
    leagueHubOpen.value = false
    leagueResult.value = null
    ghostEnemy.value = null
    ghostMode.value = true
    coinsAwarded.value = false
    leagueSession.value = res
    lastBattleInit = initLeagueBoard
    initLeagueBoard()
  } finally {
    leagueBusy.value = false
  }
}

// ── Unlock popup + season reward: the reveal gate's rules (G13) ─────────────
// Only on tap_to_start, never mid-battle, over an ad, the cutscene or any
// modal, never on a league board, and at least LEAGUE_SURFACE_GAP_MS after
// the previous skills or league surface closed — so the unlock lands AFTER a
// skills intro, never on top of it. A short settle after tap_to_start gives
// a skills surface due on the same edge its turn first.
const LEAGUE_SURFACE_GAP_MS = 1200
const LEAGUE_SURFACE_SETTLE_MS = 400
let leagueSurfaceClosedAt = -Infinity
let tapToStartAt = -Infinity
let leagueSurfacePoll: number | null = null

/** A league surface (or board) is up, or closed too recently: the skills
 *  reveal gate waits too (part of skillGateBlockers). */
function leagueSurfaceBlocks(): boolean {
  return LEAGUE_BUILD && (
    leagueHubOpen.value || leagueUnlockOpen.value || leagueSeasonOpen.value || leagueSession.value !== null
    || performance.now() - leagueSurfaceClosedAt < LEAGUE_SURFACE_GAP_MS
  )
}

/**
 * The first-unlock popup is armed only by a closed campaign WIN screen once the
 * league is unlocked (stage ≥ LEAGUE_UNLOCK_STAGE, i.e. stage 12 beaten) — never
 * at boot, so a fresh or returning session is never greeted by it — and only
 * after a due interstitial has played on that close, so the ad never lands
 * between the popup and the next battle. Session-only: an un-armed unlock waits
 * for the next win.
 */
const leagueUnlockArmed = ref(false)

const armLeagueUnlockAfterWin = async (result: unknown, mode: string): Promise<void> => {
  if (!LEAGUE_BUILD || result !== 'win' || (mode !== 'campaign' && mode !== 'cheat')) return
  const st = league.value?.state.value
  if (!st || !st.unlocked || st.unlockSeen || !leagueMounted.value) return
  if (phase.value === 'tap_to_start') await playDueInterstitial()
  leagueUnlockArmed.value = true
}

/** Which league surface is waiting: the first-unlock popup, then a season reward. */
const leagueSurfacePending = computed<'unlock' | 'season' | null>(() => {
  const api = league.value
  if (!LEAGUE_BUILD || !api || !leagueMounted.value) return null
  const st = api.state.value
  if (st.unlocked && !st.unlockSeen && leagueUnlockArmed.value) return 'unlock'
  if (api.unclaimedSeason.value) return 'season'
  return null
})

const leagueSurfaceGateOpen = (): boolean => {
  if (phase.value !== 'tap_to_start' || leagueSession.value !== null) return false
  if (leagueHubOpen.value || leagueUnlockOpen.value || leagueSeasonOpen.value) return false
  const b = skillGateBlockers()
  if (b.pvp || b.adActive || b.cutscene) return false
  if (showReward.value || showRoulette.value || showRouletteReward.value || showBossDefeated.value
    || showSkinChestReward.value || showSkinRoulette.value || showEnemySurrender.value || configModalOpen.value || showOptions.value
    || leaderboardModalOpen.value || surrenderModalOpen.value || anyModalOverlayOpen()) return false
  const now = performance.now()
  return now - tapToStartAt >= LEAGUE_SURFACE_SETTLE_MS
    && now - leagueSurfaceClosedAt >= LEAGUE_SURFACE_GAP_MS
}

const tryOpenLeagueSurface = () => {
  const item = leagueSurfacePending.value
  if (!item || !leagueSurfaceGateOpen()) return
  if (item === 'unlock' && LeagueUnlockPopupUi) {
    leagueUnlockOpen.value = true
    measureLeague('unlock', 'visible')
  } else if (item === 'season' && LeagueSeasonRewardModalUi) {
    const reward = leagueBridge.value?.['previewSeasonReward']() ?? null
    if (!reward) return
    leagueSeasonReward.value = reward
    leagueSeasonOpen.value = true
    measureLeague('season', 'visible')
  }
}

/** Popup CTA: the hub. Either way the popup counts as seen (watcher below). */
const onLeagueUnlockEnter = () => {
  leagueUnlockOpen.value = false
  measureLeague('unlock', 'interact')
  openLeagueHub()
}

/** Season modal (arena-hosted) → claim: coins / diamonds to the wallet; the
 *  Champion frame is stored by the claim itself (useLeague). */
const onLeagueSeasonClaim = () => {
  const r = league.value?.claimSeasonReward() ?? null
  leagueSeasonOpen.value = false
  leagueSeasonReward.value = null
  if (!r) return
  if (r.coins > 0) addCoins(r.coins)
  if (r.diamonds > 0) addDiamonds(r.diamonds)
  measureLeague('season', 'claim')
  void revealRewards([{ kind: 'coins', amount: r.coins }, { kind: 'diamonds', amount: r.diamonds }], { tone: '#ffc93c' })
    .then(() => flySeasonReward(r))
}

/** #UX1b: a league season reward flies to the badge like every other grant —
 *  from where the reveal showed it, once the player has seen it. */
const flySeasonReward = (r: { coins: number, diamonds: number }) => {
  const origin = lastRevealOrigin
  if (!origin || !coinBadgeEl.value) return
  if (r.coins > 0) spawnCoinExplosion({ sourceRect: origin, targetEl: coinBadgeEl.value })
  if (r.diamonds > 0) {
    if (isSingleCurrency) spawnCoinExplosion({ sourceRect: origin, targetEl: coinBadgeEl.value })
    else {
      const badge = coinBadgeRef.value
      spawnCoinExplosion({
        sourceRect: origin,
        targetEl: badge?.diamondRowEl ?? coinBadgeEl.value,
        count: 14,
        variant: 'diamond',
        onArrive: () => badge?.celebrateDiamonds?.(r.diamonds)
      })
    }
  }
}

/** The hub hosted the claim (and already credited the wallet). It opens the
 *  reveal right after this event, so wait for that reveal to be dismissed. */
const onLeagueSeasonClaimed = (r: { coins: number, diamonds: number }) => {
  measureLeague('season', 'claim')
  void Promise.resolve().then(whenRevealIdle).then(() => flySeasonReward(r))
}

if (LEAGUE_BUILD) {
  watch(phase, (p) => {
    if (p === 'tap_to_start') tapToStartAt = performance.now()
  })
  watch(leagueUnlockOpen, (open, was) => {
    if (!was || open) return
    league.value?.markUnlockSeen()
    leagueSurfaceClosedAt = performance.now()
  })
  watch([leagueSeasonOpen, leagueHubOpen], ([season, hub], [wasSeason, wasHub]) => {
    if ((wasSeason && !season) || (wasHub && !hub)) leagueSurfaceClosedAt = performance.now()
  })
  // Light poll while a surface is waiting (most blockers are not one reactive
  // source — the same approach as the skills reveal gate).
  watch(leagueSurfacePending, (item) => {
    if (item && leagueSurfacePoll === null) {
      leagueSurfacePoll = window.setInterval(tryOpenLeagueSurface, 250)
    } else if (!item && leagueSurfacePoll !== null) {
      clearInterval(leagueSurfacePoll)
      leagueSurfacePoll = null
    }
  }, { immediate: true })
}

/** At mount on a league build: the state (stores the unlock) + the bridge. */
const loadLeagueAtMount = () => {
  if (!LEAGUE_BUILD) return
  void Promise.all([loadLeague(), loadLeagueBridge()])
    .then(([api, bridge]) => {
      if (leagueUnmounted) return
      league.value = api
      leagueBridge.value = bridge
    })
    .catch((e) => {
      console.error('[league] failed to load:', e)
    })
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

  ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0)
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
    if (jctx) {
      jctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0)
      renderJoystickOverlay(jctx, canvasWidth.value, canvasHeight.value)
    }
  }
  renderRafId = requestAnimationFrame(renderLoop)
}

let canvasObserver: IntersectionObserver | null = null
/** Removes `window.__smashers` on unmount. Always null in a production build —
 *  the seam that sets it is dev-only (see onMounted). */
let disposePreviewSeam: (() => void) | null = null

const onViewportChange = () => {
  updateCanvasSize()
  scheduleBottomMeasure()
}

onMounted(() => {
  arenaAds.mount()
  updateCanvasSize()
  scheduleBottomMeasure()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)

  initCampaignGame()
  renderRafId = requestAnimationFrame(renderLoop)
  loadLeagueAtMount()
  // Boss Lab: `?bosslab` opens it once on a dev build with cheats on (touch
  // devices have no ctrl+shift+9). Accepted before or after the `#/` of the
  // hash route (`/?bosslab#/` and `/#/?bosslab` both work).
  if (BossLabUi && cheatsOn && (new URLSearchParams(window.location.search).has('bosslab')
    || /[?&]bosslab/.test(window.location.hash))) openBossLab()

  // The stage-1 board exists; the moment the loader is gone the intro gate
  // may decide (it waits on an unsettled cloud save — see introGate.ts).
  watch(introAssetsReady, async (ready) => {
    if (!ready) return
    // The cutscene never starts under the forced-dark-mode notice.
    if (isForcedDarkBlocking.value) await whenForcedDarkGuardClear()
    armIntro()
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

  // ── Preview-recorder scripting seam (`window.__smashers`) ──────────────────
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
            initCampaignGame()
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
    // The VS screen's chunk, so the first face-off never waits on a download
    // (its skill icons pop in from 0.88 s, time enough for their own chunk).
    void import('@/components/organisms/VsIntro.vue').catch(() => { /* fail-safe in playVsIntro */ })
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

  // Invites: a `#/battle?pvp=` link, the CrazyGames invite params this
  // session opened with, or a friend accepting while the game runs (the CG
  // join-room listener) all queue on `pendingInviteCode`; the watcher joins as
  // soon as the arena is on its menu (never mid-battle — after it).
  stopCrazyMultiplayer = startCrazyMultiplayer({
    // CG `isInstantMultiplayer`: straight into a new private room, joinable
    // at once (CrazyGames multiplayer requirements).
    onInstantMultiplayer: () => {
      if (!canShowPvP.value || pvpMode.value || pvpStatus.value !== 'idle') return
      noteIntroBattleStarted()
      pvpModalOpen.value = true
      void pvpCreateLobby({ arenaType: 'default', teamSize: PVP_DEFAULT_TEAM_SIZE, levelOne: false })
    }
  })
  watch([pendingInviteCode, phase, pvpMode], joinPendingInvite, { immediate: true })

  pvpRegisterBotMatchStart(startBotMatch)

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
        // Both loadouts come from the player-ready exchange (usePVP, already
        // sanitised); `role` + the host's broadcast seed keep both peers on the
        // same streams (WP0/WP4). Skills off → no loadouts, pre-skills engine.
        // Everything the board needs is read NOW, at the match start; the
        // board itself is built at the VS screen's hand-off, a fixed
        // VS_HANDOFF_MS later on both peers (see the VS intro block).
        const pvpSkillOptions = sk.value?.pvpBattleSkillOptions() ?? {}
        const seed = currentMatchSeed()
        const role = pvpRole.value ?? undefined
        const arenaType = pvpGameConfig.value.arenaType
        const mine = myTeam.map(c => ({ ...c }))
        const theirs = enemyTeam.map(c => ({ ...c }))
        lastBattleInit = null
        const buildBoard = () => {
          try {
            initGame(mine, theirs, false, arenaType, false, undefined, {
              enabled: true,
              myTurnFirst: isMyTurn,
              role
            }, 'circle', {
              seed,
              ...pvpSkillOptions,
              // Both peers derive the layout from the host's shared seed.
              terrain: { layout: layoutForSeed(seed), towers: true }
            })
          } catch (e) {
            console.error('[PvP] Game start failed:', e)
            leavePvP()
            pvpMode.value = false
            pvpModalOpen.value = false
            initCampaignGame()
          }
        }
        // The VS screen on the pairing's first match only (rematches in the
        // same pairing skip it on BOTH peers — see vsIntro.ts).
        const matchup = vsMatchupFor('pvp')
        pvpPairingMatches++
        if (!shouldShowVsIntro(matchup, readVsSeen(), vsBotSeen)) {
          buildBoard()
          return
        }
        void playVsIntro(pvpVsData(mine, theirs)).then((ok) => {
          if (!ok || phaseNow() !== 'vs_intro' || !pvpMode.value) return
          buildBoard()
        })
      } catch (e) {
        console.error('[PvP] Game start failed:', e)
        leavePvP()
        pvpMode.value = false
        pvpModalOpen.value = false
        initCampaignGame()
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
      initCampaignGame()
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
  arenaAds.unmount()
  cancelVsIntro()
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
  if (frozenShakeTimer !== null) clearTimeout(frozenShakeTimer)
  if (frozenHintTimer !== null) clearTimeout(frozenHintTimer)
  // Also drops this instance's syncer from the platform pause registry.
  disposePhysics()
  if (renderRafId !== null) cancelAnimationFrame(renderRafId)
  if (canvasObserver) {
    canvasObserver.disconnect()
    canvasObserver = null
  }
  // Drop `window.__smashers` so a hot-reload remount never leaves the recorder
  // holding a seam bound to a torn-down instance's refs.
  if (disposePreviewSeam) {
    disposePreviewSeam()
    disposePreviewSeam = null
  }
  if (speedBoostIntervalId !== null) clearInterval(speedBoostIntervalId)
  skillsUnmounted = true
  bossesUnmounted = true
  leagueUnmounted = true
  if (leagueSurfacePoll !== null) clearInterval(leagueSurfacePoll)
  sk.value?.dispose()
  skillsScope.stop()
  clearTipCycle()
  // Always leave the arena at normal speed so other views aren't affected
  simSpeed.value = 1

  stopGameplayLifecycle()

  setOnLocalLaunch(null)
  stopCrazyMultiplayer()
  pvpRegisterBotMatchStart(null)
  // Clean up PvP if active
  if (pvpMode.value || pvpStatus.value !== 'idle') {
    leavePvP()
    pvpMode.value = false
  }
})
</script>

<template lang="pug">
  div.arena.relative.w-screen.overflow-hidden.flex.items-center.justify-center(
    class="bg-forest-900 h-screen h-dvh"
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
        //- Stage indicator (fancy themed badge) — hidden during ghost fights and PvP
        div.flex.flex-col.items-start.gap-2(data-arena-hud="stage")
          StageBadge(
            v-if="!ghostMode && !pvpMode"
            :stage-id="currentStageId"
            :name="currentStage.name"
            :cycle-suffix="currentStage.cycleSuffix"
            :is-boss="currentStage.isBoss"
            :arena-type="currentStage.arenaType"
            :lab="!!cheatStage"
          )
        //- Coin counter + Chest + Surrender
        div.flex.items-start.gap-2(data-arena-hud="top-right")
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
            //- @click: the dev Boss Lab's 20-tap cheat route (inert otherwise).
            TreasureChest(v-if="!pvpMode" :target-el="coinBadgeEl" @click="onChestDebugTap")

      //- Center overlay messages
      div.absolute.flex.items-center.justify-center(class="inset-0 z-[10]")

        //- Tap to Start
        div.tap-start(
          v-if="phase === 'tap_to_start'"
          class="text-center pointer-events-auto cursor-pointer"
          @click="beginBattle"
        )
          //- The call to action of the whole menu: XL hard stroke, a double
          //- "thump" every 2.2 s (transform only), and the hint on a navy
          //- angled plate so it reads over any arena art.
          div.tap-start-beat
            div.tap-start-title.font-black.uppercase.ui-outline-xl.whitespace-nowrap(
              ref="tapStartTitleRef"
              class="text-3xl sm:text-5xl mb-2"
            ) {{ t('spinner.tapToStart') }}
          div.tap-start-hint.ui-tag.ui-tag--ink(class="text-sm sm:text-lg")
            span.ui-outline-sm.font-black {{ t(isTouchUi ? 'spinner.startHintTap' : 'spinner.startHintClick') }}

        //- Every-10th-game countdown — rendered inside the meteor shower ring
        div(
          v-else-if="phase === 'meteor_intro' && countdownText"
          class="text-center"
        )
          div.countdown-number.font-black.game-text.text-cream-50(
            :key="countdownText"
            class="text-7xl sm:text-9xl"
          ) {{ countdownText }}

        //- Turn Announcement
        div(
          v-else-if="phase === 'deciding_turn' && turnAnnouncement"
          class="text-center"
        )
          //- Turn banner: the game's ribbon (FRibbon, #UX1c) slamming in —
          //- leaf for the player's turn, berry for the opponent's.
          FRibbon.turn-banner.ui-slam.uppercase(
            :tone="turnAnnouncement === t('spinner.yourTurn') ? 'leaf' : 'berry'"
            class="text-2xl sm:text-4xl"
          ) {{ turnAnnouncement }}

        //- Opponent's turn label (PvP only — shown at top so player knows to wait)
        div(
          v-else-if="pvpMode && (phase === 'npc_turn' || phase === 'npc_launched')"
          class="absolute text-center top-4 left-0 right-0"
          :style="{ top: `calc(1rem + env(safe-area-inset-top, 0px))` }"
        )
          FRibbon.opp-turn-tag.ui-drop-in.uppercase(
            tone="berry"
            tag="span"
            class="text-lg sm:text-2xl"
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
          :style="dragHintStyle"
        )
          //- A tap on a frozen spinner swaps the hint for why (Frost Lock).
          div.drag-hint-text.drag-hint-frozen.game-text.leading-tight.font-bold(
            v-if="frozenHintIdx >= 0"
            class="text-xs sm:text-sm"
            role="status"
            data-frozen-hint
          ) {{ t('bosses.frozenHint') }}
          div.drag-hint-text.drag-hint-plate.text-cream-50.game-text.leading-tight(v-else class="text-xs sm:text-sm")
            | {{ t('spinner.dragHint') }}


      //- Boss intro card — stage-101+ encounters, inside the meteor intro.
      component(
        v-if="BossIntroCardUi && bossIntroShown && bossIntro"
        :is="BossIntroCardUi"
        class="z-[11]"
        :name-key="bossIntro.nameKey"
        :cycle-suffix="bossIntro.cycleSuffix"
        :model-id="bossIntro.modelId"
        :traits="bossIntro.traits"
        @done="bossIntroShown = false"
      )

      //- VS intro — the 5 s face-off before a new matchup (src/use/vsIntro.ts).
      //- Mounted for its own lifetime (it outlives the hand-off by the wipe).
      component(
        v-if="vsIntro"
        :is="VsIntroUi"
        :data="vsIntro"
        :paused="isGamePaused"
        @start="onVsStart"
        @handoff="onVsHandoff"
        @done="onVsDone"
      )

      //- Blade Stats HUD — bottom corners during active battle
      //- Three cards (team size 3): in portrait they share the row under the
      //- arena; anywhere wider the middle card would sit on the player's
      //- tree, so the third card stacks above the first (bladeStatsStacked).
      div.blade-stats-hud(
        v-if="isBattleActive && bladeStats.length > 0"
        :class="{ 'blade-stats--stacked': bladeStatsStacked }"
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
          :data-arena-hud="`card${idx}`"
          :class="{ 'blade-stat-dead': bs.dead, 'blade-stat-frozen': bs.trait.frozen, 'blade-stat-chilled': bs.trait.chill > 0, 'blade-stat-shake': frozenShakeIdx === idx }"
          :role="bs.trait.frozen || bs.trait.chill > 0 ? 'group' : undefined"
          :aria-label="bs.trait.frozen ? t('bosses.frozenAria') : (bs.trait.chill > 0 ? t('bosses.chillAria', { pct: bs.trait.chillPct }) : undefined)"
          :data-trait-frozen="bs.trait.frozen ? '' : undefined"
          :data-trait-chill="bs.trait.chill > 0 ? bs.trait.chill : undefined"
          :style="{\
            transform: `scale(${uiStatScale})`,\
            transformOrigin: idx === 0 || (bladeStatsStacked && idx % 2 === 0) ? 'bottom left' : 'bottom right'\
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
          //- Frozen (Frost Lock): an ice block over the card's corner.
          component.blade-stat-ice(v-if="BossTraitGlyphUi && bs.trait.frozen" :is="BossTraitGlyphUi" trait="frost" :size="18" decorative)
          div.blade-stat-grid
            div.blade-stat-row
              StatIcon.blade-stat-icon.text-leaf-400(stat="hp")
              span.text-leaf-300 {{ bs.hp }}
            div.blade-stat-row
              StatIcon.blade-stat-icon.text-berry-400(stat="attack")
              span.text-berry-300 {{ statNum(bs.atk) }}
            div.blade-stat-row
              StatIcon.blade-stat-icon.text-sky-400(stat="defense")
              span.text-sky-300 {{ statNum(bs.def) }}
            div.blade-stat-row
              StatIcon.blade-stat-icon.text-sun-400(stat="speed")
              span(:class="bs.trait.chill > 0 ? 'blade-stat-spd-chilled' : 'text-sun-300'") {{ statNum(bs.spd) }}
          //- Chilled (Frostbite): one snowflake pip per live stack, under SPD.
          div.blade-chill-pips(v-if="BossTraitGlyphUi && bs.trait.chill > 0" aria-hidden="true")
            component(v-for="n in bs.trait.chill" :key="n" :is="BossTraitGlyphUi" trait="chill" :size="10" decorative)
          //- Equipped skills of THIS spinner (its own shield / cooldown /
          //- counters) — only in a battle where skills are live (§8.1).
          div.blade-skill-row(v-if="SkillHudChip && sk && sk.hudRows[idx]?.length")
            component(
              v-for="chip in sk.hudRows[idx]"
              :key="chip.id"
              :is="SkillHudChip"
              :id="chip.id"
              :skill-key="chip.key"
              :level="chip.level"
              :state="chip.state"
              :breathe="sk.hudBreathe"
            )

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
        data-arena-hud="stack-bl"
        class="ui-stack-bl fixed pointer-events-auto z-50 flex flex-col items-start gap-1"
        :style="{\
          bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
          left: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          transform: `scale(${uiBtnScale})`,\
          transformOrigin: 'bottom left'\
        }"
      )
        FMuteButton
        FIconButton.ui-hit-44(
          class="sm:mb-4"
          type="secondary"
          size="md"
          :aria-label="t('options')"
          data-testid="hud-options"
          @click="showOptions = true"
        )
          UiIcon(name="settings")
        div.flex.items-end(class="gap-0 sm:gap-2")
          DailyRewards(v-if="currentStageId >= 3" @coins-awarded="fireCoinExplosion")
          component(
            v-if="HudCoinsAdButton && currentStageId >= 3"
            :is="HudCoinsAdButton"
            @coins-awarded="fireCoinExplosion"
          )
          BattlePass(v-if="currentStageId >= 6" @coins-awarded="fireCoinExplosion")

      //- Bottom-right buttons — two stacked rows:
      //-   row 1: 1x/2x speed switch
      //-   row 2: pvp → leaderboard → team config
      div(
        v-if="showConfigButton && !showReward"
        data-arena-hud="stack-br"
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
          @opened="onSkinChestOpened"
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
                :src="movieIconSrc()"
                class="right-0 top-1/2 -translate-y-[50%] h-3 w-3 mr-1.5"
              )
          //- Free boost (useFreeSpeedGift — first-time gift or today's daily
          //- one): a shiny FREE sticker on the 2x corner instead of the movie
          //- icon while an ad-free boost is unspent. Hidden while a boost runs. Outside the switch — its pill clips overflow — and
          //- right-anchored so long locales grow left across the switch.
          span.speed-free-badge.ui-chip.ui-chip--leaf.absolute.pointer-events-none.whitespace-nowrap.font-black.game-text.leading-none(
            v-if="simSpeed === 1 && !is2xAvailable && hasAnyFreeSpeedGift"
            class="right-0 -top-2 px-1.5 py-0.5 text-[8px] sm:text-[9px]"
          ) {{ t('spinner.free') }}
          //- Ad disclosure (native builds — Families policy): once no free gift
          //- is left, a tap on 2x opens a rewarded ad, and the 12px film reel
          //- inside the button is not a label. The word goes in the FREE
          //- sticker's slot, like the "Ad" on every other rewarded button.
          span.speed-ad-badge.ui-chip.ui-chip--sky.absolute.pointer-events-none.whitespace-nowrap.font-black.game-text.leading-none(
            v-if="isNative && !IS_COIN_SPEED_BOOST_BUILD && simSpeed === 1 && !is2xAvailable && !hasAnyFreeSpeedGift"
            class="right-0 -top-2 px-1.5 py-0.5 text-[9px] sm:text-[10px]"
          ) {{ t('spinner.ad') }}
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
          //- League HUD button (tier + fights left). Champion frame once a
          //- Champion season reward granted it.
          div.rank-frame-slot(
            v-if="LeagueHudButtonUi && league && leagueMounted && !ghostMode && !pvpMode && !showConfigSpotlight"
            :class="{ 'rank-frame-slot--champion': leagueChampionFrame }"
          )
            component(:is="LeagueHudButtonUi" :league="league" @open="openLeagueHub")
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
          FIconButton.ui-hit-44(
            v-if="leaderboardVisible && currentStageId >= LEADERBOARD_MIN_STAGE && !ghostMode && !pvpMode && !showConfigSpotlight"
            type="secondary"
            size="md"
            :aria-label="t('leaderboard.title')"
            data-testid="hud-leaderboard"
            @click="leaderboardModalOpen = true"
          )
            UiIcon(name="leaderboard")
          //- flex: no inline line box under the button (its descender gap
          //- lifted this button above the rest of the row).
          div.relative.flex(v-if="(hasFirstWin || currentStageId >= 2) && !leagueSession")
            //- Smasher upgrade / team: the disc + paw + up-arrow icon.
            FIconButton.ui-hit-44(
              type="secondary"
              :class="{ 'instant-bounce': showConfigSpotlight }"
              size="md"
              :aria-label="t('sfc.SmasherTeamModal.team')"
              data-testid="hud-team"
              @click="onOpenConfig"
            )
              UiIcon(name="upgrade")
            //- A team slot just opened (stage 3 / 10 won): "!" until the modal shows it.
            span.ui-notify.team-slot-notify(v-if="teamSlotBadge" aria-hidden="true" data-testid="team-slot-badge") !

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
      :celebrate="gameResult === 'win'"
      :ribbon-tone="gameResult === 'lose' ? 'berry' : 'leaf'"
      @continue="onRewardContinue"
    )
      template(#ribbon)
        span(:class="{ 'sm:text-2xl': !isMobileLandscape && !isMobilePortrait }") {{ pvpMode ? t('pvp.title') : t('spinner.rewards') }}
      //- The click-to-continue prompt used to be absolutely positioned at the
      //- overlay's bottom edge, so this column reserved a `mb-20 sm:mb-24`
      //- safety strip to stay out from under it. The prompt is a normal flex
      //- child now (see FReward), so the strip is no longer needed — and on a
      //- short landscape viewport those 96px were pushing the result text off
      //- the top of the scroll area. A small gap is all that's left.
      div.reward-column.flex.flex-col.items-center(class="mb-2 sm:mb-3")
        //- The verdict SLAMS in (big → overshoot → settle) with the XL stroke;
        //- a win also gets a slow victory wobble afterwards.
        div.reward-result-text.font-black.uppercase.ui-slam(
          :class="gameResult === 'win' ? 'text-sun-300 is-win' : 'text-berry-400 is-lose'"
          :style="{ '--slam-delay': '120ms' }"
        ) {{ resultText }}
        //- PvP rewards: coins + honor points
        template(v-if="pvpMode")
          div.reward-coin-row.flex.items-center.gap-3(ref="rewardCoinRef")
            IconCoin.reward-coin-icon(class="w-8 h-8 text-sun-400")
            FCountUp.reward-coin-amount.text-sun-300.font-black(
              :value="PVP_COIN_REWARD + winAdExtra"
              prefix="+"
              :delay="380"
              ting
            )
          div.honor-reward.flex.items-center.gap-2(v-if="lastHonorEarned > 0")
            span.text-plum-300.font-black.game-text(class="text-xl sm:text-2xl") +{{ lastHonorEarned }}
            span.text-plum-300.font-bold.game-text.uppercase(class="text-sm sm:text-lg") {{ t('pvp.honor') }}
        //- League fight: the LP panel (it shows the coins it paid) + honour.
        template(v-else-if="leagueSession")
          div(ref="rewardCoinRef")
            component(v-if="LeagueResultPanelUi && leagueResult" :is="LeagueResultPanelUi" :outcome="leagueResult.outcome")
          div.honor-reward.flex.items-center.gap-2(v-if="lastHonorEarned > 0")
            span.text-plum-300.font-black.game-text(class="text-xl sm:text-2xl") +{{ lastHonorEarned }}
            span.text-plum-300.font-bold.game-text.uppercase(class="text-sm sm:text-lg") {{ t('pvp.honor') }}
        //- Campaign / leaderboard rewards
        template(v-else)
          //- `.reward-meta` and `.reward-meta__stack` are `display: contents`
          //- (no box: coins, rank and boss peek sit in the column exactly as
          //- before) EXCEPT on short screens, where they rebalance so the big
          //- boss portrait fits without scrolling — see the style block.
          div.reward-meta(:class="{ 'has-peek': bossPeek && gameResult === 'win' }")
            div.reward-meta__stack
              //- The coins COUNT UP (ticks rising in pitch, a ting + bump on
              //- landing); the 3x ad's extra counts on from there.
              div.reward-coin-row.flex.items-center.gap-3(ref="rewardCoinRef")
                IconCoin.reward-coin-icon(class="w-8 h-8 text-sun-400")
                FCountUp.reward-coin-amount.text-sun-300.font-black(
                  :value="grantedCoins + winAdExtra"
                  prefix="+"
                  :delay="380"
                  ting
                )
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
            BossPeekBadge.reward-peek(v-if="bossPeek && gameResult === 'win'" :peek="bossPeek")
        //- "[movie] 3x [coin]" — non-boss win screens, ad builds only. Pays
        //- the base twice more so the label above ends on 3x of it.
        component(
          v-if="WinCoinsAdButton && showWinCoinsAd"
          :is="WinCoinsAdButton"
          :base-coins="winAdBaseCoins"
          @coins-awarded="onWinAdCoins"
          @busy="onWinAdBusy"
          class="reward-ad"
        )
        //- Player tip — kept in the flex column so it always renders
        //- BELOW the reward (no chance of covering it) and ABOVE the
        //- tap-to-continue prompt (which is absolutely docked to the
        //- overlay's bottom edge). On very short viewports the badge
        //- shrinks via its own responsive padding/text classes; the
        //- centered column never sits flush against the bottom because
        //- the click-to-continue strip reserves its own band.
        TipBadge.reward-tip(
          v-if="currentTip"
          :text-key="`tips.${currentTip}`"
        )

    //- "BOSS DEFEATED" title card — boss win only, before the roulette.
    Transition(name="fade")
      BossDefeatedBanner(v-if="showBossDefeated" @done="onBossDefeatedDone")

    //- Boss Roulette Overlay (wheel spinning)
    FReward(
      v-model="showRoulette"
      ribbon-tone="sun"
      :show-continue="false"
    )
      template(#ribbon)
        span(class="sm:text-2xl") {{ t('spinner.rewards') }}
      //- Tighter `gap-2` on short viewports so the wheel + spin-again
      //- buttons fit alongside the result text and the ribbon. The
      //- result text caps at text-4xl now (was text-5xl) — prior version
      //- pushed the buttons below the fold on the CG iframe in
      //- landscape. CG QA caught it 2026-05-05.
      div.flex.flex-col.items-center.roulette-overlay-content(class="gap-2 sm:gap-3")
        div.font-black.uppercase.game-text.text-sun-300.roulette-result-text(
          class="text-2xl sm:text-4xl"
        ) {{ resultText }}
        RouletteWheel(@result="onRouletteResult" @done="onRouletteDone")

    //- Roulette Reward Celebration
    FReward(
      v-model="showRouletteReward"
      ribbon-tone="sun"
      :show-continue="rouletteRewardReady"
      celebrate
      @continue="onRouletteRewardContinue"
    )
      template(#ribbon)
        span(class="sm:text-2xl") {{ t('spinner.rewards') }}
      //- One reward per granted spin. With the "Spin Again" respin there are
      //- TWO — the respin ADDS to the first, it never replaces it — shown side
      //- by side with a "+" between them and the second tagged "Spin Again".
      //- Each "+" lives in the SAME no-wrap slot as the grant it precedes, so
      //- when the row wraps (360 px with three trophies) the "+" moves down
      //- with its grant instead of dangling at the end of the first line (V1).
      div.roulette-reward-enter.w-full.flex.flex-wrap.items-center.justify-center(
        class="gap-x-3 gap-y-4 sm:gap-x-6"
        :class="{ 'is-double': rouletteGrants.length + trophyGrants.length > 1 }"
      )
        div.roulette-grant-slot.shrink-0.flex.flex-nowrap.items-center(
          v-for="(g, i) in rouletteGrants"
          :key="i"
          class="gap-x-3 sm:gap-x-6"
        )
          div.roulette-grant-plus.font-black.game-text.text-white(
            v-if="i > 0"
            class="text-4xl sm:text-6xl"
            aria-hidden="true"
          ) +
          div.roulette-grant.flex.flex-col.items-center(
            class="gap-3 sm:gap-4"
            :data-roulette-grant="g.type"
          )
            div.roulette-grant-tag.font-black.uppercase.game-text.text-sun-200(
              v-if="i > 0"
              class="text-xs sm:text-sm tracking-[0.04em]"
            ) {{ t('spinner.spinAgain') }}
            //- Jackpot (ultra-rare): a fixed coin prize (it paid diamonds
            //- until 2026-10-21 — see rouletteGrants.ts).
            template(v-if="g.type === 'jackpot'")
              div.roulette-reward-glow.flex.flex-col.items-center.gap-2
                IconCoin.roulette-grant-icon.text-sun-400
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconCoin(class="w-8 h-8 text-sun-400")
                span.roulette-grant-amount.font-black.game-text.text-sun-300 +{{ g.coins }}
            //- Skin reward (plus the 1x coins that come with it)
            template(v-else-if="g.skin")
              div.roulette-reward-glow.flex.flex-col.items-center.gap-3
                img.roulette-grant-icon.object-contain(class="drop-shadow-[0_3px_0_var(--color-ink)]"
                  :src="modelImgPath(g.skin.modelId)"
                  :alt="t(`skins.${g.skin.modelId}`)"
                )
                span.roulette-grant-skin.text-plum-300.font-black.game-text.uppercase {{ t(`skins.${g.skin.modelId}`) }}
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconCoin(class="w-6 h-6 text-sun-400")
                span.text-sun-300.font-black.game-text(class="text-xl sm:text-2xl") +{{ g.coins }}
            //- Coin multiplier reward
            template(v-else)
              div.roulette-reward-glow.flex.flex-col.items-center.gap-2
                span.roulette-grant-mult.text-sun-400.font-black.game-text {{ g.multiplier }}x
              div.flex.items-center.gap-3(:ref="(el) => setRouletteRowRef(el, i)")
                IconCoin(class="w-8 h-8 text-sun-400")
                span.roulette-grant-amount.text-sun-300.font-black.game-text +{{ g.coins }}
        //- Boss trophy (§3.5): the earn-only skin(s) this encounter win just
        //- unlocked — already owned, the card only celebrates it (bosses gate
        //- handle: null on a bosses100-off build, where nothing is granted).
        template(v-if="BossTrophyCardUi")
          div.roulette-grant-slot.shrink-0.flex.flex-nowrap.items-center(
            v-for="(id, ti) in trophyGrants"
            :key="`trophy-${id}`"
            class="gap-x-3 sm:gap-x-6"
          )
            div.roulette-grant-plus.font-black.game-text.text-white(
              v-if="rouletteGrants.length > 0 || ti > 0"
              class="text-4xl sm:text-6xl"
              aria-hidden="true"
            ) +
            component(:is="BossTrophyCardUi" :skin-id="id")

    //- Boss Lab — DEV-only cheat modal (ctrl+shift+9 / ?bosslab / 20 chest
    //- taps), async chunk.
    component(
      v-if="BossLabUi && cheatsOn && bossLabOpen"
      :is="BossLabUi"
      v-model="bossLabOpen"
      :peak-top="bossLabPeak.top"
      :peak-bottom="bossLabPeak.bottom"
      @launch="onBossLabLaunch"
    )

    //- 20h Skin Chest → skins-only roulette (previewed skin at 3x chance)
    FReward(
      v-model="showSkinRoulette"
      ribbon-tone="sun"
      :show-continue="false"
    )
      template(#ribbon)
        span(class="sm:text-2xl") {{ t('spinner.rewards') }}
      div.flex.flex-col.items-center.roulette-overlay-content(class="gap-2 sm:gap-3")
        RouletteWheel(
          v-if="skinChestFeatured"
          mode="skins"
          :featured-skin="skinChestFeatured"
          @result="onSkinRouletteResult"
          @done="onSkinRouletteDone"
        )

    //- Skin roulette celebration — one card per skin won (two with the respin)
    FReward(
      v-model="showSkinChestReward"
      ribbon-tone="sun"
      :show-continue="true"
      celebrate
      tone="#c47dff"
      @continue="onSkinChestRewardContinue"
    )
      template(#ribbon)
        span(class="sm:text-2xl") {{ t('spinner.rewards') }}
      div.flex.flex-wrap.items-center.justify-center.roulette-reward-enter(class="gap-x-6 gap-y-4")
        div.roulette-reward-glow.flex.flex-col.items-center.gap-3(
          v-for="w in skinChestWins"
          :key="w.modelId"
        )
          img.object-contain(class="drop-shadow-[0_3px_0_var(--color-ink)]"
            :src="modelImgPath(w.modelId)"
            :alt="t(`skins.${w.modelId}`)"
            :class="w.isSpecial ? 'w-32 h-32 sm:w-40 sm:h-40' : 'w-24 h-24 sm:w-32 sm:h-32'"
          )
          span.font-black.game-text.uppercase(
            :class="w.isSpecial ? 'text-sun-400 text-2xl sm:text-4xl' : 'text-plum-300 text-xl sm:text-3xl'"
          ) {{ t('skinChest.acquired', { name: t(`skins.${w.modelId}`) }) }}

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
    SmasherTeamModal(
      v-model="configModalOpen"
      :initial-team="playerTeam"
      :best-stage="bestStage"
      :ads-allowed="!pvpMode"
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
        div.text-ink.font-black.uppercase.text-center(class="text-xl sm:text-3xl") {{ t('pvp.enemySurrendered') }}
        div.ui-breathe
          button.ui-btn.ui-btn--primary.ui-btn--hero.ui-shine.font-black.uppercase.cursor-pointer(
            class="px-8 py-3 text-lg sm:text-xl"
            @click="showEnemySurrender = false"
          )
            span {{ t('pvp.okay') }}

    //- ── League (LG6) — gate handles, null on a league-off build ──────────
    //- (`:league` stays the LAST dynamic prop: the compiled dynamic-props
    //- list keeps its names even when the handle is null, and a "league"
    //- followed by another name reads as the league audit's measure marker.)
    component(
      v-if="LeagueHubUi && league && leagueMounted"
      :is="LeagueHubUi"
      v-model="leagueHubOpen"
      :load-deck="loadLeagueDeckForHub"
      :fetch-top="fetchLeagueTopForHub"
      :busy="leagueBusy"
      :notice="leagueNotice"
      :league="league"
      @fight="onLeagueFight"
      @season-claimed="onLeagueSeasonClaimed"
    )
    component(
      v-if="LeagueUnlockPopupUi && league && leagueUnlockOpen"
      :is="LeagueUnlockPopupUi"
      v-model="leagueUnlockOpen"
      @enter="onLeagueUnlockEnter"
    )
    component(
      v-if="LeagueSeasonRewardModalUi && league && leagueSeasonOpen"
      :is="LeagueSeasonRewardModalUi"
      v-model="leagueSeasonOpen"
      :reward="leagueSeasonReward"
      @claim="onLeagueSeasonClaim"
    )

    //- One-line confirmations ("Rewards claimed: 7") — #UX1c.
    HudToast
    //- First-launch intro cutscene — above every HUD element, lazily loaded.
    IntroCutscene(v-if="introPlaying" @done="onIntroDone")

</template>

<style scoped lang="sass">
// ── Champion frame around the league HUD button (LG6) ───────────────────
.rank-frame-slot
  position: relative
  display: inline-block

.rank-frame-slot--champion::before
  content: ''
  position: absolute
  inset: -4px
  border-radius: 12px
  border: 3px solid var(--color-sun-400)
  box-shadow: 0 0 0 2px var(--color-ink), inset 0 0 0 2px var(--color-sun-200)
  pointer-events: none
  z-index: 1

// ── New team slot badge on the Team button ──────────────────────────────
.team-slot-notify
  position: absolute
  top: -0.5rem
  right: -0.5rem
  z-index: 3
  pointer-events: none

// ── First-Config Spotlight ──────────────────────────────────────────────
.config-spotlight
  position: fixed
  inset: 0
  z-index: 55
  background: color-mix(in srgb, var(--color-wood-900) 70%, transparent)
  pointer-events: auto

.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

// ── Roulette Reward Celebration ─────────────────────────────────────────
.roulette-reward-enter
  animation: roulette-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)

// The prize bobs and breathes (transform only — no brightness filter).
.roulette-reward-glow
  animation: roulette-glow 1.8s ease-in-out infinite

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
  text-shadow: var(--ui-stroke-xl)
  @media (min-width: 640px)
    font-size: 4.5rem

.roulette-grant-amount
  font-size: 1.875rem
  text-shadow: var(--ui-stroke-lg)
  @media (min-width: 640px)
    font-size: 3rem

// "SPIN AGAIN" tag over the second grant: an angled sun chip.
.roulette-grant-tag
  padding: 0.15em 0.6em 0.22em
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem
  background-color: var(--color-sun-400)
  color: var(--color-ink)
  text-shadow: none
  box-shadow: inset 0 -2px 0 var(--color-sun-600), 0 2px 0 var(--color-ink)

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
    transform: translateY(0) scale(1)
  50%
    transform: translateY(-5px) scale(1.06)

@media (prefers-reduced-motion: reduce)
  .roulette-reward-glow, .roulette-reward-enter
    animation: none

.speedup-switch
  :deep(.button-wrap:last-of-type button)
    margin-right: 0.5rem

// FREE gift sticker on the speed switch: gentle pulse + a light sheen
// sweeping across. Scales from its right edge, where it is anchored.
.speed-free-badge
  z-index: 1
  overflow: hidden
  transform-origin: right center
  animation: speed-free-pulse 1.4s ease-in-out infinite

  // Hard-edged double strip (no soft ramp), same language as .ui-shine.
  &::after
    content: ''
    position: absolute
    top: 0
    bottom: 0
    left: 0
    width: 60%
    background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.6) 0 50%, transparent 50% 68%, rgba(255, 255, 255, 0.6) 68% 100%)
    transform: translateX(-180%) skewX(-22deg)
    animation: speed-free-sheen 2.4s ease-in-out infinite

@keyframes speed-free-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.12)

@keyframes speed-free-sheen
  0%, 55%
    transform: translateX(-180%) skewX(-22deg)
  100%
    transform: translateX(260%) skewX(-22deg)

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
  color: var(--color-sun-300)
  text-shadow: 3px 0 0 var(--color-ink), -3px 0 0 var(--color-ink), 0 3px 0 var(--color-ink), 0 -3px 0 var(--color-ink), 2px 2px 0 var(--color-ink), -2px 2px 0 var(--color-ink), 2px -2px 0 var(--color-ink), -2px -2px 0 var(--color-ink), 0 6px 0 var(--color-ink)
  animation: countdown-pop 375ms ease-out forwards
  will-change: transform, opacity

// Each number punches in tilted, lands straight, then blows past the camera.
@keyframes countdown-pop
  0%
    transform: scale(0.4) rotate(-12deg)
    opacity: 0
  20%
    transform: scale(1.08) rotate(2deg)
    opacity: 1
  30%
    transform: scale(1) rotate(0)
  100%
    transform: scale(2.6)
    opacity: 0

// ── Honor Reward: a solid plum plate with a hard double-strip shine ─────
.honor-reward
  position: relative
  overflow: hidden
  padding: 0.25rem 0.85rem
  border-radius: var(--radius-ui-sm)
  border: 3px solid var(--color-ink)
  background-color: var(--color-plum-700)
  background-image: var(--ui-facet)
  box-shadow: inset 0 3px 0 var(--color-plum-500), 0 4px 0 var(--color-ink)
  animation: ui-pop-in 0.34s var(--ui-back-out) 0.5s both

  .text-plum-300
    color: var(--color-plum-300)
    text-shadow: var(--ui-stroke-sm)

  &::after
    content: ''
    position: absolute
    top: -10%
    bottom: -10%
    left: 0
    width: 40%
    background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.3) 0 55%, transparent 55% 70%, rgba(255, 255, 255, 0.3) 70% 100%)
    transform: translateX(-180%) skewX(-22deg)
    animation: honor-shine 2.6s ease-in-out infinite

@keyframes honor-shine
  0%, 55%
    transform: translateX(-180%) skewX(-22deg)
  100%
    transform: translateX(320%) skewX(-22deg)

@media (prefers-reduced-motion: reduce)
  .honor-reward, .honor-reward::after
    animation: none

// ── Result: verdict + coin row ───────────────────────────────────────────
// ─── Reward overlay — fluid fit ──────────────────────────────────────────
// Everything on the win / lose screen is sized from the viewport HEIGHT (dvh,
// clamped), not from breakpoints, so the whole column fits the screen at any
// size without scrolling. Priority when space runs short: verdict, coins, the
// 3x coin ad (always above the boss peek), then the boss peek, then the tip
// (hidden on short screens).
.reward-column
  --ru: 1dvh
  gap: clamp(0.3rem, calc(var(--ru) * 1.8), 1rem)
  max-height: 100%
  min-height: 0

.reward-result-text
  // height-led, but never wider than the screen: one line at 360 px wide too
  font-size: clamp(1.4rem, min(calc(var(--ru) * 8), 8.2vw), 3.4rem)

.reward-coin-row
  gap: clamp(0.35rem, calc(var(--ru) * 1.6), 0.75rem)

  .reward-coin-amount
    font-size: clamp(1.35rem, calc(var(--ru) * 6.4), 2.4rem)

  .reward-coin-icon
    width: clamp(1.5rem, calc(var(--ru) * 6.4), 2.3rem)
    height: clamp(1.5rem, calc(var(--ru) * 6.4), 2.3rem)

.reward-ad
  order: 1
  flex: none

.reward-column .reward-peek
  order: 2
  // the boss portrait takes the height the rest leaves over, never more
  --frame-w: clamp(4.5rem, calc(var(--ru) * 15), 8rem)
  flex: none

.reward-tip
  order: 3

@media (max-height: 560px)
  .reward-tip
    display: none

.reward-result-text
  text-shadow: var(--ui-stroke-xl)
  letter-spacing: 0.02em
  line-height: 1.05

  // After the slam, a win keeps a slow victory wobble.
  &.is-win
    animation: ui-slam 0.42s cubic-bezier(0.2, 1.5, 0.4, 1) 120ms both, result-wobble 2.4s ease-in-out 0.8s infinite

@keyframes result-wobble
  0%, 100%
    transform: rotate(-2deg) scale(1)
  50%
    transform: rotate(2deg) scale(1.04)

.reward-coin-row
  .reward-coin-amount
    text-shadow: var(--ui-stroke-lg)

  .reward-coin-icon
    animation: ui-pop-in 0.34s var(--ui-back-out) 0.3s both

@media (prefers-reduced-motion: reduce)
  .reward-result-text.is-win, .reward-coin-row .reward-coin-icon
    animation: none

// ── Turn banners (FRibbon) ──────────────────────────────────────────────
.turn-banner, .opp-turn-tag
  letter-spacing: 0.03em

// ── Tap to start ─────────────────────────────────────────────────────────
// A double thump, then rest: reads as "go!" rather than a fading prompt.
.tap-start-beat
  animation: tap-start-beat 2.2s ease-in-out infinite

@keyframes tap-start-beat
  0%, 40%, 100%
    transform: scale(1)
  10%
    transform: scale(1.08) rotate(-1.5deg)
  20%
    transform: scale(0.98)
  30%
    transform: scale(1.04) rotate(0.8deg)

.tap-start-hint
  padding: 0.25em 1em 0.35em

@media (prefers-reduced-motion: reduce)
  .tap-start-beat
    animation: none

// The drag hint on a navy plate: legible over any arena tile.
.drag-hint-plate
  display: inline-block
  padding: 0.2rem 0.7rem 0.3rem
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui-sm)
  background-color: var(--color-royal-900)
  box-shadow: inset 0 2px 0 var(--color-royal-700), 0 3px 0 var(--color-ink)

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

.roulette-grant-plus
  color: var(--color-cream-50)

// ── Blade skill chips (skills §8.1) ──────────────────────────────────────
.blade-skill-row
  display: flex
  justify-content: center
  gap: 0.2rem
  margin-top: 0.15rem

// ── Blade Stats HUD ──────────────────────────────────────────────────────
// Solid navy counter plate (no see-through mix): a royal lip, a hard drop,
// and the per-blade label on a royal strip across the top.
.blade-stat-card
  background-color: var(--color-royal-900)
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui-sm)
  box-shadow: inset 0 2px 0 var(--color-royal-700), 0 3px 0 var(--color-ink)
  padding: 0.2rem 0.4rem
  transition: opacity 0.3s ease

.blade-stat-dead
  opacity: 0.35

// Team size 3 off phone portrait: card 1 bottom-left, card 2 bottom-right,
// card 3 above card 1.
.blade-stats-hud.blade-stats--stacked
  display: grid
  grid-template-columns: auto 1fr auto
  align-items: end
  row-gap: 0.4rem
  > .blade-stat-card:nth-child(1)
    grid-column: 1
    grid-row: 2
  > .blade-stat-card:nth-child(2)
    grid-column: 3
    justify-self: end
    grid-row: 2
  > .blade-stat-card:nth-child(3)
    grid-column: 1
    justify-self: start
    grid-row: 1

// ── Boss traits on the stat card (bosses-100-feature.md §7.3) ─────────────
// Frozen: ice-blue tint + frosted rim; an ice-block glyph on the corner.
.blade-stat-card.blade-stat-frozen
  background: var(--color-sky-600)
  border-color: var(--color-sky-200)
  box-shadow: inset 0 2px 0 var(--color-sky-400), 0 2px 0 var(--color-ink)

.blade-stat-ice
  position: absolute
  top: -0.5rem
  right: -0.45rem

// Chilled: the SPD value in ice-blue and one snowflake pip per stack.
.blade-stat-card.blade-stat-chilled
  border-color: var(--color-sky-300)

.blade-stat-spd-chilled
  color: var(--color-sky-200)

.blade-chill-pips
  display: flex
  justify-content: center
  gap: 0.1rem
  margin-top: 0.1rem

// Refused tap on a frozen spinner: a 150 ms side shake. It animates the
// `translate` property so it composes with the card's inline scale transform.
.blade-stat-shake
  animation: blade-stat-shake 150ms linear

@keyframes blade-stat-shake
  0%, 100%
    translate: 0 0
  25%
    translate: -3px 0
  50%
    translate: 3px 0
  75%
    translate: -2px 0

@media (prefers-reduced-motion: reduce)
  .blade-stat-shake
    animation: none

// Frozen-tap hint (replaces the drag hint for a moment).
.drag-hint-frozen
  color: var(--color-sky-200)

// The boss trophy card's own sizes live in BossTrophyCard.vue (bosses gate).

.blade-stat-label
  font-size: 0.6rem
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  color: var(--color-ice-50)
  text-align: center
  line-height: 1
  margin: -0.2rem -0.4rem 0.2rem
  padding: 0.12rem 0.3rem 0.15rem
  background-color: var(--color-royal-600)
  background-image: var(--ui-facet)
  border-bottom: 2px solid var(--color-ink)
  border-radius: calc(var(--radius-ui-sm) - 2px) calc(var(--radius-ui-sm) - 2px) 0 0
  text-shadow: var(--ui-stroke-sm)

.blade-stat-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0 0.35rem

.blade-stat-row
  display: flex
  align-items: center
  gap: 0.15rem
  font-size: 0.65rem
  font-weight: 900
  line-height: 1.3
  font-variant-numeric: tabular-nums
  text-shadow: var(--ui-stroke-sm)

.blade-stat-icon
  width: 0.91rem
  height: 0.91rem
  flex-shrink: 0

@media (min-width: 640px)
  .blade-stat-card
    padding: 0.25rem 0.5rem
  .blade-stat-label
    font-size: 0.7rem
    margin: -0.25rem -0.5rem 0.2rem
  .blade-stat-grid
    gap: 0 0.4rem
  .blade-stat-row
    font-size: 0.75rem
    gap: 0.2rem
  .blade-stat-icon
    width: 1.05rem
    height: 1.05rem

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

  // Roulette reward row with several grants (Spin Again and/or boss trophy
  // cards, BossTrophyCard.vue shrinks its own parts): tighter gaps, a smaller
  // "+" and smaller grants so up to three trophies stay above the fold at
  // 740x360 instead of wrapping onto a second row below it.
  .is-double
    column-gap: 0.5rem
    row-gap: 0.25rem

    .roulette-grant-slot
      column-gap: 0.5rem

    .roulette-grant-plus
      font-size: 1.75rem
      line-height: 1

    .roulette-grant
      gap: 0.25rem

    .roulette-grant-icon
      width: 2.75rem
      height: 2.75rem

    .roulette-grant-skin
      font-size: 0.875rem

    .roulette-grant-mult
      font-size: 1.75rem

    .roulette-grant-amount
      font-size: 1.125rem

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
