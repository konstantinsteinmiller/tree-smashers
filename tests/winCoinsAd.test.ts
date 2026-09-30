// Win-screen "[movie] 3x [coin]" rewarded ad.
//
// Pins: the payout scales with the stage (3x TOTAL = the already-granted base
// + 2x extra), the button exists only on ad builds and only on non-boss win
// screens, it is disabled until an ad is ready and while one plays, a skipped
// ad pays nothing, a double tap pays once, and one screen pays at most once —
// through the normal coin/save path.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let adsBuild = true
const isRewardedReady = ref(true)
let resolveAd: ((ok: boolean) => void) | null = null
const showRewardedAd = vi.fn((_reward?: unknown) => new Promise<boolean>((r) => {
  resolveAd = r
}))

vi.mock('@/platforms/rewardedAdsBuild', () => ({
  get HAS_REWARDED_ADS() {
    return adsBuild
  }
}))
vi.mock('@/use/useAds', () => ({
  isRewardedReady,
  showRewardedAd: (reward?: unknown) => showRewardedAd(reward)
}))

// useUser first (useMatch <-> useModels <-> useUser cycle guard).
await import('@/use/useUser')
const { getStageById } = await import('@/use/useSpinnerCampaign')
const { WIN_AD_MULTIPLIER, winAdExtraCoins, winAdTotalCoins, showsWinCoinsAd } = await import('@/use/winCoinsAd')
const { COINS_KEY } = await import('@/keys')
const useSpinnerConfig = (await import('@/use/useSpinnerConfig')).default
const RewardedAdButton = (await import('@/components/organisms/RewardedAdButton.vue')).default

const i18n = () =>
  createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

const mountButton = (baseCoins: number) =>
  mount(RewardedAdButton, { props: { baseCoins }, global: { plugins: [i18n()] }, attachTo: document.body })

const wallet = () => useSpinnerConfig().coins.value

beforeEach(() => {
  adsBuild = true
  isRewardedReady.value = true
  resolveAd = null
  showRewardedAd.mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('3x payout scales with the stage', () => {
  it('3x TOTAL: a completed ad adds 2x the base, never a flat amount', () => {
    expect(WIN_AD_MULTIPLIER).toBe(3)
    const seen = new Set<number>()
    for (const id of [1, 4, 9, 14, 27, 60, 120]) {
      const base = getStageById(id).rewardWin
      expect(winAdExtraCoins(base)).toBe(base * 2)
      expect(winAdTotalCoins(base)).toBe(base * 3)
      expect(base + winAdExtraCoins(base)).toBe(winAdTotalCoins(base))
      seen.add(winAdExtraCoins(base))
    }
    // Different stages, different payouts: it follows the stage reward.
    expect(seen.size).toBeGreaterThan(3)
  })

  it('nothing to triple, nothing to pay', () => {
    expect(winAdExtraCoins(0)).toBe(0)
    expect(winAdExtraCoins(-5)).toBe(0)
    expect(winAdExtraCoins(Number.NaN)).toBe(0)
  })
})

describe('where the button appears', () => {
  const base = { adsBuild: true, result: 'win' as const, bossWin: false, pvp: false, baseCoins: 120 }

  it('non-boss win on an ad build', () => {
    expect(showsWinCoinsAd(base)).toBe(true)
  })

  it('never on a build without rewarded ads', () => {
    expect(showsWinCoinsAd({ ...base, adsBuild: false })).toBe(false)
  })

  it('never on a lose screen', () => {
    expect(showsWinCoinsAd({ ...base, result: 'lose' })).toBe(false)
  })

  it('never on a boss win (the roulette has its own ad)', () => {
    expect(showsWinCoinsAd({ ...base, bossWin: true })).toBe(false)
    for (const id of [5, 10, 15, 20, 25, 30]) {
      const stage = getStageById(id)
      expect(stage.isBoss).toBe(true)
      expect(showsWinCoinsAd({ ...base, bossWin: true, baseCoins: stage.rewardWin })).toBe(false)
    }
  })

  it('never on a PvP win (win or lose)', () => {
    expect(showsWinCoinsAd({ ...base, pvp: true })).toBe(false)
    expect(showsWinCoinsAd({ ...base, pvp: true, baseCoins: 500 })).toBe(false)
    expect(showsWinCoinsAd({ ...base, pvp: true, result: 'lose' })).toBe(false)
  })

  it('still on every other non-boss win: campaign, ghost/leaderboard, daily challenge', () => {
    // Campaign: the fought stage's rewardWin (non-boss stages).
    for (const id of [1, 4, 9, 14]) {
      const stage = getStageById(id)
      expect(stage.isBoss ?? false).toBe(false)
      expect(showsWinCoinsAd({ ...base, baseCoins: stage.rewardWin })).toBe(true)
    }
    // Ghost / leaderboard win: the ghost formula (50 + 2 x enemy stage).
    expect(showsWinCoinsAd({ ...base, baseCoins: 50 + 12 * 2 })).toBe(true)
    // Daily challenge win: 75% of the current stage's win reward.
    expect(showsWinCoinsAd({ ...base, baseCoins: Math.round(getStageById(9).rewardWin * 0.75) })).toBe(true)
  })

  it('never after a cheat-stage or Boss Lab win (G5: they pay fixed 500/100)', () => {
    expect(showsWinCoinsAd({ ...base, labWin: true })).toBe(false)
    expect(showsWinCoinsAd({ ...base, labWin: true, baseCoins: 500 })).toBe(false)
    expect(showsWinCoinsAd({ ...base, labWin: false })).toBe(true)
  })

  it('SpinnerArena marks the Lab settlement and feeds it into the predicate', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')
    expect(src).toMatch(/showsWinCoinsAd\(\{[^}]*labWin: lastResultWasLab\.value[^}]*\}\)/)
    // Set in the G1 settlement branch, right after settleLabBattle pays.
    expect(src).toMatch(/settleLabBattle\([^)]*\)\s*\n\s*lastResultWasLab\.value = true/)
    // Reset with the other per-screen state, so a later campaign win offers it again.
    expect(src).toMatch(/lastWinWasBoss\.value = false\s*\n\s*lastResultWasLab\.value = false/)
  })

  it('SpinnerArena feeds the PvP flag into the predicate', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')
    expect(src).toMatch(/showsWinCoinsAd\(\{[^}]*pvp: pvpMode\.value[^}]*\}\)/)
  })

  it('the component renders nothing on a no-ad build, even with an ad "ready"', () => {
    adsBuild = false
    const w = mountButton(100)
    expect(w.find('button.reward-3x').exists()).toBe(false)
    w.unmount()
  })

  it('SpinnerArena wires it to the non-boss win screen and binds the granted value', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/SpinnerArena.vue'), 'utf8')
    // Button picked at MODULE scope from the build flag (so a no-ad build
    // never bundles it), gated on the pure predicate, fed the bound base.
    expect(src).toMatch(/const WinCoinsAdButton = ADS_BUILD_FLAG \? RewardedAdButton : null/)
    expect(src).toMatch(/component\(\s*\n\s*v-if="WinCoinsAdButton && showWinCoinsAd"\s*\n\s*:is="WinCoinsAdButton"\s*\n\s*:base-coins="winAdBaseCoins"/)
    expect(src).toMatch(/bossWin: lastWinWasBoss\.value/)
    expect(src).toMatch(/lastWinWasBoss\.value = isBossWin/)
    // The label shows what was granted (+ the ad's extra), not rewardAmount,
    // which already reads the NEXT stage after advanceStage().
    expect(src).toContain('+{{ grantedCoins + winAdExtra }}')
    expect(src).toContain('+{{ dailyCoinReward + winAdExtra }}')
    expect(src).toContain('+{{ PVP_COIN_REWARD + winAdExtra }}')
    const snap = src.indexOf('grantedCoins.value = rewardAmount.value')
    const adv = src.indexOf('advanceStage()', snap)
    expect(snap).toBeGreaterThan(0)
    expect(adv).toBeGreaterThan(snap)
    // Boss wins return into the roulette before the ordinary win screen opens.
    const bossBranch = src.indexOf('if (isBossWin) {')
    const bossReturn = src.indexOf('return', bossBranch)
    expect(bossBranch).toBeGreaterThan(0)
    expect(bossReturn).toBeLessThan(snap)
    // Tap-to-continue is held while the 3x ad plays.
    expect(src).toContain(':show-continue="!winAdBusy"')
  })
})

