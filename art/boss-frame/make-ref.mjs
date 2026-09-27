#!/usr/bin/env node
/**
 * Boss-peek portrait frame — layout reference sheet + copyable prompt doc.
 *
 *   node art/boss-frame/make-ref.mjs
 *
 * Writes, next to this file:
 *   ref-frame.png  1024², the frame's geometry as flat NOTATION on #FF00FF
 *   PROMPTS.md     prompt-frame.txt as a fenced, copyable block
 *
 * Geometry (fractions of the canvas width; the ring is centred on the canvas):
 *   opening      r 0.285 (d 0.57) — flat magenta; the boss skin shows through
 *   band         r 0.285 → 0.365, dark ink lip at the inside edge
 *   crest        horned skull on top, centre (0.50, 0.125), never below y 0.205
 *   horns        from the band at ~11 and ~1 o'clock up to tips near (0.13, 0.05) / (0.87, 0.05)
 *   wings        bat-wing flares at 9 and 3 o'clock, out to x 0.02 / 0.98, y 0.34 → 0.68
 *   fangs        two spikes at ~5 and ~7 o'clock down to y 0.96, one short at 6
 *   gems         blood-red (#d7261e — no blue, so it survives the magenta key)
 *                at the wing roots (3 / 9 o'clock) and at 6 o'clock
 *
 * These are what the sheet ASKS for. What ships is registered to what the
 * painter RETURNED, measured on the keyed sprite (opening centre + radius) —
 * BossPeekBadge.vue carries the measured numbers (`--hole-*`). After any
 * re-paint: slice, measure the alpha hole, re-register.
 *
 * Shipped: public/images/boss-frame/boss-frame_384x369.webp (return 4 — the
 * edit pass over return 2; see PROMPTS.md). Measured on the encoded file:
 * opening centre (0.500, 0.519) of the box, diameter 0.5035 of its width.
 *
 * Draws on a canvas in a private headless Chrome (Playwright from the
 * project), so there is no image dependency.
 */
import { createRequire } from 'node:module'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const draw = () => {
  const S = 1024
  const f = (v) => v * S
  const MAG = '#FF00FF'
  const IRON = '#3b3640'
  const IRON_DARK = '#221e27'
  const INK = '#120c10'
  const BONE = '#e3d6b8'
  const MEMBRANE = '#5c1216'
  const GEM = '#d7261e'
  const CRACK = '#ff6a1a'

  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const x = c.getContext('2d')
  x.fillStyle = MAG
  x.fillRect(0, 0, S, S)
  x.lineJoin = 'round'
  x.lineCap = 'round'

  const C = f(0.5)
  const poly = (pts, fill, lw = f(0.012)) => {
    x.beginPath()
    pts.forEach(([px, py], i) => (i ? x.lineTo(f(px), f(py)) : x.moveTo(f(px), f(py))))
    x.closePath()
    x.fillStyle = fill
    x.fill()
    x.lineWidth = lw
    x.strokeStyle = INK
    x.stroke()
  }
  const disc = (cx, cy, r, fill, lw = f(0.01)) => {
    x.beginPath()
    x.arc(f(cx), f(cy), f(r), 0, Math.PI * 2)
    x.fillStyle = fill
    x.fill()
    if (lw) {
      x.lineWidth = lw
      x.strokeStyle = INK
      x.stroke()
    }
  }
  const mirror = (pts) => pts.map(([px, py]) => [1 - px, py])

  // ── Wings (behind the ring): three-fingered bat flares at 9 and 3 o'clock ──
  const wing = [
    [0.16, 0.36], [0.02, 0.33], [0.1, 0.43], [0.01, 0.48], [0.1, 0.53],
    [0.03, 0.62], [0.14, 0.6], [0.16, 0.68], [0.2, 0.6]
  ]
  poly(wing, MEMBRANE)
  poly(mirror(wing), MEMBRANE)

  // ── Horns (behind the ring): from ~11 / ~1 o'clock, sweeping up and out ──
  const horn = [[0.3, 0.24], [0.2, 0.17], [0.13, 0.05], [0.26, 0.12], [0.37, 0.19]]
  poly(horn, IRON)
  poly(mirror(horn), IRON)

  // ── Fangs (behind the ring): ~5 and ~7 o'clock long, 6 o'clock short ──
  const fang = [[0.36, 0.8], [0.4, 0.96], [0.45, 0.84]]
  poly(fang, IRON)
  poly(mirror(fang), IRON)
  poly([[0.47, 0.86], [0.5, 0.93], [0.53, 0.86]], IRON)

  // ── The band: r 0.285 → 0.365, ink lip inside, ink edge outside ──
  x.beginPath()
  x.arc(C, C, f(0.365), 0, Math.PI * 2)
  x.arc(C, C, f(0.285), 0, Math.PI * 2, true)
  x.fillStyle = IRON
  x.fill('evenodd')
  x.beginPath()
  x.arc(C, C, f(0.327), 0, Math.PI * 2)
  x.lineWidth = f(0.02)
  x.strokeStyle = IRON_DARK
  x.stroke()
  x.beginPath()
  x.arc(C, C, f(0.291), 0, Math.PI * 2)
  x.lineWidth = f(0.012)
  x.strokeStyle = INK
  x.stroke()
  x.beginPath()
  x.arc(C, C, f(0.36), 0, Math.PI * 2)
  x.lineWidth = f(0.012)
  x.strokeStyle = INK
  x.stroke()

  // ── Red-hot cracks: short jagged lines INSIDE the band only ──
  x.strokeStyle = CRACK
  x.lineWidth = f(0.006)
  for (const a0 of [-0.35, 0.55, 1.25, 2.2, 2.75, 3.6, 4.4, 5.3]) {
    const pts = [0.3, 0.315, 0.33, 0.35].map((r, i) => {
      const a = a0 + (i % 2 ? 0.05 : -0.03)
      return [C + Math.cos(a) * f(r), C + Math.sin(a) * f(r)]
    })
    x.beginPath()
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)))
    x.stroke()
  }

  // ── Gems: wing roots (3 / 9 o'clock) and 6 o'clock ──
  disc(0.5 - 0.325, 0.5, 0.032, GEM)
  disc(0.5 + 0.325, 0.5, 0.032, GEM)
  disc(0.5, 0.5 + 0.325, 0.03, GEM)

  // ── Crest: horned skull on top of the band, never into the opening ──
  poly([[0.44, 0.1], [0.36, 0.02], [0.42, 0.06]], BONE)
  poly([[0.56, 0.1], [0.64, 0.02], [0.58, 0.06]], BONE)
  disc(0.5, 0.125, 0.07, BONE)
  poly([[0.455, 0.17], [0.545, 0.17], [0.53, 0.205], [0.47, 0.205]], BONE, f(0.008))
  disc(0.475, 0.125, 0.018, GEM, 0)
  disc(0.525, 0.125, 0.018, GEM, 0)

  return c.toDataURL('image/png')
}

