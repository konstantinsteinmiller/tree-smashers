/**
 * DEV-ONLY entry for `dev/skills-vfx.html` — every skill effect of
 * `skills/skillVfx.ts` on one canvas, frozen mid-animation (or looping with
 * ?anim=1), on the high or low tier (?q=low). ?bench=1 measures frame delta
 * and layer cost for the worst case vs no skill FX. Never imported by the
 * game. Labels are a debug overlay (English only, not user-facing).
 */
import type { SkillId } from '@/types/skills'
import type {
  SkillVfx, SkillVfxBlade, SkillRocketView, SkillEvent, SkillEventKind
} from '@/use/skills/skillVfx'

type VfxModule = typeof import('@/use/skills/skillVfx')

const params = new URLSearchParams(location.search)
const low = params.get('q') === 'low'
const anim = params.get('anim') === '1'
const bench = params.get('bench') === '1'

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const W = canvas.width
const H = canvas.height
const COLS = 4
const PW = W / COLS
const PH = H / 2

interface Panel {
  title: string
  fx: SkillVfx
  blades: SkillVfxBlade[]
  rockets: SkillRocketView[]
  stunned: Set<number>
  /** Spawn the panel's events (time 0). */
  spawn: () => void
  /** Frozen-frame time (ms after the events). */
  at: number
  glyphs?: boolean
}

let nextId = 1
const disc = (x: number, y: number, owner: 'player' | 'npc', shield = 0): SkillVfxBlade => ({
  id: nextId++, x, y, radius: 30, hp: 100, owner,
  skills: { has: 0, shield, shieldMax: 50, phasedUntil: -Infinity }
})

const event = (kind: SkillEventKind, b: SkillVfxBlade, value = 1, skill: SkillId = 'guard_shell'): SkillEvent => ({
  seq: 1, t: 0, kind, skill, bladeId: b.id, syncKey: b.id, owner: b.owner, x: b.x, y: b.y, value, key: ''
})

const idleRocket = (): SkillRocketView => ({
  active: false, owner: 'player', x0: 0, y0: 0, target: null, startAt: 0, arriveAt: 0
})

const drawDisc = (m: VfxModule, b: SkillVfxBlade, now: number) => {
  const a = m.skillBladeAlpha(b, now, low)
  ctx.save()
  ctx.globalAlpha = a
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fillStyle = b.owner === 'player' ? '#3b82f6' : '#ef4444'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2)
  ctx.fillStyle = '#e2e8f0'
  ctx.fill()
  // HP ring stand-in (the engine draws the real one before the skill FX).
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius - 2, 0, Math.PI * 2)
  ctx.lineWidth = 3
  ctx.strokeStyle = b.owner === 'player' ? '#22c55e' : '#f97316'
  ctx.stroke()
  if (b.skills) m.renderBladeSkillFx(ctx, panelsFx(b), b, now, low)
  ctx.restore()
}

let fxOf = new Map<number, SkillVfx>()
const panelsFx = (b: SkillVfxBlade): SkillVfx => fxOf.get(b.id)!

