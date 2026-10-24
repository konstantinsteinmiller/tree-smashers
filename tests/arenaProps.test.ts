// ─── Arena themes + props: purposeful decor around the clearing ──────────────
//
// For EVERY terrain layout × EVERY arena type (and the no-layout fallback),
// with the full prop catalogue (so a kind painted later is already covered)
// and with the kinds painted today: props come only from the arena's own
// theme, no prop footprint reaches into the clearing or onto its rim, none
// touches a team tower (any tower size the engine builds), no two props
// overlap, none is cut by the short-axis screen edge, the layout is
// deterministic and fills the visible margin in both phone orientations.
// Plus: every arena type has a theme, every theme a complete definition,
// and the theme's first campaign stage uses floor variant 0.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TERRAIN_SHAPES, sdf, type ArenaShape } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT, TERRAIN_LAYOUT_KEYS, createTower, layoutForStage } from '@/use/arenaTerrain'
import {
  ARENA_THEME_IDS, DEFAULT_THEME_BY_LAYOUT, FLOOR_PLAN, THEME_BY_ARENA_TYPE, THEME_LOOK, floorKeyFor, themeFor,
  type ArenaTheme
} from '@/use/arenaThemes'
import {
  BIG_RIM_BERTH, PROP_ARENA_R, PROP_KINDS, PROP_KIND_BY_ID, PROP_SCENES, RIM_CLEARANCE, VIEW_SHORT_HALF, FIELD_HALF, arenaPropLayout, paintedPropIds,
  wallDistance, type PlacedProp
} from '@/use/arenaProps'
import { PAINTED_PROPS } from '@/use/paintedProps'
import { ARENA_TYPES, getStageById, type ArenaType } from '@/use/useSpinnerCampaign'

const R = PROP_ARENA_R
const ALL = new Set(PROP_KINDS.map(k => k.id))
/** The rim stroke reaches ~6 units past the wall; the guard keeps a margin past it. */
const RIM = 6
const SRC = (f: string) => readFileSync(join(__dirname, '..', 'src', 'use', f), 'utf-8')

const layouts: { name: string; id: number | null; shape: ArenaShape }[] = [
  ...Array.from({ length: TERRAIN_LAYOUT_COUNT }, (_, id) => ({ name: `layout ${id}`, id, shape: TERRAIN_SHAPES[id]! })),
  { name: 'no layout (clover)', id: null, shape: 'clover' as ArenaShape }
]

const towersOf = (shape: ArenaShape) =>
  [26, 27, 28].flatMap(b => (['player', 'npc'] as const).map(side => createTower(side, R, b, 100, shape)))

const check = (props: readonly PlacedProp[], shape: ArenaShape, theme: ArenaTheme) => {
  const towers = towersOf(shape)
  const bad: string[] = []
  for (const p of props) {
    const tag = `${p.kind}@(${p.x.toFixed(1)},${p.y.toFixed(1)}) r${p.r.toFixed(1)}`
    const k = PROP_KIND_BY_ID[p.kind]!
    if (k.theme !== theme) bad.push(`${tag}: a ${k.theme} prop in a ${theme} arena`)
    // geometric clearance to the wall polyline
    if (wallDistance(shape, p.x, p.y) < p.r + RIM_CLEARANCE) bad.push(`${tag}: wall distance`)
    // independent: the footprint circle grown by the rim is entirely OUTSIDE (SDF sign)
    if (!(sdf(shape, p.x, p.y, R) > 0)) bad.push(`${tag}: centre inside`)
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      if (!(sdf(shape, p.x + Math.cos(a) * (p.r + RIM), p.y + Math.sin(a) * (p.r + RIM), R) > 0)) {
        bad.push(`${tag}: footprint reaches the clearing / rim`)
        break
      }
    }
    for (const t of towers) {
      if (Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + 6 + p.r) bad.push(`${tag}: on the ${t.side} tower r${t.radius}`)
    }
    // never cut by the short-axis screen edge (either orientation)
    for (const c of [Math.abs(p.x), Math.abs(p.y)]) {
      if (!(c + p.r <= VIEW_SHORT_HALF || c - p.r >= VIEW_SHORT_HALF)) bad.push(`${tag}: straddles the screen edge`)
    }
    if (p.r < k.r[0] || p.r > k.r[1]) bad.push(`${tag}: radius out of range`)
  }
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      const a = props[i]!
      const b = props[j]!
      if (Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r) bad.push(`${a.kind} overlaps ${b.kind}`)
    }
  }
  expect(bad).toEqual([])
}

