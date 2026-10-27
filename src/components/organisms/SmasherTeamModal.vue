<script setup lang="ts">
import { movieIconSrc } from '@/use/badgeIconArt'
import { ref, computed, watch, shallowRef, onBeforeUnmount, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import TutorialLightbox from '@/components/atoms/TutorialLightbox.vue'
import CardRuneFrame from '@/components/atoms/CardRuneFrame.vue'
import { smasherRarity, skinRarity, type SmasherRarity } from '@/data/smasherRarity'
import { playUiSfx } from '@/use/uiSfx'
import IconCoin from '@/components/icons/IconCoin.vue'
import StatIcon from '@/components/icons/StatIcon.vue'
import type { SpinnerConfig, TopPartId } from '@/types/spinner'
import useSpinnerConfig, { computeStats } from '@/use/useSpinnerConfig'
import useSmashers, { smasherLevel, levelUpSmasher, isSmasherRecruited, fieldTeamIds } from '@/use/useSmashers'
import { isPremiumUnlockable, settlePremiumSmashers, unlockPremiumSmasher } from '@/use/premiumSmashers'
import { premiumSmasherCoinPrice } from '@/data/premiumSmashers'
import { revealRewards } from '@/use/useRewardReveal'
import { chooseTeamSize, teamSizeAt, teamSlotsAt } from '@/use/useTeamSize'
import { MAX_TEAM_SIZE, TEAM_SIZES, teamSlotWinStage, benchTeamSlot, fieldTeamSlot, type TeamSize } from '@/data/teamSize'
import {
  SMASHERS,
  SMASHER_LIST,
  SMASHER_TAPER_LEVEL,
  UNRELEASED_SMASHER_IDS,
  isReleasedSmasher,
  SKILL_SLOT_LEVELS,
  isSmasherId,
  smasherConfig,
  smasherLevelCost,
  smasherSkillLevel,
  type SmasherId
} from '@/data/smasherCatalog'
// Skill UI through the skills gate (lazy; null / never loaded when off).
import { SKILLS_BUILD, SkillIconUi, loadSmasherSkillText, type SmasherSkillTextModule } from '@/skills/skillsGate'
import {
  SKINS_PER_TOP, skinCost,
  modelImgPath, isSkinOwned, purchaseSkinWithCoins, selectSkin, getSelectedSkin,
  hasUnownedSkinsForTop,
  isAdUnlockSkin, isEarnOnlySkin, recordSkinAdWatch, settleSkinAdProgress,
  markSkinPickerOpened, wasSkinPickerOpened,
  type SpinnerModelId
} from '@/use/useModels'
import { isNative } from '@/use/useUser'
import { isRewardedReady, rewardedUnlocksAvailable, showRewardedAd } from '@/use/useAds'
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
// Bosses 100+ (bosses gate): pure boundary data, used only behind the literal.
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'
import { fmtFixed } from '@/utils/localeNumber'
import { trophySkinFirstStage } from '@/data/bossEncounters'
import { useLongPressPeek } from '@/use/useLongPressPeek'
import FSkinPeek from '@/components/molecules/FSkinPeek.vue'
import { SMASHER_SKINS, smasherOfSkinId, smasherSkinIdOf } from '@/data/smasherSkinCatalog'
import { LEAGUE_BUILD } from '@/league/leagueGate'

// ─── Team modal: the smasher roster + the 1–3 slot team ────────────────────
//
// Replaces the old part-based SpinnerConfigModal. Every smasher is ONE unit:
// pick it into a team slot, level it up with coins (stats + skill levels),
// and read its three unique skills (slot 2 opens at Lv 10, slot 3 at Lv 20).
// Colourways stay per archetype top part AND team slot (`getSelectedSkin(top,
// slot)`) — the same mapping `playerTeamWithUpgrades` reads.
//
// TEAM SIZE (src/data/teamSize.ts): the picker above the slots chooses how
// many smashers fight — 1, 2 or 3, only among the open slots (slot 2 opens
// after winning stage 3, slot 3 after stage 10; a locked slot names its
// stage). The choice is stored (`useTeamSize.chooseTeamSize`); slots beyond
// it stay filled but sit out ("benched"), so switching back keeps the picks.

interface Props {
  modelValue: boolean
  initialTeam?: SpinnerConfig[]
  /** Best campaign stage ever reached — recruits the roster. */
  bestStage?: number
  /** May a rewarded ad start from this modal right now? False during a PvP
   *  match (a pause on one peer desyncs the other): the ad-unlock buttons stay
   *  disabled with a "after the match" hint. */
  adsAllowed?: boolean
  /** Guided "swap your lead" tutorial: lightboxes force Thumper into slot 1, then the close button. */
  tutorial?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialTeam: () => [smasherConfig('bramble', 1), smasherConfig('thumper', 1)],
  bestStage: 1,
  adsAllowed: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', team: SpinnerConfig[]): void
  (e: 'tutorial-done'): void
}>()

const { t, locale } = useSfcI18n('SmasherTeamModal')
const { coins, addCoins } = useSpinnerConfig()
const { levels: rosterLevels } = useSmashers()

// ─── Team (local editable copy) ─────────────────────────────────────────────

const teamIds: Ref<SmasherId[]> = ref([])
const selectedId: Ref<SmasherId> = ref('bramble')

// ─── Team size ──────────────────────────────────────────────────────────────

/** Team slots open at the best stage reached (1 … 3). */
const openSlots = computed<number>(() => teamSlotsAt(props.bestStage))
/** Smashers that fight (the stored pick, clamped to the open slots). */
const teamSize = computed<TeamSize>(() => teamSizeAt(props.bestStage))

const pickTeamSize = (n: TeamSize) => {
  if (n > openSlots.value) {
    playUiSfx('deny')
    return
  }
  if (n === teamSize.value) return
  chooseTeamSize(n)
  playUiSfx('tab')
  emitTeam()
}

// ─── Deselect smasher 2 / 3 (owner request, #UX1c) ───────────────────────────
// A fielded slot 2 / 3 card carries an ✕ that takes that smasher out of the
// fight; a resting slot carries a + that fields it again. Both just move the
// team size (and, when slot 2 leaves while slot 3 fights, swap the two picks
// so the fielded slots stay 1 … size) — the 1 / 2 / 3 picker above and the
// stored `smashers_team_size` follow. Rules: `benchTeamSlot` / `fieldTeamSlot`.
const benchSlot = (slot: number) => {
  const res = benchTeamSlot(teamIds.value, teamSize.value, slot)
  if (res.size === teamSize.value) return
  teamIds.value = res.team
  chooseTeamSize(res.size)
  playUiSfx('toggleOff')
  emitTeam()
}
const fieldSlot = (slot: number) => {
  const n = fieldTeamSlot(teamSize.value, slot, openSlots.value)
  if (n === teamSize.value) {
    playUiSfx('deny')
    return
  }
  chooseTeamSize(n)
  playUiSfx('toggleOn')
  emitTeam()
}

/** Pick-count → the rule line under the picker. */
const sizeRuleKey = (n: number): string => `teamSizeRule${n}`

const teamFromProps = (): SmasherId[] => {
  const picks = props.initialTeam.map(c => (isSmasherId(c.smasherId) ? c.smasherId : 'bramble'))
  // Every open slot holds a smasher (padded with recruited ones); a stored
  // pick behind a locked slot is kept for when it opens.
  return fieldTeamIds(picks, Math.min(MAX_TEAM_SIZE, Math.max(openSlots.value, picks.length)), props.bestStage)
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  // Premium smashers: account for this save first (a save from before the
  // rule keeps every smasher it had — src/use/premiumSmashers.ts).
  settlePremiumSmashers(props.bestStage)
  teamIds.value = teamFromProps()
  selectedId.value = teamIds.value[0] ?? 'bramble'
  // CrazyGames `gameplayStop` at the call site (idempotent; see the arena).
  stopGameplay()
}, { immediate: true })

const emitTeam = () => {
  emit('save', teamIds.value.map((id, i) => {
    const cfg = smasherConfig(id, smasherLevel(id))
    cfg.modelId = getSelectedSkin(cfg.topPartId, i)
    return cfg
  }))
}

/** Open team slot of a smasher, or -1 (a pick behind a locked slot counts as none). */
const slotOf = (id: SmasherId): number => {
  const i = teamIds.value.indexOf(id)
  return i < openSlots.value ? i : -1
}

/** In the roster: stage reached and, for a premium smasher, unlocked. */
const unlocked = (id: SmasherId): boolean => isSmasherRecruited(id, props.bestStage)
/** A premium smasher whose stage is reached but which still waits for its
 *  rewarded-ad (or coin) unlock. */
const unlockable = (id: SmasherId): boolean => isPremiumUnlockable(id, props.bestStage)

/** Card edge tier — presentation only (see smasherRarity.ts). */
const rarityOf = (id: SmasherId): SmasherRarity => smasherRarity(SMASHERS[id].unlockStage)

/** Put the selected smasher into `slot`; a smasher already in the other slot
 *  swaps places, so the team never holds a duplicate. */
const putInSlot = (slot: number) => {
  const id = selectedId.value
  if (!unlocked(id) || slot < 0 || slot >= Math.min(teamIds.value.length, openSlots.value)) return
  const next = [...teamIds.value]
  const from = next.indexOf(id)
  if (from === slot) return
  if (from >= 0) next[from] = next[slot]!
  next[slot] = id
  teamIds.value = next
  emitTeam()
}

const selectSmasher = (id: SmasherId) => {
  selectedId.value = id
  if (id === TUTORIAL_LEAD) tutorialPicked.value = true
}

// ─── Swap-your-lead tutorial ───────────────────────────────────────────────
// Three forced clicks, each lit by a lightbox: the lead's roster card, its
// "put in slot 1" button, then the modal's close button.
const TUTORIAL_LEAD: SmasherId = 'thumper'
const tutorialPicked = ref(false)
const tutorialStep = computed<'pick' | 'put' | 'close' | null>(() => {
  if (!props.tutorial || !props.modelValue) return null
  if (!tutorialPicked.value) return 'pick'
  if (teamIds.value[0] !== TUTORIAL_LEAD) return 'put'
  return 'close'
})
const TUTORIAL_TARGETS = {
  pick: `[data-testid="roster-${TUTORIAL_LEAD}"]`,
  put: '[data-testid="put-in-slot-0"]',
  close: '.modal-close'
} as const
const tutorialTarget = computed(() => (tutorialStep.value ? TUTORIAL_TARGETS[tutorialStep.value] : ''))
const tutorialText = computed(() =>
  tutorialStep.value
    ? t(
      tutorialStep.value === 'pick' ? 'tutorialPick' : tutorialStep.value === 'put' ? 'tutorialPut' : 'tutorialClose',
      { name: t('smasher_' + TUTORIAL_LEAD) }
    )
    : '')
watch(tutorialStep, async (step, prev) => {
  if (step === 'pick' && prev !== 'pick') {
    await nextTick()
    document.querySelector(TUTORIAL_TARGETS.pick)?.scrollIntoView({ block: 'nearest' })
  }
})
watch(() => props.modelValue, open => {
  if (!open && props.tutorial && tutorialPicked.value && teamIds.value[0] === TUTORIAL_LEAD) emit('tutorial-done')
})

// ─── Levels, stats ─────────────────────────────────────────────────────────

// Reading the roster ref keeps every level-derived value reactive.
const levelOf = (id: SmasherId): number => {
  void rosterLevels.value
  return smasherLevel(id)
}

const statsAt = (id: SmasherId, level: number) => {
  const cfg = smasherConfig(id, level)
  return computeStats(cfg, cfg.topLevel ?? 0, cfg.bottomLevel ?? 0)
}

