// ─── Boss-roulette grants ───────────────────────────────────────────────────
//
// What one landed roulette spin pays. The boss roulette can land TWICE — the
// first spin, plus the "Spin Again" respin when the player watches the ad —
// and each landing is granted on its own, so a respin ADDS a second grant to
// the first instead of replacing it.
//
//   multiplier → coins = base × multiplier
//   skin       → the skin (granted by the wheel via `buySkin`) + 1x coins
//   diamonds   → the jackpot's diamonds INSTEAD of coins
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
  /** Diamond-denominated jackpot (0 unless type === 'diamonds'). */
  diamonds: number
  /** Coins this spin paid (0 on the diamond jackpot). */
  coins: number
}

export const rouletteGrantFor = (result: RouletteResult, baseCoins: number): RouletteGrant => {
  if (result.type === 'diamonds') {
    return { type: 'diamonds', multiplier: 1, skin: null, diamonds: result.diamonds ?? 0, coins: 0 }
  }
  const multiplier = result.type === 'multiplier' ? result.multiplier ?? 1 : 1
  return {
    type: result.type,
    multiplier,
    skin: result.type === 'skin' ? result.skin ?? null : null,
    diamonds: 0,
    coins: Math.round(baseCoins * multiplier)
  }
}
