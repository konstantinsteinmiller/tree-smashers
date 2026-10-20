// ─── Arena props: decorative scatter around the clearing ─────────────────────
//
// For EVERY terrain layout (and the no-layout fallback), with the full prop
// catalogue (so a kind painted later is already covered) and with the kinds
// painted today: no prop footprint reaches into the clearing or onto its rim,
// none touches a team tower (any tower size the engine builds), no two props
// overlap, none is cut by the short-axis screen edge, the scatter is
// deterministic and fills the visible margin in both phone orientations.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TERRAIN_SHAPES, sdf, type ArenaShape } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT, createTower } from '@/use/arenaTerrain'
import {
  PROP_ARENA_R, PROP_KINDS, PROP_KIND_BY_ID, RIM_CLEARANCE, VIEW_SHORT_HALF, arenaPropLayout, paintedPropIds,
  propThemeFor, wallDistance, type PlacedProp
} from '@/use/arenaProps'
import { PAINTED_PROPS } from '@/use/paintedProps'

const R = PROP_ARENA_R
const ALL = new Set(PROP_KINDS.map(k => k.id))
/** The rim stroke reaches ~6 units past the wall; the guard keeps a margin past it. */
const RIM = 6
const SRC = (f: string) => readFileSync(join(__dirname, '..', 'src', 'use', f), 'utf-8')

const cases: { name: string; id: number | null; shape: ArenaShape }[] = [
  ...Array.from({ length: TERRAIN_LAYOUT_COUNT }, (_, id) => ({ name: `layout ${id}`, id, shape: TERRAIN_SHAPES[id]! })),
  { name: 'no layout (clover)', id: null, shape: 'clover' as ArenaShape }
]

const towersOf = (shape: ArenaShape) =>
  [26, 27, 28].flatMap(b => (['player', 'npc'] as const).map(side => createTower(side, R, b, 100, shape)))

const check = (props: readonly PlacedProp[], shape: ArenaShape) => {
  const towers = towersOf(shape)
  const bad: string[] = []
  for (const p of props) {
    const tag = `${p.kind}@(${p.x.toFixed(1)},${p.y.toFixed(1)}) r${p.r.toFixed(1)}`
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
    const k = PROP_KIND_BY_ID[p.kind]!
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

describe('arena props — never in the arena, on the rim or on a tower', () => {
  for (const c of cases) {
    it(`${c.name}: full catalogue`, () => {
      const props = arenaPropLayout(c.id, c.shape, ALL)
      expect(props.length).toBeGreaterThan(30)
      check(props, c.shape)
      // visible margin is dressed in both phone orientations (portrait 9:19.5,
      // landscape 16:9) — the arena itself covers the rest
      const inView = (hx: number, hy: number) => props.filter(p => Math.abs(p.x) < hx && Math.abs(p.y) < hy).length
      expect(inView(VIEW_SHORT_HALF, VIEW_SHORT_HALF * 2.16), 'portrait').toBeGreaterThanOrEqual(10)
      expect(inView(VIEW_SHORT_HALF * 1.78, VIEW_SHORT_HALF), 'landscape').toBeGreaterThanOrEqual(10)
    })
    it(`${c.name}: painted kinds only`, () => {
      const avail = paintedPropIds()
      const props = arenaPropLayout(c.id, c.shape)
      for (const p of props) expect(avail.has(p.kind)).toBe(true)
      check(props, c.shape)
    })
  }
})

describe('arena props — deterministic, decorative only', () => {
  it('same layout → same scatter (a fresh set with the same kinds hits the same result)', () => {
    const a = arenaPropLayout(4, TERRAIN_SHAPES[4]!, new Set(ALL))
    const b = arenaPropLayout(4, TERRAIN_SHAPES[4]!, new Set([...ALL].reverse()))
    expect(b).toEqual(a)
  })
  it('different layouts → different scatters', () => {
    const a = arenaPropLayout(0, TERRAIN_SHAPES[0]!, ALL)
    const b = arenaPropLayout(1, TERRAIN_SHAPES[1]!, ALL)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
  it('the toy-box group uses toys, the forest group never does', () => {
    const toys = new Set(PROP_KINDS.filter(k => !k.w.forest).map(k => k.id))
    expect(arenaPropLayout(0, TERRAIN_SHAPES[0]!, ALL).some(p => toys.has(p.kind))).toBe(false)
    expect(propThemeFor(6)).toBe('toybox')
    expect(arenaPropLayout(6, TERRAIN_SHAPES[6]!, ALL).some(p => toys.has(p.kind))).toBe(true)
  })
  it('no gameplay RNG / clock, and the engine never feeds props into physics or the state hash', () => {
    const src = SRC('arenaProps.ts')
    expect(src).not.toMatch(/Math\.random\(|matchRng\(|Date\.now\(|performance\.now\(/)
    const engine = SRC('useSpinnerGame.ts')
    expect(engine).not.toMatch(/arenaPropLayout|@\/use\/arenaProps/)
    // the backdrop is the only consumer
    expect(SRC('arenaBackdrop.ts')).toMatch(/arenaPropLayout/)
  })
  it('VIEW_SHORT_HALF mirrors the engine camera fit (ARENA_RADIUS + ARENA_PADDING / 2)', () => {
    const engine = SRC('useSpinnerGame.ts')
    const pad = Number(/const ARENA_PADDING = (\d+)/.exec(engine)?.[1])
    const rad = Number(/const ARENA_RADIUS = (\d+)/.exec(engine)?.[1] ?? 200)
    expect(rad).toBe(R)
    expect(VIEW_SHORT_HALF).toBe(R + pad / 2)
  })
})

describe('painted prop atlas', () => {
  it('every sprite is a catalogue kind with a sane footprint', () => {
    for (const [id, s] of Object.entries(PAINTED_PROPS?.sprites ?? {})) {
      expect(PROP_KIND_BY_ID[id], id).toBeDefined()
      expect(s.footR).toBeGreaterThan(8)
      // the footprint circle holds the whole sprite rect's content: the anchor is inside the rect
      expect(s.cx).toBeGreaterThan(s.x)
      expect(s.cx).toBeLessThan(s.x + s.w)
      expect(s.cy).toBeGreaterThan(s.y)
      expect(s.cy).toBeLessThan(s.y + s.h)
    }
  })
})
