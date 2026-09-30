// ─── WP6: PvP skill loadout exchange, honour, ghost loadouts ────────────────
//
// skills-feature.md §9.1: `player-ready` carries ≤ 2 { id, level } entries,
// re-sanitised ON RECEIPT (known ids, levels 1–10, no duplicates, "level 1"
// lobbies clamp to L1); protocol v3 refuses older peers; honour counts a
// skill level as 0.8 part levels; leaderboard ghosts carry a seeded,
// deterministic loadout.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
// Skills build (the flag must be on before the skills gate loads).
import './helpers/skillsBuild'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import usePVP, { PVP_PROTOCOL_VERSION, receivePvpMessage, whenPvpSkillsReady } from '@/use/usePVP'
import {
  PART_LEVEL_SANITY_MAX,
  sanitizePvpLoadout,
  sanitizePvpTeam,
  skillLevelSum
} from '@/use/loadoutSanitizer'
import { sanitizeSkillLoadout } from '@/use/skills/skillLoadoutSanitizer'
import { calcHonorPoints, HONOR_BASE_WIN, HONOR_SKILL_LEVEL_WEIGHT } from '@/use/usePvpStats'
import { ghostSkillLoadout, GHOST_SKILL_VALUE } from '@/use/skills/ghostSkills'
import { SKILL_IDS, SKILLS } from '@/data/skillCatalog'
import PvpVsPreview from '@/components/organisms/PvpVsPreview.vue'
import en from '@/i18n/locales/en'
import type { SpinnerConfig } from '@/types/spinner'
import type { PvPGameConfig } from '@/use/usePVP'

const team: SpinnerConfig[] = [
  { topPartId: 'star', bottomPartId: 'balanced', topLevel: 6, bottomLevel: 4 },
  { topPartId: 'round', bottomPartId: 'tanky', topLevel: 5, bottomLevel: 5 }
]

// ─── The pure sanitiser (league reuses it) ─────────────────────────────────

describe('sanitizeSkillLoadout', () => {
  it('drops unknown ids', () => {
    expect(sanitizeSkillLoadout([{ id: 'laser_eyes', level: 5 }, { id: 'guard_shell', level: 3 }]))
      .toEqual([{ id: 'guard_shell', level: 3 }])
  })

  it('clamps level 11 to 10, floors fractions, drops level < 1 and non-numbers', () => {
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: 11 }])).toEqual([{ id: 'guard_shell', level: 10 }])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: 999 }])).toEqual([{ id: 'guard_shell', level: 10 }])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: 4.9 }])).toEqual([{ id: 'guard_shell', level: 4 }])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: 0 }])).toEqual([])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: -3 }])).toEqual([])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: Number.NaN }])).toEqual([])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: Infinity }])).toEqual([])
    expect(sanitizeSkillLoadout([{ id: 'guard_shell', level: '7' }])).toEqual([])
  })

  it('drops duplicates (first wins)', () => {
    expect(sanitizeSkillLoadout([
      { id: 'momentum', level: 2 },
      { id: 'momentum', level: 9 }
    ])).toEqual([{ id: 'momentum', level: 2 }])
  })

  it('keeps at most 2 entries (3 sent)', () => {
    expect(sanitizeSkillLoadout([
      { id: 'momentum', level: 2 },
      { id: 'lucky_edge', level: 3 },
      { id: 'second_wind', level: 4 }
    ])).toEqual([{ id: 'momentum', level: 2 }, { id: 'lucky_edge', level: 3 }])
  })

  it('an invalid entry does not use up a slot', () => {
    expect(sanitizeSkillLoadout([
      { id: 'nope', level: 2 },
      null,
      'guard_shell',
      { id: 'lucky_edge', level: 3 },
      { id: 'second_wind', level: 4 }
    ])).toEqual([{ id: 'lucky_edge', level: 3 }, { id: 'second_wind', level: 4 }])
  })

  it('garbage → empty', () => {
    for (const raw of [undefined, null, 5, 'x', {}, { 0: { id: 'momentum', level: 1 } }]) {
      expect(sanitizeSkillLoadout(raw)).toEqual([])
    }
  })

  it('level-one clamps every level to 1', () => {
    expect(sanitizeSkillLoadout(
      [{ id: 'momentum', level: 9 }, { id: 'lucky_edge', level: 11 }],
      { levelOne: true }
    )).toEqual([{ id: 'momentum', level: 1 }, { id: 'lucky_edge', level: 1 }])
  })

  it('is idempotent and does not mutate its input', () => {
    const raw = [{ id: 'momentum', level: 12 }, { id: 'momentum', level: 1 }]
    const snapshot = JSON.parse(JSON.stringify(raw))
    const once = sanitizeSkillLoadout(raw)
    expect(sanitizeSkillLoadout(once)).toEqual(once)
    expect(raw).toEqual(snapshot)
  })
})

