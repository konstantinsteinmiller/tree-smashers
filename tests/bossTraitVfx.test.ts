// ─── Boss-trait VFX + SFX (BW4, bosses-100-feature.md §7.3) ────────────────
//
// Pure-module tests against a recording canvas context:
//   · pools are fixed-size and never grow, whatever the event storm
//     (1,000+ triggers of every kind);
//   · zero per-frame allocation — pool objects keep their identity across
//     thousands of frames, every colour written is a module constant, and the
//     hot render/tick source has no allocation constructs;
//   · FX.low spawns no transients and draws only the §7.3 fallback set
//     (no aura sprites, hexagon instead of the ice sprite, 1 stroke per nova);
//   · the Elemental Court worst frame stays within BOSS_TRAIT_MAX_PRIMITIVES;
//   · SFX: 400 ms per-name throttle (a refused-freeze storm is one crack per
//     400 ms), overlap cap, a throwing player never escapes;
//   · lazy loading: the boss set is requested once, only by
//     prepareBossTraitVfx (a trait match), never in the core SFX tier;
//     every file is Ogg Vorbis ≤ 12 KB;
//   · the snowflake popup glyph: Path2D built once, 2 primitives.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import './helpers/bosses100Build'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import {
  createBossTraitVfx, resetBossTraitVfx, prepareBossTraitVfx, tickBossTraitVfx, bossTraitVfxEvent,
  renderBossAura, renderEmberCharge, renderIceShell, renderChillOverlay, renderBossTraitLayer,
  drawBossTraitGlyph, isBossTraitGlyph, __snowflakePath, __resetBossTraitSprites, __iceShellCount,
  NOVA_POOL_SIZE, SHARD_POOL_SIZE, EMBER_POOL_SIZE, FADE_POOL_SIZE, ICE_SHELL_CACHE_SIZE,
  BOSS_LAYER_MAX_PRIMITIVES, BOSS_LAYER_MAX_PRIMITIVES_LOW, BOSS_TRAIT_MAX_PRIMITIVES,
  AURA_MAX_PRIMITIVES, CHARGE_MAX_PRIMITIVES, SHELL_MAX_PRIMITIVES, CHILL_MAX_PRIMITIVES,
  type BossTraitEvent, type BossTraitEventKind, type BossTraitVfx, type BossTraitVfxBlade
} from '@/use/bosses/bossTraitVfx'
import {
  playBossSfx, requestBossTraitSfx, bossTraitSfxRequested, __setBossSfxPlayer, __setBossSfxLoader,
  __resetBossSfx, BOSS_SFX_THROTTLE_MS, BOSS_SFX_MAX_ACTIVE, BOSS_TRAIT_SFX_ASSETS
} from '@/use/bosses/bossTraitSfx'
import { BOSS_TRAIT_TUNING } from '@/use/bosses/bossTraits'
import type { BossTrait } from '@/types/spinner'

// ─── Recording context ─────────────────────────────────────────────────────