describe('arena themes — a deliberate mapping', () => {
  it('every arena type has a theme, every layout of the plain arena one too', () => {
    for (const t of ARENA_TYPES) {
      if (t !== 'default') expect(THEME_BY_ARENA_TYPE[t], t).toBeDefined()
      for (const l of layouts) expect(ARENA_THEME_IDS).toContain(themeFor(t, l.id))
    }
    expect(DEFAULT_THEME_BY_LAYOUT).toHaveLength(TERRAIN_LAYOUT_COUNT)
  })
  it('the dedicated arena types keep one identity each, the plain arena rotates meadow / rocky / bedroom (+ the snow layout)', () => {
    expect(themeFor('forest', 7)).toBe('woodland')
    expect(themeFor('lava', 7)).toBe('volcanic')
    expect(themeFor('ice', 7)).toBe('snowy')
    expect(themeFor('boss', 7)).toBe('ruins')
    const plain = new Set(DEFAULT_THEME_BY_LAYOUT)
    expect([...plain].sort()).toEqual(['bedroom', 'meadow', 'rocky', 'snowy'])
    expect(themeFor('default', TERRAIN_LAYOUT_KEYS.indexOf('snowyClearing'))).toBe('snowy')
    // the toy-box group: every 7th layout from 6
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) expect(themeFor('default', id) === 'bedroom').toBe(id % 7 === 6)
  })
  it('every theme is complete: look, scenes, rim trims, kinds, floor plan', () => {
    for (const t of ARENA_THEME_IDS) {
      expect(THEME_LOOK[t], t).toBeDefined()
      expect(FLOOR_PLAN[t].variants, t).toBeGreaterThan(0)
      const def = PROP_SCENES[t]
      expect(def.scenes.length, t).toBeGreaterThan(1)
      expect(def.rim.length, t).toBeGreaterThan(0)
      const own = new Set(PROP_KINDS.filter(k => k.theme === t).map(k => k.id))
      expect(own.size, t).toBeGreaterThanOrEqual(8)
      // a scene only ever names its own theme's kinds
      for (const s of def.scenes) for (const id of [...s.anchor, ...s.around, ...s.feet]) expect(own.has(id), `${t}: ${id}`).toBe(true)
      for (const id of def.rim) expect(own.has(id), `${t}: rim ${id}`).toBe(true)
      // every kind of the theme is used by a scene or the rim
      const used = new Set([...def.rim, ...def.scenes.flatMap(s => [...s.anchor, ...s.around, ...s.feet])])
      for (const id of own) expect(used.has(id), `${t}: ${id} unused`).toBe(true)
    }
  })
  it("a theme's first campaign stage uses floor variant 0 (the one painted first)", () => {
    const first = new Map<ArenaTheme, number>()
    for (let stage = 1; stage <= 100; stage++) {
      const st = getStageById(stage)
      const layout = layoutForStage(stage)
      const theme = themeFor((st.arenaType ?? 'default') as ArenaType, layout)
      if (!first.has(theme)) first.set(theme, layout)
    }
    expect([...first.keys()].sort()).toEqual([...ARENA_THEME_IDS].sort())
    for (const [theme, layout] of first) expect(floorKeyFor(theme, layout), theme).toBe(`${theme}-0`)
  })
})

describe('arena props — only the theme\'s own, never in the arena, on the rim or on a tower', () => {
  for (const type of ARENA_TYPES) {
    for (const c of layouts) {
      const theme = themeFor(type, c.id)
      it(`${type} × ${c.name} (${theme}): full catalogue`, () => {
        const props = arenaPropLayout(theme, c.id, c.shape, ALL)
        expect(props.length).toBeGreaterThan(30)
        check(props, c.shape, theme)
        // visible margin is dressed in both phone orientations (portrait 9:19.5,
        // landscape 16:9) — the arena itself covers the rest
        const inView = (hx: number, hy: number) => props.filter(p => Math.abs(p.x) < hx && Math.abs(p.y) < hy).length
        expect(inView(VIEW_SHORT_HALF, VIEW_SHORT_HALF * 2.16), 'portrait').toBeGreaterThanOrEqual(10)
        expect(inView(VIEW_SHORT_HALF * 1.78, VIEW_SHORT_HALF), 'landscape').toBeGreaterThanOrEqual(10)
      })
      it(`${type} × ${c.name} (${theme}): painted kinds only`, () => {
        const avail = paintedPropIds()
        const props = arenaPropLayout(theme, c.id, c.shape)
        for (const p of props) {
          expect(avail.has(p.kind)).toBe(true)
          expect(PAINTED_PROPS[theme]?.sprites[p.kind], `${p.kind} in the ${theme} atlas`).toBeDefined()
        }
        check(props, c.shape, theme)
      })
    }
  }
})

