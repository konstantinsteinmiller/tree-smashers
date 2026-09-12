// ─── PNG frames → mp4 ───────────────────────────────────────────────────────
//
// ffmpeg comes from the `ffmpeg-static` npm package — no system install, no
// python, no binary the user has to find. One long-lived ffmpeg process per
// clip with the frames written to its stdin, so nothing but the finished mp4
// ever touches the disk (a 10 s 720p run is ~300 PNGs and ~90 MB of temp files
// you would otherwise write and delete).
//
// ── About "lossless", measured rather than assumed ──
//
// `-qp 0` alone is not lossless: H.264's default 4:2:0 throws away three
// quarters of the colour information before the encoder ever sees it. So
// `lossless` uses 4:4:4 (High 4:4:4 Predictive), which keeps every chroma
// sample — but a PNG is RGB and H.264 is YUV, and THAT conversion rounds. A
// measured round-trip of flat saturated game art through `lossless` comes back
// off by up to 2/255 on 60 % of subpixels: invisible, and not bit-exact.
//
// `lossless-rgb` is the one that is actually bit-exact — libx264rgb, no
// colourspace conversion at all, verified byte-for-byte. It is also the least
// playable file of the three; treat it as an archival master.
//
// The practical ladder:
//   lossless-rgb  bit-exact master. Almost nothing plays it. Largest.
//   lossless      visually perfect master (±2/255 from the YUV round-trip).
//                 Safari and QuickTime refuse 4:4:4.
//   high          crf 14 yuv420p — visually lossless, plays everywhere.
//                 THIS is what a portal upload wants.
//   balanced      crf 20 yuv420p — for a quick look or an email.

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

/** @type {Record<string, string[]>} */
export const QUALITY_PRESETS = {
  'lossless-rgb': ['-c:v', 'libx264rgb', '-preset', 'veryslow', '-qp', '0', '-pix_fmt', 'rgb24'],
  lossless: ['-c:v', 'libx264', '-preset', 'veryslow', '-qp', '0', '-pix_fmt', 'yuv444p', '-profile:v', 'high444'],
  high: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high'],
  balanced: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high']
}

/** The note that saves someone twenty minutes wondering why QuickTime shows black. */
export const QUALITY_NOTES = {
  lossless:
    'quality=lossless writes High 4:4:4 H.264 (qp 0) — visually perfect, but the RGB→YUV conversion ' +
    'still rounds by up to 2/255, and Safari/QuickTime cannot play 4:4:4. Use --quality high for a ' +
    'portal upload, or --quality lossless-rgb for a bit-exact master.',
  'lossless-rgb':
    'quality=lossless-rgb is bit-exact (libx264rgb, no colourspace conversion) and correspondingly ' +
    'large. Almost no player or portal accepts it — keep it as an archival master and upload --quality high.'
}
/** @deprecated kept so an older caller still compiles. */
export const LOSSLESS_NOTE = QUALITY_NOTES.lossless

let ffmpegPath

async function resolveFfmpeg() {
  if (ffmpegPath) return ffmpegPath
  try {
    const mod = await import('ffmpeg-static')
    ffmpegPath = mod.default ?? mod
  } catch (err) {
    throw new Error(`Could not load ffmpeg-static (${err.message}). Install it with \`pnpm add -D ffmpeg-static\`.`)
  }
  if (!ffmpegPath || typeof ffmpegPath !== 'string') {
    throw new Error(
      'ffmpeg-static resolved without a binary path.\n' +
      'pnpm blocks postinstall scripts by default — run:\n' +
      '  node node_modules/ffmpeg-static/install.js\n' +
      'or add "ffmpeg-static" to pnpm.onlyBuiltDependencies in package.json and reinstall.'
    )
  }
  return ffmpegPath
}

/** Exposed so a caller can probe the finished file. */
export { resolveFfmpeg }

/**
 * @param {object} o
 * @param {string} o.outFile
 * @param {number} o.fps
 * @param {'lossless'|'high'|'balanced'} o.quality
 * @param {import('./types.js').Logger} [o.log]
 */
export async function createEncoder({ outFile, fps, quality, log }) {
  const bin = await resolveFfmpeg()
  const preset = QUALITY_PRESETS[quality]
  if (!preset) throw new Error(`Unknown quality "${quality}" — expected ${Object.keys(QUALITY_PRESETS).join(' | ')}`)

  mkdirSync(dirname(outFile), { recursive: true })

  const args = [
    '-y',
    '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', 'pipe:0',
    ...preset,
    '-r', String(fps),
    '-movflags', '+faststart',
    '-an',
    outFile
  ]

  const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  /** @type {string[]} */
  const stderr = []
  child.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stderr.push(line)
    }
    while (stderr.length > 80) stderr.shift()
  })

  let exited = null
  const closed = once(child, 'close').then(([code]) => {
    exited = code ?? 0
    return exited
  })
  // An EPIPE on stdin just means ffmpeg died first; `finish()` reports why.
  child.stdin.on('error', () => {
  })

  const fail = (what) => new Error(`${what}\n--- ffmpeg ---\n${stderr.slice(-40).join('\n')}`)

  return {
    args,
    async write(png) {
      if (exited !== null) throw fail(`ffmpeg exited (code ${exited}) before the frames were written.`)
      if (!child.stdin.write(png)) await once(child.stdin, 'drain')
    },
    async finish() {
      child.stdin.end()
      const code = await closed
      if (code !== 0) throw fail(`ffmpeg exited with code ${code}.`)
      const bytes = statSync(outFile).size
      if (bytes === 0) throw fail('ffmpeg wrote an empty file.')
      log?.info(`encoded ${outFile}`)
      return { path: outFile, bytes }
    },
    abort() {
      try {
        child.stdin.destroy()
      } catch { /* gone */
      }
      try {
        child.kill('SIGKILL')
      } catch { /* gone */
      }
    }
  }
}

/**
 * Read back what we actually wrote — resolution, duration, pixel format —
 * straight from ffmpeg's own report. `ffprobe` is not in the ffmpeg-static
 * package, so this parses the stderr banner of a no-op decode instead.
 *
 * @param {string} file
 */
export async function probe(file) {
  const bin = await resolveFfmpeg()
  const child = spawn(bin, ['-hide_banner', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let text = ''
  child.stderr.on('data', (c) => {
    text += c
  })
  await once(child, 'close')
  const stream = /Stream #0:0[^\n]*Video:\s*([^\n]*)/.exec(text)?.[1] ?? ''
  const size = /(\d{2,5})x(\d{2,5})/.exec(stream)
  const dur = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(text)
  const frames = /frame=\s*(\d+)/g
  let lastFrame = null
  for (const m of text.matchAll(frames)) lastFrame = Number(m[1])
  return {
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    pixFmt: /yuv\w+/.exec(stream)?.[0] ?? null,
    profile: /\((High[^)]*|Main|Baseline)\)/.exec(stream)?.[1] ?? null,
    fps: Number(/([\d.]+)\s*fps/.exec(stream)?.[1] ?? NaN),
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    frames: lastFrame,
    raw: stream.trim()
  }
}
