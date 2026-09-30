// ─── Skills: levels, loadout, reveal/intro bookkeeping ──────────────────────
//
// Singleton composable (skills-feature.md §6.2, §7, §10.2, §10.4). Pure game
// state — no components, no ads, no telemetry.
//
// Two states per skill:
//   • UNLOCKED — derived, never stored: highest cleared stage
//     (`currentStageId − 1`) ≥ the skill's boss stage. A hydrate race or a
//     fresh device can therefore never lose an unlock, and stage 101+ (the
//     infinite campaign re-running bosses) unlocks nothing new because the
//     last drop is stage 55.
//   • LEARNED — a stored level ≥ 1 in `spinner_skills`, bought with coins
//     (150 for L1, then the catalog's upgrade costs up to L10).
//
// Stored values are never rewritten on READ: a stored level whose skill is
// not unlocked by the current stage is simply ignored (it becomes effective
// again once the stage catches up — e.g. after a late cloud hydrate), and the
// loadout is sanitized into `slots` on every read the same way.
//
// Slot auto-fill (§6.2): when a skill is learned or a slot opens, an empty
// OPEN slot gets the earliest learned, unequipped skill. It never replaces a
// skill the player placed, and a slot the player emptied on purpose is not
// refilled by the slot-open path — the persisted `filled` marker records how
// many slots auto-fill has already processed.
//
// Feature flag: `isSkillsEnabled` (build literal). Off → nothing is
// unlocked, every loadout is empty and every mutation is refused.
//
// Cloud: every key is `spinner_`-prefixed (synced + merged, see
// SaveMergePolicy) and re-read on `saveDataVersion` (hydrate / reset).

import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { SKILLS_KEY, SKILL_LOADOUT_KEY, SKILL_UI_KEY } from '@/keys'
import {
  SKILL_AUTOFILL_ORDER,
  SKILL_IDS,
  SKILL_MAX_LEVEL,
  SKILL_TEAM_SLOTS,
  SKILL_TEASER_STAGE,
  canEquipTogether,
  isSkillId,
  skillCost,
  unlockedSkillIds,
  unlockedSlotCount
} from '@/data/skillCatalog'
import type { SkillId, SkillLoadout, SkillSlots } from '@/types/skills'
import type { BattleMode } from '@/use/bossPeek'
import { SKILLS_BUILD as isSkillsEnabled } from '@/skills/skillsGate'
import { saveDataVersion } from '@/use/useSaveStatus'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import useSpinnerConfig from '@/use/useSpinnerConfig'

// ─── Persisted shapes ───────────────────────────────────────────────────────

export type SkillLevels = Partial<Record<SkillId, number>>

export interface SkillUiState {
  /** Skills whose unlock reveal was shown (or covered by the intro). */
  seen: SkillId[]
  /** The skills INTRO screen was shown and closed. */
  intro: boolean
  /** The "New skill slot!" reveal for slot 2 was shown. */
  slot2Seen: boolean
  /** How many slots the slot-open auto-fill has already processed (0..2). */
  filled: number
  /** Skills the player has looked at in the skill picker (clears the Team
   *  button NEW dot together with `seen`). */
  viewed: SkillId[]
}

const SAVE_VERSION = 1

