import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * Keeps the centred "tap a spinner, then drag" hint off the battle HUD.
 *
 * The hint sits a fixed distance above the bottom edge, centred. The blade
 * stat cards and the combat-log pill share that strip, and where they land
 * depends on the spinner count (the log rides on Spinner 2 — the CENTRE card
 * of three, the right card of two), `uiStatScale`, the safe areas and the
 * locale's word lengths (lt "ŽURNALAS", long de/fi hints). No fixed offset
 * holds across all of that, so the hint measures the boxes it could hit and
 * lifts itself just clear of whichever ones it would overlap — and stays where
 * it is when nothing is in the way.
 *
 * Wrapping is CSS's job (the hint is capped to the width between the safe
 * areas); this only decides the vertical lift. No per-frame work: it measures
 * when the hint appears and when something that moves the boxes changes
 * (resize / orientation, any observed box resizing — locale switch, font
 * swap, a card scaling).
 */

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Selectors of the HUD pieces the hint must never cover. */
export const DRAG_HINT_OBSTACLES = '.blade-stat-card, .combat-log-toggle'

/**
 * Pure placement: how many px the hint must rise from its default spot so it
 * overlaps none of `obstacles`, keeping `gap` px of air around it.
 *
 * `hint` is the hint's box AT ITS DEFAULT POSITION (lift 0). Rising past one
 * box can bring the hint level with another (a taller neighbour), so it
 * repeats until clear; `maxLift` stops it at the top of the usable area.
 */
export const computeDragHintLift = (hint: Box, obstacles: Box[], gap = 6, maxLift = Infinity): number => {
  let lift = 0
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const top = hint.top - lift
    const bottom = hint.bottom - lift
    let needed = lift
    for (const o of obstacles) {
      if (o.right <= o.left || o.bottom <= o.top) continue // hidden / zero-size
      const overlapsX = hint.left - gap < o.right && o.left < hint.right + gap
      const overlapsY = top - gap < o.bottom && o.top < bottom + gap
      if (overlapsX && overlapsY) needed = Math.max(needed, hint.bottom - (o.top - gap))
    }
    if (needed === lift) break
    lift = needed
  }
  return Math.max(0, Math.min(Math.ceil(lift), maxLift))
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

/**
 * @param hintEl  the positioned hint element (its `bottom` is set by the caller;
 *                the returned `liftPx` must be ADDED to that bottom).
 * @param active  true while the hint is on screen.
 */
export const useDragHintPlacement = (hintEl: Ref<HTMLElement | null>, active: Ref<boolean>) => {
  const liftPx = ref(0)
  let raf = 0
  let ro: ResizeObserver | null = null
  let observed = new Set<Element>()

  const measure = () => {
    raf = 0
    const el = hintEl.value
    if (!el || !active.value) return
    const current = el.getBoundingClientRect()
    // Undo the lift already applied, so the maths always starts from lift 0.
    const hint: Box = { ...toBox(current), top: current.top + liftPx.value, bottom: current.bottom + liftPx.value }
    const obstacles = [...document.querySelectorAll(DRAG_HINT_OBSTACLES)]
    const boxes = obstacles.map((o) => toBox(o.getBoundingClientRect()))
    // Never rise into the top quarter of the screen (the top HUD row).
    const maxLift = Math.max(0, hint.top - window.innerHeight * 0.25)
    liftPx.value = computeDragHintLift(hint, boxes, 6, maxLift)
    // Follow the boxes that can move the answer (text/locale/font changes).
    if (ro) {
      const next = new Set<Element>([el, ...obstacles])
      for (const o of observed) if (!next.has(o)) ro.unobserve(o)
      for (const o of next) if (!observed.has(o)) ro.observe(o)
      observed = next
    }
  }

  const schedule = () => {
    if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(measure)
  }

  const start = () => {
    if (typeof window === 'undefined') return
    if (!ro && typeof ResizeObserver !== 'undefined') ro = new ResizeObserver(schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    // A webfont swapping in (Nunito, or Playpen Sans for Greek)
    // changes the hint's and the log pill's widths.
    document.fonts?.ready?.then(schedule).catch(() => {
    })
    schedule()
  }

  const stop = () => {
    if (typeof window === 'undefined') return
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    ro?.disconnect()
    observed = new Set()
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  watch([active, hintEl], ([on, el]) => {
    stop()
    if (on && el) start()
  }, { flush: 'post' })

  onUnmounted(() => {
    stop()
    ro = null
  })

  return { liftPx }
}
