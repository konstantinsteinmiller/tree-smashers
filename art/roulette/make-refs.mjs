#!/usr/bin/env node
/**
 * Roulette wheel — reference sheets for the painted parts.
 *
 *   node art/roulette/make-refs.mjs
 *
 * Writes, next to this file:
 *   ref-rim.png    1024², the gold rim ring (transparent-to-be centre)
 *   ref-parts.png  1024², 2×2: pointer · hub / bulb off · bulb on
 *   PROMPTS.md     the master prompts (prompt-*.txt) as fenced, copyable blocks
 *
 * Flat magenta (#FF00FF) ground; the flat shapes are NOTATION for where paint
 * goes, never a look to copy. The geometry is the contract with
 * src/components/organisms/RouletteWheel.vue — every number below is a
 * fraction of the whole wheel (`wheelSize`) and must match `GEO` and the
 * `.wheel-pointer` box there:
 *
 *   rim     outer edge 0.500, inner opening 0.400 (the face disk is 0.412, so
 *           the rim's inner lip overlaps it), bulbs mount on the band at 0.452
 *   pointer box 0.13 × 0.20, round cap = full box width, cap centre at 32.5 %
 *           of the box height (the pivot), tip at the bottom edge
 *   hub     0.23 diameter
 *   bulb    0.064 diameter
 *
 * These are what the sheets ASK for. What ships is registered to what the
 * painter RETURNED, measured on the keyed sprite: the shipped rim's opening
 * came back at r 0.357 (not 0.40) and the pointer's cap centre at 28.3 % (not
 * 32.5 %), so `GEO` / `.wheel-pointer` in the component carry the measured
 * numbers. After any re-paint: slice, measure the alpha, re-register.
 *
 * Returns that shipped: rim ← raw rim-2 (1st return had a 0.29 opening);
 * pointer + hub ← parts-2 (sapphire; parts-1's pink ruby keyed into holes);
 * bulbs ← parts-1 (parts-2's bulbs came back in 3/4 view).
 *
 * Draws on a canvas in a private headless Chrome (Playwright from the project),
 * so there is no image dependency.
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
  const MAG = '#FF00FF'
  const GOLD = '#e2b13c'
  const GOLD_LIGHT = '#f3d27a'
  const GOLD_DARK = '#b07a1e'
  const INK = '#3b2208'
  const GEM = '#1d4ed8' // royal-blue sapphire: far from the magenta key (a pink ruby was keyed into holes)
  const out = {}

  const sheet = () => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const x = c.getContext('2d')
    x.fillStyle = MAG
    x.fillRect(0, 0, 1024, 1024)
    return [c, x]
  }
  const ring = (x, cx, cy, r0, r1, fill) => {
    x.beginPath()
    x.arc(cx, cy, r1, 0, Math.PI * 2)
    x.arc(cx, cy, r0, 0, Math.PI * 2, true)
    x.fillStyle = fill
    x.fill('evenodd')
  }
  const disc = (x, cx, cy, r, fill, stroke, lw) => {
    x.beginPath()
    x.arc(cx, cy, r, 0, Math.PI * 2)
    x.fillStyle = fill
    x.fill()
    if (stroke) {
      x.lineWidth = lw
      x.strokeStyle = stroke
      x.stroke()
    }
  }

  // ─── Rim: one ring, 0.400 → 0.500 of the canvas, centre left magenta ──────
  {
    const [c, x] = sheet()
    const S = 1024
    const C = S / 2
    const f = (v) => v * S
    ring(x, C, C, f(0.4), f(0.497), GOLD)             // the band
    ring(x, C, C, f(0.4), f(0.41), INK)               // dark inner lip
    ring(x, C, C, f(0.435), f(0.469), GOLD_LIGHT)     // plain polished channel (bulbs mount here later)
    ring(x, C, C, f(0.485), f(0.497), GOLD_DARK)      // outer bevel
    ring(x, C, C, f(0.492), f(0.497), INK)            // outer ink edge
    out.rim = c.toDataURL('image/png')
  }

  // ─── Parts: 2×2 cells of 512 ──────────────────────────────────────────────
  {
    const [c, x] = sheet()
    const cell = 512
    // 1 · pointer (top-left). Box W:H = 0.13:0.20 → 0.65. H = 84 % of the cell.
    {
      const H = cell * 0.84
      const W = H * 0.65
      const ox = (cell - W) / 2
      const oy = (cell - H) / 2
      const u = W / 100 // the fallback SVG's viewBox is 100 × 154
      x.beginPath()
      x.moveTo(ox + 12 * u, oy + 60 * u)
      x.lineTo(ox + 88 * u, oy + 60 * u)
      x.lineTo(ox + 50 * u, oy + 150 * u)
      x.closePath()
      x.fillStyle = GOLD
      x.fill()
      x.lineJoin = 'round'
      x.lineWidth = 5 * u
      x.strokeStyle = INK
      x.stroke()
      disc(x, ox + 50 * u, oy + 50 * u, 46 * u, GOLD, INK, 5 * u)
      disc(x, ox + 50 * u, oy + 50 * u, 21 * u, GEM, INK, 4 * u)
    }
    // 2 · hub (top-right): 86 % of the cell, 8 rivets on the bezel.
    {
      const cx = cell * 1.5
      const cy = cell * 0.5
      const R = cell * 0.43
      disc(x, cx, cy, R, GOLD, INK, 10)
      disc(x, cx, cy, R * 0.58, GEM, INK, 8)
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI * 2
        disc(x, cx + Math.cos(a) * R * 0.79, cy + Math.sin(a) * R * 0.79, R * 0.07, GOLD_LIGHT, INK, 5)
      }
    }
    // 3 · bulb OFF (bottom-left), 4 · bulb ON (bottom-right): 64 % of the cell.
    for (const [col, glass, core] of [[0, '#e9c77a', null], [1, '#fff3b0', '#ffffff']]) {
      const cx = cell * (col + 0.5)
      const cy = cell * 1.5
      const R = cell * 0.32
      disc(x, cx, cy, R, GOLD, INK, 9)
      disc(x, cx, cy, R * 0.66, glass, INK, 7)
      if (core) disc(x, cx, cy, R * 0.3, core)
    }
    out.parts = c.toDataURL('image/png')
  }
  return out
}

const tmp = mkdtempSync(join(tmpdir(), 'roulette-refs-'))
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--user-data-dir=${tmp}`]
}).catch(async () =>
  chromium.launch({ executablePath: CHROME, headless: true })
)
try {
  const page = await browser.newPage()
  const out = await page.evaluate(draw)
  for (const [name, url] of Object.entries(out)) {
    const file = join(HERE, `ref-${name}.png`)
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    console.log(`wrote ${file}`)
  }
} finally {
  await browser.close()
}

// ─── PROMPTS.md — the prompt-*.txt files as fenced, copyable blocks ─────────
const fenceFor = (body) => {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}
const JOBS = [
  ['Rim', 'prompt-rim.txt', 'ref-rim.png', 'public/images/roulette/rim_560x560.webp'],
  ['Pointer · hub · bulbs', 'prompt-parts.txt', 'ref-parts.png', 'public/images/roulette/{pointer_78x120,hub_128x128,bulb-off_40x40,bulb-on_40x40}.webp']
]
const doc = [
  '# Roulette wheel — master prompts',
  '',
  'Generated by `node art/roulette/make-refs.mjs` from the `prompt-*.txt` files (edit those, not this).',
  'Attach the finish reference first — `public/images/icons/diamond-fancy_256x256.webp` — and the layout',
  'reference LAST (it sets the shape of the return). With the desk:',
  '`node tools/art-desk/paint.mjs --prompt-file <abs prompt-*.txt> --out <abs raw.png> --ref <abs ref-*.png> --ref <abs diamond-fancy_256x256.webp>`',
  '(first --ref = layout; the desk attaches it last). Headings are for the operator: copy only the fenced block.',
  ''
]
for (const [title, promptFile, ref, target] of JOBS) {
  const body = readFileSync(join(HERE, promptFile), 'utf8').trim()
  const fence = fenceFor(body)
  doc.push(`## ${title}  (${ref} → ${target})`, '', `${fence}text`, body, fence, '')
}
writeFileSync(join(HERE, 'PROMPTS.md'), doc.join('\n'))
console.log(`wrote ${join(HERE, 'PROMPTS.md')}`)
