// Roadmap #4 — in-fight feedback for every smasher skill: drawn icon, name
// key, VFX flavour, sound mapping, and the rate-limited proc callout.
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { SMASHER_IDS, SMASHER_LIST } from '@/data/smasherCatalog'
import { SKILL_IDS } from '@/data/skillCatalog'
import {
  FLAVOUR_SHAPES, SMASHER_SKILL_ART, smasherSkillKey, smasherSkillArt
} from '@/use/skills/smasherSkillArt'
import {
  CALLOUT_KINDS, CALLOUT_MERGE_MS, calloutText, createSkillCallouts, pushSkillCallout, tickSkillCallouts,
  CALLOUT_LIFE_MS, type CalloutInput
} from '@/use/skills/skillCallouts'
import {
  createSkillVfx, skillVfxEvent, spawnSkillFlavour, SKILL_KIND_VOLUME, type SkillEvent, type SkillEventKind
} from '@/use/skills/skillVfx'
import { SKILL_BATTLE_SFX_ASSETS, __resetSkillSfx, __setSkillSfxPlayer } from '@/use/skills/skillSfx'
import en from '@/i18n/locales/en'
import type { SkillId } from '@/types/skills'

const ROOT = join(__dirname, '..')
const ALL_SKILLS = SMASHER_LIST.flatMap(s => s.skills.map(sk => ({ smasher: s.id, ...sk })))

// en translator: nested lookup + {named} interpolation (what vue-i18n does).
const t = (key: string, named: Record<string, unknown> = {}): string => {
  const flat = (en as Record<string, unknown>)[key]
  let v: unknown = flat
  if (typeof v !== 'string') {
    v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en)
  }
  if (typeof v !== 'string') throw new Error(`missing en key ${key}`)
  return v.replace(/\{(\w+)\}/g, (_, k: string) => String(named[k]))
}

const ev = (kind: SkillEventKind, key: string, bladeId = 1, value = 5): SkillEvent => ({
  seq: 1, t: 0, kind, skill: 'momentum', bladeId, syncKey: bladeId, owner: 'player', x: 0, y: 0, value, key
})

describe('every smasher skill has feedback art, a name, a flavour and a sound', () => {
  it('three skills per smasher, each with a registry entry', () => {
    expect(ALL_SKILLS).toHaveLength(SMASHER_IDS.length * 3)
    expect(Object.keys(SMASHER_SKILL_ART).sort()).toEqual(ALL_SKILLS.map(s => s.id).sort())
  })

  it.each(ALL_SKILLS.map(s => [s.id, s] as const))('%s', (id, s) => {
    const art = SMASHER_SKILL_ART[id]!
    // Icon: ≥ 2 layers, at least one filled, only SVG path commands.
    expect(art.icon.length).toBeGreaterThanOrEqual(2)
    expect(art.icon.some(l => l.fill !== undefined)).toBe(true)
    for (const l of art.icon) expect(l.d).toMatch(/^M[-\d.\sMLHVCSQTAZmlhvcsqtaz]+$/)
    // Name key exists (en) — the callout / HUD / modal label.
    expect(typeof (en as Record<string, unknown>)[`smasher_skill_${id}`]).toBe('string')
    // Flavour shape exists and spawns particles.
    expect(FLAVOUR_SHAPES[art.flavour.shape]).toBeDefined()
    expect(art.flavour.count).toBeGreaterThan(0)
    // Sound: a shipped battle SFX (or level-up), at a sane pitch.
    const file = `audio/sfx/${art.sfx.name}.ogg`
    if (art.sfx.name !== 'level-up') expect(SKILL_BATTLE_SFX_ASSETS as readonly string[]).toContain(file)
    expect(existsSync(join(ROOT, 'public', file))).toBe(true)
    expect(art.sfx.rate).toBeGreaterThanOrEqual(0.6)
    expect(art.sfx.rate).toBeLessThanOrEqual(1.4)
    // Engine lookup: the blade's smasher + effect resolves to this skill.
    expect(smasherSkillKey(s.smasher, s.effect)).toBe(id)
  })

  it('icons are distinct (one drawing per skill)', () => {
    const sigs = new Set(Object.values(SMASHER_SKILL_ART).map(a => a.icon.map(l => l.d).join('|')))
    expect(sigs.size).toBe(ALL_SKILLS.length)
  })

  it('a part-only blade (no smasher) keeps the generic effect', () => {
    expect(smasherSkillKey(undefined, 'momentum')).toBe('')
    expect(smasherSkillKey('nobody', 'momentum')).toBe('')
    expect(smasherSkillArt('')).toBeNull()
  })

  it('every smasher skill name key exists in every locale', async () => {
    const dir = join(ROOT, 'src/i18n/locales')
    for (const f of readdirSync(dir)) {
      const mod = (await import(/* @vite-ignore */ `@/i18n/locales/${f.replace(/\.ts$/, '')}`)).default as Record<string, unknown>
      for (const s of ALL_SKILLS) expect(typeof mod[`smasher_skill_${s.id}`], `${f} ${s.id}`).toBe('string')
      const callout = (mod.skills as Record<string, Record<string, string>>).callout!
      for (const k of Object.keys((en as { skills: { callout: object } }).skills.callout)) {
        expect(typeof callout[k], `${f} callout.${k}`).toBe('string')
      }
    }
  })
})