describe('arena props — purposeful, deterministic, decorative only', () => {
  it('props come in groups: most props touch another one of their scene', () => {
    for (const theme of ARENA_THEME_IDS) {
      const props = arenaPropLayout(theme, 4, TERRAIN_SHAPES[4]!, ALL)
      const grouped = props.filter(p => props.some(q => q !== p && Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + 12))
      expect(grouped.length / props.length, theme).toBeGreaterThan(0.75)
    }
  })
  it('larger props stand further out: no big prop in the band along the rim, the rim trims line it', () => {
    for (const theme of ARENA_THEME_IDS) {
      let nearRim = 0
      const rimKinds = new Set(PROP_SCENES[theme].rim)
      for (const c of layouts) {
        const props = arenaPropLayout(theme, c.id, c.shape, ALL)
        for (const p of props) {
          const edge = wallDistance(c.shape, p.x, p.y) - p.r
          const cls = PROP_KIND_BY_ID[p.kind]!.cls
          if (cls === 'big') expect(edge, `${theme} ${c.name} ${p.kind}`).toBeGreaterThanOrEqual(BIG_RIM_BERTH)
          if (rimKinds.has(p.kind) && edge < BIG_RIM_BERTH) nearRim++
        }
      }
      expect(nearRim, theme).toBeGreaterThan(layouts.length * 3)
    }
  })
  it('same theme + layout → same layout (a fresh set with the same kinds hits the same result)', () => {
    const a = arenaPropLayout('meadow', 4, TERRAIN_SHAPES[4]!, new Set(ALL))
    const b = arenaPropLayout('meadow', 4, TERRAIN_SHAPES[4]!, new Set([...ALL].reverse()))
    expect(b).toEqual(a)
  })
  it('different layouts → different layouts', () => {
    const a = arenaPropLayout('meadow', 0, TERRAIN_SHAPES[0]!, ALL)
    const b = arenaPropLayout('meadow', 1, TERRAIN_SHAPES[1]!, ALL)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
  it('no gameplay RNG / clock, and the engine never feeds props or themes into physics or the state hash', () => {
    for (const f of ['arenaProps.ts', 'arenaThemes.ts', 'arenaBackdrop.ts']) {
      expect(SRC(f), f).not.toMatch(/Math\.random\(|matchRng\(|Date\.now\(|performance\.now\(/)
    }
    const engine = SRC('useSpinnerGame.ts')
    expect(engine).not.toMatch(/arenaPropLayout|@\/use\/arenaProps/)
    // the theme is read only by the static-layer bake (floor + backdrop)
    const uses = engine.split('\n').filter(l => /arenaTheme\(\)/.test(l))
    for (const l of uses) expect(l).not.toMatch(/hash|rng|physics|vx|vy/i)
    // the backdrop is the only consumer of the prop layout
    expect(SRC('arenaBackdrop.ts')).toMatch(/arenaPropLayout/)
  })
  it('the scatter field covers everything the arena fit can show (arenaFit)', async () => {
    const { arenaFitPoints, fitArenaView } = await import('@/use/arenaFit')
    const { TERRAIN_SHAPES } = await import('@/use/arenaShapes')
    const { towerPosition } = await import('@/use/arenaTerrain')
    for (const [w, h] of [[390, 844], [360, 740], [844, 390], [740, 360], [768, 1024], [1024, 768], [1280, 720], [1920, 1080], [1080, 2400], [2400, 1080]] as const) {
      for (const shape of TERRAIN_SHAPES) {
        const t = [{ ...towerPosition('player', R, 38, shape), radius: 38 }, { ...towerPosition('npc', R, 38, shape), radius: 38 }]
        const v = fitArenaView(w, h, arenaFitPoints(shape, R, t))
        const reach = Math.max(v.cx, w - v.cx, v.cy, h - v.cy) / v.scale
        expect(reach).toBeLessThan(FIELD_HALF)
      }
    }
  })
})

describe('painted prop atlases', () => {
  it('one atlas per theme; every sprite is a kind of that theme with a sane footprint', () => {
    for (const [theme, atlas] of Object.entries(PAINTED_PROPS)) {
      expect(atlas!.file.startsWith(`${theme}_`)).toBe(true)
      for (const [id, s] of Object.entries(atlas!.sprites)) {
        expect(PROP_KIND_BY_ID[id], id).toBeDefined()
        expect(PROP_KIND_BY_ID[id]!.theme, id).toBe(theme)
        expect(s.footR).toBeGreaterThan(8)
        // the anchor is inside the sprite rect
        expect(s.cx).toBeGreaterThan(s.x)
        expect(s.cx).toBeLessThan(s.x + s.w)
        expect(s.cy).toBeGreaterThan(s.y)
        expect(s.cy).toBeLessThan(s.y + s.h)
      }
    }
  })
})
