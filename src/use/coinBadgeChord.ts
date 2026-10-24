// ─── Coin-badge chord (roadmap #UX100) ──────────────────────────────────────
//
// 20 consecutive taps on the coin badge trigger an interstitial (what happens
// then is `coinChordAction` in interstitialPacing.ts).
//
// "Consecutive" means:
//   • each tap lands within COIN_CHORD_GAP_MS (1.5 s) of the previous one —
//     a longer pause starts the count again from this tap;
//   • a tap ANYWHERE else (another HUD button, the arena, a modal over the
//     badge) resets the count to zero;
//   • only primary-button, primary-pointer presses count (a second finger or a
//     right click is not a tap). One physical tap is one `pointerdown`, so no
//     event de-duplication is needed.
//
// The badge itself is left exactly as it is. Its HUD layer is
// `pointer-events: none` so a press on it falls through to the arena canvas
// (that is its normal behaviour — e.g. an aim drag that starts in the corner).
// So the chord does not listen ON the badge: one passive capture-phase
// `pointerdown` listener on the window hit-tests the press against the badge's
// box and never stops or prevents the event. A press counts when it is inside
// the box AND what it actually hit is the badge, something the badge sits in,
// or the canvas under it — a modal or overlay drawn over the badge is none of
// those, so tapping a dialog there resets the chord instead.

import { COIN_CHORD_GAP_MS, COIN_CHORD_TAPS } from '@/use/ads/interstitialConfig'

export interface TapChord {
  /** Count one tap at `now` (ms); true when this tap completes the chord. */
  tap: (now: number) => boolean
  reset: () => void
  readonly count: number
}

export const createTapChord = (
  taps: number = COIN_CHORD_TAPS,
  gapMs: number = COIN_CHORD_GAP_MS
): TapChord => {
  let count = 0
  let lastAt = Number.NEGATIVE_INFINITY
  return {
    tap(now: number): boolean {
      count = now - lastAt <= gapMs ? count + 1 : 1
      lastAt = now
      if (count < taps) return false
      count = 0
      lastAt = Number.NEGATIVE_INFINITY
      return true
    },
    reset(): void {
      count = 0
      lastAt = Number.NEGATIVE_INFINITY
    },
    get count(): number {
      return count
    }
  }
}

/** Did this press land on the badge (see the header for the rule)? */
export const pressHitsBadge = (badge: Element, e: Pick<PointerEvent, 'clientX' | 'clientY' | 'target'>): boolean => {
  const r = badge.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false
  const t = e.target
  if (!(t instanceof Element)) return false
  return badge.contains(t) || t.contains(badge) || t.tagName === 'CANVAS'
}

export interface CoinBadgeChordOptions {
  getBadge: () => Element | null
  onChord: () => void
  now?: () => number
}

/** Listen for the chord. Returns the uninstall function. */
export const installCoinBadgeChord = (opts: CoinBadgeChordOptions): (() => void) => {
  const chord = createTapChord()
  const now = opts.now ?? (() => performance.now())
  const onDown = (e: PointerEvent): void => {
    if (e.isPrimary === false || e.button > 0) return
    const badge = opts.getBadge()
    if (!badge || !pressHitsBadge(badge, e)) {
      chord.reset()
      return
    }
    if (chord.tap(now())) {
      try {
        opts.onChord()
      } catch (err) {
        console.warn('[coin-chord] handler threw', err)
      }
    }
  }
  window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
  return () => window.removeEventListener('pointerdown', onDown, { capture: true })
}
