/**
 * DEV-ONLY entry for `dev/boss-vfx.html` — every boss-trait effect of
 * `bosses/bossTraitVfx.ts` on one canvas, frozen mid-animation (or looping
 * with ?anim=1), on the high or low tier (?q=low). ?engine=1 runs the REAL
 * engine on the Elemental Court instead (auto-play), for screenshots and the
 * perf A/B (?traits=0|1, ?bench=MS). Never imported by the game. Labels are a
 * debug overlay (English only, not user-facing).
 */
import type { BossTrait, SpinnerConfig } from '@/types/spinner'
import type { BossTraitVfx, BossTraitVfxBlade, BossTraitEvent, BossTraitEventKind } from '@/use/bosses/bossTraitVfx'

type VfxModule = typeof import('@/use/bosses/bossTraitVfx')

const params = new URLSearchParams(location.search)
const low = params.get('q') === 'low'
const anim = params.get('anim') === '1'
const engineMode = params.get('engine') === '1'

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const markReady = (key: string, value: unknown = true) => {
  ;(window as unknown as Record<string, unknown>)[key] = value
  document.title = document.title.replace(/( ✓)?$/, ' ✓')
}

// ─── Frozen / animated panels (module only) ────────────────────────────────

const W = canvas.width
const H = canvas.height
const COLS = 4
const PW = W / COLS
const PH = H / 2

interface Panel {
  title: string
  fx: BossTraitVfx
  blades: BossTraitVfxBlade[]
  /** Per-frame draws after the blades (charge arcs, shells, rims). */
  overlay: (now: number) => void
  spawn: () => void
  at: number
  popups?: boolean
}

let nextId = 1
const disc = (x: number, y: number, owner: 'player' | 'npc', trait?: BossTrait, radius?: number): BossTraitVfxBlade => ({
  id: nextId++, x, y, radius: radius ?? (owner === 'npc' ? 44.8 : 28), rotation: 0, hp: 100, owner,
  config: trait ? { bossTrait: trait } : {}
})

const event = (kind: BossTraitEventKind, b: BossTraitVfxBlade, value = 1, t = 0): BossTraitEvent => ({
  seq: 1, t, kind, trait: b.config.bossTrait ?? 'ember', bladeId: b.id, syncKey: b.id, owner: b.owner,
  x: b.x, y: b.y, radius: b.radius, value
})

const BODY: Record<BossTrait, string> = { ember: '#3b3640', frost: '#4a5a6e', chill: '#dfe9f2' }
const drawDisc = (b: BossTraitVfxBlade) => {
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fillStyle = b.config.bossTrait ? BODY[b.config.bossTrait] : b.owner === 'player' ? '#3b82f6' : '#ef4444'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2)
  ctx.fillStyle = b.config.bossTrait === 'ember' ? '#ff6a1a' : '#e2e8f0'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius - 2, 0, Math.PI * 2)
  ctx.lineWidth = 3
  ctx.strokeStyle = b.owner === 'player' ? '#22c55e' : '#f97316'
  ctx.stroke()
}

