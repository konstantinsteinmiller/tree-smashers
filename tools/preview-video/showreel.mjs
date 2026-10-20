#!/usr/bin/env node
/**
 * ─── Tree Smashers 12 s showreel ──────────────────────────────────────────────
 *
 *   pnpm preview:reel                          # record the scenes, cut the showreel
 *   pnpm preview:reel --no-record              # re-cut from the recorded scenes
 *   pnpm preview:reel --orientations portrait  # one orientation only
 *   pnpm preview:reel --piranha                # also cut the Piranha-ending reel
 *
 * Five staged scenes, ~2.4-2.67 s each, cut with ~0.27 s transitions into
 * exactly 12.000 s (360 frames @ 30 fps), one reel per orientation:
 *
 *   1  FIRE arena      stage 17 lava  — a red shatters (destroy), blades burn on the rim
 *        ── flash (dip through white) ──
 *   2  HEAL arena      stage 9 forest — rim contacts throw heal pulses
 *        ── whip-pan left (slide + motion blur) ──
 *   3  ICE arena       stage 13 ice   — one hit, then the long glide
 *        ── radial sweep ──
 *   4  BEAR MOTHER     stage 10 boss  — the killing blow, she splits into five
 *        ── whip-pan up ──
 *   5  PHANTOM TWIN    stage 15 boss  — the ghost phases into two halves
 *
 * `--piranha` also cuts `showreel-piranha-…`, which ends on the PIRANHA
 * (stage 35 boss — the killing blow, the swarm bursts out) instead. The reel
 * definitions live in preview.config.mjs (`formats.reel.reels`).
 *
 * Output (gitignored, under preview-videos/showreel/):
 *
 *   showreel-12s-<orientation>-<W>x<H>.mp4           ← UPLOAD THIS (H.264 High, 4:2:0)
 *   showreel-piranha-12s-<orientation>-<W>x<H>.mp4   only with --piranha
 *   lossless/…                                        4:4:4 masters, archive only
 *   contact-<reel>-<orientation>.png                  one frame from the middle of each scene
 *   scenes/<scene>-reel-<orientation>-<W>x<H>.mp4     the raw recorded scenes (lossless)
 *
 * The scenes are recorded by the ordinary recorder (format `reel` in
 * preview.config.mjs — onDemand, so a bare `pnpm preview:video` skips it)
 * with the same virtual clock, seeded RNGs and clean feed as every other
 * clip, so a re-run produces the same reel.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLogger, bytes } from './lib/log.mjs'
import { resolveFfmpeg, probe } from './lib/encode.mjs'
import { REPO_ROOT } from './lib/args.mjs'
import { planReel, reelFilterGraph, selectReels } from './lib/reel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const log = createLogger('reel')

const FPS = 30
const TOTAL_FRAMES = 12 * FPS
/** 8 frames = 0.267 s: long enough to read as a move, short enough to be a cut. */
const TRANSITION_FRAMES = 8

