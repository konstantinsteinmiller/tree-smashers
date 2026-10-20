import { ref, shallowRef } from 'vue'
import { displayDiamondReward } from '@/use/useCurrency'

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

/** What the host actually draws — diamonds already resolved per build. */
export type ShownRevealItem =
  | { kind: 'coins'; amount: number }
  | { kind: 'diamonds'; amount: number }
  | { kind: 'skin'; modelId: string }
  | { kind: 'speed'; minutes: number }

export interface RevealRequest {
  items: ShownRevealItem[]
  /** Accent colour for rays / confetti; gold by default. */
  tone: string
  resolve: () => void
}

/** Turn granted items into displayed ones: diamonds → coins on Poki-style builds, merge coins. */
export const resolveRevealItems = (items: RevealItem[]): ShownRevealItem[] => {
  const out: ShownRevealItem[] = []
  let coins = 0
  for (const it of items) {
    if (it.kind === 'diamonds') {
      if (it.amount <= 0) continue
      const d = displayDiamondReward(it.amount)
      if (d.currency === 'coins') coins += d.amount
      else out.push({ kind: 'diamonds', amount: d.amount })
    } else if (it.kind === 'coins') {
      if (it.amount > 0) coins += it.amount
    } else {
      out.push(it)
    }
  }
  if (coins > 0) out.unshift({ kind: 'coins', amount: coins })
  // Skins are the headline: they go first.
  return out.sort((a, b) => (a.kind === 'skin' ? 0 : 1) - (b.kind === 'skin' ? 0 : 1))
}

const toneFor = (items: ShownRevealItem[]): string => {
  if (items.some(i => i.kind === 'skin')) return '#c58bff'
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