const readJson = (key: string): unknown => {
  const raw = localStorage.getItem(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Stored levels, unknown ids and junk dropped, clamped to 1..10. */
export const parseSkillLevels = (raw: unknown): SkillLevels => {
  const out: SkillLevels = {}
  const lv = isRecord(raw) ? raw.lv : null
  if (!isRecord(lv)) return out
  for (const id of SKILL_IDS) {
    const v = lv[id]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const level = Math.min(SKILL_MAX_LEVEL, Math.floor(v))
    if (level >= 1) out[id] = level
  }
  return out
}

/** Stored slots, shape-checked only (ownership is checked in `slots`). */
export const parseSkillSlots = (raw: unknown): SkillSlots => {
  const arr = isRecord(raw) && Array.isArray(raw.slots) ? raw.slots : []
  return [
    isSkillId(arr[0]) ? arr[0] : null,
    isSkillId(arr[1]) ? arr[1] : null
  ]
}

export const parseSkillUi = (raw: unknown): SkillUiState => {
  const r = isRecord(raw) ? raw : {}
  const seen = Array.isArray(r.seen) ? [...new Set(r.seen.filter(isSkillId))] : []
  const filled = typeof r.filled === 'number' && Number.isFinite(r.filled)
    ? Math.max(0, Math.min(SKILL_TEAM_SLOTS, Math.floor(r.filled)))
    : 0
  const viewed = Array.isArray(r.viewed) ? [...new Set(r.viewed.filter(isSkillId))] : []
  return { seen, intro: r.intro === true, slot2Seen: r.slot2Seen === true, filled, viewed }
}

/**
 * Sanitize a slot pair against what is equippable: an unlearned / locked
 * skill, a slot beyond `slotCount`, a duplicate (first entry wins) and a pair
 * `canEquipTogether` forbids (first entry wins) are all dropped.
 */
export const sanitizeSkillSlots = (
  slots: readonly (SkillId | null)[],
  isLearned: (id: SkillId) => boolean,
  slotCount: number
): SkillSlots => {
  const out: SkillSlots = [null, null]
  for (let i = 0; i < SKILL_TEAM_SLOTS; i++) {
    const id = slots[i] ?? null
    if (i >= slotCount || id == null || !isLearned(id)) continue
    const other = out[i === 0 ? 1 : 0]
    if (other === id) continue
    if (other != null && !canEquipTogether(other, id)) continue
    out[i] = id
  }
  return out
}

// ─── Singleton state ────────────────────────────────────────────────────────

const storedLevels: Ref<SkillLevels> = ref(parseSkillLevels(readJson(SKILLS_KEY)))
const storedSlots: Ref<SkillSlots> = ref(parseSkillSlots(readJson(SKILL_LOADOUT_KEY)))
const ui: Ref<SkillUiState> = ref(parseSkillUi(readJson(SKILL_UI_KEY)))

/** Dev cheat (ctrl+shift+alt+a): every skill unlocked + both slots open.
 *  Never persisted. */
const devOwnAllSkills = ref(false)

watch(saveDataVersion, () => {
  storedLevels.value = parseSkillLevels(readJson(SKILLS_KEY))
  storedSlots.value = parseSkillSlots(readJson(SKILL_LOADOUT_KEY))
  ui.value = parseSkillUi(readJson(SKILL_UI_KEY))
})

const { currentStageId } = useSpinnerCampaign()
const { coins, addCoins } = useSpinnerConfig()

// ─── Derived ────────────────────────────────────────────────────────────────

/** Highest cleared campaign stage (the stage-N boss win advances to N+1). */
const highestCleared = computed(() => Math.max(0, currentStageId.value - 1))

const unlockedIds = computed<SkillId[]>(() => {
  if (!isSkillsEnabled) return []
  if (devOwnAllSkills.value) return [...SKILL_AUTOFILL_ORDER]
  return unlockedSkillIds(highestCleared.value)
})

const slotCount = computed<0 | 1 | 2>(() => {
  if (!isSkillsEnabled) return 0
  if (devOwnAllSkills.value) return 2
  return unlockedSlotCount(highestCleared.value)
})

/** Learned AND unlocked levels — what the game actually uses. */
const levels = computed<SkillLevels>(() => {
  const out: SkillLevels = {}
  for (const id of unlockedIds.value) {
    const lv = storedLevels.value[id]
    if (lv) out[id] = lv
  }
  return out
})

const isUnlocked = (id: SkillId): boolean => unlockedIds.value.includes(id)
const levelOf = (id: SkillId): number => levels.value[id] ?? 0
const isLearned = (id: SkillId): boolean => levelOf(id) >= 1

/** Learned skills in unlock order. */
const learnedIds = computed<SkillId[]>(() => unlockedIds.value.filter(isLearned))

/** The sanitized team slots. */
const slots = computed<SkillSlots>(() =>
  sanitizeSkillSlots(storedSlots.value, isLearned, slotCount.value)
)

/** Teaser row (§7.1): stage 8+ before the first unlock. */
const showTeaser = computed(() =>
  isSkillsEnabled && slotCount.value === 0 && currentStageId.value >= SKILL_TEASER_STAGE
)

const totalLevels = computed(() =>
  Object.values(storedLevels.value).reduce((a, b) => a + (b ?? 0), 0)
)

// ─── Persistence ────────────────────────────────────────────────────────────

const saveLevels = () => {
  localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: SAVE_VERSION, lv: storedLevels.value }))
}
const saveSlots = () => {
  localStorage.setItem(SKILL_LOADOUT_KEY, JSON.stringify({ v: SAVE_VERSION, slots: storedSlots.value }))
}
const saveUi = () => {
  localStorage.setItem(SKILL_UI_KEY, JSON.stringify({ v: SAVE_VERSION, ...ui.value }))
}

