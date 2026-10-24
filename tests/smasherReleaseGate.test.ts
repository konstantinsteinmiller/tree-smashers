// Smasher release gate (owner 2026-10-22: "put emphasis on smashers 1–24 for
// now and put the other smashers for a later release"). Pinned here:
//   • the released list (Bramble … Gastro) and the flag override;
//   • roster recruitment: a held-back smasher's stage recruits nothing;
//   • the legendary unlock list is Tuskar … Gastro; held-back ones are never
//     unlockable;
//   • enemies (campaign NPC looks, skin portraits, PvP bots, league ghosts)
//     only ever field released smashers;
//   • migration: a save that already owns a held-back smasher keeps it;
//   • the team modal shows released smashers + the "coming soon" card.
//
// `useUser` is imported FIRST (useMatch ↔ useModels ↔ useUser import cycle).

import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RELEASED_SMASHER_COUNT,
  RELEASED_SMASHER_IDS,
  SMASHER_IDS,
  SMASHERS,
  UNRELEASED_SMASHER_IDS,
  isReleasedSmasher,
  parseReleasedSmasherCount,
  releasedSmasherFallback,
  smasherConfig,
  smasherForParts
} from '@/data/smasherCatalog'
import { RELEASED_PREMIUM_SMASHER_IDS } from '@/data/premiumSmashers'
import { smasherForSkin } from '@/smashers/smasherSkins'
import { SPINNER_MODEL_IDS } from '@/data/skinCatalog'
import { buildBotTeam } from '@/use/pvpBots'
import { sanitizePvpTeam } from '@/use/loadoutSanitizer'
import { TOP_PART_IDS, BOTTOM_PART_IDS } from '@/types/spinner'
import { PREMIUM_SMASHERS_KEY } from '@/keys'

const FIRST_24 = [
  'bramble', 'thumper', 'grizzle', 'chomper', 'ramsey', 'vixie', 'shellby', 'pecks', 'mossy', 'zippy', 'hootsie', 'tuskar',
  'brock', 'bandit', 'croaky', 'slinky', 'digger', 'snooze', 'pongo', 'pincer', 'rolly', 'prickles', 'newtie', 'gastro'
]

