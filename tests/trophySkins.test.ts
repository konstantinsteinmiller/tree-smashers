// Boss trophy skins (bosses-100-feature.md §3.5, user decision B2) — EARN-ONLY.
//
//   1. ONE flag. `TROPHY_SKINS` in the pure catalog is the only list, it
//      equals the encounter table's `BOSS_TROPHY_SKIN_IDS`, and the skins sit
//      in the classes their bosses fight with.
//   2. EVERY POOL excludes them — shop (coins + ad unlock), Skin Chest,
//      roulette wheel, Battle Pass, Daily Rewards, random NPC skins — checked by behaviour where a pool is reachable from a test,
//      and by a source scan that makes every file reading the skin catalog
//      declare itself (a NEW pool that forgets the flag fails here).
//   3. The GRANT API (`grantTrophySkin` / `grantTrophySkins`) is the only way
//      in: idempotent, trophy-only, persisted under the save system's skins key.
//
// `useUser` is imported FIRST whenever a composable is: useModels sits on the
// useMatch↔useModels↔useUser import cycle (tests/useBattlePassDiamond.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  SKINS_PER_TOP,
  SPINNER_MODEL_IDS,
  SPECIAL_SKINS,
  AD_UNLOCK_SKINS,
  TROPHY_SKINS,
  isEarnOnlySkin,
  isCoinPurchasable,
  isAdUnlockSkin,
  offerableSkinsForTop,
  topPartOfSkin,
  getOfferableSkinPool,
  type SpinnerModelId
} from '@/data/skinCatalog'
import { BOSS_TROPHY_SKIN_IDS, BOSS_ENCOUNTERS } from '@/data/bossEncounters'
import { SAVE_KEYS, isPayloadKey, computeMeta } from '@/utils/save/SaveMergePolicy'
import type { TopPartId } from '@/types/spinner'

const TROPHIES = [...TROPHY_SKINS]
const ownedKeysExcept = (skip: (id: SpinnerModelId) => boolean): string[] =>
  (Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][])
    .flatMap(([top, ids]) => ids.filter(id => !skip(id)).map(id => `${top}:${id}`))

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trophy skins — one catalog flag', () => {
  it('TROPHY_SKINS is exactly the encounter table\'s trophy ids (cinder, frost-vault, yeti)', () => {
    expect([...TROPHY_SKINS].sort()).toEqual([...BOSS_TROPHY_SKIN_IDS].sort())
    expect([...TROPHY_SKINS].sort()).toEqual(['cinder', 'frost-vault', 'yeti'])
  })

  it('every skin an encounter grants is a trophy skin', () => {
    for (const enc of BOSS_ENCOUNTERS) {
      for (const id of enc.trophySkins) expect(isEarnOnlySkin(id), `${enc.id} grants ${id}`).toBe(true)
    }
  })

  it('each trophy is a declared model id, in its boss\'s class, and in no other set', () => {
    const cls: Record<string, TopPartId> = { cinder: 'round', 'frost-vault': 'quadratic', yeti: 'triangle' }
    for (const id of TROPHIES) {
      expect((SPINNER_MODEL_IDS as readonly string[]).includes(id), id).toBe(true)
      expect(topPartOfSkin(id), id).toBe(cls[id])
      expect(SPECIAL_SKINS.has(id), `${id} is not a special (for-sale) skin`).toBe(false)
      expect(AD_UNLOCK_SKINS.has(id), `${id} is not an ad-unlock skin`).toBe(false)
    }
  })

  it('no class default is a trophy (the default is always owned)', () => {
    for (const ids of Object.values(SKINS_PER_TOP)) expect(isEarnOnlySkin(ids[0]!)).toBe(false)
  })
})

