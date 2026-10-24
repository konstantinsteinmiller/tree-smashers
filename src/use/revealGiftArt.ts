// The painted reveal gift (tools/gift-art): sprite URLs + where each part sits in
// the square gift button. The CSS gift stays the fallback — until both sprites
// have loaded, when nothing is painted, under `?art=procedural` and in node.
import { PAINTED_REVEAL_GIFT, type PaintedRevealGift } from '@/use/paintedRevealGift'
import { prependBaseUrl } from '@/utils/function'

export interface RevealGiftArt {
  lidSrc: string
  boxSrc: string
  /** CSS custom properties for the button (percent of its edge). */
  vars: Record<string, string>
}

/** Body 88 % and lid 96 % of the button width; the lid overlaps the body's rim. */
const BOX_W = 88
const LID_W = 96
const OVERLAP = 0.12 // of the lid's height

export const layoutRevealGift = (g: PaintedRevealGift): Record<string, string> => {
  let boxW = BOX_W
  let lidW = LID_W
  const total = () => boxW * g.box.h / g.box.w + lidW * g.lid.h / g.lid.w * (1 - OVERLAP)
  const k = Math.min(1, 100 / total())
  boxW *= k
  lidW *= k
  const boxH = boxW * g.box.h / g.box.w
  const lidH = lidW * g.lid.h / g.lid.w
  return {
    '--gift-box-w': `${boxW.toFixed(2)}%`,
    '--gift-box-h': `${boxH.toFixed(2)}%`,
    '--gift-lid-w': `${lidW.toFixed(2)}%`,
    '--gift-lid-h': `${lidH.toFixed(2)}%`,
    '--gift-lid-bottom': `${(boxH - lidH * OVERLAP).toFixed(2)}%`
  }
}

export const revealGiftArt = (): RevealGiftArt | null => {
  const g = PAINTED_REVEAL_GIFT
  if (!g || typeof location === 'undefined' || /[?&]art=procedural(?:&|$)/.test(location.search)) return null
  const url = (f: string) => prependBaseUrl(`images/reveal-gift/${f}?v=${g.v}`)
  return { lidSrc: url(g.lid.file), boxSrc: url(g.box.file), vars: layoutRevealGift(g) }
}
