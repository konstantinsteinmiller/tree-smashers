/**
 * DEV-ONLY entry for `dev/smashers.html` and the art-desk reference sheets
 * (`pnpm art:smashers`, tools/smasher-sheets/export.mjs): renders smashers
 * with the REAL rig (src/smashers/smasherRig.ts). Never imported by the game.
 *
 *   /dev/smashers.html              all 12 smashers, 32 angles each
 *   /dev/smashers.html?id=vixie     one smasher's 4 × 4 reference sheet
 *   &boss=1                         boss dress (crown + war paint)
 *
 * window.__smasherSheet(id, cell, boss) → PNG data URL of the 4 × 4 sheet on
 * the magenta key (#FF00FF) the art pipeline expects; no labels on the sheet.
 */
import { SMASHER_IDS, type SmasherId } from '@/data/smasherCatalog'
import {
  FRAME_BOX, FRAME_H, FRAME_W, SIGNATURE_PALETTES, YAW_COLS, YAW_FRAMES, drawSmasher, frameYaw
} from '@/smashers/smasherRig'
import { paintDiscTop } from '@/smashers/smasherAtlas'
import { DISC_SQUASH, DISC_THICKNESS, mixHex } from '@/smashers/smasherRig'

const KEY = '#FF00FF'

/** Disc + character into a cell whose disc centre is (x, y). */
const drawCell = (ctx: CanvasRenderingContext2D, id: SmasherId, frame: number, x: number, y: number, ppu: number, boss: boolean) => {
  const rim = '#3f7fd8'
  const sq = DISC_SQUASH
  const side = ppu * DISC_THICKNESS * Math.sqrt(1 - sq * sq)
  ctx.fillStyle = mixHex(rim, '#1a0e08', 0.45)
  ctx.strokeStyle = '#2a1a10'
  ctx.lineWidth = Math.max(1, ppu * 0.06)
  ctx.beginPath()
  ctx.ellipse(x, y + side, ppu * 0.97, ppu * sq * 0.97, 0, 0, Math.PI)
  ctx.lineTo(x - ppu * 0.97, y)
  ctx.ellipse(x, y, ppu * 0.97, ppu * sq * 0.97, 0, Math.PI, 0, true)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, sq)
  ctx.translate(-ppu, -ppu)
  paintDiscTop(ctx, ppu, ppu, rim)
  ctx.restore()
  drawSmasher(ctx, id, SIGNATURE_PALETTES[id], frameYaw(frame), x, y, ppu, { boss })
}

export const renderSheet = (id: SmasherId, cell = 384, boss = false, key = KEY): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = cell * YAW_COLS
  c.height = cell * Math.ceil(YAW_FRAMES / YAW_COLS)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = key
  ctx.fillRect(0, 0, c.width, c.height)
  const ppu = (cell * 0.94) / Math.max(FRAME_W, FRAME_H)
  for (let f = 0; f < YAW_FRAMES; f++) {
    const cx = (f % YAW_COLS) * cell + cell / 2
    const cy = Math.floor(f / YAW_COLS) * cell + cell / 2 - ((FRAME_BOX.top + FRAME_BOX.bottom) / 2) * ppu
    drawCell(ctx, id, f, cx, cy, ppu, boss)
  }
  return c
}

/** All smashers × a few angles (review contact sheet). */
export const renderOverview = (cell = 160, frames = [0, 4, 8, 12, 16, 24], boss = false): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = cell * frames.length
  c.height = cell * SMASHER_IDS.length
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f3ead8'
  ctx.fillRect(0, 0, c.width, c.height)
  const ppu = (cell * 0.94) / Math.max(FRAME_W, FRAME_H)
  SMASHER_IDS.forEach((id, r) => frames.forEach((f, i) => {
    drawCell(ctx, id, f, i * cell + cell / 2, r * cell + cell / 2 - ((FRAME_BOX.top + FRAME_BOX.bottom) / 2) * ppu, ppu, boss)
  }))
  return c
}

const w = window as unknown as Record<string, unknown>
w.__smasherSheet = (id: SmasherId, cell = 384, boss = false) => renderSheet(id, cell, boss).toDataURL('image/png')
w.__smasherOverview = (cell = 160, boss = false) => renderOverview(cell, undefined, boss).toDataURL('image/png')
w.__smasherIds = [...SMASHER_IDS]

const params = new URLSearchParams(location.search)
const root = document.getElementById('root')
if (root) {
  const only = params.get('id') as SmasherId | null
  const boss = params.get('boss') === '1'
  for (const id of only ? [only] : SMASHER_IDS) {
    const h = document.createElement('h3')
    h.textContent = id
    root.appendChild(h)
    const sheet = renderSheet(id, only ? 320 : 160, boss, '#f3ead8')
    sheet.style.width = `${sheet.width / (window.devicePixelRatio > 1 ? 1 : 1)}px`
    root.appendChild(sheet)
  }
}
w.__smashersReady = true
