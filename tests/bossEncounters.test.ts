// @vitest-environment node
// Bosses 100+ — BW1: the encounter table and its place in the campaign
// (bosses-100-feature.md §3, §5, §9, §12.1).
//
// Pins which stage fields which encounter across the first three 200-stage
// layouts, that every OTHER stage is byte-identical to the table before this
// feature (hash fixture), the rewards (the replaced slot's), the "… II"
// naming, trophy hooks, the boss-peek data and the deterministic builder the
// Boss Lab and the league (LG7) share. Also keeps the boss sim reading the
// same table (knob defaults: tests/bossTraits.test.ts).

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// The encounters only exist on a bosses100 build (the off build is pinned by
// tests/bosses100FlagOff.test.ts).
import './helpers/bosses100Build'
import {
  BOSS_ENCOUNTERS,
  BOSS_ENCOUNTER_IDS,
  BOSS_ENCOUNTER_SLOTS,
  BOSS_LAYOUT_PERIOD,
  BOSS_TROPHY_SKIN_IDS,
  LEAGUE_GATEKEEPER_ENCOUNTERS,
  bossTraitsOf,
  buildBossEncounterStage,
  encounterAppearance,
  encounterForSlot,
  encounterForStageId,
  getBossEncounter,
  isBossEncounterId,
  layoutSlot,
  shiftLevels,
  trophySkinsForStage,
  type BossEncounterId
} from '@/data/bossEncounters'
import { STAGES, getStageById, newEncounterSuffix } from '@/use/useSpinnerCampaign'
import { getBossPeek } from '@/use/bossPeek'
import en from '@/i18n/locales/en'
// @ts-ignore — plain ESM from the balance simulator, no .d.ts
import { ENCOUNTERS as SIM_ENCOUNTERS } from '../tools/skills-sim/bosses100.mjs'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/campaignStages.preBosses100.json', import.meta.url), 'utf8')
) as { hashes: Record<string, string>; replacedRewards: Record<string, [number, number]> }

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

const ENCOUNTER_BY_SLOT: Record<number, BossEncounterId> = {
  110: 'cinder_tyrant',
  120: 'glacier_warden',
  130: 'frostbite_yeti',
  140: 'twin_pyres',
  150: 'blizzard_choir',
  160: 'shattering_glacier',
  170: 'frostfire_pact',
  180: 'magma_titan',
  190: 'blizzard_twins',
  200: 'elemental_court'
}

const isEncounterId = (id: number) => {
  const slot = ((id - 1) % 200) + 1
  return id > 100 && slot > 100 && slot % 10 === 0
}

describe('encounter table (§5)', () => {
  it('holds the ten encounters in slot order', () => {
    expect(BOSS_ENCOUNTERS.map(e => e.id)).toEqual([...BOSS_ENCOUNTER_IDS])
    expect(BOSS_ENCOUNTERS.map(e => e.slot)).toEqual([...BOSS_ENCOUNTER_SLOTS])
    for (const [slot, id] of Object.entries(ENCOUNTER_BY_SLOT)) {
      expect(encounterForSlot(Number(slot))?.id).toBe(id)
      expect(getBossEncounter(id).nameKey).toBe(`boss_${id}`)
    }
    expect(BOSS_LAYOUT_PERIOD).toBe(200)
  })

  it('every blade is a boss; carriers match the design roster', () => {
    const traits = Object.fromEntries(
      BOSS_ENCOUNTERS.map(e => [e.id, e.enemyTeam.map(c => `${c.bossAbility ?? 'plain'}+${c.bossTrait ?? '-'}`)])
    )
    expect(traits).toEqual({
      cinder_tyrant: ['plain+ember'],
      glacier_warden: ['plain+frost'],
      frostbite_yeti: ['plain+chill'],
      twin_pyres: ['ghost+ember'],
      blizzard_choir: ['healers+chill', 'healers+-', 'healers+-'],
      shattering_glacier: ['split+frost'],
      frostfire_pact: ['partners+ember', 'partners+frost'],
      magma_titan: ['stat-switch+ember'],
      blizzard_twins: ['ghost+chill'],
      elemental_court: ['partners+ember', 'partners+frost', 'partners+chill']
    })
    for (const enc of BOSS_ENCOUNTERS) for (const cfg of enc.enemyTeam) expect(cfg.isBoss).toBe(true)
    expect(getBossEncounter('shattering_glacier').enemyTeam[0]!.shardTrait).toBe('chill')
    expect(BOSS_ENCOUNTERS.flatMap(e => e.enemyTeam).filter(c => c.shardTrait)).toHaveLength(1)
  })

  it('arenas: lava for the Magma Titan, ice for the Blizzard Twins, boss otherwise', () => {
    for (const enc of BOSS_ENCOUNTERS) {
      const want = enc.id === 'magma_titan' ? 'lava' : enc.id === 'blizzard_twins' ? 'ice' : 'boss'
      expect(enc.arenaType, enc.id).toBe(want)
    }
  })

  it('never more than 5 live enemies (split = 5 shards)', () => {
    for (const enc of BOSS_ENCOUNTERS) {
      const live = enc.enemyTeam.reduce(
        (n, c) => n + (c.bossAbility === 'ghost' ? 2 : c.bossAbility === 'split' ? 5 : 1),
        0
      )
      expect(live, enc.id).toBeLessThanOrEqual(5)
    }
  })

  it('is frozen — nobody can mutate the shared table', () => {
    expect(Object.isFrozen(BOSS_ENCOUNTERS)).toBe(true)
    for (const enc of BOSS_ENCOUNTERS) {
      expect(Object.isFrozen(enc)).toBe(true)
      for (const cfg of enc.enemyTeam) expect(Object.isFrozen(cfg)).toBe(true)
    }
  })

  it('id guard', () => {
    expect(isBossEncounterId('cinder_tyrant')).toBe(true)
    expect(isBossEncounterId('bear_mother')).toBe(false)
    expect(isBossEncounterId(110)).toBe(false)
    expect(() => getBossEncounter('nope' as BossEncounterId)).toThrow()
  })
})

