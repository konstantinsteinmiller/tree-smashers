// #UX3 balloon HP (src/use/balloonHp.ts, balloonPopFx.ts, balloonHpFlag.ts):
// the flag picks balloons or the old gauge for smashers (towers always keep
// the gauge), balloon count / HP mapping, one pop per lost balloon, heal
// regrow, and the pooled burst VFX staying inside its cap.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BALLOON_HP, balloonCount, balloonsAlive, drawBalloonHp, drawBalloonHpNumber, newBalloonState, partialFill,
  slotOfRank, stepBalloons, updateBalloonHp
} from '@/use/balloonHp'
import {
  BALLOON_FX_CAP, POP_PARTICLES, POP_SCRAPS, PopKind, createBalloonPopFx, drawBalloonPopFx, spawnBalloonPop, tickBalloonPopFx
} from '@/use/balloonPopFx'
import { balloonHpEnabled } from '@/use/balloonHpFlag'
import * as art from '@/use/balloonArt'
import { bangPunch } from '@/use/balloonPopFx'

/** A 2D-context stand-in that counts calls (no DOM canvas in vitest). */
const mockCtx = () => {
  const calls: Record<string, number> = {}
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 6, actualBoundingBoxAscent: 8 })
  }
  const ctx = new Proxy(target, {
    get(o, k: string) {
      if (k in o) return o[k]
      return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1 }
    },
    set(o, k: string, v) { o[k] = v; return true }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const seqRand = () => {
  let i = 0
  return () => ((i++ * 0.37) % 1)
}

describe('flag VITE_APP_BALOON_HP_BAR', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('parses: unset / "" / "true" → balloons, "false" → the old gauge', () => {
    expect(balloonHpEnabled(undefined)).toBe(true)
    expect(balloonHpEnabled('')).toBe(true)
    expect(balloonHpEnabled('true')).toBe(true)
    expect(balloonHpEnabled('false')).toBe(false)
  })

  it('freezes the build switch from the env', async () => {
    vi.stubEnv('VITE_APP_BALOON_HP_BAR', 'false')
    expect((await import('@/use/balloonHpFlag')).BALLOON_HP_BUILD).toBe(false)
    vi.resetModules()
    vi.stubEnv('VITE_APP_BALOON_HP_BAR', 'true')
    expect((await import('@/use/balloonHpFlag')).BALLOON_HP_BUILD).toBe(true)
  })

  it('is declared on in the base .env, validated in vite.config.ts and typed', () => {
    const root = resolve(__dirname, '..')
    const env = (() => { try { return readFileSync(resolve(root, '.env'), 'utf8') } catch { return null } })()
    if (env !== null) expect(env).toMatch(/^VITE_APP_BALOON_HP_BAR=true$/m)
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).toMatch(/'VITE_APP_BALOON_HP_BAR'\]\) \{/)
    expect(readFileSync(resolve(root, 'env.d.ts'), 'utf8')).toContain('readonly VITE_APP_BALOON_HP_BAR?: string')
  })

  it('engine: smashers draw balloons OR the gauge by the flag; towers always keep the gauge', () => {
    const src = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
    // Balloon path: behind the plush (before drawSmasherFrame) + the number after it.
    const blade = src.slice(src.indexOf('const renderBlade = ('), src.indexOf('// ── HP gauge (smashers AND team towers'))
    const balloonsAt = blade.indexOf('drawBalloonHp(ctx, balloonFx')
    const plushAt = blade.indexOf('drawSmasherFrame(ctx, look.smasherId')
    expect(balloonsAt).toBeGreaterThan(0)
    expect(balloonsAt).toBeLessThan(plushAt)
    expect(blade).toContain('BALLOON_HP_BUILD && (!CLEAN_FEED || CLEAN_HP_RINGS) ? balloonStateOf(blade) : null')
    // Gauge path: only when the flag is off.
    expect(blade).toMatch(/else if \(!BALLOON_HP_BUILD && \(!CLEAN_FEED \|\| CLEAN_HP_RINGS\)\) \{\s*renderHealthRing\(/)
    // Towers: the gauge, unconditionally.
    const tower = src.slice(src.indexOf('const renderTowerGauge = ('), src.indexOf('const TOWER_GAUGE_R'))
    expect(tower).toContain('drawHpGauge(')
    expect(tower).not.toContain('BALLOON')
    // No pool / layer at all on a gauge build.
    expect(src).toContain('BALLOON_HP_BUILD ? createBalloonPopFx(')
    expect(src).toContain('if (BALLOON_HP_BUILD) renderBalloonLayer(ctx)')
  })

  it('stays out of the simulation: no gameplayRand / matchRng / state-hash use in the balloon modules', () => {
    for (const f of ['balloonHp.ts', 'balloonPopFx.ts', 'balloonHpFlag.ts']) {
      const t = readFileSync(resolve(__dirname, '../src/use', f), 'utf8')
      const code = t.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '')).join('\n')
      expect(code, f).not.toMatch(/gameplayRand|matchRng|StateHash|\.hp\s*=[^=]/)
      for (const line of t.split('\n')) if (/Math\.random\s*\(/.test(line)) expect(line, f).toContain('// vfx-rng')
    }
  })
})

