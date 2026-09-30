// ─── "BOSS DEFEATED" title card ─────────────────────────────────────────────
//
// A cinematic beat between a boss kill and the boss roulette — the "ENEMY
// FELLED" / "WASTED" moment. Pure logic only (when it shows, how long it
// holds, a pause-aware timer); `BossDefeatedBanner.vue` renders it.
//
// Ordering contract (see the game-over watcher in SpinnerArena.vue):
//   • every reward that the boss win grants immediately (stage advance, battle
//     pass xp, first-win flag) is granted BEFORE the card opens — the card only
//     delays when the roulette overlay appears, never what the player owns;
//   • the midgame interstitial fires before the NEXT battle, never between a
//     battle and its result screen, so the card cannot land between an ad and
//     the screen it precedes.

import type { BattleMode } from '@/use/bossPeek'
import type { GameResult } from '@/types/spinner'
import { fitFontPx } from '@/use/useFitText'

/** Fade + scale + tracking-expansion in. */
export const BOSS_DEFEATED_IN_MS = 600
/** How long the title holds at full strength. */
export const BOSS_DEFEATED_HOLD_MS = 2000
/** Fade out. */
export const BOSS_DEFEATED_OUT_MS = 500
/** Total on-screen time; the CSS keyframes are laid out on this same length. */
export const BOSS_DEFEATED_TOTAL_MS = BOSS_DEFEATED_IN_MS + BOSS_DEFEATED_HOLD_MS + BOSS_DEFEATED_OUT_MS
/** A tap skips the card, but not before the title has landed (no accidental
 *  skip from the finger that was still on the screen for the last shot). */
export const BOSS_DEFEATED_SKIP_AFTER_MS = BOSS_DEFEATED_IN_MS

export interface BossDefeatedInput {
  result: GameResult
  /** `isBoss` of the stage the battle was fought on (before any advance). */
  isBossStage: boolean
  mode: BattleMode
}

/**
 * True exactly when the battle that just ended was a boss killed on the
 * roulette path: a won boss stage in the campaign (or on a cheat stage, which
 * takes the same roulette branch). PvP, the daily challenge and leaderboard
 * ghosts never show it — their boss-flagged stages are borrowed tables, not a
 * boss the player climbed to.
 */
export const shouldShowBossDefeated = ({ result, isBossStage, mode }: BossDefeatedInput): boolean =>
  result === 'win' && isBossStage && (mode === 'campaign' || mode === 'cheat')

export interface PausableTimer {
  pause: () => void
  resume: () => void
  /** Fire now (tap-to-skip). No-op once fired or cancelled. */
  finish: () => void
  cancel: () => void
  /** Milliseconds of RUNNING time elapsed so far (paused time excluded). */
  elapsed: () => number
  readonly done: boolean
}

/**
 * setTimeout that stops counting while the game is paused (platform pause
 * event, system overlay, ad). Fires `onDone` exactly once.
 */
export const createPausableTimer = (
  durationMs: number,
  onDone: () => void,
  now: () => number = () => performance.now()
): PausableTimer => {
  let banked = 0
  let startedAt: number | null = null
  let handle: ReturnType<typeof setTimeout> | null = null
  let done = false

  const clear = () => {
    if (handle !== null) clearTimeout(handle)
    handle = null
  }
  const elapsed = () => banked + (startedAt === null ? 0 : now() - startedAt)
  const fire = () => {
    if (done) return
    done = true
    clear()
    startedAt = null
    onDone()
  }
  const resume = () => {
    if (done || startedAt !== null) return
    startedAt = now()
    handle = setTimeout(fire, Math.max(0, durationMs - banked))
  }
  const pause = () => {
    if (done || startedAt === null) return
    banked += now() - startedAt
    startedAt = null
    clear()
  }
  const cancel = () => {
    done = true
    clear()
    startedAt = null
  }

  return {
    pause,
    resume,
    finish: fire,
    cancel,
    elapsed,
    get done() {
      return done
    }
  }
}