const tmp = mkdtempSync(join(tmpdir(), 'boss-frame-ref-'))
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--user-data-dir=${tmp}`]
}).catch(() =>
  chromium.launch({ executablePath: CHROME, headless: true })
)
try {
  const page = await browser.newPage()
  const url = await page.evaluate(draw)
  const file = join(HERE, 'ref-frame.png')
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
  console.log(`wrote ${file}`)
} finally {
  await browser.close()
}

// ─── PROMPTS.md — prompt-frame.txt as one fenced, copyable block ────────────
const fenceFor = (body) => {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}
const block = (title, file) => {
  const body = readFileSync(join(HERE, file), 'utf8').trim()
  const fence = fenceFor(body)
  return [title, '', `${fence}text`, body, fence, '']
}
const doc = [
  '# Boss-peek portrait frame — master prompts',
  '',
  'Generated by `node art/boss-frame/make-ref.mjs` from the `prompt-*.txt` files (edit those, not this).',
  'Headings are for the operator: copy only the fenced block. `paint.mjs` attaches the first --ref LAST',
  '(it sets the shape of the return). Raw returns live outside the repo (scratch).',
  '',
  'What shipped (2026-09-27, 4 paint jobs): return 1 (`prompt-frame.txt`, refs: ref-frame + demon + roulette rim)',
  'had the right finish but a ring 60% wide with a 41% opening; return 2 (same prompt + the "ring is big"',
  'clause) had the right geometry but traced the placeholder skull and zigzag cracks; return 3 (finish ref =',
  'return 1) copied return 1 wholesale. Return 4 = `prompt-frame-edit.txt` run on return 2: real skull,',
  'branching cracks, geometry kept → sliced (`--fit cell`), cropped to its bbox, 384 wide, WebP q0.72.',
  '',
  ...block('## 1 · Frame  (ref-frame.png + demon_256x256.webp → raw frame-N.png)', 'prompt-frame.txt'),
  '`node tools/art-desk/paint.mjs --prompt-file <abs prompt-frame.txt> --out <abs raw.png> --ref <abs ref-frame.png> --ref <abs demon_256x256.webp> --ref <abs rim_560x560.webp>`',
  '',
  ...block('## 2 · Edit pass  (raw frame-2.png + demon_256x256.webp → public/images/boss-frame/boss-frame_384x369.webp)', 'prompt-frame-edit.txt'),
  '`node tools/art-desk/paint.mjs --prompt-file <abs prompt-frame-edit.txt> --out <abs raw.png> --ref <abs frame-2.png> --ref <abs demon_256x256.webp>`',
  ''
]
writeFileSync(join(HERE, 'PROMPTS.md'), doc.join('\n'))
console.log(`wrote ${join(HERE, 'PROMPTS.md')}`)
