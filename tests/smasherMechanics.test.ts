// ─── Smasher mechanics: disc size, gameplay heading, directional armour and
// the smasher-only skill effects (bank_shot, anchor, tower_breaker, thorns).
//
// Pure parts (zones, multipliers, runtime hooks, sanitisers) are tested
// directly; the engine parts drive the real `useSpinnerGame` in jsdom with a
// fake RAF clock (the leagueDeterminism harness, minus the skill port unless a
// test needs it).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installSkillPort } from './helpers/skillsBuild'
import {
  ARMOR_CONE_COS, DISC_MAX, DISC_MIN, ZONE_BACK, ZONE_FRONT, ZONE_SIDE,
  armorMul, armorOf, armorZone, discOf, followHeading
} from '@/use/smasherMechanics'
import { SMASHER_LIST, smasherConfig, smasherLoadout, type SmasherId } from '@/data/smasherCatalog'
import { SKILL_HIT_MUL_CAP, TEAM_SKILL_IDS, skillParams } from '@/data/skillCatalog'
import {
  anchorKeep, beginLaunchSkills, createBladeSkills, createOutgoingResult, onBankRebound,
  outgoingSkillMul, thornsRecoil, towerDamageMul, type SkillBlade, type SkillRuntime
} from '@/use/skills/skillRuntime'
import { sanitizeSkillLoadout } from '@/use/skills/skillLoadoutSanitizer'
import { sanitizePvpTeam } from '@/use/loadoutSanitizer'
import { encodePlayerBuild, validatePlayerBuildShape } from '@/utils/playerBuild'
import { TERRAIN_SHAPES, isInside } from '@/use/arenaShapes'
import { sideSizeMul } from '@/data/teamSize'
import type { SkillLoadout } from '@/types/skills'
import type { SpinnerConfig, SpinnerState } from '@/types/spinner'

// ─── Pure: zones, multipliers, catalog data ────────────────────────────────

describe('directional armour — zones by contact angle', () => {
  const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const
  it('front cone ±60°, back cone ±60°, sides between', () => {
    // Heading along +x.
    for (const d of [0, 30, -30, 59, -59]) expect(armorZone(1, 0, ...at(d)), `${d}°`).toBe(ZONE_FRONT)
    for (const d of [61, 90, -90, 119, -119]) expect(armorZone(1, 0, ...at(d)), `${d}°`).toBe(ZONE_SIDE)
    for (const d of [121, 180, -150, -121]) expect(armorZone(1, 0, ...at(d)), `${d}°`).toBe(ZONE_BACK)
    expect(ARMOR_CONE_COS).toBe(0.5)
  })
  it('is rotation-invariant and unchanged by the PvP guest y-mirror', () => {
    for (let k = 0; k < 24; k++) {
      const h = (k / 24) * Math.PI * 2
      const hx = Math.cos(h)
      const hy = Math.sin(h)
      for (let j = 0; j < 24; j++) {
        const c = h + (j / 24) * Math.PI * 2 + 0.01
        const ux = Math.cos(c)
        const uy = Math.sin(c)
        expect(armorZone(hx, -hy, ux, -uy)).toBe(armorZone(hx, hy, ux, uy))
      }
    }
  })
  it('multiplies damage taken by zone; sides and a missing armour stay 1', () => {
    const a = { front: 0.6, back: 1.3 }
    expect(armorMul(a, ZONE_FRONT)).toBe(0.6)
    expect(armorMul(a, ZONE_BACK)).toBe(1.3)
    expect(armorMul(a, ZONE_SIDE)).toBe(1)
    expect(armorMul(null, ZONE_FRONT)).toBe(1)
    expect(armorMul(undefined, ZONE_BACK)).toBe(1)
  })
})

