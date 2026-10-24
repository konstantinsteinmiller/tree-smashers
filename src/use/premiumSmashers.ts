// ─── Premium smasher ownership (Tuskar onwards) ─────────────────────────────
//
// Rules in src/data/premiumSmashers.ts. This module owns the one persisted
// record, `smashers_premium_smashers` (PREMIUM_SMASHERS_KEY):
//
//   { "v": 1, "own": ["tuskar", …], "at": 120 }
//
//   own — premium smashers the player has unlocked (ad, coins, or carried over
//         from a save that had them before the rule);
//   at  — the best stage this record has accounted for.
//
// ── Never take anything away ───────────────────────────────────────────────
// Before the rule a premium smasher joined the roster just by reaching its
// stage. A save from before the rule has no record; the first `settle` writes
// one that OWNS every premium smasher whose stage the save already reached.
// `at` then follows every stage advance (+1 at a time — SpinnerArena's
// best-stage watcher calls `settlePremiumSmashers`). A best stage that is MORE
// than one ahead of `at` cannot come from playing under this rule: it is a save
// from an older build arriving late (a cloud hydrate that won over a fresh
// local record, a stale ref at boot that settled at stage 1 before the real
// save was read). Every premium smasher in that gap is carried over as well.
// The only other source of a jump is the dev stage cheat.
//
// While no record exists, ownership answers by the OLD rule (stage reached ⇒
// owned), so a slow cloud read can never show a legacy player a locked card.
// A record is only WRITTEN once the save has settled (hydrate state success) —
// never against a pre-hydration or offline snapshot.
//
// Reactive: `owned` re-reads on every `saveDataVersion` bump (a cloud hydrate
// that lands mid-session), like every other save-backed composable.

import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { PREMIUM_SMASHERS_KEY, STAGE_KEY } from '@/keys'
import { hydrateState, saveDataVersion } from '@/use/useSaveStatus'
import { SMASHERS, isReleasedSmasher, isSmasherId, type SmasherId } from '@/data/smasherCatalog'
import { PREMIUM_SMASHER_IDS, isPremiumSmasher } from '@/data/premiumSmashers'

export interface PremiumRecord {
  own: SmasherId[]
  at: number
}

/** Parse the stored record; null when absent or unreadable (= legacy save). */
export const parsePremiumRecord = (raw: string | null): PremiumRecord | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.own)) return null
    const own: SmasherId[] = []
    for (const id of parsed.own) if (isSmasherId(id) && isPremiumSmasher(id) && !own.includes(id)) own.push(id)
    const at = typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? Math.max(0, Math.floor(parsed.at)) : 0
    return { own, at }
  } catch {
    return null
  }
}

/** Premium smashers a save at `fromStage` had NOT reached but one at
 *  `toStage` has — the ones a late old-build save carries over. */
export const premiumReachedBetween = (fromStage: number, toStage: number): SmasherId[] =>
  PREMIUM_SMASHER_IDS.filter(id => SMASHERS[id].unlockStage > fromStage && SMASHERS[id].unlockStage <= toStage)

/**
 * The pure settle step: the record after the save has been seen at
 * `bestStage`, and which smashers this step carried over.
 *   • no record      → own every premium smasher reached (legacy save), at = stage
 *   • stage > at + 1 → a late old-build save: own the gap too
 *   • otherwise      → `at` follows the stage, nothing granted
 */
export const settleRecord = (
  rec: PremiumRecord | null,
  bestStage: number
): { rec: PremiumRecord, granted: SmasherId[] } => {
  const stage = Math.max(0, Math.floor(bestStage))
  if (rec === null) {
    const granted = premiumReachedBetween(0, stage)
    return { rec: { own: granted, at: stage }, granted }
  }
  if (stage > rec.at + 1) {
    // Released only: a held-back smasher was never ownable without the
    // explicit unlock on a build with a record, so the gap grants none.
    // (The no-record legacy branch above keeps them — they owned them under
    // the old rule; release gate: nothing is taken away.)
    const granted = premiumReachedBetween(rec.at, stage).filter(id => !rec.own.includes(id) && isReleasedSmasher(id))
    return { rec: { own: [...rec.own, ...granted], at: stage }, granted }
  }
  return { rec: { own: rec.own, at: Math.max(rec.at, stage) }, granted: [] }
}

const loadRecord = (): PremiumRecord | null => {
  try {
    return parsePremiumRecord(localStorage.getItem(PREMIUM_SMASHERS_KEY))
  } catch {
    return null
  }
}

/** The stored record (null: none yet). Read-only outside this module. */
export const premiumRecord: Ref<PremiumRecord | null> = ref(loadRecord())

watch(saveDataVersion, () => {
  premiumRecord.value = loadRecord()
})

const persist = (rec: PremiumRecord) => {
  premiumRecord.value = rec
  try {
    localStorage.setItem(PREMIUM_SMASHERS_KEY, JSON.stringify({ v: 1, own: rec.own, at: rec.at }))
  } catch { /* storage blocked — the in-memory record still holds this session */
  }
}

/** The save is settled (no pending / failed cloud read): safe to write. */
const saveSettled = (): boolean =>
  hydrateState.value === 'success-with-data' || hydrateState.value === 'success-empty'

/** The campaign stage as stored — the source of truth after hydration (a
 *  module ref may still hold a pre-hydration value at boot). */
const storedStage = (): number => {
  try {
    return parseInt(localStorage.getItem(STAGE_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

/**
 * Account for the save at `bestStage` (see the header). Call it whenever the
 * best stage changes (SpinnerArena's best-stage watcher) and when the team
 * modal opens. Writes only on a settled save. Returns the smashers it carried
 * over (empty almost always).
 */
export const settlePremiumSmashers = (bestStage: number): SmasherId[] => {
  if (!saveSettled()) return []
  const stage = Math.max(bestStage, storedStage())
  const cur = premiumRecord.value
  const { rec, granted } = settleRecord(cur, stage)
  if (cur && rec.at === cur.at && granted.length === 0) return []
  persist(rec)
  return granted
}

/** Is this smasher owned (a non-premium smasher always is)? Without a record
 *  the old rule answers: reached ⇒ owned. */
export const isPremiumOwned = (id: SmasherId, bestStage: number): boolean => {
  if (!isPremiumSmasher(id)) return true
  const rec = premiumRecord.value
  if (rec === null) return bestStage >= SMASHERS[id].unlockStage
  return rec.own.includes(id)
}

/** Stage reached but not unlocked yet: the card offers the unlock. */
export const isPremiumUnlockable = (id: SmasherId, bestStage: number): boolean =>
  isPremiumSmasher(id) && isReleasedSmasher(id) && bestStage >= SMASHERS[id].unlockStage && !isPremiumOwned(id, bestStage)

/**
 * Unlock a premium smasher — after a COMPLETED rewarded ad, or after the
 * caller checked the coin price (it deducts the coins only when this returns
 * true). Refuses a non-premium smasher, one whose stage is not reached and one
 * already owned — and anything while no record exists, because then the old
 * rule still answers "owned" (nothing to unlock). Returns true when this call
 * unlocked it.
 */
export const unlockPremiumSmasher = (id: SmasherId, bestStage: number): boolean => {
  const rec = premiumRecord.value
  if (rec === null || !isPremiumUnlockable(id, bestStage)) return false
  persist({ own: [...rec.own, id], at: rec.at })
  return true
}

/** Test / dev hook: drop the record from memory and storage. */
export const resetPremiumSmashers = () => {
  premiumRecord.value = null
  try {
    localStorage.removeItem(PREMIUM_SMASHERS_KEY)
  } catch { /* ignore */
  }
}
