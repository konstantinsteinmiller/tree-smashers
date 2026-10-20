// Skin Chest — the skin shown left of the timer is the skin the chest puts on
// its roulette (at 3x the chance of any other skin).
//
// The chest used to roll its preview and its grant independently (and the
// preview never included special skins), so players almost never received
// the skin they were waiting for. Now one reward is rolled, persisted under
// `smashers_skin_chest_reward`, shown, re-validated whenever a skin is
// acquired, and handed to the Skin Chest roulette by `openSkinChest()`
// (wheel side: tests/rouletteWheel.test.ts, mode="skins").
//
// `useUser` is imported FIRST whenever a composable is: useModels sits on the
// useMatch↔useModels↔useUser import cycle (tests/useBattlePassDiamond.test.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { SKINS_PER_TOP, isEarnOnlySkin, type SpinnerModelId } from '@/data/skinCatalog'
import { SAVE_KEYS } from '@/utils/save/SaveMergePolicy'
import type { TopPartId } from '@/types/spinner'

const REWARD_KEY = 'smashers_skin_chest_reward'
const READY_AT_KEY = 'smashers_skin_chest_ready_at'

const allKeys = (): string[] =>
  (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
    .flatMap(([top, ids]) => ids.map(id => `${top}:${id}`))

const freshImport = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  const models = await import('@/use/useModels')
  const chest = await import('@/use/useSkinChest')
  const save = await import('@/use/useSaveStatus')
  return { models, chest, save }
}

/** Open a ripe chest and land the featured skin, as the wheel would. */
const openAndWin = (chest: any, models: any) => {
  const f = chest.openSkinChest()
  if (f) models.buySkin(f.topPartId, f.modelId)
  return f
}