type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'weight'
const STAT_ROWS: { key: StatKey, icon: 'hp' | 'attack' | 'defense' | 'speed' | 'weight', label: string, color: string }[] = [
  { key: 'hp', icon: 'hp', label: 'statHp', color: 'var(--color-leaf-500)' },
  { key: 'atk', icon: 'attack', label: 'statAtk', color: 'var(--color-berry-500)' },
  { key: 'def', icon: 'defense', label: 'statDef', color: 'var(--color-sky-500)' },
  { key: 'spd', icon: 'speed', label: 'statSpd', color: 'var(--color-sun-500)' },
  { key: 'weight', icon: 'weight', label: 'statWeight', color: 'var(--color-royal-500)' }
]

const statValue = (s: ReturnType<typeof statsAt>, key: StatKey): number => {
  switch (key) {
    case 'hp': return s.maxHp
    case 'atk': return s.damageMultiplier
    case 'def': return s.defenseMultiplier
    case 'spd': return s.speedMultiplier
    case 'weight': return s.totalWeight
  }
}

/** Bar scale per stat at `level`: the highest value any smasher reaches. */
const statCapAt = (level: number): Record<StatKey, number> => {
  const cap: Record<StatKey, number> = { hp: 1, atk: 1, def: 1, spd: 1, weight: 1 }
  for (const s of SMASHER_LIST) {
    const st = statsAt(s.id, level)
    for (const r of STAT_ROWS) cap[r.key] = Math.max(cap[r.key], statValue(st, r.key))
  }
  return cap
}

/** Levels have no cap, so the bars scale to the level-30 baseline or — once
 *  the roster goes deeper — to its highest level + 1 (the next-level preview
 *  of the deepest smasher still fits). Values past it clamp to a full bar. */
const STAT_CAP_BASE = statCapAt(SMASHER_TAPER_LEVEL)
const STAT_CAP = computed<Record<StatKey, number>>(() => {
  let top = 0
  for (const v of Object.values(rosterLevels.value)) if (typeof v === 'number' && v > top) top = v
  return top + 1 > SMASHER_TAPER_LEVEL ? statCapAt(top + 1) : STAT_CAP_BASE
})

const fmtStat = (key: StatKey, v: number): string =>
  key === 'hp' ? String(Math.round(v)) : key === 'weight' ? fmtFixed(v, 1, locale.value) : `${fmtFixed(v, 2, locale.value)}x`

const selectedLevel = computed(() => levelOf(selectedId.value))
const selectedCost = computed(() => smasherLevelCost(selectedLevel.value))
const canAfford = computed(() => selectedCost.value !== null && coins.value >= selectedCost.value)

const statRows = computed(() => {
  const id = selectedId.value
  const now = statsAt(id, selectedLevel.value)
  const next = selectedCost.value === null ? null : statsAt(id, selectedLevel.value + 1)
  return STAT_ROWS.map(r => {
    const v = statValue(now, r.key)
    const nv = next ? statValue(next, r.key) : v
    return {
      ...r,
      value: fmtStat(r.key, v),
      next: next && nv - v > 1e-9 ? fmtStat(r.key, nv) : null,
      frac: Math.min(1, v / STAT_CAP.value[r.key]),
      nextFrac: Math.min(1, nv / STAT_CAP.value[r.key])
    }
  })
})

// ─── Level up ──────────────────────────────────────────────────────────────

/** Bumps on every level-up: re-keys the pop / coin-float animations. */
const levelUpPulse = ref(0)
const lastSpent = ref(0)

const buyLevel = () => {
  const id = selectedId.value
  const cost = smasherLevelCost(levelOf(id))
  if (cost === null || coins.value < cost || !unlocked(id)) return
  addCoins(-cost)
  if (levelUpSmasher(id) === null) {
    addCoins(cost)
    return
  }
  lastSpent.value = cost
  levelUpPulse.value++
  playUiSfx('reward')
  if (slotOf(id) >= 0) emitTeam()
}

// ─── Premium smasher unlock (Tuskar onwards, src/data/premiumSmashers.ts) ────
// Once its stage is reached, a premium smasher waits on its card for ONE
// rewarded ad (the sky MovieIcon "Unlock" hero) — or, on a session without
// rewarded ads (`rewardedUnlocksAvailable` false: no-ad build, ad blocker,
// portal without rewarded support), for its coin price. Rules for the ad:
//   • readiness — the button is disabled while `isRewardedReady` is false (no
//     ad loaded / throttled) and says so; it turns live by itself once one is;
//   • PvP — never from a PvP match (`adsAllowed`), hint "after the match";
//   • grant — only when `showRewardedAd` resolved true (watched to the end);
//     skipped / failed / declined unlocks nothing and says "try again";
//   • busy — one ad at a time, a double tap cannot start a second one.
// The unlock is saved first, then the card flips and the gift reveal shows
// the smasher. The completed ad counts as the interstitial break inside
// `showRewardedAd` (B6, #UX100), like every rewarded placement.

/** The session unlocks with ads (else: coin prices). */
const adUnlock = computed(() => rewardedUnlocksAvailable.value)
/** An ad may start right now. */
const adReady = computed(() => isRewardedReady.value && props.adsAllowed)
/** Why the ad button is disabled (null: it is not). */
const adBlockedHint = computed<string | null>(() =>
  !props.adsAllowed ? t('adAfterMatch') : !isRewardedReady.value ? t('adNotReady') : null
)
/** Feedback after an ad that paid nothing; cleared on the next attempt. */
const adFailedFor = ref<string | null>(null)

/** One rewarded ad; true only when it was watched to the end. A provider that
 *  throws pays nothing (and never leaves an unhandled rejection in a click). */
const watchRewarded = async (kind: 'skinAd' | 'smasherAd'): Promise<boolean> => {
  try {
    return (await showRewardedAd({ kind })) === true
  } catch (e) {
    console.warn('[ads] rewarded unlock failed', e)
    return false
  }
}

const premiumAdPending = ref(false)
/** Roster card turning over after its unlock. */
const smasherFlip = ref<SmasherId | null>(null)
let flipTimer = 0

const celebrateUnlock = (id: SmasherId) => {
  playUiSfx('reward')
  smasherFlip.value = id
  window.clearTimeout(flipTimer)
  flipTimer = window.setTimeout(() => { smasherFlip.value = null }, 1150)
  const top = SMASHERS[id].archetype.top
  void revealRewards([{
    kind: 'smasher',
    smasherId: id,
    modelId: getSelectedSkin(top, Math.max(0, slotOf(id))),
    rarity: rarityOf(id)
  }])
}

const handleUnlockSmasherAd = async (id: SmasherId) => {
  // Synchronous guard: the second tap of a double tap finds the flag set.
  if (premiumAdPending.value || !adReady.value || !unlockable(id)) {
    playUiSfx('deny')
    return
  }
  premiumAdPending.value = true
  adFailedFor.value = null
  try {
    const ok = await watchRewarded('smasherAd')
    if (ok && unlockPremiumSmasher(id, props.bestStage)) celebrateUnlock(id)
    else if (!ok) adFailedFor.value = id
  } finally {
    premiumAdPending.value = false
  }
}

const handleUnlockSmasherCoins = (id: SmasherId) => {
  const price = premiumSmasherCoinPrice(id)
  if (adUnlock.value || price === null || coins.value < price || !unlockable(id)) {
    playUiSfx('deny')
    return
  }
  // Charge only on a real unlock.
  if (unlockPremiumSmasher(id, props.bestStage)) {
    addCoins(-price)
    celebrateUnlock(id)
  }
}

watch(selectedId, () => { adFailedFor.value = null })
onBeforeUnmount(() => window.clearTimeout(flipTimer))

// ─── Skills ────────────────────────────────────────────────────────────────

const skillText = shallowRef<SmasherSkillTextModule | null>(null)
void loadSmasherSkillText().then((m) => {
  skillText.value = m
}).catch(() => { /* names still show; numbers arrive with the next open */
})

const skillRows = computed(() => {
  const text = skillText.value
  const def = SMASHERS[selectedId.value]
  const lv = selectedLevel.value
  return def.skills.map((skill, slot) => {
    const skillLv = smasherSkillLevel(lv, slot)
    return {
      skill,
      slot,
      locked: skillLv === 0,
      unlockAt: SKILL_SLOT_LEVELS[slot]!,
      level: skillLv,
      name: t(`smasher_skill_${skill.id}`),
      desc: text ? t(`smasher_skill_${skill.id}_desc`, text.smasherSkillDescParams(skill, Math.max(1, skillLv), locale.value)) : ''
    }
  })
})

// ─── Skin picker (per archetype top + team slot) ────────────────────────────

const selectedSlot = computed(() => slotOf(selectedId.value))
const selectedTop = computed<TopPartId>(() => SMASHERS[selectedId.value].archetype.top)

/** Portrait of a smasher: its colourway in its team slot, else slot 0's. */
const portraitOf = (id: SmasherId): string => {
  const slot = Math.max(0, slotOf(id))
  return modelImgPath(getSelectedSkin(SMASHERS[id].archetype.top, slot), id)
}

const trophyCardText = (modelId: string): string => {
  const n = BOSSES100_BUILD ? trophySkinFirstStage(modelId) : null
  return n === null ? t('trophySkin.label') : t('trophySkin.beatStage', { n })
}

// ─── Roster filter (#UX1c) ──────────────────────────────────────────────────
// 48 smashers are well past two phone screens: a row of filter chips above
// the roster — All · Owned · one per rarity tier that has a member, each with
// its count. Per-session UI state (not saved); "All" is the default. The grid
// is re-keyed per filter so its stagger re-pops.
type RosterFilter = 'all' | 'owned' | SmasherRarity
const rosterFilter = ref<RosterFilter>('all')
const ROSTER_RARITIES: SmasherRarity[] = ['common', 'rare', 'super', 'epic', 'legendary']
// Release gate (src/data/smasherCatalog.ts): the roster lists the released
// smashers plus any held-back one this save already owns (grandfathered);
// the rest of the later release is one "coming soon" teaser card.
const rosterList = computed(() => SMASHER_LIST.filter(s => isReleasedSmasher(s.id) || unlocked(s.id)))
const showComingSoon = computed(() =>
  rosterFilter.value === 'all' && UNRELEASED_SMASHER_IDS.some(id => !unlocked(id)))
const passesFilter = (id: SmasherId, f: RosterFilter): boolean =>
  f === 'all' ? true : f === 'owned' ? unlocked(id) : rarityOf(id) === f
const rosterFilters = computed<RosterFilter[]>(() => [
  'all',
  'owned',
  ...ROSTER_RARITIES.filter(r => rosterList.value.some(s => rarityOf(s.id) === r))
])
const filterLabel = (f: RosterFilter): string =>
  f === 'all' ? t('filterAll') : f === 'owned' ? t('filterOwned') : t('rarity.' + f)
const filterCount = (f: RosterFilter): number => rosterList.value.filter(s => passesFilter(s.id, f)).length
const visibleRoster = computed(() => rosterList.value.filter(s => passesFilter(s.id, rosterFilter.value)))
const pickFilter = (f: RosterFilter) => {
  if (rosterFilter.value === f) return
  rosterFilter.value = f
  playUiSfx('tab')
}

// ─── Skin peek (#UX1c): hold a skin card to see it big, with its rarity ─────
const skinPeek = useLongPressPeek<SpinnerModelId>({ cardWidth: 176, minRoomAbove: 200 })
const skinPeekState = skinPeek.peek

const skinPickerOpen = ref(false)
const skinPickerKey = ref(0)
// Owner rule 2026-10-23: the old colourway list is gone — the free default, this
// smasher's ONE own skin (locked until a rewarded ad / 1000 coins), and any boss
// trophy skin the player already earned.
const pickerSkins = computed<SpinnerModelId[]>(() => {
  const topId = selectedTop.value
  const all = SKINS_PER_TOP[topId]
  // boss trophy skins: every one on a bosses-100 build (unowned ones show their "beat stage N" card),
  // only the owned ones otherwise
  const trophies = BOSSES100_BUILD ? all.filter(id => isEarnOnlySkin(id)) : all.filter(id => isEarnOnlySkin(id) && isSkinOwned(topId, id))
  return [all[0]!, smasherSkinIdOf(selectedId.value) as SpinnerModelId, ...trophies]
})