// ─── Title sizing ────────────────────────────────────────────────────────────
//
// Two steps, both measured on the live device rather than looked up per
// locale (39 locales × N fonts × two orientations is not a table anyone keeps
// in sync):
//   1. a viewport-driven BASE size — big on a desktop, bounded by the short
//      side on a landscape phone so the band never eats the whole height;
//   2. a measure-fit — the title is laid out once at the base size with its
//      FINAL letter-spacing (the expansion animation ends there), and when it
//      is wider than the room it has it is scaled down by exactly the overflow
//      ratio (`fitFontPx`, shared with the tap-to-start title).
// Letter-spacing is in `em`, so the measured width scales linearly with the
// font size and one measurement is enough.

/** Smallest title we will render; a translation that would need less is a
 *  translation to shorten (the locale-fit test flags it). */
export const BOSS_TITLE_MIN_PX = 20
const BOSS_TITLE_MAX_PX = 120
/** Fraction of the viewport WIDTH the base size may take per em. */
const BASE_VW = 0.13
/** Fraction of the viewport HEIGHT — the landscape-phone bound. */
const BASE_VH = 0.2
/** Fraction of the available row the title may fill (air at both edges). */
export const BOSS_TITLE_FILL = 0.92

/** Step 1: the unfitted size for a viewport. */
export const bossTitleBasePx = (vw: number, vh: number): number => {
  const px = Math.min(vw * BASE_VW, vh * BASE_VH)
  return Math.round(Math.min(BOSS_TITLE_MAX_PX, Math.max(BOSS_TITLE_MIN_PX + 8, px)))
}

/**
 * Step 2: the size to render, given the title's measured width at `basePx`
 * and the row width it has. Never larger than the base; never below the floor.
 */
export const bossTitleFontPx = (basePx: number, rowPx: number, needPx: number): number =>
  fitFontPx(basePx, rowPx * BOSS_TITLE_FILL, needPx, BOSS_TITLE_MIN_PX) ?? basePx

// ─── Two-line fallback ───────────────────────────────────────────────────────
//
// A long phrase ("BOSS MƏĞLUB EDILDI", "БОСА ПЕРЕМОЖЕНО") squeezed onto one
// line of a 320px portrait phone ends up a third of the size of English. When
// the single-line fit would lose more than this share of the base size and the
// phrase has a space to break at, it is set on two balanced lines instead —
// whichever layout ends up LARGER wins. Scripts without spaces (CJK, Thai) are
// short enough to stay on one line.

/** Go two-line when one line would render below this fraction of the base. */
export const BOSS_TITLE_TWO_LINE_BELOW = 0.7
/** Two lines start from a slightly smaller base, so the band stays a band. */
export const BOSS_TITLE_TWO_LINE_SCALE = 0.8

/** Balanced split at the whitespace nearest the middle; null without one. */
export const splitTitleLines = (text: string): [string, string] | null => {
  const t = text.trim()
  const mid = t.length / 2
  let best = -1
  for (let i = 0; i < t.length; i++) {
    if (/\s/.test(t[i]!) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  if (best < 0) return null
  return [t.slice(0, best).trim(), t.slice(best + 1).trim()]
}

export interface TitleLayout {
  lines: 1 | 2
  px: number
}

/**
 * Pick one or two lines and the font size, from widths MEASURED at `basePx`:
 * `oneLinePx` for the whole phrase, `twoLinePx` for the wider of the two
 * halves (null when the phrase cannot split).
 */
export const chooseTitleLayout = (
  basePx: number,
  rowPx: number,
  oneLinePx: number,
  twoLinePx: number | null
): TitleLayout => {
  const one = bossTitleFontPx(basePx, rowPx, oneLinePx)
  if (twoLinePx === null || !(twoLinePx > 0) || one >= basePx * BOSS_TITLE_TWO_LINE_BELOW) {
    return { lines: 1, px: one }
  }
  const twoBase = basePx * BOSS_TITLE_TWO_LINE_SCALE
  const two = bossTitleFontPx(twoBase, rowPx, twoLinePx * BOSS_TITLE_TWO_LINE_SCALE)
  return two > one ? { lines: 2, px: two } : { lines: 1, px: one }
}
