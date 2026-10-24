#!/usr/bin/env node
// ─── UI kit screenshot-diff harness (#UX1b) ─────────────────────────────────
//
// Renders dev/ui-kit.html (every button tone × idle / hover / pressed /
// disabled / focus, the hero CTA, icon buttons, the switch + tab pucks, rarity
// cards, plates, the hold-to-confirm ring) and compares each [data-kit-shot]
// block with its baseline PNG in tools/ui-kit-diff/baseline/. A regression in
// the shared recipes (design.sass, the F-components) shows up as a diff image.
//
//   pnpm ui:diff                 compare (exit 1 on any difference)
//   pnpm ui:diff --update        write / refresh the baselines
//   pnpm ui:diff --origin http://127.0.0.1:5173   use a running dev server
//   pnpm ui:diff --probe         also run render-sharpness-guard's blur-probe
//                                on the full-sheet capture (if installed)
//
// Output: tools/ui-kit-diff/out/<shot>.png (current) and <shot>.diff.png
// (changed pixels in berry over a dimmed copy) for every shot that differs.
//
// Determinism: the sheet freezes every animation/transition (html.kit-still),
// the context emulates reduced motion, the fonts are the self-hosted Nunito
// subsets, and captures run at deviceScaleFactor 2 so text is crisp (a blurry
// baseline would hide real regressions; --probe checks that). Hover / focus
// are FORCED over CDP (CSS.forcePseudoState) on [data-kit-hover] /
// [data-kit-focus] — the real :hover / :focus-visible rules, not copies.
// Pixels count as different when any channel moves by more than 40/255; a
// shot fails above 0.15 % different pixels (anti-aliasing noise stays under).
//
// Safety (CLAUDE.md): its OWN headless Chrome on a fresh --user-data-dir and a
// random --remote-debugging-port; its own Vite server on a random port, whose
// <title> is checked before anything is trusted; both are killed on exit.
// Run it through the worker budget: node ~/.claude/skills/worker-budget/budget.mjs run -- pnpm ui:diff

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HERE = path.join(ROOT, 'tools', 'ui-kit-diff')
const BASE_DIR = path.join(HERE, 'baseline')
const OUT_DIR = path.join(HERE, 'out')
const require = createRequire(path.join(ROOT, 'package.json'))
const { chromium } = require('playwright')

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const UPDATE = argv.includes('--update')
const PROBE = argv.includes('--probe')
const CHROME = arg('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
const CHANNEL_TOL = 40
const MAX_DIFF_FRACTION = 0.0015

const children = []
const killAll = () => {
  for (const c of children) {
    if (c.exitCode !== null) continue
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
    else c.kill('SIGTERM')
  }
}
process.on('exit', killAll)
process.on('SIGINT', () => process.exit(130))

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer()
  s.unref()
  s.on('error', reject)
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

const titleOf = async (url) => {
  const html = await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).text()
  return html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
}

// ─── Dev server ─────────────────────────────────────────────────────────────
let origin = arg('origin')
if (!origin) {
  const port = await freePort()
  origin = `http://127.0.0.1:${port}`
  const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' }
  })
  children.push(vite)
  let log = ''
  vite.stdout.on('data', (d) => { log += d })
  vite.stderr.on('data', (d) => { log += d })
  const deadline = Date.now() + 180_000
  let ok = false
  while (Date.now() < deadline && vite.exitCode === null) {
    try { await titleOf(origin); ok = true; break } catch { await sleep(400) }
  }
  if (!ok) { console.error(`ui-kit-diff: dev server never answered\n${log}`); process.exit(2) }
}
const gameTitle = await titleOf(origin)
if (gameTitle !== 'Tree Smashers') { console.error(`ui-kit-diff: ${origin} serves "${gameTitle}", not Tree Smashers — refusing`); process.exit(2) }
const kitUrl = `${origin}/dev/ui-kit.html`
const kitTitle = await titleOf(kitUrl)
if (!kitTitle.startsWith('Tree Smashers')) { console.error(`ui-kit-diff: ${kitUrl} serves "${kitTitle}"`); process.exit(2) }

// ─── Browser ────────────────────────────────────────────────────────────────
const cdpPort = await freePort()
const profile = mkdtempSync(path.join(tmpdir(), 'ui-kit-diff-'))
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${cdpPort}`, '--headless=new', `--user-data-dir=${profile}`,
  '--mute-audio', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank'
], { stdio: 'ignore' })
children.push(chrome)
let browser = null
for (let i = 0; i < 80 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`) } catch { await sleep(250) }
}
if (!browser) { console.error('ui-kit-diff: Chrome did not come up'); process.exit(2) }