/** Display name of a skin card: "<Smasher> · <kind>" for a smasher skin. */
const skinLabel = (modelId: string): string => {
  const owner = smasherOfSkinId(modelId)
  const def = owner === null ? undefined : SMASHER_SKINS[owner]
  if (owner === null || !def) return t('skins.' + modelId)
  return t('smasherSkinName', { smasher: t('smasher_' + owner), kind: t('smasherSkin_' + def.kind) })
}

const openSkinPicker = () => {
  if (selectedSlot.value < 0) return
  skinPickerKey.value++
  skinPickerOpen.value = true
  markSkinPickerOpened(selectedTop.value)
  settleSkinAdProgress()
}

const shouldBouncePlus = computed(() =>
  !isSkinOwned(selectedTop.value, smasherSkinIdOf(selectedId.value) as SpinnerModelId) && !wasSkinPickerOpened(selectedTop.value)
)

// Every purchasable skin is ONE rewarded ad on a session with rewarded ads
// (owner rule 2026-10-21, `isAdUnlockSkin`); without them (no-ad build, ad
// blocker, portal without rewarded support) the old coin prices.
const isSkinAd = (modelId: SpinnerModelId): boolean => isAdUnlockSkin(modelId, adUnlock.value)

const handleBuySkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  const cost = skinCost(modelId)
  if (coins.value < cost) return
  if (purchaseSkinWithCoins(topId, modelId, adUnlock.value)) addCoins(-cost)
}

const skinAdPending = ref(false)
/** Skin whose last ad paid nothing (skipped / failed) — "try again". */
const skinAdFailed = ref<string | null>(null)
const handleWatchSkinAd = async (topId: TopPartId, modelId: SpinnerModelId) => {
  if (skinAdPending.value || !adReady.value) {
    playUiSfx('deny')
    return
  }
  skinAdPending.value = true
  skinAdFailed.value = null
  try {
    const ok = await watchRewarded('skinAd')
    if (ok) recordSkinAdWatch(topId, modelId)
    else skinAdFailed.value = modelId
  } finally {
    skinAdPending.value = false
  }
}
/** The picker shows an ad button that cannot start right now. */
const pickerAdBlocked = computed(() =>
  adUnlock.value && adBlockedHint.value !== null
  && pickerSkins.value.some(id => !isSkinOwned(selectedTop.value, id) && isSkinAd(id))
)

const handleSelectSkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  if (selectedSlot.value < 0) return
  selectSkin(topId, modelId, selectedSlot.value)
  emitTeam()
}

// ─── Card flip on a new skin (#UX1b) ────────────────────────────────────────
// A skin that becomes owned while the picker is open (bought with coins, or
// unlocked by its rewarded ad) turns over: the card shows its striped back,
// flips to the now-owned face and lands with a sun ring + the reward ting.
const flipping = ref<Set<string>>(new Set())
const ownedInPicker = computed(() =>
  skinPickerOpen.value ? pickerSkins.value.filter(id => isSkinOwned(selectedTop.value, id)) : []
)
/** Ownership seen last, per top part; null = take a fresh baseline. */
let lastOwned: { top: TopPartId, ids: string[] } | null = null
watch(ownedInPicker, (now) => {
  const prev = lastOwned
  lastOwned = skinPickerOpen.value ? { top: selectedTop.value, ids: now } : null
  // Opening the picker, or switching smasher, only takes the baseline.
  if (!skinPickerOpen.value || !prev || prev.top !== selectedTop.value) return
  const fresh = now.filter(id => !prev.ids.includes(id))
  if (fresh.length === 0) return
  const next = new Set(flipping.value)
  for (const id of fresh) next.add(id)
  flipping.value = next
  window.setTimeout(() => playUiSfx('reward'), 560)
  window.setTimeout(() => {
    const done = new Set(flipping.value)
    for (const id of fresh) done.delete(id)
    flipping.value = done
  }, 1150)
})
watch(selectedTop, () => { flipping.value = new Set() })
watch(skinPickerOpen, (open) => {
  skinAdFailed.value = null
  if (open) return
  lastOwned = null
  skinPeek.close()
})

// ─── Long-press stats peek on roster cards (#UX1b) ──────────────────────────
// Hold a roster card (touch or mouse) for PEEK_MS and a small stat card pops
// up above it: rarity, level and the four headline stats — without leaving
// the roster for the detail panel (which sits below the roster on a phone).
// Releasing closes it and the release does NOT select the card. Moving the
// finger (a scroll) cancels. Keyboard: the ContextMenu key or Shift+F10 on a
// focused card toggles the same peek, Escape closes it; selecting with Enter
// shows the full detail panel as before. Reduced motion: no pop, it appears.
const PEEK_MS = 420
const peek = ref<{ id: SmasherId, left: number, top: number, below: boolean } | null>(null)
let peekTimer = 0
let peekStart: { x: number, y: number, id: number } | null = null
let suppressClick = false

const PEEK_STATS: StatKey[] = ['hp', 'atk', 'def', 'spd']
const peekRows = computed(() => {
  const p = peek.value
  if (!p) return []
  const st = statsAt(p.id, levelOf(p.id))
  return STAT_ROWS.filter(r => PEEK_STATS.includes(r.key)).map(r => {
    const v = statValue(st, r.key)
    return { ...r, value: fmtStat(r.key, v), frac: Math.min(1, v / STAT_CAP.value[r.key]) }
  })
})

const openPeek = (id: SmasherId, el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  const W = 176
  const left = Math.max(8 + W / 2, Math.min(window.innerWidth - 8 - W / 2, r.left + r.width / 2))
  const below = r.top < 170
  peek.value = { id, left, top: below ? r.bottom + 8 : r.top - 8, below }
  playUiSfx('open')
  try { navigator.vibrate?.(8) } catch { /* optional */ }
}
const closePeek = () => {
  window.clearTimeout(peekTimer)
  peekTimer = 0
  peekStart = null
  if (peek.value) playUiSfx('close')
  peek.value = null
}

const onCardPointerDown = (id: SmasherId, e: PointerEvent) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  closePeek()
  suppressClick = false
  const el = e.currentTarget as HTMLElement
  peekStart = { x: e.clientX, y: e.clientY, id: e.pointerId }
  peekTimer = window.setTimeout(() => {
    peekTimer = 0
    suppressClick = true
    openPeek(id, el)
  }, PEEK_MS)
}
const onCardPointerMove = (e: PointerEvent) => {
  if (!peekStart || peekStart.id !== e.pointerId || peek.value) return
  if (Math.hypot(e.clientX - peekStart.x, e.clientY - peekStart.y) > 10) {
    window.clearTimeout(peekTimer)
    peekTimer = 0
    peekStart = null
  }
}
const onCardPointerEnd = () => {
  window.clearTimeout(peekTimer)
  peekTimer = 0
  peekStart = null
  if (peek.value) closePeek()
}
const onRosterClick = (id: SmasherId) => {
  // The release of a long press closes the peek; it must not also select.
  if (suppressClick) {
    suppressClick = false
    return
  }
  selectSmasher(id)
}
const onCardKey = (id: SmasherId, e: KeyboardEvent) => {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault()
    if (peek.value?.id === id) closePeek()
    else openPeek(id, e.currentTarget as HTMLElement)
  } else if (e.key === 'Escape' && peek.value) {
    e.stopPropagation()
    closePeek()
  }
}
watch(() => props.modelValue, (open) => { if (!open) closePeek() })

