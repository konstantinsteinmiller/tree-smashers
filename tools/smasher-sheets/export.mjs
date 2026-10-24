#!/usr/bin/env node
/**
 * Smasher reference sheets for the art desk — `pnpm art:smashers`.
 *
 * Renders every smasher's 32 yaw angles (frame i = i × 11.25°, frame 0 facing
 * the camera, row-major 8 × 4) with the REAL rig (src/smashers/smasherRig.ts,
 * through src/dev/smashersPreview.ts) on the magenta key #FF00FF, into
 * art-sheets/smashers/<id>.png (+ <id>-boss.png with --boss). Angle labels are
 * kept OFF the sheet: art-sheets/smashers/angles.json lists them.
 *
 * The preview module is bundled with esbuild (via tsx's copy) and run in
 * headless system Chrome on a private, throw-away profile — no dev server.
 *
 *   node tools/smasher-sheets/export.mjs [--cell 384] [--boss] [--only vixie,ram] [--bare]
 *   --bare → art-sheets/smashers-bare/: character only, no disc (the PAINTING
 *            reference; the disc is drawn live under the painted character)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const OUT = join(ROOT, 'art-sheets', process.argv.includes('--bare') ? 'smashers-bare' : 'smashers')

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const cell = Number(arg('cell', '384'))
const boss = args.includes('--boss')
const bare = args.includes('--bare')
const only = arg('only', '')?.split(',').filter(Boolean) ?? []

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const esbuild = (() => {
  try { return require('esbuild') } catch { return createRequire(require.resolve('tsx'))('esbuild') }
})()

const bundle = await esbuild.build({
  entryPoints: [join(ROOT, 'src/dev/smashersPreview.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  alias: { '@': join(ROOT, 'src') },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' }, // src/utils/function.ts slices BASE_URL at load
  logLevel: 'error'
})
const code = bundle.outputFiles[0].text

const { chromium } = require('playwright')
const profile = mkdtempSync(join(tmpdir(), 'smasher-sheets-'))
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  args: ['--headless=new']
})
try {
  const page = ctx.pages()[0] ?? await ctx.newPage()
  page.on('pageerror', e => console.error('[page]', e.message))
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: code })
  const overview = arg('overview', '')
  if (overview) {
    const url = await page.evaluate(([c, b]) => window.__smasherOverview(c, b), [Number(arg('cell', '150')), boss])
    writeFileSync(overview, Buffer.from(url.split(',')[1], 'base64'))
    console.log('wrote', overview)
  }
  const ids = overview ? [] : await page.evaluate(() => window.__smasherIds)
  mkdirSync(OUT, { recursive: true })
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue
    const url = await page.evaluate(([i, c, b, d]) => window.__smasherSheet(i, c, b, !d), [id, cell, boss, bare])
    const file = join(OUT, `${id}${boss ? '-boss' : ''}.png`)
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    console.log('wrote', file)
  }
  if (!overview) {
    const angles = Array.from({ length: 32 }, (_, i) => ({
    frame: i, row: Math.floor(i / 8), col: i % 8, yawDeg: i * 11.25,
    label: i === 0 ? 'front' : i === 8 ? 'side (character faces screen-right)' : i === 16 ? 'back' : i === 24 ? 'side (character faces screen-left)' : `${i * 11.25}°`
  }))
  writeFileSync(join(OUT, 'angles.json'), JSON.stringify({ grid: { cols: 8, rows: 4 }, cell, key: '#FF00FF', angles }, null, 2) + '\n')
  }
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