describe('trophy skins — excluded from every pool', () => {
  it('shop: never coin-purchasable, never ad-unlockable, on either build', () => {
    for (const id of TROPHIES) {
      for (const ads of [true, false]) {
        expect(isCoinPurchasable(id, ads), `${id} coins, ads=${ads}`).toBe(false)
        expect(isAdUnlockSkin(id, ads), `${id} ad unlock, ads=${ads}`).toBe(false)
      }
    }
  })

  it('free-reward pool (Daily Rewards / Battle Pass / Honor Track) never offers one', () => {
    const pool = getOfferableSkinPool(() => false)
    for (const id of TROPHIES) expect(pool, id).not.toContain(id)
  })

  it('offerableSkinsForTop drops them and nothing else', () => {
    for (const [top, ids] of Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][]) {
      expect(offerableSkinsForTop(top)).toEqual(ids.filter(id => !TROPHY_SKINS.has(id)))
    }
  })

  it('random NPC skins: getRandomSkinForTop never rolls a trophy (every index tried)', async () => {
    const { models } = await freshImport()
    for (const [top, ids] of Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][]) {
      const seen = new Set<string>()
      for (let k = 0; k < ids.length; k++) {
        vi.spyOn(Math, 'random').mockReturnValue((k + 0.5) / ids.length)
        seen.add(models.getRandomSkinForTop(top))
        vi.restoreAllMocks()
      }
      for (const id of TROPHIES) expect(seen.has(id), `${top} rolled ${id}`).toBe(false)
    }
  })

  it('Skin Chest: with every other skin owned the chest is empty, not a trophy', async () => {
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(ownedKeysExcept(id => TROPHY_SKINS.has(id))))
    const { chest } = await freshImport()
    expect(chest.skinChestHasRewards.value).toBe(false)
    expect(chest.openSkinChest()).toBeNull()
  })

  it('Skin Chest: repeated draws for a fresh player never grant a trophy', async () => {
    // Each draw is a fresh session with the cooldown elapsed; owned skins
    // accumulate in storage, so the pool drains towards the trophies.
    let draws = 0
    for (let i = 0; i < 90; i++) {
      localStorage.setItem('smashers_skin_chest_ready_at', '0')
      const { chest, models } = await freshImport()
      const got = chest.openSkinChest()
      if (!got) break
      models.buySkin(got.topPartId, got.modelId) // the wheel landing the featured skin
      draws++
      expect(isEarnOnlySkin(got.modelId), got.modelId).toBe(false)
    }
    expect(draws).toBeGreaterThan(50)
  })

  it('Battle Pass: a persisted/forged trophy offer is not honoured, and no trophy is drawn', async () => {
    const { models, bp } = await freshImport()
    const pass = bp.default()
    for (let i = 0; i < 40; i++) pass.awardCampaignWin()
    const res = pass.claimStage(10, 'cinder')
    expect(res?.skin).not.toBe('cinder')
    expect(models.isSkinOwned('round', 'cinder')).toBe(false)
  })

  it('Battle Pass: with every other skin owned a skin stage pays coins, never a trophy', async () => {
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(ownedKeysExcept(id => TROPHY_SKINS.has(id))))
    const { models, bp } = await freshImport()
    const pass = bp.default()
    for (let i = 0; i < 40; i++) pass.awardCampaignWin()
    const res = pass.claimStage(10, 'yeti')
    expect(res?.skin ?? null).toBeNull()
    for (const id of TROPHIES) expect(models.isModelFullyOwned(id), id).toBe(false)
  })

  it('the skin picker\'s "+" does not bounce for an unowned trophy alone', async () => {
    localStorage.setItem(SAVE_KEYS.SKINS, JSON.stringify(ownedKeysExcept(id => TROPHY_SKINS.has(id))))
    const { models } = await freshImport()
    for (const top of ['round', 'quadratic', 'triangle'] as TopPartId[]) {
      expect(models.hasUnownedSkinsForTop(top), top).toBe(false)
    }
  })

  // ── Source scan: every file that reads the skin catalog is classified ──
  // A POOL (hands skins out, sells them or rolls them) must apply the flag —
  // through `isEarnOnlySkin`, `offerableSkinsForTop` or `getOfferableSkinPool`.
  // Anything else must say why it is not a pool. A new file that reads the
  // catalog fails until it is classified here.
  const POOLS: Record<string, RegExp> = {
    'src/data/skinCatalog.ts': /if \(isEarnOnlySkin\(modelId\)\) continue/,
    'src/use/useModels.ts': /offerableSkinsForTop\(topPartId\)/,
    'src/use/useSkinChest.ts': /isEarnOnlySkin\(modelId\)/,
    'src/use/useBattlePass.ts': /getOfferableSkinPool\(\)/,
    'src/components/organisms/RouletteWheel.vue': /if \(isEarnOnlySkin\(modelId\)\) continue/,
    'src/components/organisms/BattlePass.vue': /getOfferableSkinPool\(\)/,
    'src/components/organisms/DailyRewards.vue': /getOfferableSkinPool\(\)/,
    'src/components/organisms/SmasherTeamModal.vue': /v-else-if="isEarnOnlySkin\(modelId\)"/
  }
  const NOT_POOLS: Record<string, string> = {
    'src/use/useAssets.ts': 'preloads every skin image',
    'src/use/useSpinnerCampaign.ts': 'maps a campaign enemy to the standard painted skin',
    'src/use/loadoutSanitizer.ts': 'validates a PvP peer\'s model ids',
    'src/components/organisms/PvpVsPreview.vue': 'falls back to a class default skin',
    'src/keys.ts': 'comment only',
    'src/data/smasherSkinCatalog.ts': 'the per-smasher skin ids (never a reward pool, no trophies)',
    'src/utils/save/SaveMergePolicy.ts': 'comment only (progress score)',
    'src/smashers/smasherSkins.ts': 'reads only the default (signature) skin of a top to pick a palette',
    'src/data/smasherRarity.ts': 'presentation-only rarity tier of a skin (trophy skins read as legendary); hands nothing out',
    'src/dev/UiKitPage.vue': 'DEV-only UI kit sheet: shows one portrait in the composites block; hands nothing out',
    'src/dev/UiScreensPage.vue': 'DEV-only composite screens: previews two skins in a sample gift reveal; grants nothing'
  }

  const ROOT = resolve(__dirname, '..')
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const full = join(dir, f)
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|vue)$/.test(f) ? [full] : []
  })
  const catalogReaders = (): string[] => walk(join(ROOT, 'src'))
    .filter(f => /\b(SKINS_PER_TOP|SPINNER_MODEL_IDS|getOfferableSkinPool|SPECIAL_SKINS|AD_UNLOCK_SKINS)\b/.test(readFileSync(f, 'utf8')))
    .map(f => relative(ROOT, f).replace(/\\/g, '/'))

  it('every file that reads the skin catalog is classified as a pool or not', () => {
    const unclassified = catalogReaders().filter(f => !(f in POOLS) && !(f in NOT_POOLS) && f !== 'src/data/bossEncounters.ts')
    expect(unclassified, 'new skin-catalog reader: add it to POOLS (and apply the earn-only flag) or NOT_POOLS').toEqual([])
  })

  it('every pool applies the earn-only flag', () => {
    for (const [file, pattern] of Object.entries(POOLS)) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).toMatch(pattern)
    }
  })
})