// #Consistency-11: the filter chip row scrolls sideways where it cannot wrap (phones); it paints
// a soft edge fade on the sides that still hide chips so a clipped chip reads as "more".
const chipRow = ref<HTMLElement | null>(null)
const chipMore = ref({ left: false, right: false })
const syncChipRow = () => {
  const el = chipRow.value
  if (!el) return
  chipMore.value = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 }
}
watch(chipRow, el => {
  if (!el) return
  nextTick(syncChipRow)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncChipRow).observe(el)
})
watch(() => rosterFilters.value.length, () => nextTick(syncChipRow))
onBeforeUnmount(() => window.clearTimeout(peekTimer))
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :title="t('team')"
    class="team-modal"
  )
    Teleport(to="body")
      TutorialLightbox(
        v-if="tutorialStep"
        :key="tutorialStep"
        :target="tutorialTarget"
        :text="tutorialText"
      )
    div.team-layout(data-testid="smasher-team-modal")
      //- ── Left: team slots + roster ──────────────────────────────────────
      div.team-col
        div.relative.flex.justify-center.items-center.team-header
          div.coin-pill.ui-chip.ui-chip--sun.absolute.left-0
            IconCoin(class="w-3.5 h-3.5")
            span(data-testid="team-coins") {{ coins }}

        //- Team size: 1, 2 or 3 smashers — only the open counts are pickable.
        div.team-size(data-testid="team-size-picker")
          span#team-size-label.team-size-label.game-text {{ t('teamSizeLabel') }}
          div.team-size-opts(role="radiogroup" aria-labelledby="team-size-label")
            button.team-size-opt(
              v-for="n in TEAM_SIZES"
              :key="'size-' + n"
              type="button"
              role="radio"
              :aria-checked="teamSize === n"
              :aria-disabled="n > openSlots ? 'true' : undefined"
              :aria-label="n > openSlots ? t('teamSizeLockedAria', { n, stage: teamSlotWinStage(n) }) : t('teamSizeAria', { n })"
              :class="{ 'is-picked': teamSize === n, 'is-locked': n > openSlots }"
              :data-testid="'team-size-' + n"
              @click="pickTeamSize(n)"
            )
              span.size-dots(aria-hidden="true")
                span.size-dot(v-for="k in n" :key="k")
              span.size-num.game-text(aria-hidden="true") {{ n }}
              span.size-lock.game-text(v-if="n > openSlots" aria-hidden="true") 🔒 {{ t('teamSizeLocked', { n: teamSlotWinStage(n) }) }}
          p.team-size-rule(data-testid="team-size-rule") {{ t(sizeRuleKey(teamSize)) }}
          //- #playtest-1-19: the pick is saved for the campaign; league fights stay 2 v 2.
          p.team-size-note(v-if="LEAGUE_BUILD" data-testid="team-size-note") {{ t('teamSizeLeagueNote') }}

        div.team-slots(:style="{ '--slots': MAX_TEAM_SIZE }")
          div.team-slot-cell(v-for="i in MAX_TEAM_SIZE" :key="'slot-' + (i - 1)")
            button.team-slot.ui-pop-in(
              v-if="i - 1 < openSlots && teamIds[i - 1]"
              type="button"
              :class="[`rarity-${rarityOf(teamIds[i - 1])}`, { 'is-selected': selectedId === teamIds[i - 1], 'is-benched': i > teamSize }]"
              :style="{ '--i': i - 1 }"
              :data-testid="'team-slot-' + (i - 1)"
              @click="selectSmasher(teamIds[i - 1])"
            )
              CardRuneFrame(:part-id="SMASHERS[teamIds[i - 1]].archetype.top" :rarity="rarityOf(teamIds[i - 1])" :selected="selectedId === teamIds[i - 1]")
              span.slot-tag.game-text {{ t('slotLabel', { n: i }) }}
              img.slot-portrait(:src="portraitOf(teamIds[i - 1])" :alt="t('smasher_' + teamIds[i - 1])" draggable="false")
              span.name-plate.slot-name.game-text
                span {{ t('smasher_' + teamIds[i - 1]) }}
              span.lv-badge.game-text
                span {{ t('levelShort', { n: levelOf(teamIds[i - 1]) }) }}
              span.card-rarity.ui-rarity-name(:class="'ui-rarity-name--' + rarityOf(teamIds[i - 1])") {{ t('rarity.' + rarityOf(teamIds[i - 1])) }}
              span.bench-tag.game-text(v-if="i > teamSize") {{ t('benched') }}
            //- A locked slot names the stage that opens it.
            div.team-slot.team-slot--locked.ui-pop-in(
              v-else
              :style="{ '--i': i - 1 }"
              :data-testid="'team-slot-locked-' + (i - 1)"
            )
              span.slot-tag.game-text {{ t('slotLabel', { n: i }) }}
              span.slot-lock-icon(aria-hidden="true") 🔒
              span.slot-lock-text.game-text {{ t('teamSizeLocked', { n: teamSlotWinStage(i) }) }}
            //- Slot 2 / 3: ✕ takes the smasher out of the fight, + puts a
            //- resting one back (siblings of the card: no button in a button).
            template(v-if="i > 1 && i - 1 < openSlots && teamIds[i - 1]")
              button.slot-toggle.slot-toggle--remove(
                v-if="i <= teamSize"
                type="button"
                data-sfx="self"
                :aria-label="t('slotRemoveAria', { n: i, name: t('smasher_' + teamIds[i - 1]) })"
                :title="t('slotRemoveAria', { n: i, name: t('smasher_' + teamIds[i - 1]) })"
                :data-testid="'team-slot-remove-' + (i - 1)"
                @click="benchSlot(i - 1)"
              )
                svg(viewBox="0 0 24 24" aria-hidden="true")
                  path(d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round")
              button.slot-toggle.slot-toggle--field(
                v-else
                type="button"
                data-sfx="self"
                :aria-label="t('slotFieldAria', { n: i, name: t('smasher_' + teamIds[i - 1]) })"
                :title="t('slotFieldAria', { n: i, name: t('smasher_' + teamIds[i - 1]) })"
                :data-testid="'team-slot-field-' + (i - 1)"
                @click="fieldSlot(i - 1)"
              )
                svg(viewBox="0 0 24 24" aria-hidden="true")
                  path(d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round")

        h3.label-section.roster-title {{ t('roster') }}
        //- Filter chips (#UX1c): All · Owned · per rarity, with counts.
        div.roster-filters(
          ref="chipRow"
          role="group"
          :aria-label="t('filterAria')"
          :class="{ 'is-more-left': chipMore.left, 'is-more-right': chipMore.right }"
          @scroll.passive="syncChipRow"
        )
          button.roster-filter(
            v-for="f in rosterFilters"
            :key="f"
            type="button"
            data-sfx="self"
            :class="['roster-filter--' + f, { 'is-on': rosterFilter === f }]"
            :aria-pressed="rosterFilter === f"
            :data-testid="'roster-filter-' + f"
            @click="pickFilter(f)"
          )
            span.roster-filter__label {{ filterLabel(f) }}
            span.roster-filter__count {{ filterCount(f) }}
        div.roster-grid(:key="'grid-' + rosterFilter")
          button.roster-card.ui-pop-in(
            v-for="(s, i) in visibleRoster"
            :key="s.id"
            type="button"
            :class="[`rarity-${rarityOf(s.id)}`, { 'is-selected': selectedId === s.id, 'is-locked': !unlocked(s.id) && !unlockable(s.id), 'is-unlockable': unlockable(s.id), 'is-flipping': smasherFlip === s.id }]"
            :style="{ '--i': Math.min(i + 2, 14) }"
            :aria-pressed="selectedId === s.id"
            :aria-describedby="peek?.id === s.id ? 'smasher-peek' : undefined"
            :data-testid="'roster-' + s.id"
            @click="onRosterClick(s.id)"
            @pointerdown="onCardPointerDown(s.id, $event)"
            @pointermove="onCardPointerMove"
            @pointerup="onCardPointerEnd"
            @pointercancel="onCardPointerEnd"
            @pointerleave="onCardPointerEnd"
            @contextmenu.prevent
            @keydown="onCardKey(s.id, $event)"
            @blur="peek?.id === s.id && closePeek()"
          )
            CardRuneFrame(:part-id="s.archetype.top" :rarity="rarityOf(s.id)" :locked="!unlocked(s.id) && !unlockable(s.id)" :selected="selectedId === s.id")
            img.roster-portrait(:src="portraitOf(s.id)" :alt="t('smasher_' + s.id)" draggable="false")
            span.name-plate.roster-name.game-text
              span {{ t('smasher_' + s.id) }}
            span.roster-species {{ t('smasher_' + s.id + '_species') }}
            span.lv-badge.game-text(v-if="unlocked(s.id)")
              span {{ t('levelShort', { n: levelOf(s.id) }) }}
            //- Premium smasher, stage reached: what its unlock costs (the
            //- button itself is in the detail panel — no button in a button).
            span.unlock-chip(
              v-else-if="unlockable(s.id)"
              :class="adUnlock ? 'unlock-chip--ad' : 'unlock-chip--coins'"
              :data-testid="'roster-unlock-' + s.id"
            )
              template(v-if="adUnlock")
                img.unlock-chip__icon(:src="movieIconSrc()" alt="" draggable="false")
                span.game-text {{ t('unlock') }}
              template(v-else)
                IconCoin.unlock-chip__icon
                span.game-text {{ premiumSmasherCoinPrice(s.id) }}
            span.lock-note.game-text(v-else) 🔒 {{ t('lockedUntilStage', { n: s.unlockStage }) }}
            span.team-mark.game-text(v-if="slotOf(s.id) >= 0") {{ slotOf(s.id) + 1 }}
            span.card-rarity.ui-rarity-name(:class="'ui-rarity-name--' + rarityOf(s.id)") {{ t('rarity.' + rarityOf(s.id)) }}
          div.roster-card.roster-soon(
            v-if="showComingSoon"
            role="note"
            data-testid="roster-coming-soon"
            :style="{ '--i': Math.min(visibleRoster.length + 2, 14) }"
          )
            span.roster-soon__mark.game-text ?
            span.roster-soon__label.game-text {{ t('moreSmashersSoon') }}

        //- Long-press stats peek (see onCardPointerDown). Teleported above the
        //- modal; decorative for pointers, the card's description for AT.
        Teleport(to="body")
          div.smasher-peek(
            v-if="peek"
            id="smasher-peek"
            role="tooltip"
            :class="['rarity-' + rarityOf(peek.id), { 'is-below': peek.below }]"
            :style="{ left: peek.left + 'px', top: peek.top + 'px' }"
            data-testid="smasher-peek"
          )
            div.peek-head
              img.peek-portrait(:src="portraitOf(peek.id)" alt="" draggable="false")
              div.peek-title
                span.peek-name.game-text {{ t('smasher_' + peek.id) }}
                span.peek-tags
                  span.ui-rarity-name(:class="'ui-rarity-name--' + rarityOf(peek.id)") {{ t('rarity.' + rarityOf(peek.id)) }}
                  span.lv-badge.game-text(v-if="unlocked(peek.id)")
                    span {{ t('levelShort', { n: levelOf(peek.id) }) }}
            div.peek-stat(v-for="r in peekRows" :key="r.key")
              StatIcon.peek-stat-icon(:stat="r.icon")
              span.peek-stat-label {{ t(r.label) }}
              span.peek-bar
                span.peek-bar-fill(:style="{ width: (r.frac * 100) + '%', backgroundColor: r.color }")
              span.peek-stat-value.game-text {{ r.value }}
            div.peek-lock.game-text(v-if="!unlocked(peek.id)") 🔒 {{ t('lockedUntilStage', { n: SMASHERS[peek.id].unlockStage }) }}

      //- ── Right: detail panel of the selected smasher ────────────────────
      div.detail-col(data-testid="smasher-detail")
        div.detail-head
          div.detail-portrait-wrap(:class="`rarity-${rarityOf(selectedId)}`" :key="'portrait-' + selectedId")
            img.detail-portrait(:src="portraitOf(selectedId)" :alt="t('smasher_' + selectedId)" draggable="false")
            //- Colourway picker: per archetype top + team slot.
            button.skin-plus-btn(
              v-if="selectedSlot >= 0"
              type="button"
              :class="{ 'hint-bounce-2': shouldBouncePlus }"
              :title="t('purchaseMoreSkins')"
              :aria-label="t('selectSkin')"
              data-testid="skin-open"
              @click="openSkinPicker"
            ) +
          div.detail-title
            div.detail-name.game-text {{ t('smasher_' + selectedId) }}
            div.detail-species {{ t('smasher_' + selectedId + '_species') }}
            div.detail-desc {{ t('smasher_' + selectedId + '_desc') }}
            div.level-line
              span.lv-badge.lv-badge--big.game-text(:key="'lv-' + levelUpPulse" :class="{ 'ui-bump--punch': levelUpPulse > 0 }")
                | {{ t('levelShort', { n: selectedLevel }) }}
              span.detail-rarity.ui-rarity-name(:class="'ui-rarity-name--' + rarityOf(selectedId)") {{ t('rarity.' + rarityOf(selectedId)) }}

        //- Stats with the next-level preview
        div.stat-bars
          div.stat-row.ui-pop-in(v-for="(r, i) in statRows" :key="r.key + '-' + selectedId" :style="{ '--i': i }")
            StatIcon.stat-row-icon(:stat="r.icon")
            span.stat-row-label {{ t(r.label) }}
            div.stat-bar
              div.stat-bar-next(v-if="r.next" :style="{ width: (r.nextFrac * 100) + '%', backgroundColor: r.color }")
              div.stat-bar-fill(:style="{ width: (r.frac * 100) + '%', backgroundColor: r.color }")
            span.stat-row-value.game-text {{ r.value }}
            span.stat-row-next.game-text(v-if="r.next") ▸ {{ r.next }}

        //- The three unique skills
        h3.label-section(v-if="SKILLS_BUILD") {{ t('skillsLabel') }}
        div.skill-list(v-if="SKILLS_BUILD" data-testid="smasher-skills")
          div.skill-row.ui-pop-in(
            v-for="row in skillRows"
            :key="row.skill.id"
            :style="{ '--i': row.slot + 3 }"
            :class="{ 'is-locked': row.locked }"
            :data-testid="'skill-' + row.skill.id"
          )
            component(v-if="SkillIconUi" :is="SkillIconUi" :id="row.skill.effect" :skill-key="row.skill.id" :size="36" decorative)
            div.skill-text
              div.skill-head
                span.skill-name.game-text {{ row.name }}
                span.skill-lv.game-text(v-if="!row.locked") {{ t('skillLevel', { n: row.level }) }}
                span.skill-lock.game-text(v-else) 🔒 {{ t('unlocksAtLevel', { n: row.unlockAt }) }}
              div.skill-desc(v-if="row.desc") {{ row.desc }}

        p.hint-text {{ t('hintTeam') }}

      //- #playtest-1-10: the action dock is a sibling of both columns and sticks to the bottom of the
      //- modal's scroller, so LEVEL UP stays next to the pick however far down the roster it was made.
      div.action-dock(data-testid="smasher-action-dock")
        div.dock-who(aria-hidden="true")
          img.dock-portrait(:src="portraitOf(selectedId)" alt="" draggable="false")
          span.dock-name.game-text {{ t('smasher_' + selectedId) }}
          span.lv-badge.game-text(v-if="unlocked(selectedId)")
            span {{ t('levelShort', { n: selectedLevel }) }}
        //- Level up / recruit state / team placement
        div.action-row
          template(v-if="unlocked(selectedId)")
            div.levelup-wrap(v-if="selectedCost !== null")
              //- The screen's ONE hero CTA: sun, uppercase, shine + heartbeat
              //- while affordable; steel + deny shake when short.
              FButton(
                tone="premium"
                variant="brawl"
                size="sm"
                :is-disabled="!canAfford"
                :aria-label="t('levelUpAria', { name: t('smasher_' + selectedId), cost: selectedCost }, selectedCost ?? 0)"
                data-testid="level-up"
                @click="buyLevel"
              )
                span.levelup-label
                  StatIcon.levelup-icon(stat="level-up")
                  span {{ t('levelUp') }}
                  IconCoin.levelup-icon
                  span {{ selectedCost }}
              span.coin-float.game-text(
                v-if="levelUpPulse > 0"
                :key="'spent-' + levelUpPulse"
                aria-hidden="true"
              ) −{{ lastSpent }}
            div.slot-buttons
              button.slot-btn.ui-btn.ui-btn--primary(
                v-for="(_, i) in teamIds.slice(0, openSlots)"
                :key="'put-' + i"
                type="button"
                :disabled="teamIds[i] === selectedId"
                :data-testid="'put-in-slot-' + i"
                @click="putInSlot(i)"
              ) {{ teamIds[i] === selectedId ? t('inTeam') : t('putInSlot', { n: i + 1 }) }}
          //- Premium smasher, stage reached: the screen's hero is its unlock.
          div.unlock-wrap(v-else-if="unlockable(selectedId)" data-testid="smasher-unlock")
            FButton(
              v-if="adUnlock"
              tone="ad"
              variant="brawl"
              size="sm"
              :is-disabled="!adReady || premiumAdPending"
              :aria-label="t('unlockAdAria', { name: t('smasher_' + selectedId) })"
              data-testid="smasher-unlock-ad"
              @click="handleUnlockSmasherAd(selectedId)"
            )
              span.levelup-label
                span.game-text(v-if="isNative") {{ t('spinner.ad') }}
                img.levelup-icon.unlock-movie(:src="movieIconSrc()" alt="" draggable="false")
                span {{ t('unlock') }}
            FButton(
              v-else
              tone="premium"
              variant="brawl"
              size="sm"
              :is-disabled="coins < (premiumSmasherCoinPrice(selectedId) ?? Infinity)"
              :aria-label="t('unlockCoinsAria', { name: t('smasher_' + selectedId), cost: premiumSmasherCoinPrice(selectedId) }, premiumSmasherCoinPrice(selectedId) ?? 0)"
              data-testid="smasher-unlock-coins"
              @click="handleUnlockSmasherCoins(selectedId)"
            )
              span.levelup-label
                span {{ t('unlock') }}
                IconCoin.levelup-icon
                span {{ premiumSmasherCoinPrice(selectedId) }}
            p.unlock-hint(
              v-if="adUnlock && (adBlockedHint || adFailedFor === selectedId)"
              role="status"
              data-testid="smasher-unlock-hint"
            ) {{ adBlockedHint ?? t('adNoReward') }}
          div.lock-banner.game-text(v-else) 🔒 {{ t('lockedUntilStage', { n: SMASHERS[selectedId].unlockStage }) }}

  //- ── Skin Picker Modal ───────────────────────────────────────────────────
  FModal(
    :model-value="skinPickerOpen"
    @update:model-value="skinPickerOpen = $event"
    :is-closable="true"
    :title="t('selectSkin')"
    :key="'skin-' + skinPickerKey"
  )
    div.skin-picker-body(class="px-2 sm:px-4 py-2")
      div.flex.items-center.justify-between.mb-2
        div.coin-pill.ui-chip.ui-chip--sun
          IconCoin(class="w-3.5 h-3.5")
          span {{ coins }}
      div.grid.gap-2.skin-picker-grid(class="grid-cols-3 sm:grid-cols-4")
        div.skin-card(
          v-for="modelId in pickerSkins"
          :key="modelId"
          :class="[\
            getSelectedSkin(selectedTop, selectedSlot) === modelId\
              ? 'is-equipped'\
              : isSkinOwned(selectedTop, modelId)\
                ? 'is-owned'\
                : 'is-locked',\
            'rarity-' + skinRarity(modelId),\
            { 'is-flipping': flipping.has(modelId) }\
          ]"
          :data-testid="'skin-card-' + modelId"
          tabindex="0"
          :aria-label="skinLabel(modelId) + ' · ' + t('rarity.' + skinRarity(modelId))"
          :aria-describedby="skinPeekState?.key === modelId ? 'skin-peek' : undefined"
          v-on="skinPeek.bind(modelId)"
          @blur="skinPeekState?.key === modelId && skinPeek.close()"
        )
          //- Card back: only while the card turns over after a purchase.
          div.skin-card-back(v-if="flipping.has(modelId)" aria-hidden="true")
            span.skin-card-back-emblem
          div.skin-card-face(class="flex flex-col items-center p-1.5")
            span.skin-rarity.ui-rarity-name(:class="'ui-rarity-name--' + skinRarity(modelId)") {{ t('rarity.' + skinRarity(modelId)) }}
            img.skin-card-img(
              :src="modelImgPath(modelId, selectedId)"
              class="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-lg"
              :alt="modelId"
            )
            div.skin-card-name(class="mt-0.5 text-[0.7rem] sm:text-xs") {{ skinLabel(modelId) }}
            template(v-if="getSelectedSkin(selectedTop, selectedSlot) === modelId")
              div.ui-chip.ui-chip--leaf(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]") {{ t('equipped') }}
            template(v-else-if="isSkinOwned(selectedTop, modelId)")
              button.skin-btn.ui-btn.ui-btn--primary(
                class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
                @click="handleSelectSkin(selectedTop, modelId)"
              ) {{ t('selectButton') }}
            template(v-else-if="isEarnOnlySkin(modelId)")
              div.trophy-note.ui-chip.ui-chip--wood(
                class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
                role="note"
                :title="t('trophySkin.hint')"
                :aria-label="trophyCardText(modelId)"
              )
                span(aria-hidden="true") 🏆
                span.game-text {{ trophyCardText(modelId) }}
            template(v-else-if="isSkinAd(modelId)")
              button.skin-btn.ui-btn.ui-btn--ad(
                class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
                :data-testid="'skin-ad-' + modelId"
                :disabled="!adReady || skinAdPending"
                :aria-label="t('watchAdsToUnlock')"
                :title="t('watchAdsToUnlock')"
                @click="handleWatchSkinAd(selectedTop, modelId)"
              )
                span.game-text(v-if="isNative") {{ t('spinner.ad') }}
                img.object-contain(
                  :src="movieIconSrc()"
                  class="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  alt=""
                )
                span.skin-btn-label.game-text {{ t('unlock') }}
            template(v-else)
              button.skin-btn.ui-btn.ui-btn--premium(
                class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
                :class="{ 'is-disabled': coins < skinCost(modelId) }"
                @click="handleBuySkin(selectedTop, modelId)"
              )
                IconCoin(class="w-3 h-3")
                span.game-text {{ skinCost(modelId) }}
      //- An ad button that cannot start right now says why; an ad that paid
      //- nothing says "try again" (the button turns live by itself).
      p.unlock-hint.unlock-hint--picker(
        v-if="pickerAdBlocked || skinAdFailed"
        role="status"
        data-testid="skin-ad-hint"
      ) {{ pickerAdBlocked ? adBlockedHint : t('adNoReward') }}
      //- Long-press peek: the skin big, with its rarity (#UX1c).
      FSkinPeek(
        v-if="skinPeekState"
        id="skin-peek"
        :anchor="skinPeekState"
        :src="modelImgPath(skinPeekState.key, selectedId)"
        :name="skinLabel(skinPeekState.key)"
        :rarity="skinRarity(skinPeekState.key)"
      )
</template>


<style scoped lang="sass">
// Action pass: everything sits on FModal's ice card, so body text is ink.
// Team slots + roster are COLLECTIBLE CARDS: a bold ink frame with a rarity
// edge band + corner notch (CardRuneFrame, presentation-only rarity from
// smasherRarity.ts), a skewed ink name plate, an angled level chip. Cards lift
// and tilt on hover, sink on press (the global press handler adds
// .is-pressed), and the picked card turns sun with a pop. Locked cards are
// steel with flat hatch stripes. Stat bars are navy wells with striped fills.
// Perf: flat fills, 0-blur shadows only, transform/opacity motion only.

$ink: var(--color-ink)
$ink-outline: 0 1px 0 $ink, 1px 0 0 $ink, -1px 0 0 $ink, 0 -1px 0 $ink, 1px 1px 0 $ink, -1px 1px 0 $ink, 1px -1px 0 $ink, -1px -1px 0 $ink

// Ink text on the ice card by default; outlined white only on coloured chips.
.game-text
  text-shadow: none

.label-section
  font-size: 1rem
  font-weight: 900
  line-height: 1.1
  letter-spacing: 0.04em
  text-transform: uppercase
  color: var(--ui-text)

.coin-pill
  font-size: 0.85rem

.team-layout
  display: flex
  flex-direction: column
  gap: 0.6rem
  padding: 0.25rem 0.45rem
  color: var(--ui-text)

.team-col, .detail-col
  min-width: 0
  display: flex
  flex-direction: column
  gap: 0.45rem

.team-header
  min-height: 2rem

// ── Team slots / roster cards: collectible cards ───────────────────────────
// One row for the whole team (2 or 3 slots): a third slot no longer sits alone
// on a half-empty second row.
.team-slots
  display: grid
  grid-template-columns: repeat(var(--slots, 2), minmax(0, 1fr))
  gap: 0.55rem 0.5rem
  padding-bottom: 0.45rem
  // Room for the ✕ / + stickers that overhang the slot cards' top edge.
  padding-top: 0.5rem

// One grid cell per slot: the card fills it; the ✕ / + sits on its corner.
.team-slot-cell
  position: relative
  display: flex
  min-width: 0
  > .team-slot
    flex: 1 1 auto
    min-width: 0

// ✕ (berry: take out) / + (leaf: field again) on slot 2 / 3 — a round 3D
// sticker overhanging the card's top-right corner, 30 px visible with a
// 44 px tap area (::after). Hard navy outline + drop; press sinks.
.slot-toggle
  --tg-bg: var(--color-berry-500)
  --tg-band: var(--color-berry-700)
  position: absolute
  top: -0.55rem
  right: -0.4rem
  z-index: 30
  width: 1.9rem
  height: 1.9rem
  display: grid
  place-items: center
  padding: 0
  border: 2px solid $ink
  border-radius: 50%
  background-color: var(--tg-bg)
  color: var(--color-ice-50)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 var(--tg-band), 0 3px 0 $ink
  cursor: pointer
  transition: transform 0.22s var(--ui-spring), box-shadow 0.22s var(--ui-spring)
  -webkit-tap-highlight-color: transparent
  svg
    width: 1.05rem
    height: 1.05rem
    filter: drop-shadow(0 1px 0 $ink)
  &::after
    content: ''
    position: absolute
    inset: -0.45rem
    border-radius: 50%
  @media (hover: hover)
    &:hover
      transform: translateY(-2px) rotate(-8deg)
      box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 var(--tg-band), 0 5px 0 $ink
  &:active, &.is-pressed
    transform: translateY(2px) scale(0.94)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), inset 0 -2px 0 var(--tg-band), 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

.slot-toggle--field
  --tg-bg: var(--color-leaf-500)
  --tg-band: var(--color-leaf-700)

// ── Team size picker: 1 / 2 / 3 segments (dots = smashers in battle) ───────
.team-size
  display: flex
  flex-direction: column
  gap: 0.3rem

.team-size-label
  font-size: 0.78rem
  font-weight: 900
  letter-spacing: 0.04em
  text-transform: uppercase
  color: var(--ui-text-muted)

.team-size-opts
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 0.4rem

.team-size-opt
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.15rem
  min-height: 2.9rem
  padding: 0.3rem 0.25rem
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  color: var(--color-ink)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)
  cursor: pointer
  transition: transform 0.26s var(--ui-spring)
  -webkit-tap-highlight-color: transparent
  @media (hover: hover)
    &:not(.is-locked):not(.is-picked):hover
      transform: translateY(-2px)
      border-color: var(--color-royal-400)
  &:not(.is-locked):active
    transform: translateY(2px) scale(0.96)
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  &.is-picked
    border: 3px solid var(--color-ink)
    background-color: var(--color-leaf-500)
    color: var(--color-ice-50)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 -4px 0 var(--color-leaf-700), 0 4px 0 var(--color-ink)
    transform: translateY(-2px)
    .size-dot
      background-color: var(--color-ice-50)
    .size-num
      text-shadow: var(--ui-stroke-sm)
  &.is-locked
    cursor: not-allowed
    background-color: var(--color-steel-300)
    background-image: var(--ui-hatch)
    border-color: var(--color-steel-500)
    .size-dot
      background-color: var(--color-steel-600)

