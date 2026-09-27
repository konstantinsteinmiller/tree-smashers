/**
 * What there is to paint, read from the files the pipeline already writes.
 *
 * A JOB is one generation: a reference image, the prompt block that goes with
 * it, and the stem its return is filed under in `painted/`. Jobs are parsed
 * from `PROMPTS-*.md` rather than imported from the game's manifest, because
 * the prompt documents are the pipeline's portable contract — every project
 * built on the art-generation-pipeline skill writes the same shape:
 *
 *   ## <title>  (<reference>.png[ → <target>])
 *
 *   ```text          (the fence can be longer than three backticks)
 *   …the prompt…
 *   ```
 *
 * and it is exactly the text an operator would otherwise copy by hand, so
 * what is automated is what was being done manually, byte for byte.
 *
 * STATUS is the same four-state answer `tools/art-prompts.mjs` writes into
 * PAINT-STATUS.md, recomputed live: a painting in `painted/`, checked against
 * the slicer's receipt (`painted/.sliced.json`), whose `rev` is the first 12
 * hex of a sha1 over the clean reference it was cut against.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i

/** Every fenced block under a `## title  (file.png …)` heading, in order. */
export const parsePromptDoc = (text, doc) => {
  const lines = text.split(/\r?\n/)
  const jobs = []
  let heading = null
  let attach = []
  for (let i = 0; i < lines.length; i++) {
    const h = /^##\s+(.+?)\s*$/.exec(lines[i])
    if (h) {
      heading = h[1]
      attach = []
      continue
    }
    // Finish references, named under the heading and outside the fence:
    // `Attach, in this order: \`public/…\`, \`public/…\`` — project-relative (DESK.md).
    const a = heading && /^Attach, in this order:\s*(.+)$/.exec(lines[i])
    if (a) {
      attach = [...a[1].matchAll(/`([^`]+)`/g)].map((x) => x[1])
      continue
    }
    const open = /^(`{3,})text\s*$/.exec(lines[i])
    if (!open) continue
    const fence = open[1]
    const body = []
    let j = i + 1
    while (j < lines.length && lines[j] !== fence) body.push(lines[j++])
    i = j
    // The heading names the reference in its LAST parenthesis, so a title
    // with brackets of its own still parses.
    const m = heading && /^(.*?)\s*\(([^()]*?\.png)(?:\s*→\s*([^()]*?))?\)\s*$/.exec(heading)
    heading = null
    if (!m) continue
    jobs.push({ title: m[1].trim(), refName: m[2].trim(), target: m[3]?.trim() || null, prompt: body.join('\n'), doc })
  }
  return jobs
}

/** Width and height of a PNG, JPEG or WebP from its header, or null. */
export const imageSize = (buf) => {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
    type: 'png'
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const m = buf[i + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2
        continue
      }
      const len = buf.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {
        w: buf.readUInt16BE(i + 7),
        h: buf.readUInt16BE(i + 5),
        type: 'jpg'
      }
      i += 2 + len
    }
    return null
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), type: 'webp' }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff), type: 'webp' }
    }
    if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: 'webp' }
  }
  return null
}

