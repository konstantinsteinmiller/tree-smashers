// Premium smashers (Tuskar onwards) + "every skin is one rewarded ad" —
// owner rule of 2026-10-21. Pinned here:
//   • the legendary list (Tuskar … Blubbo, unlock order = catalog order) and
//     the coin fallback prices;
//   • the platform capability matrix: which builds show the MovieIcon
//     "Unlock" (one rewarded ad) and which the coin price, for skins AND
//     premium smashers — and the runtime fallback (ad blocker, a portal
//     without rewarded support) to coins;
//   • the unlock happens ONLY after a completed ad: completed / skipped /
//     SDK error / not ready / PvP, with a mock SDK behind the real useAds;
//   • save persistence (reload, cloud re-read, progress reset) and the
//     migration: a save from before the rule keeps every smasher it had;
//   • earlier smashers keep the stage-only unlock.
//
// `useUser` is imported FIRST (useMatch ↔ useModels ↔ useUser import cycle).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BASE_SMASHER_IDS, SMASHER_IDS, SMASHERS, isReleasedSmasher, smasherConfig, type SmasherId } from '@/data/smasherCatalog'
import {
  FIRST_PREMIUM_SMASHER,
  PREMIUM_SMASHER_IDS,
  PREMIUM_SMASHER_UNLOCK_ADS,
  isPremiumSmasher,
  premiumSmasherCoinPrice
} from '@/data/premiumSmashers'
import { smasherRarity } from '@/data/smasherRarity'
import { SKINS_PER_TOP, TROPHY_SKINS, isAdUnlockSkin, isCoinPurchasable, skinCost, type SpinnerModelId } from '@/data/skinCatalog'
import { PREMIUM_SMASHERS_KEY } from '@/keys'

// ─── Mock SDK behind the REAL useAds ────────────────────────────────────────
// `sdk.show` decides the outcome of the next rewarded ad: completed (true),
// skipped / no-fill (false) or an SDK error (throws).
const sdk = {
  ready: ref(true),
  blocked: ref(false),
  supported: ref(true),
  show: vi.fn(async (): Promise<boolean> => true)
}
vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => ({
    name: 'mock-sdk',
    isReady: sdk.ready,
    isRewardedReady: sdk.ready,
    isInterstitialReady: ref(false),
    isAdsBlocked: sdk.blocked,
    isRewardedSupported: sdk.supported,
    init: async () => {
    },
    showRewardedAd: () => sdk.show(),
    showMidgameAd: async () => {
    }
  })
}))
// The interstitial cadence: a completed rewarded ad is the ad break (B6).
const noteRewardedAdCompleted = vi.fn()
vi.mock('@/use/midgameCadence', async (orig) => ({
  ...(await orig<typeof import('@/use/midgameCadence')>()),
  noteRewardedAdCompleted: () => noteRewardedAdCompleted()
}))
vi.mock('/images/icons/movie_128x96.webp', () => ({ default: 'movie.webp' }))
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound: () => null }) }))

