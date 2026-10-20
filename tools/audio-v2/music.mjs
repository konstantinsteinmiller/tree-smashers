// Tree Smashers audio v2 — composed music loops and stingers.
//
// Every track is written here as notes + patterns and rendered offline by
// the instruments in lib/. Loops are rendered with a tail and wrapped so the
// loop point is seamless (see lib/master.wrapLoop).

import { SR, mtof, midi, rng, buf, mix, scale } from './lib/dsp.mjs'
import * as I from './lib/instruments.mjs'
import { Song, parseLine, chordNote, shape } from './lib/seq.mjs'

// ─── Shared helpers ───────────────────────────────────────────────────────

const memo = new Map()
const cached = (key, fn) => {
  if (!memo.has(key)) memo.set(key, fn())
  return memo.get(key)
}

/**
 * Drum pattern string, one char per 16th: X accent, x normal, o ghost, . rest.
 * `voice(vel, k)` renders a hit (k = variant index for humanising).
 */
const drumPattern = (song, bus, pattern, startBeat, voice, { gain = 1, pan = 0, humanMs = 4, seed = 1 } = {}) => {
  const r = rng(seed + startBeat * 13)
  const steps = pattern.replace(/\s|\|/g, '')
  for (let i = 0; i < steps.length; i++) {
    const c = steps[i]
    if (c === '.') continue
    const vel = c === 'X' ? 1 : c === 'x' ? 0.72 : 0.42
    const k = Math.floor(r() * 4)
    const src = voice(vel, k)
    const t = song.t(startBeat + i * 0.25) + ((r() * 2 - 1) * humanMs) / 1000
    song.add(bus, src, 0, { gain, pan, absSec: Math.max(0, t) })
  }
}

const v = (fn, name) => (vel, k) => cached(`${name}:${vel}:${k}`, () => fn(vel, k))

const KICK = v((vel, k) => I.kick(vel, { seed: 10 + k }), 'kick')
const KICK_SOFT = v((vel, k) => I.kick(vel * 0.8, { seed: 20 + k, tune: 0.92, punch: 0.4 }), 'kicksoft')
const SNARE = v((vel, k) => I.snare(vel, { seed: 30 + k }), 'snare')
const CLAP = v((vel, k) => I.clap(vel, { seed: 40 + k }), 'clap')
const SHAKER = v((vel, k) => I.shaker(vel, { seed: 50 + k }), 'shaker')
const SHAKER_LONG = v((vel, k) => I.shaker(vel, { seed: 55 + k, len: 2.2 }), 'shakerlong')
const TAMB = v((vel, k) => I.tambourine(vel, { seed: 60 + k }), 'tamb')
const FRAME = v((vel, k) => I.frameDrum(vel, { seed: 70 + k }), 'frame')
const FRAME_HI = v((vel, k) => I.frameDrum(vel, { seed: 75 + k, tune: 1.45, open: 0.7 }), 'framehi')
const TAIKO = v((vel, k) => I.taiko(vel, { seed: 80 + k }), 'taiko')
const TAIKO_HI = v((vel, k) => I.taiko(vel, { seed: 85 + k, tune: 1.5, len: 0.6 }), 'taikohi')
const BLOCK = v((vel, k) => I.woodblock(vel, { seed: 90 + k, f: 760 + k * 12 }), 'block')
const BLOCK_HI = v((vel, k) => I.woodblock(vel, { seed: 95 + k, f: 1180 + k * 15 }), 'blockhi')

const placeLine = (song, bus, text, startBeat, voice, { unit = 0.5, gain = 1, pan = 0, transpose = 0 } = {}) => {
  const { notes } = parseLine(text, unit)
  for (const n of notes) {
    const f = mtof(n.m + transpose)
    song.add(bus, voice(f, n), startBeat + n.beat, { gain, pan })
  }
  return notes
}

/** Whistle / lead: one legato line rendered as one voice. */
const placeLead = (song, bus, text, startBeat, { unit = 0.5, gain = 1, pan = 0, transpose = 0, staccato = 0.92, ...opts } = {}) => {
  const { notes, beats } = parseLine(text, unit)
  const ev = notes.map((n) => ({ t: song.beatSec(n.beat), dur: song.beatSec(n.dur) * staccato, f: mtof(n.m + transpose), vel: 1 }))
  const line = I.whistleLine(ev, song.beatSec(beats) + 0.6, opts)
  song.add(bus, line, startBeat, { gain, pan })
}

const strumBar = (song, bus, chordName, startBeat, pattern, { gain = 1, pan = 0, mute = 0, seed = 1, bright = 0.5 } = {}) => {
  // pattern: 8 chars per bar of 8ths: D down, U up, d soft down, . rest, m muted
  const freqs = shape(chordName)
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '.') continue
    const dir = c === 'U' || c === 'u' ? 'up' : 'down'
    const vel = c === 'D' ? 1 : c === 'U' ? 0.75 : c === 'm' ? 0.7 : 0.55
    const mt = c === 'm' ? 0.9 : mute
    const s = cached(`strum:${chordName}:${dir}:${vel}:${mt}:${(seed + i) % 3}:${bright}`, () =>
      I.strum(freqs, vel, { dir, sec: mt ? 0.35 : 1.1, mute: mt, seed: 300 + ((seed + i) % 3) * 17, bright }))
    song.add(bus, s, startBeat + i * 0.5, { gain, pan })
  }
}

