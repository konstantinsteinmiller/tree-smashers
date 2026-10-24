// ─── Team size: 1, 2 or 3 smashers per side (pure, no Vue) ──────────────────
//
// The player fights with 1, 2 or 3 smashers — their own choice among the
// counts they have unlocked. Every rule that depends on how many smashers a
// side fields lives here, so the engine, the team modal, the PvP lobby, the
// balance sim and the tests all read one table.
//
// SIZE. Every smasher (and every campaign / boss blade drawn as one) is
// SMASHER_BASE_SIZE (0.9) of the old blade radius — the "1-smasher size" —
// and a side's team-size multiplier sits on top: 1 → 1.0, 2 → 0.87, 3 → 0.75
// (so 3 smashers are 25 % smaller than a lone one and fit the clearing). The
// per-smasher catalog `disc` and the boss size multiplier stack on top of
// that. A side's count is its team length at initGame (NPC teams of 4 use the
// 3 multiplier); spawned children (ghost twin, split shards, emitted minis)
// inherit their side's size.
//
// STATS. A side that fields exactly ONE blade gets SOLO_BOOST (×1.2) on
// damage and max HP; 2 is the balance baseline, 3 changes no stat (friendly
// fire and the smaller discs balance it). The rule is owner-agnostic: it
// applies to whichever side fields 1 — a solo PvP player, a lone campaign
// boss — and is derived from the team arrays both PvP peers hold, so the
// lockstep sim stays identical on both clients.
//
// UNLOCKS. Slot 1 from the start, slot 2 after WINNING stage 3, slot 3 after
// winning stage 10. "Won stage N" = the best stage reached is > N.

export const TEAM_SIZES = [1, 2, 3] as const
export type TeamSize = (typeof TEAM_SIZES)[number]
export const MAX_TEAM_SIZE: TeamSize = 3

/** Every smasher's radius against the pre-team-size blade radius (−10 %). */
export const SMASHER_BASE_SIZE = 0.9

/** Size multiplier per team size, relative to the 1-smasher size. */
export const TEAM_SIZE_MUL: Readonly<Record<TeamSize, number>> = Object.freeze({ 1: 1, 2: 0.87, 3: 0.75 })

/** Damage and max-HP multiplier of a side that fields a single blade. */
export const SOLO_BOOST = 1.2

/** Campaign stage that must be WON to open slot i + 1 (0 = open from the start). */
export const TEAM_SLOT_WIN_STAGE: readonly [0, 3, 10] = [0, 3, 10]

/** A team length as a team size (1 … 3; 0 / NaN → 1, 4+ → 3). */
export const clampTeamSize = (n: unknown): TeamSize => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 1
  return (v <= 1 ? 1 : v >= 3 ? 3 : v) as TeamSize
}

/** Radius multiplier of every blade on a side of `count` blades (base size × team size). */
export const sideSizeMul = (count: number): number => SMASHER_BASE_SIZE * TEAM_SIZE_MUL[clampTeamSize(count)]

/** Damage / max-HP multiplier of a side of `count` blades. */
export const sideStatMul = (count: number): number => (count === 1 ? SOLO_BOOST : 1)

/** Team slots open at this best-ever stage (1 … 3). `bestStage` is the
 *  deepest stage reached, so stage N is won once bestStage > N. */
export const teamSlotsForStage = (bestStage: number): TeamSize => {
  let n = 0
  for (const won of TEAM_SLOT_WIN_STAGE) if (bestStage > won) n++
  return clampTeamSize(n)
}

/** The campaign stage to win for slot `slot` (1-based), 0 when open from the start. */
export const teamSlotWinStage = (slot: number): number => TEAM_SLOT_WIN_STAGE[clampTeamSize(slot) - 1] ?? 0

/** The team size a player fights with: their stored choice, else 2 once
 *  slot 2 is open (the balance baseline), clamped to the open slots. */
export const effectiveTeamSize = (chosen: number | null | undefined, slots: number): TeamSize => {
  const open = clampTeamSize(slots)
  const want = chosen === null || chosen === undefined ? Math.min(2, open) : clampTeamSize(chosen)
  return clampTeamSize(Math.min(want, open))
}

/** League ranked fights and leaderboard ghosts are always this many per side
 *  (the build format, the league power / Elo math and the gatekeepers are
 *  fitted on two-smasher teams). */
export const RANKED_TEAM_SIZE: TeamSize = 2

/** PvP lobbies default to 2v2; the host can pick 1v1 or 3v3. */
export const PVP_DEFAULT_TEAM_SIZE: TeamSize = 2

// ─── Deselect / re-field a slot (team modal) ─────────────────────────────────
//
// The player can take smasher 2 or 3 out of the fight from its slot card (an
// ✕ on the card) — slot 1 is never emptied. Slots beyond the team size stay
// filled but sit out ("Resting"), so a deselect is a smaller team size, and
// the fielded slots always stay 1 … size with no gap:
//   • removing the LAST fielded slot (slot 3 of 3, slot 2 of 2) → size − 1;
//   • removing slot 2 while slot 3 fights → slot 3's smasher moves into slot 2,
//     the removed one rests in slot 3, size 3 → 2.
// A resting slot's "+" fields it again: the size grows to that slot (slots in
// between come back with it). Both return a NEW team array (same length).

export interface TeamSlotChange<T> {
  team: T[]
  size: TeamSize
}

/** Take slot `slot` (0-based, 1 or 2) out of a fielded team of `size`. */
export const benchTeamSlot = <T>(team: readonly T[], size: number, slot: number): TeamSlotChange<T> => {
  const n = clampTeamSize(size)
  const next = [...team]
  if (slot <= 0 || slot >= n) return { team: next, size: n }
  if (slot < n - 1) {
    // A gap would open: the last fielded smasher steps forward into it.
    const last = n - 1
    const tmp = next[slot] as T
    next[slot] = next[last] as T
    next[last] = tmp
  }
  return { team: next, size: clampTeamSize(n - 1) }
}

/** Field a resting slot `slot` (0-based) again: the size grows to cover it,
 *  capped at the open slots. */
export const fieldTeamSlot = (size: number, slot: number, openSlots: number): TeamSize =>
  clampTeamSize(Math.min(Math.max(clampTeamSize(size), slot + 1), clampTeamSize(openSlots)))