let failed = 0
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(kitUrl, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.waitForSelector('html[data-kit-ready="1"]', { timeout: 120_000 })
  await sleep(500) // pucks measure after fonts + a frame

  // Force :hover / :focus / :focus-visible on the marked nodes (real rules).
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  for (const [sel, states] of [['[data-kit-hover]', ['hover']], ['[data-kit-focus]', ['focus', 'focus-visible']]]) {
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel })
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states })
  }
  await sleep(200)

  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(BASE_DIR, { recursive: true })
  const shots = await page.$$eval('[data-kit-shot]', (els) => els.map((e) => e.getAttribute('data-kit-shot')))
  if (PROBE) await page.screenshot({ path: path.join(OUT_DIR, '_sheet.png'), fullPage: true })

  for (const name of shots) {
    const buf = await page.locator(`[data-kit-shot="${name}"]`).screenshot({ animations: 'disabled', caret: 'hide' })
    const basePath = path.join(BASE_DIR, `${name}.png`)
    if (UPDATE || !existsSync(basePath)) {
      writeFileSync(basePath, buf)
      console.log(`  ${name.padEnd(10)} baseline ${UPDATE ? 'updated' : 'created'}`)
      continue
    }
    // Decode + compare in the page (canvas), so the harness needs no PNG lib.
    const res = await page.evaluate(async ({ a, b, tol }) => {
      const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src })
      const [ia, ib] = await Promise.all([load(a), load(b)])
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height] }
      const w = ia.width
      const h = ia.height
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(ia, 0, 0)
      const da = g.getImageData(0, 0, w, h).data
      g.clearRect(0, 0, w, h)
      g.drawImage(ib, 0, 0)
      const db = g.getImageData(0, 0, w, h)
      const out = db.data
      let diff = 0
      for (let p = 0; p < da.length; p += 4) {
        const d = Math.max(Math.abs(da[p] - out[p]), Math.abs(da[p + 1] - out[p + 1]), Math.abs(da[p + 2] - out[p + 2]), Math.abs(da[p + 3] - out[p + 3]))
        if (d > tol) {
          diff++
          out[p] = 242; out[p + 1] = 48; out[p + 2] = 107; out[p + 3] = 255
        } else {
          out[p] = (out[p] + 255 * 2) / 3; out[p + 1] = (out[p + 1] + 255 * 2) / 3; out[p + 2] = (out[p + 2] + 255 * 2) / 3
        }
      }
      g.putImageData(db, 0, 0)
      return { diff, total: w * h, png: diff ? c.toDataURL('image/png') : null }
    }, { a: `data:image/png;base64,${readFileSync(basePath).toString('base64')}`, b: `data:image/png;base64,${buf.toString('base64')}`, tol: CHANNEL_TOL })

    if (res.sizeA) {
      failed++
      writeFileSync(path.join(OUT_DIR, `${name}.png`), buf)
      console.log(`  ${name.padEnd(10)} SIZE CHANGED ${res.sizeA.join('x')} → ${res.sizeB.join('x')}`)
      continue
    }
    const frac = res.diff / res.total
    if (frac > MAX_DIFF_FRACTION) {
      failed++
      writeFileSync(path.join(OUT_DIR, `${name}.png`), buf)
      writeFileSync(path.join(OUT_DIR, `${name}.diff.png`), Buffer.from(res.png.split(',')[1], 'base64'))
      console.log(`  ${name.padEnd(10)} DIFF ${(frac * 100).toFixed(2)} % (${res.diff} px) → out/${name}.diff.png`)
    } else {
      console.log(`  ${name.padEnd(10)} ok${res.diff ? ` (${res.diff} px of noise)` : ''}`)
    }
  }

  // Baselines for shots that no longer exist are stale.
  for (const f of readdirSync(BASE_DIR)) {
    if (f.endsWith('.png') && !shots.includes(f.replace(/\.png$/, ''))) console.log(`  (stale baseline: ${f})`)
  }
  if (errors.length) { failed++; console.log(`  page errors: ${errors.join(' | ').slice(0, 400)}`) }
  await ctx.close()
} finally {
  await browser.close().catch(() => {})
  killAll()
  await sleep(400)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome still releasing files */ }
}

if (PROBE) {
  const probe = path.join(homedir(), '.claude', 'skills', 'render-sharpness-guard', 'scripts', 'blur-probe.mjs')
  if (existsSync(probe)) {
    const r = spawnSync(process.execPath, [probe, 'image', path.join(OUT_DIR, '_sheet.png'), '--project', ROOT], { encoding: 'utf8' })
    process.stdout.write(r.stdout ?? '')
    if (r.status === 2) failed++
  } else {
    console.log('  (blur-probe not installed — skipped)')
  }
}

console.log(failed ? `ui-kit-diff: ${failed} shot(s) differ — look at tools/ui-kit-diff/out/, then --update if intended.` : 'ui-kit-diff: all shots match.')
process.exit(failed ? 1 : 0)