// Bass line: degrees per 8th (R=0, 3rd=1, 5th=2, octave=3; 'x' = rest).
const bassBar = (song, bus, chordName, startBeat, degrees, { octave = 2, gain = 1, gate = 0.42, unit = 0.5 } = {}) => {
  degrees.forEach((d, i) => {
    if (d === null) return
    const m = chordNote(chordName, d, octave)
    const s = cached(`bass:${m}:${gate}:${i % 2}`, () => I.bass(mtof(m), 1, { gate: song.beatSec(unit) * gate * 2, seed: 500 + (i % 2) }))
    song.add(bus, s, startBeat + i * unit, { gain: gain * (i === 0 ? 1 : 0.85) })
  })
}

const arpBar = (song, bus, chordName, startBeat, degrees, voice, { octave = 4, unit = 0.5, gain = 1, pan = 0 } = {}) => {
  degrees.forEach((d, i) => {
    if (d === null) return
    const m = chordNote(chordName, d, octave)
    song.add(bus, voice(mtof(m), i), startBeat + i * unit, { gain: gain * (i % 2 ? 0.8 : 1), pan })
  })
}

const padChord = (song, bus, chordName, startBeat, beats, { octave = 3, gain = 1, cutoff = 1100, attack = 0.35, type = 'saw' } = {}) => {
  ;[0, 1, 2].forEach((d, k) => {
    const m = chordNote(chordName, d, octave)
    const s = I.padNote(mtof(m), song.beatSec(beats), 1, { cutoff, attack, release: 0.8, seed: 900 + k, type })
    song.add(bus, s, startBeat, { gain: gain / 3, pan: (k - 1) * 0.5 })
  })
}

const MAR = (f, i) => cached(`mar:${f.toFixed(2)}:${i % 2}`, () => I.marimba(f, 1, { seed: 600 + (i % 2), mallet: 0.45 }))
const XYL = (f, i) => cached(`xyl:${f.toFixed(2)}`, () => I.xylophone(f, 1, { seed: 610 }))
const GLK = (f) => cached(`glk:${f.toFixed(2)}`, () => I.glock(f, 1))
const MAND = (f, i) => cached(`mand:${f.toFixed(2)}:${i % 2}`, () => I.mandolin(f, 1, { seed: 700 + (i % 2) }))
const KAL = (f) => cached(`kal:${f.toFixed(2)}`, () => I.kalimba(f, 1))

const bars = (list, n) => Array.from({ length: n }, (_, i) => list[i % list.length])

// ─── 1. Battle — "Bramble Brawl" (D minor reel-rock, 144 BPM, 32 bars) ────

