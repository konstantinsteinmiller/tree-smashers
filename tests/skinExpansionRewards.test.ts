// The 2026-09 skin expansion (24 regular skins appended to SKINS_PER_TOP)
// seen through the systems that hand skins out or load them:
//
//   • Battle Pass claim — a persisted offer is honoured whether it is a legacy
//     skin or a new one, and the skin lands under its own top part.
//   • Skin Chest — the D1 starter tease is unchanged for a brand-new player,
//     and a player who already owns every legacy skin gets a NEW one instead
//     of an empty chest.
//   • Background preload — every catalog skin (new ones included) is in the
//     list `preloadRemainingSkins` fetches, so the skin shop never shows a
//     cold image.
//
// Each case re-imports the modules on a fresh localStorage because the skin
// state (owned skins, chest timers) is read at module init. `useUser` is
// imported FIRST every time: useBattlePass / useSkinChest pull useModels,
// which sits on the useMatch↔useModels↔useUser cycle (see
// tests/useBattlePassDiamond.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SKINS_PER_TOP, SPECIAL_SKINS, type SpinnerModelId } from '@/data/skinCatalog'
import type { TopPartId } from '@/types/spinner'

const LEGACY: Record<TopPartId, string[]> = {
  star: ['blades', 'ice', 'wasp', 'reddragon', 'chain', 'axe', 'tornado'],
  triangle: ['thunder', 'snake', 'phoenix', 'eagle', 'spiky-eagle', 'salamaner', 'thunderstorm'],
  round: ['nature', 'turtle', 'piranha', 'bear', 'galaxy', 'golden-eagle', 'wolf-demon', 'dark'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic', 'tsunami', 'prisma', 'forest-dragon', 'rainbow'],
  cushioned: ['shell', 'shield', 'castle', 'mountain', 'gear', 'sandstorm', 'diamond', 'boulder'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk', 'rhino', 'ape', 'teleporter']
}
const legacyOwnedKeys = (): string[] =>
  (Object.entries(LEGACY) as [TopPartId, string[]][]).flatMap(([top, ids]) => ids.map(id => `${top}:${id}`))
const newSkins = (): { top: TopPartId, id: SpinnerModelId }[] =>
  (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
    .flatMap(([top, ids]) => ids.filter(id => !LEGACY[top].includes(id)).map(id => ({ top, id })))

const freshImport = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  const models = await import('@/use/useModels')
  const bp = await import('@/use/useBattlePass')
  const chest = await import('@/use/useSkinChest')
  return { models, bp, chest }
}

beforeEach(() => {
  localStorage.clear()
})

describe('skin expansion — battle pass claim', () => {
  it('honours a persisted offer of a NEW skin and unlocks it under its own top part', async () => {
    const { star } = { star: newSkins().find(s => s.top === 'star') }
    expect(star, 'no new star skin in the catalog').toBeTruthy()
    const { models, bp } = await freshImport()
    const pass = bp.default()
    for (let i = 0; i < 40; i++) pass.awardCampaignWin() // 20 stages
    const res = pass.claimStage(10, star!.id)
    expect(res?.skin).toBe(star!.id)
    expect(models.isSkinOwned('star', star!.id)).toBe(true)
  })

  it('still honours a persisted LEGACY offer (an existing save keeps what it was shown)', async () => {
    const { models, bp } = await freshImport()
    const pass = bp.default()
    for (let i = 0; i < 40; i++) pass.awardCampaignWin()
    const res = pass.claimStage(20, 'ice')
    expect(res?.skin).toBe('ice')
    expect(models.isSkinOwned('star', 'ice')).toBe(true)
  })
})

describe('skin expansion — skin chest', () => {
  it('a brand-new player still gets the D1 starter tease on the first chest', async () => {
    const { chest } = await freshImport()
    const granted = chest.collectSkinChest()
    expect(granted).not.toBeNull()
    expect(['snake', 'ice', 'mysticaleye', 'shield']).toContain(granted!.modelId)
  })

  it('a player who owns every legacy skin gets a NEW regular skin, not an empty chest', async () => {
    localStorage.setItem('spinner_owned_skins', JSON.stringify(legacyOwnedKeys()))
    const { models, chest } = await freshImport()
    expect(chest.skinChestHasRewards.value).toBe(true)
    const granted = chest.collectSkinChest()
    expect(granted).not.toBeNull()
    const fresh = newSkins()
    expect(fresh.map(s => s.id)).toContain(granted!.modelId)
    expect(SPECIAL_SKINS.has(granted!.modelId)).toBe(false)
    expect(models.isSkinOwned(granted!.topPartId, granted!.modelId)).toBe(true)
    // …and it was granted under the top part that lists it.
    expect(SKINS_PER_TOP[granted!.topPartId]).toContain(granted!.modelId)
  })
})

describe('skin expansion — background preload list', () => {
  const RealImage = globalThis.Image
  afterEach(() => {
    globalThis.Image = RealImage
  })

  it('preloadRemainingSkins requests every catalog skin image, new ones included', async () => {
    const requested: string[] = []

    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      set src(v: string) {
        this._src = v
        requested.push(v)
        queueMicrotask(() => this.onload?.())
      }

      get src() {
        return this._src
      }
    }

    globalThis.Image = FakeImage as unknown as typeof Image
    vi.resetModules()
    await import('@/use/useUser')
    const { modelImgPath } = await import('@/use/useModels')
    const { default: useAssets } = await import('@/use/useAssets')
    await useAssets().preloadRemainingSkins()
    for (const ids of Object.values(SKINS_PER_TOP)) {
      for (const id of ids) expect(requested, `${id} not preloaded`).toContain(modelImgPath(id))
    }
  })
})
