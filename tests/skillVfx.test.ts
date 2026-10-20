// ─── Skill VFX + SFX (WP8, skills-feature.md §8.2/§8.3) ───────────────────
//
// Pure-module tests against a recording canvas context:
//   · pools are fixed-size and never grow, whatever the event storm;
//   · zero per-frame allocation — pool objects keep their identity across
//     thousands of frames and every colour written is a module constant;
//   · FX.low draws only the §8.3 fallback set;
//   · the worst-case frame stays within the 20-primitive budget;
//   · skill SFX: 400 ms per-name throttle, overlap cap, drum-roll sync;
//   · skill audio is only requested once a skill is owned / the intro is near.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import {
  createSkillVfx, resetSkillVfx, tickSkillVfx, skillVfxEvent, renderBladeSkillFx,
  renderSkillLayer, drawSkillGlyph, skillBladeAlpha, __glyphPathFor,
  RING_POOL_SIZE, SHARD_POOL_SIZE, BURST_POOL_SIZE, SKILL_LAYER_MAX_PRIMITIVES, PHASE_ALPHA,
  type SkillEvent, type SkillEventKind, type SkillRocketView, type SkillVfxBlade, type SkillVfx
} from '@/use/skills/skillVfx'
import {
  playSkillSfx, playSkillDrumroll, createSkillSfxPreloader, __setSkillSfxPlayer, __resetSkillSfx,
  SKILL_SFX_THROTTLE_MS, SKILL_SFX_MAX_ACTIVE
} from '@/use/skills/skillSfx'
import { SKILL_BATTLE_SFX_ASSETS, SKILL_INTRO_SFX_ASSETS } from '@/use/skills/skillSfx'
import type { SkillId } from '@/types/skills'

// ─── Recording context ─────────────────────────────────────────────────────

