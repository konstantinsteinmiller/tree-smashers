/**
 * DEV-ONLY entry for `dev/skill-icons.html` — the smasher skill art sheet.
 * Labels are a debug overlay (English ids, not user-facing). Never imported
 * by the game.
 */
import { SMASHER_LIST } from '@/data/smasherCatalog'
import {
  FLAVOUR_SHAPES, INK, SMASHER_SKILL_ART, drawSmasherSkillIcon, flavourPath, type FlavourShapeId
} from '@/use/skills/smasherSkillArt'
import { createSkillCallouts, pushSkillCallout, renderSkillCallouts } from '@/use/skills/skillCallouts'

const key = new URLSearchParams(location.search).get('key') === '1'
const CELL = 120
const ICON = 88
const COLS = 6
const canvas = document.getElementById('c') as HTMLCanvasElement
const dpr = Math.max(1, window.devicePixelRatio || 1)
const W = COLS * CELL
const H = 6 * CELL + 3 * CELL + 120
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
canvas.width = W * dpr
canvas.height = H * dpr
const ctx = canvas.getContext('2d')!
ctx.scale(dpr, dpr)
ctx.fillStyle = key ? '#ff00ff' : '#173f20'
ctx.fillRect(0, 0, W, H)

const skills = SMASHER_LIST.flatMap(s => s.skills)
skills.forEach((sk, i) => {
  const cx = (i % COLS) * CELL + CELL / 2
  const cy = Math.floor(i / COLS) * CELL + CELL / 2 - 8
  drawSmasherSkillIcon(ctx, sk.id, sk.effect, cx, cy, ICON)
  if (!key) {
    ctx.fillStyle = '#eef5ff'
    ctx.textAlign = 'center'
    ctx.fillText(sk.id, cx, cy + ICON / 2 + 14)
  }
})

const shapes = Object.keys(FLAVOUR_SHAPES) as FlavourShapeId[]
const firstColor = (shape: FlavourShapeId): [string, string] => {
  for (const a of Object.values(SMASHER_SKILL_ART)) {
    if (a.flavour.shape === shape) return [a.flavour.colors[0]!, a.flavour.detail ?? INK]
  }
  return ['#ffffff', INK]
}
shapes.forEach((shape, i) => {
  const cx = (i % 8) * (W / 8) + W / 16
  const cy = 6 * CELL + Math.floor(i / 8) * CELL + CELL / 2
  const s = 30
  const [fill, detail] = firstColor(shape)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.2 / s
  ctx.strokeStyle = INK
  ctx.stroke(flavourPath(shape)!)
  ctx.fillStyle = fill
  ctx.fill(flavourPath(shape)!)
  const d2 = flavourPath(shape, true)
  if (d2) {
    ctx.fillStyle = detail
    ctx.fill(d2)
  }
  ctx.restore()
  if (!key) {
    ctx.fillStyle = '#eef5ff'
    ctx.textAlign = 'center'
    ctx.fillText(shape, cx, cy + s + 14)
  }
})

if (!key) {
  // One callout per side (English sample copy, debug only).
  const c = createSkillCallouts()
  const t = (k: string, n?: Record<string, unknown>) => k.endsWith('honey_snack')
    ? 'Honey Snack'
    : k.endsWith('quill_burst') ? 'Quill Burst' : k.includes('heal') ? `+${n?.n} HP` : `${n?.n} reflected`
  const y0 = 8 * CELL + 60
  const a = { id: 1, x: W / 4, y: y0 + 60, radius: 20 }
  const b = { id: 2, x: (3 * W) / 4, y: y0 + 60, radius: 20 }
  pushSkillCallout(c, { kind: 'heal', effect: 'second_wind', key: 'honey_snack', value: 8, side: 'player' }, a, 0, t)
  pushSkillCallout(c, { kind: 'mirror', effect: 'mirror_plate', key: 'quill_burst', value: 12, side: 'npc' }, b, 0, t)
  renderSkillCallouts(ctx, c, 600, 1, 1e4, 1e4, true)
}
;(window as unknown as { __skillIconSheetReady?: boolean }).__skillIconSheetReady = true
