// The painted "next boss" portal frame (tools/boss-frame-art) for
// BossPeekBadge. The CSS ring stays the fallback — until the painting has
// loaded, when none is packed, under `?art=procedural` and in node / jsdom.
import { ref } from 'vue'
import { PAINTED_BOSS_FRAME, type PaintedBossFrame } from '@/use/paintedBossFrame'
import { prependBaseUrl } from '@/utils/function'

/** The painted frame's box is this much wider than the CSS ring's box: the
 *  crown, horns and bramble hang outside the ring the CSS one is sized by. */
export const PAINTED_FRAME_SCALE = 1.15

export interface BossFrameArt {
  src: string
  /** CSS custom properties for BossPeekBadge's geometry. */
  vars: Record<string, string>
}

export const bossFrameArtAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Pure layout: the opening the shipped file actually has. */
export const layoutBossFrame = (p: PaintedBossFrame): Record<string, string> => ({
  '--frame-aspect': String(p.aspect),
  '--hole-x': String(p.holeX),
  '--hole-y': String(p.holeY),
  '--hole-d': String(p.holeD),
  '--frame-scale': String(PAINTED_FRAME_SCALE)
})

export const bossFrameUrl = (p: PaintedBossFrame): string => prependBaseUrl(`images/boss-frame/${p.file}?v=${p.v}`)

const ready = ref(false)
let asked = false

export const preloadBossFrameArt = (frame: PaintedBossFrame | null = PAINTED_BOSS_FRAME): void => {
  if (!frame || asked || !bossFrameArtAllowed()) return
  asked = true
  const img = new Image()
  img.onload = () => { ready.value = true }
  img.onerror = () => { /* CSS ring stays */ }
  img.src = bossFrameUrl(frame)
}

/** The painted frame, or null (draw the CSS ring). Reactive: turns non-null
 *  once the painting has loaded. */
export const bossFrameArt = (frame: PaintedBossFrame | null = PAINTED_BOSS_FRAME): BossFrameArt | null => {
  if (!frame || !bossFrameArtAllowed()) return null
  preloadBossFrameArt(frame)
  if (!ready.value) return null
  return { src: bossFrameUrl(frame), vars: layoutBossFrame(frame) }
}