const buildPanels = (m: VfxModule): Panel[] => {
  nextId = 1
  fxOf = new Map()
  const panels: Panel[] = []
  const add = (col: number, row: number, title: string, make: (ox: number, oy: number, p: Panel) => void) => {
    const p: Panel = {
      title, fx: m.createSkillVfx(), blades: [], rockets: Array.from({ length: 6 }, idleRocket),
      stunned: new Set(), spawn: () => {
      }, at: 0
    }
    make(col * PW, row * PH, p)
    for (const b of p.blades) fxOf.set(b.id, p.fx)
    panels.push(p)
  }

  add(0, 0, 'Guard Shell — arc 60 % + break shards', (ox, oy, p) => {
    const a = disc(ox + 110, oy + 190, 'player', 30)
    const b = disc(ox + 220, oy + 190, 'player', 0)
    p.blades.push(a, b)
    p.spawn = () => m.skillVfxEvent(p.fx, event('shield_break', b), low)
    p.at = 110
  })
  add(1, 0, 'Phase Step — flicker + ghost', (ox, oy, p) => {
    const a = disc(ox + 170, oy + 190, 'player')
    a.skills!.phasedUntil = 300
    p.blades.push(a, disc(ox + 90, oy + 120, 'npc'))
    p.spawn = () => {
      m.skillVfxEvent(p.fx, event('phase', { ...a, x: a.x - 14 }), low)
    }
    p.at = 90
  })
  add(2, 0, 'Mirror Plate — reflect flash', (ox, oy, p) => {
    const a = disc(ox + 160, oy + 190, 'player')
    p.blades.push(a, disc(ox + 240, oy + 150, 'npc'))
    p.spawn = () => m.skillVfxEvent(p.fx, event('mirror', a, 12, 'mirror_plate'), low)
    p.at = 70
  })
  add(3, 0, 'Momentum — 3 stacks glow', (ox, oy, p) => {
    const a = disc(ox + 160, oy + 190, 'player')
    p.blades.push(a)
    p.spawn = () => m.skillVfxEvent(p.fx, event('momentum', a, 3, 'momentum'), low)
    p.at = 90
  })
  add(0, 1, 'Second Wind — burst ring', (ox, oy, p) => {
    const a = disc(ox + 160, oy + 190, 'player')
    p.blades.push(a)
    p.spawn = () => m.skillVfxEvent(p.fx, event('heal', a, 30, 'second_wind'), low)
    p.at = 120
  })
  add(1, 1, 'Static Charge — stun glyphs', (ox, oy, p) => {
    const a = disc(ox + 100, oy + 200, 'npc')
    const b = disc(ox + 220, oy + 200, 'npc')
    p.blades.push(a, b, disc(ox + 160, oy + 110, 'player'))
    p.stunned.add(a.id).add(b.id)
  })
  add(2, 1, 'Homing Rockets — volley + impacts', (ox, oy, p) => {
    const bearer = disc(ox + 70, oy + 260, 'player')
    const t1 = disc(ox + 240, oy + 120, 'npc')
    const t2 = disc(ox + 250, oy + 250, 'npc')
    p.blades.push(bearer, t1, t2)
    const targets = [t1, t2, t1]
    for (let i = 0; i < 3; i++) {
      const r = p.rockets[i]!
      r.active = true
      r.owner = 'player'
      r.x0 = bearer.x
      r.y0 = bearer.y
      r.target = targets[i]!
      r.startAt = -140 - i * 90
      r.arriveAt = 260
    }
    p.spawn = () => m.skillVfxEvent(p.fx, event('rocket_hit', t2, 8, 'homing_rockets'), low)
    p.at = 60
  })
  add(3, 1, 'Opening Salvo impacts + popup glyphs', (ox, oy, p) => {
    const e1 = disc(ox + 90, oy + 110, 'npc')
    const e2 = disc(ox + 230, oy + 110, 'npc')
    p.blades.push(e1, e2)
    p.spawn = () => {
      m.skillVfxEvent(p.fx, event('salvo', e1, 20, 'opening_salvo'), low)
      m.skillVfxEvent(p.fx, event('salvo', e2, 20, 'opening_salvo'), low)
    }
    p.at = 140
    p.glyphs = true
  })
  return panels
}

const GLYPH_ROW: [SkillId, string][] = [
  ['phase_step', '#67e8f9'], ['guard_shell', '#67e8f9'], ['second_wind', '#44cc66'],
  ['lucky_edge', '#ff8800'], ['homing_rockets', '#fb923c'], ['opening_salvo', '#f87171'],
  ['momentum', '#66aaff'], ['hazard_ward', '#a3e635'], ['static_charge', '#facc15'],
  ['mirror_plate', '#60a5fa']
]

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
  for (const b of p.blades) drawDisc(m, b, now)
  m.renderSkillLayer(ctx, p.fx, p.rockets, p.blades, b => p.stunned.has(b.id), now, low)
  if (p.glyphs) {
    ctx.save()
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let g = 0; g < GLYPH_ROW.length; g++) {
      const [id, color] = GLYPH_ROW[g]!
      const x = ox + 40 + (g % 5) * 60
      const y = oy + 220 + Math.floor(g / 5) * 44
      m.drawSkillGlyph(ctx, id, x, y, 18, color)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 4
      ctx.strokeText('12', x + 12, y)
      ctx.fillStyle = color
      ctx.fillText('12', x + 12, y)
    }
    ctx.restore()
  }
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(p.title, ox + 10, oy + 20)
  ctx.fillStyle = low ? '#fbbf24' : '#94a3b8'
  ctx.fillText(low ? 'FX.low' : 'high', ox + 10, oy + 38)
}

