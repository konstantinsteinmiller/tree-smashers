// The newest 4 skins of every top part (the 2026-09 expansion):
//   • on a build WITH rewarded ads they are not sold for coins — ONE
//     completed rewarded ad unlocks one in the skin shop;
//   • on a build WITHOUT rewarded ads the ad button is hidden and they sell
//     for 3x the special-skin coin price.
// The reward systems — Skin Chest, roulette wheel, Battle Pass, Daily
// Rewards — keep handing them out, and a player who bought one with coins
// before the rule keeps it. Progress saved under the old 3-ad rule settles
// into ownership.
//
// `useUser` is imported FIRST before useModels / useBattlePass / useSkinChest:
// they sit on the useMatch↔useModels↔useUser import cycle.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AD_UNLOCK_SKINS,
  SKIN_AD_UNLOCK_ADS,
  AD_SKIN_COIN_COST,
  SPECIAL_SKIN_COST,
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  isAdUnlockSkin,
  isCoinPurchasable,
  skinCost,
  getOfferableSkinPool,
  isEarnOnlySkin,
  type SpinnerModelId
} from '@/data/skinCatalog'
import type { TopPartId } from '@/types/spinner'

/** The expansion = the last 4 entries of every top part's list, not counting
 *  the earn-only boss trophies appended after it (never sold, never ad-unlocked). */
const newestFourPerTop = (): { top: TopPartId, id: SpinnerModelId }[] =>
  (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
    .flatMap(([top, ids]) => ids.filter(id => !isEarnOnlySkin(id)).slice(-4).map(id => ({ top, id })))

const freshImport = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  const models = await import('@/use/useModels')
  const bp = await import('@/use/useBattlePass')
  const chest = await import('@/use/useSkinChest')
  return { models, bp, chest }
}

const modalSrc = () =>
  readFileSync(resolve(__dirname, '../src/components/organisms/SpinnerConfigModal.vue'), 'utf8')

beforeEach(() => {
  localStorage.clear()
})

describe('ad-unlock skins — catalog', () => {
  it('are exactly the newest 4 skins of every top part', () => {
    const expected = newestFourPerTop().map(s => s.id)
    expect(expected.length).toBe(24)
    expect([...AD_UNLOCK_SKINS].sort()).toEqual([...expected].sort())
  })

  it('ONE rewarded ad unlocks a skin', () => {
    expect(SKIN_AD_UNLOCK_ADS).toBe(1)
  })

  it('ad build: not coin-purchasable, while every older skin still is', () => {
    const adIds = new Set<string>(AD_UNLOCK_SKINS)
    for (const id of AD_UNLOCK_SKINS) {
      expect(isCoinPurchasable(id, true), id).toBe(false)
      expect(isAdUnlockSkin(id, true), id).toBe(true)
    }
    for (const ids of Object.values(SKINS_PER_TOP)) {
      for (const id of ids) {
        if (adIds.has(id) || isEarnOnlySkin(id)) continue
        expect(isCoinPurchasable(id, true), id).toBe(true)
        expect(isAdUnlockSkin(id, true), id).toBe(false)
      }
    }
  })

  it('no-ad build: no ad unlock, every skin but the earn-only trophies is coin-purchasable', () => {
    for (const ids of Object.values(SKINS_PER_TOP)) {
      for (const id of ids) {
        expect(isAdUnlockSkin(id, false), id).toBe(false)
        expect(isCoinPurchasable(id, false), id).toBe(!isEarnOnlySkin(id))
      }
    }
  })

  it('cost 3x the special-skin price; other prices are unchanged', () => {
    expect(SPECIAL_SKIN_COST).toBe(1500)
    expect(AD_SKIN_COIN_COST).toBe(SPECIAL_SKIN_COST * 3)
    for (const id of AD_UNLOCK_SKINS) expect(skinCost(id), id).toBe(4500)
    expect(skinCost('rainbow')).toBe(SPECIAL_SKIN_COST)
    expect(skinCost('ice')).toBe(300)
  })

  it('stay regular skins, so every free-reward pool still offers them', () => {
    const pool = new Set(getOfferableSkinPool(() => false))
    for (const id of AD_UNLOCK_SKINS) {
      expect(SPECIAL_SKINS.has(id), `${id} must not be special`).toBe(false)
      expect(pool.has(id), `${id} not offerable`).toBe(true)
    }
  })
})

