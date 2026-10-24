// Skin catalog — pure data, NO Vue/composable dependencies. Lifted out
// of `useModels.ts` so unit tests can exercise the offerable-skin
// helpers without dragging in the full composable graph (useUser →
// useMatch → useModels → useUser circular import is fine in production
// but trips the test loader). `useModels.ts` re-exports these symbols
// so existing imports keep compiling.

import type { TopPartId } from '@/types/spinner'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import { SMASHER_SKIN_COIN_COST, SMASHER_SKIN_IDS, isSmasherSkin } from '@/data/smasherSkinCatalog'

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
  // now smasher colourways, src/smashers/smasherSkins.ts). APPEND-ONLY: never reorder or insert above, see
  // tests/skinCatalog.newSkins.test.ts.
  'cheetah', 'jester', 'ninja', 'pirate',
  'porcupine', 'lionfish', 'morningstar', 'cactus',
  'kraken', 'taiko', 'toadstool', 'full-moon',
  'monarch', 'pyramid', 'compass', 'checkmate',
  'armadillo', 'anvil', 'mammoth', 'deep-diver',
  'narwhal', 'stag-beetle', 'drill', 'lancer',
  // Bosses 100+ trophy skins (bosses-100-feature.md §3.5) — EARN-ONLY, see
  // TROPHY_SKINS below. Worn by the Cinder Tyrant, the Glacier Warden and the
  // Frostbite Yeti; granted by the first win over an encounter that wears it.
  'cinder', 'frost-vault', 'yeti',
  // 2026-10-23: ONE locked skin per smasher (src/data/smasherSkinCatalog.ts).
  ...SMASHER_SKIN_IDS
] as const

export type SpinnerModelId = (typeof SPINNER_MODEL_IDS)[number]

/** Available skins per top part. The first entry per top is the default
 *  (always free / always owned). New skins are APPENDED to the end of a
 *  list — the default and every existing position stay put (existing saves
 *  keep their default, and persisted reward offers keep resolving). */
