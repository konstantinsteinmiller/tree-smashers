import { shallowRef, type Ref, type ShallowRef } from 'vue'

/**
 * ─── A portal's OWN leaderboard, seen from platform-neutral code ────────────
 *
 * Our global board (`useLiveLeaderboard`, the Cloudflare Worker) ranks every
 * player on every portal. Some portals also keep a board of their own, tied to
 * their own accounts (Wavedash). Two things cross over:
 *
 *   • the SCORE MIRROR — every run reported to our board is also handed to the
 *     portal's board (`reportRun` → `mirrorScore`), and
 *   • the PORTAL BOARD — rows the leaderboard modal can show in a second tab.
 *
 * Both are INJECTED by the platform's boot branch, never imported from here,
 * for the reason spelled out over `setSdkNameSource`: an import of a platform
 * module in shared code drags that SDK into every other build's graph. Unset
 * (the default, and every non-Wavedash build) means "this build has no portal
 * board": the mirror is a no-op and the modal shows our board alone.
 */

/** One row of a portal board, already shaped for `LeaderboardModal`. */
export interface PlatformBoardRow {
  rank: number
  name: string
  score: number
  /** `null` when the portal row carries no power (posted without metadata). */
  power: number | null
  /** Matched by the portal's own user id, not by name. */
  isYou: boolean
}

export interface PlatformBoard {
  /** i18n key of the modal tab that shows this board. */
  labelKey: string
  rows: Readonly<Ref<readonly PlatformBoardRow[]>>
  /** The player's own rank on the portal board, `0` = unknown / not on it. */
  ownRank: Readonly<Ref<number>>
  /** Players on the portal board, `0` = unknown. */
  total: Readonly<Ref<number>>
  pending: Readonly<Ref<boolean>>
  failed: Readonly<Ref<boolean>>
  /** Load (or refresh a stale copy of) the board. Never throws, never blocks. */
  refresh: () => Promise<void>
}

/** Receives the same lifetime best + power `reportRun` gets. Must not throw. */
export type ScoreMirror = (score: number, power: number) => void

/** A `shallowRef` so the modal's tab appears the moment a lazily loaded
 *  platform module installs its board, even with the modal already mounted. */
export const platformBoard: ShallowRef<PlatformBoard | null> = shallowRef(null)

let scoreMirror: ScoreMirror | null = null

export const setPlatformBoard = (board: PlatformBoard | null): void => {
  platformBoard.value = board
}

export const setScoreMirror = (mirror: ScoreMirror | null): void => {
  scoreMirror = mirror
}

/**
 * Hand a reported run to the portal's board, if this build has one.
 *
 * Fire-and-forget like `reportRun` itself: a portal board is a decoration on a
 * decoration, so a throwing mirror is swallowed here rather than allowed to
 * cost the player the rank on our own board.
 */
export const mirrorScore = (score: number, power: number): void => {
  if (!scoreMirror) return
  try {
    scoreMirror(score, power)
  } catch { /* the mirror's own problem — our board carries on */ }
}