describe('catalog disc / armour data', () => {
  it('every disc is inside 0.75 … 1.35 and every armour inside its guard', () => {
    for (const s of SMASHER_LIST) {
      const d = discOf({ smasherId: s.id })
      expect(d, s.id).toBeGreaterThanOrEqual(DISC_MIN)
      expect(d, s.id).toBeLessThanOrEqual(DISC_MAX)
      if (s.disc !== undefined) expect(d, s.id).toBe(s.disc)
      const a = armorOf({ smasherId: s.id })
      if (a) for (const v of [a.front, a.back]) expect(v > 0.3 && v < 2, s.id).toBe(true)
    }
    expect(discOf({})).toBe(1)
    expect(armorOf({})).toBeNull()
  })
  it('the roster really uses the knobs (several sizes, armoured and weak zones)', () => {
    const discs = new Set(SMASHER_LIST.map(s => s.disc ?? 1))
    expect(discs.size).toBeGreaterThanOrEqual(5)
    expect(SMASHER_LIST.some(s => (s.disc ?? 1) > 1.2)).toBe(true)
    expect(SMASHER_LIST.some(s => (s.disc ?? 1) < 0.85)).toBe(true)
    expect(SMASHER_LIST.some(s => s.armor && s.armor.front < 1)).toBe(true)
    expect(SMASHER_LIST.some(s => s.armor && s.armor.back > 1)).toBe(true)
  })
})

describe('gameplay heading', () => {
  it('follows the velocity while moving, keeps it when (nearly) stopped', () => {
    const h: { hx?: number; hy?: number } = { hx: 0, hy: 1 }
    expect(followHeading(3, 4, 0.25, h)).toBe(true)
    expect(h).toEqual({ hx: 0.6, hy: 0.8 })
    expect(followHeading(0.1, 0, 0.25, h)).toBe(false)
    expect(h).toEqual({ hx: 0.6, hy: 0.8 })
    expect(followHeading(0, 0, 0, h)).toBe(false)
  })
})

// ─── Runtime hooks of the smasher-only effects ─────────────────────────────

const blade = (owner: 'player' | 'npc', id: number, loadout: SkillLoadout | null): SkillBlade => {
  const b: SkillBlade = { id, syncKey: id, owner, hp: 100, maxHp: 100, vx: 0, vy: 0, config: { topPartId: 'round' } }
  const s = createBladeSkills(loadout, 100, id, 1234)
  if (s) b.skills = s
  return b
}
const rt = (b: SkillBlade) => b.skills as SkillRuntime

describe('smasher-only effects — runtime', () => {
  it('are not team skills, and level tables + mods resolve', () => {
    for (const id of ['bank_shot', 'anchor', 'tower_breaker', 'thorns'] as const) expect(TEAM_SKILL_IDS).not.toContain(id)
    const b = blade('player', 1, [
      { id: 'bank_shot', level: 10, mods: { pct: 1.5 } },
      { id: 'anchor', level: 1 },
      { id: 'thorns', level: 5, mods: { share: 2 } }
    ])
    expect(rt(b).bankPct).toBeCloseTo(skillParams('bank_shot', 10).pct * 1.5)
    expect(rt(b).anchorResist).toBe(skillParams('anchor', 1).resist)
    expect(rt(b).thornsShare).toBeCloseTo(skillParams('thorns', 5).share * 2)
    const t = blade('player', 2, [{ id: 'tower_breaker', level: 10 }])
    expect(towerDamageMul(t)).toBeCloseTo(1 + skillParams('tower_breaker', 10).pct)
    expect(towerDamageMul(blade('player', 3, null))).toBe(1)
  })

  it('bank_shot: one bonus hit per launch, only after a rebound of its own launch', () => {
    const att = blade('player', 1, [{ id: 'bank_shot', level: 10 }])
    const def = blade('npc', 2, null)
    const out = createOutgoingResult()
    const rng0 = rt(att).rngState
    beginLaunchSkills(att)
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBe(1)
    onBankRebound(att, 2) // someone else's launch
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBe(1)
    onBankRebound(att, 1)
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBeCloseTo(1 + rt(att).bankPct)
    expect(out.bank).toBe(true)
    // Spent for this launch, even after another rebound.
    onBankRebound(att, 1)
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBe(1)
    beginLaunchSkills(att)
    onBankRebound(att, 1)
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBeGreaterThan(1)
    // Not on an ally, never a draw from the blade's stream.
    expect(rt(att).rngState).toBe(rng0)
  })

  it('bank_shot stacks under the per-hit clamp', () => {
    const att = blade('player', 1, [
      { id: 'bank_shot', level: 10, mods: { pct: 2 } },
      { id: 'momentum', level: 10, mods: { perStack: 2 } },
      { id: 'lucky_edge', level: 10, mods: { chance: 2, mult: 2 } }
    ])
    rt(att).rng = () => 0
    const def = blade('npc', 2, null)
    const out = createOutgoingResult()
    beginLaunchSkills(att)
    rt(att).stacks = 3
    onBankRebound(att, 1)
    expect(outgoingSkillMul(att, def, 10, 'hit', false, 1, out)).toBe(SKILL_HIT_MUL_CAP)
    expect(out.clamped).toBe(true)
  })

  it('anchor: keeps (1 − resist) of the knockback, never while it is the launched blade', () => {
    const b = blade('npc', 5, [{ id: 'anchor', level: 10 }])
    expect(anchorKeep(b, 1)).toBeCloseTo(1 - skillParams('anchor', 10).resist)
    expect(anchorKeep(b, null)).toBeCloseTo(1 - skillParams('anchor', 10).resist)
    expect(anchorKeep(b, 5)).toBe(1)
    expect(anchorKeep(blade('npc', 6, null), 1)).toBe(1)
    // A mod can never pin the blade completely.
    expect(anchorKeep(blade('npc', 7, [{ id: 'anchor', level: 10, mods: { resist: 2 } }]), 1)).toBeGreaterThan(0.199)
  })

  it('thorns: recoil only for an enemy hit on the spiked side, divided by the attacker defence', () => {
    const d = blade('npc', 2, [{ id: 'thorns', level: 10 }])
    const a = blade('player', 1, null)
    const share = skillParams('thorns', 10).share
    expect(thornsRecoil(d, a, 40, true, 1)).toBeCloseTo(40 * share)
    expect(thornsRecoil(d, a, 40, true, 2)).toBeCloseTo(20 * share)
    expect(thornsRecoil(d, a, 40, false, 1)).toBe(0)
    expect(thornsRecoil(d, a, 0, true, 1)).toBe(0)
    expect(thornsRecoil(d, blade('npc', 3, null), 40, true, 1)).toBe(0)
    expect(thornsRecoil(a, d, 40, true, 1)).toBe(0)
  })
})

