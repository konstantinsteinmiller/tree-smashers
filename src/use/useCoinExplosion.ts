/**
 * Reusable burst VFX. Particles explode outward from a source element, then
 * fly toward a target element (typically a HUD badge).
 *
 * Two visual variants share the exact same motion:
 *   - 'coin'    → the coin painting (`@/use/coinArt`; the drawn SVG only when
 *                 it fails to load), flies to the CoinBadge coin row.
 *   - 'diamond' → the diamond webp, flies to the CoinBadge diamond row, or to
 *                 the badge itself while that row is hidden (see
 *                 `flyDiamondsToBadge`).
 *
 * Cost model:
 *   - Motion runs on the Web Animations API: every particle's whole path
 *     (burst → hold → ease-in fly + fade) is built once at spawn, so the
 *     browser animates transform/opacity on the compositor with no per-frame
 *     JS and no per-frame allocation.
 *   - Particle nodes are pooled per variant and reused by the next burst.
 *   - `FX.low` halves every burst, and a global live cap thins bursts that
 *     overlap (a roulette jackpot landing on top of a battle-pass claim).
 */
import { prependBaseUrl } from '@/utils/function'
import { FX } from '@/use/useQuality'
import { coinArtFailed, coinArtSrc, markCoinArtFailed } from '@/use/coinArt'

/** Fallback coin drawing, used only once the painting failed to load. */
const COIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:20px;height:20px">' +
  '<circle cx="12" cy="12" r="11" fill="black"/>' +
  '<circle cx="12" cy="12" r="10" fill="#fde047"/>' +
  '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" ' +
  'font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#2f920e">$</text>' +
  '</svg>'

export type CoinExplosionVariant = 'coin' | 'diamond'

/** Inner HTML for one particle of the given variant. The diamond uses the
 *  shared icon webp (base-url aware) sized to match the 20px coin glyph. */
const particleHtml = (variant: CoinExplosionVariant): string => {
  if (variant === 'diamond') {
    const src = prependBaseUrl('images/icons/diamond_256x256.webp')
    return `<img src="${src}" alt="" style="width:20px;height:20px;object-fit:contain;` +
      `" draggable="false"/>`
  }
  if (coinArtFailed.value) return COIN_SVG
  return `<img src="${coinArtSrc()}" alt="" style="width:20px;height:20px;object-fit:contain" draggable="false"/>`
}

/** A coin particle whose painting fails swaps to the drawing in place (no
 *  inline handler — the CSP forbids them) and flips every later coin too. */
const guardCoinImage = (el: HTMLDivElement) => {
  const img = el.querySelector('img')
  if (!img) return
  img.addEventListener('error', () => {
    markCoinArtFailed()
    el.innerHTML = COIN_SVG
  }, { once: true })
}

/** Particles alive across every burst on screen, high tier. */
export const MAX_LIVE_PARTICLES = 48
/** Same cap on the low quality tier. */
export const MAX_LIVE_PARTICLES_LOW = 24
/** Detached particle nodes kept for reuse, per variant. */
const POOL_MAX = 48

const EXPLODE_MS = 600
const FLY_MS = 500
const MAX_STAGGER_MS = 300
/** Half the glyph size — particles are positioned by their top-left corner. */
const HALF = 10
/** y = t², the fly phase's ease-in, as a cubic Bézier WAAPI can run. */
const EASE_IN_QUAD = 'cubic-bezier(0.333, 0, 0.667, 0.333)'

const pools: Record<CoinExplosionVariant, HTMLDivElement[]> = { coin: [], diamond: [] }
let liveParticles = 0

const createParticle = (variant: CoinExplosionVariant): HTMLDivElement => {
  const el = document.createElement('div')
  el.innerHTML = particleHtml(variant)
  if (variant === 'coin') guardCoinImage(el)
  el.style.cssText =
    'position:absolute;left:0;top:0;pointer-events:none;z-index:100;will-change:transform,opacity;'
  return el
}

const releaseParticle = (el: HTMLDivElement, variant: CoinExplosionVariant) => {
  el.remove()
  liveParticles = Math.max(0, liveParticles - 1)
  const pool = pools[variant]
  if (pool.length < POOL_MAX) pool.push(el)
}

/** How many particles a burst of `requested` actually gets right now: halved
 *  on the low quality tier, then clipped to what the live cap has left. */
export const particleBudget = (requested: number): number => {
  const want = FX.low ? Math.ceil(requested / 2) : requested
  const cap = FX.low ? MAX_LIVE_PARTICLES_LOW : MAX_LIVE_PARTICLES
  return Math.max(0, Math.min(want, cap - liveParticles))
}

