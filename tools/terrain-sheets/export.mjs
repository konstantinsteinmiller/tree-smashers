#!/usr/bin/env node
/**
 * Arena terrain feature reference sheet — the painting reference for the
 * feature sprites (src/use/arenaTerrainArt.ts).
 *
 * Renders the 9 round feature kinds with the REAL draw functions
 * (src/use/arenaTerrainDraw.ts TERRAIN_FEATURE_DRAW), each at a model radius of
 * 20 scaled up so its radius is FEATURE_R_FRAC of a cell, centred, on the
 * magenta key, in a 3 × 3 grid (row-major in KINDS order). Directional kinds
 * (booster, leafArrow) point to the RIGHT (angle 0). Logs are variable-length
 * capsules and stay procedural.
 *
 *   node tools/terrain-sheets/export.mjs [--cell 384]
 *   → art-sheets/terrain/features.png
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const OUT = join(ROOT, 'art-sheets', 'terrain')
export const KINDS = ['stump', 'rock', 'pond', 'mushroom', 'mud', 'deepHole', 'honey', 'booster', 'leafArrow']
export const FEATURE_R_FRAC = 0.36
const args = process.argv.slice(2)
const ci = args.indexOf('--cell')
const cell = ci >= 0 ? Number(args[ci + 1]) : 384

const esbuild = (() => {
  try { return require('esbuild') } catch { return createRequire(require.resolve('tsx'))('esbuild') }
})()
const bundle = await esbuild.build({
  stdin: {
    contents: `import { TERRAIN_FEATURE_DRAW } from '@/use/arenaTerrainDraw'; window.__D = TERRAIN_FEATURE_DRAW`,
    resolveDir: ROOT,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  alias: { '@': join(ROOT, 'src') },
  define: { 'import.meta.env': '{}' },
  logLevel: 'error'
})
const { chromium } = require('playwright')
const profile = mkdtempSync(join(tmpdir(), 'terrain-sheets-'))
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--headless=new']
})
try {
  const page = ctx.pages()[0] ?? await ctx.newPage()
  page.on('pageerror', e => console.error('[page]', e.message))
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const url = await page.evaluate(([KINDS, cell, frac]) => {
    const c = document.createElement('canvas')
    c.width = cell * 3
    c.height = cell * 3
    const x = c.getContext('2d')
    x.fillStyle = '#FF00FF'
    x.fillRect(0, 0, c.width, c.height)
    const R = 20
    const k = (cell * frac) / R
    KINDS.forEach((kind, i) => {
      x.save()
      x.translate((i % 3) * cell + cell / 2, Math.floor(i / 3) * cell + cell / 2)
      x.scale(k, k)
      const f = { x: 0, y: 0, radius: R, angle: 0, kind, deep: kind === 'deepHole' }
      window.__D[kind](x, f)
      x.restore()
    })
    return c.toDataURL('image/png')
  }, [KINDS, cell, FEATURE_R_FRAC])
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'features.png'), Buffer.from(url.split(',')[1], 'base64'))
  console.log('wrote', join(OUT, 'features.png'))
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