describe('the button', () => {
  it('pays 2x base on a completed ad, through the coin/save path, once', async () => {
    const before = wallet()
    const w = mountButton(150)
    const btn = w.find('button.reward-3x')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(showRewardedAd).toHaveBeenCalledWith({ kind: 'coins', amount: 300 })
    resolveAd!(true)
    await flushPromises()
    expect(wallet()).toBe(before + 300)
    expect(localStorage.getItem(COINS_KEY)).toBe(String(before + 300))
    expect(w.emitted('coins-awarded')![0]![1]).toBe(300)
    // Single use: gone for the rest of this screen.
    expect(w.find('button.reward-3x').exists()).toBe(false)
    w.unmount()
  })

  it('is disabled until a rewarded ad is ready; a tap does nothing', async () => {
    isRewardedReady.value = false
    const w = mountButton(150)
    const btn = w.find('button.reward-3x')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeDefined()
    btn.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(showRewardedAd).not.toHaveBeenCalled()
    isRewardedReady.value = true
    await nextTick()
    expect(w.find('button.reward-3x').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('is disabled while the ad plays and reports busy to the screen', async () => {
    const w = mountButton(80)
    await w.find('button.reward-3x').trigger('click')
    await nextTick()
    expect(w.find('button.reward-3x').attributes('disabled')).toBeDefined()
    expect(w.emitted('busy')![0]).toEqual([true])
    resolveAd!(false)
    await flushPromises()
    expect(w.emitted('busy')!.at(-1)).toEqual([false])
    w.unmount()
  })

  it('a skipped or unfilled ad pays nothing and leaves the button', async () => {
    const before = wallet()
    const w = mountButton(200)
    await w.find('button.reward-3x').trigger('click')
    resolveAd!(false)
    await flushPromises()
    expect(wallet()).toBe(before)
    expect(w.emitted('coins-awarded')).toBeUndefined()
    const btn = w.find('button.reward-3x')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('a double tap starts one ad and pays once', async () => {
    const before = wallet()
    const w = mountButton(100)
    const btn = w.find('button.reward-3x')
    // Two taps in the same tick: the second lands before the first awaits.
    btn.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(showRewardedAd).toHaveBeenCalledTimes(1)
    resolveAd!(true)
    await flushPromises()
    expect(wallet()).toBe(before + 200)
    expect(w.emitted('coins-awarded')!.length).toBe(1)
    w.unmount()
  })

  it('stops the tap from reaching the overlay (no accidental continue)', async () => {
    const onParent = vi.fn()
    const w = mount({
      components: { RewardedAdButton },
      template: '<div @click="onParent"><RewardedAdButton :base-coins="50" /></div>',
      setup: () => ({ onParent })
    }, { global: { plugins: [i18n()] } })
    await w.find('button.reward-3x').trigger('click')
    expect(onParent).not.toHaveBeenCalled()
    resolveAd!(false)
    await flushPromises()
    w.unmount()
  })
})
