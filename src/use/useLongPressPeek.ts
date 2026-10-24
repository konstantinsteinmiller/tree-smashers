import { onBeforeUnmount, ref } from 'vue'
import { playUiSfx } from '@/use/uiSfx'

/**
 * ─── Long-press peek (#UX1c) ────────────────────────────────────────────────
 *
 * The roster card's "hold to see more" gesture (#UX1b), reusable: hold an
 * element for `PEEK_HOLD_MS` and a small card pops up above it (below it when
 * the element sits near the top of the screen). Releasing closes it and the
 * release does NOT fire the element's click; moving > 10 px (a scroll)
 * cancels. Keyboard: the ContextMenu key or Shift+F10 on the focused element
 * toggles the same peek, Escape closes it. `open` / `close` UI sounds, an 8 ms
 * haptic tick where supported.
 *
 * Usage: spread `bind(key)` on the element (pointer + key handlers), wrap its
 * click with `guardClick(fn)`, render the card from `peek` (teleported).
 */
export const PEEK_HOLD_MS = 420

export interface PeekAnchor<K> {
  key: K
  /** Horizontal centre of the card, viewport px (clamped to the screen). */
  left: number
  /** The card's anchor edge, viewport px (its bottom, or its top when below). */
  top: number
  below: boolean
}

export const peekAnchorFor = <K>(key: K, el: HTMLElement, cardWidth: number, minRoomAbove = 170): PeekAnchor<K> => {
  const r = el.getBoundingClientRect()
  const left = Math.max(8 + cardWidth / 2, Math.min(window.innerWidth - 8 - cardWidth / 2, r.left + r.width / 2))
  const below = r.top < minRoomAbove
  return { key, left, top: below ? r.bottom + 8 : r.top - 8, below }
}

export const useLongPressPeek = <K>(opts: { cardWidth?: number, minRoomAbove?: number } = {}) => {
  const W = opts.cardWidth ?? 176
  const peek = ref<PeekAnchor<K> | null>(null)
  let timer = 0
  let start: { x: number, y: number, id: number } | null = null
  let suppressClick = false

  const open = (key: K, el: HTMLElement) => {
    peek.value = peekAnchorFor(key, el, W, opts.minRoomAbove) as PeekAnchor<K>
    playUiSfx('open')
    try { navigator.vibrate?.(8) } catch { /* optional */ }
  }
  const close = () => {
    window.clearTimeout(timer)
    timer = 0
    start = null
    if (peek.value) playUiSfx('close')
    peek.value = null
  }

  const onPointerDown = (key: K, e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    close()
    suppressClick = false
    const el = e.currentTarget as HTMLElement
    start = { x: e.clientX, y: e.clientY, id: e.pointerId }
    timer = window.setTimeout(() => {
      timer = 0
      suppressClick = true
      open(key, el)
    }, PEEK_HOLD_MS)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!start || start.id !== e.pointerId || peek.value) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      window.clearTimeout(timer)
      timer = 0
      start = null
    }
  }
  const onPointerEnd = () => {
    window.clearTimeout(timer)
    timer = 0
    start = null
    if (peek.value) close()
  }
  const onKey = (key: K, e: KeyboardEvent) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      if (peek.value && peek.value.key === key) close()
      else open(key, e.currentTarget as HTMLElement)
    } else if (e.key === 'Escape' && peek.value) {
      e.stopPropagation()
      close()
    }
  }

  /** The click that ends a long press must not also act. */
  const guardClick = (fn: () => void) => () => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    fn()
  }

  /** Event handlers for the held element (spread with v-on). */
  const bind = (key: K) => ({
    pointerdown: (e: PointerEvent) => onPointerDown(key, e),
    pointermove: onPointerMove,
    pointerup: onPointerEnd,
    pointercancel: onPointerEnd,
    pointerleave: onPointerEnd,
    contextmenu: (e: Event) => e.preventDefault(),
    // Capture phase: the release of a long press over a button INSIDE the
    // held element (a Buy / Select button on a skin card) must not click it.
    clickCapture: (e: Event) => {
      if (!suppressClick) return
      suppressClick = false
      e.stopPropagation()
      e.preventDefault()
    },
    keydown: (e: KeyboardEvent) => onKey(key, e)
  })

  onBeforeUnmount(() => window.clearTimeout(timer))

  return { peek, open, close, bind, guardClick }
}
