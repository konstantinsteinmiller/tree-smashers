/**
 * Reference NOTATION for the UI art sets (manifest.mjs): flat grey
 * silhouettes on a magenta sheet, one per panel on the set's exact lattice,
 * so the painter gets subject, position and size and nothing to trace.
 *
 *   window.UI_ART_PAINTERS.sheet(ctx, set)   draws a whole sheet
 *
 * The stat silhouettes are the game's own 24x24 glyph paths (the IconXxx
 * components and UI_GLYPHS.up), so the reference says exactly what the drawn
 * fallback says. No imports: build.mjs injects this file into a headless page.
 */

const PATHS = {
  attack: 'M21.5 2.5L8 13L5 10L3.5 11.5L6.5 14.5L4 17L7 20L9.5 17.5L12.5 20.5L14 19L11 16Z',
  defense: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  // speed: a bolt + streaks (the shipped clock glyph is replaced by the set)
  speed: 'M14.5 1.5L6 13.2h5.2L9 22.5l9.3-12.6h-5.4L14.5 1.5Z M1.5 9h4v1.6h-4z M0.8 12.4h3.8v1.6H0.8z M1.5 15.8h3.2v1.6H1.5z',
  hp: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  weight: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
  'level-up': 'M12 2.5L22 13h-5.6v8.5H7.6V13H2L12 2.5Z'
}

const GREY = '#9a9a9a'
const GREY_DARK = '#5c5c5c'
const PLATE = '#2c2c2c'
const INK = '#1e1e1e'

const glyph = (ctx, id, cx, cy, extent) => {
  const s = extent / 24
  ctx.save()
  ctx.translate(cx, cy)
  // The glyph's dumbbell is diagonal; the set's is horizontal (manifest).
  if (id === 'weight') ctx.rotate(-Math.PI / 4)
  ctx.translate(-extent / 2, -extent / 2)
  ctx.scale(s, s)
  const p = new Path2D(PATHS[id])
  ctx.fillStyle = GREY
  ctx.fill(p)
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke(p)
  ctx.restore()
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** One box: a top-face sliver, the front face, corner brackets, the plate. */
const box = (ctx, cx, cy, w) => {
  const top = w * 0.14
  const h = w * 0.86
  const x = cx - w / 2
  const y = cy - (h + top) / 2 + top
  // top sliver
  ctx.fillStyle = GREY
  roundRect(ctx, x + w * 0.06, y - top, w * 0.88, top + w * 0.1, w * 0.08)
  ctx.fill()
  ctx.lineWidth = w * 0.025
  ctx.strokeStyle = INK
  ctx.stroke()
  // front
  ctx.fillStyle = GREY
  roundRect(ctx, x, y, w, h, w * 0.12)
  ctx.fill()
  ctx.stroke()
  // corner brackets
  ctx.fillStyle = GREY_DARK
  const b = w * 0.2
  for (const [bx, by] of [[x, y], [x + w - b, y], [x, y + h - b], [x + w - b, y + h - b]]) {
    roundRect(ctx, bx, by, b, b, w * 0.06)
    ctx.fill()
    ctx.stroke()
  }
  // the empty plate
  ctx.beginPath()
  ctx.arc(cx, y + h / 2, w * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = PLATE
  ctx.fill()
  ctx.stroke()
}

const sheet = (ctx, set) => {
  const { cols, rows } = set.grid
  const cw = set.sheet.w / cols
  const ch = set.sheet.h / rows
  ctx.fillStyle = '#FF00FF'
  ctx.fillRect(0, 0, set.sheet.w, set.sheet.h)
  set.cells.forEach((cell, i) => {
    if (!cell) return
    const cx = (i % cols) * cw + cw / 2
    const cy = Math.floor(i / cols) * ch + ch / 2
    const extent = Math.min(cw, ch) * 0.74
    if (set.id === 'stat-icons') glyph(ctx, cell.id, cx, cy, extent)
    else box(ctx, cx, cy, extent)
  })
}

export const UI_ART_PAINTERS = { sheet }

if (typeof window !== 'undefined') window.UI_ART_PAINTERS = UI_ART_PAINTERS
