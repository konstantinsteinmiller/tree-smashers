// Arena fit (presentation only): every layout × viewport keeps the outline,
// rim and towers on screen, the play area + trees clear of the measured HUD,
// and fills the limiting axis. HUD rects: measured in the live app (stage 17,
// menu ∪ battle) — tests/fixtures/arenaFitHud.json (w, h, dpr, hud).
import { describe, expect, it } from 'vitest'
import hudFx from './fixtures/arenaFitHud.json'
import {
  arenaFitPoints, fillRatio, fitArenaView, legacyArenaView, FIT_HUD_GAP, FIT_HUD_OUTLINE_MARGIN, MAX_CROWN_OVERFLOW,
  TREE_CROWN_TOP, TREE_TRUNK_BASE, type FitRect
} from '@/use/arenaFit'
import { TERRAIN_SHAPES } from '@/use/arenaShapes'
import { towerPosition, TOWER_RADIUS_MUL } from '@/use/arenaTerrain'
import { towerArtMaxScale } from '@/use/towerArt'
import { PAINTED_TOWERS } from '@/use/paintedTowers'

/** The HD tree atlas (tools/tower-sheets/pack-single.mjs, 2× the first
 *  one-sheet density) is packed: from then on the art never caps a phone. */
const HD_TREES = (PAINTED_TOWERS?.ref.halfW ?? 0) >= 290

type Fx = Record<string, { w: number; h: number; dpr: number; hud: number[][] }>
const VIEWPORTS = hudFx as Fx
const capOf = (v: Fx[string], blade: number) => towerArtMaxScale(Math.round(blade * TOWER_RADIUS_MUL), v.dpr)

const rectsOf = (v: Fx[string], stacked3: boolean): FitRect[] => {
  const rs = v.hud.map(([x0, y0, x1, y1]) => ({ x0: x0!, y0: y0!, x1: x1!, y1: y1! }))
  // Team size 3 off-portrait: the third stat card stacks above the first.
  if (stacked3) {
    const c = rs.reduce((a, r) => (r.x0 < 20 && r.y1 > v.h - 20 && r.y0 > a.y0 ? r : a), rs[0]!)
    const hgt = c.y1 - c.y0
    rs.push({ x0: c.x0, y0: c.y0 - hgt - 4, x1: c.x1, y1: c.y0 - 4 })
  }
  return rs
}
const towersFor = (shape: (typeof TERRAIN_SHAPES)[number], blade: number) => {
  const r = Math.round(blade * TOWER_RADIUS_MUL)
  return [{ ...towerPosition('player', 200, r, shape), radius: r }, { ...towerPosition('npc', 200, r, shape), radius: r }]
}
const fitOf = (v: Fx[string], shape: (typeof TERRAIN_SHAPES)[number], blade: number, hud: FitRect[]) => {
  const towers = towersFor(shape, blade)
  const pts = arenaFitPoints(shape, 200, towers)
  const hudPts = arenaFitPoints(shape, 200, towers, 'tucked', FIT_HUD_OUTLINE_MARGIN)
  return { pts, hudPts, view: fitArenaView(v.w, v.h, pts, undefined, hud, capOf(v, blade), hudPts) }
}

/** Minimum fill of the limiting axis over every layout (team 2 HUD). Phones
 *  are never held back by the tree art (the atlas is sized for a 3× phone's
 *  largest zoom); 640 × 360 loses a little to its tall corner stacks. */
const MIN_FILL: Record<string, number> = {
  // 640 × 360: its scale is held by the corner stacks against the outline's
  // width; since the trees stand inside the clearing (2026-10-22) the board
  // is a little shorter at the SAME scale, so the height fill reads lower.
  'phone-p-360x640': 0.95, 'phone-l-640x360': 0.85
}
const minFillOf = (name: string, portrait: boolean) =>
  MIN_FILL[name] ?? (name.startsWith('phone') ? (portrait ? 0.96 : 0.97) : 0.85)