describe('HAS_REWARDED_ADS — build-time gate', () => {
  const flagWith = async (env: Record<string, string>): Promise<boolean> => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.resetModules()
    return (await import('@/platforms/rewardedAdsBuild')).HAS_REWARDED_ADS
  }
  const off = {
    VITE_APP_CRAZY_WEB: '', VITE_APP_CRAZY_GAMES_FULL_RELEASE: '', VITE_APP_GAME_DISTRIBUTION: '',
    VITE_APP_PLAYGAMA: '', VITE_APP_POKI: '', VITE_APP_NATIVE: '', VITE_APP_SHOW_MEDIATOR_ADS: ''
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is false on a build without an ad provider (itch, Glitch, GamePix, Y8, web, dev)', async () => {
    expect(await flagWith(off)).toBe(false)
    expect(await flagWith({ ...off, VITE_APP_ITCH: 'true' })).toBe(false)
    expect(await flagWith({ ...off, VITE_APP_GAMEPIX: 'true' })).toBe(false)
  })

  it('is true on every build whose resolver returns a real AdProvider', async () => {
    expect(await flagWith({ ...off, VITE_APP_GAME_DISTRIBUTION: 'true' })).toBe(true)
    expect(await flagWith({ ...off, VITE_APP_PLAYGAMA: 'true' })).toBe(true)
    expect(await flagWith({ ...off, VITE_APP_POKI: 'true' })).toBe(true)
    expect(await flagWith({ ...off, VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'true' })).toBe(true)
    expect(await flagWith({ ...off, VITE_APP_NATIVE: 'true', VITE_APP_SHOW_MEDIATOR_ADS: 'true' })).toBe(true)
  })

  it('is false where the provider can never serve an ad (CG basic launch, native without ads)', async () => {
    expect(await flagWith({ ...off, VITE_APP_CRAZY_WEB: 'true' })).toBe(false)
    expect(await flagWith({ ...off, VITE_APP_NATIVE: 'true' })).toBe(false)
  })

  it('is folded from VITE_APP_* literals, never a runtime flags param', () => {
    const src = readFileSync(resolve(__dirname, '../src/platforms/rewardedAdsBuild.ts'), 'utf8')
    expect(src).not.toMatch(/^import /m)
    expect(src).toMatch(/import\.meta\.env\.VITE_APP_POKI === 'true'/)
  })
})