export const bramble = () => {
  const song = new Song({ bpm: 144, loopBeats: 128, tailSec: 3 })
  song.bus('drums', { lvl: -16, rev: 0.1, rev2: 0.25, comp: { threshDb: -14, ratio: 3, attackMs: 6, releaseMs: 90 } })
  song.bus('bass', { lvl: -17.5, hp: 38 })
  song.bus('gtr', { lvl: -20, rev: 0.18, hp: 110 })
  song.bus('mar', { lvl: -21, rev: 0.25 })
  song.bus('lead', { lvl: -18, rev: 0.32, rev2: 0.1 })
  song.bus('mand', { lvl: -21, rev: 0.3, hp: 180 })
  song.bus('pad', { lvl: -25, rev: 0.5 })

  const A = ['Dm', 'C', 'Bb', 'C']
  const B = ['Dm', 'F', 'C', 'A']
  const C = ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A']
  const prog = [...bars(A, 8), ...bars(A, 8), ...bars(B, 8), ...C]

  const groove = 'X.....x.x.......|....X.......X...'.slice(0, 16)
  for (let bar = 0; bar < 32; bar++) {
    const b0 = bar * 4
    const ch = prog[bar]
    const sec = bar < 8 ? 'A1' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'C'
    const breakdown = sec === 'C' && bar < 28
    const build = sec === 'C' && bar >= 28
    // Drums
    if (!breakdown) {
      drumPattern(song, 'drums', build ? 'X...x...X...x...' : 'X.....x.X.....x.', b0, KICK, { gain: 0.95, seed: 1 })
      drumPattern(song, 'drums', '....X.......X...', b0, SNARE, { gain: 0.55, seed: 2 })
      drumPattern(song, 'drums', '....X.......X...', b0, CLAP, { gain: 0.3, pan: 0.15, seed: 3 })
    } else {
      drumPattern(song, 'drums', 'X.......x.......', b0, FRAME, { gain: 0.6, seed: 4 })
    }
    drumPattern(song, 'drums', 'xoooxooxxoooxoox', b0, SHAKER, { gain: breakdown ? 0.22 : 0.3, pan: -0.35, seed: 5 })
    if (sec === 'A2' || sec === 'B' || build) drumPattern(song, 'drums', '..x...x...x...x.', b0, TAMB, { gain: 0.22, pan: 0.4, seed: 6 })
    if (sec === 'B') drumPattern(song, 'drums', '...o..o....o..o.', b0, FRAME_HI, { gain: 0.35, pan: -0.2, seed: 7 })
    // Fills at phrase ends
    if (bar % 8 === 7 && bar !== 31) drumPattern(song, 'drums', '............XxXX', b0, FRAME_HI, { gain: 0.55, pan: 0.2, seed: 8 })
    if (bar === 31) drumPattern(song, 'drums', 'oooxoooxxxxxXXXX', b0, SNARE, { gain: 0.5, seed: 9 })
    if (bar === 30) song.add('drums', I.cymbal(0.8, { sec: 3.3, swell: 1 }), b0 + 0.6, { gain: 0.5 })
    if (bar === 0 || bar === 16) song.add('drums', cached('crash', () => I.cymbal(1, { sec: 2.4 })), b0, { gain: 0.45, pan: 0.3 })

    // Bass
    if (breakdown) bassBar(song, 'bass', ch, b0, [0, null, null, null, null, null, 2, null], { gate: 1.6, gain: 0.9 })
    else bassBar(song, 'bass', ch, b0, [0, 0, 2, 0, 3, 0, 2, 0], { gain: 0.95 })

    // Guitar strum
    if (!breakdown) strumBar(song, 'gtr', ch, b0, 'D.DU.UDU', { gain: 1, pan: -0.3, seed: bar })

    // Marimba ostinato
    if (sec === 'A1' || build) arpBar(song, 'mar', ch, b0, [0, 2, 3, 2, 1, 2, 3, 4], MAR, { octave: 4, gain: 0.9, pan: 0.35 })
    if (sec === 'A2') arpBar(song, 'mar', ch, b0, [0, null, 3, null, 1, null, 3, null], MAR, { octave: 4, gain: 0.7, pan: 0.35 })

    // Mandolin tremolo through the breakdown + build
    if (sec === 'C') {
      for (let s = 0; s < 16; s++) {
        const deg = [4, 3, 2, 3][Math.floor(s / 4)]
        const m = chordNote(ch, deg, 4)
        song.add('mand', MAND(mtof(m), s), b0 + s * 0.25, { gain: (s % 4 === 0 ? 1 : 0.6) * (breakdown ? 0.8 : 1), pan: 0.25 })
      }
    }
    if (sec === 'B' || sec === 'C') padChord(song, 'pad', ch, b0, 4, { octave: 3, cutoff: 900 })
  }

  // Lead melodies (tin whistle): A tune over A2, B tune over B.
  const tuneA = 'A4 D5 F5 D5 A5 D5 F5 D5 | G4 C5 E5 C5 G5 C5 E5 C5 | F4 Bb4 D5 Bb4 F5 D5 Bb4 D5 | E5 G5 E5 C5 D5 E5 F5 G5 |' +
    'A5:2 F5 D5 A5 F5 D5 F5 | G5:2 E5 C5 G5 E5 C5 E5 | F5 D5 Bb4 D5 F5 G5 A5 Bb5 | A5 G5 E5 C5 D5:4'
  const tuneB = 'D6:2 C6 A5 D6 C6 A5 F5 | C6:2 A5 F5 C6 A5 F5 A5 | G5 A5 G5 E5 C5 E5 G5 C6 | C#6:2 A5 E5 C#5 E5 A5 G5 |' +
    'F5 E5 D5 E5 F5 A5 D6 A5 | C6 A5 F5 A5 C6 D6 C6 A5 | G5 E5 C5 E5 G5 A5 Bb5 G5 | A5:2 E5 C#5 A4:4'
  placeLead(song, 'lead', tuneA, 32, { pan: 0.05 })
  placeLead(song, 'lead', tuneB, 64, { pan: 0.05 })
  // Build: the first half of tune A an octave down, on marimba-doubled whistle.
  placeLead(song, 'lead', 'A4 D5 F5 D5 A5 D5 F5 D5 | G4 C5 E5 C5 G5 C5 E5 C5 | A4:2 C#5 E5 A5:2 G5 E5 | C#5 E5 A5 C#6 E6:4', 112, { pan: 0.05, gain: 0.85 })
  return { song, master: { glue: { threshDb: -12, ratio: 2, attackMs: 15, releaseMs: 200 } } }
}

// ─── 2. Battle — "Acorn Rumble" (E minor stomp, 152 BPM, 32 bars) ─────────

