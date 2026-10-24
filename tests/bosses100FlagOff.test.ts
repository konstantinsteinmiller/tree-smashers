// ─── Bosses100 flag OFF: the feature is gone at runtime ─────────────────────
//
// VITE_APP_FEATURE_BOSSES100=false (batch 4, user decision A) must remove the
// stage-101+ boss feature, not hide it. With the flag off this suite proves,
// on the real modules:
//   • no feature module is ever LOADED — each is mocked with a factory that
//     records the load, so a stray static or dynamic import in a flag-off path
//     fails here (the bundle-level twin: tests/platforms/bosses100FlagPurity);
//   • the gate hands out null handles and null loaders;
//   • stages 110…200 and every cycle repeat are the OLD boss copies, byte for
//     byte (all 600 ids against the fixture captured before the feature);
//   • the engine refuses a trait port and never runs a trait, even for a
//     roster that carries one — no HUD row, nothing hashed, no SFX request;
//   • the boss peek names no encounter and no trait;
//   • the mounted arena at stage 110 shows the old boss, no intro card / trait
//     chip / trophy card, hides the UNOWNED trophy cards in the skin shop while
//     an owned one stays, and asks for no boss SFX.
// (tests/bosses100FlagOn.test.ts mounts the same arena with the flag ON and
// sees the trophy card + port, so "none of them" here is not vacuous.)

import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './helpers/bosses100OffBuild'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena } from './helpers/arenaHarness'

// A returning player sitting on stage 110 (the Cinder Tyrant's slot on a
// bosses100 build), owning ONE trophy skin (frost-vault) but not the others.
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

// ── Every feature module records its own load ──────────────────────────────
const loaded = vi.hoisted(() => [] as string[])
vi.mock('@/use/bosses/bossTraitEngine', () => {
  loaded.push('bossTraitEngine')
  return {}
})
vi.mock('@/use/bosses/bossTraits', () => {
  loaded.push('bossTraits')
  return {}
})
vi.mock('@/use/bosses/bossTraitVfx', () => {
  loaded.push('bossTraitVfx')
  return {}
})
vi.mock('@/use/bosses/bossTraitSfx', () => {
  loaded.push('bossTraitSfx')
  return {}
})
vi.mock('@/use/bosses/bossArenaUi', () => {
  loaded.push('bossArenaUi')
  return {}
})
vi.mock('@/use/bosses/bossLab', () => {
  loaded.push('bossLab')
  return {}
})
vi.mock('@/components/atoms/BossIntroCard.vue', () => {
  loaded.push('BossIntroCard')
  return {}
})
vi.mock('@/components/atoms/BossTraitGlyph.vue', () => {
  loaded.push('BossTraitGlyph')
  return {}
})
vi.mock('@/components/atoms/BossTrophyCard.vue', () => {
  loaded.push('BossTrophyCard')
  return {}
})
vi.mock('@/components/organisms/BossLabModal.vue', () => {
  loaded.push('BossLabModal')
  return {}
})

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/campaignStages.preBosses100.json'), 'utf8')
) as { hashes: Record<string, string> }
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

/** Every boss-feature surface the arena, peek badge and Team modal can show. */
const BOSS_DOM = [
  '[data-boss-intro]', '[data-boss-trophy]', '[data-boss-peek-traits]', '.blade-stat-ice',
  '.blade-chill-pips', '[data-frozen-hint]', '.boss-peek__crest'
] as const

// ── Gate ────────────────────────────────────────────────────────────────────

describe('bosses gate, flag off', () => {
  it('BOSSES100_BUILD is false; every UI handle is null; every loader resolves to nothing', async () => {
    const gate = await import('@/bosses/bosses100Gate')
    expect(gate.BOSSES100_BUILD).toBe(false)
    for (const handle of [gate.BossIntroCardUi, gate.BossTraitGlyphUi, gate.BossTrophyCardUi, gate.BossLabUi]) {
      expect(handle).toBeNull()
    }
    expect(await gate.loadBossTraitEngine()).toBeNull()
    expect(await gate.loadBossArenaUi()).toBeNull()
    expect(loaded).toEqual([])
  })
})

// ── Campaign ────────────────────────────────────────────────────────────────

describe('campaign, flag off', () => {
  it('every stage 1…600 — the encounter slots 110…200 and their repeats included — is the pre-feature stage', async () => {
    const { getStageById, STAGES } = await import('@/use/useSpinnerCampaign')
    for (let id = 1; id <= 600; id++) {
      expect(hash(getStageById(id)), `stage ${id}`).toBe(fixture.hashes[String(id)])
    }
    for (const id of [110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 310, 400, 510, 600]) {
      const st = getStageById(id)
      expect(st.bossEncounterId, `stage ${id}`).toBeUndefined()
      expect(st.name).toBe(`stage_${((id - 1) % 100) + 1}`)
      for (const c of st.enemyTeam) {
        expect(c.bossTrait).toBeUndefined()
        expect(c.shardTrait).toBeUndefined()
      }
    }
    expect(STAGES.filter(s => s.bossEncounterId)).toEqual([])
    expect(loaded).toEqual([])
  })

  it('the boss peek names no encounter and no trait', async () => {
    const { getBossPeek } = await import('@/use/bossPeek')
    for (let won = 101; won <= 200; won++) {
      const peek = getBossPeek({ wonStageId: won, result: 'win', mode: 'campaign' })
      if (!peek) continue
      expect(peek.encounterId, `won ${won}`).toBeUndefined()
      expect(peek.traits).toBeUndefined()
    }
  })
})

