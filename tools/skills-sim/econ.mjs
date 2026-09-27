// Coin-income model built from the game's real reward tables.
//   stage rewards       useSpinnerCampaign.ts (BASE_STAGES + trim)   via data.mjs
//   boss roulette EV    RouletteWheel.vue weights → 1.141x coins
//   rewarded ad         useStageRewards.ts rewardedAdCoins = max(125, round5(3 x rewardLose))
//   treasure chest big  useStageRewards.ts chestBigCoins   = max(100, round5(3 x rewardLose))
//   daily rewards       DailyRewards.vue [100,200,300,400,500,750,1000], skin on days 3/5/7
//   battle pass         useBattlePass.ts bpCoinReward, 50xp win / 12.5xp loss, 100xp per tier,
//                       skin tiers 10,20..100, diamond tiers 15,35,55
import { getStageById, upgradeCost, lockstepLevel } from './data.mjs'

const round5 = (v) => Math.round(v / 5) * 5
export const ROULETTE_EV = (0.5 * 16.66 + 1 * 50.01 + 1.5 * 15 + 2 * 10 + 3 * 3 + 1 * 11) / (16.66 + 50.01 + 15 + 10 + 3 + 0.26 + 11)
const bpCoin = (k) => {
  const c = Math.max(1, Math.min(100, k))
  const raw = c <= 50 ? 30 + ((c - 1) * 270) / 49 : 300 + ((c - 50) * 200) / 50
  return round5(raw)
}
const BP_NOCOIN = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 15, 35, 55])
const DAILY_COINS_PER_CYCLE = 100 + 200 + 400 + 750 // days 3/5/7 pay a skin

export const PROFILES = {
  // wins + losses only — no ads, no chest, no daily, no battle pass
  campaignOnly: { lossReg: 0.6, lossBoss: 1.5, adsPerStage: 0, bigChestPerStage: 0, stagesPerDay: Infinity, bp: false },
  // the model the doc calls "typical": 1 ad per 3 stages, one big chest per
  // ~3 stages (≈10 min of play), 6 stages/day, battle pass claimed
  typical: { lossReg: 0.6, lossBoss: 1.5, adsPerStage: 1 / 3, bigChestPerStage: 1 / 3, stagesPerDay: 6, bp: true },
  // engaged ad watcher: 1 rewarded ad per stage
  engaged: { lossReg: 0.6, lossBoss: 1.5, adsPerStage: 1, bigChestPerStage: 1 / 3, stagesPerDay: 6, bp: true }
}

/** Coins earned WHILE clearing stage `s` (win + expected losses + extras). */
export const incomeAtStage = (s, p) => {
  const st = getStageById(s)
  const early = s < 15
  const losses = st.isBoss ? (early ? 0.8 : p.lossBoss) : (early ? 0.2 : p.lossReg)
  let c = st.rewardWin * (st.isBoss ? ROULETTE_EV : 1) + losses * st.rewardLose
  if (s >= 3) {
    c += p.adsPerStage * Math.max(125, round5(3 * st.rewardLose))
    c += p.bigChestPerStage * Math.max(100, round5(3 * st.rewardLose))
    if (Number.isFinite(p.stagesPerDay)) c += DAILY_COINS_PER_CYCLE / 7 / p.stagesPerDay
  }
  return c
}

/** Battle-pass coins accrued by the time stage `s` is cleared. */
export const bpCoinsBy = (s, p) => {
  if (!p.bp) return 0
  let xp = 0
  for (let i = 6; i <= s; i++) { // BattlePass button unlocks at stage 6
    const st = getStageById(i)
    const losses = st.isBoss ? p.lossBoss : p.lossReg
    xp += 50 + losses * 12.5
  }
  const tiers = Math.min(100, Math.floor(xp / 100))
  let coins = 0
  for (let k = 1; k <= tiers; k++) if (!BP_NOCOIN.has(k)) coins += bpCoin(k)
  return coins
}

export const cumIncome = (s, p) => {
  let c = 0
  for (let i = 1; i <= s; i++) c += incomeAtStage(i, p)
  return c + bpCoinsBy(s, p)
}

export const cumPartCost = (L) => {
  let c = 0
  for (let l = 1; l <= L; l++) c += upgradeCost(l)
  return c
}

if ((process.argv[1] ?? '').replaceAll('\\', '/').endsWith('/econ.mjs')) {
  console.log('roulette EV', ROULETTE_EV.toFixed(3))
  console.log('stage | lock | cum income (campaignOnly / typical / engaged) | 3 parts @lockstep | 4 parts @lockstep')
  for (const s of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100]) {
    const L = lockstepLevel(s)
    console.log(`${s} | ${L} | ${cumIncome(s, PROFILES.campaignOnly).toFixed(0)} / ${cumIncome(s, PROFILES.typical).toFixed(0)} / ${cumIncome(s, PROFILES.engaged).toFixed(0)} | ${3 * cumPartCost(L)} | ${4 * cumPartCost(L)}`)
  }
}

/** Part level a typical player holds at stage `s` if HALF of the typical
 *  cumulative income went into the team's 3 parts (star, round, balanced) —
 *  the other half covers skills, skins, experiments with other parts. */
export const econLevel = (s, share = 0.5) => {
  const budget = cumIncome(s, PROFILES.typical) * share / 3
  let L = 0
  while (cumPartCost(L + 1) <= budget) L++
  return L
}
