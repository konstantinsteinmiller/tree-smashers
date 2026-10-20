// ─── Skins → smasher colourways ─────────────────────────────────────────────
//
// The old spinner "skins" (model ids in src/data/skinCatalog.ts, owned per top
// part) stay the reward economy, but a skin is now a COLOURWAY of a smasher:
// every model id maps deterministically to a palette variant. A smasher's
// default skin (the first skin of its archetype top) is its signature palette.
// Themed skin ids (fire, ice, nature, dark, gold, …) get a matching tint;
// every other id a hashed hue shift. Boss trophy skins get their own palettes.
// Pure — no DOM.

import { SMASHER_LIST, SMASHERS, isSmasherId, type SmasherId } from '@/data/smasherCatalog'
import { SKINS_PER_TOP, topPartOfSkin, type SpinnerModelId } from '@/data/skinCatalog'
import { SIGNATURE_PALETTES, mixHex, shiftHex, type SmasherPalette } from '@/smashers/smasherRig'

type Tint = { tint: string; amount: number; accent?: string; belly?: string }

/** Themed colourways (skin id → tint over the signature palette). */
const THEMES: Record<string, Tint> = {
  fire: { tint: '#e8402a', amount: 0.55, accent: '#ffb02e' },
  phoenix: { tint: '#ff6a2a', amount: 0.55, accent: '#ffd23a' },
  reddragon: { tint: '#c4202c', amount: 0.6, accent: '#2a2a2a' },
  demon: { tint: '#7a1424', amount: 0.6, accent: '#ff4a3a' },
  cinder: { tint: '#3a1a14', amount: 0.62, accent: '#ff6a1a', belly: '#ffb23a' },
  ice: { tint: '#8fd8ff', amount: 0.55, accent: '#e8f8ff' },
  'frost-vault': { tint: '#5aa8e8', amount: 0.6, accent: '#eafcff', belly: '#d8f2ff' },
  yeti: { tint: '#eef6ff', amount: 0.7, accent: '#7ab8e8', belly: '#bfe4ff' },
  tsunami: { tint: '#1e7fc8', amount: 0.55, accent: '#7fe0ff' },
  bluedragon: { tint: '#2a4fc8', amount: 0.55, accent: '#9ad8ff' },
  nature: { tint: '#4caf50', amount: 0.45 },
  'forest-dragon': { tint: '#1f7a3a', amount: 0.55, accent: '#a5e05a' },
  toadstool: { tint: '#d8322e', amount: 0.45, accent: '#fff6e8' },
  cactus: { tint: '#5a9a3a', amount: 0.55, accent: '#f7d85a' },
  dark: { tint: '#1e1a2a', amount: 0.65, accent: '#8a5aff' },
  ninja: { tint: '#202230', amount: 0.62, accent: '#e83a3a' },
  'wolf-demon': { tint: '#2a2238', amount: 0.6, accent: '#ff3a6a' },
  'golden-eagle': { tint: '#e0a82a', amount: 0.55, accent: '#fff2a0' },
  pyramid: { tint: '#d9b25a', amount: 0.55, accent: '#3a6ad8' },
  diamond: { tint: '#a8f0ff', amount: 0.6, accent: '#ffffff' },
  galaxy: { tint: '#3a2a8a', amount: 0.6, accent: '#ff7ae8' },
  rainbow: { tint: '#ff5ab4', amount: 0.4, accent: '#5ae0ff' },
  prisma: { tint: '#b46aff', amount: 0.45, accent: '#5affd8' },
  thunderstorm: { tint: '#4a4a7a', amount: 0.55, accent: '#ffe83a' },
  thunder: { tint: '#ffd23a', amount: 0.35 },
  sandstorm: { tint: '#d8b070', amount: 0.55, accent: '#8a5a2a' },
  'full-moon': { tint: '#d8dcf0', amount: 0.55, accent: '#5a6aa8' },
  kraken: { tint: '#6a2a7a', amount: 0.55, accent: '#ff8a5a' },
  'deep-diver': { tint: '#1a5a7a', amount: 0.55, accent: '#f2c84a' },
  boulder: { tint: '#7a7a80', amount: 0.6, accent: '#4a4a50' },
  mountain: { tint: '#6a7a8a', amount: 0.45, accent: '#f4f8ff' }
}

/** Hue steps for un-themed skins (deterministic per id). */
const HUES = [35, 70, 110, 150, 190, 230, 270, 310, 335]

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

/** The smasher a skin's portrait shows when no smasher is given: a smasher
 *  of the skin's top part, picked by the skin id. */
export const smasherForSkin = (modelId: string): SmasherId => {
  const top = topPartOfSkin(modelId as SpinnerModelId)
  const pool = top ? SMASHER_LIST.filter(s => s.archetype.top === top) : SMASHER_LIST
  if (!pool.length) return 'bramble'
  return pool[hash(modelId) % pool.length]!.id
}

/** True when `modelId` is the default (signature) skin of the smasher. */
const isSignature = (id: SmasherId, modelId: string | undefined): boolean =>
  !modelId || SKINS_PER_TOP[SMASHERS[id].archetype.top]?.[0] === modelId

const paletteCache = new Map<string, SmasherPalette>()

/** The palette a smasher wears in skin `modelId`. */
export const smasherPalette = (id: SmasherId, modelId?: string): SmasherPalette => {
  const key = `${id}|${modelId ?? ''}`
  const hit = paletteCache.get(key)
  if (hit) return hit
  const base = SIGNATURE_PALETTES[id]
  let pal: SmasherPalette
  if (isSignature(id, modelId)) {
    pal = base
  } else {
    const theme = THEMES[modelId!]
    if (theme) {
      pal = {
        ...base,
        fur: mixHex(base.fur, theme.tint, theme.amount),
        accent: theme.accent ? mixHex(base.accent, theme.accent, 0.7) : mixHex(base.accent, theme.tint, theme.amount * 0.7),
        belly: theme.belly ? mixHex(base.belly, theme.belly, 0.6) : mixHex(base.belly, theme.tint, 0.15)
      }
    } else {
      const h = hash(modelId!)
      const hue = HUES[h % HUES.length]!
      const sat = 0.9 + ((h >> 8) % 5) * 0.08
      pal = {
        ...base,
        fur: shiftHex(base.fur, hue, sat),
        accent: shiftHex(base.accent, hue, sat),
        belly: shiftHex(base.belly, hue * 0.5, 0.9)
      }
    }
  }
  paletteCache.set(key, pal)
  return pal
}

/** Stable cache key of a look. */
export const lookKey = (id: SmasherId, modelId: string | undefined, boss: boolean): string =>
  `${id}|${isSignature(id, modelId) ? '' : modelId}|${boss ? 'B' : ''}`

export { isSmasherId }