const PRIMITIVES = ['stroke', 'fill', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText'] as const

class RecCtx {
  counts: Record<string, number> = {}
  styles = new Set<string>()
  depth = 0
  maxDepth = 0
  usedShadow = false
  usedFilter = false
  globalAlpha = 1
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  private _stroke = '#000'
  private _fill = '#000'

  get strokeStyle() {
    return this._stroke
  }

  set strokeStyle(v: string) {
    this._stroke = v
    this.styles.add(v)
  }

  get fillStyle() {
    return this._fill
  }

  set fillStyle(v: string) {
    this._fill = v
    this.styles.add(v)
  }

  set shadowBlur(_v: number) {
    this.usedShadow = true
  }

  set filter(_v: string) {
    this.usedFilter = true
  }

  private hit(n: string) {
    this.counts[n] = (this.counts[n] ?? 0) + 1
  }

  save() {
    this.depth++
    this.maxDepth = Math.max(this.maxDepth, this.depth)
    this.hit('save')
  }

  restore() {
    this.depth--
    this.hit('restore')
  }

  beginPath() {
    this.hit('beginPath')
  }

  closePath() {
  }

  moveTo() {
  }

  lineTo() {
  }

  arc() {
  }

  translate() {
  }

  scale() {
  }

  stroke() {
    this.hit('stroke')
  }

  fill() {
    this.hit('fill')
  }

  fillRect() {
    this.hit('fillRect')
  }

  strokeRect() {
    this.hit('strokeRect')
  }

  drawImage() {
    this.hit('drawImage')
  }

  fillText() {
    this.hit('fillText')
  }

  strokeText() {
    this.hit('strokeText')
  }

  primitives(): number {
    let n = 0
    for (const p of PRIMITIVES) n += this.counts[p] ?? 0
    return n
  }

  reset() {
    this.counts = {}
    this.styles.clear()
  }
}

const asCtx = (c: RecCtx) => c as unknown as CanvasRenderingContext2D

// ─── Fixtures ──────────────────────────────────────────────────────────────

const blade = (id: number, owner: 'player' | 'npc', x = 100 + id * 60, y = 200, shield = 0): SkillVfxBlade => ({
  id, x, y, radius: 28, hp: 100, owner,
  skills: { has: 0, shield, shieldMax: 40, phasedUntil: -Infinity }
})

const ev = (kind: SkillEventKind, b: SkillVfxBlade, value = 1, skill: SkillId = 'guard_shell'): SkillEvent => ({
  seq: 1, t: 0, kind, skill, bladeId: b.id, syncKey: b.id, owner: b.owner, x: b.x, y: b.y, value, key: ''
})

const rockets = (n: number, targets: SkillVfxBlade[], now = 0): SkillRocketView[] =>
  Array.from({ length: n }, (_, i) => ({
    active: true, owner: i % 2 === 0 ? 'player' : 'npc', x0: 50, y0: 50,
    target: targets[i % targets.length]!, startAt: now - 100, arriveAt: now + 300
  }))

/** Everything at once: the §8.3 worst case (and then some). */
const fillEverything = (fx: SkillVfx, blades: SkillVfxBlade[], low: boolean) => {
  const [a, b, c, d] = blades as [SkillVfxBlade, SkillVfxBlade, SkillVfxBlade, SkillVfxBlade]
  for (const k of ['heal', 'mirror', 'momentum', 'phase'] as const) {
    skillVfxEvent(fx, ev(k, a, 3), low)
    skillVfxEvent(fx, ev(k, c, 2), low)
  }
  skillVfxEvent(fx, ev('shield_break', a), low)
  skillVfxEvent(fx, ev('shield_break', c), low)
  for (let i = 0; i < 4; i++) {
    skillVfxEvent(fx, ev('rocket_hit', i % 2 ? b : d, 5), low)
    skillVfxEvent(fx, ev('salvo', i % 2 ? a : c, 5), low)
  }
}

const silentPlayer = vi.fn(() => null)

beforeEach(() => {
  __resetSkillSfx()
  silentPlayer.mockClear()
  __setSkillSfxPlayer(silentPlayer)
})
afterEach(() => {
  __setSkillSfxPlayer(null)
  vi.useRealTimers()
})

// ─── Pools ─────────────────────────────────────────────────────────────────

describe('skill vfx — fixed pools', () => {
  it('pools have their fixed sizes and never grow under an event storm', () => {
    const fx = createSkillVfx()
    const bl = [blade(1, 'player'), blade(2, 'npc'), blade(3, 'player'), blade(4, 'npc')]
    for (let i = 0; i < 200; i++) {
      fillEverything(fx, bl, false)
      skillVfxEvent(fx, ev('shield_break', bl[i % 4]!), false)
    }
    expect(fx.rings.length).toBe(RING_POOL_SIZE)
    expect(RING_POOL_SIZE).toBe(2)
    expect(fx.shards.length).toBe(SHARD_POOL_SIZE)
    expect(fx.bursts.length).toBe(BURST_POOL_SIZE)
    expect(fx.shards.filter(s => s.active).length).toBeLessThanOrEqual(SHARD_POOL_SIZE)
  })

  it('effects expire by tick time and reset drops everything', () => {
    const fx = createSkillVfx()
    const a = blade(1, 'player')
    skillVfxEvent(fx, ev('heal', a), false)
    skillVfxEvent(fx, ev('shield_break', a), false)
    skillVfxEvent(fx, ev('rocket_hit', blade(2, 'npc')), false)
    expect(fx.rings.some(r => r.active)).toBe(true)
    for (let t = 0; t < 500; t += 16) tickSkillVfx(fx, 16)
    expect(fx.rings.some(r => r.active) || fx.shards.some(s => s.active) || fx.bursts.some(b => b.active)).toBe(false)
    fillEverything(fx, [a, blade(2, 'npc'), blade(3, 'player'), blade(4, 'npc')], false)
    resetSkillVfx(fx)
    expect(fx.rings.some(r => r.active) || fx.shards.some(s => s.active) || fx.bursts.some(b => b.active)).toBe(false)
  })

  it('a re-proc of the same ring on the same blade restarts it instead of taking a second slot', () => {
    const fx = createSkillVfx()
    const a = blade(1, 'player')
    skillVfxEvent(fx, ev('mirror', a), false)
    tickSkillVfx(fx, 100)
    skillVfxEvent(fx, ev('mirror', a), false)
    expect(fx.rings.filter(r => r.active).length).toBe(1)
    expect(fx.rings.find(r => r.active)!.t).toBe(0)
  })
})

// ─── Zero allocation ───────────────────────────────────────────────────────

describe('skill vfx — zero per-frame allocation', () => {
  it('pool objects keep their identity and colours are constants over 2000 frames', () => {
    const fx = createSkillVfx()
    const ringRefs = [...fx.rings]
    const shardRefs = [...fx.shards]
    const burstRefs = [...fx.bursts]
    const poolArrays = [fx.rings, fx.shards, fx.bursts]
    const bl = [blade(1, 'player', 100, 100, 30), blade(2, 'npc'), blade(3, 'player', 300, 100, 10), blade(4, 'npc')]
    const rk = rockets(6, [bl[1]!, bl[3]!])
    const ctx = new RecCtx()
    const stunned = (b: SkillVfxBlade) => b.owner === 'npc'
    const seenStyles = new Set<string>()
    for (let f = 0; f < 2000; f++) {
      if (f % 25 === 0) fillEverything(fx, bl, false)
      tickSkillVfx(fx, 16)
      for (const b of bl) renderBladeSkillFx(asCtx(ctx), fx, b, f * 16, false)
      renderSkillLayer(asCtx(ctx), fx, rk, bl, stunned, f * 16, false)
      for (const s of ctx.styles) seenStyles.add(s)
      ctx.styles.clear()
    }
    expect([fx.rings, fx.shards, fx.bursts]).toEqual(poolArrays)
    fx.rings.forEach((r, i) => expect(r).toBe(ringRefs[i]))
    fx.shards.forEach((s, i) => expect(s).toBe(shardRefs[i]))
    fx.bursts.forEach((b, i) => expect(b).toBe(burstRefs[i]))
    // Only literal hex colours are ever assigned — no per-frame string building
    // (rgba(...) templates, number formatting) — and a small closed set of them.
    for (const s of seenStyles) expect(s).toMatch(/^#[0-9a-f]{6}$/)
    expect(seenStyles.size).toBeLessThanOrEqual(16)
  })

  it('the source has no allocation constructs inside the hot render/tick paths', () => {
    const src = readFileSync(join(__dirname, '../src/use/skills/skillVfx.ts'), 'utf8')
    const hot = src
      .slice(src.indexOf('// ─── Call site 1'), src.indexOf('// ─── Call site 3'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(hot).not.toMatch(/`/) // template strings
    expect(hot).not.toMatch(/\bnew\s+[A-Z]/)
    expect(hot).not.toMatch(/\.(map|filter|find|forEach|reduce|slice|concat)\(/)
    expect(hot).not.toMatch(/for\s*\(\s*const\s+\w+\s+of/)
    expect(hot).not.toMatch(/shadowBlur|\.filter\s*=|createLinearGradient|createRadialGradient|createPattern/)
  })

  it('drawSkillGlyph builds each Path2D once and reuses it', () => {
    let built = 0

    class FakePath2D {
      constructor(_d?: string) {
        built++
      }
    }

    vi.stubGlobal('Path2D', FakePath2D)
    try {
      const ctx = new RecCtx()
      const first = __glyphPathFor('lucky_edge')
      for (let i = 0; i < 100; i++) drawSkillGlyph(asCtx(ctx), 'lucky_edge', 10, 10, 12, '#ffffff')
      expect(__glyphPathFor('lucky_edge')).toBe(first)
      expect(built).toBe(1)
      expect(ctx.counts.save).toBe(ctx.counts.restore)
      expect(ctx.counts.fill).toBe(100)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── Quality tiers + budget ────────────────────────────────────────────────

describe('skill vfx — FX.low fallback set and primitive budget', () => {
  const setup = () => {
    const bl = [
      blade(1, 'player', 100, 100, 40), blade(2, 'npc', 200, 100, 40),
      blade(3, 'player', 300, 100, 40), blade(4, 'npc', 400, 100, 40),
      blade(5, 'npc', 500, 100, 40), blade(6, 'npc', 600, 100, 40)
    ]
    return { bl, rk: rockets(6, [bl[1]!, bl[0]!, bl[3]!]), stunned: (b: SkillVfxBlade) => b.owner === 'npc' }
  }

  it('worst case (every effect live, 6 shielded blades, 6 rockets, 4 stunned) ≤ 20 primitives', () => {
    const { bl, rk, stunned } = setup()
    const fx = createSkillVfx()
    fillEverything(fx, bl, false)
    tickSkillVfx(fx, 16)
    const ctx = new RecCtx()
    renderSkillLayer(asCtx(ctx), fx, rk, bl, stunned, 0, false)
    const layer = ctx.primitives()
    expect(layer).toBeLessThanOrEqual(SKILL_LAYER_MAX_PRIMITIVES)
    // Every family is really live — this is the true worst case, not an empty frame.
    expect(ctx.counts.stroke).toBeGreaterThanOrEqual(8)
    for (const b of bl) renderBladeSkillFx(asCtx(ctx), fx, b, 0, false)
    expect(ctx.primitives()).toBeLessThanOrEqual(20)
    expect(ctx.depth).toBe(0) // every save restored
    expect(ctx.usedShadow || ctx.usedFilter).toBe(false)
  })

  it('FX.low events spawn no rings, shards or bursts', () => {
    const { bl } = setup()
    const fx = createSkillVfx()
    fillEverything(fx, bl, true)
    expect(fx.rings.some(r => r.active)).toBe(false)
    expect(fx.shards.some(s => s.active)).toBe(false)
    expect(fx.bursts.some(b => b.active)).toBe(false)
  })

  it('FX.low render draws only the fallback set: shield arcs, rocket heads, stun glyph fill', () => {
    const { bl, rk, stunned } = setup()
    const fx = createSkillVfx()
    fillEverything(fx, bl, false) // effects spawned on high, tier switched to low mid-fight
    const ctx = new RecCtx()
    renderSkillLayer(asCtx(ctx), fx, rk, bl, stunned, 0, true)
    // Rocket heads (1 fill per side) + one stun fill. No strokes at all:
    // no rings, shards, bursts, tails or glyph outline.
    expect(ctx.counts.stroke ?? 0).toBe(0)
    expect(ctx.counts.fill).toBe(3)
    ctx.reset()
    for (const b of bl) renderBladeSkillFx(asCtx(ctx), fx, b, 0, true)
    expect(ctx.counts.stroke).toBe(bl.length) // Guard Shell arc kept on low
    expect(ctx.primitives()).toBe(bl.length)
  })

  it('high tier adds tails, outline and pooled effects on top of the low set', () => {
    const { bl, rk, stunned } = setup()
    const fx = createSkillVfx()
    fillEverything(fx, bl, false)
    const hi = new RecCtx()
    const lo = new RecCtx()
    renderSkillLayer(asCtx(hi), fx, rk, bl, stunned, 0, false)
    renderSkillLayer(asCtx(lo), fx, rk, bl, stunned, 0, true)
    expect(hi.primitives()).toBeGreaterThan(lo.primitives())
  })

  it('an idle layer (nothing live, nobody stunned) touches the context not at all', () => {
    const fx = createSkillVfx()
    const ctx = new RecCtx()
    const idle: SkillRocketView[] = rockets(6, [blade(9, 'npc')]).map(r => ({ ...r, active: false }))
    renderSkillLayer(asCtx(ctx), fx, idle, [blade(1, 'player')], () => false, 0, false)
    expect(ctx.counts).toEqual({})
  })

  it('shield arc only while the shield holds; none for an empty shield', () => {
    const fx = createSkillVfx()
    const ctx = new RecCtx()
    renderBladeSkillFx(asCtx(ctx), fx, blade(1, 'player', 0, 0, 0), 0, false)
    expect(ctx.primitives()).toBe(0)
    renderBladeSkillFx(asCtx(ctx), fx, blade(1, 'player', 0, 0, 20), 0, false)
    expect(ctx.counts.stroke).toBe(1)
    expect(ctx.styles.has('#67e8f9')).toBe(true)
  })

  it('Phase Step alpha: 1 outside the window, flicker on high, steady 45 % on low', () => {
    const b = blade(1, 'player')
    b.skills!.phasedUntil = 300
    expect(skillBladeAlpha(b, 400, false)).toBe(1)
    expect(skillBladeAlpha(b, 10, true)).toBe(PHASE_ALPHA)
    const hi = new Set([0, 50, 100, 150].map(t => skillBladeAlpha(b, t, false)))
    expect(hi.size).toBe(2)
    for (const a of hi) expect(a).toBeLessThanOrEqual(PHASE_ALPHA)
    expect(skillBladeAlpha(blade(2, 'npc'), 0, false)).toBe(1)
  })
})

// ─── SFX ───────────────────────────────────────────────────────────────────

describe('skill sfx — throttle, cap, drum roll', () => {
  it('one play per SFX name per 400 ms; names are independent', () => {
    expect(SKILL_SFX_THROTTLE_MS).toBe(400)
    const handles: { end: () => void }[] = []
    const player = vi.fn(() => {
      let cb: () => void = () => {
      }
      handles.push({ end: () => cb() })
      return {
        addEventListener: (e: string, f: () => void) => {
          if (e === 'ended') cb = f
        },
        removeEventListener: () => {
        }
      } as never
    })
    __setSkillSfxPlayer(player)
    expect(playSkillSfx('skill-shield', 0.02, 1000)).toBe(true)
    expect(playSkillSfx('skill-shield', 0.02, 1100)).toBe(false)
    expect(playSkillSfx('skill-shield', 0.02, 1399)).toBe(false)
    expect(playSkillSfx('skill-zap', 0.02, 1100)).toBe(true)
    expect(playSkillSfx('skill-shield', 0.02, 1400)).toBe(true)
    expect(player).toHaveBeenCalledTimes(3)
    // Overlap cap: 3 still ringing → a fourth name is refused until one ends.
    expect(playSkillSfx('skill-rocket', 0.02, 1500)).toBe(false)
    expect(SKILL_SFX_MAX_ACTIVE).toBe(3)
    handles[0]!.end()
    expect(playSkillSfx('skill-rocket', 0.02, 1500)).toBe(true)
  })

  it('an event storm through skillVfxEvent plays each sound at most once per 400 ms', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fx = createSkillVfx()
    const a = blade(1, 'player')
    const spy = vi.spyOn(performance, 'now').mockReturnValue(5000)
    try {
      for (let i = 0; i < 50; i++) {
        skillVfxEvent(fx, ev('shield_absorb', a), false)
        skillVfxEvent(fx, ev('static', a), false)
        skillVfxEvent(fx, ev('rocket_volley', a, 3), false)
      }
      expect(silentPlayer).toHaveBeenCalledTimes(3)
      const names = silentPlayer.mock.calls.map(c => (c as unknown[])[0])
      expect(names.sort()).toEqual(['skill-rocket', 'skill-shield', 'skill-zap'])
    } finally {
      spy.mockRestore()
    }
  })

  it('a throwing player never escapes into the physics tick', () => {
    __setSkillSfxPlayer(() => {
      throw new Error('no audio')
    })
    expect(() => skillVfxEvent(createSkillVfx(), ev('static', blade(1, 'npc')), false)).not.toThrow()
  })

  it('drum roll: the hit lands at the build-up end for 1200 / 1300 / 1500 ms', () => {
    vi.useFakeTimers()
    const calls: [string, number, number | undefined][] = []
    __setSkillSfxPlayer((n, r, o) => {
      calls.push([n, r, o])
      return null
    })
    playSkillDrumroll(1300)
    expect(calls[0]).toEqual(['skill-drumroll', expect.any(Number), 0])
    playSkillDrumroll(1200)
    expect(calls[1]![2]).toBeCloseTo(0.1, 6) // start 100 ms into the file
    playSkillDrumroll(1500)
    expect(calls.length).toBe(2) // waits 200 ms, then starts at 0
    vi.advanceTimersByTime(199)
    expect(calls.length).toBe(2)
    vi.advanceTimersByTime(1)
    expect(calls[2]).toEqual(['skill-drumroll', expect.any(Number), 0])
    const cancel = playSkillDrumroll(1450)
    cancel()
    vi.advanceTimersByTime(500)
    expect(calls.length).toBe(3)
  })
})

// ─── Assets ────────────────────────────────────────────────────────────────

describe('skill sfx — gated preload + files', () => {
  it('nothing is requested until a skill is owned / the intro is near; each set once', () => {
    let owned = false
    let introSoon = false
    const load = vi.fn()
    const pre = createSkillSfxPreloader(load, () => owned, () => introSoon)
    pre.check()
    expect(load).not.toHaveBeenCalled()
    introSoon = true // stage-8 teaser: drum roll only
    pre.check()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenLastCalledWith(SKILL_INTRO_SFX_ASSETS)
    owned = true
    pre.check()
    pre.check()
    expect(load).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenLastCalledWith(SKILL_BATTLE_SFX_ASSETS)
    expect(pre.battleRequested && pre.introRequested).toBe(true)
  })

  it('skill SFX are not in the ungated core SFX tier', () => {
    const src = readFileSync(join(__dirname, '../src/use/useAssets.ts'), 'utf8')
    const core = src.slice(src.indexOf('const SOUND_ASSETS = ['), src.indexOf(']', src.indexOf('const SOUND_ASSETS = [')))
    expect(core).not.toMatch(/skill-/)
  })

  it('every skill SFX ships as Ogg Vorbis ≤ 12 KB', () => {
    for (const rel of [...SKILL_BATTLE_SFX_ASSETS, ...SKILL_INTRO_SFX_ASSETS]) {
      const p = join(__dirname, '../public', rel)
      expect(statSync(p).size).toBeLessThanOrEqual(12000)
      const head = readFileSync(p).subarray(0, 64)
      expect(head.subarray(0, 4).toString()).toBe('OggS')
      expect(head.includes(Buffer.from('vorbis'))).toBe(true)
    }
  })
})