// ── args ──
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: node tools/preview-video/showreel.mjs [--no-record] [--orientations a,b] [--headed]\n` +
    `Records the reel scenes (format "reel") and cuts the 12 s showreels into preview-videos/showreel/.`)
  process.exit(0)
}
const noRecord = argv.includes('--no-record')
const headed = argv.includes('--headed')
const oi = argv.indexOf('--orientations')
const orientationFilter = oi >= 0 ? String(argv[oi + 1] ?? '').split(',').filter(Boolean) : null

const config = (await import(pathToFileURL(join(HERE, 'preview.config.mjs')).href)).default
const format = config.formats?.reel
if (!format) throw new Error('preview.config.mjs has no `reel` format')
const orientations = Object.entries(format.orientations)
  .filter(([id]) => !orientationFilter || orientationFilter.includes(id))
if (orientations.length === 0) throw new Error(`no orientation matches ${orientationFilter}`)

const OUT = join(REPO_ROOT, config.outDir ?? 'preview-videos', 'showreel')
const SCENES = join(OUT, 'scenes')
if (!format.reels) throw new Error('preview.config.mjs `reel` format has no `reels`')
const { reels: REELS, sceneIds } = selectReels(format.reels, argv)
const sourceFrames = Math.round((format.durationMs / 1000) * FPS)

const run = (bin, args, { quiet = false } = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, { cwd: REPO_ROOT, stdio: quiet ? ['ignore', 'ignore', 'pipe'] : 'inherit' })
    let err = ''
    child.stderr?.on('data', (d) => {
      err += d
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`${bin} exited ${code}\n${err.slice(-2000)}`))))
  })

// ── 1. record the scenes ──
if (!noRecord) {
  log.step('recording scenes')
  const args = [
    join(HERE, 'record.mjs'),
    '--formats', 'reel',
    '--scenarios', sceneIds.join(','),
    '--orientations', orientations.map(([id]) => id).join(','),
    '--fps', String(FPS),
    '--out', relative(REPO_ROOT, SCENES)
  ]
  if (headed) args.push('--headed')
  await run(process.execPath, args)
}

// ── 2. cut the reels ──
const ffmpeg = await resolveFfmpeg()
mkdirSync(join(OUT, 'lossless'), { recursive: true })
const results = []

for (const [orientationId, o] of orientations) {
  const size = `${o.width}x${o.height}`
  for (const [reelId, scenes] of REELS) {
    const plan = planReel(scenes, {
      fps: FPS,
      totalFrames: TOTAL_FRAMES,
      transitionFrames: TRANSITION_FRAMES,
      sourceFrames
    })
    const inputs = plan.scenes.map((s) => join(SCENES, `${s.id}-reel-${orientationId}-${size}.mp4`))
    for (const f of inputs) {
      if (!existsSync(f)) throw new Error(`missing scene clip ${relative(REPO_ROOT, f)} — run without --no-record`)
    }
    const { graph, out } = reelFilterGraph(plan, { width: o.width, height: o.height })
    const stem = `${reelId}-12s-${orientationId}-${size}`
    const high = join(OUT, `${stem}.mp4`)
    const master = join(OUT, 'lossless', `${stem}.mp4`)
    log.step(stem)
    for (const s of plan.scenes) {
      log.info(`  ${s.id.padEnd(8)} ${(s.start / FPS).toFixed(2)}–${(s.end / FPS).toFixed(2)} s` +
        `${s.transition ? `  → ${s.transition} @ ${s.offsetSec.toFixed(3)} s` : ''}`)
    }
    await run(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...inputs.flatMap((f) => ['-i', f]),
      '-filter_complex', `${graph};[${out}]split=2[vh][vl];[vh]format=yuv420p[oh];[vl]format=yuv444p[ol]`,
      // Upload copy — same preset as the recorder's `high`.
      '-map', '[oh]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-frames:v', String(TOTAL_FRAMES), '-movflags', '+faststart', '-an', high,
      // Master — lossless in YUV, 4:4:4 (archive only; Safari will not play it).
      '-map', '[ol]', '-c:v', 'libx264', '-preset', 'veryslow', '-qp', '0', '-profile:v', 'high444',
      '-pix_fmt', 'yuv444p', '-r', String(FPS), '-frames:v', String(TOTAL_FRAMES), '-movflags', '+faststart', '-an', master
    ], { quiet: true })

    // Contact sheet: the middle frame of each scene's CLEAR window (no
    // transition over it), side by side.
    const sheet = join(OUT, `contact-${reelId}-${orientationId}.png`)
    const pick = plan.scenes.map((s) => `eq(n\\,${s.midFrame})`).join('+')
    const cell = o.height > o.width ? 'scale=360:-2' : 'scale=640:-2'
    const tile = `tile=${plan.scenes.length}x1:padding=8:color=white`
    await run(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', high,
      '-vf', `select='${pick}',${cell},${tile}`, '-frames:v', '1', '-fps_mode', 'passthrough', sheet
    ], { quiet: true })

    const p = await probe(high)
    results.push({
      file: high,
      sheet,
      p,
      size: statSync(high).size,
      master: statSync(master).size,
      mids: plan.scenes.map((s) => `${s.id}@${(s.midFrame / FPS).toFixed(2)}s`)
    })
  }
}

log.step('results')
for (const r of results) {
  log.ok(`${relative(REPO_ROOT, r.file)} — ${r.p.width}x${r.p.height} ${r.p.profile} ${r.p.pixFmt} ${r.p.fps} fps, ${r.p.frames} frames (${r.p.durationSec} s), ${bytes(r.size)} (master ${bytes(r.master)})`)
  log.info(`   contact sheet ${relative(REPO_ROOT, r.sheet)}  [${r.mids.join(', ')}]`)
}
