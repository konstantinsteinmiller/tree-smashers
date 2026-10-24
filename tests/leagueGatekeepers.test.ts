// @vitest-environment node
// ─── League gatekeepers (LG7) ───────────────────────────────────────────────
//
// src/league/leagueGatekeepers.ts on both bosses100 builds (the bosses gate
// reads its flag once, at evaluation — so each build is a fresh module graph):
//   • mapping: Bronze split / Silver healers / Gold thunder (classic) and
//     Platinum cinder_tyrant / Diamond glacier_warden / Champion
//     elemental_court (encounters) — or the classic stand-ins when bosses100
//     is off;
//   • gate stages are pure, deterministic and at FIXED levels (never the
//     player's upgrades); id −1, rewards 0;
//   • traits reach initGame through the campaign's stage → config path;
//   • the card view carries name + badge, never a level (LM4);
//   • buildCheatBossStage still returns byte-identical stages after the
//     buildAbilityBossStage extraction (fixture captured before LG7);
//   • the league sim's rosters are the real builder's rosters.

import { describe, it, expect, vi, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ABILITY_ROSTERS, CLASSIC_ROSTERS } from '../tools/skills-sim/league.mjs'

type Gk = typeof import('@/league/leagueGatekeepers')
type Campaign = typeof import('@/use/useSpinnerCampaign')
type Math_ = typeof import('@/league/leagueMath')

const build = async (bosses100: boolean): Promise<{ gk: Gk; campaign: Campaign; math: Math_ }> => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_BOSSES100', bosses100 ? 'true' : 'false')
  const [gk, campaign, math] = await Promise.all([
    import('@/league/leagueGatekeepers'),
    import('@/use/useSpinnerCampaign'),
    import('@/league/leagueMath')
  ])
  return { gk, campaign, math }
}

afterAll(() => {
  vi.unstubAllEnvs()
})

const ALL_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'] as const

const HIGH_UPGRADES = {
  tops: { star: 60, triangle: 61, round: 58, quadratic: 64, cushioned: 59, piercer: 62 },
  bottoms: { speedy: 50, tanky: 67, balanced: 53 }
}

