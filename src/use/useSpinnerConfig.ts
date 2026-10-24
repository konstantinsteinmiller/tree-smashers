import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type {
  TopPartId,
  BottomPartId,
  TopPart,
  BottomPart,
  SpinnerConfig,
  SpinnerStats
} from '@/types/spinner'
import { COINS_KEY, DIAMONDS_KEY } from '@/keys'
import { isSingleCurrency, diamondsToCoins } from '@/use/useCurrency'
import { saveDataVersion } from '@/use/useSaveStatus'
import { TOP_UPGRADE_BONUS, BOTTOM_UPGRADE_BONUS } from '@/use/useSpinnerCampaign'
import {
  SMASHERS,
  SMASHER_TAPER_LEVEL,
  isSmasherId,
  smasherConfig,
  smasherForParts,
  smasherUpgradeLevel,
  type SmasherId
} from '@/data/smasherCatalog'
import { MAX_TEAM_SIZE } from '@/data/teamSize'

// ─── Part Definitions ────────────────────────────────────────────────────────

export const TOP_PARTS: Record<TopPartId, TopPart> = {
  star: {
    id: 'star',
    label: 'Star Blade',
    damageMultiplier: 1.8,
    defenseMultiplier: 0.8,
    healthBonus: 0,
    shape: 'star'
  },
  // "Spiky" — mediocre speed-based damage scaling, but its barbs chip a
  // small flat amount of HP on *every* collision. Hugging / closely chasing
  // an enemy turns into constant pressure even at low speeds. The flat
  // chip is applied per collision pair with a cooldown (see
  // SPIKY_CHIP_COOLDOWN_MS in useSpinnerGame) so the DPS stays in check.
  triangle: {
    id: 'triangle',
    label: 'Spiky',
    damageMultiplier: 1.1,
    defenseMultiplier: 0.95,
    healthBonus: 5,
    shape: 'spiky'
  },
  round: {
    id: 'round',
    label: 'Round Guard',
    damageMultiplier: 0.8,
    defenseMultiplier: 1.5,
    healthBonus: 15,
    shape: 'circle'
  },
  quadratic: {
    id: 'quadratic',
    label: 'Quad Core',
    damageMultiplier: 1.0,
    defenseMultiplier: 1.0,
    healthBonus: 10,
    shape: 'square'
  },
  cushioned: {
    id: 'cushioned',
    label: 'Soft Shell',
    damageMultiplier: 0.6,
    defenseMultiplier: 1.8,
    healthBonus: 20,
    shape: 'cushion'
  },
  piercer: {
    id: 'piercer',
    label: 'Tank Piercer',
    damageMultiplier: 1.7,
    defenseMultiplier: 0.8,
    healthBonus: 0,
    shape: 'piercer'
  }
}

export const BOTTOM_PARTS: Record<BottomPartId, BottomPart> = {
  speedy: {
    id: 'speedy',
    label: 'Speedy',
    speedMultiplier: 1.5,
    forceDecay: 0.9985,
    healthBonus: 0,
    weight: 80
  },
  tanky: {
    id: 'tanky',
    label: 'Tanky',
    speedMultiplier: 0.7,
    forceDecay: 0.994,
    healthBonus: 20,
    weight: 150
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    speedMultiplier: 1.0,
    forceDecay: 0.996,
    healthBonus: 10,
    weight: 110
  }
}

export const TOP_PARTS_LIST = Object.values(TOP_PARTS)
export const BOTTOM_PARTS_LIST = Object.values(BOTTOM_PARTS)

// ─── Smasher part tuning (part-level balance pass) ──────────────────────────
//
// SMASHER configs (every player / PvP / league blade) read the part values
// below; PART-ONLY configs (campaign stage enemies, boss encounters, league
// gatekeepers, leaderboard ghosts) keep the legacy TOP_PARTS / BOTTOM_PARTS +
// TOP_UPGRADE_BONUS / BOTTOM_UPGRADE_BONUS above, so the campaign's enemy
// strength is exactly what it was before the pass. Shapes, labels and every
// rule keyed on the part id (spiky chip, piercer, star crit, cushion) are
// unchanged — only the numbers differ.
//
// Measured and fitted with the balance sim (scripts/balance-sim.mjs →
// balance-report.md); the campaign compensation for the player side lives in
// `CAMPAIGN_NPC_HP_MUL` (useSpinnerCampaign.ts).