const buildPanels = (m: VfxModule): Panel[] => {
  nextId = 1
  const panels: Panel[] = []
  const add = (col: number, row: number, title: string, make: (ox: number, oy: number, p: Panel) => void) => {
    const p: Panel = {
      title, fx: m.createBossTraitVfx(), blades: [], overlay: () => {
      }, spawn: () => {
      }, at: 0
    }
    make(col * PW, row * PH, p)
    m.prepareBossTraitVfx(p.fx, p.blades, low)
    panels.push(p)
  }
  const reach = (c: BossTraitVfxBlade) => 2.2 * c.radius

  add(0, 0, 'Cinder — aura + charge arc (60 %)', (ox, oy, p) => {
    const c = disc(ox + 160, oy + 190, 'npc', 'ember')
    p.blades.push(c, disc(ox + 280, oy + 300, 'player'))
    p.overlay = now => m.renderEmberCharge(ctx, p.fx, c, 0.6, 2000, reach(c), now, low)
  })
  add(1, 0, 'Cinder — last 300 ms + nova burst', (ox, oy, p) => {
    const c = disc(ox + 160, oy + 190, 'npc', 'ember')
    p.blades.push(c)
    p.overlay = now => m.renderEmberCharge(ctx, p.fx, c, 0.93, 2000, reach(c), now, low)
    p.spawn = () => m.bossTraitVfxEvent(p.fx, event('nova', c, 1), low)
    p.at = 150
  })
  add(2, 0, 'Burn — embers off the victims', (ox, oy, p) => {
    const c = disc(ox + 110, oy + 150, 'npc', 'ember')
    const v1 = disc(ox + 220, oy + 130, 'player')
    const v2 = disc(ox + 200, oy + 250, 'player')
    p.blades.push(c, v1, v2)
    p.spawn = () => {
      m.bossTraitVfxEvent(p.fx, event('burn', v1, 12), low)
      m.bossTraitVfxEvent(p.fx, event('burn', v2, 12), low)
    }
    p.at = 200
    p.popups = true
  })
  add(3, 0, 'Warden — aura + frost-touch shards', (ox, oy, p) => {
    const w = disc(ox + 140, oy + 190, 'npc', 'frost')
    const v = disc(ox + 140 + 44.8 + 30, oy + 190, 'player')
    p.blades.push(w, v)
    p.spawn = () => m.bossTraitVfxEvent(p.fx, event('frost_touch', v, 0.1), low)
    p.at = 110
  })
  add(0, 1, 'Frozen — ice shell (set / forming)', (ox, oy, p) => {
    const a = disc(ox + 100, oy + 190, 'player')
    const b = disc(ox + 230, oy + 190, 'player')
    p.blades.push(a, b)
    p.spawn = () => {
      m.bossTraitVfxEvent(p.fx, event('freeze', a, 1, -1000), low)
      m.bossTraitVfxEvent(p.fx, event('freeze', b, 1, 0), low)
    }
    p.at = 70
    p.overlay = now => {
      m.renderIceShell(ctx, p.fx, a, now, low)
      m.renderIceShell(ctx, p.fx, b, now, low)
    }
  })
  add(1, 1, 'Freeze refused (crack) / thaw shatter', (ox, oy, p) => {
    const a = disc(ox + 100, oy + 190, 'player')
    const b = disc(ox + 230, oy + 190, 'player')
    p.blades.push(a, b)
    p.spawn = () => {
      m.bossTraitVfxEvent(p.fx, event('freeze_crack', a), low)
      m.bossTraitVfxEvent(p.fx, event('thaw', b, 0), low)
    }
    p.at = 110
  })
  add(2, 1, 'Yeti — aura + chill rim 1…5 stacks', (ox, oy, p) => {
    const y = disc(ox + 90, oy + 120, 'npc', 'chill')
    p.blades.push(y)
    const vs: BossTraitVfxBlade[] = []
    for (let s = 1; s <= 5; s++) {
      const v = disc(ox + 30 + s * 50, oy + 250, 'player', undefined, 18)
      vs.push(v)
      p.blades.push(v)
    }
    p.overlay = now => {
      for (let s = 0; s < vs.length; s++) m.renderChillOverlay(ctx, p.fx, vs[s]!, s + 1, now, low)
    }
    p.spawn = () => m.bossTraitVfxEvent(p.fx, event('chill', vs[4]!, 5), low)
    p.at = 90
  })
  add(3, 1, 'Chill fade + snowflake popups', (ox, oy, p) => {
    const a = disc(ox + 110, oy + 150, 'player')
    const b = disc(ox + 230, oy + 150, 'player')
    p.blades.push(a, b)
    p.overlay = now => m.renderChillOverlay(ctx, p.fx, b, 2, now, low)
    p.spawn = () => m.bossTraitVfxEvent(p.fx, event('chill_fade', a, 0), low)
    p.at = 140
    p.popups = true
  })
  return panels
}

const drawBackground = () => {
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath()
    ctx.moveTo(c * PW, 0)
    ctx.lineTo(c * PW, H)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, PH)
  ctx.lineTo(W, PH)
  ctx.stroke()
}

