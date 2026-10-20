// Tiny offline sequencer: beats → samples, named stereo buses with a shared
// reverb send, melody shorthand, chord helpers and a loop-aware render.

import { SR, stereo, mixPan, reverb, compress, mixBus, midi, mtof, biquad, busFilter, saturate, dbToGain } from './dsp.mjs'
import { measure } from './master.mjs'

const NOTE_RE = /^([A-Ga-g][#b]?-?\d)$/

/**
 * Melody shorthand: "A4 D5:2 r F5 -" — tokens are NOTE[:len] or r[:len]
 * (rest) or "-" (tie: extend the previous note by one unit); "|" is ignored
 * (bar lines for readability). `unit` is the length of 1 in beats
 * (0.5 = eighth notes). Returns [{ beat, dur, m }] relative to beat 0.
 */
export const parseLine = (text, unit = 0.5) => {
  const out = []
  let beat = 0
  for (const tok of text.replace(/\|/g, ' ').trim().split(/\s+/)) {
    if (tok === '|' || tok === '') continue
    if (tok === '-') {
      if (out.length) out[out.length - 1].dur += unit
      beat += unit
      continue
    }
    const [name, lenS] = tok.split(':')
    const len = (lenS ? Number(lenS) : 1) * unit
    if (name === 'r') {
      beat += len
      continue
    }
    if (!NOTE_RE.test(name)) throw new Error(`bad token ${tok}`)
    out.push({ beat, dur: len, m: midi(name) })
    beat += len
  }
  return { notes: out, beats: beat }
}

const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }

/** "Dm" / "Bb" / "B7" / "C#m" → { root (pitch class), tones [semitones] }. */
export const chord = (name) => {
  const m = /^([A-G][#b]?)(.*)$/.exec(name)
  const root = ROOTS[m[1]]
  const q = m[2]
  let tones = [0, 4, 7]
  if (q.startsWith('m') && !q.startsWith('maj')) tones = [0, 3, 7]
  if (q.includes('dim')) tones = [0, 3, 6]
  if (q.includes('sus4')) tones = [0, 5, 7]
  if (q.includes('7')) tones = [...tones, q.includes('maj7') ? 11 : 10]
  if (q.includes('add9')) tones = [...tones, 14]
  return { root, tones }
}

/** Chord tone in a given octave: degree 0 = root, 1 = third, 2 = fifth … */
export const chordNote = (name, degree, octave) => {
  const c = chord(name)
  const len = c.tones.length
  const oct = Math.floor(degree / len)
  const t = c.tones[((degree % len) + len) % len]
  return (octave + 1) * 12 + c.root + t + oct * 12
}

/** Guitar voicings (MIDI), low → high, roughly open-position shapes. */
const SHAPES = {
  Dm: ['D3', 'A3', 'D4', 'F4'], D: ['D3', 'A3', 'D4', 'F#4'], C: ['C3', 'E3', 'G3', 'C4', 'E4'],
  Bb: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'], F: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'], A: ['A2', 'E3', 'A3', 'C#4', 'E4'],
  Am: ['A2', 'E3', 'A3', 'C4', 'E4'], Em: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'], B7: ['B2', 'D#3', 'A3', 'B3', 'F#4'],
  G: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'], Cm: ['C3', 'G3', 'C4', 'Eb4', 'G4'], Ab: ['Ab2', 'Eb3', 'Ab3', 'C4', 'Eb4'],
  Db: ['Db3', 'Ab3', 'Db4', 'F4'], E: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], B: ['B2', 'F#3', 'B3', 'D#4', 'F#4'],
  Dsus4: ['D3', 'A3', 'D4', 'G4'], Fadd9: ['F2', 'C3', 'G3', 'A3', 'C4'], Amadd9: ['A2', 'E3', 'B3', 'C4', 'E4'],
  Gm: ['G2', 'D3', 'G3', 'Bb3', 'D4', 'G4'], A7: ['A2', 'E3', 'G3', 'C#4', 'E4'], D7: ['D3', 'A3', 'C4', 'F#4'],
  G7: ['G2', 'B2', 'D3', 'G3', 'B3', 'F4'], C7: ['C3', 'E3', 'Bb3', 'C4', 'E4'], Eb: ['Eb3', 'G3', 'Bb3', 'Eb4']
}
export const shape = (name) => {
  const s = SHAPES[name]
  if (!s) throw new Error(`no guitar shape for ${name}`)
  return s.map((n) => mtof(midi(n)))
}

/**
 * A song: buses are created on first use. `loopBeats` sets the loop length;
 * the render carries `tailSec` beyond it so reverb / release tails can be
 * wrapped back onto the start (seamless loop).
 */
export class Song {
  constructor({ bpm, loopBeats, tailSec = 3, swing = 0 }) {
    this.bpm = bpm
    this.loopBeats = loopBeats
    this.tailSec = tailSec
    this.swing = swing
    this.loopSec = (loopBeats * 60) / bpm
    this.totalSec = this.loopSec + tailSec
    this.buses = new Map()
    this.send = stereo(this.totalSec)
    this.send2 = stereo(this.totalSec)
  }

  /** Seconds for a beat position, with optional 8th-note swing. */
  t(beat) {
    let b = beat
    if (this.swing) {
      const frac = b % 1
      if (Math.abs(frac - 0.5) < 1e-6) b = Math.floor(b) + 0.5 + this.swing * 0.5
    }
    return (b * 60) / this.bpm
  }

  beatSec(beats) {
    return (beats * 60) / this.bpm
  }

  bus(name, opts = {}) {
    if (!this.buses.has(name)) this.buses.set(name, { name, ...stereo(this.totalSec), gain: 1, rev: 0, rev2: 0, comp: null, hp: 0, ...opts })
    return this.buses.get(name)
  }

  /** Place a mono voice on a bus at a beat. */
  add(busName, src, beat, { gain = 1, pan = 0, absSec = null } = {}) {
    const b = this.bus(busName)
    const at = absSec ?? this.t(beat)
    // Wrap anything that starts past the loop end back to the start.
    const s = at >= this.loopSec ? at - this.loopSec : at
    mixPan(b, src, s, gain, pan)
    return this
  }

  /** Mix all buses → stereo master (full length incl. tail). */
  render({ room = 0.8, damp = 0.4, revGain = 0.9, room2 = 0.55, rev2Gain = 0.6, preDelayMs = 14 } = {}) {
    const master = stereo(this.totalSec)
    for (const b of this.buses.values()) {
      let bus = { L: b.L, R: b.R }
      if (b.hp) bus = busFilter(bus, 'hp', b.hp, 0.7)
      if (b.lp) bus = busFilter(bus, 'lp', b.lp, 0.7)
      if (b.eq) for (const e of b.eq) bus = busFilter(bus, e[0], e[1], e[2], e[3])
      if (b.comp) compress(bus, b.comp)
      if (b.drive) bus = { L: saturate(bus.L, b.drive), R: saturate(bus.R, b.drive) }
      // `lvl`: the bus's own loudness in the mix (LUFS, gated) — sets its gain.
      if (b.lvl !== undefined) {
        const m = measure([bus.L, bus.R])
        if (Number.isFinite(m.integrated)) b.gain = dbToGain(b.lvl - m.integrated)
      }
      b.measured = { ...(b.measured ?? {}), gainDb: Math.round(20 * Math.log10(b.gain) * 10) / 10 }
      mixBus(master, bus, b.gain)
      if (b.rev) mixBus(this.send, bus, b.gain * b.rev)
      if (b.rev2) mixBus(this.send2, bus, b.gain * b.rev2)
    }
    // Hall-ish main reverb + short "wooden room" reverb.
    const sendHp = busFilter(this.send, 'hp', 250, 0.7)
    const wet = reverb(sendHp.L, sendHp.R, { room, damp, preDelayMs, tailSec: 0 })
    mixBus(master, wet, revGain)
    const wet2 = reverb(this.send2.L, this.send2.R, { room: room2, damp: 0.6, preDelayMs: 4, tailSec: 0 })
    mixBus(master, wet2, rev2Gain)
    return master
  }
}

export { SR }