const fresh = async () => {
  vi.resetModules()
  await import('@/use/useUser')
  const status = await import('@/use/useSaveStatus')
  status.hydrateState.value = 'success-with-data'
  const premium = await import('@/use/premiumSmashers')
  const smashers = await import('@/use/useSmashers')
  return { status, premium, smashers }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('release gate — the list and the flag', () => {
  it('releases the first 24 smashers in unlock order by default', () => {
    expect(DEFAULT_RELEASED_SMASHER_COUNT).toBe(24)
    expect([...RELEASED_SMASHER_IDS]).toEqual(FIRST_24)
    expect(UNRELEASED_SMASHER_IDS.length).toBe(SMASHER_IDS.length - 24)
    expect(UNRELEASED_SMASHER_IDS[0]).toBe('humphrey')
    expect(UNRELEASED_SMASHER_IDS.at(-1)).toBe('blubbo')
    expect(isReleasedSmasher('gastro')).toBe(true)
    expect(isReleasedSmasher('humphrey')).toBe(false)
  })

  it('parses the flag: unset / invalid → 24, "all" → 48, N → N (clamped)', () => {
    expect(parseReleasedSmasherCount(undefined)).toBe(24)
    expect(parseReleasedSmasherCount('')).toBe(24)
    expect(parseReleasedSmasherCount('yes')).toBe(24)
    expect(parseReleasedSmasherCount('0')).toBe(24)
    expect(parseReleasedSmasherCount('all')).toBe(SMASHER_IDS.length)
    expect(parseReleasedSmasherCount('30')).toBe(30)
    expect(parseReleasedSmasherCount('999')).toBe(SMASHER_IDS.length)
  })

  it('VITE_APP_SMASHERS_RELEASED=all opens the whole catalog', async () => {
    vi.stubEnv('VITE_APP_SMASHERS_RELEASED', 'all')
    vi.resetModules()
    const cat = await import('@/data/smasherCatalog')
    expect(cat.RELEASED_SMASHER_IDS.length).toBe(SMASHER_IDS.length)
    expect(cat.UNRELEASED_SMASHER_IDS.length).toBe(0)
    const prem = await import('@/data/premiumSmashers')
    expect(prem.RELEASED_PREMIUM_SMASHER_IDS).toEqual(prem.PREMIUM_SMASHER_IDS)
    const { smashers } = await fresh()
    expect(smashers.isSmasherUnlocked('humphrey', 120)).toBe(true)
  })
})

describe('release gate — campaign unlocks and the legendary list', () => {
  it('a held-back smasher is never recruited by reaching its stage', async () => {
    const { premium, smashers } = await fresh()
    for (let s = 1; s <= 300; s++) premium.settlePremiumSmashers(s)
    expect(smashers.unlockedSmashers(300)).toEqual(FIRST_24)
    for (const id of UNRELEASED_SMASHER_IDS) {
      expect(smashers.isSmasherUnlocked(id, 300)).toBe(false)
      expect(smashers.isSmasherRecruited(id, 300)).toBe(false)
      expect(premium.isPremiumUnlockable(id, 300)).toBe(false)
      expect(premium.unlockPremiumSmasher(id, 300)).toBe(false)
    }
    expect(smashers.recruitedSmashers(300).every(isReleasedSmasher)).toBe(true)
    expect(smashers.fieldTeamIds([], 3, 300).every(isReleasedSmasher)).toBe(true)
  })

  it('the legendary unlock list is Tuskar … Gastro', async () => {
    expect(RELEASED_PREMIUM_SMASHER_IDS[0]).toBe('tuskar')
    expect(RELEASED_PREMIUM_SMASHER_IDS.at(-1)).toBe('gastro')
    expect(RELEASED_PREMIUM_SMASHER_IDS.length).toBe(13)
    const { premium } = await fresh()
    for (let s = 1; s <= 300; s++) premium.settlePremiumSmashers(s)
    expect(premium.isPremiumUnlockable('gastro', 300)).toBe(true)
  })
})

describe('release gate — migration (nothing is taken away)', () => {
  it('a save that owns a held-back smasher keeps it recruited', async () => {
    localStorage.setItem(PREMIUM_SMASHERS_KEY, JSON.stringify({ v: 1, own: ['tuskar', 'humphrey'], at: 130 }))
    localStorage.setItem('smashers_stage', '130')
    const { premium, smashers } = await fresh()
    premium.settlePremiumSmashers(130)
    expect(smashers.isSmasherRecruited('humphrey', 130)).toBe(true)
    expect(smashers.recruitedSmashers(130)).toContain('humphrey')
    // … but the held-back smashers it never owned stay out
    expect(smashers.isSmasherRecruited('boxa', 130)).toBe(false)
  })

  it('a legacy save (no record) at a late stage keeps every smasher it reached', async () => {
    const { premium, smashers } = await fresh()
    premium.settlePremiumSmashers(122)
    expect(smashers.isSmasherRecruited('humphrey', 122)).toBe(true)
    expect(smashers.isSmasherRecruited('boxa', 122)).toBe(false)
  })

  it('a late cloud save with a record gets no held-back smasher from the gap', async () => {
    localStorage.setItem(PREMIUM_SMASHERS_KEY, JSON.stringify({ v: 1, own: [], at: 10 }))
    const { premium, smashers } = await fresh()
    const granted = premium.settlePremiumSmashers(200)
    expect(granted).toContain('gastro')
    expect(granted.every(isReleasedSmasher)).toBe(true)
    expect(smashers.isSmasherRecruited('humphrey', 200)).toBe(false)
  })
})

describe('release gate — enemies use released smashers only', () => {
  it('campaign NPC looks (smasherForParts) and skin portraits', () => {
    for (const top of Object.values(TOP_PART_IDS)) {
      for (const bottom of Object.values(BOTTOM_PART_IDS)) {
        for (const seed of ['a', 'npc_7', 'boss', 'x1', 'y22']) expect(isReleasedSmasher(smasherForParts(top, bottom, seed))).toBe(true)
      }
    }
    for (const m of SPINNER_MODEL_IDS) expect(isReleasedSmasher(smasherForSkin(m))).toBe(true)
  })

  it('PvP bots draw from released smashers, even from a pool that names held-back ones', () => {
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let k = 0; k < 200; k++) {
      const team = buildBotTeam({ rand, playerTeam: [smasherConfig('bramble', 5), smasherConfig('thumper', 5), smasherConfig('grizzle', 5)], pool: [...UNRELEASED_SMASHER_IDS] })
      expect(team.length).toBe(3)
      expect(team.every(c => isReleasedSmasher(c.smasherId))).toBe(true)
    }
  })

  it('league ghosts: a held-back smasher maps to a released stand-in of its archetype', () => {
    for (const id of UNRELEASED_SMASHER_IDS) {
      const fb = releasedSmasherFallback(id)
      expect(isReleasedSmasher(fb)).toBe(true)
      expect(SMASHERS[fb].archetype.top).toBe(SMASHERS[id].archetype.top)
      expect(releasedSmasherFallback(id)).toBe(fb) // deterministic
    }
    expect(releasedSmasherFallback('gastro')).toBe('gastro')
    const ghost = sanitizePvpTeam([{ smasherId: 'humphrey', level: 12 }, { smasherId: 'bramble', level: 3 }], { teamSize: 2, releasedOnly: true })
    expect(ghost.map(c => c.smasherId)).toEqual([releasedSmasherFallback('humphrey'), 'bramble'])
    expect(ghost[0]!.level).toBe(12)
    // live PvP peers are not remapped (a grandfathered player keeps fielding its own)
    expect(sanitizePvpTeam([{ smasherId: 'humphrey', level: 12 }], { teamSize: 2 })[0]!.smasherId).toBe('humphrey')
  })
})