describe('balloon count and HP mapping', () => {
  it('count: solo 5, duo 4, trio 3; boss 5; spawned mini 2', () => {
    expect([1, 2, 3].map(n => balloonCount(n))).toEqual([5, 4, 3])
    expect(balloonCount(4)).toBe(3)
    expect(balloonCount(0)).toBe(5)
    expect(balloonCount(3, true)).toBe(BALLOON_HP.BOSS_COUNT)
    expect(balloonCount(1, false, true)).toBe(BALLOON_HP.MINOR_COUNT)
  })

  it('alive balloons and the partial fill track hp / maxHp × count', () => {
    expect(balloonsAlive(100, 100, 4)).toBe(4)
    expect(partialFill(100, 100, 4)).toBe(1)
    expect(balloonsAlive(75, 100, 4)).toBe(3)
    expect(partialFill(75, 100, 4)).toBeCloseTo(1)
    expect(balloonsAlive(62.5, 100, 4)).toBe(3)
    expect(partialFill(62.5, 100, 4)).toBeCloseTo(0.5)
    expect(balloonsAlive(0.1, 100, 4)).toBe(1) // any hp > 0 keeps a last balloon
    expect(partialFill(0.1, 100, 4)).toBeCloseTo(0.004)
    expect(balloonsAlive(0, 100, 4)).toBe(0)
    expect(balloonsAlive(-5, 100, 4)).toBe(0)
    expect(balloonsAlive(150, 100, 3)).toBe(3)
    expect(balloonsAlive(50, 0, 3)).toBe(0)
  })

  it('pops outside in (right end first), the centre last', () => {
    const order = (n: number) => Array.from({ length: n }, (_, r) => slotOfRank(n, r))
    expect(order(1)).toEqual([0])
    expect(order(2)).toEqual([0, 1])
    expect(order(3)).toEqual([1, 0, 2])
    expect(order(4)).toEqual([1, 2, 0, 3])
    expect(order(5)).toEqual([2, 1, 3, 0, 4])
    for (const n of [1, 2, 3, 4, 5]) expect(new Set(order(n)).size).toBe(n)
  })
})