.size-dots
  display: flex
  gap: 0.18rem

.size-dot
  width: 0.55rem
  height: 0.55rem
  border: 2px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-royal-500)

.size-num
  font-size: 1rem
  font-weight: 900
  line-height: 1

.size-lock
  font-size: 0.6rem
  font-weight: 900
  line-height: 1.1
  text-align: center
  color: var(--color-berry-700)

.team-size-note
  margin: 0
  font-size: 0.68rem
  font-weight: 700
  line-height: 1.2
  text-align: center
  color: var(--ui-text)
  opacity: 0.8

.team-size-rule
  margin: 0
  font-size: 0.78rem
  font-weight: 800
  line-height: 1.2
  text-align: center
  color: var(--ui-text)

// A slot outside the picked team size: still filled, sits out.
.team-slot.is-benched
  background-color: var(--color-ice-200)
  .slot-portrait
    filter: grayscale(0.85) brightness(0.85)
    opacity: 0.75

.bench-tag
  position: absolute
  z-index: 22
  top: 1.6rem
  left: 50%
  translate: -50% 0
  padding: 0.1rem 0.45rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-steel-600)
  color: var(--color-ice-50)
  font-size: 0.6rem
  font-weight: 900
  text-transform: uppercase
  white-space: nowrap
  pointer-events: none

