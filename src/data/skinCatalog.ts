// Skin catalog — pure data, NO Vue/composable dependencies. Lifted out
// of `useModels.ts` so unit tests can exercise the offerable-skin
// helpers without dragging in the full composable graph (useUser →
// useMatch → useModels → useUser circular import is fine in production
// but trips the test loader). `useModels.ts` re-exports these symbols
// so existing imports keep compiling.

import type { TopPartId } from '@/types/spinner'

/** Set of all spinner model IDs across every top part. The exhaustive
 *  list lets us key into per-skin metadata without picking a top. */
export const SPINNER_MODEL_IDS = [
  'fire', 'phoenix', 'thunder', 'bluedragon', 'turtle',
  'ice', 'chip', 'mysticaleye', 'nature', 'wulf',
  'castle', 'eagle', 'prisma', 'scorpion', 'shell',
  'snake', 'tornado', 'angelic', 'galaxy', 'gear',
  'mountain', 'shield', 'spiky-eagle', 'ape', 'axe',
  'bear', 'blades', 'chain', 'dark', 'demon',
  'forest-dragon', 'golden-eagle', 'hawk', 'piranha',
  'rainbow', 'reddragon', 'rhino', 'salamaner', 'sandstorm',
  'teleporter', 'thunderstorm', 'tsunami', 'wasp', 'wolf-demon',
  'boulder', 'diamond',
  // 2026-09 expansion — 4 regular skins per top part (skins-new-designs.md,
  // art in art/skins/). APPEND-ONLY: never reorder or insert above, see
  // tests/skinCatalog.newSkins.test.ts.
  'cheetah', 'jester', 'ninja', 'pirate',
  'porcupine', 'lionfish', 'morningstar', 'cactus',
  'kraken', 'taiko', 'toadstool', 'full-moon',
  'monarch', 'pyramid', 'compass', 'checkmate',
  'armadillo', 'anvil', 'mammoth', 'deep-diver',
  'narwhal', 'stag-beetle', 'drill', 'lancer'
] as const

export type SpinnerModelId = (typeof SPINNER_MODEL_IDS)[number]

/** Available skins per top part. The first entry per top is the default
 *  (always free / always owned). New skins are APPENDED to the end of a
 *  list — the default and every existing position stay put (existing saves
 *  keep their default, and persisted reward offers keep resolving). */
export const SKINS_PER_TOP: Record<TopPartId, SpinnerModelId[]> = {
  star: ['blades', 'ice', 'wasp', 'reddragon', 'chain', 'axe', 'tornado', 'cheetah', 'jester', 'ninja', 'pirate'],
  triangle: ['thunder', 'snake', 'phoenix', 'eagle', 'spiky-eagle', 'salamaner', 'thunderstorm', 'porcupine', 'lionfish', 'morningstar', 'cactus'],
  round: ['nature', 'turtle', 'piranha', 'bear', 'galaxy', 'golden-eagle', 'wolf-demon', 'dark', 'kraken', 'taiko', 'toadstool', 'full-moon'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic', 'tsunami', 'prisma', 'forest-dragon', 'rainbow', 'monarch', 'pyramid', 'compass', 'checkmate'],
  cushioned: ['shell', 'shield', 'castle', 'mountain', 'gear', 'sandstorm', 'diamond', 'boulder', 'armadillo', 'anvil', 'mammoth', 'deep-diver'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk', 'rhino', 'ape', 'teleporter', 'narwhal', 'stag-beetle', 'drill', 'lancer']
}

/** Special skins with unique VFX — cost 1500 coins and are excluded
 *  from daily rewards / battle pass / honor track skin draws. The
 *  battle-pass bug CG QA reported on 2026-05-05 was caused by the BP
 *  modal forgetting to filter these out: it offered "rainbow" at stage
 *  10, then `claimStage` (correctly filtering specials) silently
 *  substituted a different skin at claim time. */
export const SPECIAL_SKINS: ReadonlySet<SpinnerModelId> = new Set([
  'rainbow', 'dark', 'tornado', 'diamond', 'thunderstorm',
  'boulder', 'teleporter', 'sandstorm', 'forest-dragon'
])

export const SKIN_COST = 300
export const SPECIAL_SKIN_COST = 1500

/** Coin cost for a given skin. */
export const skinCost = (modelId: SpinnerModelId): number =>
  SPECIAL_SKINS.has(modelId) ? SPECIAL_SKIN_COST : SKIN_COST

/** Build the pool of skins eligible to be OFFERED as a free reward
 *  (Daily Rewards, Battle Pass, Honor Track, Skin Chest). Skins are
 *  excluded when:
 *    • They appear in `SPECIAL_SKINS` (those are pay-to-own only).
 *    • The caller's `isFullyOwned` predicate reports them already owned
 *      across every top part they appear under.
 *
 *  `isFullyOwned` is injected so tests can drive the helper without
 *  reaching into the live `ownedSkins` ref. The `useModels.ts` wrapper
 *  defaults it to the production predicate. */
export const getOfferableSkinPool = (
  isFullyOwned: (modelId: SpinnerModelId) => boolean
): SpinnerModelId[] => {
  const result: SpinnerModelId[] = []
  const seen = new Set<string>()
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    for (const modelId of SKINS_PER_TOP[topPartId]) {
      if (seen.has(modelId)) continue
      seen.add(modelId)
      if (SPECIAL_SKINS.has(modelId)) continue
      if (isFullyOwned(modelId)) continue
      result.push(modelId)
    }
  }
  return result
}