describe('trophy skins — grant API', () => {
  it('grants a trophy once (idempotent) under its own top part, and persists it under the save key', async () => {
    const { models } = await freshImport()
    expect(models.isSkinOwned('round', 'cinder')).toBe(false)
    expect(models.grantTrophySkin('cinder')).toBe(true)
    expect(models.isSkinOwned('round', 'cinder')).toBe(true)
    expect(models.grantTrophySkin('cinder')).toBe(false)
    const stored = JSON.parse(localStorage.getItem(SAVE_KEYS.SKINS) ?? '[]') as string[]
    expect(stored.filter(k => k === 'round:cinder')).toHaveLength(1)
  })

  it('refuses anything that is not a trophy (no back door for regular skins)', async () => {
    const { models } = await freshImport()
    expect(models.grantTrophySkin('wasp')).toBe(false)
    expect(models.grantTrophySkin('rainbow')).toBe(false)
    expect(models.isSkinOwned('star', 'wasp')).toBe(false)
    expect(localStorage.getItem(SAVE_KEYS.SKINS)).toBeNull()
  })

  it('grantTrophySkins returns only the newly unlocked ones, in order', async () => {
    const { models } = await freshImport()
    models.grantTrophySkin('frost-vault')
    expect(models.grantTrophySkins(['cinder', 'frost-vault', 'yeti'])).toEqual(['cinder', 'yeti'])
    expect(models.grantTrophySkins(['cinder', 'frost-vault', 'yeti'])).toEqual([])
  })

  it('survives a reload (a fresh module graph reads it back from storage) and can be equipped', async () => {
    const first = await freshImport()
    first.models.grantTrophySkin('yeti')
    const { models } = await freshImport()
    expect(models.isSkinOwned('triangle', 'yeti')).toBe(true)
    expect(models.ownedSkinsForTop('triangle')).toContain('yeti')
    models.selectSkin('triangle', 'yeti')
    expect(models.getSelectedSkin('triangle')).toBe('yeti')
  })

  it('rides the save system: the key is cloud payload and the skin scores as progress', async () => {
    const { models } = await freshImport()
    expect(isPayloadKey(SAVE_KEYS.SKINS)).toBe(true)
    const before = computeMeta({ get: (k) => localStorage.getItem(k) }).progressScore
    models.grantTrophySkin('cinder')
    const after = computeMeta({ get: (k) => localStorage.getItem(k) }).progressScore
    expect(after).toBeGreaterThan(before)
  })
})
