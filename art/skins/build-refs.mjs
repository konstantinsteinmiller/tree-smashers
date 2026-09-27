#!/usr/bin/env node
/**
 * Render the skin reference images for the Gemini pass.
 *
 *   node art/skins/build-refs.mjs                 silhouettes + plates
 *   node art/skins/build-refs.mjs --plates-only   only the style/finish plates (what a re-paint needs)
 *   node art/skins/build-refs.mjs --no-plates     only the silhouettes (after editing a tpl in concepts.mjs)
 *
 * Writes, per class, into art/skins/<class>/:
 *   sheet.png          (committed) 1024x1024 2x2 layout reference — four grey class
 *                      silhouettes (one per new skin, panel order = concepts.mjs)
 *                      on flat #FF00FF, discs of 400 px centred at 256/768 with
 *                      112 px of magenta between them. The bottom-right disc
 *                      stops 125 px short of the corner diagonal, so Gemini's
 *                      sparkle watermark lands on ground.
 *   single-<id>.png    (committed) 1024x1024, ONE silhouette (760 px) centred.
 *   style-<id>.png     (generated, gitignored) 512x512 shipped legacy skin on
 *                      #FF00FF — finish/style reference only, never a subject.
 *   finish-<id>.png    (generated, gitignored) the same for this class's NEW
 *                      skins that are already painted — the best finish refs
 *                      for re-painting a sibling (PROMPT-ANATOMY §8).
 * Silhouettes are written as 5-colour indexed PNGs (see indexedPng below).
 *
 * The grey drawing is NOTATION: outline, size, centre, the hex medallion and the
 * inner ring. Everything else is the painter's.
 *
 * Headless Chrome on a throw-away profile (Playwright's default).
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLASSES, CLASS_ORDER } from './concepts.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const MODELS = join(ROOT, 'public', 'images', 'models')
const PLATES_ONLY = process.argv.includes('--plates-only')
const NO_PLATES = process.argv.includes('--no-plates')

// Runs inside the page. Draws one grey class silhouette centred on (cx, cy).
const drawTemplate = (ctx, cx, cy, R, tpl) => {
  const BODY = '#a4a9b1', LINE = '#30343a', RING = '#6c7179', HEX = '#d3d6db'
  const lw = Math.max(3, R * 0.022)
  const TAU = Math.PI * 2
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const shapes = [] // each: (ctx) => build a path

  const circle = (r) => (c) => {
    c.moveTo(cx + r, cy)
    c.arc(cx, cy, r, 0, TAU)
  }
  const poly = (pts) => (c) => {
    c.moveTo(...pts[0])
    for (const p of pts.slice(1)) c.lineTo(...p)
    c.closePath()
  }
  const superellipse = (a, p, rot = 0) => (c) => {
    for (let i = 0; i <= 256; i++) {
      const t = (i / 256) * TAU
      const ct = Math.cos(t), st = Math.sin(t)
      const x = a * R * Math.sign(ct) * Math.abs(ct) ** (2 / p)
      const y = a * R * Math.sign(st) * Math.abs(st) ** (2 / p)
      const xr = x * Math.cos(rot) - y * Math.sin(rot), yr = x * Math.sin(rot) + y * Math.cos(rot)
      if (i === 0) c.moveTo(cx + xr, cy + yr) else c.lineTo(cx + xr, cy + yr)
    }
    c.closePath()
  }
  const extra = [] // detail strokes drawn after the fill

  let ringR = 0.46
  switch (tpl.kind) {
    case 'pinwheel': {
      const core = tpl.core * R
      shapes.push(circle(core))
      const n = tpl.arms
      const w = (Math.PI / n) * (tpl.sharp ? 0.42 : 0.62)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU
        const tipA = a + tpl.sweep
        shapes.push((c) => {
          c.moveTo(...P(core * 0.9, a - w))
          c.quadraticCurveTo(...P(R * (tpl.curl ? 1.02 : 0.97), a - w * 0.1 + tpl.sweep * 0.45), ...P(R * 0.995, tipA))
          c.quadraticCurveTo(...P(R * (tpl.curl ? 0.62 : 0.74), a + w + tpl.sweep * 0.55), ...P(core * 0.9, a + w))
          c.closePath()
        })
        if (tpl.curl) extra.push((c) => {
          c.moveTo(...P(R * 0.955 + 0.035 * R, tipA))
          c.arc(...P(R * 0.955, tipA), R * 0.035, 0, TAU)
        })
      }
      ringR = tpl.core * 0.72
      break
    }
    case 'barbs': {
      const r0 = tpl.inner * R
      shapes.push(circle(r0 + R * 0.02))
      const n = tpl.n
      const half = (Math.PI / n) * tpl.width
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU
        if (tpl.style === 'lobe') {
          shapes.push((c) => {
            c.moveTo(...P(r0 * 0.95, a - half))
            c.quadraticCurveTo(...P(R * 1.02, a), ...P(r0 * 0.95, a + half))
            c.closePath()
          })
          for (const d of [-0.12, 0, 0.12]) extra.push((c) => {
            c.moveTo(...P(R * 0.86, a + d))
            c.lineTo(...P(R * 0.995, a + d * 1.6))
          })
        } else if (tpl.style === 'fin') {
          shapes.push(poly([P(r0 * 0.95, a - half), P(R * 0.995, a), P(r0 * 0.95, a + half)]))
          shapes.push(poly([P(r0 * 0.98, a + half * 0.9), P(R * 0.78, a + Math.PI / n), P(r0 * 0.98, a + (TAU / n) - half * 0.9)]))
        } else {
          shapes.push(poly([P(r0 * 0.95, a - half), P(R * 0.995, a), P(r0 * 0.95, a + half)]))
        }
      }
      ringR = tpl.inner * 0.66
      break
    }
    case 'disc': {
      shapes.push(circle(R * 0.985))
      for (const r of tpl.rings.slice(1)) extra.push((c) => {
        c.moveTo(cx + r * R, cy)
        c.arc(cx, cy, r * R, 0, TAU)
      })
      ringR = tpl.rings[0]
      break
    }
    case 'xlobes': {
      shapes.push(circle(R * 0.46))
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * TAU
        shapes.push((c) => {
          const [ex, ey] = P(R * 0.56, a)
          c.moveTo(ex + Math.cos(a) * R * 0.43, ey + Math.sin(a) * R * 0.43)
          c.ellipse(ex, ey, R * 0.43, R * 0.34, a, 0, TAU)
        })
      }
      ringR = 0.34
      break
    }
    case 'squircle': {
      shapes.push(superellipse(tpl.a, tpl.p, tpl.rot ?? 0))
      if (tpl.diag) {
        const k = tpl.a * R * 0.86
        extra.push((c) => {
          c.moveTo(cx - k, cy - k)
          c.lineTo(cx + k, cy + k)
          c.moveTo(cx + k, cy - k)
          c.lineTo(cx - k, cy + k)
        })
      }
      if (tpl.points) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU
          extra.push((c) => {
            c.moveTo(...P(R * 0.3, a))
            c.lineTo(...P(R * 0.9, a))
          })
        }
      }
      if (tpl.checker) extra.push(superellipse(tpl.a * 0.72, tpl.p))
      ringR = 0.46
      break
    }
    case 'pads': {
      const n = tpl.n
      if (tpl.style === 'fur') {
        shapes.push(circle(R * 0.84))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          shapes.push((c) => {
            const [x, y] = P(R * 0.83, a)
            c.moveTo(x + R * 0.16, y)
            c.arc(x, y, R * 0.16, 0, TAU)
          })
        }
      } else if (tpl.style === 'plates') {
        shapes.push(circle(R * 0.9))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          shapes.push((c) => {
            const [x, y] = P(R * 0.86, a)
            c.moveTo(x + R * 0.13, y)
            c.arc(x, y, R * 0.13, 0, TAU)
          })
        }
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.PI / n
          extra.push((c) => {
            c.moveTo(...P(R * 0.58, a))
            c.lineTo(...P(R * 0.97, a))
          })
        }
      } else if (tpl.style === 'blocks') {
        shapes.push(circle(R * 0.93))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU, h = 0.16
          shapes.push(poly([P(R * 0.62, a - h), P(R * 0.99, a - h * 0.8), P(R * 0.99, a + h * 0.8), P(R * 0.62, a + h)]))
        }
      } else if (tpl.style === 'ports') {
        shapes.push(circle(R * 0.985))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          extra.push((c) => {
            const [x, y] = P(R * 0.8, a)
            c.moveTo(x + R * 0.12, y)
            c.arc(x, y, R * 0.12, 0, TAU)
          })
        }
      }
      extra.push((c) => {
        c.moveTo(cx + R * 0.58, cy)
        c.arc(cx, cy, R * 0.58, 0, TAU)
      })
      ringR = 0.42
      break
    }
    case 'spikes': {
      const core = tpl.core * R
      shapes.push(circle(core))
      const n = tpl.n
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (n === 4 ? Math.PI / 4 : 0)
        if (tpl.style === 'mandibles') {
          for (const s of [-1, 1]) {
            const b = a + s * 0.42
            shapes.push((c) => {
              c.moveTo(...P(core * 0.92, b - s * 0.2))
              c.quadraticCurveTo(...P(R * 1.02, b + s * 0.05), ...P(R * 0.99, a + s * 0.06))
              c.quadraticCurveTo(...P(R * 0.86, b - s * 0.08), ...P(core * 0.92, b + s * 0.2))
              c.closePath()
            })
          }
        } else {
          const half = tpl.base
          shapes.push(poly([P(core * 0.92, a - half), P(R * 0.995, a), P(core * 0.92, a + half)]))
          if (tpl.style === 'lance') extra.push((c) => {
            const [x, y] = P(core * 1.02, a)
            c.moveTo(x + R * 0.06, y)
            c.arc(x, y, R * 0.06, 0, TAU)
          })
        }
      }
      ringR = tpl.core * 0.72
      break
    }
  }

  // Union outline: stroke every shape fat, then fill every shape over it.
  ctx.lineJoin = 'round'
  ctx.strokeStyle = LINE
  ctx.lineWidth = lw * 2
  for (const s of shapes) {
    ctx.beginPath()
    s(ctx)
    ctx.stroke()
  }
  ctx.fillStyle = BODY
  for (const s of shapes) {
    ctx.beginPath()
    s(ctx)
    ctx.fill()
  }
  ctx.lineWidth = lw * 0.6
  ctx.strokeStyle = RING
  for (const e of extra) {
    ctx.beginPath()
    e(ctx)
    ctx.stroke()
  }
  // Inner ring + hex medallion (the house construction every skin shares).
  ctx.lineWidth = lw * 0.8
  ctx.beginPath()
  ctx.arc(cx, cy, ringR * R, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * TAU
    const p = P(R * 0.23, a)
    if (i) ctx.lineTo(...p) else ctx.moveTo(...p)
  }
  ctx.closePath()
  ctx.fillStyle = HEX
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = lw
  ctx.stroke()
}

// ── Indexed PNG ───────────────────────────────────────────────────────────────
// The silhouettes use five flat colours. The canvas encoder writes them as
// ~130 kB of anti-aliased truecolour per sheet, so instead every pixel is snapped
// to the nearest palette colour and written here as an 8-bit indexed PNG
// (deflate level 9), about 10-20 kB. Gemini reads outline and centre, and the
// lost anti-aliasing changes neither.
const PALETTE = [[0xff, 0x00, 0xff], [0xa4, 0xa9, 0xb1], [0x30, 0x34, 0x3a], [0x6c, 0x71, 0x79], [0xd3, 0xd6, 0xdb]]
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
const indexedPng = (rgba, w, h) => {
  const raw = Buffer.alloc((w + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let best = 0, bd = Infinity
      for (let k = 0; k < PALETTE.length; k++) {
        const p = PALETTE[k]
        const d = (rgba[i] - p[0]) ** 2 + (rgba[i + 1] - p[1]) ** 2 + (rgba[i + 2] - p[2]) ** 2
        if (d < bd) {
          bd = d
          best = k
        }
      }
      raw[y * (w + 1) + 1 + x] = best
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 3
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0 // 8-bit, palette
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(PALETTE.flat())),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: `window.drawTemplate = ${drawTemplate.toString()}` })

  // Draw silhouettes on a 1024 magenta canvas; return raw RGBA (base64).
  const silhouettes = async (items) => {
    const b64 = await page.evaluate(({ items }) => {
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 1024
      const x = c.getContext('2d')
      x.fillStyle = '#FF00FF'
      x.fillRect(0, 0, 1024, 1024)
      for (const it of items) window.drawTemplate(x, it.cx, it.cy, it.R, it.tpl)
      const d = x.getImageData(0, 0, 1024, 1024).data
      let s = ''
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000))
      return btoa(s)
    }, { items })
    return indexedPng(Buffer.from(b64, 'base64'), 1024, 1024)
  }

  // A shipped skin composited on a 512 magenta plate (finish reference).
  const plate = async (id) => {
    const b64 = readFileSync(join(MODELS, `${id}_256x256.webp`)).toString('base64')
    return Buffer.from(await page.evaluate(async ({ b64 }) => {
      const img = new Image()
      img.src = `data:image/webp;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 512
      c.height = 512
      const x = c.getContext('2d')
      x.fillStyle = '#FF00FF'
      x.fillRect(0, 0, 512, 512)
      x.imageSmoothingQuality = 'high'
      x.drawImage(img, 36, 36, 440, 440)
      return c.toDataURL('image/png').split(',')[1]
    }, { b64 }), 'base64')
  }

  for (const cls of CLASS_ORDER) {
    const def = CLASSES[cls]
    const dir = join(HERE, cls)
    mkdirSync(dir, { recursive: true })
    const wrote = []

    if (!PLATES_ONLY) {
      const centres = [[256, 256], [768, 256], [256, 768], [768, 768]]
      writeFileSync(join(dir, 'sheet.png'),
        await silhouettes(def.skins.map((s, i) => ({ cx: centres[i][0], cy: centres[i][1], R: 200, tpl: s.tpl }))))
      for (const s of def.skins) {
        writeFileSync(join(dir, `single-${s.id}.png`), await silhouettes([{ cx: 512, cy: 512, R: 380, tpl: s.tpl }]))
      }
      wrote.push('sheet.png', `${def.skins.length} singles`)
    }

    if (!NO_PLATES) {
      // Style refs (shipped legacy skins) + finish refs (this class's own new
      // skins, once painted) — regenerated from public/images/models on demand,
      // gitignored (art/skins/.gitignore).
      let n = 0
      for (const id of def.styleRefs) {
        writeFileSync(join(dir, `style-${id}.png`), await plate(id))
        n++
      }
      for (const s of def.skins) {
        if (existsSync(join(MODELS, `${s.id}_256x256.webp`))) {
          writeFileSync(join(dir, `finish-${s.id}.png`), await plate(s.id))
          n++
        }
      }
      wrote.push(`${n} plates`)
    }
    console.log(`${cls}: ${wrote.join(', ')}`)
  }
} finally {
  await browser.close()
}