export interface SmasherTopTuning { damageMultiplier: number; defenseMultiplier: number; healthBonus: number }
export interface SmasherBottomTuning { speedMultiplier: number; forceDecay: number; healthBonus: number; weight: number }

// What changed against the legacy tables, and why (balance-report.md):
//   weight   Speedy 80 → 100, Tanky 150 → 115. Weight enters a hit twice
//            (attacker / defender ratio), so 150 vs 80 was a 3.5× damage
//            trade: Tanky beat Balanced ~100 %, Speedy won ~16 %.
//   HP       Speedy +8 (was 0) and +1.75 / level (was 1); Tanky +13 (was 20)
//            and +2.75 / level (was 4) — still the most HP, no longer 2×.
//   speed    Tanky base 0.65 (was 0.7), +0.025 / level (was 0.02); Speedy
//            +0.065 / level (was 0.09): Speedy stays the fastest by far and
//            out-scales the others late, Tanky stays the slowest.
//   tops     Star +6 HP (glass, not paper); Tank Piercer damage 1.45 (was
//            1.7, it ignores 75 % of defence on top); Soft Shell damage 0.65
//            (was 0.6) and +0.04 / level (was 0.03) so it still hurts late.
export const SMASHER_TOP_PARTS: Record<TopPartId, SmasherTopTuning> = {
  star: { damageMultiplier: 1.9, defenseMultiplier: 0.8, healthBonus: 6 },
  triangle: { damageMultiplier: 1.15, defenseMultiplier: 0.95, healthBonus: 5 },
  round: { damageMultiplier: 0.8, defenseMultiplier: 1.4, healthBonus: 15 },
  quadratic: { damageMultiplier: 1.0, defenseMultiplier: 1.0, healthBonus: 10 },
  cushioned: { damageMultiplier: 0.65, defenseMultiplier: 1.65, healthBonus: 20 },
  piercer: { damageMultiplier: 1.5, defenseMultiplier: 0.8, healthBonus: 0 }
}

export const SMASHER_BOTTOM_PARTS: Record<BottomPartId, SmasherBottomTuning> = {
  speedy: { speedMultiplier: 1.5, forceDecay: 0.9985, healthBonus: 10, weight: 100 },
  tanky: { speedMultiplier: 0.65, forceDecay: 0.994, healthBonus: 11, weight: 115 },
  balanced: { speedMultiplier: 1.0, forceDecay: 0.996, healthBonus: 12, weight: 110 }
}

export const SMASHER_TOP_UPGRADE: Record<TopPartId, { damage: number; defense: number; hp: number }> = {
  star: { damage: 0.16, defense: 0.03, hp: 1 },
  triangle: { damage: 0.08, defense: 0.05, hp: 2 },
  round: { damage: 0.04, defense: 0.08, hp: 4 },
  quadratic: { damage: 0.06, defense: 0.06, hp: 3 },
  cushioned: { damage: 0.04, defense: 0.10, hp: 5 },
  piercer: { damage: 0.11, defense: 0.03, hp: 1 }
}

export const SMASHER_BOTTOM_UPGRADE: Record<BottomPartId, { speed: number; decay: number; hp: number }> = {
  speedy: { speed: 0.065, decay: 0.00015, hp: 1.75 },
  tanky: { speed: 0.025, decay: 0.00020, hp: 2.75 },
  balanced: { speed: 0.04, decay: 0.00018, hp: 2 }
}

export const SMASHER_TUNING = {
  /** Exponent on a profile's weight multiplier (was 1). Weight enters a hit
   *  twice, so a 1.3× profile weight used to be a 1.7× damage trade — the
   *  biggest single lever of a profile; at 0.5 it is 1.3×. */
  profileWeightExp: 0.5
}