describe('campaign stage table (§3.1–3.3)', () => {
  it('slots 110…200 of every odd 100-cycle field the encounters (cycles 1, 3, 5)', () => {
    for (const offset of [0, 200, 400]) {
      for (const [slot, encId] of Object.entries(ENCOUNTER_BY_SLOT)) {
        const id = Number(slot) + offset
        const st = getStageById(id)
        expect(st.bossEncounterId, `stage ${id}`).toBe(encId)
        expect(st.name).toBe(`boss_${encId}`)
        expect(st.id).toBe(id)
        expect(st.isBoss).toBe(true)
        expect(encounterForStageId(id)?.id).toBe(encId)
      }
    }
  })

  it('x5 slots, 188 and even 100-cycles keep the cycle copies', () => {
    for (const id of [105, 115, 125, 135, 145, 155, 165, 175, 185, 188, 195, 305, 388, 395]) {
      const st = getStageById(id)
      expect(st.bossEncounterId, `stage ${id}`).toBeUndefined()
      expect(st.isBoss).toBe(true)
      expect(st.name).toBe(`stage_${((id - 1) % 100) + 1}`)
    }
    for (const id of [10, 100, 210, 250, 300, 410, 500]) {
      expect(getStageById(id).bossEncounterId, `stage ${id}`).toBeUndefined()
      expect(encounterForStageId(id)).toBeNull()
    }
    expect(getStageById(188).arenaType).toBe(getStageById(88).arenaType)
  })

  it('every non-encounter stage 1…600 is byte-identical to the table before the feature', () => {
    let checked = 0
    for (let id = 1; id <= 600; id++) {
      if (isEncounterId(id)) continue
      expect(hash(getStageById(id)), `stage ${id}`).toBe(fixture.hashes[String(id)])
      checked++
    }
    expect(checked).toBe(570)
    // 1–109 explicitly, as the design gate names it
    for (let id = 1; id <= 109; id++) expect(hash(getStageById(id))).toBe(fixture.hashes[String(id)])
  })

  it('210 = base 10 at +44 (cycle copy "III"), not an encounter', () => {
    const s210 = getStageById(210)
    const s10 = getStageById(10)
    expect(s210.name).toBe('stage_10')
    expect(s210.cycleSuffix).toBe('III')
    expect(s210.enemyTeam.map(c => [c.topLevel, c.bottomLevel])).toEqual(
      s10.enemyTeam.map(c => [c.topLevel + 44, c.bottomLevel + 44])
    )
  })

  it('levels: authored at stage 101–200, +44 per 200 stages after', () => {
    for (const enc of BOSS_ENCOUNTERS) {
      const authored = enc.enemyTeam.map(c => [c.topLevel, c.bottomLevel])
      const at = (id: number) => getStageById(id).enemyTeam.map(c => [c.topLevel, c.bottomLevel])
      expect(at(enc.slot)).toEqual(authored)
      expect(at(enc.slot + 200)).toEqual(authored.map(([t, b]) => [t! + 44, b! + 44]))
      expect(at(enc.slot + 400)).toEqual(authored.map(([t, b]) => [t! + 88, b! + 88]))
    }
    // 310 = the Cinder Tyrant at its 110 levels + 44
    expect(getStageById(310).enemyTeam[0]).toMatchObject({ topLevel: 66, bottomLevel: 66, bossTrait: 'ember' })
  })

  it('naming: debut has no suffix, then "II", "III" per appearance', () => {
    expect(getStageById(110).cycleSuffix).toBeUndefined()
    expect(getStageById(310).cycleSuffix).toBe('II')
    expect(getStageById(510).cycleSuffix).toBe('III')
    expect(getStageById(400).cycleSuffix).toBe('II')
    // the kept cycle copies around them keep the per-cycle numeral
    expect(getStageById(115).cycleSuffix).toBe('II')
    expect(getStageById(315).cycleSuffix).toBe('IV')
    expect([1, 3, 5, 7].map(newEncounterSuffix)).toEqual(['', 'II', 'III', 'IV'])
    expect([1, 3, 5].map(encounterAppearance)).toEqual([1, 2, 3])
  })

  it('rewards equal the replaced slot’s (trim + cycle multiplier), cycles 1–3', () => {
    const ids = Object.keys(fixture.replacedRewards).map(Number)
    expect(ids).toHaveLength(30)
    for (const id of ids) {
      const st = getStageById(id)
      expect([st.rewardWin, st.rewardLose], `stage ${id}`).toEqual(fixture.replacedRewards[String(id)])
    }
    expect([getStageById(110).rewardWin, getStageById(110).rewardLose]).toEqual([473, 122])
    expect([getStageById(200).rewardWin, getStageById(200).rewardLose]).toEqual([3544, 810])
  })

  it('stage objects do not alias the table (mutating one is harmless)', () => {
    const a = getStageById(170)
    a.enemyTeam[0]!.topLevel = 999
    expect(getStageById(170).enemyTeam[0]!.topLevel).toBe(26)
    expect(getBossEncounter('frostfire_pact').enemyTeam[0]!.topLevel).toBe(26)
  })

  it('legacy STAGES still has 200 entries and includes the encounters', () => {
    expect(STAGES).toHaveLength(200)
    expect(STAGES[109]!.bossEncounterId).toBe('cinder_tyrant')
    expect(STAGES[199]!.bossEncounterId).toBe('elemental_court')
    expect(STAGES.filter(s => s.bossEncounterId)).toHaveLength(10)
  })

  it('boss schedule is unchanged (same isBoss set 1…600)', () => {
    for (let id = 1; id <= 600; id++) {
      const slot = ((id - 1) % 100) + 1
      expect(!!getStageById(id).isBoss, `stage ${id}`).toBe(!!getStageById(slot).isBoss)
    }
  })

  it('layoutSlot wraps every 200', () => {
    expect([1, 100, 101, 200, 201, 310, 400, 401].map(layoutSlot)).toEqual([1, 100, 101, 200, 1, 110, 200, 1])
  })
})

