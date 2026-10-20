// ─── Bosses100 flag ON: the same arena shows the feature ────────────────────
//
// The counterpart of tests/bosses100FlagOff.test.ts: the identical mount (a
// player on stage 110 owning only the frost-vault trophy), with the flag ON,
// fields the Cinder Tyrant, installs the engine's trait port through the gate
// and lists the unowned trophy cards with their "Beat stage N" hint — so the
// off-suite's "absent" assertions are proven live, not vacuous. The traits,
// VFX, trophies and intro card themselves are exercised by the boss suites
// (bossTraitsEngine, bossTraitVfxEngine, bossArenaUi).

import { describe, it, expect, vi } from 'vitest'
import './helpers/bosses100Build'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena } from './helpers/arenaHarness'

const SEED: Record<string, string> = vi.hoisted(() => {
  const seed: Record<string, string> = {
    smashers_campaign_stage: '110',
    smashers_player_max_stage: '110',
    smashers_coins: '5000',
    smashers_first_win: '1',
    smashers_intro_seen: '1',
    smashers_config_opened: '1',
    smashers_player_team: JSON.stringify([
      { topPartId: 'round', bottomPartId: 'balanced' },
      { topPartId: 'quadratic', bottomPartId: 'balanced' }
    ]),
    smashers_owned_skins: JSON.stringify(['quadratic:frost-vault'])
  }
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  return seed
})

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

describe('SpinnerArena at stage 110, flag on', () => {
  it('fields the encounter, installs the trait port and lists the unowned trophy cards', async () => {
    const gate = await import('@/bosses/bosses100Gate')
    expect(gate.BOSSES100_BUILD).toBe(true)
    const game = await import('@/use/useSpinnerGame')
    const en = (await import('@/i18n/locales/en')).default as { stages: Record<string, string> }
    const arena = await mountArena(SEED)
    try {
      await arena.settle(500)
      expect(game.hasBossTraitEngine()).toBe(true)
      const badge = document.querySelector('.stage-badge')?.textContent ?? ''
      expect(badge).toContain('110')
      expect(badge).toContain(en.stages.boss_cinder_tyrant)

      await arena.openTeam()
      await arena.settle(200)
      const seen = new Set<string>()
      let cinderHint = false
      // Team modal: select each team slot's smasher, then open its colourway picker.
      const slots = [...document.querySelectorAll('.team-slot')] as HTMLElement[]
      expect(slots.length).toBeGreaterThan(0)
      for (const slot of slots) {
        slot.click()
        await arena.settle(30)
        ;(document.querySelector('.skin-plus-btn') as HTMLElement | null)?.click()
        await arena.settle(60)
        for (const img of document.querySelectorAll('.skin-card img')) seen.add(img.getAttribute('alt') ?? '')
        // The unowned card is the earn-only hint ("Beat stage 110"), never a price.
        const cinder = [...document.querySelectorAll('.skin-card')].find(c => c.querySelector('img[alt="cinder"]'))
        if (cinder?.querySelector('[role="note"]')?.textContent?.includes('110')) cinderHint = true
      }
      expect(seen.has('frost-vault')).toBe(true)
      expect(seen.has('cinder')).toBe(true)
      expect(cinderHint).toBe(true)
    } finally {
      arena.unmount()
    }
  }, 60_000)
})