const frozen = (m: VfxModule) => {
  const panels = buildPanels(m)
  drawBackground()
  panels.forEach((p, i) => {
    p.spawn()
    for (let t = 0; t < p.at; t += 16) m.tickSkillVfx(p.fx, 16)
    drawPanel(m, p, i, p.at)
  })
  document.title = document.title.replace(/( ✓)?$/, ' ✓')
  ;(window as unknown as { __skillVfxReady?: boolean }).__skillVfxReady = true
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
        m.resetSkillVfx(p.fx)
        for (const b of p.blades) if (b.skills) b.skills.phasedUntil = t + 300
        p.spawn()
      }
      m.tickSkillVfx(p.fx, dt)
      for (const r of p.rockets) {
        if (!r.active) continue
        if (t > r.arriveAt + 200) {
          r.startAt = t
          r.arriveAt = t + 400
        }
      }
      drawPanel(m, p, i, t)
    })
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// ─── Bench: frame delta + layer cost, worst case vs no skill FX ────────────
// A busy stand-in arena (40 discs + HP rings) is the baseline; the "worst"
// run adds the whole §8.3 worst case on top, re-spawned so it never expires.
const runBench = async (m: VfxModule) => {
  const blades: SkillVfxBlade[] = []
  for (let i = 0; i < 40; i++) {
    blades.push(disc(60 + (i % 10) * 120, 80 + Math.floor(i / 10) * 160, i % 2 ? 'npc' : 'player', i < 6 ? 30 : 0))
  }
  const fx = m.createSkillVfx()
  for (const b of blades) fxOf.set(b.id, fx)
  const rockets: SkillRocketView[] = Array.from({ length: 6 }, (_, i) => ({
    active: true, owner: i % 2 ? 'npc' : 'player', x0: 100, y0: 600,
    target: blades[10 + i]!, startAt: 0, arriveAt: 1e12
  }))
  const stunned = (b: SkillVfxBlade) => b.owner === 'npc' && b.id % 10 < 8 && b.id < 10
  const respawn = () => {
    const a = blades[0]!
    const c = blades[2]!
    m.skillVfxEvent(fx, event('heal', a, 5), low)
    m.skillVfxEvent(fx, event('mirror', c, 5), low)
    m.skillVfxEvent(fx, event('shield_break', a), low)
    m.skillVfxEvent(fx, event('shield_break', blades[1]!), low)
    for (let i = 0; i < 6; i++) m.skillVfxEvent(fx, event(i % 2 ? 'rocket_hit' : 'salvo', blades[4 + i]!, 5), low)
  }
  const run = (withFx: boolean, frames: number) => new Promise<{
    p50: number;
    p95: number;
    workP50: number;
    layerUs: number
  }>(resolve => {
    const deltas: number[] = []
    const work: number[] = []
    let layerTotal = 0
    let n = 0
    let last = performance.now()
    let t = 0
    const frame = (ts: number) => {
      deltas.push(ts - last)
      last = ts
      t += 16
      const w0 = performance.now()
      drawBackground()
      for (const b of blades) drawDisc(m, b, t)
      if (withFx) {
        if (n % 20 === 0) respawn()
        m.tickSkillVfx(fx, 16)
        const l0 = performance.now()
        m.renderSkillLayer(ctx, fx, rockets, blades, stunned, t, low)
        layerTotal += performance.now() - l0
      }
      work.push(performance.now() - w0)
      if (++n < frames) requestAnimationFrame(frame)
      else {
        const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]!
        const d = deltas.slice(10)
        resolve({ p50: q(d, 0.5), p95: q(d, 0.95), workP50: q(work, 0.5), layerUs: (layerTotal / frames) * 1000 })
      }
    }
    requestAnimationFrame(frame)
  })
  // A/B/A/B so drift hits both arms equally.
  const res: Record<string, unknown>[] = []
  for (let k = 0; k < 2; k++) {
    fxOf.clear()
    for (const b of blades) fxOf.set(b.id, fx)
    const base = await run(false, 300)
    const worst = await run(true, 300)
    res.push({ base, worst })
  }
  ;(window as unknown as { __skillVfxBench?: unknown }).__skillVfxBench = { low, runs: res }
  document.title = document.title.replace(/( ✓)?$/, ' ✓')
}

const boot = async () => {
  await import('@/use/useUser') // import-cycle order, as in the game
  const sfx = await import('@/use/skills/skillSfx')
  sfx.__setSkillSfxPlayer(() => null) // silent preview
  const m = await import('@/use/skills/skillVfx')
  if (bench) await runBench(m)
  else if (anim) loop(m)
  else frozen(m)
}

void boot()
