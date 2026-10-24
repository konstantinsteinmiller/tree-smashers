// ─── Tree Smashers: the 50 arena layouts ─────────────────────────────────────
//
// Every layout plays in its own clearing (arenaShapes.TERRAIN_SHAPES[id]). For
// each one: the shape is inscribed in the camera circle, y-mirror symmetric and
// visibly not round; every feature, both towers and every spawn the engine can
// produce — also with the largest disc (1.35 × the blade radius) and for every
// team size (1…3 smashers, src/data/teamSize.ts) — fit inside
// the wall with margin and never overlap each other; trees are > 50 % inside;
// building is deterministic and the PvP guest's flip is the host's mirror; the
// difficulty ramps up with the stage.
import { describe, expect, it } from 'vitest'
import { CLEARING_SPECS, TERRAIN_SHAPES, clampInside, sdf, shapeOutline, type ArenaShape } from '@/use/arenaShapes'
import {
  TERRAIN_LAYOUT_COUNT, TERRAIN_LAYOUT_KEYS, buildTerrainLayout, createTower, layoutForSeed, layoutForStage,
  terrainCircles, type TerrainLayout
} from '@/use/arenaTerrain'
import { TEAM_SIZES, sideSizeMul } from '@/data/teamSize'

const R = 200
const BLADE = 28
/** The largest disc the mechanics allow (1.35 × blade radius). */
const DISC = BLADE * 1.35
const WALL_MARGIN = 4
const GAP = 2
const JITTER = (BLADE * 0.8) / 2

interface Disc { x: number; y: number; radius: number; tag: string }

/** Every spawn centre the engine can produce on this shape. */
const spawns = (shape: ArenaShape): Disc[] => {
  const out: Disc[] = []
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i < n; i++) {
      const sx = n === 1 ? 0 : (i / (n - 1) - 0.5) * R * 0.7
      out.push({ x: sx, y: R * 0.4, radius: DISC, tag: `player${n}.${i}` })
      out.push({ x: sx, y: -R * 0.4, radius: DISC, tag: `pvp${n}.${i}` })
    }
  }
  // Campaign formations on a terrain arena (see initGame), jitter box corners,
  // clamped into the shape like the engine does.
  const npc = [[0, -0.4], [-0.4, -0.4], [0.4, -0.4], [-0.4, -0.55], [0.4, -0.55], [0, -0.3], [-0.4, -0.65], [0.4, -0.65], [-0.4, -0.3], [0.4, -0.3]]
  for (const [fx, fy] of npc) {
    for (const jx of [-JITTER, 0, JITTER]) {
      for (const jy of [-JITTER, 0, JITTER]) {
        const c = clampInside(shape, fx! * R + jx, fy! * R + jy, BLADE, R, BLADE)
        out.push({ x: c.x, y: c.y, radius: DISC, tag: `npc(${fx},${fy})` })
      }
    }
  }
  return out
}