const writeSlots = (next: SkillSlots) => {
  storedSlots.value = next
  saveSlots()
}

// ─── Auto-fill ──────────────────────────────────────────────────────────────

/** Fill the given empty open slots with the earliest learned, unequipped
 *  skills. Returns true when anything changed. */
const fillSlots = (indices: number[]): boolean => {
  const current: SkillSlots = [...slots.value]
  let changed = false
  for (const i of indices) {
    if (i >= slotCount.value || current[i] != null) continue
    const other = current[i === 0 ? 1 : 0]
    const pick = learnedIds.value.find(id =>
      id !== other && (other == null || canEquipTogether(other, id))
    )
    if (pick) {
      current[i] = pick
      changed = true
    }
  }
  if (changed) writeSlots(current)
  return changed
}

/**
 * Slot-open auto-fill, idempotent: fills slots that opened since the last
 * run (tracked by the persisted `filled` marker) so a slot the player
 * emptied deliberately is never refilled. Called from `learn`, `upgrade`,
 * `loadoutForBattle` and by the UI when the Team modal opens.
 */
const syncAutofill = (): void => {
  if (!isSkillsEnabled || devOwnAllSkills.value) return
  const count = slotCount.value
  if (count <= ui.value.filled) return
  const opened: number[] = []
  for (let i = ui.value.filled; i < count; i++) opened.push(i)
  fillSlots(opened)
  ui.value = { ...ui.value, filled: count }
  saveUi()
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type SkillBuyResult = 'ok' | 'disabled' | 'locked' | 'learned' | 'max' | 'coins'

/** Learn L1 for 150 coins — only once the skill's boss has been beaten. */
const learn = (id: SkillId): SkillBuyResult => {
  if (!isSkillsEnabled) return 'disabled'
  if (!isUnlocked(id)) return 'locked'
  if (isLearned(id)) return 'learned'
  const cost = skillCost(0)!
  if (coins.value < cost) return 'coins'
  addCoins(-cost)
  storedLevels.value = { ...storedLevels.value, [id]: 1 }
  saveLevels()
  syncAutofill()
  // Learning always auto-fills an empty open slot (§6.2).
  fillSlots([0, 1])
  return 'ok'
}

/** Learn (level 0) or raise one level; refused at L10 / locked / short. */
const upgrade = (id: SkillId): SkillBuyResult => {
  if (!isSkillsEnabled) return 'disabled'
  if (!isUnlocked(id)) return 'locked'
  const level = levelOf(id)
  if (level === 0) return learn(id)
  const cost = skillCost(level)
  if (cost == null) return 'max'
  if (coins.value < cost) return 'coins'
  addCoins(-cost)
  storedLevels.value = { ...storedLevels.value, [id]: level + 1 }
  saveLevels()
  return 'ok'
}

/** Coins for the next step of `id` (learn = 150), null at max. */
const nextCost = (id: SkillId): number | null => skillCost(levelOf(id))

export type SkillEquipResult = 'ok' | 'disabled' | 'slot-locked' | 'not-learned' | 'excluded'

/**
 * Put `id` into `slot`. If it already sits in the other slot the two slots
 * swap (the other slot receives whatever `slot` held).
 */
const equip = (slot: number, id: SkillId): SkillEquipResult => {
  if (!isSkillsEnabled) return 'disabled'
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount.value) return 'slot-locked'
  if (!isLearned(id)) return 'not-learned'
  const next: SkillSlots = [...slots.value]
  const idx = slot as 0 | 1
  const otherIdx = idx === 0 ? 1 : 0
  if (next[otherIdx] === id) {
    next[otherIdx] = next[idx]
    next[idx] = id
  } else {
    const other = next[otherIdx]
    if (other != null && !canEquipTogether(other, id)) return 'excluded'
    next[idx] = id
  }
  writeSlots(next)
  return 'ok'
}