// ─── Sanitiser / payload round-trips ───────────────────────────────────────

describe('sanitisers accept the new effects', () => {
  it('skill loadout sanitiser keeps new ids, clamps level + mods, drops junk', () => {
    const out = sanitizeSkillLoadout([
      { id: 'bank_shot', level: 3, mods: { pct: 1.2 }, key: 'plate_bounce' },
      { id: 'thorns', level: 14, mods: { share: 9 } },
      { id: 'anchor', level: 0 },
      { id: 'nope', level: 3 }
    ])
    expect(out).toEqual([
      { id: 'bank_shot', level: 3, mods: { pct: 1.2 }, key: 'plate_bounce' },
      { id: 'thorns', level: 10, mods: { share: 2 } }
    ])
    // Idempotent: a re-sanitised loadout is unchanged (sender + receiver).
    expect(sanitizeSkillLoadout(JSON.parse(JSON.stringify(out)))).toEqual(out)
  })

  it('every smasher loadout survives the receive-side sanitiser (JSON wire)', () => {
    for (const s of SMASHER_LIST) {
      const lo = smasherLoadout(smasherConfig(s.id, 30))
      // The sanitiser drops an empty mods object; nothing else may change.
      const want = lo.map(e => (e.mods && Object.keys(e.mods).length === 0 ? (({ mods: _m, ...r }) => r)(e) : e))
      expect(sanitizeSkillLoadout(JSON.parse(JSON.stringify(lo))), s.id).toEqual(want)
    }
  })

  it('PvP team sanitiser rebuilds a smasher config (disc / armour come from the id)', () => {
    for (const s of SMASHER_LIST) {
      const [c] = sanitizePvpTeam([{ smasherId: s.id, level: 12, radius: 999, armor: { front: 0 } }], { teamSize: 1 })
      expect(c, s.id).toEqual(smasherConfig(s.id, 12))
      expect(discOf(c!)).toBe(discOf({ smasherId: s.id }))
    }
  })

  it('league build validation (worker) accepts smasher builds with new-effect skill ids', () => {
    const team = [smasherConfig(SMASHER_LIST[0]!.id, 5, 'blades'), smasherConfig(SMASHER_LIST[1]!.id, 5, 'blades')]
    const build = encodePlayerBuild(team, [{ id: 'bank_shot', level: 2 }, { id: 'tower_breaker', level: 1 }])
    expect(build).not.toBeNull()
    expect(validatePlayerBuildShape(JSON.parse(JSON.stringify(build)))).toEqual(build)
  })
})

// ─── Engine (jsdom) ────────────────────────────────────────────────────────

