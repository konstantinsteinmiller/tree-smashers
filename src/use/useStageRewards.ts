// ─── Stage-anchored coin rewards ────────────────────────────────────────────
//
// The rewarded-ad button and the treasure chest both paid FLAT coin amounts —
// 125, and 25/100 — while the campaign's own economy grows without bound.
// `getStageById` auto-generates stages past 100 with an ever-increasing
// `cycleRewardMul`, so a flat payout does not merely fall behind, it decays
// toward zero relative to everything the player is doing:
//
//     stage    lose a battle    old ad payout     as a multiple
//         3               35              125           3.6x
//        21               90              125           1.4x
//        51              180              125           0.7x   ← worse than losing
//       100              600              125           0.2x
//
// Past stage ~40 the button is offering less than the consolation prize for
// FAILING the fight the player is already in, which is the point at which
// "watch an ad" stops being a decision.
//
// ─── The multiples are not invented, they are recovered ─────────────────────
//
// Both surfaces unlock at stage 3 (`v-if="currentStageId >= 3"`), where losing
// pays 35. Measured against that:
//
//     ad button   125  =  3.57x
//     chest big   100  =  2.86x
//     chest small  25  =  0.71x
//
// So the flat numbers were ALREADY anchored to the early campaign — they were
// tuned against stage 3 and then never scaled. Re-deriving them as 3x / 3x /
// 0.75x of the CURRENT stage reproduces the original design intent and fixes
// the curve at the same time; it is a restoration, not a re-balance.
//
// ─── Properties deliberately preserved ──────────────────────────────────────
//
//   • The chest's 4:1 big:small ratio, and with it the "patience pays slightly
//     better" gradient the component documents: small is 3 min (0.75x / 3 =
//     0.25x per minute), big is 10 min (3x / 10 = 0.30x per minute). Scaling
//     both by the same anchor keeps that exactly.
//   • The floors. Every value is `max(historical flat amount, scaled)`, so the
//     first few stages are never nerfed by this change — only the late game
//     moves.
//   • The ad staying the best coins-per-minute offer in the game. It matches
//     the chest's big payout but is repeatable on a 30-second cooldown rather
//     than a 10-minute one, so it remains ~20x better per unit time. That
//     ordering is intentional: the rewarded ad is the monetised action.
//
// Boss stages are NOT smoothed out. `currentStage` returns the boss itself, so
// its higher `rewardLose` lifts these payouts for exactly as long as the player
// is standing in front of the boss — which is where a top-up is worth most.
// (`useDailyChallenge` deliberately does the opposite and reads the stage
// BEFORE a boss, because that reward is a daily constant rather than an offer
// made in context.)

import { computed } from 'vue'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'

/** Rewarded-ad payout, as a multiple of what losing the current stage pays. */
export const AD_LOSS_MULTIPLE = 3
/** Big chest (10-minute wait). */
export const CHEST_BIG_LOSS_MULTIPLE = 3
/** Small chest (3-minute wait). Keeps the documented 4:1 big:small ratio. */
export const CHEST_SMALL_LOSS_MULTIPLE = 0.75

/** Historical flat values, kept as floors so the early game never regresses. */
export const AD_MIN_COINS = 125
export const CHEST_BIG_MIN_COINS = 100
export const CHEST_SMALL_MIN_COINS = 25

/** Round to something a player can read at a glance. Coin amounts are
 *  decoration as much as economy — `94` reads as noise where `95` reads as a
 *  number someone chose. */
const roundCoins = (value: number): number => Math.round(value / 5) * 5

const { currentStage } = useSpinnerCampaign()

/** Coins the CURRENT stage pays for a loss — the anchor for everything here. */
export const stageLossReward = computed(() => currentStage.value.rewardLose)

const scaled = (multiple: number, floor: number) =>
  computed(() => Math.max(floor, roundCoins(stageLossReward.value * multiple)))

/** Payout for the arena's rewarded-ad button. */
export const rewardedAdCoins = scaled(AD_LOSS_MULTIPLE, AD_MIN_COINS)

/** Treasure-chest payout in its 3-minute window. */
export const chestSmallCoins = scaled(CHEST_SMALL_LOSS_MULTIPLE, CHEST_SMALL_MIN_COINS)

/** Treasure-chest payout once it has reached its 10-minute mark. */
export const chestBigCoins = scaled(CHEST_BIG_LOSS_MULTIPLE, CHEST_BIG_MIN_COINS)