const unequip = (slot: number): void => {
  if (!isSkillsEnabled || (slot !== 0 && slot !== 1)) return
  const next: SkillSlots = [...slots.value]
  next[slot] = null
  writeSlots(next)
}

export interface LoadoutOptions {
  /** PvP "level 1" lobbies: every skill fights at L1. */
  levelOne?: boolean
}

/**
 * The local side's loadout for a battle — the single place that decides it
 * (§9). Every mode fights with the team's slots (campaign, daily, ghost,
 * PvP, cheat); the opponent's comes from the PvP message / ghost record.
 * Flag off → always empty.
 */
const loadoutForBattle = (_mode: BattleMode, opts: LoadoutOptions = {}): SkillLoadout => {
  if (!isSkillsEnabled) return []
  syncAutofill()
  const out: SkillLoadout = []
  for (const id of slots.value) {
    if (id == null) continue
    out.push({ id, level: opts.levelOne ? 1 : levelOf(id) })
  }
  return out
}

// ─── Reveals + intro (§7.1 + the intro screen) ──────────────────────────────

/**
 * When the skills INTRO may open. The arena (WP7) asks at these moments:
 *   • 'win-closed'  — the win screen closed (boss wins: after the roulette
 *                     reward's continue). The ONLY trigger that shows it.
 *   • 'loss-closed' / 'menu' — never; listed so the caller can ask blindly.
 */
export type SkillsIntroTrigger = 'win-closed' | 'loss-closed' | 'menu'

export interface SkillsIntroContext {
  trigger: SkillsIntroTrigger
  /** The mode of the battle whose result screen closed; PvP never shows it. */
  mode?: BattleMode
}

/**
 * The intro is pending while skills exist for this player (the stage-10 boss
 * is beaten) and it was never shown to completion. This single rule covers:
 *   • NEW players — pending the moment the stage-10 win advances the stage,
 *     so it opens as that win screen / roulette closes;
 *   • EXISTING players (past stage 10 when skills ship) — pending from the
 *     first load, but only a win-screen CLOSE shows it, so it lands after
 *     their next win;
 *   • drop-off — nothing is marked until `markSkillsIntroSeen()` runs after
 *     the intro closed, so leaving on the win screen retries on the next
 *     win-screen close;
 *   • reset — the ui key is wiped, stage 1 → not pending until stage 10 again.
 */
const isSkillsIntroPending = computed(() =>
  isSkillsEnabled && slotCount.value > 0 && !ui.value.intro
)

const shouldShowSkillsIntro = (ctx: SkillsIntroContext): boolean =>
  isSkillsIntroPending.value && ctx.trigger === 'win-closed' && ctx.mode !== 'pvp'

/** Skills the intro presents (every unlocked one; one for a new player). */
const introSkillIds = computed<SkillId[]>(() => (isSkillsIntroPending.value ? unlockedIds.value : []))

/** Call once the intro was actually shown AND closed. Covers every skill
 *  unlocked so far, so no lighter reveal replays them afterwards. */
const markSkillsIntroSeen = (): void => {
  if (!isSkillsEnabled) return
  ui.value = {
    ...ui.value,
    intro: true,
    seen: [...new Set([...ui.value.seen, ...unlockedIds.value])],
    slot2Seen: ui.value.slot2Seen || slotCount.value >= 2
  }
  saveUi()
}

