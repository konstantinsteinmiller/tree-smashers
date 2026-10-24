// ─── Team size: 1, 2 or 3 smashers per side (src/data/teamSize.ts) ──────────
//
// Pinned here:
//   • the rule table — base size 0.9, team-size multipliers 1 / 0.87 / 0.75,
//     the ×1.2 solo boost, slot 2 after winning stage 3, slot 3 after stage 10;
//   • the state (use/useTeamSize): a fresh player fields 1, an old save gets
//     its slots from the stored stage, the stored pick is clamped to the open
//     slots, a newly opened slot badges until seen;
//   • padding a short stored team (useSmashers.fieldTeamIds);
//   • the engine: every blade's radius = BLADE_RADIUS × base × team size ×
//     disc (per side, by that side's own count), the solo boost on HP and
//     damage, and every spawn of N = 1…3 vs 1…3 on all 50 layouts inside the
//     clearing and clear of the towers, the terrain solids and each other.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TEAM_SIZE, SMASHER_BASE_SIZE, SOLO_BOOST, TEAM_SIZE_MUL, clampTeamSize, effectiveTeamSize,
  sideSizeMul, sideStatMul, teamSlotWinStage, teamSlotsForStage
} from '@/data/teamSize'
import { SMASHER_LIST, smasherConfig, type SmasherId } from '@/data/smasherCatalog'
import { discOf } from '@/use/smasherMechanics'
import { TERRAIN_SHAPES, isInside } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT } from '@/use/arenaTerrain'

describe('team size — the rule table', () => {
  it('sizes: −10 % base, then 1 / 0.87 / 0.75 by team size', () => {
    expect(SMASHER_BASE_SIZE).toBe(0.9)
    expect(TEAM_SIZE_MUL).toEqual({ 1: 1, 2: 0.87, 3: 0.75 })
    expect(sideSizeMul(1)).toBeCloseTo(0.9, 12)
    expect(sideSizeMul(2)).toBeCloseTo(0.783, 12)
    expect(sideSizeMul(3)).toBeCloseTo(0.675, 12)
    // NPC teams of 4 (campaign formations) use the 3 multiplier.
    expect(sideSizeMul(4)).toBe(sideSizeMul(3))
  })

  it('stats: a side of one gets ×1.2 damage and HP; 2 and 3 are unchanged', () => {
    expect(SOLO_BOOST).toBe(1.2)
    expect([1, 2, 3, 4].map(sideStatMul)).toEqual([1.2, 1, 1, 1])
  })

  it('slots: 1 from the start, 2 after winning stage 3, 3 after winning stage 10', () => {
    // bestStage = deepest stage reached: stage N is won once bestStage > N.
    expect([1, 2, 3, 4, 10, 11, 12, 500].map(teamSlotsForStage)).toEqual([1, 1, 1, 2, 2, 3, 3, 3])
    expect([1, 2, 3].map(teamSlotWinStage)).toEqual([0, 3, 10])
  })

  it('the fielded size: the stored pick, else 2 once open — clamped to the open slots', () => {
    expect(effectiveTeamSize(null, 1)).toBe(1)
    expect(effectiveTeamSize(null, 2)).toBe(2)
    expect(effectiveTeamSize(null, 3)).toBe(2) // slot 3 is never auto-picked
    expect(effectiveTeamSize(3, 3)).toBe(3)
    expect(effectiveTeamSize(3, 2)).toBe(2)
    expect(effectiveTeamSize(1, 3)).toBe(1)
    expect([0, 1, 2, 3, 7, NaN, '2'].map(clampTeamSize)).toEqual([1, 1, 2, 3, 3, 1, 1])
  })
})

