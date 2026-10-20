#!/usr/bin/env node
// Build the sound-review pack: one AAC/MP4 preview per old and new sound
// (the artifact asset store takes video/mp4, and an audio-only MP4 plays in
// every browser's <audio>), plus the review page with its manifest.
//
//   node tools/audio-v2/review-pack.mjs --dir <review dir> [--procedural <dir>]
//
//   <dir>/media/<id>.old.mp4, <id>.new-r<rev>.mp4   previews to upload
//   <dir>/upload-list.json                           media not uploaded yet
//   <dir>/index.html                                 the page (manifest inlined)
//
// Asset URLs of uploaded previews live in tools/audio-v2/review-assets.json
// ({ "<file name>": { url, sha1 } }) so a revision only uploads what changed.
// Revisions per item live in tools/audio-v2/review-revisions.json
// ({ "<id>": [{ rev, note }] }); the newest rev is what the page asks about.
//
// Previews keep the GAME's relative level: a file pair is encoded as-is (old
// and new are both played at the same call-site ratio), a live-synth pair
// (rendered by render-procedural.mjs at in-game scale, i.e. very quiet) gets
// ONE common gain so the louder of the two reaches -20 LUFS momentary.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { CATALOG, GROUPS, UNUSED } from './catalog.mjs'
import { decode, measure, readJson, FFMPEG } from './lib/master.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? resolve(process.argv[i + 1]) : d
}
const DIR = arg('--dir', join(HERE, '.review'))
const PROC = arg('--procedural', join(DIR, 'procedural'))
const MEDIA = join(DIR, 'media')
mkdirSync(MEDIA, { recursive: true })

const report = readJson(join(HERE, 'report.json'), { items: {} })
const assets = readJson(join(HERE, 'review-assets.json'), {})
const revisions = readJson(join(HERE, 'review-revisions.json'), {})
const sha1 = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')

const encode = (src, out, gainDb = 0, stereo = false) => {
  const args = ['-y', '-v', 'error', '-i', src]
  if (gainDb) args.push('-af', `volume=${gainDb.toFixed(2)}dB`)
  args.push('-vn', '-c:a', 'aac', '-b:a', stereo ? '160k' : '112k', '-movflags', '+faststart', '-map_metadata', '-1', out)
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`encode ${out}: ${r.stderr}`)
}

const items = []
const uploads = []
for (const e of CATALOG) {
  const revs = revisions[e.id] ?? [{ rev: 1, note: 'First redesign.' }]
  const rev = revs[revs.length - 1].rev
  let oldSrc = null
  let newSrc = null
  if (e.kind === 'procedural') {
    oldSrc = join(PROC, `${e.id}.old.wav`)
    newSrc = join(PROC, `${e.id}.new.wav`)
  } else {
    if (e.old) oldSrc = join(ROOT, 'public', 'audio', e.old)
    newSrc = join(ROOT, 'public', 'audio', e.new)
  }
  for (const p of [oldSrc, newSrc]) if (p && !existsSync(p)) throw new Error(`missing ${p}`)

  // Common gain for live-synth pairs (see header).
  let gain = 0
  if (e.kind === 'procedural') {
    const lo = measure(decode(oldSrc)).momentaryMax
    const ln = measure(decode(newSrc)).momentaryMax
    gain = Math.round((-20 - Math.max(lo, ln)) * 10) / 10
  }
  const stereo = e.group === 'music' || e.group === 'stingers'
  const media = {}
  for (const [ver, src] of [['old', oldSrc], ['new', newSrc]]) {
    if (!src) continue
    const name = ver === 'old' ? `${e.id}.old.mp4` : `${e.id}.new-r${rev}.mp4`
    const out = join(MEDIA, name)
    encode(src, out, gain, stereo && src.endsWith('.ogg') && decode(src).length === 2)
    const h = sha1(out)
    const known = assets[name]
    if (!known || known.sha1 !== h) uploads.push({ name, path: out, sha1: h })
    media[ver] = { name, url: known && known.sha1 === h ? known.url : null }
  }
  const r = report.items[e.id] ?? {}
  let metrics = null
  if (e.kind === 'procedural' && r.qa) {
    metrics = { oldMomentary: r.qa.old.momentaryMax, newMomentary: r.qa.new.momentaryMax, diffDb: r.qa.loudnessDiffDb, previewGainDb: gain }
  } else if (r.qa) {
    const q = r.qa
    let old = null
    if (e.old) {
      const oc = decode(join(ROOT, 'public', 'audio', e.old))
      const om = measure(oc)
      old = { integrated: om.integrated, momentaryMax: om.momentaryMax, truePeak: om.truePeak, durationSec: Math.round((oc[0].length / 44100) * 100) / 100 }
    }
    metrics = {
      integrated: q.integrated, momentaryMax: q.momentaryMax, truePeak: q.truePeak, durationSec: q.durationSec, bytes: q.bytes,
      loopSec: r.loopSec ?? null, bpm: r.bpm ?? null, seamJumpVsSlope: q.seam?.jumpVsSlope ?? null, target: r.target, old
    }
  }
  items.push({
    id: e.id, group: e.group, kind: e.kind, rev, revisions: revs, plays: e.plays, ratio: e.ratio, intent: e.intent,
    title: e.id, media, metrics
  })
}

const manifest = { generated: new Date().toISOString(), groups: GROUPS, items, unused: UNUSED }
writeFileSync(join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(join(DIR, 'upload-list.json'), JSON.stringify(uploads, null, 2))

// Page: inline the manifest into the template.
const tpl = readFileSync(join(HERE, 'review-page.html'), 'utf8')
const page = tpl.replace('/*__MANIFEST__*/null', JSON.stringify(manifest).replace(/</g, '\\u003c'))
writeFileSync(join(DIR, 'index.html'), page)
console.log(`${items.length} items, ${uploads.length} media files to upload → ${DIR}`)