// ─── Stats Computation ───────────────────────────────────────────────────────

const BASE_HP = 20

export const computeStats = (
  config: SpinnerConfig,
  topLevel = 0,
  bottomLevel = 0
): SpinnerStats => {
  const top = TOP_PARTS[config.topPartId]
  const bottom = BOTTOM_PARTS[config.bottomPartId]

  // A smasher's unique profile scales its archetype's (smasher-tuned) part
  // stats; force decay (how long a launch keeps rolling) stays the
  // archetype's own. Part-only configs read the legacy tables.
  const prof = isSmasherId(config.smasherId) ? SMASHERS[config.smasherId].profile : null
  const t = prof ? SMASHER_TOP_PARTS[config.topPartId] : top
  const b = prof ? SMASHER_BOTTOM_PARTS[config.bottomPartId] : bottom
  const tb = prof ? SMASHER_TOP_UPGRADE[config.topPartId] : TOP_UPGRADE_BONUS[config.topPartId]
  const bb = prof ? SMASHER_BOTTOM_UPGRADE[config.bottomPartId] : BOTTOM_UPGRADE_BONUS[config.bottomPartId]
  // Smashers past level 30: stat gains taper (smasherUpgradeLevel) and force
  // decay stops growing, so a very deep level is strong but never invulnerable.
  const tl = prof ? smasherUpgradeLevel(topLevel) : topLevel
  const bl = prof ? smasherUpgradeLevel(bottomLevel) : bottomLevel
  const dl = prof ? Math.min(bottomLevel, SMASHER_TAPER_LEVEL - 1) : bottomLevel
  return {
    maxHp: (BASE_HP + t.healthBonus + b.healthBonus + tb.hp * tl + bb.hp * bl) * (prof?.hp ?? 1),
    totalWeight: b.weight * (prof ? prof.weight ** SMASHER_TUNING.profileWeightExp : 1),
    damageMultiplier: (t.damageMultiplier + tb.damage * tl) * (prof?.damage ?? 1),
    defenseMultiplier: (t.defenseMultiplier + tb.defense * tl) * (prof?.defense ?? 1),
    speedMultiplier: (b.speedMultiplier + bb.speed * bl) * (prof?.speed ?? 1),
    forceDecay: b.forceDecay + bb.decay * dl,
    top,
    bottom
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const TEAM_KEY = 'smashers_player_team'
// COINS_KEY imported from `@/keys` at the top of this file (single source of truth shared with SaveMergePolicy).
const FIRST_WIN_KEY = 'smashers_first_win'

// The team is stored as smasher configs: the picks for team slots 1 … 3 (how
// many of them fight is the team size, `useTeamSize`). Only `smasherId` is load-bearing:
// level and parts are refilled from the roster at battle time
// (`useSmashers.teamConfigs`), so a stale level in this key can never matter.
export const DEFAULT_TEAM_SMASHERS: readonly SmasherId[] = ['bramble', 'thumper']

const DEFAULT_TEAM: SpinnerConfig[] = DEFAULT_TEAM_SMASHERS.map(id => smasherConfig(id, 1))

/** A stored team entry as a smasher config; a legacy part-only entry becomes
 *  the smasher of its parts. Duplicate smashers are not allowed in a team. */
const toSmasherEntry = (c: Partial<SpinnerConfig>): SpinnerConfig | null => {
  if (!c || typeof c !== 'object') return null
  if (isSmasherId(c.smasherId)) return smasherConfig(c.smasherId, 1, c.modelId)
  if (typeof c.topPartId === 'string' && typeof c.bottomPartId === 'string') {
    return smasherConfig(smasherForParts(c.topPartId, c.bottomPartId), 1, c.modelId)
  }
  return null
}

const loadStoredTeam = (): SpinnerConfig[] => {
  try {
    const raw = localStorage.getItem(TEAM_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length >= 1) {
        const seen = new Set<string>()
        const team: SpinnerConfig[] = []
        for (const entry of parsed) {
          const cfg = toSmasherEntry(entry)
          if (!cfg || seen.has(cfg.smasherId!)) continue
          seen.add(cfg.smasherId!)
          team.push(cfg)
        }
        // One pick is enough; slots without a pick are padded at battle time
        // (`useSmashers.fieldTeam`).
        if (team.length >= 1) return team.slice(0, MAX_TEAM_SIZE)
      }
    }
  } catch { /* fall through */
  }
  return DEFAULT_TEAM.map(c => ({ ...c }))
}

const loadStoredCoins = (): number => {
  try {
    const raw = localStorage.getItem(COINS_KEY)
    if (raw) return parseInt(raw, 10) || 0
  } catch { /* fall through */
  }
  return 0
}

const loadStoredDiamonds = (): number => {
  try {
    const raw = localStorage.getItem(DIAMONDS_KEY)
    if (raw) return parseInt(raw, 10) || 0
  } catch { /* fall through */
  }
  return 0
}

// ─── Module-Level Singleton State ────────────────────────────────────────────

const playerTeam: Ref<SpinnerConfig[]> = ref(loadStoredTeam())
const coins: Ref<number> = ref(loadStoredCoins())
const diamonds: Ref<number> = ref(loadStoredDiamonds())
const hasFirstWin: Ref<boolean> = ref(localStorage.getItem(FIRST_WIN_KEY) === '1')

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  playerTeam.value = loadStoredTeam()
  coins.value = loadStoredCoins()
  diamonds.value = loadStoredDiamonds()
  hasFirstWin.value = localStorage.getItem(FIRST_WIN_KEY) === '1'
})