describe('sanitizePvpTeam', () => {
  it('cuts to the lobby team size', () => {
    expect(sanitizePvpTeam(team, { teamSize: 1 })).toHaveLength(1)
    expect(sanitizePvpTeam([...team, ...team], { teamSize: 2 })).toHaveLength(2)
  })

  it('drops unknown parts, strips boss flags and unknown skins, clamps part levels', () => {
    const out = sanitizePvpTeam([
      { topPartId: 'death_ray', bottomPartId: 'balanced' },
      {
        topPartId: 'star', bottomPartId: 'speedy', topLevel: 1e9, bottomLevel: -4,
        isBoss: true, bossAbility: 'ghost', bossStats: true, modelId: '../../evil'
      },
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 3.7, modelId: 'turtle' }
    ], { teamSize: 2 })
    expect(out).toEqual([
      { topPartId: 'star', bottomPartId: 'speedy', topLevel: PART_LEVEL_SANITY_MAX, bottomLevel: 0 },
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 3, modelId: 'turtle' }
    ])
  })

  it('level-one forces part levels to 1', () => {
    const out = sanitizePvpTeam(team, { teamSize: 2, levelOne: true })
    expect(out.every(c => c.topLevel === 1 && c.bottomLevel === 1)).toBe(true)
  })

  it('a build without a valid spinner is unusable', () => {
    expect(sanitizePvpLoadout([{
      topPartId: 'x',
      bottomPartId: 'y'
    }], [], { teamSize: 1 }, sanitizeSkillLoadout)).toBeNull()
    expect(sanitizePvpLoadout('nope', [], { teamSize: 1 }, sanitizeSkillLoadout)).toBeNull()
  })

  it('no skill sanitiser (skills-off build) → the skills are ignored', () => {
    const out = sanitizePvpLoadout(team, [{ id: 'guard_shell', level: 3 }], { teamSize: 2 }, null)
    expect(out?.skills).toEqual([])
    expect(out?.team).toHaveLength(2)
  })

  it('skillLevelSum', () => {
    expect(skillLevelSum([{ id: 'momentum', level: 3 }, { id: 'lucky_edge', level: 10 }])).toBe(13)
    expect(skillLevelSum([])).toBe(0)
    expect(skillLevelSum(undefined)).toBe(0)
  })
})

// ─── usePVP: exchange + receiver re-check + protocol v3 ───────────────────

