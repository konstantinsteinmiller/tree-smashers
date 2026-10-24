// Painted skill art (tools/skill-art) — the generated registry, the drawn
// fallback for every skill and flavour shape, `?art=procedural`, and the
// prompt contract (every motif shows the skill's CURRENT effect).

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import { SMASHER_LIST } from '@/data/smasherCatalog'
import { PAINTED_SKILL_FX, PAINTED_SKILL_ICONS } from '@/use/skills/paintedSkillArt'
import {
  FLAVOUR_SHAPES, SMASHER_SKILL_ART, paintedFlavourImage, paintedFlavourUrl, paintedSkillIconUrl, type FlavourShapeId
} from '@/use/skills/smasherSkillArt'
// @ts-expect-error — plain .mjs tool module, no types
import { EFFECT_CUE, FLAVOURS, FLAVOUR_IDS, SHEETS, SKILLS, SWITCHED, promptFor, singlePromptFor } from '../tools/skill-art/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const CATALOG = SMASHER_LIST.flatMap(s => s.skills.map(k => ({ id: k.id, effect: k.effect as string })))
const SHAPES = Object.keys(FLAVOUR_SHAPES) as FlavourShapeId[]
type Row = [string, string, string, string]

describe('skill art registry (tools/skill-art/pack.mjs output)', () => {
  it('lists only skills and shapes the game has, each with a content hash', () => {
    for (const [id, v] of Object.entries(PAINTED_SKILL_ICONS)) {
      expect(SMASHER_SKILL_ART[id], id).toBeDefined()
      expect(v, id).toMatch(/^[0-9a-f]{8}$/)
    }
    for (const [id, v] of Object.entries(PAINTED_SKILL_FX)) {
      expect(SHAPES, id).toContain(id)
      expect(v, id).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it('never registers a painting without its webp (and no webp without an entry)', () => {
    for (const id of Object.keys(PAINTED_SKILL_ICONS)) {
      const f = path.join(ROOT, 'public/images/skills', `${id}.webp`)
      expect(existsSync(f), f).toBe(true)
      expect(statSync(f).size, f).toBeGreaterThan(300)
    }
    for (const id of Object.keys(PAINTED_SKILL_FX)) {
      const f = path.join(ROOT, 'public/images/skills/fx', `${id}.webp`)
      expect(existsSync(f), f).toBe(true)
      expect(statSync(f).size, f).toBeGreaterThan(150)
    }
    // The old hand-set flags are gone: the generated registry is the one switch.
    expect(readFileSync(path.join(ROOT, 'src/use/skills/smasherSkillArt.ts'), 'utf8')).not.toMatch(/painted:\s*true/)
  })

  it('builds the painted URL with the cache key, and null (= the drawing) for every unpainted skill / shape', () => {
    for (const { id } of CATALOG) {
      const v = PAINTED_SKILL_ICONS[id]
      expect(paintedSkillIconUrl(id), id).toEqual(v ? expect.stringContaining(`images/skills/${id}.webp?v=${v}`) : null)
      // The vector drawing is always there as the fallback.
      expect(SMASHER_SKILL_ART[id]!.icon.length, id).toBeGreaterThan(0)
    }
    for (const s of SHAPES) {
      const v = PAINTED_SKILL_FX[s]
      expect(paintedFlavourUrl(s), s).toEqual(v ? expect.stringContaining(`images/skills/fx/${s}.webp?v=${v}`) : null)
      expect(FLAVOUR_SHAPES[s].d.length, s).toBeGreaterThan(0)
    }
    expect(paintedSkillIconUrl('no_such_skill')).toBeNull()
  })

  it('draws on the canvas only once a painting has loaded (null before)', () => {
    for (const s of SHAPES) expect(paintedFlavourImage(s), s).toBeNull()
  })

  it('?art=procedural keeps every skill icon and flavour sprite drawn', async () => {
    const id = CATALOG[0]!.id
    vi.resetModules()
    vi.doMock('@/use/skills/paintedSkillArt', () => ({
      PAINTED_SKILL_ICONS: { [id]: 'abcdef12' }, PAINTED_SKILL_FX: { quill: 'abcdef12' }
    }))
    const prev = window.location.href
    window.history.replaceState(null, '', '/?art=procedural')
    try {
      const m = await import('@/use/skills/smasherSkillArt')
      expect(m.paintedSkillIconUrl(id)).toBeNull()
      expect(m.paintedFlavourUrl('quill')).toBeNull()
      window.history.replaceState(null, '', '/')
      vi.resetModules()
      const m2 = await import('@/use/skills/smasherSkillArt')
      expect(m2.paintedSkillIconUrl(id)).toContain(`${id}.webp?v=abcdef12`)
      expect(m2.paintedFlavourUrl('quill')).toContain('fx/quill.webp?v=abcdef12')
    } finally {
      window.history.replaceState(null, '', prev)
      vi.doUnmock('@/use/skills/paintedSkillArt')
      vi.resetModules()
    }
  })
})

describe('SkillIcon medallion', () => {
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  const opts = { global: { plugins: [i18n] } }
  afterEach(() => { document.body.innerHTML = '' })

  it.each(CATALOG.map(c => [c.id, c.effect]))('%s: the painting when registered, else the drawing', (id, effect) => {
    const w = mount(SkillIcon, { props: { id: effect as never, skillKey: id }, ...opts })
    const img = w.find('image')
    if (PAINTED_SKILL_ICONS[id]) expect(img.attributes('href')).toContain(`skills/${id}.webp`)
    else {
      expect(img.exists()).toBe(false)
      expect(w.findAll('path').length).toBeGreaterThan(3)
    }
    // The procedural medallion (rim + effect disc) is always drawn.
    expect(w.findAll('circle').length).toBeGreaterThanOrEqual(5)
  })

  it('falls back to the drawing when the painting fails to load', async () => {
    const id = Object.keys(PAINTED_SKILL_ICONS)[0]
    if (!id) return
    const effect = CATALOG.find(c => c.id === id)!.effect
    const w = mount(SkillIcon, { props: { id: effect as never, skillKey: id }, ...opts })
    await w.get('image').trigger('error')
    await nextTick()
    expect(w.find('image').exists()).toBe(false)
    expect(w.findAll('path').length).toBeGreaterThan(3)
  })
})

describe('skill art prompts (text-only Gemini sheets)', () => {
  it('cover exactly the game\'s skills, in catalog order, with their CURRENT effect', () => {
    expect((SKILLS as Row[]).map(([id, , effect]) => ({ id, effect }))).toEqual(CATALOG)
    for (const [, , effect] of SKILLS as Row[]) expect(EFFECT_CUE[effect], effect).toBeTruthy()
  })

  it('cover exactly the flavour shapes', () => {
    expect(FLAVOUR_IDS).toEqual(SHAPES)
  })

  it('show the 12 switched skills as their new effect', () => {
    expect(Object.keys(SWITCHED)).toHaveLength(12)
    const motif = Object.fromEntries((SKILLS as Row[]).map(r => [r[0], r]))
    const word: Record<string, RegExp> = { thorns: /spike|quill/i, tower_breaker: /stump/i, bank_shot: /ricochet/i, anchor: /anchor/i }
    for (const [id, effect] of Object.entries(SWITCHED as Record<string, string>)) {
      expect(motif[id]![2], id).toBe(effect)
      expect(motif[id]![3], id).toMatch(word[effect]!)
    }
  })

  it('put every skill and shape in exactly one sheet cell', () => {
    const icons = SHEETS.filter((s: { kind: string }) => s.kind === 'icon').flatMap((s: { ids: (string | null)[] }) => s.ids).filter(Boolean)
    const fx = SHEETS.filter((s: { kind: string }) => s.kind === 'fx').flatMap((s: { ids: string[] }) => s.ids)
    expect(icons).toEqual(CATALOG.map(c => c.id))
    expect(fx).toEqual(SHAPES)
    for (const s of SHEETS as { cols: number, rows: number, ids: unknown[] }[]) expect(s.ids).toHaveLength(s.cols * s.rows)
  })

  it.each(SHEETS.map((s: { name: string }) => [s.name, s]))('%s: magenta ground, navy outline, toy-box style, no stitches / felt / metal / text', (_n, s) => {
    const p = promptFor(s) as string
    for (const k of ['#FF00FF', '#161a40', 'front three-quarter view', 'top-left', 'NO stitches', 'NO felt', 'NO metal', 'NO text', 'NO pink']) expect(p, k).toContain(k)
    for (const id of (s as { ids: (string | null)[] }).ids) if (id) expect(p).toContain((s as { kind: string }).kind === 'icon' ? EFFECT_CUE[(SKILLS as Row[]).find(r => r[0] === id)![2]] : FLAVOURS[id])
  })

  it('solo repaint prompt: one square icon, same style', () => {
    const p = singlePromptFor('log_slam') as string
    expect(p).toContain('SQUARE 1:1')
    expect(p).toContain('stump')
    expect(p).toContain('NO stitches')
  })
})
