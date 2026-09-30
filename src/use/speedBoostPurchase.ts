// ─── 2x speed switch: what a tap on "2x" does, per build ────────────────────
//
// Pure leaf module (no Vue, no storage) — SpinnerArena feeds it live values
// and callbacks, so every rule is unit-testable
// (tests/speedBoostCoinBuy.test.ts).
//
// On builds that serve rewarded ads a fresh 2x boost costs a rewarded video.
// Every build WITHOUT rewarded ads (itch, Glitch, GamePix, Y8, WaveDash, plain
// web, native without ads, CrazyGames basic launch — see rewardedAdsBuild.ts)
// would otherwise never show the switch, so there the boost is BOUGHT for
// coins instead — same duration as the ad boost (D14, generalised by D19).
//
// The free first-time / daily gifts (speedGiftGate.ts) apply on every build
// (D17), so the tap order is:
//
//   running boost → toggle
//   free gift     → free boost (FREE badge wins over the coin sticker)
//   no-ad build   → coin buy        ad build → rewarded ad

import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'

/** Every build without rewarded ads. Derived from `HAS_REWARDED_ADS`, a
 *  build-time `import.meta.env.VITE_APP_*` literal (never a runtime flag —
 *  see resolveAdProvider.ts). The helpers below accept a `coinBuild` test
 *  override, so their few-line coin and ad branches are NOT tree-shaken:
 *  both ship in every build and this literal picks one. The coin-price
 *  sticker (SpeedCoinBadge) is what drops out of ad builds — SpinnerArena
 *  picks it at module scope. */
export const IS_COIN_SPEED_BOOST_BUILD: boolean = !HAS_REWARDED_ADS

/** Coin price of one 2x boost on a build without rewarded ads. */
export const SPEED_BOOST_COIN_PRICE = 100

export interface SpeedSwitchOfferInput {
  /** A rewarded ad is loaded right now. */
  rewardedReady: boolean
  /** A boost (paid or free) is still running. */
  boostActive: boolean
  /** A free first-time / daily gift is on offer. */
  freeGift: boolean
  coinBuild?: boolean
}

/** Whether the 2x switch has anything to offer (stage / spotlight gating
 *  stays in the template). On the coin build it is always offered — an
 *  unaffordable price shows disabled rather than hiding the feature. */
export const isSpeedSwitchOffered = (i: SpeedSwitchOfferInput): boolean =>
  (i.coinBuild ?? IS_COIN_SPEED_BOOST_BUILD) || i.rewardedReady || i.boostActive || i.freeGift

export interface SpeedBoostPriceInput {
  coins: number
  /** A boost is running — a tap only toggles, nothing is charged. */
  boostActive: boolean
  /** A free gift is on offer — the next tap is free, whatever the wallet. */
  freeGift: boolean
  coinBuild?: boolean
}

/** The coin build is showing a price the player cannot pay (the 2x button
 *  renders disabled). Never while a boost runs or a free gift is on offer:
 *  a first-timer with fewer than 100 coins must still be able to take the
 *  FREE boost. */
export const isSpeedBoostUnaffordable = (i: SpeedBoostPriceInput): boolean =>
  (i.coinBuild ?? IS_COIN_SPEED_BOOST_BUILD) && !i.boostActive && !i.freeGift && i.coins < SPEED_BOOST_COIN_PRICE

export interface SpeedTapDeps {
  isBoostActive: () => boolean
  setSpeed: (value: 1 | 2) => void
  /** Spend a free gift: 'first' (full boost), 'daily' (short) or null. */
  claimFree: () => 'first' | 'daily' | null
  /** Start a boost of the given kind and switch the sim to 2x. */
  grant: (kind: 'full' | 'daily') => void
  /** Show the rewarded ad; grants on completion. */
  showAd: () => void
  coins: () => number
  /** The existing currency path (addCoins with a negative amount). */
  spendCoins: (amount: number) => void
  coinBuild?: boolean
}

export type SpeedTapResult = 'normal' | 'toggle' | 'free-first' | 'free-daily' | 'coins' | 'blocked' | 'ad'

/**
 * Resolve a tap on the 1x/2x switch.
 *
 * Coin buy: grant FIRST, then charge, in the same synchronous turn — if the
 * grant's storage write throws, nothing is charged; once granted the boost
 * is running, so a second (double) tap lands in the 'toggle' branch and can
 * never charge twice.
 */
export const handleSpeedSwitchTap = (value: 1 | 2, d: SpeedTapDeps): SpeedTapResult => {
  if (value === 1) {
    d.setSpeed(1)
    return 'normal'
  }
  if (d.isBoostActive()) {
    d.setSpeed(2)
    return 'toggle'
  }
  const free = d.claimFree()
  if (free) {
    d.grant(free === 'daily' ? 'daily' : 'full')
    return free === 'daily' ? 'free-daily' : 'free-first'
  }
  if (d.coinBuild ?? IS_COIN_SPEED_BOOST_BUILD) {
    if (d.coins() < SPEED_BOOST_COIN_PRICE) return 'blocked'
    d.grant('full')
    d.spendCoins(SPEED_BOOST_COIN_PRICE)
    return 'coins'
  }
  d.showAd()
  return 'ad'
}