describe('encounter builder (Boss Lab + league LG7, §9)', () => {
  it('is deterministic and returns fresh objects', () => {
    for (const id of BOSS_ENCOUNTER_IDS) {
      const a = buildBossEncounterStage(id, shiftLevels(7), { stageId: 42, rewardWin: 5, rewardLose: 1 })
      const b = buildBossEncounterStage(id, shiftLevels(7), { stageId: 42, rewardWin: 5, rewardLose: 1 })
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      expect(a.enemyTeam[0]).not.toBe(b.enemyTeam[0])
      expect(a.enemyTeam[0]).not.toBe(getBossEncounter(id).enemyTeam[0])
    }
  })

  it('defaults: cheat/league sentinel id −1, authored levels, no rewards, no suffix', () => {
    const st = buildBossEncounterStage('glacier_warden')
    expect(st).toEqual({
      id: -1,
      name: 'boss_glacier_warden',
      cycleSuffix: undefined,
      isBoss: true,
      arenaType: 'boss',
      enemyTeam: [
        {
          topPartId: 'quadratic', bottomPartId: 'speedy', topLevel: 45, bottomLevel: 45,
          modelId: 'frost-vault', isBoss: true, bossTrait: 'frost'
        }
      ],
      rewardWin: 0,
      rewardLose: 0,
      bossEncounterId: 'glacier_warden'
    })
  })

  it('level function sees each authored blade and its index; arena can be overridden', () => {
    const seen: [number, number][] = []
    const st = buildBossEncounterStage(
      'elemental_court',
      (cfg, i) => {
        seen.push([cfg.topLevel, i])
        return { topLevel: 50 + i, bottomLevel: 60 + i }
      },
      { arenaType: 'ice' }
    )
    expect(seen).toEqual([[24, 0], [24, 1], [24, 2]])
    expect(st.enemyTeam.map(c => [c.topLevel, c.bottomLevel])).toEqual([[50, 60], [51, 61], [52, 62]])
    expect(st.enemyTeam.map(c => c.bossTrait)).toEqual(['ember', 'frost', 'chill'])
    expect(st.arenaType).toBe('ice')
  })

  it('shiftLevels never goes below 0', () => {
    const st = buildBossEncounterStage('frostbite_yeti', shiftLevels(-100))
    expect(st.enemyTeam[0]).toMatchObject({ topLevel: 0, bottomLevel: 0 })
  })

  it('league gatekeeper mapping (decision B6)', () => {
    expect(LEAGUE_GATEKEEPER_ENCOUNTERS).toEqual({
      platinum: 'cinder_tyrant',
      diamond: 'glacier_warden',
      champion: 'elemental_court'
    })
  })
})