export const acorn = () => {
  const song = new Song({ bpm: 152, loopBeats: 128, tailSec: 3 })
  song.bus('drums', { lvl: -16, rev: 0.08, rev2: 0.25, comp: { threshDb: -14, ratio: 3, attackMs: 5, releaseMs: 80 } })
  song.bus('bass', { lvl: -17.5, hp: 38 })
  song.bus('reed', { lvl: -21, rev: 0.2, hp: 150 })
  song.bus('xyl', { lvl: -21, rev: 0.25 })
  song.bus('lead', { lvl: -18, rev: 0.32 })
  song.bus('mand', { lvl: -20, rev: 0.25, hp: 160 })
  song.bus('gtr', { lvl: -20, rev: 0.18, hp: 110 })
  song.bus('pad', { lvl: -25, rev: 0.5 })

  const A = ['Em', 'D', 'C', 'B7']
  const B = ['C', 'D', 'Em', 'Em', 'C', 'D', 'B', 'B']
  const prog = [...bars(A, 16), ...B, ...bars(A, 8)]
  for (let bar = 0; bar < 32; bar++) {
    const b0 = bar * 4
    const ch = prog[bar]
    const sec = bar < 8 ? 'A1' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'A3'
    if (sec !== 'B') {
      drumPattern(song, 'drums', 'X...X...X...X...', b0, KICK, { gain: 0.9, seed: 11 })
      drumPattern(song, 'drums', '....X.......X...', b0, CLAP, { gain: 0.45, seed: 12 })
      drumPattern(song, 'drums', '....x.......x...', b0, SNARE, { gain: 0.3, seed: 13 })
      drumPattern(song, 'drums', '..x...x...x...x.', b0, TAMB, { gain: 0.25, pan: 0.35, seed: 14 })
      drumPattern(song, 'drums', 'oxoooxoooxoooxoo', b0, SHAKER, { gain: 0.26, pan: -0.4, seed: 15 })
      if (sec === 'A3') drumPattern(song, 'drums', '.......o..o...o.', b0, FRAME, { gain: 0.45, pan: -0.15, seed: 16 })
    } else {
      drumPattern(song, 'drums', 'X.......X.x.....', b0, KICK, { gain: 0.9, seed: 17 })
      drumPattern(song, 'drums', '........X.......', b0, SNARE, { gain: 0.55, seed: 18 })
      drumPattern(song, 'drums', 'x.o.x.o.x.o.x.o.', b0, SHAKER, { gain: 0.28, pan: -0.4, seed: 19 })
      drumPattern(song, 'drums', '..o...o...o...o.', b0, FRAME_HI, { gain: 0.3, pan: 0.25, seed: 20 })
    }
    if (bar % 8 === 7) drumPattern(song, 'drums', bar === 31 ? '........XxXxXXXX' : '............XxXx', b0, FRAME_HI, { gain: 0.55, pan: 0.15, seed: 21 })
    if (bar === 0 || bar === 16 || bar === 24) song.add('drums', cached('crash2', () => I.cymbal(1, { sec: 2.2, seed: 19 })), b0, { gain: 0.42, pan: -0.25 })

    // Octave-bouncing bass (A), long-ish roots (B)
    if (sec === 'B') bassBar(song, 'bass', ch, b0, [0, null, null, 0, null, null, 2, null], { gate: 1.2 })
    else bassBar(song, 'bass', ch, b0, [0, 3, 0, 3, 0, 3, 2, 3], { gate: 0.35 })

    // Accordion off-beat stabs in A sections
    if (sec !== 'B') {
      const fr = [1, 2, 3].map((d) => mtof(chordNote(ch, d, 3)))
      const stab = cached(`stab:${ch}`, () => I.reed(fr, 0.16, 1))
      for (const off of [0.5, 1.5, 2.5, 3.5]) song.add('reed', stab, b0 + off, { gain: 1, pan: 0.2 })
    } else {
      strumBar(song, 'gtr', ch, b0, 'D.DUD.DU', { gain: 1, pan: -0.25, seed: bar })
      padChord(song, 'pad', ch, b0, 4, { octave: 3, cutoff: 1000 })
    }
    // Xylophone ostinato (A1) and sparse in A2
    if (sec === 'A1') arpBar(song, 'xyl', ch, b0, [0, 2, 1, 2, 3, 2, 1, 2], XYL, { octave: 5, gain: 0.75, pan: -0.3 })
  }
  const tuneA = 'E5 G5 B5 G5 E5 G5 B5 E6 | D6 B5 A5 F#5 D5 F#5 A5 D6 | C6 B5 A5 G5 E5 G5 C6 E6 | D#6:2 B5 F#5 D#5 F#5 A5 B5 |' +
    'G5 F#5 E5 F#5 G5 A5 B5 G5 | A5 G5 F#5 G5 A5 B5 D6 A5 | G5 E5 C5 E5 G5 A5 B5 C6 | B5:2 A5 F#5 D#5 F#5 B4:2'
  const tuneB = 'E6:4 D6:2 C6:2 | D6:4 A5:2 F#5:2 | G5:2 A5:2 B5:4 | B5:2 A5 G5 E5:4 | E6:2 G6:2 E6:2 C6:2 | D6:2 F#6:2 D6:2 A5:2 | B5:2 D#6:2 F#6:2 D#6:2 | B5:6 r:2'
  placeLead(song, 'lead', tuneA, 32, { transpose: -12, gain: 0.95 })
  placeLine(song, 'xyl', tuneA, 32, XYL, { gain: 0.55, pan: -0.25 })
  placeLead(song, 'lead', tuneB, 64, { transpose: -12, gain: 1, vib: 0.016 })
  placeLine(song, 'mand', tuneA, 96, MAND, { gain: 0.9, pan: 0.15 })
  placeLine(song, 'xyl', tuneA, 96, XYL, { gain: 0.45, pan: -0.25, transpose: 12 })
  return { song, master: { glue: { threshDb: -12, ratio: 2, attackMs: 15, releaseMs: 200 } } }
}

