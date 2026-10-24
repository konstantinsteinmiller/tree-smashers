#!/usr/bin/env node
/**
 * Painted reward-reveal gift (RewardRevealHost.vue) — one TEXT-ONLY Gemini job
 * through tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.mjs.
 *
 *   node tools/gift-art/paint-queue.mjs [--force] [--no-pack]
 *
 * One painting, two parts on flat magenta: the LID with its bow on top, the BOX
 * body below, separated by a clear magenta band (so the lid can fly off).
 * Writes art-sheets/gift/gift.prompt.txt, paints art-sheets/painted/reveal-gift.png
 * (skipped when it exists unless --force), packs. If pack.mjs can't separate the
 * two parts (exit 3) the painting is redone, at most 2 more times.
 * Stops on SIGNED_OUT (exit 10) and QUOTA (exit 11). Log: art-sheets/gift-queue.log
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = join(ROOT, 'art-sheets')
export const PROMPT_FILE = join(A, 'gift', 'gift.prompt.txt')
export const PAINTING = join(A, 'painted', 'reveal-gift.png')

export const PROMPT = [
  'Paint ONE game prop for "Tree Smashers", a cosy, bright cartoon toy game: a chunky TOY PRESENT (gift box) shown as TWO SEPARATE PARTS, for an opening animation where the lid flies off.',
  'Part 1, TOP of the image: the gift LID on its own — a wide, shallow, rounded box lid in royal blue (#3b5bdb-ish) with a lighter sky-blue top face, a sun-yellow ribbon band running down its front, and a BIG chunky sun-yellow bow sitting on top of it (two fat rounded loops and a round knot in the middle, slightly darker yellow-orange shade inside the loops).',
  'Part 2, BOTTOM of the image: the gift BOX BODY on its own, without its lid — a chunky, slightly rounded cube-ish box in royal blue with a sun-yellow vertical ribbon band down the middle of its front face; its open top edge is hidden behind a flat top rim, no inside visible.',
  'Both parts: the same front three-quarter view from slightly above, the same width (the lid a little wider than the body, as a real lid overhangs), both upright and centred horizontally. The lid must look like it fits exactly on the body.',
  'Separation: a CLEAR horizontal band of empty flat magenta, at least 12% of the image height, between the bottom of the lid and the top of the body. Nothing touches or overlaps across that band — no ribbon ends, no shadow.',
  'Style: a bright, chunky, toy-like game prop — smooth painted surfaces like a well-made glossy plastic or painted wooden toy. NO stitches, NO seams, NO felt, NO fabric or paper texture, NO wrapping-paper pattern. A bold, even, dark navy (#161a40) outline around every part and its main shapes, flat cel shading with at most two tones per colour (a lit face and a shaded side), simple readable shapes, no tiny details.',
  'Colours: royal blue and sky blue for the box and lid, sun yellow for ribbon and bow, white only for one or two small flat highlights. NO brown, NO gold metal, NO pink or purple anywhere on the gift.',
  'NO glow, NO sparkles, NO blur, NO soft drop shadow, NO shadow on the ground, NO radial gradients, NO text, NO letters, NO frame.',
  'Composition: a SQUARE 1:1 image. Lid in the upper ~40%, body in the lower ~50%, together filling about 85% of the width, with an even margin on every side.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around and between the parts — no gradient, no texture, no shadow on it, no magenta inside the gift. It will be keyed to transparency.',
  'Generate the image now.'
].join('\n')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const LOG = join(A, 'gift-queue.log')
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(LOG, l + '\n') }
  const node = (script, extra = []) => spawnSync(process.execPath, [join(ROOT, 'tools', ...script), ...extra],
    { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 60 * 60_000 })
  mkdirSync(dirname(PROMPT_FILE), { recursive: true })
  writeFileSync(PROMPT_FILE, PROMPT + '\n')
  const paint = () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`gift: painting (attempt ${attempt})`)
      const r = node(['art-desk', 'paint.mjs'], ['--prompt-file', PROMPT_FILE, '--out', PAINTING])
      const line = (r.stdout ?? '').trim().split('\n').pop() ?? ''
      if (r.status === 0) { log(`gift: OK ${line}`); return true }
      log(`gift: exit ${r.status} ${line}`)
      if (r.status === 10 || r.status === 11) { log(`STOP (${r.status === 10 ? 'SIGNED_OUT' : 'QUOTA'})`); process.exit(r.status) }
    }
    return false
  }
  if ((args.includes('--force') || !existsSync(PAINTING)) && !paint()) { log('gift: painting failed'); process.exit(1) }
  if (args.includes('--no-pack')) process.exit(0)
  for (let redo = 0; ; redo++) {
    const p = node(['gift-art', 'pack.mjs'])
    log(`pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
    if (p.status === 0) break
    if (p.status !== 3 || redo >= 2) { log('gift: pack failed — CSS gift stays'); process.exit(1) }
    renameSync(PAINTING, PAINTING.replace(/\.png$/, `.rejected-${redo + 1}.png`))
    if (!paint()) process.exit(1)
  }
  log('queue done')
}