// A slot the campaign has not opened yet: names the stage that opens it.
.team-slot.team-slot--locked
  justify-content: center
  gap: 0.25rem
  cursor: default
  background-color: var(--color-steel-300)
  background-image: var(--ui-hatch)
  box-shadow: 0 4px 0 $ink
  @media (hover: hover)
    &:hover
      transform: none
      box-shadow: 0 4px 0 $ink
  .slot-tag
    position: absolute
    top: 0.4rem
    left: 0.4rem

.slot-lock-icon
  font-size: 1.6rem
  line-height: 1

.slot-lock-text
  font-size: 0.7rem
  font-weight: 900
  line-height: 1.15
  text-align: center
  color: var(--color-berry-700)

// Rarity name ("RARE", "EPIC"…) on a skewed plate across the card's base
// band, hanging over the bottom edge like a trading-card banner.
.card-rarity
  position: absolute
  z-index: 21
  left: 50%
  bottom: -0.7rem
  translate: -50% 0
  max-width: calc(100% - 0.3rem)
  // shrink with the card: long names ("LEGENDÄR", "LÉGENDAIRE") must fit
  // the plate on narrow landscape-phone cards
  font-size: clamp(0.42rem, 10.5cqi, 0.68rem)
  padding-inline: 0.45em
  letter-spacing: 0.01em
  white-space: nowrap
  pointer-events: none

.roster-card.is-locked .card-rarity
  opacity: 0.85

.detail-rarity
  margin-left: 0.45rem
  font-size: 0.72rem
  vertical-align: 0.1em

.team-slot, .roster-card
  --edge: var(--rarity-common)
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  border: 2px solid transparent
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  // A faint two-tone facet across the art area (#UX1c, was a stripe wash).
  background-image: var(--ui-facet-ink)
  color: var(--ui-text)
  box-shadow: 0 4px 0 $ink
  cursor: pointer
  transform-origin: 50% 100%
  transition: transform 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring), background-color 0.12s ease
  -webkit-tap-highlight-color: transparent
  // The pop-in stagger must not pin `transform` after it ends (fill: both
  // would beat :hover / :active), so it only back-fills the delay.
  &.ui-pop-in
    animation-fill-mode: backwards
  @media (hover: hover)
    &:hover
      transform: translateY(-3px) rotate(-1.2deg)
      box-shadow: 0 7px 0 $ink
  &:active, &.is-pressed
    transform: translateY(3px) scale(0.97)
    box-shadow: 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
  &.is-selected
    background-color: var(--color-sun-200)
    background-image: var(--ui-facet)
    box-shadow: 0 0 0 3px var(--color-sun-400), 0 6px 0 $ink
    transform: translateY(-2px)
    animation: card-pick 0.36s var(--ui-spring)

@keyframes card-pick
  0%
    transform: translateY(2px) scale(0.9)
  100%
    transform: translateY(-2px) scale(1)

.rarity-common
  --edge: var(--rarity-common)
.rarity-rare
  --edge: var(--rarity-rare)
.rarity-super
  --edge: var(--rarity-super)
.rarity-epic
  --edge: var(--rarity-epic)
.rarity-legendary
  --edge: var(--rarity-legendary)

.team-slot
  padding: 0.4rem 0.4rem 0.6rem

.slot-tag
  align-self: flex-start
  position: relative
  z-index: 16
  font-size: 0.7rem
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  color: var(--ui-text-muted)

.slot-portrait
  width: 4.2rem
  height: 4.2rem
  object-fit: contain
  position: relative
  z-index: 16
  transition: transform 0.3s var(--ui-spring)

.team-slot.is-selected .slot-portrait, .roster-card.is-selected .roster-portrait
  transform: scale(1.08) translateY(-2px)

// Skewed ink name plate across the card (the title strip of a trading card).
.name-plate
  position: relative
  z-index: 16
  display: inline-flex
  justify-content: center
  max-width: 100%
  padding: 0.12em 0.7em 0.18em
  isolation: isolate
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    background-color: var(--color-royal-800)
    border: 2px solid $ink
    border-radius: 0.3rem
    box-shadow: inset 0 2px 0 var(--color-royal-600), 0 2px 0 $ink
    transform: skewX(-12deg)
  > span
    min-width: 0
    color: var(--color-ice-50)
    text-shadow: $ink-outline
    overflow-wrap: break-word
    hyphens: auto
    text-align: center

.slot-name, .roster-name
  font-weight: 900
  font-size: 0.9rem
  line-height: 1.1
  margin-top: 0.1rem

// Three slots in one row: the name shrinks instead of breaking mid-word.
.slot-name
  font-size: clamp(0.62rem, 11.5cqi, 0.9rem)
  max-width: 100%
  > span
    white-space: nowrap
    overflow-wrap: normal
    hyphens: none

// Angled level chip (parallelogram), royal with a stroked white number.
.lv-badge
  position: relative
  z-index: 20
  display: inline-block
  margin-top: 0.3rem
  padding: 1px 8px 2px
  font-size: 0.72rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-ice-50)
  background-color: var(--color-royal-500)
  border: 2px solid $ink
  border-radius: 0.3rem
  box-shadow: inset 0 2px 0 var(--color-royal-300), 0 2px 0 $ink
  text-shadow: $ink-outline
  transform: skewX(-10deg)
  > span
    display: inline-block
    transform: skewX(10deg)

.lv-badge--big
  font-size: 0.95rem
  padding: 2px 12px 3px
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 3px 0 $ink

// (The level-up punch is design.sass `.ui-bump--punch`: it animates the
// individual scale / rotate properties, so the chip keeps its skew.)

// ── Roster ─────────────────────────────────────────────────────────────────
.roster-title
  text-align: center

// ── Roster filter chips (#UX1c) ──────────────────────────────────────────────
// ONE row of compact ice pills that scrolls sideways when it does not fit
// (long locales, narrow phones) — it never eats several rows above the grid;
// each pill is 32 px tall but its tap area is 44 px (an invisible ::after
// reaching 6 px above and below). The picked one stands up as a sun puck
// with a lip. Rarity chips carry a dot in the tier colour; the count sits on
// a small navy counter.
.roster-filters
  display: flex
  // #playtest-1-10: wrap to a second row instead of clipping the rarity chips at the right edge
  // (7 chips ≈ 730 px never fit one row on a phone, and the cut-off chips read as broken).
  flex-wrap: wrap
  justify-content: safe center
  gap: 0.55rem 0.35rem
  margin: 0.2rem -0.25rem 0.6rem
  padding: 0.45rem 0.45rem 0.55rem
  overflow-x: auto
  overscroll-behavior-x: contain
  scrollbar-width: none
  &::-webkit-scrollbar
    display: none
  // The row stays ONE line (a wrapped row pushed the grid out of view on desktop too); a seamless
  // mask fade (no overlay element, so no seam) marks the clipped side(s).
  &.is-more-right
    mask-image: linear-gradient(to right, #000 calc(100% - 1.6rem), transparent)
  &.is-more-left
    mask-image: linear-gradient(to left, #000 calc(100% - 1.6rem), transparent)
  &.is-more-left.is-more-right
    mask-image: linear-gradient(to right, transparent, #000 1.6rem, #000 calc(100% - 1.6rem), transparent)

.roster-filter
  --dot: transparent
  position: relative
  flex: 0 0 auto
  display: inline-flex
  align-items: center
  gap: 0.3rem
  min-height: 2rem
  padding: 0 0.5rem 0.1rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-ice-50)
  color: $ink
  font-weight: 900
  font-size: 0.66rem
  line-height: 1
  white-space: nowrap
  box-shadow: inset 0 -3px 0 var(--color-ice-300), 0 3px 0 $ink
  // 44 px tap target around the 32 px pill.
  &::after
    content: ''
    position: absolute
    inset: -6px -2px
  cursor: pointer
  transition: transform 0.22s var(--ui-spring), box-shadow 0.22s var(--ui-spring), background-color 0.12s ease
  -webkit-tap-highlight-color: transparent
  &::before
    content: ''
    width: 0.6rem
    height: 0.6rem
    border-radius: 50%
    background-color: var(--dot)
    border: 2px solid $ink
    display: none
  @media (hover: hover)
    &:hover:not(.is-on)
      transform: translateY(-2px)
      box-shadow: inset 0 -3px 0 var(--color-ice-300), 0 5px 0 $ink
  &:active, &.is-pressed
    transform: translateY(2px) scale(0.97)
    box-shadow: inset 0 -2px 0 var(--color-ice-300), 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  &.is-on
    background-color: var(--color-sun-400)
    background-image: var(--ui-facet)
    box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -4px 0 var(--color-sun-600), 0 3px 0 $ink
    transform: translateY(-2px)

.roster-filter--common, .roster-filter--rare, .roster-filter--super, .roster-filter--epic, .roster-filter--legendary
  &::before
    display: block
.roster-filter--common
  --dot: var(--rarity-common)
.roster-filter--rare
  --dot: var(--rarity-rare)
.roster-filter--super
  --dot: var(--rarity-super)
.roster-filter--epic
  --dot: var(--rarity-epic)
.roster-filter--legendary
  --dot: var(--rarity-legendary)

.roster-filter__label
  text-transform: uppercase
  letter-spacing: 0.03em

.roster-filter__count
  min-width: 1.35rem
  padding: 0.12rem 0.3rem 0.16rem
  border-radius: 999px
  background-color: var(--color-royal-900)
  color: var(--color-ice-50)
  font-size: 0.68rem
  font-variant-numeric: tabular-nums
  text-align: center

.roster-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  // Row gap leaves room for the rarity banner hanging under each card.
  gap: 0.95rem 0.5rem
  padding-bottom: 0.45rem

// A long press opens the stats peek: no callout / selection on the way.
.roster-card
  -webkit-touch-callout: none
  user-select: none
  -webkit-user-select: none

.roster-card
  padding: 0.35rem 0.2rem 0.55rem
  &.is-locked
    background-color: var(--color-steel-300)
    background-image: var(--ui-hatch)
    .roster-portrait
      filter: grayscale(1) brightness(0.7)
    .name-plate::before
      background-color: var(--color-steel-600)
      box-shadow: 0 2px 0 $ink

.roster-portrait
  width: 3.1rem
  height: 3.1rem
  object-fit: contain
  position: relative
  z-index: 16
  transition: transform 0.3s var(--ui-spring)

// Roster plates span the card so long names (Woodpecker, Chomper) fit
// without breaking mid-word on a 360 px phone.
// Name, species and rarity size to the CARD (container units), not the
// viewport: the roster is 4 columns on a phone, 6 on a landscape phone and a
// half-width column on desktop, and a long name ("Woodpecker") must never
// break mid-word in any of them.
.roster-card, .team-slot
  container-type: inline-size

.roster-name
  align-self: stretch
  margin-left: 0.15rem
  margin-right: 0.15rem
  font-size: clamp(0.6rem, 15cqi, 0.74rem)
  padding: 0.1em 0.1em 0.15em
  > span
    display: block
    max-width: 100%
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
    overflow-wrap: normal
    hyphens: none

.roster-species
  max-width: 100%
  font-size: clamp(0.55rem, 13.5cqi, 0.66rem)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  font-weight: 800
  color: var(--ui-text-muted)
  line-height: 1.1
  margin-top: 0.15rem
  text-align: center
  overflow-wrap: break-word
  hyphens: auto
  position: relative
  z-index: 16

.lock-note
  position: relative
  z-index: 16
  margin-top: 0.15rem
  font-size: 0.62rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-berry-700)
  text-align: center

// ── "More smashers coming soon" (release gate) ─────────────────────────────
// A non-interactive card closing the roster: the later release's teaser.
.roster-soon
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.3rem
  background-color: var(--color-ice-200)
  cursor: default
.roster-soon__mark
  font-size: 1.9rem
  font-weight: 900
  line-height: 1
  color: var(--color-steel-600)
.roster-soon__label
  font-size: clamp(0.55rem, 13.5cqi, 0.7rem)
  font-weight: 900
  line-height: 1.1
  text-align: center
  color: var(--color-steel-700, var(--color-steel-600))

// ── Premium smasher waiting for its unlock ──────────────────────────────────
// Not "off" (no steel hatch: it IS available) but not owned yet either: its
// rarity frame on a pale face, the portrait a touch muted, and the price as
// an angled chip where the level chip sits — sky + MovieIcon for one rewarded
// ad, sun + coin where the session has no rewarded ads.
.roster-card.is-unlockable
  background-color: var(--color-ice-200)
  .roster-portrait
    filter: saturate(0.55) brightness(0.92)

// Spans the card like the name plate and sizes to the CARD (container
// units): "Unlock" must fit a 4-column phone roster without an ellipsis.
.unlock-chip
  position: relative
  z-index: 20
  display: inline-flex
  align-items: center
  justify-content: center
  align-self: stretch
  gap: 0.15rem
  min-width: 0
  margin: 0.3rem 0.2rem 0
  padding: 1px 3px 2px
  font-size: clamp(0.5rem, 12.5cqi, 0.72rem)
  font-weight: 900
  line-height: 1.1
  border: 2px solid $ink
  border-radius: 0.3rem
  transform: skewX(-10deg)
  white-space: nowrap
  > *
    transform: skewX(10deg)
  > span
    overflow: hidden
    text-overflow: ellipsis

.unlock-chip--ad
  color: var(--color-ice-50)
  background-color: var(--color-sky-500)
  box-shadow: inset 0 2px 0 var(--color-sky-300), 0 2px 0 $ink
  text-shadow: $ink-outline

.unlock-chip--coins
  color: var(--color-ink)
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), 0 2px 0 $ink

