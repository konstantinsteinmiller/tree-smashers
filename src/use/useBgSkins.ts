import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isSingleCurrency, diamondsToCoins } from '@/use/useCurrency'
import { saveDataVersion } from '@/use/useSaveStatus'

// ─── Background skins ────────────────────────────────────────────────────────
//
// Cosmetic arena backgrounds (the surface drawn behind the arena, classically
// `bg-tile_400x400.webp`). Acquired with coins OR diamonds, or via the diamond
// IAP shop. The selected skin applies to the canvas immediately.
//
// The 6 premium skins ship as cool GRADIENT PLACEHOLDERS for now — real artwork
// will be dropped in later. To use a real image for a skin, set its `img` to the
// asset path (e.g. 'images/bg/bg-skin-aurora_400x400.webp'); the canvas tiles it
// when it loads and otherwise falls back to the gradient. Until then we leave
// `img` unset so no 404s are logged.

export type BgSkinTier = 0 | 1 | 2 | 3 // 0 = default / free

export interface BgSkinDef {
  id: string
  tier: BgSkinTier
  /** Coin price (0 for the free default). */
  coinCost: number
  /** Diamond price (0 for the free default). */
  diamondCost: number
  /** Optional tileable artwork path (base-url-relative). Unset → gradient. */
  img?: string
  /** Gradient placeholder stops — also the modal swatch. */
  colors: [string, string, string]
}

export const DEFAULT_BG_SKIN_ID = 'classic'

export const BG_SKINS: BgSkinDef[] = [
  // Free default — the classic tiled background.
  {
    id: 'classic', tier: 0, coinCost: 0, diamondCost: 0,
    img: 'images/bg/bg-tile_400x400.webp',
    colors: ['#0d1117', '#161b22', '#0d1117']
  },
  // ── Tier 1 — 15k coins / 10 diamonds ──────────────────────────────────────
  // First three premium slots now ship real seamless/tileable artwork (the
  // canvas tiles `img`; the gradient `colors` remain the load-time fallback
  // and the modal swatch when the image hasn't decoded yet).
  {
    id: 'aurora', tier: 1, coinCost: 15000, diamondCost: 5,
    img: 'images/bg/bg-tile-beyblade_800x436.webp',
    colors: ['#06251b', '#1f9e6e', '#56ffc8']
  },
  {
    id: 'ember', tier: 1, coinCost: 15000, diamondCost: 5,
    img: 'images/bg/bg-tile-brainrot-desaturated_800x436.webp',
    colors: ['#2a0a05', '#b83a16', '#ff8a2a']
  },
  {
    id: 'fidget', tier: 1, coinCost: 15000, diamondCost: 5,
    img: 'images/bg/bg-tile-fidget_800x436.webp',
    colors: ['#101826', '#3b7a99', '#8fe0ff']
  },
  // ── Tier 2 — 30k coins / 20 diamonds ──────────────────────────────────────
  {
    id: 'nebula', tier: 2, coinCost: 30000, diamondCost: 10,
    img: 'images/bg/bg-tile-brainrot_800x436.webp',
    colors: ['#1a0838', '#7a1fc4', '#c87bff']
  },
  {
    id: 'circuit', tier: 2, coinCost: 50000, diamondCost: 10,
    img: 'images/bg/bg-tile-techno-magic_800x436.webp',
    colors: ['#04161a', '#0f7f96', '#33e6ff']
  },
  // ── Tier 3 — 100k coins / 75 diamonds (the most awesome) ──────────────────
  {
    id: 'cosmos', tier: 3, coinCost: 100000, diamondCost: 10,
    img: 'images/bg/bg-tile-steampunk_800x436.webp',
    colors: ['#05010f', '#243a8c', '#9fc3ff']
  },
  {
    id: 'prism', tier: 3, coinCost: 100000, diamondCost: 15,
    img: 'images/bg/bg-tile-kpop_800x436.webp',
    colors: ['#3a0a4a', '#e0247f', '#ffd24a']
  }
]

const OWNED_KEY = 'smashers_bg_skins_owned'
const SELECTED_KEY = 'smashers_bg_skin_selected'

