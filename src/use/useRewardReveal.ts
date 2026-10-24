import { ref, shallowRef, watch } from 'vue'
import { displayDiamondReward } from '@/use/useCurrency'
import { RARITY_HEX, bestRarity, skinRarity, type RarityTier } from '@/data/smasherRarity'
import type { SpinnerModelId } from '@/data/skinCatalog'

/**
 * ─── The gift reveal, as a queue ────────────────────────────────────────────
 *
 * Every "you got something" moment outside the battle-result overlay (daily
 * reward, treasure chest, battle-pass claims, rewarded-ad payouts, league
 * season rewards, free gifts) goes through ONE screen: `RewardRevealHost`,
 * mounted once in `App.vue`, which plays the gift → lid → prize choreography
 * on `FReward`'s celebration stage.
 *
 * Callers GRANT first (the economy never waits on an animation and never
 * depends on the player watching it) and then `revealRewards(...)` purely to
 * show what was granted. The promise resolves when the player dismisses the
 * screen, so a caller can chain its fly-to-badge VFX after it.
 *
 * Reveals that arrive while one is up are queued, never stacked.
 */

export type RevealItem =
  | { kind: 'coins'; amount: number }
  /** Raw diamond amount; converted for display on single-currency builds. */
  | { kind: 'diamonds'; amount: number }
  | { kind: 'skin'; modelId: string }
  | { kind: 'speed'; minutes: number }
  /** A premium smasher just unlocked (ad or coins) — `modelId` is the
   *  colourway its portrait wears, `rarity` its card tier (passed in so this
   *  eager module never imports the smasher catalog). */
  | { kind: 'smasher'; smasherId: string; modelId: string; rarity: RarityTier }

/** What the host actually draws — diamonds already resolved per build. */
export type ShownRevealItem =
  | { kind: 'coins'; amount: number }
  | { kind: 'diamonds'; amount: number }
  | { kind: 'skin'; modelId: string }
  | { kind: 'speed'; minutes: number }
  | { kind: 'smasher'; smasherId: string; modelId: string; rarity: RarityTier }

export interface RevealRequest {
  items: ShownRevealItem[]
  /** Accent colour for rays / confetti; gold by default. */
  tone: string
  resolve: () => void
}

/**
 * Turn granted items into displayed ones: diamonds → coins on Poki-style
 * builds, and every coin amount summed into ONE coin prize (likewise
 * diamonds) — a claim-all of twelve battle-pass tiers shows one total that
 * counts up, not twelve piles. Skins stay one prize each, in grant order.
 */
export const resolveRevealItems = (items: RevealItem[]): ShownRevealItem[] => {
  const out: ShownRevealItem[] = []
  let coins = 0
  let diamonds = 0
  for (const it of items) {
    if (it.kind === 'diamonds') {
      if (it.amount <= 0) continue
      const d = displayDiamondReward(it.amount)
      if (d.currency === 'coins') coins += d.amount
      else diamonds += d.amount
    } else if (it.kind === 'coins') {
      if (it.amount > 0) coins += it.amount
    } else {
      out.push(it)
    }
  }
  if (diamonds > 0) out.unshift({ kind: 'diamonds', amount: diamonds })
  if (coins > 0) out.unshift({ kind: 'coins', amount: coins })
  // Skins and smashers are the headline: they go first.
  const head = (k: ShownRevealItem['kind']) => (k === 'skin' || k === 'smasher' ? 0 : 1)
  return out.sort((a, b) => head(a.kind) - head(b.kind))
}

/** Rarity of a skin or smasher prize (null for currency / speed). */
export const revealItemRarity = (it: ShownRevealItem): RarityTier | null => {
  if (it.kind === 'skin') return skinRarity(it.modelId as SpinnerModelId)
  if (it.kind === 'smasher') return it.rarity
  return null
}

/** The rarest skin / smasher of a reveal, as its colour (null: none in it). */
export const revealRarityHex = (items: ShownRevealItem[]): string | null => {
  const best = bestRarity(items.flatMap(i => {
    const r = revealItemRarity(i)
    return r ? [r] : []
  }))
  return best ? RARITY_HEX[best] : null
}

const toneFor = (items: ShownRevealItem[]): string => {
  // A skin reveal burns in the colour of its rarest skin (#UX1b).
  const rarity = revealRarityHex(items)
  if (rarity) return rarity
  if (items.some(i => i.kind === 'diamonds')) return '#5fd8ff'
  if (items.some(i => i.kind === 'speed')) return '#6ee87e'
  return '#ffd23c'
}

export const currentReveal = shallowRef<RevealRequest | null>(null)
const queue: RevealRequest[] = []
/** Count of reveals shown, for tests / debug hooks. */
export const revealCount = ref(0)

const pump = (): void => {
  if (currentReveal.value || queue.length === 0) return
  currentReveal.value = queue.shift()!
  revealCount.value++
}

/**
 * Show what was just granted. Resolves on dismissal (or immediately when
 * there is nothing to show).
 */
export const revealRewards = (items: RevealItem[], opts: { tone?: string } = {}): Promise<void> => {
  const shown = resolveRevealItems(items)
  if (shown.length === 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    queue.push({ items: shown, tone: opts.tone ?? toneFor(shown), resolve })
    pump()
  })
}

/**
 * Where the last dismissed reveal's coin plate stood (viewport rect), so a
 * caller that only learns of the grant afterwards can fly the coins from the
 * spot the player just saw them (set by RewardRevealHost on continue).
 */
export let lastRevealOrigin: DOMRect | null = null
export const setLastRevealOrigin = (r: DOMRect | null): void => {
  lastRevealOrigin = r
}

/** Resolves once no reveal is showing or queued (immediately when idle). */
export const whenRevealIdle = (): Promise<void> =>
  new Promise((resolve) => {
    if (!currentReveal.value && queue.length === 0) return resolve()
    const stop = watch(currentReveal, (r) => {
      if (r || queue.length > 0) return
      stop()
      resolve()
    })
  })

/** Called by the host when the player continues. */
export const finishReveal = (): void => {
  const cur = currentReveal.value
  if (!cur) return
  currentReveal.value = null
  cur.resolve()
  // Let the leave transition start before the next one mounts.
  setTimeout(pump, 260)
}

/** Test helper. */
export const __resetRevealQueue = (): void => {
  queue.length = 0
  currentReveal.value = null
  revealCount.value = 0
}