.unlock-chip__icon
  flex: none
  width: 1.15em
  height: 1.15em
  object-fit: contain

// Team-slot number on a roster card: a leaf sticker that hops in.
.team-mark
  position: absolute
  z-index: 20
  top: 0.15rem
  left: 0.2rem
  width: 1.3rem
  height: 1.3rem
  border-radius: 999px
  background-color: var(--color-leaf-500)
  border: 2px solid $ink
  box-shadow: inset 0 2px 0 var(--color-leaf-300), 0 2px 0 $ink
  color: var(--color-ice-50)
  text-shadow: $ink-outline
  font-size: 0.72rem
  font-weight: 900
  display: flex
  align-items: center
  justify-content: center
  animation: team-mark-in 0.34s var(--ui-spring) both

@keyframes team-mark-in
  0%
    transform: scale(0) rotate(-30deg)
  100%
    transform: none

// ── Detail panel: a recessed ice well ──────────────────────────────────────
.detail-col
  background-color: var(--ui-surface-2)
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.16)
  padding: 0.55rem

.detail-head
  display: flex
  gap: 0.6rem
  align-items: center

// Portrait in a rarity-edged frame with a corner notch; swings in on a new pick.
.detail-portrait-wrap
  --edge: var(--rarity-common)
  position: relative
  flex: 0 0 auto
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  background-image: var(--ui-facet-ink)
  border: 3px solid $ink
  box-shadow: inset 0 0 0 3px var(--edge), inset 0 -6px 0 var(--edge), 0 4px 0 $ink
  animation: portrait-in 0.4s var(--ui-spring)
  &::after
    content: ''
    position: absolute
    top: 0
    right: 0
    width: 1.4rem
    height: 1.4rem
    background-color: var(--edge)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45)
    clip-path: polygon(0 0, 100% 0, 100% 100%)
    border-top-right-radius: calc(var(--radius-ui) - 3px)
    pointer-events: none

@keyframes portrait-in
  0%
    transform: scale(0.82) rotate(-5deg)
  100%
    transform: none

.detail-portrait
  width: 5.5rem
  height: 5.5rem
  object-fit: contain

// "+" colourway button: a little sun 3D button that sinks when pressed.
.skin-plus-btn
  position: absolute
  z-index: 2
  right: -0.5rem
  bottom: -0.45rem
  width: 2rem
  height: 2rem
  border-radius: 999px
  border: 2px solid $ink
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 3px 0 $ink
  color: var(--color-ice-50)
  text-shadow: $ink-outline
  font-weight: 900
  font-size: 1.3rem
  line-height: 1
  cursor: pointer
  transition: translate 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring)
  @media (hover: hover)
    &:hover
      translate: 0 -2px
  &:active
    translate: 0 2px
    box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -1px 0 var(--color-sun-600), 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  // Visual disc stays small; the tap area is padded out.
  &::after
    content: ''
    position: absolute
    inset: -0.6rem

.detail-title
  min-width: 0
  flex: 1 1 auto

.detail-name
  color: var(--ui-text)
  font-weight: 900
  font-size: 1.25rem
  line-height: 1.1

.detail-species
  color: var(--color-royal-600)
  font-size: 0.8rem
  font-weight: 900

.detail-desc
  color: var(--ui-text-muted)
  font-size: 0.8rem
  font-weight: 800
  line-height: 1.25
  margin-top: 0.15rem

.level-line
  margin-top: 0.3rem

// ── Stats ──────────────────────────────────────────────────────────────────
.stat-bars
  display: flex
  flex-direction: column
  gap: 0.25rem

.stat-row
  display: grid
  grid-template-columns: 1.3rem 3.6rem minmax(0, 1fr) auto auto
  align-items: center
  gap: 0.35rem
  font-size: 0.82rem
  color: var(--ui-text)

.stat-row-icon
  width: 1.25rem
  height: 1.25rem

.stat-row-label
  font-weight: 900
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.stat-bar
  position: relative
  height: 0.8rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-royal-900)
  box-shadow: inset 0 2px 0 $ink
  overflow: hidden

.stat-bar-fill, .stat-bar-next
  position: absolute
  inset: 0 auto 0 0
  border-radius: 999px

// Faceted fill that grows in from 0 on every pick (rows are re-keyed).
.stat-bar-fill
  background-image: var(--ui-facet)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(22, 26, 64, 0.25)
  transform-origin: 0 50%
  transition: width 0.45s var(--ui-back-out)
  animation: bar-grow 0.5s var(--ui-back-out) both
  animation-delay: calc(var(--i, 0) * 45ms + 80ms)

// Next-level preview: a pale ghost of the fill that blinks gently.
.stat-bar-next
  opacity: 0.4
  animation: next-blink 1.4s ease-in-out infinite

@keyframes bar-grow
  0%
    transform: scaleX(0)
  100%
    transform: scaleX(1)

@keyframes next-blink
  0%, 100%
    opacity: 0.25
  50%
    opacity: 0.55

.stat-row-value
  font-weight: 900
  color: var(--ui-text)
  min-width: 2.6rem
  text-align: right

.stat-row-next
  font-weight: 900
  color: var(--color-leaf-700)
  min-width: 3rem

// ── Actions ────────────────────────────────────────────────────────────────
// #playtest-1-10: sticky dock at the bottom of the modal scroller (its containing block is the whole
// .team-layout, so it stays in view while the roster scrolls) naming the pick it acts on.
.action-dock
  position: sticky
  bottom: 0
  // Above the roster cards' level chips (z 20) and pop-in transforms.
  z-index: 30
  display: flex
  align-items: center
  gap: 0.45rem
  min-width: 0
  padding: 0.4rem 0.45rem
  background-color: var(--color-ice-50)
  border: 2px solid $ink
  border-radius: var(--radius-ui-lg)
  box-shadow: 0 -3px 0 rgba(35, 56, 168, 0.16)
  .action-row
    flex: 1 1 auto
    min-width: 0
    gap: 0.3rem
  // Compact but still a 44 px tap target.
  .slot-btn
    min-height: 2.75rem
    padding: 0.2rem 0.3rem 0.3rem
    font-size: 0.72rem
    line-height: 1.05

.dock-who
  flex: 0 0 3.6rem
  width: 3.6rem
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.1rem
  .lv-badge
    position: static
    margin-top: 0

.dock-portrait
  width: 2.2rem
  height: 2.2rem
  object-fit: contain

.dock-name
  max-width: 100%
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  font-size: 0.7rem
  font-weight: 900
  line-height: 1.1

.action-row
  display: flex
  flex-wrap: wrap
  gap: 0.45rem
  align-items: center
  justify-content: space-between

.levelup-wrap
  position: relative
  flex: 1 1 10rem
  min-width: 0

.levelup-label
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.25rem
  font-size: 0.95rem

.levelup-icon
  width: 1.1rem
  height: 1.1rem

.coin-float
  position: absolute
  top: -0.4rem
  right: 0.6rem
  color: var(--color-sun-300)
  text-shadow: $ink-outline
  font-weight: 900
  pointer-events: none
  animation: coin-float 0.9s ease-out forwards

@keyframes coin-float
  0%
    opacity: 1
    transform: translateY(0)
  100%
    opacity: 0
    transform: translateY(-1.6rem)

.unlock-wrap
  flex: 1 1 100%
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem

.unlock-movie
  object-fit: contain

// "Ad not ready — try again" / "after the match" / "no reward": a quiet ink
// line under the disabled ad button, never a modal.
.unlock-hint
  margin: 0
  font-size: 0.72rem
  font-weight: 800
  line-height: 1.2
  text-align: center
  color: var(--ui-text-muted)

.unlock-hint--picker
  margin-top: 0.5rem

.skin-btn-label
  max-width: 4.6rem
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.lock-banner
  flex: 1 1 10rem
  text-align: center
  font-weight: 900
  padding: 0.5rem
  border-radius: var(--radius-ui)
  border: 2px solid $ink
  box-shadow: 0 3px 0 $ink

.lock-banner
  background-color: var(--color-steel-500)
  background-image: var(--ui-facet)
  color: var(--color-ice-50)
  text-shadow: $ink-outline

.slot-buttons
  display: flex
  gap: 0.4rem
  flex: 1 1 10rem

.slot-btn
  flex: 1 1 0
  min-height: 2.75rem
  padding: 0.3rem 0.4rem 0.4rem
  font-size: 0.82rem

// ── Skills: ice cards with the skill medallion ─────────────────────────────
.skill-list
  display: flex
  flex-direction: column
  gap: 0.35rem

