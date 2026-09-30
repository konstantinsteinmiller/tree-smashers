#!/usr/bin/env node
/**
 * Bosses 100+ art — bake the procedural fallbacks, export the reference
 * sheets and the master prompts, rewrite the paint status.
 *
 *   node art/bosses/build.mjs            everything below
 *   node art/bosses/build.mjs --force    also re-bake targets that were PAINTED (never do this by accident)
 *
 * 1. FALLBACK ART. Every drawable in manifest.mjs is drawn by its painter
 *    (painters.mjs) and encoded to its drop-in target under public/ — so the
 *    game, the skin shop and the boss badge show the boss art before anything
 *    is painted. A target that no longer matches the recorded bake
 *    (art/bosses/procedural.json) is a PAINTING and is left alone: a re-bake
 *    must never overwrite paint (art-generation-pipeline: a painting is only
 *    replaced by the slicer).
 * 2. REFERENCES into art-sheets/bosses/ (where `pnpm art:desk` finds them):
 *    the skins' house grey layout singles (art/skins/<cls>/single-<id>.png,
 *    from build-refs.mjs) and the badges' grey NOTATION drawn by the same
 *    painter (`notation: true`) — never the shipped file (a reference must
 *    not be a painting of itself).
 * 3. art-sheets/PROMPTS-bosses.md — one fenced block per job, headed
 *    `## title  (ref.png → target)` for the desk's parser.
 * 4. art-sheets/PAINT-STATUS.md (status.mjs).
 *
 * Headless Chrome on Playwright's throw-away profile (like build-refs.mjs).
 * Run `node art/skins/build-refs.mjs --trophies` and
 * `node art/skins/build-prompts.mjs` first when a skin's concept changed.
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOSSES, DRAWABLES, PROCEDURAL_RECEIPT, PROMPT_DOC, REFS_SUBDIR, SHEETS_DIR, badgePrompt } from './manifest.mjs'
import { writeStatus } from './status.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const FORCE = process.argv.includes('--force')
const sha = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12)
const receiptFile = join(ROOT, PROCEDURAL_RECEIPT)
const receipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf-8')) : {}
const refsDir = join(ROOT, SHEETS_DIR, REFS_SUBDIR)
mkdirSync(refsDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => {
    console.error(`page error: ${e.message}`)
    process.exitCode = 1
  })
  await page.goto('about:blank')
  await page.addScriptTag({ type: 'module', content: readFileSync(join(HERE, 'painters.mjs'), 'utf-8') })
  await page.waitForFunction(() => window.BOSS_PAINTERS)

  const render = (key, { size, canvas = size, ground = null, notation = false, type = 'image/png', quality }) =>
    page.evaluate(({ key, size, canvas, ground, notation, type, quality }) => {
      const c = document.createElement('canvas')
      c.width = canvas
      c.height = canvas
      const x = c.getContext('2d')
      if (ground) {
        x.fillStyle = ground
        x.fillRect(0, 0, canvas, canvas)
      }
      x.translate((canvas - size) / 2, (canvas - size) / 2)
      window.BOSS_PAINTERS[key](x, size, { notation })
      return c.toDataURL(type, quality).split(',')[1]
    }, { key, size, canvas, ground, notation, type, quality }).then((b64) => Buffer.from(b64, 'base64'))

  // 1. fallback art
  for (const d of DRAWABLES) {
    const file = join(ROOT, 'public', d.target)
    const onDisk = existsSync(file) ? sha(readFileSync(file)) : null
    if (onDisk && receipt[d.target] !== onDisk && !FORCE) {
      console.log(`painted   ${d.target} — kept (not the procedural bake; --force re-bakes)`)
      continue
    }
    const webp = await render(d.key, { size: d.size, type: 'image/webp', quality: 0.9 })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, webp)
    receipt[d.target] = sha(webp)
    console.log(`baked     ${d.target} (${(webp.length / 1024).toFixed(1)} kB)`)
  }
  writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8')

  // 2. references
  for (const d of DRAWABLES) {
    const out = join(refsDir, `${d.stem}.png`)
    if (d.refSource) {
      const src = join(ROOT, d.refSource)
      if (!existsSync(src)) throw new Error(`${d.refSource} missing — run node art/skins/build-refs.mjs --trophies`)
      copyFileSync(src, out)
    } else {
      writeFileSync(out, await render(d.key, { size: 760, canvas: 1024, ground: '#FF00FF', notation: true }))
    }
  }
  console.log(`refs      ${DRAWABLES.length} → ${SHEETS_DIR}/${REFS_SUBDIR}/`)
} finally {
  await browser.close()
}

// 3. prompt document (the desk's contract: `## title  (ref.png → target)` + one fenced block)
const fenceFor = (body) => '`'.repeat(Math.max(3, Math.max(0, ...(body.match(/`+/g) ?? []).map((r) => r.length)) + 1))
const md = [
  '# Boss art prompts — Chaos Arena (generated by art/bosses/build.mjs — do not edit by hand)',
  '',
  'Bosses 100+ (bosses-100-feature.md §7.1): the three trophy skins and the three boss badges.',
  'Until a sheet is painted the game ships its procedural drawing (art/bosses/painters.mjs) at the target.',
  '',
  'Paint: attach the finish references listed under a heading FIRST, the layout reference LAST, then paste ONLY the fenced block.',
  'Or `pnpm art:desk` → search the sprite name → Copy image, then prompt. Returns are sliced by art/bosses/slice-return.mjs.',
  ''
]
for (const d of DRAWABLES) {
  const prompt = d.promptFile
    ? readFileSync(join(ROOT, d.promptFile), 'utf-8')
    : badgePrompt(BOSSES.find((b) => b.encounter === d.encounter))
  md.push(`## ${d.title}  (${d.stem}.png → ${d.target})`, '')
  md.push(`Attach, in this order: ${d.finishRefs.map((f) => `\`${f}\``).join(', ')}, then \`${SHEETS_DIR}/${REFS_SUBDIR}/${d.stem}.png\` LAST.`, '')
  if (d.freePromptFile) md.push(`(If the return sits on a grey backing plate, re-paint with \`${d.freePromptFile}\` and finish refs only — art/skins/README.md.)`, '')
  md.push(`${fenceFor(prompt)}text`, prompt.trimEnd(), fenceFor(prompt), '')
}
writeFileSync(join(ROOT, SHEETS_DIR, PROMPT_DOC), md.join('\n'), 'utf-8')
console.log(`prompts   ${SHEETS_DIR}/${PROMPT_DOC} (${DRAWABLES.length} jobs)`)

// 4. status
const rows = writeStatus(ROOT)
console.log(`status    ${SHEETS_DIR}/PAINT-STATUS.md — ${rows.filter((r) => r.needsPainting).length} need painting`)