const PRIMITIVES = ['stroke', 'fill', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText'] as const

class RecCtx {
  counts: Record<string, number> = {}
  styles = new Set<string>()
  depth = 0
  usedShadow = false
  usedFilter = false
  globalAlpha = 1
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  strokedPaths: unknown[] = []
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

  stroke(p?: unknown) {
    this.hit('stroke')
    if (p !== undefined) this.strokedPaths.push(p)
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

  lineDashOffset = 0

  setLineDash() {
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
    this.strokedPaths = []
  }
}

const asCtx = (c: RecCtx) => c as unknown as CanvasRenderingContext2D

/** Stand-in for OffscreenCanvas so sprites bake in the test DOM. */
class FakeOffscreen {
  constructor(public width: number, public height: number) {
  }

  getContext() {
    const g = new RecCtx() as unknown as Record<string, unknown>
    g.createRadialGradient = () => ({
      addColorStop() {
      }
    })
    g.createLinearGradient = () => ({
      addColorStop() {
      }
    })
    return g
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const blade = (
  id: number, owner: 'player' | 'npc', trait?: BossTrait, x = 100 + id * 60, y = 200, radius = owner === 'npc' ? 45 : 28
): BossTraitVfxBlade => ({ id, x, y, radius, rotation: 0, hp: 100, owner, config: trait ? { bossTrait: trait } : {} })

const ev = (kind: BossTraitEventKind, b: BossTraitVfxBlade, value = 1, t = 0): BossTraitEvent => ({
  seq: 1, t, kind, trait: 'ember', bladeId: b.id, syncKey: b.id, owner: b.owner, x: b.x, y: b.y, radius: b.radius, value
})

const KINDS: BossTraitEventKind[] = ['nova', 'burn', 'frost_touch', 'freeze', 'freeze_crack', 'thaw', 'chill', 'chill_fade']

/** Elemental Court: 3 carriers vs 2 player blades. */
const court = () => {
  const cinder = blade(1, 'npc', 'ember', 200, 200)
  const warden = blade(2, 'npc', 'frost', 400, 200)
  const yeti = blade(3, 'npc', 'chill', 600, 200)
  const p1 = blade(4, 'player', undefined, 250, 350)
  const p2 = blade(5, 'player', undefined, 450, 350)
  return { carriers: [cinder, warden, yeti], victims: [p1, p2], all: [cinder, warden, yeti, p1, p2] }
}

/** Every transient at once (more than the pools hold). */
const fillEverything = (fx: BossTraitVfx, c: ReturnType<typeof court>, low: boolean) => {
  for (const car of c.carriers) bossTraitVfxEvent(fx, ev('nova', car, 2), low)
  for (const v of c.victims) {
    for (const k of KINDS) if (k !== 'nova') bossTraitVfxEvent(fx, ev(k, v, 3), low)
  }
}

/** One full trait frame: auras, charge, shells, rims, the layer. */
const renderFrame = (ctx: RecCtx, fx: BossTraitVfx, c: ReturnType<typeof court>, now: number, low: boolean) => {
  for (const car of c.carriers) renderBossAura(asCtx(ctx), fx, car, now, low)
  renderEmberCharge(asCtx(ctx), fx, c.carriers[0]!, 0.95, 2000, BOSS_TRAIT_TUNING.EMBER_RADIUS_MUL * 45, now, low)
  for (const v of c.victims) {
    renderIceShell(asCtx(ctx), fx, v, now, low)
    renderChillOverlay(asCtx(ctx), fx, v, 5, now, low)
  }
  renderBossTraitLayer(asCtx(ctx), fx, now, low)
}

const silentPlayer = vi.fn(() => null)

beforeEach(() => {
  __resetBossSfx()
  __resetBossTraitSprites()
  silentPlayer.mockClear()
  __setBossSfxPlayer(silentPlayer)
  __setBossSfxLoader(() => {
  })
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen)
})
afterEach(() => {
  __setBossSfxPlayer(null)
  __setBossSfxLoader(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  silentPlayer.mockImplementation(() => null)
})

// ─── Pools ─────────────────────────────────────────────────────────────────

describe('boss trait vfx — fixed pools', () => {
  it('pools have their fixed sizes and never grow after 1,000 triggers of every kind', () => {
    const fx = createBossTraitVfx()
    const c = court()
    for (let i = 0; i < 1000; i++) {
      for (const k of KINDS) bossTraitVfxEvent(fx, ev(k, c.all[i % c.all.length]!, i % 6), i % 2 === 0)
      if (i % 3 === 0) tickBossTraitVfx(fx, 16)
    }
    expect(fx.novas.length).toBe(NOVA_POOL_SIZE)
    expect(fx.shards.length).toBe(SHARD_POOL_SIZE)
    expect(fx.embers.length).toBe(EMBER_POOL_SIZE)
    expect(fx.fades.length).toBe(FADE_POOL_SIZE)
    expect(fx.freezeId.length).toBe(4)
  })

  it('effects expire by tick time (paused physics = frozen effects) and reset drops everything', () => {
    const fx = createBossTraitVfx()
    const c = court()
    fillEverything(fx, c, false)
    const live = () => [...fx.novas, ...fx.shards, ...fx.embers, ...fx.fades].filter(p => p.active).length
    expect(live()).toBeGreaterThan(0)
    const before = live()
    // No ticks = a paused physics loop: nothing ages, whatever the render `now`.
    const ctx = new RecCtx()
    for (let f = 0; f < 100; f++) renderBossTraitLayer(asCtx(ctx), fx, f * 1000, false)
    expect(live()).toBe(before)
    for (let t = 0; t < 600; t += 16) tickBossTraitVfx(fx, 16)
    expect(live()).toBe(0)
    fillEverything(fx, c, false)
    resetBossTraitVfx(fx)
    expect(live()).toBe(0)
    expect([...fx.freezeId]).toEqual([-1, -1, -1, -1])
  })

  it('ice shells: one bake per distinct victim radius, capped; carriers get none', () => {
    const fx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(fx, c.all, false)
    expect(__iceShellCount()).toBe(1) // both victims r 28
    const many = [c.carriers[0]!, ...Array.from({ length: 20 }, (_, i) => blade(10 + i, 'player', undefined, 0, 0, 20 + i))]
    prepareBossTraitVfx(fx, many, false)
    expect(__iceShellCount()).toBe(ICE_SHELL_CACHE_SIZE)
    // A radius outside the cache still gets a (scaled) sprite, 1 primitive.
    const ctx = new RecCtx()
    renderIceShell(asCtx(ctx), fx, blade(99, 'player', undefined, 0, 0, 80), 0, false)
    expect(ctx.counts.drawImage).toBe(1)
  })
})

// ─── Zero allocation ───────────────────────────────────────────────────────

describe('boss trait vfx — zero per-frame allocation', () => {
  it('pool objects keep their identity and colours are constants over 2,000 frames', () => {
    const fx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(fx, c.all, false)
    const refs = [...fx.novas, ...fx.shards, ...fx.embers, ...fx.fades]
    const arrays = [fx.novas, fx.shards, fx.embers, fx.fades, fx.freezeId, fx.freezeAt]
    const ctx = new RecCtx()
    const seen = new Set<string>()
    for (let f = 0; f < 2000; f++) {
      if (f % 25 === 0) fillEverything(fx, c, f % 50 === 0)
      tickBossTraitVfx(fx, 16)
      renderFrame(ctx, fx, c, f * 16, f % 100 < 50)
      for (const s of ctx.styles) seen.add(s)
      ctx.styles.clear()
    }
    expect([fx.novas, fx.shards, fx.embers, fx.fades, fx.freezeId, fx.freezeAt]).toEqual(arrays)
    ;[...fx.novas, ...fx.shards, ...fx.embers, ...fx.fades].forEach((p, i) => expect(p).toBe(refs[i]))
    for (const s of seen) expect(s).toMatch(/^#[0-9a-f]{6}$/)
    expect(seen.size).toBeLessThanOrEqual(10)
    expect(ctx.usedShadow).toBe(false)
    expect(ctx.usedFilter).toBe(false)
    expect(ctx.depth).toBe(0)
  })

  it('the source has no allocation / forbidden constructs inside the hot tick + render paths', () => {
    const src = readFileSync(join(__dirname, '../src/use/bosses/bossTraitVfx.ts'), 'utf8')
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const tick = strip(src.slice(src.indexOf('// ─── Tick + events'), src.indexOf('// ─── Colours')))
    const hot = strip(src.slice(src.indexOf('// ─── Call site 2'), src.indexOf('// ─── Popup glyphs')))
    for (const part of [tick, hot]) {
      expect(part).not.toMatch(/`/)
      expect(part).not.toMatch(/\bnew\s+[A-Z]/)
      expect(part).not.toMatch(/\.(map|filter|find|forEach|reduce|slice|concat|push)\(/)
      expect(part).not.toMatch(/for\s*\(\s*const\s+\w+\s+of/)
      expect(part).not.toMatch(/(=|\(|,|return)\s*(\[\s*\]|\{\s*\})/) // no literal arrays / objects
      expect(part).not.toMatch(/shadowBlur|\.filter\s*=|createLinearGradient|createRadialGradient|createPattern/)
    }
  })
})

// ─── Quality tiers + budget ────────────────────────────────────────────────

describe('boss trait vfx — FX.low fallback set and primitive budget', () => {
  it('worst frame of the Elemental Court (high) ≤ BOSS_TRAIT_MAX_PRIMITIVES; per call ≤ its budget', () => {
    const fx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(fx, c.all, false)
    for (const v of c.victims) bossTraitVfxEvent(fx, ev('freeze', v, 1, -1000), false)
    fillEverything(fx, c, false)
    tickBossTraitVfx(fx, 16)
    const ctx = new RecCtx()
    renderFrame(ctx, fx, c, 0, false)
    expect(ctx.primitives()).toBeLessThanOrEqual(BOSS_TRAIT_MAX_PRIMITIVES)
    expect(ctx.counts.drawImage).toBe(2) // 2 ice shells (the carrier auras are flat dashed rings now)
    const per = (fn: (x: CanvasRenderingContext2D) => void) => {
      const r = new RecCtx()
      fn(asCtx(r))
      return r.primitives()
    }
    expect(per(x => renderBossAura(x, fx, c.carriers[0]!, 0, false))).toBe(AURA_MAX_PRIMITIVES)
    expect(per(x => renderEmberCharge(x, fx, c.carriers[0]!, 0.99, 2000, 99, 0, false))).toBe(CHARGE_MAX_PRIMITIVES)
    expect(per(x => renderIceShell(x, fx, c.victims[0]!, 0, false))).toBe(SHELL_MAX_PRIMITIVES)
    expect(per(x => renderChillOverlay(x, fx, c.victims[0]!, 5, 0, false))).toBe(CHILL_MAX_PRIMITIVES)
    expect(per(x => renderBossTraitLayer(x, fx, 0, false))).toBeLessThanOrEqual(BOSS_LAYER_MAX_PRIMITIVES)
    expect(ctx.counts.save).toBe(ctx.counts.restore)
  })

  it('FX.low events spawn no shards, embers or fade rims (novas and the freeze mark only)', () => {
    const fx = createBossTraitVfx()
    fillEverything(fx, court(), true)
    expect(fx.shards.some(s => s.active)).toBe(false)
    expect(fx.embers.some(e => e.active)).toBe(false)
    expect(fx.fades.some(f => f.active)).toBe(false)
    expect(fx.novas.filter(n => n.active).length).toBe(3)
  })

  it('FX.low render draws only the fallback set: no sprites, hexagon shells, 1 stroke per nova', () => {
    const fx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(fx, c.all, true)
    fillEverything(fx, c, true)
    const ctx = new RecCtx()
    renderFrame(ctx, fx, c, 0, true)
    expect(ctx.counts.drawImage ?? 0).toBe(0)
    expect(ctx.counts.fill ?? 0).toBe(0)
    // charge 2 + 2 hexagon shells + 2 rims + 3 novas
    expect(ctx.primitives()).toBe(2 + 2 + 2 + BOSS_LAYER_MAX_PRIMITIVES_LOW)
    const layer = new RecCtx()
    renderBossTraitLayer(asCtx(layer), fx, 0, true)
    expect(layer.primitives()).toBeLessThanOrEqual(BOSS_LAYER_MAX_PRIMITIVES_LOW)
  })

  it('high adds sprites + transients on top of the low set', () => {
    const lowFx = createBossTraitVfx()
    const highFx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(lowFx, c.all, true)
    prepareBossTraitVfx(highFx, c.all, false)
    fillEverything(lowFx, c, true)
    fillEverything(highFx, c, false)
    const lo = new RecCtx()
    const hi = new RecCtx()
    renderFrame(lo, lowFx, c, 0, true)
    renderFrame(hi, highFx, c, 0, false)
    expect(hi.primitives()).toBeGreaterThan(lo.primitives())
  })

  it('an idle layer touches the context not at all; charge 0 draws nothing', () => {
    const fx = createBossTraitVfx()
    const ctx = new RecCtx()
    renderBossTraitLayer(asCtx(ctx), fx, 0, false)
    renderEmberCharge(asCtx(ctx), fx, court().carriers[0]!, 0, 2000, 99, 0, false)
    expect(Object.keys(ctx.counts).length).toBe(0)
  })

  it('charge telegraph thickens in the last 300 ms of the period; no aura before prepare', () => {
    const fx = createBossTraitVfx()
    const car = court().carriers[0]!
    const widths: number[] = []
    const ctx = new RecCtx()
    const orig = ctx.stroke.bind(ctx)
    ctx.stroke = () => {
      widths.push(ctx.lineWidth)
      orig()
    }
    renderEmberCharge(asCtx(ctx), fx, car, 0.5, 2000, 99, 0, false)
    renderEmberCharge(asCtx(ctx), fx, car, 1 - 250 / 2000, 2000, 99, 0, false)
    expect(widths.at(-1)).toBeGreaterThan(widths[widths.length - 3]!)
    const a = new RecCtx()
    renderBossAura(asCtx(a), fx, car, 0, false)
    expect(a.primitives()).toBe(0)
  })

  it('without any canvas (no OffscreenCanvas / document canvas) the shell falls back to the hexagon', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const fx = createBossTraitVfx()
    const c = court()
    prepareBossTraitVfx(fx, c.all, false)
    const ctx = new RecCtx()
    renderIceShell(asCtx(ctx), fx, c.victims[0]!, 0, false)
    renderBossAura(asCtx(ctx), fx, c.carriers[0]!, 0, false)
    expect(ctx.counts.drawImage ?? 0).toBe(0)
    expect(ctx.counts.stroke).toBe(2) // hexagon shell + the flat carrier ring (needs no canvas)
  })
})

// ─── SFX ───────────────────────────────────────────────────────────────────

describe('boss trait sfx — throttle, cap, event mapping', () => {
  it('one play per SFX name per 400 ms; names are independent', () => {
    const handle = () => new EventTarget() as unknown as HTMLAudioElement
    silentPlayer.mockImplementation(handle as never)
    expect(playBossSfx('boss-crack', 0.02, 1000)).toBe(true)
    expect(playBossSfx('boss-crack', 0.02, 1000 + BOSS_SFX_THROTTLE_MS - 1)).toBe(false)
    expect(playBossSfx('boss-chill', 0.02, 1100)).toBe(true)
    expect(playBossSfx('boss-crack', 0.02, 1000 + BOSS_SFX_THROTTLE_MS)).toBe(true)
    expect(silentPlayer).toHaveBeenCalledTimes(3)
  })

  it('a refused-freeze storm (crack every contact) is one crack per 400 ms', () => {
    let now = 50_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const fx = createBossTraitVfx()
    const v = court().victims[0]!
    for (let ms = 0; ms < 2000; ms += 16) {
      now = 50_000 + ms
      bossTraitVfxEvent(fx, ev('freeze_crack', v), false)
    }
    const cracks = silentPlayer.mock.calls.filter(c => (c as unknown[])[0] === 'boss-crack').length
    expect(cracks).toBeGreaterThanOrEqual(4)
    expect(cracks).toBeLessThanOrEqual(Math.ceil(2000 / BOSS_SFX_THROTTLE_MS))
  })

  it('each event kind plays its sound (touch, burn and chill-fade stay silent)', () => {
    const played: string[] = []
    __setBossSfxPlayer((n: string) => {
      played.push(n)
      return null
    })
    const fx = createBossTraitVfx()
    const v = court().victims[0]!
    const map: [BossTraitEventKind, string | null][] = [
      ['nova', 'boss-ember-pulse'], ['burn', null], ['frost_touch', null], ['freeze', 'boss-freeze'],
      ['freeze_crack', 'boss-crack'], ['chill', 'boss-chill'], ['chill_fade', null]
    ]
    for (const [k, name] of map) {
      __resetBossSfx()
      played.length = 0
      bossTraitVfxEvent(fx, ev(k, v), true) // audio is identical on both tiers
      expect(played).toEqual(name ? [name] : [])
    }
    __resetBossSfx()
    played.length = 0
    bossTraitVfxEvent(fx, ev('thaw', v, 0), false)
    expect(played).toEqual(['boss-crack'])
  })

  it('overlap cap: at most BOSS_SFX_MAX_ACTIVE sounds until one ends', () => {
    const handles: EventTarget[] = []
    __setBossSfxPlayer(() => {
      const h = new EventTarget()
      handles.push(h)
      return h as unknown as HTMLAudioElement
    })
    const names = ['boss-ember-pulse', 'boss-freeze', 'boss-crack', 'boss-chill'] as const
    let started = 0
    for (const n of names) if (playBossSfx(n, 0.02, 5000)) started++
    expect(started).toBe(BOSS_SFX_MAX_ACTIVE)
    handles[0]!.dispatchEvent(new Event('ended'))
    expect(playBossSfx('boss-chill', 0.02, 5000)).toBe(true)
  })

  it('a throwing player never escapes into the physics tick', () => {
    __setBossSfxPlayer(() => {
      throw new Error('audio died')
    })
    const fx = createBossTraitVfx()
    expect(() => bossTraitVfxEvent(fx, ev('nova', court().carriers[0]!), false)).not.toThrow()
  })
})

// ─── Lazy loading + files ──────────────────────────────────────────────────

describe('boss trait sfx — lazy load + files', () => {
  it('nothing is requested until a trait match is prepared; the set is requested once', () => {
    const load = vi.fn()
    __setBossSfxLoader(load)
    const fx = createBossTraitVfx()
    // Events / renders alone never load anything.
    bossTraitVfxEvent(fx, ev('nova', court().carriers[0]!), false)
    renderBossTraitLayer(asCtx(new RecCtx()), fx, 0, false)
    expect(load).not.toHaveBeenCalled()
    expect(bossTraitSfxRequested()).toBe(false)
    prepareBossTraitVfx(fx, court().all, false)
    prepareBossTraitVfx(fx, court().all, false)
    requestBossTraitSfx()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(BOSS_TRAIT_SFX_ASSETS)
  })

  it('boss SFX are not in the ungated core SFX tier, and the engine calls prepare only for trait rosters', () => {
    const assets = readFileSync(join(__dirname, '../src/use/useAssets.ts'), 'utf8')
    const at = assets.indexOf('const SOUND_ASSETS = [')
    expect(assets.slice(at, assets.indexOf(']', at))).not.toMatch(/boss-/)
    const engine = readFileSync(join(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
    // Through the installed trait port (bosses gate), only for trait rosters.
    const i = engine.indexOf('bp[\'prepareBossTraitVfx\'](bossTraitFx')
    expect(i).toBeGreaterThan(0)
    expect(engine.slice(Math.max(0, i - 500), i)).toMatch(/if \(traitsActive\)/)
  })

  it('every boss SFX ships as Ogg Vorbis ≤ 12 KB', () => {
    expect(BOSS_TRAIT_SFX_ASSETS.length).toBe(4)
    for (const rel of BOSS_TRAIT_SFX_ASSETS) {
      const p = join(__dirname, '../public', rel)
      expect(statSync(p).size).toBeLessThanOrEqual(12000)
      const head = readFileSync(p).subarray(0, 64)
      expect(head.subarray(0, 4).toString()).toBe('OggS')
      expect(head.includes(Buffer.from('vorbis'))).toBe(true)
    }
  })
})

// ─── Popup glyph ───────────────────────────────────────────────────────────

describe('boss trait popup glyph (snowflake, §7.3)', () => {
  it('builds the snowflake Path2D once and draws it in 2 primitives', () => {
    let built = 0

    class FakePath2D {
      constructor() {
        built++
      }

      moveTo() {
      }

      lineTo() {
      }
    }

    vi.stubGlobal('Path2D', FakePath2D)
    const ctx = new RecCtx()
    const first = __snowflakePath()
    for (let i = 0; i < 100; i++) drawBossTraitGlyph(asCtx(ctx), 'snowflake', 10, 10, 12, '#aee6ff')
    expect(__snowflakePath()).toBe(first)
    expect(built).toBe(1)
    expect(ctx.counts.stroke).toBe(200)
    expect(ctx.strokedPaths.every(p => p === first)).toBe(true)
    expect(ctx.counts.save).toBe(ctx.counts.restore)
  })

  it('isBossTraitGlyph separates trait glyphs from skill ids', () => {
    expect(isBossTraitGlyph('snowflake')).toBe(true)
    expect(isBossTraitGlyph('phase_step')).toBe(false)
    expect(isBossTraitGlyph(undefined)).toBe(false)
  })
})