/** Feature discs, tagged by kind (logs → a chain of discs). */
const features = (t: TerrainLayout): Disc[] =>
  terrainCircles(t).map(c => ({ ...c, tag: `${c.x},${c.y},r${c.radius}` }))

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('arena layouts — the set', () => {
  it('has 50 layouts with unique names, one clearing shape each', () => {
    expect(TERRAIN_LAYOUT_COUNT).toBe(50)
    expect(new Set(TERRAIN_LAYOUT_KEYS).size).toBe(50)
    expect(TERRAIN_SHAPES).toHaveLength(50)
    expect(new Set(TERRAIN_SHAPES).size).toBe(50)
    for (let id = 3; id < 50; id++) expect(CLEARING_SPECS[id], `spec ${id}`).toBeDefined()
  })

  it('every clearing is inscribed, y-mirror symmetric, visibly not round, and distinct', () => {
    const sigs: number[][] = []
    for (const shape of TERRAIN_SHAPES) {
      const pts = shapeOutline(shape, R)
      let min = Infinity
      let max = 0
      const sig: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        const r = Math.hypot(pts[i]!, pts[i + 1]!)
        min = Math.min(min, r)
        max = Math.max(max, r)
        if ((i / 2) % 10 === 0) sig.push(r)
      }
      expect(max, shape).toBeLessThanOrEqual(R + 0.5)
      expect(max - min, `${shape} roundness`).toBeGreaterThan(R * 0.08)
      for (let a = 0.1; a < Math.PI; a += 0.37) {
        const x = Math.cos(a) * 150
        const y = Math.sin(a) * 150
        expect(sdf(shape, x, y, R)).toBeCloseTo(sdf(shape, x, -y, R), 6)
      }
      expect(sdf(shape, 0, 0, R)).toBeLessThan(0)
      sigs.push(sig)
    }
    // No two clearings share an outline (mean radial difference > 1 % of R).
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i + 1; j < sigs.length; j++) {
        const d = sigs[i]!.reduce((s, r, k) => s + Math.abs(r - sigs[j]![k]!), 0) / sigs[i]!.length
        expect(d, `${TERRAIN_SHAPES[i]} vs ${TERRAIN_SHAPES[j]}`).toBeGreaterThan(R * 0.01)
      }
    }
  })

  it('campaign cycles 1..50 on repeat, stage 1 = the tutorial clearing', () => {
    expect(layoutForStage(1)).toBe(0)
    expect(layoutForStage(50)).toBe(49)
    expect(layoutForStage(51)).toBe(0)
    expect(layoutForStage(137)).toBe(36)
    expect(buildTerrainLayout(0).nameKey).toBe('terrain.layout.mossyGlade')
  })

  it('seed → layout is deterministic and reaches every layout', () => {
    const seen = new Set<number>()
    for (let s = 0; s < 4000; s++) {
      const seed = Math.imul(s, 2654435761) >>> 0
      expect(layoutForSeed(seed)).toBe(layoutForSeed(seed))
      seen.add(layoutForSeed(seed))
    }
    expect(seen.size).toBe(50)
  })

  it('difficulty ramps up: early layouts are sparse, late ones busy', () => {
    const count = (id: number) => terrainCircles(buildTerrainLayout(id)).length
    const kinds = (id: number) => {
      const t = buildTerrainLayout(id)
      return [t.islands, t.boosters, t.holes, t.arrows, t.honey, t.mushrooms, t.logs].filter(a => a.length > 0).length
    }
    const avg = (from: number, to: number, f: (id: number) => number) => {
      let s = 0
      for (let i = from; i <= to; i++) s += f(i)
      return s / (to - from + 1)
    }
    for (let id = 3; id <= 10; id++) expect(kinds(id), `layout ${id}`).toBeLessThanOrEqual(3)
    expect(avg(26, 49, kinds)).toBeGreaterThan(avg(3, 10, kinds))
    expect(avg(26, 49, count)).toBeGreaterThan(avg(3, 10, count))
  })
})

describe('arena layouts — team sizes 1…3 (src/data/teamSize.ts)', () => {
  it('every team-size disc is no bigger than the disc the per-layout geometry below is proven for', () => {
    // The player row, PvP row and NPC formations are checked with DISC (the
    // largest catalog disc at the full, pre-team-size blade radius): a team
    // of N fields BLADE × 0.9 × (1 | 0.87 | 0.75) × disc — always smaller.
    for (const n of TEAM_SIZES) expect(BLADE * sideSizeMul(n) * 1.35, `team of ${n}`).toBeLessThanOrEqual(DISC)
    // A lone boss (×1.6) on a side of one is the biggest blade on any board.
    expect(BLADE * sideSizeMul(1) * 1.6 * 1.35).toBeLessThan(BLADE * 1.6 * 1.35)
  })

  it('the rows of 1, 2 and 3 fit every clearing at their own size, apart from each other', () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const shape = TERRAIN_SHAPES[id]!
      const feats = features(buildTerrainLayout(id))
      for (const n of TEAM_SIZES) {
        const r = BLADE * sideSizeMul(n) * 1.35
        const row: Disc[] = []
        for (let i = 0; i < n; i++) {
          const sx = n === 1 ? 0 : (i / (n - 1) - 0.5) * R * 0.7
          for (const y of [R * 0.4, -R * 0.4]) row.push({ x: sx, y, radius: r, tag: `${n}.${i}@${y}` })
        }
        for (const s of row) {
          expect(sdf(shape, s.x, s.y, R), `${id} team ${n} spawn ${s.tag}`).toBeLessThanOrEqual(-(r + WALL_MARGIN))
          for (const f of feats) expect(dist(f, s), `${id} ${f.tag} vs team ${n} ${s.tag}`).toBeGreaterThanOrEqual(f.radius + r + GAP)
        }
        for (let i = 0; i < row.length; i++) {
          for (let j = i + 1; j < row.length; j++) {
            if (row[i]!.y !== row[j]!.y) continue
            expect(dist(row[i]!, row[j]!), `${id} team ${n}`).toBeGreaterThanOrEqual(2 * r + GAP)
          }
        }
      }
    }
  })
})

