import { describe, expect, it } from 'vitest'
import { buildDigest, encodePlayerBuild, validatePlayerBuildShape } from '@/utils/playerBuild'
import { sanitizePvpLoadout, sanitizePvpTeam } from '@/use/loadoutSanitizer'
import { sanitizeOpponentBuild } from '@/league/leagueOpponents'
import { smasherConfig, smasherLoadout } from '@/data/smasherCatalog'

const team = [smasherConfig('chomper', 12, 'fire'), smasherConfig('vixie', 21, 'ice')]

describe('smasher payloads', () => {
  it('compact build carries s + lv and round-trips through validation', () => {
    const b = encodePlayerBuild(team, [])!
    expect(b.team[0]).toMatchObject({ s: 'chomper', lv: 12, tl: 11, bl: 11 })
    expect(b.team[1]).toMatchObject({ s: 'vixie', lv: 21 })
    expect(validatePlayerBuildShape(JSON.parse(JSON.stringify(b)))).toEqual(b)
    expect(buildDigest(b)).toContain(',chomper.12')
  })

  it('part-only builds keep the old shape and digest', () => {
    const b = encodePlayerBuild([{ topPartId: 'star', bottomPartId: 'balanced', topLevel: 2, bottomLevel: 3, modelId: 'x' },
      { topPartId: 'round', bottomPartId: 'tanky', modelId: 'y' }], [])!
    expect('s' in b.team[0]!).toBe(false)
    expect(buildDigest(b)).toBe('v1|star,balanced,2,3,x|round,tanky,0,0,y|sk:')
  })

  it('validation rejects out-of-range smasher fields', () => {
    const b = encodePlayerBuild(team, [])!
    const bad = (patch: object) => ({ ...b, team: [{ ...b.team[0], ...patch }, b.team[1]] })
    expect(validatePlayerBuildShape(bad({ lv: 31 }))).toBeNull()
    expect(validatePlayerBuildShape(bad({ lv: 0 }))).toBeNull()
    expect(validatePlayerBuildShape(bad({ s: 'a'.repeat(17) }))).toBeNull()
    expect(validatePlayerBuildShape(bad({ s: undefined }))).toBeNull()
  })

  it('PvP sanitiser rebuilds known smashers, clamps levels, honours levelOne', () => {
    const raw = [{ smasherId: 'grizzle', level: 99, topPartId: 'star', bottomPartId: 'speedy', topLevel: 150 }]
    const [c] = sanitizePvpTeam(raw, { teamSize: 1 })
    expect(c).toEqual(smasherConfig('grizzle', 30))
    expect(sanitizePvpTeam(raw, { teamSize: 1, levelOne: true })[0]).toEqual(smasherConfig('grizzle', 1))
    // Its own skills reach the engine via smasherLoadout.
    expect(smasherLoadout(c!).length).toBe(3)
  })

  it('unknown smasher id falls back to parts', () => {
    const [c] = sanitizePvpTeam([{ smasherId: 'dragon', level: 5, topPartId: 'star', bottomPartId: 'speedy', topLevel: 4 }], { teamSize: 1 })
    expect(c).toEqual({ topPartId: 'star', bottomPartId: 'speedy', topLevel: 4 })
  })

  it('player-ready loadout round-trips smasher ids', () => {
    const sent = JSON.parse(JSON.stringify(team))
    const clean = sanitizePvpLoadout(sent, [], { teamSize: 2 }, null)!
    expect(clean.team.map(c => [c.smasherId, c.level])).toEqual([['chomper', 12], ['vixie', 21]])
    expect(clean.skills).toEqual([])
  })

  it('league opponent build decodes into smasher configs', () => {
    const b = encodePlayerBuild(team, [])!
    const s = sanitizeOpponentBuild(JSON.parse(JSON.stringify(b)), true, null)!
    expect(s.team[0]).toEqual(smasherConfig('chomper', 12, 'fire'))
    expect(s.team[1]!.smasherId).toBe('vixie')
  })
})