/** Every top part a model id is listed under. */
const topsOf = (id: SpinnerModelId): TopPartId[] =>
  (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
    .filter(([, ids]) => ids.includes(id)).map(([top]) => top)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Skin Chest — puts exactly the previewed skin on its roulette', () => {
  it('every open features the skin the pill showed, until the chest is empty', async () => {
    let draws = 0
    for (let i = 0; i < 200; i++) {
      localStorage.setItem(READY_AT_KEY, '0')
      const { chest, models } = await freshImport()
      if (!chest.skinChestHasRewards.value) break
      const shown = chest.skinChestIconSkin.value
      expect(models.isModelFullyOwned(shown), `preview ${shown} is already owned`).toBe(false)
      expect(isEarnOnlySkin(shown), `preview ${shown} is a trophy`).toBe(false)
      const got = openAndWin(chest, models)
      expect(got?.modelId).toBe(shown)
      expect(models.isModelFullyOwned(shown)).toBe(true)
      draws++
    }
    expect(draws).toBeGreaterThan(50)
    // Drained: the pill is gone and nothing more is paid.
    localStorage.setItem(READY_AT_KEY, '0')
    const { chest, models } = await freshImport()
    expect(chest.skinChestHasRewards.value).toBe(false)
    expect(openAndWin(chest, models)).toBeNull()
    expect(localStorage.getItem(REWARD_KEY)).toBeNull()
  })

  it('a previewed special skin is the one featured (the old preview never showed one)', async () => {
    localStorage.setItem('smashers_skin_chest_first_collected', '1')
    vi.spyOn(Math, 'random').mockReturnValue(0) // < SPECIAL_CHANCE → special pool
    const { chest, models } = await freshImport()
    vi.restoreAllMocks()
    const promised = chest.skinChestReward.value
    expect(promised?.isSpecial).toBe(true)
    localStorage.setItem(READY_AT_KEY, '0')
    const got = openAndWin(chest, models)
    expect(got?.modelId).toBe(promised?.modelId)
  })

  it('the promise survives a reload — no new roll on every boot', async () => {
    const first = (await freshImport()).chest.skinChestIconSkin.value
    for (let i = 0; i < 5; i++) {
      const { chest, models } = await freshImport()
      expect(chest.skinChestIconSkin.value).toBe(first)
    }
  })

  it('acquiring the previewed skin elsewhere rerolls the preview to a still-unowned skin', async () => {
    const { chest, models } = await freshImport()
    const before = chest.skinChestIconSkin.value
    for (const top of topsOf(before)) models.buySkin(top, before)
    await nextTick()
    const after = chest.skinChestIconSkin.value
    expect(after).not.toBe(before)
    expect(models.isModelFullyOwned(after)).toBe(false)
    expect(localStorage.getItem(REWARD_KEY)).toBe(after)
    // …and that is what the chest features.
    localStorage.setItem(READY_AT_KEY, '0')
    expect(openAndWin(chest, models)?.modelId).toBe(after)
  })

  it('acquiring some OTHER skin keeps the promise unchanged', async () => {
    const { chest, models } = await freshImport()
    const before = chest.skinChestIconSkin.value
    const other = (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
      .flatMap(([top, ids]) => ids.map(id => [top, id] as const))
      .find(([, id]) => id !== before && !models.isModelFullyOwned(id))!
    models.buySkin(other[0], other[1])
    await nextTick()
    expect(chest.skinChestIconSkin.value).toBe(before)
  })

  it('a stale stored promise (skin owned by a cloud save) is replaced on load and on hydrate', async () => {
    const { chest, models } = await freshImport()
    const promised = chest.skinChestIconSkin.value
    // Simulate the cloud delivering a save that already owns the promised skin.
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(topsOf(promised).map(t => `${t}:${promised}`)))
    const reloaded = await freshImport()
    expect(reloaded.chest.skinChestIconSkin.value).not.toBe(promised)
    expect(reloaded.models.isModelFullyOwned(reloaded.chest.skinChestIconSkin.value)).toBe(false)

    // Same within a running session: the hydrate bump re-reads both stores.
    const now = reloaded.chest.skinChestIconSkin.value
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify([
      ...JSON.parse(localStorage.getItem(SAVE_KEYS.SKINS)!),
      ...topsOf(now).map(t => `${t}:${now}`)
    ]))
    reloaded.save.refreshSaveBackedState()
    await nextTick()
    await nextTick()
    expect(reloaded.chest.skinChestIconSkin.value).not.toBe(now)
    expect(reloaded.models.isModelFullyOwned(reloaded.chest.skinChestIconSkin.value)).toBe(false)
  })

  it('with every skin owned the pill hides and the stored promise is cleared', async () => {
    localStorage.setItem(REWARD_KEY, 'ice')
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(allKeys()))
    localStorage.setItem(READY_AT_KEY, '0')
    const { chest, models } = await freshImport()
    expect(chest.skinChestHasRewards.value).toBe(false)
    expect(openAndWin(chest, models)).toBeNull()
    expect(localStorage.getItem(REWARD_KEY)).toBeNull()
  })

  it('the last remaining skin is shown and granted, then the pill disappears', async () => {
    const { chest: c0 } = await freshImport()
    const last = c0.skinChestIconSkin.value
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(allKeys().filter(k => !k.endsWith(`:${last}`))))
    localStorage.setItem(READY_AT_KEY, '0')
    const { chest, models } = await freshImport()
    expect(chest.skinChestIconSkin.value).toBe(last)
    expect(openAndWin(chest, models)?.modelId).toBe(last)
    await nextTick()
    expect(chest.skinChestHasRewards.value).toBe(false)
  })

  it('opening starts the 20h cooldown; a spin that misses keeps the same preview', async () => {
    localStorage.setItem(READY_AT_KEY, '0')
    const { chest } = await freshImport()
    const promised = chest.skinChestIconSkin.value
    const featured = chest.openSkinChest()
    expect(featured?.modelId).toBe(promised)
    expect(chest.skinChestReady.value).toBe(false)
    expect(chest.openSkinChest()).toBeNull() // not ripe again
    // The wheel landed some other skin: the promise is unchanged.
    expect(chest.skinChestIconSkin.value).toBe(promised)
  })
})