.skill-row
  display: flex
  gap: 0.5rem
  align-items: flex-start
  padding: 0.4rem 0.45rem
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  border: 2px solid $ink
  box-shadow: inset 4px 0 0 var(--color-plum-500), 0 3px 0 $ink
  &.is-locked
    background-color: var(--color-steel-300)
    background-image: var(--ui-hatch)
    border-color: var(--color-steel-500)
    box-shadow: inset 4px 0 0 var(--color-steel-500)
    .skill-desc, .skill-name
      opacity: 0.7
    :deep(svg)
      filter: grayscale(1)

.skill-text
  min-width: 0
  flex: 1 1 auto

.skill-head
  display: flex
  flex-wrap: wrap
  gap: 0.15rem 0.45rem
  align-items: center

.skill-name
  color: var(--ui-text)
  font-weight: 900
  font-size: 0.92rem

.skill-lv, .skill-lock
  display: inline-flex
  padding: 0 0.45em 0.05em
  border-radius: 999px
  border: 2px solid $ink
  font-size: 0.72rem
  font-weight: 900
  line-height: 1.3

.skill-lv
  background-color: var(--color-plum-500)
  color: var(--color-ice-50)
  text-shadow: $ink-outline

.skill-lock
  background-color: var(--color-ice-200)
  color: var(--ui-text)

.skill-desc
  color: var(--ui-text-muted)
  font-weight: 800
  font-size: 0.78rem
  line-height: 1.3

.hint-text
  margin: 0
  font-size: 0.75rem
  font-weight: 800
  line-height: 1.25
  color: var(--ui-text-muted)
  text-align: center

// ── Desktop / tablet: roster beside the detail panel ───────────────────────
// Two columns as a grid: the roster spans both rows, the detail panel and the sticky action dock
// share the right column (#playtest-1-10).
@media (min-width: 760px)
  .team-layout
    display: grid
    grid-template-columns: minmax(0, 52fr) minmax(0, 48fr)
    grid-template-rows: auto 1fr
    align-items: start
  .team-col
    grid-column: 1
    grid-row: 1 / span 2
  .detail-col
    grid-column: 2
    grid-row: 1
  .action-dock
    grid-column: 2
    grid-row: 2
    align-self: end
  .label-section
    font-size: 1.15rem

// ── Landscape phones: the same two columns, tighter ────────────────────────
@media (orientation: landscape) and (max-height: 500px)
  .team-layout
    display: grid
    grid-template-columns: minmax(0, 55fr) minmax(0, 45fr)
    grid-template-rows: auto 1fr
    align-items: start
    gap: 0.4rem
  .team-col
    grid-column: 1
    grid-row: 1 / span 2
  .detail-col
    grid-column: 2
    grid-row: 1
    padding: 0.4rem
  .action-dock
    grid-column: 2
    grid-row: 2
    align-self: end
    padding: 0.3rem 0.4rem
  .roster-grid
    grid-template-columns: repeat(6, minmax(0, 1fr))
    gap: 0.3rem
  .roster-portrait
    width: 2.4rem
    height: 2.4rem
  .roster-species
    display: none
  // Six narrow columns: a little more room for the one-line names.
  .roster-name
    padding-left: 0
    padding-right: 0
  .slot-portrait
    width: 3rem
    height: 3rem
  .detail-portrait
    width: 4rem
    height: 4rem
  .detail-desc
    display: none

// ── Skin picker ────────────────────────────────────────────────────────────
// Colourway cards: ice cards with an ink edge; locked = steel hatch, the
// equipped one sun with a facet and a lift.
.skin-card
  border: 2px solid var(--color-steel-500)
  border-radius: var(--radius-ui)
  background-color: var(--color-steel-300)
  background-image: var(--ui-hatch)
  color: var(--ui-text)
  box-shadow: 0 3px 0 var(--color-steel-600)
  &.is-owned
    border-color: $ink
    background-color: var(--color-ice-50)
    background-image: none
    box-shadow: 0 3px 0 $ink
    cursor: pointer
  &.is-equipped
    border-color: $ink
    background-color: var(--color-sun-200)
    background-image: var(--ui-facet)
    box-shadow: 0 0 0 3px var(--color-sun-400), 0 4px 0 $ink
    transform: translateY(-2px)

// Rarity on the colourway card: the rarity name on top, the base edge in the
// rarity colour once owned (presentation only, smasherRarity.ts skinRarity).
.skin-card
  --edge: var(--rarity-common)
  position: relative
  // Long press = skin peek (#UX1c): no callout / text selection on the way.
  -webkit-touch-callout: none
  user-select: none
  -webkit-user-select: none
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  &.is-owned, &.is-equipped
    border-bottom-width: 5px
    border-bottom-color: var(--edge)
.skin-card.rarity-rare
  --edge: var(--rarity-rare)
.skin-card.rarity-super
  --edge: var(--rarity-super)
.skin-card.rarity-epic
  --edge: var(--rarity-epic)
.skin-card.rarity-legendary
  --edge: var(--rarity-legendary)

.skin-rarity
  font-size: 0.55rem
  margin-bottom: 0.15rem

// ── Card flip on a new skin (#UX1b) ─────────────────────────────────────────
// The card starts face down (a faceted royal back with a sun emblem), turns
// over on Y with a lift, and lands on its new owned face with a sun ring.
.skin-card.is-flipping
  transform-style: preserve-3d
  animation: skin-flip 0.78s cubic-bezier(0.3, 1.1, 0.5, 1) both
  z-index: 2

.skin-card-face
  backface-visibility: hidden
  -webkit-backface-visibility: hidden

.skin-card-back
  position: absolute
  inset: -2px
  z-index: 3
  display: flex
  align-items: center
  justify-content: center
  border: 2px solid $ink
  border-radius: var(--radius-ui)
  background-color: var(--color-royal-600)
  background-image: var(--ui-facet)
  box-shadow: inset 0 0 0 4px var(--color-royal-400)
  transform: rotateY(180deg)
  backface-visibility: hidden
  -webkit-backface-visibility: hidden

.skin-card-back-emblem
  width: 42%
  aspect-ratio: 1
  background-color: var(--color-sun-400)
  border: 2px solid $ink
  clip-path: polygon(50% 0, 63% 35%, 100% 38%, 71% 61%, 81% 100%, 50% 78%, 19% 100%, 29% 61%, 0 38%, 37% 35%)

.skin-card.is-flipping::after
  content: ''
  position: absolute
  inset: -6px
  border: 4px solid var(--color-sun-400)
  border-radius: calc(var(--radius-ui) + 4px)
  opacity: 0
  pointer-events: none
  animation: skin-flip-ring 0.5s ease-out 0.62s both

// A beat of anticipation face down (the back lifts), then the turn.
@keyframes skin-flip
  0%
    transform: perspective(600px) rotateY(180deg) scale(1)
  24%
    transform: perspective(600px) rotateY(180deg) scale(1.07) translateY(-4px)
  62%
    transform: perspective(600px) rotateY(80deg) scale(1.12) translateY(-6px)
  100%
    transform: perspective(600px) rotateY(0deg) scale(1)

@keyframes skin-flip-ring
  0%
    opacity: 1
    transform: scale(0.9)
  100%
    opacity: 0
    transform: scale(1.18)

// The same turn for a premium smasher's roster card the moment its unlock
// lands (ad or coins); the gift reveal then shows it big.
.roster-card.is-flipping
  animation: skin-flip 0.78s cubic-bezier(0.3, 1.1, 0.5, 1) both
  z-index: 2
  &::after
    content: ''
    position: absolute
    inset: -6px
    z-index: 30
    border: 4px solid var(--color-sun-400)
    border-radius: calc(var(--radius-ui) + 4px)
    opacity: 0
    pointer-events: none
    animation: skin-flip-ring 0.5s ease-out 0.62s both

// ── Long-press stats peek ──────────────────────────────────────────────────
// A small collectible stat card above the held roster card: rarity edge on
// top, portrait + name + rarity / level, four headline stat bars.
.smasher-peek
  --edge: var(--rarity-common)
  position: fixed
  z-index: 70
  width: 11rem
  padding: 0.45rem 0.55rem 0.55rem
  border: 3px solid $ink
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  box-shadow: inset 0 5px 0 var(--edge), 0 5px 0 $ink
  color: var(--ui-text)
  pointer-events: none
  translate: -50% -100%
  transform-origin: 50% 100%
  animation: peek-pop 0.22s var(--ui-back-out)
  &.is-below
    translate: -50% 0
    transform-origin: 50% 0

@keyframes peek-pop
  0%
    scale: 0.6
    opacity: 0
  100%
    scale: 1
    opacity: 1

.peek-head
  display: flex
  align-items: center
  gap: 0.4rem
  margin: 0.15rem 0 0.35rem

.peek-portrait
  width: 2.6rem
  height: 2.6rem
  object-fit: contain

.peek-title
  min-width: 0
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: 0.2rem

.peek-name
  font-weight: 900
  font-size: 0.95rem
  line-height: 1.05

.peek-tags
  display: flex
  align-items: center
  gap: 0.35rem
  .lv-badge
    margin-top: 0
    white-space: nowrap

.peek-stat
  display: grid
  grid-template-columns: 1rem 2.3rem minmax(0, 1fr) auto
  align-items: center
  gap: 0.3rem
  font-size: 0.72rem
  font-weight: 900
  margin-top: 0.15rem

.peek-stat-icon
  width: 1rem
  height: 1rem

.peek-stat-label
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.peek-bar
  position: relative
  height: 0.6rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-royal-900)
  overflow: hidden

.peek-bar-fill
  position: absolute
  inset: 0 auto 0 0
  background-image: var(--ui-facet)

.peek-stat-value
  min-width: 2.2rem
  text-align: right

.peek-lock
  margin-top: 0.3rem
  font-size: 0.68rem
  font-weight: 900
  color: var(--color-berry-700)

.skin-card-name
  font-weight: 900
  text-align: center
  color: var(--ui-text)

.skin-btn
  min-height: 2.75rem
  padding: 0.3em 0.8em 0.4em
  gap: 0.25rem

.trophy-note
  gap: 0.25rem
  .game-text
    color: var(--color-ice-50)
    text-shadow: $ink-outline

.skin-btn .game-text
  color: inherit
  text-shadow: inherit

@media (orientation: landscape) and (max-height: 500px)
  .skin-picker-grid
    gap: 0.3rem
    grid-template-columns: repeat(6, minmax(0, 1fr))
  .skin-card-img
    width: 2.4rem
    height: 2.4rem

// Reduced motion: no entrances, no idle blink; state colours stay.
@media (prefers-reduced-motion: reduce)
  .team-slot.is-selected, .roster-card.is-selected, .team-mark, .detail-portrait-wrap, .stat-bar-fill, .stat-bar-next, .smasher-peek, .skin-card.is-flipping, .skin-card.is-flipping::after, .roster-card.is-flipping, .roster-card.is-flipping::after
    animation: none
  // No flip: the back never shows, the card simply is owned.
  .skin-card-back
    display: none
  .team-slot, .roster-card, .slot-portrait, .roster-portrait, .skin-plus-btn
    transition-duration: 0.08s
    transition-timing-function: ease-out
</style>

<style lang="sass">
// #Consistency-11: the modal body scrolls (FModal paints no edge overlay since #UX1c — a sticky
// fade cut a seam across the cards). A MASK has no element to seam: the last ~2 rem of the visible
// body dissolves while there is more below, so a cut grid row reads as "scroll for more".
// Unscoped: FModal teleports to <body>, outside this component's scope id.
// #playtest-1-10: no bottom fade any more — the sticky action dock covers the bottom edge (a fade
// there would dissolve LEVEL UP); only the top edge fades.
.team-modal .modal-content-slot.scroll-fade-top
  mask-image: linear-gradient(to bottom, transparent, #000 1.2rem)
</style>