// ─── 3. Battle — "Timber Stomp" (G mixolydian bounce, 132 BPM, 32 bars) ───

export const timber = () => {
  const song = new Song({ bpm: 132, loopBeats: 128, tailSec: 3, swing: 0.16 })
  song.bus('drums', { lvl: -16, rev: 0.1, rev2: 0.3, comp: { threshDb: -14, ratio: 3, attackMs: 6, releaseMs: 90 } })
  song.bus('bass', { lvl: -17.5, hp: 38 })
  song.bus('reed', { lvl: -20.5, rev: 0.22, hp: 150 })
  song.bus('lead', { lvl: -18, rev: 0.3 })
  song.bus('mar', { lvl: -20, rev: 0.28 })
  song.bus('glk', { lvl: -24, rev: 0.4 })
  song.bus('gtr', { lvl: -20, rev: 0.18, hp: 110 })

  const A = ['G', 'F', 'C', 'G']
  const B = ['Em', 'C', 'D', 'D']
  const prog = [...bars(A, 16), ...bars(B, 8), ...bars(A, 8)]
  for (let bar = 0; bar < 32; bar++) {
    const b0 = bar * 4
    const ch = prog[bar]
    const sec = bar < 8 ? 'A1' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'A3'
    drumPattern(song, 'drums', sec === 'B' ? 'X.x.X.x.X.x.X.x.' : 'X.......X.......', b0, KICK, { gain: sec === 'B' ? 0.8 : 0.95, seed: 31 })
    drumPattern(song, 'drums', '....X.......X...', b0, CLAP, { gain: 0.48, seed: 32 })
    drumPattern(song, 'drums', 'x.o.x.o.x.o.x.o.', b0, SHAKER, { gain: 0.3, pan: -0.35, seed: 33 })
    drumPattern(song, 'drums', '..x...x...x..xx.', b0, BLOCK, { gain: sec === 'A1' ? 0.32 : 0.2, pan: 0.4, seed: 34 })
    if (sec === 'A3') drumPattern(song, 'drums', '..x...x...x...x.', b0, TAMB, { gain: 0.22, pan: 0.3, seed: 35 })
    if (bar % 8 === 7) drumPattern(song, 'drums', bar === 31 ? '........XxXxXXXX' : '............XxXX', b0, FRAME_HI, { gain: 0.55, seed: 36 })
    if (bar === 0 || bar === 16) song.add('drums', cached('crash3', () => I.cymbal(1, { sec: 2.2, seed: 23 })), b0, { gain: 0.4, pan: 0.25 })

    // Oom-pah: bass on 1 & 3 (root, fifth), accordion on 2 & 4 (+ "and of 4")
    bassBar(song, 'bass', ch, b0, [0, null, null, null, 2, null, null, 3], { gate: 0.7 })
    if (sec !== 'B') {
      const fr = [1, 2, 3].map((d) => mtof(chordNote(ch, d, 3)))
      const pah = cached(`pah:${ch}`, () => I.reed(fr, 0.2, 1))
      for (const off of [1, 3, 3.5]) song.add('reed', pah, b0 + off, { gain: off === 3.5 ? 0.6 : 1, pan: 0.2 })
    } else {
      strumBar(song, 'gtr', ch, b0, 'D.DU.UDU', { gain: 1, pan: -0.25, seed: bar })
      arpBar(song, 'glk', ch, b0, [3, null, 4, null, 5, null, 4, null], GLK, { octave: 5, gain: 0.8, pan: 0.3 })
    }
  }
  const tuneA = 'D5 G5 G5 A5 B5 A5 G5 D5 | C5 F5 F5 G5 A5 G5 F5 C5 | E5 G5 C6 B5 A5 G5 E5 G5 | D5:2 B4 D5 G5:4 |' +
    'B5:2 A5 G5 D6:2 B5 G5 | A5:2 G5 F5 C6:2 A5 F5 | G5 E5 C5 E5 G5 A5 B5 C6 | D6 B5 A5 F5 G5:4'
  const tuneB = 'E5:2 G5:2 B5:2 G5:2 | C6:2 B5:2 G5:2 E5:2 | F#5:2 A5:2 D6:2 C6:2 | B5 A5 G5 F#5 A5:4 |' +
    'B5:2 C6:2 B5:2 G5:2 | E5:2 G5:2 C6:2 E6:2 | D6:2 C6 B5 A5:2 F#5:2 | D5:2 F#5:2 A5 B5 C6 A5'
  placeLead(song, 'lead', tuneA, 32, {})
  placeLead(song, 'lead', tuneB, 64, { vib: 0.015 })
  placeLine(song, 'mar', tuneA, 96, MAR, { gain: 0.9, pan: -0.2 })
  placeLine(song, 'glk', tuneA, 96, GLK, { gain: 0.5, pan: 0.3, transpose: 12 })
  return { song, master: { glue: { threshDb: -12, ratio: 2, attackMs: 15, releaseMs: 200 } } }
}