describe('ad-unlock skins — shop paths', () => {
  it('ad build: the coin purchase refuses an ad-unlock skin and grants a legacy one', async () => {
    const { models } = await freshImport()
    expect(models.purchaseSkinWithCoins('star', 'cheetah', true)).toBe(false)
    expect(models.isSkinOwned('star', 'cheetah')).toBe(false)
    expect(models.purchaseSkinWithCoins('star', 'ice', true)).toBe(true)
    expect(models.isSkinOwned('star', 'ice')).toBe(true)
  })

  it('no-ad build: the coin purchase grants an ad-unlock skin', async () => {
    const { models } = await freshImport()
    expect(models.purchaseSkinWithCoins('star', 'cheetah', false)).toBe(true)
    expect(models.isSkinOwned('star', 'cheetah')).toBe(true)
    // Already owned: no second grant (so no second charge).
    expect(models.purchaseSkinWithCoins('star', 'cheetah', false)).toBe(false)
  })

  it('one completed ad unlocks the skin; further watches do nothing', async () => {
    const { models } = await freshImport()
    expect(models.recordSkinAdWatch('piercer', 'lancer')).toBe(true)
    expect(models.isSkinOwned('piercer', 'lancer')).toBe(true)
    expect(models.skinAdProgressFor('lancer')).toBe(0)
    expect(models.recordSkinAdWatch('piercer', 'lancer')).toBe(false)
    // Ownership survives a reload.
    const reloaded = (await freshImport()).models
    expect(reloaded.isSkinOwned('piercer', 'lancer')).toBe(true)
  })

  it('an ad watch never unlocks a coin skin', async () => {
    const { models } = await freshImport()
    for (let i = 0; i < 3; i++) models.recordSkinAdWatch('star', 'ice')
    expect(models.isSkinOwned('star', 'ice')).toBe(false)
  })

  it('a skin already bought with coins before the rule stays owned', async () => {
    localStorage.setItem('spinner_owned_skins', JSON.stringify(['star:cheetah', 'round:kraken']))
    const { models } = await freshImport()
    expect(models.isSkinOwned('star', 'cheetah')).toBe(true)
    expect(models.isSkinOwned('round', 'kraken')).toBe(true)
    models.selectSkin('star', 'cheetah')
    expect(models.getSelectedSkin('star')).toBe('cheetah')
  })
})

describe('ad-unlock skins — legacy 3-ad progress', () => {
  it('opening the shop settles 1–2 saved watches into ownership and clears the store', async () => {
    localStorage.setItem('spinner_skin_ad_progress', JSON.stringify({
      lancer: 2, cheetah: 1, kraken: 0, ice: 2, bogus: 1
    }))
    const { models } = await freshImport()
    const granted = models.settleSkinAdProgress()
    expect([...granted].sort()).toEqual(['cheetah', 'lancer'])
    expect(models.isSkinOwned('piercer', 'lancer')).toBe(true)
    expect(models.isSkinOwned('star', 'cheetah')).toBe(true)
    expect(models.isSkinOwned('round', 'kraken')).toBe(false) // 0 watches: nothing paid
    expect(models.isSkinOwned('star', 'ice')).toBe(false) // coin skin: never via ads
    expect(JSON.parse(localStorage.getItem('spinner_skin_ad_progress')!)).toEqual({})
    // Idempotent, and the grant persisted.
    expect(models.settleSkinAdProgress()).toEqual([])
    expect((await freshImport()).models.isSkinOwned('piercer', 'lancer')).toBe(true)
  })

  it('a skin already owned keeps its entry harmless (dropped, no double grant)', async () => {
    localStorage.setItem('spinner_owned_skins', JSON.stringify(['piercer:lancer']))
    localStorage.setItem('spinner_skin_ad_progress', JSON.stringify({ lancer: 2 }))
    const { models } = await freshImport()
    expect(models.settleSkinAdProgress()).toEqual([])
    expect(JSON.parse(localStorage.getItem('spinner_skin_ad_progress')!)).toEqual({})
  })

  it('without settling, the next ad unlocks a skin with partial progress', async () => {
    localStorage.setItem('spinner_skin_ad_progress', JSON.stringify({ lancer: 2 }))
    const { models } = await freshImport()
    expect(models.recordSkinAdWatch('piercer', 'lancer')).toBe(true)
    expect(models.isSkinOwned('piercer', 'lancer')).toBe(true)
    expect(JSON.parse(localStorage.getItem('spinner_skin_ad_progress')!)).toEqual({})
  })
})