describe('pop and regrow', () => {
  it('pops exactly once per lost balloon', () => {
    const s = newBalloonState(4, 100, 100, true)
    let pops = 0
    pops += stepBalloons(s, 90, 100, 0).popped // inside balloon 4: deflates, no pop
    expect(pops).toBe(0)
    pops += stepBalloons(s, 40, 100, 16).popped // 4 → 2
    expect(pops).toBe(2)
    for (let t = 32; t < 400; t += 16) pops += stepBalloons(s, 40, 100, t).popped // same hp: nothing more
    expect(pops).toBe(2)
    pops += stepBalloons(s, 30, 100, 420).popped // still 2 alive (30 % of 4 = 1.2)
    expect(pops).toBe(2)
    pops += stepBalloons(s, 0, 100, 440).popped // knockout: the rest
    expect(pops).toBe(4)
    pops += stepBalloons(s, 0, 100, 460).popped
    expect(pops).toBe(4)
  })

  it('bursts each lost balloon into the pool and the last one on knockout', () => {
    const fx = createBalloonPopFx()
    const s = newBalloonState(3, 60, 60, false)
    expect(updateBalloonHp(fx, s, 0, 0, 20, 30, 60, 0, false)).toBe(1)
    expect(fx.active).toBe(POP_PARTICLES)
    expect(updateBalloonHp(fx, s, 0, 0, 20, 0, 60, 16, false)).toBe(2)
    expect(fx.active).toBe(3 * POP_PARTICLES)
    expect(fx.pool.slice(0, fx.active).filter(p => p.kind === PopKind.Bang)).toHaveLength(3)
  })

  it('a heal regrows a balloon with a pop-in (no pop)', () => {
    const s = newBalloonState(4, 100, 100, true)
    stepBalloons(s, 30, 100, 0)
    expect(s.alive).toBe(2)
    const st = stepBalloons(s, 80, 100, 500)
    expect(st.popped).toBe(0)
    expect(st.grown).toBe(2)
    expect(s.alive).toBe(4)
    expect(s.growAt[2]).toBe(500)
    expect(s.growAt[3]).toBe(500)
    expect(s.growAt[0]).toBe(-1e9)
    // Healing inside a balloon only re-inflates it.
    expect(stepBalloons(s, 85, 100, 520).grown).toBe(0)
  })

  it('draws one body per living balloon behind the plush, nothing once knocked out', () => {
    const { ctx, calls } = mockCtx()
    const s = newBalloonState(4, 100, 100, true)
    drawBalloonHp(ctx, null, s, 0, 0, 22, 100, 100, 0, 0, false)
    expect(calls.bezierCurveTo).toBe(4 * 2) // body: two curves per balloon
    expect(calls.quadraticCurveTo).toBe(4) // one string per balloon
    const { ctx: ctx2, calls: calls2 } = mockCtx()
    drawBalloonHp(ctx2, null, s, 0, 0, 22, 0, 100, 0, 16, false)
    expect(calls2.bezierCurveTo ?? 0).toBe(0)
  })

  it('shows the partly-lost balloon smaller and with a crease', () => {
    const { ctx, calls } = mockCtx()
    const s = newBalloonState(3, 90, 90, false)
    stepBalloons(s, 40, 90, 0) // 1.33 units: one full + one at 1/3
    s.hitAt = -1e9
    drawBalloonHp(ctx, null, s, 0, 0, 22, 40, 90, 0, 1000, false)
    expect(s.alive).toBe(2)
    expect(s.shown).toBeCloseTo(1 / 3, 1)
    expect(calls.bezierCurveTo).toBe(2 * 2)
    // Strings (2) + the crease on the deflated one (1).
    expect(calls.quadraticCurveTo).toBe(3)
  })

  it('the HP number is drawn while alive and hidden on knockout', () => {
    const { ctx, calls } = mockCtx()
    const s = newBalloonState(3, 50, 50, true)
    drawBalloonHpNumber(ctx, s, 0, 0, 22, 50, 0)
    expect(calls.fillText).toBe(1)
    const { ctx: ctx2, calls: calls2 } = mockCtx()
    drawBalloonHpNumber(ctx2, s, 0, 0, 22, 0, 0)
    expect(calls2.fillText ?? 0).toBe(0)
  })
})

describe('pop VFX pool', () => {
  it('never grows past its cap and never reallocates', () => {
    const fx = createBalloonPopFx()
    const pool = fx.pool
    const first = pool[0]
    for (let i = 0; i < 40; i++) spawnBalloonPop(fx, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, false, true, seqRand())
    expect(fx.active).toBe(BALLOON_FX_CAP)
    expect(fx.pool).toBe(pool)
    expect(fx.pool.length).toBe(BALLOON_FX_CAP)
    expect(fx.pool).toContain(first)
  })

  it('honours a smaller cap (Firefox) and the low tier spawns the bang only', () => {
    const small = createBalloonPopFx(40)
    for (let i = 0; i < 10; i++) spawnBalloonPop(small, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, false, true, seqRand())
    expect(small.active).toBe(40)
    const low = createBalloonPopFx()
    for (let i = 0; i < 5; i++) spawnBalloonPop(low, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, true, true, seqRand())
    expect(low.active).toBe(5)
    expect(low.pool.slice(0, 5).every(p => p.kind === PopKind.Bang)).toBe(true)
  })

  it('recycles every particle once its life is over and draws without throwing', () => {
    const fx = createBalloonPopFx()
    spawnBalloonPop(fx, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, false, true, seqRand())
    const { ctx } = mockCtx()
    for (let t = 0; t < 1200; t += 16) {
      tickBalloonPopFx(fx, 16)
      drawBalloonPopFx(ctx, fx)
    }
    expect(fx.active).toBe(0)
  })

  it('scraps flutter DOWN and the string falls', () => {
    const fx = createBalloonPopFx()
    spawnBalloonPop(fx, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, false, true, seqRand())
    const scraps = fx.pool.slice(0, fx.active).filter(p => p.kind === PopKind.Scrap)
    const str = fx.pool.slice(0, fx.active).find(p => p.kind === PopKind.String)!
    const y0 = scraps.reduce((a, p) => a + p.y, 0) / scraps.length
    const s0 = str.y
    for (let t = 0; t < 500; t += 16) tickBalloonPopFx(fx, 16)
    const y1 = scraps.reduce((a, p) => a + p.y, 0) / scraps.length
    expect(y1).toBeGreaterThan(y0)
    expect(str.y).toBeGreaterThan(s0)
  })
})

