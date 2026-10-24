// "Watte" death burst: a plush smasher falls apart and its cotton stuffing billows out,
// drifts, then sinks and fades. Pure visual — own tiny PRNG (seeded by position), never the
// game RNG, so PvP / league determinism is untouched.

interface Puff {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  grow: number
  spin: number
  hue: number
  /** 0 = round puff, 1 = stitched thread scrap */
  kind: 0 | 1
}

export interface StuffingBurst {
  puffs: Puff[]
  age: number
}

const LIFE_MS = 1100
const MAX_BURSTS = 8

const lcg = (seed: number) => {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** `low` halves the particle count for the low render tier. */
export const spawnStuffing = (list: StuffingBurst[], x: number, y: number, radius: number, low = false): void => {
  if (list.length >= MAX_BURSTS) list.shift()
  const rnd = lcg(Math.floor(x * 31 + y * 17 + radius * 101))
  const n = low ? 9 : 18
  const puffs: Puff[] = []
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2
    const sp = radius * (0.5 + rnd() * 1.6)
    const thread = i % 6 === 5
    puffs.push({
      x: x + Math.cos(a) * radius * 0.2,
      y: y + Math.sin(a) * radius * 0.2,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - radius * 0.4,
      r: thread ? radius * 0.18 : radius * (0.24 + rnd() * 0.3),
      grow: 1.2 + rnd() * 0.9,
      spin: (rnd() - 0.5) * 6,
      hue: rnd(),
      kind: thread ? 1 : 0
    })
  }
  list.push({ puffs, age: 0 })
}

/** Advance by `dtMs`; finished bursts are removed. */
export const updateStuffing = (list: StuffingBurst[], dtMs: number): void => {
  const dt = dtMs / 1000
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!
    b.age += dtMs
    if (b.age >= LIFE_MS) {
      list.splice(i, 1)
      continue
    }
    const drag = Math.pow(0.04, dt) // cotton is draggy: it billows out, then hangs in the air
    for (const p of b.puffs) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= drag
      p.vy = p.vy * drag + 38 * dt // slow sink
    }
  }
}

export const drawStuffing = (ctx: CanvasRenderingContext2D, list: StuffingBurst[]): void => {
  if (list.length === 0) return
  ctx.save()
  for (const b of list) {
    const t = b.age / LIFE_MS
    const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45
    const swell = 1 - Math.pow(1 - Math.min(1, t * 2.2), 2)
    for (const p of b.puffs) {
      ctx.globalAlpha = Math.max(0, fade) * 0.95
      if (p.kind === 1) {
        // a loose stitched thread scrap
        ctx.strokeStyle = p.hue > 0.5 ? '#e8b4a0' : '#d9c7a3'
        ctx.lineWidth = Math.max(1, p.r * 0.35)
        ctx.lineCap = 'round'
        ctx.beginPath()
        const a = p.spin * b.age * 0.002
        ctx.moveTo(p.x - Math.cos(a) * p.r * 1.6, p.y - Math.sin(a) * p.r * 1.6)
        ctx.lineTo(p.x + Math.cos(a) * p.r * 1.6, p.y + Math.sin(a) * p.r * 1.6)
        ctx.stroke()
        continue
      }
      const r = p.r * (0.5 + 0.5 * swell) * p.grow
      const g = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.65, p.hue > 0.5 ? '#fbf3e4' : '#f4ead6')
      g.addColorStop(1, 'rgba(226,212,184,0)')
      ctx.fillStyle = g
      // lumpy cotton ball: three overlapping soft discs
      for (let k = 0; k < 3; k++) {
        const ka = p.spin * 0.3 + (k * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(p.x + Math.cos(ka) * r * 0.32, p.y + Math.sin(ka) * r * 0.32, r * 0.72, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()
}