// ─── 4. Menu — "Cosy Hollow" (F major, 92 BPM, 16 bars) ───────────────────

export const hollow = () => {
  const song = new Song({ bpm: 92, loopBeats: 64, tailSec: 3.5, swing: 0.1 })
  song.bus('drums', { lvl: -22, rev: 0.15, rev2: 0.3 })
  song.bus('bass', { lvl: -19, hp: 38 })
  song.bus('gtr', { lvl: -18.5, rev: 0.25, hp: 90 })
  song.bus('mar', { lvl: -17.5, rev: 0.35 })
  song.bus('glk', { lvl: -22, rev: 0.45 })
  song.bus('pad', { lvl: -25, rev: 0.6 })
  song.bus('birds', { lvl: -31, rev: 0.6, hp: 1500 })

  const prog = ['F', 'Am', 'Bb', 'C', 'F', 'Dm', 'Bb', 'F', 'F', 'Am', 'Bb', 'C', 'F', 'Dm', 'Bb', 'F']
  for (let bar = 0; bar < 16; bar++) {
    const b0 = bar * 4
    const ch = prog[bar]
    drumPattern(song, 'drums', 'X.......o.......', b0, KICK_SOFT, { gain: 0.6, seed: 41 })
    drumPattern(song, 'drums', '....x.......x...', b0, SHAKER_LONG, { gain: 0.35, pan: 0.2, seed: 42 })
    drumPattern(song, 'drums', 'o.o.o.o.o.o.o.o.', b0, SHAKER, { gain: 0.14, pan: -0.3, seed: 43 })
    if (bar % 2 === 1) drumPattern(song, 'drums', '..............o.', b0, BLOCK_HI, { gain: 0.2, pan: 0.45, seed: 44 })
    bassBar(song, 'bass', ch, b0, [0, null, null, null, 2, null, null, null], { gate: 1.6, gain: 0.8 })
    // Finger-picked guitar: bass note + broken chord, 8ths.
    const fr = shape(ch)
    const pickOrder = [0, 2, 3, 4, 1, 3, 4, 2].map((k) => Math.min(fr.length - 1, k))
    pickOrder.forEach((k, i) => {
      const f = fr[k]
      const s = cached(`pick:${f.toFixed(2)}:${i % 2}`, () => I.guitarNote(f, 1, { sec: 2.2, bright: 0.35, decay: 3, seed: 800 + (i % 2) }))
      song.add('gtr', s, b0 + i * 0.5, { gain: i === 0 ? 0.9 : 0.6, pan: -0.25 + (k / fr.length) * 0.4 })
    })
    padChord(song, 'pad', ch, b0, 4, { octave: 3, cutoff: 700, attack: 0.8, type: 'tri' })
    if (bar % 4 === 2) song.add('birds', I.chirp(1, { seed: 1000 + bar, f: 3000 + (bar % 3) * 400, count: 2 + (bar % 2) }), b0 + 1.3, { pan: bar % 8 === 2 ? 0.6 : -0.6 })
  }
  const tune1 = 'A5:3 G5 F5:2 C5:2 | E5:3 F5 G5:2 A5:2 | F5:3 D5 Bb4:2 D5:2 | E5:2 G5:2 C6:4 | A5:3 G5 F5:2 A5:2 | D6:3 C6 A5:2 F5:2 | D5:2 F5:2 E5:2 G5:2 | F5:6 r:2'
  const tune2 = 'C6:3 A5 F5:2 A5:2 | C6:3 B5 A5:2 E5:2 | D6:3 C6 Bb5:2 F5:2 | G5:2 A5 Bb5 C6:4 | A5:3 G5 F5:2 C5:2 | F5:3 E5 D5:2 A5:2 | G5:2 F5:2 E5:2 C5:2 | F5:8'
  placeLine(song, 'mar', tune1, 0, MAR, { gain: 0.95, pan: 0.15 })
  placeLine(song, 'mar', tune2, 32, MAR, { gain: 0.85, pan: 0.15 })
  placeLine(song, 'glk', tune2, 32, GLK, { gain: 0.6, pan: 0.35, transpose: 12 })
  return { song, master: { glue: { threshDb: -16, ratio: 1.8, attackMs: 20, releaseMs: 250 } } }
}

// ─── 5. Boss — "Old Oak Rises" (C minor, 126 BPM, 24 bars) ────────────────