describe('bosses100 ON build', () => {
  it('maps every promotion to its gatekeeper (B6 + O7)', async () => {
    const { gk } = await build(true)
    expect(gk.GATE_TIERS).toEqual(ALL_TIERS)
    const specs = Object.fromEntries(ALL_TIERS.map(t => {
      const s = gk.gatekeeperSpecFor(t)
      return [t, s.kind === 'ability' ? s.ability : s.encounterId]
    }))
    expect(specs).toEqual({
      bronze: 'split',
      silver: 'healers',
      gold: 'thunder',
      platinum: 'cinder_tyrant',
      diamond: 'glacier_warden',
      champion: 'elemental_court'
    })
    expect(gk.LEAGUE_GATEKEEPER_ENCOUNTERS).toEqual({ platinum: 'cinder_tyrant', diamond: 'glacier_warden', champion: 'elemental_court' })
    expect(() => gk.gatekeeperSpecFor('wood' as never)).toThrow()
  })

  it('gate stages: id −1, rewards 0, every part at GATEKEEPER_LEVEL — never the player\'s upgrades', async () => {
    const { gk, campaign, math } = await build(true)
    const before = ALL_TIERS.map(t => gk.gatekeeperStageFor(t))
    campaign.default().playerUpgrades.value = JSON.parse(JSON.stringify(HIGH_UPGRADES))
    const after = ALL_TIERS.map(t => gk.gatekeeperStageFor(t))
    expect(after).toEqual(before)
    ALL_TIERS.forEach((tier, i) => {
      const st = after[i]!
      expect(st.id).toBe(-1)
      expect(st.rewardWin).toBe(0)
      expect(st.rewardLose).toBe(0)
      expect(st.isBoss).toBe(true)
      expect(st.enemyTeam.length).toBeGreaterThan(0)
      for (const cfg of st.enemyTeam) {
        expect([cfg.topLevel, cfg.bottomLevel], tier).toEqual([math.GATEKEEPER_LEVEL[tier], math.GATEKEEPER_LEVEL[tier]])
        expect(cfg.isBoss).toBe(true)
      }
    })
  })

  it('is deterministic: deep-equal stages, never a shared object', async () => {
    const { gk } = await build(true)
    for (const tier of ALL_TIERS) {
      const a = gk.gatekeeperStageFor(tier)
      const b = gk.gatekeeperStageFor(tier)
      expect(b).toEqual(a)
      expect(b).not.toBe(a)
      expect(b.enemyTeam).not.toBe(a.enemyTeam)
      a.enemyTeam[0]!.topLevel = 999
      expect(gk.gatekeeperStageFor(tier).enemyTeam[0]!.topLevel).not.toBe(999)
    }
  })

  it('classic gates are buildAbilityBossStage rosters; encounter gates the encounter builder\'s', async () => {
    const { gk, campaign, math } = await build(true)
    const { buildBossEncounterStage } = await import('@/data/bossEncounters')
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      const L = math.GATEKEEPER_LEVEL[tier]
      const ref = campaign.buildAbilityBossStage(gk.LEAGUE_GATEKEEPER_CLASSIC[tier], () => ({ topLevel: L, bottomLevel: L }))
      expect(gk.gatekeeperStageFor(tier)).toEqual({ ...ref, rewardWin: 0, rewardLose: 0 })
      expect(gk.gatekeeperStageFor(tier).arenaType).toBe('boss')
    }
    for (const tier of ['platinum', 'diamond', 'champion'] as const) {
      const L = math.GATEKEEPER_LEVEL[tier]
      const st = gk.gatekeeperStageFor(tier)
      expect(st).toEqual(buildBossEncounterStage(gk.LEAGUE_GATEKEEPER_ENCOUNTERS[tier], () => ({ topLevel: L, bottomLevel: L })))
      expect(st.bossEncounterId).toBe(gk.LEAGUE_GATEKEEPER_ENCOUNTERS[tier])
      expect(st.cycleSuffix).toBeUndefined()
    }
  })

  it('forwards bossTrait / shardTrait / bossAbility through the stage → enemy config path', async () => {
    const { gk } = await build(true)
    const traits = (tier: typeof ALL_TIERS[number]) =>
      gk.gatekeeperEnemyConfigs(gk.gatekeeperStageFor(tier)).map(c => c.bossTrait ?? null)
    expect(traits('platinum')).toEqual(['ember'])
    expect(traits('diamond')).toEqual(['frost'])
    expect(traits('champion')).toEqual(['ember', 'frost', 'chill'])
    expect(gk.gatekeeperEnemyConfigs(gk.gatekeeperStageFor('champion')).map(c => c.bossAbility)).toEqual(['partners', 'partners', 'partners'])
    expect(gk.gatekeeperEnemyConfigs(gk.gatekeeperStageFor('bronze'))).toEqual([
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 2, bottomLevel: 2, modelId: 'piranha', isBoss: true, bossAbility: 'split' }
    ])
    // Same function the arena uses for campaign stages.
    const { stageEnemyConfigs } = await import('@/use/stageBladeConfig')
    for (const tier of ALL_TIERS) {
      const st = gk.gatekeeperStageFor(tier)
      expect(gk.gatekeeperEnemyConfigs(st)).toEqual(stageEnemyConfigs(st))
    }
  })

  it('card view: name + badge only, never a level (LM4)', async () => {
    const { gk } = await build(true)
    const cards = ALL_TIERS.map(t => gk.gatekeeperCard(t))
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual(['badgeSrc', 'modelId', 'nameKey', 'tier'])
      expect(JSON.stringify(card)).not.toMatch(/level/i)
      expect(card.nameKey).toBe(gk.gatekeeperNameKey(card.tier))
    }
    expect(cards.map(c => c.nameKey)).toEqual([
      'stages.cheat_split', 'stages.cheat_healers', 'stages.cheat_thunder',
      'stages.boss_cinder_tyrant', 'stages.boss_glacier_warden', 'stages.boss_elemental_court'
    ])
    expect(cards.slice(0, 3).map(c => c.badgeSrc)).toEqual([null, null, null])
    // the crest bake, or the toy-box repaint (painted-boss-*) once tools/badge-icons shipped it
    expect(cards[3]!.badgeSrc).toMatch(/boss-badges\/(painted-boss-)?cinder-tyrant_256x256\.webp(\?v=\w+)?$/)
    expect(cards[4]!.badgeSrc).toMatch(/boss-badges\/(painted-boss-)?glacier-warden_256x256\.webp(\?v=\w+)?$/)
    expect(cards[5]!.badgeSrc).toMatch(/boss-badges\/(painted-boss-)?cinder-tyrant_256x256\.webp(\?v=\w+)?$/) // the court's lead wears cinder
    expect(cards.map(c => c.modelId)).toEqual(['piranha', 'mountain', 'thunderstorm', 'cinder', 'frost-vault', 'cinder'])
  })
})

