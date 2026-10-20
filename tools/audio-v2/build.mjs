#!/usr/bin/env node
// Tree Smashers audio v2 — render, level, encode and QA every new sound.
//
//   node tools/audio-v2/build.mjs                  all music + SFX
//   node tools/audio-v2/build.mjs --only clash-1,battle-2
//   node tools/audio-v2/build.mjs --wav <dir>      also keep float WAV masters
//   node tools/audio-v2/build.mjs --debug          per-bus loudness of each song
//
// Output: public/audio/v2/music/*.ogg (stereo loops), public/audio/v2/sfx/*.ogg
// (SFX mono, stingers stereo) and tools/audio-v2/report.json with the QA
// numbers measured on the DECODED .ogg (what the game actually plays):
// integrated / max-momentary loudness, true peak, loop-seam continuity,
// high-band (harshness) and sub-band (rumble) energy share, DC offset.
//
// Levels: music -16 LUFS integrated, SFX at per-sound momentary targets
// (sfx.mjs) chosen against the old files so the in-game mix ratios stay
// valid; every file ≤ -1 dBTP after encoding.

import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SR, biquad, compress, edgeFades, gainToDb } from './lib/dsp.mjs'
import { measure, normalize, wrapLoop, seamCheck, writeWav, encodeOgg, decode, readJson, limitTo } from './lib/master.mjs'
import { SFX } from './sfx.mjs'
import { MUSIC } from './music.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(ROOT, 'public', 'audio', 'v2')
const REPORT = join(HERE, 'report.json')

const MUSIC_LUFS = -16
const STING_MOMENTARY = { win: -11, lose: -11.5 }
const TP_CEIL = -1.0

const args = process.argv.slice(2)
const argVal = (k) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : null
}
const only = argVal('--only')?.split(',').map((s) => s.trim())
const wavDir = argVal('--wav')
const debug = args.includes('--debug')
const want = (id) => !only || only.includes(id)

const tmp = mkdtempSync(join(tmpdir(), 'ts-audio-v2-'))
const report = readJson(REPORT, { generated: null, items: {} })

const bandShare = (chans, mode, fc) => {
  let tot = 0, band = 0
  for (const c of chans) {
    const f = biquad(biquad(c, mode, fc, 0.707), mode, fc, 0.707)
    for (let i = 0; i < c.length; i++) {
      tot += c[i] * c[i]
      band += f[i] * f[i]
    }
  }
  return tot > 0 ? Math.round((band / tot) * 1000) / 10 : 0
}

const qa = (path, { loop = false } = {}) => {
  const chans = decode(path, { rate: SR })
  const m = measure(chans)
  let dc = 0
  for (const c of chans) {
    let s = 0
    for (let i = 0; i < c.length; i++) s += c[i]
    dc = Math.max(dc, Math.abs(s / c.length))
  }
  const res = {
    ...m,
    durationSec: Math.round((chans[0].length / SR) * 1000) / 1000,
    channels: chans.length,
    bytes: statSync(path).size,
    highShare8k: bandShare(chans, 'hp', 8000),
    subShare40: bandShare(chans, 'lp', 40),
    dcOffset: Math.round(dc * 1e6) / 1e6
  }
  if (loop) res.seam = seamCheck(chans)
  if (chans.length === 2) {
    let lr = 0, ll = 0, rr = 0
    for (let i = 0; i < chans[0].length; i++) {
      lr += chans[0][i] * chans[1][i]
      ll += chans[0][i] ** 2
      rr += chans[1][i] ** 2
    }
    res.stereoCorrelation = Math.round((lr / Math.sqrt(ll * rr)) * 100) / 100
  }
  return res
}

const done = []