// ── Engine ──────────────────────────────────────────────────────────────────

describe('engine, flag off', () => {
  it('refuses a trait port and never runs a trait, even for a roster that carries one', async () => {
    const game = await import('@/use/useSpinnerGame')
    const hasBossTraits = vi.fn(() => true)
    game.installBossTraitEngine({ hasBossTraits } as never)
    expect(game.hasBossTraitEngine()).toBe(false)
    const e = game.useSpinnerGame()
    const me = { topPartId: 'round', bottomPartId: 'balanced', topLevel: 20, bottomLevel: 20 } as const
    e.initGame([{ ...me }, { ...me }], [
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 22, bottomLevel: 22, isBoss: true, bossTrait: 'ember' },
      {
        topPartId: 'quadratic',
        bottomPartId: 'speedy',
        topLevel: 22,
        bottomLevel: 22,
        isBoss: true,
        bossTrait: 'frost',
        shardTrait: 'chill'
      }
    ], false, 'boss', false, undefined, null, 'circle', { seed: 5 })
    expect(hasBossTraits).not.toHaveBeenCalled()
    expect(e.traitsActive()).toBe(false)
    expect(e.bossTraitHud.value).toEqual([])
    expect(e.bossClockMs()).toBe(0)
    expect(e.novaCharge()).toBe(0)
    expect(e.forEachBossTraitEvent(0, () => {
      throw new Error('no trait event')
    })).toBe(0)
    // Nothing trait-related is hashed (a bosses100 build appends "#…" / "clk:").
    const h = e.computeStateHash()
    expect(typeof h).toBe('string')
    for (const b of e.allBlades.value) {
      expect(b.chillN).toBeUndefined()
      expect(b.lockKind).toBeUndefined()
    }
    e.disposePhysics?.()
    expect(loaded).toEqual([])
  })
})

// ── The mounted arena ───────────────────────────────────────────────────────

describe('SpinnerArena at stage 110, flag off', () => {
  it('shows the old boss, no boss surface, only OWNED trophy cards, requests no boss SFX, loads no feature module', async () => {
    const en = (await import('@/i18n/locales/en')).default as { stages: Record<string, string> }
    const arena = await mountArena(SEED)
    try {
      await arena.settle(500)
      const badge = document.querySelector('.stage-badge')?.textContent ?? ''
      expect(badge).toContain('110')
      expect(badge).toContain(en.stages.stage_10)
      expect(badge).not.toContain(en.stages.boss_cinder_tyrant)
      for (const sel of BOSS_DOM) expect(document.querySelector(sel), sel).toBeNull()

      // Team modal → every team smasher's colourway picker: the unowned trophies (cinder,
      // yeti) are hidden, the owned one (frost-vault) stays listed.
      await arena.openTeam()
      await arena.settle(200)
      const seen = new Set<string>()
      // Team modal: select each team slot's smasher, then open its colourway picker.
      const slots = [...document.querySelectorAll('.team-slot')] as HTMLElement[]
      expect(slots.length).toBeGreaterThan(0)
      for (const slot of slots) {
        slot.click()
        await arena.settle(30)
        ;(document.querySelector('.skin-plus-btn') as HTMLElement | null)?.click()
        await arena.settle(60)
        for (const img of document.querySelectorAll('.skin-card img')) seen.add(img.getAttribute('alt') ?? '')
      }
      expect(seen.has('frost-vault')).toBe(true)
      expect(seen.has('cinder')).toBe(false)
      expect(seen.has('yeti')).toBe(false)
      // 2026-10-23: the old colourway list is gone from the picker — each smasher lists its
      // free default and its ONE own skin (`<smasher>-skin`) instead.
      expect(seen.has('turtle')).toBe(false)
      expect(seen.has('prisma')).toBe(false)
      expect([...seen].some(alt => alt.endsWith('-skin'))).toBe(true)
      for (const sel of BOSS_DOM) expect(document.querySelector(sel), sel).toBeNull()
    } finally {
      arena.unmount()
    }
    expect(arena.requested.filter(u => /boss-(ember|freeze|crack|chill)/.test(u))).toEqual([])
    expect(JSON.parse(localStorage.getItem('smashers_owned_skins') ?? '[]')).toEqual(['quadratic:frost-vault'])
    expect(loaded).toEqual([])
  }, 60_000)
})
