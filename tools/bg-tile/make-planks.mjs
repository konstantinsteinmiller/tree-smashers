#!/usr/bin/env node
/**
 * A seamless-BY-CONSTRUCTION plank floor tile (the bedroom backdrop).
 *
 *   node tools/bg-tile/make-planks.mjs <out.webp> [--size 768] [--q 0.82]
 *
 * Painted wood floors cannot be made seamless by cross-fading (the blend ghosts
 * two plank patterns over each other into blobs), and a painting never keeps a
 * perfect period. So this tile is DRAWN: `rows` rows of identical height, two
 * planks per row, the joints staggered by half a plank on alternate rows (a
 * regular brick pattern), every plank a slight warm tone shift, a few flat grain
 * strokes and a knot. Everything is drawn at x and x ± size, y and y ± size,
 * so the tile wraps exactly; a 2 × 2 preview is written next to it.
 * Flat cel look like the painted art: hard edges, one seam colour, no gradient.
 */
import { writeFileSync } from 'node:fs'
import { openCanvas } from '../art-desk/imaging.mjs'
import { ROOT } from '../sprite-pack/lib.mjs'

const a = process.argv.slice(2)
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d }
const out = a[0]
if (!out) { console.error('usage: make-planks.mjs <out.webp> [--size 768] [--q 0.82]'); process.exit(2) }
const size = +opt('size', 768), q = +opt('q', 0.82)

const { page, close } = await openCanvas(ROOT)
try {
  const res = await page.evaluate(async ([size, q]) => {
    const ROWS = 8, PER_ROW = 2
    const rowH = size / ROWS, plankW = size / PER_ROW
    // The painted palette of the old floor (muted honey oak), cel tones.
    const TONES = [
      { base: '#b9834f', hi: '#c78f58', lo: '#a5703f' },
      { base: '#c48d57', hi: '#d29a62', lo: '#ae7a47' },
      { base: '#ad7846', hi: '#bb8450', lo: '#97663a' },
      { base: '#cf9a63', hi: '#dca76e', lo: '#b98550' }
    ]
    const SEAM = '#8a5b34'
    let s = 90210
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
    const c = new OffscreenCanvas(size, size)
    const g = c.getContext('2d')
    g.fillStyle = SEAM
    g.fillRect(0, 0, size, size)
    const wrapped = (x, y, w, h, draw) => {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (x + ox + w < 0 || x + ox > size || y + oy + h < 0 || y + oy > size) continue
        draw(x + ox, y + oy)
      }
    }
    let prev = -1
    for (let r = 0; r < ROWS; r++) {
      for (let p = 0; p < PER_ROW; p++) {
        let t = Math.floor(rnd() * TONES.length)
        if (t === prev) t = (t + 1) % TONES.length
        prev = t
        const tone = TONES[t]
        const x0 = p * plankW + (r % 2 ? plankW / 2 : 0)
        const y0 = r * rowH
        const gap = 3
        const grain = []
        const n = 3 + Math.floor(rnd() * 2)
        for (let k = 0; k < n; k++) grain.push({ gx: 0.08 + rnd() * 0.5, gy: 0.2 + 0.6 * (k + rnd() * 0.5) / n, gl: 0.25 + rnd() * 0.4, gw: (rnd() - 0.5) * 5 })
        const knot = rnd() < 0.45 ? { kx: 0.2 + rnd() * 0.6, ky: 0.35 + rnd() * 0.3 } : null
        wrapped(x0, y0, plankW, rowH, (x, y) => {
          const w = plankW - gap, h = rowH - gap
          g.fillStyle = tone.base
          g.fillRect(x + gap / 2, y + gap / 2, w, h)
          g.fillStyle = tone.hi
          g.fillRect(x + gap / 2, y + gap / 2, w, h * 0.16)
          g.fillStyle = tone.lo
          g.fillRect(x + gap / 2, y + gap / 2 + h * 0.86, w, h * 0.14)
          g.strokeStyle = tone.lo
          g.lineWidth = 1.6
          g.lineCap = 'round'
          for (const k of grain) {
            const sx = x + gap / 2 + w * k.gx, sy = y + gap / 2 + h * k.gy
            g.beginPath()
            g.moveTo(sx, sy)
            g.quadraticCurveTo(sx + w * k.gl * 0.5, sy + k.gw, sx + w * k.gl, sy)
            g.stroke()
          }
          if (knot) {
            g.fillStyle = tone.lo
            g.beginPath()
            g.ellipse(x + gap / 2 + w * knot.kx, y + gap / 2 + h * knot.ky, 5, 3.2, 0, 0, Math.PI * 2)
            g.fill()
          }
        })
      }
    }
    const blob = await c.convertToBlob({ type: 'image/webp', quality: q })
    const prev2 = new OffscreenCanvas(size * 2, size * 2)
    const pg = prev2.getContext('2d')
    for (let i = 0; i < 4; i++) pg.drawImage(c, (i % 2) * size, Math.floor(i / 2) * size)
    const pblob = await prev2.convertToBlob({ type: 'image/png' })
    const b64 = async (b) => {
      const u = new Uint8Array(await b.arrayBuffer())
      let bs = ''
      for (let i = 0; i < u.length; i += 0x8000) bs += String.fromCharCode(...u.subarray(i, i + 0x8000))
      return btoa(bs)
    }
    return [await b64(blob), await b64(pblob)]
  }, [size, q])
  writeFileSync(out, Buffer.from(res[0], 'base64'))
  writeFileSync(out + '.preview.png', Buffer.from(res[1], 'base64'))
  console.log(out, Buffer.from(res[0], 'base64').length, 'bytes')
} finally {
  await close()
}
