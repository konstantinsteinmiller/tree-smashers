// ─── Team size state: which counts are open, which one the player picked ────
//
// Singleton, localStorage-backed (all keys `smashers_`-prefixed → cloud save,
// re-read on every `saveDataVersion` bump like the other composables). The
// rules themselves are pure and live in src/data/teamSize.ts.
//
//   • open slots = max(stored high-water, slots the best stage reached gives)
//     — so a save from before team sizes existed gets its slots on first load
//     (a player past stage 10 can field 3 at once), and a cloud hydrate that
//     lands later can only ever add slots;
//   • the fielded size = the player's stored choice, else 2 once slot 2 is
//     open (the balance baseline) — clamped to the open slots, so a fresh
//     player (and stages 1–3) fights with one smasher;
//   • a slot the player has not seen yet badges the Team button.

import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { STAGE_KEY, TEAM_SIZE_KEY, TEAM_SLOTS_KEY, TEAM_SLOTS_SEEN_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'
import { clampTeamSize, effectiveTeamSize, teamSlotsForStage, type TeamSize } from '@/data/teamSize'

const readInt = (key: string): number | null => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value))
  } catch { /* storage blocked — the in-memory value still works */
  }
}

const loadChosen = (): TeamSize | null => {
  const n = readInt(TEAM_SIZE_KEY)
  return n === null ? null : clampTeamSize(n)
}

/** Stored high-water, or what the stored campaign stage alone opens (migration). */
const loadSlots = (): TeamSize => {
  const stored = readInt(TEAM_SLOTS_KEY)
  const stage = readInt(STAGE_KEY) ?? 1
  return clampTeamSize(Math.max(stored ?? 1, teamSlotsForStage(stage)))
}

const loadSeen = (): TeamSize => clampTeamSize(readInt(TEAM_SLOTS_SEEN_KEY) ?? 1)

/** The size picked in the team modal (null: never picked). */
export const chosenTeamSize: Ref<TeamSize | null> = ref(loadChosen())
/** Team slots opened so far (high-water). */
export const openTeamSlots: Ref<TeamSize> = ref(loadSlots())
/** Team slots the player has seen in the team modal. */
export const seenTeamSlots: Ref<TeamSize> = ref(loadSeen())

watch(saveDataVersion, () => {
  chosenTeamSize.value = loadChosen()
  openTeamSlots.value = loadSlots()
  seenTeamSlots.value = loadSeen()
})

/** Open slots at `bestStage` (never fewer than the stored high-water). */
export const teamSlotsAt = (bestStage: number): TeamSize =>
  clampTeamSize(Math.max(openTeamSlots.value, teamSlotsForStage(bestStage)))

/**
 * Persist the slots `bestStage` opens. Returns true when a slot just opened.
 *
 * AUTO-JOIN (#G1). The moment slot 2 opens (stage 3 just won), a 2nd smasher
 * joins the team automatically — even if the player had explicitly picked
 * size 1 before (the stored pick is raised to 2 once). The smasher itself is
 * the padding `fieldTeamIds` already does: the first recruited smasher not
 * already fielded. Later removals (✕ in the team modal) are respected, since
 * this only fires on the opening edge. A save that already HAS the slot (the
 * stored high-water, or a stored stage past 3 — migration) never sees the
 * edge, so it keeps whatever team it configured.
 */
export const syncTeamSlots = (bestStage: number): boolean => {
  const prev = openTeamSlots.value
  const next = teamSlotsAt(bestStage)
  const grew = next > prev
  if (grew || readInt(TEAM_SLOTS_KEY) !== next) write(TEAM_SLOTS_KEY, next)
  openTeamSlots.value = next
  if (grew && prev < 2 && next >= 2 && chosenTeamSize.value !== null && chosenTeamSize.value < 2) chooseTeamSize(2)
  return grew
}

/** True when `syncTeamSlots` result + new count mean "the 2nd smasher just joined". */
export const secondSlotJustOpened = (grew: boolean): boolean => grew && openTeamSlots.value === 2

/** The team size fielded at `bestStage` (campaign, cheat / lab stages). */
export const teamSizeAt = (bestStage: number): TeamSize =>
  effectiveTeamSize(chosenTeamSize.value, teamSlotsAt(bestStage))

/** The team modal's pick. Clamped to 1 … 3 (the modal only offers open counts). */
export const chooseTeamSize = (n: number): TeamSize => {
  const v = clampTeamSize(n)
  chosenTeamSize.value = v
  write(TEAM_SIZE_KEY, v)
  return v
}

/** A slot opened that the player has not seen in the team modal yet. */
export const hasUnseenTeamSlot = (bestStage: number): boolean => teamSlotsAt(bestStage) > seenTeamSlots.value

/** The team modal opened: every open slot has been seen. */
export const markTeamSlotsSeen = (bestStage: number): void => {
  const open = teamSlotsAt(bestStage)
  if (open <= seenTeamSlots.value) return
  seenTeamSlots.value = open
  write(TEAM_SLOTS_SEEN_KEY, open)
}

/** Test / reset hook. */
export const resetTeamSizeState = (): void => {
  chosenTeamSize.value = loadChosen()
  openTeamSlots.value = loadSlots()
  seenTeamSlots.value = loadSeen()
}
