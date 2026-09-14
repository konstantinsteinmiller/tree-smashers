import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { SaveManager } from '@/utils/save/SaveManager'
import type { LocalStorageAccessor, SaveStrategy } from '@/utils/save/types'
import { resetAllProgress } from '@/use/useResetProgress'
import { refreshSaveBackedState, saveDataVersion } from '@/use/useSaveStatus'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { STAGE_KEY, UPGRADES_KEY, COINS_KEY, SKINS_KEY } from '@/keys'

// ─── Full-progress reset ───────────────────────────────────────────────────
//
// The two things that were broken, and why each needs its own arm:
//
//   • On a CLOUD-ONLY build (`persistToRaw: false` — CrazyGames) the save
//     lives only in BlobStorage's in-memory map; raw localStorage was
//     scrubbed at construction. The old sweep walked `localStorage.key(i)`,
//     which is pass-through on the storage Proxy, so it enumerated an empty
//     raw store, deleted nothing, and never reached the patched
//     `removeItem` that forwards deletions to the strategy. The player
//     reset, saw a fresh save, and the next hydrate handed the old one
//     straight back. That is the `persistToRaw: false` arm below, and it is
//     the arm that fails against the pre-fix implementation.
//
//   • The reset ended in `window.location.reload()`. It now refreshes the
//     save-backed refs in place instead, so the wipe has to be observable
//     on the campaign composable without any navigation.

const PROGRESS_KEYS = [STAGE_KEY, COINS_KEY, UPGRADES_KEY, 'spinner_battle_pass', 'spinner_daily_rewards']
const KEPT_KEYS = [SKINS_KEY, 'spinner_user_language', 'spinner_bg_skin_selected']

const makeSpyStrategy = (): SaveStrategy & {
  onLocalRemove: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
} => ({
  name: 'spy',
  hydrateState: 'success-empty',
  hydrate: vi.fn(async (_local: LocalStorageAccessor) => {
  }),
  onLocalSet: vi.fn(),
  onLocalRemove: vi.fn(),
  flush: vi.fn(async () => {
  })
})

/** Boot a manager in the given mirroring mode and seed a save through the
 *  patched localStorage, exactly as the game writes one. */
const bootWithSave = async (persistToRaw: boolean) => {
  const strategy = makeSpyStrategy()
  const manager = new SaveManager(strategy, window.localStorage, { blob: { persistToRaw } })
  ;(window as any).__saveManager = manager
  await manager.init()

  for (const key of PROGRESS_KEYS) window.localStorage.setItem(key, 'progress')
  for (const key of KEPT_KEYS) window.localStorage.setItem(key, 'keep')
  window.localStorage.setItem(STAGE_KEY, '12')
  window.localStorage.setItem(UPGRADES_KEY, JSON.stringify({
    tops: { star: 4 },
    bottoms: { tanky: 3 }
  }))
  strategy.onLocalRemove.mockClear()

  return { strategy, manager }
}

const removedKeys = (strategy: { onLocalRemove: ReturnType<typeof vi.fn> }): string[] =>
  strategy.onLocalRemove.mock.calls.map(([key]) => key as string)

describe('resetAllProgress', () => {
  beforeEach(() => {
    delete (window as any).__saveManager
  })

  // The regression arm. Pre-fix this reports zero removals.
  it('forwards every deletion to the strategy on a cloud-only build', async () => {
    const { strategy } = await bootWithSave(false)

    await resetAllProgress()

    expect(removedKeys(strategy).sort()).toEqual([...PROGRESS_KEYS].sort())
    expect(strategy.flush).toHaveBeenCalled()
  })

  it('forwards every deletion to the strategy on a mirrored build', async () => {
    const { strategy } = await bootWithSave(true)

    await resetAllProgress()

    expect(removedKeys(strategy).sort()).toEqual([...PROGRESS_KEYS].sort())
    for (const key of PROGRESS_KEYS) expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('keeps settings and purchased skins, on both mirroring modes', async () => {
    for (const persistToRaw of [true, false]) {
      const { strategy } = await bootWithSave(persistToRaw)

      await resetAllProgress()

      for (const key of KEPT_KEYS) {
        expect(removedKeys(strategy)).not.toContain(key)
        expect(window.localStorage.getItem(key)).toBe('keep')
      }
    }
  })

  it('leaves the rewarded-ad cooldown armed so a reset cannot farm it', async () => {
    const { strategy } = await bootWithSave(false)
    const readyAt = String(Date.now() + 30_000)
    window.localStorage.setItem('spinner_ad_button_ready_at', readyAt)

    await resetAllProgress()

    expect(removedKeys(strategy)).not.toContain('spinner_ad_button_ready_at')
    expect(window.localStorage.getItem('spinner_ad_button_ready_at')).toBe(readyAt)
  })

  // Takes effect immediately: no reload, so the campaign composable's
  // already-loaded refs have to fall back to their defaults on their own.
  it('rolls the campaign back to stage 1 with no upgrades, without a reload', async () => {
    const { manager } = await bootWithSave(false)
    const campaign = useSpinnerCampaign()

    refreshSaveBackedState()
    await nextTick()
    expect(campaign.currentStageId.value).toBe(12)
    expect(campaign.playerUpgrades.value.tops.star).toBe(4)
    expect(campaign.playerUpgrades.value.bottoms.tanky).toBe(3)

    const versionBefore = saveDataVersion.value
    const reinitBefore = campaign.stageReinitSignal.value

    await resetAllProgress()
    await nextTick()

    expect(campaign.currentStageId.value).toBe(1)
    expect(campaign.playerUpgrades.value.tops.star).toBe(0)
    expect(campaign.playerUpgrades.value.bottoms.tanky).toBe(0)
    // The arena rebuilds its blades/enemy team off this signal — without it
    // the player keeps fighting the old stage with stage-1 stats.
    expect(campaign.stageReinitSignal.value).toBeGreaterThan(reinitBefore)
    expect(saveDataVersion.value).toBeGreaterThan(versionBefore)
    expect(manager.savedKeys()).not.toContain(STAGE_KEY)
  })

  it('survives a boot with no SaveManager installed', async () => {
    window.localStorage.setItem(STAGE_KEY, '9')
    window.localStorage.setItem('spinner_user_language', 'de')

    await expect(resetAllProgress()).resolves.toBeUndefined()

    expect(window.localStorage.getItem(STAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem('spinner_user_language')).toBe('de')
  })
})