const BUILD_OFF: Record<string, string> = {
  VITE_APP_CRAZY_WEB: '', VITE_APP_CRAZY_GAMES_FULL_RELEASE: '', VITE_APP_GAME_DISTRIBUTION: '',
  VITE_APP_PLAYGAMA: '', VITE_APP_YOUTUBE: '', VITE_APP_POKI: '', VITE_APP_GAME_MONETIZE: '',
  VITE_APP_NATIVE: '', VITE_APP_SHOW_MEDIATOR_ADS: '', VITE_APP_ITCH: '', VITE_APP_GLITCH: '',
  VITE_APP_GAMEPIX: '', VITE_APP_Y8: '', VITE_APP_WAVEDASH: ''
}
/** Builds that unlock with ONE rewarded ad. */
const AD_BUILDS: Array<[string, Record<string, string>]> = [
  ['CrazyGames full release', { VITE_APP_CRAZY_WEB: 'true', VITE_APP_CRAZY_GAMES_FULL_RELEASE: 'true' }],
  ['Poki', { VITE_APP_POKI: 'true' }],
  ['Playgama', { VITE_APP_PLAYGAMA: 'true' }],
  ['YouTube Playables (the Playgama archive)', { VITE_APP_PLAYGAMA: 'true', VITE_APP_YOUTUBE: 'true' }],
  ['GameMonetize', { VITE_APP_GAME_MONETIZE: 'true' }],
  ['GameDistribution', { VITE_APP_GAME_DISTRIBUTION: 'true' }],
  ['native LevelPlay (18+)', { VITE_APP_NATIVE: 'true', VITE_APP_SHOW_MEDIATOR_ADS: 'true' }]
]
/** Builds that keep the coin prices. */
const COIN_BUILDS: Array<[string, Record<string, string>]> = [
  ['CrazyGames basic launch', { VITE_APP_CRAZY_WEB: 'true' }],
  ['itch', { VITE_APP_ITCH: 'true' }],
  ['Glitch', { VITE_APP_GLITCH: 'true' }],
  ['GamePix', { VITE_APP_GAMEPIX: 'true' }],
  ['Y8', { VITE_APP_Y8: 'true' }],
  ['WaveDash', { VITE_APP_WAVEDASH: 'true' }],
  ['native without ads', { VITE_APP_NATIVE: 'true' }],
  ['plain web / dev', {}]
]

const setBuild = (env: Record<string, string>): void => {
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries({ ...BUILD_OFF, ...env })) vi.stubEnv(k, v)
}

/** Fresh module graph with a settled save (as after SaveManager.init()). */
const fresh = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  const status = await import('@/use/useSaveStatus')
  status.hydrateState.value = 'success-with-data'
  const premium = await import('@/use/premiumSmashers')
  const smashers = await import('@/use/useSmashers')
  const ads = await import('@/use/useAds')
  return { status, premium, smashers, ads }
}

const i18n = () =>
  createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

/** The team modal at `bestStage`, Tuskar selected. */
const mountModal = async (bestStage: number, coins = 0, opts: { adsAllowed?: boolean } = {}) => {
  localStorage.setItem('smashers_coins', String(coins))
  const env = await fresh()
  // A player under the new rule: the record followed every stage.
  for (let s = 1; s <= bestStage; s++) env.premium.settlePremiumSmashers(s)
  const { default: SmasherTeamModal } = await import('@/components/organisms/SmasherTeamModal.vue')
  const config = (await import('@/use/useSpinnerConfig')).default()
  const w = mount(SmasherTeamModal, {
    props: {
      modelValue: true,
      initialTeam: [smasherConfig('bramble', 1), smasherConfig('thumper', 1)],
      bestStage,
      ...(opts.adsAllowed === undefined ? {} : { adsAllowed: opts.adsAllowed })
    },
    global: { plugins: [i18n()], stubs: { teleport: true, BGSkinButton: true } },
    attachTo: document.body
  })
  await flushPromises()
  await w.find('[data-testid="roster-tuskar"]').trigger('click')
  return { w, config, ...env }
}

const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  sdk.ready.value = true
  sdk.blocked.value = false
  sdk.supported.value = true
  sdk.show.mockReset()
  sdk.show.mockImplementation(async () => true)
  noteRewardedAdCompleted.mockClear()
  setBuild(AD_BUILDS[1]![1])
})
afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
  document.body.innerHTML = ''
})

// ─── The legendary list and the prices ──────────────────────────────────────

