// Skin catalog guards — written for the 24-skin expansion (2026-09), kept as a
// permanent contract for every skin added after it.
//
//   1. APPEND-ONLY. Every class list in SKINS_PER_TOP, and SPINNER_MODEL_IDS,
//      must start with the legacy lists below, in the same order. The default
//      skin of a class is index 0 (always owned, the fallback for
//      getSelectedSkin), and saves persist offers/ownership by model id —
//      reordering or inserting in the middle would change the default and
//      whatever an index-based consumer picks.
//   2. NO BROKEN SKIN SHIPS. Every catalog id has its image in
//      public/images/models, so a skin can never be listed (shop, rewards,
//      NPC pick, leaderboard avatar) before it is painted.
//   3. Every catalog id has a display name in EVERY locale file.
//   4. The expansion skins are REGULAR (not SPECIAL_SKINS), so they
//      join the free reward pools.
//   5. Offers already shown to an existing save stay valid: every legacy skin
//      that was offerable is still offerable with the expanded catalog, so the
//      "keep the persisted offer if still offerable" rule in BattlePass.vue /
//      DailyRewards.vue keeps it.
//
// Pure-catalog imports only (no useModels) — see the useMatch↔useModels↔useUser
// import-cycle note in tests/useBattlePassSkinClaim.test.ts.

import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SKINS_PER_TOP,
  SPINNER_MODEL_IDS,
  SPECIAL_SKINS,
  SPECIAL_SKIN_COST,
  skinCost,
  isCoinPurchasable,
  getOfferableSkinPool,
  type SpinnerModelId
} from '@/data/skinCatalog'
import type { TopPartId } from '@/types/spinner'
import en from '@/i18n/locales/en'

const LEGACY_MODEL_IDS = [
  'fire', 'phoenix', 'thunder', 'bluedragon', 'turtle',
  'ice', 'chip', 'mysticaleye', 'nature', 'wulf',
  'castle', 'eagle', 'prisma', 'scorpion', 'shell',
  'snake', 'tornado', 'angelic', 'galaxy', 'gear',
  'mountain', 'shield', 'spiky-eagle', 'ape', 'axe',
  'bear', 'blades', 'chain', 'dark', 'demon',
  'forest-dragon', 'golden-eagle', 'hawk', 'piranha',
  'rainbow', 'reddragon', 'rhino', 'salamaner', 'sandstorm',
  'teleporter', 'thunderstorm', 'tsunami', 'wasp', 'wolf-demon',
  'boulder', 'diamond'
]

