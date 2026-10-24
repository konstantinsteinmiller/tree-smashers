// ─── Interstitial pacing (roadmap #UX100) ──────────────────────────────────
//
// WHEN may an interstitial play? Two triggers, one placement:
//
//   1. Playtime — the first is eligible after INTERSTITIAL_GRACE_MS of active
//      playtime (240 s; 0 on GameMonetize, whose review wants the first-load
//      ad), then at most one per INTERSTITIAL_COOLDOWN_MS (121 s) of active
//      playtime. Never inside the tutorial (before the first campaign win).
//   2. The coin-badge chord — 20 quick taps on the coin badge
//      (coinBadgeChord.ts). It bypasses grace and cooldown ("triggers"), and
//      like every ad break it restarts the cooldown.
//
// WHERE: only at a natural break where nothing is running. Concretely the
// pre-battle break (`beginBattle` in SpinnerArena.vue: the board is waiting on
// "tap to start", no music is playing yet, the gameplay bracket is closed),
// which is also where the old battle-count cadence played. A chord finished at
// that screen plays at once; a chord finished mid-battle WAITS for the next
// pre-battle break. No interstitial ever plays:
//   • mid-battle (the battle is never interrupted),
//   • between a battle and its result screen (so it can never land on top of
//     the result screen as it appears — playbook ad-before-result ordering is
//     satisfied by not placing one there at all),
//   • in or around a PvP lock-step match, lobby or handshake (a pause on one
//     peer desyncs the other) — a chord there is dropped, not deferred,
//   • over another ad, the intro cutscene, or the forced-dark-mode notice.
//
// Every ad break — the pre-battle interstitial, the GameMonetize first-load
// ad, a chord ad and a COMPLETED rewarded ad (except on Poki, whose SDK owns
// pacing) — records the playtime it happened at, which is what the cooldown
// counts from. The mark is persisted next to the playtime itself.

import {
  INTERSTITIAL_COOLDOWN_MS,
  INTERSTITIAL_GRACE_MS,
  LAST_AD_BREAK_KEY
} from '@/use/ads/interstitialConfig'
import { activePlaytimeMs, flushPlaytime } from '@/use/playtimeClock'

// ─── Pure rules ─────────────────────────────────────────────────────────────

/**
 * Is a playtime-paced interstitial due?
 * @param lastBreakMs playtime at the last ad break, or null if none ever.
 */
export const isPlaytimeAdDue = (
  playtimeMs: number,
  lastBreakMs: number | null,
  graceMs: number = INTERSTITIAL_GRACE_MS,
  cooldownMs: number = INTERSTITIAL_COOLDOWN_MS
): boolean => {
  if (playtimeMs < graceMs) return false
  if (lastBreakMs === null) return true
  return playtimeMs - lastBreakMs >= cooldownMs
}

export type PreBattleAdReason = 'chord' | 'playtime' | 'cadence'

export interface PreBattleAdContext {
  /** The provider has an interstitial loaded (`isInterstitialReady`). */
  ready: boolean
  /** A PvP match / lobby / handshake is in progress. */
  pvpActive: boolean
  /** An ad (any format) is already in flight. */
  adInFlight: boolean
  /** The player has not won the tutorial battle yet. */
  tutorial: boolean
  /** A coin-badge chord finished mid-battle and waits for this break. */
  chordPending: boolean
  /** PLAYTIME_INTERSTITIALS_BUILD. */
  playtimeBuild: boolean
  /** `isPlaytimeAdDue(...)` right now. */
  playtimeDue: boolean
  /** The old battle-count cadence (`isMidgameAdDue`), used when the playtime
   *  pacing is switched off for the build. */
  cadenceDue: boolean
}

/** Should the pre-battle break play an interstitial, and why? */
export const preBattleAdReason = (ctx: PreBattleAdContext): PreBattleAdReason | null => {
  if (!ctx.ready || ctx.pvpActive || ctx.adInFlight) return null
  if (ctx.chordPending) return 'chord'
  if (!ctx.playtimeBuild) return ctx.cadenceDue ? 'cadence' : null
  if (ctx.tutorial) return null
  return ctx.playtimeDue ? 'playtime' : null
}

export type ChordAction = 'show' | 'defer' | 'drop'

export interface ChordContext {
  /** COIN_CHORD_INTERSTITIAL_BUILD. */
  buildEnabled: boolean
  pvpActive: boolean
  adInFlight: boolean
  ready: boolean
  /** The arena is at the pre-battle break with nothing on top of it. */
  atBreak: boolean
}

/** What a finished chord does: play now, wait for the next break, or nothing. */
export const coinChordAction = (ctx: ChordContext): ChordAction => {
  if (!ctx.buildEnabled || ctx.pvpActive || ctx.adInFlight) return 'drop'
  if (ctx.atBreak) return ctx.ready ? 'show' : 'drop'
  return 'defer'
}

// ─── Persisted mark ─────────────────────────────────────────────────────────

let memLastBreak: number | null = null

const readMark = (): string | null => {
  try {
    return localStorage.getItem(LAST_AD_BREAK_KEY)
  } catch {
    return null
  }
}

const writeMark = (ms: number): void => {
  memLastBreak = ms
  try {
    localStorage.setItem(LAST_AD_BREAK_KEY, String(ms))
  } catch {
    // Storage unavailable — the in-memory mark paces this session.
  }
}

/** Playtime at the last ad break (null: never). Read from the save each time
 *  (it may have been hydrated from the cloud since boot). */
export const lastAdBreakPlaytimeMs = (): number | null => {
  const raw = readMark()
  if (raw === null) return memLastBreak
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return memLastBreak
  // A mark AHEAD of the playtime total means the two keys came from
  // different saves (a cloud merge took one and not the other). Re-anchor to
  // now: the player waits one full cooldown instead of forever.
  const now = activePlaytimeMs()
  if (n > now) {
    writeMark(now)
    return now
  }
  return Math.floor(n)
}

/** Record an ad break at the current playtime (restarts the cooldown). */
export const noteAdBreak = (): void => {
  flushPlaytime()
  writeMark(activePlaytimeMs())
}

/** Is a playtime-paced interstitial due now? */
export const isPlaytimeInterstitialDue = (): boolean => {
  flushPlaytime()
  return isPlaytimeAdDue(activePlaytimeMs(), lastAdBreakPlaytimeMs())
}

/** Test seam. */
export const resetInterstitialPacingForTests = (): void => {
  memLastBreak = null
}
