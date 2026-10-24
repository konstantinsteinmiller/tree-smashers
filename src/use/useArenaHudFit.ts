// Measures the opaque HUD over the arena canvas (every element marked
// `data-arena-hud="<id>"`) and the device safe-area insets, and hands them to
// the engine's arena fit (@/use/arenaFit — presentation only).
//
// Each HUD id keeps its LAST measured rect for the current viewport size even
// after it unmounts (stat cards only exist in battle, the button stacks only
// between battles), so the board is fitted once for every phase instead of
// zooming each time the HUD swaps. A viewport resize starts over.
import { onBeforeUnmount, onMounted, watch, type Ref, type WatchSource } from 'vue'
import type { FitInsets, FitRect } from '@/use/arenaFit'

const readInsets = (probe: HTMLElement | null): FitInsets => {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 }
  const cs = getComputedStyle(probe)
  const px = (v: string) => Number.parseFloat(v) || 0
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
}

export const useArenaHudFit = (
  canvasRef: Ref<HTMLCanvasElement | null>,
  setArenaFitHud: (rects: readonly FitRect[], insets: FitInsets) => void,
  triggers: WatchSource[]
) => {
  const seen = new Map<string, FitRect>()
  let sizeKey = ''
  let probe: HTMLElement | null = null
  const timers: ReturnType<typeof setTimeout>[] = []

  const measure = () => {
    const canvas = canvasRef.value
    if (!canvas || typeof document === 'undefined') return
    const c = canvas.getBoundingClientRect()
    const key = `${Math.round(c.width)}x${Math.round(c.height)}`
    if (key !== sizeKey) {
      sizeKey = key
      seen.clear()
    }
    document.querySelectorAll<HTMLElement>('[data-arena-hud]').forEach((el, i) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      const id = el.dataset['arenaHud'] || `hud${i}`
      seen.set(id, { x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top })
    })
    setArenaFitHud([...seen.values()], readInsets(probe))
  }
  /** Measure now and again once enter transitions have settled. */
  const schedule = () => {
    for (const t of timers) clearTimeout(t)
    timers.length = 0
    for (const ms of [0, 120, 700]) timers.push(setTimeout(measure, ms))
  }

  onMounted(() => {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.appendChild(probe)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    schedule()
  })
  onBeforeUnmount(() => {
    for (const t of timers) clearTimeout(t)
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    probe?.remove()
    probe = null
  })
  watch(triggers, schedule, { flush: 'post' })
  return { measure, schedule }
}