const revCache = new Map()
/** First 12 hex of a sha1 over the file — the slicer's and art-prompts' `rev`. */
export const revOf = (file) => {
  if (!existsSync(file)) return null
  const st = statSync(file)
  const key = `${file}|${st.size}|${st.mtimeMs}`
  if (!revCache.has(key)) {
    const buf = readFileSync(file)
    revCache.set(key, { rev: createHash('sha1').update(buf).digest('hex').slice(0, 12), size: imageSize(buf) })
  }
  return revCache.get(key)
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

/**
 * What the index says each reference turns into — the sprite ids a search can
 * find a sheet by, and the target files whose presence says it was sliced.
 */
const indexByStem = (index) => {
  const out = new Map()
  const stem = (f) => basename(f).replace(/\.png$/i, '')
  const cellsOf = (cells) => (cells ?? []).filter((c) => c.target)
    .map((c) => ({ id: c.id, label: c.label, variant: c.variant, target: c.target }))
  for (const s of index?.sheets ?? []) {
    if (s.files?.clean) out.set(stem(s.files.clean), { aliases: [], cells: cellsOf(s.cells), brief: s.brief })
    for (const t of s.singles ?? []) out.set(stem(t.file), { aliases: [], cells: cellsOf(t.cells) })
  }
  // Walks and bands answer to a bare id in the slicer too (`bonecap.png`).
  for (const a of [...(index?.walks ?? []), ...(index?.scenery ?? [])]) {
    out.set(stem(a.file), { aliases: [a.id], cells: [{ id: a.id, label: a.id, target: a.target }] })
  }
  return out
}

/**
 * Every job in the project, with where it stands.
 *
 * `cfg` is the desk's resolved config (absolute paths). Cheap enough to call
 * on every request: the only real work is hashing the references, and that is
 * cached on size + mtime.
 */
export const scanJobs = (cfg) => {
  const docs = existsSync(cfg.sheetsDir)
    ? readdirSync(cfg.sheetsDir).filter((f) => /^PROMPTS-.*\.md$/i.test(f)).sort()
    : []
  const index = readJson(cfg.indexFile, null)
  const byStem = indexByStem(index)
  const receipt = readJson(join(cfg.paintedDir, '.sliced.json'), {}).files ?? {}
  const listImages = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE_EXT.test(f)) : [])
  const paintings = listImages(cfg.paintedDir)
  const parked = listImages(join(cfg.paintedDir, 'stale'))
  const stemOf = (f) => f.replace(/\.[^.]+$/, '').toLowerCase()
  const subdirs = existsSync(cfg.sheetsDir)
    ? readdirSync(cfg.sheetsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : []

  const jobs = []
  const seen = new Set()
  for (const doc of docs) {
    for (const j of parsePromptDoc(readFileSync(join(cfg.sheetsDir, doc), 'utf-8'), doc)) {
      const stem = j.refName.replace(/\.png$/i, '')
      if (seen.has(stem)) continue
      seen.add(stem)
      // Singles live one folder down (`art-sheets/singles/single-<id>.png`).
      const refRel = [j.refName, ...subdirs.map((d) => `${d}/${j.refName}`)]
        .find((r) => existsSync(join(cfg.sheetsDir, r))) ?? null
      const refFile = refRel ? join(cfg.sheetsDir, refRel) : null
      const keyRel = refRel && existsSync(join(cfg.sheetsDir, refRel.replace(/\.png$/i, '-key.png'))) ? refRel.replace(/\.png$/i, '-key.png') : null
      const ref = refFile ? revOf(refFile) : null
      const info = byStem.get(stem) ?? {
        aliases: [],
        cells: j.target ? [{ id: stem, label: j.title, target: j.target }] : []
      }
      const names = [stem, ...info.aliases].map((s) => s.toLowerCase())
      const painting = paintings.find((f) => names.includes(stemOf(f))) ?? null
      const paintingInfo = painting ? revOf(join(cfg.paintedDir, painting)) : null
      const cells = info.cells.map((c) => ({ ...c, onDisk: existsSync(join(cfg.outDir, c.target)) }))
      const onDisk = cells.filter((c) => c.onDisk).length

      let mark
      let state
      let seenBy = painting ? receipt[painting] : null
      // A receipt line belongs to the painting it was written for; the same
      // name with different bytes is a re-roll nobody has sliced yet.
      if (seenBy?.painting && seenBy.painting !== paintingInfo?.rev) seenBy = null
      if (!painting) {
        const old = parked.find((f) => names.includes(stemOf(f)))
        ;[mark, state] = old ? ['!', 'repaint — the old one is parked in painted/stale/'] : ['·', 'not painted yet']
      } else if (seenBy?.rev && ref?.rev && seenBy.rev !== ref.rev) {
        ;[mark, state] = ['!', `repaint — the reference changed (${seenBy.rev} → ${ref.rev})`]
      } else if (!seenBy) {
        ;[mark, state] = ['?', 'painted, not sliced since receipts began']
      } else {
        ;[mark, state] = ['✓', `sliced ${String(seenBy.at).slice(0, 10)}`]
      }

      // A return whose shape is not the reference's is the one the slicer
      // refuses — say so before anybody runs it.
      let aspectWarning = null
      if (ref?.size && paintingInfo?.size) {
        const a = ref.size.w / ref.size.h
        const b = paintingInfo.size.w / paintingInfo.size.h
        if (Math.abs(b / a - 1) > 0.05) aspectWarning = `painted ${paintingInfo.size.w}x${paintingInfo.size.h} is ${(b).toFixed(2)}:1, the reference is ${a.toFixed(2)}:1`
      }

      jobs.push({
        stem,
        title: j.title,
        doc: j.doc,
        kind: stem.includes('-') ? stem.slice(0, stem.indexOf('-')) : 'other',
        prompt: j.prompt,
        ref: refRel,
        key: keyRel,
        refSize: ref?.size ?? null,
        rev: ref?.rev ?? null,
        painting,
        paintingSize: paintingInfo?.size ?? null,
        paintingRev: paintingInfo?.rev ?? null,
        mark,
        state,
        aspectWarning,
        cells,
        onDisk,
        brief: info.brief ?? null,
        // Finish references, attached BEFORE the layout reference: the model
        // takes its shape from the last image it was given (PROMPT-ANATOMY §12).
        styleRefs: j.styleRefs ?? [],
        styleRefsMissing: (j.styleRefs ?? []).filter((f) => !existsSync(join(cfg.root, f)))
      })
    }
  }
  return jobs
}