export const oldOak = () => {
  const song = new Song({ bpm: 126, loopBeats: 96, tailSec: 3.5 })
  song.bus('drums', { lvl: -15.5, rev: 0.18, rev2: 0.3, comp: { threshDb: -14, ratio: 3, attackMs: 8, releaseMs: 120 } })
  song.bus('bass', { lvl: -18, hp: 32 })
  song.bus('ost', { lvl: -19.5, rev: 0.25, hp: 90 })
  song.bus('horn', { lvl: -18, rev: 0.4 })
  song.bus('glk', { lvl: -23, rev: 0.45 })
  song.bus('pad', { lvl: -21, rev: 0.5 })

  const A = ['Cm', 'Cm', 'Ab', 'Bb']
  const Cp = ['Cm', 'Db', 'Bb', 'G']
  const prog = [...bars(A, 16), ...bars(Cp, 8)]
  for (let bar = 0; bar < 24; bar++) {
    const b0 = bar * 4
    const ch = prog[bar]
    const sec = bar < 8 ? 'A' : bar < 16 ? 'B' : 'C'
    drumPattern(song, 'drums', 'X..x..X...X..x..', b0, TAIKO, { gain: 0.75, seed: 51 })
    drumPattern(song, 'drums', '....X.......X...', b0, CLAP, { gain: 0.38, seed: 52 })
    drumPattern(song, 'drums', '....x.......x...', b0, SNARE, { gain: 0.38, seed: 53 })
    drumPattern(song, 'drums', 'X.......X.......', b0, KICK, { gain: 0.65, seed: 54 })
    drumPattern(song, 'drums', sec === 'A' ? 'x.o.x.o.x.o.x.o.' : 'xoooxoooxoooxooo', b0, SHAKER, { gain: 0.24, pan: -0.35, seed: 55 })
    if (sec !== 'A') drumPattern(song, 'drums', '..o...o...o..oo.', b0, TAIKO_HI, { gain: 0.42, pan: 0.3, seed: 56 })
    if (bar % 8 === 7) drumPattern(song, 'drums', bar === 23 ? 'XxXxXxXxXXXXXXXX' : '........XxXxXXXX', b0, TAIKO_HI, { gain: 0.6, pan: -0.1, seed: 57 })
    if (bar === 6 || bar === 22) song.add('drums', I.cymbal(0.8, { sec: song.beatSec(8) - 0.05, swell: 1, seed: 58 + bar }), b0 + 0.05, { gain: 0.45 })
    if (bar === 0 || bar === 8 || bar === 16) song.add('drums', cached('crash5', () => I.cymbal(1, { sec: 2.6, seed: 31 })), b0, { gain: 0.42, pan: 0.2 })

    // Low drone + driving pizzicato ostinato (root, root, fifth, root, third, root, fifth, root)
    song.add('pad', I.drone(mtof(chordNote(ch, 0, 2)), song.beatSec(4), 1), b0, { gain: 0.9 })
    bassBar(song, 'bass', ch, b0, [0, null, 0, null, 0, null, 0, 0], { gate: 0.5, octave: 2, gain: 0.85 })
    ;[0, 0, 2, 0, 1, 0, 2, 3].forEach((d, i) => {
      const m = chordNote(ch, d, 3)
      const s = cached(`pz:${m}`, () => I.pizz(mtof(m), 1, { seed: 640 + (m % 3) }))
      song.add('ost', s, b0 + i * 0.5, { gain: i % 2 ? 0.7 : 1, pan: -0.3 })
      if (sec !== 'A') {
        const s2 = cached(`pz2:${m}`, () => I.pizz(mtof(m + 12), 1, { seed: 650 + (m % 3) }))
        song.add('ost', s2, b0 + i * 0.5 + 0.02, { gain: 0.45, pan: 0.35 })
      }
    })
    if (sec === 'C') arpBar(song, 'glk', ch, b0, [4, 5, 4, 3, 2, 3, 4, 6], GLK, { octave: 4, gain: 0.8, pan: 0.3 })
    if (sec !== 'A') padChord(song, 'pad', ch, b0, 4, { octave: 3, cutoff: 800, attack: 0.5 })
  }
  // Horn melody (B), long horn swells (C)
  const tuneB = 'C5:4 Eb5:2 G5:2 | F5:3 Eb5 D5:2 C5:2 | Eb5:4 C5:2 Ab4:2 | Bb4:2 D5:2 F5:4 | G5:4 Ab5:2 G5:2 | F5:2 Eb5:2 D5:2 Eb5:2 | C5:4 Eb5:2 Ab5:2 | G5:6 F5 D5'
  const { notes } = parseLine(tuneB, 0.5)
  for (const n of notes) song.add('horn', I.horn(mtof(n.m - 12), song.beatSec(n.dur) * 0.95, 1, { seed: 91 + (n.m % 5) }), 32 + n.beat, { pan: 0 })
  const tuneC = 'G4:8 | Ab4:8 | F4:4 Bb4:4 | B4:8 | C5:8 | Db5:8 | D5:4 F5:4 | G5:4 B4:4'
  for (const n of parseLine(tuneC, 0.5).notes) song.add('horn', I.horn(mtof(n.m - 12), song.beatSec(n.dur) * 0.97, 0.9, { seed: 95, swell: n.dur >= 4 ? 1 : 0 }), 64 + n.beat, { pan: 0 })
  return { song, master: { glue: { threshDb: -12, ratio: 2, attackMs: 15, releaseMs: 200 } } }
}

// ─── Stingers ─────────────────────────────────────────────────────────────