export const SKINS_PER_TOP: Record<TopPartId, SpinnerModelId[]> = {
  star: ['blades', 'ice', 'wasp', 'reddragon', 'chain', 'axe', 'tornado', 'cheetah', 'jester', 'ninja', 'pirate'],
  triangle: ['thunder', 'snake', 'phoenix', 'eagle', 'spiky-eagle', 'salamaner', 'thunderstorm', 'porcupine', 'lionfish', 'morningstar', 'cactus', 'yeti'],
  round: ['nature', 'turtle', 'piranha', 'bear', 'galaxy', 'golden-eagle', 'wolf-demon', 'dark', 'kraken', 'taiko', 'toadstool', 'full-moon', 'cinder'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic', 'tsunami', 'prisma', 'forest-dragon', 'rainbow', 'monarch', 'pyramid', 'compass', 'checkmate', 'frost-vault'],
  cushioned: ['shell', 'shield', 'castle', 'mountain', 'gear', 'sandstorm', 'diamond', 'boulder', 'armadillo', 'anvil', 'mammoth', 'deep-diver'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk', 'rhino', 'ape', 'teleporter', 'narwhal', 'stag-beetle', 'drill', 'lancer']
}

/** Special skins with unique VFX — cost 1500 coins (one rewarded ad on an ad
 *  build, see `isAdUnlockSkin`) and are excluded
 *  from daily rewards / battle pass / honor track skin draws. The
 *  battle-pass bug CG QA reported on 2026-05-05 was caused by the BP
 *  modal forgetting to filter these out: it offered "rainbow" at stage
 *  10, then `claimStage` (correctly filtering specials) silently
 *  substituted a different skin at claim time. */
export const SPECIAL_SKINS: ReadonlySet<SpinnerModelId> = new Set([
  'rainbow', 'dark', 'tornado', 'diamond', 'thunderstorm',
  'boulder', 'teleporter', 'sandstorm', 'forest-dragon'
])

/** EARN-ONLY boss trophy skins (bosses-100-feature.md §3.5, decision B2).
 *  The ONE flag every offer path checks: they are never sold (coins or
 *  ads), never in the Skin Chest, the roulette wheel, the Battle Pass, Daily
 *  Rewards or any other random draw — the only way in is `grantTrophySkin`
 *  (useModels) on a boss win. Must equal `BOSS_TROPHY_SKIN_IDS` in
 *  `@/data/bossEncounters` (tests/trophySkins.test.ts). Cosmetic only. */
export const TROPHY_SKINS: ReadonlySet<SpinnerModelId> = new Set<SpinnerModelId>(['cinder', 'frost-vault', 'yeti'])

/** True for a skin no shop, chest, wheel, pass, daily reward or ad may hand out. */
export const isEarnOnlySkin = (modelId: string): boolean => TROPHY_SKINS.has(modelId as SpinnerModelId)

/** The top part that lists a skin (every catalog skin is under exactly one). */
export const topPartOfSkin = (modelId: SpinnerModelId): TopPartId | null => {
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    if (SKINS_PER_TOP[topPartId].includes(modelId)) return topPartId
  }
  return null
}

/** `SKINS_PER_TOP[topPartId]` minus the earn-only skins — the list every
 *  RANDOM or PURCHASABLE skin draw must use (random NPC skins,
 *  chest / wheel pools). */
export const offerableSkinsForTop = (topPartId: TopPartId): SpinnerModelId[] =>
  SKINS_PER_TOP[topPartId].filter(id => !isEarnOnlySkin(id))

export const SKIN_COST = 300
export const SPECIAL_SKIN_COST = 1500

/** The 2026-09 expansion — the newest 4 skins of every top part. They were
 *  the first ad-unlock skins; since the owner rule of 2026-10-21 EVERY
 *  purchasable skin unlocks with one rewarded ad on an ad build (see
 *  `isAdUnlockSkin`), so this set now only decides their tier (`skinRarity`
 *  "super"), their no-ad coin price (`AD_SKIN_COIN_COST`) and which legacy
 *  ad progress settles (`settleSkinAdProgress`). They stay regular skins: the
 *  Skin Chest, the roulette wheel, the Battle Pass and Daily Rewards keep
 *  handing them out (`getOfferableSkinPool` does not exclude them). */
export const AD_UNLOCK_SKINS: ReadonlySet<SpinnerModelId> = new Set<SpinnerModelId>([
  'cheetah', 'jester', 'ninja', 'pirate',
  'porcupine', 'lionfish', 'morningstar', 'cactus',
  'kraken', 'taiko', 'toadstool', 'full-moon',
  'monarch', 'pyramid', 'compass', 'checkmate',
  'armadillo', 'anvil', 'mammoth', 'deep-diver',
  'narwhal', 'stag-beetle', 'drill', 'lancer'
])

/** Completed rewarded ads needed to unlock one skin in the shop. Was 3 for
 *  the expansion; progress saved under the old rule (1–2 watches, see
 *  `SKIN_AD_PROGRESS_KEY`) already meets it and is settled into ownership. */
export const SKIN_AD_UNLOCK_ADS = 1

/** Coin price of an `AD_UNLOCK_SKINS` skin on a build WITHOUT rewarded ads:
 *  3x the special-skin price. */
export const AD_SKIN_COIN_COST = SPECIAL_SKIN_COST * 3

/** The free default of its top part (first entry; always owned). */
export const isDefaultSkin = (modelId: string): boolean =>
  Object.values(SKINS_PER_TOP).some(list => list[0] === modelId)

/**
 * Owner rule (2026-10-21): on every build that serves rewarded ads, EVERY
 * purchasable skin — regular, special and the 2026-09 expansion — is unlocked
 * by watching ONE rewarded ad instead of coins. Never an earn-only boss trophy
 * (they were never sold: earned by gameplay only, B4) and never a free default.
 *
 * `adsBuild` is the SESSION answer: the skin shop passes
 * `rewardedUnlocksAvailable` (useAds — the build constant AND no ad blocker /
 * no "rewarded unsupported" from the portal), so a session that loses ad
 * support falls back to the coin price. The default is the build constant.
 */
export const isAdUnlockSkin = (modelId: SpinnerModelId, adsBuild: boolean = HAS_REWARDED_ADS): boolean =>
  adsBuild && !isEarnOnlySkin(modelId) && !isDefaultSkin(modelId)

/** True when the shop sells this skin for coins: every non-trophy skin on a
 *  session without rewarded ads, none on a session with them. */
export const isCoinPurchasable = (modelId: SpinnerModelId, adsBuild: boolean = HAS_REWARDED_ADS): boolean =>
  !isEarnOnlySkin(modelId) && !isAdUnlockSkin(modelId, adsBuild)

/** Coin cost of a skin on a session without rewarded ads (unchanged prices:
 *  300 regular, 1 500 special, 4 500 for the 2026-09 expansion). */
export const skinCost = (modelId: SpinnerModelId): number =>
  isSmasherSkin(modelId) ? SMASHER_SKIN_COIN_COST :
  AD_UNLOCK_SKINS.has(modelId)
    ? AD_SKIN_COIN_COST
    : SPECIAL_SKINS.has(modelId) ? SPECIAL_SKIN_COST : SKIN_COST

/** Build the pool of skins eligible to be OFFERED as a free reward
 *  (Daily Rewards, Battle Pass, Honor Track, Skin Chest). Skins are
 *  excluded when:
 *    • They appear in `SPECIAL_SKINS` (those are pay-to-own only).
 *    • They are earn-only boss trophies (`TROPHY_SKINS`).
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
      if (isEarnOnlySkin(modelId)) continue
      if (isFullyOwned(modelId)) continue
      result.push(modelId)
    }
  }
  return result
}