describe('premium smashers — the list', () => {
  const EXPECTED = [
    'tuskar',
    'brock', 'bandit', 'croaky', 'slinky', 'digger', 'snooze', 'pongo', 'pincer', 'rolly', 'prickles', 'newtie', 'gastro',
    'humphrey', 'boxa', 'howler', 'snapjaw', 'leon', 'antlo', 'gronk', 'bambam', 'buford', 'horace', 'wallow', 'rumble',
    'waddles', 'flamenca', 'gulpy', 'paddles', 'inky', 'pinchy', 'puffton', 'nardo', 'fangsy', 'camo', 'curly', 'blubbo'
  ]

  it('the unlock order is the catalog order (sorted by unlock stage)', () => {
    const stages = SMASHER_IDS.map(id => SMASHERS[id].unlockStage)
    expect([...stages].sort((a, b) => a - b)).toEqual(stages)
  })

  it('"from Tuskar onwards": Tuskar (12th base smasher, stage 50) and the 36 after it', () => {
    expect(BASE_SMASHER_IDS.indexOf(FIRST_PREMIUM_SMASHER)).toBe(11)
    expect(SMASHERS.tuskar.unlockStage).toBe(50)
    expect([...PREMIUM_SMASHER_IDS]).toEqual(EXPECTED)
    expect(PREMIUM_SMASHER_IDS.length).toBe(37)
  })

  it('all of them wear the legendary edge; the earlier smashers are not premium', () => {
    for (const id of PREMIUM_SMASHER_IDS) expect(smasherRarity(SMASHERS[id].unlockStage), id).toBe('legendary')
    for (const id of SMASHER_IDS.slice(0, 11)) expect(isPremiumSmasher(id), id).toBe(false)
    // Hootsie (stage 40) is legendary by its edge but BEFORE Tuskar: old rule.
    expect(smasherRarity(SMASHERS.hootsie.unlockStage)).toBe('legendary')
    expect(isPremiumSmasher('hootsie')).toBe(false)
  })

  it('one rewarded ad unlocks one', () => {
    expect(PREMIUM_SMASHER_UNLOCK_ADS).toBe(1)
  })
})

describe('premium smashers — coin fallback prices', () => {
  const PRICES: Record<string, number> = {
    tuskar: 6000, brock: 6500, bandit: 7000, croaky: 7000, slinky: 7500, digger: 7500, snooze: 8000,
    pongo: 8000, pincer: 8500, rolly: 9000, prickles: 9500, newtie: 9500, gastro: 10000,
    humphrey: 10500, boxa: 11000, howler: 11500, snapjaw: 11500, leon: 12000, antlo: 12500, gronk: 12500,
    bambam: 13000, buford: 13000, horace: 13500, wallow: 14000, rumble: 14000,
    waddles: 14500, flamenca: 15000, gulpy: 15000, paddles: 15500, inky: 15500, pinchy: 16000,
    puffton: 16000, nardo: 16500, fangsy: 16500, camo: 17000, curly: 17500, blubbo: 18000
  }

  it('the full price list (round500(3000 + 64 × unlock stage))', () => {
    expect(Object.fromEntries(PREMIUM_SMASHER_IDS.map(id => [id, premiumSmasherCoinPrice(id)]))).toEqual(PRICES)
  })

  it('rise with the unlock stage, in steps of 500, and no earlier smasher has a price', () => {
    const prices = PREMIUM_SMASHER_IDS.map(id => premiumSmasherCoinPrice(id)!)
    for (let i = 1; i < prices.length; i++) expect(prices[i]!).toBeGreaterThanOrEqual(prices[i - 1]!)
    for (const p of prices) expect(p % 500).toBe(0)
    for (const id of SMASHER_IDS.slice(0, 11)) expect(premiumSmasherCoinPrice(id), id).toBeNull()
  })
})

// ─── Platform capability matrix ─────────────────────────────────────────────