describe('team size — persisted state (use/useTeamSize)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('a fresh player fields one smasher; winning stage 3 opens a second and badges it', async () => {
    const ts = await import('@/use/useTeamSize')
    expect(ts.teamSizeAt(1)).toBe(1)
    expect(ts.hasUnseenTeamSlot(1)).toBe(false)
    expect(ts.syncTeamSlots(4)).toBe(true)
    expect(localStorage.getItem('smashers_team_slots')).toBe('2')
    expect(ts.teamSizeAt(4)).toBe(2)
    expect(ts.hasUnseenTeamSlot(4)).toBe(true)
    ts.markTeamSlotsSeen(4)
    expect(ts.hasUnseenTeamSlot(4)).toBe(false)
    expect(localStorage.getItem('smashers_team_slots_seen')).toBe('2')
    // Winning stage 10 opens slot 3 — the fielded size stays the player's call.
    ts.syncTeamSlots(11)
    expect(ts.teamSizeAt(11)).toBe(2)
    expect(ts.hasUnseenTeamSlot(11)).toBe(true)
    ts.chooseTeamSize(3)
    expect(localStorage.getItem('smashers_team_size')).toBe('3')
    expect(ts.teamSizeAt(11)).toBe(3)
    ts.chooseTeamSize(1)
    expect(ts.teamSizeAt(11)).toBe(1)
  })

  it('migration: a save past stage 10 opens all three slots on load and keeps fielding 2', async () => {
    localStorage.setItem('smashers_campaign_stage', '42')
    localStorage.setItem('smashers_player_team', JSON.stringify([smasherConfig('vixie', 1), smasherConfig('grizzle', 1)]))
    const ts = await import('@/use/useTeamSize')
    expect(ts.openTeamSlots.value).toBe(3)
    expect(ts.teamSizeAt(1)).toBe(2) // the stored high-water wins over a stale best stage
    const cfg = (await import('@/use/useSpinnerConfig')).default()
    expect(cfg.playerTeam.value.map(c => c.smasherId)).toEqual(['vixie', 'grizzle'])
  })

  it('a save on stage 2 keeps its two picks but fights alone until stage 3 is won', async () => {
    localStorage.setItem('smashers_campaign_stage', '2')
    localStorage.setItem('smashers_player_team', JSON.stringify([smasherConfig('thumper', 1), smasherConfig('bramble', 1)]))
    const ts = await import('@/use/useTeamSize')
    const cfg = (await import('@/use/useSpinnerConfig')).default()
    const { fieldTeam } = await import('@/use/useSmashers')
    expect(ts.teamSizeAt(2)).toBe(1)
    expect(cfg.playerTeam.value.map(c => c.smasherId)).toEqual(['thumper', 'bramble'])
    expect(fieldTeam(cfg.playerTeam.value, ts.teamSizeAt(2), 2).map(c => c.smasherId)).toEqual(['thumper'])
  })

  it('a stored pick beyond the open slots is clamped (a cloud save from another device)', async () => {
    localStorage.setItem('smashers_team_size', '3')
    const ts = await import('@/use/useTeamSize')
    expect(ts.teamSizeAt(1)).toBe(1)
    expect(ts.teamSizeAt(5)).toBe(2)
    expect(ts.teamSizeAt(11)).toBe(3)
  })

  it('#G1 auto-join: winning stage 3 fields a 2nd smasher even after an explicit size-1 pick; a later ✕ sticks', async () => {
    localStorage.setItem('smashers_campaign_stage', '3')
    localStorage.setItem('smashers_team_size', '1')
    localStorage.setItem('smashers_player_team', JSON.stringify([smasherConfig('bramble', 1)]))
    const ts = await import('@/use/useTeamSize')
    const { fieldTeam } = await import('@/use/useSmashers')
    const cfg = (await import('@/use/useSpinnerConfig')).default()
    expect(ts.teamSizeAt(3)).toBe(1)
    const grew = ts.syncTeamSlots(4)
    expect(ts.secondSlotJustOpened(grew)).toBe(true)
    expect(localStorage.getItem('smashers_team_size')).toBe('2')
    const fielded = fieldTeam(cfg.playerTeam.value, ts.teamSizeAt(4), 4).map(c => c.smasherId)
    expect(fielded).toHaveLength(2)
    expect(fielded[0]).toBe('bramble')
    expect(fielded[1]).not.toBe('bramble')
    // The player takes slot 2 out again: respected from then on.
    ts.chooseTeamSize(1)
    expect(ts.secondSlotJustOpened(ts.syncTeamSlots(5))).toBe(false)
    expect(ts.teamSizeAt(5)).toBe(1)
    vi.resetModules()
    const again = await import('@/use/useTeamSize')
    again.syncTeamSlots(6)
    expect(again.teamSizeAt(6)).toBe(1)
  })

  it('#G1 migration: a save already past stage 3 gets no surprise auto-add (its size-1 pick stays)', async () => {
    localStorage.setItem('smashers_campaign_stage', '7')
    localStorage.setItem('smashers_team_size', '1')
    const ts = await import('@/use/useTeamSize')
    expect(ts.secondSlotJustOpened(ts.syncTeamSlots(7))).toBe(false)
    expect(ts.teamSizeAt(7)).toBe(1)
    expect(localStorage.getItem('smashers_team_size')).toBe('1')
    // …nor does one with a stored slot high-water but a stale stage (cloud hydrate order).
    vi.resetModules(); localStorage.clear()
    localStorage.setItem('smashers_team_slots', '2')
    localStorage.setItem('smashers_team_size', '1')
    const ts2 = await import('@/use/useTeamSize')
    expect(ts2.syncTeamSlots(4)).toBe(false)
    expect(ts2.teamSizeAt(4)).toBe(1)
  })

  it('#G1 stages 1–3 are 1v1 (one designed enemy, replays too); stage 4 onwards unchanged in size', async () => {
    const { getStageById } = await import('@/use/useSpinnerCampaign')
    expect([1, 2, 3].map(id => getStageById(id).enemyTeam.length)).toEqual([1, 1, 1])
    expect(getStageById(4).enemyTeam.length).toBe(3)
    // a gentle ramp: each opening enemy is at least as levelled as the last
    const lv = [1, 2, 3].map(id => { const b = getStageById(id).enemyTeam[0]!; return b.topLevel + b.bottomLevel })
    expect(lv[0]! <= lv[1]! && lv[1]! <= lv[2]!).toBe(true)
  })

  it('a single stored pick is a valid team (team size 1 saves)', async () => {
    localStorage.setItem('smashers_player_team', JSON.stringify([smasherConfig('grizzle', 1)]))
    const cfg = (await import('@/use/useSpinnerConfig')).default()
    expect(cfg.playerTeam.value.map(c => c.smasherId)).toEqual(['grizzle'])
  })
})

