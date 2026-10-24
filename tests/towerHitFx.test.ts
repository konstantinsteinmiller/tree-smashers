import { describe, it, expect } from 'vitest'
import { createTowerFx, resetTowerFx, spawnSplinters, spawnLeaves, spawnThornShards, thornShardCount, noteTowerStage, tickTowerFx, splinterCount, leafCascadeCount, FxKind, TOWER_FX_CAP } from '@/use/towerHitFx'
import { towerDamageStage } from '@/use/towerArt'

const rand = () => 0.5

describe('tower hit VFX pool', () => {
  it('splinter count scales with damage and is capped', () => {
    expect(splinterCount(0)).toBe(5)
    expect(splinterCount(10)).toBeGreaterThan(splinterCount(2))
    expect(splinterCount(1e6)).toBe(16)
  })

  it('a burst = splinters (wood + bark) + 2 sawdust discs + 1 ring, flying toward the attacker', () => {
    const fx = createTowerFx()
    spawnSplinters(fx, 0, 40, 0, 1, 40, 10, rand)
    const n = splinterCount(10)
    expect(fx.active).toBe(n + 3)
    const kinds = fx.pool.slice(0, fx.active).map(p => p.kind)
    expect(kinds.filter(k => k === FxKind.Bark).length).toBeGreaterThan(0)
    expect(kinds.filter(k => k === FxKind.Dust).length).toBe(2)
    expect(kinds.filter(k => k === FxKind.Ring).length).toBe(1)
    for (const p of fx.pool.slice(0, n)) expect(p.vy).toBeGreaterThan(0)
  })

  it('spike recoil: a few thorn shards (3-7) fly toward the pricked attacker and die out', () => {
    expect(thornShardCount(0)).toBe(3)
    expect(thornShardCount(1e6)).toBe(7)
    const fx = createTowerFx()
    spawnThornShards(fx, 0, 40, 0, 1, 40, 5, rand)
    const n = thornShardCount(5)
    expect(fx.active).toBe(n)
    for (const p of fx.pool.slice(0, n)) {
      expect(p.kind).toBe(FxKind.Thorn)
      expect(p.vy).toBeGreaterThan(0)
    }
    tickTowerFx(fx, 1000)
    expect(fx.active).toBe(0)
  })

  it('never exceeds its cap and never allocates past the preallocated pool', () => {
    const fx = createTowerFx(30)
    const pool = fx.pool
    for (let i = 0; i < 20; i++) spawnSplinters(fx, 0, 0, 1, 0, 40, 50, rand)
    spawnLeaves(fx, 0, 0, 40, 50, 0.5, rand)
    expect(fx.active).toBe(30)
    expect(fx.pool).toBe(pool)
    expect(fx.pool.length).toBe(TOWER_FX_CAP)
    expect(createTowerFx(10_000).cap).toBe(TOWER_FX_CAP)
  })

  it('recycles finished particles (same objects reused) and splinters die in ~0.4-0.7 s', () => {
    const fx = createTowerFx()
    spawnSplinters(fx, 0, 0, 1, 0, 40, 10, Math.random)
    const objs = new Set(fx.pool)
    tickTowerFx(fx, 300)
    expect(fx.active).toBeGreaterThan(0)
    for (let t = 0; t < 45; t++) tickTowerFx(fx, 16)
    expect(fx.active).toBe(0)
    spawnSplinters(fx, 0, 0, 1, 0, 40, 10, Math.random)
    for (const p of fx.pool) expect(objs.has(p)).toBe(true)
  })

  it('splinters arc under gravity and land on the ground plane', () => {
    const fx = createTowerFx()
    spawnSplinters(fx, 0, 0, 1, 0, 40, 10, rand)
    const p = fx.pool[0]!
    const z0 = p.z
    tickTowerFx(fx, 60)
    expect(p.z).toBeGreaterThan(z0)
    tickTowerFx(fx, 300)
    expect(p.z).toBeGreaterThanOrEqual(0)
  })

  it('leaves fall from the crown top to the ground with sway, then fade', () => {
    const fx = createTowerFx()
    spawnLeaves(fx, 0, 0, 40, 5, 0, rand)
    const p = fx.pool[0]!
    const x0 = p.x
    expect(p.z).toBeGreaterThan(40)
    let maxDx = 0
    for (let t = 0; t < 80; t++) { tickTowerFx(fx, 16); maxDx = Math.max(maxDx, Math.abs(p.x - x0)) }
    expect(maxDx).toBeGreaterThan(1)
    expect(p.z).toBe(0)
    for (let t = 0; t < 100; t++) tickTowerFx(fx, 16)
    expect(fx.active).toBe(0)
  })

  it('stage watch: baseline silent, fires once per state drop, felled cascade biggest', () => {
    const fx = createTowerFx()
    const maxHp = 100
    const fires: number[] = []
    for (const hp of [100, 90, 70, 60, 55, 40, 30, 25, 20, 10, 0, 0]) {
      fires.push(noteTowerStage(fx, 0, towerDamageStage(hp, maxHp)))
    }
    expect(fires.filter(n => n > 0)).toEqual([leafCascadeCount(1), leafCascadeCount(2), leafCascadeCount(3)])
    expect(leafCascadeCount(3)).toBeGreaterThan(leafCascadeCount(2))
    expect(leafCascadeCount(2)).toBeGreaterThan(leafCascadeCount(1))
    // Towers tracked independently; a match starting damaged does not fire.
    expect(noteTowerStage(fx, 1, 2)).toBe(0)
    resetTowerFx(fx)
    expect(noteTowerStage(fx, 0, 3)).toBe(0)
    expect(fx.active).toBe(0)
  })

  it('painted variant = the spawn pool slot (deterministic, no RNG); leaves carry the yellowing bit', () => {
    const fx = createTowerFx()
    spawnSplinters(fx, 0, 0, 1, 0, 40, 10, rand)
    for (let i = 0; i < fx.active; i++) {
      const p = fx.pool[i]!
      if (p.kind !== FxKind.Ring) expect(p.v).toBe(i)
    }
    const from = fx.active
    spawnLeaves(fx, 0, 0, 40, 4, 1, rand)
    spawnLeaves(fx, 0, 0, 40, 4, 0, rand)
    for (let i = from; i < from + 4; i++) expect(fx.pool[i]!.v).toBe(i * 2 + 1)
    for (let i = from + 4; i < from + 8; i++) expect(fx.pool[i]!.v).toBe(i * 2)
  })
})