const drawPanel = (m: VfxModule, p: Panel, i: number, now: number) => {
  const ox = (i % COLS) * PW
  const oy = Math.floor(i / COLS) * PH
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, PW, PH)
  ctx.clip()
  for (const b of p.blades) if (b.config.bossTrait) m.renderBossAura(ctx, p.fx, b, now, low)
  for (const b of p.blades) drawDisc(b)
  p.overlay(now)
  m.renderBossTraitLayer(ctx, p.fx, now, low)
  if (p.popups) {
    // Stand-ins for the engine's damage-number popups (orange burn number,
    // snowflake glyph) — the glyph itself is the real drawBossTraitGlyph.
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (i === 2) {
      for (const b of p.blades.slice(1)) {
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3
        ctx.strokeText('12', b.x + 40, b.y - 30)
        ctx.fillStyle = '#ff9a3c'
        ctx.fillText('12', b.x + 40, b.y - 30)
      }
    } else {
      for (let g = 0; g < 4; g++) {
        const k = 0.8 + 0.2 * g
        ctx.globalAlpha = 1 - g * 0.2
        m.drawBossTraitGlyph(ctx, 'snowflake', ox + 60 + g * 70, oy + 270, 12 * k * 1.4, '#aee6ff')
      }
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(p.title, ox + 10, oy + 20)
  ctx.fillStyle = low ? '#fbbf24' : '#94a3b8'
  ctx.fillText(low ? 'FX.low' : 'high', ox + 10, oy + 38)
}

const frozen = (m: VfxModule) => {
  const panels = buildPanels(m)
  drawBackground()
  panels.forEach((p, i) => {
    p.spawn()
    for (let t = 0; t < p.at; t += 16) m.tickBossTraitVfx(p.fx, 16)
    drawPanel(m, p, i, p.at)
  })
  markReady('__bossVfxReady')
}

const loop = (m: VfxModule) => {
  const panels = buildPanels(m)
  let t = 0
  let last = performance.now()
  const frame = (ts: number) => {
    const dt = Math.min(50, ts - last)
    last = ts
    t += dt
    const cycle = t % 900
    drawBackground()
    panels.forEach((p, i) => {
      if (cycle < dt) {
        m.resetBossTraitVfx(p.fx)
        m.prepareBossTraitVfx(p.fx, p.blades, low)
        p.spawn()
      }
      m.tickBossTraitVfx(p.fx, dt)
      drawPanel(m, p, i, t)
    })
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// ─── Engine mode: the real renderer on the Elemental Court ─────────────────

const runEngine = async () => {
  const withTraits = params.get('traits') !== '0'
  const benchMs = Number(params.get('bench') ?? 0)
  const size = Math.min(window.innerWidth, window.innerHeight) || 720
  canvas.width = size
  canvas.height = size
  const { useSpinnerGame, installBossTraitEngine } = await import('@/use/useSpinnerGame')
  // The engine only runs traits through the port (bosses gate; dev has the flag on).
  installBossTraitEngine(await import('@/use/bosses/bossTraitEngine'))
  const { buildBossEncounterStage } = await import('@/data/bossEncounters')
  const stage = buildBossEncounterStage('elemental_court')
  const npc: SpinnerConfig[] = stage.enemyTeam.map(e => ({
    topPartId: e.topPartId, bottomPartId: e.bottomPartId, topLevel: e.topLevel, bottomLevel: e.bottomLevel,
    modelId: e.modelId, isBoss: e.isBoss, bossAbility: e.bossAbility,
    ...(withTraits ? { bossTrait: e.bossTrait, shardTrait: e.shardTrait } : {})
  }))
  const player: SpinnerConfig[] = [
    { topPartId: 'star', bottomPartId: 'speedy', topLevel: 30, bottomLevel: 30 },
    { topPartId: 'round', bottomPartId: 'tanky', topLevel: 30, bottomLevel: 30 }
  ]
  const e = useSpinnerGame()
  let seed = 7
  const start = () => {
    e.initGame(player, npc, false, stage.arenaType, 0, false, undefined, null, 'circle', false, { seed: seed++ })
    e.startPhysics()
    e.startMatch()
  }
  start()
  // Auto-play: launch the first pickable player blade toward the nearest boss.
  let nextShotAt = 0
  const autoplay = (ts: number) => {
    const ph = e.phase.value
    if (ph === 'game_over') {
      start()
      return
    }
    if (ph !== 'player_turn' || ts < nextShotAt) return
    const mine = e.playerBlades.value.filter(b => b.hp > 0 && e.isBladePickable(b))
    const foes = e.npcBlades.value.filter(b => b.hp > 0)
    if (mine.length === 0 || foes.length === 0) return
    const b = mine[Math.floor(Math.random() * mine.length)]!
    const f = foes[Math.floor(Math.random() * foes.length)]!
    const dx = f.x - b.x
    const dy = f.y - b.y
    const d = Math.hypot(dx, dy) || 1
    e.selectedBladeId.value = null
    e.beginDrag(b.x, b.y)
    e.updateDrag(b.x - (dx / d) * 70, b.y - (dy / d) * 70)
    e.releaseDrag()
    nextShotAt = ts + 400
  }
  const deltas: number[] = []
  let benchStart = -1
  let last = performance.now()
  const t0 = last
  const frame = (ts: number) => {
    const dt = ts - last
    last = ts
    autoplay(ts)
    e.render(ctx, canvas.width, canvas.height)
    if (benchMs > 0) {
      if (benchStart < 0 && ts - t0 > 6000) benchStart = ts
      else if (benchStart >= 0) {
        deltas.push(dt)
        if (ts - benchStart >= benchMs) {
          const s = [...deltas].sort((a, b) => a - b)
          const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]!
          const over33 = deltas.filter(d => d > 33.4).length / deltas.length
          markReady('__bossVfxBench', {
            traits: withTraits, frames: deltas.length, deltaP50: q(0.5), deltaP95: q(0.95),
            fps: (deltas.length / (ts - benchStart)) * 1000, over33, novas: e.bossTraitEventSeq()
          })
          return
        }
      }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  ;(window as unknown as Record<string, unknown>).__bossEngine = e
  if (benchMs <= 0) markReady('__bossVfxReady')
}

const boot = async () => {
  await import('@/use/useUser') // import-cycle order, as in the game
  const sfx = await import('@/use/bosses/bossTraitSfx')
  sfx.__setBossSfxPlayer(() => null) // silent preview
  sfx.__setBossSfxLoader(() => {
  })
  if (engineMode) return runEngine()
  const m = await import('@/use/bosses/bossTraitVfx')
  if (anim) loop(m)
  else frozen(m)
}

void boot()
