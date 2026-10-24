// The painted title ribbon (tools/ribbon-art): which painting a FRibbon tone
// wears, the slice URLs, and the em layout around its face. The SVG ribbon
// stays the fallback — until all three slices of the family have loaded, when
// the family is not painted, under `?art=procedural` and in node / jsdom.
import { reactive } from 'vue'
import { PAINTED_RIBBONS, type PaintedRibbon, type RibbonFamily } from '@/use/paintedRibbons'
import { prependBaseUrl } from '@/utils/function'

/** Sun gold → the leaf green (measured against --color-leaf-500 #55c81e). */
const LEAF_FROM_SUN = 'hue-rotate(55deg) saturate(1) brightness(0.85)'

export type RibbonTone = 'sun' | 'leaf' | 'berry' | 'royal' | 'sky' | 'plum' | 'ink'

/** Four paintings; the other tones wear the nearest one with a CSS filter. */
export const RIBBON_FAMILY: Record<RibbonTone, { family: RibbonFamily, filter: string | null }> = {
  sun: { family: 'sun', filter: null },
  leaf: { family: 'leaf', filter: null },
  berry: { family: 'berry', filter: null },
  royal: { family: 'royal', filter: null },
  sky: { family: 'royal', filter: 'hue-rotate(-18deg) saturate(0.9) brightness(1.18)' },
  plum: { family: 'berry', filter: 'hue-rotate(-62deg) saturate(0.8) brightness(0.92)' },
  ink: { family: 'royal', filter: 'saturate(0.55) brightness(0.48)' }
}

/**
 * Paintings that failed review, by family → the packed version hash `v`.
 * Rejected while the registry still carries THAT hash; a re-paint + re-pack
 * gets a new hash and is worn again automatically (re-review it then).
 *
 *  - leaf 82f73e09 (owner: "the ribbon looks wrong"): its tails are two flat
 *    stacked triangles centred on the face — no fold tucking behind, not
 *    joined to the face, not lower than it. The other three families have
 *    the correct folded tail.
 */
export const REJECTED_PAINTINGS: Partial<Record<RibbonFamily, string>> = { leaf: '82f73e09' }

/** A rejected family wears this painting recoloured instead (the SVG ribbon
 *  only when that one is missing too). */
export const RIBBON_STAND_IN: Partial<Record<RibbonFamily, { family: RibbonFamily, filter: string }>> = {
  leaf: { family: 'sun', filter: LEAF_FROM_SUN }
}

/** Face height in em — the same as the CSS/SVG ribbon's face. */
export const RIBBON_FACE_EM = 1.9

export interface RibbonArt {
  l: string
  m: string
  r: string
  filter: string | null
  /** CSS custom properties (em) for the painted layout. */
  vars: Record<string, string>
}

export const ribbonArtAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Pure layout: every length in em of the ribbon's font size. */
export const layoutRibbon = (p: PaintedRibbon): Record<string, string> => {
  const hEm = RIBBON_FACE_EM / (p.faceBot - p.faceTop)
  const em = (f: number) => `${(f * hEm).toFixed(3)}em`
  return {
    '--rbp-h': em(1),
    '--rbp-lw': em(p.l.w / p.h),
    '--rbp-rw': em(p.r.w / p.h),
    '--rbp-pt': em(p.faceTop),
    '--rbp-pb': em(1 - p.faceBot),
    '--rbp-pl': em(p.faceL),
    '--rbp-pr': em(p.faceR)
  }
}

const urls = (p: PaintedRibbon) => {
  const u = (f: string) => prependBaseUrl(`images/ribbon/${f}?v=${p.v}`)
  return { l: u(p.l.file), m: u(p.m.file), r: u(p.r.file) }
}

/** Families whose three slices have all loaded (reactive). */
const ready = reactive<Partial<Record<RibbonFamily, boolean>>>({})
const asked = new Set<RibbonFamily>()

export const preloadRibbonArt = (family: RibbonFamily): void => {
  const p = PAINTED_RIBBONS[family]
  if (!p || asked.has(family) || !ribbonArtAllowed()) return
  asked.add(family)
  const all = Object.values(urls(p)).map((src) => new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(src))
    img.src = src
  }))
  Promise.all(all).then(() => { ready[family] = true }, () => { /* SVG ribbon stays */ })
}

/** The painted ribbon for a tone, or null (draw the SVG ribbon). Reactive: it
 *  turns non-null once the family's slices have loaded. */
/** Which painting (and filter) a tone actually wears, after rejections; null =
 *  nothing usable is painted (the SVG ribbon). Pure, no DOM. */
export const resolveRibbonPainting = (tone: RibbonTone): { family: RibbonFamily, filter: string | null, painting: PaintedRibbon } | null => {
  const want = RIBBON_FAMILY[tone] ?? RIBBON_FAMILY.sun
  const usable = (f: RibbonFamily): PaintedRibbon | null => {
    const p = PAINTED_RIBBONS[f]
    return p && REJECTED_PAINTINGS[f] !== p.v ? p : null
  }
  const own = usable(want.family)
  if (own) return { family: want.family, filter: want.filter, painting: own }
  const alt = RIBBON_STAND_IN[want.family]
  const altP = alt ? usable(alt.family) : null
  if (!alt || !altP) return null
  // A tone that already recolours (none map onto leaf today) would need its
  // own stand-in filter; chain them rather than guess.
  const filter = want.filter ? `${alt.filter} ${want.filter}` : alt.filter
  return { family: alt.family, filter, painting: altP }
}

export const ribbonArt = (tone: RibbonTone): RibbonArt | null => {
  const r = resolveRibbonPainting(tone)
  if (!r || !ribbonArtAllowed()) return null
  const { family, filter, painting: p } = r
  preloadRibbonArt(family)
  if (!ready[family]) return null
  return { ...urls(p), filter, vars: layoutRibbon(p) }
}