describe('platform matrix — rewarded-ad unlock vs coin price', () => {
  it.each(AD_BUILDS)('%s: every shop skin and every premium smasher is ONE rewarded ad', async (_, env) => {
    setBuild(env)
    const { ads } = await fresh()
    const { HAS_REWARDED_ADS } = await import('@/platforms/rewardedAdsBuild')
    expect(HAS_REWARDED_ADS).toBe(true)
    expect(ads.rewardedUnlocksAvailable.value).toBe(true)
    for (const [top, ids] of Object.entries(SKINS_PER_TOP)) {
      for (const id of ids.slice(1)) {
        const trophy = TROPHY_SKINS.has(id)
        expect(isAdUnlockSkin(id, ads.rewardedUnlocksAvailable.value), `${top}:${id}`).toBe(!trophy)
        expect(isCoinPurchasable(id, ads.rewardedUnlocksAvailable.value), `${top}:${id}`).toBe(false)
      }
    }
  })

  it.each(COIN_BUILDS)('%s: no ad unlock — the current coin prices', async (_, env) => {
    setBuild(env)
    const { ads } = await fresh()
    expect(ads.rewardedUnlocksAvailable.value).toBe(false)
    for (const ids of Object.values(SKINS_PER_TOP)) {
      for (const id of ids.slice(1)) {
        expect(isAdUnlockSkin(id, false), id).toBe(false)
        expect(isCoinPurchasable(id, false), id).toBe(!TROPHY_SKINS.has(id))
      }
    }
    // Unchanged prices.
    expect(skinCost('ice')).toBe(300)
    expect(skinCost('rainbow')).toBe(1500)
    expect(skinCost('cheetah')).toBe(4500)
  })

  it('earn-only trophy skins and free defaults are never ad-unlocked, on any build', () => {
    for (const id of TROPHY_SKINS) {
      expect(isAdUnlockSkin(id, true), id).toBe(false)
      expect(isCoinPurchasable(id, true), id).toBe(false)
    }
    for (const ids of Object.values(SKINS_PER_TOP)) expect(isAdUnlockSkin(ids[0] as SpinnerModelId, true)).toBe(false)
  })

  it('runtime: an ad blocker or a portal without rewarded support falls back to coins', async () => {
    const { ads } = await fresh()
    expect(ads.rewardedUnlocksAvailable.value).toBe(true)
    sdk.blocked.value = true
    expect(ads.rewardedUnlocksAvailable.value).toBe(false)
    sdk.blocked.value = false
    sdk.supported.value = false
    expect(ads.rewardedUnlocksAvailable.value).toBe(false)
    sdk.supported.value = true
    // A mere no-fill does NOT switch prices (the button just waits).
    sdk.ready.value = false
    expect(ads.rewardedUnlocksAvailable.value).toBe(true)
  })

  it.each(AD_BUILDS)('%s: the locked Tuskar card offers the MovieIcon unlock', async (_, env) => {
    setBuild(env)
    const { w } = await mountModal(50)
    expect(w.find('[data-testid="roster-unlock-tuskar"]').classes()).toContain('unlock-chip--ad')
    expect(w.find('[data-testid="smasher-unlock-ad"]').exists()).toBe(true)
    expect(w.find('[data-testid="smasher-unlock-coins"]').exists()).toBe(false)
    w.unmount()
  })

  it.each(COIN_BUILDS)('%s: the locked Tuskar card shows its coin price', async (_, env) => {
    setBuild(env)
    const { w } = await mountModal(50)
    const chip = w.find('[data-testid="roster-unlock-tuskar"]')
    expect(chip.classes()).toContain('unlock-chip--coins')
    expect(chip.text()).toContain('6000')
    expect(w.find('[data-testid="smasher-unlock-coins"]').exists()).toBe(true)
    expect(w.find('[data-testid="smasher-unlock-ad"]').exists()).toBe(false)
    w.unmount()
  })
})

// ─── The ad flow ────────────────────────────────────────────────────────────

const clickUnlockAd = async (w: Awaited<ReturnType<typeof mountModal>>['w']) => {
  await w.find('[data-testid="smasher-unlock-ad"] button').trigger('click')
  await tick()
  await flushPromises()
}

