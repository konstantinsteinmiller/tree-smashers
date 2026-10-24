// "[movie] Reset Battle Pass" — once every tier is reached AND claimed, a
// watched-to-the-end rewarded ad wipes the pass back to stage 0 so it can be
// earned again. Pins: the reset logic + its gate, the save sanitizer for the
// new `resetCount`, and the button's ad gating (ready / busy / grant only on
// a completed ad, build gate at module scope).

import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const KEY = 'smashers_battle_pass'
const ALL = Array.from({ length: 100 }, (_, i) => i + 1)

const seed = (over: Record<string, unknown> = {}) =>
  localStorage.setItem(KEY, JSON.stringify({
    xp: 0, unlockedStages: 100, claimedStages: ALL, claimedSkins: { 10: 'x' }, offeredSkins: { 20: 'y' },
    seasonStartedAt: null, ...over
  }))

const loadBp = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  return import('@/use/useBattlePass')
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.doUnmock('@/use/useAds')
})

describe('bpCanAdReset', () => {
  it('needs every tier reached AND claimed', async () => {
    const { bpCanAdReset } = await loadBp()
    expect(bpCanAdReset({ unlockedStages: 100, claimedStages: ALL })).toBe(true)
    expect(bpCanAdReset({ unlockedStages: 100, claimedStages: ALL.slice(0, 99) })).toBe(false)
    expect(bpCanAdReset({ unlockedStages: 99, claimedStages: ALL.slice(0, 99) })).toBe(false)
    expect(bpCanAdReset({ unlockedStages: 0, claimedStages: [] })).toBe(false)
  })
})

describe('resetPassByAd', () => {
  it('wipes xp/tiers/claims/skins, keeps the season clock, counts the reset, persists', async () => {
    seed({ seasonStartedAt: new Date().toISOString().slice(0, 10), resetCount: 2 })
    const mod = await loadBp()
    const bp = mod.default()
    expect(bp.canAdReset.value).toBe(true)
    const season = bp.state.value.seasonStartedAt
    expect(bp.resetPassByAd()).toBe(true)
    expect(bp.state.value).toMatchObject({ xp: 0, unlockedStages: 0, claimedStages: [], claimedSkins: {}, offeredSkins: {}, seasonStartedAt: season, resetCount: 3 })
    expect(bp.canAdReset.value).toBe(false)
    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved.unlockedStages).toBe(0)
    expect(saved.resetCount).toBe(3)
    // Earnable again.
    bp.awardCampaignWin(); bp.awardCampaignWin()
    expect(bp.unlockedStages.value).toBe(1)
  })

  it('is a no-op while a tier is unclaimed or the pass is not full', async () => {
    seed({ claimedStages: ALL.slice(0, 99) })
    const bp = (await loadBp()).default()
    expect(bp.resetPassByAd()).toBe(false)
    expect(bp.state.value.unlockedStages).toBe(100)
  })
})

describe('save sanitizer: resetCount', () => {
  it.each([[undefined, 0], [-3, 0], ['5', 0], [NaN, 0], [Infinity, 0], [4.7, 4], [7, 7]])('%s → %s', async (raw, want) => {
    seed({ resetCount: raw })
    const bp = (await loadBp()).default()
    expect(bp.resetCount.value).toBe(want)
  })

  it('survives a season expiry reset', async () => {
    seed({ seasonStartedAt: '2000-01-01', resetCount: 5 })
    const bp = (await loadBp()).default()
    expect(bp.state.value.unlockedStages).toBe(0)
    expect(bp.resetCount.value).toBe(5)
  })
})

// ─── Button gating ──────────────────────────────────────────────────────────
vi.mock('/images/icons/movie_128x96.webp', () => ({ default: 'movie.webp' }))

const ready = ref(true)
const show = vi.fn(async (_r?: unknown) => true)

const mountButton = async () => {
  vi.resetModules()
  vi.doMock('@/use/useAds', () => ({ isRewardedReady: ready, showRewardedAd: (r: unknown) => show(r) }))
  await import('@/use/useUser')
  const bpMod = await import('@/use/useBattlePass')
  const Btn = (await import('@/components/organisms/BattlePassResetAdButton.vue')).default
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  return { w: mount(Btn, { global: { plugins: [i18n] } }), bp: bpMod.default() }
}

describe('BattlePassResetAdButton', () => {
  beforeEach(() => {
    ready.value = true
    show.mockReset()
  })

  it('is absent until the pass is full and fully claimed', async () => {
    seed({ claimedStages: ALL.slice(0, 50) })
    const { w } = await mountButton()
    expect(w.find('[data-testid="bp-ad-reset"]').exists()).toBe(false)
  })

  it('is disabled while no rewarded ad is loaded, and never asks for one', async () => {
    seed()
    ready.value = false
    const { w, bp } = await mountButton()
    const btn = w.find('[data-testid="bp-ad-reset"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(show).not.toHaveBeenCalled()
    expect(bp.state.value.unlockedStages).toBe(100)
  })

  it('resets only on a completed ad', async () => {
    seed()
    show.mockResolvedValueOnce(false)
    const { w, bp } = await mountButton()
    await w.find('[data-testid="bp-ad-reset"]').trigger('click')
    await flushPromises()
    expect(bp.state.value.unlockedStages).toBe(100)
    expect(w.emitted('reset')).toBeUndefined()

    show.mockResolvedValueOnce(true)
    await w.find('[data-testid="bp-ad-reset"]').trigger('click')
    await flushPromises()
    expect(bp.state.value.unlockedStages).toBe(0)
    expect(bp.resetCount.value).toBe(1)
    expect(w.emitted('reset')).toHaveLength(1)
  })

  it('a double tap starts one ad', async () => {
    seed()
    let resolveAd!: (v: boolean) => void
    show.mockImplementationOnce(() => new Promise<boolean>((r) => { resolveAd = r }))
    const { w } = await mountButton()
    const btn = w.find('[data-testid="bp-ad-reset"]')
    await btn.trigger('click')
    await btn.trigger('click')
    expect(show).toHaveBeenCalledTimes(1)
    resolveAd(true)
    await flushPromises()
  })

  it('is not green (Play Store forbids green rewarded-ad buttons) and is build-gated at module scope', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/organisms/BattlePassResetAdButton.vue'), 'utf8')
    expect(src).toMatch(/ui-btn--ad\(/)
    expect(src).not.toMatch(/ui-btn--primary/)
    const host = readFileSync(resolve(__dirname, '../src/components/organisms/BattlePass.vue'), 'utf8')
    expect(host).toMatch(/HAS_REWARDED_ADS \? BattlePassResetAdButton : null/)
  })
})