type GameModule = typeof import('@/use/useSpinnerGame')
const FRAME_MS = 17
let clock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1

beforeEach(() => {
  clock = 1000
  rafQueue.clear()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const frame = () => {
  clock += FRAME_MS
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}
const loadGame = async (skills = false): Promise<GameModule> => {
  vi.resetModules()
  await import('@/use/useUser')
  const game = await import('@/use/useSpinnerGame')
  if (skills) await installSkillPort()
  return game
}
const byDisc = [...SMASHER_LIST].sort((a, b) => (b.disc ?? 1) - (a.disc ?? 1))
const BIG = byDisc[0]!.id
const SMALL = byDisc[byDisc.length - 1]!.id
// No star (crit rolls) and no triangle (Spiky chip rides on contact): the
// first hit is then exactly the collision formula.
const PLAIN_TOP = (t: string) => t !== 'star' && t !== 'triangle'
const NEUTRAL: SmasherId = SMASHER_LIST.find(s => !s.armor && (s.disc ?? 1) === 1 && PLAIN_TOP(s.archetype.top))?.id ?? 'hootsie'
const ARMOURED = SMASHER_LIST.find(s => s.armor && PLAIN_TOP(s.archetype.top))!.id

const untilPhase = (e: ReturnType<GameModule['useSpinnerGame']>, p: string, max = 600) => {
  for (let i = 0; i < max && e.phase.value !== p; i++) frame()
  expect(e.phase.value).toBe(p)
}

describe('engine — disc radius propagation', () => {
  it('collision / drawn radius = BLADE_RADIUS × team size × disc; a boss size stacks on top', async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    const boss: SpinnerConfig = { ...smasherConfig(BIG, 5), isBoss: true }
    e.initGame([smasherConfig(BIG, 5), smasherConfig(SMALL, 5)], [boss, smasherConfig(NEUTRAL, 5)],
      false, 'default', false, undefined, null, 'circle', { seed: 7 })
    // Both sides field two: 0.9 base × 0.87 (src/data/teamSize.ts).
    const R = game.BLADE_RADIUS * sideSizeMul(2)
    const [pBig, pSmall] = e.playerBlades.value
    expect(pBig!.radius).toBeCloseTo(R * discOf({ smasherId: BIG }))
    expect(pSmall!.radius).toBeCloseTo(R * discOf({ smasherId: SMALL }))
    expect(e.npcBlades.value[0]!.radius).toBeCloseTo(R * 1.2 * discOf({ smasherId: BIG }))
    expect(e.npcBlades.value[1]!.radius).toBeCloseTo(R)
    // Stats stay the profile's: a disc does not change HP.
    const plain = smasherConfig(BIG, 5)
    expect(pBig!.maxHp).toBe(e.playerBlades.value[0]!.maxHp)
    expect(plain.smasherId).toBe(BIG)
    e.disposePhysics()
  })

  it('big discs spawn clear of each other, the towers, the islands and the walls', async () => {
    const game = await loadGame()
    for (let layout = 0; layout < 8; layout++) {
      const e = game.useSpinnerGame()
      const team = byDisc.slice(0, 4).map(s => smasherConfig(s.id, 10))
      e.initGame(team, team.map(c => ({ ...c })), false, 'default', false, undefined, null, 'circle',
        { seed: 100 + layout, terrain: { layout, towers: true } })
      const blades = e.allBlades.value
      const lay = e.terrainLayout()
      const shape = lay !== null ? TERRAIN_SHAPES[layout % TERRAIN_SHAPES.length]! : 'clover'
      for (const b of blades) {
        expect(isInside(shape, b.x, b.y, game.ARENA_RADIUS, b.radius - 0.01), `layout ${layout} wall`).toBe(true)
        for (const t of e.towers()) expect(Math.hypot(b.x - t.x, b.y - t.y), `layout ${layout} tower`).toBeGreaterThanOrEqual(b.radius + t.radius)
        for (const isl of lay?.islands ?? []) {
          expect(Math.hypot(b.x - isl.x, b.y - isl.y), `layout ${layout} island`).toBeGreaterThanOrEqual(b.radius + isl.radius)
        }
      }
      for (let i = 0; i < blades.length; i++) {
        for (let j = i + 1; j < blades.length; j++) {
          const a = blades[i]!
          const c = blades[j]!
          expect(Math.hypot(a.x - c.x, a.y - c.y), `layout ${layout} blades ${i}/${j}`).toBeGreaterThanOrEqual(a.radius + c.radius)
        }
      }
      e.disposePhysics()
    }
  })

  it('1× discs spawn exactly where they always did (settle pass is a no-op)', async () => {
    const game = await loadGame()
    const e = game.useSpinnerGame()
    const team = [smasherConfig(NEUTRAL, 3), smasherConfig(NEUTRAL, 3)]
    const plainTeam: SpinnerConfig[] = team.map(c => ({ topPartId: c.topPartId, bottomPartId: c.bottomPartId, topLevel: 2, bottomLevel: 2 }))
    e.initGame(team, team.map(c => ({ ...c })), false, 'default', false, undefined, null, 'circle', { seed: 9 })
    const a = e.allBlades.value.map(b => `${b.x},${b.y}`).join('|')
    e.initGame(plainTeam, plainTeam.map(c => ({ ...c })), false, 'default', false, undefined, null, 'circle', { seed: 9 })
    expect(e.allBlades.value.map(b => `${b.x},${b.y}`).join('|')).toBe(a)
    e.disposePhysics()
  })
})

/** Launch the player's first blade straight up into the NPC parked above it;
 *  returns the HP the NPC lost on the first hit. */
const firstHitLoss = async (
  setup: (npc: SpinnerState) => void,
  npcId: SmasherId = ARMOURED
): Promise<{ loss: number; player: SpinnerState }> => {
  const game = await loadGame()
  const e = game.useSpinnerGame()
  e.initGame([smasherConfig(NEUTRAL, 1)], [smasherConfig(npcId, 1)], false, 'default', false, undefined, null,
    'circle', { seed: 42, firstTurn: 'player' })
  e.startMatch()
  untilPhase(e, 'player_turn')
  const p = e.playerBlades.value[0]!
  const n = e.npcBlades.value[0]!
  p.x = 0
  p.y = 70
  n.x = 0
  n.y = -30
  setup(n)
  e.beginDrag(p.x, p.y)
  e.updateDrag(p.x, p.y + game.MAX_PULL_DISTANCE * 0.8)
  e.releaseDrag()
  const hp0 = n.hp
  for (let i = 0; i < 400 && n.hp === hp0; i++) frame()
  const loss = hp0 - n.hp
  e.disposePhysics()
  return { loss, player: p }
}

describe('engine — heading + directional armour on real hits', () => {
  it('the launch sets the heading to the launch direction', async () => {
    const { player } = await firstHitLoss(() => {})
    // Launched straight up (−y); the hit bounced it back, so it now heads +y.
    expect(Math.abs(player.hx ?? 0)).toBeLessThan(1e-6)
    expect(Math.abs(player.hy ?? 0)).toBeCloseTo(1, 6)
  })

  it('damage taken × armour.front / back / 1 by where the contact lands', async () => {
    const A = { front: 0.5, back: 1.5 }
    const base = (await firstHitLoss(n => { delete n.armor })).loss
    expect(base).toBeGreaterThan(0)
    // Attacker comes from below (+y): the contact on the npc is at its +y side.
    const front = (await firstHitLoss(n => { n.armor = A; n.hx = 0; n.hy = 1 })).loss
    const back = (await firstHitLoss(n => { n.armor = A; n.hx = 0; n.hy = -1 })).loss
    const side = (await firstHitLoss(n => { n.armor = A; n.hx = 1; n.hy = 0 })).loss
    expect(front / base).toBeCloseTo(0.5, 6)
    expect(back / base).toBeCloseTo(1.5, 6)
    expect(side / base).toBeCloseTo(1, 6)
  })
})

describe('engine — new effects in a real match', () => {
  it('a smasher with a new effect equips it from its own catalog loadout', async () => {
    const withNew = SMASHER_LIST.find(s => s.skills.some(k => !TEAM_SKILL_IDS.includes(k.effect)))
    if (!withNew) return
    const game = await loadGame(true)
    const e = game.useSpinnerGame()
    e.initGame([smasherConfig(withNew.id, 30)], [smasherConfig(NEUTRAL, 30)], false, 'default', false, undefined, null,
      'circle', { seed: 3 })
    const s = e.playerBlades.value[0]!.skills!
    for (const k of withNew.skills) expect(s.ids).toContain(k.effect)
    e.disposePhysics()
  })
})