describe('ad-unlock skins — shop UI', () => {
  it('renders the ad button only for isAdUnlockSkin (hidden on no-ad builds), gated on readiness', () => {
    const src = modalSrc()
    expect(src).toMatch(/v-else-if="isAdUnlockSkin\(modelId\)"/)
    expect(src).not.toMatch(/AD_UNLOCK_SKINS\.has/)
    expect(src).toMatch(/:disabled="!isRewardedReady/)
    expect(src).toMatch(/if \(skinAdPending\.value \|\| !isRewardedReady\.value\) return/)
    expect(src).toMatch(/if \(ok\) recordSkinAdWatch/)
    expect(src).toMatch(/movie_128x96\.webp/)
  })

  it('shows no x/N progress counter', () => {
    const src = modalSrc()
    expect(src).not.toMatch(/SKIN_AD_UNLOCK_ADS|skinAdProgressFor/)
  })

  it('falls through to the coin price, charging only on a real grant', () => {
    const src = modalSrc()
    expect(src).toMatch(/purchaseSkinWithCoins\(topId, modelId\)\) addCoins\(-cost\)/)
    expect(src).toMatch(/span\.game-text \{\{ skinCost\(modelId\) \}\}/)
    expect(src).not.toMatch(/\bbuySkin\(/)
  })

  it('settles legacy ad progress when the skin shop opens', () => {
    const src = modalSrc()
    const open = src.slice(src.indexOf('const openSkinPicker'), src.indexOf('const shouldBouncePlus'))
    expect(open).toMatch(/settleSkinAdProgress\(\)/)
  })
})

describe('ad-unlock skins — pre-ad copy', () => {
  const locales = import.meta.glob<Record<string, any>>('../src/i18n/locales/*.ts', { eager: true, import: 'default' })

  it('no locale mentions a step count any more', () => {
    const files = Object.keys(locales)
    expect(files.length).toBeGreaterThanOrEqual(39)
    for (const [file, msgs] of Object.entries(locales)) {
      const intro = msgs.sfc.RewardedAdIntroModal.rewardedIntro.rewardSkinAd as string
      const btn = msgs.sfc.SpinnerConfigModal.watchAdsToUnlock as string
      for (const s of [intro, btn]) {
        expect(typeof s, file).toBe('string')
        expect(s.trim().length, file).toBeGreaterThan(0)
        expect(s, file).not.toMatch(/\{current\}|\{total\}/)
      }
    }
  })
})

describe('ad-unlock skins — reward systems still grant them', () => {
  const ownAllButAdSkins = (): string[] =>
    (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
      .flatMap(([top, ids]) => ids.filter(id => !AD_UNLOCK_SKINS.has(id)).map(id => `${top}:${id}`))

  it('Skin Chest grants an ad-unlock skin once the coin skins are all owned', async () => {
    localStorage.setItem('spinner_owned_skins', JSON.stringify(ownAllButAdSkins()))
    const { models, chest } = await freshImport()
    const granted = chest.collectSkinChest()
    expect(granted).not.toBeNull()
    expect(AD_UNLOCK_SKINS.has(granted!.modelId)).toBe(true)
    expect(models.isSkinOwned(granted!.topPartId, granted!.modelId)).toBe(true)
  })

  it('Battle Pass grants an offered ad-unlock skin', async () => {
    const { models, bp } = await freshImport()
    const pass = bp.default()
    for (let i = 0; i < 40; i++) pass.awardCampaignWin()
    const res = pass.claimStage(10, 'ninja')
    expect(res?.skin).toBe('ninja')
    expect(models.isSkinOwned('star', 'ninja')).toBe(true)
  })

  it('the roulette wheel draws its skin slots without excluding ad-unlock skins', () => {
    // The wheel builds its pool from SKINS_PER_TOP minus owned, split only by
    // SPECIAL_SKINS (see rouletteWheel.test.ts for the pinned draw logic).
    const src = readFileSync(resolve(__dirname, '../src/components/organisms/RouletteWheel.vue'), 'utf8')
    expect(src).toMatch(/Object\.entries\(SKINS_PER_TOP\)/)
    expect(src).not.toMatch(/AD_UNLOCK_SKINS|isCoinPurchasable|isAdUnlockSkin/)
  })
})
