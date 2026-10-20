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
import { SMASHERS, isSmasherId, smasherConfig, smasherForParts, type SmasherId } from '@/data/smasherCatalog'

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

// ─── Stats Computation ───────────────────────────────────────────────────────

const BASE_HP = 20

export const computeStats = (
  config: SpinnerConfig,
  topLevel = 0,
  bottomLevel = 0
): SpinnerStats => {
  const top = TOP_PARTS[config.topPartId]
  const bottom = BOTTOM_PARTS[config.bottomPartId]

  const tb = TOP_UPGRADE_BONUS[config.topPartId]
  const bb = BOTTOM_UPGRADE_BONUS[config.bottomPartId]

  // A smasher's unique profile scales its archetype's part stats; force
  // decay (how long a launch keeps rolling) stays the archetype's own.
  const prof = isSmasherId(config.smasherId) ? SMASHERS[config.smasherId].profile : null
  return {
    maxHp: (BASE_HP + top.healthBonus + bottom.healthBonus + tb.hp * topLevel + bb.hp * bottomLevel) * (prof?.hp ?? 1),
    totalWeight: bottom.weight * (prof?.weight ?? 1),
    damageMultiplier: (top.damageMultiplier + tb.damage * topLevel) * (prof?.damage ?? 1),
    defenseMultiplier: (top.defenseMultiplier + tb.defense * topLevel) * (prof?.defense ?? 1),
    speedMultiplier: (bottom.speedMultiplier + bb.speed * bottomLevel) * (prof?.speed ?? 1),
    forceDecay: bottom.forceDecay + bb.decay * bottomLevel,
    top,
    bottom
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const TEAM_KEY = 'smashers_player_team'
// COINS_KEY imported from `@/keys` at the top of this file (single source of truth shared with SaveMergePolicy).
const FIRST_WIN_KEY = 'smashers_first_win'

// The team is stored as smasher configs. Only `smasherId` is load-bearing:
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
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const seen = new Set<string>()
        const team: SpinnerConfig[] = []
        for (const entry of parsed) {
          const cfg = toSmasherEntry(entry)
          if (!cfg || seen.has(cfg.smasherId!)) continue
          seen.add(cfg.smasherId!)
          team.push(cfg)
        }
        if (team.length >= 2) return team
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
