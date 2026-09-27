import { nextTick, onMounted, onUnmounted, watch, type Ref, type WatchSource } from 'vue'

/**
 * Shrinks a one-line headline until it fits its box.
 *
 * The "tap to start" title is one big uppercase line. At 568×320 the long
 * locales (ru "НАЖМИТЕ, ЧТОБЫ НАЧАТЬ", uk, ro…) are wider than the room
 * between the side HUD columns, and a fixed size that fits the longest of 39
 * locales would make English needlessly small. So the title keeps its normal
 * Tailwind size and, only when its text is wider than the box, gets an inline
 * font-size scaled down by exactly the overflow ratio.
 *
 * The element must be `white-space: nowrap` inside a width-capped box, so
 * `scrollWidth` is the text's width and `clientWidth` the room it has.
 * Measured on mount, on resize / orientation, when the font set changes
 * (display-font subsets swap in per locale) and whenever `deps` change (the
 * text itself). No ResizeObserver: the shrink changes the box it would watch.
 */

/** Pure: the px size that makes `needPx` of text fit into `availPx`. */
export const fitFontPx = (basePx: number, availPx: number, needPx: number, minPx = 12): number | null => {
  if (!(basePx > 0) || !(availPx > 0) || needPx <= availPx + 0.5) return null
  // 2% headroom: glyph advances do not scale perfectly linearly (hinting, rounding).
  return Math.max(minPx, Math.floor(basePx * (availPx / needPx) * 0.98 * 10) / 10)
}

export const useFitText = (el: Ref<HTMLElement | null>, deps: WatchSource[] = [], minPx = 12) => {
  const fit = () => {
    const node = el.value
    if (!node) return
    node.style.fontSize = ''
    const px = fitFontPx(parseFloat(getComputedStyle(node).fontSize), node.clientWidth, node.scrollWidth, minPx)
    if (px !== null) node.style.fontSize = `${px}px`
  }
  const refit = () => {
    void nextTick(fit)
  }

  watch([el, ...deps], refit, { flush: 'post' })
  onMounted(() => {
    window.addEventListener('resize', refit)
    document.fonts?.addEventListener?.('loadingdone', refit)
    void document.fonts?.ready?.then(refit)
    refit()
  })
  onUnmounted(() => {
    window.removeEventListener('resize', refit)
    document.fonts?.removeEventListener?.('loadingdone', refit)
  })
  return { refit }
}