const LEGACY_SKINS_PER_TOP: Record<TopPartId, string[]> = {
  star: ['blades', 'ice', 'wasp', 'reddragon', 'chain', 'axe', 'tornado'],
  triangle: ['thunder', 'snake', 'phoenix', 'eagle', 'spiky-eagle', 'salamaner', 'thunderstorm'],
  round: ['nature', 'turtle', 'piranha', 'bear', 'galaxy', 'golden-eagle', 'wolf-demon', 'dark'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic', 'tsunami', 'prisma', 'forest-dragon', 'rainbow'],
  cushioned: ['shell', 'shield', 'castle', 'mountain', 'gear', 'sandstorm', 'diamond', 'boulder'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk', 'rhino', 'ape', 'teleporter']
}

// EVERY locale file the game ships — discovered, not listed, so a locale added
// later (the language set is growing) is held to the same rule.
const LOCALES: Record<string, any> = Object.fromEntries(
  Object.entries(import.meta.glob('../src/i18n/locales/*.ts', { eager: true, import: 'default' }))
    .map(([file, mod]) => [file.replace(/^.*\/|\.ts$/g, ''), mod])
)
const MODELS_DIR = resolve(__dirname, '..', 'public', 'images', 'models')

const allCatalogIds = (): SpinnerModelId[] => [...new Set(Object.values(SKINS_PER_TOP).flat())]
const newIds = (): SpinnerModelId[] =>
  (SPINNER_MODEL_IDS as readonly string[]).filter(id => !LEGACY_MODEL_IDS.includes(id)) as SpinnerModelId[]

describe('skin catalog — append-only', () => {
  it('SPINNER_MODEL_IDS starts with the legacy ids in their legacy order', () => {
    expect(SPINNER_MODEL_IDS.slice(0, LEGACY_MODEL_IDS.length)).toEqual(LEGACY_MODEL_IDS)
  })

  it('every class list starts with its legacy list (same default, same order)', () => {
    for (const [top, legacy] of Object.entries(LEGACY_SKINS_PER_TOP) as [TopPartId, string[]][]) {
      expect(SKINS_PER_TOP[top].slice(0, legacy.length), `${top} was reordered`).toEqual(legacy)
      expect(SKINS_PER_TOP[top][0], `${top} default changed`).toBe(legacy[0])
    }
  })

  it('every class-list id is a declared model id, and no id is listed twice', () => {
    const declared = new Set<string>(SPINNER_MODEL_IDS)
    const seen = new Set<string>()
    for (const [top, list] of Object.entries(SKINS_PER_TOP)) {
      for (const id of list) {
        expect(declared.has(id), `${top}:${id} not in SPINNER_MODEL_IDS`).toBe(true)
        expect(seen.has(id), `${id} listed under two tops`).toBe(false)
        seen.add(id)
      }
    }
  })

  it('every id added after the legacy set is in exactly one class list', () => {
    const listed = new Set<string>(allCatalogIds())
    for (const id of newIds()) expect(listed.has(id), `${id} declared but in no class`).toBe(true)
  })
})

describe('skin catalog — nothing ships unpainted or unnamed', () => {
  it('every catalog skin has its image file', () => {
    for (const id of new Set<string>([...SPINNER_MODEL_IDS, ...allCatalogIds()])) {
      const file = resolve(MODELS_DIR, `${id}_256x256.webp`)
      expect(existsSync(file), `missing image ${file}`).toBe(true)
      expect(statSync(file).size, `${id} image is suspiciously small`).toBeGreaterThan(2000)
    }
  })

  it('the skins name block has the SAME keys in every locale (no language left behind)', () => {
    expect(Object.keys(LOCALES).length, 'locale discovery found too few files').toBeGreaterThanOrEqual(8)
    const enKeys = Object.keys(en.skins).sort()
    for (const [name, loc] of Object.entries(LOCALES)) {
      expect(Object.keys(loc.skins).sort(), `${name}.skins keys differ from en.skins`).toEqual(enKeys)
    }
  })

  it('every catalog skin has a display name in every locale', () => {
    for (const id of allCatalogIds()) {
      for (const [name, loc] of Object.entries(LOCALES)) {
        const val = loc?.skins?.[id]
        expect(typeof val, `${name}.skins.${id} missing`).toBe('string')
        expect(val.trim().length, `${name}.skins.${id} empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe('skin catalog — expansion skins are regular and offerable', () => {
  it('new skins are regular (not special): ad-unlock on ad builds, 3x special price otherwise', () => {
    for (const id of newIds()) {
      expect(SPECIAL_SKINS.has(id), `${id} should be a regular skin`).toBe(false)
      expect(skinCost(id)).toBe(SPECIAL_SKIN_COST * 3)
      expect(isCoinPurchasable(id, true), `${id} must not be coin-purchasable on an ad build`).toBe(false)
      expect(isCoinPurchasable(id, false), `${id} must be coin-purchasable without ads`).toBe(true)
    }
  })

  it('new skins join the free-reward pool for a player who owns none of them', () => {
    const pool = new Set(getOfferableSkinPool(() => false))
    for (const id of newIds()) expect(pool.has(id), `${id} not offerable`).toBe(true)
  })

  it('an offer persisted from the legacy catalog is still offerable (so it is kept, not re-rolled)', () => {
    // What an existing save can hold: offers drawn from the legacy pool.
    const legacyOfferable = Object.values(LEGACY_SKINS_PER_TOP).flat()
      .filter(id => !SPECIAL_SKINS.has(id as SpinnerModelId))
    const pool = new Set<string>(getOfferableSkinPool(() => false))
    for (const id of legacyOfferable) expect(pool.has(id), `${id} dropped from the pool`).toBe(true)
    // …and ownership still removes exactly that skin, nothing else.
    const owned = new Set<string>(['wasp', 'chip'])
    const after = getOfferableSkinPool(id => owned.has(id))
    expect(after).not.toContain('wasp')
    expect(after).not.toContain('chip')
    expect(after.length).toBe(pool.size - 2)
  })
})