const loadOwned = (): Set<string> => {
  const owned = new Set<string>([DEFAULT_BG_SKIN_ID]) // default always owned
  try {
    const raw = localStorage.getItem(OWNED_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) for (const id of arr) if (typeof id === 'string') owned.add(id)
    }
  } catch { /* fall through */
  }
  return owned
}

const loadSelected = (): string => {
  try {
    const raw = localStorage.getItem(SELECTED_KEY)
    if (raw && BG_SKINS.some(s => s.id === raw)) return raw
  } catch { /* fall through */
  }
  return DEFAULT_BG_SKIN_ID
}

const ownedBgSkins: Ref<Set<string>> = ref(loadOwned())
const selectedBgSkinId: Ref<string> = ref(loadSelected())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  ownedBgSkins.value = loadOwned()
  selectedBgSkinId.value = loadSelected()
})

// Persist owned WITHOUT the always-owned default to keep the payload tiny.
const saveOwned = () =>
  localStorage.setItem(OWNED_KEY, JSON.stringify([...ownedBgSkins.value].filter(id => id !== DEFAULT_BG_SKIN_ID)))
const saveSelected = () => localStorage.setItem(SELECTED_KEY, selectedBgSkinId.value)

export const getBgSkin = (id: string): BgSkinDef => BG_SKINS.find(s => s.id === id) ?? BG_SKINS[0]!
export const isBgSkinOwned = (id: string): boolean => ownedBgSkins.value.has(id)

/** The currently equipped skin — read by the canvas renderer each frame. */
export const selectedBgSkin = computed(() => getBgSkin(selectedBgSkinId.value))

const selectBgSkin = (id: string) => {
  if (!isBgSkinOwned(id)) return
  selectedBgSkinId.value = id
  saveSelected()
}

const grantBgSkin = (id: string) => {
  if (ownedBgSkins.value.has(id)) return
  ownedBgSkins.value = new Set([...ownedBgSkins.value, id])
  saveOwned()
}

/** Buy + auto-equip with coins. Returns false if already owned or unaffordable. */
const buyBgSkinWithCoins = (id: string): boolean => {
  const def = getBgSkin(id)
  if (def.tier === 0 || isBgSkinOwned(id)) return false
  const { coins, addCoins } = useSpinnerConfig()
  if (coins.value < def.coinCost) return false
  addCoins(-def.coinCost)
  grantBgSkin(id)
  selectBgSkin(id)
  return true
}

/**
 * Buy + auto-equip with diamonds. Returns false if already owned or
 * unaffordable.
 *
 * On a single-currency build the price is charged in COINS at the diamond
 * rate, and affordability is checked against the coin balance — otherwise
 * the check would read a diamond balance that is permanently 0 there and
 * every purchase would refuse.
 *
 * Defensive rather than load-bearing today: Poki also runs with
 * `VITE_APP_FEATURE_BG_SKINS=false`, so this path is unreachable on the
 * only single-currency build that exists. It is written anyway because the
 * failure mode if the flag is ever flipped is silent — a shop whose buttons
 * simply never work.
 */
const buyBgSkinWithDiamonds = (id: string): boolean => {
  const def = getBgSkin(id)
  if (def.tier === 0 || isBgSkinOwned(id)) return false
  const { coins, diamonds, addDiamonds } = useSpinnerConfig()
  const balance = isSingleCurrency ? coins.value : diamonds.value
  const price = isSingleCurrency ? diamondsToCoins(def.diamondCost) : def.diamondCost
  if (balance < price) return false
  // `addDiamonds` performs the conversion itself, so it always takes the
  // diamond-denominated amount.
  addDiamonds(-def.diamondCost)
  grantBgSkin(id)
  selectBgSkin(id)
  return true
}

const useBgSkins = () => ({
  bgSkins: BG_SKINS,
  ownedBgSkins,
  selectedBgSkinId,
  selectedBgSkin,
  isBgSkinOwned,
  getBgSkin,
  selectBgSkin,
  buyBgSkinWithCoins,
  buyBgSkinWithDiamonds
})

export default useBgSkins