describe('arena layouts — geometry per layout', () => {
  for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
    const shape = TERRAIN_SHAPES[id]!
    it(`${id} ${TERRAIN_LAYOUT_KEYS[id]} (${shape}): features, towers and spawns fit and stay apart`, () => {
      const t = buildTerrainLayout(id)
      const feats = features(t)
      const sp = spawns(shape)
      const tw = (['player', 'npc'] as const).map(side => createTower(side, R, BLADE, 100, shape))
      for (const flip of [false, true]) {
        for (const f of features(buildTerrainLayout(id, flip))) {
          expect(sdf(shape, f.x, f.y, R), `wall vs ${f.tag} flip=${flip}`).toBeLessThanOrEqual(-(f.radius + WALL_MARGIN))
        }
      }
      for (const f of feats) {
        for (const s of sp) expect(dist(f, s), `${f.tag} vs spawn ${s.tag}`).toBeGreaterThanOrEqual(f.radius + s.radius + GAP)
        for (const w of tw) expect(dist(f, w), `${f.tag} vs ${w.side} tower`).toBeGreaterThanOrEqual(f.radius + w.radius + 8)
      }
      // Distinct features never overlap (a log's own chain is one feature).
      const owners = terrainCircles(t).map((_, i) => i)
      const logStart = t.islands.length + t.boosters.length + t.holes.length + t.arrows.length + t.honey.length + t.mushrooms.length
      let k = logStart
      t.logs.forEach((l, li) => {
        const n = Math.max(1, Math.ceil(Math.hypot(l.bx - l.ax, l.by - l.ay) / l.radius)) + 1
        for (let q = 0; q < n; q++) owners[k++] = -1 - li
      })
      for (let i = 0; i < feats.length; i++) {
        for (let j = i + 1; j < feats.length; j++) {
          if (owners[i] === owners[j]) continue
          expect(dist(feats[i]!, feats[j]!), `${feats[i]!.tag} vs ${feats[j]!.tag}`).toBeGreaterThanOrEqual(feats[i]!.radius + feats[j]!.radius + GAP)
        }
      }
      // Trees stand inside the clearing (owner 2026-10-22): more than half of
      // the outline inside — as far in as the spawn row allows.
      for (const w of tw) {
        let inside = 0
        const N = 720
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2
          if (sdf(shape, w.x + Math.cos(a) * w.radius, w.y + Math.sin(a) * w.radius, R) < 0) inside++
        }
        expect(inside / N, `${w.side} tower`).toBeGreaterThanOrEqual(0.5)
        // Own-row spawns stay clear of the tower (regular disc — a bigger one
        // is pushed clear at spawn, settleSpawnOverlaps).
        for (const s of sp.filter(q => q.tag.startsWith(w.side === 'player' ? 'player' : 'pvp'))) {
          expect(dist(w, s), `${w.side} tower vs ${s.tag}`).toBeGreaterThanOrEqual(w.radius + BLADE)
        }
      }
      // The rows the player and a PvP opponent launch from fit the clearing.
      for (const s of sp.filter(q => !q.tag.startsWith('npc'))) {
        expect(sdf(shape, s.x, s.y, R), `spawn ${s.tag}`).toBeLessThanOrEqual(-(s.radius + WALL_MARGIN))
      }
    })
  }

  it('builds are deterministic and the guest flip is the exact y-mirror', () => {
    for (let id = 0; id < TERRAIN_LAYOUT_COUNT; id++) {
      const h = buildTerrainLayout(id)
      expect(buildTerrainLayout(id)).toEqual(h)
      const g = buildTerrainLayout(id, true)
      expect(terrainCircles(g).map(c => [c.x, -c.y + 0, c.radius])).toEqual(terrainCircles(h).map(c => [c.x, c.y, c.radius]))
      expect(g.arrows.map(a => -a.angle + 0)).toEqual(h.arrows.map(a => a.angle))
    }
  })
})