describe('proc callouts', () => {
  const anchor = { id: 7, x: 0, y: 0, radius: 30 }
  const input = (kind: SkillEventKind, effect: SkillId, value: number, extra: Partial<CalloutInput> = {}): CalloutInput =>
    ({ kind, effect, key: 'carrot_rush', value, side: 'player', ...extra })

  it('every callout kind renders a non-empty, interpolated value line', () => {
    for (const kind of CALLOUT_KINDS) {
      const text = calloutText({ kind, value: 12, mult: 1.6, stunned: true }, t)
      expect(text.length, kind).toBeGreaterThan(0)
      expect(text).not.toMatch(/[{}]/)
    }
    expect(calloutText({ kind: 'shield_absorb', value: 12, mult: 1, stunned: false }, t)).toBe('12 blocked')
    expect(calloutText({ kind: 'heal', value: 8, mult: 1, stunned: false }, t)).toBe('+8 HP')
    expect(calloutText({ kind: 'lucky', value: 0, mult: 1.6, stunned: false }, t)).toBe('Crit ×1.6')
    expect(calloutText({ kind: 'static', value: 1, mult: 1, stunned: true }, t)).toBe('Stunned!')
  })

  it('carries the smasher skill name, team side and icon key', () => {
    const c = createSkillCallouts()
    const s = pushSkillCallout(c, input('momentum', 'momentum', 1, { mult: 1.2, side: 'npc' }), anchor, 0, t)!
    expect(s.name).toBe('Carrot Rush')
    expect(s.side).toBe('npc')
    expect(s.key).toBe('carrot_rush')
    expect(s.text).toBe('Power ×1.2')
  })

  it('exactly one callout per (blade, skill) per rate-limit window; merges count up', () => {
    const c = createSkillCallouts()
    for (let i = 0; i < 10; i++) {
      pushSkillCallout(c, input('shield_absorb', 'guard_shell', 3, { key: 'curl_up' }), anchor, i * 50, t)
    }
    expect(c.started).toBe(1)
    expect(c.merged).toBe(9)
    const live = c.pool.filter(s => s.active)
    expect(live).toHaveLength(1)
    expect(live[0]!.text).toBe('30 blocked')
    // Next window: the same slot restarts (still one pill on screen).
    pushSkillCallout(c, input('shield_absorb', 'guard_shell', 4, { key: 'curl_up' }), anchor, CALLOUT_MERGE_MS + 1, t)
    expect(c.started).toBe(2)
    expect(c.pool.filter(s => s.active)).toHaveLength(1)
    expect(c.pool.find(s => s.active)!.text).toBe('4 blocked')
  })

  it('different skills / blades get their own pill; rocket hits get none', () => {
    const c = createSkillCallouts()
    pushSkillCallout(c, input('momentum', 'momentum', 1), anchor, 0, t)
    pushSkillCallout(c, input('lucky', 'lucky_edge', 0, { key: 'double_kick', mult: 1.5 }), anchor, 0, t)
    pushSkillCallout(c, input('momentum', 'momentum', 1), { ...anchor, id: 8 }, 0, t)
    expect(pushSkillCallout(c, input('rocket_hit', 'homing_rockets', 9), anchor, 0, t)).toBeNull()
    expect(c.started).toBe(3)
  })

  it('a shield break wins over the absorb text in the same window', () => {
    const c = createSkillCallouts()
    pushSkillCallout(c, input('shield_absorb', 'guard_shell', 5), anchor, 0, t)
    pushSkillCallout(c, input('shield_break', 'guard_shell', 0), anchor, 10, t)
    pushSkillCallout(c, input('shield_absorb', 'guard_shell', 5), anchor, 20, t)
    expect(c.pool.find(s => s.active)!.text).toBe('Shield broken!')
  })

  it('expires after its life', () => {
    const c = createSkillCallouts()
    pushSkillCallout(c, input('phase', 'phase_step', 0), anchor, 0, t)
    expect(tickSkillCallouts(c, CALLOUT_LIFE_MS - 1)).toBe(1)
    expect(tickSkillCallouts(c, CALLOUT_LIFE_MS + 1)).toBe(0)
  })
})

describe('flavour VFX + per-skill sound', () => {
  afterEach(() => {
    __setSkillSfxPlayer(null)
    __resetSkillSfx()
  })

  it('every skill throws its own particles, throttled per blade', () => {
    for (const s of ALL_SKILLS) {
      const fx = createSkillVfx()
      expect(spawnSkillFlavour(fx, ev('mirror', s.id)), s.id).toBeGreaterThan(0)
      expect(spawnSkillFlavour(fx, ev('mirror', s.id))).toBe(0)
      expect(spawnSkillFlavour(fx, ev('mirror', s.id, 2))).toBeGreaterThan(0)
      expect(fx.flakes.filter(p => p.active).every(p => p.shape === SMASHER_SKILL_ART[s.id]!.flavour.shape)).toBe(true)
    }
    expect(spawnSkillFlavour(createSkillVfx(), ev('mirror', ''))).toBe(0)
  })

  it('FX.low: no flavour particles, but the sound still plays', () => {
    const calls: unknown[][] = []
    __setSkillSfxPlayer((...a: unknown[]) => {
      calls.push(a)
      return null
    })
    const fx = createSkillVfx()
    skillVfxEvent(fx, ev('heal', 'honey_snack'), true)
    expect(fx.flakes.some(p => p.active)).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toBe('level-up')
    expect(calls[0]![3]).toBe(SMASHER_SKILL_ART.honey_snack!.sfx.rate)
  })

  it('every proc kind of a smasher skill is audible (rocket hits stay silent)', () => {
    for (const kind of CALLOUT_KINDS) expect(SKILL_KIND_VOLUME[kind], kind).toBeGreaterThan(0)
    expect(SKILL_KIND_VOLUME.rocket_hit).toBeUndefined()
  })

  it('skill ids in the catalog are the 10 engine effects', () => {
    for (const s of ALL_SKILLS) expect(SKILL_IDS).toContain(s.effect)
  })
})