describe('premium smasher — unlock only after a COMPLETED rewarded ad', () => {
  it('completed: unlocked, saved, the card flips, the gift reveal shows it; counts as the ad break', async () => {
    const { w, premium, smashers } = await mountModal(50)
    const reveal = await import('@/use/useRewardReveal')
    await clickUnlockAd(w)
    expect(sdk.show).toHaveBeenCalledTimes(1)
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(true)
    expect(smashers.isSmasherRecruited('tuskar', 50)).toBe(true)
    expect(JSON.parse(localStorage.getItem(PREMIUM_SMASHERS_KEY)!).own).toEqual(['tuskar'])
    expect(w.find('[data-testid="roster-tuskar"]').classes()).toContain('is-flipping')
    expect(reveal.currentReveal.value?.items).toEqual([
      expect.objectContaining({ kind: 'smasher', smasherId: 'tuskar', rarity: 'legendary' })
    ])
    expect(noteRewardedAdCompleted).toHaveBeenCalledTimes(1)
    // Now a normal roster member: level chip, put-in-slot buttons.
    expect(w.find('[data-testid="put-in-slot-0"]').exists()).toBe(true)
    w.unmount()
  })

  it('skipped / no-fill: nothing unlocked, "try again" hint, no ad-break credit', async () => {
    sdk.show.mockImplementation(async () => false)
    const { w, premium } = await mountModal(50)
    await clickUnlockAd(w)
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(false)
    expect(w.find('[data-testid="smasher-unlock-hint"]').exists()).toBe(true)
    expect(noteRewardedAdCompleted).not.toHaveBeenCalled()
    // The button stays for another try, and a completed ad then unlocks.
    sdk.show.mockImplementation(async () => true)
    await clickUnlockAd(w)
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(true)
    w.unmount()
  })

  it('SDK error: nothing unlocked, no unhandled rejection', async () => {
    sdk.show.mockImplementation(async () => {
      throw new Error('sdk exploded')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { w, premium } = await mountModal(50)
    await clickUnlockAd(w)
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(false)
    expect(w.find('[data-testid="smasher-unlock-hint"]').exists()).toBe(true)
    warn.mockRestore()
    w.unmount()
  })

  it('not ready: button disabled with the "ad not ready" hint, no SDK call; enables itself once ready', async () => {
    sdk.ready.value = false
    const { w, premium } = await mountModal(50)
    const btn = w.find('[data-testid="smasher-unlock-ad"] button')
    expect(btn.attributes('aria-disabled')).toBe('true')
    expect(w.find('[data-testid="smasher-unlock-hint"]').text()).toBe('adNotReady')
    await clickUnlockAd(w)
    expect(sdk.show).not.toHaveBeenCalled()
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(false)
    sdk.ready.value = true
    await flushPromises()
    expect(w.find('[data-testid="smasher-unlock-ad"] button').attributes('aria-disabled')).toBeUndefined()
    expect(w.find('[data-testid="smasher-unlock-hint"]').exists()).toBe(false)
    await clickUnlockAd(w)
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(true)
    w.unmount()
  })

  it('PvP match: no ad from the team modal ("after the match")', async () => {
    const { w, premium } = await mountModal(50, 0, { adsAllowed: false })
    expect(w.find('[data-testid="smasher-unlock-ad"] button').attributes('aria-disabled')).toBe('true')
    expect(w.find('[data-testid="smasher-unlock-hint"]').text()).toBe('adAfterMatch')
    await clickUnlockAd(w)
    expect(sdk.show).not.toHaveBeenCalled()
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(false)
    w.unmount()
  })

  it('a double tap starts ONE ad', async () => {
    let finish: (v: boolean) => void = () => {}
    sdk.show.mockImplementation(() => new Promise<boolean>((r) => { finish = r }))
    const { w, premium } = await mountModal(50)
    const btn = w.find('[data-testid="smasher-unlock-ad"] button')
    await btn.trigger('click')
    await btn.trigger('click')
    await tick()
    expect(sdk.show).toHaveBeenCalledTimes(1)
    finish(true)
    await flushPromises()
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(true)
    w.unmount()
  })

  it('before its stage: the stage lock, no unlock offered; earlier smashers need no unlock', async () => {
    const { w, smashers } = await mountModal(49)
    expect(w.find('[data-testid="roster-unlock-tuskar"]').exists()).toBe(false)
    expect(w.find('[data-testid="smasher-unlock"]').exists()).toBe(false)
    expect(smashers.isSmasherRecruited('hootsie', 49)).toBe(true)
    expect(smashers.isSmasherRecruited('zippy', 49)).toBe(true)
    w.unmount()
  })
})

describe('premium smasher — coin fallback', () => {
  it('no-ad build: buys for the price, charging only on a real unlock', async () => {
    setBuild({})
    const { w, premium, config } = await mountModal(50, 7000)
    await w.find('[data-testid="smasher-unlock-coins"] button').trigger('click')
    await flushPromises()
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(true)
    expect(config.coins.value).toBe(1000)
    expect(sdk.show).not.toHaveBeenCalled()
    w.unmount()
  })

  it('short of coins: refused, nothing spent', async () => {
    setBuild({})
    const { w, premium, config } = await mountModal(50, 5999)
    await w.find('[data-testid="smasher-unlock-coins"] button').trigger('click')
    expect(premium.isPremiumOwned('tuskar', 50)).toBe(false)
    expect(config.coins.value).toBe(5999)
    w.unmount()
  })

  it('ad build that detected an ad blocker: the coin price instead of the ad', async () => {
    sdk.blocked.value = true
    const { w } = await mountModal(50, 10_000)
    expect(w.find('[data-testid="smasher-unlock-coins"]').exists()).toBe(true)
    expect(w.find('[data-testid="smasher-unlock-ad"]').exists()).toBe(false)
    w.unmount()
  })
})

// ─── Skins: one rewarded ad ─────────────────────────────────────────────────

describe('skins — one rewarded ad for every shop skin (ad build)', () => {
  const openPicker = async () => {
    const { w, ...env } = await mountModal(50)
    await w.find('[data-testid="roster-bramble"]').trigger('click')
    await w.find('[data-testid="skin-open"]').trigger('click')
    await flushPromises()
    return { w, ...env }
  }

  it('a regular and a special skin show the ad button, a completed ad unlocks', async () => {
    const { w } = await openPicker()
    const models = await import('@/use/useModels')
    // 2026-10-23: the picker lists the default + the smasher's ONE own skin. Bramble is a triangle
    // smasher: its skin is `bramble-skin` (one ad on an ad build, 1000 coins otherwise).
    for (const id of ['bramble-skin'] as const) {
      expect(w.find(`[data-testid="skin-ad-${id}"]`).exists(), id).toBe(true)
      await w.find(`[data-testid="skin-ad-${id}"]`).trigger('click')
      await tick()
      await flushPromises()
      expect(models.isSkinOwned('triangle', id), id).toBe(true)
    }
    expect(sdk.show).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('skipped ad: the skin stays locked and the picker says "try again"', async () => {
    sdk.show.mockImplementation(async () => false)
    const { w } = await openPicker()
    const models = await import('@/use/useModels')
    await w.find('[data-testid="skin-ad-bramble-skin"]').trigger('click')
    await tick()
    await flushPromises()
    expect(models.isSkinOwned('triangle', 'bramble-skin')).toBe(false)
    expect(w.find('[data-testid="skin-ad-hint"]').text()).toBe('adNoReward')
    w.unmount()
  })

  it('not ready: disabled with the hint, no SDK call', async () => {
    sdk.ready.value = false
    const { w } = await openPicker()
    expect(w.find('[data-testid="skin-ad-bramble-skin"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="skin-ad-hint"]').text()).toBe('adNotReady')
    expect(sdk.show).not.toHaveBeenCalled()
    w.unmount()
  })
})

// ─── Persistence and migration ──────────────────────────────────────────────

describe('premium ownership — saves and migration', () => {
  it('an unlock survives a reload and a cloud re-read', async () => {
    const a = await fresh()
    a.premium.settlePremiumSmashers(60)
    a.premium.resetPremiumSmashers()
    a.premium.settlePremiumSmashers(1) // a new player…
    for (let s = 2; s <= 60; s++) a.premium.settlePremiumSmashers(s) // …plays to 60
    expect(a.premium.isPremiumUnlockable('tuskar', 60)).toBe(true)
    expect(a.premium.unlockPremiumSmasher('tuskar', 60)).toBe(true)
    expect(a.premium.unlockPremiumSmasher('tuskar', 60)).toBe(false) // once
    const b = await fresh()
    expect(b.premium.isPremiumOwned('tuskar', 60)).toBe(true)
    expect(b.premium.isPremiumOwned('brock', 60)).toBe(false)
    // A cloud hydrate writes another device's record → re-read on the bump.
    localStorage.setItem(PREMIUM_SMASHERS_KEY, JSON.stringify({ v: 1, own: ['tuskar', 'brock'], at: 60 }))
    b.status.saveDataVersion.value++
    await flushPromises()
    expect(b.premium.isPremiumOwned('brock', 60)).toBe(true)
  })

  it('a NEW player who reaches Tuskar\'s stage must unlock it (stage by stage)', async () => {
    const { premium, smashers } = await fresh()
    for (let s = 1; s <= 120; s++) premium.settlePremiumSmashers(s)
    for (const id of PREMIUM_SMASHER_IDS) {
      const reached = SMASHERS[id].unlockStage <= 120
      expect(premium.isPremiumOwned(id, 120), id).toBe(false)
      // release gate: a held-back smasher (Humphrey at 120) is never offered
      expect(premium.isPremiumUnlockable(id, 120), id).toBe(reached && isReleasedSmasher(id))
      expect(smashers.isSmasherRecruited(id, 120), id).toBe(false)
    }
    expect(smashers.recruitedSmashers(120)).toEqual(SMASHER_IDS.slice(0, 11))
  })

  it('migration: a save from before the rule keeps every smasher it had (and nothing more)', async () => {
    localStorage.setItem('smashers_campaign_stage', '120')
    const { premium, smashers } = await fresh()
    // Before the first settle the old rule answers: no locked card flashes up.
    expect(premium.isPremiumOwned('tuskar', 120)).toBe(true)
    const granted = premium.settlePremiumSmashers(120)
    const had = PREMIUM_SMASHER_IDS.filter(id => SMASHERS[id].unlockStage <= 120)
    expect(granted).toEqual(had)
    for (const id of had) expect(smashers.isSmasherRecruited(id, 120), id).toBe(true)
    expect(premium.isPremiumUnlockable('boxa', 125)).toBe(false) // stage 125: after the rule — and held back (release gate)
    expect(JSON.parse(localStorage.getItem(PREMIUM_SMASHERS_KEY)!)).toEqual({ v: 1, own: had, at: 120 })
  })

  it('migration: a stale low stage at boot self-heals once the real save is read', async () => {
    const { premium } = await fresh()
    premium.settlePremiumSmashers(1) // a module ref still at the pre-hydration stage 1
    localStorage.setItem('smashers_campaign_stage', '90') // the real (old-build) save
    premium.settlePremiumSmashers(90)
    expect(premium.isPremiumOwned('tuskar', 90)).toBe(true)
    expect(premium.isPremiumOwned('rolly', 92)).toBe(false) // stage 92: not reached then
  })

  it('migration: an old-build cloud save that wins over a fresh local record carries over', async () => {
    const { premium } = await fresh()
    for (let s = 1; s <= 10; s++) premium.settlePremiumSmashers(s)
    // Hydrate: another device on the OLD build had reached 100.
    premium.settlePremiumSmashers(100)
    expect(premium.isPremiumOwned('tuskar', 100)).toBe(true)
    expect(premium.isPremiumOwned('prickles', 100)).toBe(true)
    expect(premium.isPremiumOwned('newtie', 105)).toBe(false)
  })

  it('never writes against an unsettled save (pending / offline cloud)', async () => {
    localStorage.setItem('smashers_campaign_stage', '80')
    const { premium, status } = await fresh()
    status.hydrateState.value = 'failed-retrying'
    expect(premium.settlePremiumSmashers(80)).toEqual([])
    expect(localStorage.getItem(PREMIUM_SMASHERS_KEY)).toBeNull()
    expect(premium.isPremiumOwned('tuskar', 80)).toBe(true) // old rule meanwhile
    expect(premium.unlockPremiumSmasher('tuskar', 80)).toBe(false)
    status.hydrateState.value = 'success-with-data'
    expect(premium.settlePremiumSmashers(80)).toContain('tuskar')
  })

  it('an unknown / corrupt record is read as a legacy save (never takes anything away)', async () => {
    localStorage.setItem(PREMIUM_SMASHERS_KEY, '{not json')
    localStorage.setItem('smashers_campaign_stage', '60')
    const { premium } = await fresh()
    expect(premium.isPremiumOwned('tuskar', 60)).toBe(true)
    premium.settlePremiumSmashers(60)
    expect(premium.isPremiumOwned('tuskar', 60)).toBe(true)
    const parsed = premium.parsePremiumRecord(JSON.stringify({ own: ['tuskar', 'bramble', 'nope', 'tuskar'], at: 3 }))
    expect(parsed).toEqual({ own: ['tuskar'], at: 3 })
  })

  it('a team pad never fields an unowned premium smasher', async () => {
    const { premium, smashers } = await fresh()
    for (let s = 1; s <= 60; s++) premium.settlePremiumSmashers(s)
    const ids = smashers.fieldTeamIds([], 3, 60)
    for (const id of ids) expect(isPremiumSmasher(id as SmasherId), id).toBe(false)
  })

  it('the record rides the cloud save and survives a progress reset', () => {
    expect(PREMIUM_SMASHERS_KEY.startsWith('smashers_')).toBe(true)
    const reset = readFileSync(resolve(__dirname, '../src/use/useResetProgress.ts'), 'utf8')
    expect(reset).toMatch(/'smashers_premium_smashers',/)
  })

  it('the arena settles the record on every best-stage change and blocks the ad in PvP', () => {
    const arena = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')
    const watcher = arena.slice(arena.indexOf('watch(bestStage, (s) => {'), arena.indexOf('}, { immediate: true })', arena.indexOf('watch(bestStage, (s) => {')))
    expect(watcher).toMatch(/settlePremiumSmashers\(s\)/)
    expect(arena).toMatch(/:ads-allowed="!pvpMode"/)
  })
})

// ─── i18n ───────────────────────────────────────────────────────────────────

describe('premium unlock copy — every locale', () => {
  const locales = import.meta.glob<Record<string, any>>('../src/i18n/locales/*.ts', { eager: true, import: 'default' })
  const KEYS = ['unlock', 'unlockAdAria', 'unlockCoinsAria', 'adNotReady', 'adAfterMatch', 'adNoReward'] as const

  it('39 locales carry the team-modal keys and the rewarded-intro reward', () => {
    expect(Object.keys(locales).length).toBe(39)
    for (const [file, msgs] of Object.entries(locales)) {
      for (const k of KEYS) {
        const v = msgs.sfc.SmasherTeamModal[k]
        expect(typeof v, `${file} ${k}`).toBe('string')
        expect(v.trim().length, `${file} ${k}`).toBeGreaterThan(0)
      }
      expect(msgs.sfc.SmasherTeamModal.unlockAdAria, file).toContain('{name}')
      expect(msgs.sfc.SmasherTeamModal.unlockCoinsAria, file).toMatch(/\{name\}[\s\S]*\{cost\}|\{cost\}[\s\S]*\{name\}/)
      expect(typeof msgs.sfc.RewardedAdIntroModal.rewardedIntro.rewardSmasherAd, file).toBe('string')
    }
  })
})