describe('arena fit', () => {
  for (const [name, v] of Object.entries(VIEWPORTS)) {
    for (const teamSize of [1, 2, 3]) {
      it(`${name} team ${teamSize}: all layouts on screen, clear of HUD, fill ≥ ${minFillOf(name, v.h > v.w)}`, () => {
        const portrait = v.h > v.w
        const hud = rectsOf(v, teamSize === 3 && !portrait)
        const blade = v.w >= 1024 && !portrait ? 26 : 28
        let minFill = 1
        // collected, not one expect per point (thousands per layout)
        const offScreen: string[] = []
        const underHud: string[] = []
        for (const shape of TERRAIN_SHAPES) {
          const { pts, hudPts, view } = fitOf(v, shape, blade, hud)
          expect(view.scale).toBeLessThanOrEqual(capOf(v, blade))
          if (HD_TREES && name.startsWith('phone')) expect(view.scale, `${shape}: art cap binds on a phone`).toBeLessThan(capOf(v, blade) * 0.999)
          for (let i = 0; i < pts.length; i += 2) {
            const x = view.cx + pts[i]! * view.scale
            const y = view.cy + pts[i + 1]! * view.scale
            if (x < 0 || x > v.w || y < 0 || y > v.h) offScreen.push(`${shape} (${x.toFixed(1)}, ${y.toFixed(1)})`)
          }
          for (let i = 0; i < hudPts.length; i += 2) {
            const x = view.cx + hudPts[i]! * view.scale
            const y = view.cy + hudPts[i + 1]! * view.scale
            for (const r of hud) {
              const under = x > r.x0 - FIT_HUD_GAP + 0.5 && x < r.x1 + FIT_HUD_GAP - 0.5 && y > r.y0 - FIT_HUD_GAP + 0.5 && y < r.y1 + FIT_HUD_GAP - 0.5
              if (under) underHud.push(`${shape} (${x.toFixed(1)}, ${y.toFixed(1)})`)
            }
          }
          // Trees: gauge (toward the arena), face and trunk on screen and off
          // the HUD (covered by the points above); the crown overflows the
          // screen edge by at most MAX_CROWN_OVERFLOW of its height.
          for (const t of towersFor(shape, blade)) {
            const sx = view.cx + t.x * view.scale
            const sy = view.cy + t.y * view.scale
            const r = t.radius * view.scale
            const crownH = TREE_CROWN_TOP * r
            const hidden = Math.max(0, -(sy - crownH))
            expect(hidden / crownH, `${shape} crown overflow`).toBeLessThanOrEqual(MAX_CROWN_OVERFLOW)
            // face ≈ 0.2–0.75 r below the centre, trunk base 1.28 r: the face
            // and nearly all the trunk stay on screen
            expect(sy + 0.75 * r).toBeLessThanOrEqual(v.h)
            expect(sy + (TREE_TRUNK_BASE - 0.15) * r).toBeLessThanOrEqual(v.h)
            expect(sx - r).toBeGreaterThanOrEqual(0)
            expect(sx + r).toBeLessThanOrEqual(v.w)
          }
          // A tablet / desktop view held at the painted trees' resolution cap
          // is as big as the art allows — the fill target applies to the rest.
          if (view.scale < capOf(v, blade) * 0.999) minFill = Math.min(minFill, fillRatio(view, pts, v.w, v.h).limiting)
        }
        expect(offScreen, 'points off screen').toEqual([])
        expect(underHud, 'points under HUD').toEqual([])
        expect(minFill).toBeGreaterThanOrEqual(minFillOf(name, portrait))
      })
    }
  }

  it('phones fill the width (portrait) / height (landscape) on average ≥ 0.97', () => {
    for (const [name, v] of Object.entries(VIEWPORTS)) {
      if (!name.startsWith('phone')) continue
      const portrait = v.h > v.w
      let sum = 0
      for (const shape of TERRAIN_SHAPES) {
        const { pts, view } = fitOf(v, shape, 28, rectsOf(v, false))
        const f = fillRatio(view, pts, v.w, v.h)
        sum += portrait ? f.x : f.y
      }
      // 640 × 360 landscape: corner-stack bound, see MIN_FILL.
      const floor = name === 'phone-l-640x360' ? 0.92 : HD_TREES ? 0.965 : 0.96
      expect(sum / TERRAIN_SHAPES.length, name).toBeGreaterThanOrEqual(floor)
    }
  })

  it('reports before/after fill (mean over layouts, team 2)', () => {
    const rows: string[] = []
    for (const [name, v] of Object.entries(VIEWPORTS)) {
      let before = 0, v1 = 0, after = 0, clippedBefore = 0, gain = 0
      for (const shape of TERRAIN_SHAPES) {
        const { pts, view: nowView } = fitOf(v, shape, 28, rectsOf(v, false))
        const lv = legacyArenaView(v.w, v.h)
        const fb = fillRatio(lv, pts, v.w, v.h).limiting
        before += fb
        if (fb > 1) clippedBefore++
        const v1View = fitArenaView(v.w, v.h, arenaFitPoints(shape, 200, towersFor(shape, 28), 'full'), undefined, rectsOf(v, false))
        v1 += fillRatio(v1View, pts, v.w, v.h).limiting
        after += fillRatio(nowView, pts, v.w, v.h).limiting
        gain += nowView.scale / v1View.scale
      }
      const n = TERRAIN_SHAPES.length
      rows.push(`${name}: legacy ${(before / n).toFixed(3)} (${clippedBefore} clipped) → fit v1 ${(v1 / n).toFixed(3)} → now ${(after / n).toFixed(3)}  (board ${((gain / n - 1) * 100).toFixed(1)} % bigger than v1)`)
      // Art-capped tablets (one-sheet tree atlas) can trail the clipped legacy fit.
      if (HD_TREES || !name.startsWith("tab")) expect(after, name).toBeGreaterThan(before * 0.97)
    }
    console.log(rows.join('\n'))
  })

  it('is presentation only: same inputs → same view, sim coords untouched', () => {
    const pts = arenaFitPoints('clearing7', 200, towersFor('clearing7', 27))
    const copy = Float32Array.from(pts)
    expect(fitArenaView(844, 390, pts)).toEqual(fitArenaView(844, 390, pts))
    expect(pts).toEqual(copy)
  })
})