describe('PvP player-ready skills exchange', () => {
  const pvp = usePVP()
  const config = (c: Partial<PvPGameConfig> = {}) =>
    receivePvpMessage({ type: 'game-config', config: { arenaType: 'default', teamSize: 2, levelOne: false, ...c } })

  // The receive-side skill sanitiser arrives through the skills gate.
  beforeAll(whenPvpSkillsReady)

  beforeEach(() => {
    pvp.leavePvP()
    ;(window as unknown as { __i18n?: unknown }).__i18n = {
      global: { t: (k: string) => (k === 'pvp.versionMismatch' ? 'LOCALIZED-MISMATCH' : k) }
    }
  })

  afterEach(() => {
    delete (window as unknown as { __i18n?: unknown }).__i18n
    pvp.leavePvP()
  })

  it('is protocol v3', () => {
    expect(PVP_PROTOCOL_VERSION).toBe(3)
  })

  it('refuses a v2 peer (pre-skills) with the localized message', () => {
    config()
    receivePvpMessage({ type: 'player-ready', team, skills: [{ id: 'momentum', level: 2 }], proto: 2 })
    expect(pvp.hostReady.value).toBe(false)
    expect(pvp.hostSkills.value).toEqual([])
    expect(pvp.status.value).toBe('error')
    expect(pvp.errorMessage.value).toBe('LOCALIZED-MISMATCH')
  })

  it('stores the peer skills sanitised on receipt (unknown id, level 11, duplicate, 3 entries)', () => {
    config()
    receivePvpMessage({
      type: 'player-ready',
      team,
      // a modded client: none of this may reach the engine as sent
      skills: [
        { id: 'laser_eyes', level: 10 },
        { id: 'guard_shell', level: 11 },
        { id: 'guard_shell', level: 3 },
        { id: 'lucky_edge', level: 4 },
        { id: 'second_wind', level: 9 }
      ] as never,
      proto: PVP_PROTOCOL_VERSION
    })
    expect(pvp.hostReady.value).toBe(true)
    expect(pvp.hostSkills.value).toEqual([{ id: 'guard_shell', level: 10 }, { id: 'lucky_edge', level: 4 }])
    expect(pvp.hostTeam.value).toEqual(team)
  })

  it('clamps skills AND parts to L1 at the receiver in a level-one lobby (sender did not)', () => {
    config({ levelOne: true })
    receivePvpMessage({
      type: 'player-ready',
      team,
      skills: [{ id: 'guard_shell', level: 8 }, { id: 'momentum', level: 10 }],
      proto: PVP_PROTOCOL_VERSION
    })
    expect(pvp.hostSkills.value).toEqual([{ id: 'guard_shell', level: 1 }, { id: 'momentum', level: 1 }])
    expect(pvp.hostTeam.value.every(c => c.topLevel === 1 && c.bottomLevel === 1)).toBe(true)
  })

  it('an old-shape ready without skills gets an empty loadout', () => {
    config()
    receivePvpMessage({ type: 'player-ready', team, proto: PVP_PROTOCOL_VERSION })
    expect(pvp.hostReady.value).toBe(true)
    expect(pvp.hostSkills.value).toEqual([])
  })

  it('never marks a peer ready whose team has no valid spinner', () => {
    config()
    receivePvpMessage({
      type: 'player-ready',
      team: [{ topPartId: 'nope', bottomPartId: 'nope' }] as never,
      skills: [{ id: 'momentum', level: 2 }],
      proto: PVP_PROTOCOL_VERSION
    })
    expect(pvp.hostReady.value).toBe(false)
    expect(pvp.hostSkills.value).toEqual([])
  })

  it('the local side keeps the SAME sanitised copy the peer will compute', () => {
    // No role yet → setReady writes the guest side.
    config({ levelOne: true })
    const sent = [{ id: 'guard_shell', level: 8 }, { id: 'guard_shell', level: 2 }, {
      id: 'momentum',
      level: 12
    }] as never
    pvp.setReady(team, sent)
    const peerView = sanitizePvpLoadout(team, sent, { teamSize: 2, levelOne: true }, sanitizeSkillLoadout)
    expect(pvp.guestSkills.value).toEqual(peerView!.skills)
    expect(pvp.guestTeam.value).toEqual(peerView!.team)
    expect(pvp.guestSkills.value).toEqual([{ id: 'guard_shell', level: 1 }, { id: 'momentum', level: 1 }])
  })

  it('a config change un-readies both sides (every build is re-sent under the new rule)', () => {
    config()
    receivePvpMessage({ type: 'player-ready', team, skills: [], proto: PVP_PROTOCOL_VERSION })
    expect(pvp.hostReady.value).toBe(true)
    config({ levelOne: true })
    expect(pvp.hostReady.value).toBe(false)
    expect(pvp.guestReady.value).toBe(false)
  })
})

// ─── Honour ────────────────────────────────────────────────────────────────

describe('calcHonorPoints with skills (0.8 × Σ skill levels)', () => {
  it('uses 0.8 per skill level', () => {
    expect(HONOR_SKILL_LEVEL_WEIGHT).toBe(0.8)
  })

  it('no skills → unchanged', () => {
    expect(calcHonorPoints(10, 10)).toBe(HONOR_BASE_WIN)
    expect(calcHonorPoints(10, 10, 0, 0)).toBe(HONOR_BASE_WIN)
    expect(calcHonorPoints(10, 14)).toBe(140)
  })

  it('equal skill levels cancel out', () => {
    expect(calcHonorPoints(10, 10, 12, 12)).toBe(HONOR_BASE_WIN)
  })

  it('a skilled winner earns less, beating a skilled opponent earns more', () => {
    // me 10 + 0.8×5 = 14 vs 10 → diff −4 → 100 − 40
    expect(calcHonorPoints(10, 10, 5, 0)).toBe(60)
    // me 20 vs 10 + 0.8×10 = 18 → diff −2 → 80
    expect(calcHonorPoints(20, 10, 0, 10)).toBe(80)
    // me 10 vs 10 + 0.8×3 = 12.4 → diff 2.4 → 124
    expect(calcHonorPoints(10, 10, 0, 3)).toBe(124)
  })

  it('keeps the 25…200 clamp', () => {
    expect(calcHonorPoints(10, 10, 0, 20)).toBe(200)
    expect(calcHonorPoints(10, 10, 20, 0)).toBe(25)
  })
})

// ─── Ghost loadouts ────────────────────────────────────────────────────────