describe('bosses100 OFF build — classic stand-ins at their own fitted levels', () => {
  it('Platinum / Diamond / Champion fall back to child-emitter / life-leech / partners', async () => {
    const { gk, campaign, math } = await build(false)
    const specs = ALL_TIERS.map(t => gk.gatekeeperSpecFor(t))
    expect(specs.every(s => s.kind === 'ability')).toBe(true)
    expect(specs.map(s => (s.kind === 'ability' ? s.ability : null))).toEqual(['split', 'healers', 'thunder', 'child-emitter', 'life-leech', 'partners'])
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      expect(gk.gatekeeperSpecFor(tier).level).toBe(math.GATEKEEPER_LEVEL[tier])
    }
    expect(gk.GATEKEEPER_FALLBACK_LEVEL).toEqual({ platinum: 14, diamond: 32, champion: 20 })
    for (const tier of ['platinum', 'diamond', 'champion'] as const) {
      const L = gk.GATEKEEPER_FALLBACK_LEVEL[tier]
      expect(gk.gatekeeperSpecFor(tier).level).toBe(L)
      const st = gk.gatekeeperStageFor(tier)
      const ref = campaign.buildAbilityBossStage(gk.LEAGUE_GATEKEEPER_FALLBACK[tier], () => ({ topLevel: L, bottomLevel: L }))
      expect(st).toEqual({ ...ref, rewardWin: 0, rewardLose: 0 })
      expect(st.bossEncounterId).toBeUndefined()
      expect(st.enemyTeam.some(c => c.bossTrait !== undefined || c.shardTrait !== undefined)).toBe(false)
      expect(gk.gatekeeperEnemyConfigs(st).some(c => 'bossTrait' in c || 'shardTrait' in c)).toBe(false)
    }
  })

  it('cards carry no crest and name classic bosses', async () => {
    const { gk } = await build(false)
    expect(ALL_TIERS.map(t => gk.gatekeeperCard(t).badgeSrc)).toEqual([null, null, null, null, null, null])
    expect(ALL_TIERS.map(t => gk.gatekeeperNameKey(t))).toEqual([
      'stages.cheat_split', 'stages.cheat_healers', 'stages.cheat_thunder',
      'stages.cheat_child_emitter', 'stages.cheat_life_leech', 'stages.cheat_partners'
    ])
  })

  it('does not read the encounter table at runtime', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_FEATURE_BOSSES100', 'false')
    const touched: string[] = []
    vi.doMock('@/data/bossEncounters', async (orig) => {
      const real = await orig<typeof import('@/data/bossEncounters')>()
      return {
        ...real,
        buildBossEncounterStage: (...a: Parameters<typeof real.buildBossEncounterStage>) => {
          touched.push(a[0])
          return real.buildBossEncounterStage(...a)
        }
      }
    })
    const gk = await import('@/league/leagueGatekeepers')
    for (const t of ALL_TIERS) { gk.gatekeeperStageFor(t); gk.gatekeeperCard(t) }
    vi.doUnmock('@/data/bossEncounters')
    expect(touched).toEqual([])
  })
})

describe('buildAbilityBossStage extraction', () => {
  it('buildCheatBossStage output is byte-identical to the pre-LG7 fixture', async () => {
    const { campaign } = await build(true)
    const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/cheatBossStages.preLG7.json'), 'utf8')) as {
      profiles: unknown[]
      abilities: string[]
      stages: string[]
    }
    const got: string[] = []
    for (const p of fixture.profiles) {
      campaign.default().playerUpgrades.value = JSON.parse(JSON.stringify(p))
      for (const a of fixture.abilities) got.push(JSON.stringify(campaign.buildCheatBossStage(a as never)))
    }
    expect(got).toEqual(fixture.stages)
    expect(got.length).toBe(27)
  })

  it('the league sim fights the real rosters', async () => {
    const { campaign } = await build(true)
    const strip = (st: { enemyTeam: Array<Record<string, unknown>> }) =>
      st.enemyTeam.map(({ topLevel: _t, bottomLevel: _b, ...rest }) => rest)
    for (const [ability, roster] of Object.entries(ABILITY_ROSTERS)) {
      expect(strip(campaign.buildAbilityBossStage(ability as never, () => ({ topLevel: 0, bottomLevel: 0 })) as never), ability).toEqual(roster)
    }
    expect(CLASSIC_ROSTERS.bronze).toBe(ABILITY_ROSTERS.split)
  })
})
