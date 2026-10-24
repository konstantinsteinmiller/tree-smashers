// ─── Battle pass "Claim all" (#UX1b, owner request) ─────────────────────────
//
// One tap claims every claimable tier of the battle pass AND of the honour
// track, then the gift reveal shows ONE screen: the coins
// summed into one count-up, every skin side by side.
//
// It is nothing but the single-tier claims run in order, so every existing
// rule still holds — a tier must be unlocked and unclaimed (`claimStage` /
// `claimHonorStage` refuse otherwise), each claim saves itself, a skin tier
// prefers the skin it advertised and falls back exactly as a single claim
// does. The one thing a batch adds: skins handed out earlier in the SAME
// batch are owned by the time a later tier is claimed, so an honour tier
// whose advertised skin was just granted by a battle-pass tier gets another
// offerable skin instead of a duplicate (and is left unclaimed, like a single
// claim, when no offerable skin is left at all).
//
// Pure orchestration over injected claim functions: tests drive it with fakes
// (tests/claimAll.test.ts) and with the real composables.

import type { SpinnerModelId } from '@/data/skinCatalog'

export interface TierClaim {
  coins: number
  skin: SpinnerModelId | null
}

export interface ClaimAllDeps {
  /** Unlocked-but-unclaimed battle-pass tiers, ascending. */
  pendingPass: () => number[]
  /** The skin a pass tier advertises (if any). */
  passOffer: (stage: number) => SpinnerModelId | null | undefined
  /** `useBattlePass().claimStage` — grants + saves, null when refused. */
  claimPass: (stage: number, offer: SpinnerModelId | null | undefined) => TierClaim | null
  /** Unlocked-but-unclaimed honour tiers, ascending (empty when PvP is off). */
  pendingHonor: () => number[]
  /** The skin an honour tier advertises (if any). */
  honorOffer: (stage: number) => SpinnerModelId | null | undefined
  /** Skins that may be handed out right now (unowned, not special, not earn-only). */
  offerablePool: () => SpinnerModelId[]
  /** `usePvpStats().claimHonorStage` — marks + saves, false when refused. */
  claimHonor: (stage: number, skin: SpinnerModelId) => boolean
  /** Unlock a skin for every top part that lists it. */
  unlockSkin: (skin: SpinnerModelId) => void
  /** Fallback pick from a non-empty pool (random in the game, fixed in tests). */
  pick?: (pool: SpinnerModelId[]) => SpinnerModelId
}

export interface ClaimAllResult {
  passStages: number[]
  honorStages: number[]
  coins: number
  /** Every skin granted, in claim order (never a duplicate). */
  skins: SpinnerModelId[]
}

const randomPick = (pool: SpinnerModelId[]): SpinnerModelId => pool[Math.floor(Math.random() * pool.length)]!

/** Number of tiers a claim-all would claim right now. */
export const claimableCount = (d: Pick<ClaimAllDeps, 'pendingPass' | 'pendingHonor'>): number =>
  d.pendingPass().length + d.pendingHonor().length

export const claimAll = (d: ClaimAllDeps): ClaimAllResult => {
  const pick = d.pick ?? randomPick
  const out: ClaimAllResult = { passStages: [], honorStages: [], coins: 0, skins: [] }

  for (const stage of d.pendingPass()) {
    const res = d.claimPass(stage, d.passOffer(stage))
    if (!res) continue
    out.passStages.push(stage)
    out.coins += res.coins
    if (res.skin) out.skins.push(res.skin)
  }

  for (const stage of d.pendingHonor()) {
    const pool = d.offerablePool().filter(s => !out.skins.includes(s))
    if (pool.length === 0) break
    const offer = d.honorOffer(stage)
    const skin = offer && pool.includes(offer) ? offer : pick(pool)
    if (!d.claimHonor(stage, skin)) continue
    d.unlockSkin(skin)
    out.honorStages.push(stage)
    out.skins.push(skin)
  }

  return out
}

/**
 * When the battle pass shows its Claim-all hero (#UX1c): from two waiting
 * tiers up (pass + honour together), and for the honour track ALONE whenever
 * the pass strip has nothing waiting — one honour tier included, so it never
 * has to be hunted for in the scroll strip.
 */
export const claimAllVisible = (pendingPass: number, pendingHonor: number): boolean =>
  pendingPass + pendingHonor >= 2 || (pendingPass === 0 && pendingHonor >= 1)