// ─── SFX ──────────────────────────────────────────────────────────────────
for (const [id, def] of Object.entries(SFX)) {
  if (!want(id)) continue
  const t0 = Date.now()
  const raw = def.fn()
  const chans = [Float32Array.from(raw)]
  const pre = measure(chans)
  const lvl = normalize(chans, { target: def.target, mode: 'momentary', ceiling: TP_CEIL - 0.8 })
  edgeFades(chans[0], 0.5, 15)
  const wav = join(wavDir ?? tmp, `sfx-${id}.wav`)
  writeWav(wav, chans)
  const out = join(OUT, 'sfx', `${id}.ogg`)
  encodeOgg(wav, out, { quality: 4 })
  const q = qa(out)
  report.items[id] = { file: `public/audio/v2/sfx/${id}.ogg`, kind: 'sfx', target: { momentary: def.target, truePeak: TP_CEIL }, render: { rawMomentary: pre.momentaryMax, ...lvl }, qa: q }
  done.push(`${id.padEnd(18)} M ${String(q.momentaryMax).padStart(6)} (target ${def.target})  TP ${String(q.truePeak).padStart(5)}  ${q.durationSec}s  ${q.bytes} B  hi8k ${q.highShare8k}%  ${Date.now() - t0} ms${lvl.limited ? '  [limited ' + lvl.tpBeforeLimit + ' dBTP]' : ''}`)
}

// ─── Music + stingers ─────────────────────────────────────────────────────
for (const [id, def] of Object.entries(MUSIC)) {
  if (!want(id)) continue
  const t0 = Date.now()
  const { song, sting, totalSec, master } = def.fn()
  const mixed = song.render({})
  if (debug) {
    for (const b of song.buses.values()) {
      const m = measure([b.L, b.R])
      console.log(`  ${id} bus ${b.name.padEnd(6)} I ${m.integrated} gain ${b.measured?.gainDb} dB (lvl ${b.lvl})`)
    }
  }
  let chans
  if (sting) {
    const n = Math.round(totalSec * SR)
    chans = [mixed.L.slice(0, n), mixed.R.slice(0, n)]
    const fade = Math.round(0.6 * SR)
    for (const c of chans) for (let i = 0; i < fade; i++) c[n - 1 - i] *= Math.pow(i / fade, 1.5)
  } else {
    chans = wrapLoop([mixed.L, mixed.R], Math.round(song.loopSec * SR))
  }
  const bus = { L: chans[0], R: chans[1] }
  if (master?.glue) compress(bus, master.glue)
  // Gentle master EQ: tame the sub rumble, a touch of air.
  chans = [biquad(bus.L, 'hp', 30, 0.7), biquad(bus.R, 'hp', 30, 0.7)]
  const pre = measure(chans)
  const lvl = sting
    ? normalize(chans, { target: STING_MOMENTARY[id], mode: 'momentary', ceiling: TP_CEIL - 0.5 })
    : normalize(chans, { target: MUSIC_LUFS, mode: 'integrated', ceiling: TP_CEIL - 0.5 })
  limitTo(chans, TP_CEIL - 0.6)
  const wav = join(wavDir ?? tmp, `music-${id}.wav`)
  writeWav(wav, chans)
  const out = sting ? join(OUT, 'sfx', `${id}.ogg`) : join(OUT, 'music', `${id}.ogg`)
  encodeOgg(wav, out, { quality: sting ? 4 : 2 })
  const q = qa(out, { loop: !sting })
  report.items[id] = {
    file: out.slice(ROOT.length + 1).replaceAll('\\', '/'), kind: sting ? 'stinger' : 'music', bpm: song.bpm,
    loopBeats: sting ? null : song.loopBeats, loopSec: sting ? null : Math.round(song.loopSec * 1000) / 1000,
    target: sting ? { momentary: STING_MOMENTARY[id], truePeak: TP_CEIL } : { integrated: MUSIC_LUFS, truePeak: TP_CEIL },
    render: { rawIntegrated: pre.integrated, ...lvl }, qa: q
  }
  done.push(`${id.padEnd(18)} I ${String(q.integrated).padStart(6)} M ${q.momentaryMax} TP ${String(q.truePeak).padStart(5)}  ${q.durationSec}s  ${q.bytes} B  corr ${q.stereoCorrelation}${q.seam ? `  seam step ${q.seam.levelStepDb} dB jump/slope ${q.seam.jumpVsSlope}` : ''}  ${Date.now() - t0} ms${lvl.limited ? '  [limited ' + lvl.tpBeforeLimit + ']' : ''}`)
}

report.generated = new Date().toISOString()
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n')
rmSync(tmp, { recursive: true, force: true })
console.log(done.join('\n'))