describe('ghostSkillLoadout (leaderboard ghosts, §9.1)', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `npc-${i}-lz0abc`)

  it('is deterministic across calls for the same entry', () => {
    for (const id of ids) {
      for (const maxStage of [11, 21, 37, 56, 80, 126, 300]) {
        const a = ghostSkillLoadout({ id, maxStage })
        const b = ghostSkillLoadout({ id, maxStage })
        expect(b).toEqual(a)
        // a copy of the entry (e.g. re-read from storage) gives the same loadout
        expect(ghostSkillLoadout({ ...{ id, maxStage } })).toEqual(a)
      }
    }
  })

  it('no skills before the stage-10 boss is cleared', () => {
    for (const maxStage of [0, 1, 5, 10]) expect(ghostSkillLoadout({ id: 'npc-1', maxStage })).toEqual([])
  })

  it('1 slot from cleared 10, 2 from cleared 20; only unlocked skills', () => {
    expect(ghostSkillLoadout({ id: 'npc-1', maxStage: 11 })).toEqual([{ id: 'mirror_plate', level: 1 }])
    for (const id of ids) {
      const l = ghostSkillLoadout({ id, maxStage: 20 })
      expect(l).toHaveLength(1)
      const two = ghostSkillLoadout({ id, maxStage: 21 })
      expect(two).toHaveLength(2)
      for (const s of two) expect(SKILLS[s.id].unlockStage).toBeLessThanOrEqual(20)
    }
  })

  it('levels follow clamp(1 + ⌊(maxStage − unlockStage)/7⌋, 1, 10), distinct ids, unlock order', () => {
    for (const id of ids) {
      for (const maxStage of [21, 45, 80, 200]) {
        const l = ghostSkillLoadout({ id, maxStage })
        expect(new Set(l.map(s => s.id)).size).toBe(l.length)
        for (const s of l) {
          expect(s.level).toBe(Math.max(1, Math.min(10, 1 + Math.floor((maxStage - SKILLS[s.id].unlockStage) / 7))))
        }
        if (l.length === 2) expect(SKILLS[l[0]!.id].unlockStage).toBeLessThan(SKILLS[l[1]!.id].unlockStage)
      }
    }
  })

  it('picks from the high-value end, with seeded variety between ghosts', () => {
    const picks = new Set<string>()
    for (const id of ids) {
      const l = ghostSkillLoadout({ id, maxStage: 120 })
      picks.add(l.map(s => s.id).join('+'))
      // never the zero-value hazard skill in a default-arena ghost fight
      expect(l.some(s => s.id === 'hazard_ward')).toBe(false)
    }
    expect(picks.size).toBeGreaterThan(1)
    expect(Object.keys(GHOST_SKILL_VALUE).sort()).toEqual([...SKILL_IDS].sort())
  })
})

// ─── VS card ───────────────────────────────────────────────────────────────

describe('PvpVsPreview', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })
  const props = {
    hostTeam: team,
    guestTeam: [{ topPartId: 'piercer', bottomPartId: 'speedy' }] as SpinnerConfig[],
    hostSkills: [{ id: 'guard_shell', level: 4 }, { id: 'momentum', level: 2 }] as const,
    guestSkills: [{ id: 'static_charge', level: 9 }] as const
  }

  it('puts the local side left and labels the opponent skill row', () => {
    const w = mount(PvpVsPreview, {
      props: { ...props, hostSkills: [...props.hostSkills], guestSkills: [...props.guestSkills], myRole: 'guest' },
      global: { plugins: [i18n()] }
    })
    const me = w.get('[data-side="me"]')
    const them = w.get('[data-side="them"]')
    expect(me.findAll('[data-skill]').map(n => n.attributes('data-skill'))).toContain('static_charge')
    expect(me.text()).toContain('Lv.9')
    expect(them.findAll('.vs-chip').length).toBe(2)
    expect(them.get('[role="group"]').attributes('aria-label')).toBe(en.skills.opponentSkills)
    expect(me.findAll('img').length).toBe(1)
    expect(them.findAll('img').length).toBe(2)
    w.unmount()
  })

  it('fits the window: every beat is a fraction of durationMs; cheap variant flagged', () => {
    const w = mount(PvpVsPreview, {
      props: {
        ...props,
        hostSkills: [...props.hostSkills],
        guestSkills: [...props.guestSkills],
        myRole: 'host',
        low: true,
        durationMs: 1200
      },
      global: { plugins: [i18n()] }
    })
    const root = w.get('[data-testid="pvp-vs-preview"]')
    expect(root.attributes('style')).toContain('--vs-dur: 1200ms')
    expect(root.classes()).toContain('is-cheap')
    // the last chip pops (and finishes) well before the fade-out at 84 %
    const delays = w.findAll('.vs-chip').map(n => n.attributes('style') ?? '')
    const fractions = delays.map(d => Number(/\*\s*([\d.]+)/.exec(d)?.[1]))
    for (const f of fractions) expect(f + 0.1).toBeLessThan(0.84)
    w.unmount()
  })
})