/** Victory: drum roll + rising run into a big G-major hit that rings out. */
export const winSting = () => {
  const song = new Song({ bpm: 132, loopBeats: 12, tailSec: 0 })
  song.bus('drums', { lvl: -17, rev: 0.2, rev2: 0.3 })
  song.bus('mel', { lvl: -18, rev: 0.35 })
  song.bus('lead', { lvl: -17, rev: 0.4 })
  song.bus('gtr', { lvl: -18, rev: 0.3, hp: 100 })
  song.bus('bass', { lvl: -19 })
  song.bus('glk', { lvl: -21, rev: 0.5 })
  drumPattern(song, 'drums', 'oxxXxxXX', 0, FRAME_HI, { gain: 0.5, humanMs: 1, seed: 61 })
  const run = ['G4', 'A4', 'B4', 'D5', 'E5', 'F#5']
  run.forEach((n, i) => song.add('mel', MAR(mtof(midi(n)), i), i * 0.25, { gain: 0.6 + i * 0.07, pan: -0.2 + i * 0.08 }))
  placeLead(song, 'lead', 'D5 G5 B5', 1.5, { unit: 0.5, staccato: 0.98 })
  // The hit (beat 3)
  const hit = 3
  song.add('drums', I.kick(1, { seed: 3 }), hit, { gain: 0.9 })
  song.add('drums', I.taiko(1, { seed: 4 }), hit, { gain: 0.6 })
  song.add('drums', I.cymbal(1, { sec: 3.2, seed: 5 }), hit, { gain: 0.5, pan: 0.2 })
  song.add('gtr', I.strum(shape('G'), 1, { sec: 3.4, seed: 7 }), hit, { pan: -0.25 })
  song.add('gtr', I.strum(shape('G'), 0.7, { dir: 'up', sec: 3.2, seed: 8 }), hit + 0.5, { pan: 0.25 })
  song.add('bass', I.bass(mtof(midi('G2')), 1, { sec: 2.8, gate: 0.9, rel: 1.2 }), hit)
  placeLead(song, 'lead', 'D6:4', hit, { unit: 0.5, vib: 0.018 })
  placeLead(song, 'lead', 'B5:4', hit, { unit: 0.5, vib: 0.018, gain: 0.55, seed: 77 })
  ;['G6', 'B6', 'D7', 'G7'].forEach((n, i) => song.add('glk', GLK(mtof(midi(n))), hit + 0.25 + i * 0.25, { gain: 0.8 - i * 0.12, pan: 0.3 - i * 0.2 }))
  song.add('mel', MAR(mtof(midi('G5')), 0), hit, { gain: 0.8 })
  song.add('mel', MAR(mtof(midi('B4')), 1), hit, { gain: 0.6 })
  return { song, sting: true, totalSec: 4.2, master: { glue: { threshDb: -14, ratio: 2, attackMs: 10, releaseMs: 200 } } }
}

/** Defeat: a gentle, slightly comic descending "aww" that invites a retry. */
export const loseSting = () => {
  const song = new Song({ bpm: 96, loopBeats: 12, tailSec: 0 })
  song.bus('mel', { lvl: -17, rev: 0.35 })
  song.bus('lead', { lvl: -18, rev: 0.4 })
  song.bus('gtr', { lvl: -19, rev: 0.35, hp: 90 })
  song.bus('bass', { lvl: -20 })
  song.bus('drums', { lvl: -20, rev: 0.2 })
  ;['E5', 'D5', 'C5', 'B4'].forEach((n, i) => song.add('mel', MAR(mtof(midi(n)), i), i * 0.5, { gain: 0.95 - i * 0.08, pan: 0.2 - i * 0.12 }))
  ;['A2', 'G2', 'F2', 'E2'].forEach((n, i) => song.add('bass', I.pizz(mtof(midi(n)), 1, { sec: 0.6, seed: 66 + i }), i * 0.5, { gain: 0.7 }))
  // A soft "plush flop" on the landing, then a gentle Am(add9) that rings.
  song.add('drums', I.frameDrum(0.9, { tune: 0.7, open: 1.3 }), 2, { gain: 0.8 })
  song.add('gtr', I.strum(shape('Amadd9'), 0.7, { sec: 2.6, bright: 0.35, spreadMs: 28, seed: 9 }), 2)
  song.add('bass', I.bass(mtof(midi('A1')), 0.9, { sec: 2.4, gate: 0.8, rel: 1.0 }), 2)
  placeLead(song, 'lead', 'C5:2 B4 A4:5', 2, { unit: 0.5, vib: 0.02, staccato: 1 })
  song.add('mel', KAL(mtof(midi('E6'))), 3.5, { gain: 0.35, pan: 0.4 })
  return { song, sting: true, totalSec: 3.4, master: { glue: { threshDb: -16, ratio: 1.8, attackMs: 15, releaseMs: 250 } } }
}

export const MUSIC = {
  'battle-1': { fn: bramble, title: 'Bramble Brawl' },
  'battle-2': { fn: acorn, title: 'Acorn Rumble' },
  'battle-3': { fn: timber, title: 'Timber Stomp' },
  'menu-1': { fn: hollow, title: 'Cosy Hollow' },
  'boss-1': { fn: oldOak, title: 'Old Oak Rises' },
  win: { fn: winSting, title: 'Victory sting' },
  lose: { fn: loseSting, title: 'Defeat sting' }
}

export { buf, mix, scale, SR }