/** Lighter per-unlock reveals (after the intro): unlocked, not yet seen. */
const pendingReveals = computed<SkillId[]>(() =>
  !isSkillsEnabled || !ui.value.intro ? [] : unlockedIds.value.filter(id => !ui.value.seen.includes(id))
)

/** "New skill slot!" pending (slot 2 opened after the intro was seen). */
const pendingSlotReveal = computed(() =>
  isSkillsEnabled && ui.value.intro && slotCount.value >= 2 && !ui.value.slot2Seen
)

const markSeen = (id: SkillId): void => {
  if (ui.value.seen.includes(id)) return
  ui.value = { ...ui.value, seen: [...ui.value.seen, id] }
  saveUi()
}

/** Has the player looked at this skill once — its reveal / the intro showed
 *  it (`seen`) or the skill picker was opened while it was unlocked? */
const isSkillViewed = (id: SkillId): boolean =>
  ui.value.seen.includes(id) || ui.value.viewed.includes(id)

/**
 * Team button NEW dot: an unlocked skill the player has not looked at yet
 * (learned skills never count), or the slot-2 reveal is pending. It clears
 * the first time the skill is viewed — reveal, intro or picker — not when it
 * is learned; the next unlock brings it back. Persisted in the ui key.
 */
const hasUnviewedSkill = computed(() =>
    isSkillsEnabled && (
      unlockedIds.value.some(id => !isLearned(id) && !isSkillViewed(id))
      || pendingSlotReveal.value
    )
)

/** The skill picker opened: every skill it shows (the unlocked ones) is
 *  viewed. The dev own-all cheat never persists anything. */
const markViewed = (ids: readonly SkillId[]): void => {
  if (!isSkillsEnabled || devOwnAllSkills.value) return
  const add = ids.filter(id => isUnlocked(id) && !isSkillViewed(id))
  if (!add.length) return
  ui.value = { ...ui.value, viewed: [...ui.value.viewed, ...add] }
  saveUi()
}

const markSlot2Seen = (): void => {
  if (ui.value.slot2Seen) return
  ui.value = { ...ui.value, slot2Seen: true }
  saveUi()
}

// ─── Dev cheats (useCheats) ─────────────────────────────────────────────────

const setDevOwnAllSkills = (on: boolean): void => {
  devOwnAllSkills.value = on
}

/** Every unlocked skill to L10 (persisted, like the coin cheat). */
const devMaxAllSkills = (): void => {
  if (!isSkillsEnabled) return
  const next: SkillLevels = { ...storedLevels.value }
  for (const id of unlockedIds.value) next[id] = SKILL_MAX_LEVEL
  storedLevels.value = next
  saveLevels()
  fillSlots([0, 1])
}

/** Wipe the three skill keys. */
const devWipeSkills = (): void => {
  localStorage.removeItem(SKILLS_KEY)
  localStorage.removeItem(SKILL_LOADOUT_KEY)
  localStorage.removeItem(SKILL_UI_KEY)
  storedLevels.value = {}
  storedSlots.value = [null, null]
  ui.value = parseSkillUi(null)
}

// ─── Public API ─────────────────────────────────────────────────────────────

const useSkills = () => ({
  isSkillsEnabled,
  highestCleared,
  unlockedIds,
  learnedIds,
  slotCount,
  levels,
  slots,
  showTeaser,
  totalLevels,
  devOwnAllSkills,
  isUnlocked,
  isLearned,
  levelOf,
  nextCost,
  learn,
  upgrade,
  equip,
  unequip,
  syncAutofill,
  loadoutForBattle,
  isSkillsIntroPending,
  introSkillIds,
  shouldShowSkillsIntro,
  markSkillsIntroSeen,
  pendingReveals,
  pendingSlotReveal,
  markSeen,
  markSlot2Seen,
  isSkillViewed,
  hasUnviewedSkill,
  markViewed,
  setDevOwnAllSkills,
  devMaxAllSkills,
  devWipeSkills
})

export {
  shouldShowSkillsIntro,
  markSkillsIntroSeen,
  loadoutForBattle
}

export default useSkills
