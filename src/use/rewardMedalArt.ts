// The painted reward medallion (tools/reward-medal-art): a gold ring on an
// 8-point sunburst whose round hole is laid exactly over a prize plate (the
// coin / diamond / speed disc of the reward reveal). Reusable for any round
// prize plate: put the image in the plate's box with `vars` and drop the CSS
// star + border. The CSS star + ring stay the fallback — until the painting
// has loaded, when none is packed, under `?art=procedural` and in node / jsdom.
import { ref } from 'vue'
import { PAINTED_REWARD_MEDAL, type PaintedRewardMedal } from '@/use/paintedRewardMedal'
import { prependBaseUrl } from '@/utils/function'

export interface RewardMedalArt {
  src: string
  /** CSS custom properties: the image box relative to the plate (100 % = plate). */
  vars: Record<string, string>
}

export const rewardMedalArtAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Pure layout: the image is plate ÷ holeD wide, shifted so its hole centre
 *  sits on the plate centre. Percentages of the plate's edge. */
export const layoutRewardMedal = (p: PaintedRewardMedal): Record<string, string> => {
  const w = 100 / p.holeD
  const h = w / p.aspect
  return {
    '--medal-w': `${w.toFixed(3)}%`,
    '--medal-h': `${h.toFixed(3)}%`,
    '--medal-x': `${(50 - p.holeX * w).toFixed(3)}%`,
    '--medal-y': `${(50 - p.holeY * h).toFixed(3)}%`,
    '--medal-ox': `${(p.holeX * 100).toFixed(3)}%`,
    '--medal-oy': `${(p.holeY * 100).toFixed(3)}%`
  }
}

export const rewardMedalUrl = (p: PaintedRewardMedal): string => prependBaseUrl(`images/reward-medal/${p.file}?v=${p.v}`)

const ready = ref(false)
let asked = false

export const preloadRewardMedalArt = (medal: PaintedRewardMedal | null = PAINTED_REWARD_MEDAL): void => {
  if (!medal || asked || !rewardMedalArtAllowed()) return
  asked = true
  const img = new Image()
  img.onload = () => { ready.value = true }
  img.onerror = () => { /* CSS star + ring stay */ }
  img.src = rewardMedalUrl(medal)
}

/** The painted medallion, or null (draw the CSS star + ring). Reactive: turns
 *  non-null once the painting has loaded. */
export const rewardMedalArt = (medal: PaintedRewardMedal | null = PAINTED_REWARD_MEDAL): RewardMedalArt | null => {
  if (!medal || !rewardMedalArtAllowed()) return null
  preloadRewardMedalArt(medal)
  if (!ready.value) return null
  return { src: rewardMedalUrl(medal), vars: layoutRewardMedal(medal) }
}
