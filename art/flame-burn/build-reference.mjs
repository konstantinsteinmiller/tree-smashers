#!/usr/bin/env node
/**
 * Render the flame-burn reference sheet (and, on request, the placeholder
 * strip) from the procedural drawing in ./flame-frames.js.
 *
 *   node art/flame-burn/build-reference.mjs                 reference sheet + fit.json
 *   node art/flame-burn/build-reference.mjs --placeholder   ALSO overwrite the shipped
 *        strip public/images/vfx/flame-burn_1536x128.webp with the drawing —
 *        only for a fresh checkout or to roll back a bad painting; it clobbers
 *        the painted strip otherwise.
 *   node art/flame-burn/build-reference.mjs --preview <dir> ALSO write a
 *        dark-ground contact sheet (flames over a stand-in spinner) for review.
 *
 * Reference: 4 x 3 lattice of 256 px cells on flat #FF00FF = 1024 x 768 (4:3,
 * an aspect Gemini offers). Cells have no gutters — the lattice is the
 * contract — and every drawing keeps well clear of its cell edges. Frame 12
 * (bottom-right cell) is only a small wisp in the upper half of its cell, so
 * the image model's corner watermark lands on empty ground.
 *
 * Headless system Chrome on a throw-away profile (Playwright's default).
 *
 * RE-PAINT LOOP (all from the repo root; raw returns go to a scratch dir,
 * never into the repo or public/):
 *   1. node art/flame-burn/build-reference.mjs
 *   2. node tools/art-desk/paint.mjs --prompt-file <abs>/art/flame-burn/prompt.txt \
 *        --out <scratch>/flame-burn-N.png \
 *        --ref <abs>/art/flame-burn/flame-burn-reference.png \
 *        --ref <abs>/art/flame-burn/flame-burn-finish-ref.png
 *      (first --ref = layout, attached LAST by the desk; the rest = finish refs)
 *   3. node tools/art-desk/slice.mjs --in <scratch>/flame-burn-N.png --out-dir <scratch>/cells \
 *        --grid 4x3 --size 256x256 --fit cell --png --names f00,f01,…,f11
 *   4. node art/flame-burn/register-strip.mjs --cells <scratch>/cells --preview <scratch>/check.png
 *      → public/images/vfx/flame-burn_1536x128.webp (hole aligned to the spinner anchor)
 *   Review every frame keyed on the dark lava ground before keeping it.
 *
 * Shipped strip (2026-09-27): paint #2 of 3. #1 came back as a pink tyre in
 * perspective ("ring", "rim", "hole" read as an object — the prompt no longer
 * uses them); #3, with extra finish clauses, came back as a MORE literal trace
 * than #2, so prompt.txt is the #2 text.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const args = process.argv.slice(2)
const wantPlaceholder = args.includes('--placeholder')
const previewIdx = args.indexOf('--preview')
const previewDir = previewIdx >= 0 ? resolve(args[previewIdx + 1]) : null

const REF_CELL = 256
const COLS = 4
const ROWS = 3
const STRIP_CELL = 128
const FRAMES = 12

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: readFileSync(join(HERE, 'flame-frames.js'), 'utf8') })

  const out = await page.evaluate(({ REF_CELL, COLS, ROWS, STRIP_CELL, FRAMES }) => {
    const { drawFlameFrame } = window.FLAME
    const mk = (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }

    // Reference sheet on magenta.
    const ref = mk(REF_CELL * COLS, REF_CELL * ROWS)
    const rc = ref.getContext('2d')
    rc.fillStyle = '#FF00FF'
    rc.fillRect(0, 0, ref.width, ref.height)
    for (let f = 0; f < FRAMES; f++) {
      drawFlameFrame(rc, f, (f % COLS) * REF_CELL, Math.floor(f / COLS) * REF_CELL, REF_CELL)
    }

    // Transparent render of the same lattice, to MEASURE (magenta has no alpha).
    const meas = mk(REF_CELL * COLS, REF_CELL * ROWS)
    const mc = meas.getContext('2d')
    for (let f = 0; f < FRAMES; f++) {
      drawFlameFrame(mc, f, (f % COLS) * REF_CELL, Math.floor(f / COLS) * REF_CELL, REF_CELL)
    }
    const data = mc.getImageData(0, 0, meas.width, meas.height).data
    const perFrame = []
    let u = { x0: 1, y0: 1, x1: 0, y1: 0 }
    for (let f = 0; f < FRAMES; f++) {
      const ox = (f % COLS) * REF_CELL
      const oy = Math.floor(f / COLS) * REF_CELL
      let x0 = REF_CELL, y0 = REF_CELL, x1 = -1, y1 = -1, solid = 0
      for (let y = 0; y < REF_CELL; y++) {
        for (let x = 0; x < REF_CELL; x++) {
          if (data[((oy + y) * meas.width + ox + x) * 4 + 3] > 140) {
            solid++
            if (x < x0) x0 = x
            if (y < y0) y0 = y
            if (x > x1) x1 = x
            if (y > y1) y1 = y
          }
        }
      }
      const box = x1 < 0 ? null : {
        x0: +(x0 / REF_CELL).toFixed(3), y0: +(y0 / REF_CELL).toFixed(3),
        x1: +((x1 + 1) / REF_CELL).toFixed(3), y1: +((y1 + 1) / REF_CELL).toFixed(3),
        coverage: +(solid / (REF_CELL * REF_CELL)).toFixed(3)
      }
      perFrame.push(box)
      if (box && f < 10) {
        u = {
          x0: Math.min(u.x0, box.x0),
          y0: Math.min(u.y0, box.y0),
          x1: Math.max(u.x1, box.x1),
          y1: Math.max(u.y1, box.y1)
        }
      }
    }

    // Placeholder strip on transparent.
    const strip = mk(STRIP_CELL * FRAMES, STRIP_CELL)
    const sc = strip.getContext('2d')
    for (let f = 0; f < FRAMES; f++) drawFlameFrame(sc, f, f * STRIP_CELL, 0, STRIP_CELL)

    // Review sheet: frames over a stand-in spinner on the lava floor colour.
    const prev = mk(REF_CELL * COLS, REF_CELL * ROWS)
    const pc = prev.getContext('2d')
    pc.fillStyle = '#1a0c04'
    pc.fillRect(0, 0, prev.width, prev.height)
    for (let f = 0; f < FRAMES; f++) {
      const ox = (f % COLS) * REF_CELL
      const oy = Math.floor(f / COLS) * REF_CELL
      pc.beginPath()
      pc.arc(ox + REF_CELL * window.FLAME.ANCHOR_X, oy + REF_CELL * window.FLAME.ANCHOR_Y, REF_CELL * window.FLAME.DISK_R, 0, Math.PI * 2)
      pc.fillStyle = '#3b6fb0'
      pc.fill()
      pc.lineWidth = 4
      pc.strokeStyle = '#0d1a2a'
      pc.stroke()
      pc.drawImage(strip, f * STRIP_CELL, 0, STRIP_CELL, STRIP_CELL, ox, oy, REF_CELL, REF_CELL)
    }

    return {
      ref: ref.toDataURL('image/png'),
      strip: strip.toDataURL('image/webp', 0.9),
      stripPng: strip.toDataURL('image/png'),
      preview: prev.toDataURL('image/png'),
      perFrame,
      union: u,
      anchor: { x: window.FLAME.ANCHOR_X, y: window.FLAME.ANCHOR_Y, diskR: window.FLAME.DISK_R }
    }
  }, { REF_CELL, COLS, ROWS, STRIP_CELL, FRAMES })

  // Finish reference: the house fire + smoke, cut from the strips the game
  // already ships (explosion flames, one dark-smoke puff), on magenta, SQUARE
  // (the last attachment sets the return's shape, so this one goes FIRST and
  // the 4:3 layout reference last). Teaches ink, colour ramp and cel steps —
  // the prompt says it is never a subject.
  const dataUrl = (p) => 'data:image/webp;base64,' + readFileSync(join(ROOT, p)).toString('base64')
  const finish = await page.evaluate(async ({ explosion, smoke }) => {
    const load = (src) => new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = src
    })
    const [ex, sm] = await Promise.all([load(explosion), load(smoke)])
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const g = c.getContext('2d')
    g.fillStyle = '#FF00FF'
    g.fillRect(0, 0, 512, 512)
    // [sheet, frame, frameW, frameH, dx, dy, size]
    const picks = [
      [ex, 1, 160, 160, 16, 16, 224],
      [ex, 2, 160, 160, 272, 16, 224],
      [ex, 11, 160, 160, 16, 272, 224],
      [sm, 4, 128, 128, 288, 288, 192]
    ]
    for (const [img, f, fw, fh, dx, dy, s] of picks) g.drawImage(img, f * fw, 0, fw, fh, dx, dy, s, s)
    return c.toDataURL('image/png')
  }, {
    explosion: dataUrl('public/images/vfx/explosion_2080x160.webp'),
    smoke: dataUrl('public/images/vfx/dark-smoke_1280x128.webp')
  })

  const b64 = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64')
  writeFileSync(join(HERE, 'flame-burn-finish-ref.png'), b64(finish))
  writeFileSync(join(HERE, 'flame-burn-reference.png'), b64(out.ref))
  const fit = {
    note: 'Solid (alpha>140) content box per frame as fractions of a cell; union over frames 0-9 (the flames).',
    grid: { cols: COLS, rows: ROWS, frames: FRAMES, refCell: REF_CELL, stripCell: STRIP_CELL },
    anchor: out.anchor,
    union: out.union,
    perFrame: out.perFrame
  }
  writeFileSync(join(HERE, 'fit.json'), JSON.stringify(fit, null, 2) + '\n')
  console.log('wrote art/flame-burn/flame-burn-reference.png (1024x768) and fit.json')
  console.log('union box', out.union)

  if (wantPlaceholder) {
    const target = join(ROOT, 'public', 'images', 'vfx', 'flame-burn_1536x128.webp')
    const bytes = b64(out.strip)
    writeFileSync(target, bytes)
    console.log(`wrote placeholder strip ${target} (${(bytes.length / 1024).toFixed(1)} kB)`)
  }
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true })
    writeFileSync(join(previewDir, 'flame-procedural-preview.png'), b64(out.preview))
    writeFileSync(join(previewDir, 'flame-procedural-strip.png'), b64(out.stripPng))
    console.log(`wrote review sheets to ${previewDir}`)
  }
} finally {
  await browser.close()
}
