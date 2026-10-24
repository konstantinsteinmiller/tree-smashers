/**
 * DEV-ONLY entry for `dev/meteor-shower.html`: one arena (backdrop, floor,
 * painted border, tree discs) with the meteor shower frozen at `t` ms, so both
 * variants can be screenshotted on every theme; `&bench=1` times the shower's
 * render cost over a cached arena (the PERF-LEDGER A/B). Never imported by the game.
 */
import { TERRAIN_SHAPES, traceArenaPath } from '@/use/arenaShapes'
import { createTower } from '@/use/arenaTerrain'
import { ARENA_THEME_IDS, THEME_LOOK, floorKeyFor, type ArenaTheme } from '@/use/arenaThemes'
import { drawPaintedFloor, floorArtRevision } from '@/use/arenaFloorArt'
import { borderArtRevision, drawPaintedBorder } from '@/use/arenaBorderArt'
import { backdropArtRevision, paintArenaBackdrop } from '@/use/arenaBackdrop'
import { createRingShower, drawRingGround, drawRingScreen, drawRingSky, ringShake, spawnRingShowerFx } from '@/use/ringShower'
import { createMeteorShower, drawMeteorGround, drawMeteorScreen, drawMeteorSky, meteorShake, spawnMeteorShowerFx } from '@/use/meteorShower'

const R = 200
const p = new URLSearchParams(location.search)
const themeP = p.get('theme') as ArenaTheme | null
const theme: ArenaTheme = themeP && ARENA_THEME_IDS.includes(themeP) ? themeP : 'meadow'
const id = Number(p.get('id') ?? 0)
const variant = p.get('variant') === 'strike' ? 'strike' : p.get('variant') === 'none' ? 'none' : 'ring'
const low = p.get('low') === '1'
const T = Number(p.get('t') ?? 520)
const bench = p.get('bench') === '1'
const bare = bench && p.get('bare') === '1'
const dpr = window.devicePixelRatio || 1
const W = innerWidth
const H = innerHeight
const canvas = document.createElement('canvas')
canvas.width = Math.round(W * dpr)
canvas.height = Math.round(H * dpr)
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d')!
const scale = Math.min(W, H * 0.62) / (2 * R + 24)
const cx = W / 2
const cy = H / 2
const shape = TERRAIN_SHAPES[id]!
const ring = createRingShower()
const strike = createMeteorShower()
const spawn = () => {
  if (variant === 'ring') spawnRingShowerFx(ring, 'intro', 1600, R, theme, low, false, 0)
  else if (variant === 'strike') spawnMeteorShowerFx(strike, 'intro', 1600, R, low, false, 0)
}
spawn()

const arena = document.createElement('canvas')
arena.width = canvas.width
arena.height = canvas.height
const drawArena = () => {
  const a = arena.getContext('2d')!
  a.setTransform(1, 0, 0, 1, 0, 0)
  paintArenaBackdrop(a, arena.width, arena.height, cx * dpr, cy * dpr, scale * dpr, theme, id, shape)
  a.setTransform(dpr * scale, 0, 0, dpr * scale, cx * dpr, cy * dpr)
  a.fillStyle = THEME_LOOK[theme].floor.base
  traceArenaPath(a, shape, R)
  a.fill()
  drawPaintedFloor(a, floorKeyFor(theme, id), shape, R, `${THEME_LOOK[theme].floor.rim}29`)
  const towers = (['player', 'npc'] as const).map(side => createTower(side, R, 28, 100, shape))
  drawPaintedBorder(a, theme, shape, R, towers, `${theme}:${id}`)
  for (const tw of towers) {
    a.fillStyle = tw.side === 'player' ? '#3f8fe0' : '#e0533f'
    a.strokeStyle = '#161a40'
    a.lineWidth = 3
    a.beginPath()
    a.arc(tw.x, tw.y, tw.radius, 0, Math.PI * 2)
    a.fill()
    a.stroke()
  }
}

const frame = (t: number) => {
  const k = variant === 'ring' ? ringShake(ring, t) : variant === 'strike' ? meteorShake(strike, t) : null
  const sx = k ? k.x : 0
  const sy = k ? k.y : 0
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (bare) ctx.clearRect(0, 0, canvas.width, canvas.height)
  else ctx.drawImage(arena, sx, sy)
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, cx * dpr + sx, cy * dpr + sy)
  const dev = scale * dpr
  if (variant === 'ring') { drawRingGround(ctx, ring, t); drawRingSky(ctx, ring, t, dev) } else if (variant === 'strike') { drawMeteorGround(ctx, strike, t); drawMeteorSky(ctx, strike, t, dev) }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (variant === 'ring') drawRingScreen(ctx, ring, t, W, H)
  else if (variant === 'strike') drawMeteorScreen(ctx, strike, t, W, H)
}

const w = window as unknown as Record<string, unknown>
const artKey = () => `${floorArtRevision()}:${borderArtRevision()}:${backdropArtRevision()}`
let seen = ''
let quiet = 0
const settle = () => {
  if (artKey() !== seen) { seen = artKey(); quiet = 0; drawArena(); frame(T) }
  if (++quiet > 60) { frame(T); w.__showerReady = true; if (!bench) return }
  if (quiet <= 60) requestAnimationFrame(settle)
  else runBench()
}
requestAnimationFrame(settle)

/** Bench: render the 2.56 s shower N times; ms per frame of the shower draw. */
const runBench = () => {
  const reps = Number(p.get('reps') ?? 3)
  const times: number[] = []
  const px = new Uint8ClampedArray(4)
  let rep = 0
  let t = 0
  let sum = 0
  let n = 0
  const step = () => {
    const t0 = performance.now()
    frame(t)
    px[0] = ctx.getImageData(0, 0, 1, 1).data[0]! // force the raster
    sum += performance.now() - t0
    n++
    t += 16
    if (t >= 2560) {
      times.push(sum / n)
      rep++
      t = 0; sum = 0; n = 0
      spawn()
      if (rep >= reps) { w.__bench = times; return }
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
