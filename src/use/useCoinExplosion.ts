/**
 * Reusable burst VFX. Particles explode outward from a source element, then
 * fly toward a target element (typically a HUD badge).
 *
 * Two visual variants share the exact same motion:
 *   - 'coin'    → the yellow coin SVG, flies to the CoinBadge coin row.
 *   - 'diamond' → the diamond webp, flies to the CoinBadge diamond row.
 */
import { prependBaseUrl } from '@/utils/function'

const COIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:20px;height:20px">' +
  '<circle cx="12" cy="12" r="11" fill="black"/>' +
  '<circle cx="12" cy="12" r="10" fill="#fde047"/>' +
  '<text x="12" y="18" text-anchor="middle" font-size="16" font-weight="bold" fill="#2f920e">$</text>' +
  '</svg>'

export type CoinExplosionVariant = 'coin' | 'diamond'

/** Inner HTML for one particle of the given variant. The diamond uses the
 *  shared icon webp (base-url aware) sized to match the 20px coin glyph. */
const particleHtml = (variant: CoinExplosionVariant): string => {
  if (variant === 'diamond') {
    const src = prependBaseUrl('images/icons/diamond_256x256.webp')
    return `<img src="${src}" alt="" style="width:20px;height:20px;object-fit:contain;` +
      `filter:drop-shadow(0 0 3px rgba(120,220,255,0.7))" draggable="false"/>`
  }
  return COIN_SVG
}

export interface CoinExplosionOptions {
  /** Element the particles burst out of. */
  sourceEl: HTMLElement
  /** Element the particles fly toward (e.g. CoinBadge). */
  targetEl: HTMLElement
  /** Number of particles to spawn (default 20). */
  count?: number
  /** Max burst radius in px (default 120). */
  burstRadius?: number
  /** Which icon to render (default 'coin'). */
  variant?: CoinExplosionVariant
}

export function spawnCoinExplosion(opts: CoinExplosionOptions) {
  const { sourceEl, targetEl, count = 20, burstRadius = 120, variant = 'coin' } = opts

  const sourceRect = sourceEl.getBoundingClientRect()
  const cx = sourceRect.left + sourceRect.width / 2
  const cy = sourceRect.top + sourceRect.height / 2

  const els: HTMLDivElement[] = []
  const angles: number[] = []
  const distances: number[] = []
  const staggerDelays: number[] = []

  const container = document.getElementById('app') || document.body

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.innerHTML = particleHtml(variant)
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;z-index:100;will-change:transform,opacity;'
    el.style.transform = `translate(${cx - 10}px,${cy - 10}px)`
    container.appendChild(el)
    els.push(el)
    angles.push(Math.random() * Math.PI * 2)
    distances.push(40 + Math.random() * (burstRadius - 40))
    staggerDelays.push(Math.random() * 300)
  }

  const startTime = performance.now()
  const explodeDuration = 600
  const flyDuration = 500

  let flyStartPositions: { x: number; y: number }[] | null = null
  let tx = 0
  let ty = 0

  const animate = (now: number) => {
    const elapsed = now - startTime

    if (elapsed < explodeDuration) {
      const progress = elapsed / explodeDuration
      for (let i = 0; i < count; i++) {
        const x = cx - 10 + Math.cos(angles[i]!) * distances[i]! * progress
        const y = cy - 10 + Math.sin(angles[i]!) * distances[i]! * progress
        els[i]!.style.transform = `translate(${x}px,${y}px)`
      }
      requestAnimationFrame(animate)
    } else {
      if (!flyStartPositions) {
        const badgeRect = targetEl.getBoundingClientRect()
        flyStartPositions = els.map((_, i) => ({
          x: cx - 10 + Math.cos(angles[i]!) * distances[i]!,
          y: cy - 10 + Math.sin(angles[i]!) * distances[i]!
        }))
        tx = badgeRect.left + badgeRect.width / 2 - 10
        ty = badgeRect.top + badgeRect.height / 2 - 10
      }

      const flyElapsed = elapsed - explodeDuration
      let allDone = true

      for (let i = 0; i < count; i++) {
        const localElapsed = flyElapsed - staggerDelays[i]!
        if (localElapsed < 0) {
          allDone = false
          continue
        }
        const t = Math.min(1, localElapsed / flyDuration)
        const ease = t * t
        const sx = flyStartPositions[i]!.x
        const sy = flyStartPositions[i]!.y
        const x = sx + (tx - sx) * ease
        const y = sy + (ty - sy) * ease
        els[i]!.style.transform = `translate(${x}px,${y}px)`
        els[i]!.style.opacity = String(1 - ease)
        if (t < 1) allDone = false
      }

      if (!allDone) {
        requestAnimationFrame(animate)
      } else {
        for (const el of els) el.remove()
      }
    }
  }
  requestAnimationFrame(animate)
}