describe('painted art (balloonArt) with the procedural fallback', () => {
  const R = (x: number) => ({ x, y: 0, w: 40, h: 60 })
  const reg = {
    file: 'x.webp', v: '0',
    blue: [R(0), R(40), R(80), R(120)], red: [R(160), R(200), R(240), R(280)],
    blueLow: [R(320), R(360)], redLow: [R(400), R(440)],
    scrapBlue: [R(0)], scrapRed: [R(40)], burst: [{ x: 0, y: 100, w: 120, h: 120 }]
  }
  afterEach(() => art.__setBalloonArtForTest(null, null))

  it('draws one painted sprite per balloon when the atlas is in and sharp enough', async () => {
    art.__setBalloonArtForTest(reg, {} as CanvasImageSource)
    const { ctx, calls } = mockCtx()
    const s = newBalloonState(4, 100, 100, true)
    drawBalloonHp(ctx, null, s, 0, 0, 22, 100, 100, 0, 0, false, 2.5)
    expect(calls.drawImage).toBe(4)
    expect(calls.bezierCurveTo ?? 0).toBe(0)
    expect(calls.quadraticCurveTo).toBe(4) // strings stay procedural
  })

  it('falls back to the procedural balloon rather than upscale a sprite', async () => {
    art.__setBalloonArtForTest(reg, {} as CanvasImageSource)
    const { ctx, calls } = mockCtx()
    const s = newBalloonState(3, 100, 100, false)
    drawBalloonHp(ctx, null, s, 0, 0, 22, 100, 100, 0, 0, false, 20) // 20 device px / unit: way past 60 px sprites
    expect(calls.drawImage ?? 0).toBe(0)
    expect(calls.bezierCurveTo).toBe(3 * 2)
  })

  it('uses the deflated sprite for the partly-lost balloon', async () => {
    expect(art.pickBalloonSprite(reg.blueLow, 3)).toBe(reg.blueLow[1])
    expect(art.pickBalloonSprite([], 0)).toBeNull()
    expect(art.balloonSpriteTooSmall(reg.blue[0]!, 30, 2)).toBe(false) // 60 px wanted, 60 px painted
    expect(art.balloonSpriteTooSmall(reg.blue[0]!, 30, 2.2)).toBe(true)
  })

  it('pop burst + scraps draw painted sprites when available', async () => {
    art.__setBalloonArtForTest(reg, {} as CanvasImageSource)
    const fx = createBalloonPopFx()
    spawnBalloonPop(fx, 0, 0, 7, '#f00', '#fcc', 0, 8, 0, 20, false, true, seqRand())
    tickBalloonPopFx(fx, 30)
    const { ctx, calls } = mockCtx()
    drawBalloonPopFx(ctx, fx, 1)
    // bang + 7 scraps painted; ring + string stay procedural.
    expect(calls.drawImage).toBe(1 + POP_SCRAPS)
  })
})

describe('pop juice', () => {
  it('the bang punches past full size, then settles', async () => {
    expect(bangPunch(0)).toBeLessThan(0.5)
    expect(bangPunch(0.22)).toBeCloseTo(1.3)
    expect(bangPunch(0.6)).toBe(1)
    let max = 0
    for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, bangPunch(t))
    expect(max).toBeGreaterThan(1.25)
  })

  it('a pop makes the neighbours recoil (and only for a beat)', () => {
    const s = newBalloonState(5, 100, 100, true)
    updateBalloonHp(null, s, 0, 0, 22, 70, 100, 1000, false) // 5 → 4: slot 4 (right end) pops
    expect(s.popAt).toBe(1000)
    expect(s.popSlot).toBe(slotOfRank(5, 4))
  })
})