describe('release gate — team modal', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  const mountAt = async (bestStage: number) => {
    const env = await fresh()
    for (let s = 1; s <= bestStage; s++) env.premium.settlePremiumSmashers(s)
    const { default: SmasherTeamModal } = await import('@/components/organisms/SmasherTeamModal.vue')
    const w = mount(SmasherTeamModal, {
      props: { modelValue: true, initialTeam: [smasherConfig('bramble', 1), smasherConfig('thumper', 1)], bestStage },
      global: { plugins: [i18n()], stubs: { teleport: true, BGSkinButton: true } },
      attachTo: document.body
    })
    await flushPromises()
    return w
  }

  it('lists released smashers only, plus the coming-soon card', async () => {
    const w = await mountAt(5)
    for (const id of FIRST_24) expect(w.find(`[data-testid="roster-${id}"]`).exists()).toBe(true)
    for (const id of UNRELEASED_SMASHER_IDS) expect(w.find(`[data-testid="roster-${id}"]`).exists()).toBe(false)
    expect(w.find('[data-testid="roster-coming-soon"]').exists()).toBe(true)
    w.unmount()
  })

  it('shows a grandfathered held-back smasher', async () => {
    localStorage.setItem(PREMIUM_SMASHERS_KEY, JSON.stringify({ v: 1, own: ['humphrey'], at: 130 }))
    localStorage.setItem('smashers_stage', '130')
    const w = await mountAt(130)
    expect(w.find('[data-testid="roster-humphrey"]').exists()).toBe(true)
    expect(w.find('[data-testid="roster-boxa"]').exists()).toBe(false)
    w.unmount()
  })
})
