// ─── Dead game_over watchdog (#playtest-1-8) ─────────────────────────────────
//
// After a campaign battle the board sits in 'game_over' until a result surface
// (reward overlay, BOSS DEFEATED card, roulette, roulette reward) hands it to
// the next stage. If that surface never reaches the screen — a render error in
// the roulette reward (playtest run 1: a skin grant hit the missing
// `smasherForSkin` import), or a flag cleared under it — nothing can be
// clicked and only a reload recovers. The arena samples this tracker once a
// second; it reports "stuck" after the board has been over with NO surface in
// the DOM for RESULT_SURFACE_STUCK_MS, and the arena rebuilds the stage.

export const RESULT_SURFACE_STUCK_MS = 3000

export interface StuckSample {
  /** phase === 'game_over' */
  gameOver: boolean
  /** A plain campaign fight (no PvP / league / ghost — those own their exits). */
  campaign: boolean
  /** Result surfaces actually rendered (overlay roots in the DOM). */
  surfacesInDom: number
  /** Any other modal is legitimately up (team, options, ad…): not stuck. */
  otherModalOpen: boolean
}

export interface StuckWatch {
  /** Feed one sample; true once the dead state has lasted long enough. */
  sample: (now: number, s: StuckSample) => boolean
  reset: () => void
}

export const createStuckWatch = (thresholdMs: number = RESULT_SURFACE_STUCK_MS): StuckWatch => {
  let since: number | null = null
  return {
    sample(now, s) {
      const dead = s.gameOver && s.campaign && s.surfacesInDom === 0 && !s.otherModalOpen
      if (!dead) {
        since = null
        return false
      }
      if (since === null) since = now
      if (now - since < thresholdMs) return false
      since = null
      return true
    },
    reset() {
      since = null
    }
  }
}