export interface CoinExplosionOptions {
  /** Element the particles burst out of. */
  sourceEl: HTMLElement
  /** Element the particles fly toward (e.g. CoinBadge). */
  targetEl: HTMLElement
  /** Number of particles to spawn at full quality (default 20). */
  count?: number
  /** Max burst radius in px (default 120). */
  burstRadius?: number
  /** Which icon to render (default 'coin'). */
  variant?: CoinExplosionVariant
  /** Called once, when the first particle reaches the target. Still called
   *  when the live cap leaves the burst no particles at all. */
  onArrive?: () => void
}

export function spawnCoinExplosion(opts: CoinExplosionOptions) {
  const { sourceEl, targetEl, count = 20, burstRadius = 120, variant = 'coin', onArrive } = opts

  const sourceRect = sourceEl.getBoundingClientRect()
  const cx = sourceRect.left + sourceRect.width / 2 - HALF
  const cy = sourceRect.top + sourceRect.height / 2 - HALF
  // The target is a static HUD element, so its position is read once here
  // rather than when the fly phase starts.
  const targetRect = targetEl.getBoundingClientRect()
  const tx = targetRect.left + targetRect.width / 2 - HALF
  const ty = targetRect.top + targetRect.height / 2 - HALF

  const container = document.getElementById('app') || document.body
  const n = particleBudget(count)
  let firstStagger = MAX_STAGGER_MS
  const start = `translate(${cx}px,${cy}px)`

  for (let i = 0; i < n; i++) {
    const el = pools[variant].pop() ?? createParticle(variant)
    const angle = Math.random() * Math.PI * 2
    const distance = 40 + Math.random() * (burstRadius - 40)
    const stagger = Math.random() * MAX_STAGGER_MS
    if (stagger < firstStagger) firstStagger = stagger
    const burst = `translate(${cx + Math.cos(angle) * distance}px,${cy + Math.sin(angle) * distance}px)`
    const total = EXPLODE_MS + stagger + FLY_MS

    el.style.transform = start
    el.style.opacity = '1'
    container.appendChild(el)
    liveParticles++

    if (typeof el.animate === 'function') {
      // Burst out linearly, hold for the stagger, then fly in on t² while
      // fading — the same curve the old per-frame loop computed by hand.
      const anim = el.animate([
        { transform: start, opacity: 1, offset: 0 },
        { transform: burst, opacity: 1, offset: EXPLODE_MS / total },
        { transform: burst, opacity: 1, offset: (EXPLODE_MS + stagger) / total, easing: EASE_IN_QUAD },
        { transform: `translate(${tx}px,${ty}px)`, opacity: 0, offset: 1 }
      ], { duration: total, fill: 'forwards' })
      anim.onfinish = () => {
        releaseParticle(el, variant)
        anim.cancel()
      }
    } else {
      // No Web Animations (jsdom): keep the node for its lifetime, no motion.
      setTimeout(() => releaseParticle(el, variant), total)
    }
  }

  if (onArrive) setTimeout(onArrive, EXPLODE_MS + (n > 0 ? firstStagger : 0) + FLY_MS)
}

/** What a HUD currency badge exposes for fly-to VFX (CoinBadge's `defineExpose`). */
export interface CurrencyBadgeTargets {
  /** The whole badge — coin target, and the diamond fallback target. */
  rootEl: HTMLElement | null
  /** The badge's diamond row, or null while the badge does not render one. */
  diamondRowEl: HTMLElement | null
  /** "+N" diamond pop and badge bump, played when the burst lands. */
  celebrateDiamonds?: (amount: number) => void
}

/**
 * Fly a diamond burst into the HUD badge and celebrate `amount` on arrival.
 *
 * Lands on the diamond row when the badge renders one; otherwise on the badge
 * itself (the HUD diamond row has been hidden since 71d4197). The particles
 * stay diamonds either way, so a diamond reward never reads as a conversion
 * into coins.
 *
 * Returns the element flown to, or null when there is nothing to fly from or to.
 */
export function flyDiamondsToBadge(
  sourceEl: HTMLElement | null,
  badge: CurrencyBadgeTargets | null | undefined,
  amount: number,
  count = 14
): HTMLElement | null {
  const targetEl = badge?.diamondRowEl ?? badge?.rootEl ?? null
  if (!sourceEl || !targetEl) return null
  spawnCoinExplosion({
    sourceEl,
    targetEl,
    count,
    variant: 'diamond',
    onArrive: () => badge?.celebrateDiamonds?.(amount)
  })
  return targetEl
}