describe('team size — padding a short team', () => {
  it('pads with recruited smashers first, never duplicates, keeps the order', async () => {
    const { fieldTeamIds } = await import('@/use/useSmashers')
    expect(fieldTeamIds(['thumper'], 3, 3)).toEqual(['thumper', 'bramble', 'grizzle'])
    expect(fieldTeamIds(['vixie', 'grizzle'], 2, 50)).toEqual(['vixie', 'grizzle'])
    expect(fieldTeamIds(['vixie', 'vixie'], 2, 50)).toEqual(['vixie', 'bramble'])
    expect(fieldTeamIds([], 1)).toEqual(['bramble'])
  })
})

// ─── Engine ────────────────────────────────────────────────────────────────

type GameModule = typeof import('@/use/useSpinnerGame')
let clock = 1000

beforeEach(() => {
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const loadGame = async (): Promise<GameModule> => {
  vi.resetModules()
  await import('@/use/useUser')
  return import('@/use/useSpinnerGame')
}

const byDisc = [...SMASHER_LIST].sort((a, b) => (b.disc ?? 1) - (a.disc ?? 1))
const NEUTRAL: SmasherId = SMASHER_LIST.find(s => (s.disc ?? 1) === 1)?.id ?? 'hootsie'
const team = (n: number, from = 0, level = 10) => byDisc.slice(from, from + n).map(s => smasherConfig(s.id, level))

describe('team size — engine', () => {
  it('each side is sized by its own count: R × 0.9 × (1 | 0.87 | 0.75) × disc', async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    for (const [p, n] of [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [2, 4]] as const) {
      e.initGame(team(p), team(n, 5), false, 'default', false, undefined, null, 'circle', { seed: 3 })
      for (const b of e.playerBlades.value) {
        expect(b.radius, `player of ${p}`).toBeCloseTo(game.BLADE_RADIUS * sideSizeMul(p) * discOf(b.config), 9)
      }
      for (const b of e.npcBlades.value) {
        expect(b.radius, `npc of ${n}`).toBeCloseTo(game.BLADE_RADIUS * sideSizeMul(n) * discOf(b.config), 9)
      }
    }
    e.disposePhysics()
  })

  it('a lone blade gets ×1.2 max HP (a duo none), whichever side it is on', async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    const one = smasherConfig(NEUTRAL, 8)
    e.initGame([one], [one, one], false, 'default', false, undefined, null, 'circle', { seed: 5 })
    const solo = e.playerBlades.value[0]!.maxHp
    const duo = e.npcBlades.value[0]!.maxHp
    expect(solo / duo).toBeCloseTo(SOLO_BOOST, 9)
    e.initGame([one, one, one], [one], false, 'default', false, undefined, null, 'circle', { seed: 5 })
    expect(e.playerBlades.value[0]!.maxHp).toBeCloseTo(duo, 9)
    expect(e.npcBlades.value[0]!.maxHp).toBeCloseTo(solo, 9)
    e.disposePhysics()
  })

  it('the state hash carries both team sizes (host first)', async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    const one = smasherConfig(NEUTRAL, 3)
    e.initGame([one, one], [one, one], false, 'default', false, undefined, null, 'circle', { seed: 9 })
    const two = e.computeStateHash()
    e.initGame([one, one], [one, one], false, 'default', false, undefined, null, 'circle', { seed: 9 })
    expect(e.computeStateHash()).toBe(two)
    e.initGame([one, one, one], [one, one], false, 'default', false, undefined, null, 'circle', { seed: 9 })
    expect(e.computeStateHash()).not.toBe(two)
    e.disposePhysics()
  })

  it(`spawns for 1…${MAX_TEAM_SIZE} vs 1…${MAX_TEAM_SIZE} (and 4 NPCs) fit every layout, clear of towers, terrain and each other`, async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    for (let layout = 0; layout < TERRAIN_LAYOUT_COUNT; layout++) {
      const shape = TERRAIN_SHAPES[layout]!
      for (const p of [1, 2, 3]) {
        for (const n of [1, 2, 3, 4]) {
          // The biggest discs: the worst case for every formation.
          e.initGame(team(p), team(n, 3), false, 'default', false, undefined, null, 'circle',
            { seed: 100 + layout * 7 + p * 3 + n, terrain: { layout, towers: true } })
          const tag = `layout ${layout} ${p}v${n}`
          const blades = e.allBlades.value
          const lay = e.terrainLayout()
          for (const b of blades) {
            expect(isInside(shape, b.x, b.y, game.ARENA_RADIUS, b.radius - 0.01), `${tag} wall`).toBe(true)
            for (const t of e.towers()) expect(Math.hypot(b.x - t.x, b.y - t.y), `${tag} tower`).toBeGreaterThanOrEqual(b.radius + t.radius)
            for (const isl of lay?.islands ?? []) {
              expect(Math.hypot(b.x - isl.x, b.y - isl.y), `${tag} island`).toBeGreaterThanOrEqual(b.radius + isl.radius)
            }
          }
          for (let i = 0; i < blades.length; i++) {
            for (let j = i + 1; j < blades.length; j++) {
              const a = blades[i]!
              const c = blades[j]!
              expect(Math.hypot(a.x - c.x, a.y - c.y), `${tag} blades ${i}/${j}`).toBeGreaterThanOrEqual(a.radius + c.radius)
            }
          }
        }
      }
    }
    e.disposePhysics()
  }, 120_000)
})
