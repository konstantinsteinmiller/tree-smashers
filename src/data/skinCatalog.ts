// Skin catalog — pure data, NO Vue/composable dependencies. Lifted out
// of `useModels.ts` so unit tests can exercise the offerable-skin
// helpers without dragging in the full composable graph (useUser →
// useMatch → useModels → useUser circular import is fine in production
// but trips the test loader). `useModels.ts` re-exports these symbols
// so existing imports keep compiling.

import type { TopPartId } from '@/types/spinner'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'

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

/** The 2026-09 expansion — the newest 4 skins of every top part. On a build
 *  that serves rewarded ads (`HAS_REWARDED_ADS`) they are NOT sold for coins:
 *  the skin shop unlocks each with ONE rewarded ad. On a build without
 *  rewarded ads the ad button is hidden and they sell for
 *  `AD_SKIN_COIN_COST` coins instead. Either way they stay regular skins, so
 *  the Skin Chest, the roulette wheel, the Battle Pass and Daily Rewards keep
 *  handing them out (`getOfferableSkinPool` does not exclude them). A player
 *  who bought one with coins before this rule keeps it — ownership lives in
 *  `spinner_owned_skins` and nothing here revokes it. */
export const AD_UNLOCK_SKINS: ReadonlySet<SpinnerModelId> = new Set<SpinnerModelId>([
  'cheetah', 'jester', 'ninja', 'pirate',
  'porcupine', 'lionfish', 'morningstar', 'cactus',
  'kraken', 'taiko', 'toadstool', 'full-moon',
  'monarch', 'pyramid', 'compass', 'checkmate',
  'armadillo', 'anvil', 'mammoth', 'deep-diver',
  'narwhal', 'stag-beetle', 'drill', 'lancer'
])

/** Completed rewarded ads needed to unlock one `AD_UNLOCK_SKINS` skin in the
 *  shop. Was 3; progress saved under the old rule (1–2 watches, see
 *  `SKIN_AD_PROGRESS_KEY`) already meets it and is settled into ownership. */
export const SKIN_AD_UNLOCK_ADS = 1

/** Coin price of an `AD_UNLOCK_SKINS` skin on a build WITHOUT rewarded ads:
 *  3x the special-skin price. */
export const AD_SKIN_COIN_COST = SPECIAL_SKIN_COST * 3

/** True when the shop offers the rewarded-ad unlock for this skin — only an
 *  `AD_UNLOCK_SKINS` skin, and only on a build that serves rewarded ads.
 *  `adsBuild` exists for tests; production always uses the build constant. */
export const isAdUnlockSkin = (modelId: SpinnerModelId, adsBuild: boolean = HAS_REWARDED_ADS): boolean =>
  adsBuild && AD_UNLOCK_SKINS.has(modelId)

/** False for skins the shop never sells for coins: `AD_UNLOCK_SKINS` on an
 *  ad build. Without rewarded ads every skin is coin-purchasable. */
export const isCoinPurchasable = (modelId: SpinnerModelId, adsBuild: boolean = HAS_REWARDED_ADS): boolean =>
  !isAdUnlockSkin(modelId, adsBuild)

/** Coin cost for a given skin. For `AD_UNLOCK_SKINS` it is only offered on a
 *  build without rewarded ads — check `isCoinPurchasable` first. */
export const skinCost = (modelId: SpinnerModelId): number =>
  AD_UNLOCK_SKINS.has(modelId)
    ? AD_SKIN_COIN_COST
    : SPECIAL_SKINS.has(modelId) ? SPECIAL_SKIN_COST : SKIN_COST

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
