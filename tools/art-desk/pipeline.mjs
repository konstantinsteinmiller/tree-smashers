/**
 * A return's way home, one painting at a time:
 *
 *   bytes → painted/<stem>.<ext>  (the previous painting archived, not lost)
 *         → the slicer, on that one file
 *         → the compressor, on exactly the files the slicer wrote
 *
 * The slicer is the authority on whether a return is usable — it refuses a
 * re-composed grid, an unknown shape, a stale painting — so a failure here is
 * its verdict, passed through verbatim, never a guess of ours.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative } from 'node:path'
import { IMAGE_EXT, imageSize } from './jobs.mjs'

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

/** Run argv from the project root, streaming lines to `log`. */
export const run = (argv, { cwd, log }) => new Promise((res) => {
  const [cmd, ...args] = argv
  const child = spawn(cmd === 'node' ? process.execPath : cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0' } })
  let out = ''
  const pipe = (stream, level) => {
    let buf = ''
    stream.setEncoding('utf-8')
    stream.on('data', (d) => {
      buf += d
      const lines = buf.split(/\r?\n/)
      buf = lines.pop()
      for (const l of lines) {
        out += `${l}\n`
        log(l, level)
      }
    })
    stream.on('end', () => {
      if (buf) {
        out += buf
        log(buf, level)
      }
    })
  }
  pipe(child.stdout, 'out')
  pipe(child.stderr, 'err')
  child.on('close', (code) => res({ code, out }))
  child.on('error', (e) => {
    log(String(e), 'err')
    res({ code: -1, out })
  })
})

const fill = (argv, vars) => argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)))

/**
 * File a return under its job's stem.
 *
 * Whatever was there before moves to `painted/replaced/` — the slicer reads
 * only the top level, so an archived painting can never be cut by accident —
 * and its receipt line goes with it: the line described that painting, and
 * left behind it would judge the new one by the old one's reference.
 */
export const fileReturn = (cfg, job, bytes, {
  log = () => {
  }
} = {}) => {
  const size = imageSize(bytes)
  if (!size) throw new Error('that is not a PNG, JPEG or WebP image')
  mkdirSync(cfg.paintedDir, { recursive: true })
  const dest = join(cfg.paintedDir, `${job.stem}.${size.type}`)
  const same = readdirSync(cfg.paintedDir)
    .filter((f) => IMAGE_EXT.test(f) && f.replace(/\.[^.]+$/, '').toLowerCase() === job.stem.toLowerCase())
  if (same.length === 1 && join(cfg.paintedDir, same[0]) === dest && readFileSync(dest).equals(bytes)) {
    log(`${relative(cfg.root, dest)} already holds exactly this image`)
    return { file: dest, size, archived: [] }
  }
  const archived = []
  for (const f of same) {
    const to = join(cfg.paintedDir, 'replaced', `${job.stem}.${stamp()}${extname(f).toLowerCase()}`)
    mkdirSync(dirname(to), { recursive: true })
    renameSync(join(cfg.paintedDir, f), to)
    archived.push(f)
    log(`previous painting ${f} → ${relative(cfg.root, to)}`)
  }
  if (archived.length) {
    const receiptFile = join(cfg.paintedDir, '.sliced.json')
    try {
      const r = JSON.parse(readFileSync(receiptFile, 'utf-8'))
      let dropped = false
      for (const f of archived) if (r.files?.[f]) {
        delete r.files[f]
        dropped = true
      }
      if (dropped) writeFileSync(receiptFile, `${JSON.stringify(r, null, 2)}\n`, 'utf-8')
    } catch { /* no receipt yet */
    }
  }
  writeFileSync(dest, bytes)
  log(`saved ${relative(cfg.root, dest)}  ${size.w}x${size.h} ${size.type}, ${(bytes.length / 1024).toFixed(0)} kB`)
  if (job.refSize) {
    const want = job.refSize.w / job.refSize.h
    const got = size.w / size.h
    if (Math.abs(got / want - 1) > 0.05) {
      log(`! it came back ${got.toFixed(2)}:1 and the reference is ${want.toFixed(2)}:1 — the slicer will probably refuse the grid`, 'err')
    }
  }
  return { file: dest, size, archived }
}

/** mtime+size of every file in the folders a job's targets live in. */
const snapshot = (dirs) => {
  const out = new Map()
  for (const d of dirs) {
    if (!existsSync(d)) continue
    for (const f of readdirSync(d)) {
      const full = join(d, f)
      const st = statSync(full)
      if (st.isFile()) out.set(full, `${st.size}|${st.mtimeMs}`)
    }
  }
  return out
}

/**
 * Slice one painting, then compress what it wrote.
 *
 * What the slicer wrote is found by looking, not by parsing its output: the
 * folders the job's targets live in are snapshotted before and after, so a
 * sheet that also writes resized copies next to its targets gets those
 * compressed too, and no other project's slicer output format matters.
 */
export const sliceAndCompress = async (cfg, job, file, {
  log = () => {
  }
} = {}) => {
  if (!cfg.slice) return { ok: true, written: [], note: 'no slice command configured' }
  const dirs = [...new Set(job.cells.map((c) => dirname(join(cfg.outDir, c.target))))]
  const before = snapshot(dirs)
  log(`slicing ${relative(cfg.root, file)}`)
  const sliced = await run(fill(cfg.slice, { painting: relative(cfg.root, file) }), { cwd: cfg.root, log })
  const after = snapshot(dirs)
  const written = [...after.keys()].filter((f) => before.get(f) !== after.get(f))
  if (sliced.code !== 0 || !written.length) {
    return {
      ok: false,
      stage: 'slice',
      written,
      error: sliced.code !== 0 ? `the slicer refused it (exit ${sliced.code})` : 'the slicer wrote nothing'
    }
  }
  if (!cfg.compress) return { ok: true, written, compressed: 0 }
  const under = written.filter((f) => {
    const rel = relative(cfg.compressRoot, f)
    return rel && !rel.startsWith('..') && !isAbsolute(rel)
  })
  if (!under.length) return { ok: true, written, compressed: 0 }
  log(`compressing ${under.length} file(s)`)
  const packed = await run(fill(cfg.compress, {
    compressRoot: relative(cfg.root, cfg.compressRoot) || '.',
    files: under.map((f) => relative(cfg.root, f)).join(',')
  }), { cwd: cfg.root, log })
  if (packed.code !== 0) return {
    ok: false,
    stage: 'compress',
    written,
    error: `the compressor failed (exit ${packed.code})`
  }
  return { ok: true, written, compressed: under.length }
}

/** The whole trip for a fresh return. */
export const processReturn = async (cfg, job, bytes, {
  log = () => {
  }
} = {}) => {
  const saved = fileReturn(cfg, job, bytes, { log })
  return { saved, ...(await sliceAndCompress(cfg, job, saved.file, { log })) }
}