// ─── Public API ──────────────────────────────────────────────────────────────

const saveTeam = (team: SpinnerConfig[]) => {
  playerTeam.value = team.map(c => ({ ...c }))
  localStorage.setItem(TEAM_KEY, JSON.stringify(team))
}

const addCoins = (amount: number) => {
  coins.value += amount
  localStorage.setItem(COINS_KEY, coins.value.toString())
}

/** Grant (or, with a negative amount, spend) premium diamonds. Clamped at 0
 *  so a spend can never drive the balance negative.
 *
 *  ON SINGLE-CURRENCY BUILDS THIS PAYS COINS INSTEAD. Poki's monetization
 *  policy allows exactly one currency, so the diamond balance is never
 *  touched there and every grant — battle-pass tier,
 *  roulette jackpot, rewarded-ad payout, dev cheat — converts at
 *  `DIAMOND_COIN_VALUE`. Routing it here rather than at the five call
 *  sites is what makes the collapse total: a placement added later gets
 *  the conversion without knowing the rule exists.
 *
 *  Spends (negative amounts) convert too, so a diamond-priced item stays
 *  buyable at its coin-equivalent price. The only such item today is a
 *  background skin, and `useBgSkins` checks affordability against the
 *  right balance before calling this — see `buyBgSkinWithDiamonds`. */
const addDiamonds = (amount: number) => {
  if (isSingleCurrency) {
    // Clamp here, not in `addCoins`. This function's contract is "a spend can
    // never drive the balance negative", and that has to hold whichever
    // currency is backing it — but `addCoins` is also the normal coin-spend
    // path (`buyBgSkinWithCoins` and friends check affordability first), and
    // silently clamping THAT would hide a real bug rather than prevent one.
    const delta = diamondsToCoins(amount)
    addCoins(delta < 0 ? Math.max(delta, -coins.value) : delta)
    return
  }
  diamonds.value = Math.max(0, diamonds.value + amount)
  localStorage.setItem(DIAMONDS_KEY, diamonds.value.toString())
}

const markFirstWin = () => {
  hasFirstWin.value = true
  localStorage.setItem(FIRST_WIN_KEY, '1')
}

const useSpinnerConfig = () => ({
  playerTeam,
  coins,
  diamonds,
  hasFirstWin,
  saveTeam,
  addCoins,
  addDiamonds,
  markFirstWin
})

export default useSpinnerConfig
