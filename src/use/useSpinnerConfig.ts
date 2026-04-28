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
import { COINS_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'
import { TOP_UPGRADE_BONUS, BOTTOM_UPGRADE_BONUS } from '@/use/useSpinnerCampaign'

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

  return {
    maxHp: BASE_HP + top.healthBonus + bottom.healthBonus + tb.hp * topLevel + bb.hp * bottomLevel,
    totalWeight: bottom.weight,
    damageMultiplier: top.damageMultiplier + tb.damage * topLevel,
    defenseMultiplier: top.defenseMultiplier + tb.defense * topLevel,
    speedMultiplier: bottom.speedMultiplier + bb.speed * bottomLevel,
    forceDecay: bottom.forceDecay + bb.decay * bottomLevel,
    top,
    bottom
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const TEAM_KEY = 'spinner_player_team'
// COINS_KEY imported from `@/keys` at the top of this file (single source of truth shared with SaveMergePolicy).
const FIRST_WIN_KEY = 'spinner_first_win'

const DEFAULT_TEAM: SpinnerConfig[] = [
  { topPartId: 'star', bottomPartId: 'balanced' },
  { topPartId: 'round', bottomPartId: 'balanced' }
]

const loadStoredTeam = (): SpinnerConfig[] => {
  try {
    const raw = localStorage.getItem(TEAM_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed
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

// ─── Module-Level Singleton State ────────────────────────────────────────────

const playerTeam: Ref<SpinnerConfig[]> = ref(loadStoredTeam())
const coins: Ref<number> = ref(loadStoredCoins())
const hasFirstWin: Ref<boolean> = ref(localStorage.getItem(FIRST_WIN_KEY) === '1')

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  playerTeam.value = loadStoredTeam()
  coins.value = loadStoredCoins()
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

const markFirstWin = () => {
  hasFirstWin.value = true
  localStorage.setItem(FIRST_WIN_KEY, '1')
}

const useSpinnerConfig = () => ({
  playerTeam,
  coins,
  hasFirstWin,
  saveTeam,
  addCoins,
  markFirstWin
})

export default useSpinnerConfig