describe('trophy hooks (§3.5)', () => {
  it('skin ids agreed with the art/skin package', () => {
    expect([...BOSS_TROPHY_SKIN_IDS]).toEqual(['cinder', 'frost-vault', 'yeti'])
  })

  it('each encounter grants exactly the trophy skins its roster wears (Magma Titan none)', () => {
    for (const enc of BOSS_ENCOUNTERS) {
      const worn = BOSS_TROPHY_SKIN_IDS.filter(id => enc.enemyTeam.some(c => c.modelId === id))
      expect([...enc.trophySkins], enc.id).toEqual(worn)
    }
    const grantedBy = (skin: string) =>
      BOSS_ENCOUNTERS.filter(e => (e.trophySkins as readonly string[]).includes(skin)).map(e => e.slot)
    expect(grantedBy('cinder')).toEqual([110, 140, 170, 200])
    expect(grantedBy('frost-vault')).toEqual([120, 160, 170, 200])
    expect(grantedBy('yeti')).toEqual([130, 150, 190, 200])
    expect(getBossEncounter('magma_titan').trophySkins).toEqual([])
  })

  it('trophySkinsForStage reads the stage, [] for any other stage', () => {
    expect(trophySkinsForStage(getStageById(310))).toEqual(['cinder'])
    expect(trophySkinsForStage(getStageById(200))).toEqual(['cinder', 'frost-vault', 'yeti'])
    expect(trophySkinsForStage(getStageById(105))).toEqual([])
    expect(trophySkinsForStage(getStageById(10))).toEqual([])
  })
})

describe('boss peek / badge data', () => {
  it('names the encounter, its lead skin and its traits', () => {
    // 106 is in the post-105 window; the next boss is the Cinder Tyrant at 110
    expect(getBossPeek({ wonStageId: 106, result: 'win', mode: 'campaign' })).toMatchObject({
      bossStageId: 110,
      nameKey: 'boss_cinder_tyrant',
      cycleSuffix: '',
      modelId: 'cinder',
      isTeam: false,
      encounterId: 'cinder_tyrant',
      traits: ['ember']
    })
    expect(getBossPeek({ wonStageId: 196, result: 'win', mode: 'campaign' })).toMatchObject({
      bossStageId: 200,
      nameKey: 'boss_elemental_court',
      isTeam: true,
      traits: ['ember', 'frost', 'chill']
    })
    expect(getBossPeek({ wonStageId: 306, result: 'win', mode: 'campaign' })).toMatchObject({
      bossStageId: 310,
      cycleSuffix: 'II'
    })
  })

  it('classic bosses carry no encounter fields', () => {
    const peek = getBossPeek({ wonStageId: 111, result: 'win', mode: 'campaign' })
    expect(peek?.bossStageId).toBe(115)
    expect(peek).not.toHaveProperty('traits')
    expect(peek).not.toHaveProperty('encounterId')
  })

  it('traits include shard traits (Shattering Glacier: frost + chill)', () => {
    expect(bossTraitsOf(getBossEncounter('shattering_glacier').enemyTeam)).toEqual(['frost', 'chill'])
    expect(bossTraitsOf(getBossEncounter('blizzard_choir').enemyTeam)).toEqual(['chill'])
  })
})

describe('i18n + sim parity', () => {
  it('every encounter name exists in en.ts', () => {
    const stages = (en as { stages: Record<string, string> }).stages
    for (const enc of BOSS_ENCOUNTERS) expect(stages[enc.nameKey], enc.nameKey).toMatch(/^The /)
  })

  it('the boss sim reads this table (same rosters and arenas per slot)', () => {
    const sim = SIM_ENCOUNTERS as Record<string, { arena: string; team: unknown[] }>
    expect(Object.keys(sim).map(Number)).toEqual([...BOSS_ENCOUNTER_SLOTS])
    for (const enc of BOSS_ENCOUNTERS) {
      expect(sim[enc.slot]!.arena).toBe(enc.arenaType)
      expect(sim[enc.slot]!.team).toEqual(enc.enemyTeam)
    }
  })
})
