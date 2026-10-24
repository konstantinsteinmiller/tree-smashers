// ─── Boss-roulette grants ───────────────────────────────────────────────────
//
// What one landed roulette spin pays. The boss roulette can land TWICE — the
// first spin, plus the "Spin Again" respin when the player watches the ad —
// and each landing is granted on its own, so a respin ADDS a second grant to
// the first instead of replacing it.
//
//   multiplier → coins = base × multiplier
//   skin       → the skin (granted by the wheel via `buySkin`) + 1x coins
//   jackpot    → the jackpot's fixed coins (not base-scaled). It paid
//                diamonds until 2026-10-21; diamonds are no wheel reward now.
//
// Skin segments are only ever built from skins the player does not own yet,
// and the respin wheel is rebuilt AFTER the first spin's skin was granted, so
// the respin can never land the same skin again; a skin that is somehow owned
// by grant time is a `buySkin` no-op and the spin still pays its 1x coins.

import type { RouletteResult } from '@/components/organisms/RouletteWheel.vue'

export interface RouletteGrant {
  type: RouletteResult['type']
  multiplier: number
  skin: RouletteResult['skin'] | null
  /** Coins this spin paid (the jackpot's fixed amount on type === 'jackpot'). */
  coins: number
}

export const rouletteGrantFor = (result: RouletteResult, baseCoins: number): RouletteGrant => {
  if (result.type === 'jackpot') {
    return { type: 'jackpot', multiplier: 1, skin: null, coins: result.coins ?? 0 }
  }
  const multiplier = result.type === 'multiplier' ? result.multiplier ?? 1 : 1
  return {
    type: result.type,
    multiplier,
    skin: result.type === 'skin' ? result.skin ?? null : null,
    coins: Math.round(baseCoins * multiplier)
  }
}
