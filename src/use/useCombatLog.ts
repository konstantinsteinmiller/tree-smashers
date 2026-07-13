import { ref } from 'vue'
import type { TopPartId } from '@/types/spinner'

// ─── Combat log ──────────────────────────────────────────────────────────────
//
// A niche, strategist-facing feed of what just happened in battle: every
// speed-based collision hit is recorded as a structured entry ("Enemy Tank
// Piercer deals 12 damage to Spinner 1 Star Blade — Critical strike"). The
// UI (CombatLog.vue) is minimised by default so it never nags casual players.
//
// Storage is a PLAIN ring buffer (not a deep-reactive array): a battle can
// emit many hits per second and we don't want Vue tracking every element.
// Instead we bump a cheap `combatLogVersion` ref on each push — while the log
// panel is closed nothing subscribes to it, so a push costs an array
// operation plus a ref write. When the panel opens it reads a one-shot
// snapshot keyed on that version.

export interface CombatLogEntry {
  id: number
  /** Who struck. */
  attackerOwner: 'player' | 'npc'
  /** 1-based Spinner number for player blades (matches the HUD stat cards);
   *  null for enemy blades, which are labelled generically as "Enemy". */
  attackerSpinner: number | null
  attackerPart: TopPartId
  /** Who was hit. */
  targetOwner: 'player' | 'npc'
  targetSpinner: number | null
  targetPart: TopPartId
  /** Rounded damage dealt. */
  dmg: number
  /** Back-hit critical strike. */
  crit: boolean
  /** Which side the closing speed clearly favoured (2×+), or null. */
  speedFavors: 'attacker' | 'target' | null
}

const MAX_ENTRIES = 200
const entries: CombatLogEntry[] = []
let nextId = 0

/** Bumped on every push/clear so the panel can react without the buffer
 *  itself being reactive. */
export const combatLogVersion = ref(0)

export const pushCombatEntry = (entry: Omit<CombatLogEntry, 'id'>): void => {
  entries.push({ ...entry, id: nextId++ })
  // Trim from the front so we keep only the most recent MAX_ENTRIES.
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  combatLogVersion.value++
}

/** Wipe the buffer — called at the start of every match. */
export const clearCombatLog = (): void => {
  entries.length = 0
  combatLogVersion.value++
}

/** Newest-first snapshot for display. Copies out of the live buffer so the
 *  panel renders a stable list even as more hits land underneath. */
export const getCombatLogSnapshot = (): CombatLogEntry[] => entries.slice().reverse()

export const MAX_COMBAT_LOG_ENTRIES = MAX_ENTRIES
